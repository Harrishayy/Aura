# aura-dashboard — track T3

Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind 4. Factory floor view, per-robot detail view, persistent Aura transcript panel. Read root `../CLAUDE.md` first; this file only adds T3-specific rules.

## Routes

| route | purpose | playbook |
| --- | --- | --- |
| `/` | factory floor — fleet summary strip + 3 robot tiles with sparklines | P3 |
| `/robot/[id]` | per-robot detail — videos + telemetry + compliance + payments + identity | P7 |
| `/aura` | full-screen transcript view (the live rail still mounts in `app/layout.tsx`) | P10 |

## Component map

```
src/components/
  Sidebar.tsx             # 56px left icon rail (Home, robots 01/02/03, Aura)
  TopStrip.tsx            # AURA wordmark · fleet/agent status pills · pubkey copy · UTC clock
  FactoryFloor.tsx        # fleet summary strip + 3-tile grid
  RobotTile.tsx           # status icon, name, 4-cell metrics, joint-0 sparkline, wallet
  VideoFeed.tsx           # tighter frame with LIVE pip + VideoOff fallback
  LiveTelemetry.tsx       # 7 joints with mono numerics + per-joint sparklines + anomaly bar
  ComplianceLog.tsx       # sortable severity table, fade-in rows, Explorer link-outs
  PaymentTicker.tsx       # framer-motion list of m2m payments, lamports → SOL, Explorer link
  IdentityTile.tsx        # spec-sheet card, pubkey copy buttons, registration tx link
  AuraConversation.tsx    # right rail: collapsible tool-call cards, cost pills, agent status pip
  Sparkline.tsx           # shared monotone Recharts area sparkline
src/lib/
  store.ts                # zustand: fleet, telemetry (rolling 60), payments, compliance, transcript, selectedRobotId
  socket.ts               # SocketManager mounted in layout: HTTP poll + 3 WS connections
  status.ts               # STATUS_STYLE shade+icon map · severityStyle · truncatePubkey · relativeTime · lamportsToSol
  types.ts                # shared message + entity types
  cn.ts                   # clsx + tailwind-merge helper
  mockFleet.ts            # used until aura-fleet aggregator is up
```

## Style commitments — non-negotiable

- **Dark, monotone.** Pure black / off-white / greys only. Differentiate state via shade, icon, and weight — never hue.
- Numerics: **JetBrains Mono** with `tabular-nums`. Headings: **Inter**. Wordmark: bold, uppercase, tracking-[0.32em].
- **No gradients, no glow, no drop-shadows.** Borders are 1px hairlines (`border-border` `#262626`); active accents step up to `border-border-strong` `#3a3a3a`.
- **Density over whitespace.** Card padding `p-3`/`px-4 py-2`, `rounded-sm` max (no `rounded-xl`). Uppercase tracked labels at `text-[10px] tracking-[0.28em]` for instrument/terminal feel.
- Palette tokens (in `globals.css`):

  | token | value | usage |
  | --- | --- | --- |
  | `--background` | `#0a0a0a` | page background |
  | `--surface-1` | `#111111` | cards, tiles |
  | `--surface-2` | `#181818` | nested panels, alt rows, hover |
  | `--surface-3` | `#1f1f1f` | active row, sidebar selection |
  | `--border` | `#262626` | hairline dividers |
  | `--border-strong` | `#3a3a3a` | card outlines, ring on anomalies |
  | `--foreground` | `#fafaf7` | primary off-white text |
  | `--muted` | `#a3a3a3` | secondary text |
  | `--subtle` | `#6b6b6b` | tertiary, timestamps, helper labels |
  | `--inverse` | `#0a0a0a` | text on light surfaces |
  | `--accent` | `#fafaf7` | active state |
  | `--accent-dim` | `#525252` | inactive accent |

- Status mapping (no hue):

  | status | shade | icon |
  | --- | --- | --- |
  | healthy | `text-foreground` | `CircleCheck` |
  | idle | `text-muted` | `Circle` |
  | anomaly | `text-foreground` + `ring-1 ring-border-strong` + bold | `AlertTriangle` |
  | paused | `text-subtle` | `CircleSlash` |
  | offline | `text-subtle line-through` | `CircleOff` |

  Compliance severity uses the same vocabulary (`severityStyle` in `lib/status.ts`): leading 2px bar in `--foreground`/`--muted`/`--subtle` plus icon (`Siren`/`AlertTriangle`/`AlertCircle`/`Info`).

## Data flow (locked in `docs/api_contract.md`)

Connections are owned by `SocketManager` (mounted in `app/layout.tsx`). All UI state flows through the Zustand store — components subscribe with selectors.

- **HTTP poll** `GET http://localhost:8780/fleet/status` every 2s → `setFleet`. Mock fallback in `mockFleet.ts` until aggregator is reachable.
- **WS** `ws://localhost:8780/fleet` → multiplexed `FleetMessage`, demuxed into `telemetry` (rolling 60-sample window per robot), `payments`, `compliance` slices.
- **WS** `ws://localhost:8780/selected` → publish-only. `setSelected(id)` triggers a `{ selected_robot_id: id | null }` send. `/robot/[id]` mounts/unmounts drive this.
- **WS** `ws://localhost:8770/aura` → push to `transcript` slice. Heartbeats are dropped.

Don't invent new message types — coordinate with T1/T2 first.

## Per-robot view layout (1920×1080 projector target)

- Left column 50%: video stack (third-person 16:9, then wrist 4:3).
- Right column 50%: `LiveTelemetry` → `ComplianceLog` → `PaymentTicker` → `IdentityTile`.
- Videos at `public/videos/{robot_id}/{third_person|wrist}.mp4`. Always `muted`. `VideoFeed` HEADs the URL and falls back to a `VideoOff` placeholder when missing.
- `setSelected(id)` runs in a `useEffect` so the agent gets the operator's focus context.

## Aura transcript panel (`AuraConversation.tsx`)

- 360px right rail mounted in `app/layout.tsx`, full-height, collapsible to a 32px tab. Persists collapse state via `localStorage`.
- Subscribes to `transcript` slice. New messages fade in (framer-motion).
- `tool_call` cards collapsible (`<details>`-like, controlled). Cost-bearing tools get a `ring-1 ring-border-strong` outline and a SOL pill in the header. `tx_signature` becomes a clickable Solana Explorer link (devnet) with the truncated sig shown.
- Header: connection pip, "aura · transcript" label, message count, collapse chevron.

## Stack & libs

| dep | why |
| --- | --- |
| `next 16` / `react 19` | framework + runtime |
| `tailwindcss 4` (`@theme inline`) | styling + theme tokens |
| `lucide-react` | icon set (use sparingly) |
| `recharts` | sparklines (`Sparkline.tsx`) and any future charts |
| `framer-motion` | row fade-in (compliance, payments), tool-card expand |
| `zustand` | single store: fleet, telemetry window, payments, compliance, transcript, selectedRobotId, conn status |
| `clsx` + `tailwind-merge` | `cn()` helper |

**Anti-goals (do not add):** `@react-three/fiber`, `@react-three/drei`, `three` (no 3D twin), `@solana/web3.js`, `@coral-xyz/anchor` (no direct RPC — fleet aggregator is the source of truth), `@sentry/react` (no monitoring layer).

## Don't

- Don't add a 4th route. Don't add settings/login/global nav. Sidebar nav is fixed (Home + 3 robots + Aura).
- Don't introduce hue-based status. Status differentiation = shade + icon + weight (+ optional ring).
- Don't add page transitions, hover transforms, or gradients/glow/drop-shadow. Permitted animations: fade-in on new compliance/payment/transcript rows, expand on tool-call cards, 1Hz CSS pulse on LIVE pips.
- Don't try to make it mobile-responsive. Projector at 1920×1080 is the only target.
- Don't add `"use client"` to layouts unnecessarily — keep server components where possible. (Layout currently mounts `SocketManager` which is itself a client component, so the layout stays a server component.)

## Build hygiene

- `pnpm build` must be clean. **Zero ESLint warnings.** Don't suppress with `// eslint-disable` unless the line is genuinely unfixable (e.g., the SocketManager mount-once effect).
- TypeScript strict; no `any` unless interop with an untyped boundary (parsed JSON payloads).
- Don't commit `node_modules/`, `.next/`, or video fixtures.

## End-of-block checks

- **P3**: `localhost:3000` shows fleet summary strip + 3 tiles → click → route to `/robot/robot_01` → status pills update → `pnpm build` clean.
- **P7**: navigate to `/robot/robot_02` → both videos play (or fall back) → telemetry sparklines update live → injected anomaly flips the row's `--foreground` bar + `AlertTriangle` within 2s → IdentityTile renders with working Explorer link.
- **P10**: live messages from agent appear in the transcript rail; cost-bearing tool calls show the ring + SOL pill + Explorer link; collapse-state survives a route change.
