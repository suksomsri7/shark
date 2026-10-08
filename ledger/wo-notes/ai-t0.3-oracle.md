# T0.3 — oracle notes (oracle writer · 8 Oct 2026 · base 873c80ca · branch `wip/pos-ai-t0.3-oracle`)

Oracle: `scripts/qc-ai-t0.3.mts` — **39 checks, fixed total** (contract minimum 18; 32 in revision 1, 35 in revision 2, 39 in revision 3 — see §0 and §0b). No database, no env file.
Its header is the builder's contract (theme API, 15 components + props, gallery route, shooter CLI, parity CLI + grid, fixture, "before" picture).

## 0. Revision 2 — controller rulings of 8 Oct applied (brief "Controller addendum + rulings")
| Ruling | Change in the oracle | Check ids |
|---|---|---|
| (a) OQ-4 visual parity wins | **ORACLE-EDIT T0.3-S2.3 (controller-ordered, pre-builder).** The literals `cardGap 12` / `cardPad ≥ 14` / legacy radii are gone. `TOKEN_SPEC` freezes 26 length tokens with generator `file:line` + the CSS text that must still be on that line + the mockup px; expected = px × 390/536, accepted when within ±1 and a whole or half point. The run re-reads the generator files: a moved/changed CSS line turns S2.3 red with "GENERATOR MOVED (ORACLE-EDIT needed)". Also `radii.full = 999`, `size.touchMin = 44` exact, 9 type styles `{fontSize, lineHeight ≥ fontSize, fontWeight}`. Touch target: new static rule — every `<Pressable>`/`<Touchable*>` in components/team has `hitSlop` or a `style` naming `touchMin`. | S2.3 (rewritten) · **S5.6 (new)** |
| (b) OQ-3 orbs = bundled PNG | 12 files `apps/mobile/assets/team/orbs/<department>-<light\|dark>.png`: PNG, square 300–1024 px, corner alpha ≤ 8, centre opaque, opaque share 0.35–0.9, all different, palette order (chat redder than account, account greener than chat, sales bluer than content, content least blue). All 12 referenced by static `require()` inside components/team (relative or `@/assets/…`), `Orb.tsx` imports and renders RN `Image`, `AvatarStack` renders `Orb`/`Image`, no string containing "gradient", `scripts/ai-team-render-orbs.mjs` exists, names the output folder and the generator CSS, no network URL. S2.6 lets the PNG requires through (`Image` was never blocked; now stated). Both paths are in the header's "FILES THE BUILDER OWNS" and in the SKIP guard / X10.2 source scan. | **S2.8 (new) · S2.9 (new)** · S2.6 · X10.2 |
| (c) brief error 4 | 4 anchors added: `light.accent #16161c` (gen_glass_airy.py:115) · `light.accentFg #ffffff` (gen_glass_airy.py:41) · `dark.accent #f2f2f7` / `dark.accentFg #16161c` (gen_airy_dark.py:19). PrimaryButton must read `colors.accent` + `colors.accentFg`. | S2.2 (16 anchors) · S5.6 |
| (d) OQ-6 fonts | header states IBM Plex Sans Thai only; nothing checks Inter. | — |
| (e) machine lock | acceptance command in the header and in §1 now goes through `with-gate-lock.sh`. | — |

Controls for the new/changed checks (scratch tree outside the worktree, removed): a conforming reference → S2.2 S2.3 S2.6 S2.7 S2.8 S2.9 S5.6 green; 10 seeded defects (`cardGap: 12`, `rowSub 10.3`, `touchMin: 40`, `light.accent #e6e1ff`, `dark.accentFg #3f3499`, an orb without alpha, a 128 px orb, a duplicated/wrong-palette orb, one require pointing at the wrong file, a "linear-gradient" string, a Pressable without hitSlop, PrimaryButton on `accentSoft`) → S2.2 S2.3 S2.8 S2.9 S5.6 red with the right reason. Single-file strict `tsc` exit 0.

Not precise (stated limits): (1) S5.6 proves the *declaration* of a 44 pt target (hitSlop present / `touchMin` named), not the rendered hit area — `hitSlop` is invisible in a web export, so no browser measurement is possible; a `hitSlop={1}` would pass. (2) S2.8 cannot prove the PNGs are the generator's orbs — only format, transparency, size, distinctness and relative colour order; fidelity is the controller's eye on the parity pair. (3) "rendered once by the committed script" is checked as "script exists and names folder + generator CSS", not by re-running it (that needs chromium = heavy).

## 0b. Revision 3 — `ORACLE-EDIT T0.3-S2.6 + fonts (controller-ordered, owner order 8 Oct)` · total now **39**
Source: brief "Controller ruling 3" (owner: "the UI must follow the design" ⇒ bundle Inter; reverses OQ-6). Only the oracle and these notes were edited (+ an appended run in `ai-t0.3-red.txt`).

| Check | sev | What it proves |
|---|---|---|
| T0.3-S2.6 (edited) | MAJOR | allow-list gains `@expo-google-fonts/inter` (the only new package) |
| **T0.3-S2.10** (new) | CRITICAL | `apps/mobile/package.json` vs `git show f33dd2c1:…`: dependencies added = exactly `@expo-google-fonts/inter`, none removed/changed, nothing outside `dependencies` changed; `package-lock.json`: `packages` added = exactly `node_modules/@expo-google-fonts/inter`, none removed/changed, root dependencies + that one |
| **T0.3-S2.11** (new) | CRITICAL | weights of the mockup CSS = {300, 400, 500, 600, 700}: one witness per weight frozen with generator file:line (`FONT_WEIGHT_SPEC`) + the font-stack witness `gen_glass_airy.py:2`, and every `font-weight:` of the 5 generators is re-scanned (a new value ⇒ "GENERATOR MOVED"). `apps/mobile/src/lib/fonts.ts` (the real `useFonts` file; `app/_layout.tsx` untouched): exactly one `// AI TEAM T0.3 ▸ … ◂` block, the file minus the block is byte-identical to the base, the block names the package, and the `useFonts({…})` object holds exactly `Inter_300Light/400Regular/500Medium/600SemiBold/700Bold`, all inside the block |
| **T0.3-S5.7** (new) | CRITICAL | `components/team/text-runs.ts` has no import and is executed in a child process: `splitRuns` on 16 strings (empty, one char, space only, Thai only, Latin only, Thai+digits+Latin, leading/trailing spaces, emoji incl. a ZWJ family, combining accent, ฿ amounts, newline, Thai digits/marks, symbols ‹ › ✓ ⚠) must equal the oracle's reference split exactly — lossless, maximal runs, no empty run, only `{text, script}`; deterministic. `fontFor` answers for 5 weights × string/number × 2 families + "bold"/"normal"/undefined (26). Every `tokens.type.*.fontWeight` is one of the five |
| **T0.3-S5.8** (new) | CRITICAL | `TeamText.tsx`: imports `Text` from `@/src/components/ui/text`, imports `splitRuns` + `fontFor` from `./text-runs`, calls both, re-exports `splitRuns`, exports component `TeamText`, renders `<Text>`. No other file of components/team imports anything but `TextInput` from ui/text or renders `<Text>`; the 10 text-bearing components (PrimaryButton StatCard ListRow SectionTitle EmptyState ErrorState PillTabs Segmented QuotaRing Orb) render `<TeamText>` |
| T0.3-S7.1 (extended, same intent) | CRITICAL | + `components/ui/text.tsx` byte-identical to the base (1.0 text never picks Inter up). `src/lib/fonts.ts` is not in any S7.1 zone, so the allowed hunk cannot turn S7.1 red; S7.3 (pixel diff) unchanged |

Decisions in the contract (controller: overrule if wrong):
- **Per-glyph rule** = what the browser's font stack does: Thai block U+0E00–U+0E7F → IBM Plex Sans Thai, **except ฿ U+0E3F**, which Inter carries (checked in the cmap of the Inter the mockups were rendered with, `/root/.fonts/Inter-3.ttf`: U+0E3F present, U+0E01 absent) → Inter. Spaces, digits, punctuation, symbols, emoji → the Inter run (emoji fall back to the system font inside it).
- **Weight 300 is in the set** because of a single witness: `gen_airy_full.py:132` (`font-weight:300">−</span>`, a stepper minus). The controller said "read them from the generators", so `Inter_300Light` is required. No Thai 300 is loaded (the font file may only get the one hunk), so `fontFor("thai", 300)` = `IBMPlexSansThai_400Regular`.
- **The splitter lives in a pure file `text-runs.ts`** and TeamText re-exports it, so the oracle can execute it without React Native.
- **One hunk in fonts.ts ⇒ per-weight `require("@expo-google-fonts/inter/<weight>/Inter_<weight>.ttf")` inside the `useFonts` object** (an `import` cannot share the block). The oracle checks keys/block/package name, not the require form.
- Base for the diffs is commit `f33dd2c1` (`QC_AI_T03_BASE` overrides it — used only for the scratch controls).

Controls (scratch git tree outside the worktree, removed): reference implementation → S2.6 S2.10 S2.11 S5.3 S5.7 S5.8 green. Seeded defects → red with the right reason: a second new dependency + a changed script + a second lock entry (S2.10); `Inter_300Light` removed and a comment edited outside the block (S2.11); ฿ classified Thai, input trimmed, `600 → Inter_700Bold`, a type style with weight 800 (S5.7); re-export removed, StatCard on ui/text's `Text` (S5.8); a line appended to ui/text.tsx (S7.1). Single-file strict `tsc` exit 0.

Run on the builder's tree mid-work (forced, static only; appended to `ai-t0.3-red.txt`): `🟡 T0.3: 33/39 (QC_FORCE) · failed 0 · skipped-heavy 6 · missing deliverables 0/37` · exit 0 — every static check already green; the 6 heavy checks were not run (no export, by order).

Not precise: (1) S5.8's "text-bearing components" is a fixed list of 10; AvatarStack (initials / +N), GlassCard, BottomSheet, Skeleton, SearchField are only covered by "no `<Text>` outside TeamText". A component that draws text some third way (e.g. RN `Text` through a helper outside components/team) is caught by S5.4/S2.6 only if it imports it. (2) Nothing static proves the nested spans really get the Inter family at render time on native; on web the heavy probe does not inspect computed fonts either — font fidelity is seen in the parity pair. (3) S2.10/S2.11/S7.1 compare against f33dd2c1: a later WO that legitimately adds a dependency or edits fonts.ts / ui/text.tsx will need an ORACLE-EDIT. (4) That `@expo-google-fonts/inter` ships `<weight>/Inter_<weight>.ttf` was inferred from the installed sibling package (ibm-plex-sans-thai 0.4.1 has `400Regular/IBMPlexSansThai_400Regular.ttf`), not from the Inter package itself. (5) "Rendered lockfile is installable" is not checked (no `npm ci` here).

## Files written (nothing else touched)
| File | What |
|---|---|
| `scripts/qc-ai-t0.3.mts` | the oracle (+ mode `--capture-before`, oracle writer / controller only) |
| `apps/mobile/qc/fixtures/ai-team/t0.3.json` | A8 fixture, 0 employees, hand-written from the DTO shapes (`source: "contract"`) — sha256 frozen in the oracle |
| `apps/mobile/qc/fixtures/ai-team/t0.3-before/sessions-light.png` + `capture.json` | S7 "before" picture of the sessions screen, captured on the base (§4) |
| `ledger/wo-notes/ai-t0.3-red.txt` | unforced + forced output on the base |
| `ledger/wo-notes/ai-t0.3-oracle.md` | this file |

## 1. How to run
```
bash scripts/iso.sh pnpm exec tsx scripts/qc-ai-t0.3.mts                                   # unforced → SKIP exit 0 while not built
bash scripts/iso.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-ai-t0.3.mts                    # forced, cheap part (29 checks run, 6 SKIPPED-HEAVY)
ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 QC_AI_T03_HEAVY=1 pnpm exec tsx scripts/qc-ai-t0.3.mts   # ACCEPTANCE: all 39 — heavy steps MUST queue on the machine lock (no qc4.sh: no DB)
```
`iso.sh` forwards only PATH/HOME/QC_ENV_FILE/NODE_OPTIONS, so the flags must sit behind `env` inside the wrapper (as shown).
SKIPPED-HEAVY checks stay in `total`, are not in `passed`, are listed in `JSON_SUMMARY.skippedHeavy`, and do not change the exit code.
"All green" (39/39) therefore exists only for forced + heavy. Heavy = one web export of the QC copy (`/root/qc-shark-mobile-ai`, port 4713, done by the
builder's shooter), a second shooter run `--dark`, the oracle's own chromium probe of that export, and `npm run typecheck` in `apps/mobile`.

## 2. Check table
| id | sev | heavy | what it proves |
|---|---|---|---|
| T0.3-S1.1 | CRITICAL | | `@/src/theme` (theme.ts) evaluated in a child process: `C` `R` `S` deep-equal the snapshot of 873c80ca embedded in the oracle |
| T0.3-S1.2 | CRITICAL | | theme.ts is a pure `export … from "./theme/…"` shim (AST); `theme/index.ts` exports the same objects (identity) + `tokens light dark useTheme getThemeOverride setThemeOverride THEME_STORAGE_KEY="shark_theme"`; 4 files exist |
| T0.3-S2.1 | CRITICAL | | `light` and `dark` have the same deep key paths and value kinds (evaluated objects) |
| T0.3-S2.2 | CRITICAL | | 25 contract colour keys valid in both palettes, `glass.shadow` present, light ≠ dark, 16 anchors from the mockup CSS (bg, text, glass border, 3 orb colours × 2 modes, primary button accent/accentFg × 2 modes) |
| T0.3-S2.3 | MAJOR | | **ORACLE-EDIT (controller-ordered, pre-builder):** 26 length tokens = generator CSS px × 390/536 within ±1, whole/half pt, each tied to a generator file:line that is re-read; `radii.full 999`; `size.touchMin 44`; 9 type styles |
| T0.3-S2.4 | CRITICAL | | `useTheme()` run against stubbed react / react-native / expo-secure-store: 6 scenarios (system light/dark/unknown, override dark/light/cleared incl. what is stored) + cold start with a stored `dark` on native (SecureStore) and on web (`localStorage`) |
| T0.3-S2.5 | CRITICAL | | no hex / `rgb()` / `rgba()` / `hsl()` in any string, template chunk or JSX text of `components/team` (TypeScript AST — comments cannot trip it) |
| T0.3-S2.6 | MAJOR | | import allow-list: `src/theme` → react, react-native {useColorScheme, Appearance, Platform}, expo-secure-store, relatives · `components/team` → react, react-native, relatives, `@/src/theme`, `ui/{text,page}`, today's dependencies only |
| T0.3-S2.7 | MAJOR | | no numeric `border*Radius` literal in `components/team` |
| T0.3-S2.8 | CRITICAL | | the 12 orb PNG assets: format, square 300–1024, transparent corners, opaque centre, all different, palette colour order |
| T0.3-S2.9 | CRITICAL | | 12 static require() of those assets in components/team; Orb imports + renders RN `Image`; AvatarStack renders Orb/Image; no "gradient" string; render script committed, offline |
| T0.3-S3.1 | CRITICAL | ✔ | builder's shooter, `QC_PREPARE=1`, light: exit 0; `summary.json` (mode, ok, wo, view, fixture sha, per-screen ok / overflow=false / errors / missing / unmocked / expect / requests / texts / route); 2 PNG 780×1688, light |
| T0.3-S3.2 | CRITICAL | ✔ | same with `--dark` on the same export: mode dark, both screens ok, light entries kept, PNGs are dark (mean luminance < 110) |
| T0.3-S3.3 | CRITICAL | ✔ | the oracle's own browser on that export, light + dark: `/team/_gallery` has `team-gallery` + 15 `gallery-*` testIDs, no overflow (scrollWidth and per-element), no page error, no request to an external host, luminance matches the mode |
| T0.3-S3.4 | CRITICAL | ✔ | same for `/team/_gallery?screen=a8`: `team-a8`, tenant name + 3 × (label, reason) from the fixture + 3 mockup strings, exactly the 3 team routes with `X-Tenant-Id`, nothing unmocked, no overflow, dark is dark |
| T0.3-S3.5 | CRITICAL | | fixture: sha256 = the oracle's, `me` / `summary` / `employees` / `recommend` parse with strict zod copies of the API contract, 0 employees, 3 recommendations, session tenant is a uiVersion-2 membership |
| T0.3-S3.6 | MAJOR | | shooter source carries the CLI contract (16 marks) and no `eas …` / `pkill` / CRM folder or port |
| T0.3-S4.1 | CRITICAL | | parity script on synthetic sheets: pages 1–8 (8-up), 1–4 (4-up), 2 pages of a half-size sheet → exit 0, PNG exactly (Wm + 24 + shotW) × (H + 64) |
| T0.3-S4.2 | CRITICAL | | left pane = the colour of exactly that page up to its 4 edges (an off-grid or bezel-including crop shows black/another colour); right pane pixel-identical to the shot |
| T0.3-S4.3 | CRITICAL | | index 0 / 9 / 5-on-4-up / `x` / `1.5` / `-1` / 3 args / no args → exit 2; missing mockup / missing shot → exit 1; no file written |
| T0.3-S4.4 | MAJOR | | `--dark` band + gap dark, default light, ink in both label halves; the real `airy-a.jpg` and `airy-dark-a.jpg` page 8 pair with a 780×1688 shot at 1587×1752 |
| T0.3-S5.1 | CRITICAL | | 15 files, each exports its component (function / const arrow / memo), declares `testID` + the required props (destructuring, inline type, interface, alias, RN `…Props` heritage) |
| T0.3-S5.2 | CRITICAL | | each forwards testID: a `testID={…testID…}` attribute or a spread of an object that still contains it |
| T0.3-S5.3 | MAJOR | | no JSX text with letters, no Thai string literal in components/team |
| T0.3-S5.4 | MAJOR | | no `Text` / `TextInput` / `Modal` / namespace import from react-native in components/team |
| T0.3-S5.5 | MAJOR | | gallery route: default export, `__DEV__` + `EXPO_PUBLIC_TEAM_GALLERY` guard, imports all 15 components, 17 testIDs, the 3 A8 strings and the 3 A8 routes |
| T0.3-S5.6 | MAJOR | | touch target: every Pressable/Touchable element has `hitSlop` or a style naming `touchMin`; PrimaryButton is pressable and reads `colors.accent` / `colors.accentFg` |
| T0.3-S6.1 | CRITICAL | ✔ | `npm run typecheck` in apps/mobile: exit 0, no `error TS` line |
| T0.3-S7.1 | CRITICAL | | every file of the 1.0 zones (sessions · chat · crm · member · components auth/chat/crm/member/ui) imports only `{ C, R, S }` from `@/src/theme` and nothing from `theme/*` or `components/team` |
| T0.3-S7.2 | MAJOR | | the "before" picture exists, PNG 390×844, sha256 = the one recorded in the oracle |
| T0.3-S7.3 | CRITICAL | ✔ | the oracle shoots `/sessions` of the fresh export with the same frozen clock + mocks as the "before" capture: pixels differing by > 16 on any channel ≤ 0.5 %; control (a 64×64 block changed = 1.24 %) must be detected |
| T0.3-S7.4 | MAJOR | | no temp entry tagged `qc-ai-t0.3-<rand>` left (os.tmpdir + snap chromium tmp); `git status` identical before/after (shots-ai-team/ excluded) |
| T0.3-X10.1 | CRITICAL | | fixture: no JWT / key-like / long base64-hex value, no URL, no connection string, no key named token/secret/micro/prompt/model/cost/wage, e-mails only `@qc.shark` |
| T0.3-X10.2 | CRITICAL | | shooter + parity + gallery + theme + components: no env-file access, no secret-like literal; the shooter's only `shark_token` literal is `qc-mock`; no credentials path |
| T0.3-X10.3 | MAJOR | | observed storage I/O of `src/theme` in the 3 evaluation runs: only key `shark_theme`, only values light/dark/removal |

Counts per group: S1 2 · S2 9 · S3 6 · S4 4 · S5 6 · S6 1 · S7 4 · X10 3 = **35** (heavy: S3.1–S3.4, S6.1, S7.3).

Positive and negative controls were run against a scratch reference implementation outside the worktree — see §5.

## 3. Decisions taken in the contract (controller: confirm or overrule before the builder starts)
- **D-1 A8 lives in the gallery file.** The brief owns one route file only, so the A8 proof is `/team/_gallery?screen=a8` (root testID `team-a8`), not a new screen. T2.2 builds the real A8.
- **D-2 The gallery guard needs an env flag.** A web export is a production bundle (`__DEV__ === false`), so `__DEV__` alone renders nothing in the pipeline. Contract: `__DEV__ || process.env.EXPO_PUBLIC_TEAM_GALLERY === "1"`; the shooter exports with that flag.
- **D-3 Theme API.** `useTheme(): { mode, colors, tokens }`, `getThemeOverride()`, `setThemeOverride("light"|"dark"|null)`, `THEME_STORAGE_KEY = "shark_theme"`, module-level store (pattern of `src/lib/brand.tsx`) so a stored override is honoured without waiting for an effect. `C` lives wherever the builder wants inside `src/theme/*`; the oracle evaluates, it does not grep.
- **D-4 summary.json.** Brief: "same schema + mode". Two runs (light, dark) write the same file ⇒ contract: top-level `mode`/`ok` describe this run, entries of the other mode are kept when the fixture sha matches. Slug rule for file names is in the header.
- **D-5 Parity pair layout is exact** (band 64 px, gap 24 px, mockup scaled to the shot height, shot unscaled) so the oracle can verify the grid with synthetic sheets instead of trusting the script.
- **D-6 S7 uses the oracle's own shooter on both sides** (before: base export; after: the export the builder's shooter just produced), frozen clock 2026-10-08T05:00Z, a 1.0 membership (`uiVersion: 1`), quota bar visible (62 %), 3 conversations. The builder's shooter is not involved in S7, so its mock details cannot move the picture.
- **D-7 15 components**, not 11: the brief adds SectionTitle, EmptyState, ErrorState, Skeleton to the list of AI-TEAM-RUN §2; the oracle requires all 15.

## 4. S7 "before" picture
**Exists.** `apps/mobile/qc/fixtures/ai-team/t0.3-before/sessions-light.png` (PNG 390×844, 18,982 bytes, sha256 `6d90f9bf64e462d3ab2343e9f81504b53a57d29f475b759ded5ac4c90bb56e15`, frozen in the oracle as `BEFORE_SHA256`) + `capture.json` (base commit 873c80ca, clock, repeat diff).
- Captured by `scripts/qc-ai-t0.3.mts --capture-before`: rsync of the worktree's `apps/mobile` into `/root/qc-shark-mobile-ai` (node_modules symlink to `/root/qc-shark-mobile/node_modules`, the two patches of shoot-crm.mjs), `npx expo export --platform web` **inside the copy**, served on an ephemeral port, shot with the oracle's own puppeteer routine (the same one S7.3 uses for "after"). Nothing was built in the worktree.
- Two consecutive shots differed by 0 % (determinism); the picture shows header, quota bar "62%", 3 rooms ("1 ชม.", "5 ชม.", "5/10" — frozen clock), IBM Plex Sans Thai loaded.
- Attempts: (1) export inside `systemd-run --unit=ai-t03-shot -p MemoryMax=6G` hit the 40-minute limit at "Bundler cache is empty, rebuilding" (load average 55–59, a `next build` of another lane was running) — killed. (2) the one allowed retry, same unit, `QC_AI_T03_KEEP_CACHE=1` (no `--clear`), load ≈ 28: export exit 0 in ≈ 5 min, then chromium did not answer within puppeteer's 30 s launch timeout. (3) no third export: `QC_SKIP_EXPORT=1` re-used the finished `dist` and only shot it (launch timeout raised to 180 s in the oracle) → written.
- The builder must NOT re-capture (the mode refuses once `apps/mobile/src/theme/` exists). `/root/qc-shark-mobile-ai` is left in place with the base export; the builder's shooter overwrites it (`rsync --delete` + export).

## 5. Runs on the base
**Revision 2 (35 checks; `ai-t0.3-red.txt` holds these two runs — heavy not re-run, by controller order):**
- unforced: `⚠️  SKIPPED — WO T0.3 not built yet (missing 35/35: …)` · `JSON_SUMMARY {"total":0,"passed":0,"findings":[],"skipped":true}` · **exit 0**
- forced: `🔴 T0.3: 6/35 (QC_FORCE) · failed 23 · skipped-heavy 6 · missing deliverables 35/35` · **exit 1** — green: S1.1 S3.5 X10.1 S7.1 S7.2 S7.4; all others "missing / not evaluated", no crash, residue 0.

**Revision 1 (32 checks, before the rulings — kept for the record; the heavy result below is still the only heavy run on the base):**
Full output: `ledger/wo-notes/ai-t0.3-red.txt`.
- unforced: `⚠️  SKIPPED — WO T0.3 not built yet (missing 22/22: …)` · `JSON_SUMMARY {"total":0,"passed":0,"findings":[],"skipped":true}` · **exit 0**
- forced: `🔴 T0.3: 6/32 (QC_FORCE) · failed 20 · skipped-heavy 6 · missing deliverables 22/22` · **exit 1**. Green on the base, as they should be: S1.1 (today's theme.ts is the snapshot), S3.5 + X10.1 (the oracle's own fixture), S7.1 (1.0 screens untouched), S7.2 (before picture), S7.4 (housekeeping). Every other check is red because the deliverable is missing ("file missing", "not evaluated: Cannot find module …/theme/index.ts", "scripts/parity-ai-team.sh is missing") — no crash.
- forced + heavy on the base: `🔴 T0.3: 7/32 (QC_FORCE) (HEAVY) · failed 25 · skipped-heavy 0` · **exit 1**. S6.1 green (the mobile typecheck passes on the base — it is a regression guard); S3.1/S3.2 "shoot-ai-team.mjs is missing"; S3.3/S3.4/S7.3 "dist/index.html is older than this run (the shooter did not export)".

Controls run outside the worktree (scratch tree `/tmp/ai-t0.3-ref`: a throw-away reference implementation of theme, 15 components, gallery, parity script and a shooter stub; removed afterwards):
- **positive**: forced → 25/32, the only red = S7.2 (the picture did not exist yet at that moment), 6 skipped-heavy ⇒ every static check and all of S4 can go green.
- **negative**: 23 seeded defects (legacy `C.blue` changed; extra statement in the shim; `dark` without `accentSoft` + wrong `dark.bg`; `cardGap: 10`; web cold start ignoring the stored override; a read of `shark_token` from the theme; `#3f3499` in a template and `rgba()` in a string; `react-native-svg` import; `borderRadius: 20`; a required prop renamed; `testID="fixed"`; `testID` destructured out of a spread; a Thai literal; `Modal`; gallery without the env guard; fixture with a push-token-like value; shooter with a JWT-like token and a `.env.qc4` read; parity crop including the bezel; parity accepting index 9; `useTheme` imported by sessions.tsx) → every targeted check red, the untouched ones (S4.1, S4.4, S7.4, X10.1 after restore) green.
- **heavy path**: with a stub shooter that only marks the existing base export as fresh → S7.3 green (base vs "before": within 0.5 %, control block detected), S3.1/S3.2 red ("summary.json missing"), S3.3/S3.4 red ("testIDs absent…", the routes do not exist on the base), no crash, residue 0.
- single-file `tsc --noEmit --strict` over the oracle (lib DOM + ES2023, bundler resolution): exit 0.

## 6. Open questions — all ruled on 8 Oct (OQ-1 ✅ · OQ-2 ✅ Views · OQ-3 → PNG assets · OQ-4 → mockup × 390/536 · OQ-5 noted · OQ-6 Plex only · OQ-7 ✅); original text kept
- **OQ-1 (override storage).** Brief: "override from AsyncStorage `shark_theme`". `@react-native-async-storage/async-storage` is not a dependency of `apps/mobile` and is not in `node_modules`; adding it is a native module ⇒ needs a build, which this run forbids. Contract written as: `expo-secure-store` on native (already used by `src/lib/session.ts` and `brand.tsx`), `localStorage` on web. Confirm.
- **OQ-2 (QuotaRing "SVG").** `react-native-svg` is not installed either (not in `apps/mobile/node_modules`, not in `/root/qc-shark-mobile/node_modules`). The oracle forbids new packages (S2.6), so the ring must be Views (two half-circles / border trick). If the controller wants real SVG, that is a dependency + build decision and an ORACLE-EDIT of `DEPS_TODAY`.
- **OQ-3 (Orb gradient).** No `expo-linear-gradient`; the mockup orb is three stacked radial gradients. JS-only options: RN 0.86 `experimental_backgroundImage` (works on web through react-native-web? unverified) or layered translucent circles. Parity of the orb will be approximate; D7 table should say so.
- **OQ-4 (mockup pixels ≠ app points).** The mockup phone screen is 536 CSS px wide (`.phone` 560 − 2×12), the app renders at 390 pt ⇒ factor 0.7276. "12 px between cards" (`.row{margin-top:12px}`), radius 26, padding 16/18 in the CSS are mockup px: at 390 pt they are ≈ 8.7 / 19 / 11.6–13. The brief freezes `cardGap: 12` and "inner padding ≥ 14, radius R.lg (16)", and the oracle checks exactly that — but a pixel-faithful render would need the scaled values. Decide which one wins before T2.x copies the tokens.
- **OQ-5 (later regressions of S7.1).** S7.1 asserts that chat/crm/member/sessions files import only `{C,R,S}` from `@/src/theme`. If a later WO legitimately restyles a 1.0 chat file with the new theme, this check needs an ORACLE-EDIT (COMMON §C13 says the 1.0 tree stays untouched, so it should not happen).
- **OQ-6 (fonts).** The mockups use Inter + IBM Plex Sans Thai; the app bundles IBM Plex Sans Thai only (`@expo-google-fonts/ibm-plex-sans-thai`). Latin text ("Sweet Studio") will render in Plex, not Inter. No new font can be added without touching `app/_layout.tsx`/`src/lib/fonts` (not owned). Accept in the D7 table or rule.
- **OQ-7 (`userInterfaceStyle: "light"`).** Until T5.4 sets `automatic`, `useColorScheme()` returns `light` on a device whatever the system says; dark is reachable only through the override. On the web export the media query drives it. The shooter therefore sets both (contract [4]).

## 7. Brief errors (with evidence)
1. **Paths `src/ui/text.tsx`, `src/ui/page.tsx`, `ui/orb.tsx`** (brief "Verified facts", RUN §2 "ใช้ `ui/text.tsx`") — real paths are `apps/mobile/src/components/ui/{text,page,orb}.tsx` (`ls apps/mobile/src` → `api components lib theme.ts`; there is no `src/ui`).
2. **"AsyncStorage `shark_theme`"** — package absent: `ls apps/mobile/node_modules/@react-native-async-storage` → no such directory; not in `package.json` dependencies (29 entries listed in the oracle as `DEPS_TODAY`). See OQ-1.
3. **"QuotaRing (SVG…)"** — `react-native-svg` absent from `apps/mobile/node_modules` and from the QC copy's modules. See OQ-2.
4. **"PrimaryButton (accent soft fill, dark text — mockup #e6e1ff/#3f3499 style for light)"** — neither colour exists in any generator or generated HTML (`grep -ci "e6e1ff\|3f3499"` over `gen_*.py` and the 10 generated `ai-team-airy-*.html` → 0 everywhere). The mockup's primary button is `.btn1{background:#16161c;color:#fff}` (dark: `#f2f2f7` on `#16161c`). The oracle anchors neither value; the builder needs a ruling on which is right.
5. **"guard with `__DEV__` or an env flag"** — `__DEV__` alone cannot work in the QC pipeline (production web export). See D-2.
6. **"the generators hard-code `/root/design/chat-glass` paths"** (COMMON line 3 / brief) — only `render_airy.sh` does (2 places); the `gen_*.py` files read and write relative paths (`open('gen_glass_airy.py')`, `open(f'ai-team-airy-{k}.html','w')`). They ran unmodified in a scratch copy.
7. **"Mockup: A8 … the CSS in `gen_glass_airy.py` + `gen_airy_dark.py`"** — the A8 page and the `.hero`, `.card`, `.stk`, `.hp` rules are in `gen_airy_full.py` (section "เพิ่มสำหรับชุดเต็ม"); `gen_glass_airy.py` only has the base + glass rules and its own 8 pages.
8. **"hours/tasks figures are fixture values"** (controller ruling) — A8 in the HTML shows no hours/tasks figure at all (title, subtitle "ยังไม่มีทีม AI · แพ็กฟรี", 3 orbs, hero text, 3 recommended rows, one button). The fixture's `today` block is zeros/`null` and is not asserted on screen.
9. **RUN §2 lists 11 components, the brief 15** — see D-7.
10. **shoot-crm.mjs does not shoot the sessions screen** (brief implies the existing pipeline can give the S7 before/after): its screens are the 5 CRM ones; `shoot-ipad.mjs` shoots `/sessions` but against a pre-served export on port 4700 and with `Date.now()`-relative mocks (not reproducible). Hence D-6.

## 8. What could not be verified
- S3.1–S3.4 green path: there is no implementation yet, so the shooter contract (summary.json merge, slugs, dark PNG luminance thresholds 110/150) and the probes of the gallery/A8 were exercised only in their red direction. If the Airy light background or a dense gallery lands outside "light > 150 / dark < 110" mean luminance, that is an ORACLE-EDIT, not a builder fault.
- The scratch reference components are trivial; the AST rules of S5.1/S5.2 were proven on four declaration styles (function + inline type, const arrow + interface extending `PressableProps` + rest spread, `memo(function …)` + alias + `const { … , ...rest } = props`, attribute `testID={testID}`). A `forwardRef`/HOC style outside these may need an ORACLE-EDIT.
- Whether `/team/_gallery` is reachable without touching `(app)/_layout.tsx`: expo-router 57 has no underscore-ignore rule (`getRoutesCore.js` ignore list = `+html`, `+native-intent`, `+api`, `+middleware`), so the file should become route `team/_gallery` inside the Drawer automatically — read from the source, not rendered.
- Whether react-native-web 0.21 renders RN's `experimental_backgroundImage` (OQ-3).
