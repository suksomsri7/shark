# T6.4 — Prepare the 2.0.0 build (controller · nothing is built)
Read `ai-brief-COMMON.md` (A8: no eas build/update/submit) + MASTER-PLAN §10 first. Contract: AI-TEAM-RUN §2 T6.4. Owner items O6/O7.

## Verified facts
- `apps/mobile/app.json`: version 1.0.0, iOS buildNumber 24, Android versionCode 1, `runtimeVersion.policy: "appVersion"` (REVIEW §4.3) ⇒ 2.0.0 is a new runtime; OTA from 1.0.0 cannot deliver v2 (memory reference_ota_runtime_must_match_build). `userInterfaceStyle` becomes `automatic` (T5.4).
- Build/submit steps and credentials references live in `apps/mobile/SUBMIT-STEPS.md` / `PLAY-STEPS.md` (never print secrets). EAS token memory `reference_expo_token_shark`.
- 1.0.0 build #24 is still awaiting the owner's test/submission (DESIGN §7.7) — O7.

## Deliverables
- Staged diff (not committed to main; on `session/ai-team`): `app.json` version `2.0.0`, iOS `buildNumber` 25 (or next after whatever #24 became), Android `versionCode` 2, `userInterfaceStyle: "automatic"`; `expo-glass-effect` not added (JS glass).
- `apps/mobile/SUBMIT-STEPS.md` section "2.0.0": exact `eas build --profile production --platform all` and `eas submit` commands, pre-flight (`tools/preflight_version.py` equivalent for shark if present), what to test on TestFlight (checklist = the 36 screens + pilot tenant), rollback (`uiVersion` 1).
- Release notes th/en.
- Evidence pack index `ledger/AI-TEAM-EVIDENCE.md` listing every path of MASTER-PLAN §10 with hashes.
- Memory + Telegram: "พร้อมให้ตรวจรับ RUN AI TEAM" with the pack path. Then **stop**.

## Acceptance
`eas build:list`/`eas update:list` show no new entries from this run (controller pastes the command output); staged files reviewed; evidence index complete; MASTER-PLAN §12 all ✅/⏸ with hashes.
