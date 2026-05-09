import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT =
  "You are Aura, the voice operations agent for an autonomous robot fleet. " +
  "The fleet has three Franka Emika Panda arms (robot_01, robot_02, robot_03), each with its own Solana wallet on devnet. " +
  "You speak concisely. Two-sentence answers by default. " +
  "Each turn you receive a [FLEET CONTEXT] system message containing the live fleet snapshot the operator is looking at — " +
  "robot statuses, the operator's currently selected robot, latest telemetry frame per robot (joint angles in radians, joint torques, gripper open/force, anomaly flags), recent compliance events, recent payments. " +
  "You may also receive one or more attached camera frames from the per-robot view (third-person and wrist cameras). " +
  "Ground every factual answer in the fleet context and the attached frames. " +
  "When the operator asks 'what's going on with robot X', cite concrete numbers (joint angles, torques, gripper state, anomaly flags) from the context, mention any recent compliance events or payments, and describe what you see in the camera frames if any are attached. " +
  "If the context is genuinely empty for a robot (no telemetry yet, no frames), say so plainly — never invent numbers. " +
  "When the operator says 'this robot' / 'it', resolve the reference using selected_robot_id from the context. " +
  "Tone: calm, professional, slightly warm — a fleet operator's colleague.";

const REASONING_MODEL = process.env.AURA_REASONING_MODEL || "gpt-4o";
const VOICE_ID = process.env.AURA_VOICE_ID || "XB0fDUnXU5powFXDhCwa";

type TurnInput = { role: "user" | "assistant"; content: string };
type Frame = { label: string; data_url: string };

type ChatPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

type ChatMessage =
  | { role: "system" | "assistant"; content: string }
  | { role: "user"; content: string | ChatPart[] };

function formatContext(ctx: unknown): string | null {
  if (!ctx || typeof ctx !== "object") return null;
  // Compact JSON keeps token usage low while retaining all numeric fidelity.
  // The model handles structured JSON in system messages well.
  const json = JSON.stringify(ctx);
  return `[FLEET CONTEXT @ ${new Date().toISOString()}]\n${json}`;
}

export async function POST(req: NextRequest) {
  const openaiKey = process.env.OPENAI_API_KEY;
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 500 });
  }
  if (!elevenKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY missing" }, { status: 500 });
  }

  const form = await req.formData();
  const audio = form.get("audio");
  if (!(audio instanceof Blob)) {
    return NextResponse.json({ error: "audio file missing" }, { status: 400 });
  }

  const historyRaw = form.get("history");
  let history: TurnInput[] = [];
  if (typeof historyRaw === "string" && historyRaw) {
    try {
      const parsed = JSON.parse(historyRaw) as TurnInput[];
      if (Array.isArray(parsed)) {
        history = parsed
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-12);
      }
    } catch {
      // ignore malformed history; treat as fresh turn
    }
  }

  const contextRaw = form.get("context");
  let contextBlock: string | null = null;
  if (typeof contextRaw === "string" && contextRaw) {
    try {
      contextBlock = formatContext(JSON.parse(contextRaw));
    } catch {
      // ignore malformed context — fall through with no grounding
    }
  }

  const framesRaw = form.get("frames");
  let frames: Frame[] = [];
  if (typeof framesRaw === "string" && framesRaw) {
    try {
      const parsed = JSON.parse(framesRaw) as Frame[];
      if (Array.isArray(parsed)) {
        frames = parsed
          .filter(
            (f) =>
              f &&
              typeof f.label === "string" &&
              typeof f.data_url === "string" &&
              f.data_url.startsWith("data:image/"),
          )
          .slice(0, 4);
      }
    } catch {
      // ignore malformed frames
    }
  }

  const transcribeForm = new FormData();
  transcribeForm.append("file", audio, "turn.webm");
  transcribeForm.append("model", "whisper-1");

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: transcribeForm,
  });
  if (!whisperRes.ok) {
    const detail = await whisperRes.text();
    return NextResponse.json({ error: "whisper failed", detail }, { status: 502 });
  }
  const whisperJson = (await whisperRes.json()) as { text?: string };
  const userText = (whisperJson.text || "").trim();
  if (!userText) {
    return NextResponse.json({ error: "no speech detected" }, { status: 422 });
  }

  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  if (contextBlock) {
    messages.push({ role: "system", content: contextBlock });
  }
  for (const turn of history) {
    messages.push({ role: turn.role, content: turn.content });
  }
  if (frames.length > 0) {
    const parts: ChatPart[] = [{ type: "text", text: userText }];
    for (const f of frames) {
      parts.push({ type: "text", text: `[camera: ${f.label}]` });
      parts.push({ type: "image_url", image_url: { url: f.data_url, detail: "low" } });
    }
    messages.push({ role: "user", content: parts });
  } else {
    messages.push({ role: "user", content: userText });
  }

  const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: REASONING_MODEL,
      messages,
    }),
  });
  if (!chatRes.ok) {
    const detail = await chatRes.text();
    return NextResponse.json({ error: "chat failed", detail }, { status: 502 });
  }
  const chatJson = (await chatRes.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const assistantText = (chatJson.choices?.[0]?.message?.content || "").trim();
  if (!assistantText) {
    return NextResponse.json({ error: "empty reply" }, { status: 502 });
  }

  const ttsRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": elevenKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: assistantText,
        model_id: "eleven_turbo_v2_5",
      }),
    },
  );
  if (!ttsRes.ok) {
    const detail = await ttsRes.text();
    return NextResponse.json({ error: "tts failed", detail }, { status: 502 });
  }
  const audioBuf = Buffer.from(await ttsRes.arrayBuffer());
  const audioBase64 = audioBuf.toString("base64");

  return NextResponse.json({
    user_text: userText,
    assistant_text: assistantText,
    audio_base64: audioBase64,
    audio_mime: "audio/mpeg",
    timestamp: new Date().toISOString(),
    grounded: {
      context: !!contextBlock,
      frames: frames.length,
    },
  });
}
