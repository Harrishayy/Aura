# aura-dashboard — track T3

Next.js 14 (App Router) + TypeScript strict + Tailwind + shadcn/ui. Factory floor view, per-robot detail view, persistent Aura transcript panel. Read root `../CLAUDE.md` first; this file only adds T3-specific rules.

## Routes

| route | purpose | playbook |
| --- | --- | --- |
| `/` | factory floor — 3 tiles on a top-down grid, click → per-robot | P3 |
| `/robot/[id]` | per-robot detail — videos + telemetry + compliance + payments + identity | P7 |
| `/aura` | (placeholder; the live transcript is the persistent right rail in `app/layout.tsx`) | P10 |

## Component map

```
src/components/
  Header.tsx              # AURA wordmark · selected robot ID · connection dot
  FactoryFloor.tsx        # the 3-tile grid with dock/QC/packing labels
  RobotTile.tsx           # 240×180px card — name, status badge, grade letter, runway, wallet
  VideoFeed.tsx           # <video autoplay muted loop playsInline> from /videos/{id}/{cam}.mp4
  LiveTelemetry.tsx       # 7 joint values mono + 50-sample sparklines
  ComplianceLog.tsx       # scroll-area, newest top, fade-in on new
  PaymentTicker.tsx       # same shape, smaller font
  IdentityTile.tsx        # T4 owns this — fetches /robot_metadata/{id}.json
  AuraConversation.tsx    # persistent right-rail transcript panel (mounted in layout)
src/lib/
  status.ts               # status → color map
  mockFleet.ts            # used until aura-fleet is up
```

## Style commitments — non-negotiable

- **Dark mode only.** Inspiration: shadcn/ui defaults + a hint of industrial control panel.
- Numerics: **JetBrains Mono**. Headings: **Inter**. Wordmark: bold, uppercase, tracking-widest.
- **No gradients, no glow, no shadows beyond shadcn defaults.** No icons beyond `lucide-react`.
- Brand colors (in `tailwind.config.ts`):
  - `primary` = `#2563eb` (electric blue)
  - `warning` = `#f59e0b` (amber)
  - `danger` = `#ef4444` (red)
  - `success` = `#10b981` (emerald)
- Status → color: `healthy` green · `idle` amber · `anomaly` red · `paused` grey · `offline` dark grey + strikethrough.

## Data flow (locked in `docs/api_contract.md`)

- Poll `GET http://localhost:8780/fleet/status` every 2s (SWR or react-query). Fall back to `mockFleet.ts` if unreachable.
- Subscribe to `ws://localhost:8780/fleet` for live telemetry/compliance/payment messages — filter by `robot_id` on per-robot pages.
- On `/robot/[id]` mount, **publish** to `ws://localhost:8780/selected` with `{ selected_robot_id: id }`. On unmount, send `{ selected_robot_id: null }`. The agent reads this for ambient context.
- Subscribe to `ws://localhost:8770/aura` for the transcript panel. Auto-reconnect with a banner on drop.

WS message shapes are in the contract. Don't invent new message types — coordinate with T1/T2 first.

## Per-robot view layout (1920×1080 projector target)

- Left column 50%: video stack (third-person 16:9 on top, wrist 4:3 below).
- Right column 50%: LiveTelemetry → ComplianceLog → PaymentTicker → IdentityTile.
- Videos live at `public/videos/{robot_id}/{third_person|wrist}.mp4` (copied from `aura-fleet/fixtures/episodes/` at build time). Always `muted` — they have no audio anyway.
- Don't try to sync video playback to bridge episode time. 1–2s drift is acceptable.

## Aura transcript panel (`AuraConversation.tsx`)

- Mounted in `app/layout.tsx` as a 360px right rail, collapsible to a 32px tab. Persistent across route changes.
- Auto-scroll to newest. Operator messages left + person icon; Aura messages right + brand mark.
- `tool_call` cards inline, collapsible. Cost-bearing tools get an amber accent. `tx_signature` becomes a clickable Solana Explorer link (devnet) with a copy button.
- Persist collapsed/expanded + scroll position via `localStorage`.

## Don't

- Don't add a 4th route. Don't add a settings page, a login page, or any nav beyond the header.
- Don't introduce a global state library (Redux, Zustand). React state + SWR is enough.
- Don't add animations beyond the spec (subtle hover lift on tiles, fade-in on new compliance entries).
- Don't try to make it mobile-responsive. Projector at 1920×1080 is the only target.
- Don't add `"use client"` to layouts unnecessarily — keep server components where possible.

## Build hygiene

- `pnpm build` must be clean. **Zero ESLint warnings.** Don't suppress errors with `// eslint-disable`.
- TypeScript strict; no `any` unless interop with an untyped lib.
- Don't commit `node_modules/`, `.next/`, or video fixtures.

## End-of-block checks

- **P3**: `localhost:3000` shows 3 tiles → click → route to `/robot/robot_01` → header shows connection status → `pnpm build` clean.
- **P7**: navigate to `/robot/robot_02` → both videos play → telemetry updates live → injected anomaly appears in ComplianceLog within 2s → IdentityTile renders with working Explorer link.
- **P10**: live messages from agent appear in the transcript panel; cost-bearing tool calls show the SOL pill and Explorer link.
