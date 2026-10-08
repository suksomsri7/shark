# T0.5 — Draw the Login / Sign-up / OTP mockups in the Airy style (controller or Sonnet · design only · owner reviews)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A7, R-B (login row) first. Contract: AI-TEAM-RUN §2 T0.5. Owner order 8 Oct: the 36-page design lacks login and sign-up.

## Verified facts
- Today's `app/login.tsx` (372 lines, REVIEW §4.1): e-mail OTP in 2 steps + Apple / Google / LINE / Facebook (LINE/FB via web login code → `auth/exchange`). Error texts are Thai and inline (`InlineError` in `components/auth/ui.tsx`). Sign-up is the same OTP path with a new e-mail (verify in `src/app/api/mobile/auth/verify/route.ts` that an unknown e-mail creates the user — write the finding in the notes; if it does not, T2.13's scope includes the server change and must be re-planned).
- Generators: `ledger/design-ai-team/gen_airy_full.py` (CSS + helpers: `bar`, `stk`, `AO`, `HP`, `phone`, `PLUS`, `BACK` …), `gen_airy_d.py`/`gen_airy_e.py` show how to `exec` the helpers and add a set; `gen_airy_dark.py` converts a light set to dark; `render_airy.sh <set> [height]` renders with snap chromium (paths hard-coded to `/root/design/chat-glass` — copy the folder to a scratch dir under `/root/` or adjust the two paths; never write into `/root/design/chat-glass`).
- Fonts Inter + IBM Plex Sans Thai installed on the VPS; screenshots must be saved under `/root/` (snap chromium cannot see `/tmp`).

## Deliverables
- `ledger/design-ai-team/gen_airy_f.py` producing `ai-team-airy-f.html` with 3 phones:
  - **F1 เข้าสู่ระบบ**: SHARK orb/logo · title "เข้าสู่ระบบ" · e-mail field · primary "ส่งรหัสเข้าอีเมล" · divider "หรือ" · buttons Apple · Google · LINE · Facebook (same order as today) · footer "ยังไม่มีบัญชี · สมัครใช้ฟรี".
  - **F2 สมัครใช้ครั้งแรก**: title "สมัครใช้ฟรี" · one-line value copy (no task counts — R-A5) · e-mail field · primary "ส่งรหัสเข้าอีเมล" · social buttons · footer "มีบัญชีแล้ว · เข้าสู่ระบบ" · tiny legal line (terms/privacy links as today).
  - **F3 ใส่รหัส**: "ใส่รหัส 6 หลักที่ส่งไป <email>" · 6 boxes · "ส่งรหัสอีกครั้ง (59)" · inline error example "รหัสไม่ถูกต้องหรือหมดอายุ" (second phone state or inline note) · back.
- Dark versions via `gen_airy_dark.py` (extend its set list with `f`).
- `airy-f.jpg`, `airy-dark-f.jpg` in `ledger/design-ai-team/` + README table row.
- Telegram: 2 images + one line "แบบ login/sign-up ตามสไตล์ Airy · ตอบ 'ใช้ได้' หรือบอกจุดแก้" → record the answer in `AI-TEAM-OWNER-QUESTIONS.md` (new row Q6). Silence 24 h ⇒ proceed with the drawn version (R-B).

## Acceptance
Controller crops every phone: nothing overflows, card padding present, social buttons match today's set, no forbidden words. Owner's answer (or the 24 h default) recorded before T2.13 starts.
