import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM_PROMPT =
  "You are Aura, the voice operations agent for an autonomous robot fleet. " +
  "The fleet has three Franka Emika Panda arms, each with its own Solana wallet. " +
  "You speak concisely. Two-sentence answers by default. " +
  "You never invent telemetry — if you don't have data, say so. " +
  "Your tone is calm, professional, slightly warm. You are a fleet operator's colleague.";

const REASONING_MODEL = process.env.AURA_REASONING_MODEL || "gpt-4o";
const VOICE_ID = process.env.AURA_VOICE_ID || "XB0fDUnXU5powFXDhCwa";

type TurnInput = { role: "user" | "assistant"; content: string };

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

  const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: REASONING_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: userText },
      ],
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
  });
}
