# WO P<x>.<y> — <ชื่อใบ>

> RUN "POS ใหม่" · worktree `/root/projects/shark-pos` (เลน 1) หรือ `/root/projects/shark-pos-b` (เลน 2) · branch `session/pos` · <วันที่> · ผู้คุมงาน: <โมเดล> · builder: <ตัวแทน/โมเดล>
> สัญญา: `ledger/POS-MASTER-PLAN.md` §4 แถว P<x>.<y> · ใบสั่ง `ledger/pos-briefs/pos-brief-P<x>.<y>.md` (+ `pos-brief-COMMON.md` + `pos-brief-LANE-RULES.md` ระหว่างที่ CRM RUN ยังวิ่ง)
> แบบ `ledger/DESIGN-POS.md` §… · สัญญา `ledger/POS-CONTRACTS.md` · API `ledger/POS-API.md` · migration `ledger/POS-MIGRATION-PLAN.md` · ภาพ `ledger/design-pos/NN-*.png`
> ข้อสอบ: `scripts/qc-pos-p<x>.<y>.mts` (N ข้อ · commit test: <hash> · **แก้หลัง commit หรือไม่: ไม่/ใช่ (ดู §8)**)
> ฐาน QC: **QC4 เท่านั้น** (`wo-pos-qc4` · `ep-frosty-lab`) — ทุกคำสั่งแตะ DB: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<file>.mts`

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ (ใหม่/แก้) | ทำอะไร |
|---|---|---|

## 2. migration / seed / backfill (ถ้ามี)
- migration: ชื่อ · additive ล้วน (ไม่มี DROP · ไม่มี NOT NULL ที่ไม่มี default · enum ADD VALUE แยกไฟล์ · index CONCURRENTLY แยกไฟล์) · รันบน QC4 แล้ว · POS-MIGRATION-PLAN ขั้นที่ …
- seed: `scripts/seed-pos-qc.mts` เพิ่มอะไร · `scripts/pos-qc-env.mts` (PQC) เปลี่ยนอะไร · `scripts/pos-expected.json` ถูกเขียนใหม่ · รันซ้ำแล้วสรุปเหมือนเดิม
- backfill: สคริปต์ · `--dry-run` ผล · รันจริงผล · idempotent ยืนยันอย่างไร

## 3. ด่าน 16 ข้อ (CRM-MASTER-PLAN §3 ข้อ 1–12 + POS-MASTER-PLAN §2 ข้อ 13–16 · ทุกข้อต้องมีหลักฐาน · ผ่านไม่ได้ ⇒ ตาราง §9 หนี้)
| # | ด่าน | ผ่าน? | หลักฐาน (วางของจริง ไม่ใช่คำบรรยาย) |
|---|---|---|---|
| D1 | ข้อสอบเขียนก่อนโค้ด โดยตัวแทนแยก และเคยแดง/SKIPPED | ☐ | commit `test(pos): P<x>.<y>` <hash> + บรรทัดสรุปตอนแดง |
| D2 | ข้อสอบเขียวครบเมื่อ **ผู้คุมงานรันซ้ำเอง** หลัง reseed (`seed-pos-qc`) | ☐ | `JSON_SUMMARY {...}` |
| D3 | กลุ่ม X1–X12 ครบทุกหัวข้อที่เกี่ยว (ไม่เกี่ยว = เหตุผล 1 บรรทัด) | ☐ | ตาราง §4 |
| D4 | regression: ข้อสอบ POS ใบก่อนหน้า + `qc-pos-*` ทั้งหมด + ชุดของโมดูลที่ใบนี้แตะ | ☐ | บรรทัดสรุปต่อชุด (§6) |
| D5 | `pnpm typecheck` สะอาด (ผ่าน gate lock) · `pnpm fitness` ผ่านทั้งมี env (`qc4.sh`) และ `env -u DATABASE_URL -u DIRECT_URL` | ☐ | บรรทัด `FINDINGS:`/`JSON_SUMMARY` ทั้ง 3 คำสั่ง |
| D6 | build ผ่าน — ระหว่าง CRM RUN ยังวิ่ง: **CONTROLLER-RUN** (builder ห้าม build) | ☐ | exit 0 + พอร์ตขึ้น (ผู้คุมงาน) |
| D7 | ภาพ owner · cashier ทั้ง 3 ขนาด (§7) · ผู้คุมงานเปิดดูคู่ mockup เอง · ไม่มี overflow | ☐ | path ภาพ + `PARITY: ผ่าน/ตีกลับ + เหตุผล` |
| D8 | ทุก element ที่กดได้มี `data-testid` + แถวใน `scripts/pos-ui-inventory.json` · หนี้ baseline ลดลงเท่านั้น | ☐ | diff ของทะเบียน + ผล F15.3 |
| D9 | ผู้ตรวจ (ตัวแทนแยก) อ่าน diff แล้วไม่มี BLOCKER | ☐ | สรุปรายงานผู้ตรวจ |
| D10 | เอกสาร: op ใหม่มี `test:` id · docs API ไม่ stale · สิทธิ์ใหม่มีป้ายไทย · event ใหม่ครบทะเบียน · สัญญา `createSale` (F15.2) เปลี่ยนแค่เพิ่ม — 🔴 ถ้า `scripts/pos-sale-contract.json` เปลี่ยน **ผู้ตรวจต้อง** `git diff <base> -- scripts/pos-sale-contract.json` (หรือเทียบ `git show <base>:scripts/pos-sale-contract.json`) ว่ามีแต่บรรทัดเพิ่ม (กัน snapshot ถูกแก้เพื่อฟอกให้เขียว) | ☐ | ผล F13.x · F15.2 · diff ของ snapshot |
| D11 | wo-notes ครบตามแม่แบบนี้ + ตารางหนี้ + ข้อมูล QC4 คืนสภาพ (seed-pos-qc รันซ้ำแล้วสรุปเท่าเดิม) | ☐ | ไฟล์นี้ + `SEED_SUMMARY` |
| D12 | commit บน `session/pos` (ห้าม push จนผู้คุมงานตรวจ) → ผู้คุมงาน push/deploy · (ถ้ามี migration) `_prisma_migrations` บน prod มีแถวใหม่ | ☐ | hash · สถานะ deploy |
| D13 | **เส้นเงิน regression** ชุด §6 (POS-MASTER-PLAN §1) เขียวทั้งหมดบน QC4 | ☐ | JSON_SUMMARY ทุกชุด + exit code |
| D14 | **parity ภาพ 3 ขนาด** 1440×900 · 1024×768 · 390×844 เทียบ `ledger/design-pos/NN-*.png` | ☐ | ตาราง §7 |
| D15 | **ไม่มีสตริงอังกฤษดิบ/enum บนจอ** — ข้อความผ่าน `src/messages/{th,en}` คีย์ `pos.*` ครบสองภาษา (F15.4) | ☐ | ผล F15.4 + ภาพ |
| D16 | **event ใหม่มี consumer** ใน `src/lib/outbox-consumers.ts` + oracle replay 2 รอบไม่เบิ้ล | ☐ | check id + JSON_SUMMARY |

## 4. กลุ่มข้อสอบ X (POS-MASTER-PLAN §3 — ทุกใบต้องมีตารางนี้ครบ 12 แถว)
| กลุ่ม | เกี่ยวกับใบนี้? | check ids (ถ้าเกี่ยว) / เหตุผลที่ N-A (1 บรรทัด) |
|---|---|---|
| X1 idempotency (key เดิม = ผลเดิม · sale · refund · order ingest · sync) | ☐ ใช้ / ☐ N-A | `P<x>.<y>-X1.1` … |
| X2 ข้ามร้าน/ข้ามสาขา (unitId/productId/memberId ของร้านอื่น ⇒ ปฏิเสธ ไม่รั่ว) | ☐ ใช้ / ☐ N-A | |
| X3 สิทธิ์ (action ตามสเปก §9 + channel/order/approval/pin · เพดานส่วนลด) | ☐ ใช้ / ☐ N-A | |
| X4 เงิน (Σ payMethods = grandTotal · เงินทอน · VAT 3 โหมด · split · 0 บาท · ค่าคอมฯ) | ☐ ใช้ / ☐ N-A | |
| X5 ย้อนกลับ (void/refund กลับทุก side effect · refund บางส่วนสัดส่วนถูก) | ☐ ใช้ / ☐ N-A | |
| X6 race (2 เครื่องขายชิ้นสุดท้าย · เลขใบเสร็จ · recall บิลพัก · confirm vs expire) | ☐ ใช้ / ☐ N-A | |
| X7 เวลา (ตัดวันตามเขตเวลาสาขา · ไม่ผูก "วันที่ N") | ☐ ใช้ / ☐ N-A | |
| X8 ไม่เชื่อม (ปิดการเชื่อมแต่ละระบบแล้วขายได้ ไม่มี entry/แต้ม/การ์ด) | ☐ ใช้ / ☐ N-A | |
| X9 outbox (replay ได้ · consumer ขั้นแรกล้มไม่บล็อกขั้นหลัง · drain จนเงียบ) | ☐ ใช้ / ☐ N-A | |
| X10 ภาพ (parity 3 ขนาด · ไม่มี overflow · ภาษาไทย · empty/error/offline) | ☐ ใช้ / ☐ N-A | |
| X11 แตะ (ปุ่มหลัก ≥44px · แป้นลัด F2/F4/F8/Esc · autofocus สแกน) | ☐ ใช้ / ☐ N-A | |
| X12 ไม่มี env (fitness/ข้อสอบ static รันได้แบบไม่มี .env) | ☐ ใช้ / ☐ N-A | |

## 5. บล็อกเส้นเงิน (POS-MASTER-PLAN §1 · บังคับทุกใบที่แตะ `createSale/void/refund/shift` · ใบอื่น = รันก่อนปิดเฟส)
คำสั่งแต่ละชุด: `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<ชุด>.mts`
| ชุด | ก่อนแก้ (exit · สรุป) | หลังแก้ (exit · สรุป) | ตรงกัน? |
|---|---|---|---|
| `qc-pos-account` (16) | | | |
| `qc-account-cpa` (107) | | | |
| `qc-pos-register` · `qc-pos-products` · `qc-pos-coupon` · `qc-pos-closeday` · `qc-pos-inventory` | | | |
| `qc-restaurant-money` · `qc-restaurant-void` | | | |
| `qc-shop-refund` | | | |
| `qc-hotel-money` · `qc-hotel-refund` | | | |
| `qc-ticket-money` · `qc-ticket-cancel` | | | |
| `qc-subscription-money` | | | |
| `qc-member-m2.6` (บัตรของขวัญ = ผู้เรียก createSale ใน tx) · `qc-member-m2.8` (สิทธิ์สมาชิกที่หน้าขาย) | | | |
| `qc-booking-deposit` · `qc-clinic-refund` · `qc-school-refund` · `qc-rental-refund` | | | |
(รายการตาม REVIEW-POS-DESIGN-2026-10-01 §6 แถว 18 — ทุกไฟล์มีจริงใน `scripts/` (ตรวจ 1 ต.ค.) · ผู้เรียก createSale/voidSale ทุกรายต้องมีชุดในตารางนี้)
- ตรวจเงินระดับสตางค์: Σ payMethods = grandTotal · VAT round-half-up ระดับบิล · บัญชี Dr = Cr — check ids: …

## 6. ผลข้อสอบ (วาง JSON_SUMMARY จริง — ห้ามสรุปเป็นคำพูด)
- `qc-pos-p<x>.<y>`: `JSON_SUMMARY {...}`
- regressions: JSON_SUMMARY แต่ละชุด
- `bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` · `bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness` · `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness`

## 7. ภาพ + parity 3 ขนาด (ถ้ามี UI · D7/D14)
คำสั่ง (ต้องมีเซิร์ฟเวอร์ QC ของ POS — ระหว่าง CRM RUN = CONTROLLER-RUN · ห้ามใช้ :3215):
`bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/visual-pos.mts <wo> --user owner|cashier --base http://127.0.0.1:<port>`
| หน้า | mockup | ผู้ใช้ | 1440×900 | 1024×768 | 390×844 | overflow (3 ขนาด) | console error | จุดต่างที่เห็นเอง (พิกัด) |
|---|---|---|---|---|---|---|---|---|
| `/pos/register` | `design-pos/01-*.png` | owner | path | path | path | ไม่/ไม่/ไม่ | 0 | |
| `/pos/register` | `design-pos/01-*.png` | cashier | | | | | | |
- `PARITY: ผ่าน / ตีกลับ — <เหตุผล>`

## 8. ข้อแย้ง / มติทางเทคนิค (พร้อมหลักฐาน)
- ข้อสอบ id … : เชื่อว่าผิดเพราะ … (อ้างแบบ §… / โค้ด file:line) · ปล่อยแดง / `ORACLE-EDIT <ชุด>-<ข้อ>`
- สเปกขาด: … → ตัดสินใจ … (ย้อนกลับได้อย่างไร)

## 9. หนี้ / สิ่งที่ยังไม่ทำ
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|

## 10. คืนสภาพ QC4
- ข้อสอบ `finally` ลบอะไร · seed ยังตรงเฉลยหลังรัน (`seed-pos-qc` ซ้ำ ⇒ `SEED_SUMMARY` เท่าเดิม) · ไม่มีแถว `qc-<wo>-*` ค้าง · ไม่มี session `qc-visual-pos` ค้าง · ไม่มีโปรไฟล์ chromium `chr-pos-*` ค้าง
