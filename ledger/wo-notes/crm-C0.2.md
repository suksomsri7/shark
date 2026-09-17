# WO C0.2 — facade ของโมดูล CRM (`src/lib/modules/crm/index.ts`) — พฤติกรรมไม่เปลี่ยนแม้แต่ไบต์เดียว

> RUN "CRM v2" · worktree `/root/projects/shark-crm` · branch `session/crm` · 17 ก.ย. 2569 · ผู้คุมงาน: Opus 5
> builder: ตัวแทนแยก (Opus) · ผู้เขียนข้อสอบ: ตัวแทนแยก (Opus) · ผู้ตรวจ: ตัวแทนแยก (Opus)
> สัญญา: `ledger/crm-briefs/crm-brief-C0.2.md` (+ COMMON + RESOLUTIONS + **addendum 1–3 ของผู้คุมงาน**)
> ข้อสอบ: `scripts/qc-crm-c0.2.mts` (27 ข้อ · commit `47b0028` · **แก้หลัง commit: ใช่ — ORACLE-EDIT 2 รอบโดยผู้คุมงาน · ดู §7**)

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/crm/index.ts` | **ใหม่** | re-export ล้วน 6 ฟังก์ชัน + 2 ชนิดข้อมูล · ไม่มีตรรกะ/wrapper/ค่า default · `CrmHub` ไม่อยู่ที่นี่ (§7 มติ 1) |
| `src/lib/ai/proposals.ts` · `src/lib/modules/forms/service.ts` · `account/contacts-list.ts` · `account/contact-links.ts` · `account/contact-profile.ts` | แก้ **บรรทัด import อย่างเดียว** (ไฟล์ละ 1 บรรทัด) | ชี้ไป `@/lib/modules/crm` |
| `scripts/fitness.mts` | แก้ (+เฉพาะบล็อก F2.3 · ไม่แตะกฎเดิมสักข้อ) | ด่านใหม่ **F2.3** |
| `scripts/qc-crm-c0.2.mts` | แก้โดย**ผู้คุมงาน** | ORACLE-EDIT 2 รอบ (§7) |
| `src/app/app/sys/[id]/page.tsx` | **ไม่แตะ** (เคยแก้แล้วคืนกลับ) | import `CrmHub` จาก `crm/ui` เหมือนอีก 10 โมดูล |

`service.ts` · `rules.ts` · `actions.ts` · `ui.tsx` **ไม่ถูกแตะเลย** (ผู้ตรวจยืนยันด้วย `git diff` ว่าไม่อยู่ใน diff)

## 2. migration / seed / backfill
ไม่มีทั้งสามอย่าง

## 3. ด่าน 12 ข้อ
| # | ด่าน | ผ่าน? | หลักฐาน |
|---|---|---|---|
| D1 | ข้อสอบก่อนโค้ด โดยตัวแทนแยก · เคยแดง/SKIPPED | ✅ | commit `47b0028` · SKIPPED ถูกเหตุผล (ยังไม่มี `index.ts`) |
| D2 | ข้อสอบเขียวเมื่อผู้คุมงานรันเอง | ✅ | `JSON_SUMMARY {"total":27,"passed":27,"findings":[]}` (รันเองหลัง reseed+ระบายคิว และรันซ้ำอีกครั้งหลังแก้ด่าน) |
| D3 | กลุ่ม X | ✅ | X1 ใช้ (ดู §4) · ที่เหลือ N-A |
| D4 | regression | ✅ | `qc-crm` 25/25 · `qc-crm-activity` 12/12 · `qc-form` 10/10 · `qc-forms-notify` 9/9 · `qc-acc-v2-party` 36/0 · `qc-acc-v2-contacts` 49/0 · `qc-ai-tools` 18/18 · `qc-member-fix-s2` 25/25 |
| D5 | typecheck + fitness 2 โหมด | ✅ | typecheck exit 0 · `{"total":29,"passed":29,"findings":[]}` ทั้งมี env และ `env -u DATABASE_URL` |
| D6 | build ผ่าน | ✅ | `bash scripts/acc-v2-serve.sh` exit 0 — **ด่านที่สำคัญที่สุดของใบนี้** เพราะ facade เปลี่ยนกราฟโมดูลฝั่งเซิร์ฟเวอร์ |
| D7 | ภาพ | ✅ (N-A บางส่วน) | ใบนี้ไม่เปลี่ยน UI สักพิกเซล (`page.tsx` กลับเป็นของเดิม) · ถ่ายซ้ำ 1 ชุดเพื่อยืนยันว่าไม่พัง: owner 6 ภาพ `failures:0` |
| D8 | ทะเบียนปุ่ม | ✅ | ไม่มี element ใหม่ · F14.1/F14.2 เขียว |
| D9 | ผู้ตรวจไม่มี BLOCKER | ✅ | **"no BLOCKERs"** · ผู้ตรวจไล่กราฟโมดูลเองยืนยัน facade เพิ่มโหนดเดียวและไม่แตะ `@/lib/env`/`core/context` · ข้อ SHOULD-FIX ปิดครบ (§7) |
| D10 | เอกสาร/ทะเบียน | ✅ | N-A — ไม่มี op/สิทธิ์/event ใหม่ |
| D11 | wo-notes + คืนสภาพ QC | ✅ | ไฟล์นี้ · `qc-member-m1.9` 26/26 (วัดหลังระบายคิว) |
| D12 | commit → push → Vercel READY | ✅ | ดู §10 |

## 4. กลุ่มข้อสอบ X
| กลุ่ม | เกี่ยว? | เหตุผล / check ids |
|---|---|---|
| X1 ขอบเขต | **ใช้** | `C0.2-X1.1` ข้ามร้าน · `X1.2` ข้ามระบบในร้านเดียวกัน · `X1.3` เขียนข้ามขอบเขต (`setContactPartyId` คืน false · แถวไม่ถูกแตะ) · `X1.4` คำตอบที่ปฏิเสธไม่มีเบอร์/อีเมล/id หลุด — ทุกข้อเทียบ "ผ่าน facade" กับ "เรียกตรง" ⇒ facade เปิดประตูกว้างกว่าเดิมไม่ได้ |
| X2–X10 | N-A | ใบนี้เป็น re-export ล้วน: ไม่มี op/คีย์/AI ใหม่ (X2) · ไม่มีตัวนับ/ยอดสะสม (X3) · ไม่มี consumer (X4) · ไม่มีงานตามเวลา (X5) · ไม่รับข้อมูลเข้า (X6) · ไม่มี endpoint สาธารณะ (X7) · ไม่ส่ง/ไม่แสดงข้อมูลบุคคลเพิ่ม (X8) · ไม่มี mutation ใหม่ (X9) · ไม่มีไฟล์/ความลับ (X10) |

## 5. ผลข้อสอบ (ผู้คุมงานรันเอง — log `.qc-shots/crm/c02-verify.log` + `c02-final.log`)
- `qc-crm-c0.2`: `{"total":27,"passed":27,"findings":[]}`
- regression ทั้ง 8 ชุด + `qc-crm-c1.1` (SKIPPED) ตาม D4 · `qc-member-m1.9` 26/26
- typecheck exit 0 · fitness `{"total":29,"passed":29}` ทั้งสองโหมด · build exit 0

## 6. ภาพ
ไม่มีการเปลี่ยน UI · ถ่ายชุด `0.1` ซ้ำด้วย owner หลัง build ใหม่ = `failures:0 · fatal:null` ⇒ **PARITY: ผ่าน** (เกณฑ์ของใบนี้คือ "หน้าเดิมต้องไม่พังจากการย้าย import")

## 7. ข้อแย้ง / มติทางเทคนิค
- **มติ 1 — `CrmHub` ไม่เข้า facade (addendum 3 ทับ addendum 2 ข้อ 1 ของผู้คุมงานเอง)**: builder ทำตามคำสั่งเดิมแล้วชนกำแพงจริง — `index.ts` ที่ re-export `./ui` ลาก `ui.tsx → core/context → core/session → lib/env` เข้ากราฟของผู้เรียกฝั่งเซิร์ฟเวอร์ (`ai/tools` · `account/api/registry`) · `lib/env.ts` parse `process.env` ตอน import ⇒ `env -u DATABASE_URL pnpm fitness` แดง F10.1 + F13 พัง (ด่าน D5 โหมดสอง)
  - **หลักฐานที่ใช้ตัดสิน**: `src/app/app/sys/[id]/page.tsx:8–19` import Hub ของ **ทุกโมดูล** จาก `<module>/ui` (coupon · meeting · kanban · chat · inventory · hr · marketing · member · point · reward = 10 โมดูล) ⇒ กติกาของบ้านนี้คือ `index.ts` = ผิวฝั่งเซิร์ฟเวอร์ · `ui.tsx` = ทางเข้าคอมโพเนนต์ · CRM ต้องเหมือนพี่น้อง ไม่ใช่ข้อยกเว้น
  - ผู้ตรวจไล่กราฟเองยืนยัน: facade = 52 โหนด (service 51 + ตัวมันเอง) · **ไม่แตะ** `@/lib/env`/`core/context` · `crm/ui.tsx` = 65 โหนดและแตะทั้งคู่
- **ORACLE-EDIT รอบ 1** `C0.2-S1.3/S2.1/S2.2/S2.3/S4.3` — ปรับข้อสอบตามมติ 1 (ถอด `page.tsx` ออกจากรายชื่อผู้เรียกที่ต้องย้าย · `DEEP` เหลือ `service|rules|actions` · ตัวทดสอบตัวสแกนเปลี่ยนตัวอย่างเป็น `crm/actions` และบังคับว่า `crm/ui` ต้องถูกปล่อย) · บันทึกพร้อมหลักฐานใน `ledger/CRM-RUN.md` §4
- **ORACLE-EDIT รอบ 2** `C0.2-S4.2` — **ผู้ตรวจจับได้ว่าข้อนี้เขียวด้วยเหตุผลที่ผิด**: มันบังคับให้บล็อก F2.3 มีคำว่า `moduleFiles` แต่กฎฉบับกว้างจงใจไม่ใช้คำนั้น · ที่เขียวมาตลอดเพราะหน้าต่าง `+500` ตัวอักษรที่ตัดมาตรวจ **ไหลไปโดนกฎ F5 ที่อยู่ถัดไป** ซึ่งมีคำนั้นพอดี ⇒ ข้อสอบไม่ได้ตรวจสิ่งที่อ้างเลย · แก้เป็นตรวจสัญญาจริงของกฎ · **ผลพลอยได้: พอแก้แล้วข้อนี้แดงจริงกับโครงแรกของ builder และบังคับให้แก้ให้ถูกต้อง** (ข้อสอบกลับมามีฟัน)
  - พร้อมกันนี้แก้ข้อความหัวข้อ S1.2 · S2.1 · S2.2 ที่ค้างจากรอบแรก (ยังเขียนว่า `crm/ui` ต้องถูกจับ · ยังนับผู้เรียกเป็น "six") — คนอ่านผลเขียวจะจดสัญญาผิด
- **ผู้ตรวจ SHOULD-FIX ที่ปิดแล้วทั้งหมด**: F2.3 เดิมมองไม่เห็น import แบบ path สัมพัทธ์ (ทั้งที่ข้อสอบเห็น ⇒ ด่านอ่อนกว่าข้อสอบที่จะเลิกรันหลัง C1.1) · `(?!index)` ไม่ผูกกับเครื่องหมายคำพูด ⇒ `crm/index-shared` ลอดได้ · `require()` และ `import "…";` เปล่า ๆ ลอดได้ — ปิดครบพร้อมตัวควบคุมเชิงบวกทีละข้อ
- **ตัดสินใจไม่แก้ (ตั้งใจ)**: F2.3 ไม่ยกเว้น `src/app/b/**` `/u/**` `/t/**` `/l/**` ที่ CRM จะเป็นเจ้าของในอนาคต ⇒ ใบ C2.5/C3.5 จะเจอด่านแดงและต้อง **ยกฟังก์ชันขึ้น facade** ไม่ใช่ขยายรายการยกเว้น (เขียนกำกับไว้ในกฎแล้ว) · ไม่มีช่องยกเว้นสำหรับสตริงในคอมเมนต์ (false positive ที่ดังและถูกจุดดีกว่าประตูหลัง)

## 8. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| `src/lib/member-bridges.ts` แตะตาราง CRM ด้วย prisma ดิบ (`prisma.crmDeal.findFirst:619` · `prisma.crmContact.updateMany:659` ใน `onCrmDealWon`) | ไม่ใช่ import ⇒ facade และ F2.3 มองไม่เห็น · การรื้อ = เปลี่ยนพฤติกรรม | **C1.8** (เจ้าของ payload `crm.deal.won`) |
| `scripts/**` ยัง import `crm/service` ตรง | F2.3 กวาดเฉพาะ `src/` · ข้อสอบเองก็ต้องเรียกตรงเพื่อเทียบกับ facade | ไม่ปิด (ตั้งใจ) |
| `scripts/crm-expected.json` · `member-expected.json` ในเครื่องต่างจาก git | ชุดยืนยันของใบนี้ reseed ฐาน QC ⇒ id ใหม่ · ใบนี้ไม่ได้เปลี่ยนสัญญาชุดข้อมูล จึงไม่ commit ทับ | ใบที่แก้สัญญาชุดข้อมูลจริง (C1.1) |

## 9. คืนสภาพ QC
ข้อสอบลบแถว `qc-c02-*` ของตัวเองครบ (`C0.2-CLEAN` เขียว) · `qc-member-m1.9` 26/26 หลังระบายคิว · ไม่มี session ค้าง
