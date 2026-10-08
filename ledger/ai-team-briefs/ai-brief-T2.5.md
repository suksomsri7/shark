# T2.5 — New task screen A4 (Sonnet allowed · app lane)
Read `ai-brief-COMMON.md` + RESOLUTIONS R-A11 first. Contract: AI-TEAM-RUN §2 T2.5. Mockup `airy-a.jpg` page 4 (+ dark). HTML: header "งานใหม่ · คุณเอก · The Bean Café" + avatar stack · greeting "ให้ผมช่วยอะไรดีครับ" + "คุณเอกเข้าถึง CRM · ใบเสนอราคา · บอร์ดงาน · แชทลูกค้า" · section "งานที่คุณเอกทำบ่อย" with 4 rows (emoji · title · hint) · row "🔁 ทำเป็นงานประจำ" · composer "พิมพ์หรือพูดสั่งงาน…" with plain "+" icon (no circle) and mic.

## Data
`GET employees/[id]` (persona.gender → particle; `accessSummary` → system labels; `frequentTasks[]` with `prompt`) · `POST employees/[id]/tasks { title?, firstMessage, idempotencyKey }` → `{ taskId, conversationId }`.

## Deliverables
`app/(app)/tasks/new.tsx` (`?employee=`): greeting from i18n with particle (`team.greeting.male/female/none`) · access line built from `accessGroupsForUi` labels · `FrequentTaskRow` → fills composer with `prompt` (Thai display text, English prompt sent? **No** — the user sees and sends the Thai `hintTh`/`titleTh` text; the server maps nothing; keep it simple: composer gets `titleTh`) · "ทำเป็นงานประจำ" → `/schedules/new?employee=` · composer: send button disabled while posting; mic = existing recorder if the app has one (grep `expo-av|Audio`), else hidden + note; "+" = attachment picker reused from `chat/[id].tsx` (image ≤ 2 MB) · on success `router.replace('/tasks/[id]')` passing the first message so A5 shows it immediately · testIDs `newtask-greeting`, `newtask-freq-<i>`, `newtask-recurring`, `newtask-input`, `newtask-send`, `newtask-attach`, `newtask-mic`.

## Acceptance (oracle `qc-ai-t2.5`)
S1 pair · S2 particle · S3 frequent row fills input · S4 send → 1 POST + navigate · S5 double-tap → 1 task (disabled state + idempotencyKey) · S6 testIDs/i18n · typecheck · residue.
