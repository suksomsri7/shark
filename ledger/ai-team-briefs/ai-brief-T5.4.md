# T5.4 — Dark mode for the whole v2 app (Opus · app lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A7, R-E C17 first. Contract: AI-TEAM-RUN §2 T5.4. Mockups `airy-dark-{a..e}.jpg` (36 pages). Generator `gen_airy_dark.py` (overrides the light CSS + swaps inline colours) is the token source.

## Verified facts
- `app.json` `userInterfaceStyle: "light"` → `"automatic"` requires a native build (recorded; the EAS build is T6.4 and waits for the owner). Until then `useColorScheme()` returns light in production builds; the in-app override (AsyncStorage `shark_theme`, from T0.3) makes dark testable via web export and TestFlight after the build.
- `StatusBar style="dark"` in `app/_layout.tsx:58` → follow theme (hunk).
- T0.3 tokens: `dark.ts` placeholder values must now match `gen_airy_dark.py` exactly (bg, glass fill/border, text levels, accent on dark, orb palettes).
- Contrast script: new `scripts/contrast-ai-team.mjs` reading each shot + the DOM text colour/background pairs from `summary.json` (shoot-ai-team records computed styles for text nodes — extend the shooter to emit `{ text, color, bg }` samples) → ratio ≥ 4.5 for body text, ≥ 3 for large text.

## Deliverables
- `apps/mobile/src/theme/dark.ts` final values; `useTheme()` honours system + override; menu C4 row "โหมดมืด" (ตามระบบ / สว่าง / มืด) under "ทั่วไป" (addition to the mockup; recorded).
- Every v2 screen reviewed for literal colours/opacity assumptions (grep `rgba(` / `#` in `components/team` + `app/(app)/{team,tasks,inbox,hire,profile,settings,plan,rooms}`): tokens only.
- `app/_layout.tsx` StatusBar by theme; `app.json` `userInterfaceStyle: "automatic"` (T6.4 build note).
- Full dark shot set: 36 screens through `shoot-ai-team.mjs --dark` with the fixtures of every T2–T5 WO (a fixture index file `apps/mobile/qc/fixtures/ai-team/all.json` mapping screen id → fixture + route) → pairs via `parity-ai-team.sh --dark` into `.qc-shots/ai-team/dark/`.
- `scripts/contrast-ai-team.mjs` + shooter extension.

## Acceptance (oracle `qc-ai-t5.4`)
S1 36 dark pairs exist, summaries ok · S2 contrast ≥ 4.5 everywhere (list failures) · S3 light shots unchanged vs the previous set (≤ 0.5 % diff) · S4 override setting persists and applies · S5 [static] no colour literals · S6 1.0 screens still light · typecheck. Regression: all T2–T5 shots.

## Controller rulings
- Legacy 1.0 screens stay light (they use `C`); dark applies to the v2 tree only.
- If a mockup dark colour fails contrast, the token wins contrast (adjust towards the nearest passing value) and the deviation is listed in wo-notes §6.
