# T0.4 — Free-pack size + every quota string (Sonnet allowed · after T0.1)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A2/R-A5/R-A8/R-C3 first. Contract: AI-TEAM-RUN §2 T0.4. Input: `ledger/AI-TEAM-COST-2026-10.md` (T0.1).

## Verified facts
- Web i18n: `src/messages/{th,en}/common.json` + `src/lib/i18n/{dict,index}.ts` (REVIEW §4.5) — check how additional namespaces are registered (CRM added `crm.*`; POS adds `pos.json`): follow the same registration, file `src/messages/{th,en}/ai-team.json`.
- The app has **no i18n** today (Thai literals in screens). Create `apps/mobile/src/i18n/team.ts` exporting `t(key, params?)` over a `{th, en}` dictionary with a module-level locale (`th` default); no `Intl` (Hermes).
- Top-up packs today: `topup.ts#topUpPacks()` `:25` (THB per USD `thbPerUsd()` `:18`) — read for the THB↔USD rate only; do not reuse for subscription packs.
- Wallet welcome grant default `$10` via `welcomeGrantMicro()` `credit.ts:22` — the flag added here is consumed by T3.6.

## Deliverables
1. `src/lib/ai/team/packs.ts` (pure, no env/prisma import — fitness F10 loads `src/lib/ai/*` registries without env; keep it importable the same way):
   - `AI_TEAM_SALES_ENABLED = false`, `AI_WELCOME_GRANT = false`, `AI_TEAM_PROMPT_DEFAULT_EMPLOYEE = false` (read-only constants; T6.1/T3.5 flip them).
   - `PACKS: Pack[]` — `{ key: "FREE"|"STARTER"|"PRO"|"BUSINESS", priceThb: 0|490|1490|3990, allowanceMicro, maxScheduled, maxApprovers, historyDays, approxTasks: number|null, enabled: boolean }`; FREE enabled only; `allowanceMicro` values and `approxTasks` come from AI-TEAM-COST (cite the table line in a comment; if T0.1 is not merged, `approxTasks = null` and `allowanceMicro` provisional with a `// PROVISIONAL` comment that F16 reports).
   - `FREE_PACK` = the FREE entry; `packByKey`.
   - Quota state thresholds `WARN_PCTS = [80, 95]`, `DEGRADE_PCT = 95`.
2. Strings (th + en, same keys) for: quota ok / warn80 / warn95 / exhausted (team paused until <date>) / employee paused (cap) / cycle reset / pack disabled "เร็ว ๆ นี้" / notify-me-on-sale / top-up closed / free pack line for A2/C1 ("แพ็กฟรี · โควตาใช้ร่วมกันทุกกิจการ") / D1 hero copy **without any task number** / refusal codes of COMMON §C2 → user messages (Thai, non-blaming). Keys `team.quota.*`, `team.pack.*`, `team.refusal.*`, `team.onboarding.*`.
3. Owner proposal text (controller sends at CP0): trial FREE allowance + 2 alternatives, with the cost table lines.

## Files you own
`src/lib/ai/team/packs.ts` · `src/messages/{th,en}/ai-team.json` (+ registration hunk in `src/lib/i18n/dict.ts` if namespaces are enumerated) · `apps/mobile/src/i18n/team.ts`.

## Acceptance (oracle `qc-ai-t0.4`, mostly static)
S1 4 packs, FREE only enabled, prices exact · S2 approxTasks null or cited · S3 F16.1 clean (no token/โทเคน/บาทต่องาน/ค่าแรง/wage) · S4 th/en key parity · S5 FREE allowance > 0, maxScheduled ≥ 1, maxApprovers ≥ 1.

## Controller rulings
- Numbers shown to users: percent and dates only (R-A8). The mockup's "50 งาน/เดือน" is **not** copied anywhere (R-A5).
- `historyDays`: FREE 30, STARTER 30, PRO 90, BUSINESS 365 (mockup C2) — informational until T4.3 reads it.
