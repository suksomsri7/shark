# S1-18 — S1.14 API ชุดเดียวเว็บ+แอป `src/app/api/mobile/secretary/**` + server actions + เส้นทางจริง 3 เส้นด้วยโมเดลจริง (ปิด S1) (Opus · `wip/sec-s1.14` · หลังทุกใบ S1 merge · **ด่านเต็ม**: ทุกชุด + `qc:all` + build (iso) + ผู้ตรวจ 2 คน — ความปลอดภัย/DTO · สัญญา)

Read `sec-brief-COMMON.md`, `sec-brief-RESOLUTIONS.md` ทั้งไฟล์ (โดยเฉพาะ §E ข้อ 6 quota GET อ่านอย่างเดียว · §K "undoAction(now) ห้ามรับจากไคลเอนต์" · §H), plan row S1.14, รีวิว X7/X10/Q10, `docs/api/SECRETARY-API.md` (S0.3 ร่าง 74 แถว — **แก้ให้ตรงของจริงทุกแถว**), `docs/modules/31-secretary.md` §5 (ชื่อฟังก์ชันจริงของทุกใบ), oracle `scripts/qc-sec-s1.14.mts`, และ pattern route เดิม `src/app/api/mobile/proposals/confirm/route.ts` (`requireMobile` → `g.ctx/g.membership/g.user` · `mobileError` · `mobileDenied(g, q)` guard.ts:10 · `mobileAiCtx(g)` :31) · `checkRateLimitDb` core/rate-limit-db.ts:38 · server actions pattern `src/lib/ai/actions.ts` (`"use server"` · `requireTenant` · `assertAiCan`).

## กติกาเส้นทาง (ทุกเส้น)
- Bearer ผ่าน `requireMobile` (มี `x-tenant-id` ยกเว้นเส้น "ไม่ต้องมีร้าน": `inbox`, `me/phone`, `tenants/create`, `invites/accept`, `support/*`) · session เว็บใช้ server action ที่เรียก lib ตัวเดียวกัน (ห้ามคัดลอก logic)
- rate-limit `checkRateLimitDb` ทุกเส้นเขียน (key `sec:<route>:<userId>` · 30/นาที · ส่งข้อความห้อง 10/นาที · SMS ตาม S1.19) → 429 `{ error: "rate_limited", retryAfterSec }`
- DTO ห้ามมี token/คีย์/codeHash/accessToken/secret/เบอร์เต็มของคนอื่น (X10 · oracle grep ทั้ง body) · เวลาเป็น ISO · เงินเป็นสตางค์ (int)
- error shape เดิม `{ error: "<code>", message?: string }` · 400 bad_json/… · 403 forbidden · 404 not_found · 409 conflict · 503 sms_unavailable
- ห้ามรับ `now`/`userId`/`tenantId` จาก body (ใช้จาก gate) · id ทุกตัว validate string ≤ 80
- RSC server actions: ไฟล์ `src/lib/ai/secretary/actions.ts` (`"use server"` · export เฉพาะ async function · ห้าม export type — reference_next_use_server_no_type_export) ชื่อ `sec<Verb><Entity>Action`

## เส้นทาง (ตรงกับ lib ของใบที่ merge แล้ว — ตรวจชื่อจริงใน docs §5 ก่อนเขียน)
| กลุ่ม | เส้น | lib |
|---|---|---|
| secretary | `GET/PUT secretary` | S1.2 `getSecretary/updateSecretary` |
| rooms | `GET rooms?status&take` · `POST rooms` {instruction, systems?, context?} · `GET rooms/[id]` · `GET rooms/[id]/messages?before&take` · `POST rooms/[id]/send` {text, clientMessageId} · `POST rooms/[id]/close` · `PUT rooms/[id]/title` | S1.4/S1.5 `startRoom listRooms getRoom closeRoom renameRoom` · `sendRoomMessage` (worker) · `visibleMessagesWhere` |
| members | `GET rooms/[id]/members` · `POST rooms/[id]/members` {userId, seeHistory} · `DELETE rooms/[id]/members/[userId]` | S1.6 |
| proposals | `GET rooms/[id]/proposals` · `POST proposals/[id]/approve` {confirm2x?} · `POST proposals/[id]/reject` {note?, remember?} · `POST proposals/[id]/edit` {patch} · `POST plans/[id]/approve` · `POST plans/[id]/reject` | S1.7 executeProposal (approvalGate ภายใน) · S1.10 rejectWithNote/editProposal · S1.3b |
| log/undo | `GET log?module&day&roomId&take` · `POST log/[id]/undo` | S1.8 listLog/undoAction (ไม่ส่ง now) |
| access/rules | `GET/PUT access` {module, level} (OWNER) · `GET/PUT rules` {key, enabled, limitSatang} (OWNER) | S1.3 · S1.7 setRule |
| scheduled | `GET scheduled` · `POST scheduled` · `PUT scheduled/[id]` {active, hourBkk, frequency, days, channels} · `DELETE scheduled/[id]` (เจ้าของงานหรือ OWNER) | S1.9 |
| home | `GET suggestions` · `GET frequent` · `GET inbox?tenantId&kind` (ทุกร้าน · ไม่ต้องมี x-tenant-id) · `GET inbox/count` | S1.11 |
| quota | `GET quota` → `{ jobs: {used, limit, left, resetAt}, credit: {balanceMicro|null}, pack }` **อ่านอย่างเดียว ห้าม ensureWallet/GRANT** | S1.13 quotaStatus |
| me | `GET me/phone` · `POST me/phone/request` · `POST me/phone/verify` (ถ้า S1.19 ยังไม่มี route ให้ใช้ของ S1.19 — ห้ามซ้ำ) · `POST account/delete` {confirm: "ลบบัญชี"} → `previewAccountDeletion/deleteAccount` + revoke token ทุกตัว (Q10) · `GET account/delete/preview` | S1.19 · platform/account-deletion.ts |
| lessons/memory | `GET lessons?status` · `POST lessons/[id]/confirm` · `DELETE lessons/[id]` · `GET memories/pending` · `POST memories/[id]/confirm` · `DELETE memories/[id]` | S1.15/S1.10 |
| digest | `GET digest` | S1.16 computeDigest (ไม่ใช่ block) |
| support | `GET support/cases` · `POST support/cases` {subject, body, category, roomId?, attachments?} · `GET support/cases/[id]` · `POST support/cases/[id]/reply` · `POST support/cases/[id]/resolve` · `POST support/upload` (ภาพ ≤ 5MB · ใช้ที่เก็บเดิมของ support) | S1.17 |
| notify | `GET/PUT notify` {kind, mode, tenantId?} · `GET badge` | S1.23 |
| tenants/staff | `POST tenants/create` {name, type, systems} · `GET staff` · `POST staff/invite` · `GET staff/invites` · `POST staff/invites/[id]/resend` · `DELETE staff/invites/[id]` · `PUT staff/[membershipId]` {role, unitIds, levels, chat, extraPermissions} · `POST staff/[membershipId]/suspend` · `POST staff/[membershipId]/remove` · `POST invites/accept` {code} · `GET invites/[code]` (สาธารณะ · previewInvite) | S1.25 |
| after-hours | `GET/PUT after-hours` (OWNER) | S1.22 |

## เส้นทางจริง 3 เส้น (R-K16 · ผู้คุมรัน · ใบนี้เตรียมสคริปต์)
`scripts/sec-real-path.mts` (ต้อง `AI_PROVIDER=anthropic` + `SHARK_ANTHROPIC_KEY` ของเจ้าของ · ห้ามใช้คีย์โปรเจกต์อื่น · รันบน QC branch เท่านั้น): ร้านทดสอบ 1 ร้าน (POS+account+CRM+booking+chat WEBCHAT) · เส้น 1 "ออกใบเสนอราคาให้ลูกค้า A 3 รายการแล้วส่งไปทาง LINE" → ข้อเสนอ account.documents.create + chat.send · เส้น 2 "ลูกค้าที่เงียบไป 30 วันมีใคร ช่วยร่างข้อความตามและสร้างการ์ดติดตาม" → kanban.cards.create · เส้น 3 "คืนมัดจำนัดหมายของลูกค้า B" → booking refund kind · ทุกเส้นอนุมัติโดย OWNER ผ่าน executeProposal · พิมพ์ต้นทุนต่อห้อง (จาก `AiUsage` costMicro) เทียบ 3.58 บาท/ห้อง · เกิน +30% ⇒ `JSON_SUMMARY` ติดธง `costOver` (ผู้คุมถามเจ้าของ) · ไม่มี assert ว่าโมเดลเลือก kind ถูกทุกครั้ง (ไม่ใช่ oracle · เป็นรายงาน) · ลบข้อมูลทดสอบใน finally
## Files you own
`src/app/api/mobile/secretary/**` · `src/lib/ai/secretary/actions.ts` · `docs/api/SECRETARY-API.md` · `scripts/sec-real-path.mts` · `ledger/wo-notes/sec-s1.14.md` · ห้ามแก้ lib ของใบอื่น (พบบั๊ก ⇒ รายงานผู้คุม)
## Acceptance = `scripts/qc-sec-s1.14.mts` PASS (ทุกเส้นเรียก handler ตรง — ไม่ต้องรัน next dev · ตรวจ 401/403/404/429/DTO grep) + **ทุกชุดใน `ledger/qc-baseline/sec-baseline-*.txt` เท่าเดิม** + `pnpm qc:all` ผ่าน iso + `next build` ผ่าน iso (heap 10240 · ISO_MEM 13500M) · typecheck 0 · fitness ×2
