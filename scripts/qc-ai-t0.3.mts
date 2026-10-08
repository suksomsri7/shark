// QC — AI TEAM (SHARK HUB v2) WO T0.3: Airy theme in the app (tokens light/dark · `C R S` frozen) · team components · gallery route
//      · screenshot pipeline `shoot-ai-team.mjs` · parity tool `parity-ai-team.sh` · A8 proof from an empty-team fixture
// Oracle writer · the T0.3 builder must NOT touch this file, the fixture `apps/mobile/qc/fixtures/ai-team/t0.3.json`, or
//   `apps/mobile/qc/fixtures/ai-team/t0.3-before/**` (wrong check / wrong fixture ⇒ ORACLE-EDIT request to the controller).
//
// NO DATABASE. This oracle never loads an env file and never opens a connection. Run it as:
//   forced (acceptance, cheap part) : bash scripts/iso.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-ai-t0.3.mts
//   forced + heavy (ACCEPTANCE)     : ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_AI_T03_HEAVY=1 pnpm exec tsx scripts/qc-ai-t0.3.mts
//     (the heavy steps — web export, chromium, mobile typecheck — MUST queue on the machine lock: `with-gate-lock.sh`, default lock file,
//      no qc4.sh because this WO has no DB; controller ruling 8 Oct after an unlocked export overlapped a typecheck and a POS build)
//   unforced                        : bash scripts/iso.sh pnpm exec tsx scripts/qc-ai-t0.3.mts
//   (unforced: SKIPPED + exit 0 while a deliverable below is missing · forced: every check runs, missing things are RED, no crash)
// HEAVY checks (web export of the QC copy + chromium · `npm run typecheck` in apps/mobile · pixel diff) run ONLY with QC_AI_T03_HEAVY=1,
//   as child processes of this oracle: T0.3-S3.1 S3.2 S3.3 S3.4 · T0.3-S6.1 · T0.3-S7.3. Without the flag they are printed as SKIPPED-HEAVY:
//   they stay in `total`, are NOT counted in `passed`, are listed in JSON_SUMMARY.skippedHeavy and do not change the exit code — so
//   `qc:all` stays cheap, and "all green" exists only for a forced + heavy run (that is the run acceptance uses; expect 10–45 min).
// The total is fixed (35) in every run · last line `JSON_SUMMARY {...}` · exit 1 iff a CRITICAL/MAJOR check fails.
//
// SOURCES: ledger/ai-team-briefs/ai-brief-T0.3.md · ai-brief-COMMON.md (§A8 §C12 §C13) · ai-brief-RESOLUTIONS.md (R-A7 · R-E C16 C17)
//   · ledger/AI-TEAM-RUN.md §2 "T0.3" (S1 2 · S2 3 · S3 4 · S4 3 · S5 2 · S6 1 · S7 3 = 18 minimum) · ledger/AI-TEAM-MASTER-PLAN.md §3 D7 D8 · §4 X10
//   · ledger/design-ai-team/{gen_glass_airy,gen_airy_full,gen_airy_dark}.py + render_airy.sh (CSS tokens, sheet grid) · airy-a.jpg / airy-dark-a.jpg page 8
//   · apps/mobile/qc/README.md · apps/mobile/qc/shoot-crm.mjs · apps/mobile/qc/fixtures/ai-team/README.md · docs/api/AI-TEAM-MOBILE-API.md
//
// ══════════════════════════════════ CONTRACT (the builder implements exactly this) ══════════════════════════════════
// [1] THEME — apps/mobile/src/theme/{tokens,light,dark,index}.ts + apps/mobile/src/theme.ts (shim)
//     Files under src/theme/ import ONLY: each other (relative), `react`, `react-native` (only useColorScheme · Appearance · Platform),
//     `expo-secure-store`. Nothing else (no `@/…`, no AsyncStorage — it is not installed and adding it needs a native build).
//     tokens.ts  export const tokens = { spacing: {…}, radii: {…}, size: {…}, type: {…} } as const
//                LENGTHS FOLLOW THE MOCKUP, NOT THE BRIEF'S LITERALS (ORACLE-EDIT T0.3-S2.3, controller-ordered, pre-builder — ruling OQ-4):
//                the mockup phone screen is 536 CSS px wide (.phone 560 − 2×12), the app renders 390 pt ⇒ token = mockup px × 390/536
//                (factor 0.7276), rounded to a whole or half point; the oracle accepts |token − px×390/536| ≤ 1. Required tokens and the
//                generator CSS they come from are the table TOKEN_SPEC below (file:line + the CSS text that must still be on that line):
//                  spacing.cardGap 12→≈9 · cardPadV 16→≈12 · cardPadH 18→≈13 · rowGap 16→≈12 · pageX 30→≈22
//                  radii.card 26→≈19 · pill 22→≈16 · button 30→≈22 · segmented 16→≈12 · field 18→≈13 · sheet 48→≈35 · full = 999
//                  size.button 60→≈44 · iconButton 48→≈35 · avatar 40→≈29 · search 54→≈39 · orbRow 48→≈35 · orbHero 138→≈100 · touchMin = 44 (exact)
//                  type.{title 36→≈26, subtitle 15→≈11, rowTitle 17→≈12, rowSub 14.5→≈10.5, section 13→≈9.5, tab 15→≈11, button 17→≈12,
//                        heroTitle 27→≈20, heroBody 15→≈11} each { fontSize, lineHeight ≥ fontSize, fontWeight: string }
//                (more tokens allowed). Minimum touch target stays 44 pt: where the visual is smaller (iconButton 35, tabs) the pressable
//                gets `hitSlop` or `minHeight/minWidth: tokens.size.touchMin` (see [2]).
//     light.ts   export const light = { … }      dark.ts   export const dark = { … }      — the SAME deep key set, the same value kinds:
//                bg · surface · glass: { fill, border, shadow } · text · textDim · textFaint · accent · accentFg · accentSoft · ok · warn · danger
//                · orb: { sales, chat, account, content, member, custom } each { c1, c2 }      (more keys allowed — in both files)
//                every one of those leaves except glass.shadow is a colour string: `#rgb[a]` / `#rrggbb[aa]` / `rgb()` / `rgba()`.
//                Anchors taken from the mockup CSS (checked): light.bg #fbfbfd · dark.bg #0e0e15 · light.text #1d1d24 · dark.text #f2f2f7
//                · light.glass.border rgba(255,255,255,.85) · dark.glass.border rgba(255,255,255,.13)
//                · orb.chat.c1 rgb 255,140,170 · orb.account.c1 rgb 80,200,150 · orb.content.c1 rgb 255,160,80 (light and dark; alpha free)
//                · PRIMARY BUTTON (controller ruling on brief error 4 — the #e6e1ff/#3f3499 pair of the brief belonged to an abandoned style):
//                  light.accent #16161c (gen_glass_airy.py:115 `.btn1{background:#16161c`) · light.accentFg #ffffff (gen_glass_airy.py:41 `color:#fff`)
//                  dark.accent #f2f2f7 · dark.accentFg #16161c (gen_airy_dark.py:19 `.btn1,…{background:#f2f2f7 !important;color:#16161c !important`).
//                  `accentSoft` stays a key (soft tint for chips/badges) without an anchor.
//                FONTS (ruling OQ-6): all text stays IBM Plex Sans Thai through ui/text.tsx; Inter is not bundled and nothing here checks it.
//     index.ts   export { C, R, S }  — the legacy palette/radius/spacing of the 1.0 screens, values IDENTICAL to today (snapshot below)
//                export { tokens, light, dark }
//                export const THEME_STORAGE_KEY = "shark_theme"
//                export function useTheme(): { mode: "light" | "dark"; colors: typeof light; tokens: typeof tokens }
//                export function getThemeOverride(): "light" | "dark" | null
//                export function setThemeOverride(v: "light" | "dark" | null): Promise<void>      (the UI for it comes in T5.4)
//                Rules: mode = override ?? (useColorScheme() === "dark" ? "dark" : "light").  The override lives in a MODULE-LEVEL store
//                (the pattern of src/lib/brand.tsx): read once when the module loads — `localStorage` when Platform.OS === "web",
//                expo-secure-store otherwise, every failure swallowed — and `useTheme()` reads the store at call time
//                (useSyncExternalStore or equivalent), so a stored "dark" is honoured ≤ 50 ms after import without waiting for an effect.
//                setThemeOverride(null) removes the key. Values other than "light"/"dark" in storage mean "follow the system".
//     theme.ts   becomes a pure re-export shim: only `export … from "./theme/…"` statements; `import { C, R, S } from "@/src/theme"` of every
//                1.0 screen keeps resolving to it and to the same objects index.ts exports.
// [2] COMPONENTS — apps/mobile/src/components/team/<Name>.tsx, one named export `<Name>` per file (function component):
//       GlassCard(children)            Orb(department, size)            AvatarStack(people, ai)          PillTabs(tabs, value, onChange)
//       StatCard(value, label)         QuotaRing(pct, label)            PrimaryButton(label, onPress)    BottomSheet(visible, onClose, children)
//       Segmented(options, value, onChange)   SearchField(value, onChangeText, placeholder)   ListRow(title)   SectionTitle(title)
//       EmptyState(title)              ErrorState(message, retryLabel, onRetry)               Skeleton(height)
//     (the props in brackets are REQUIRED names; more optional props are allowed). Every component declares `testID?: string` and forwards
//     it to a rendered element (`testID={testID}` or a `{...rest}` spread that still contains it). No colour literal (hex, rgb(), rgba(),
//     hsl()) and no numeric `borderRadius` literal — colours from `useTheme().colors`, radii from `tokens.radii` / `R`. No text of its own:
//     every string arrives through props (no JSX text with letters, no Thai string literal). `Text`/`TextInput` only from
//     `@/src/components/ui/text` (never from react-native) and NO react-native `Modal` (BottomSheet = absolute View + backdrop).
//     PrimaryButton: fill `colors.accent`, label `colors.accentFg` (the anchors of [1]).
//     TOUCH TARGET ≥ 44 pt: every `<Pressable>` / `<Touchable*>` element written in components/team carries a `hitSlop` attribute or a
//     `style` whose expression names `touchMin` (e.g. `style={[styles.x, { minHeight: tokens.size.touchMin }]}`); PrimaryButton has one.
//     ORBS ARE BUNDLED PNG ASSETS (ruling OQ-3), not JS gradients: apps/mobile/assets/team/orbs/<department>-<mode>.png for
//       department sales|chat|account|content|member|custom × mode light|dark = 12 files: square, side 300…1024 px (3× the largest orb,
//       138 mockup px ≈ 100 pt), transparent outside the sphere (corner alpha ≤ 8, centre opaque), rendered ONCE from the generator's orb
//       CSS (`.ao` + `.o1…o6` of gen_glass_airy.py:95–99, dark border/shadow of gen_airy_dark.py:35; o1 sales · o2 chat · o3 account ·
//       o4 content · o5 member · o6 custom) by the committed script scripts/ai-team-render-orbs.mjs (headless chromium on a scratch HTML,
//       no network). `Orb` draws them with react-native `Image` + the initial letter on top; all 12 are referenced with static
//       `require("…/assets/team/orbs/<department>-<mode>.png")` calls inside components/team; `AvatarStack` renders `Orb` (or `Image`).
//       No string containing "gradient" anywhere in components/team.
//     Imports allowed in components/team: react · react-native (incl. `Image`) · relative files of the folder · `@/src/theme` (+ /index /tokens /light /dark)
//     · `@/src/components/ui/{text,page}` · packages that are dependencies of apps/mobile/package.json TODAY (list DEPS_TODAY below).
//     · the 12 orb PNGs via require().
//     ⇒ no react-native-svg, no expo-linear-gradient, no expo-blur: QuotaRing is built from Views (ruling OQ-2), Orb from the PNG assets.
// [3] GALLERY — apps/mobile/app/(app)/team/_gallery.tsx (default export; expo-router serves it as `/team/_gallery`):
//       renders only when `__DEV__ || process.env.EXPO_PUBLIC_TEAM_GALLERY === "1"` (a web export is a production bundle: `__DEV__` alone
//       would render nothing in the QC pipeline), otherwise nothing/redirect.
//       `/team/_gallery`            → root testID `team-gallery`; one instance of every component with testID `gallery-<kebab-name>`:
//                                      gallery-glass-card gallery-orb gallery-avatar-stack gallery-pill-tabs gallery-stat-card gallery-quota-ring
//                                      gallery-primary-button gallery-bottom-sheet gallery-segmented gallery-search-field gallery-list-row
//                                      gallery-section-title gallery-empty-state gallery-error-state gallery-skeleton
//       `/team/_gallery?screen=a8`  → the A8 proof "ยังไม่มีทีม" composed from the components, root testID `team-a8`. It calls exactly
//                                      GET /api/mobile/team/summary · GET /api/mobile/team/employees · GET /api/mobile/team/positions/recommend
//                                      (through src/api/client.ts, so `X-Tenant-Id` is sent) and shows: the tenant name, one row per
//                                      recommendation (label + reason from the API), and the mockup copy "ยังไม่มีพนักงาน AI",
//                                      "แนะนำสำหรับร้านคุณ", "ดูตำแหน่งทั้งหมด" (literals of this dev route until T0.4's i18n lands).
// [4] SHOOTER — apps/mobile/qc/shoot-ai-team.mjs (copy of shoot-crm.mjs; `node apps/mobile/qc/shoot-ai-team.mjs [--dark]`)
//       env  ROUTES   comma list of app paths, e.g. `/team/_gallery,/team/_gallery?screen=a8`  (required)
//            FIXTURE  path of a fixture JSON in the format of qc/fixtures/ai-team/README.md      (required; missing file ⇒ exit 2)
//            WO       output folder name (default: the fixture's `wo`)
//            QC_PREPARE=1 → rsync apps/mobile into QC_COPY (default /root/qc-shark-mobile-ai), node_modules symlink, the two patches of
//                           shoot-crm.mjs, `EXPO_PUBLIC_TEAM_GALLERY=1 npx expo export --platform web --output-dir dist --clear` IN THE COPY,
//                           serve dist on QC_PORT (default 4713).  QC_SKIP_EXPORT=1 (with QC_PREPARE=1) → serve the existing dist.
//            QC_BASE  → shoot an already served export instead.
//       flag `--dark` → emulate `prefers-color-scheme: dark` AND set localStorage `shark_theme` = "dark" before the app boots;
//                       without it: emulate `light`, key absent.
//       mock  every request to shark.in.th is answered from the fixture (README rules: CORS, OPTIONS 204, short keys + `routes`,
//             no entry ⇒ 404 + listed under `unmocked`); token `qc-mock`, tenant from `fixture.session.tenantId`.
//       view  390×844, deviceScaleFactor 2 ⇒ PNG 780×1688.
//       out   apps/mobile/qc/shots-ai-team/<wo>/<slug>-<mode>.png   slug = route lower-cased, every run of non [a-z0-9] → "-", trimmed
//             (`/team/_gallery` → `team-gallery` · `/team/_gallery?screen=a8` → `team-gallery-screen-a8`), mode = light | dark
//             apps/mobile/qc/shots-ai-team/<wo>/summary.json = { generatedAt, base, view: { tag, w, h }, wo, mode, ok,
//               fixture: { path, sha256 }, screens: [{ name: <slug>, route, mode, ok, errors[], missing[], overflow: boolean, expect[],
//               texts, unmocked[], requests: [{ method, path, tenant }], url, file }] }
//             `mode`/`ok` describe THIS run (ok = every screen of this mode is ok); entries of the other mode that an existing summary.json
//             holds for the same fixture sha256 are kept. `expect` = the testIDs the shooter waits for: `/team/_gallery` → team-gallery +
//             the 15 gallery-* ids · `…?screen=a8` → team-a8. overflow = document.documentElement.scrollWidth > innerWidth + 1.
//       exit  0 iff every screen of the run is ok · 2 usage error (no ROUTES / FIXTURE) · 1 otherwise.
// [5] PARITY — `bash scripts/parity-ai-team.sh <mockup.jpg> <pageIndex> <shot.png> <out.png> [--dark]`   (PIL; no network, no temp left)
//       sheet grid (from render_airy.sh window 2760×2920 / 2760×1620 and the CSS of gen_glass_airy.py: .phones top 250, padding 0 100,
//       gap 60, row-gap 150 · .phone 560×1180, padding 12):  SHEET_W 2760 · X0 170 · Y0 250 · pitch 620 × 1330 · bezel 12 · screen 536×1156
//       ⇒ page i (1-based) = col (i-1) % 4, row (i-1) div 4 · crop box of the SCREEN = (182 + 620·col, 262 + 1330·row, +536, +1156).
//       A sheet of another width is the same grid scaled by width/2760. Rows: height/scale ≥ 2580 ⇒ 2 rows (pages 1–8), else 1 row (1–4).
//       output PNG: band of 64 px on top with the words MOCKUP (over the left pane) and RENDER (over the right pane);
//         left pane  = the crop scaled to exactly Wm × H at (0, 64)        H = height of the shot, Wm = round(536 · H / 1156)
//         right pane = the shot, UNSCALED, at (Wm + 24, 64)                 ⇒ size (Wm + 24 + shotWidth) × (H + 64)
//       `--dark` → band and gap dark (luminance < 70) with light words; default light (luminance > 185). Same size either way.
//       exit 0 written · exit 2 when pageIndex is not an integer inside the sheet's range (0, 9, 5 on a 4-up, "x") or arguments are
//       missing · exit 1 for an unreadable input. Nothing is written on a non-zero exit.
// [6] FIXTURE — apps/mobile/qc/fixtures/ai-team/t0.3.json is written by the oracle writer (0 employees, A8). Its sha256 is frozen below.
// [7] S7 "before" reference — apps/mobile/qc/fixtures/ai-team/t0.3-before/sessions-light.png (390×844) was captured by the oracle writer on
//     base 873c80ca with `--capture-before` (below). The builder must NOT run that mode (it refuses once src/theme/ exists).
//     Re-capture is a controller action:  systemd-run --unit=ai-t03-shot --collect --wait --pipe -p MemoryMax=6G --working-directory=<tree>
//       --setenv=PATH="$PATH" --setenv=HOME=/root env QC_AI_T03_CAPTURE=1 QC_AI_T03_RECAPTURE=1 node_modules/.bin/tsx scripts/qc-ai-t0.3.mts --capture-before
//     on a checkout of the base, then update BEFORE_SHA256 here.
//
// FILES THE BUILDER OWNS: apps/mobile/src/theme/** · apps/mobile/src/theme.ts (shim) · apps/mobile/src/components/team/** ·
//   apps/mobile/app/(app)/team/_gallery.tsx · apps/mobile/qc/shoot-ai-team.mjs · scripts/parity-ai-team.sh ·
//   apps/mobile/assets/team/orbs/** (12 PNG) · scripts/ai-team-render-orbs.mjs.   NOT: this oracle, the fixture, t0.3-before/**.
//
// HOUSE RULES: SKIP guard first · temp files only in os.tmpdir() under the tag `qc-ai-t0.3-<rand>` (removed in `finally`, S7.4 asserts none
//   left) · the QC copy /root/qc-shark-mobile-ai is the pipeline's working folder, not a temp file · child output is never echoed raw
//   (redacted + capped) · no network: the oracle's own browser aborts every request that is not the local export or the mocked API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { z } from "zod";

const ROOT = process.cwd();
const MOBILE = "apps/mobile";
const THEME_SHIM = `${MOBILE}/src/theme.ts`;
const THEME_DIR = `${MOBILE}/src/theme`;
const THEME_FILES = ["tokens", "light", "dark", "index"].map((n) => `${THEME_DIR}/${n}.ts`);
const TEAM_DIR = `${MOBILE}/src/components/team`;
const GALLERY = `${MOBILE}/app/(app)/team/_gallery.tsx`;
const SHOOTER = `${MOBILE}/qc/shoot-ai-team.mjs`;
const PARITY = "scripts/parity-ai-team.sh";
const FIXTURE = `${MOBILE}/qc/fixtures/ai-team/t0.3.json`;
const BEFORE_DIR = `${MOBILE}/qc/fixtures/ai-team/t0.3-before`;
const BEFORE_PNG = `${BEFORE_DIR}/sessions-light.png`;
const SHOTS_DIR = `${MOBILE}/qc/shots-ai-team/t0.3`;
const MOCKUP_LIGHT = "ledger/design-ai-team/airy-a.jpg";
const MOCKUP_DARK = "ledger/design-ai-team/airy-dark-a.jpg";
const QC_COPY = process.env.QC_COPY ?? "/root/qc-shark-mobile-ai";
const QC_PORT = "4713";
const BASE_COPY_MODULES = process.env.QC_NODE_MODULES ?? "/root/qc-shark-mobile/node_modules";
const PUPPETEER = "/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const CHROMIUM = "/usr/bin/chromium-browser";

/** sha256 of the fixture the oracle writer wrote (a builder edit turns T0.3-S3.5 red) */
const FIXTURE_SHA256 = "247613503cc7c3013d15964e8922935db6722cb7578aa0c18c56aa5ff6416820";
/** sha256 of the S7 "before" picture captured on base 873c80ca */
const BEFORE_SHA256 = "6d90f9bf64e462d3ab2343e9f81504b53a57d29f475b759ded5ac4c90bb56e15";

// ─── frozen snapshot of apps/mobile/src/theme.ts @ 873c80ca (S1) ───
const SNAP_C = {
  bg: "#ffffff",
  surface: "#f4f5f7",
  surfaceHi: "#e9eaee",
  border: "#e5e7eb",
  text: "#111827",
  textDim: "#6b7280",
  textFaint: "#9ca3af",
  blue: "#2563eb",
  blueHi: "#60a5fa",
  blueSoft: "#1e3a8a",
  cyan: "#7dd3fc",
  danger: "#ef4444",
  dangerDim: "#fee2e2",
  ok: "#22c55e",
} as const;
const SNAP_R = { sm: 8, md: 12, lg: 16, full: 999 } as const;
const SNAP_S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

/** dependencies of apps/mobile/package.json @ 873c80ca — the only packages components/team may import (no new native module in this WO) */
const DEPS_TODAY = [
  "@expo-google-fonts/ibm-plex-sans-thai", "@expo/vector-icons", "@react-native-google-signin/google-signin", "@react-navigation/drawer",
  "@react-navigation/native", "expo", "expo-apple-authentication", "expo-build-properties", "expo-constants", "expo-device", "expo-font",
  "expo-image-picker", "expo-linking", "expo-notifications", "expo-router", "expo-secure-store", "expo-splash-screen", "expo-status-bar",
  "expo-updates", "expo-web-browser", "react", "react-dom", "react-native", "react-native-gesture-handler", "react-native-reanimated",
  "react-native-safe-area-context", "react-native-screens", "react-native-webview", "react-native-worklets",
];

const COMPONENTS: { name: string; required: string[] }[] = [
  { name: "GlassCard", required: ["children"] },
  { name: "Orb", required: ["department", "size"] },
  { name: "AvatarStack", required: ["people", "ai"] },
  { name: "PillTabs", required: ["tabs", "value", "onChange"] },
  { name: "StatCard", required: ["value", "label"] },
  { name: "QuotaRing", required: ["pct", "label"] },
  { name: "PrimaryButton", required: ["label", "onPress"] },
  { name: "BottomSheet", required: ["visible", "onClose", "children"] },
  { name: "Segmented", required: ["options", "value", "onChange"] },
  { name: "SearchField", required: ["value", "onChangeText", "placeholder"] },
  { name: "ListRow", required: ["title"] },
  { name: "SectionTitle", required: ["title"] },
  { name: "EmptyState", required: ["title"] },
  { name: "ErrorState", required: ["message", "retryLabel", "onRetry"] },
  { name: "Skeleton", required: ["height"] },
];
// ─── orb assets (ruling OQ-3) ───
const ORB_DIR = `${MOBILE}/assets/team/orbs`;
const ORB_SCRIPT = "scripts/ai-team-render-orbs.mjs";
const ORB_DEPARTMENTS = ["sales", "chat", "account", "content", "member", "custom"] as const;
const ORB_FILES = ORB_DEPARTMENTS.flatMap((d) => [`${ORB_DIR}/${d}-light.png`, `${ORB_DIR}/${d}-dark.png`]);

// ─── length tokens come from the generator CSS × 390/536 (ORACLE-EDIT T0.3-S2.3, controller-ordered, pre-builder — ruling OQ-4) ───
// evidence of the factor: gen_glass_airy.py:5 `.phone{width:560px;…padding:12px` ⇒ screen 536 CSS px · shooter viewport 390 pt.
const MOCKUP_SCREEN_PX = 536;
const APP_WIDTH_PT = 390;
const GEN_GLASS = "ledger/design-ai-team/gen_glass_airy.py";
const GEN_FULL = "ledger/design-ai-team/gen_airy_full.py";
/** [token path, generator file, line, CSS text that must be on that line, mockup px] */
const TOKEN_SPEC: [string, string, number, string, number][] = [
  ["spacing.cardGap", GEN_GLASS, 102, "margin-top:12px", 12],
  ["spacing.cardPadV", GEN_GLASS, 102, "padding:16px 18px", 16],
  ["spacing.cardPadH", GEN_GLASS, 102, "padding:16px 18px", 18],
  ["spacing.rowGap", GEN_GLASS, 102, "gap:16px", 16],
  ["spacing.pageX", GEN_GLASS, 91, ".pg{left:30px;right:30px}", 30],
  ["radii.card", GEN_GLASS, 102, ".row{border-radius:26px", 26],
  ["radii.pill", GEN_GLASS, 106, ".tabs span{padding:10px 17px;border-radius:22px", 22],
  ["radii.button", GEN_GLASS, 41, ".btn1{height:60px;border-radius:30px", 30],
  ["radii.segmented", GEN_GLASS, 116, "border-radius:16px", 16],
  ["radii.field", GEN_GLASS, 130, ".fld{border-radius:18px", 18],
  ["radii.sheet", GEN_GLASS, 80, "border-radius:48px", 48],
  ["size.button", GEN_GLASS, 41, ".btn1{height:60px", 60],
  ["size.iconButton", GEN_GLASS, 92, ".ib{width:48px;height:48px}", 48],
  ["size.avatar", GEN_GLASS, 142, ".hp{width:40px;height:40px", 40],
  ["size.search", GEN_GLASS, 145, ".srch{height:54px", 54],
  ["size.orbRow", GEN_FULL, 90, "{av('a2','',48)}", 48],
  ["size.orbHero", GEN_FULL, 87, "width:138px;height:138px", 138],
  ["type.title.fontSize", GEN_GLASS, 18, ".lt{font-size:36px", 36],
  ["type.subtitle.fontSize", GEN_GLASS, 20, ".st{font-size:15px", 15],
  ["type.rowTitle.fontSize", GEN_GLASS, 27, ".row .t b{font-size:17px", 17],
  ["type.rowSub.fontSize", GEN_GLASS, 28, ".row .t span{font-size:14.5px", 14.5],
  ["type.section.fontSize", GEN_GLASS, 37, ".sec{font-size:13px", 13],
  ["type.tab.fontSize", GEN_GLASS, 106, "font-size:15px", 15],
  ["type.button.fontSize", GEN_GLASS, 41, "font-size:17px", 17],
  ["type.heroTitle.fontSize", GEN_FULL, 23, ".hero h2{font-size:27px", 27],
  ["type.heroBody.fontSize", GEN_FULL, 23, ".hero p{font-size:15px", 15],
];
const TOUCH_MIN_PT = 44;

const kebab = (n: string) => n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const GALLERY_IDS = COMPONENTS.map((c) => `gallery-${kebab(c.name)}`);
const ROUTE_GALLERY = "/team/_gallery";
const ROUTE_A8 = "/team/_gallery?screen=a8";
const A8_COPY = ["ยังไม่มีพนักงาน AI", "แนะนำสำหรับร้านคุณ", "ดูตำแหน่งทั้งหมด"];
const slugOf = (route: string) => route.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ─── sheet grid of the mockups (render_airy.sh + CSS of gen_glass_airy.py) and the layout of a parity pair ───
const GRID = { sheetW: 2760, h8: 2920, h4: 1620, x0: 170, y0: 250, pitchX: 620, pitchY: 1330, bezel: 12, screenW: 536, screenH: 1156 } as const;
const PAIR = { label: 64, gap: 24 } as const;
const mockupWidthFor = (shotH: number) => Math.round((GRID.screenW * shotH) / GRID.screenH);

const ARGV = process.argv.slice(2);
const FORCE = process.env.QC_FORCE === "1";
const HEAVY = process.env.QC_AI_T03_HEAVY === "1";
const CAPTURE = ARGV.includes("--capture-before");
const TAG = `qc-ai-t0.3-${Math.random().toString(36).slice(2, 8)}`;
const TMP = join(tmpdir(), TAG);
const SNAP_TMP = "/tmp/snap-private-tmp/snap.chromium/tmp";
const STARTED = Date.now();

// ═══ SKIP guard — nothing is spawned, nothing is written while the WO is not built ═══
const DELIVERABLES = [...THEME_FILES, ...COMPONENTS.map((c) => `${TEAM_DIR}/${c.name}.tsx`), GALLERY, SHOOTER, PARITY, ORB_SCRIPT, ...ORB_FILES];
const MISSING = DELIVERABLES.filter((f) => !existsSync(f));
if (!CAPTURE && MISSING.length > 0 && !FORCE) {
  console.log(`⚠️  SKIPPED — WO T0.3 not built yet (missing ${MISSING.length}/${DELIVERABLES.length}: ${MISSING.slice(0, 4).join(", ")}${MISSING.length > 4 ? ", …" : ""})`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
if (!CAPTURE && FORCE && MISSING.length > 0) console.log(`⚠️  QC_FORCE=1 — running although ${MISSING.length} deliverable(s) are missing (expected: RED for that reason, no crash)`);

// ─────────────────────────── check table (ids are fixed: a red run and a green run report the same total) ───────────────────────────
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const CHECKS: Record<string, [string, Sev, boolean?]> = {
  "T0.3-S1.1": ["[static] `@/src/theme` (theme.ts) still exports C, R, S with exactly today's values (frozen snapshot of 873c80ca)", "CRITICAL"],
  "T0.3-S1.2": ["[static] theme.ts is a pure re-export shim of ./theme/* and theme/index.ts exports the SAME C/R/S objects + tokens, light, dark, useTheme, get/setThemeOverride, THEME_STORAGE_KEY", "CRITICAL"],
  "T0.3-S2.1": ["[static] light and dark have the same deep key set and the same value kinds (evaluated, not grepped)", "CRITICAL"],
  "T0.3-S2.2": ["[static] light/dark carry every contract key with a valid colour, differ from each other, and match the mockup-CSS anchors (incl. the primary button: #16161c/#ffffff light · #f2f2f7/#16161c dark)", "CRITICAL"],
  "T0.3-S2.3": ["[static] tokens: every length = generator CSS px × 390/536 (±1, whole or half pt; 26 values read against gen_*.py file:line) · radii.full 999 · size.touchMin 44 · 9 type styles", "MAJOR"],
  "T0.3-S2.4": ["useTheme() follows the system scheme, obeys set/getThemeOverride (key shark_theme), and honours a stored override after a cold start on native and on web", "CRITICAL"],
  "T0.3-S2.5": ["[static] no colour literal (hex · rgb() · rgba() · hsl()) in any string of components/team (comments ignored — AST)", "CRITICAL"],
  "T0.3-S2.6": ["[static] src/theme and components/team import only what the contract allows (no new native dependency, no AsyncStorage/svg/gradient/blur)", "MAJOR"],
  "T0.3-S2.7": ["[static] no numeric borderRadius literal in components/team (radii come from tokens / R)", "MAJOR"],
  "T0.3-S2.8": ["[static] the 12 orb PNGs exist under assets/team/orbs: PNG, square 300–1024 px, transparent corners + opaque centre, all different, department colours in the mockup's order", "CRITICAL"],
  "T0.3-S2.9": ["[static] Orb draws the PNGs with react-native Image (12 static require() calls in components/team), AvatarStack renders Orb/Image, no \"gradient\" string, and scripts/ai-team-render-orbs.mjs is committed", "CRITICAL"],
  "T0.3-S3.1": ["shoot-ai-team (QC_PREPARE=1, light) exits 0: summary.json mode light · ok · gallery + A8 ok, no overflow, nothing missing/unmocked · PNG 780×1688", "CRITICAL", true],
  "T0.3-S3.2": ["shoot-ai-team --dark (same export) exits 0: summary.json mode dark · ok · both screens ok, no overflow · light entries kept · dark PNGs are dark", "CRITICAL", true],
  "T0.3-S3.3": ["independent probe of the export, light + dark: `/team/_gallery` shows all 15 gallery-* components, no overflow, no page error, no external request", "CRITICAL", true],
  "T0.3-S3.4": ["independent probe, light + dark: A8 shows the fixture's tenant + 3 recommendations + mockup copy, calls exactly summary/employees/recommend with the tenant header, no overflow; dark is dark", "CRITICAL", true],
  "T0.3-S3.5": ["[static] fixture t0.3.json is the oracle's file (sha256), parses with the contract's zod schemas and has 0 employees", "CRITICAL"],
  "T0.3-S3.6": ["[static] shoot-ai-team.mjs carries the CLI contract (ROUTES · FIXTURE · --dark → prefers-color-scheme + shark_theme · port 4713 · QC_COPY · gallery flag · output folder) and no build/OTA command", "MAJOR"],
  "T0.3-S4.1": ["parity script: exit 0 for pages 1–8 of an 8-up sheet and 1–4 of a 4-up sheet; each output is a PNG of exactly (Wm + 24 + shotW) × (H + 64)", "CRITICAL"],
  "T0.3-S4.2": ["parity script crops the right page with the documented grid (left pane = that page's screen, no bezel) and pastes the shot unscaled (right pane pixel-identical); also on a half-size sheet", "CRITICAL"],
  "T0.3-S4.3": ["parity script: page index 0, 9, 5-on-a-4-up, a non-number and missing arguments → exit 2, an unreadable input → exit 1; nothing written", "CRITICAL"],
  "T0.3-S4.4": ["parity script: --dark gives a dark band, default a light one, both bands carry the two labels; the real mockups (airy-a / airy-dark-a page 8) pair with a 780×1688 shot", "MAJOR"],
  "T0.3-S5.1": ["[static] every team component exists, exports its name, and declares testID + its required props", "CRITICAL"],
  "T0.3-S5.2": ["[static] every team component forwards testID to a rendered element", "CRITICAL"],
  "T0.3-S5.3": ["[static] team components own no text: no JSX text with letters and no Thai string literal (strings arrive through props)", "MAJOR"],
  "T0.3-S5.4": ["[static] team components take Text/TextInput from ui/text.tsx only and never use react-native Modal", "MAJOR"],
  "T0.3-S5.5": ["[static] the gallery route exists, is guarded by __DEV__ / EXPO_PUBLIC_TEAM_GALLERY, uses all 15 components and carries the gallery-* / team-gallery / team-a8 testIDs", "MAJOR"],
  "T0.3-S5.6": ["[static] touch target ≥ 44 pt: every Pressable/Touchable element in components/team has hitSlop or a style naming tokens' touchMin; PrimaryButton is pressable and uses colors.accent / accentFg", "MAJOR"],
  "T0.3-S6.1": ["`npm run typecheck` in apps/mobile exits 0", "CRITICAL", true],
  "T0.3-S7.1": ["[static] the 1.0 screens (sessions · chat · crm · member + their components) still import C/R/S from `@/src/theme` and nothing from the new theme/team code", "CRITICAL"],
  "T0.3-S7.2": ["the frozen \"before\" picture of the sessions screen exists (390×844 PNG, sha256 recorded in this oracle)", "MAJOR"],
  "T0.3-S7.3": ["sessions screen of the fresh export vs the \"before\" picture: differing pixels ≤ 0.5 % (control: a 64×64 change is detected)", "CRITICAL", true],
  "T0.3-S7.4": ["housekeeping: no temp file of this run is left and the oracle changed nothing in the worktree", "MAJOR"],
  "T0.3-X10.1": ["[static] nothing in the fixture resembles a token, a secret, a connection string, a micro-dollar/prompt field or real contact data", "CRITICAL"],
  "T0.3-X10.2": ["[static] shooter, parity script, gallery and theme never read an env file, carry no secret-like literal, and the shooter's only bearer is `qc-mock`", "CRITICAL"],
  "T0.3-X10.3": ["[static] the theme override store keeps only \"light\"/\"dark\" under shark_theme: no session/token key is read or written by src/theme", "MAJOR"],
};
const cks: { id: string; ok: boolean; sev: Sev; skipped: boolean }[] = [];
const done = new Set<string>();
const chk = (id: string, ok: unknown, e: string, a: string) => {
  const def = CHECKS[id];
  if (!def || done.has(id)) return;
  done.add(id);
  cks.push({ id, ok: !!ok, sev: def[1], skipped: false });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${def[0]}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const skipHeavy = (id: string) => {
  const def = CHECKS[id];
  if (!def || done.has(id)) return;
  done.add(id);
  cks.push({ id, ok: false, sev: def[1], skipped: true });
  console.log(`  ⏭️  [${id}] ${def[0]} — SKIPPED-HEAVY (set QC_AI_T03_HEAVY=1)`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const cut = (v: unknown, n = 300) => {
  const s = String(v ?? "");
  return s.length > n ? `${s.slice(0, n)}…` : s;
};
const sha256 = (buf: Buffer | string) => createHash("sha256").update(buf).digest("hex");

// ─── redaction of child output (this oracle loads no env file, but the caller's environment may hold secrets) ───
const SECRETS: { name: string; value: string }[] = [];
for (const [k, v] of Object.entries(process.env)) {
  if (!v || k.startsWith("NEXT_PUBLIC_") || k.startsWith("EXPO_PUBLIC_")) continue;
  if (/^postgres(ql)?:\/\//.test(v) || (/(KEY|SECRET|TOKEN|PASSWORD|PASSWD)(_[A-Z0-9]+)?$/.test(k) && v.length >= 16)) SECRETS.push({ name: k, value: v });
}
const redact = (text: string): string => {
  let out = text;
  for (const s of SECRETS) out = out.split(s.value).join(`<secret:${s.name}>`);
  return out.replace(/postgres(?:ql)?:\/\/[^\s"'`<>]+/g, "<db-url>");
};
/** safe to print: redacted, single line, capped */
const show = (text: unknown, n = 240) => cut(redact(String(text ?? "")).replace(/\s+/g, " ").trim(), n);
const errMsg = (e: unknown) => show(e instanceof Error ? e.message : String(e), 300);

// ─── child processes ───
type Run = { code: number; out: string; timedOut: boolean };
const run = (cmd: string, args: string[], opt: { cwd?: string; env?: Record<string, string | undefined>; timeoutMs?: number } = {}): Promise<Run> =>
  new Promise((done_) => {
    let out = "";
    let timedOut = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { cwd: opt.cwd ?? ROOT, env: { ...process.env, ...opt.env } as NodeJS.ProcessEnv, stdio: ["ignore", "pipe", "pipe"], detached: true });
    } catch (e) {
      done_({ code: 127, out: String(e), timedOut: false });
      return;
    }
    const add = (d: unknown) => {
      out += String(d);
      if (out.length > 4_000_000) out = out.slice(-2_000_000);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }, opt.timeoutMs ?? 120_000);
    child.stdout?.on("data", add);
    child.stderr?.on("data", add);
    child.on("error", (e) => {
      clearTimeout(timer);
      done_({ code: 127, out: out + String(e), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done_({ code: code ?? 137, out, timedOut });
    });
  });
const TSX_BIN = join(ROOT, "node_modules", ".bin", "tsx");

// ─── image helper (Python PIL — the tool the brief names; written into the temp folder) ───
const IMG_PY = String.raw`import sys, json
from PIL import Image, ImageChops, ImageStat, ImageDraw
COLORS = [(230,40,40),(40,160,60),(40,80,220),(230,180,30),(160,60,200),(30,180,190),(240,120,40),(110,110,120)]
def out(o):
    print("PYJSON " + json.dumps(o))
def lum(rgb):
    return 0.2126*rgb[0] + 0.7152*rgb[1] + 0.0722*rgb[2]
cmd = sys.argv[1]
if cmd == "mksheet":
    path, rows, scale = sys.argv[2], int(sys.argv[3]), float(sys.argv[4])
    H = 2920 if rows == 2 else 1620
    im = Image.new("RGB", (2760, H), (243, 242, 247))
    d = ImageDraw.Draw(im)
    for i in range(4 * rows):
        col, row = i % 4, i // 4
        x = 182 + 620 * col; y = 262 + 1330 * row
        d.rectangle([x - 12, y - 12, x + 536 + 11, y + 1156 + 11], fill=(0, 0, 0))
        d.rectangle([x, y, x + 535, y + 1155], fill=COLORS[i])
    if scale != 1.0:
        im = im.resize((round(2760 * scale), round(H * scale)), Image.LANCZOS)
    im.save(path, quality=95)
    out({"size": im.size})
elif cmd == "mkshot":
    path, w, h = sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    row = bytes(((x * 5) % 256 if c == 0 else (x * 3 + 40) % 256 if c == 1 else (x * 7 + 90) % 256) for x in range(w) for c in range(3))
    im = Image.frombytes("RGB", (w, 1), row).resize((w, h), Image.NEAREST)
    d = ImageDraw.Draw(im)
    for k in range(0, h, 97):
        d.line([(0, k), (w, k)], fill=((k * 3) % 256, (k * 5) % 256, (k * 11) % 256))
    im.save(path)
    out({"size": im.size})
elif cmd == "inspect":
    path, shot_path, wm, label, gap = sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]), int(sys.argv[6])
    im = Image.open(path); fmt = im.format; im = im.convert("RGB")
    shot = Image.open(shot_path).convert("RGB")
    sw, sh = shot.size
    res = {"format": fmt, "size": im.size, "shot": shot.size}
    if im.size[0] >= wm + gap + sw and im.size[1] >= label + sh:
        right = im.crop((wm + gap, label, wm + gap + sw, label + sh))
        res["rightEqual"] = ImageChops.difference(right, shot).getbbox() is None
        left = im.crop((0, label, wm, label + sh))
        res["leftMean"] = [round(v, 1) for v in ImageStat.Stat(left).mean]
        strips = {"top": (12, 4, wm - 12, 10), "bottom": (12, sh - 10, wm - 12, sh - 4), "left": (4, 12, 10, sh - 12), "right": (wm - 10, 12, wm - 4, sh - 12)}
        res["edges"] = {k: [round(v, 1) for v in ImageStat.Stat(left.crop(b)).mean] for k, b in strips.items()}
        band = im.crop((0, 0, im.size[0], label))
        colors = band.getcolors(maxcolors=1 << 24) or []
        bg = max(colors, key=lambda c: c[0])[1] if colors else (0, 0, 0)
        res["bandLum"] = round(lum(bg), 1)
        def ink(box):
            px = band.crop(box).getdata()
            return sum(1 for p in px if abs(lum(p) - lum(bg)) > 60)
        res["inkLeft"] = ink((0, 0, wm, label)); res["inkRight"] = ink((wm + gap, 0, wm + gap + sw, label))
        res["gapLum"] = round(lum(ImageStat.Stat(im.crop((wm + 4, label + 20, wm + gap - 4, label + sh - 20))).mean), 1)
    out(res)
elif cmd == "stat":
    im = Image.open(sys.argv[2]); fmt = im.format; rgb = im.convert("RGB")
    out({"format": fmt, "size": im.size, "lum": round(lum(ImageStat.Stat(rgb).mean), 1)})
elif cmd == "diff":
    a = Image.open(sys.argv[2]).convert("RGB"); b = Image.open(sys.argv[3]).convert("RGB"); tol = int(sys.argv[4])
    if a.size != b.size:
        out({"sizeA": a.size, "sizeB": b.size, "pct": 100.0})
    else:
        d = ImageChops.difference(a, b)
        r, g, bl = d.split()
        m = ImageChops.lighter(ImageChops.lighter(r, g), bl)
        hist = m.histogram()
        bad = sum(hist[tol + 1:])
        out({"sizeA": a.size, "sizeB": b.size, "bad": bad, "pct": round(100.0 * bad / (a.size[0] * a.size[1]), 4)})
elif cmd == "orb":
    res = []
    for p in sys.argv[2:]:
        try:
            im = Image.open(p); fmt = im.format; mode = im.mode; im = im.convert("RGBA"); w, h = im.size
            a = im.getchannel("A")
            corners = [a.getpixel(q) for q in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
            mask = a.point(lambda v: 255 if v > 128 else 0)
            st = ImageStat.Stat(im.convert("RGB"), mask=mask)
            res.append({"ok": True, "format": fmt, "mode": mode, "size": [w, h], "corners": corners, "centre": a.getpixel((w // 2, h // 2)), "mean": [round(v, 1) for v in st.mean], "opaque": round(st.count[0] / float(w * h), 3)})
        except Exception as e:
            res.append({"ok": False, "error": str(e)[:80]})
    out(res)
elif cmd == "control":
    im = Image.open(sys.argv[2]).convert("RGB")
    box = (100, 300, 164, 364)
    im.paste(ImageChops.invert(im.crop(box)).point(lambda v: (v + 96) % 256), box)
    im.save(sys.argv[3])
    out({"size": im.size})
`;
const IMG_PY_PATH = join(TMP, "img.py");
const py = async (...args: string[]): Promise<Any> => {
  const r = await run("python3", [IMG_PY_PATH, ...args], { timeoutMs: 120_000 });
  const line = r.out.split("\n").filter((l) => l.startsWith("PYJSON ")).pop();
  if (!line) return { error: `exit ${r.code} ${show(r.out.split("\n").slice(-3).join(" "), 200)}` };
  try {
    return JSON.parse(line.slice(7));
  } catch {
    return { error: "bad json" };
  }
};

// ─── TypeScript AST helpers (parse — comments never count) ───
let TS: Any = null;
const loadTs = async () => {
  if (TS) return TS;
  const m: Any = await import("typescript" as string);
  TS = m.default ?? m;
  return TS;
};
const parse = (file: string): Any => TS.createSourceFile(file, read(file), TS.ScriptTarget.Latest, true, file.endsWith(".tsx") ? TS.ScriptKind.TSX : TS.ScriptKind.TS);
const walk = (node: Any, fn: (n: Any) => void) => {
  fn(node);
  TS.forEachChild(node, (c: Any) => walk(c, fn));
};
const lineOf = (sf: Any, node: Any) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
/** every string the file carries: string literals, template chunks, JSX text (kind tagged) — import/export specifiers excluded */
const stringsOf = (sf: Any): { text: string; line: number; kind: "string" | "template" | "jsx" }[] => {
  const out: { text: string; line: number; kind: "string" | "template" | "jsx" }[] = [];
  walk(sf, (n) => {
    const K = TS.SyntaxKind;
    if (n.kind === K.StringLiteral) {
      const p = n.parent;
      if (p && (p.kind === K.ImportDeclaration || p.kind === K.ExportDeclaration || p.kind === K.ExternalModuleReference)) return;
      out.push({ text: n.text, line: lineOf(sf, n), kind: "string" });
    } else if (n.kind === K.NoSubstitutionTemplateLiteral || n.kind === K.TemplateHead || n.kind === K.TemplateMiddle || n.kind === K.TemplateTail) {
      out.push({ text: n.text, line: lineOf(sf, n), kind: "template" });
    } else if (n.kind === K.JsxText) {
      out.push({ text: n.getText(sf), line: lineOf(sf, n), kind: "jsx" });
    }
  });
  return out;
};
const importsOf = (sf: Any): { from: string; names: string[]; line: number }[] => {
  const out: { from: string; names: string[]; line: number }[] = [];
  walk(sf, (n) => {
    const K = TS.SyntaxKind;
    if ((n.kind === K.ImportDeclaration || n.kind === K.ExportDeclaration) && n.moduleSpecifier) {
      const names: string[] = [];
      const clause = n.importClause;
      if (clause?.name) names.push("default");
      const nb = clause?.namedBindings ?? n.exportClause;
      if (nb?.elements) for (const el of nb.elements) names.push((el.propertyName ?? el.name).text);
      else if (nb) names.push("*");
      out.push({ from: n.moduleSpecifier.text, names, line: lineOf(sf, n) });
    } else if (n.kind === K.CallExpression && (n.expression.kind === K.ImportKeyword || (n.expression.kind === K.Identifier && n.expression.text === "require")) && n.arguments[0]?.kind === K.StringLiteral) {
      out.push({ from: n.arguments[0].text, names: ["*"], line: lineOf(sf, n) });
    }
  });
  return out;
};
const pkgOf = (spec: string) => (spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
const listFiles = (dir: string, exts: string[]): string[] => {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...listFiles(p, exts));
    else if (exts.includes(extname(e.name))) out.push(p);
  }
  return out.sort();
};

/** component function `name` exported from the file: its first parameter + body, and the prop names it declares */
const componentOf = (sf: Any, name: string): { found: boolean; props: Set<string>; picked: Set<string>; rest: string | null; whole: string | null; inheritsRn: boolean; body: Any } => {
  const K = TS.SyntaxKind;
  const res = { found: false, props: new Set<string>(), picked: new Set<string>(), rest: null as string | null, whole: null as string | null, inheritsRn: false, body: null as Any };
  const isExported = (n: Any) => (n.modifiers ?? []).some((m: Any) => m.kind === K.ExportKeyword);
  let fn: Any = null;
  const unwrap = (init: Any): Any => {
    if (!init) return null;
    if (init.kind === K.ArrowFunction || init.kind === K.FunctionExpression) return init;
    if (init.kind === K.CallExpression) for (const a of init.arguments) {
      const f = unwrap(a);
      if (f) return f;
    }
    if (init.kind === K.ParenthesizedExpression || init.kind === K.AsExpression) return unwrap(init.expression);
    return null;
  };
  const exportedNames = new Set<string>();
  for (const st of sf.statements) if (st.kind === K.ExportDeclaration && st.exportClause?.elements) for (const el of st.exportClause.elements) exportedNames.add((el.propertyName ?? el.name).text);
  for (const st of sf.statements) {
    if (st.kind === K.FunctionDeclaration && st.name?.text === name && (isExported(st) || exportedNames.has(name))) fn = st;
    if (st.kind === K.VariableStatement && (isExported(st) || exportedNames.has(name))) for (const d of st.declarationList.declarations) if (d.name.kind === K.Identifier && d.name.text === name) fn = unwrap(d.initializer) ?? fn;
  }
  if (!fn) return res;
  res.found = true;
  res.body = fn.body ?? fn;
  const p = fn.parameters?.[0];
  if (!p) return res;
  const typeDecl = (tn: string): Any => sf.statements.find((s: Any) => (s.kind === K.InterfaceDeclaration || s.kind === K.TypeAliasDeclaration) && s.name.text === tn);
  const seen = new Set<string>();
  const fromType = (t: Any) => {
    if (!t) return;
    if (t.kind === K.TypeLiteral) for (const m of t.members) if (m.name) res.props.add(m.name.text ?? m.name.getText(sf));
    if (t.kind === K.IntersectionType || t.kind === K.UnionType) for (const x of t.types) fromType(x);
    if (t.kind === K.ParenthesizedType) fromType(t.type);
    if (t.kind === K.TypeReference || t.kind === K.ExpressionWithTypeArguments) {
      const tn = (t.typeName ?? t.expression).getText(sf);
      if (/^(View|Pressable|Text|TextInput|Touchable\w*|ScrollView)Props$/.test(tn)) res.inheritsRn = true;
      if (/^(Omit|Pick|Partial|Readonly|Required|PropsWithChildren)$/.test(tn)) {
        if (tn === "PropsWithChildren") res.props.add("children");
        for (const a of t.typeArguments ?? []) fromType(a);
      }
      if (seen.has(tn)) return;
      seen.add(tn);
      const d = typeDecl(tn);
      if (d?.kind === K.InterfaceDeclaration) {
        for (const m of d.members) if (m.name) res.props.add(m.name.text ?? m.name.getText(sf));
        for (const h of d.heritageClauses ?? []) for (const x of h.types) fromType(x);
      } else if (d?.kind === K.TypeAliasDeclaration) fromType(d.type);
    }
  };
  fromType(p.type);
  if (p.name.kind === K.ObjectBindingPattern) {
    for (const el of p.name.elements) {
      if (el.dotDotDotToken) res.rest = el.name.getText(sf);
      else {
        res.props.add((el.propertyName ?? el.name).getText(sf));
        res.picked.add((el.propertyName ?? el.name).getText(sf));
      }
    }
  } else if (p.name.kind === K.Identifier) res.whole = p.name.text;
  return res;
};
/** does the body put testID on a rendered element? (`testID={…testID…}` or a spread of an object that still holds it) */
const forwardsTestId = (sf: Any, c: ReturnType<typeof componentOf>): boolean => {
  const K = TS.SyntaxKind;
  // objects that still contain testID: the whole props object, or a `...rest` taken while testID was not picked out
  const carriers = new Set<string>();
  if (c.whole) carriers.add(c.whole);
  if (c.rest && !c.picked.has("testID")) carriers.add(c.rest);
  walk(c.body, (n) => {
    if (n.kind === K.VariableDeclaration && n.name.kind === K.ObjectBindingPattern && n.initializer?.kind === K.Identifier && carriers.has(n.initializer.text)) {
      let hasId = false;
      let rest: string | null = null;
      for (const el of n.name.elements) {
        if (el.dotDotDotToken) rest = el.name.getText(sf);
        else if ((el.propertyName ?? el.name).getText(sf) === "testID") hasId = true;
      }
      if (rest && !hasId) carriers.add(rest);
    }
  });
  let ok = false;
  walk(c.body, (n) => {
    if (n.kind === K.JsxAttribute && n.name.getText(sf) === "testID" && n.initializer?.kind === K.JsxExpression && n.initializer.expression) {
      walk(n.initializer.expression, (x) => {
        if (x.kind === K.Identifier && x.text === "testID") ok = true;
      });
    }
    if (n.kind === K.JsxSpreadAttribute && n.expression.kind === K.Identifier && carriers.has(n.expression.text)) ok = true;
  });
  return ok;
};

// ─── colours ───
const COLOR_RE = /^(#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\))$/i;
const rgbaOf = (s: unknown): [number, number, number, number] | null => {
  if (typeof s !== "string") return null;
  const t = s.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(t);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(t);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  return null;
};
const sameRgb = (s: unknown, rgb: [number, number, number], alpha?: number) => {
  const c = rgbaOf(s);
  return !!c && c[0] === rgb[0] && c[1] === rgb[1] && c[2] === rgb[2] && (alpha === undefined || Math.abs(c[3] - alpha) < 0.011);
};
const getPath = (o: Any, path: string): Any => path.split(".").reduce((a, k) => (a && typeof a === "object" ? a[k] : undefined), o);
const keyPaths = (o: Any, prefix = ""): string[] => {
  if (o === null || typeof o !== "object") return [`${prefix}:${o === null ? "null" : typeof o}`];
  if (Array.isArray(o)) return [`${prefix}:array${o.length}`];
  return Object.keys(o).sort().flatMap((k) => keyPaths(o[k], prefix ? `${prefix}.${k}` : k));
};
const deepEq = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortKeys);
  return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
}
const COLOR_KEYS = [
  "bg", "surface", "glass.fill", "glass.border", "text", "textDim", "textFaint", "accent", "accentFg", "accentSoft", "ok", "warn", "danger",
  ...["sales", "chat", "account", "content", "member", "custom"].flatMap((d) => [`orb.${d}.c1`, `orb.${d}.c2`]),
];

// ─── theme evaluation: the real files run in a child tsx process against stubbed react / react-native / expo-secure-store ───
const STUB_RN = `const T = () => globalThis.__T03;
export const useColorScheme = () => T().scheme;
export const Appearance = { getColorScheme: () => T().scheme, addChangeListener: () => ({ remove() {} }) };
export const Platform = { get OS() { return T().os; }, select: (o) => (T().os in o ? o[T().os] : T().os !== "web" && "native" in o ? o.native : o.default) };
export default { useColorScheme, Appearance, Platform };
`;
const STUB_REACT = `export const useState = (i) => [typeof i === "function" ? i() : i, () => {}];
export const useReducer = (r, i, init) => [init ? init(i) : i, () => {}];
export const useEffect = () => {};
export const useLayoutEffect = () => {};
export const useInsertionEffect = () => {};
export const useMemo = (f) => f();
export const useCallback = (f) => f;
export const useRef = (v) => ({ current: v });
export const useId = () => "id";
export const createContext = (d) => ({ _d: d, Provider: () => null, Consumer: () => null });
export const useContext = (c) => c._d;
export const useSyncExternalStore = (sub, get) => get();
export const useDebugValue = () => {};
export default { useState, useReducer, useEffect, useLayoutEffect, useInsertionEffect, useMemo, useCallback, useRef, useId, createContext, useContext, useSyncExternalStore, useDebugValue };
`;
const STUB_STORE = `const T = () => globalThis.__T03;
const guard = () => { if (T().os === "web") throw new Error("expo-secure-store is not available on web"); };
export const getItem = (k) => { guard(); T().reads.push(k); return k in T().store ? T().store[k] : null; };
export const setItem = (k, v) => { guard(); T().writes.push([k, v]); T().store[k] = String(v); };
export const getItemAsync = async (k) => getItem(k);
export const setItemAsync = async (k, v) => setItem(k, v);
export const deleteItemAsync = async (k) => { guard(); T().writes.push([k, null]); delete T().store[k]; };
export default { getItem, setItem, getItemAsync, setItemAsync, deleteItemAsync };
`;
const EVAL_RUNNER = `const g = globalThis;
const os = process.env.T03_OS ?? "ios";
const preset = process.env.T03_PRESET ?? "";
g.__T03 = { os, scheme: "light", store: preset ? { shark_theme: preset } : {}, reads: [], writes: [] };
if (os === "web") {
  g.localStorage = {
    getItem: (k) => { g.__T03.reads.push(k); return k in g.__T03.store ? g.__T03.store[k] : null; },
    setItem: (k, v) => { g.__T03.writes.push([k, v]); g.__T03.store[k] = String(v); },
    removeItem: (k) => { g.__T03.writes.push([k, null]); delete g.__T03.store[k]; },
    clear: () => { g.__T03.store = {}; },
  };
  g.window = g;
}
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const eq = (a, b) => JSON.stringify(plain(a)) === JSON.stringify(plain(b));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { errors: [] };
const step = async (name, fn) => { try { await fn(); } catch (e) { out.errors.push(name + ": " + String(e && e.message ? e.message : e).slice(0, 200)); } };
let shim = null, idx = null, tokens = null, light = null, dark = null;
await step("shim", async () => { shim = await import("./src/theme.ts"); out.shim = { keys: Object.keys(shim).sort(), C: plain(shim.C), R: plain(shim.R), S: plain(shim.S) }; });
await step("index", async () => {
  idx = await import("./src/theme/index.ts");
  out.index = { keys: Object.keys(idx).sort(), C: plain(idx.C), R: plain(idx.R), S: plain(idx.S), key: plain(idx.THEME_STORAGE_KEY),
    fns: ["useTheme", "getThemeOverride", "setThemeOverride"].filter((k) => typeof idx[k] === "function"),
    sameC: !!shim && shim.C === idx.C, sameR: !!shim && shim.R === idx.R, sameS: !!shim && shim.S === idx.S };
});
await step("tokens", async () => { tokens = (await import("./src/theme/tokens.ts")).tokens; out.tokens = plain(tokens); });
await step("light", async () => { light = (await import("./src/theme/light.ts")).light; out.light = plain(light); });
await step("dark", async () => { dark = (await import("./src/theme/dark.ts")).dark; out.dark = plain(dark); });
if (idx) out.reexports = { tokens: idx.tokens === tokens && !!tokens, light: idx.light === light && !!light, dark: idx.dark === dark && !!dark };
const call = () => { const t = idx.useTheme(); return { mode: t && t.mode, isLight: !!t && eq(t.colors, light), isDark: !!t && eq(t.colors, dark), tokens: !!t && eq(t.tokens, tokens), override: plain(idx.getThemeOverride ? idx.getThemeOverride() : "n/a") }; };
out.scenes = {};
if (idx && typeof idx.useTheme === "function") {
  await sleep(50);
  if (preset) {
    await step("cold", async () => { g.__T03.scheme = "light"; out.scenes.cold = call(); });
  } else {
    await step("sys-light", async () => { g.__T03.scheme = "light"; out.scenes.sysLight = call(); });
    await step("sys-dark", async () => { g.__T03.scheme = "dark"; out.scenes.sysDark = call(); });
    await step("sys-null", async () => { g.__T03.scheme = null; out.scenes.sysNull = call(); });
    await step("force-dark", async () => { await idx.setThemeOverride("dark"); await sleep(20); g.__T03.scheme = "light"; out.scenes.forceDark = { ...call(), stored: plain(g.__T03.store.shark_theme) }; });
    await step("force-light", async () => { await idx.setThemeOverride("light"); await sleep(20); g.__T03.scheme = "dark"; out.scenes.forceLight = { ...call(), stored: plain(g.__T03.store.shark_theme) }; });
    await step("clear", async () => { await idx.setThemeOverride(null); await sleep(20); g.__T03.scheme = "dark"; out.scenes.cleared = { ...call(), stored: plain(g.__T03.store.shark_theme) }; });
  }
}
out.io = { reads: [...new Set(g.__T03.reads)], writeKeys: [...new Set(g.__T03.writes.map((w) => w[0]))], writeValues: [...new Set(g.__T03.writes.map((w) => String(w[1])))] };
console.log("T03EVAL " + JSON.stringify(out));
`;
const evalTheme = async (os: "ios" | "web", preset: "" | "dark"): Promise<Any> => {
  const dir = join(TMP, `eval-${os}-${preset || "none"}`);
  mkdirSync(join(dir, "src"), { recursive: true });
  if (existsSync(THEME_SHIM)) cpSync(THEME_SHIM, join(dir, "src", "theme.ts"));
  if (existsSync(THEME_DIR)) cpSync(THEME_DIR, join(dir, "src", "theme"), { recursive: true });
  for (const [name, src] of [["react-native", STUB_RN], ["react", STUB_REACT], ["expo-secure-store", STUB_STORE]] as const) {
    mkdirSync(join(dir, "node_modules", name), { recursive: true });
    writeFileSync(join(dir, "node_modules", name, "package.json"), JSON.stringify({ name, version: "0.0.0", type: "module", main: "index.js", exports: "./index.js" }));
    writeFileSync(join(dir, "node_modules", name, "index.js"), src);
  }
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "qc-ai-t03-eval", private: true, type: "module" }));
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: false, module: "esnext", moduleResolution: "bundler", baseUrl: ".", paths: { "@/*": ["./*"] } } }));
  writeFileSync(join(dir, "run.mts"), EVAL_RUNNER);
  const r = await run(TSX_BIN, ["run.mts"], { cwd: dir, env: { T03_OS: os, T03_PRESET: preset, NODE_OPTIONS: "" }, timeoutMs: 180_000 });
  const line = r.out.split("\n").filter((l) => l.startsWith("T03EVAL ")).pop();
  if (!line) return { errors: [`runner: exit ${r.code}${r.timedOut ? " (timeout)" : ""} ${show(r.out.split("\n").filter((l) => l.trim()).slice(-4).join(" "), 260)}`], scenes: {} };
  try {
    return JSON.parse(line.slice(8));
  } catch {
    return { errors: ["runner: bad json"], scenes: {} };
  }
};

// ─── the oracle's own browser: serve an export, mock the API, shoot ───
const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2", ".ico": "image/x-icon", ".map": "application/json" };
const serveDist = (dir: string): Promise<{ server: Server; base: string }> =>
  new Promise((ok, fail) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://x");
      let file = join(dir, decodeURIComponent(url.pathname));
      if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = join(dir, "index.html"); // SPA fallback
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.on("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      ok({ server, base: `http://127.0.0.1:${typeof a === "object" && a ? a.port : 0}` });
    });
  });
type Shot = { errors: string[]; unmocked: string[]; requests: { method: string; path: string; tenant: string }[]; external: string[]; overflow: boolean; wide: string[]; ids: string[]; text: string; png: Buffer | null; url: string };
type MockFn = (method: string, path: string) => unknown;
const CHR_DIR = join(tmpdir(), `${TAG}-chr`);
const withBrowser = async <T,>(fn: (browser: Any) => Promise<T>): Promise<T> => {
  const mod: Any = await import(PUPPETEER as string);
  const puppeteer = mod.default ?? mod;
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, timeout: 180_000, protocolTimeout: 300_000, args: ["--no-sandbox", "--disable-gpu", "--font-render-hinting=none", `--user-data-dir=${CHR_DIR}`] });
  try {
    return await fn(browser);
  } finally {
    await browser.close().catch(() => {});
    for (const d of [CHR_DIR, join(SNAP_TMP, `${TAG}-chr`)]) rmSync(d, { recursive: true, force: true });
  }
};
const shoot = async (browser: Any, base: string, path: string, opt: { dark: boolean; mock: MockFn; tenant: string; freezeAt?: number; dsf: number; waitFor: string; settleMs?: number }): Promise<Shot> => {
  const res: Shot = { errors: [], unmocked: [], requests: [], external: [], overflow: false, wide: [], ids: [], text: "", png: null, url: "" };
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: opt.dsf });
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: opt.dark ? "dark" : "light" }]);
    await page.setRequestInterception(true);
    page.on("request", (req: Any) => {
      const u = new URL(req.url());
      if (u.host === "shark.in.th") {
        const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
        if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors, body: "" });
        res.requests.push({ method: req.method(), path: u.pathname, tenant: String(req.headers()["x-tenant-id"] ?? "") });
        const body = opt.mock(req.method(), u.pathname);
        if (body !== null && body !== undefined) return req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(body) });
        res.unmocked.push(`${req.method()} ${u.pathname}`);
        return req.respond({ status: 404, headers: cors, contentType: "application/json", body: '{"error":"not_found"}' });
      }
      if (u.protocol === "data:" || u.protocol === "blob:" || u.hostname === "127.0.0.1" || u.hostname === "localhost") return req.continue();
      res.external.push(u.host);
      return req.abort();
    });
    const boot = [
      "localStorage.clear();",
      'localStorage.setItem("shark_token", "qc-mock");',
      `localStorage.setItem("shark_tenant", ${JSON.stringify(opt.tenant)});`,
      opt.dark ? 'localStorage.setItem("shark_theme", "dark");' : "",
      opt.freezeAt ? `(() => { const R = Date; const off = ${opt.freezeAt} - R.now(); class F extends R { constructor(...a) { if (a.length === 0) super(R.now() + off); else super(...a); } static now() { return R.now() + off; } } window.Date = F; })();` : "",
    ].join("\n");
    await page.evaluateOnNewDocument(boot);
    page.on("pageerror", (e: Any) => res.errors.push(`pageerror ${String(e?.message ?? e).slice(0, 160)}`));
    await page.goto(base + path, { waitUntil: "networkidle0", timeout: 90_000 }).catch((e: Any) => res.errors.push(`goto ${String(e?.message ?? e).slice(0, 120)}`));
    await page.waitForFunction(opt.waitFor, { timeout: 45_000 }).catch(() => res.errors.push(`wait: condition not met: ${opt.waitFor.slice(0, 80)}`));
    await new Promise((r) => setTimeout(r, opt.settleMs ?? 1200));
    const info: Any = await page
      .evaluate(`(() => { const vw = window.innerWidth; const wide = []; const ids = []; for (const el of document.querySelectorAll("[data-testid]")) { const id = el.getAttribute("data-testid") || ""; ids.push(id); if (!/^(gallery-|team-)/.test(id)) continue; const r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) wide.push(id); } return { overflow: document.documentElement.scrollWidth > vw + 1, wide: wide.slice(0, 10), ids, text: String(document.body.innerText || "").slice(0, 8000) }; })()`)
      .catch(() => null);
    if (info) Object.assign(res, { overflow: !!info.overflow, wide: info.wide, ids: info.ids, text: info.text });
    else res.errors.push("evaluate failed");
    res.png = Buffer.from(await page.screenshot({ type: "png" }));
    res.url = String(page.url()).replace(base, "");
  } catch (e) {
    res.errors.push(`shoot ${errMsg(e)}`);
  } finally {
    await page.close().catch(() => {});
  }
  return res;
};

// ─── mocks ───
const FX: Any = (() => {
  try {
    return JSON.parse(read(FIXTURE) || "null");
  } catch {
    return null;
  }
})();
const SHORT_KEYS: Record<string, string> = {
  "GET /api/mobile/me": "me",
  "GET /api/mobile/team/summary": "summary",
  "GET /api/mobile/team/quota": "quota",
  "GET /api/mobile/team/employees": "employees",
  "GET /api/mobile/team/positions": "positions",
  "GET /api/mobile/team/positions/recommend": "recommend",
  "GET /api/mobile/team/inbox": "inbox",
  "GET /api/mobile/team/schedules": "schedules",
};
/** the subset of the fixture README rules this WO's fixture uses (no ids, no $-specials) */
const fixtureMock: MockFn = (method, path) => {
  const key = `${method} ${path}`;
  if (FX?.routes && key in FX.routes) return FX.routes[key];
  if (SHORT_KEYS[key] && FX && SHORT_KEYS[key] in FX) return FX[SHORT_KEYS[key]];
  if (path === "/api/mobile/push" || path.startsWith("/api/mobile/push/")) return { ok: true }; // as shoot-crm.mjs
  return null;
};
// S7 — the 1.0 sessions screen: frozen clock + frozen answers (a 1.0 shop: uiVersion 1, no branding)
const S7_CLOCK = Date.UTC(2026, 9, 8, 5, 0, 0); // 8 Oct 2026 12:00 Bangkok
const S7_TITLE = "สรุปยอดขายสัปดาห์นี้";
const S7_ME = { user: { id: "u-at-owner", email: "at-owner@qc.shark", name: "สมใจ (เจ้าของร้าน)" }, memberships: [{ tenantId: "t1", name: "Sweet Studio", role: "OWNER", uiVersion: 1, branding: null }] };
const S7_CONVS = {
  conversations: [
    { id: "c1", title: S7_TITLE, updatedAt: new Date(S7_CLOCK - 3_600_000).toISOString(), unread: true },
    { id: "c2", title: "ตั้งค่าคิวลูกค้าหน้าร้าน", updatedAt: new Date(S7_CLOCK - 5 * 3_600_000).toISOString(), unread: false },
    { id: "c3", title: null, updatedAt: new Date(S7_CLOCK - 3 * 86_400_000).toISOString(), unread: false },
  ],
};
const S7_USAGE = { scope: "session", used: 62, limit: 100, pct: 62, warn: false, degraded: false, blocked: null, resetAt: new Date(S7_CLOCK + 2 * 3_600_000).toISOString() };
const s7Mock: MockFn = (method, path) => {
  if (method === "GET" && path === "/api/mobile/me") return S7_ME;
  if (method === "GET" && path === "/api/mobile/conversations") return S7_CONVS;
  if (method === "GET" && path === "/api/mobile/usage") return S7_USAGE;
  if (path === "/api/mobile/push" || path.startsWith("/api/mobile/push/")) return { ok: true };
  return null;
};
const shootSessions = (browser: Any, base: string) =>
  shoot(browser, base, "/sessions", { dark: false, mock: s7Mock, tenant: "t1", freezeAt: S7_CLOCK, dsf: 1, waitFor: `document.body.innerText.includes(${JSON.stringify(S7_TITLE)}) && document.body.innerText.includes("62%")`, settleMs: 1500 });

// ─── zod copies of the contract schemas the fixture must satisfy (docs/api/AI-TEAM-MOBILE-API.md §1.6 · §4) ───
const ZId = z.string().min(1).max(64);
const ZIso = z.string().datetime();
const ZPct = z.number().min(0).max(100);
const ZPerson = z.object({ userId: ZId, name: z.string(), initial: z.string().max(2) }).strict();
const ZEmployeeCard = z.object({ id: ZId, name: z.string(), positionLabel: z.string(), orbColor: z.string(), positionKey: z.string(), status: z.enum(["ACTIVE", "PAUSED", "TERMINATED"]), pauseReason: z.enum(["MANUAL", "QUOTA_CAP", "TEAM_QUOTA"]).nullable(), isDefault: z.boolean(), liveStatus: z.enum(["WORKING", "WAITING_APPROVAL", "IDLE", "PAUSED"]), statusLine: z.string(), openTasks: z.number().int(), pendingProposals: z.number().int(), lastActivityAt: ZIso.nullable() }).strict();
const ZMeResponse = z.object({
  user: z.object({ id: ZId, email: z.string(), name: z.string().nullable() }).strict(),
  memberships: z.array(z.object({ tenantId: ZId, name: z.string(), role: z.enum(["OWNER", "MANAGER", "STAFF"]), uiVersion: z.union([z.literal(1), z.literal(2)]), branding: z.object({ displayName: z.string().nullable(), logoUrl: z.string().nullable(), accent: z.string(), accentFg: z.string(), navTone: z.string() }).nullable() }).strict()),
}).strict();
const ZTeamSummaryResponse = z.object({
  tenant: z.object({ id: ZId, name: z.string() }).strict(),
  viewerRole: z.enum(["OWNER", "APPROVER", "MEMBER"]),
  viewer: z.object({ canManage: z.boolean(), canUse: z.boolean(), canGrantAuto: z.boolean(), canUndo: z.boolean() }).strict(),
  people: z.object({ count: z.number().int(), avatars: z.array(ZPerson).max(4) }).strict(),
  aiCount: z.number().int(),
  roomCount: z.number().int(),
  pack: z.enum(["FREE", "STARTER", "PRO", "BUSINESS"]),
  quotaPct: ZPct,
  quotaState: z.enum(["OK", "WARN80", "WARN95", "EXHAUSTED", "PAUSED"]),
  cycleEndsAt: ZIso,
  today: z.object({ tasksDone: z.number().int(), hoursSaved: z.number().nullable(), pendingApprovals: z.number().int(), approvedByMe: z.number().int(), rejectedByMe: z.number().int() }).strict(),
  counts: z.object({ ALL: z.number().int(), WAITING: z.number().int(), WORKING: z.number().int(), DONE: z.number().int() }).strict(),
  menu: z.object({ knowledgeCount: z.number().int(), peopleCount: z.number().int() }).strict(),
}).strict();
const ZEmployeesResponse = z.object({ employees: z.array(ZEmployeeCard) }).strict();
const ZPositionsRecommendResponse = z.object({ recommendations: z.array(z.object({ key: z.string(), label: z.string(), reason: z.string(), signal: z.enum(["CHAT_WAITING", "INVOICE_OPEN", "NO_POST", "DEFAULT"]), count: z.number().int().nullable() }).strict()).max(3) }).strict();

// ═══ CAPTURE MODE — the S7 "before" picture (oracle writer / controller only, on the base commit) ═══
const SESSION_WEB = `// QC ONLY PATCH (never committed · written by scripts/qc-ai-t0.3.mts, same text as qc/shoot-crm.mjs): web export has no SecureStore → localStorage
const KEY_TOKEN = "shark_token";
const KEY_TENANT = "shark_tenant";
const KEY_BRAND = "shark_brand";
const get = async (k: string) => (typeof localStorage === "undefined" ? null : localStorage.getItem(k));
const set = async (k: string, v: string) => { if (typeof localStorage !== "undefined") localStorage.setItem(k, v); };
const del = async (k: string) => { if (typeof localStorage !== "undefined") localStorage.removeItem(k); };
export const getToken = () => get(KEY_TOKEN);
export const setToken = (t: string) => set(KEY_TOKEN, t);
export const getTenantId = () => get(KEY_TENANT);
export const setTenantId = (id: string) => set(KEY_TENANT, id);
export const getCachedBrand = () => get(KEY_BRAND);
export const setCachedBrand = (json: string) => set(KEY_BRAND, json);
export async function clearSession(): Promise<void> { await del(KEY_TOKEN); await del(KEY_TENANT); await del(KEY_BRAND); }
`;
if (CAPTURE) {
  const fail = (code: number, msg: string): never => {
    console.error(`🔴 capture-before: ${msg}`);
    process.exit(code);
  };
  if (process.env.QC_AI_T03_CAPTURE !== "1") fail(2, "set QC_AI_T03_CAPTURE=1 (oracle writer / controller only — the builder never runs this)");
  if (existsSync(THEME_DIR)) fail(2, `${THEME_DIR} exists — this tree is no longer the base; capture on a checkout of the base commit`);
  if (existsSync(BEFORE_PNG) && process.env.QC_AI_T03_RECAPTURE !== "1") fail(2, `${BEFORE_PNG} exists (QC_AI_T03_RECAPTURE=1 to replace it)`);
  mkdirSync(TMP, { recursive: true });
  let code = 0;
  let server: Server | null = null;
  const stop = (msg: string): never => {
    throw new Error(msg);
  };
  try {
    writeFileSync(IMG_PY_PATH, IMG_PY);
    if (process.env.QC_SKIP_EXPORT !== "1") {
      mkdirSync(QC_COPY, { recursive: true });
      const src = join(ROOT, MOBILE);
      let r = await run("rsync", ["-a", "--delete", "--exclude", "node_modules", "--exclude", "dist", "--exclude", ".expo", "--exclude", "credentials*", "--exclude", ".env*", "--exclude", "qc/shots*", `${src}/`, `${QC_COPY}/`], { timeoutMs: 600_000 });
      if (r.code !== 0) stop(`rsync exit ${r.code} ${show(r.out)}`);
      if (!existsSync(join(QC_COPY, "node_modules"))) symlinkSync(BASE_COPY_MODULES, join(QC_COPY, "node_modules"), "dir");
      if (!existsSync(join(QC_COPY, "node_modules", "react-native-web"))) stop("the QC copy's node_modules has no react-native-web (apps/mobile/qc/README.md step 3)");
      writeFileSync(join(QC_COPY, "src/lib/session.ts"), SESSION_WEB);
      const loginPath = join(QC_COPY, "app/login.tsx");
      const login = readFileSync(loginPath, "utf8");
      if (!login.includes("QC ONLY PATCH")) writeFileSync(loginPath, login.replace(/GoogleSignin\.configure\(\{[\s\S]*?\}\);/, (m) => `// QC ONLY PATCH: web export has no google-signin native module\ntry {\n  ${m}\n} catch {\n  /* web QC */\n}`));
      console.log(`capture-before: web export in ${QC_COPY} …`);
      // QC_AI_T03_KEEP_CACHE=1 keeps Metro's transform cache (content-hashed, safe) — for a retry after a timeout on a loaded machine
      r = await run("npx", ["expo", "export", "--platform", "web", "--output-dir", "dist", ...(process.env.QC_AI_T03_KEEP_CACHE === "1" ? [] : ["--clear"])], { cwd: QC_COPY, env: { CI: "1" }, timeoutMs: 40 * 60_000 });
      console.log(`capture-before: expo export exit ${r.code}${r.timedOut ? " (timeout 40 min)" : ""} · ${show(r.out.split("\n").filter((l) => l.trim()).slice(-3).join(" | "), 300)}`);
      if (r.code !== 0) stop("expo export failed");
    }
    const served = await serveDist(join(QC_COPY, "dist"));
    server = served.server;
    const shots = await withBrowser(async (b) => [await shootSessions(b, served.base), await shootSessions(b, served.base)]);
    for (const s of shots) if (s.errors.length || s.unmocked.length || !s.png) stop(`shot not clean: errors ${JSON.stringify(s.errors)} unmocked ${JSON.stringify(s.unmocked)}`);
    const a = join(TMP, "b1.png");
    const b2 = join(TMP, "b2.png");
    writeFileSync(a, shots[0].png as Buffer);
    writeFileSync(b2, shots[1].png as Buffer);
    const d = await py("diff", a, b2, "16");
    const st = await py("stat", a);
    console.log(`capture-before: two shots differ by ${d.pct}% · size ${JSON.stringify(st.size)} · requests ${shots[0].requests.map((q) => `${q.method} ${q.path}`).join(", ")}`);
    if (!(d.pct <= 0.05) || JSON.stringify(st.size) !== "[390,844]") stop("the shot is not deterministic or not 390×844");
    mkdirSync(BEFORE_DIR, { recursive: true });
    writeFileSync(BEFORE_PNG, shots[0].png as Buffer);
    const head = await run("git", ["rev-parse", "HEAD"], {});
    writeFileSync(`${BEFORE_DIR}/capture.json`, `${JSON.stringify({ file: "sessions-light.png", sha256: sha256(shots[0].png as Buffer), capturedAt: new Date().toISOString(), baseCommit: head.out.trim().slice(0, 40), view: { w: 390, h: 844, deviceScaleFactor: 1 }, mode: "light", clock: new Date(S7_CLOCK).toISOString(), repeatDiffPct: d.pct, by: "scripts/qc-ai-t0.3.mts --capture-before", texts: shots[0].text.slice(0, 400) }, null, 1)}\n`);
    console.log(`capture-before: wrote ${BEFORE_PNG} sha256 ${sha256(shots[0].png as Buffer)}`);
  } catch (e) {
    console.error(`🔴 capture-before: ${errMsg(e)}`);
    code = 3;
  } finally {
    if (server) server.close();
    rmSync(TMP, { recursive: true, force: true });
  }
  process.exit(code);
}

// ══════════════════════════════════════════════════ CHECKS ══════════════════════════════════════════════════
const gitStatus = async () => (await run("git", ["status", "--porcelain", "--untracked-files=all"], {})).out.split("\n").filter((l) => l.trim() && !l.includes(`${MOBILE}/qc/shots-ai-team/`)).sort().join("\n");
const statusBefore = await gitStatus();
mkdirSync(TMP, { recursive: true });
let crashed: string | null = null;
try {
  writeFileSync(IMG_PY_PATH, IMG_PY);
  await loadTs();

  // ───────────────────────── S1 + S2 (theme) ─────────────────────────
  console.log("\n── S1 legacy C/R/S · S2 tokens ──");
  const ev = await evalTheme("ios", "");
  const evErr = (ev.errors ?? []).join(" · ");
  {
    const s = ev.shim;
    chk("T0.3-S1.1", s && deepEq(s.C, SNAP_C) && deepEq(s.R, SNAP_R) && deepEq(s.S, SNAP_S), "C (14 keys) · R · S deep-equal to the snapshot", s ? `C ${deepEq(s.C, SNAP_C) ? "ok" : `differs ${show(JSON.stringify(s.C), 120)}`} · R ${deepEq(s.R, SNAP_R) ? "ok" : JSON.stringify(s.R)} · S ${deepEq(s.S, SNAP_S) ? "ok" : JSON.stringify(s.S)}` : `not evaluated: ${evErr || "theme.ts missing"}`);

    let shimPure = false;
    let shimNote = "theme.ts missing";
    if (existsSync(THEME_SHIM)) {
      const sf = parse(THEME_SHIM);
      const bad = sf.statements.filter((st: Any) => !(st.kind === TS.SyntaxKind.ExportDeclaration && st.moduleSpecifier && /^\.\/theme(\/|$)/.test(st.moduleSpecifier.text)));
      shimPure = sf.statements.length > 0 && bad.length === 0;
      shimNote = shimPure ? "pure shim" : `${bad.length} statement(s) that are not \`export … from "./theme/…"\` (first at line ${bad[0] ? lineOf(sf, bad[0]) : "-"})`;
    }
    const i = ev.index;
    const need = ["C", "R", "S", "THEME_STORAGE_KEY", "dark", "getThemeOverride", "light", "setThemeOverride", "tokens", "useTheme"];
    const lacking = i ? need.filter((k) => !i.keys.includes(k)) : need;
    const re = ev.reexports ?? {};
    chk("T0.3-S1.2", shimPure && i && lacking.length === 0 && i.sameC && i.sameR && i.sameS && deepEq(i.C, SNAP_C) && i.key === "shark_theme" && i.fns.length === 3 && re.tokens && re.light && re.dark && THEME_FILES.every((f) => existsSync(f)), "pure shim · index exports all 10 names · same object identity as the shim · THEME_STORAGE_KEY = shark_theme", `${shimNote} · ${i ? `missing exports [${lacking.join(",")}] · identity C/R/S ${i.sameC}/${i.sameR}/${i.sameS} · key ${JSON.stringify(i.key)} · fns ${i.fns.join(",")} · re-exports ${JSON.stringify(re)}` : `index not evaluated: ${evErr || "missing"}`} · files missing [${THEME_FILES.filter((f) => !existsSync(f)).map((f) => f.split("/").pop()).join(",")}]`);
  }
  {
    const { light, dark, tokens } = ev;
    const lp = light ? keyPaths(light) : [];
    const dp = dark ? keyPaths(dark) : [];
    const onlyL = lp.filter((k) => !dp.includes(k));
    const onlyD = dp.filter((k) => !lp.includes(k));
    chk("T0.3-S2.1", light && dark && lp.length >= COLOR_KEYS.length && onlyL.length === 0 && onlyD.length === 0, "identical deep key paths and value kinds", light && dark ? `light ${lp.length} leaves · dark ${dp.length} · only in light [${onlyL.slice(0, 5).join(", ")}] · only in dark [${onlyD.slice(0, 5).join(", ")}]` : `not evaluated: ${evErr || "light.ts/dark.ts missing"}`);

    const problems: string[] = [];
    if (light && dark) {
      for (const [name, pal] of [["light", light], ["dark", dark]] as const) {
        for (const k of COLOR_KEYS) if (!(typeof getPath(pal, k) === "string" && COLOR_RE.test(String(getPath(pal, k)).trim()))) problems.push(`${name}.${k}=${show(JSON.stringify(getPath(pal, k)), 30)}`);
        if (getPath(pal, "glass.shadow") === undefined) problems.push(`${name}.glass.shadow missing`);
      }
      if (deepEq(light, dark)) problems.push("light equals dark");
      const anchors: [string, Any, [number, number, number], number?][] = [
        ["light.bg #fbfbfd", light.bg, [251, 251, 253]], ["dark.bg #0e0e15", dark.bg, [14, 14, 21]], ["light.text #1d1d24", light.text, [29, 29, 36]], ["dark.text #f2f2f7", dark.text, [242, 242, 247]],
        ["light.glass.border rgba(255,255,255,.85)", light.glass?.border, [255, 255, 255], 0.85], ["dark.glass.border rgba(255,255,255,.13)", dark.glass?.border, [255, 255, 255], 0.13],
      ];
      for (const pal of [["light", light], ["dark", dark]] as const) anchors.push([`${pal[0]}.orb.chat.c1 255,140,170`, pal[1].orb?.chat?.c1, [255, 140, 170]], [`${pal[0]}.orb.account.c1 80,200,150`, pal[1].orb?.account?.c1, [80, 200, 150]], [`${pal[0]}.orb.content.c1 255,160,80`, pal[1].orb?.content?.c1, [255, 160, 80]]);
      // primary button — gen_glass_airy.py:115 + :41 (light) · gen_airy_dark.py:19 (dark)
      anchors.push(["light.accent #16161c", light.accent, [22, 22, 28], 1], ["light.accentFg #ffffff", light.accentFg, [255, 255, 255], 1], ["dark.accent #f2f2f7", dark.accent, [242, 242, 247], 1], ["dark.accentFg #16161c", dark.accentFg, [22, 22, 28], 1]);
      for (const [label, v, rgb, a] of anchors) if (!sameRgb(v, rgb, a)) problems.push(`anchor ${label} ≠ ${show(JSON.stringify(v), 40)}`);
    }
    chk("T0.3-S2.2", light && dark && problems.length === 0, `${COLOR_KEYS.length} colour keys valid in both · glass.shadow present · light ≠ dark · 16 CSS anchors`, light && dark ? `${problems.length} problem(s): ${problems.slice(0, 6).join(" · ")}` : `not evaluated: ${evErr || "missing"}`);

    // ORACLE-EDIT T0.3-S2.3 (controller-ordered, pre-builder): expected = generator CSS px × 390/536, not the brief's literals
    const tp: string[] = [];
    const moved: string[] = [];
    const genLines: Record<string, string[]> = {};
    for (const [, file, line, needle] of TOKEN_SPEC) {
      genLines[file] ??= read(file).split("\n");
      if (!(genLines[file][line - 1] ?? "").includes(needle)) moved.push(`${file.split("/").pop()}:${line} no longer has \`${needle}\``);
    }
    if (tokens) {
      for (const [path, , , , px] of TOKEN_SPEC) {
        const v = getPath(tokens, path);
        const want = (px * APP_WIDTH_PT) / MOCKUP_SCREEN_PX;
        if (!(typeof v === "number" && Math.abs(v - want) <= 1 && Number.isInteger(v * 2))) tp.push(`${path}=${show(JSON.stringify(v ?? null), 12)} (mockup ${px}px → ${want.toFixed(1)})`);
      }
      if (tokens.radii?.full !== 999) tp.push(`radii.full=${tokens.radii?.full}`);
      if (tokens.size?.touchMin !== TOUCH_MIN_PT) tp.push(`size.touchMin=${tokens.size?.touchMin}`);
      const names = [...new Set(TOKEN_SPEC.filter((t) => t[0].startsWith("type.")).map((t) => t[0].split(".")[1]))];
      for (const n of names) {
        const st = tokens.type?.[n];
        if (!(st && typeof st.fontSize === "number" && typeof st.lineHeight === "number" && st.lineHeight >= st.fontSize && typeof st.fontWeight === "string")) tp.push(`type.${n} is not { fontSize, lineHeight ≥ fontSize, fontWeight: string }`);
      }
    }
    chk("T0.3-S2.3", tokens && tp.length === 0 && moved.length === 0, `${TOKEN_SPEC.length} lengths within ±1 of px × ${APP_WIDTH_PT}/${MOCKUP_SCREEN_PX} (whole/half pt) · radii.full 999 · size.touchMin 44 · 9 type styles · generator lines unchanged`, tokens ? `${moved.length ? `GENERATOR MOVED (ORACLE-EDIT needed): ${moved.slice(0, 2).join(" · ")} · ` : ""}${tp.length}: ${tp.slice(0, 6).join(" · ")}` : `not evaluated: ${evErr || "tokens.ts missing"}${moved.length ? ` · generator moved: ${moved[0]}` : ""}`);
  }
  {
    const sc = ev.scenes ?? {};
    const coldIos = await evalTheme("ios", "dark");
    const coldWeb = await evalTheme("web", "dark");
    const want: [string, Any, boolean][] = [
      ["system light → light", sc.sysLight, sc.sysLight?.mode === "light" && sc.sysLight.isLight && sc.sysLight.tokens && sc.sysLight.override === null],
      ["system dark → dark", sc.sysDark, sc.sysDark?.mode === "dark" && sc.sysDark.isDark],
      ["system unknown → light", sc.sysNull, sc.sysNull?.mode === "light" && sc.sysNull.isLight],
      ["setThemeOverride(dark) beats system light + stored", sc.forceDark, sc.forceDark?.mode === "dark" && sc.forceDark.isDark && sc.forceDark.override === "dark" && sc.forceDark.stored === "dark"],
      ["setThemeOverride(light) beats system dark + stored", sc.forceLight, sc.forceLight?.mode === "light" && sc.forceLight.isLight && sc.forceLight.stored === "light"],
      ["setThemeOverride(null) → system again, key removed", sc.cleared, sc.cleared?.mode === "dark" && sc.cleared.override === null && sc.cleared.stored === null],
      ["cold start native with stored dark", coldIos.scenes?.cold, coldIos.scenes?.cold?.mode === "dark" && coldIos.scenes.cold.isDark],
      ["cold start web (localStorage) with stored dark", coldWeb.scenes?.cold, coldWeb.scenes?.cold?.mode === "dark" && coldWeb.scenes.cold.isDark],
    ];
    const bad = want.filter((w) => !w[2]);
    chk("T0.3-S2.4", bad.length === 0, "8 scenarios pass", `${bad.length} failed: ${bad.slice(0, 3).map((w) => `${w[0]} → ${show(JSON.stringify(w[1] ?? null), 90)}`).join(" · ")}${[evErr, (coldIos.errors ?? []).join(" · "), (coldWeb.errors ?? []).join(" · ")].filter(Boolean).length ? ` · errors: ${show([evErr, (coldIos.errors ?? []).join(" · "), (coldWeb.errors ?? []).join(" · ")].filter(Boolean).join(" | "), 260)}` : ""}`);

    const io = [ev.io, coldIos.io, coldWeb.io].filter(Boolean);
    const keys = [...new Set(io.flatMap((x: Any) => [...x.reads, ...x.writeKeys]))];
    const values = [...new Set(io.flatMap((x: Any) => x.writeValues))];
    chk("T0.3-X10.3", io.length === 3 && keys.length > 0 && keys.every((k) => k === "shark_theme") && values.every((v) => ["light", "dark", "null"].includes(v)), "storage touched only under shark_theme with light/dark (or removal)", io.length === 3 ? `keys [${keys.join(",")}] · written values [${values.map((v) => show(v, 20)).join(",")}]` : `not evaluated: ${evErr || "missing"}`);
  }

  // ───────────────────────── S2.5–S2.7 · S5 (components, static) ─────────────────────────
  console.log("\n── S2.5–S2.7 · S5 team components (static, AST) ──");
  const teamFiles = listFiles(TEAM_DIR, [".ts", ".tsx"]);
  const themeFiles = listFiles(THEME_DIR, [".ts", ".tsx"]);
  {
    const colourHits: string[] = [];
    const radiusHits: string[] = [];
    const textHits: string[] = [];
    const importHits: string[] = [];
    const rnHits: string[] = [];
    const orbRequires = new Set<string>();
    const gradientHits: string[] = [];
    const touchHits: string[] = [];
    const jsxTags: Record<string, Set<string>> = {};
    const propNames: Record<string, Set<string>> = {};
    for (const f of teamFiles) {
      const sf = parse(f);
      const short = f.slice(TEAM_DIR.length + 1);
      const tags = (jsxTags[short] = new Set<string>());
      const accessed = (propNames[short] = new Set<string>());
      walk(sf, (n) => {
        const K = TS.SyntaxKind;
        if (n.kind === K.PropertyAccessExpression) accessed.add(n.name.text);
        if (n.kind === K.BindingElement && n.name.kind === K.Identifier) accessed.add((n.propertyName ?? n.name).getText(sf));
        if (n.kind !== K.JsxOpeningElement && n.kind !== K.JsxSelfClosingElement) return;
        const tag = n.tagName.getText(sf);
        tags.add(tag);
        if (!/^(Pressable|Touchable\w*)$/.test(tag.replace(/^Animated\./, ""))) return;
        const attrs = n.attributes.properties as Any[];
        const has = (name: string) => attrs.find((a) => a.kind === K.JsxAttribute && a.name.getText(sf) === name);
        const style = has("style");
        if (!has("hitSlop") && !(style && /\btouchMin\b/.test(style.getText(sf)))) touchHits.push(`${short}:${lineOf(sf, n)} <${tag}>`);
      });
      for (const s of stringsOf(sf)) if (/gradient/i.test(s.text)) gradientHits.push(`${short}:${s.line}`);
      for (const s of stringsOf(sf)) {
        if (/#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])/i.test(s.text) || /\b(?:rgba?|hsla?)\s*\(/i.test(s.text)) colourHits.push(`${short}:${s.line} ${show(s.text.trim(), 30)}`);
        if (s.kind === "jsx" ? /[A-Za-z฀-๿]/.test(s.text) : /[฀-๿]/.test(s.text)) textHits.push(`${short}:${s.line} ${show(s.text.trim(), 30)}`);
      }
      walk(sf, (n) => {
        const K = TS.SyntaxKind;
        if (n.kind === K.PropertyAssignment && /^border(?:\w*)Radius$/.test(n.name.getText(sf))) {
          let init = n.initializer;
          while (init.kind === K.ParenthesizedExpression || init.kind === K.AsExpression) init = init.expression;
          if (init.kind === K.NumericLiteral && Number(init.text) !== 0) radiusHits.push(`${short}:${lineOf(sf, n)} ${n.getText(sf).slice(0, 30)}`);
        }
      });
      for (const im of importsOf(sf)) {
        const asset = /\.png$/.test(im.from) ? resolve(ROOT, im.from.startsWith("@/") ? join(MOBILE, im.from.slice(2)) : join(dirname(f), im.from)) : "";
        if (asset && ORB_FILES.some((o) => resolve(ROOT, o) === asset)) {
          orbRequires.add(asset);
          continue;
        }
        const okSpec = im.from.startsWith("./") || /^@\/src\/theme(\/(index|tokens|light|dark))?$/.test(im.from) || /^@\/src\/components\/ui\/(text|page)$/.test(im.from) || /^@\/src\/components\/team\//.test(im.from) || (!im.from.startsWith(".") && !im.from.startsWith("@/") && DEPS_TODAY.includes(pkgOf(im.from)));
        if (!okSpec) importHits.push(`${short}:${im.line} ${im.from}`);
        if (im.from === "react-native") for (const n of im.names) if (["Text", "TextInput", "Modal", "*", "default"].includes(n)) rnHits.push(`${short}:${im.line} ${n} from react-native`);
      }
    }
    for (const f of themeFiles) {
      const sf = parse(f);
      for (const im of importsOf(sf)) {
        const okSpec = im.from.startsWith("./") || ["react", "expo-secure-store"].includes(im.from) || (im.from === "react-native" && im.names.every((n) => ["useColorScheme", "Appearance", "Platform", "ColorSchemeName"].includes(n)));
        if (!okSpec) importHits.push(`theme/${f.slice(THEME_DIR.length + 1)}:${im.line} ${im.from}${im.from === "react-native" ? ` {${im.names.join(",")}}` : ""}`);
      }
    }
    const have = teamFiles.length > 0;
    chk("T0.3-S2.5", have && colourHits.length === 0, "0 colour literals in components/team", have ? `${colourHits.length}: ${colourHits.slice(0, 5).join(" · ")}` : "components/team is missing");
    chk("T0.3-S2.6", have && themeFiles.length >= 4 && importHits.length === 0, "only allowed imports", have && themeFiles.length >= 4 ? `${importHits.length}: ${importHits.slice(0, 5).join(" · ")}` : `components/team files ${teamFiles.length} · theme files ${themeFiles.length}`);
    chk("T0.3-S2.7", have && radiusHits.length === 0, "0 numeric borderRadius literals", have ? `${radiusHits.length}: ${radiusHits.slice(0, 5).join(" · ")}` : "components/team is missing");

    // S2.8 — the orb PNG assets
    {
      const op: string[] = [];
      const present = ORB_FILES.filter((f) => existsSync(f));
      if (present.length !== ORB_FILES.length) op.push(`${ORB_FILES.length - present.length}/12 missing (${ORB_FILES.filter((f) => !existsSync(f)).slice(0, 3).map((f) => f.split("/").pop()).join(", ")}…)`);
      const stats: Any[] = present.length ? await py("orb", ...present) : [];
      const mean: Record<string, number[]> = {};
      if (!Array.isArray(stats)) op.push(`inspection failed: ${show(JSON.stringify(stats), 100)}`);
      else
        present.forEach((f, i) => {
          const st = stats[i];
          const name = String(f.split("/").pop());
          if (!st?.ok) return void op.push(`${name}: unreadable (${show(st?.error, 40)})`);
          mean[name.replace(".png", "")] = st.mean;
          const bad: string[] = [];
          if (st.format !== "PNG") bad.push(`format ${st.format}`);
          if (st.size[0] !== st.size[1] || st.size[0] < 300 || st.size[0] > 1024) bad.push(`size ${st.size.join("×")}`);
          if (!st.corners.every((a: number) => a <= 8)) bad.push(`corner alpha ${st.corners.join("/")}`);
          if (!(st.centre >= 250)) bad.push(`centre alpha ${st.centre}`);
          if (!(st.opaque >= 0.35 && st.opaque <= 0.9)) bad.push(`opaque share ${st.opaque}`);
          if (bad.length) op.push(`${name}: ${bad.join(", ")}`);
        });
      const hashes = present.map((f) => sha256(readFileSync(f)));
      if (new Set(hashes).size !== hashes.length) op.push("two orb files are byte-identical");
      // department colours, relative to each other (o1…o6 of gen_glass_airy.py:98–99): chat is redder than account, account greener than chat,
      // sales bluer than content, content has the least blue of the six
      for (const mode of ["light", "dark"]) {
        const m = (d: string) => mean[`${d}-${mode}`];
        if (!ORB_DEPARTMENTS.every((d) => m(d))) continue;
        if (!(m("chat")[0] > m("account")[0] + 3)) op.push(`${mode}: chat is not redder than account`);
        if (!(m("account")[1] > m("chat")[1] + 3)) op.push(`${mode}: account is not greener than chat`);
        if (!(m("sales")[2] > m("content")[2] + 3)) op.push(`${mode}: sales is not bluer than content`);
        if (!ORB_DEPARTMENTS.every((d) => d === "content" || m(d)[2] > m("content")[2])) op.push(`${mode}: content does not have the least blue`);
      }
      chk("T0.3-S2.8", op.length === 0, "12 PNG · square 300–1024 · corner alpha ≤ 8 · centre opaque · all different · colour order of the palettes", op.slice(0, 4).join(" · "));

      const rp: string[] = [];
      const lacking = ORB_FILES.filter((o) => !orbRequires.has(resolve(ROOT, o)));
      if (lacking.length) rp.push(`${lacking.length}/12 assets not referenced by a static require()/import in components/team (${lacking.slice(0, 2).map((f) => f.split("/").pop()).join(", ")}…)`);
      const orbSf = existsSync(`${TEAM_DIR}/Orb.tsx`) ? parse(`${TEAM_DIR}/Orb.tsx`) : null;
      if (!orbSf) rp.push("Orb.tsx missing");
      else {
        if (!importsOf(orbSf).some((im) => im.from === "react-native" && im.names.includes("Image"))) rp.push("Orb.tsx does not import Image from react-native");
        if (!jsxTags["Orb.tsx"]?.has("Image")) rp.push("Orb.tsx renders no <Image>");
      }
      const av = jsxTags["AvatarStack.tsx"];
      if (!av) rp.push("AvatarStack.tsx missing");
      else if (!av.has("Orb") && !av.has("Image")) rp.push("AvatarStack.tsx renders neither <Orb> nor <Image>");
      if (gradientHits.length) rp.push(`"gradient" strings: ${gradientHits.slice(0, 3).join(", ")}`);
      const script = read(ORB_SCRIPT);
      if (!script) rp.push(`${ORB_SCRIPT} missing`);
      else {
        if (!script.includes("assets/team/orbs")) rp.push("render script does not write to assets/team/orbs");
        if (!/gen_glass_airy|--c1/.test(script)) rp.push("render script does not take the orb CSS of the generator (gen_glass_airy.py / --c1)");
        if (/https?:\/\//.test(script.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"))) rp.push("render script reaches the network");
      }
      chk("T0.3-S2.9", rp.length === 0, "12 require() · Orb = Image · AvatarStack = Orb/Image · no gradient string · render script committed", rp.slice(0, 4).join(" · "));

      const tp2: string[] = [...touchHits];
      const pb = jsxTags["PrimaryButton.tsx"];
      if (!pb) tp2.push("PrimaryButton.tsx missing");
      else {
        if (![...pb].some((t) => /^(Animated\.)?(Pressable|Touchable\w*)$/.test(t))) tp2.push("PrimaryButton renders no Pressable/Touchable");
        const names = propNames["PrimaryButton.tsx"] ?? new Set<string>();
        if (!names.has("accent") || !names.has("accentFg")) tp2.push("PrimaryButton does not read colors.accent + colors.accentFg");
      }
      chk("T0.3-S5.6", have && tp2.length === 0, "every pressable has hitSlop or a touchMin style · PrimaryButton pressable with accent/accentFg", have ? `${tp2.length}: ${tp2.slice(0, 5).join(" · ")}` : "components/team is missing");
    }

    const notAccepting: string[] = [];
    const notForwarding: string[] = [];
    for (const c of COMPONENTS) {
      const f = `${TEAM_DIR}/${c.name}.tsx`;
      if (!existsSync(f)) {
        notAccepting.push(`${c.name}: file missing`);
        notForwarding.push(`${c.name}: file missing`);
        continue;
      }
      const sf = parse(f);
      const comp = componentOf(sf, c.name);
      if (!comp.found) {
        notAccepting.push(`${c.name}: no exported function component of that name`);
        notForwarding.push(`${c.name}: not found`);
        continue;
      }
      const lacking = [...c.required, "testID"].filter((p) => !comp.props.has(p) && !(p === "testID" && comp.inheritsRn));
      if (lacking.length) notAccepting.push(`${c.name}: props [${lacking.join(",")}] not declared`);
      if (!forwardsTestId(sf, comp)) notForwarding.push(c.name);
    }
    chk("T0.3-S5.1", notAccepting.length === 0, "15 components, each with testID + required props", `${notAccepting.length}: ${notAccepting.slice(0, 4).join(" · ")}`);
    chk("T0.3-S5.2", notForwarding.length === 0, "15 components forward testID", `${notForwarding.length}: ${notForwarding.slice(0, 8).join(" · ")}`);
    chk("T0.3-S5.3", have && textHits.length === 0, "0 own texts", have ? `${textHits.length}: ${textHits.slice(0, 5).join(" · ")}` : "components/team is missing");
    chk("T0.3-S5.4", have && rnHits.length === 0, "no Text/TextInput/Modal (or namespace import) from react-native", have ? `${rnHits.length}: ${rnHits.slice(0, 5).join(" · ")}` : "components/team is missing");
  }
  {
    const gp: string[] = [];
    if (!existsSync(GALLERY)) gp.push("file missing");
    else {
      const sf = parse(GALLERY);
      const src = read(GALLERY);
      const strs = stringsOf(sf).map((s) => s.text);
      const ids = new Set<string>();
      walk(sf, (n) => {
        if (n.kind === TS.SyntaxKind.Identifier) ids.add(n.text);
      });
      if (!sf.statements.some((st: Any) => st.kind === TS.SyntaxKind.ExportAssignment || (st.modifiers ?? []).some((m: Any) => m.kind === TS.SyntaxKind.DefaultKeyword))) gp.push("no default export");
      if (!ids.has("__DEV__")) gp.push("no __DEV__ guard");
      if (!ids.has("EXPO_PUBLIC_TEAM_GALLERY")) gp.push("no process.env.EXPO_PUBLIC_TEAM_GALLERY guard");
      const imported = new Set(importsOf(sf).filter((i) => /components\/team\//.test(i.from)).flatMap((i) => i.names));
      const notUsed = COMPONENTS.filter((c) => !imported.has(c.name)).map((c) => c.name);
      if (notUsed.length) gp.push(`components not imported from components/team: ${notUsed.join(",")}`);
      const noId = [...GALLERY_IDS, "team-gallery", "team-a8"].filter((id) => !strs.includes(id));
      if (noId.length) gp.push(`testIDs absent: ${noId.slice(0, 6).join(",")}`);
      for (const t of A8_COPY) if (!src.includes(t)) gp.push(`A8 copy absent: ${t}`);
      for (const r of ["/api/mobile/team/summary", "/api/mobile/team/employees", "/api/mobile/team/positions/recommend"]) if (!strs.includes(r)) gp.push(`A8 route not called: ${r}`);
    }
    chk("T0.3-S5.5", gp.length === 0, "gallery route with guards, 15 components, 17 testIDs, the A8 proof", gp.slice(0, 5).join(" · "));
  }

  // ───────────────────────── S3.5 · S3.6 · X10 (static) ─────────────────────────
  console.log("\n── S3.5 · S3.6 fixture + shooter (static) · X10 ──");
  {
    const raw = read(FIXTURE);
    const fp: string[] = [];
    if (!FX) fp.push("fixture missing or not JSON");
    else {
      if (sha256(raw) !== FIXTURE_SHA256) fp.push(`sha256 ${sha256(raw).slice(0, 12)}… is not the oracle's ${FIXTURE_SHA256.slice(0, 12)}…`);
      for (const [name, schema, v] of [["me", ZMeResponse, FX.me], ["summary", ZTeamSummaryResponse, FX.summary], ["employees", ZEmployeesResponse, FX.employees], ["recommend", ZPositionsRecommendResponse, FX.recommend]] as const) {
        const r = schema.safeParse(v);
        if (!r.success) fp.push(`${name}: ${show(r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; "), 120)}`);
      }
      if (FX.wo !== "t0.3" || FX.source !== "contract" || FX.generatedBy !== "scripts/qc-ai-t0.3.mts" || FX.session?.tenantId !== "t1") fp.push("header fields (wo/source/generatedBy/session)");
      if (FX.employees?.employees?.length !== 0 || FX.summary?.aiCount !== 0) fp.push("not an empty team");
      if (FX.summary?.tenant?.id !== FX.session?.tenantId || !FX.me?.memberships?.some((m: Any) => m.tenantId === FX.session?.tenantId && m.uiVersion === 2)) fp.push("session tenant is not a uiVersion-2 membership / summary tenant");
      if (FX.recommend?.recommendations?.length !== 3) fp.push("A8 needs 3 recommendations");
    }
    chk("T0.3-S3.5", fp.length === 0, "frozen sha256 · 4 payloads parse (strict) · 0 employees · 3 recommendations", fp.slice(0, 4).join(" · "));

    const src = read(SHOOTER);
    const sp: string[] = [];
    if (!src) sp.push("file missing");
    else {
      const need: [string, RegExp][] = [
        ["env ROUTES", /process\.env\.ROUTES\b/], ["env FIXTURE", /process\.env\.FIXTURE\b/], ["flag --dark", /["'`]--dark["'`]/], ["prefers-color-scheme", /prefers-color-scheme/], ["override key shark_theme", /shark_theme/],
        ["port 4713", /\b4713\b/], ["QC_COPY default /root/qc-shark-mobile-ai", /\/root\/qc-shark-mobile-ai\b/], ["EXPO_PUBLIC_TEAM_GALLERY", /EXPO_PUBLIC_TEAM_GALLERY/], ["output shots-ai-team", /shots-ai-team/], ["summary.json", /summary\.json/],
        ["mock token qc-mock", /qc-mock/], ["CORS header", /access-control-allow-origin/i], ["viewport 390×844", /390[\s\S]{0,40}844/], ["sha256 of the fixture", /sha256/], ["unmocked list", /unmocked/], ["overflow field", /overflow/],
      ];
      for (const [label, re] of need) if (!re.test(src)) sp.push(`no ${label}`);
      const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      if (/\beas\s+(build|update|submit)\b|expo\s+(publish|run:|prebuild)|\bpkill\b/.test(code)) sp.push("build/OTA/pkill command present");
      if (/shots-crm|qc-shark-mobile-crm|\b4712\b/.test(code)) sp.push("still points at the CRM shooter's folder/port");
    }
    chk("T0.3-S3.6", sp.length === 0, "16 contract marks present, nothing forbidden", sp.slice(0, 6).join(" · "));

    // X10.1 — the fixture
    const xp: string[] = [];
    const visit = (v: Any, path: string) => {
      if (v && typeof v === "object") {
        for (const [k, c] of Object.entries(v)) {
          if (/token|secret|passw|api_?key|authorization|bearer|cookie|micro|prompt|\bmodel\b|wage|cost/i.test(k)) xp.push(`key ${path}.${k}`);
          visit(c, `${path}.${k}`);
        }
        return;
      }
      if (typeof v !== "string") return;
      if (/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(v) || /\b(sk|pk|rk)[-_][A-Za-z0-9_-]{12,}/.test(v) || /ExponentPushToken|ExpoPushToken/.test(v) || /[a-z][a-z0-9+.-]*:\/\/[^\s/]*:[^\s/@]+@/i.test(v) || /postgres(ql)?:\/\//i.test(v) || /\bBearer\s+\S+/i.test(v) || /[A-Za-z0-9+/_=-]{24,}/.test(v) || /\b[0-9a-f]{20,}\b/i.test(v)) xp.push(`value ${path}=${show(v, 24)}`);
      const mail = /[\w.+-]+@([\w.-]+)/.exec(v);
      if (mail && mail[1] !== "qc.shark") xp.push(`e-mail domain ${path}`);
      if (/0[689]\d[- ]?\d{3}[- ]?\d{4}/.test(v) && !/089-555-01\d\d/.test(v)) xp.push(`phone ${path}`);
      if (/https?:\/\//i.test(v)) xp.push(`url ${path}`);
    };
    if (FX) visit(FX, "$");
    chk("T0.3-X10.1", !!FX && xp.length === 0, "no token-like value, no secret/micro/prompt key, only @qc.shark e-mails, no URL", FX ? `${xp.length}: ${xp.slice(0, 5).join(" · ")}` : "fixture missing");

    // X10.2 — sources of the tooling
    const srcFiles = [SHOOTER, PARITY, GALLERY, ORB_SCRIPT, ...themeFiles, ...teamFiles].filter((f) => existsSync(f));
    const sx: string[] = [];
    for (const f of srcFiles) {
      const t = read(f);
      const short = f.split("/").slice(-2).join("/");
      const codeLines = t.split("\n").filter((l) => !/^\s*(\/\/|#|\*)/.test(l) && !/--exclude/.test(l)).join("\n");
      if (/(^|[^\w.])\.env(\.[\w.*-]+)?(?![\w(])/.test(codeLines.replace(/process\.env|import\.meta\.env/g, "")) || /dotenv|loadEnvFile/.test(codeLines)) sx.push(`${short}: env file access`);
      if (/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/.test(t) || /\b(sk|pk|rk)[-_][A-Za-z0-9_-]{16,}/.test(t) || /postgres(ql)?:\/\/\S+:\S+@/.test(t) || /ExponentPushToken\[/.test(t)) sx.push(`${short}: secret-like literal`);
      if (f === SHOOTER) {
        const tokens = [...t.matchAll(/shark_token["'`]\s*,\s*["'`]([^"'`]*)["'`]/g)].map((m) => m[1]);
        if (tokens.length === 0 || tokens.some((v) => v !== "qc-mock")) sx.push(`${short}: shark_token literals [${tokens.map((v) => show(v, 12)).join(",")}]`);
        if (/credentials/.test(t.split("\n").filter((l) => !/exclude/.test(l) && !l.trim().startsWith("//")).join("\n"))) sx.push(`${short}: touches credentials`);
      }
    }
    const required = [SHOOTER, PARITY, GALLERY].filter((f) => !existsSync(f));
    chk("T0.3-X10.2", required.length === 0 && sx.length === 0, "shooter + parity + gallery present and clean", `${required.length ? `missing [${required.map((f) => f.split("/").pop()).join(",")}] · ` : ""}${sx.length}: ${sx.slice(0, 4).join(" · ")}`);
  }

  // ───────────────────────── S4 (parity script — PIL on synthetic sheets, cheap) ─────────────────────────
  console.log("\n── S4 parity script ──");
  {
    const have = existsSync(PARITY);
    const sheet8 = join(TMP, "sheet8.jpg");
    const sheet4 = join(TMP, "sheet4.jpg");
    const sheetHalf = join(TMP, "sheet8-half.jpg");
    const shotS = join(TMP, "shot-390.png");
    const shotL = join(TMP, "shot-780.png");
    await py("mksheet", sheet8, "2", "1");
    await py("mksheet", sheet4, "1", "1");
    await py("mksheet", sheetHalf, "2", "0.5");
    await py("mkshot", shotS, "390", "844");
    await py("mkshot", shotL, "780", "1688");
    const COLORS = [[230, 40, 40], [40, 160, 60], [40, 80, 220], [230, 180, 30], [160, 60, 200], [30, 180, 190], [240, 120, 40], [110, 110, 120]];
    const near = (m: unknown, c: number[], tol: number) => Array.isArray(m) && m.length >= 3 && c.every((v, i) => Math.abs(Number(m[i]) - v) <= tol);
    const parity = (args: string[]) => (have ? run("bash", [PARITY, ...args], { timeoutMs: 120_000 }) : Promise.resolve({ code: 127, out: "script missing", timedOut: false } as Run));
    const sizeBad: string[] = [];
    const cropBad: string[] = [];
    const wmS = mockupWidthFor(844);
    const expS = [wmS + PAIR.gap + 390, 844 + PAIR.label];
    const cases: [string, string, number, number][] = [];
    for (let i = 1; i <= 8; i++) cases.push([`8up#${i}`, sheet8, i, i - 1]);
    for (let i = 1; i <= 4; i++) cases.push([`4up#${i}`, sheet4, i, i - 1]);
    cases.push(["half#3", sheetHalf, 3, 2], ["half#8", sheetHalf, 8, 7]);
    let firstInfo: Any = null;
    for (const [label, sheet, idx, colour] of cases) {
      const out = join(TMP, `pair-${label.replace("#", "-")}.png`);
      const r = await parity([sheet, String(idx), shotS, out]);
      const info: Any = r.code === 0 && existsSync(out) ? await py("inspect", out, shotS, String(wmS), String(PAIR.label), String(PAIR.gap)) : null;
      firstInfo ??= info;
      if (r.code !== 0 || !info || info.format !== "PNG" || JSON.stringify(info.size) !== JSON.stringify(expS)) sizeBad.push(`${label}: exit ${r.code}${r.timedOut ? " timeout" : ""} ${info ? `${info.format} ${JSON.stringify(info.size)}` : show(r.out.split("\n").slice(-2).join(" "), 80)}`);
      const edgesOk = info?.edges && Object.values(info.edges).every((m) => near(m, COLORS[colour], 34));
      if (!info || !near(info.leftMean, COLORS[colour], 14) || !edgesOk || info.rightEqual !== true) cropBad.push(`${label}: left mean ${JSON.stringify(info?.leftMean ?? null)} (want ${COLORS[colour].join(",")}) edges ${edgesOk ? "ok" : show(JSON.stringify(info?.edges ?? null), 90)} right==shot ${info?.rightEqual ?? "-"}`);
    }
    chk("T0.3-S4.1", have && sizeBad.length === 0, `14 runs exit 0, PNG ${expS[0]}×${expS[1]} for a 390×844 shot`, have ? `${sizeBad.length} bad: ${sizeBad.slice(0, 3).join(" · ")}` : "scripts/parity-ai-team.sh is missing");
    chk("T0.3-S4.2", have && cropBad.length === 0, "left pane = the page's colour up to its edges · right pane = the shot", have ? `${cropBad.length} bad: ${cropBad.slice(0, 2).join(" · ")}` : "scripts/parity-ai-team.sh is missing");

    const exitBad: string[] = [];
    const neg: [string, string[], number][] = [
      ["index 0", [sheet8, "0", shotS, join(TMP, "neg-0.png")], 2], ["index 9", [sheet8, "9", shotS, join(TMP, "neg-9.png")], 2], ["index 5 on a 4-up", [sheet4, "5", shotS, join(TMP, "neg-5.png")], 2],
      ["index x", [sheet8, "x", shotS, join(TMP, "neg-x.png")], 2], ["index 1.5", [sheet8, "1.5", shotS, join(TMP, "neg-f.png")], 2], ["index -1", [sheet8, "-1", shotS, join(TMP, "neg-m.png")], 2],
      ["3 arguments", [sheet8, "1", shotS], 2], ["no arguments", [], 2],
      ["missing mockup", [join(TMP, "nope.jpg"), "1", shotS, join(TMP, "neg-a.png")], 1], ["missing shot", [sheet8, "1", join(TMP, "nope.png"), join(TMP, "neg-b.png")], 1],
    ];
    for (const [label, args, want] of neg) {
      const r = await parity(args);
      const wrote = args[3] ? existsSync(args[3]) : false;
      if (r.code !== want || wrote) exitBad.push(`${label}: exit ${r.code} (want ${want})${wrote ? " + wrote a file" : ""}`);
    }
    chk("T0.3-S4.3", have && exitBad.length === 0, "8 usage errors → exit 2 · 2 unreadable inputs → exit 1 · no output file", have ? `${exitBad.length} bad: ${exitBad.slice(0, 4).join(" · ")}` : "scripts/parity-ai-team.sh is missing");

    const dp: string[] = [];
    if (have) {
      const outDark = join(TMP, "pair-dark.png");
      const rd = await parity([sheet8, "2", shotS, outDark, "--dark"]);
      const di: Any = rd.code === 0 && existsSync(outDark) ? await py("inspect", outDark, shotS, String(wmS), String(PAIR.label), String(PAIR.gap)) : null;
      if (!di || JSON.stringify(di.size) !== JSON.stringify(expS) || !(di.bandLum < 70) || !(di.gapLum < 70) || !(di.inkLeft > 40) || !(di.inkRight > 40) || di.rightEqual !== true) dp.push(`--dark: exit ${rd.code} ${show(JSON.stringify(di), 140)}`);
      if (!firstInfo || !(firstInfo.bandLum > 185) || !(firstInfo.gapLum > 185) || !(firstInfo.inkLeft > 40) || !(firstInfo.inkRight > 40)) dp.push(`default: band ${firstInfo?.bandLum} gap ${firstInfo?.gapLum} ink ${firstInfo?.inkLeft}/${firstInfo?.inkRight}`);
      const wmL = mockupWidthFor(1688);
      const reals: [string, string[], number][] = [[MOCKUP_LIGHT, [], 256], [MOCKUP_DARK, ["--dark"], 110]];
      for (const [mock, flag, lumMax] of reals) {
        const out = join(TMP, `pair-real-${flag.length}.png`);
        const r = await parity([mock, "8", shotL, out, ...flag]);
        const info: Any = r.code === 0 && existsSync(out) ? await py("inspect", out, shotL, String(wmL), String(PAIR.label), String(PAIR.gap)) : null;
        const leftLum = info?.leftMean ? 0.2126 * info.leftMean[0] + 0.7152 * info.leftMean[1] + 0.0722 * info.leftMean[2] : -1;
        if (!info || JSON.stringify(info.size) !== JSON.stringify([wmL + PAIR.gap + 780, 1688 + PAIR.label]) || info.rightEqual !== true || !(flag.length ? leftLum < lumMax : leftLum > 200)) dp.push(`${mock.split("/").pop()} page 8: exit ${r.code} size ${JSON.stringify(info?.size ?? null)} left luminance ${Math.round(leftLum)}`);
      }
    }
    chk("T0.3-S4.4", have && dp.length === 0, "dark band < 70 · light band > 185 · labels on both halves · real light/dark page 8 paired at 1587×1752", have ? dp.slice(0, 3).join(" · ") : "scripts/parity-ai-team.sh is missing");
  }

  // ───────────────────────── S7.1 · S7.2 (static) ─────────────────────────
  console.log("\n── S7 the 1.0 screens ──");
  {
    const zones: [string, string[]][] = [
      ["sessions", [`${MOBILE}/app/(app)/sessions.tsx`]],
      ["chat", [...listFiles(`${MOBILE}/app/(app)/chat`, [".tsx", ".ts"]), ...listFiles(`${MOBILE}/src/components/chat`, [".tsx", ".ts"])]],
      ["crm", [...listFiles(`${MOBILE}/app/(app)/crm`, [".tsx", ".ts"]), ...listFiles(`${MOBILE}/src/components/crm`, [".tsx", ".ts"])]],
      ["member", [...listFiles(`${MOBILE}/app/(app)/member`, [".tsx", ".ts"]), ...listFiles(`${MOBILE}/src/components/member`, [".tsx", ".ts"])]],
      ["auth+ui", [...listFiles(`${MOBILE}/src/components/auth`, [".tsx", ".ts"]), ...listFiles(`${MOBILE}/src/components/ui`, [".tsx", ".ts"])]],
    ];
    const bad: string[] = [];
    const counts: string[] = [];
    for (const [zone, files] of zones) {
      let users = 0;
      for (const f of files) {
        if (!existsSync(f)) {
          bad.push(`${zone}: ${f.split("/").pop()} missing`);
          continue;
        }
        for (const im of importsOf(parse(f))) {
          if (im.from === "@/src/theme") {
            users++;
            const extra = im.names.filter((n) => !["C", "R", "S"].includes(n));
            if (extra.length) bad.push(`${f.split("/").slice(-2).join("/")}:${im.line} imports {${extra.join(",")}} from @/src/theme`);
          } else if (/^@\/src\/theme\//.test(im.from) || /components\/team(\/|$)/.test(im.from) || /(^|\/)theme\/(index|tokens|light|dark)$/.test(im.from)) bad.push(`${f.split("/").slice(-2).join("/")}:${im.line} imports ${im.from}`);
        }
      }
      counts.push(`${zone} ${users}/${files.length}`);
      if (zone !== "auth+ui" && users === 0) bad.push(`${zone}: no file imports @/src/theme any more`);
    }
    chk("T0.3-S7.1", bad.length === 0, "every 1.0 zone still imports only { C, R, S } from @/src/theme", `${bad.length}: ${bad.slice(0, 4).join(" · ")} (${counts.join(" · ")})`);

    const st: Any = existsSync(BEFORE_PNG) ? await py("stat", BEFORE_PNG) : null;
    const sum = existsSync(BEFORE_PNG) ? sha256(readFileSync(BEFORE_PNG)) : "";
    chk("T0.3-S7.2", st && st.format === "PNG" && JSON.stringify(st.size) === "[390,844]" && sum === BEFORE_SHA256, "PNG 390×844 with the recorded sha256", st ? `${st.format} ${JSON.stringify(st.size)} sha ${sum.slice(0, 12)}… (recorded ${BEFORE_SHA256.slice(0, 12)}…)` : `${BEFORE_PNG} is missing — the controller captures it on the base (header [7]); the builder does not`);
  }

  // ───────────────────────── HEAVY: S3.1–S3.4 · S7.3 · S6.1 ─────────────────────────
  console.log(`\n── heavy: S3 shoot pipeline · S7.3 pixel diff · S6 mobile typecheck ${HEAVY ? "" : "(not requested)"} ──`);
  if (!HEAVY) {
    for (const id of ["T0.3-S3.1", "T0.3-S3.2", "T0.3-S3.3", "T0.3-S3.4", "T0.3-S6.1", "T0.3-S7.3"]) skipHeavy(id);
  } else {
    const have = existsSync(SHOOTER);
    const routes = `${ROUTE_GALLERY},${ROUTE_A8}`;
    const summaryPath = `${SHOTS_DIR}/summary.json`;
    const shooterEnv = { ROUTES: routes, FIXTURE, WO: "t0.3", QC_COPY, QC_PORT, QC_BASE: undefined, CI: "1" };
    const judge = async (mode: "light" | "dark", r: Run): Promise<string[]> => {
      const p: string[] = [];
      if (r.code !== 0) p.push(`exit ${r.code}${r.timedOut ? " (timeout)" : ""}: ${show(r.out.split("\n").filter((l) => l.trim()).slice(-3).join(" | "), 200)}`);
      let sum: Any = null;
      try {
        sum = JSON.parse(read(summaryPath) || "null");
      } catch {
        sum = null;
      }
      if (!sum) return [...p, "summary.json missing or not JSON"];
      if (existsSync(summaryPath) && statSync(summaryPath).mtimeMs < STARTED) p.push("summary.json is older than this run");
      if (sum.mode !== mode) p.push(`mode ${JSON.stringify(sum.mode)}`);
      if (sum.ok !== true) p.push(`ok ${JSON.stringify(sum.ok)}`);
      if (sum.wo !== "t0.3") p.push(`wo ${JSON.stringify(sum.wo)}`);
      if (sum.view?.w !== 390 || sum.view?.h !== 844) p.push(`view ${JSON.stringify(sum.view)}`);
      if (sum.fixture?.sha256 !== sha256(read(FIXTURE))) p.push("fixture.sha256 is not the current fixture");
      const mine = (sum.screens ?? []).filter((s: Any) => s.mode === mode);
      for (const [route, expect] of [[ROUTE_GALLERY, ["team-gallery", ...GALLERY_IDS]], [ROUTE_A8, ["team-a8"]]] as const) {
        const s = mine.find((x: Any) => x.name === slugOf(route));
        if (!s) {
          p.push(`no screen ${slugOf(route)} (${mode})`);
          continue;
        }
        if (s.ok !== true || s.overflow !== false || (s.errors ?? [1]).length || (s.missing ?? [1]).length || (s.unmocked ?? [1]).length) p.push(`${s.name}: ok ${s.ok} overflow ${s.overflow} errors ${show(JSON.stringify(s.errors), 80)} missing ${show(JSON.stringify(s.missing), 80)} unmocked ${show(JSON.stringify(s.unmocked), 80)}`);
        const lacks = expect.filter((id) => !(s.expect ?? []).includes(id));
        if (lacks.length) p.push(`${s.name}: expect lacks ${lacks.slice(0, 4).join(",")}`);
        if (!Array.isArray(s.requests) || typeof s.texts !== "string" || s.route !== route) p.push(`${s.name}: requests/texts/route fields`);
        const file = `${SHOTS_DIR}/${slugOf(route)}-${mode}.png`;
        const st: Any = existsSync(file) && statSync(file).mtimeMs >= STARTED ? await py("stat", file) : null;
        if (!st || st.format !== "PNG" || JSON.stringify(st.size) !== "[780,1688]") p.push(`${file.split("/").pop()}: ${st ? `${st.format} ${JSON.stringify(st.size)}` : "missing or stale"}`);
        else if (mode === "dark" ? !(st.lum < 110) : !(st.lum > 150)) p.push(`${file.split("/").pop()}: luminance ${st.lum} is not ${mode}`);
      }
      if (mode === "dark" && (sum.screens ?? []).filter((s: Any) => s.mode === "light").length < 2) p.push("the light entries were not kept");
      return p;
    };
    if (!have) {
      chk("T0.3-S3.1", false, "shooter runs", `${SHOOTER} is missing`);
      chk("T0.3-S3.2", false, "shooter runs", `${SHOOTER} is missing`);
    } else {
      const r1 = await run(process.execPath, [SHOOTER], { env: { ...shooterEnv, QC_PREPARE: "1", QC_SKIP_EXPORT: undefined }, timeoutMs: 45 * 60_000 });
      const p1 = await judge("light", r1);
      chk("T0.3-S3.1", p1.length === 0, "exit 0 + a clean light summary + 2 PNG 780×1688", p1.slice(0, 4).join(" · "));
      const r2 = await run(process.execPath, [SHOOTER, "--dark"], { env: { ...shooterEnv, QC_PREPARE: "1", QC_SKIP_EXPORT: "1" }, timeoutMs: 15 * 60_000 });
      const p2 = await judge("dark", r2);
      chk("T0.3-S3.2", p2.length === 0, "exit 0 + a clean dark summary + 2 dark PNG", p2.slice(0, 4).join(" · "));
    }
    // the oracle's own look at the export the shooter just made
    const dist = join(QC_COPY, "dist");
    const distFresh = existsSync(join(dist, "index.html")) && statSync(join(dist, "index.html")).mtimeMs >= STARTED;
    if (!distFresh) {
      const why = `${dist}/index.html ${existsSync(join(dist, "index.html")) ? "is older than this run (the shooter did not export)" : "does not exist"}`;
      chk("T0.3-S3.3", false, "a fresh export", why);
      chk("T0.3-S3.4", false, "a fresh export", why);
      chk("T0.3-S7.3", false, "a fresh export", why);
    } else {
      let served: { server: Server; base: string } | null = null;
      try {
        served = await serveDist(dist);
        const base = served.base;
        const tenant = String(FX?.session?.tenantId ?? "t1");
        const got = await withBrowser(async (b) => ({
          gL: await shoot(b, base, ROUTE_GALLERY, { dark: false, mock: fixtureMock, tenant, dsf: 1, waitFor: 'document.querySelectorAll("[data-testid^=gallery-]").length >= 15' }),
          gD: await shoot(b, base, ROUTE_GALLERY, { dark: true, mock: fixtureMock, tenant, dsf: 1, waitFor: 'document.querySelectorAll("[data-testid^=gallery-]").length >= 15' }),
          aL: await shoot(b, base, ROUTE_A8, { dark: false, mock: fixtureMock, tenant, dsf: 1, waitFor: `!!document.querySelector('[data-testid="team-a8"]') && document.body.innerText.includes(${JSON.stringify(A8_COPY[2])})` }),
          aD: await shoot(b, base, ROUTE_A8, { dark: true, mock: fixtureMock, tenant, dsf: 1, waitFor: `!!document.querySelector('[data-testid="team-a8"]') && document.body.innerText.includes(${JSON.stringify(A8_COPY[2])})` }),
          s7: await shootSessions(b, base),
        }));
        const lumOf = async (s: Shot, name: string) => {
          if (!s.png) return -1;
          const f = join(TMP, `${name}.png`);
          writeFileSync(f, s.png);
          return Number((await py("stat", f)).lum ?? -1);
        };
        const gp: string[] = [];
        for (const [mode, s] of [["light", got.gL], ["dark", got.gD]] as const) {
          const lacks = ["team-gallery", ...GALLERY_IDS].filter((id) => !s.ids.includes(id));
          if (lacks.length) gp.push(`${mode}: testIDs absent ${lacks.slice(0, 5).join(",")}`);
          if (s.overflow || s.wide.length) gp.push(`${mode}: overflow ${s.overflow} wider than the screen [${s.wide.join(",")}]`);
          if (s.errors.length) gp.push(`${mode}: ${show(s.errors.join(" | "), 140)}`);
          if (s.external.length) gp.push(`${mode}: external requests to ${[...new Set(s.external)].slice(0, 3).join(",")}`);
          const l = await lumOf(s, `probe-gallery-${mode}`);
          if (mode === "dark" ? !(l >= 0 && l < 110) : !(l > 150)) gp.push(`${mode}: luminance ${l}`);
        }
        chk("T0.3-S3.3", gp.length === 0, "16 testIDs · no overflow · no error · no external request · light is light, dark is dark", gp.slice(0, 4).join(" · "));

        const ap: string[] = [];
        const wantCalls = ["GET /api/mobile/team/summary", "GET /api/mobile/team/employees", "GET /api/mobile/team/positions/recommend"];
        const wantText = [String(FX?.summary?.tenant?.name ?? "?"), ...(FX?.recommend?.recommendations ?? []).flatMap((r: Any) => [String(r.label), String(r.reason)]), ...A8_COPY];
        for (const [mode, s] of [["light", got.aL], ["dark", got.aD]] as const) {
          if (!s.ids.includes("team-a8")) ap.push(`${mode}: testID team-a8 absent`);
          const noText = wantText.filter((t) => !s.text.includes(t));
          if (noText.length) ap.push(`${mode}: text absent ${noText.slice(0, 3).map((t) => show(t, 24)).join(" / ")}`);
          const calls = [...new Set(s.requests.filter((q) => q.path.startsWith("/api/mobile/team/")).map((q) => `${q.method} ${q.path}`))].sort();
          if (JSON.stringify(calls) !== JSON.stringify([...wantCalls].sort())) ap.push(`${mode}: team calls [${calls.join(", ")}]`);
          if (s.requests.some((q) => q.path.startsWith("/api/mobile/team/") && q.tenant !== tenant)) ap.push(`${mode}: a team call without X-Tenant-Id ${tenant}`);
          if (s.unmocked.length) ap.push(`${mode}: unmocked ${s.unmocked.slice(0, 3).join(", ")}`);
          if (s.overflow || s.wide.length) ap.push(`${mode}: overflow ${s.overflow} [${s.wide.join(",")}]`);
          if (s.errors.length) ap.push(`${mode}: ${show(s.errors.join(" | "), 140)}`);
          if (s.external.length) ap.push(`${mode}: external requests to ${[...new Set(s.external)].slice(0, 3).join(",")}`);
          const l = await lumOf(s, `probe-a8-${mode}`);
          if (mode === "dark" ? !(l >= 0 && l < 110) : !(l > 150)) ap.push(`${mode}: luminance ${l}`);
        }
        chk("T0.3-S3.4", ap.length === 0, "team-a8 · tenant + 3×(label, reason) + 3 mockup strings · exactly 3 team routes with the tenant header · nothing unmocked · no overflow", ap.slice(0, 4).join(" · "));

        const s7 = got.s7;
        const after = join(TMP, "sessions-after.png");
        if (s7.png) writeFileSync(after, s7.png);
        const d: Any = s7.png && existsSync(BEFORE_PNG) ? await py("diff", BEFORE_PNG, after, "16") : null;
        const ctlFile = join(TMP, "sessions-control.png");
        const ctl: Any = existsSync(BEFORE_PNG) ? (await py("control", BEFORE_PNG, ctlFile), await py("diff", BEFORE_PNG, ctlFile, "16")) : null;
        chk("T0.3-S7.3", d && typeof d.pct === "number" && d.pct <= 0.5 && s7.errors.length === 0 && s7.unmocked.length === 0 && ctl && ctl.pct > 0.5, "differing pixels ≤ 0.5 % (channel tolerance 16) · clean shot · control > 0.5 %", `diff ${d ? `${d.pct}% (${d.bad} px; sizes ${JSON.stringify(d.sizeA)} vs ${JSON.stringify(d.sizeB)})` : existsSync(BEFORE_PNG) ? "no shot" : "no before picture"} · errors ${show(JSON.stringify(s7.errors), 100)} · unmocked ${JSON.stringify(s7.unmocked)} · control ${ctl ? `${ctl.pct}%` : "-"}`);
      } catch (e) {
        for (const id of ["T0.3-S3.3", "T0.3-S3.4", "T0.3-S7.3"]) chk(id, false, "the probe runs", `probe crashed: ${errMsg(e)}`);
      } finally {
        if (served) served.server.close();
      }
    }
    const tc = await run("npm", ["run", "typecheck"], { cwd: join(ROOT, MOBILE), env: { CI: "1" }, timeoutMs: 25 * 60_000 });
    const tcErrors = tc.out.split("\n").filter((l) => /error TS\d+/.test(l));
    chk("T0.3-S6.1", tc.code === 0 && tcErrors.length === 0, "exit 0, 0 TS errors", `exit ${tc.code}${tc.timedOut ? " (timeout 25 min)" : ""} · ${tcErrors.length} error line(s): ${show(tcErrors.slice(0, 2).join(" | ") || tc.out.split("\n").filter((l) => l.trim()).slice(-2).join(" | "), 220)}`);
  }
} catch (e) {
  crashed = errMsg(e);
  console.log(`\n🔴 oracle crashed: ${crashed}`);
} finally {
  rmSync(TMP, { recursive: true, force: true });
  for (const d of [CHR_DIR, join(SNAP_TMP, `${TAG}-chr`)]) rmSync(d, { recursive: true, force: true });
}

// ───────────────────────── S7.4 housekeeping ─────────────────────────
console.log("\n── housekeeping ──");
{
  const left: string[] = [];
  for (const d of [tmpdir(), SNAP_TMP]) {
    try {
      for (const n of readdirSync(d)) if (n.startsWith(TAG)) left.push(join(d, n));
    } catch {
      /* folder not readable / absent — nothing of ours can be there */
    }
  }
  const statusAfter = await gitStatus();
  chk("T0.3-S7.4", left.length === 0 && statusAfter === statusBefore, "0 temp entries tagged with this run · `git status` unchanged (shots-ai-team/ excluded)", `${left.length} left [${left.slice(0, 3).join(", ")}] · worktree ${statusAfter === statusBefore ? "unchanged" : "CHANGED"}`);
}
// anything not reached (crash) is a failure, never a silent pass
for (const id of Object.keys(CHECKS)) if (!done.has(id)) chk(id, false, "the check runs", `not reached${crashed ? ` — oracle crashed: ${crashed}` : ""}`);

const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const skippedHeavy = cks.filter((c) => c.skipped).map((c) => c.id);
const failed = cks.filter((c) => !c.ok && !c.skipped);
const blocking = failed.filter((c) => c.sev !== "MINOR").length;
const findings = failed.map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${failed.length === 0 && skippedHeavy.length === 0 ? "🟢" : failed.length === 0 ? "🟡" : "🔴"} T0.3: ${passed}/${total}${FORCE ? " (QC_FORCE)" : ""}${HEAVY ? " (HEAVY)" : ""} · failed ${failed.length} · skipped-heavy ${skippedHeavy.length} · missing deliverables ${MISSING.length}/${DELIVERABLES.length} · residue tag ${TAG}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings, skippedHeavy, heavy: HEAVY })}`);
process.exit(blocking === 0 ? 0 : 1);
