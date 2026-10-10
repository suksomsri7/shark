// QC — POS RUN ใบ P2.3: สูตร/วัตถุดิบ (BOM) ของเมนู · ตัดคลังชุดเดียวต่อบิล (inventory.consumeBatch) · ต้นทุนตามสูตร · จำนวนแก้วที่ทำได้
//   เขียนก่อนสร้าง (fail-before) · ผู้เขียนข้อสอบ · ไม่ต้องมี seed (ร้านชั่วคราว + ผู้ใช้ชั่วคราวของตัวเอง)
//
// สัญญา: ledger/pos-briefs/pos-brief-P2.3.md §2 R1–R10 · §3 migration · §4 แผนข้อสอบ · §5 CD1–CD6 · §9 มติผู้คุมงาน (ผูกมัด: bomEnabled opt-in ·
//        delta มีเครื่องหมาย · ไม่มี waste/yield · กติกามองเห็นแบบชุด · void คืนที่ต้นทุนเดิม (V5) · batch ทุกบิล · retryPendingStockCuts (C7) ·
//        เห็นต้นทุน = pos.product.manage หรือ pos.report.view)
//        ต่อยอด: qc-pos-p1.2 (ชุด · คีย์ pos-consume-<sale>-<line>-<inv> · createSale ใน tx ผู้เรียก = ค้างตัด) · qc-pos-p1.8 (คืนเงิน · O12) ·
//        qc-pos-p1.17 (สูตรกำไร floor) · qc-pos-p2.1 (ร้านชั่วคราว · หน้าขาย · ลบใน finally) · qc-pos-p1.18 (ผู้ใช้ + Membership ชั่วคราว)
//        โน้ต: ledger/wo-notes/pos-P2.3-oracle.md (ตารางชื่อ = สัญญาของผู้สร้าง S · ความคลาดเคลื่อน · CONTROLLER-DECISION · ผลแดงที่คาด)
// ชื่อทุกตัวที่ยังไม่มีในโค้ดถูก "ตั้ง" ในไฟล์นี้และลงทะเบียนในตารางชื่อของโน้ต — ผู้สร้างห้ามแก้ข้อสอบนี้ (ORACLE-EDIT เท่านั้น)
//
// ของที่ใบ P2.3 (S) ต้องส่ง (ย่อ — ละเอียดในโน้ต):
//   schema/migration `20261205100000_pos_p23_recipe`: PosProduct.bomEnabled Boolean @default(false) · model PosRecipeChoiceLine
//     {id tenantId productId(FK cascade) choiceId invItemId qtyDelta createdAt updatedAt · CHECK qtyDelta <> 0 · unique(productId, choiceId, invItemId) · idx tenantId · idx invItemId}
//   pos/recipe-shared.ts (บริสุทธิ์): expandRecipe({lines, choiceLines, choiceIds}) → {ok:true, components} | {ok:false, code:"INVALID_LINE", message} · RECIPE_MAX_COMPONENTS = 50
//   pos/catalog.ts: setRecipe รับ MENU (+ bomEnabled อัตโนมัติ) · setRecipeChoiceLines(ctx, productId, [{choiceId, invItemId, qtyDelta}]) · setBomEnabled(ctx, productId, on) ·
//     listForUnit: bomEnabled · recipeChoiceLines · stock[unit] = จำนวนแก้วตามสูตร
//   pos/recipe.ts: recipeCost({tenantId, systemId, actor}, productIds, {unitId, choiceIds?}) → {ok:true, items[]}
//   pos/service.ts: consumeSaleInventory → inventory.consumeBatch ชุดเดียว (ทุกบิล) · void คืนที่ต้นทุน/คลัง/ล็อตของ OUT เดิม ·
//     retryPendingStockCuts({tenantId, systemId, actor}, unitId) → {ok:true, scanned, cut, stillPending} · register-actions: retryPendingStockCutsAction
//   inventory/service.ts + inventory/index.ts (รอยต่อ // POS P2.3 ▸ … ◂): consumeBatch(ctx, {sourceModule, refType, refId, parts:[{itemId, qty, idempotencyKey}]})
//     → {movementIds: string[], skipped: [{itemId, key, reason: "NOT_FOUND"|"SERVICE"}]}
//   register.ts: components ของ MENU ที่ bomEnabled · ซ่อน/PRODUCT_NOT_FOUND เมื่อวัตถุดิบอยู่นอกคลังของสาขา · stockLeft = จำนวนแก้ว
//
// ขอบเขต: ST สถิต · E กระจายสูตร (บริสุทธิ์ + E5 ตัวแปร) · M ตัวเขียน · Q หน้าขาย · C ตัดคลัง · K ต้นทุน · A จำนวนแก้ว · V คืนของ · Z คืนสภาพ
//
// 🔴 กติกาข้อสอบ (แบบเดียวกับ qc-pos-p2.1): SKIP เมื่อของ P2.3 ยังไม่มี (exit 0 + เหตุผล) · QC_FORCE=1 = ข้ามด่าน SKIP (แดงตามเหตุผล ไม่ crash)
//    --list = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต ST1–ST4 + กระจายสูตรบริสุทธิ์ E1–E4 (ไม่โหลด prisma · exit 1 ถ้าแดง)
//    ฐาน = QC4 เท่านั้น (host ep-frosty-lab ก่อนเขียนแถวแรก) · ร้านชั่วคราว `posqc-p23-<rand>` + `posqc-p23-<rand>-t2` + ผู้ใช้ `posqc-p23-<rand>-*@qc.invalid`
//    (ลบทั้งหมดใน finally · แถวค้าง = 0) · ไม่มีเครือข่าย (fetch = ตัวกั้น 503) · ทุกข้อห่อ try/catch (ข้อพัง = แดงพร้อมเหตุผล ไม่ล้มทั้งชุด)
//    fixture ผ่านฟังก์ชันของโมดูล · Prisma ตรงเฉพาะ Tenant/BusinessUnit/User/Membership/AccountSystemLink (แบบ qc-pos-p1.18/p2.1) ·
//    SQL ดิบ = อ่าน xmin / pg_stat_database / information_schema + ลบร้านชั่วคราวเท่านั้น
//    โมดูล/โมเดล/คอลัมน์ที่ยังไม่มีเข้าถึงแบบไดนามิก (`import(… as string)` + ตรวจว่ามี) — next build ตรวจชนิด scripts/*.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p2.3";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";

// ═════════════════════════ ทะเบียนข้อสอบ D(id · X-group · หัวข้อ) — --list พิมพ์ชุดนี้ ═════════════════════════
// X-group: S สถิต · P บริสุทธิ์ · X1 idempotency/เล่นซ้ำ · X2 ข้ามขอบเขต · X3 สิทธิ์ · X4 เงิน/จำนวน · X5 ผลข้างเคียงครบ/ไม่เขียนอะไร · PAR = ต้องเขียวทั้งก่อนและหลังสร้าง · "-" เชิงหน้าที่
type Def = readonly [string, string, string];
const D = (id: string, x: string, title: string): Def => [`P2.3-${id}`, x, title] as const;
const CHECKS: readonly Def[] = [
  // ── ST สถิต ──
  D("ST1", "S", "[§3 CD1 CD3] schema + migration เพิ่มอย่างเดียว: PosProduct.bomEnabled Boolean @default(false) + ฟิลด์ลิสต์ PosRecipeChoiceLine[] · model PosRecipeChoiceLine ฟิลด์พอดี {id tenantId productId product(onDelete Cascade) choiceId invItemId qtyDelta Int createdAt updatedAt} + @@unique([productId, choiceId, invItemId]) + @@index([tenantId]) + @@index([invItemId]) · RecipeLine ไม่เปลี่ยน · migration เดียว `20261205100000_pos_p23_recipe`: lock_timeout · ADD COLUMN \"bomEnabled\" BOOLEAN NOT NULL DEFAULT false · CREATE TABLE \"PosRecipeChoiceLine\" (ครบคอลัมน์) · CHECK (\"qtyDelta\" <> 0) · unique/index ครบ · FK productId → PosProduct ON DELETE CASCADE · ไม่มีคำสั่งอื่น (DROP/UPDATE/DELETE/RENAME/backfill)"),
  D("ST2", "S", "[§3 R10] ลงทะเบียน: core/scope.ts PosRecipeChoiceLine: tenant (RecipeLine: tenant คงเดิม) · pos-qc-env POS_MODELS posRecipeChoiceLine {model \"PosRecipeChoiceLine\"} + ไม่อยู่ใน POS_FUTURE_MODELS · messages th+en pos.json ก้อน recipe.* (คีย์ชุดเดียวกัน · th มีอักษรไทย · en ไม่มีอักษรไทย)"),
  D("ST3", "S", "[R5 C-1 F15.1 hard rules] ขอบเขต: recipe-shared.ts บริสุทธิ์ (ไม่ import prisma/db/โมดูลเซิร์ฟเวอร์) + export expandRecipe RECIPE_MAX_COMPONENTS · recipe.ts export recipeCost · catalog.ts export setRecipeChoiceLines setBomEnabled · service.ts export retryPendingStockCuts · inventory/service.ts export consumeBatch · inventory/index.ts re-export consumeBatch ในรอยต่อ `// POS P2.3 ▸ … ◂` · ไฟล์ pos ที่ใช้ consumeBatch import จาก @/lib/modules/inventory เท่านั้น · consumeSaleInventory เรียก consumeBatch( และไม่มี .consume( · เขียน RecipeLine เฉพาะ catalog.ts/catalog-legacy.ts · เขียน PosRecipeChoiceLine เฉพาะ catalog.ts · modules/pos ไม่เขียน InvMovement/onHand · ไฟล์ 'use client' ไม่ import pos/recipe·catalog·service หรือ inventory · POS-OWNER-PENDING.md มีบรรทัด P2.3 (consumeBatch + หน่วยซื้อ + ความละเอียดต้นทุน)"),
  D("ST4", "S", "[CD1 §9 Q7 Q8] scripts/pos-sale-contract.json ตรงฐาน b694aea0 ทุกไบต์ (sha256) · pos-integrations INVENTORY [\"bomDeduct\", true, null] (พลิกเป็น live แล้วใน P2.3U มติ 8) · ไฟล์ \"use server\" ใน modules/pos export async function ล้วน · register-actions.ts มี retryPendingStockCutsAction (เรียก retryPendingStockCuts + catch)"),
  // ── E กระจายสูตร (recipe-shared.ts · บริสุทธิ์ + E5 ตัวแปรผ่านหน้าขาย) ──
  D("E1", "P", "[R3] expandRecipe ฐานล้วน (ไม่เลือกตัวเลือก · choiceLines ของตัวเลือกที่ไม่เลือกไม่มีผล) → {ok:true, components} เรียง invItemId น้อยไปมาก · แต่ละตัวคีย์ {invItemId, qty} พอดี · จำนวนเต็ม"),
  D("E2", "P", "[R3 CD3] M + โอ๊ต + ช็อตเพิ่ม: เมล็ด 18+6+9 = 33 · นม 150+50−150 = 50 · แก้ว12 1−1 = 0 (ทิ้ง) · แก้ว16 +1 · ฝา 1 · โอ๊ต +150 → 5 รายการรวมต่อสินค้า · choiceId ที่ไม่มี choiceLines/ไม่รู้จัก = ไม่มีผล"),
  D("E3", "P", "[R3] clamp: นม 150 + ไม่ใส่นม −200 → ทิ้ง (ไม่ติดลบ) · สุทธิ 0 ทิ้ง · 24 ลำดับสุ่ม (seed ตายตัว) ของ lines/choiceLines/choiceIds ได้ผลเดียวกันทุกไบต์ · ไม่แก้อินพุต (อินพุต freeze แล้วไม่ throw)"),
  D("E4", "P", "[R3 §9] RECIPE_MAX_COMPONENTS = 50 · ฐาน 50 รายการ ok · 51 → {ok:false, code INVALID_LINE, message ไทยมี \"50\"} ไม่ throw · ฐาน 49 + ตัวเลือกเพิ่มของใหม่ 2 → INVALID_LINE · ฐาน 50 + ตัวเลือกลบ 1 เพิ่ม 1 → 50 ok (นับหลังทิ้ง)"),
  D("E5", "-", "[R1] ตัวแปรเมนู (มัทฉะเย็น · ไม่มีสูตรเอง) ขายผ่านหน้าขาย: S → components = สูตรแม่ · M → สูตรแม่ + delta M ของแม่ (นม 120+40) · ตั้งสูตรเองให้ตัวแปร → S และ M = สูตรของตัวแปรล้วน (ไม่มี delta — choiceLines อ่านจากแถวเจ้าของสูตรเดียวกัน) · bomEnabled ของตัวแปร true"),
  // ── M ตัวเขียน (catalog.ts) ──
  D("M1", "-", "[R2] setRecipe MENU ลาเต้: ตั้ง 4 แถว → RecipeLine ตรง + bomEnabled false→true + AuditLog pos.product.recipe (before.bomEnabled false · after.bomEnabled true) · แทนเป็น 3 แถว (bomEnabled คง true) · ส่งชุดเดิมซ้ำ = ไม่เขียน/ไม่ audit · [] → 0 แถว bomEnabled false (audit after.bomEnabled false) · ตั้งกลับ 4 แถว · listForUnit: recipe 4 แถว + bomEnabled true"),
  D("M2", "-", "[R1 B1-pin] PRODUCT (น้ำดื่ม) / SERVICE / สินค้าชั่ง → setRecipe VALIDATION · setRecipeChoiceLines + setBomEnabled บน PRODUCT → VALIDATION · ตัวควบคุม: BUNDLE setRecipe ยัง ok (P1.2)"),
  D("M3", "X5", "[R2] ลาเต้: qty 0 / 1.5 / −1 / invItemId ซ้ำ / 51 แถว / วัตถุดิบ SERVICE / วัตถุดิบเก็บถาวร → VALIDATION · สูตรลาเต้ยังเป็น 4 แถวเดิม · ไม่มี audit เพิ่ม"),
  D("M4", "X2", "[R2] วัตถุดิบของคลังที่ไม่ขายผ่าน POS นี้ (I2) / ของร้าน T2 / id มั่ว → NOT_FOUND · productId มั่ว → NOT_FOUND · สูตรไม่เปลี่ยน"),
  D("M5", "-", "[R2 CD3] setRecipeChoiceLines ลาเต้: M (เมล็ด +6 · นม +50 · แก้ว12 −1 · แก้ว16 +1) · โอ๊ต (นม −150 · โอ๊ต +150) · ช็อตเพิ่ม (เมล็ด +9) → PosRecipeChoiceLine 7 แถวตรง · แทนทั้งชุด (เหลือ 2 → กลับ 7) · ส่งชุดเดิม = ไม่ audit · AuditLog pos.product.recipeChoices · listForUnit recipeChoiceLines 7 แถว"),
  D("M6", "X5", "[R2] setRecipeChoiceLines ปฏิเสธ: ตัวเลือกของกลุ่มที่ไม่ได้ผูก / choiceId มั่ว → NOT_FOUND · วัตถุดิบ I2 → NOT_FOUND · qtyDelta 0 / 1.5 / 1000001 / (ตัวเลือก, ของ) ซ้ำ / 101 แถว / วัตถุดิบ SERVICE → VALIDATION · แถวยังเป็น 7 แถวเดิม"),
  D("M7", "X3", "[R2 D1] STAFF (pos.sale.create) → setRecipe / setRecipeChoiceLines / setBomEnabled = PERMISSION_DENIED · MANAGER(สาขา A) บนลาเต้ (แถวทุกสาขาที่ขายที่ A+B) → PERMISSION_DENIED · MANAGER(A) บนเอสเปรสโซ (แถวสาขา A) → ok + bomEnabled true · สูตรลาเต้ไม่เปลี่ยน"),
  D("M8", "-", "[R2] setBomEnabled: อเมริกาโน่ (ยังไม่มีสูตร) on → VALIDATION ข้อความมี \"ยังไม่มีสูตร\" · ลาเต้ off → bomEnabled false · RecipeLine 4 แถวยังอยู่ · off ซ้ำ = ไม่ audit · on → true · BUNDLE → VALIDATION"),
  // ── Q หน้าขาย ──
  D("Q1", "PAR", "[R4 CD5 Q7] น้ำดื่ม (PRODUCT 1:1) ×2 + รายการกำหนดเอง ฿10: quote (ยอด · บรรทัด · VAT) ตามสูตรเดิม · submit → บรรทัดน้ำ itemId = InvItem น้ำ · components null · บรรทัดเอง itemId null · OUT 1 แถวคีย์ pos-consume-<sale>-<line> qty −2 ต้นทุน 400 · ต้องเขียวทั้งบน b694aea0 และหลังสร้าง"),
  D("Q2", "PAR", "[Q1 CD2] เมนูโค้กแบบ backfill (RecipeLine qty 1 จากประตูเดิม · bomEnabled false): ขึ้นกริด stockLeft null · quote ฿25 · submit → itemId null · components null · ไม่มี InvMovement ของบิล · สต็อกโค้กไม่ขยับ · ต้องเขียวทั้งก่อนและหลังสร้าง"),
  D("Q3", "X4", "[R3 R4] ลาเต้ M ×2 ผ่านหน้าขาย: quote 2×8500 · บรรทัด itemId null · components snapshot = [เมล็ด 24, แก้ว16 1, ฝา 1, นม 200] เรียง invItemId · หลัง submit เมล็ด −48 · นม −400 · แก้ว16 −2 · ฝา −2 · แก้ว12 0 · OUT 4 แถวคีย์ pos-consume-<sale>-<line>-<inv>"),
  D("Q4", "X2", "[R4 Q4] สาขา B (ไม่มีคลัง): ลาเต้ (BOM เปิด) ไม่ขึ้นกริด B · quote → PRODUCT_NOT_FOUND (lineIndex 0) · ตัวควบคุม: ชาร้อน (MENU ไม่มีสูตร) ขึ้นกริด B + quote ฿30 ok"),
  D("Q5", "X5", "[R6] สาขา A ตั้ง BLOCK: นมสดปั่น (นม 1000 + แก้ว16 1) ×(⌊นม/1000⌋+1) → quote ok (ไม่ตรวจสต็อก) · submit → STOCK_INSUFFICIENT ข้อความมี \"นมสด\" · PosSale / InvMovement ของร้านไม่เพิ่ม · คืนนโยบาย ALLOW_NEGATIVE"),
  D("Q6", "X4", "[R6] ALLOW_NEGATIVE: ลาเต้ S+โอ๊ต ×(⌊โอ๊ต/150⌋+1) → ขายได้ · components ไม่มีนม (150−150 = 0) · โอ๊ตติดลบ · OUT ของโอ๊ต needsReview true + balanceAfter < 0 · OUT ของเมล็ด needsReview false"),
  D("Q7", "-", "[R4] พักบิลลาเต้ S → แก้สูตรนม 150→160 → เรียกคืน → submit → components นม 160 (สูตร ณ ตอนเรียกคืน) · คืนสูตรเดิม"),
  // ── C ตัดคลัง (consumeBatch) ──
  D("C1", "X5", "[R5 CD5 Q7] หนึ่ง tx ต่อบิล: บิลไม่มีสูตร (น้ำดื่ม + โค้ก PRODUCT) → OUT 2 แถว คีย์ต่อบรรทัดเดิม · xmin เดียวกัน · บิล Q3 (ลาเต้) OUT 4 แถว xmin เดียวกัน"),
  D("C2", "X4", "[R3 R5] บิลผสม น้ำดื่ม ×1 + ลาเต้ M+โอ๊ต+ช็อต ×1 + ชุดแก้ว ×1 (฿135): OUT 8 แถว — น้ำ (คีย์บรรทัด) · ลาเต้ เมล็ด 33 นม 50 โอ๊ต 150 แก้ว16 1 ฝา 1 · ชุด แก้ว12 1 ฝา 2 · ทุกคีย์ตามแบบ · xmin เดียว · สต็อกลดตามผลรวม"),
  D("C3", "X4", "[R3] วัตถุดิบเดียวกันสองบรรทัด (ลาเต้ S ×1 + ลาเต้ M ×2): เมล็ด 2 แถว (18 · 48) · นม 2 แถว (150 · 400) · ฝา 2 แถว (1 · 2) · Σ ถูก · onHand ลดตาม Σ"),
  D("C4", "X1", "[R4 R5] ส่งบิล Q3 ซ้ำด้วยคีย์เดิม → duplicated:true saleId เดิม · ไม่มี OUT เพิ่ม · เรียก consumeSaleInventory ซ้ำตรง ๆ → ไม่มี OUT เพิ่ม"),
  D("C5", "-", "[R5] inventory.consumeBatch (facade) ตรง: ส่วน [id มั่ว · SERVICE · ของคลัง I2 · เมล็ด 2] → movementIds 1 ตัว (เมล็ด −2) · skipped 3 (NOT_FOUND · SERVICE · NOT_FOUND) ไม่ throw · เรียกซ้ำ → movementIds เดิม ไม่มีแถวเพิ่ม · createSale ตรงที่ components มีของ SERVICE → PAID · OUT 4 แถว (ไม่มีของ SERVICE) xmin เดียว"),
  D("C6", "X4", "[R5] ลาเต้ S 10 บิลพร้อมกัน (ALLOW) → ok ทั้ง 10 · นม −1500 เป๊ะ · เมล็ด −180 · ทุกบิล OUT 4 แถว xmin เดียว · pg_stat_database.deadlocks ไม่เพิ่ม"),
  D("C7", "X1", "[§9 Q8] บิลค้างตัด (createSale ใน tx ของผู้เรียก · components ลาเต้ S) → registerStatus.pendingStockCount +1 · retryPendingStockCuts โดย STAFF → PERMISSION_DENIED · โดยเจ้าของ → {ok, scanned ≥ 1, cut ≥ 1, stillPending 0} · OUT 4 แถว xmin เดียว · pending กลับเท่าเดิม · AuditLog pos.stock.retry · เรียกซ้ำ → cut 0 · InvMovement ของร้านไม่เพิ่ม"),
  // ── K ต้นทุน (recipe.ts) ──
  D("K1", "X4", "[R8] recipeCost ลาเต้ (สาขา A) = 18×65 + 150×5 + 280 + 120 = 2320 · บรรทัด {invItemId name unitLabel qty unitCostSatang costSatang} (g · ml · ใบ · ชิ้น) · choiceIds [M] → 24×65 + 200×5 + 350 + 120 = 3030 (แก้ว12 หลุด)"),
  D("K2", "X4", "[R8] costComplete: ลาเต้ true · ชาไทย (ใบชาต้นทุน 0) false · มอคค่า (ช็อกโกแลตเก็บถาวร) false · marginBp = floor((ฐาน − ต้นทุน) × 10000 / ฐาน): ลาเต้ 6906 · ไม่ครบ → null · เมนูไม่มีราคา → null"),
  D("K3", "X3", "[R8 §9 Q10] STAFF (pos.sale.create) ได้ lines {invItemId qty name unitLabel} แต่ไม่มีคีย์ใดที่มีคำว่า cost/margin ทั้งก้อน · MANAGER(A) และ STAFF ที่มี pos.report.view เห็น costSatang 2320"),
  D("K4", "X4", "[R8 CD4] GL ของบิล Q3: ทุก OUT ของบิลมี JV refType InvMovement Dr 5000 / Cr 1200 = |qty| × ต้นทุนของ movement · Σ Dr 5000 = 2 × 3030 = 6060 (ต้นทุนถัวเฉลี่ย ณ ตอนตัด)"),
  D("K5", "X4", "[R8 P1.17] reportMargin (สาขา A วันนี้): แถวคาปูชิโน่ (ขาย ×3 · ฿65) revenue 19500 · costSatang 5850 (stored = Σ OUT) · estimatedCostSatang 0 · uncostedLineCount 0 · marginBp 7000"),
  // ── A จำนวนแก้ว ──
  D("A1", "X4", "[R9] กริดสาขา A: ลาเต้ stockLeft = min ⌊onHand/qty⌋ ของสูตรฐาน (คิดจากสต็อกจริงขณะตรวจ) · soldOutReason null · catalog.listForUnit stock[A] ค่าเดียวกัน"),
  D("A2", "-", "[R9 CD6] ชาไทย (ใบชา onHand 0): stockLeft 0 · soldOut true · soldOutReason NO_STOCK · quote ภายใต้ ALLOW ยัง ok ฿40 (แสดงผลอย่างเดียว)"),
  // ── V คืนของ ──
  D("V1", "X5", "[R7] void ลาเต้ M ×2 → ทุกวัตถุดิบกลับ onHand = ก่อนขาย · IN 4 แถว (refId บิล) qty = |OUT| ต่อของ"),
  D("V2", "X4", "[R7 O12] ลาเต้ S ×3 คืน 1 (restock) → IN เมล็ด 18 นม 150 แก้ว12 1 ฝา 1 ที่ต้นทุน OUT เดิม · คืนอีก 2 → Σ IN ต่อของ = Σ OUT (54 · 450 · 3 · 3)"),
  D("V3", "X5", "[R7] ลาเต้ S ×1 คืน 1 restock false → ไม่มี IN ของใบคืน · สต็อกไม่ขยับ"),
  D("V4", "X1", "[R7] เล่น consumers[pos.sale.refunded] ของใบคืนแรก (V2) ซ้ำ 2 รอบ → IN ไม่เพิ่ม · voidSale บิล V1 ซ้ำ → ปฏิเสธ · IN ของ V1 ไม่เพิ่ม"),
  D("V5", "X4", "[§9 Q5 O12] บิลลาเต้ S + น้ำดื่ม → รับนม (ต้นทุน 11) + น้ำ (ต้นทุน 1000) เพิ่มจนถัวเฉลี่ยเปลี่ยน → void → IN ทุกแถวต้นทุน = OUT เดิม (นม 5 · น้ำ 400 ไม่ใช่ถัวเฉลี่ยใหม่) + คลังเดียวกัน · GL Dr 1200 ของ IN จาก void Σ = Σ ต้นทุน OUT = 2720"),
  // ORACLE-ADD (fix round 1 · รีวิว F1 · มติผู้คุมงาน ทาง B): ลองตัดใหม่หลังคืนเงินบางส่วนต้องไม่ตัดส่วนที่คืนไปแล้ว
  D("V6", "X4", "[รีวิว F1 · §9 Q8 + R7] บิลค้างตัด (createSale ใน tx ของผู้เรียก · ลาเต้ S ×2) → คืน 1 แก้ว restock (ตัวรับคิวไม่พบ OUT = ไม่มี IN) → retryPendingStockCuts โดยเจ้าของ → {ok, cut ≥ 1, stillPending 0} · OUT ของบิล = ×2 · IN ของใบคืน = เมล็ด 18 นม 150 แก้ว12 1 ฝา 1 ที่ต้นทุน OUT เดิม · สต็อกสุทธิ = ก่อนขาย − 1 แก้ว (เมล็ด −18 นม −150 แก้ว12 −1 ฝา −1) · เรียกซ้ำ → InvMovement ของร้านไม่เพิ่ม"),
  // ── Z คืนสภาพ ──
  D("Z1", "-", "QC4 คืนสภาพ: ร้านชั่วคราว T + T2 เหลือ 0 แถวทุกตารางที่มี tenantId (RecipeLine PosRecipeChoiceLine PosProduct InvItem InvMovement InvLocationStock PosSale/Line/Payment OutboxEvent AuditLog AccountJournalEntry/Line …) · แถว Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0"),
  D("Z2", "-", "รอยของรอบนี้นอกร้านชั่วคราว = 0 (PosSale คีย์ · InvMovement ของบิลรอบนี้ · AuditLog/OutboxEvent ที่มีรหัสรอบ · Tenant slug) · ลายนิ้วมือร้านอื่น (RecipeLine/PosProduct/InvItem/PosRecipeChoiceLine นับ + แฮช) ก่อน/หลังพิมพ์เป็นข้อมูล"),
];

if (LIST) {
  console.log(`${SUITE} — ${CHECKS.length} ข้อ (id · X · หัวข้อ)`);
  for (const [id, x, t] of CHECKS) console.log(`${id}\t${x}\t${t}`);
  const byX = new Map<string, number>();
  for (const [, x] of CHECKS) byX.set(x, (byX.get(x) ?? 0) + 1);
  console.log(`X-coverage: ${[...byX.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  process.exit(0);
}

// ═════════════════════════ ตัวช่วยทั่วไป ═════════════════════════
const TITLE = new Map(CHECKS.map(([id, , t]) => [id, t]));
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: unknown, expected: unknown, actual: unknown): boolean {
  const full = id.startsWith("P2.3-") ? id : `P2.3-${id}`;
  if (!TITLE.has(full)) throw new Error(`ข้อสอบเรียก id ที่ไม่ได้ลงทะเบียน: ${full}`);
  const r = { ok: !!ok, expected: String(expected), actual: String(actual) };
  results.set(full, r);
  console.log(`  ${r.ok ? "✅" : "❌"} [${full}] ${TITLE.get(full)?.slice(0, 120)}${r.ok ? "" : ` — expected ${r.expected} | actual ${r.actual}`}`);
  return r.ok;
}
/** ห่อข้อสอบหนึ่งข้อ — throw = แดงพร้อมเหตุผล (ไม่ล้มทั้งชุด) */
async function step(id: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    chk(id, false, "ไม่ throw", `harness throw: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
  }
}
const rd = (p: string) => (existsSync(join(ROOT, p)) ? readFileSync(join(ROOT, p), "utf8") : "");
const short = (v: unknown, n = 220) => {
  let s: string;
  try {
    s = typeof v === "string" ? v : JSON.stringify(v);
  } catch {
    s = String(v);
  }
  return (s ?? "undefined").slice(0, n);
};
const codeOf = (r: Any): string => (r && r.ok === false ? String(r.code ?? "NO_CODE") : r && r.ok === true ? "OK" : r === undefined ? "undefined" : r === null ? "null" : typeof r === "string" ? "STRING" : "VALUE");
const refused = (r: Any, code: string) => r?.ok === false && String(r.code) === code;
function errCode(e: unknown): string {
  const o = e as { code?: unknown; message?: unknown } | null;
  if (o && typeof o.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(o.code)) return o.code;
  const m = /^([A-Z][A-Z0-9_]{3,})\b/.exec(String(o?.message ?? ""));
  if (m) return m[1]!;
  return "THROW";
}
const MISSING = "ยังไม่มีโมดูล/ฟังก์ชัน";
async function call(mod: Any, name: string, ...args: unknown[]): Promise<Any> {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} ${name}`, missing: true };
  try {
    return await fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
function callSync(mod: Any, name: string, ...args: unknown[]): Any {
  const fn = mod?.[name];
  if (typeof fn !== "function") return { ok: false, code: `MISSING:${name}`, message: `${MISSING} ${name}`, missing: true };
  try {
    return fn(...args);
  } catch (e) {
    return { ok: false, code: errCode(e), message: String((e as Error)?.message ?? e).slice(0, 200), threw: true };
  }
}
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
const THAI = /[ก-๛]/;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isRecord = (v: unknown): v is Record<string, Any> => !!v && typeof v === "object" && !Array.isArray(v);
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const PMAX = process.env.QC_ALL === "1" ? 99 : 8; // QC_ALL=1 = พิมพ์ทุกเหตุผล
const P8 = (p: string[]) => p.slice(0, PMAX).join(" · ") + (p.length > PMAX ? ` …(+${p.length - PMAX})` : "");
/** VAT รวมในราคา — สูตรเดียวกับ src/lib/money/vat.ts splitIncludedVat (ข้อสอบเขียนเอง ไม่ import) */
const vatOf = (g: number, bp: number) => {
  const den = 10_000 + bp;
  return g - Math.floor((2 * g * 10_000 + den) / (2 * den));
};
/** PRNG ตายตัว (mulberry32) */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(xs: readonly T[], R: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(R() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(o);
  }
  return o;
}
/** คีย์ทุกระดับของค่า (ใช้หา cost/margin ที่หลุดถึงผู้ไม่มีสิทธิ์) */
function allKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) allKeys(x, out);
  else if (isRecord(v)) for (const [k, x] of Object.entries(v)) {
    out.push(k);
    allKeys(x, out);
  }
  return out;
}

// ── ซอร์ส (สถิต) ──
function walk(dir: string, out: string[] = [], re = /\.(tsx|ts)$/): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const f of readdirSync(abs)) {
    const rel = `${dir}/${f}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out, re);
    else if (re.test(f)) out.push(rel);
  }
  return out;
}
// ตัดคอมเมนต์บรรทัดก่อนคอมเมนต์ก้อน — คอมเมนต์บรรทัดที่มี "/*" (เช่น path `/api/m/*`) จะไม่เปิดก้อนยาวกลืนโค้ด
const stripComments = (s: string) => s.replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const stripPrismaComments = (s: string) => s.replace(/\/\/.*$/gm, "");
const exportsFn = (src: string, n: string) => new RegExp(`export\\s+(async\\s+)?function\\s+${n}\\b|export\\s+const\\s+${n}\\b|export\\s*\\{[^}]*\\b${n}\\b[^}]*\\}`).test(src);
function prismaBlock(src: string, kind: "model" | "enum", name: string): string {
  const m = new RegExp(`\\b${kind}\\s+${name}\\s*\\{`).exec(src);
  if (!m) return "";
  const end = src.indexOf("\n}", m.index);
  return end < 0 ? "" : src.slice(m.index, end + 2);
}
const fieldLine = (block: string, f: string): string => (new RegExp(`^\\s*${f}\\s+[^\\n]*$`, "m").exec(block)?.[0] ?? "").trim();
const fieldNames = (block: string): string[] =>
  block
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter((l) => /^[a-zA-Z_]\w*\s+\S/.test(l))
    .map((l) => l.split(/\s+/)[0]!);
/** ช่วงของ const/ออบเจกต์ที่เริ่มด้วย marker (ถึงวงเล็บปิดคู่แรก) */
function constBody(src: string, marker: string): string {
  const i0 = src.indexOf(marker);
  if (i0 < 0) return "";
  const eq = src.indexOf("=", i0);
  if (eq < 0) return "";
  const i = eq + 1;
  const open = src.slice(i).search(/[[{]/);
  if (open < 0) return "";
  const start = i + open;
  const o = src[start]!;
  const c = o === "[" ? "]" : "}";
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    if (src[j] === o) depth++;
    else if (src[j] === c && --depth === 0) return src.slice(start, j + 1);
  }
  return "";
}
/** เนื้อฟังก์ชันที่ export (ถึงฟังก์ชัน export ตัวถัดไป) */
function fnBody(src: string, name: string): string {
  const m = new RegExp(`export\\s+(async\\s+)?function\\s+${name}\\b`).exec(src);
  if (!m) return "";
  const rest = src.slice(m.index + m[0].length);
  const next = rest.search(/\nexport\s/);
  return next < 0 ? rest : rest.slice(0, next);
}

const POS_DIR = "src/lib/modules/pos";
const F = {
  shared: `${POS_DIR}/recipe-shared.ts`,
  recipe: `${POS_DIR}/recipe.ts`,
  catalog: `${POS_DIR}/catalog.ts`,
  legacy: `${POS_DIR}/catalog-legacy.ts`,
  service: `${POS_DIR}/service.ts`,
  register: `${POS_DIR}/register.ts`,
  regActions: `${POS_DIR}/register-actions.ts`,
  invService: "src/lib/modules/inventory/service.ts",
  invIndex: "src/lib/modules/inventory/index.ts",
  scope: "src/lib/core/scope.ts",
  qcEnv: "scripts/pos-qc-env.mts",
  contract: "scripts/pos-sale-contract.json",
  integrations: "src/lib/pos-integrations.ts",
  msgTh: "src/messages/th/pos.json",
  msgEn: "src/messages/en/pos.json",
  ownerPending: "ledger/POS-OWNER-PENDING.md",
};
/** sha256 ของ scripts/pos-sale-contract.json — ORACLE-EDIT ผู้คุม 10 ต.ค.: re-pin ที่ 0c20c473 (merge P2.2 S เพิ่มคีย์บรรทัด priceSource/priceRuleId/listPriceSatang ตามสัญญา P2.2 · CD1: P2.3 ห้ามเปลี่ยนอีก) · เดิม b694aea0 = eaced8dc… */
const CONTRACT_SHA_B694 = "7a418de17b44bf7c54e9ee99a3cb740ae596fb6fb240978901e8a07b011697cd";
const MIGRATION_NAME = "20261205100000_pos_p23_recipe";
const RC_FIELDS = ["id", "tenantId", "productId", "product", "choiceId", "invItemId", "qtyDelta", "createdAt", "updatedAt"];
const RC_COLS = ["id", "tenantId", "productId", "choiceId", "invItemId", "qtyDelta", "createdAt", "updatedAt"];
const RL_FIELDS = ["id", "tenantId", "productId", "product", "invItemId", "qty", "createdAt", "updatedAt"];
const AUDIT = { recipe: "pos.product.recipe", choices: "pos.product.recipeChoices", retry: "pos.stock.retry" } as const;
const MSG_NO_RECIPE = "ยังไม่มีสูตร";

const srcOf = (f: string) => stripComments(rd(f));
const STATIC_IDS = ["ST1", "ST2", "ST3", "ST4"].map((x) => `P2.3-${x}`);
const PURE_IDS = ["E1", "E2", "E3", "E4"].map((x) => `P2.3-${x}`);
const skipReasons: string[] = [];
for (const f of [F.shared, F.recipe]) if (!existsSync(join(ROOT, f))) skipReasons.push(`${f} ยังไม่มี`);
for (const [f, names] of [
  [F.shared, ["expandRecipe", "RECIPE_MAX_COMPONENTS"]],
  [F.recipe, ["recipeCost"]],
  [F.catalog, ["setRecipeChoiceLines", "setBomEnabled"]],
  [F.service, ["retryPendingStockCuts"]],
  [F.invService, ["consumeBatch"]],
  [F.invIndex, ["consumeBatch"]],
] as [string, string[]][])
  for (const n of names) if (!exportsFn(srcOf(f), n)) skipReasons.push(`ยังไม่มี export ${n} (${f.split("/").slice(-2).join("/")})`);

/** ไฟล์ "shared" ไม่ import prisma/db/โมดูลฝั่งเซิร์ฟเวอร์ (ค่า) — เงื่อนไขที่ --no-db โหลดได้ */
const purePath = (f: string): boolean => {
  const s = srcOf(f);
  if (!s) return false;
  const valueImports = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
  const dyn = [...s.matchAll(/import\s*\(\s*["']([^"']+)["']/g)].map((m) => m[1]!);
  return ![...valueImports, ...dyn].some((p) => /@prisma\/client|\/db$|^\.\/db$|@\/lib\/core\/db|@\/lib\/modules\/(inventory|account|system)|^\.\/(catalog|catalog-legacy|recipe|register|service|bills|refund|refund-consumer|shift|reports|held-cart|channel|account-bridge)$/.test(p));
};

// ═════════════════════════ 1. ข้อสถิต (ไม่แตะ DB) ═════════════════════════
async function runStatic(): Promise<void> {
  console.log("\n── ST ข้อสถิต (ไม่แตะ DB) ──");
  const schemaSrc = walk("prisma/schema", [], /\.prisma$/).map((f) => stripPrismaComments(rd(f))).join("\n");
  // ST1 schema + migration
  {
    const p: string[] = [];
    const pp = prismaBlock(schemaSrc, "model", "PosProduct");
    const be = fieldLine(pp, "bomEnabled");
    if (!be) p.push("PosProduct ไม่มี bomEnabled");
    else if (!/^bomEnabled\s+Boolean\s+@default\(false\)/.test(be)) p.push(`PosProduct.bomEnabled = ${short(be, 60)} (คาด Boolean @default(false))`);
    if (!/^\s*\w+\s+PosRecipeChoiceLine\[\]/m.test(pp)) p.push("PosProduct ไม่มีฟิลด์ลิสต์ PosRecipeChoiceLine[]");
    const rc = prismaBlock(schemaSrc, "model", "PosRecipeChoiceLine");
    if (!rc) p.push("ไม่มี model PosRecipeChoiceLine");
    else {
      const names = fieldNames(rc).sort();
      if (short(names) !== short([...RC_FIELDS].sort())) p.push(`PosRecipeChoiceLine ฟิลด์ = ${names.join(",")} (คาด ${RC_FIELDS.join(",")})`);
      const typ = (f: string) => fieldLine(rc, f).split(/\s+/)[1] ?? "";
      for (const [f, t] of [["id", "String"], ["tenantId", "String"], ["productId", "String"], ["choiceId", "String"], ["invItemId", "String"], ["qtyDelta", "Int"], ["createdAt", "DateTime"], ["updatedAt", "DateTime"]] as const)
        if (fieldLine(rc, f) && typ(f) !== t) p.push(`PosRecipeChoiceLine.${f} ชนิด ${typ(f)} (คาด ${t})`);
      const rel = fieldLine(rc, "product");
      if (!/^product\s+PosProduct\s+@relation\(\s*fields:\s*\[\s*productId\s*\]\s*,\s*references:\s*\[\s*id\s*\]\s*,\s*onDelete:\s*Cascade\s*\)/.test(rel)) p.push(`product relation = ${short(rel, 90)} (คาด FK productId onDelete Cascade)`);
      if (!/@@unique\(\s*\[\s*productId\s*,\s*choiceId\s*,\s*invItemId\s*\]/.test(rc)) p.push("ไม่มี @@unique([productId, choiceId, invItemId])");
      if (!/@@index\(\s*\[\s*tenantId\s*\]\s*\)/.test(rc)) p.push("ไม่มี @@index([tenantId])");
      if (!/@@index\(\s*\[\s*invItemId\s*\]\s*\)/.test(rc)) p.push("ไม่มี @@index([invItemId])");
    }
    const rl = prismaBlock(schemaSrc, "model", "RecipeLine");
    if (short(fieldNames(rl).sort()) !== short([...RL_FIELDS].sort())) p.push(`RecipeLine ฟิลด์เปลี่ยน (${fieldNames(rl).join(",")})`);
    // migration
    const files = walk("prisma/migrations", [], /\.sql$/).filter((f) => /"PosRecipeChoiceLine"|"bomEnabled"/.test(rd(f)));
    if (files.length !== 1) p.push(`migration ที่แตะ PosRecipeChoiceLine/bomEnabled = ${files.length} ไฟล์ (คาด 1)`);
    for (const f of files) {
      const name = f.split("/").slice(-2, -1)[0] ?? "";
      if (name !== MIGRATION_NAME) p.push(`ชื่อ migration ${name} (คาด ${MIGRATION_NAME})`);
      let sql = rd(f).replace(/--.*$/gm, "");
      const doBlocks = [...sql.matchAll(/DO\s+\$\$([\s\S]*?)\$\$\s*;/gi)].map((m) => m[1]!);
      for (const b of doBlocks)
        if (!/ALTER\s+TABLE\s+"PosRecipeChoiceLine"\s+ADD\s+CONSTRAINT/i.test(b) || /\b(DROP|RENAME|DELETE|UPDATE|TRUNCATE|INSERT)\b/i.test(b)) p.push(`DO block ไม่ใช่ ADD CONSTRAINT ของ PosRecipeChoiceLine ล้วน (${short(b.replace(/\s+/g, " "), 60)})`);
      const inDo = doBlocks.join("\n");
      sql = sql.replace(/DO\s+\$\$[\s\S]*?\$\$\s*;/gi, "");
      const stmts = sql.split(";").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
      const ok = (s: string) =>
        /^(SET|RESET) lock_timeout\b/i.test(s) ||
        /^ALTER TABLE "PosProduct" ADD COLUMN (IF NOT EXISTS )?"bomEnabled" BOOLEAN NOT NULL DEFAULT false$/i.test(s) ||
        /^CREATE TABLE (IF NOT EXISTS )?"PosRecipeChoiceLine" \(/i.test(s) ||
        /^CREATE (UNIQUE )?INDEX (IF NOT EXISTS )?"[^"]+" ON "PosRecipeChoiceLine"/i.test(s) ||
        /^ALTER TABLE "PosRecipeChoiceLine" ADD CONSTRAINT "[^"]+" (FOREIGN KEY|CHECK)\b/i.test(s);
      const bad = stmts.filter((s) => !ok(s) || /\b(DROP|RENAME|TRUNCATE|DELETE FROM|UPDATE "|INSERT INTO|ALTER COLUMN)\b/i.test(s));
      if (bad.length) p.push(`${name}: คำสั่งนอกรายการอนุญาต (${short(bad[0], 90)})`);
      const all = stmts.join(";\n") + "\n" + inDo;
      if (!/ADD COLUMN (IF NOT EXISTS )?"bomEnabled" BOOLEAN NOT NULL DEFAULT false/i.test(all)) p.push('ไม่มี ADD COLUMN "bomEnabled" BOOLEAN NOT NULL DEFAULT false');
      const ct = stmts.find((s) => /^CREATE TABLE (IF NOT EXISTS )?"PosRecipeChoiceLine"/i.test(s)) ?? "";
      if (!ct) p.push('ไม่มี CREATE TABLE "PosRecipeChoiceLine"');
      else {
        const miss = RC_COLS.filter((c) => !new RegExp(`"${c}"`).test(ct));
        if (miss.length) p.push(`CREATE TABLE ขาด ${miss.join(",")}`);
        if (!/"qtyDelta" INTEGER NOT NULL/i.test(ct)) p.push('"qtyDelta" ไม่ใช่ INTEGER NOT NULL');
      }
      if (!/CHECK \(?\s*\(?"qtyDelta"\s*(<>|!=)\s*0\s*\)?/i.test(all)) p.push('ไม่มี CHECK ("qtyDelta" <> 0)');
      if (!/CREATE UNIQUE INDEX (IF NOT EXISTS )?"[^"]+" ON "PosRecipeChoiceLine" ?\( ?"productId" ?, ?"choiceId" ?, ?"invItemId" ?\)/i.test(all)) p.push('ไม่มี unique ("productId","choiceId","invItemId")');
      if (!/CREATE INDEX (IF NOT EXISTS )?"[^"]+" ON "PosRecipeChoiceLine" ?\( ?"tenantId" ?\)/i.test(all)) p.push('ไม่มี index ("tenantId")');
      if (!/CREATE INDEX (IF NOT EXISTS )?"[^"]+" ON "PosRecipeChoiceLine" ?\( ?"invItemId" ?\)/i.test(all)) p.push('ไม่มี index ("invItemId")');
      if (!/FOREIGN KEY ?\( ?"productId" ?\) REFERENCES "PosProduct" ?\( ?"id" ?\) ON DELETE CASCADE/i.test(all)) p.push("ไม่มี FK productId → PosProduct ON DELETE CASCADE");
      if (!/lock_timeout/i.test(all)) p.push("ไม่มี SET lock_timeout");
    }
    chk("ST1", p.length === 0, "bomEnabled + PosRecipeChoiceLine + migration เดียวเพิ่มล้วน", P8(p) || `ครบ (${files[0] ?? "—"})`);
  }
  // ST2 ลงทะเบียน
  {
    const p: string[] = [];
    const sc = srcOf(F.scope);
    if (!/\bPosRecipeChoiceLine\s*:\s*tenant\b/.test(sc)) p.push("scope.ts ไม่มี PosRecipeChoiceLine: tenant");
    if (!/\bRecipeLine\s*:\s*tenant\b/.test(sc)) p.push("scope.ts RecipeLine ไม่ใช่ tenant แล้ว");
    const env = srcOf(F.qcEnv);
    const pm = env.slice(env.indexOf("export const POS_MODELS"), env.indexOf("export type PosModelKey"));
    if (!/\bposRecipeChoiceLine\s*:\s*\{[^}]*model:\s*"PosRecipeChoiceLine"/.test(pm)) p.push('pos-qc-env POS_MODELS ไม่มี posRecipeChoiceLine {model: "PosRecipeChoiceLine"}');
    if (/"PosRecipeChoiceLine"/.test(constBody(env, "export const POS_FUTURE_MODELS"))) p.push("PosRecipeChoiceLine อยู่ใน POS_FUTURE_MODELS");
    const leaves = (o: unknown, pre = ""): [string, string][] => (typeof o === "string" ? [[pre, o]] : isRecord(o) ? Object.entries(o).flatMap(([k, v]) => leaves(v, pre ? `${pre}.${k}` : k)) : []);
    const blocks: Record<string, [string, string][]> = {};
    for (const [lang, f] of [["th", F.msgTh], ["en", F.msgEn]] as const) {
      let j: Any = null;
      try {
        j = JSON.parse(rd(f) || "null");
      } catch (e) {
        p.push(`${f} อ่าน JSON ไม่ได้: ${(e as Error).message.slice(0, 40)}`);
      }
      const lv = leaves(j?.recipe);
      blocks[lang] = lv;
      if (!lv.length) p.push(`${lang}: ไม่มีก้อนข้อความ recipe.*`);
      else if (lang === "th" && !lv.some(([, s]) => THAI.test(s))) p.push("th: recipe.* ไม่มีข้อความไทย");
      else if (lang === "en" && lv.some(([, s]) => THAI.test(s))) p.push(`en: recipe.* มีอักษรไทย (${lv.filter(([, s]) => THAI.test(s)).map(([k]) => k).slice(0, 3).join(",")})`);
    }
    const kt = (blocks.th ?? []).map(([k]) => k).sort();
    const ke = (blocks.en ?? []).map(([k]) => k).sort();
    if (kt.length && ke.length && short(kt, 4000) !== short(ke, 4000)) p.push(`คีย์ recipe.* th/en ไม่ตรงกัน (th ${kt.length} · en ${ke.length})`);
    chk("ST2", p.length === 0, "scope · POS_MODELS · ข้อความ recipe.* th/en", P8(p) || `ครบ (${kt.length} คีย์)`);
  }
  // ST3 ขอบเขตโมดูล
  {
    const p: string[] = [];
    if (!existsSync(join(ROOT, F.shared))) p.push("ไม่มี recipe-shared.ts");
    else if (!purePath(F.shared)) p.push("recipe-shared.ts import prisma/db/โมดูลเซิร์ฟเวอร์ (ต้องบริสุทธิ์)");
    for (const [f, names] of [
      [F.shared, ["expandRecipe", "RECIPE_MAX_COMPONENTS"]],
      [F.recipe, ["recipeCost"]],
      [F.catalog, ["setRecipeChoiceLines", "setBomEnabled"]],
      [F.service, ["retryPendingStockCuts"]],
      [F.invService, ["consumeBatch"]],
    ] as [string, string[]][])
      for (const n of names) if (!exportsFn(srcOf(f), n)) p.push(`${f.split("/").slice(-2).join("/")} ไม่ export ${n}`);
    // facade + รอยต่อ
    const idxRaw = rd(F.invIndex);
    const lines = idxRaw.split("\n");
    const mk = lines.findIndex((l) => /POS P2\.3\s*▸/.test(l));
    if (mk < 0) p.push("inventory/index.ts ไม่มีรอยต่อ // POS P2.3 ▸ … ◂");
    else if (!/consumeBatch/.test(lines.slice(mk, mk + 8).join("\n"))) p.push("consumeBatch ไม่อยู่ในรอยต่อ POS P2.3 ของ inventory/index.ts (≤ 8 บรรทัด)");
    if (!exportsFn(stripComments(idxRaw), "consumeBatch")) p.push("inventory/index.ts ไม่ re-export consumeBatch");
    // POS ใช้ consumeBatch ผ่าน facade เท่านั้น
    const posFiles = walk(POS_DIR);
    const users = posFiles.filter((f) => /\bconsumeBatch\b/.test(srcOf(f)));
    for (const f of users) {
      const s = srcOf(f);
      const named = /import\s*\{[^}]*\bconsumeBatch\b[^}]*\}\s*from\s*["']@\/lib\/modules\/inventory["']/.test(s);
      const ns = [...s.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+["']@\/lib\/modules\/inventory["']/g)].map((m) => m[1]!);
      const viaNs = ns.some((n) => new RegExp(`\\b${n}\\.consumeBatch\\s*\\(`).test(s));
      if (!named && !viaNs) p.push(`${f.split("/").pop()} ใช้ consumeBatch ไม่ผ่าน @/lib/modules/inventory`);
      const svcNs = [...s.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+["']@\/lib\/modules\/inventory\/service["']/g)].map((m) => m[1]!);
      if (svcNs.some((n) => new RegExp(`\\b${n}\\.consumeBatch\\b`).test(s)) || /import\s*\{[^}]*\bconsumeBatch\b[^}]*\}\s*from\s*["'][^"']*inventory\/service["']/.test(s)) p.push(`${f.split("/").pop()} เรียก consumeBatch จาก inventory/service ตรง`);
    }
    const csi = fnBody(srcOf(F.service), "consumeSaleInventory");
    if (!csi) p.push("service.ts ไม่มี consumeSaleInventory");
    else {
      if (!/\bconsumeBatch\s*\(/.test(csi)) p.push("consumeSaleInventory ไม่เรียก consumeBatch(");
      if (/\.consume\s*\(/.test(csi)) p.push("consumeSaleInventory ยังเรียก .consume( ทีละส่วน");
    }
    // ผู้เขียนเดียว (F15.1) + C-1
    const W = "(create|createMany|update|updateMany|upsert|delete|deleteMany)";
    for (const f of walk("src")) {
      const s = srcOf(f);
      if (new RegExp(`\\.recipeLine\\.${W}\\b`).test(s) && f !== F.catalog && f !== F.legacy) p.push(`${f} เขียน RecipeLine (ต้อง catalog.ts)`);
      if (new RegExp(`\\.posRecipeChoiceLine\\.${W}\\b`).test(s) && f !== F.catalog) p.push(`${f} เขียน PosRecipeChoiceLine (ต้อง catalog.ts)`);
    }
    for (const f of posFiles) {
      const s = srcOf(f);
      if (new RegExp(`\\.invMovement\\.${W}\\b`).test(s)) p.push(`${f.split("/").pop()} เขียน InvMovement ตรง (C-1)`);
      if (/onHand\s*:\s*\{\s*(increment|decrement)|"onHand"\s*=\s*"onHand"/.test(s)) p.push(`${f.split("/").pop()} แก้ onHand ตรง (C-1)`);
    }
    // 'use client'
    for (const f of walk("src")) {
      const raw = rd(f);
      const first = raw.replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart();
      if (!/^["']use client["']/.test(first)) continue;
      const s = stripComments(raw);
      const imps = [...s.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]!);
      const bad = imps.filter((x) => /modules\/pos\/(recipe|catalog|service|register)$|modules\/inventory(\/|$)/.test(x));
      if (bad.length) p.push(`${f} ('use client') import ${bad.join(",")}`);
    }
    const own = rd(F.ownerPending).split("\n").filter((l) => /P2\.3/.test(l));
    if (!own.some((l) => /consumeBatch/.test(l))) p.push("POS-OWNER-PENDING.md ไม่มีบรรทัด P2.3 เรื่อง consumeBatch (เจ้าของโมดูลคลัง)");
    if (!own.some((l) => /หน่วยซื้อ|purchase.?unit/i.test(l))) p.push("POS-OWNER-PENDING.md ไม่มีบรรทัด P2.3 เรื่องหน่วยซื้อ (Q6)");
    if (!own.some((l) => /ความละเอียดต้นทุน|ต้นทุนละเอียด|cost precision/i.test(l))) p.push("POS-OWNER-PENDING.md ไม่มีบรรทัด P2.3 เรื่องความละเอียดต้นทุน (Q6)");
    chk("ST3", p.length === 0, "บริสุทธิ์ · export ครบ · facade + รอยต่อ · batch · ผู้เขียนเดียว · C-1 · use client · โน้ตเจ้าของ", P8(p) || `ครบ (${users.length} ไฟล์ใช้ consumeBatch)`);
  }
  // ST4 สัญญา + use server
  {
    const p: string[] = [];
    const raw = existsSync(join(ROOT, F.contract)) ? readFileSync(join(ROOT, F.contract)) : Buffer.from("");
    const h = createHash("sha256").update(raw).digest("hex");
    if (h !== CONTRACT_SHA_B694) p.push(`pos-sale-contract.json เปลี่ยน (sha ${h.slice(0, 12)} ≠ ${CONTRACT_SHA_B694.slice(0, 12)})`);
    // ORACLE-EDIT P2.3U (ข้อเสนอ · นอกมติ 8 — ผู้คุมตัดสิน): P2.3U พลิก bomDeduct เป็น live ตามมติ 8 ⇒ ST4 ยึดค่าหลังพลิก · เดิม ["bomDeduct", false, "P2.3"]
    if (!/\["bomDeduct",\s*true,\s*null\]/.test(srcOf(F.integrations))) p.push('pos-integrations INVENTORY ไม่ใช่ ["bomDeduct", true, null] (พลิกแล้วใน P2.3U)');
    const files = walk(POS_DIR).filter((f) => /^["']use server["']/.test(rd(f).replace(/^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, "").trimStart()));
    for (const f of files) {
      const bad = [...srcOf(f).matchAll(/^\s*export\s+[^\n]*/gm)].map((m) => m[0].trim()).filter((l) => !/^export\s+async\s+function\s+\w+/.test(l));
      if (bad.length) p.push(`${f.split("/").pop()}: export ที่ไม่ใช่ async function (${short(bad.map((b) => b.slice(0, 40)), 100)})`);
    }
    const ra = srcOf(F.regActions);
    const starts = [...ra.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g)].map((m) => ({ name: m[1]!, at: m.index! }));
    const i = starts.findIndex((x) => x.name === "retryPendingStockCutsAction");
    if (i < 0) p.push("register-actions.ts ไม่มี retryPendingStockCutsAction");
    else {
      const body = ra.slice(starts[i]!.at, i + 1 < starts.length ? starts[i + 1]!.at : ra.length);
      if (!/\bretryPendingStockCuts\s*\(/.test(body)) p.push("retryPendingStockCutsAction ไม่เรียก retryPendingStockCuts");
      if (!/\bcatch\b/.test(body)) p.push("retryPendingStockCutsAction ไม่มี catch");
    }
    chk("ST4", p.length === 0, "สัญญา createSale ตรงฐาน · bomDeduct true (live) · use server · action ตัดสต็อกค้าง", P8(p) || `ครบ (${files.length} ไฟล์ use server)`);
  }
}

// ═════════════════════════ 1b. กระจายสูตรบริสุทธิ์ (ไม่แตะ DB) ═════════════════════════
// id ปลอม (สตริง ASCII) — ลำดับที่คาด = เทียบรหัสอักขระ (เดียวกับ COLLATE "C")
const FI = { beans: "inv-a-beans", cup12: "inv-b-cup12", cup16: "inv-c-cup16", lid: "inv-d-lid", milk: "inv-e-milk", oat: "inv-f-oat" } as const;
const FC = { S: "ch-s", M: "ch-m", OAT: "ch-oat", SHOT: "ch-shot", NOMILK: "ch-nomilk", NOPE: "ch-unknown" } as const;
const PURE_BASE = [
  { invItemId: FI.milk, qty: 150 },
  { invItemId: FI.beans, qty: 18 },
  { invItemId: FI.lid, qty: 1 },
  { invItemId: FI.cup12, qty: 1 },
];
const PURE_CHOICES = [
  { choiceId: FC.M, invItemId: FI.beans, qtyDelta: 6 },
  { choiceId: FC.M, invItemId: FI.milk, qtyDelta: 50 },
  { choiceId: FC.M, invItemId: FI.cup12, qtyDelta: -1 },
  { choiceId: FC.M, invItemId: FI.cup16, qtyDelta: 1 },
  { choiceId: FC.OAT, invItemId: FI.milk, qtyDelta: -150 },
  { choiceId: FC.OAT, invItemId: FI.oat, qtyDelta: 150 },
  { choiceId: FC.SHOT, invItemId: FI.beans, qtyDelta: 9 },
  { choiceId: FC.NOMILK, invItemId: FI.milk, qtyDelta: -200 },
];
const compKey = (xs: unknown): string => (Array.isArray(xs) ? xs.map((c: Any) => `${c?.invItemId}×${c?.qty}`).join(",") : `ไม่ใช่อาร์เรย์:${short(xs, 60)}`);
const expKey = (spec: [string, number][]): string => [...spec].sort((a, b) => byId(a[0], b[0])).map(([i, q]) => `${i}×${q}`).join(",");

async function runPure(shared: Any): Promise<void> {
  console.log("\n── E กระจายสูตร (บริสุทธิ์) ──");
  const NS = shared && typeof shared.expandRecipe === "function" ? "" : `${MISSING} expandRecipe (recipe-shared.ts) · `;
  const ex = (lines: unknown, choiceLines: unknown, choiceIds: unknown) => callSync(shared, "expandRecipe", { lines, choiceLines, choiceIds });
  // E1
  {
    const p: string[] = [];
    const r = ex(PURE_BASE, PURE_CHOICES, []);
    if (r?.ok !== true) p.push(`ฐาน → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      const want = expKey([[FI.beans, 18], [FI.cup12, 1], [FI.lid, 1], [FI.milk, 150]]);
      if (compKey(r.components) !== want) p.push(`components ${compKey(r.components)} (คาด ${want})`);
      for (const c of Array.isArray(r.components) ? r.components : []) {
        if (short(Object.keys(c).sort()) !== short(["invItemId", "qty"])) p.push(`คีย์ ${Object.keys(c).join(",")}`);
        if (!Number.isInteger(c.qty)) p.push(`qty ไม่ใช่จำนวนเต็ม ${c.qty}`);
      }
    }
    const r2 = ex(PURE_BASE, [], [FC.S]);
    if (r2?.ok !== true || compKey(r2.components) !== expKey([[FI.beans, 18], [FI.cup12, 1], [FI.lid, 1], [FI.milk, 150]])) p.push(`เลือก S (ไม่มี delta) → ${codeOf(r2)} ${compKey(r2?.components)}`);
    chk("E1", NS === "" && p.length === 0, "ฐาน 4 รายการเรียง id · คีย์พอดี", NS + (P8(p) || "ครบ"));
  }
  // E2
  {
    const p: string[] = [];
    const want = expKey([[FI.beans, 33], [FI.cup16, 1], [FI.lid, 1], [FI.milk, 50], [FI.oat, 150]]);
    const r = ex(PURE_BASE, PURE_CHOICES, [FC.M, FC.OAT, FC.SHOT]);
    if (r?.ok !== true || compKey(r.components) !== want) p.push(`M+โอ๊ต+ช็อต → ${codeOf(r)} ${compKey(r?.components)} (คาด ${want})`);
    const r2 = ex(PURE_BASE, PURE_CHOICES, [FC.M, FC.OAT, FC.SHOT, FC.NOPE, FC.S]);
    if (r2?.ok !== true || compKey(r2.components) !== want) p.push(`+ choiceId ไม่รู้จัก/ไม่มี delta → ${codeOf(r2)} ${compKey(r2?.components)}`);
    const rM = ex(PURE_BASE, PURE_CHOICES, [FC.M]);
    const wantM = expKey([[FI.beans, 24], [FI.cup16, 1], [FI.lid, 1], [FI.milk, 200]]);
    if (rM?.ok !== true || compKey(rM.components) !== wantM) p.push(`M → ${compKey(rM?.components)} (คาด ${wantM})`);
    chk("E2", NS === "" && p.length === 0, "รวมต่อสินค้า · แก้ว12 สุทธิ 0 ทิ้ง · id แปลกไม่มีผล", NS + (P8(p) || "ครบ"));
  }
  // E3
  {
    const p: string[] = [];
    const r = ex(PURE_BASE, PURE_CHOICES, [FC.NOMILK]);
    const want = expKey([[FI.beans, 18], [FI.cup12, 1], [FI.lid, 1]]);
    if (r?.ok !== true || compKey(r.components) !== want) p.push(`ไม่ใส่นม → ${codeOf(r)} ${compKey(r?.components)} (คาด ${want})`);
    if (r?.ok === true && (r.components as Any[]).some((c) => c.qty <= 0)) p.push("มีจำนวน ≤ 0");
    const ro = ex(PURE_BASE, PURE_CHOICES, [FC.OAT]);
    const wantO = expKey([[FI.beans, 18], [FI.cup12, 1], [FI.lid, 1], [FI.oat, 150]]);
    if (ro?.ok !== true || compKey(ro.components) !== wantO) p.push(`S+โอ๊ต (นมสุทธิ 0) → ${compKey(ro?.components)} (คาด ${wantO})`);
    const R = rng(23_023);
    const ref = short(ex(PURE_BASE, PURE_CHOICES, [FC.M, FC.OAT, FC.SHOT]), 2000);
    let diff = 0;
    for (let i = 0; i < 24; i++) {
      const out = ex(shuffle(PURE_BASE, R), shuffle(PURE_CHOICES, R), shuffle([FC.M, FC.OAT, FC.SHOT], R));
      if (short(out, 2000) !== ref) diff++;
    }
    if (diff) p.push(`${diff}/24 ลำดับให้ผลต่าง`);
    const fz = deepFreeze({ l: PURE_BASE.map((x) => ({ ...x })), c: PURE_CHOICES.map((x) => ({ ...x })), i: [FC.M, FC.OAT] });
    const rf = ex(fz.l, fz.c, fz.i);
    if (rf?.ok !== true) p.push(`อินพุต freeze → ${codeOf(rf)}${rf?.threw ? " (throw — แก้อินพุต?)" : ""}`);
    chk("E3", NS === "" && p.length === 0, "clamp ทิ้ง ≤ 0 · ลำดับไม่มีผล · ไม่แก้อินพุต", NS + (P8(p) || "ครบ"));
  }
  // E4
  {
    const p: string[] = [];
    if (shared?.RECIPE_MAX_COMPONENTS !== 50) p.push(`RECIPE_MAX_COMPONENTS = ${short(shared?.RECIPE_MAX_COMPONENTS, 10)}`);
    const many = (n: number, pre = "x") => Array.from({ length: n }, (_, i) => ({ invItemId: `${pre}${String(i).padStart(3, "0")}`, qty: 1 }));
    const r50 = ex(many(50), [], []);
    if (r50?.ok !== true || (r50.components as Any[]).length !== 50) p.push(`50 → ${codeOf(r50)} ${Array.isArray(r50?.components) ? r50.components.length : "-"}`);
    const r51 = ex(many(51), [], []);
    if (!refused(r51, "INVALID_LINE") || r51?.threw || !THAI.test(String(r51?.message ?? "")) || !/50/.test(String(r51?.message ?? ""))) p.push(`51 → ${codeOf(r51)}${r51?.threw ? " (throw)" : ""} ${short(r51?.message ?? "", 60)}`);
    const add2 = [{ choiceId: "c-add", invItemId: "y001", qtyDelta: 1 }, { choiceId: "c-add", invItemId: "y002", qtyDelta: 1 }];
    const r49 = ex(many(49), add2, ["c-add"]);
    if (!refused(r49, "INVALID_LINE")) p.push(`49 + ตัวเลือก 2 ใหม่ → ${codeOf(r49)}`);
    const swap = [{ choiceId: "c-swap", invItemId: "x000", qtyDelta: -1 }, { choiceId: "c-swap", invItemId: "y009", qtyDelta: 1 }];
    const rs = ex(many(50), swap, ["c-swap"]);
    if (rs?.ok !== true || (rs.components as Any[]).length !== 50) p.push(`50 ลบ 1 เพิ่ม 1 → ${codeOf(rs)} ${Array.isArray(rs?.components) ? rs.components.length : "-"}`);
    chk("E4", NS === "" && p.length === 0, "เพดาน 50 นับหลังรวม/ทิ้ง · 51 = INVALID_LINE ไม่ throw", NS + (P8(p) || "ครบ"));
  }
}

// ═════════════════════════ 1c. --no-db ═════════════════════════
if (NODB) {
  const ids = [...STATIC_IDS, ...PURE_IDS];
  console.log(`[${SUITE}] --no-db: รัน ${ids.length} ข้อ (สถิต + กระจายสูตรบริสุทธิ์ · ไม่โหลด prisma)`);
  let crashedS = "";
  try {
    await runStatic();
    const shared = existsSync(join(ROOT, F.shared)) && purePath(F.shared) ? await tryImport("@/lib/modules/pos/recipe-shared") : null;
    if (existsSync(join(ROOT, F.shared)) && !purePath(F.shared)) console.log("  ⚠️  recipe-shared.ts ไม่บริสุทธิ์ — --no-db ไม่โหลด (E แดง)");
    await runPure(shared);
  } catch (e) {
    crashedS = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
    console.log(`💥 harness: ${crashedS}`);
  }
  for (const id of ids) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashedS ? `ไม่ถึง (harness ล้ม: ${crashedS.slice(0, 80)})` : "ไม่ถึง");
  const failedN = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failedN.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failedN.length, failed: failedN, skipped: false, registered: CHECKS.length, missing: skipReasons })}`);
  process.exit(failedN.length ? 1 : 0);
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mjs" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const TIDS = envMod.PQC_TENANT_IDS as string[];
const HOST = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "?";
  }
})();
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: จะเขียนแถวได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}

// ═════════════════════════ 3. ด่าน SKIP + ลายนิ้วมือก่อน ═════════════════════════
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const RC: Any = typeof P.posRecipeChoiceLine?.findMany === "function" ? P.posRecipeChoiceLine : null;
if (!RC) skipReasons.push("Prisma client ยังไม่มี delegate posRecipeChoiceLine");
const dbCols = new Set<string>();
try {
  const rows = (await P.$queryRawUnsafe(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name IN ('PosProduct','PosRecipeChoiceLine')`)) as Any[];
  for (const r of rows) dbCols.add(`${r.table_name}.${r.column_name}`);
} catch (e) {
  console.log(`  (อ่าน information_schema ไม่ได้: ${(e as Error).message.slice(0, 100)})`);
}
const COL = { bom: dbCols.has("PosProduct.bomEnabled"), table: dbCols.has("PosRecipeChoiceLine.qtyDelta") };
if (!COL.bom) skipReasons.push("ฐาน QC4 ยังไม่มีคอลัมน์ PosProduct.bomEnabled");
if (!COL.table) skipReasons.push("ฐาน QC4 ยังไม่มีตาราง PosRecipeChoiceLine");

/** ลายนิ้วมือของร้านที่ไม่ใช่ร้านชั่วคราวของข้อสอบนี้ (ข้อมูล — lane อื่นเขียนพร้อมกันได้) */
async function fingerprint(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const tb of ["RecipeLine", "PosRecipeChoiceLine", "PosProduct", "InvItem"]) {
    if (tb === "PosRecipeChoiceLine" && !COL.table) {
      out[tb] = "ไม่มีตาราง";
      continue;
    }
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."updatedAt"::text, ''), ',' ORDER BY x.id)), '-') AS h
         FROM "${tb}" x WHERE NOT (x."tenantId" IN (SELECT id FROM "Tenant" WHERE slug LIKE 'posqc-p23-%'))`,
      )) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 12)}`;
    } catch (e) {
      out[tb] = `err:${(e as Error).message.slice(0, 40)}`;
    }
  }
  return out;
}
if (skipReasons.length > 0 && !FORCE) {
  console.log(`⏭️  SKIPPED — ${SUITE}: ของใบ P2.3 ยังไม่มี (ถูกต้องสำหรับข้อสอบที่เขียนก่อนสร้าง) · DB ${HOST}`);
  for (const r of skipReasons) console.log(`   • ${r}`);
  console.log(`   ข้อสอบ ${CHECKS.length} ข้อ (ดู --list) · QC_FORCE=1 = รันทั้งที่ยังไม่มีของ (ต้องแดงตามเหตุผล · PAR เขียว)`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: 0, passed: 0, failed: [], skipped: true, reason: skipReasons, registered: CHECKS.length })}`);
  await P.$disconnect?.().catch?.(() => {});
  process.exit(0);
}
if (FORCE && skipReasons.length) console.log(`⚠️  QC_FORCE=1 — ข้ามด่าน SKIP ทั้งที่ยังขาด ${skipReasons.length} อย่าง (คาด: แดงตามเหตุผล ไม่ crash · PAR เขียว)`);
const fpBefore = await fingerprint();

// ═════════════════════════ 4. โหลดโมดูล ═════════════════════════
const ex = (f: string) => existsSync(join(ROOT, f));
const sharedMod = ex(F.shared) ? await tryImport("@/lib/modules/pos/recipe-shared") : null;
const recipeMod = ex(F.recipe) ? await tryImport("@/lib/modules/pos/recipe") : null;
const catalog = await tryImport("@/lib/modules/pos/catalog");
const legacy = await tryImport("@/lib/modules/pos/catalog-legacy");
const svc = await tryImport("@/lib/modules/pos/service");
const register = await tryImport("@/lib/modules/pos/register");
const heldMod = await tryImport("@/lib/modules/pos/held-cart");
const shiftMod = await tryImport("@/lib/modules/pos/shift");
const devMod = await tryImport("@/lib/modules/pos/device");
const refundMod = await tryImport("@/lib/modules/pos/refund");
const reportsMod = await tryImport("@/lib/modules/pos/reports");
const settingsGen = await tryImport("@/lib/modules/pos/settings-general");
const invSvc = await tryImport("@/lib/modules/inventory/service");
const invFacade = await tryImport("@/lib/modules/inventory");
const restMenu = await tryImport("@/lib/modules/restaurant/menu");
const sysSvc = await tryImport("@/lib/modules/system/service");
const accSvc = await tryImport("@/lib/modules/account/service");
const glMod = await tryImport("@/lib/modules/account/gl");
const consMod = await tryImport("@/lib/outbox-consumers");

const RAND = Math.random().toString(36).slice(2, 8);
const TAG = `qc-p2.3-${RAND}`;
const T_SLUG = `posqc-p23-${RAND}`;
const T2_SLUG = `posqc-p23-${RAND}-t2`;
const EMAIL_PREFIX = `${T_SLUG}-`;
const KEY_PREFIX = `qc23-${RAND}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let T = "";
let T2 = "";
const RUN_START = Date.now();
const MIN = 60_000;
const MY_SALES: string[] = [];

// ── ตัวกั้นเครือข่าย ──
const realFetch = globalThis.fetch;
const guardHits: string[] = [];
function installFetchGuard() {
  globalThis.fetch = (async (input: Any) => {
    let host = "?";
    try {
      host = new URL(typeof input === "string" ? input : String(input?.url ?? input)).host;
    } catch {
      /* ไม่ใช่ URL */
    }
    guardHits.push(host);
    return new Response(`blocked by ${SUITE}`, { status: 503 });
  }) as typeof fetch;
}
function removeFetchGuard() {
  globalThis.fetch = realFetch;
}
async function drain(): Promise<void> {
  for (let i = 0; i < 2; i++) {
    try {
      if (typeof consMod?.drainAll === "function") await consMod.drainAll();
    } catch (e) {
      console.log(`  (drainAll ล้ม: ${(e as Error).message.slice(0, 100)})`);
    }
  }
}

// ═════════════════════════ 5. ข้อที่ต้องมี DB ═════════════════════════
async function runDb() {
  assertQc4BeforeWrite();
  installFetchGuard();
  console.log(`\n── ร้านชั่วคราว ${T_SLUG} (+ ${T2_SLUG}) · DB ${HOST} ──`);
  console.log("   POS (สาขา A + B) · คลัง I1 ผูก A · คลัง I2 ไม่ผูกสาขาของ POS · บัญชี VAT ผูก POS · B ไม่มีคลัง · ร้าน T2 มีคลังของตัวเอง");
  let fx = "";
  const U: Record<string, string> = {};
  const S: Record<string, string> = {};
  const US: Record<string, { id: string; role: string; unitAccess: string[]; perms: Record<string, boolean> }> = {};
  const INV: Record<string, string> = {};
  const NAME_OF = new Map<string, string>(); // id → ชื่อเล่น (InvItem / ตัวเลือก)
  const PR: Record<string, string> = {}; // ชื่อเล่น → PosProduct.id
  const G: Record<string, { id: string; c: Record<string, string> }> = {};
  try {
    T = (await P.tenant.create({ data: { name: `QC P2.3 สูตร ${RAND}`, slug: T_SLUG } })).id;
    T2 = (await P.tenant.create({ data: { name: `QC P2.3 ร้านที่สอง ${RAND}`, slug: T2_SLUG } })).id;
    for (const k of ["A", "B"]) U[k] = (await P.businessUnit.create({ data: { tenantId: T, type: "SHOP", name: `${TAG} สาขา${k}`, slug: `${T_SLUG}-${k.toLowerCase()}` } })).id;
    U.X = (await P.businessUnit.create({ data: { tenantId: T2, type: "SHOP", name: `${TAG} สาขาX`, slug: `${T2_SLUG}-x` } })).id;
    S.POS = (await sysSvc.createSystem(T, "POS", `POS ${RAND}`)).id;
    S.I1 = (await sysSvc.createSystem(T, "INVENTORY", `คลังหลัก ${RAND}`)).id;
    S.I2 = (await sysSvc.createSystem(T, "INVENTORY", `คลังอื่น ${RAND}`)).id;
    S.ACC = (await sysSvc.createSystem(T, "ACCOUNT", `บัญชี ${RAND}`)).id;
    S.XINV = (await sysSvc.createSystem(T2, "INVENTORY", `คลังร้าน T2 ${RAND}`)).id;
    await accSvc.saveSettings(T, S.ACC, { orgName: `ร้านสูตรคิวซี ${RAND} จำกัด`, taxId: "0105561177639", vatRegistered: true });
    await glMod.ensureAccounting({ tenantId: T, systemId: S.ACC });
    await P.accountSystemLink.create({ data: { tenantId: T, systemId: S.ACC, linkedKind: "POS", linkedId: S.POS } });
    await sysSvc.linkUnit(T, S.POS, U.A);
    await sysSvc.linkUnit(T, S.POS, U.B);
    await sysSvc.linkUnit(T, S.I1, U.A);
    await sysSvc.linkUnit(T2, S.XINV, U.X);
  } catch (e) {
    fx = `ร้านชั่วคราว:${(e as Error).message.slice(0, 160)}`;
    console.log(`  ⚠️  ${fx}`);
  }
  // ผู้ใช้ + Membership จริง (ตัวเขียนแคตตาล็อกโหลดสิทธิ์จาก Membership)
  const spec: [string, string, string[], Record<string, boolean>][] = [
    ["OWNER", "OWNER", ["*"], {}],
    ["MGR", "MANAGER", [U.A ?? "-"], {}],
    ["STAFF", "STAFF", [U.A ?? "-"], { "pos.sale.create": true, "pos.sale.read": true }],
    ["STAFFR", "STAFF", [U.A ?? "-"], { "pos.sale.create": true, "pos.report.view": true }],
  ];
  if (!fx) {
    try {
      for (const [k, role, unitAccess, perms] of spec) {
        const u = await P.user.create({ data: { email: `${EMAIL_PREFIX}${k.toLowerCase()}@qc.invalid`, name: `${k} คิวซี${RAND}` } });
        await P.membership.create({ data: { userId: u.id, tenantId: T, role, unitAccess, permissions: perms, acceptedAt: new Date() } });
        US[k] = { id: u.id, role, unitAccess, perms };
      }
    } catch (e) {
      fx = `ผู้ใช้:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const uid = (k: string) => US[k]?.id ?? `none-${k}`;
  const A = (k: string): Any => (US[k] ? { userId: US[k]!.id, role: US[k]!.role, unitAccess: [...US[k]!.unitAccess], permissions: { ...US[k]!.perms } } : { userId: `none-${k}`, role: "STAFF", unitAccess: [], permissions: {} });
  const cc = (k: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", actorUserId: uid(k) });
  const rctx = (k: string): Any => ({ tenantId: T, systemId: S.POS ?? "none", actor: A(k) });
  const DEV1 = `qc23${RAND}d1`;
  const ctxA = (dev = true): Any => ({ tenantId: T, systemId: S.POS ?? "none", unitId: U.A ?? "none", ...(dev ? { deviceId: DEV1 } : {}) });
  const ctxB = (): Any => ({ tenantId: T, systemId: S.POS ?? "none", unitId: U.B ?? "none" });
  const invCtx = (sys = S.I1, tid = T): Any => ({ tenantId: tid, systemId: sys ?? "none", actorUserId: uid("OWNER") });

  // ─── สินค้าคลัง (ผ่าน inventory.createItem/receive · แถวขายซิงก์ให้เองตาม P1.1b) ───
  const mkInv = async (key: string, name: string, unitLabel: string, cost: number, stock: number, o: { kind?: "SERVICE"; sys?: string; tid?: string } = {}) => {
    const c = invCtx(o.sys ?? S.I1, o.tid ?? T);
    const it = await invSvc.createItem(c, { sku: `${KEY_PREFIX}-${key}`, name: `${name} ${RAND}`, unitLabel, costSatang: cost, ...(o.kind ? { kind: o.kind, priceSatang: 500 } : {}) });
    INV[key] = it.id;
    NAME_OF.set(it.id, key);
    if (stock > 0) await invSvc.receive(c, { itemId: it.id, qty: stock, costSatang: cost, idempotencyKey: `${KEY_PREFIX}-recv-${key}` });
    return it.id as string;
  };
  if (!fx) {
    try {
      await mkInv("beans", "เมล็ดกาแฟคั่วกลาง", "g", 65, 20000);
      await mkInv("milk", "นมสด", "ml", 5, 20000);
      await mkInv("cup12", "แก้ว 12 oz", "ใบ", 280, 500);
      await mkInv("cup16", "แก้ว 16 oz", "ใบ", 350, 500);
      await mkInv("lid", "ฝา", "ชิ้น", 120, 1000);
      await mkInv("oat", "นมโอ๊ต", "ml", 9, 1000);
      await mkInv("tea", "ใบชา", "g", 0, 0);
      await mkInv("choc", "ช็อกโกแลต", "g", 30, 1000);
      await mkInv("old", "ของเลิกใช้", "ชิ้น", 10, 10);
      await mkInv("water", "น้ำดื่ม", "ขวด", 400, 100);
      await mkInv("coke", "โค้ก", "กระป๋อง", 1200, 100);
      await mkInv("svc", "ค่าบริการชง", "ครั้ง", 0, 0, { kind: "SERVICE" });
      await mkInv("i2", "ของคลังอื่น", "ชิ้น", 100, 10, { sys: S.I2 });
      await mkInv("t2", "ของร้านอื่น", "ชิ้น", 100, 10, { sys: S.XINV, tid: T2 });
      await invSvc.archiveItem(invCtx(), INV.old);
    } catch (e) {
      fx = `สินค้าคลัง:${(e as Error).message.slice(0, 140)}`;
    }
  }
  const rowOf = async (invId: string): Promise<string> => String((await P.posProduct.findFirst({ where: { tenantId: T, systemId: S.POS, invItemId: invId }, select: { id: true } }).catch(() => null))?.id ?? "");
  const must = (label: string, r: Any): Any => {
    if (r?.ok === false) throw new Error(`${label} ล้ม: ${codeOf(r)} ${short(r?.message ?? "", 80)}`);
    return r;
  };
  const mkProd = async (key: string, input: Any): Promise<string> => {
    const r = must(`createProduct ${key}`, await call(catalog, "createProduct", cc("OWNER"), input));
    PR[key] = String(r?.id ?? "");
    return PR[key]!;
  };
  const mkGroup = async (key: string, name: string, min: number, max: number, choices: [string, number][]) => {
    const r = must(`createOptionGroup ${key}`, await call(catalog, "createOptionGroup", cc("OWNER"), { unitId: U.A, name: `${name} ${RAND}`, minSelect: min, maxSelect: max, choices: choices.map(([n, d]) => ({ name: n, priceDelta: d })) }));
    const rows = (await P.menuOptionChoice.findMany({ where: { tenantId: T, groupId: r.id } })) as Any[];
    const c: Record<string, string> = {};
    for (const x of rows) {
      c[x.name] = x.id;
      NAME_OF.set(x.id, `${key}.${x.name}`);
    }
    G[key] = { id: r.id, c };
  };
  if (!fx) {
    try {
      PR.water = await rowOf(INV.water!);
      PR.coke = await rowOf(INV.coke!);
      PR.svc = await rowOf(INV.svc!);
      must("setPrice water", await call(catalog, "setPrice", cc("OWNER"), PR.water, 1000));
      must("setPrice coke", await call(catalog, "setPrice", cc("OWNER"), PR.coke, 2000));
      await mkGroup("SIZE", "ขนาด", 1, 1, [["S", 0], ["M", 1000], ["L", 1500]]);
      await mkGroup("MILK", "นม", 0, 1, [["ปกติ", 0], ["โอ๊ต", 1000], ["ไม่ใส่นม", 0]]);
      await mkGroup("TOP", "ท็อปปิ้ง", 0, 3, [["ช็อตเพิ่ม", 1500]]);
      await mkGroup("OTHER", "กลุ่มที่ไม่ได้ผูก", 0, 1, [["X", 0]]);
      await mkProd("latte", { name: `ลาเต้ ${RAND}`, kind: "MENU", basePriceSatang: 7500 });
      await mkProd("hottea", { name: `ชาร้อน ${RAND}`, kind: "MENU", basePriceSatang: 3000 });
      await mkProd("americano", { name: `อเมริกาโน่ ${RAND}`, kind: "MENU", basePriceSatang: 5000 });
      await mkProd("espressoA", { name: `เอสเปรสโซ ${RAND}`, kind: "MENU", basePriceSatang: 4500, unitId: U.A });
      await mkProd("blend", { name: `นมสดปั่น ${RAND}`, kind: "MENU", basePriceSatang: 6000 });
      await mkProd("cappu", { name: `คาปูชิโน่ ${RAND}`, kind: "MENU", basePriceSatang: 6500 });
      await mkProd("thaitea", { name: `ชาไทย ${RAND}`, kind: "MENU", basePriceSatang: 4000 });
      await mkProd("mocha", { name: `มอคค่า ${RAND}`, kind: "MENU", basePriceSatang: 8000 });
      await mkProd("noprice", { name: `เมนูไม่มีราคา ${RAND}`, kind: "MENU" });
      await mkProd("matcha", { name: `มัทฉะ ${RAND}`, kind: "MENU", basePriceSatang: 7000 });
      await mkProd("bundle", { name: `เซ็ตแก้ว ${RAND}`, kind: "BUNDLE", basePriceSatang: 1500 });
      await mkProd("weighed", { name: `หมูชั่ง ${RAND}`, kind: "PRODUCT", soldByWeight: true, basePriceSatang: 30000 });
      must("optionGroups latte", await call(catalog, "setProductOptionGroups", cc("OWNER"), PR.latte, [G.SIZE!.id, G.MILK!.id, G.TOP!.id]));
      must("optionGroups matcha", await call(catalog, "setProductOptionGroups", cc("OWNER"), PR.matcha, [G.SIZE!.id]));
      must("setRecipe bundle", await call(catalog, "setRecipe", cc("OWNER"), PR.bundle, [{ invItemId: INV.cup12, qty: 1 }, { invItemId: INV.lid, qty: 2 }]));
      // เมนูโค้กแบบ backfill: ประตูเดิมของเมนูร้านอาหาร (catalog-legacy.createMenuItem · MenuItem.invItemId → RecipeLine qty 1)
      const cat = must("menu category", await restMenu.createCategory(T, U.A, { name: `เครื่องดื่ม ${RAND}` }, uid("OWNER")));
      await restMenu.ensureDefaultStations(T, U.A);
      const st = ((await restMenu.listStations(T, U.A)) as Any[])[0];
      const mi = await P.$transaction((tx: Any) => legacy.createMenuItem(tx, { tenantId: T, unitId: U.A }, { categoryId: cat.id, stationId: st?.id, name: `โค้กเมนู ${RAND}`, basePrice: 2500, invItemId: INV.coke }, [], uid("OWNER")));
      PR.cokeMenu = String(mi?.posProductId ?? "");
      if (!PR.cokeMenu) throw new Error("ประตูเดิมไม่สร้างแถว MENU ของโค้ก");
    } catch (e) {
      fx = `แคตตาล็อก:${(e as Error).message.slice(0, 160)}`;
    }
  }
  // ─── เครื่อง + กะ (สาขา A) ───
  if (!fx) {
    const rg = await call(devMod, "registerDevice", ctxA(false), A("OWNER"), { name: "เคาน์เตอร์ QC P2.3", deviceCode: DEV1 });
    if (rg?.ok !== true) console.log(`  ⚠️  registerDevice: ${codeOf(rg)} ${short(rg?.message ?? "", 80)}`);
    const o1 = await call(shiftMod, "openShift", ctxA(), A("OWNER"), { deviceId: DEV1, deviceLabel: "เคาน์เตอร์ QC P2.3", floatSatang: 0 });
    if (o1?.ok !== true) fx = `เปิดกะ: ${codeOf(o1)} ${short(o1?.message ?? "", 80)}`;
  }
  if (fx) console.log(`  ⚠️  fixture: ${fx}`);
  const FX = (s: string) => (fx ? `fixture:${fx} · ` : "") + s;
  const NCOL = () => (!COL.bom ? `${MISSING} คอลัมน์ bomEnabled · ` : "") + (!COL.table ? `${MISSING} ตาราง PosRecipeChoiceLine · ` : "");

  // ─── ตัวอ่าน/ตัวช่วย ───
  const nm = (id: unknown) => NAME_OF.get(String(id)) ?? String(id);
  const prod = async (id: string): Promise<Any> => (id ? P.posProduct.findUnique({ where: { id } }).catch(() => null) : null);
  const recipeStr = async (pid: string) => ((await P.recipeLine.findMany({ where: { tenantId: T, productId: pid } }).catch(() => [])) as Any[]).map((r) => `${nm(r.invItemId)}×${r.qty}`).sort().join(",");
  const choiceStr = async (pid: string) =>
    RC ? ((await RC.findMany({ where: { tenantId: T, productId: pid } }).catch(() => [])) as Any[]).map((r) => `${nm(r.choiceId)}:${nm(r.invItemId)}${r.qtyDelta > 0 ? "+" : ""}${r.qtyDelta}`).sort().join(",") : "ไม่มีตาราง";
  const audits = async (action: string, targetId?: string): Promise<Any[]> =>
    (await P.auditLog.findMany({ where: { tenantId: T, action, ...(targetId ? { targetId } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[];
  const BASE = (o: Partial<Record<string, number>> = {}) => Object.entries({ beans: 18, milk: 150, cup12: 1, lid: 1, ...o }).filter(([, q]) => (q ?? 0) > 0).map(([k, q]) => ({ invItemId: INV[k] ?? `?${k}`, qty: q as number }));
  const specStr = (xs: { invItemId: string; qty: number }[]) => xs.map((x) => `${nm(x.invItemId)}×${x.qty}`).sort().join(",");
  const CL = (rows: [string, string, number][]) => rows.map(([ch, k, d]) => ({ choiceId: ch, invItemId: INV[k] ?? `?${k}`, qtyDelta: d }));
  const clStr = (xs: { choiceId: string; invItemId: string; qtyDelta: number }[]) => xs.map((r) => `${nm(r.choiceId)}:${nm(r.invItemId)}${r.qtyDelta > 0 ? "+" : ""}${r.qtyDelta}`).sort().join(",");
  const C = (g: string, n: string) => G[g]?.c?.[n] ?? `none-${g}-${n}`;
  const CL7 = () => CL([[C("SIZE", "M"), "beans", 6], [C("SIZE", "M"), "milk", 50], [C("SIZE", "M"), "cup12", -1], [C("SIZE", "M"), "cup16", 1], [C("MILK", "โอ๊ต"), "milk", -150], [C("MILK", "โอ๊ต"), "oat", 150], [C("TOP", "ช็อตเพิ่ม"), "beans", 9]]);
  const lfu = async (pid: string): Promise<Any> => {
    const r = await call(catalog, "listForUnit", cc("OWNER"), U.A, { limit: 500 });
    return ((r?.items ?? []) as Any[]).find((x) => x.id === pid) ?? null;
  };
  const tile = async (pid: string, ctx: Any = ctxA()): Promise<Any> => {
    const r = await call(register, "registerCatalog", ctx, A("OWNER"), { limit: 500 });
    return { ok: r?.ok === true, code: codeOf(r), item: ((r?.products ?? []) as Any[]).find((x) => x.id === pid) ?? null };
  };
  const expComps = (spec: Record<string, number>) => Object.entries(spec).filter(([, q]) => q > 0).map(([k, q]) => ({ invItemId: INV[k] ?? `?${k}`, qty: q })).sort((a, b) => byId(a.invItemId, b.invItemId));
  const cstr = (xs: unknown) => (Array.isArray(xs) ? xs.map((c: Any) => `${nm(c?.invItemId)}×${c?.qty}`).join(",") : xs === null || xs === undefined ? "null" : short(xs, 80));
  const onHand = async (id: string) => Number((await P.invItem.findUnique({ where: { id }, select: { onHand: true } }).catch(() => null))?.onHand ?? NaN);
  const stock = async (): Promise<Record<string, number>> => Object.fromEntries(await Promise.all(Object.keys(INV).filter((k) => k !== "t2" && k !== "i2").map(async (k) => [k, await onHand(INV[k]!)] as const)));
  const delta = (a: Record<string, number>, b: Record<string, number>) => Object.fromEntries(Object.keys(b).filter((k) => b[k] !== a[k]).map((k) => [k, b[k]! - a[k]!]));
  const dstr = (d: Record<string, number>) => Object.entries(d).sort(([x], [y]) => byId(x, y)).map(([k, v]) => `${k}${v > 0 ? "+" : ""}${v}`).join(",") || "—";
  const mvs = async (refId: string, type?: string): Promise<Any[]> => (refId ? ((await P.invMovement.findMany({ where: { tenantId: T, refId, ...(type ? { type } : {}) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }).catch(() => [])) as Any[]) : []);
  const txOf = async (refId: string): Promise<{ tx: number; n: number }> => {
    if (!refId) return { tx: -1, n: -1 };
    const r = (await P.$queryRawUnsafe(`SELECT count(DISTINCT xmin::text)::int AS tx, count(*)::int AS n FROM "InvMovement" WHERE "tenantId" = $1 AND "refId" = $2 AND "type"::text = 'OUT'`, T, refId).catch(() => [])) as Any[];
    return { tx: Number(r[0]?.tx ?? -1), n: Number(r[0]?.n ?? -1) };
  };
  const mvCount = async () => Number(await P.invMovement.count({ where: { tenantId: T } }).catch(() => -1));
  const linesOf = async (saleId: string): Promise<Any[]> => (saleId ? ((await P.posSaleLine.findMany({ where: { tenantId: T, saleId }, orderBy: { id: "asc" } }).catch(() => [])) as Any[]) : []);
  /** คีย์ OUT ที่คาด ต่อบรรทัด (item = บรรทัดผูกคลัง · comps = ต่อ 1 หน่วย) เทียบกับแถวจริง */
  type LineExp = { item?: string; comps?: Record<string, number> };
  const outDiff = async (saleId: string, exps: LineExp[]): Promise<string[]> => {
    const ls = await linesOf(saleId);
    const want = new Map<string, string>();
    exps.forEach((e, i) => {
      const l = ls[i];
      if (!l) return;
      if (e.item) want.set(`pos-consume-${saleId}-${l.id}`, `${e.item}×${l.qty}`);
      for (const [k, q] of Object.entries(e.comps ?? {})) if (q > 0) want.set(`pos-consume-${saleId}-${l.id}-${INV[k]}`, `${k}×${q * l.qty}`);
    });
    const got = new Map((await mvs(saleId, "OUT")).map((m) => [String(m.idempotencyKey), `${nm(m.itemId)}×${-m.qtyDelta}`]));
    const p: string[] = [];
    for (const [k, v] of want) if (got.get(k) !== v) p.push(`ขาด/ผิด ${v} (${got.get(k) ?? "ไม่มีแถว"})`);
    for (const [k, v] of got) if (!want.has(k)) p.push(`เกิน ${v} คีย์ ${k.slice(-24)}`);
    return p;
  };
  let keyN = 0;
  const newKey = (pfx = "k") => `${KEY_PREFIX}-${pfx}-${++keyN}`;
  const ln = (productId: string, qty: number, ...choiceIds: string[]): Any => ({ productId, qty, ...(choiceIds.length ? { options: choiceIds.map((choiceId) => ({ choiceId })) } : {}) });
  const quote = (lines: Any[], ctx: Any = ctxA(), actor: Any = A("OWNER")) => call(register, "quoteRegisterCart", ctx, actor, { lines });
  type Sold = { q: Any; r: Any; key: string; saleId: string; grand: number };
  const sell = async (lines: Any[], o: { key?: string; ctx?: Any; grand?: number } = {}): Promise<Sold> => {
    const q = o.grand === undefined ? await quote(lines, o.ctx ?? ctxA()) : null;
    const grand = o.grand ?? (q?.ok === true ? Number(q.grandTotalSatang) : 0);
    const key = o.key ?? newKey("s");
    const r = await call(register, "submitRegisterSale", o.ctx ?? ctxA(), A("OWNER"), { lines, idempotencyKey: key, expectedGrandTotalSatang: grand, payMethods: [{ type: "CASH", amountSatang: grand }], cashReceivedSatang: grand });
    const saleId = r?.ok === true ? String(r.saleId) : "";
    if (saleId && !MY_SALES.includes(saleId)) MY_SALES.push(saleId);
    return { q, r, key, saleId, grand };
  };
  const soldStr = (s: Sold) => (s.r?.ok === true ? `บิล ${s.saleId.slice(-6)}` : `submit ${codeOf(s.r)} ${short(s.r?.message ?? "", 60)} (quote ${codeOf(s.q)})`);
  type Entry = { id: string; refId: string; lines: { code: string; debit: number; credit: number }[] };
  const jvOf = async (refIds: string[]): Promise<Entry[]> => {
    const ids = refIds.filter(Boolean);
    if (!ids.length) return [];
    const es = (await P.accountJournalEntry.findMany({ where: { tenantId: T, refType: "InvMovement", refId: { in: ids } }, include: { lines: { include: { account: { select: { code: true } } } } } }).catch(() => [])) as Any[];
    return es.map((e: Any) => ({ id: e.id, refId: e.refId, lines: (e.lines ?? []).map((l: Any) => ({ code: String(l.account?.code ?? "?"), debit: l.debit, credit: l.credit })) }));
  };
  const amt = (es: Entry[], code: string, side: "debit" | "credit") => sum(es.flatMap((e) => e.lines.filter((l) => l.code === code).map((l) => l[side])));

  // ════════ Q1–Q2 PAR (ก่อนอย่างอื่น — ไม่ขึ้นกับของใหม่) ════════
  console.log("\n── Q PAR (ต้องเขียวทั้งก่อนและหลังสร้าง) ──");
  await step("Q1", async () => {
    const p: string[] = [];
    const lines = [ln(PR.water!, 2), { name: `ค่าส่ง ${RAND}`, qty: 1, unitPriceSatang: 1000 }];
    const s0 = await stock();
    const q = await quote(lines);
    if (q?.ok !== true) p.push(`quote ${codeOf(q)} ${short(q?.message ?? "", 60)}`);
    else {
      const proj = {
        grand: q.grandTotalSatang, subtotal: q.subtotalSatang, net: q.netSatang, disc: [q.lineDiscountSatang, q.billDiscountSatang],
        lines: (q.lines as Any[]).map((l) => [l.productId === PR.water ? "W" : l.productId, l.unitPriceSatang, l.grossSatang, l.discountSatang, l.lineTotalSatang, l.optionsSatang, short(l.options), l.weightGrams]),
      };
      const want = { grand: 3000, subtotal: 3000, net: 3000, disc: [0, 0], lines: [["W", 1000, 2000, 0, 2000, 0, "[]", null], [null, 1000, 1000, 0, 1000, 0, "[]", null]] };
      if (short(proj, 600) !== short(want, 600)) p.push(`quote ${short(proj, 200)}`);
      const vatWant = q.vatMode === "INCLUDED" ? vatOf(3000, Number(q.vatRateBp)) : 0;
      if (q.vatSatang !== vatWant) p.push(`VAT ${q.vatSatang} (คาด ${vatWant} · ${q.vatMode} ${q.vatRateBp})`);
    }
    const s = await sell(lines);
    if (!s.saleId) p.push(soldStr(s));
    else {
      const ls = await linesOf(s.saleId);
      const proj = ls.map((l) => [l.productId === PR.water ? "W" : l.productId, l.itemId === INV.water ? "invW" : l.itemId, l.components ?? null, l.qty, l.unitPriceSatang, l.lineTotalSatang]);
      if (short(proj) !== short([["W", "invW", null, 2, 1000, 2000], [null, null, null, 1, 1000, 1000]])) p.push(`บรรทัด ${short(proj, 160)}`);
      const all = await mvs(s.saleId);
      const o = all.filter((m) => m.type === "OUT");
      if (all.length !== 1 || o.length !== 1 || o[0]?.idempotencyKey !== `pos-consume-${s.saleId}-${ls[0]?.id}` || o[0]?.qtyDelta !== -2 || o[0]?.costSatang !== 400 || o[0]?.itemId !== INV.water)
        p.push(`InvMovement ${short(all.map((m) => [m.type, nm(m.itemId), m.qtyDelta, m.costSatang, String(m.idempotencyKey).slice(-20)]), 160)}`);
      const d = delta(s0, await stock());
      if (dstr(d) !== "water-2") p.push(`สต็อก ${dstr(d)} (คาด water-2)`);
    }
    chk("Q1", p.length === 0, "น้ำ ×2 + ค่าส่ง: ยอด/บรรทัด/OUT เดิมทุกค่า", FX(p.join(" · ") || "ครบ (เหมือนฐาน)"));
  });
  await step("Q2", async () => {
    const p: string[] = [];
    const t = await tile(PR.cokeMenu!);
    if (!t.item) p.push(`ไม่ขึ้นกริด (${t.code})`);
    else if (t.item.stockLeft !== null || t.item.kind !== "MENU" || t.item.soldOutReason !== null) p.push(`ไทล์ ${short({ k: t.item.kind, s: t.item.stockLeft, r: t.item.soldOutReason }, 80)}`);
    const rl = await recipeStr(PR.cokeMenu!);
    if (rl !== "coke×1") p.push(`RecipeLine ${rl || "—"} (คาด coke×1 · fixture)`);
    const pr = await prod(PR.cokeMenu!);
    if (COL.bom && pr?.bomEnabled !== false) p.push(`bomEnabled ${pr?.bomEnabled}`);
    const s0 = await stock();
    const s = await sell([ln(PR.cokeMenu!, 1)]);
    if (s.grand !== 2500) p.push(`quote ${s.grand} (คาด 2500 · ${codeOf(s.q)})`);
    if (!s.saleId) p.push(soldStr(s));
    else {
      const ls = await linesOf(s.saleId);
      if (ls.length !== 1 || ls[0]?.itemId !== null || (ls[0]?.components ?? null) !== null) p.push(`บรรทัด itemId ${ls[0]?.itemId} comps ${cstr(ls[0]?.components)}`);
      const all = await mvs(s.saleId);
      if (all.length) p.push(`InvMovement ${all.length} แถว (คาด 0)`);
    }
    const d = delta(s0, await stock());
    if (Object.keys(d).length) p.push(`สต็อกขยับ ${dstr(d)}`);
    chk("Q2", p.length === 0, "โค้ก backfill ไม่ตัด/ไม่ซ่อน", FX(p.join(" · ") || "ครบ (เหมือนฐาน)"));
  });

  // ════════ M ตัวเขียน ════════
  console.log("\n── M ตัวเขียนสูตร ──");
  const B4 = () => BASE();
  const B4S = () => specStr(B4());
  await step("M1", async () => {
    const p: string[] = [];
    const L = PR.latte!;
    const b0 = await prod(L);
    if (b0?.bomEnabled !== false) p.push(`ก่อนตั้ง bomEnabled ${b0?.bomEnabled}`);
    const a0 = (await audits(AUDIT.recipe, L)).length;
    const r1 = await call(catalog, "setRecipe", cc("OWNER"), L, B4());
    if (r1?.ok === false) p.push(`ตั้ง 4 → ${codeOf(r1)} ${short(r1.message, 60)}`);
    if ((await recipeStr(L)) !== B4S()) p.push(`หลังตั้ง ${await recipeStr(L) || "—"}`);
    if ((await prod(L))?.bomEnabled !== true) p.push(`หลังตั้ง bomEnabled ${(await prod(L))?.bomEnabled}`);
    const au1 = await audits(AUDIT.recipe, L);
    const last1 = au1[au1.length - 1];
    if (au1.length !== a0 + 1 || last1?.before?.bomEnabled !== false || last1?.after?.bomEnabled !== true || last1?.actorId !== uid("OWNER")) p.push(`audit ตั้ง ${au1.length - a0} แถว ${short({ b: last1?.before?.bomEnabled, a: last1?.after?.bomEnabled }, 60)}`);
    const three = BASE({ lid: 0 });
    const r2 = await call(catalog, "setRecipe", cc("OWNER"), L, three);
    if (r2?.ok === false || (await recipeStr(L)) !== specStr(three) || (await prod(L))?.bomEnabled !== true) p.push(`แทน 3 → ${codeOf(r2)} ${await recipeStr(L)} bom ${(await prod(L))?.bomEnabled}`);
    const n2 = (await audits(AUDIT.recipe, L)).length;
    const r3 = await call(catalog, "setRecipe", cc("OWNER"), L, three);
    if (r3?.ok === false || (await audits(AUDIT.recipe, L)).length !== n2) p.push(`ชุดเดิมซ้ำ → ${codeOf(r3)} audit ${(await audits(AUDIT.recipe, L)).length - n2}`);
    const r4 = await call(catalog, "setRecipe", cc("OWNER"), L, []);
    const au4 = await audits(AUDIT.recipe, L);
    if (r4?.ok === false || (await recipeStr(L)) !== "" || (await prod(L))?.bomEnabled !== false || au4[au4.length - 1]?.after?.bomEnabled !== false) p.push(`[] → ${codeOf(r4)} ${await recipeStr(L) || "ว่าง"} bom ${(await prod(L))?.bomEnabled}`);
    const r5 = await call(catalog, "setRecipe", cc("OWNER"), L, B4());
    if (r5?.ok === false || (await prod(L))?.bomEnabled !== true || (await recipeStr(L)) !== B4S()) p.push(`ตั้งกลับ → ${codeOf(r5)}`);
    const v = await lfu(L);
    if (!v) p.push("listForUnit ไม่มีลาเต้");
    else {
      if (specStr(Array.isArray(v.recipe) ? v.recipe : []) !== B4S()) p.push(`listForUnit recipe ${short(v.recipe, 80)}`);
      if (v.bomEnabled !== true) p.push(`listForUnit bomEnabled ${v.bomEnabled}`);
    }
    chk("M1", NCOL() === "" && p.length === 0, "ตั้ง/แทน/ซ้ำ/ล้าง/ตั้งกลับ · bomEnabled ตาม · audit", FX(NCOL() + (P8(p) || "ครบ")));
  });
  await step("M2", async () => {
    const p: string[] = [];
    for (const [lbl, id] of [["PRODUCT น้ำดื่ม", PR.water], ["SERVICE", PR.svc], ["สินค้าชั่ง", PR.weighed]] as [string, string][]) {
      const r = await call(catalog, "setRecipe", cc("OWNER"), id, [{ invItemId: INV.beans, qty: 1 }]);
      if (!refused(r, "VALIDATION")) p.push(`setRecipe ${lbl} → ${codeOf(r)}`);
    }
    const c = await call(catalog, "setRecipeChoiceLines", cc("OWNER"), PR.water, CL([[C("SIZE", "M"), "beans", 1]]));
    if (!refused(c, "VALIDATION")) p.push(`setRecipeChoiceLines PRODUCT → ${codeOf(c)}`);
    const b = await call(catalog, "setBomEnabled", cc("OWNER"), PR.water, true);
    if (!refused(b, "VALIDATION")) p.push(`setBomEnabled PRODUCT → ${codeOf(b)}`);
    const ok = await call(catalog, "setRecipe", cc("OWNER"), PR.bundle, [{ invItemId: INV.cup12, qty: 1 }, { invItemId: INV.lid, qty: 2 }]);
    if (ok?.ok === false) p.push(`BUNDLE (ตัวควบคุม) → ${codeOf(ok)}`);
    if ((await recipeStr(PR.water!)) !== "") p.push(`น้ำดื่มมีสูตร ${await recipeStr(PR.water!)}`);
    chk("M2", p.length === 0, "PRODUCT/SERVICE/ชั่ง = VALIDATION · BUNDLE ok", FX(P8(p) || "ครบ"));
  });
  await step("M3", async () => {
    const p: string[] = [];
    const L = PR.latte!;
    const a0 = (await audits(AUDIT.recipe, L)).length;
    const cases: [string, Any][] = [
      ["qty 0", BASE({ beans: 0 }).concat([{ invItemId: INV.beans!, qty: 0 }])],
      ["qty 1.5", [{ invItemId: INV.beans, qty: 1.5 }]],
      ["qty −1", [{ invItemId: INV.beans, qty: -1 }]],
      ["id ซ้ำ", [{ invItemId: INV.beans, qty: 18 }, { invItemId: INV.beans, qty: 2 }]],
      ["51 แถว", Array.from({ length: 51 }, (_, i) => ({ invItemId: `nope${RAND}${i}`, qty: 1 }))],
      ["SERVICE", [{ invItemId: INV.svc, qty: 1 }]],
      ["เก็บถาวร", [{ invItemId: INV.old, qty: 1 }]],
      ["คีย์แปลก", [{ invItemId: INV.beans, qty: 1, unit: "g" }]],
    ];
    for (const [lbl, lines] of cases) {
      const r = await call(catalog, "setRecipe", cc("OWNER"), L, lines);
      if (!refused(r, "VALIDATION")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    if ((await recipeStr(L)) !== B4S()) p.push(`สูตรลาเต้ = ${await recipeStr(L) || "—"} (คาด 4 แถวเดิม ${B4S()})`);
    if ((await audits(AUDIT.recipe, L)).length !== a0) p.push("มี audit จากคำขอที่ถูกปฏิเสธ");
    chk("M3", p.length === 0, "8 แบบ VALIDATION · สูตรเดิม · ไม่ audit", FX(P8(p) || "ครบ"));
  });
  await step("M4", async () => {
    const p: string[] = [];
    const L = PR.latte!;
    for (const [lbl, id] of [["คลัง I2", INV.i2], ["ร้าน T2", INV.t2], ["id มั่ว", `nope${RAND}`]] as [string, string][]) {
      const r = await call(catalog, "setRecipe", cc("OWNER"), L, [{ invItemId: id, qty: 1 }]);
      if (!refused(r, "NOT_FOUND")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const r = await call(catalog, "setRecipe", cc("OWNER"), `nope${RAND}`, B4());
    if (!refused(r, "NOT_FOUND")) p.push(`productId มั่ว → ${codeOf(r)}`);
    if ((await recipeStr(L)) !== B4S()) p.push(`สูตรลาเต้ = ${await recipeStr(L) || "—"} (คาด ${B4S()})`);
    chk("M4", p.length === 0, "NOT_FOUND ×4 · สูตรเดิม", FX(P8(p) || "ครบ"));
  });
  await step("M5", async () => {
    const p: string[] = [];
    const L = PR.latte!;
    const a0 = (await audits(AUDIT.choices, L)).length;
    const r1 = await call(catalog, "setRecipeChoiceLines", cc("OWNER"), L, CL7());
    if (r1?.ok === false) p.push(`ตั้ง 7 → ${codeOf(r1)} ${short(r1.message, 60)}`);
    if ((await choiceStr(L)) !== clStr(CL7())) p.push(`แถว ${await choiceStr(L)}`);
    const two = CL([[C("TOP", "ช็อตเพิ่ม"), "beans", 9], [C("MILK", "โอ๊ต"), "oat", 150]]);
    const r2 = await call(catalog, "setRecipeChoiceLines", cc("OWNER"), L, two);
    if (r2?.ok === false || (await choiceStr(L)) !== clStr(two)) p.push(`แทน 2 → ${codeOf(r2)} ${await choiceStr(L)}`);
    const r3 = await call(catalog, "setRecipeChoiceLines", cc("OWNER"), L, CL7());
    if (r3?.ok === false || (await choiceStr(L)) !== clStr(CL7())) p.push(`กลับ 7 → ${codeOf(r3)}`);
    const n3 = (await audits(AUDIT.choices, L)).length;
    if (n3 - a0 !== 3) p.push(`audit ${AUDIT.choices} ${n3 - a0} แถว (คาด 3)`);
    const r4 = await call(catalog, "setRecipeChoiceLines", cc("OWNER"), L, CL7());
    if (r4?.ok === false || (await audits(AUDIT.choices, L)).length !== n3) p.push(`ชุดเดิมซ้ำ → ${codeOf(r4)} audit เพิ่ม`);
    const v = await lfu(L);
    const vl = Array.isArray(v?.recipeChoiceLines) ? (v.recipeChoiceLines as Any[]) : null;
    if (!vl || clStr(vl) !== clStr(CL7())) p.push(`listForUnit recipeChoiceLines ${short(vl, 80)}`);
    chk("M5", NCOL() === "" && p.length === 0, "7 แถว · แทนทั้งชุด · ไม่ audit ซ้ำ · listForUnit", FX(NCOL() + (P8(p) || "ครบ")));
  });
  await step("M6", async () => {
    const p: string[] = [];
    const L = PR.latte!;
    const M = C("SIZE", "M");
    const cases: [string, Any, string][] = [
      ["กลุ่มไม่ได้ผูก", CL([[C("OTHER", "X"), "beans", 1]]), "NOT_FOUND"],
      ["choiceId มั่ว", CL([[`nope${RAND}`, "beans", 1]]), "NOT_FOUND"],
      ["วัตถุดิบ I2", CL([[M, "i2", 1]]), "NOT_FOUND"],
      ["delta 0", CL([[M, "beans", 0]]), "VALIDATION"],
      ["delta 1.5", CL([[M, "beans", 1.5]]), "VALIDATION"],
      ["delta 1000001", CL([[M, "beans", 1_000_001]]), "VALIDATION"],
      ["(ตัวเลือก, ของ) ซ้ำ", CL([[M, "beans", 1], [M, "beans", 2]]), "VALIDATION"],
      ["101 แถว", Array.from({ length: 101 }, (_, i) => ({ choiceId: M, invItemId: `nope${RAND}${i}`, qtyDelta: 1 })), "VALIDATION"],
      ["SERVICE", CL([[M, "svc", 1]]), "VALIDATION"],
    ];
    for (const [lbl, rows, want] of cases) {
      const r = await call(catalog, "setRecipeChoiceLines", cc("OWNER"), L, rows);
      if (!refused(r, want)) p.push(`${lbl} → ${codeOf(r)} (คาด ${want})`);
    }
    if ((await choiceStr(L)) !== clStr(CL7())) p.push(`แถวเปลี่ยน ${await choiceStr(L)}`);
    chk("M6", NCOL() === "" && p.length === 0, "NOT_FOUND ×3 · VALIDATION ×6 · ไม่เขียน", FX(NCOL() + (P8(p) || "ครบ")));
  });
  await step("M7", async () => {
    const p: string[] = [];
    const L = PR.latte!;
    const ops: [string, () => Promise<Any>][] = [
      ["STAFF setRecipe", () => call(catalog, "setRecipe", cc("STAFF"), L, BASE({ milk: 999 }))],
      ["STAFF setRecipeChoiceLines", () => call(catalog, "setRecipeChoiceLines", cc("STAFF"), L, [])],
      ["STAFF setBomEnabled", () => call(catalog, "setBomEnabled", cc("STAFF"), L, false)],
      ["MANAGER(A) ลาเต้ทุกสาขา", () => call(catalog, "setRecipe", cc("MGR"), L, BASE({ milk: 999 }))],
    ];
    for (const [lbl, f] of ops) {
      const r = await f();
      if (!refused(r, "PERMISSION_DENIED")) p.push(`${lbl} → ${codeOf(r)}`);
    }
    const ok = await call(catalog, "setRecipe", cc("MGR"), PR.espressoA, [{ invItemId: INV.beans, qty: 9 }, { invItemId: INV.cup12, qty: 1 }]);
    if (ok?.ok === false) p.push(`MANAGER(A) เอสเปรสโซสาขา A → ${codeOf(ok)} ${short(ok.message, 60)}`);
    if ((await prod(PR.espressoA!))?.bomEnabled !== true) p.push(`เอสเปรสโซ bomEnabled ${(await prod(PR.espressoA!))?.bomEnabled}`);
    if ((await recipeStr(L)) !== B4S() || (await choiceStr(L)) !== clStr(CL7()) || (await prod(L))?.bomEnabled !== true) p.push("สูตร/ตัวเลือก/bomEnabled ของลาเต้เปลี่ยน");
    chk("M7", NCOL() === "" && p.length === 0, "STAFF/MANAGER นอกขอบเขต = PERMISSION_DENIED · MANAGER สาขาตัวเอง ok", FX(NCOL() + (P8(p) || "ครบ")));
  });
  await step("M8", async () => {
    const p: string[] = [];
    const L = PR.latte!;
    const e = await call(catalog, "setBomEnabled", cc("OWNER"), PR.americano, true);
    if (!refused(e, "VALIDATION") || !String(e?.message ?? "").includes(MSG_NO_RECIPE)) p.push(`ไม่มีสูตร on → ${codeOf(e)} ${short(e?.message ?? "", 60)}`);
    if ((await prod(PR.americano!))?.bomEnabled !== false) p.push("อเมริกาโน่ bomEnabled ไม่ใช่ false");
    const a0 = (await audits(AUDIT.recipe, L)).length;
    const off = await call(catalog, "setBomEnabled", cc("OWNER"), L, false);
    if (off?.ok === false || (await prod(L))?.bomEnabled !== false) p.push(`off → ${codeOf(off)} bom ${(await prod(L))?.bomEnabled}`);
    if ((await recipeStr(L)) !== B4S()) p.push(`off แล้วสูตรหาย (${await recipeStr(L) || "—"})`);
    const a1 = (await audits(AUDIT.recipe, L)).length;
    if (a1 !== a0 + 1) p.push(`audit off ${a1 - a0} (คาด 1)`);
    const off2 = await call(catalog, "setBomEnabled", cc("OWNER"), L, false);
    if (off2?.ok === false || (await audits(AUDIT.recipe, L)).length !== a1) p.push(`off ซ้ำ → ${codeOf(off2)} audit เพิ่ม`);
    const on = await call(catalog, "setBomEnabled", cc("OWNER"), L, true);
    if (on?.ok === false || (await prod(L))?.bomEnabled !== true) p.push(`on → ${codeOf(on)} bom ${(await prod(L))?.bomEnabled}`);
    const bu = await call(catalog, "setBomEnabled", cc("OWNER"), PR.bundle, true);
    if (!refused(bu, "VALIDATION")) p.push(`BUNDLE → ${codeOf(bu)}`);
    chk("M8", NCOL() === "" && p.length === 0, "ไม่มีสูตร = VALIDATION · off/on · สูตรคงอยู่ · BUNDLE VALIDATION", FX(NCOL() + (P8(p) || "ครบ")));
  });

  // ─── สูตรของเมนูอื่นที่ข้อถัดไปใช้ (บนฐาน = ถูกปฏิเสธ — คาด · ข้อที่ใช้จะแดงพร้อมเหตุผล) ───
  const fxR: string[] = [];
  {
    const set = async (key: string, lines: [string, number][]) => {
      const r = await call(catalog, "setRecipe", cc("OWNER"), PR[key], lines.map(([k, q]) => ({ invItemId: INV[k], qty: q })));
      if (r?.ok === false) fxR.push(`${key}:${codeOf(r)}`);
    };
    await set("blend", [["milk", 1000], ["cup16", 1]]);
    await set("cappu", [["beans", 18], ["milk", 100], ["cup12", 1]]);
    await set("thaitea", [["tea", 10], ["milk", 50]]);
    await set("mocha", [["choc", 20], ["milk", 150]]);
    await set("noprice", [["beans", 5]]);
    await set("matcha", [["beans", 10], ["milk", 120], ["cup12", 1], ["lid", 1]]);
    const mc = await call(catalog, "setRecipeChoiceLines", cc("OWNER"), PR.matcha, CL([[C("SIZE", "M"), "milk", 40]]));
    if (mc?.ok === false) fxR.push(`matcha choices:${codeOf(mc)}`);
    try {
      await invSvc.archiveItem(invCtx(), INV.choc);
    } catch (e) {
      fxR.push(`archive choc:${(e as Error).message.slice(0, 40)}`);
    }
    if (fxR.length) console.log(`  ℹ️  สูตรเมนูอื่นตั้งไม่ได้ (บนฐาน = คาด): ${fxR.join(" · ")}`);
  }
  const FR = (s: string) => (fxR.length ? `สูตร fixture ถูกปฏิเสธ ${fxR.length} · ` : "") + s;

  // ════════ Q หน้าขาย ════════
  console.log("\n── Q หน้าขาย ──");
  const S_ = () => C("SIZE", "S");
  const M_ = () => C("SIZE", "M");
  const OAT_ = () => C("MILK", "โอ๊ต");
  const SHOT_ = () => C("TOP", "ช็อตเพิ่ม");
  const LATTE_S = { beans: 18, milk: 150, cup12: 1, lid: 1 };
  const LATTE_M = { beans: 24, milk: 200, cup16: 1, lid: 1 };
  const SV: Record<string, Sold | undefined> = {}; // บิลที่ข้อถัดไปใช้ต่อ
  await step("Q3", async () => {
    const p: string[] = [];
    const s0 = await stock();
    const s = await sell([ln(PR.latte!, 2, M_())]);
    SV.Q3 = s;
    if (s.grand !== 17000) p.push(`quote ${s.grand} (คาด 17000 · ${codeOf(s.q)})`);
    if (!s.saleId) p.push(soldStr(s));
    else {
      const ls = await linesOf(s.saleId);
      if (ls[0]?.itemId !== null) p.push(`itemId ${ls[0]?.itemId}`);
      if (cstr(ls[0]?.components) !== cstr(expComps(LATTE_M))) p.push(`components ${cstr(ls[0]?.components)} (คาด ${cstr(expComps(LATTE_M))} เรียง id)`);
      const d = dstr(delta(s0, await stock()));
      if (d !== "beans-48,cup16-2,lid-2,milk-400") p.push(`สต็อก ${d} (คาด beans-48,cup16-2,lid-2,milk-400)`);
      p.push(...(await outDiff(s.saleId, [{ comps: LATTE_M }])));
    }
    chk("Q3", p.length === 0, "ลาเต้ M ×2: snapshot + ตัด 4 วัตถุดิบ", FX(P8(p) || "ครบ"));
  });
  await step("Q4", async () => {
    const p: string[] = [];
    const g = await call(register, "registerCatalog", ctxB(), A("OWNER"), { limit: 500 });
    const ids = new Set(((g?.products ?? []) as Any[]).map((x) => x.id));
    if (g?.ok !== true) p.push(`กริด B ${codeOf(g)}`);
    if (ids.has(PR.latte)) p.push("ลาเต้ขึ้นกริดสาขา B (ไม่มีคลัง)");
    if (!ids.has(PR.hottea)) p.push("ชาร้อน (ตัวควบคุม) ไม่ขึ้นกริด B");
    const q = await quote([ln(PR.latte!, 1, S_())], ctxB());
    if (!refused(q, "PRODUCT_NOT_FOUND") || q?.lineIndex !== 0) p.push(`quote ลาเต้ที่ B → ${codeOf(q)} li${q?.lineIndex}`);
    const qc = await quote([ln(PR.hottea!, 1)], ctxB());
    if (qc?.ok !== true || qc.grandTotalSatang !== 3000) p.push(`ชาร้อนที่ B → ${codeOf(qc)} ${qc?.grandTotalSatang}`);
    chk("Q4", p.length === 0, "สาขาไม่มีคลัง: ซ่อน + PRODUCT_NOT_FOUND · ตัวควบคุมขายได้", FX(P8(p) || "ครบ"));
  });
  await step("Q5", async () => {
    const p: string[] = [];
    const pol = (v: string) => call(settingsGen, "updatePosUnitStockPolicy", { tenantId: T, systemId: S.POS }, A("OWNER"), { unitId: U.A, oversellPolicy: v });
    const r0 = await pol("BLOCK");
    if (r0?.ok !== true) p.push(`ตั้ง BLOCK → ${codeOf(r0)}`);
    try {
      const milk = await onHand(INV.milk!);
      const n = Math.floor(milk / 1000) + 1;
      if ((await onHand(INV.cup16!)) < n) p.push(`(fixture) แก้ว16 ไม่พอ ${n}`);
      const lines = [ln(PR.blend!, n)];
      const q = await quote(lines);
      if (q?.ok !== true || q.grandTotalSatang !== 6000 * n) p.push(`quote → ${codeOf(q)} ${q?.grandTotalSatang} (คาด ok ${6000 * n})`);
      const c0 = [Number(await P.posSale.count({ where: { tenantId: T } })), await mvCount()];
      const s = await sell(lines, { grand: 6000 * n });
      const c1 = [Number(await P.posSale.count({ where: { tenantId: T } })), await mvCount()];
      if (!refused(s.r, "STOCK_INSUFFICIENT") || !String(s.r?.message ?? "").includes("นมสด")) p.push(`submit ×${n} (นม ${milk}) → ${codeOf(s.r)} ${short(s.r?.message ?? "", 80)}`);
      if (c0[0] !== c1[0] || c0[1] !== c1[1]) p.push(`เขียนแถว PosSale ${c0[0]}→${c1[0]} InvMovement ${c0[1]}→${c1[1]}`);
    } finally {
      const r1 = await pol("ALLOW_NEGATIVE");
      if (r1?.ok !== true) p.push(`คืน ALLOW_NEGATIVE → ${codeOf(r1)}`);
    }
    chk("Q5", p.length === 0, "BLOCK: quote ok · submit STOCK_INSUFFICIENT นมสด · ไม่เขียน", FX(FR(P8(p) || "ครบ")));
  });
  await step("Q6", async () => {
    const p: string[] = [];
    const oat = await onHand(INV.oat!);
    const n = Math.max(1, Math.floor(oat / 150) + 1);
    const s = await sell([ln(PR.latte!, n, S_(), OAT_())]);
    if (!s.saleId) p.push(soldStr(s));
    else {
      const ls = await linesOf(s.saleId);
      const want = expComps({ beans: 18, cup12: 1, lid: 1, oat: 150 });
      if (cstr(ls[0]?.components) !== cstr(want)) p.push(`components ${cstr(ls[0]?.components)} (คาด ${cstr(want)})`);
      const o = await mvs(s.saleId, "OUT");
      const mo = o.find((m) => m.itemId === INV.oat);
      const mb = o.find((m) => m.itemId === INV.beans);
      if (!mo || mo.needsReview !== true || !(mo.balanceAfter < 0)) p.push(`OUT โอ๊ต ${short(mo && { r: mo.needsReview, b: mo.balanceAfter }, 60)} (โอ๊ตเดิม ${oat} ×${n})`);
      if (!mb || mb.needsReview !== false) p.push(`OUT เมล็ด needsReview ${mb?.needsReview}`);
      if ((await onHand(INV.oat!)) !== oat - 150 * n) p.push(`โอ๊ต ${await onHand(INV.oat!)} (คาด ${oat - 150 * n})`);
    }
    chk("Q6", p.length === 0, "ALLOW: ขายได้ · ติดลบ + needsReview เฉพาะโอ๊ต", FX(P8(p) || "ครบ"));
  });
  await step("Q7", async () => {
    const p: string[] = [];
    const h = await call(heldMod, "holdRegisterCart", ctxA(), A("OWNER"), { cart: { lines: [ln(PR.latte!, 1, S_())] }, label: `พัก P23 ${RAND}` });
    const hid = h?.ok === true ? String(h.heldCart?.id ?? "") : "";
    if (!hid) p.push(`hold → ${codeOf(h)} ${short(h?.message ?? "", 60)}`);
    const e1 = await call(catalog, "setRecipe", cc("OWNER"), PR.latte, BASE({ milk: 160 }));
    if (e1?.ok === false) p.push(`แก้สูตร → ${codeOf(e1)}`);
    try {
      if (hid) {
        const r = await call(heldMod, "recallHeldCart", ctxA(), A("OWNER"), { id: hid });
        if (r?.ok !== true) p.push(`recall → ${codeOf(r)}`);
        else {
          const s = await sell(r.cart?.lines ?? []);
          if (!s.saleId) p.push(soldStr(s));
          else {
            const ls = await linesOf(s.saleId);
            const want = expComps({ ...LATTE_S, milk: 160 });
            if (cstr(ls[0]?.components) !== cstr(want)) p.push(`components ${cstr(ls[0]?.components)} (คาด ${cstr(want)})`);
          }
        }
      }
    } finally {
      const e2 = await call(catalog, "setRecipe", cc("OWNER"), PR.latte, B4());
      if (e2?.ok === false) p.push(`คืนสูตร → ${codeOf(e2)}`);
    }
    chk("Q7", p.length === 0, "เรียกคืนใช้สูตร ณ ตอนเรียกคืน", FX(P8(p) || "ครบ"));
  });
  // E5 ตัวแปร (มัทฉะ → มัทฉะเย็น)
  await step("E5", async () => {
    const p: string[] = [];
    const MS = { beans: 10, milk: 120, cup12: 1, lid: 1 };
    let ice = "";
    try {
      ice = await mkProd("matchaIce", { name: `มัทฉะเย็น ${RAND}`, kind: "MENU", parentId: PR.matcha });
    } catch (e) {
      p.push(`(fixture) ตัวแปร: ${(e as Error).message.slice(0, 80)}`);
    }
    const comps = async (choice: string) => {
      const s = await sell([ln(ice, 1, choice)]);
      if (!s.saleId) return soldStr(s);
      return cstr((await linesOf(s.saleId))[0]?.components);
    };
    if (ice) {
      const a = await comps(S_());
      if (a !== cstr(expComps(MS))) p.push(`สืบแม่ S ${a} (คาด ${cstr(expComps(MS))})`);
      const b = await comps(M_());
      if (b !== cstr(expComps({ ...MS, milk: 160 }))) p.push(`สืบแม่ M ${b} (คาด ${cstr(expComps({ ...MS, milk: 160 }))})`);
      const own = await call(catalog, "setRecipe", cc("OWNER"), ice, [{ invItemId: INV.beans, qty: 12 }, { invItemId: INV.cup16, qty: 1 }]);
      if (own?.ok === false) p.push(`ตั้งสูตรตัวแปร → ${codeOf(own)}`);
      if ((await prod(ice))?.bomEnabled !== true) p.push(`ตัวแปร bomEnabled ${(await prod(ice))?.bomEnabled}`);
      const OWN = cstr(expComps({ beans: 12, cup16: 1 }));
      const c = await comps(S_());
      if (c !== OWN) p.push(`สูตรเอง S ${c} (คาด ${OWN})`);
      const d = await comps(M_());
      if (d !== OWN) p.push(`สูตรเอง M ${d} (คาด ${OWN})`);
    }
    chk("E5", p.length === 0, "ตัวแปรสืบสูตร+delta ของแม่ · มีสูตรเองใช้ของตัวเองล้วน", FX(FR(P8(p) || "ครบ")));
  });

  // ════════ C ตัดคลัง ════════
  console.log("\n── C ตัดคลังชุดเดียวต่อบิล ──");
  await step("C1", async () => {
    const p: string[] = [];
    const s = await sell([ln(PR.water!, 1), ln(PR.coke!, 1)]);
    if (!s.saleId) p.push(soldStr(s));
    else {
      p.push(...(await outDiff(s.saleId, [{ item: "water" }, { item: "coke" }])));
      const t = await txOf(s.saleId);
      if (t.n !== 2 || t.tx !== 1) p.push(`บิลไม่มีสูตร OUT ${t.n} แถว ใน ${t.tx} tx (คาด 2 แถว 1 tx)`);
    }
    const q3 = SV.Q3?.saleId ?? "";
    const t3 = await txOf(q3);
    if (!q3 || t3.n !== 4 || t3.tx !== 1) p.push(`บิล Q3 OUT ${t3.n} แถว ใน ${t3.tx} tx (คาด 4 แถว 1 tx)`);
    chk("C1", p.length === 0, "หนึ่ง tx ต่อบิล (มี/ไม่มีสูตร) · คีย์เดิม", FX(P8(p) || "ครบ"));
  });
  await step("C2", async () => {
    const p: string[] = [];
    const s0 = await stock();
    const s = await sell([ln(PR.water!, 1), ln(PR.latte!, 1, M_(), OAT_(), SHOT_()), ln(PR.bundle!, 1)]);
    if (s.grand !== 13500) p.push(`quote ${s.grand} (คาด 13500)`);
    if (!s.saleId) p.push(soldStr(s));
    else {
      const LMX = { beans: 33, milk: 50, oat: 150, cup16: 1, lid: 1 };
      const ls = await linesOf(s.saleId);
      if (cstr(ls[1]?.components) !== cstr(expComps(LMX))) p.push(`components ลาเต้ ${cstr(ls[1]?.components)}`);
      p.push(...(await outDiff(s.saleId, [{ item: "water" }, { comps: LMX }, { comps: { cup12: 1, lid: 2 } }])));
      const t = await txOf(s.saleId);
      if (t.n !== 8 || t.tx !== 1) p.push(`OUT ${t.n} แถว ใน ${t.tx} tx (คาด 8 · 1)`);
      const d = dstr(delta(s0, await stock()));
      if (d !== "beans-33,cup12-1,cup16-1,lid-3,milk-50,oat-150,water-1") p.push(`สต็อก ${d}`);
    }
    chk("C2", p.length === 0, "บิลผสม 8 แถว · 1 tx · Σ ถูก", FX(P8(p) || "ครบ"));
  });
  await step("C3", async () => {
    const p: string[] = [];
    const s0 = await stock();
    const s = await sell([ln(PR.latte!, 1, S_()), ln(PR.latte!, 2, M_())]);
    if (!s.saleId) p.push(soldStr(s));
    else {
      p.push(...(await outDiff(s.saleId, [{ comps: LATTE_S }, { comps: LATTE_M }])));
      const o = await mvs(s.saleId, "OUT");
      const per = (k: string) => o.filter((m) => m.itemId === INV[k]).map((m) => -m.qtyDelta).sort((a, b) => a - b).join("+");
      for (const [k, want] of [["beans", "18+48"], ["milk", "150+400"], ["lid", "1+2"]] as const) if (per(k) !== want) p.push(`${k} ${per(k) || "—"} (คาด ${want} สองแถว)`);
      const d = dstr(delta(s0, await stock()));
      if (d !== "beans-66,cup12-1,cup16-2,lid-3,milk-550") p.push(`สต็อก ${d}`);
    }
    chk("C3", p.length === 0, "ของเดียวกันสองบรรทัด = สองแถว · Σ ถูก", FX(P8(p) || "ครบ"));
  });
  await step("C4", async () => {
    const p: string[] = [];
    const q3 = SV.Q3;
    if (!q3?.saleId) p.push("ไม่มีบิล Q3");
    else {
      const n0 = (await mvs(q3.saleId, "OUT")).length;
      if (n0 !== 4) p.push(`ก่อนส่งซ้ำ OUT ${n0} (คาด 4)`);
      const r = await sell([ln(PR.latte!, 2, M_())], { key: q3.key, grand: q3.grand });
      if (r.r?.ok !== true || r.r.duplicated !== true || r.saleId !== q3.saleId) p.push(`ส่งซ้ำ → ${codeOf(r.r)} dup ${r.r?.duplicated} ${r.saleId === q3.saleId ? "id เดิม" : "id อื่น"}`);
      const c0 = await mvCount();
      const c = await call(svc, "consumeSaleInventory", T, U.A, q3.saleId);
      if (c?.ok === false) p.push(`consumeSaleInventory ซ้ำ → ${codeOf(c)}`);
      const n1 = (await mvs(q3.saleId, "OUT")).length;
      if (n1 !== n0 || (await mvCount()) !== c0) p.push(`OUT ${n0}→${n1} · ร้าน ${c0}→${await mvCount()}`);
    }
    chk("C4", p.length === 0, "เล่นซ้ำไม่ตัดเพิ่ม", FX(P8(p) || "ครบ"));
  });
  // C7 ก่อน C5 (บิลที่มีของ SERVICE ใน components นับเป็น "ค้าง" ตลอด — ดูโน้ต CONTROLLER-DECISION)
  await step("C7", async () => {
    const p: string[] = [];
    const st0 = await call(register, "registerStatus", ctxA(), A("OWNER"));
    const key = newKey("pend");
    let saleId = "";
    try {
      const r = await P.$transaction(
        (tx: Any) =>
          svc.createSale(
            { tenantId: T, unitId: U.A, systemId: S.POS, sourceModule: "POS", idempotencyKey: key, shiftId: null, lines: [{ name: `ลาเต้ ${RAND}`, qty: 1, unitPriceSatang: 7500, productId: PR.latte, components: expComps(LATTE_S) }], payMethods: [{ type: "CASH", amountSatang: 7500 }] },
            tx,
          ),
        { timeout: 30000, maxWait: 10000 },
      );
      saleId = String(r?.saleId ?? "");
      if (saleId) MY_SALES.push(saleId);
    } catch (e) {
      p.push(`(fixture) createSale ใน tx → ${errCode(e)} ${String((e as Error).message).slice(0, 60)}`);
    }
    const st1 = await call(register, "registerStatus", ctxA(), A("OWNER"));
    if ((await mvs(saleId, "OUT")).length !== 0) p.push("บิลค้างถูกตัดไปแล้ว (fixture ผิด)");
    if (st1?.pendingStockCount !== (st0?.pendingStockCount ?? -9) + 1) p.push(`pending ${st0?.pendingStockCount}→${st1?.pendingStockCount} (คาด +1)`);
    const den = await call(svc, "retryPendingStockCuts", rctx("STAFF"), U.A);
    if (!refused(den, "PERMISSION_DENIED")) p.push(`STAFF → ${codeOf(den)}`);
    const a0 = (await audits(AUDIT.retry)).length;
    const r1 = await call(svc, "retryPendingStockCuts", rctx("OWNER"), U.A);
    if (r1?.ok !== true || !(r1.scanned >= 1) || !(r1.cut >= 1) || r1.stillPending !== 0) p.push(`เจ้าของ → ${codeOf(r1)} ${short({ s: r1?.scanned, c: r1?.cut, sp: r1?.stillPending }, 80)}`);
    const t = await txOf(saleId);
    if (t.n !== 4 || t.tx !== 1) p.push(`OUT ${t.n} แถว ${t.tx} tx (คาด 4 · 1)`);
    if (saleId) p.push(...(await outDiff(saleId, [{ comps: LATTE_S }])));
    const st2 = await call(register, "registerStatus", ctxA(), A("OWNER"));
    if (st2?.pendingStockCount !== st0?.pendingStockCount) p.push(`pending หลังลองใหม่ ${st2?.pendingStockCount} (คาด ${st0?.pendingStockCount})`);
    const au = (await audits(AUDIT.retry)).filter((a) => a.actorId === uid("OWNER"));
    if ((await audits(AUDIT.retry)).length !== a0 + 1 || !au.length) p.push(`audit ${AUDIT.retry} ${(await audits(AUDIT.retry)).length - a0} แถว`);
    const c0 = await mvCount();
    const r2 = await call(svc, "retryPendingStockCuts", rctx("OWNER"), U.A);
    if (r2?.ok !== true || r2.cut !== 0 || (await mvCount()) !== c0) p.push(`ซ้ำ → ${codeOf(r2)} cut ${r2?.cut} · แถว ${c0}→${await mvCount()}`);
    chk("C7", p.length === 0, "ค้าง +1 → ลองใหม่ตัดครบ 1 tx · ซ้ำ cut 0", FX(P8(p) || "ครบ"));
  });
  await step("C5", async () => {
    const p: string[] = [];
    const k = (n: string) => `${KEY_PREFIX}-batch-${n}`;
    const input = {
      sourceModule: "POS",
      refType: "QcProbe",
      refId: `${KEY_PREFIX}-probe`,
      parts: [
        { itemId: `nope${RAND}`, qty: 1, idempotencyKey: k("nope") },
        { itemId: INV.svc, qty: 1, idempotencyKey: k("svc") },
        { itemId: INV.i2, qty: 1, idempotencyKey: k("i2") },
        { itemId: INV.beans, qty: 2, idempotencyKey: k("beans") },
      ],
    };
    const b0 = await onHand(INV.beans!);
    const r = await call(invFacade, "consumeBatch", { tenantId: T, systemId: S.I1 }, input);
    if (!isRecord(r) || r.ok === false) p.push(`consumeBatch → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      const ids = Array.isArray(r.movementIds) ? (r.movementIds as string[]) : [];
      const sk = Array.isArray(r.skipped) ? (r.skipped as Any[]) : [];
      const alias = (id: unknown) => (id === INV.svc ? "svc" : id === INV.i2 ? "i2" : String(id).startsWith("nope") ? "nope" : String(id));
      const skStr = sk.map((x) => `${alias(x.itemId)}:${x.reason}:${x.key === k(alias(x.itemId)) ? "key" : "คีย์ผิด"}`).sort().join(",");
      if (skStr !== "i2:NOT_FOUND:key,nope:NOT_FOUND:key,svc:SERVICE:key") p.push(`skipped ${skStr || "—"}`);
      const mv = ids.length === 1 ? await P.invMovement.findUnique({ where: { id: ids[0] } }).catch(() => null) : null;
      if (!mv || mv.idempotencyKey !== k("beans") || mv.qtyDelta !== -2 || mv.type !== "OUT" || mv.refId !== input.refId || mv.refType !== "QcProbe") p.push(`movementIds ${ids.length} ${short(mv && [mv.type, mv.qtyDelta, mv.refType], 60)}`);
      const c0 = await mvCount();
      const r2 = await call(invFacade, "consumeBatch", { tenantId: T, systemId: S.I1 }, input);
      if (short(r2?.movementIds) !== short(ids) || (await mvCount()) !== c0) p.push(`เรียกซ้ำ ${short(r2?.movementIds, 60)} · แถว ${c0}→${await mvCount()}`);
      if ((await onHand(INV.beans!)) !== b0 - 2) p.push(`เมล็ด ${b0}→${await onHand(INV.beans!)} (คาด −2 ครั้งเดียว)`);
    }
    // createSale ตรงที่ components มีของ SERVICE
    let sid = "";
    try {
      const rs = await svc.createSale({ tenantId: T, unitId: U.A, systemId: S.POS, sourceModule: "POS", idempotencyKey: newKey("svc"), shiftId: null, lines: [{ name: `ลาเต้+บริการ ${RAND}`, qty: 1, unitPriceSatang: 7500, productId: PR.latte, components: [...expComps(LATTE_S), { invItemId: INV.svc!, qty: 1 }] }], payMethods: [{ type: "CASH", amountSatang: 7500 }] });
      sid = String(rs?.saleId ?? "");
      if (sid) MY_SALES.push(sid);
      if (rs?.status !== "PAID") p.push(`createSale สถานะ ${rs?.status}`);
    } catch (e) {
      p.push(`createSale (SERVICE ใน components) → ${errCode(e)} ${String((e as Error).message).slice(0, 60)}`);
    }
    if (sid) {
      const t = await txOf(sid);
      const o = await mvs(sid, "OUT");
      if (t.n !== 4 || t.tx !== 1 || o.some((m) => m.itemId === INV.svc)) p.push(`OUT ${t.n} แถว ${t.tx} tx${o.some((m) => m.itemId === INV.svc) ? " มีของ SERVICE" : ""} (คาด 4 · 1 · ไม่มี SERVICE)`);
    }
    chk("C5", p.length === 0, "ข้าม NOT_FOUND/SERVICE ไม่ล้มทั้งชุด · ซ้ำไม่เพิ่ม", FX(P8(p) || "ครบ"));
  });
  await step("C6", async () => {
    const p: string[] = [];
    const dl = async () => {
      const r = (await P.$queryRawUnsafe(`SELECT deadlocks::text AS d FROM pg_stat_database WHERE datname = current_database()`).catch(() => [])) as Any[];
      return Number(r[0]?.d ?? NaN);
    };
    const d0 = await dl();
    const s0 = await stock();
    const all = await Promise.all(Array.from({ length: 10 }, () => sell([ln(PR.latte!, 1, S_())], { grand: 7500 })));
    await sleep(1500);
    const d1 = await dl();
    const okN = all.filter((s) => s.saleId).length;
    if (okN !== 10) p.push(`สำเร็จ ${okN}/10 (${[...new Set(all.filter((s) => !s.saleId).map((s) => codeOf(s.r)))].join(",")})`);
    const d = delta(s0, await stock());
    if (d.milk !== -1500 || d.beans !== -180) p.push(`นม ${d.milk} เมล็ด ${d.beans} (คาด −1500 · −180)`);
    let bad = 0;
    for (const s of all.filter((x) => x.saleId)) {
      const t = await txOf(s.saleId);
      if (t.n !== 4 || t.tx !== 1) bad++;
    }
    if (bad) p.push(`${bad} บิลไม่ใช่ 4 แถว/1 tx`);
    if (!(d1 - d0 === 0)) p.push(`deadlocks ${d0}→${d1}`);
    chk("C6", p.length === 0, "10 บิลพร้อมกัน: ครบ · นมเป๊ะ · 1 tx/บิล · deadlock 0", FX(P8(p) || `ครบ (deadlocks ${d0}→${d1})`));
  });

  // ════════ K ต้นทุนตามสูตร ════════
  console.log("\n── K ต้นทุน ──");
  const rcost = (k: string, ids: string[], opts: Any) => call(recipeMod, "recipeCost", rctx(k), ids, opts);
  const NR = () => (recipeMod && typeof recipeMod.recipeCost === "function" ? "" : `${MISSING} recipeCost (pos/recipe.ts) · `);
  await step("K1", async () => {
    const p: string[] = [];
    const r = await rcost("OWNER", [PR.latte!], { unitId: U.A });
    const it = r?.ok === true && Array.isArray(r.items) ? r.items[0] : null;
    if (!it) p.push(`→ ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    else {
      if (it.productId !== PR.latte || it.costSatang !== 2320 || it.costComplete !== true || it.basePriceSatang !== 7500 || it.bomEnabled !== true) p.push(`item ${short({ c: it.costSatang, ok: it.costComplete, b: it.basePriceSatang, bom: it.bomEnabled }, 100)}`);
      const want: Record<string, [number, number, number, string]> = { beans: [18, 65, 1170, "g"], milk: [150, 5, 750, "ml"], cup12: [1, 280, 280, "ใบ"], lid: [1, 120, 120, "ชิ้น"] };
      const got = new Map(((it.lines ?? []) as Any[]).map((l) => [nm(l.invItemId), l]));
      if (got.size !== 4) p.push(`lines ${got.size} (คาด 4)`);
      for (const [k, [q, u, c, lab]] of Object.entries(want)) {
        const l = got.get(k);
        if (!l || l.qty !== q || l.unitCostSatang !== u || l.costSatang !== c || l.unitLabel !== lab || typeof l.name !== "string" || !l.name) p.push(`${k} ${short(l && [l.qty, l.unitCostSatang, l.costSatang, l.unitLabel], 60)} (คาด ${q}/${u}/${c}/${lab})`);
      }
    }
    const rm = await rcost("OWNER", [PR.latte!], { unitId: U.A, choiceIds: [M_()] });
    const im = rm?.ok === true ? rm.items?.[0] : null;
    const names = ((im?.lines ?? []) as Any[]).map((l) => nm(l.invItemId)).sort().join(",");
    if (im?.costSatang !== 3030 || names !== "beans,cup16,lid,milk") p.push(`M → ${codeOf(rm)} ${im?.costSatang} [${names}] (คาด 3030 [beans,cup16,lid,milk])`);
    chk("K1", NR() === "" && p.length === 0, "ลาเต้ S 2320 · M 3030 · บรรทัดครบ", FX(NR() + (P8(p) || "ครบ")));
  });
  await step("K2", async () => {
    const p: string[] = [];
    const ids = [PR.latte!, PR.thaitea!, PR.mocha!, PR.noprice!];
    const r = await rcost("OWNER", ids, { unitId: U.A });
    const items = r?.ok === true && Array.isArray(r.items) ? (r.items as Any[]) : [];
    if (items.length !== 4 || items.map((i) => i.productId).join() !== ids.join()) p.push(`→ ${codeOf(r)} items ${items.length} (ลำดับตาม productIds)`);
    else {
      const got = items.map((i) => [i.costComplete, i.marginBp]);
      const want = [[true, 6906], [false, null], [false, null], [true, null]];
      if (short(got) !== short(want)) p.push(`[costComplete, marginBp] ${short(got)} (คาด ${short(want)} · ลาเต้ ชาไทย มอคค่า ไม่มีราคา)`);
      if (items[3]?.costSatang !== 325) p.push(`ไม่มีราคา cost ${items[3]?.costSatang} (คาด 325)`);
    }
    chk("K2", NR() === "" && p.length === 0, "costComplete · marginBp floor/null", FX(FR(NR() + (P8(p) || "ครบ"))));
  });
  await step("K3", async () => {
    const p: string[] = [];
    const st = await rcost("STAFF", [PR.latte!], { unitId: U.A });
    if (st?.ok !== true) p.push(`STAFF → ${codeOf(st)}`);
    else {
      const ls = (st.items?.[0]?.lines ?? []) as Any[];
      if (ls.length !== 4 || ls.some((l) => typeof l.invItemId !== "string" || typeof l.qty !== "number" || typeof l.name !== "string" || typeof l.unitLabel !== "string")) p.push(`STAFF lines ${short(ls, 100)}`);
      const leak = allKeys(st).filter((k) => /cost|margin/i.test(k));
      if (leak.length) p.push(`STAFF เห็นคีย์ ${[...new Set(leak)].join(",")}`);
    }
    for (const k of ["MGR", "STAFFR"]) {
      const r = await rcost(k, [PR.latte!], { unitId: U.A });
      if (r?.ok !== true || r.items?.[0]?.costSatang !== 2320) p.push(`${k} → ${codeOf(r)} ${r?.items?.[0]?.costSatang}`);
    }
    chk("K3", NR() === "" && p.length === 0, "STAFF ไม่เห็นต้นทุน · ผู้จัดการ/สิทธิ์รายงานเห็น", FX(NR() + (P8(p) || "ครบ")));
  });
  await step("K4", async () => {
    const p: string[] = [];
    const sid = SV.Q3?.saleId ?? "";
    const o = await mvs(sid, "OUT");
    if (o.length !== 4) p.push(`OUT ของบิล Q3 ${o.length} (คาด 4)`);
    const es = await jvOf(o.map((m) => m.id));
    for (const m of o) {
      const e = es.filter((x) => x.refId === m.id);
      const v = Math.abs(m.qtyDelta) * m.costSatang;
      if (e.length !== 1 || amt(e, "5000", "debit") !== v || amt(e, "1200", "credit") !== v) p.push(`${nm(m.itemId)} JV ${e.length} Dr5000 ${amt(e, "5000", "debit")} (คาด ${v})`);
    }
    const dr = amt(es, "5000", "debit");
    if (dr !== 6060) p.push(`Σ Dr 5000 ${dr} (คาด 6060)`);
    chk("K4", p.length === 0, "COGS ต่อวัตถุดิบ · Σ 6060", FX(P8(p) || "ครบ"));
  });
  await step("K5", async () => {
    const p: string[] = [];
    const s = await sell([ln(PR.cappu!, 3)]);
    if (!s.saleId) p.push(soldStr(s));
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const r = await call(reportsMod, "reportMargin", { tenantId: T, systemId: S.POS, unitId: U.A }, A("OWNER"), { from: today, to: today });
    const row = r?.ok === true ? ((r.report?.rows ?? []) as Any[]).find((x) => String(x.name ?? "").includes(`คาปูชิโน่ ${RAND}`)) : null;
    if (!row) p.push(`reportMargin → ${codeOf(r)} ไม่มีแถวคาปูชิโน่`);
    else {
      const got = [row.revenueSatang, row.costSatang, row.estimatedCostSatang, row.uncostedLineCount, row.marginBp];
      if (short(got) !== short([19500, 5850, 0, 0, 7000])) p.push(`[revenue cost estimated uncosted marginBp] ${short(got)} (คาด [19500,5850,0,0,7000])`);
    }
    chk("K5", p.length === 0, "รายงานกำไร = ต้นทุนจาก OUT", FX(FR(P8(p) || "ครบ")));
  });

  // ════════ A จำนวนแก้ว ════════
  console.log("\n── A จำนวนแก้ว ──");
  await step("A1", async () => {
    const p: string[] = [];
    const oh = await stock();
    const want = Math.min(...Object.entries(LATTE_S).map(([k, q]) => Math.floor((oh[k] ?? 0) / q)));
    const t = await tile(PR.latte!);
    if (!t.item) p.push(`ไม่ขึ้นกริด (${t.code})`);
    else if (t.item.stockLeft !== want || t.item.soldOutReason !== null) p.push(`ไทล์ stockLeft ${t.item.stockLeft} reason ${t.item.soldOutReason} (คาด ${want} · null)`);
    const v = await lfu(PR.latte!);
    if (v?.stock?.[U.A!] !== want) p.push(`listForUnit stock[A] ${short(v?.stock, 60)} (คาด ${want})`);
    chk("A1", p.length === 0, "จำนวนแก้ว = min ⌊onHand/qty⌋", FX(P8(p) || `ครบ (${want} แก้ว)`));
  });
  await step("A2", async () => {
    const p: string[] = [];
    const t = await tile(PR.thaitea!);
    if (!t.item || t.item.stockLeft !== 0 || t.item.soldOut !== true || t.item.soldOutReason !== "NO_STOCK") p.push(`ไทล์ ${short(t.item && { s: t.item.stockLeft, so: t.item.soldOut, r: t.item.soldOutReason }, 80)} (${t.code})`);
    const q = await quote([ln(PR.thaitea!, 1)]);
    if (q?.ok !== true || q.grandTotalSatang !== 4000) p.push(`quote → ${codeOf(q)} ${q?.grandTotalSatang}`);
    chk("A2", p.length === 0, "NO_STOCK แสดงอย่างเดียว · quote ok", FX(FR(P8(p) || "ครบ")));
  });

  // ════════ V คืนของ ════════
  console.log("\n── V คืนของ ──");
  const doRefund = async (saleId: string, lineId: string, qty: number, restock: boolean, amount: number): Promise<string> => {
    const r = await call(refundMod, "refundSale", ctxA(), A("OWNER"), {
      saleId, lines: [{ lineId, qty, restock }], payMethods: [{ type: "CASH", amountSatang: amount }], reasonCode: "CHANGED_MIND", reason: "ลูกค้าเปลี่ยนใจ", idempotencyKey: newKey("rf"),
    });
    const rid = r?.ok === true ? String(r.refund?.id ?? "") : "";
    if (!rid) throw new Error(`refundSale → ${codeOf(r)} ${short(r?.message ?? "", 60)}`);
    MY_SALES.push(rid);
    await drain();
    return rid;
  };
  const perItem = (rows: Any[]) => {
    const m: Record<string, number> = {};
    for (const x of rows) m[nm(x.itemId)] = (m[nm(x.itemId)] ?? 0) + Math.abs(x.qtyDelta);
    return Object.entries(m).sort(([a], [b]) => byId(a, b)).map(([k, v]) => `${k}${v}`).join(",");
  };
  await step("V1", async () => {
    const p: string[] = [];
    const s0 = await stock();
    const s = await sell([ln(PR.latte!, 2, M_())]);
    SV.V1 = s;
    if (!s.saleId) p.push(soldStr(s));
    else {
      const o = await mvs(s.saleId, "OUT");
      if (o.length !== 4) p.push(`OUT ${o.length} (คาด 4)`);
      const v = await call(svc, "voidSale", T, U.A, s.saleId);
      if (v?.ok === false) p.push(`voidSale → ${codeOf(v)} ${short(v.message, 60)}`);
      const d = dstr(delta(s0, await stock()));
      if (d !== "—") p.push(`หลัง void สต็อกต่างจากก่อนขาย ${d}`);
      const ins = await mvs(s.saleId, "IN");
      if (ins.length !== 4 || perItem(ins) !== perItem(o)) p.push(`IN ${ins.length} [${perItem(ins)}] (คาด [${perItem(o)}])`);
    }
    chk("V1", p.length === 0, "void คืนทุกวัตถุดิบ", FX(P8(p) || "ครบ"));
  });
  let rid1 = "";
  await step("V2", async () => {
    const p: string[] = [];
    const s = await sell([ln(PR.latte!, 3, S_())]);
    if (!s.saleId) p.push(soldStr(s));
    else {
      const o = await mvs(s.saleId, "OUT");
      if (perItem(o) !== "beans54,cup123,lid3,milk450") p.push(`OUT [${perItem(o)}] (คาด beans54,cup123,lid3,milk450)`);
      const line = (await linesOf(s.saleId))[0];
      rid1 = await doRefund(s.saleId, line.id, 1, true, 7500);
      const in1 = await mvs(rid1, "IN");
      if (perItem(in1) !== "beans18,cup121,lid1,milk150") p.push(`คืน 1 IN [${perItem(in1)}] (คาด beans18,cup121,lid1,milk150)`);
      for (const m of in1) {
        const src = o.find((x) => x.itemId === m.itemId);
        if (!src || m.costSatang !== src.costSatang) p.push(`${nm(m.itemId)} ต้นทุน IN ${m.costSatang} ≠ OUT ${src?.costSatang}`);
      }
      const rid2 = await doRefund(s.saleId, line.id, 2, true, 15000);
      const in2 = await mvs(rid2, "IN");
      if (perItem([...in1, ...in2]) !== perItem(o)) p.push(`Σ IN [${perItem([...in1, ...in2])}] ≠ OUT [${perItem(o)}]`);
    }
    chk("V2", p.length === 0, "⅓ + ⅔ = Σ ตัด · ต้นทุนเดิม", FX(P8(p) || "ครบ"));
  });
  await step("V3", async () => {
    const p: string[] = [];
    const s = await sell([ln(PR.latte!, 1, S_())]);
    if (!s.saleId) p.push(soldStr(s));
    else {
      if ((await mvs(s.saleId, "OUT")).length !== 4) p.push(`OUT ${(await mvs(s.saleId, "OUT")).length} (คาด 4)`);
      const s1 = await stock();
      const rid = await doRefund(s.saleId, (await linesOf(s.saleId))[0].id, 1, false, 7500);
      const ins = await mvs(rid, "IN");
      if (ins.length) p.push(`IN ${ins.length} (คาด 0)`);
      const d = dstr(delta(s1, await stock()));
      if (d !== "—") p.push(`สต็อกขยับ ${d}`);
    }
    chk("V3", p.length === 0, "restock false = ไม่มี IN", FX(P8(p) || "ครบ"));
  });
  await step("V4", async () => {
    const p: string[] = [];
    if (!rid1) p.push("ไม่มีใบคืนจาก V2");
    else {
      const n0 = (await mvs(rid1, "IN")).length;
      if (n0 !== 4) p.push(`ใบคืนแรก IN ${n0} (คาด 4)`);
      const ev = ((await P.outboxEvent.findMany({ where: { tenantId: T, type: "pos.sale.refunded" } }).catch(() => [])) as Any[]).find((e) => e.payload?.refundSaleId === rid1);
      const h = consMod?.consumers?.["pos.sale.refunded"];
      if (!ev || typeof h !== "function") p.push("ไม่มี event/consumer ให้เล่นซ้ำ");
      else
        for (let i = 0; i < 2; i++)
          try {
            await h(ev);
          } catch (e) {
            p.push(`เล่นซ้ำ throw ${(e as Error).message.slice(0, 50)}`);
          }
      await drain();
      if ((await mvs(rid1, "IN")).length !== n0) p.push(`IN ${n0}→${(await mvs(rid1, "IN")).length}`);
    }
    const v1 = SV.V1?.saleId ?? "";
    if (v1) {
      const n0 = (await mvs(v1, "IN")).length;
      const v = await call(svc, "voidSale", T, U.A, v1);
      if (v?.ok !== false) p.push("void ซ้ำไม่ถูกปฏิเสธ");
      if ((await mvs(v1, "IN")).length !== n0 || n0 !== 4) p.push(`IN ของ V1 ${n0}→${(await mvs(v1, "IN")).length} (คาด 4 คงเดิม)`);
    } else p.push("ไม่มีบิล V1");
    chk("V4", p.length === 0, "เล่นซ้ำใบคืน/void ซ้ำ ไม่คืนเบิ้ล", FX(P8(p) || "ครบ"));
  });
  await step("V5", async () => {
    const p: string[] = [];
    const s = await sell([ln(PR.latte!, 1, S_()), ln(PR.water!, 1)]);
    if (!s.saleId) p.push(soldStr(s));
    else {
      const o = await mvs(s.saleId, "OUT");
      if (o.length !== 5) p.push(`OUT ${o.length} (คาด 5: 4 วัตถุดิบ + น้ำ)`);
      const outCost = sum(o.map((m) => Math.abs(m.qtyDelta) * m.costSatang));
      const milk = await onHand(INV.milk!);
      await invSvc.receive(invCtx(), { itemId: INV.milk, qty: Math.max(1000, milk), costSatang: 11, idempotencyKey: `${KEY_PREFIX}-v5-milk` });
      await invSvc.receive(invCtx(), { itemId: INV.water, qty: 50, costSatang: 1000, idempotencyKey: `${KEY_PREFIX}-v5-water` });
      const avg = async (k: string) => Number((await P.invItem.findUnique({ where: { id: INV[k] }, select: { costSatang: true } }))?.costSatang);
      const am = await avg("milk");
      const aw = await avg("water");
      if (am === 5 || aw === 400) p.push(`(fixture) ถัวเฉลี่ยไม่เปลี่ยน นม ${am} น้ำ ${aw}`);
      const v = await call(svc, "voidSale", T, U.A, s.saleId);
      if (v?.ok === false) p.push(`voidSale → ${codeOf(v)}`);
      const ins = await mvs(s.saleId, "IN");
      if (ins.length !== o.length) p.push(`IN ${ins.length} (คาด ${o.length})`);
      for (const m of o) {
        const i = ins.find((x) => x.itemId === m.itemId);
        if (!i || i.qtyDelta !== -m.qtyDelta || i.costSatang !== m.costSatang || i.locationId !== m.locationId) p.push(`${nm(m.itemId)} IN ${short(i && [i.qtyDelta, i.costSatang], 40)} (คาด ${-m.qtyDelta} @${m.costSatang} คลังเดิม · ถัวเฉลี่ยใหม่ ${nm(m.itemId) === "milk" ? am : nm(m.itemId) === "water" ? aw : "-"})`);
      }
      const es = await jvOf(ins.map((x) => x.id));
      const dr = amt(es, "1200", "debit");
      if (dr !== outCost || outCost !== 2720) p.push(`GL Dr 1200 ของ void ${dr} · Σ ต้นทุน OUT ${outCost} (คาด 2720 ทั้งคู่)`);
    }
    chk("V5", p.length === 0, "void คืนที่ต้นทุน OUT เดิม · GL = Σ เดิม", FX(P8(p) || "ครบ"));
  });
  // ORACLE-ADD (fix round 1 · รีวิว F1): บิลค้างตัด → คืนบางส่วนพร้อม restock (ตอนนั้นยังไม่มี OUT ⇒ ตัวรับคิวข้าม) → ลองตัดใหม่
  //   ⇒ ต้องตัดครบบิลแล้วรับคืนส่วนที่คืนไปแล้ว (คีย์ของใบคืน) — สุทธิ = ส่วนที่ยังไม่คืนเท่านั้น
  await step("V6", async () => {
    const p: string[] = [];
    const s0 = await stock();
    let saleId = "";
    try {
      const r = await P.$transaction(
        (tx: Any) =>
          svc.createSale(
            { tenantId: T, unitId: U.A, systemId: S.POS, sourceModule: "POS", idempotencyKey: newKey("pend-rf"), shiftId: null, lines: [{ name: `ลาเต้ ${RAND}`, qty: 2, unitPriceSatang: 7500, productId: PR.latte, components: expComps(LATTE_S) }], payMethods: [{ type: "CASH", amountSatang: 15000 }] },
            tx,
          ),
        { timeout: 30000, maxWait: 10000 },
      );
      saleId = String(r?.saleId ?? "");
      if (saleId) MY_SALES.push(saleId);
    } catch (e) {
      p.push(`(fixture) createSale ใน tx → ${errCode(e)} ${String((e as Error).message).slice(0, 60)}`);
    }
    if (saleId) {
      if ((await mvs(saleId, "OUT")).length !== 0) p.push("(fixture) บิลค้างถูกตัดไปแล้ว");
      const line = (await linesOf(saleId))[0];
      const rid = await doRefund(saleId, String(line?.id ?? ""), 1, true, 7500);
      if ((await mvs(rid, "IN")).length !== 0) p.push("(fixture) ใบคืนรับของคืนทั้งที่บิลยังไม่ถูกตัด");
      const r1 = await call(svc, "retryPendingStockCuts", rctx("OWNER"), U.A);
      if (r1?.ok !== true || !(r1.cut >= 1) || r1.stillPending !== 0) p.push(`ลองใหม่ → ${codeOf(r1)} ${short({ s: r1?.scanned, c: r1?.cut, sp: r1?.stillPending }, 80)}`);
      const o = await mvs(saleId, "OUT");
      if (perItem(o) !== "beans36,cup122,lid2,milk300") p.push(`OUT [${perItem(o)}] (คาด beans36,cup122,lid2,milk300)`);
      const ins = await mvs(rid, "IN");
      if (perItem(ins) !== "beans18,cup121,lid1,milk150") p.push(`IN ของใบคืน [${perItem(ins)}] (คาด beans18,cup121,lid1,milk150)`);
      for (const m of ins) {
        const src = o.find((x) => x.itemId === m.itemId);
        if (!src || m.costSatang !== src.costSatang) p.push(`${nm(m.itemId)} ต้นทุน IN ${m.costSatang} ≠ OUT ${src?.costSatang}`);
      }
      const d = dstr(delta(s0, await stock()));
      if (d !== "beans-18,cup12-1,lid-1,milk-150") p.push(`สต็อกสุทธิ ${d} (คาด beans-18,cup12-1,lid-1,milk-150)`);
      const c0 = await mvCount();
      const r2 = await call(svc, "retryPendingStockCuts", rctx("OWNER"), U.A);
      if (r2?.ok !== true || (await mvCount()) !== c0) p.push(`ซ้ำ → ${codeOf(r2)} · แถว ${c0}→${await mvCount()}`);
    }
    chk("V6", p.length === 0, "ลองตัดใหม่หลังคืนบางส่วน = ตัดเฉพาะส่วนที่ยังไม่คืน", FX(P8(p) || "ครบ"));
  });
}

// ═════════════════════════ 6. คืนสภาพ — ลบร้านชั่วคราวทั้งสอง + ผู้ใช้ชั่วคราว ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; usersLeft: number; err: string };
async function wipeTenants(): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
  const targets = ([[T, T_SLUG], [T2, T2_SLUG]] as [string, string][]).filter(([id]) => !!id);
  if (targets.length) {
    for (const [id, slug] of targets) {
      const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, id)) as Any[];
      if (t.length && t[0].slug !== slug) {
        rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
        return rep;
      }
    }
    await drain();
    await sleep(300);
    const tables = ((await P.$queryRawUnsafe(
      `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
       WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
    )) as Any[]).map((r: Any) => String(r.t));
    rep.tables = tables.length;
    for (const [id, slug] of targets) {
      await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, id).catch(() => {});
      let pending = [...tables];
      for (let pass = 0; pass < 10 && pending.length; pass++) {
        const next: string[] = [];
        for (const tb of pending) {
          try {
            await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, id);
          } catch {
            next.push(tb);
          }
        }
        pending = next;
      }
      try {
        await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, id, slug);
      } catch (e) {
        rep.err = [rep.err, `ลบ Tenant ${slug} ไม่ได้: ${(e as Error).message.slice(0, 80)}`].filter(Boolean).join(" · ");
      }
      for (const tb of tables) {
        try {
          const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, id)) as Any[])[0]?.n ?? 0);
          if (n) rep.left[`${slug === T_SLUG ? "T" : "T2"}.${tb}`] = n;
        } catch {
          rep.left[tb] = -1;
        }
      }
      rep.tenantLeft += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, id)) as Any[])[0]?.n ?? 0);
    }
  }
  try {
    await P.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX, endsWith: "@qc.invalid" } } });
    rep.usersLeft = Number(await P.user.count({ where: { email: { startsWith: EMAIL_PREFIX } } }));
  } catch (e) {
    rep.err = [rep.err, `ลบผู้ใช้ไม่ได้: ${(e as Error).message.slice(0, 80)}`].filter(Boolean).join(" · ");
  }
  return rep;
}

// ═════════════════════════ 7. รัน ═════════════════════════
let crashed = "";
let wipe: WipeReport = { tables: 0, left: {}, tenantLeft: 0, usersLeft: 0, err: "" };
try {
  await runStatic();
  await runPure(sharedMod);
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  installFetchGuard();
  try {
    wipe = await wipeTenants();
    const residue = Object.values(wipe.left).reduce((a, b) => a + Math.abs(b), 0) + wipe.tenantLeft + wipe.usersLeft;
    console.log(`  ลบร้านชั่วคราว ${T || "(ไม่ได้สร้าง)"} + ${T2 || "-"}: ${wipe.tables} ตาราง · แถวค้าง ${residue} ${JSON.stringify(wipe.left)} · Tenant ${wipe.tenantLeft} · ผู้ใช้ ${wipe.usersLeft}${wipe.err ? ` · ${wipe.err}` : ""}`);
  } catch (e) {
    wipe.err = `cleanup: ${(e as Error).message.slice(0, 200)}`;
    console.log(`💥 ${wipe.err}`);
  } finally {
    removeFetchGuard();
  }
}
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
await sleep(200);
const tempLeft = Object.entries(wipe.left).map(([k, v]) => `${k}:${v}`);
chk("Z1", tempLeft.length === 0 && wipe.tenantLeft === 0 && wipe.usersLeft === 0 && !wipe.err, "ร้านชั่วคราว 0 แถว · Tenant ถูกลบ · ผู้ใช้ชั่วคราว 0",
  [tempLeft.length ? `ร้านชั่วคราวเหลือ ${tempLeft.join(", ")}` : `ร้านชั่วคราว 0 (${wipe.tables} ตาราง)`, wipe.tenantLeft ? "แถว Tenant ยังอยู่" : "", wipe.usersLeft ? `ผู้ใช้เหลือ ${wipe.usersLeft}` : "ผู้ใช้ 0", wipe.err].filter(Boolean).join(" · "));
/** รอยของรอบนี้นอกร้านชั่วคราว (ตัวตัดสิน Z2 — ไม่ไวต่อ lane อื่นที่เขียนพร้อมกัน) */
async function leaksOutside(): Promise<string[]> {
  const out: string[] = [];
  const n = async (lbl: string, f: () => Promise<unknown>) => {
    try {
      const v = Number(await f());
      if (v) out.push(`${lbl}:${v}`);
    } catch (e) {
      out.push(`${lbl}:err ${(e as Error).message.slice(0, 40)}`);
    }
  };
  const since = new Date(RUN_START - MIN);
  const like = `%${RAND}%`;
  await n("posSale", () => P.posSale.count({ where: { idempotencyKey: { startsWith: KEY_PREFIX } } }));
  await n("invMovement.key", () => P.invMovement.count({ where: { idempotencyKey: { startsWith: KEY_PREFIX } } }));
  if (MY_SALES.length) await n("invMovement.ref", () => P.invMovement.count({ where: { refId: { in: MY_SALES } } }));
  await n("invItem", () => P.invItem.count({ where: { sku: { startsWith: KEY_PREFIX } } }));
  await n("posProduct", () => P.posProduct.count({ where: { name: { contains: RAND }, createdAt: { gte: since } } }));
  await n("auditLog", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "AuditLog" WHERE "createdAt" >= $1 AND (coalesce("after"::text,'') || coalesce("before"::text,'')) LIKE $2`, since, like)) as Any[])[0]?.n);
  await n("outboxEvent", async () => ((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "createdAt" >= $1 AND ("payload"::text LIKE $2 OR "idempotencyKey" LIKE $2)`, since, like)) as Any[])[0]?.n);
  await n("tenant", () => P.tenant.count({ where: { slug: { startsWith: T_SLUG } } }));
  return out;
}
const leaks = await leaksOutside();
const fpAfter = await fingerprint();
const fpDrift = Object.keys(fpBefore).filter((k) => fpBefore[k] !== fpAfter[k]).map((k) => `${k}:${fpBefore[k]}→${fpAfter[k]}`);
chk("Z2", leaks.length === 0, "ไม่มีรอยของรอบนี้นอกร้านชั่วคราว (ลายนิ้วมือ = ข้อมูล)",
  [leaks.length ? `หลุด ${leaks.join(", ")}` : "ไม่มีรอย", fpDrift.length ? `(ข้อมูล · lane อื่นอาจเขียน) ลายนิ้วมือต่าง ${fpDrift.join(", ")}` : `ลายนิ้วมือร้านอื่นเท่าเดิม (${Object.entries(fpAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`].join(" · "));
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 80)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
const parIds = CHECKS.filter(([, x]) => x === "PAR").map(([id]) => id);
const parRed = parIds.filter((id) => failed.includes(id));
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size}${FORCE ? " (QC_FORCE)" : ""} · PAR ${parIds.length - parRed.length}/${parIds.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, parRed, skipped: false, forced: FORCE, missing: skipReasons, guardHits: guardHits.length, residue: tempLeft.length + wipe.tenantLeft + wipe.usersLeft, leaks, fpDrift })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);

// ─── หมายเหตุขอบเขต ───
// นอกขอบเขต P2.3 S: จอ 06 แท็บ "สูตรและวัตถุดิบ" · ป้ายไทล์ · ลิ้นชักบิล · ประวัติสต็อก 16 (P2.3U · visual ของผู้คุมงาน) ·
//   bomDeduct พลิกเป็น true + ORACLE-EDIT qc-pos-p1.18.mts:314 (P2.3U) · หน่วยซื้อ/ต้นทุนละเอียด (คลัง V2) · yield/ผลิต (P3) ·
//   86 อัตโนมัติ + event pos.product.availability (P2.6) · ร้านอาหาร/เว็บ/QR ส่ง components (P2.4/P2.7/P2.8) ·
//   ชุดเงิน COMMON §7 (qc-pos-* ทั้งหมด · qc-account-cpa · qc-restaurant-money …) ผู้สร้างรันก่อน/หลัง (ผลต้องเท่าเดิม)
