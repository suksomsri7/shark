# WO P0.1 — เครื่องมือ QC ของ POS

> RUN "POS ใหม่" · worktree `/root/projects/shark-pos` (เลน 1) · branch `session/pos` · 1 ต.ค. 2569 · builder: Claude Opus 5.5
> สัญญา: `ledger/POS-MASTER-PLAN.md` §4 แถว P0.1 · ใบสั่ง `ledger/pos-briefs/pos-brief-P0.1.md` (+ COMMON + LANE-RULES)
> ใบนี้เป็น "เครื่องมือล้วน" — **ไม่แตะ `src/` และ `prisma/`** (ยืนยัน: `git diff 7d0e2012..HEAD --stat -- src prisma` = ว่าง)
> ฐาน QC: QC4 เท่านั้น (`ep-frosty-lab`) · ทุกคำสั่งแตะ DB ผ่าน `bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/<file>.mts`
> log ทุกคำสั่งเก็บใน `.qc-shots/pos/p0.1/` (ไม่ commit)

## สถานะ (checkpoint)
| # | ของส่งมอบ | สถานะ | commit |
|---|---|---|---|
| 0 | fitness ก่อนเริ่ม (`fitness-before.txt` qc4 env · `fitness-before-noenv.txt`) | ✅ 33/33 ทั้งสองโหมด — **ไม่มีแดงเดิม** | — |
| 1 | `scripts/pos-qc-env.mts` | ✅ | 555e3610 |
| 2 | `scripts/seed-pos-qc.mts` + `scripts/pos-expected.json` | ✅ | 555e3610 |
| 3 | `scripts/visual-pos.mts` | ✅ (รันจริง = CONTROLLER-RUN) | d8405982 |
| 4 | `scripts/pos-ui-inventory.json` | ✅ | 449459bd |
| 5 | `scripts/fitness-pos.mts` + `scripts/pos-sale-contract.json` + hook ใน `scripts/fitness.mts` | ✅ | 449459bd |
| 6 | `ledger/wo-notes/TEMPLATE-pos.md` | ✅ | 555e3610 |
| 7 | notes ฉบับนี้ | ✅ | (commit สุดท้าย) |
| — | `pnpm typecheck` (A5) | ✅ exit 0 (ครั้งที่ 2 ตามมติ heap ผู้คุมงาน · §5) | — |

## 1. ไฟล์ที่แตะ
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `scripts/pos-qc-env.mts` | ใหม่ | `loadPosQcEnv()` (QC_ENV_FILE ปริยาย `.env.qc` · ปฏิเสธ prod ผ่าน `qc-env-guard.isProdDbUrl` · ปฏิเสธ QC1–3 ของ CRM เว้นแต่ `POS_QC_ALLOW_CRM_DB=1` · พิมพ์ host · บอกว่าเป็น QC4 ไหม) · `POS_MODELS` ชื่อตารางจริง 40 ตัว (ตรวจกับ schema ทีละตัวแล้ว) · `POS_FUTURE_MODELS` (ของ P1.x ยังไม่มี — ยืนยันไม่มีใน schema) · `PQC` id ตายตัวของร้าน/สาขา/ระบบ/ผู้ใช้ · แคตตาล็อก QC · `POS_PAGES` · `POS_VIEWPORTS` · `resolvePosScope()` (SKIP guard) · `makeChecker()` (chk + `JSON_SUMMARY`) |
| `scripts/seed-pos-qc.mts` | ใหม่ | seed find-or-create ล้วน (ไม่มีคำสั่งลบ) · ลายนิ้วมือร้านอื่น 36 ค่า ก่อน/หลัง ต่าง = exit 1 · เขียน `scripts/pos-expected.json` · `SEED_SUMMARY` |
| `scripts/pos-expected.json` | ใหม่ (สร้างโดย seed) | id + จำนวนที่คาด (ทรงเดียวกับ `member-expected.json` ที่ commit อยู่แล้ว) |
| `scripts/visual-pos.mts` | ใหม่ | ภาพ 4 หน้า × 3 ขนาด × ผู้ใช้ · `--dry` · ไม่มี base ปริยาย · ห้าม :3215 · mint session (ลบใน finally) · ลบโปรไฟล์ chromium ทั้งจบปกติ/exit/SIGINT/SIGTERM |
| `scripts/pos-ui-inventory.json` | ใหม่ | สคีมาเดียวกับทะเบียน CRM + `$foreign` (ปุ่มของ CRM บนหน้าขาย) + `baselineDebt` (ปุ่มไร้ testid ต่อไฟล์ รวม 46) + `rows` 3 แถว |
| `scripts/fitness-pos.mts` | ใหม่ | `runPosFitness(chk, ROOT)` = F15.1 · F15.2 · F15.3a/F15.3b · F15.4 · รันเดี่ยวได้ + `--update-pos-contract` |
| `scripts/pos-sale-contract.json` | ใหม่ (สร้างโดย `--update-pos-contract`) | snapshot สัญญา createSale/voidSale + 3 ชนิด (34 ฟิลด์) + ผู้เรียก |
| `scripts/fitness.mts` | แก้ +4 บรรทัด | import 1 บรรทัด + บล็อกเรียก 1 บรรทัด (`// POS P0.1 ▸ … ◂`) หลังบล็อก F14 ก่อน "สรุป" · ไม่แตะโค้ด F1–F14 |
| `ledger/wo-notes/TEMPLATE-pos.md` | ใหม่ | 16 ด่าน · X1–X12 · บล็อกเส้นเงิน · parity 3 ขนาด |
| `ledger/wo-notes/pos-P0.1.md` | ใหม่ | ไฟล์นี้ |

## 2. seed (A3)
- ร้านกาแฟ `pos-qc-coffee` (`posqc-coffee-tenant`) 2 สาขา SHOP (สีลม/อารีย์) · ระบบ POS/INVENTORY/ACCOUNT/MEMBER/POINT ผูกทั้งสองสาขา (10 ลิงก์) · AccountSystemLink POS↔บัญชี · PromptPay `0899000000` (ปลอม) · owner + cashier (STAFF · สีลม · `pos.sale.create`+`member.customer.read`) · สินค้า 6 + บริการ 1: มี VAT · ไม่มี VAT (`vatRateBp 0`) · บาร์โค้ด EAN-13 (เช็กดิจิตถูก) · 0 บาท · สต็อกผูกคลัง 2 ตัว (รับเข้า idempotencyKey `pos-qc-recv-<sku>`) · สมาชิก 1 คนผ่าน `@/lib/modules/member` facade (`findOrCreate`)
- ร้านอาหาร `pos-qc-resto` 1 สาขา RESTAURANT · POS/INVENTORY/ACCOUNT · owner + cashier · InvItem 2 (บาร์โค้ด+สต็อก · 0 บาท) · เมนูผ่าน `restaurant/menu.ts` จริง: หมวด 3 · เมนู 4 (1 ตัวนับสต็อกเมนู 20) · สถานี KDS 2 (ensureDefaultStations)
- ราคาสินค้าตั้งผ่านทางจริงของหน้า "สินค้า/ราคา" (`pos/register.setItemSalePrice`) · ข้อยกเว้นเดียวที่เขียนตรง: `AccountProduct.vatRateBp` ของแถวร้าน QC (ไม่มีตัวตั้งเฉพาะช่องนี้ที่สั้นใน facade) · ร้าน/สาขา/ระบบ/ผู้ใช้/membership สร้างตรงด้วย id ตายตัว (createSystem ของจริงคือ `appSystem.create` ล้วน)
- ผล (QC4): รัน 4 รอบ — รอบ 1 สร้าง `{"tenant":2,"businessUnit":3,"appSystem":8,"appSystemUnit":13,"accountSystemLink":2,"paymentProfile":1,"user":4,"membership":4,"invItem":9,"accountProduct":8,"customer":1,"menuCategory":3,"menuItem":4}` · รอบ 2–4 `createdThisRun: {}`
- `SEED_SUMMARY` md5 `ccbdc3dd477f83a7869592e50afd5090` **เท่ากันทั้ง 4 รอบ** (รอบ 4 รันหลัง qc-pos-* ทั้งชุด)
- ร้านอื่นไม่ถูกแตะ: `FINGERPRINT_OTHER_TENANTS` (36 ค่า: จำนวนแถว + updatedAt ล่าสุดของ tenant/user/membership/businessUnit/appSystem/customer/crmContact/crmDeal/posSale/invItem/accountProduct/menuItem/menuCategory/shopProduct/accountSystemLink + appSystemUnit/invMovement/paymentProfile/outbox PENDING/outbox/session) md5 `bc93cd8c…` เท่ากันทุกรอบ และ before = after ในทุกรอบ (`drift: []`)
- ไม่เรียก `drainAll` (คิวไม่แยกร้าน) — event ที่ seed ทำเกิด (ถ้ามี) อยู่ในร้าน QC POS เท่านั้น
- `qc-pos-*` บน QC4 ก่อน seed / หลัง seed (exit · JSON_SUMMARY) — **เท่ากันทุกชุด**:

| ชุด | ก่อน | หลัง |
|---|---|---|
| qc-pos-account | 0 · 16/16 | 0 · 16/16 |
| qc-pos-closeday | 0 · 22/22 | 0 · 22/22 |
| qc-pos-coupon | 0 · 8/8 | 0 · 8/8 |
| qc-pos-inventory | 0 · 25/25 | 0 · 25/25 |
| qc-pos-products | 0 · 24/24 | 0 · 24/24 |
| qc-pos-register | 0 · 42/42 | 0 · 42/42 |

(ทุกชุดสร้างร้านชั่วคราวของตัวเอง ไม่พึ่ง seed นี้)

## 3. fitness F15 (A1/A2)
- **F15.1** ผู้เขียนแคตตาล็อก: สแกน `src/**/*.{ts,tsx,mts}` (ตัดคอมเมนต์ก่อน) หา `.menuItem|.shopProduct` + `create|createMany(AndReturn)|update|updateMany(AndReturn)|upsert|delete|deleteMany(` (จับ `prisma.` `tx.` `db.` `tenantDb(ctx).` ได้หมด) + SQL ดิบ `UPDATE "MenuItem"` ฯลฯ + `accountProduct.<write>(` ที่อาร์กิวเมนต์มี `salePrice` หรือส่ง `data` ทางอ้อมในไฟล์ที่กำหนด salePrice · baseline ที่พบจริง 5 ไฟล์: `restaurant/menu.ts`×6 · `restaurant/order.ts`×3 · `shop/service.ts`×2 · `account/service.ts`×2 · `account/product.ts`×2 · `account/inventory-link.ts`/`bundle.ts` เขียน AccountProduct แต่ไม่ตั้ง salePrice ⇒ ไม่ติด (ถูก) · ข้อจำกัด: `prisma[model]` แบบไดนามิก / เก็บ delegate ใส่ตัวแปร = มองไม่เห็น
- **F15.2** ใช้ TypeScript compiler API (`ts.createSourceFile` parse อย่างเดียว) อ่าน `export function createSale/voidSale/refundSale` + `export type CreateSaleInput/SaleResult/MemberSaleChoices` (flatten ฟิลด์ลูก `lines[].qty` · `giftCard.pin`) · หาไม่เจอ = แดงเสมอ · ผู้เรียก createSale 14 ไฟล์ / voidSale 9 ไฟล์ บันทึกใน snapshot (ข้อมูล ไม่ตัดสิน) · `--update-pos-contract` เติมอย่างเดียว และปฏิเสธเมื่อยังแดง
- **F15.3a/F15.3b** ใช้ตัวสแกนของ F14 (`scripts/lib/crm-testid-scan.mts` — import อย่างเดียว ไม่แก้) · ค้นโฟลเดอร์ชื่อ `pos` เองใต้ `src/app` `src/components` `src/lib/modules` (พบ 2: `src/app/app/sys/[id]/pos` · `src/lib/modules/pos` · 11 ไฟล์) · ข้ามของทะเบียน CRM ที่ประกาศใน `$foreign` (`pos-deal-select` ต้องมีแถวใน crm-ui-inventory — มี · `pos-deal-hint` เป็น span ไม่ต้องมีแถว) · หนี้ "กดได้แต่ไม่มี testid" นับต่อไฟล์ (ไม่นับ `<option>` · ไม่นับ generic ของ TS · ตัดคอมเมนต์) รวม 46 = baseline · ratchet ทั้งสองทาง
- **F15.4** อ่าน `src/messages/<locale>/*.json` (โครงจริงของรีโปคือโฟลเดอร์ต่อภาษา ไม่ใช่ `src/messages/th.json` แบบที่ใบสั่งเขียน — รองรับทั้ง `pos.json`, คีย์ `pos` ในไฟล์ใดก็ได้ และ `<locale>.json` เผื่ออนาคต) · วันนี้ = "0 คีย์ (namespace ยังไม่ถูกสร้าง)"

### A1 — fitness ทั้งสองโหมด
| คำสั่ง | ผล |
|---|---|
| ก่อน: `bash scripts/iso.sh bash scripts/qc4.sh pnpm fitness` | exit 0 · `ผ่าน 33/33` · `FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` |
| ก่อน: `bash scripts/iso.sh env -u DATABASE_URL -u DIRECT_URL pnpm fitness` | exit 0 · `ผ่าน 33/33` · `FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` |
| หลัง: (มี env · qc4) | exit 0 · `ผ่าน 38/38` · `FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` |
| หลัง: (ไม่มี env) | exit 0 · `ผ่าน 38/38` · `FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0` |
- diff รายการ check ก่อน/หลัง = เพิ่ม `F15.1 F15.2 F15.3a F15.3b F15.4` อย่างเดียว · 33 ข้อเดิมผลเดิมทุกข้อ · pre-commit hook เขียวทุก commit

### A2 — พิสูจน์ด้านลบ (แก้ชั่วคราว → แดง → คืน · `git status` สะอาดหลังทุกข้อ · log `.qc-shots/pos/p0.1/negatives.txt`)
| ข้อ | การแก้ชั่วคราว | บรรทัดแดง |
|---|---|---|
| F15.1 | ไฟล์ scratch `src/lib/modules/pos/_neg_f151.ts` มี `prisma.menuItem.update` · `tx.shopProduct.create` · `tx.accountProduct.updateMany({data:{salePrice}})` | `❌ [F15.1] … ผู้เขียนแคตตาล็อกใหม่นอก src/lib/modules/pos/catalog.ts 1 ไฟล์: src/lib/modules/pos/_neg_f151.ts [menuItem.update@3, shopProduct.create@4, accountProduct.updateMany salePrice@5]` |
| F15.1 ratchet | เพิ่มไฟล์ที่ไม่เขียนแล้วใน baseline | `❌ [F15.1] … CATALOG_WRITER_BASELINE มีไฟล์ที่ไม่เขียนแล้ว ถอดออก (ratchet): src/lib/modules/shop/gone.ts` |
| F15.2 เปลี่ยนชื่อ | `couponCode?` → `couponKode?` | `❌ [F15.2] … CreateSaleInput.couponCode ถูกลบ/เปลี่ยนชื่อ` |
| F15.2 ฟิลด์ใหม่บังคับ | เพิ่ม `channelId: string;` | `❌ [F15.2] … CreateSaleInput.channelId เป็นฟิลด์ใหม่ที่ "บังคับ" — ผู้เรียกเดิมพัง (ต้องเป็น channelId?)` |
| F15.2 เปลี่ยนชนิด | `voidSale(…, saleId: number)` | `❌ [F15.2] … voidSale: พารามิเตอร์ "saleId" เปลี่ยนชนิด "string" → "number"` |
| F15.2 หาไม่เจอ | ถอด `export` ของ createSale | `❌ [F15.2] … หา export function createSale ใน src/lib/modules/pos/service.ts ไม่เจอ` |
| F15.2 คู่บวก | เพิ่ม `channelId?: string;` | `✅ [F15.2] … ของใหม่แบบไม่บังคับ 1: CreateSaleInput.channelId? → รัน --update-pos-contract` · `--update-pos-contract` เติม 4 บรรทัด (เฉพาะ channelId) · ตอนแดง (rename) ปฏิเสธและ snapshot ไม่เปลี่ยน |
| F15.3 แถวผี | เพิ่มแถว `pos-ghost-row` | `❌ [F15.3b] … แถวผี 1 (ไม่มี testid นี้ในโค้ด POS): pos-ghost-row` |
| F15.3 ปุ่มใหม่ | scratch `.tsx` มีปุ่ม testid ไม่มีแถว + ปุ่มไม่มี testid | `❌ [F15.3a] … 1 ตัวไม่มีแถว: pos-new-unregistered (…) · ปุ่ม/ช่องที่กดได้แต่ไม่มี data-testid เพิ่มขึ้น …: src/lib/modules/pos/_neg_f153.tsx 0→1 (<button>@2)` |
| F15.3 ratchet | baseline register-ui 22→23 | `❌ [F15.3b] … baselineDebt มีไฟล์ที่ปิดหนี้ไปแล้ว ลดตัวเลขใน scripts/pos-ui-inventory.json (ratchet): src/lib/modules/pos/register-ui.tsx 23→22` |
| F15.4 | `src/messages/th/pos.json` มี `status.PAID="PAID"` ที่ en ไม่มี | `❌ [F15.4] … มีแต่ภาษาไทย 1: pos.status.PAID · ค่าภาษาไทยเป็นชื่อคีย์/enum ดิบ 1: pos.status.PAID="PAID"` |

## 4. visual-pos (A4)
- `bash scripts/iso.sh pnpm exec tsx scripts/visual-pos.mts all --user cashier --dry` → exit 0 · 12 บรรทัด (4 หน้า × 3 ขนาด) · `รวม 4 หน้า × 3 ขนาด × 1 ผู้ใช้ = 12 ภาพ` (owner เหมือนกัน)
- ไม่มี base → exit 2 `❌ ไม่ได้ระบุเซิร์ฟเวอร์ — ส่ง --base … (ไม่มีค่าปริยาย · ห้ามใช้ :3215 ของ CRM)` · `--base …:3215` → exit 2 (ไม่ยิงคำขอไปที่ CRM เลย) · `--base …:3999` (ไม่มีใคร) → exit 2 `ต่อเซิร์ฟเวอร์ … ไม่ได้ (fetch failed)`
- **CONTROLLER-RUN**: เปิดเซิร์ฟเวอร์ QC ของ POS ที่ชี้ QC4 (พอร์ตอื่นที่ไม่ใช่ 3215) แล้ว
  `bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/visual-pos.mts p0.1 --user owner --base http://127.0.0.1:<port>` และ `--user cashier` (และ `--tenant resto`) → ดู `.qc-shots/pos/p0.1/summary-<user>.json` · คาด: cashier เปิด `products`/`close` อาจได้ 404 ตามสิทธิ์ (ยังไม่มีเกณฑ์ว่าควรเห็นอะไร — ใบ P1.15 กำหนด)

## 5. typecheck (A5)
- ครั้งที่ 1 (07:22) `bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` — **หยุดเองขณะยังรอล็อก (tsc ไม่เคยเริ่ม)** หลังผู้คุมงานแจ้งว่า heap ปริยาย 3584 MB OOM (exit 134) บน main ปัจจุบัน · หยุดเฉพาะ unit ของตัวเอง (`iso-797634-…`) ซึ่งถือล็อก gate+qc2 อยู่ระหว่างรอ qc3 — ปล่อยแล้ว CRM ได้คิวต่อ
- ครั้งที่ 2 (คำสั่งตามมติผู้คุมงาน): `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` — **exit 0** · `> tsc --noEmit` ไม่มี error สักบรรทัด (ครอบ `scripts/**/*.mts` ทั้ง 5 ไฟล์ใหม่ตาม tsconfig include)

## 6. คำถามที่ใบสั่งให้รายงาน: มี fitness "ทุก event outbox มี consumer" หรือยัง
- **ไม่มีใน `scripts/fitness.mts`** · มีแต่ในข้อสอบ: `qc-chat-push-badge.mts` CP-6.1/6.2 (สแกน static `emitOutbox(… type: "x")` เทียบคีย์ใน `outbox-consumers.ts` + คู่บวก) และ `qc-account-api-webhooks.mts` C4-E1.2 / `qc-account-api-write-settings.mts` D4-S7.1 (import consumers ⇒ ต้องมี env)
- **เสนอ F15.5** (ไม่ทำในใบนี้): ยก CP-6.1/6.2 เข้า fitness แบบ static — ทุก `emitOutbox(` / `emitOutboxOutsideTx(` ใน `src/` ที่ `type` เป็นสตริงตายตัวต้องมีคีย์ใน `baseConsumers` ของ `src/lib/outbox-consumers.ts` (อ่านด้วย TS parser แทน regex ตามย่อหน้า) · `type` ไดนามิก = รายงานเป็นหนี้ baseline · คู่บวก ≥ N event ที่รู้จัก (`pos.sale.paid`) · เป็นด่าน D16 ของ POS ทุกใบที่เพิ่ม event (`pos.sale.refunded` P1.8 · event กะ P1.9 …) — ต้องการมติผู้คุมงานเพราะแตะ `fitness.mts` (ไฟล์ร้อนของ CRM)

## 7. หนี้ / มติที่ผู้คุมงานต้องตัดสิน
| เรื่อง | รายละเอียด | ใบที่จะปิด |
|---|---|---|
| หนี้ปุ่มไร้ testid 46 จุด | `pos-ui-inventory.json` → `baselineDebt` (register-ui 22 · register/page 5 · sales 1 · products 12 · close 4 · CloseDayTools 2) | P1.3 / P1.9 / P1.16 / P4.1 |
| ผู้เขียนแคตตาล็อก 5 ไฟล์ | `CATALOG_WRITER_BASELINE` ใน `fitness-pos.mts` | P1.1b (ต้องว่าง) |
| F15.3 แตกเป็น 2 ข้อ | ตั้งชื่อ `F15.3a` (ครบ) / `F15.3b` (ซื่อสัตย์) ตามคู่ F14.1/F14.2 — ถ้าต้องการชื่อ `F15.3` เดี่ยว แก้ id ได้ทันที | ผู้คุมงาน |
| F15.3 นับเฉพาะ testid ที่ "กดได้" | ตามนิยาม F14 (ทะเบียน = ตัวกดล้วน หลัง C4.1) — testid ของกล่อง/ข้อความไม่ต้องมีแถว (ใบสั่งเขียน "every data-testid") | ผู้คุมงานยืนยัน |
| F15.1 วัด AccountProduct แบบ data ทางอ้อม | ถ้าไฟล์ส่ง `data` เป็นตัวแปร และในไฟล์มีการกำหนด `salePrice` ⇒ ถือเป็นผู้เขียน (ระวังไว้ก่อน) · `prisma[model]` ไดนามิกมองไม่เห็น | — |
| F15.2 ชนิดเทียบเป็นข้อความ | `Client`/`PosPayType` เทียบที่ชื่อ — ถ้าเปลี่ยนนิยามของ alias เอง (เช่นเพิ่มค่าใน enum) ด่านไม่เห็น (การ "เพิ่ม" ค่า enum เข้ากันได้ย้อนหลังอยู่แล้ว · การลบค่า enum ต้องอาศัย typecheck) | — |
| F15.4 โครงไฟล์ข้อความ | รีโปใช้ `src/messages/<locale>/*.json` (โหลดแค่ `common.json` ใน `src/i18n/request.ts`) — ใบ P1.18 ต้องตัดสินว่าจะเป็น `pos.json` แยกไฟล์ (ต้องแก้ request.ts ให้รวมไฟล์) หรือคีย์ `pos` ใน common.json · F15.4 รองรับทั้งสองแบบ | P1.18 |
| visual-pos สำหรับ cashier | หน้าที่ cashier ไม่มีสิทธิ์อาจตอบ 404 = นับเป็น ❌ ในสรุป (ยังไม่มีตารางว่าบทบาทไหนควรเห็นหน้าไหน) | P1.15 / P4.2 |
| ผู้เขียน AccountProduct.vatRateBp ใน seed | seed เขียนตรงเฉพาะแถวร้าน QC (ไม่มีตัวตั้ง VAT รายสินค้าแบบสั้นใน facade) | P1.1a (ให้ catalog.ts รับ vat) |
| F15.5 outbox consumer | ข้อเสนอ §6 | ผู้คุมงาน |

## 8. คืนสภาพ QC4
- seed ไม่ลบอะไร — ร้าน `pos-qc-coffee` / `pos-qc-resto` + ผู้ใช้ `pos-qc-*@shark.local` 4 คน **ตั้งใจให้คงอยู่** (เป็นชุดข้อมูลของ RUN) · ไม่มีแถวชั่วคราวอื่น
- ไม่มี session `qc-visual-pos` (ไม่ได้รันจริง) · ไม่มีโปรไฟล์ `chr-pos-*` · ไฟล์ scratch ของ A2 ลบแล้ว (`git status` สะอาด)
