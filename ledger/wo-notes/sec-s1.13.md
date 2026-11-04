# WO S1.13 — โควตา 100 งาน/เดือน · `canRunAi` ด่านเดียวใน credit.ts · `quotaStatus`

> RUN "เลขา AI" (SECRETARY) · tree ผู้คุมงาน `/root/projects/shark-sec` · branch `session/secretary` · เลน `shark-sec-b` branch `wip/sec-s1.13` (ฐาน 31ac2f7e) · 2026-11-04 ~16Z · builder: Opus
> สัญญา: `ledger/secretary-briefs/sec-brief-S1.13.md` + COMMON + RESOLUTIONS R-K6 R-K7 §B.6 §E.4 · แบบ DESIGN §0 มติ 7.1–7.4 · docs §8
> ข้อสอบ: `scripts/qc-sec-s1.13.mts` (12 ข้อ · **builder ไม่ได้แก้**)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร | COMMON §D? |
|---|---|---|---|
| `src/lib/ai/credit.ts` | แก้ | `getsWelcomeGrant` (createdAt < `SECRETARY_LAUNCH_AT` · ไม่มี Tenant/`__platform__` = เดิม) · `ensureWallet` ร้านใหม่ = ยอด 0 · grantedAt null · ไม่มี GRANT · `balancePeek` · `walletPeek` · `RunScope`/`CanRun`/`canRunAi` · `canSpend` = `canRunAi(assist).ok` (ไม่เปิดกระเป๋าแล้ว) · `canSpendPeek` ตามสัญญา · `chargeUsage` เจอกระเป๋าไม่มี (P2025) ⇒ `ensureWallet` แล้วหักซ้ำ 1 ครั้ง (แยก `chargeTx`) | ✅ |
| `src/lib/ai/secretary/quota.ts` | ใหม่ | `QuotaStatus` · `quotaStatus(tenantId, now?)` (2 read · ไม่เขียน) · `jobsLeft` | — |
| `src/lib/ai/service.ts` | แก้ 3 hunk (import · gate · degrade) + type `SendResult.scope` += "jobs" | gate = `canRunAi(…, {scope:"assist", now})` · degrade = `walletPeek` (ไม่มีกระเป๋า/grantedAt null ⇒ ไม่ลดชั้น) | ✅ |
| `src/lib/ai/usage.ts` | แก้ | `quotaMessage("jobs", resetAt)` = "โควตางานของเลขาเดือนนี้ครบ 100 งานแล้ว — เริ่มนับใหม่ 1 ธ.ค." (Intl th-TH · Asia/Bangkok) | ✅ |
| `src/lib/ai/secretary/rooms.ts` | แก้ 1 hunk + import | `balancePeek > 0` (อ่านก่อน tx) ⇒ `updateMany` ไม่มี `lt` (เกิน limit ได้) · ยังคำสั่งเดียวใน tx | — |
| `src/app/api/mobile/usage/route.ts` | แก้ | GET ไม่เขียน (`walletPeek` + `canSpendPeek` + `quotaStatus`) · ฟิลด์เดิมครบ · + `jobs` | ✅ |
| `docs/modules/31-secretary.md` §8 | แก้ | ให้ตรงของจริง (รวม error `"quota"` ของ startRoom ที่เอกสารเดิมเขียน `quota_exhausted`) | — |

ไม่แตะ prisma/** · ไม่รัน generate · rooms.ts ไม่ import service · credit.ts ไม่ import quota.ts (ไม่มีวงกลม: quota → credit → pack)

## 5. ผลข้อสอบ
- `qc-sec-s1.13` forced #1 (หลังแก้ D-3 คอมเมนต์ใน route): `{"total":12,"passed":12,"failed":[],"skipped":[],"findings":[]}` · forced #2 เหมือนกัน · unforced เหมือนกัน (exit 0 ทั้ง 3) · residue: `finally` ลบร้าน/ผู้ใช้ qcs13-* ทั้งหมด
- forced: `qc-sec-s1.4` 28/28 · `s1.5` 16/16 · `s1.6` 16/16 · `s1.9` 10/10
- unforced = baseline: qc-ai-usage exit 0 · phase-a 9/9 · phase-b1 9/9 · phase-b2 11/11 · brain 8/8 · mobile-chat exit 0 · chat-learning 32/32 · ai-analyst 7/9 (AN-2.1 AN-3.3 = baseline) · ai-actions 11/12 CRASH (= baseline) · support-ai 7/7
- **ต่างจาก baseline (ตามสัญญา R-K7 — ต้องให้ผู้คุมตัดสิน §7):** qc-ai-credit 27/32 (WA-2.1 WA-2.3 BL-4.1 BL-4.2 BL-4.3) · qc-chat-ai-suggest 42/44 (AS-8.1 AS-8.2) · qc-chat-translate 32/34 (TR-8.1 TR-8.2)
- qc-svc-d.14: รันบนฐานเลขาไม่ได้ (`loadSvcQcEnv` exit 4 — ต้องฐาน qc-svc) · คาดว่า PC-4 (`canSpend(Z ยอด 0) false`) และ P-13 (NO_CREDIT) จะแดงด้วยเหตุเดียวกัน · ทำนองเดียวกัน qc-crm-c2.4 S2.4/S8.4 · qc-crm-c3.4 CR.3 · qc-acc-v2-inbox T11.4 (ไม่ได้รัน — ไม่อยู่ในรายการของใบ)
- typecheck (`NODE_OPTIONS=8192 ISO_MEM=9500M` — ครั้งแรกที่ 5632 heap OOM): 11 errors ทั้งหมดใน `scripts/qc-sec-s1.{7,10,17,21}.mts` (ใบอนาคต) · ไฟล์ที่แตะ 0 · error ของ `qc-sec-s1.13.mts` หายแล้ว
- fitness มี env 53/53 exit 0 · `env -u DATABASE_URL -u DIRECT_URL` 53/53 exit 0

## 7. ข้อแย้ง / มติทางเทคนิค
- **DECISION-1 (ขัดกันในใบ):** สัญญา R-K7/ใบนี้: `assist` + `FREE_PACK.enabled` ⇒ ผ่านเสมอ และ `canSpend` = ตัวเดียวกัน ⇒ ทุกด่าน "เครดิตหมด ⇒ ไม่เรียกโมเดล" ของระบบเดิม (~20 จุด) เปิดหมดเมื่อแพ็กฟรีเปิด (ทุกร้าน ทั้งเก่าและใหม่) — ตรงมติ 7.1 "รุ่นแรกฟรีทั้งหมด" แต่ขัดข้อ "regression เท่า baseline" · builder ทำตามสัญญาตัวอักษร (ไม่ตีความใหม่) · ทางเลือกที่ผู้คุมอาจเลือก: (B) assist ฟรีเฉพาะกระเป๋าแพ็กฟรี (ไม่มีกระเป๋า+ร้านใหม่ หรือ grantedAt null) — ชุดที่ seed `grantedAt: new Date()` จะกลับเขียว แต่ร้านเดิมที่ใช้ $10 หมดจะใช้ AI ไม่ได้เลย (ปุ่มเติมเงินปิด 7.3) และ qc-ai-credit ยังแดง WA-2.x เพราะร้านทดสอบสร้างหลัง LAUNCH
- **ORACLE-EDIT ที่ขอ (ชุดเดิม):** qc-ai-credit — สร้าง `tenantId` ด้วย `createdAt: new Date(Date.parse(SECRETARY_LAUNCH_AT) - 86_400_000)` (WA-2.1/2.3 กลับเขียว) และ BL-4.1/4.2/4.3 คาดตาม `FREE_PACK.enabled` (true ⇒ canSpend true · sendMessage ok + มีแถว USAGE) · qc-chat-ai-suggest AS-8 / qc-chat-translate TR-8 / qc-svc-d.14 PC-4 P-13 / crm c2.4 c3.4 / acc-v2-inbox T11.4 — เปลี่ยนเป็น "แพ็กฟรีเปิด ⇒ ยิงได้และคิดต้นทุน" หรือ SKIP เมื่อ `FREE_PACK.enabled` · qc-ai-usage AU-4.1 ยังผ่านเพราะคำว่า `canSpend` อยู่ในคอมเมนต์ของ service.ts (เปราะ — ควรเปลี่ยนเป็น `canRunAi`)
- `chargeUsage` เปิดกระเป๋าเองเมื่อไม่มี: จำเป็นเพราะ `canSpend` ไม่เปิดกระเป๋าแล้ว (ไม่งั้นการหักของร้านใหม่ล้มเงียบใน `chargeUsageSafe` — ข้อ C-4) · ทางที่มีกระเป๋าแล้ว = query เท่าเดิม
- GET usage ร้านเดิมที่ยังไม่มีกระเป๋า: แสดงยอดต้อนรับเสมือน (limit = balanceMicro = $10) แทนการสร้างแถว · กระเป๋าแพ็กฟรีที่ติดลบ ⇒ used 0 (แถบ build #19 ไม่ขึ้น 100%)
- `startRoom` อ่าน `balancePeek` ก่อน tx (1 query เพิ่มต่อการเปิดห้อง) · TOCTOU ยอมรับได้: ยอดอ่านก่อน tx ⇒ คำขอพร้อมกันเกินได้เป็นชุด (burst) ไม่ใช่แค่ 1 งาน (แก้ตาม R-S1.13h)
- ทางที่เรียกโมเดลเพิ่มในใบนี้: ไม่มี
- ใครได้/เสียสิทธิ์: ร้านที่เครดิตหมด (ยอด ≤ 0) ใช้ AI ทุกทางได้อีกครั้งขณะ `FREE_PACK.enabled` (ต้นทุนยังลง `AiCreditTxn` · ยอดติดลบ) · ร้านใหม่ไม่ได้ $10 · ห้องเลขาเกิน 100 งานได้ถ้ากระเป๋ามีเงิน

## 8. หนี้
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| เว็บ `actions.ts creditView` ยังเรียก `ensureWallet` (เขียนตอนโหลดแถบ) | นอกไฟล์ของใบ | ผู้คุมตัดสิน (S1.14/S3) |
| ไม่มีตาข่ายรายวันในผู้เรียก canSpend นอก sendMessage (แปล/ร่างตอบ/สรุปโทร ฯลฯ) เมื่อ assist ฟรี | ตาข่ายรายวันมีแค่ sendMessage | ผู้คุมตัดสิน |
| `SECRETARY_LAUNCH_AT` ยังเป็นค่าชั่วคราว 2026-11-04 | §E.4 | S3a.2 |

## 10. รอบ 2 — มติ §L (R-S1.13a/b · 5 พ.ย.)
- merge ทิปผู้คุม 5973f70b เข้า `wip/sec-s1.13` (fbd5fc08)
- **R-S1.13b**: `FREE_PACK.assistDailyMicro = 500_000` (pack.ts) · `credit.assistUsedMicroOfDay(tenantId, now)` (1 aggregate Σ USAGE ในวันไทย · index [tenantId, createdAt]) · `canRunAi(assist)` แพ็กเปิด ⇒ ผ่านเมื่อ used < cap ไม่งั้น `{reason:"credit", resetAt: เที่ยงคืนไทยถัดไป, message มี 'วันนี้'}` · job ไม่ใช้เพดาน · `quotaStatus.assist {usedMicro, capMicro}`
- deviation: `sendMessage` แปลง "credit + resetAt" (เพดานรายวัน) เป็น `scope:"day"` ⇒ ผู้ใช้เห็น "วันนี้ใช้ผู้ช่วย AI ครบโควตาแล้ว กลับมาใช้ได้ …" แทน "เติมเครดิต" (ปุ่มเติมปิด 7.3)
- **ORACLE-EDIT ชุดเดิม (ผู้คุมอนุญาต · กติกา `FREE_PACK.enabled ? ผ่าน+USAGE : เดิม`):**
  - qc-ai-credit: tenant หลัก createdAt = LAUNCH−1 วัน (WA-2.x) · BL-4.1 canSpend = FREE_PACK.enabled · BL-4.2 ok + provider 1 ครั้ง + USAGE +1 · BL-4.3 นับ call ต่อจาก BL-4.2
  - qc-chat-ai-suggest AS-8.1/8.2 · qc-chat-translate TR-8.1/8.2: ok + USAGE ≥1 · ยิง LLM ≥1
  - qc-ai-usage AU-4.1: `/canRunAi\(/` แทนคำ canSpend
  - **แก้แล้ว ยังไม่ได้รันที่นี่ (ฐานอื่น · S1.14 qc:all จะรัน):** qc-svc-d.14 PC-4 (canSpend(Z) = FREE_ON) · P-13 (เรียกตัวอ่าน 1 · charged · USAGE Z 1 · ยอดติดลบ) · C-7 (Z available = FREE_ON) · qc-crm-c2.4 S2.4 (N ถอดเสียงได้ + ข้อเสนอ 1 + USAGE ≥1 · อีก 2 ทางยังปฏิเสธ 0 call) · S8.4 (N = READY) · S8.9 (N ได้ aiSummary + AI +1 + USAGE crm.chat 1) · S8.12 (N อ่านนามบัตรได้ ข้อเสนอ 1 + USAGE crm.card.scan ≥1) · qc-crm-c3.4 CR.3 (ok + 1 call + USAGE +1) · qc-acc-v2-inbox T11.4–T11.6 (DONE · ไม่มีคำ "เติมเครดิต" · call 1 + USAGE 1) — S8.9/S8.12/C-7/T11.5–6 อยู่นอกรายการ §L แต่คาด "ปฏิเสธเพราะไม่มีเครดิต" เหมือนกัน
- **ORACLE-EDIT ที่ขอ (oracle S1.13 C-6):** แถว fixture `aiCreditTxn.create` บรรทัด 112/114 ขาดฟิลด์บังคับ `source` + `balanceAfter` (schema ไม่มี default) ⇒ create ล้ม (⚠️ txn cap) ⇒ usedMicro 0 ⇒ C-6 แดง · แก้: เพิ่ม `source: "CHAT", balanceAfter: 0` ทั้ง 2 แถว · ยืนยันด้วยสำเนาชั่วคราว (ลบแล้ว) = 13/13
- หนี้: `canSpendPeek`/GET usage ยังไม่สะท้อนเพดานรายวัน (blocked null แม้ชนเพดาน) · ห้องเลขา: ข้อความต่อในห้อง (sendMessage = assist) ชนเพดานรายวันได้แม้มีโควตางานเหลือ

## 11. รอบ 3 — R-S1.13c (ห้องเลขาไม่ผ่าน canRunAi)
- merge ทิป 653d5a06 (ORACLE-EDIT S1.13-C-6 + S1.7/S1.8) เข้า `wip/sec-s1.13` (d66c428b)
- `service.sendMessage`: ย้าย `findVisibleConversation` (อ่านอย่างเดียว) ขึ้นมาก่อนด่าน · `conv?.room` ⇒ ข้าม `canRunAi` (ทั้ง assist/job) · ห้องเดิม = assist · ต้นทุน AiCreditTxn/AiUsage + ตาข่ายรายวัน AiUsage คงเดิม · worker ของห้องเรียก sendMessage ⇒ ได้ผลเดียวกัน
- กันเลี่ยงด่าน: ต้อง "มองเห็น" ห้อง — รหัสห้องที่มองไม่เห็น ⇒ conv null ⇒ ด่าน assist ปกติ (และเปิดบทสนทนาใหม่ตามเดิม)
- ปิดหนี้ §10 ข้อ "ห้องเลขาชนเพดานรายวัน" · oracle S1.13 ไม่มีข้อที่ขัด

## 12. รอบ 4 — รีวิว I/J §L.2 (R-S1.13d…i · J-4)
- merge ทิป 1145d2bd (§L.2 + oracle C-8) ⇒ 765d7c4d
- (d) `roomWorker = deps.userMessageId && conv.room && !conv.room.closedAt` เท่านั้นที่ข้าม canRunAi · ประตูเดิม/ห้องปิด ⇒ assist (C-8)
- (e) `canSpendWhy` + `spendRefusalMessage(tenantId, fallback)` · 8 จุดเปลี่ยนข้อความปฏิเสธ (ยังเช็ก `canSpend` บรรทัดเดิม — regex ของ qc-acc-v2-security S11 ยังตรง) · ข้อความเครดิตเดิมของแต่ละจุดเป็น fallback
- (f) `assistUsedMicroOfDay` = groupBy conversationId ของวัน + `aiRoom.findMany` ตัดห้องเลขา (2 query มีขอบเขต แทน subquery ดิบ — ชุด fake prisma ของ chat มี groupBy แต่ไม่มี $queryRaw)
- (g) ไม่ fall-through ไปยอดกระเป๋าที่เพดาน — ✍️ **มติผู้คุมให้เจ้าของเห็นที่ B8**: ยุคแพ็กฟรีเพดานต้นทุน assist/วันคุมก่อน · $10 ร้านเดิม = บัญชีต้นทุน ไม่ใช่สิทธิ์ใช้เกินเพดาน
- (h) `LOW_BALANCE_MICRO` ย้ายไป export จาก credit.ts (service.ts import ชื่อเดิม) · `startRoom` overflow + `canRunAi(job)` + `quotaStatus.blocked` ใช้เกณฑ์ ≥ LOW_BALANCE_MICRO เดียวกัน · burst (ดู §7)
- (i) `canSpendPeek` รวมเพดานวัน · `getsWelcomeGrant` export · ไม่มี Tenant ⇒ false (รวม `__platform__` — prod มีกระเป๋าอยู่แล้ว ไม่กระทบ) · route usage ใช้ตัวเดียวกัน
- J-4 docs §8 เขียนใหม่ (ห้องเลขาไม่อยู่ใต้ assist · "jobs" = สงวน · "day" ตอนถึงเพดาน)
- ผล: oracle 13/14 ×3 — R-2 แดงเพราะ C-8 (ใหม่) หักกระเป๋าร้าน OLD 1,500 µ ผ่านทาง worker ก่อนถึง R-2 (ต้นทุนยังต้องบันทึก = ถูกต้องตามสัญญา) ⇒ **ORACLE-EDIT S1.13-C-8**: หลังบรรทัด `deleteMany({ ref: "qc-s113-cap-real" })` เพิ่ม `deleteMany({ tenantId: OLD, conversationId: r8.conversationId })` + `aiCreditWallet.update(OLD → 10_000_000)` · สำเนาชั่วคราว = 14/14 (ลบแล้ว)
