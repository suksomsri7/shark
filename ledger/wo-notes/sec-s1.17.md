# WO S1.17 + S1.23 — Support Desk ต่อแอป · แจ้งเตือน (prefs · badge · กันสแปม · แชทลูกค้าตาม pref) — ชุด S1-12

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-d` branch `wip/sec-s1.17` (ฐาน 31ac2f7e) · 2026-11-04 · builder: ตัวแทนเลน d
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.17.md` (+ COMMON + RESOLUTIONS R-K12 R-K20 §B.7 §J)
> แบบ H1–H4 + K4 · docs `docs/modules/31-secretary.md` §5.5 (ข้อ 6) §5.20 §5.21 §5.25 §5.25a
> ข้อสอบ: `scripts/qc-sec-s1.17.mts` (10 ข้อ · commit test: 4d4a2cd0 · **แก้หลัง commit: ไม่**)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | ไฟล์ร่วม (COMMON §D)? |
|---|---|---|---|
| `src/lib/ai/secretary/notify.ts` | ใหม่ | `NOTIFY_KINDS/MODES` · `resolveNotifyPrefs` (pure) · `getNotifyPrefs` · `setNotifyPref` · `notifyModesFor` · `badgeTotalFor` · `notifyUser` (pref → กันสแปม 60 วิ → badge → `sendPushToUser` ไม่กรองร้าน) | ไม่ |
| `src/lib/support/service.ts` | แก้ (เพิ่มเท่านั้น) | `CASE_CATEGORIES` · `openCaseFromApp` · `listCasesForUser` · `unreadCaseTotalForUser` · `setResolvedByShop` (+ helper `visibleRoomFor` `caseScope` `unreadByCaseOf`) · ฟังก์ชันเดิมไม่แตะ | ไม่ |
| `src/lib/platform/support.ts` | แก้ | `listAllCases` ตัวกรอง source/category/assigneePlatformUserId · `assignCase(pu, caseId)` (+ audit `support.assign`) · `addPlatformMessage(…, deps?)` เคส APP ไม่แทรกห้อง AI + `notifyUser(…, "help")` · เคสอื่นเดิม (+ส่ง `post` ต่อ) | ใช่ (§D) — ชื่ออยู่ในใบ |
| `src/lib/core/push.ts` | แก้ 2 hunk | (1) `PushMsg.badge?` → payload `badge` เฉพาะเมื่อใส่ + `deliverBatch` อ่านผล transport แบบ array/`{tickets}`/`{data}` + ชนิด `post` คืน `Promise<unknown>` (2) `sendPushToChatStaff(args, deps?)` — `post` ฉีดได้ · กรองผู้รับด้วยค่าตั้ง inbox · `data.link = /inbox/<id>` | ใช่ (§D) — ชื่ออยู่ในใบ |
| `src/lib/ai/secretary/worker.ts` | แก้ hunk push | `pushRoom` ส่งผ่าน `notifyUser(uid, tenantId, "room", msg, { post })` | ไม่ |
| `docs/modules/31-secretary.md` | แก้ | §5.5 ข้อ 6 · §5.20 · §5.21 · §5.25 · §5.25a ใหม่ · อ้างอิงแถว 11/R-K12 · ตาราง event `ai.room.member_added` ⏳ | — |

## 2. migration / seed / backfill
- ไม่มี (ตาราง `AiNotifyPref` + `SupportCase.{source,category,roomId}` มีแล้วจาก S1.1) · ไม่ได้รัน `prisma generate` · ไม่แตะ `prisma/`

## 3. ด่าน
- D1 ✅ oracle 4d4a2cd0 (ผู้คุม) · D2 ✅ forced ×2 + unforced 10/10 (§5) · D4 ✅ regression = baseline · D5 ✅ typecheck 0 ในไฟล์ที่แตะ · fitness ×2 53/53 · D10 ✅ docs §5.5/§5.20/§5.21/§5.25/§5.25a · D6–D8 N-A (ไม่มี route/UI)

## 4. กลุ่ม X
| กลุ่ม | เกี่ยว? | check / เหตุผล |
|---|---|---|
| X1 ขอบเขต | ใช้ | H-1 (ห้องที่มองไม่เห็น ⇒ roomId null) · H-2 (ผู้แจ้งเห็นของตัวเอง/OWNER ทั้งร้าน) · H-3 (push เฉพาะผู้แจ้ง) · H-4 (setResolvedByShop คนอื่น false) · N-3 (badge ไม่รวมห้องที่ไม่ได้อยู่) |
| X2 ตัวตน/มอบอำนาจ | N-A | ไม่มี execute/ข้อเสนอ |
| X3 ยิงพร้อมกัน | บางส่วน | caseNo = `createCase` เดิม (race-safe) · `setNotifyPref` P2002 ⇒ update · กันสแปมจองก่อนส่ง |
| X4 ส่งซ้ำ | ใช้ | N-2 (link เดิม 60 วิ ⇒ spam) · ไม่มี event ใหม่ |
| X5 งานตามเวลา | ใช้ | `notifyUser` `now` ฉีดได้ (N-2 +30 วิ/+61 วิ) |
| X6 ข้อมูลเข้าอันตราย | ใช้ | หมวดไม่รู้จัก ⇒ other (H-1) · ชนิด/โหมดผิด ⇒ throw ไทย (N-1) · ไฟล์แนบผ่าน `cleanAttachments` เดิม |
| X7 endpoint มือถือ | N-A | ไม่มี route ในใบนี้ (S1.14/S2.15) |
| X8 PDPA | ใช้ | feedback ผ่าน `recordFeedback` (anonymize เบอร์ใน body ของ H-1) · push body ≤ 80 ถึงผู้แจ้งคนเดียว (เดิมเคส AI ยิงผู้สร้างห้อง/OWNER) |
| X9 การกระทำอันตราย | บางส่วน | `assignCase` เขียน `PlatformAuditLog support.assign` |
| X10 ความลับ | N-A | ไม่มีคีย์/ตัวเลขต้นทุน |
| X11 ต้นทุน/โควตา | N-A | ไม่มีทางเรียกโมเดลใหม่ |

## 5. ผลข้อสอบ (4 พ.ย. ~15:3x–15:5xZ · ทิปเลน + การแก้ที่ยังไม่ commit = commit ของใบนี้)
- `qc-sec-s1.17` forced #1: `JSON_SUMMARY {"total":10,"passed":10,"failed":[],"skipped":[],"findings":[]}` · forced #2 (15:44Z): เหมือนกัน · unforced (15:50Z): เหมือนกัน (notify.ts มีแล้ว ⇒ ไม่ SKIP) · residue: finally ลบครบ
- ข้อสอบใบก่อน (forced): `qc-sec-s1.4` 28/28 · `qc-sec-s1.5` 16/16 · `qc-sec-s1.6` 16/16 · `qc-sec-s1.9` 10/10
- ชุดเดิม (unforced) — ก่อนแก้ (รันบน 31ac2f7e สะอาด 15:27Z) = หลังแก้ (15:51Z): `qc-support` 12/12 · `qc-support-ai` 7/7 · `qc-help-v2` 8/8 · `qc-mobile-help` 15/15 · `qc-mobile-chat` 29/29 · `qc-backoffice` 14/14 · `qc-push` 7/7 · `qc-chat-push-badge` 48/48 · `qc-chat-notify` 23 · `qc-chat-notify-v2` 30/30 (ตรงกับ `sec-baseline-85751098.txt` สำหรับชุดที่มีในไฟล์)
- คำสั่ง: `bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env [QC_FORCE=1] SHARK_AI_MOCK=1 pnpm exec tsx scripts/<suite>.mts`
- typecheck: ครั้งที่ 1 `NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M` = heap OOM (exit 134 · ไม่มีผล) · ครั้งที่ 2 `8192/9500M` (ค่าเดียวกับ S1.5/S1.6) = 11 errors ทั้งหมดในข้อสอบของใบที่ยังไม่ build (`qc-sec-s1.10` 2 · `s1.13` 1 · `s1.21` 5 · `s1.7` 3) · ไฟล์ที่ใบนี้แตะ 0 · error เดิมของ `qc-sec-s1.17.mts` หายแล้ว
- `pnpm fitness` (env QC) `{"total":53,"passed":53}` exit 0 · `env -u DATABASE_URL -u DIRECT_URL` `{"total":53,"passed":53}` exit 0

## 7. มติทางเทคนิค
- **transport ที่ฉีด**: oracle (และ S1.5) ฉีด `post` ที่คืน `{ ok, tickets }` ไม่ใช่ array ⇒ `deliverBatch` เดิมนับ sent 0 (N-2/N-4 ต้องการ sent 1) — แก้ใน hunk เดียวกับ badge: อ่าน array / `{tickets}` / `{data}` · `expoPost` จริงคืน array เหมือนเดิม · ชนิด `PushDeps.post` คืน `Promise<unknown>` (ผู้เรียกเดิมที่คืน `unknown[]` ยังเข้ากันได้)
- **badge ใน payload เฉพาะเมื่อผู้เรียกใส่** ⇒ payload ของผู้เรียกเดิมทุกไบต์
- **ASSIGNED ของชนิดที่ไม่ใช่ inbox** = ALL (ใบระบุ ASSIGNED เฉพาะ inbox · `setNotifyPref` รับทุกคู่ตามใบ)
- **กันสแปม** นับจากครั้งที่ส่งจริง (ไม่เลื่อนหน้าต่างตอนถูกกัน — ไม่งั้น +61 วิ ของ N-2 จะโดนกัน) · ระยะห่างใช้ `Math.abs` (นาฬิกาฉีดถอยหลังก็ยังกัน) · Map ต่อโปรเซส เพดาน 5,000 คีย์
- **worker ไม่ส่ง `now` เข้า `notifyUser`** — กันสแปมเป็นเรื่องนาฬิกาจริง (`now` ของ worker ใช้กับ lease)
- **ผลข้างเคียงตั้งใจ**: งานในห้องเดียวกันเสร็จถี่ใน 60 วิ ⇒ push ห้องนั้นถึงคนเดิมครั้งเดียว (S1.5 P-1 ยังผ่าน — ดูครั้งแรก)
- **อ่านค่าตั้งไม่ได้** ⇒ ปริยาย ALL / ไม่กรองแชท (แจ้งเตือนห้ามหายเงียบ) + log
- **`addPlatformMessage` เคส APP** ตรวจว่าผู้แจ้งยังเป็นสมาชิกที่รับแล้วก่อนส่ง (สอดคล้องทางเดิมของเคส AI)
- **`setNotifyPref` ไม่ใช้ upsert**: `@@unique([userId, tenantId, kind])` มีคอลัมน์ null — Postgres ถือ NULL ต่างกัน ⇒ แถวทุกร้านซ้ำได้ถ้าเขียนพร้อมกัน · `resolveNotifyPrefs` เลือก updatedAt ใหม่สุด
- ทางเรียกโมเดลใหม่: ไม่มี
- ใครได้/เสียสิทธิ์: ผู้แจ้งจากแอปเห็นเฉพาะเรื่องของตัวเอง (OWNER ทั้งร้าน) · push ของทีมงานสำหรับเคส APP ถึงผู้แจ้งคนเดียว · ผู้ใช้ปิดแจ้งเตือนแชทลูกค้า/ห้องเลขา/ช่วยเหลือได้เอง (ไม่กระทบสิทธิ์อ่าน) · ทีมงานแพลตฟอร์มทุกบทบาทที่เข้าหน้า support ได้กด "รับเรื่อง" ได้ (ไม่มีด่านบทบาทเพิ่ม — เหมือน `addPlatformMessage`)

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| งานประจำ `channels: ["room"]` ยังได้ push (โน้ต S1.9) | pref model เป็นต่อผู้ใช้ ไม่ใช่ต่องาน · ห้องที่งานประจำเปิดไม่มีร่องรอย task/channels (`startRoom` ไม่เก็บ) · แก้ต้องแตะ `scheduled.ts` (นอกใบ) — เช่นส่ง `context: { channels }` ตอน `startRoom` แล้ว `pushRoom` ข้ามเมื่อไม่มี "push" | ผู้คุมเลือก (S1.9 ใบย่อย / S1.14) |
| push ผู้ถูกเพิ่มเข้าห้อง (`ai.room.member_added` · RESOLUTIONS §J) | ไม่มี event ใน `addMember` (members.ts + outbox-consumers/labels นอกใบ) · `notifyUser(..., "room")` พร้อมใช้ | ผู้คุมเลือก |
| kind `approval` ยังไม่มีผู้เรียก | ข้อเสนอรออนุมัติยังไม่ push ในรุ่นนี้ | S1.14 / S2.6 |
| badge ใน `sendPushToChatStaff` | ข้อความเดียวหลายผู้รับ — badge ต่อคนต้องแยก payload | S2.6 |
| route มือถือ prefs/help (`GET/PUT …/notify-prefs` · `…/help/*`) | ใบนี้เป็นชั้น service | S1.14 / S2.15 |
| `support_open_case` ในห้องเลขาส่ง `aiActorUserId(actor)` แทน `"ai-assistant"` (R-K12) | ไม่อยู่ในรายการไฟล์ของใบ (tools.ts) | ผู้คุมเลือก |
| กันสแปมต่อโปรเซส (serverless หลาย instance = ซ้ำได้) | ตามใบ (Map ในหน่วยความจำ) | — (ยอมรับ) |

## 9. คืนสภาพฐาน QC
- ข้อสอบ `finally` ลบ tenant `qc-sec-s117-*` + ตารางลูก · `aiNotifyPref` ของ `qcs117-*` · pushDevice `ExponentPushToken[qcs117-*` · platformUser · user `qcs117-*` · ไม่ได้รัน seed
