# T2.13 — Login + Sign-up + OTP screens on the Airy theme (Opus · app lane · after the owner's OK on T0.5)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A7, R-B (login row) first. Contract: AI-TEAM-RUN §2 T2.13. Mockups `airy-f.jpg` F1–F3 (+ dark) from T0.5; the owner's remarks in OWNER-QUESTIONS Q6 are binding.

## Verified facts
- `app/login.tsx` (372 lines): e-mail OTP 2-step state machine, Apple (`expo-apple-authentication`?) and Google (`GoogleSignin.configure` — wrapped in try/catch in the QC copy), LINE/Facebook through a web login code → `POST /api/mobile/auth/exchange`; errors via `InlineError`; `signIn(token, user)` from `useAuth()`; after sign-in `Gate` (`app/_layout.tsx`) routes to `/dna` when the user has no tenant.
- Routes (REVIEW §3): `auth/otp {email}`, `auth/verify {email, code} → {token, expiresAt, user}` (401 `{error}`), `auth/google {idToken}`, `auth/apple {identityToken, name?}`, `auth/exchange {code}`.
- `qc-mobile-auth.mts` is the regression (header = contract of the auth flow); it must stay byte-identical in results.
- There is no `uiVersion` before login ⇒ the new screens replace the old for every 2.0.0 user (R-B).

## Deliverables
- `app/login.tsx` rebuilt with the T0.3 components (`GlassCard`, `PrimaryButton`, `SearchField`-style input, `Orb`): same state machine and the same API calls, same error strings (move them to `src/i18n/team.ts` under `auth.*` keeping the Thai text byte-identical where oracles assert on it — check `qc-mobile-auth` expectations before renaming anything).
- `app/signup.tsx`: same component with `mode="signup"` (copy "สมัครใช้ฟรี", value line, legal line); OTP with a new e-mail → `auth/verify` → `signIn` → `Gate` → `/dna` (D2 of T2.12 replaces `/dna`'s first step only if T2.12 wired it; otherwise `/dna` as today).
- `app/auth/otp.tsx` (F3): 6-box code input (auto-advance, paste), resend countdown (60 s, calls `auth/otp` again), inline error for 401, back to e-mail.
- D1 (T2.12) buttons: "เริ่มใช้ฟรี" → `/signup`, "มีบัญชีแล้ว · เข้าสู่ระบบ" → `/login`.
- Social buttons: unchanged providers; hide a provider only if its config is absent at runtime (today's behaviour).
- testIDs `auth-email`, `auth-send`, `auth-apple`, `auth-google`, `auth-line`, `auth-facebook`, `auth-to-signup`, `auth-to-login`, `otp-box-<i>`, `otp-resend`, `otp-error`, `otp-back`; inventory rows; fixtures `t2.13.json` (otp ok / otp 401 / exchange).

## Files you own
`app/login.tsx`, `app/signup.tsx`, `app/auth/otp.tsx`, `src/components/team/AuthForm.tsx`, hunk in `app/onboarding/index.tsx` (D1 links), fixtures, inventory, i18n `auth.*`.

## Acceptance (oracle `qc-ai-t2.13`)
S1 pairs F1/F2/F3 light/dark · S2 every sign-in path calls the same endpoint with the same body as before (intercept table) · S3 sign-up new e-mail → verify → `/dna` (fixture `user.tenants = []`); existing e-mail → normal login · S4 OTP 401 inline · S5 testIDs/i18n · typecheck · residue. Regression `qc-mobile-auth` (identical), T2.12 shots.

## Controller rulings
- No new auth provider, no password field (the product has no passwords).
- If `auth/verify` does not create unknown users (T0.5 finding), stop and report — the server change is a separate small WO the controller writes (`T2.13s`), never done ad hoc by the builder.
