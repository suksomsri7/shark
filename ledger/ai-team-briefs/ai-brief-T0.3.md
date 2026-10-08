# T0.3 — Airy theme in the app + parity tooling (Opus · app lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A7, R-E C16/C17 first. Contract: AI-TEAM-RUN §2 T0.3. Mockup: A8 (`airy-a.jpg` index 8, `airy-dark-a.jpg` index 8) and the CSS in `ledger/design-ai-team/gen_glass_airy.py` + `gen_airy_dark.py` (tokens: colours, glass rgba, radii, spacing 12 px between cards, inner padding, orb gradients, fonts Inter + IBM Plex Sans Thai).

## Verified facts (REVIEW §4)
- Theme today: `apps/mobile/src/theme.ts` exports `C` (light only: bg #fff, surface, border, text, textDim, blue #2563eb …), `R` {sm 8, md 12, lg 16, full}, `S` {xs 4 … xl 24}. `app.json` `userInterfaceStyle: "light"`; `StatusBar style="dark"` in `app/_layout.tsx:58`. No blur dependency (`expo-glass-effect` only transitive) ⇒ glass must be JS-only (rgba + border + shadow) so the web export renders it (C17).
- Text components: `src/ui/text.tsx` (`Text`/`TextInput`, maps weight → IBM Plex Sans Thai; never import `Text` from RN). Page helpers `src/ui/page.tsx` (`PageColumn`, `useWideScreen`). Existing buttons/orb: `components/auth/ui.tsx` (`Orb`, `PrimaryButton`…), `ui/orb.tsx` `AnimatedOrb`.
- QC render pipeline: `apps/mobile/qc/README.md` + `shoot-crm.mjs` (puppeteer-core from `/root/dive3d/node_modules/...`, chromium `/usr/bin/chromium-browser`, copy `QC_COPY`, node_modules symlink `/root/qc-shark-mobile/node_modules` with react-native-web, `QC_PREPARE=1` does rsync+patch+export+serve, request interception mocks `shark.in.th` with CORS + OPTIONS 204, viewport 390×844, output `summary.json`). Ports used: 4700/4711/4712 ⇒ use **4713**, `QC_COPY=/root/qc-shark-mobile-ai`.
- RN-web `Modal` does not render headless (memory reference_qc_render_rn_app) — bottom sheets must be plain absolutely-positioned views (or the QC copy patches Modal → View).
- Expo SDK 57 / RN 0.86 / React 19 — read `apps/mobile/AGENTS.md` first.

## Deliverables
1. `apps/mobile/src/theme/{tokens,light,dark,index}.ts`: `tokens.ts` (radii, spacing incl. `cardGap: 12`, `cardPad`, type scale), `light.ts`/`dark.ts` (same key set: bg, surface, glass {fill, border, shadow}, text, textDim, textFaint, accent, accentFg, accentSoft, ok, warn, danger, orb palettes per department: sales/chat/account/content/member/custom), `index.ts` exporting `useTheme()` (reads `useColorScheme()` + an override from AsyncStorage `shark_theme` — override UI comes in T5.4) **and re-exporting `C`, `R`, `S` with values identical to today** (snapshot test). `theme.ts` becomes a re-export shim.
2. `apps/mobile/src/components/team/`: `GlassCard` (inner padding ≥ 14, radius `R.lg`, glass fill/border/shadow from theme), `Orb` (gradient circle + first letter, size prop), `AvatarStack` (humans = initials circles, AI = orbs, `+N`), `PillTabs` (counts), `StatCard`, `QuotaRing` (SVG, percent + label), `PrimaryButton` (accent soft fill, dark text — mockup #e6e1ff/#3f3499 style for light), `BottomSheet` (absolute View + backdrop, no RN Modal), `Segmented`, `SearchField`, `ListRow`, `SectionTitle`, `EmptyState`, `ErrorState`, `Skeleton`. All accept `testID`; all strings via props (no literals).
3. `apps/mobile/app/(app)/team/_gallery.tsx` (dev-only route listing every component in both modes; excluded from production nav — guard with `__DEV__` or an env flag).
4. `apps/mobile/qc/shoot-ai-team.mjs`: copy of `shoot-crm.mjs` with `ROUTES` (comma list), `FIXTURE` path (JSON keyed by route pattern, see fixtures README), `--dark` (emulate `prefers-color-scheme: dark` + set the override key), output `apps/mobile/qc/shots-ai-team/<wo>/<route>-<mode>.png` + `summary.json` (same schema + `mode`).
5. `scripts/parity-ai-team.sh <mockup.jpg> <pageIndex 1-8> <shot.png> <out.png> [--dark]`: crops the page from the 8-up (or 4-up for `e`) mockup using a fixed grid (document the grid constants from `render_airy.sh` sizes), scales to the shot height, concatenates side by side with labels MOCKUP | RENDER (ImageMagick or Python PIL — both exist on the VPS; prefer PIL).
6. Proof: fixture `apps/mobile/qc/fixtures/ai-team/t0.3.json` with 0 employees → render A8 light + dark through the pipeline using the components → `parity-ai-team.sh` pairs → controller opens them.

## Files you own
`apps/mobile/src/theme/**`, `apps/mobile/src/theme.ts` (shim), `apps/mobile/src/components/team/**`, `apps/mobile/app/(app)/team/_gallery.tsx`, `apps/mobile/qc/shoot-ai-team.mjs`, `apps/mobile/qc/fixtures/ai-team/t0.3.json`, `scripts/parity-ai-team.sh`. Do NOT touch `app/_layout.tsx`, `(app)/_layout.tsx`, `(app)/index.tsx` (T2.1), `app.json`.

## Acceptance (oracle `qc-ai-t0.3`)
S1 [static] `C/R/S` snapshot identical · S2 token key parity light/dark + no hex literals in components/team · S3 shoot pipeline ok + no overflow both modes · S4 parity script exit codes · S5 testID prop everywhere · S6 mobile typecheck 0 · S7 sessions screen before/after pixel diff ≤ 0.5 %.
X10 nothing in the fixture resembles a real token.

## Controller rulings
- Glass = JS tokens only; native blur may be added later behind a capability check (not in this WO).
- A8 copy comes from the HTML (`ai-team-airy-a.html` page 8); hours/tasks figures are fixture values; the pack string is the T0.4 i18n key (until T0.4 lands, use a placeholder key noted in wo-notes).
