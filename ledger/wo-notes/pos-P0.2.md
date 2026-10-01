# WO P0.2 — ทะเบียน op POS (โครง)

> RUN "POS" · lane 2 · worktree `/root/projects/shark-pos-b` · branch `wip/pos-p0.2` · 1 ต.ค. 2569 · builder: Opus 5.5
> ใบสั่ง `/root/projects/shark-pos/ledger/pos-briefs/pos-brief-P0.2.md` (+ LANE-RULES + COMMON)
> ข้อสอบ: `scripts/qc-pos-p0.2.mts` (44 ข้อ + 1 SKIP · static + unit · อ่าน DB อย่างเดียว ไม่เขียน)

## 0. CHECKPOINT (ผู้รับช่วงอ่านตรงนี้ก่อน)
- [x] อ่าน brief + exemplar ครบ
- [x] baseline fitness (มี env QC4 / ไม่มี env) → `.qc-shots/pos/p0.2/fitness-before*.txt` = 33/33 ทั้งคู่
- [x] baseline oracle POS 6 ชุดบน QC4 (ก่อนแก้) — register 42/42 · account 16/16 · products 24/24 · coupon 8/8 · closeday 22/22 · inventory 25/25
- [x] เขียน `src/lib/modules/pos/api/{op.ts,registry.ts,ops/reports.ts,ops/sales.ts}` (safety commit ec8c4c55)
- [x] `scripts/qc-pos-p0.2.mts` → 44/44 (S6.7 SKIP: QC4 ไม่มีบิล VOIDED) (commit 0dbf06e1)
- [x] typecheck รอบ 1 (`with-gate-lock` ตั้ง heap 3584 MB) → **tsc OOM ที่ ~3.5 GB** (ไม่ใช่ error ของโค้ด) — ดู §7
- [x] typecheck รอบ 2 (heap 5632 MB · ISO_MEM 6500M) → exit 0 · 0 error (12m41s)
- [x] fitness after (2 แบบ) = เหมือน before ทุกข้อ · oracle 6 ชุด after เท่าเดิม · commit + push

## 1. ไฟล์ที่แตะ (ใหม่ทั้งหมด · ไม่แตะไฟล์ร่วม/ไฟล์ร้อนใด ๆ)
| ไฟล์ | สถานะ | ทำอะไร |
|---|---|---|
| `src/lib/modules/pos/api/op.ts` | ใหม่ | `definePosOp` (module=pos · auditAction `pos.api.<id>`) + `POS_SCOPES` (ค่าคงที่ scope ในโมดูล — ยังไม่ลง bundle) |
| `src/lib/modules/pos/api/registry.ts` | ใหม่ | `POS_OPS` · `matchOp` · `allowedMethods` · ตาราง `POS_LEGACY_AI_TOOLS` (tool เดิม 6 ตัว ↔ op) |
| `src/lib/modules/pos/api/ops/reports.ts` | ใหม่ | `sales.summary` · `sales.byDay` — ประกอบจาก `closeDaySummary` (facade) วันละครั้ง |
| `src/lib/modules/pos/api/ops/sales.ts` | ใหม่ | `sales.create` → `createSale` · `sales.void` → `voidSale` (facade) + ด่าน id |
| `scripts/qc-pos-p0.2.mts` | ใหม่ | ข้อสอบ |
| `ledger/wo-notes/pos-P0.2.md` | ใหม่ | ไฟล์นี้ |

## 2. ตาราง op
| op id | method path | tool เดิม | service fn (ผ่าน facade `pos/index`) | scope | kind / danger |
|---|---|---|---|---|---|
| `sales.summary` | GET `/reports/sales-summary?days=` | `sales_summary` | `closeDaySummary` × N วัน (+`bkkToday`) | `pos.sale.create` | read (rate report) |
| `sales.byDay` | GET `/reports/sales-by-day?days=` | `sales_by_day` | `closeDaySummary` × N วัน | `pos.sale.create` | read (rate report) |
| `sales.create` | POST `/sales` | `pos_create_sale` | `createSale` (ด่าน unit: `posUnitIsLinked` ของ `pos/register`) | `pos.sale.create` | write (Idempotency-Key → `api:<systemId>:<key>`) |
| `sales.void` | POST `/sales/{id}/void` | `void_sale` | `voidSale` (ด่าน sale: `tenantDb({tenantId,systemId}).posSale`) | `pos.sale.void` | **danger** (confirm + reason ≥5) |
| — | — | `record_expense` | `account` facade `createExpenseDoc` (proposals.ts:730) | — | ไม่ใช่ POS → ไม่สร้าง op (owner `account`) |
| — | — | `financial_summary` | คิวรีเอง posSale + accountDocument (tools.ts:1805) | — | ข้ามโมดูล → ไม่สร้าง op (owner `cross`) |

ไม่มี op ไหนประกาศ `tool` (มติข้อ 1 — การสลับผิว AI = P2.13/P3.9) · test id `POS-P0.2-OP.1..4` อยู่ในข้อสอบนี้

## 3. ข้อค้นพบ (ไม่แก้ในใบนี้ — กลายเป็นงาน P1/P5)
1. `src/lib/ai/proposals.ts:755` (`pos_create_sale`) → `resolveUnit` (`:1375-1393`) เลือกสาขา ACTIVE ใด ๆ ของร้าน **ไม่ตรวจว่าผูกกับระบบ POS** ที่ `resolveSystem` (`:1396`, ระบบ POS ตัวแรก) คืนมา ⇒ ร้านหลายระบบ POS / สาขาที่ไม่ได้ผูก POS ได้บิลที่ systemId/unitId ไม่เข้าคู่
2. `src/lib/ai/proposals.ts:916-924` (`void_sale`) — saleId จาก payload ของ AI หาแค่ `tenantId` (ไม่ผูก systemId) ด้วย raw prisma · ปลอดภัยระดับร้าน แต่ไม่ระดับระบบ
3. `src/lib/modules/pos/service.ts:97` `createSale` เชื่อ `unitId`/`systemId` (และ `itemId`/`memberId` ในบรรทัด) ที่ผู้เรียกส่งมาโดยไม่ตรวจคู่ unit↔ระบบ POS — ผู้เรียกทุกราย (โรงแรม/ร้านอาหาร/AI) ต้อง resolve เอง · op `sales.create` ตรวจด้วย `posUnitIsLinked` แล้วและ **ไม่รับ** itemId/memberId/คูปอง ในโครงนี้
4. `src/lib/ai/tools.ts:92-123` `sales_summary` / `:221-260` `sales_by_day` — ใช้ `findSystem` (`:60`, ระบบ POS ตัวแรก) ⇒ ร้านหลายระบบเห็นยอดไม่ครบ · `sales_summary` นับย้อน N×24 ชม. ไม่ใช่วันไทย
5. `src/lib/ai/tools.ts:1805-1840` `financial_summary` — raw prisma ข้ามโมดูล (posSale + accountDocument ทั้งร้าน) · ควรย้ายไปสกิล/โมดูลบัญชี (ข้อเสนอ: op ของ account เช่น `reports.monthSummary`) — ไม่ใช่ของ POS
6. `src/app/api/v1/sales/route.ts` — มี REST `/api/v1/sales` รุ่นเก่า (Wave6-C · `route-auth` เดิม · อ่านบิล PAID ทุกระบบ POS) อยู่นอกทะเบียน ⇒ P2.13 ต้องตัดสินว่าย้ายเข้า `POS_OPS` (`sales.list`) แล้วเลิกของเดิมหรือไม่
7. `src/lib/core/permissions.ts:133` — โมดูล pos มีแค่ `pos.sale.create` / `pos.product.setPrice` / `pos.sale.void` · ไม่มีสิทธิ์อ่านแยก ⇒ op อ่านรายงานใช้ `pos.sale.create` (ป้ายไทยครอบ "ดึงรายงานขายรายวัน")
8. `scripts/with-gate-lock.sh:8` ตั้ง `NODE_OPTIONS=--max-old-space-size=3584` ⇒ `pnpm typecheck` บน main ปัจจุบัน **OOM** (heap ~3.5 GB ไม่พอ) — กระทบทุกเลน (CRM ด้วย)

## 4. มติที่ผู้คุมงานต้องเคาะ
- D1 ช่วงวันของ `sales.summary`/`sales.byDay`: ใช้วันไทยรวมวันนี้ · เพดาน 31 วัน · ขอบเขต = ระบบ POS ของ actor (tool เดิม: ย้อน N×24 ชม. · สูงสุด 365/90 วัน · ระบบ POS ตัวแรก) — รับความต่างนี้ตอนสลับ P2.13 หรือให้เพิ่มบริการคิวรีช่วงวัน (`salesRangeSummary`) ใน pos/service
- D2 scope อ่าน: เพิ่ม `pos.sale.read` ใน permissions.ts (P2.13) หรือคง `pos.sale.create`
- D3 ชื่อ tool ตอนสลับ: tool เดิมไม่มี prefix `pos_` (`sales_summary`, `void_sale`) ขัดกติกา `ApiOpTool` ("ขึ้นต้นด้วยชื่อโมดูล") — คงชื่อเดิม (ชื่อคงที่ตลอดไป) หรือเปลี่ยน
- D4 บ้านของ `record_expense` / `financial_summary` (สกิล `sales` ถือไว้แต่ตรรกะเป็นของบัญชี)
- D5 heap ของ `with-gate-lock.sh` (ข้อค้นพบ 8) — ไฟล์ร่วม ไม่ใช่ของใบนี้

## 5. ผลคำสั่ง (ไฟล์เต็มอยู่ `.qc-shots/pos/p0.2/` — ไม่ commit)
- `bash scripts/iso.sh bash scripts/qc4.sh pnpm exec tsx scripts/qc-pos-p0.2.mts` → exit 0 · `JSON_SUMMARY {"total":44,"passed":44,"findings":[]}` (S6.7 SKIP)
- `pnpm fitness` (qc4 env) before/after → `JSON_SUMMARY {"total":33,"passed":33,"findings":[]}` · สถานะรายข้อ (✅/❌ ต่อ F-id) diff = เหมือนกันทุกข้อ · F10.1 ✅
- `env -u DATABASE_URL -u DIRECT_URL pnpm fitness` before/after → 33/33 · เหมือนกันทุกข้อ · F10.1 ✅ · ไม่มีแดงเดิมให้รายงาน
- typecheck รอบ 1 `bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` → exit 134 (heap OOM 3.5 GB) · รอบ 2 `env NODE_OPTIONS=--max-old-space-size=5632 ISO_MEM=6500M bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm typecheck` → exit 0 ไม่มี error
- oracle POS บน QC4 (with-gate-lock) ก่อน → หลัง: register 42/42→42/42 · account 16/16→16/16 · products 24/24→24/24 · coupon 8/8→8/8 · closeday 22/22→22/22 · inventory 25/25→25/25 (exit 0 ทุกชุด)

## 6. หนี้ / เลื่อน
| เรื่อง | เหตุผล | ใบที่จะปิด |
|---|---|---|
| route `/api/v1/pos` + config/actor ของ REST + bundle คีย์ API | มติข้อ 3 / brief (โครงเท่านั้น) | P2.13 |
| สลับ tool AI เดิมให้เดินผ่านทะเบียน | มติข้อ 1 | P2.13/P3.9 |
| `sales.create` รับ itemId/memberId/คูปอง/options | ต้องมี resolve ซ้ำต่อ id (กติกา id) | P1.x/P2.13 |
| ข้อสอบ S6.7 (void บิลที่ VOIDED → 409) | QC4 ไม่มีบิล VOIDED และใบนี้ห้ามเขียน DB | ข้อสอบ P2.13 (มี seed) |
| docs/สกิล/F13 ของ POS | ยังไม่มี route · F13 อยู่ใน fitness.mts (lane 1) | P2.13 |

## 7. คืนสภาพ QC
- ข้อสอบไม่เขียน DB เลย (อ่าน AppSystemUnit/PosSale ที่มีอยู่ · actor ปลอมใช้ id สุ่ม `qc-p0.2-*` ที่ไม่มีในฐาน) ⇒ ไม่มีข้อมูลค้าง
- oracle POS 6 ชุดลบ tenant ของตัวเองใน `finally`
