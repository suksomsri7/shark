# WO T0.3 — Airy theme in the app + parity tooling (builder notes)

> RUN "AI TEAM" (SHARK HUB v2) · lane `/root/projects/shark-ai-c` · branch `wip/pos-ai-t0.3` · 2026-10-08 UTC · builder: Claude Opus 5.5
> Contract: header of `scripts/qc-ai-t0.3.mts` (rev 3, 39 checks, commit 39261c81 — not edited by the builder) + `ledger/ai-team-briefs/ai-brief-T0.3.md` (addendum + ruling 3)
> Outputs: `ledger/wo-notes/ai-t0.3-green.txt` (static forced + unforced only — **NOT a green acceptance run**, see §5)

## STATUS: static part done · heavy acceptance + A8 parity pairs DEFERRED (machine lock never obtained)

## 1. Files touched
| File | New/changed | What |
|---|---|---|
| `apps/mobile/src/theme/legacy.ts` | new | `C R S` of the 1.0 screens, values unchanged (S1.1) |
| `apps/mobile/src/theme/tokens.ts` | new | lengths = mockup CSS px × 390/536 to the nearest half point, each with generator file:line; 14 type styles (weights 400–700) |
| `apps/mobile/src/theme/light.ts` · `dark.ts` | new | same deep key set (`dark: Palette`); values from gen_glass_airy.py / gen_airy_dark.py; shadows are boxShadow strings already scaled |
| `apps/mobile/src/theme/index.ts` | new | `useTheme` (useSyncExternalStore over a module-level override read synchronously at import: localStorage on web, `SecureStore.getItem` on native), `get/setThemeOverride`, `THEME_STORAGE_KEY` |
| `apps/mobile/src/theme.ts` | changed | shim: `export * from "./theme/index"` (a named `{C,R,S}` shim hid `useTheme` from `@/src/theme` — tsc caught it) |
| `apps/mobile/src/components/team/*.tsx` (15) | new | GlassCard Orb AvatarStack PillTabs StatCard QuotaRing PrimaryButton BottomSheet Segmented SearchField ListRow SectionTitle EmptyState ErrorState Skeleton |
| `…/team/TeamText.tsx` · `text-runs.ts` | new | ruling 3: Latin/digits → Inter, Thai (U+0E00–0E7F except ฿) → IBM Plex Sans Thai, nested spans; pure splitter `splitRuns` + `fontFor` |
| `…/team/glass.ts` · `Backdrop.tsx` | new (helpers, not in the 15) | shared glass style · screen background (4 pastel blobs of `.screen`, made with blurred boxShadow instead of CSS radial gradients) |
| `apps/mobile/assets/team/orbs/*.png` (12) + `scripts/ai-team-render-orbs.mjs` | new | 320×320, rendered from the generator's `.ao/.o1–.o6` CSS (read from the .py files at run time), dark from gen_airy_dark.py; backed by the screen bg colour inside the sphere (the CSS orb is translucent), outer drop shadow left to the component |
| `apps/mobile/app/(app)/team/_gallery.tsx` | new | gallery (15 `gallery-*` ids) + `?screen=a8` proof; guard `__DEV__ || EXPO_PUBLIC_TEAM_GALLERY === "1"` else `<Redirect href="/">` |
| `apps/mobile/qc/shoot-ai-team.mjs` | new | shooter per contract [4] (+ `QC_KEEP_CACHE`, `EXPECT`, fixture rules byTenant/$status/$delayMs/$sse/[id]) |
| `scripts/parity-ai-team.sh` | new | pair builder per contract [5] |
| `apps/mobile/package.json` · `package-lock.json` | changed | + `@expo-google-fonts/inter ^0.4.2` only (lock: 1 dependency line + 1 `node_modules/@expo-google-fonts/inter` entry = 7 lines) |
| `apps/mobile/src/lib/fonts.ts` | changed | ONE block `// AI TEAM T0.3 ▸ … ◂` inside `useFonts({…})`: 5 per-weight `require()` of Inter 300/400/500/600/700 |

Not touched: `app/_layout.tsx`, `(app)/_layout.tsx`, `(app)/index.tsx`, `app.json`, `components/ui/text.tsx`, the oracle, the fixture, `t0.3-before/`.

## 5. Results actually obtained
- static forced: see `ai-t0.3-green.txt` (33/39, failed 0, 6 skipped-heavy, exit 0) · unforced: same file.
- `cd apps/mobile && npm run typecheck`: exit 0 (run directly, 13 min on the loaded box).
- **Heavy acceptance (S3.1–S3.4, S6.1 inside the oracle, S7.3): NOT RUN.**
- **Web export of the QC copy: NEVER RUN with this code.** The gallery/A8 route, TeamText, Backdrop, the orbs in the app and the shooter have never been rendered. Everything in §6 is therefore unverified.
- Lock history: `/tmp/shark-gate.lock` was held back-to-back by other lanes' `pnpm typecheck` from ≈18:15 to at least 21:31 UTC. Six queued attempts of `ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh bash /tmp/ai-t0.3-build-mockups/shoot-all.sh` (18:25, 18:56, 19:30, 20:00, 20:30, 21:00) each ended with the bare exit 1 of `flock -w 1800`; the last one was cut by the harness' background limit. Nothing was killed, no unlocked export was run. (Two short locked jobs did get through earlier: the orb render 17:24 and the npm install.)

## 6. Pictures (D7) — NOT PRODUCED
No A8 MOCKUP|RENDER pair exists. Command once the lock is free (one unit, does export → light → dark → both pairs):
`ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh bash /tmp/ai-t0.3-build-mockups/shoot-all.sh` (script body is in §6a; `SKIP=1` re-shoots an existing dist)
→ `apps/mobile/qc/shots-ai-team/t0.3/a8-pair-light.png` · `a8-pair-dark.png`.

### 6a. shoot-all.sh
```
cd <tree>; export ROUTES='/team/_gallery,/team/_gallery?screen=a8' FIXTURE=apps/mobile/qc/fixtures/ai-team/t0.3.json WO=t0.3 QC_PREPARE=1
node apps/mobile/qc/shoot-ai-team.mjs ; QC_SKIP_EXPORT=1 node apps/mobile/qc/shoot-ai-team.mjs --dark
bash scripts/parity-ai-team.sh ledger/design-ai-team/airy-a.jpg 8 <shots>/team-gallery-screen-a8-light.png <shots>/a8-pair-light.png
bash scripts/parity-ai-team.sh ledger/design-ai-team/airy-dark-a.jpg 8 <shots>/team-gallery-screen-a8-dark.png <shots>/a8-pair-dark.png --dark
```

### 6b. Differences EXPECTED from the code (predicted, not observed — to be checked on the first pair)
| Element | Mockup | App (as coded) | Status |
|---|---|---|---|
| status bar / island / phone bezel corners | drawn | none (device chrome) | platform — content starts at the same y (64 pt) |
| glass fill | linear-gradient .74→.42 + backdrop blur | flat rgba .58, no blur | controller ruling "JS tokens only"; blur = later WO |
| screen background blobs | 4 CSS radial gradients | 4 blurred boxShadow discs (`Backdrop`) | approximation — shape/intensity must be tuned on the pair |
| human avatar | linear-gradient #f6c7a8→#c79a86 | flat mid colour #dfb197 | oracle bans any "gradient" string in components/team — needs a ruling if the pair shows it |
| orb border / inner glow on small orbs | fixed 2 px border at every size | baked at an 80 px reference, scales with the image (thinner on 35 pt rows, thicker on the hero) | to judge on the pair; a second reference size would need more than 12 PNG (ORACLE-EDIT) |
| icons (+, chevrons) | inline SVG stroke 1.8 | Feather glyphs (`@expo/vector-icons`) | to judge on the pair |
| QuotaRing | no ring on A8 (C1 screen) | Views, square caps, flat colour | not judged in this WO (ruling: T3.4) |

## 7. Disputes / decisions
- No ORACLE-EDIT request so far (none of the 33 static checks looked wrong). Heavy checks unseen.
- The QC copy's shared `node_modules` (symlink to `/root/qc-shark-mobile/node_modules`) has no `@expo-google-fonts/inter`. The shooter copies the package into `<QC_COPY>/src/node_modules/` (Metro's upward lookup from `src/lib/fonts.ts`) instead of writing into the CRM copy. **Unverified** — if Metro does not resolve it, the export fails and the controller must decide (install into the shared copy, or give the AI copy its own node_modules).
- S7.3 risk: `fonts.ts` now loads 5 more fonts before the root layout renders; 1.0 screens do not use Inter, pixel result should be unchanged — unverified.
- `SearchField` (a TextInput cannot hold nested spans): web = font stack Inter, Plex; native = IBM Plex Sans Thai for the whole input. Platform limit of RN TextInput.
- Strings in `_gallery.tsx` are mockup literals; pack label map (`แพ็กฟรี` …) stands in for T0.4 key `team.pack.<PACK>`.

## 8. Debt
| Item | Reason | Closes in |
|---|---|---|
| heavy acceptance run 39/39 | machine lock unavailable for 3 h+ | controller / builder re-run when the lock frees |
| A8 pairs light+dark, inspection, parity iteration, difference table (observed) | same | same — the owner's parity rule is NOT met yet |
