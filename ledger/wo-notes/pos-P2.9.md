# POS P2.9 S — gift card / store credit as tender · tips booked · X5 reversals

Brief `ledger/pos-briefs/pos-brief-P2.9.md` (§10 rulings 1–13 binding) · prompt `pos-prompt-accountB-P2.9.md` · builder account B · tree `/root/projects/shark-pos-b` · branch `wip/pos-p2.9` from `session/pos` 57dc226b (code 671e6fd2).
Prisma client: base added P2.6 columns ⇒ `pnpm exec prisma generate` once after checkout, again after the P2.9 schema (tree b own node_modules).

## Status
- [x] 1 oracle `scripts/qc-pos-p2.9.mts` (45 checks · 13b9fbbd · fixture fix b1b95525 · self-fixes 8867a10e 09d8a5b6) + ORACLE-EDIT p1.6 K4/K5 (46610467) + p1.12 ST4 (95271e10) · red-before `ledger/wo-notes/P2.9-red.txt` (ee93ca56)
- [x] 2 schema + migration `20261209100000_pos_p29_tenders` (5e55b669) — **applied on QC4**
- [x] 3 server (4baf8809 primitives · 68b11bc4 POS server · a3fa7b32 readers) — **GIFT_CARD in `createSale` stopped at the contract → CONTROLLER-DECISION below**
- [x] 4 owner lines (7126235f) + these notes
- [x] 5 merge `origin/session/pos` 5e610133 (ledger only) → a72b170b → gates (table below)
- ~~⏸ STOPPED at the createSale contract~~ → **CD-P29-1 APPROVED by the controller 14 Oct** (conditions a–d) — oracle +3 (APIN O1 O2 · `test(qc-pos-p2.9)` 38965237) · red-before block 2 (5c62c65d) · patch applied **0e9e3144** · upstream `origin/session/pos` 23561d97 (P2.6U merged 4449123f) → **08cb294c** · gates green (table "Gates after CD-P29-1").

## CONTROLLER-DECISION CD-P29-1 — `createSale` input `payMethods[].giftCard` (F15.2 contract change) — ✅ APPROVED 14 Oct · applied 0e9e3144
**Why it is needed**: the GIFT_CARD tender needs the card number + PIN inside the sale transaction (R3 · ruling 3 PIN · ruling 13 "consumed inside the sale tx"). No existing `payMethods[]` field can carry a PIN without changing a field's meaning (COMMON 2). STORE_CREDIT needs **no** input change (card = the bill member's credit), so it is live in this branch.
**What the branch does without it**: `createSale` refuses any GIFT_CARD row with VALIDATION "ยังไม่เปิดรับบัตรของขวัญเป็นวิธีชำระ — รอการยืนยันสัญญาข้อมูลของบิล (P2.9)" (`service.ts` `validateTenderRows`) · register `REGISTER_PAY_TYPES` has STORE_CREDIT only · `scripts/pos-sale-contract.json` unchanged (sha256 `7a418de1…97cd`, = base).
**Proposed change (additive only)**: `payMethods[].giftCard?: { number: string; pin: string }` (GIFT_CARD rows only; ≤ 3 distinct cards; wrong key on another row = VALIDATION) + register `RegisterPayMethod.giftCard?` / `REGISTER_PAY_TYPES += GIFT_CARD` + contract snapshot via `pnpm exec tsx scripts/fitness-pos.mts --update-pos-contract` (adds `payMethods[].giftCard` (optional object) · `.number` · `.pin`). ⚠️ The same `--update-pos-contract` run also records the **pre-existing** caller `src/lib/modules/pos/order.ts` (added by P2.8, never snapshotted — F15.2 already prints it as info); it is in the diff below, it is not a P2.9 call site (L2 = caller registry unchanged vs base).
**Evidence (patch applied locally, not committed)**: `qc-pos-p2.9` forced **45/45** (residue 0) · `pnpm typecheck` rc 0 · fitness-pos 8/8 (F15.2 green before and after the snapshot update). Reverted afterwards; `git apply --check` passes on head a72b170b.
**Apply**: `git -C <tree> apply ledger/wo-notes/P2.9-CD-giftcard-tender.patch` (same bytes as the diff below) → commit `pos P2.9 S: createSale payMethods[].giftCard (CD-P29-1)` → re-run p2.9 ×2 + unforced, typecheck, fitness-pos, p1.6 (U4 registry unchanged), p1.3, qc-hf-tx.
**Reviewer diff**: `git diff 57dc226b -- scripts/pos-sale-contract.json` after applying = 3 added type keys + the order.ts caller line, nothing removed or renamed.

```diff
diff --git a/scripts/pos-sale-contract.json b/scripts/pos-sale-contract.json
index 4c3edfdb..29f82c58 100644
--- a/scripts/pos-sale-contract.json
+++ b/scripts/pos-sale-contract.json
@@ -240,6 +240,18 @@
       "lines[].listPriceSatang": {
         "optional": true,
         "type": "number"
+      },
+      "payMethods[].giftCard": {
+        "optional": true,
+        "type": "object"
+      },
+      "payMethods[].giftCard.number": {
+        "optional": false,
+        "type": "string"
+      },
+      "payMethods[].giftCard.pin": {
+        "optional": false,
+        "type": "string"
       }
     },
     "MemberSaleChoices": {
@@ -302,6 +314,7 @@
       "src/lib/modules/hotel/service.ts",
       "src/lib/modules/member/subscription.ts",
       "src/lib/modules/pos/api/ops/sales.ts",
+      "src/lib/modules/pos/order.ts",
       "src/lib/modules/pos/register.ts",
       "src/lib/modules/rental/service.ts",
       "src/lib/modules/restaurant/order.ts",
diff --git a/src/components/pos/register/PayDone.tsx b/src/components/pos/register/PayDone.tsx
index b7771c23..8b9d6d56 100644
--- a/src/components/pos/register/PayDone.tsx
+++ b/src/components/pos/register/PayDone.tsx
@@ -28,7 +28,7 @@ import { RegisterDialog, SheetGrab } from "./RegisterDialog";
 import { RegisterIcon } from "./RegisterIcon";
 
 const AUTO_SECONDS = 5;
-const PAY_LABEL: Record<RegisterPayType, string> = { CASH: "pay.cash", PROMPTPAY: "pay.promptpay", TRANSFER: "pay.transfer", CARD: "pay.card", PLATFORM: "pay.platform", STORE_CREDIT: "pay.storeCredit" }; // POS P2.1 ▸ PLATFORM ◂ · POS P2.9 ▸ STORE_CREDIT ◂
+const PAY_LABEL: Record<RegisterPayType, string> = { CASH: "pay.cash", PROMPTPAY: "pay.promptpay", TRANSFER: "pay.transfer", CARD: "pay.card", PLATFORM: "pay.platform", GIFT_CARD: "pay.giftCard", STORE_CREDIT: "pay.storeCredit" }; // POS P2.1 ▸ PLATFORM ◂ · POS P2.9 ▸ STORE_CREDIT ◂
 
 type Props = {
   receiptNo: string | null;
diff --git a/src/lib/modules/pos/register-shared.ts b/src/lib/modules/pos/register-shared.ts
index 395070a9..4243a597 100644
--- a/src/lib/modules/pos/register-shared.ts
+++ b/src/lib/modules/pos/register-shared.ts
@@ -19,8 +19,8 @@ export const REGISTER_LOW_STOCK = 5;
 export const REGISTER_PAGE_SIZE = 100;
 export const REGISTER_PAGE_MAX = 500;
 /** วิธีจ่ายที่หน้าขายรับ (P1.3 Addendum 2 + P1.6 R2: โอน + บัตรแบบกรอกเลขอ้างอิง EDC · ไม่มีเกตเวย์ = P1.7) */
-// POS P2.9 ▸ R1 R7: + STORE_CREDIT (เครดิตร้านของสมาชิกในบิล · ไม่มี PIN · แถวเดียว) — GIFT_CARD ตามมาเมื่อสัญญา createSale ได้ payMethods[].giftCard (CONTROLLER-DECISION) ◂
-export const REGISTER_PAY_TYPES = ["CASH", "PROMPTPAY", "TRANSFER", "CARD", "PLATFORM", "STORE_CREDIT"] as const; // POS P2.1 ▸ PLATFORM เฉพาะช่องทาง payout PLATFORM (R5 · CHANNEL_PAY_MISMATCH) ◂
+// POS P2.9 ▸ R1: + GIFT_CARD (giftCard {number, pin} · ≤ 3 ใบ) + STORE_CREDIT (เครดิตร้านของสมาชิกในบิล · ไม่มี PIN · แถวเดียว) ◂
+export const REGISTER_PAY_TYPES = ["CASH", "PROMPTPAY", "TRANSFER", "CARD", "PLATFORM", "GIFT_CARD", "STORE_CREDIT"] as const; // POS P2.1 ▸ PLATFORM เฉพาะช่องทาง payout PLATFORM (R5 · CHANNEL_PAY_MISMATCH) ◂
 /** P1.6 R2: แบ่งจ่ายได้ไม่เกินกี่รายการ (ชนิดซ้ำได้ · เงินสดได้รายการเดียว) — เกิน = SPLIT_INVALID */
 export const REGISTER_MAX_PAY_METHODS = 10;
 /** P1.6 R5: หมายเหตุบิล/บรรทัดยาวได้ไม่เกิน (ตัวอักษร) */
@@ -413,7 +413,8 @@ export type RegisterQuoteOverrideInput = { cart: RegisterQuoteInput; staffToken?
 
 export type RegisterPayType = (typeof REGISTER_PAY_TYPES)[number];
 /** reference = เลขอ้างอิงบัตร/EDC หรือโอน (P1.6 · ≤ REGISTER_REFERENCE_MAX · เงินสดไม่มี) · P1.7: "pi_…" บน PROMPTPAY/CARD = id ใบขอรับเงินที่ PAID แล้ว (พร้อมเพย์รับเฉพาะ pi_…) */
-export type RegisterPayMethod = { type: RegisterPayType; amountSatang: number; reference?: string };
+/** POS P2.9 ▸ giftCard = บัตรของขวัญของแถว GIFT_CARD เท่านั้น (เลขที่สแกน/พิมพ์ + PIN ของลูกค้า · ห้ามเก็บ/บันทึก PIN ที่จอ) ◂ */
+export type RegisterPayMethod = { type: RegisterPayType; amountSatang: number; reference?: string; giftCard?: { number: string; pin: string } };
 export type RegisterSubmitInput = RegisterQuoteInput & {
   /** คีย์เดียวต่อบิล — คงเดิมทุกการลองซ้ำ (สเปก §3.4) */
   idempotencyKey: string;
diff --git a/src/lib/modules/pos/register.ts b/src/lib/modules/pos/register.ts
index 424c1d86..44d12e8f 100644
--- a/src/lib/modules/pos/register.ts
+++ b/src/lib/modules/pos/register.ts
@@ -411,7 +411,7 @@ export async function posLinkSaleToDeal(tenantId: string, actor: MemberActor, in
 //    ส่วนลดเกินเพดาน/เกินยอด = ปฏิเสธ · บิลจริงเดินผ่าน createSale เดิม (ตัดสต็อก · บัญชี · แต้ม · outbox เหมือนวันนี้ทุกประการ)
 import { Prisma, type PosProduct, type PrismaClient } from "@prisma/client";
 import { canAccessUnit, evaluate, permissionValue } from "@/lib/core/rbac";
-import { createSale, PosSaleError, saleWalletCart, type CreateSaleInput, type SaleWalletCart } from "./service";
+import { createSale, MAX_GIFT_CARD_ROWS, PosSaleError, saleWalletCart, type CreateSaleInput, type SaleWalletCart } from "./service";
 // POS P1.12 ▸ คูปองที่หน้าขาย (R6 · ตรวจบนฐานเดียวกับ createSale) · VAT ของยอดหลังสิทธิ์สมาชิก (สูตรเดียวกับ createSale) ◂
 import * as couponSvc from "@/lib/modules/coupon/service";
 import { splitIncludedVat } from "@/lib/money/vat";
@@ -1126,7 +1126,8 @@ const REG_SUBMIT_KEYS: ReadonlySet<string> = new Set([
   "channelRef", // POS P2.1 ▸ R10 ◂
   "expectedTableItemsHash", // POS P2.4 ▸ R7 แฮชชุดรายการจาก quote ของโต๊ะ ◂
 ]);
-const REG_PAY_KEYS: ReadonlySet<string> = new Set(["type", "amountSatang", "reference"]);
+const REG_GIFT_KEYS: ReadonlySet<string> = new Set(["number", "pin"]); // POS P2.9 ◂
+const REG_PAY_KEYS: ReadonlySet<string> = new Set(["type", "amountSatang", "reference", "giftCard"]); // POS P2.9 ▸ giftCard {number, pin} เฉพาะ GIFT_CARD ◂
 const REG_LINE_KEYS: ReadonlySet<string> = new Set(["productId", "name", "qty", "unitPriceSatang", "openPrice", "discount", "note", "options", "weighedBarcode", "weightGrams"]);
 /** P1.2 R1: คีย์ของรายการตัวเลือก — priceDeltaSatang/name รับได้แต่ "ไม่ใช้" (ราคาจาก client ไม่ถูกเชื่อ · มติ R2) · คีย์อื่น = VALIDATION */
 const REG_OPTION_KEYS: ReadonlySet<string> = new Set(["choiceId", "priceDeltaSatang", "name"]);
@@ -1880,7 +1881,7 @@ type RegParsedSubmit = {
   cart: RegParsedCart;
   /** คีย์ที่เก็บจริง = REG_KEY_PREFIX + คีย์ของ client (R4 K1) */
   idempotencyKey: string;
-  payMethods: { type: RegisterPayType; amountSatang: number; reference: string | null }[];
+  payMethods: { type: RegisterPayType; amountSatang: number; reference: string | null; giftCard?: { number: string; pin: string } }[]; // POS P2.9 ▸ giftCard เฉพาะ GIFT_CARD ◂
   cashReceivedSatang: number | null;
   expected: number;
   /** P1.6 ทิป (0 = ไม่มี) · หมายเหตุบิล (null = ไม่มี) */
@@ -1948,6 +1949,16 @@ function regParseSubmit(raw: unknown): RegParsedSubmit | RegisterRefusal {
     if (p.type === "CASH" && payMethods.some((x) => x.type === "CASH")) return regRefuse("VALIDATION", "เงินสดใส่ได้รายการเดียว");
     // POS P2.9 ▸ R7: เครดิตร้านได้รายการเดียว ไม่มีเลขอ้างอิง (สมาชิกของบิล = เจ้าของเครดิต — ตรวจตอนส่ง) ◂
     if (p.type === "STORE_CREDIT" && (payMethods.some((x) => x.type === "STORE_CREDIT") || (p.reference !== undefined && p.reference !== null))) return regRefuse("VALIDATION", "เครดิตร้านใส่ได้รายการเดียว และไม่มีเลขอ้างอิง");
+    // POS P2.9 ▸ R1 R3 (มติ 3 4): บัตรของขวัญ = giftCard {number, pin} ตรงตัว · ไม่มีเลขอ้างอิง · ≤ 3 ใบ ไม่ซ้ำ · giftCard บนแถวอื่น = VALIDATION ◂
+    let giftCard: { number: string; pin: string } | undefined;
+    if (p.giftCard !== undefined || p.type === "GIFT_CARD") {
+      const g = p.giftCard;
+      if (p.type !== "GIFT_CARD" || !regIsRecord(g) || !regOnlyKeys(g, REG_GIFT_KEYS) || typeof g.number !== "string" || typeof g.pin !== "string") return regRefuse("VALIDATION", "ข้อมูลบัตรของขวัญไม่ถูกต้อง");
+      const number = g.number.trim().toUpperCase();
+      if (!number || number.length > 40 || !regCleanText(number) || !/^[0-9]{4,12}$/.test(g.pin) || (p.reference !== undefined && p.reference !== null)) return regRefuse("VALIDATION", "ข้อมูลบัตรของขวัญไม่ถูกต้อง");
+      if (payMethods.filter((x) => x.type === "GIFT_CARD").length >= MAX_GIFT_CARD_ROWS || payMethods.some((x) => x.giftCard?.number === number)) return regRefuse("VALIDATION", "ใช้บัตรของขวัญได้ไม่เกิน 3 ใบต่อบิล และใบเดียวกันได้รายการเดียว");
+      giftCard = { number, pin: g.pin };
+    }
     let reference: string | null = null;
     if (p.reference !== undefined && p.reference !== null) {
       // POS P1.7 ▸ พร้อมเพย์รับเลขอ้างอิงได้เฉพาะ id ใบขอรับเงิน (pi_…) · อื่น ๆ = VALIDATION เหมือน P1.6 ◂
@@ -1957,7 +1968,7 @@ function regParseSubmit(raw: unknown): RegParsedSubmit | RegisterRefusal {
       if (typeof p.reference !== "string" || p.reference.length > REGISTER_REFERENCE_MAX || !regCleanText(p.reference)) return regRefuse("VALIDATION", "เลขอ้างอิงไม่ถูกต้อง");
       reference = p.reference.trim() || null;
     }
-    payMethods.push({ type: p.type as RegisterPayType, amountSatang: p.amountSatang, reference });
+    payMethods.push({ type: p.type as RegisterPayType, amountSatang: p.amountSatang, reference, ...(giftCard ? { giftCard } : {}) });
   }
   let cashReceivedSatang: number | null = null;
   if (raw.cashReceivedSatang !== undefined && raw.cashReceivedSatang !== null) {
@@ -2355,6 +2366,7 @@ export async function submitRegisterSale(ctx: RegisterCtx, actor: RegisterActor,
         type: x.type,
         amountSatang: x.amountSatang,
         ...(x.reference ? { reference: x.reference } : {}),
+        ...(x.giftCard ? { giftCard: { number: x.giftCard.number, pin: x.giftCard.pin } } : {}), // POS P2.9 ▸ R3 ◂
         ...(x.type === "CASH" && req.cashReceivedSatang !== null ? { cashTenderedSatang: req.cashReceivedSatang } : {}),
       })),
       ...(q.serviceChargeSatang > 0 ? { serviceChargeSatang: q.serviceChargeSatang } : {}),
diff --git a/src/lib/modules/pos/service.ts b/src/lib/modules/pos/service.ts
index 9406947c..4e692591 100644
--- a/src/lib/modules/pos/service.ts
+++ b/src/lib/modules/pos/service.ts
@@ -107,7 +107,8 @@ export type CreateSaleInput = {
   couponCode?: string;
   // POS P1.6 (เพิ่มล้วน · ไม่ส่ง = พฤติกรรมเดิม):
   //   cashTenderedSatang = เงินที่รับจริงของแถว CASH (≥ ยอดแถว · ทอน = รับ − ยอดแถว เก็บบนแถวนั้น) · reference = เลขอ้างอิงบัตร/EDC
-  payMethods: { type: PosPayType; amountSatang: number; refSaleId?: string; cashTenderedSatang?: number; reference?: string }[];
+  // POS P2.9 (R3 · มติ 3 4 · เพิ่มล้วน): giftCard = บัตรของขวัญของแถว GIFT_CARD เท่านั้น {number, pin} (ตัดยอดใน tx ของบิล · ≤ 3 ใบไม่ซ้ำ)
+  payMethods: { type: PosPayType; amountSatang: number; refSaleId?: string; cashTenderedSatang?: number; reference?: string; giftCard?: { number: string; pin: string } }[];
   /** หมายเหตุบิล (≤500 ตัว) */
   note?: string;
   /** ค่าบริการ (สตางค์ · รวมอยู่ใน grandTotal และฐาน VAT) — ผู้เรียกคิดเอง · ไม่ส่ง = 0 (ผู้เรียกเดิมที่มีบรรทัดค่าบริการของตัวเองไม่โดนคิดซ้ำ) */
@@ -255,14 +256,23 @@ const TIP_FUNDING_TYPES: ReadonlySet<string> = new Set(["CASH", "PROMPTPAY", "TR
 export const MAX_GIFT_CARD_ROWS = 3;
 /**
  * ตรวจโครงแถวชนิดใหม่ (ก่อนแตะตัวนับ) — ตรวจเฉพาะเมื่อมีแถว GIFT_CARD/STORE_CREDIT หรือทิป > 0 (ผู้เรียกเดิมไม่ถูกตรวจเพิ่ม):
- *   GIFT_CARD = ยังไม่รับผ่าน createSale (รอ CONTROLLER-DECISION: payMethods[].giftCard — สัญญา F15.2) · STORE_CREDIT ได้แถวเดียว ·
+ *   GIFT_CARD ≤ 3 ใบไม่ซ้ำ ต้องมี giftCard {number, pin} (ห้ามบนแถวอื่น) · STORE_CREDIT ได้แถวเดียว ·
  *   ห้ามบนบิลขาย/เติมบัตร (sourceModule MEMBER) และห้ามคู่ทางส่วนลดเดิม memberChoices.giftCard · ทิป ≤ Σ แถวเงินจริง
  */
 function validateTenderRows(input: CreateSaleInput): void {
   const bad = (m: string) => new PosSaleError("VALIDATION", m);
   const gift = input.payMethods.filter((p) => p.type === "GIFT_CARD");
   const credit = input.payMethods.filter((p) => p.type === "STORE_CREDIT");
-  if (gift.length) throw bad("ยังไม่เปิดรับบัตรของขวัญเป็นวิธีชำระ — รอการยืนยันสัญญาข้อมูลของบิล (P2.9)");
+  if (input.payMethods.some((p) => p.type !== "GIFT_CARD" && p.giftCard !== undefined && p.giftCard !== null)) throw bad("ข้อมูลบัตรใส่ได้เฉพาะรายการบัตรของขวัญ");
+  if (gift.length > MAX_GIFT_CARD_ROWS) throw bad(`ใช้บัตรของขวัญได้ไม่เกิน ${MAX_GIFT_CARD_ROWS} ใบต่อบิล`);
+  const seen = new Set<string>();
+  for (const p of gift) {
+    const g = p.giftCard;
+    if (!g || typeof g.number !== "string" || typeof g.pin !== "string" || !g.number.trim() || g.number.trim().length > 40 || !g.pin || g.pin.length > 12) throw bad("ข้อมูลบัตรของขวัญไม่ครบ (หมายเลข + PIN)");
+    const n = g.number.trim().toUpperCase();
+    if (seen.has(n)) throw bad("บัตรของขวัญใบเดียวกันใส่ได้รายการเดียว");
+    seen.add(n);
+  }
   if (credit.length > 1) throw bad("เครดิตร้านใส่ได้รายการเดียว");
   if (gift.length + credit.length > 0) {
     if (input.sourceModule === "MEMBER") throw bad("บิลขาย/เติมบัตรกำนัลจ่ายด้วยบัตรของขวัญหรือเครดิตร้านไม่ได้");
@@ -293,12 +303,18 @@ async function tenderStep<T>(member: MemberTenderFacade, fn: () => Promise<T>):
  * แล้วล็อกแถวบัตรทุกใบ (เรียง id) ⇒ ลำดับล็อก บัตร → ตัวนับ เหมือนกันทุกบิล · ไม่มีแถวบัตร = ไม่มี query
  */
 async function prepareSaleTenders(tx: Client, input: CreateSaleInput, memberSystemId: string | null): Promise<SaleTender[]> {
-  const rows = input.payMethods.map((p, index) => ({ p, index })).filter((x) => x.p.type === "STORE_CREDIT");
+  const rows = input.payMethods.map((p, index) => ({ p, index })).filter((x) => x.p.type === "STORE_CREDIT" || x.p.type === "GIFT_CARD");
   if (!rows.length) return [];
   const member = await import("@/lib/modules/member");
   const db = tx as Prisma.TransactionClient;
   const out: SaleTender[] = [];
   for (const { p, index } of rows) {
+    if (p.type === "GIFT_CARD") {
+      // มติ 3: PIN ทุกครั้ง (ผิด = ตัวนับนอก tx คงอยู่ · บิลไม่เกิด) · บัตรทั้งร้าน (CD11)
+      const r = await tenderStep(member, () => member.prepareGiftCardTender(input.tenantId, { number: p.giftCard!.number, pin: p.giftCard!.pin, satang: p.amountSatang }, db));
+      out.push({ index, giftCardId: r.giftCardId, satang: p.amountSatang });
+      continue;
+    }
     if (!input.memberId || !memberSystemId) throw new PosSaleError("STORE_CREDIT_NOT_OWNER", "เครดิตร้านใช้ได้เฉพาะบิลของสมาชิกเจ้าของเครดิต — เลือกสมาชิกก่อน");
     const r = await tenderStep(member, () => member.prepareStoreCreditTender(input.tenantId, { systemId: memberSystemId, customerId: input.memberId!, satang: p.amountSatang }, db));
     out.push({ index, giftCardId: r.giftCardId, satang: p.amountSatang });
```

## Hunks (file:line at code head 09d8a5b6 = a72b170b minus ledger; all marked `// POS P2.9 ▸ … ◂`)
**Schema** `prisma/schema/pos.prisma` PosPayType + GIFT_CARD/STORE_CREDIT · PosPayment.giftCardId/giftCardTxnId · `prisma/schema/giftcard.prisma` enum GiftCardKind + GiftCard.kind · migration `prisma/migrations/20261209100000_pos_p29_tenders/migration.sql` (lock_timeout 3s · ADD VALUE IF NOT EXISTS ×2 · ADD COLUMN IF NOT EXISTS ×2 · CREATE TYPE in DO-block · kind NOT NULL DEFAULT 'GIFT' · partial unique `GiftCard_storeCredit_owner_key`). QC4 deploy: "Applying migration `20261209100000_pos_p29_tenders` … All migrations have been successfully applied." rc 0 (176 migrations found).
**giftcard** `src/lib/modules/giftcard/service.ts:1249–1505` (new section): `tenderLookup` :1290 · `prepareGiftTender` :1303 (card by tenant+number, kind GIFT else NOT_FOUND · lock → LOCKED · state/balance → CHANGED · `verifyPin` reused, counter outside tx) · `storeCreditCardOf` :1321 · `prepareStoreCreditTender` :1327 · `lockTenderCards` :1336 (FOR UPDATE ORDER BY id) · `useTender` :1346 (USE refType PosPayment, key `pos-gct-<saleId>-<cardId>`, balanceAfter from locked row, no `postGiftCardUse`, outbox `giftcard.used` +tender:true) · `refundTenderUse` :1381 (REFUND key `giftcard-refund-<USE>`, card row locked, no JV) · `tenderRefundable` :1407 · `refundToCard` :1416 (REFUND refType PosRefund, ACTIVE/DEPLETED + not expired, else CHANGED) · `issueStoreCredit` :1441 (INSERT … ON CONFLICT DO NOTHING + lock owner card, `SC-` number, random unusable PIN, no expiry) · `tenderEnabled` :1471 · `tenderCardInfo` :1476 · `foldStoreCreditOnMerge` :1487 (called from `mergeGiftCards` :1237). `errors.ts` + `GiftCardTenderError`. `index.ts` facade exports. Existing `use/sell/reload/refundUse/refundUsesForSale/expireDue` untouched (`refundUsesForSale` already filters `refType "PosSale"` ⇒ tender USE txns are ignored by the member bridge — R5 no double credit).
**member** `src/lib/modules/member/tender.ts` (new, thin wrappers + `tenderErrorCode`) · `member/index.ts` exports.
**account** `account/index.ts:113–119` channel `STORED_VALUE` + `tip?` param · :192 → `DEPOSIT_RECEIVED` · :216–230 tip ledger check (`gl.liabilityLedgerOf`) → `crExtra` · :409 + :451 refund `STORED_VALUE` → Cr 2110 · `account/gl.ts:1742/1759` `postExternalSale.crExtra` · :1779 `liabilityLedgerOf` (read-only) · :1803 `postExternalRefund` crLines + DEPOSIT_RECEIVED.
**pos/service.ts** :174 error codes · :251–330 `validateTenderRows` (GIFT_CARD refused until CD · STORE_CREDIT ≤ 1 · not on MEMBER bills / with `memberChoices.giftCard` · tip ≤ Σ CASH/PROMPTPAY/TRANSFER/CARD) + `prepareSaleTenders` (member store credit, lock cards **before** receipt counter) + `useSaleTenders` · :638 prepare call · :809 ordered PosPayment ids when tender rows · :829 decrement in the sale tx + `PosPayment.giftCardId/giftCardTxnId` · :1399–1409 labels/order.
**pos/refund.ts** :117/:161 `giftCardId` on refund rows · :347 `RefundAbort` → refusal · :354–430 `planRefundTenders` (card of this bill only, cap = paid − already refunded to that card, refundable check; STORE_CREDIT only on member bills, ≤ 1) + `applyRefundTenders` (keys `pos-refund-<refundId>-<cardId>` / `pos-credit-<refundId>`) · :533 plan (also in approval "plan" mode) · :633–639 write. `refund-shared.ts` REFUND_PAY_TYPES + GIFT_CARD/STORE_CREDIT.
**pos/account-bridge.ts** :21–26 channelOf GIFT_CARD/STORE_CREDIT → STORED_VALUE · :120–157 tip booked (full Dr, Cr tip ledger) · :183 `tipLedgerOf` (no ledger in settings ⇒ old strip + ops WARN).
**pos/payment-settings.ts** :56 `TIP_POSTING_READY = true` · :108 tip ledger must be LIABILITY.
**pos/tender.ts** (new): `registerGiftCardLookup` · `registerPayTenders` · `tenderSaleVoided` · `pos/tender-cards.ts` (new) `paymentCards` · `register-actions.ts:346` actions `registerGiftCardLookupAction` / `registerPayTendersAction`.
**outbox** `src/lib/outbox-consumers.ts:750` fourth try-block in the `pos.sale.voided` main step (after KDS, before kanban/stamp/member bridge).
**register** `register-shared.ts:22` REGISTER_PAY_TYPES + STORE_CREDIT · :221 codes · :889 REFUSAL_KEY · `register.ts:600` messages · :1949 STORE_CREDIT parse · :2259 member required + tip-funding rule.
**readers** `receipt.ts:202/347` · `bills.ts:355/513` · `bills-shared.ts` payment `card?` · `receipt-render.ts:12/59/75/395/583` (card line + "คงเหลือ") · `shift.ts:33` METHOD_ORDER · UI label sets (one token each): ReportsOverview/ReportsClient/bills-ui/ShiftsClient/PosPublicReceipt/PayDone · messages th/en: `register.errors.*` (5) · `register.pay.giftCard/storeCredit` · `shift.method` · `report.closeDay.method` · `receipt.public.pay`.

## Oracle `scripts/qc-pos-p2.9.mts` — 45 checks
ST1–ST4 · T1–T5 · S1–S4 · G1–G8 · A1–A4 · C1–C4 · V1–V9 · R1–R2 · L1–L3 · Z1–Z2 (§6 minus D per ruling 12; R1/R2 added for R10 and rulings 6/8/13; T5 folds "X expected cash" + "void reverses tip"). Concurrency is deterministic: a third transaction holds `FOR UPDATE` on the card, the oracle waits until the waiters are visible in `pg_stat_activity` (level-2 waiters counted — second register waits behind the first in the row-lock queue), then releases/acts (HT2.8/2.9 pattern).
Self-fixes before merge (my own oracle, no ORACLE-EDIT needed): hotel = UnitType HOTEL (no HOTEL SystemType) · ST2 voided-block anchor on comment-stripped source · R1 X report needs a live store-credit bill in the shift · holdLock level-2 waiter count · billDetail input carries unitId.

## Red-before (`ledger/wo-notes/P2.9-red.txt`, base code 671e6fd2 + oracle, QC_FORCE=1)
6/45 green · 39 red. Green by design and **cannot be red on the base**: L1 (contract unchanged = additions-only vacuously), L2 (caller registry = base), L3 + A2 (legacy `memberChoices.giftCard` discount path — PAR, must stay green), Z1/Z2 (residue / seed leaks). Every other check is red for the stated reason (no migration/enum/columns, no tender.ts/member exports, TIP_NOT_AVAILABLE, VALIDATION on new pay types, missing functions). Residue 0.

## Deviations (ruling refs)
1. **CD-P29-1 (prompt rule)**: GIFT_CARD tender stops at the `createSale` contract; everything below it (giftcard/member primitives, refund to card, void reversal, GL channel, receipt lines) is built and exercised by STORE_CREDIT (same `useTender`/`refundTenderUse`) and by the CD patch run (45/45).
2. `giftcard.use({tender:true})` (brief R3 wording) is implemented as separate functions `prepareGiftTender` + `useTender` (ruling 13 asks the decrement to be in the sale tx; split is needed to verify PIN and lock the card rows **before** the receipt counter — same lock order on every bill, no card↔counter deadlock). `use()` itself is unchanged (frozen per §7).
3. Ruling 10 "own GiftCardTxn type/refType": no enum change (§3: no GiftCardTxn change) — refund-to-card / store-credit issue use type `REFUND` with refType `PosRefund` (void reversal: `REFUND` refType `GiftCardTxn`, same key as `refundUse`).
4. Ruling 6: no `PosPayment.depositId`, no `PosDeposit` (P2.9b) — ST1 checks they are absent.
5. Ruling 8: "HOTEL link" = `BusinessUnit.type = HOTEL` (there is no HOTEL AppSystem type) — `registerPayTenders.roomCharge.visible`.
6. Tip-funding rule is applied to every createSale bill with tip > 0 (tip could not be enabled before P2.9, so no legacy caller changes).
7. Store-credit `mergeGiftCards` fold (unique index would otherwise make member merges fail) — additive, owner line, no oracle check (40–45 cap).
8. brief §3 prod `PosPayment` row count: not done (prompt forbids prod/.env) → controller line.

## P2.9U contract (server side, for the U card)
- Pay types: `RegisterPayType` += `STORE_CREDIT` (now) and `GIFT_CARD` (after CD-P29-1). `RegisterPayMethod` += `giftCard?: {number, pin}` (GIFT_CARD only, after CD). Never echo/log the PIN.
- Actions (`register-actions.ts`): `registerGiftCardLookupAction({systemId, unitId, number})` → `{ok, card:{numberMasked "GC-••••1234", balanceSatang, status, expiresAt ISO|null, usable, reason SUSPENDED|EXPIRED|DEPLETED|PIN_LOCKED|null}}` | refusal `GIFT_CARD_NOT_FOUND` / `PERMISSION_DENIED` / `VALIDATION`. `registerPayTendersAction({systemId, unitId})` → `{ok, tenders:{giftCard{enabled}, storeCredit{enabled}, deposit{visible:true, enabled:false, reason:"SOON"}, roomCharge{visible: unit is HOTEL, enabled:false, reason:"SOON"}}}`.
- Store credit balance for the chip: the member's cards already come through `registerMemberBenefits` → `giftCards[]` (store credit cards are listed there too — owner line on `kind`).
- Submit refusals (all as data, `refusalMessageKey` → `pos.register.errors.*`): `GIFT_CARD_NOT_FOUND giftCardNotFound` · `GIFT_CARD_PIN giftCardPin` (counter kept) · `GIFT_CARD_LOCKED giftCardLocked` · `GIFT_CARD_CHANGED giftCardChanged` (re-lookup) · `STORE_CREDIT_NOT_OWNER storeCreditNotOwner` · tip on card/credit-only = `VALIDATION`.
- Refund (bills/12): `refundSale` payMethods types += `GIFT_CARD` (back to the bill's card; `giftCardId` required only when the bill used several cards; cap per card = card share − already refunded; suspended/expired = `REFUND_METHOD_INVALID`) and `STORE_CREDIT` (member bills only, one row).
- Receipt/bill/public receipt payment rows: `card?: {kind GIFT|STORE_CREDIT, numberMasked, balanceAfterSatang}`; printed receipt line `บัตรของขวัญ GC-••••1234 ฿x` + `คงเหลือ ฿y`. Labels: `register.pay.giftCard/storeCredit`, `shift.method.*`, `report.closeDay.method.*`, `receipt.public.pay.*`.
- **fix 1 H6 (มติ 8)**: `savePending` (RegisterScreen sessionStorage) must strip `giftCard.pin` (keep `number`); the server accepts a PIN-less GIFT_CARD row **only** as a replay of an idempotency key that already has a bill (same bill back, no second decrement) — a PIN-less first submit = VALIDATION. The PIN lives in component state only, never in storage/logs/analytics.
- **fix 1 F4**: `registerMemberBenefits.giftCards[]` items carry `kind` (GIFT | STORE_CREDIT; store credit masked `SC-••••1234`) — the store-credit chip filters `kind === "STORE_CREDIT"`.
- **fix 1 H1**: refund screen: cash-like refund rows are capped at the cash-like share of the bill (− tip − cash already refunded) ⇒ `REFUND_METHOD_INVALID`; card share back to the card; card unusable ⇒ STORE_CREDIT (member bill) or cash with a reason (walk-in, manager/approval) — `REASON_REQUIRED` otherwise.
- testids kept from P1.12U (`pos-reg-paydlg-method-giftcard|storecredit|deposit|roomcharge`); visual states per brief §9 (deposit pick = P2.9b).

## Gates
All logs headed `tree=/root/projects/shark-pos-b head=a72b170b dirty=0` (scratch `p29/gates/*.out`, 14 Oct 17:20–17:41Z); head a72b170b = code 09d8a5b6 + owner lines + upstream 5e610133 (ledger only).
| gate | tree= head= | result |
|---|---|---|
| typecheck (pos-gate.lock · 5632/6500M) | shark-pos-b a72b170b | rc 0 |
| fitness no-env / env (qc4) | shark-pos-b a72b170b | 50/50 · 50/50 |
| fitness-pos | shark-pos-b a72b170b | 8/8 (F15.2 contract unchanged) |
| qc-pos-p2.9 forced ×2 / unforced | shark-pos-b a72b170b | 22/45 · 22/45 · 22/45 (residue 0) — the 23 red are exactly the GIFT_CARD-createSale checks (G2–G7 A1 A3 A4 C1–C4 V1–V9 R1) blocked by CD-P29-1; with the CD patch: **45/45** + typecheck rc 0 |
| qc-hf-tx | shark-pos-b a72b170b | 22/22 (residue 0) |
| qc-pos-p1.6 (ORACLE-EDIT K4/K5) | shark-pos-b a72b170b | 48/48 |
| qc-pos-p1.8 | shark-pos-b a72b170b | 49/49 |
| qc-pos-p1.12 (ORACLE-EDIT ST4) | shark-pos-b a72b170b | 72/72 |
| qc-pos-p1.3 | shark-pos-b a72b170b | 128/128 |
| qc-pos-p1.1 | shark-pos-b a72b170b | 180/180 |
| qc-pos-account | shark-pos-b a72b170b | 16/16 |
| qc-pos-p2.8 | shark-pos-b a72b170b | 60/61 — ST6 wip-only (register.ts/service.ts touched; green once merged into session/pos) |
| qc-hf-pos-page-authz | shark-pos-b a72b170b | 71/71 |
| qc-pos-p1.7 | shark-pos-b a72b170b | 33/33 |
| qc-account-cpa (extra · account facade touched) | shark-pos-b a72b170b | 107/107 |
| qc-member-m2.6/m2.7/m2.8 | — | skipped (known QC4 setup failures, prompt rule) |
ORACLE-EDITs (each own `test(...)` commit, dated marker `ORACLE-EDIT ผู้คุม 14 ต.ค.`): `qc-pos-p1.6` K4/K5 `TIP_BOOKED = true` (46610467 · 48 checks) · `qc-pos-p1.12` ST4 → forbids VOUCHER only (95271e10 · 72 checks). `qc-pos-p1.3` S3.38 untouched (deposits out).

## Follow-ups
- CD-P29-1 apply → re-run p2.9 / typecheck / fitness-pos / p1.6 / p1.3 / hf-tx; hunter (money lane) after R-final.
- Gift card list/KPI and `listForCustomer` show store credit mixed with gift cards (no `kind` filter) — owner line.
- `refundUse` (legacy) and `refundTenderUse` share the key `giftcard-refund-<USE>` by design (one REFUND per USE whichever path runs).
- Visual states for the controller (P2.9U): `paydlg-giftcard-entry`, `paydlg-giftcard-split`, `paydlg-giftcard-pin-error`, `paydlg-giftcard-insufficient`, `paydlg-giftcard-changed`, `paydlg-storecredit`, `paydlg-tip`, `sale-done-giftcard`, `refund-to-card` (no visual run in S).


## CD-P29-1 applied (0e9e3144) — conditions (controller 14 Oct)
Commit `pos P2.9 S: createSale payMethods[].giftCard (CD-P29-1 approved by the controller 14 Oct)` = `ledger/wo-notes/P2.9-CD-giftcard-tender.patch` byte-for-byte + two explicit refusals for (b).
Hunks: `pos/service.ts:110–111` input type · :259–287 `validateTenderRows` (giftCard only on GIFT_CARD rows · ≤ 3 · number 1–40 + pin 1–12 · distinct numbers) · :303–321 `prepareSaleTenders` GIFT_CARD → `member.prepareGiftCardTender` · `register-shared.ts:23` REGISTER_PAY_TYPES + GIFT_CARD · :417 `RegisterPayMethod.giftCard?` · `register.ts:1129` REG_GIFT_KEYS · :1950–1971 GIFT_CARD parse (exact keys, PIN 4–12 digits, no reference, ≤ 3, distinct) · :2369 pass-through to createSale · `PayDone.tsx` label · `pos/order.ts:1115` payOrder refuses GIFT_CARD/STORE_CREDIT (VALIDATION) · `pos/api/ops/sales.ts:27` comment: `EXTERNAL_PAY_TYPES` (CASH/TRANSFER/PROMPTPAY) + `.strict()` already refuse GIFT_CARD and `giftCard` · `scripts/pos-sale-contract.json` via `--update-pos-contract`.
- **(a) PIN never persisted/logged/echoed** — oracle **APIN** (ORACLE-ADD, `test(qc-pos-p2.9)` commit): after a register gift-card sale (`submitRegisterSale`) + the createSale G2 bill, the PIN strings (and a wrong PIN) are searched as whole tokens in the tenant's AuditLog, OutboxEvent payloads, PosPayment rows, GiftCardTxn rows, the submit response, `receiptPayload`, `billDetail`, `registerGiftCardLookup` and the GIFT_CARD_PIN error message ⇒ **0 hits**. Cite: PIN goes only to `verifyPin` (sha256 compare, giftcard/service.ts — never stored raw since M2.6); `PosPayment` has no PIN column (`giftCardId`/`giftCardTxnId` only); `useTender` outbox payload {giftCardId, number, satang, saleId, balanceAfter, ownerCustomerId, tender}; lookup DTO = `numberMasked` "GC-••••1234" + balance/status (no number, no PIN); receipt/bill `card` = {kind, numberMasked, balanceAfterSatang}; refusal messages carry no PIN. P2.9U: PIN keypad value must stay in component state only (contract section).
- **(b) other createSale callers refuse GIFT_CARD** — oracle **O1**: CHAT (DIRECT) order ACCEPTED → `payOrder` GIFT_CARD with and without `giftCard` ⇒ VALIDATION, order not PAID, no bill, card balance unchanged · **O2**: `SALES_OPS` `sales.create` schema rejects GIFT_CARD (+giftCard) (422 validation, never reaches createSale), CASH positive control passes. Owner line added (gift card / store credit via API and online orders = later card).
- **(c) F15.2** — fitness-pos 8/8 with the updated snapshot · `git diff 57dc226b -- scripts/pos-sale-contract.json` = exactly `payMethods[].giftCard` (optional object) + `.number` + `.pin` + the `src/lib/modules/pos/order.ts` caller line (oracle L1 also green).
- **(d) `qc-pos-p1.6` U4 registry unchanged** — p1.6 48/48 incl. U4 ✅ · oracle L2 (createSale( per file = base 57dc226b) ✅ — no new call site.
Red-before of the adds = block 2 in `P2.9-red.txt` (branch state before the patch, 24/48: APIN red · O1/O2 green-before by design — they pin the refusal after createSale accepts GIFT_CARD).

## Gates after CD-P29-1
All logs headed `tree=/root/projects/shark-pos-b head=08cb294c dirty=0` (scratch `p29/gates-cd/*.out`, 14 Oct 17:49–18:10Z); 08cb294c = code 0e9e3144 + upstream 23561d97 (P2.6U code merged upstream as 4449123f).
| gate | tree= head= | result |
|---|---|---|
| typecheck (pos-gate.lock · 5632/6500M) | shark-pos-b 08cb294c | rc 0 |
| fitness no-env / env (qc4) | shark-pos-b 08cb294c | 50/50 · 50/50 |
| fitness-pos | shark-pos-b 08cb294c | 8/8 (F15.2 with updated snapshot) |
| qc-pos-p2.9 forced ×2 / unforced | shark-pos-b 08cb294c | **48/48 · 48/48 · 48/48** (residue 0 · guardHits 0) |
| qc-hf-tx | shark-pos-b 08cb294c | 22/22 |
| qc-pos-p1.6 | shark-pos-b 08cb294c | 48/48 (U4 ✅) |
| qc-pos-p1.8 | shark-pos-b 08cb294c | 49/49 |
| qc-pos-p1.12 | shark-pos-b 08cb294c | 72/72 |
| qc-pos-p1.3 | shark-pos-b 08cb294c | 128/128 |
| qc-pos-p1.1 | shark-pos-b 08cb294c | 180/180 |
| qc-pos-account | shark-pos-b 08cb294c | 16/16 |
| qc-pos-p1.7 | shark-pos-b 08cb294c | 33/33 |
| qc-hf-pos-page-authz | shark-pos-b 08cb294c | 81/81 |
| qc-pos-p2.8 | shark-pos-b 08cb294c | 59/61 — ST6 + L2 wip-only (register.ts/service.ts/pos-sale-contract.json differ from base be246009; both accept the merge-base sha ⇒ green once merged into session/pos; L2's caller-registry half is green) |
| qc-member-m2.x | — | skipped (known QC4 setup failures) |

## Fix round 1 (R1 MERGEABLE-AFTER-FIXES + money hunt H1–H6 · controller rulings 1–9, 14 Oct)
Oracle first: `deebbff4` (ORACLE-ADD ST5 T6 S5 G9 G10 RC1 MG1 MG2 C5 · ORACLE-EDIT V4/V6/V7 pro-rata 117/108 · 208/192, dated markers `ผู้คุม 14 ต.ค. (fix 1)`) + self-fix `2e850b08` (S5 restores the SC card on the base so G8/R1 do not cascade) · 48 → **57**. Red-before block 3 (`01cac8a2`, head 2e850b08, code 0e9e3144): **49/57** — red ST5 T6 S5 G9 G10 RC1 MG2 C5; MG1 green-before (fold already sums; MG2 pins the void path), V4/V6/V7 edited values were already accepted by the uncapped base (ruling 2 pins the split).

| finding | ruling | commit | change |
|---|---|---|---|
| F1 Medium lock order | 1 | 3d5114f6 | `pos/service.ts` `prepareSaleTenders` no longer locks; `createSaleOnce` locks the card rows (sorted) right after `posReceiptCounter.upsert` ⇒ stock → counter → card like `reload` / legacy `memberChoices.giftCard`. ST5. C1–C4 unchanged and green. |
| H2/F5 Med PIN lockout bypass | 3 | 5e0f4eb4 | `giftcard/service.ts verifyPin`: wrong PIN = one `UPDATE … SET pinFailedCount = pinFailedCount + 1, pinLockedUntil = CASE … END WHERE id AND (pinLockedUntil IS NULL OR <= now()) RETURNING`, 0 rows ⇒ LOCKED, lock decided from the returned row; correct-PIN reset only when not locked (`updateMany` guard). `pos/service.ts preverifyGiftPins`: when createSale owns the tx and the key has no bill, gift-card PINs are verified **before** opening the tx (wrong-PIN bursts no longer hold a tx connection while waiting for the counter's second connection — G9 showed P2028 pool timeouts on the base). G9: 20 parallel ⇒ counter 5, LOCKED, 0 bills. |
| H1 Med cash-out of card share | 2 | b293359e | `pos/refund.ts planRefundTenders`: cash-like rows (CASH/PROMPTPAY/TRANSFER/CARD) capped at cash-like paid − tip − cash-like already refunded (only on bills that have GIFT_CARD/STORE_CREDIT rows; other bills unchanged). Excess allowed only as the unrefunded share of **unusable** gift cards, on **walk-in** bills, by a manager (`canRefund`) or the approval/PIN-override path, with a reason (`REASON_REQUIRED` otherwise) — audit `after.cardShareToCash` + reason. Member bill ⇒ `REFUND_METHOD_INVALID` "คืนเป็นเครดิตร้าน". RC1 + V4/V6/V7 edit. |
| H3/F3 Med merged-away credit | 4 | 55a46fa7 | `giftcard/service.ts mergeTargetOf`: STORE_CREDIT card with no owner ⇒ follow the `ADJUST refType MERGE` (refId = keeper card, ≤ 5 hops); `refundTenderUse` (void) and `refundToCard` credit the keeper (both rows locked, sorted). `issueStoreCredit` re-reads `Customer.status` under the card lock (MERGED ⇒ refused, tx rolls back). MG1 MG2. |
| H4/F2 Low void onto EXPIRED card | 5 | 55a46fa7 (same function as H3) | `refundTenderUse`: target EXPIRED or past `expiresAt` ⇒ REFUND then EXPIRE same satang (key `giftcard-refund-expire-<USE>`, status EXPIRED) + `postRestoreExpire` → `postGiftCardExpire` (Dr 2110 / Cr 4900) when `accountingLink` + `accountingDocId` (same gate as `expireDue`; retried on the replay path, idempotent). C5: balance 0, REFUND 40 + EXPIRE 40, 1 JV, 2110 net 0. Owner line: expiry-at-void policy. |
| H5 Med tip ledger archived ⇒ dead-letter | 6 | 80503d91 | `pos/service.ts`: tip > 0 ⇒ `tipLedgerOk` (exported from payment-settings) re-checked in the sale tx ⇒ VALIDATION, no bill. `account/coa.ts` (approved exception, marked, 8 lines): `archiveLedger` and `updateLedger` (type away from LIABILITY) refuse a ledger referenced by `AppSystem(POS).settings.pos.tip.ledgerAccountId` (read-only lookup). T6. |
| F4 Low SC accepts gift-card ops | 7 | 5cc13810 | `loadByNumber` refuses kind STORE_CREDIT (NOT_FOUND) ⇒ reload/suspend/unsuspend/transfer/legacy use; `list` rows + KPI (sold/used/outstanding) filter kind GIFT; `listForCustomer` DTO + `kind` (SC masked `SC-••••`). S5. |
| H6 Low PIN-less replay (S part) | 8 | c5f2d1ba | `register.ts regParseSubmit`: GIFT_CARD `giftCard` without `pin` accepted; `submitRegisterSale` returns the existing bill for a committed key (duplicate lookup comes first), otherwise VALIDATION "ใส่ PIN…" before any write. P2.9U contract line: `savePending` strips `giftCard.pin`. G10. |
| owner lines + U contract | 3 5 6 · CD1b | 3d6d1789 | pool connection (F5) · expiry-at-void policy · CD1b reload with link off · coa tip-ledger exception · P2.9U lines (strip PIN, `kind` on giftCards, refund caps). |
Upstream `origin/session/pos` bffa77e2 merged (ledger only) → **2612ee53**.

### Gates — fix round 1
All logs headed `tree=/root/projects/shark-pos-b head=2612ee53 dirty=0` (scratch `p29/gates-fix1/*.out`, 14 Oct 18:44–19:2xZ).
| gate | tree= head= | result |
|---|---|---|
| typecheck (pos-gate.lock · 5632/6500M) | shark-pos-b 2612ee53 | rc 0 |
| fitness no-env / env (qc4) | shark-pos-b 2612ee53 | 50/50 · 50/50 |
| fitness-pos | shark-pos-b 2612ee53 | 8/8 |
| qc-pos-p2.9 forced ×2 / unforced | shark-pos-b 2612ee53 | **57/57 · 57/57 · 57/57** (residue 0) |
| qc-hf-tx | shark-pos-b 2612ee53 | 22/22 |
| qc-pos-p1.6 | shark-pos-b 2612ee53 | 48/48 |
| qc-pos-p1.8 | shark-pos-b 2612ee53 | 49/49 |
| qc-pos-p1.12 | shark-pos-b 2612ee53 | 72/72 |
| qc-pos-p1.3 | shark-pos-b 2612ee53 | 128/128 |
| qc-pos-p1.1 | shark-pos-b 2612ee53 | 180/180 |
| qc-pos-account | shark-pos-b 2612ee53 | 16/16 |
| qc-account-cpa (account hunk) | shark-pos-b 2612ee53 | 107/107 |
| qc-pos-p1.7 | shark-pos-b 2612ee53 | 33/33 |
| qc-hf-pos-page-authz | shark-pos-b 2612ee53 | 81/81 |
| qc-pos-p2.8 | shark-pos-b 2612ee53 | 59/61 — ST6 + L2 wip-only (merge-base sha accepted ⇒ green once merged) |

## Fix round 2 (R2 MERGEABLE-AFTER-FIXES G1 + hunter re-check residuals · controller rulings 1–7, 14 Oct)
Oracle first: `af7f2b12` (ORACLE-ADD G11 · RC2 · C5b · RC1 sub-case d STAFF + manager PIN, dated `ผู้คุม 14 ต.ค. (fix 2)`) · 57 → **60** · `c435f3a0` T6 also checks `setLedgerActive(false)` (count unchanged). Red-before block 4 (`09235405`, head af7f2b12, fix-1 code): **57/60** — red RC1(d) C5b RC2; G11 green-before (its black-box bounds already hold with the fix-1 atomic counter; the reserve-first change removes extra hash compares/timing which the check cannot see). The T6 extension was added after block 4 (red on 4c056473 by construction: `setLedgerActive` had no guard).

| finding | ruling | commit | change |
|---|---|---|---|
| G1/N1 Medium past-date ACTIVE card on void | 1 | 00463a47 | `refundTenderUse`: REFUND-then-EXPIRE only when the locked row is `status EXPIRED`; a past-date ACTIVE card keeps B + X for the next `expireDue` (HF-GC2 locked read ⇒ one EXPIRE, one JV). C5b. |
| H2/N3 PIN hash compared before the lock | 2 | d230f2c5 + 08ef0359 | `verifyPin` reserves a slot first: one `UPDATE … WHERE unlocked AND count < 5 (or expired lock ⇒ new window) RETURNING`; the 5th slot sets the lock in the same statement; 0 rows ⇒ LOCKED with no hash compare; a match resets only if no other request locked the card (`count = mySlot` or unlocked). Follow-through 08ef0359: `createSale`'s PIN pre-check runs in a short tx that takes the idempotency-key advisory lock and **always commits** the slot (the failure is rethrown after commit; one connection per request); the sale tx then re-checks state with `recheckGiftTender` (no second compare, no second connection) — without it, same-key double submits each consumed a slot and C2 returned GIFT_CARD_LOCKED / P2028. G11 + C2 + G4 + G9. |
| H3 residual target resolved before the lock | 3 | 4c056473 | `refundTenderUse`/`refundToCard`: lock the old card → resolve `mergeTargetOf` on the tx → lock the keeper. Deviation from "advisory if keeper sorts first": not needed — the fold locks both cards in one statement; if it has not committed we do not see the MERGE txn (restore lands on the old card and the fold moves it), if it has committed it no longer holds the locks ⇒ no cycle. |
| H5 residual `setLedgerActive(false)` | 4 | 95eb06dd | same `usedAsPosTipLedger` guard (1 marked line). T6. |
| N2 merged member credit refund | 5 | 07030df9 | `planRefundTenders` follows `Customer.mergedIntoId` (≤ 5) to the keeper for STORE_CREDIT. RC2. |
| H1 note manager PIN cash-out | 6 | e2403aad | `managerOk = canRefund OR auditActorId (manager PIN / approval decider) OR plan mode` (plan defers; commit decides) ⇒ STAFF + manager PIN works; audit actor = approver + `cardShareToCash` + reason. RC1(d). |
Upstream `origin/session/pos` merged (ledger only) → **1d6d3abb**.

### Gates — fix round 2
All logs headed `tree=/root/projects/shark-pos-b head=1d6d3abb dirty=0` (scratch `p29/gates-fix2/*.out`, 14 Oct 19:39–20:1xZ).
| gate | tree= head= | result |
|---|---|---|
| typecheck (pos-gate.lock · 5632/6500M) | shark-pos-b 1d6d3abb | rc 0 |
| fitness no-env / env (qc4) | shark-pos-b 1d6d3abb | 50/50 · 50/50 |
| fitness-pos | shark-pos-b 1d6d3abb | 8/8 |
| qc-pos-p2.9 forced ×2 / unforced | shark-pos-b 1d6d3abb | **60/60 · 60/60 · 60/60** (residue 0) |
| qc-hf-tx | shark-pos-b 1d6d3abb | 22/22 |
| qc-pos-p1.6 / p1.8 / p1.12 | shark-pos-b 1d6d3abb | 48/48 · 49/49 · 72/72 |
| qc-pos-p1.3 / p1.1 | shark-pos-b 1d6d3abb | 128/128 · 180/180 |
| qc-pos-account / qc-account-cpa | shark-pos-b 1d6d3abb | 16/16 · 107/107 |
| qc-pos-p1.7 / qc-hf-pos-page-authz | shark-pos-b 1d6d3abb | 33/33 · 81/81 |
| qc-pos-p2.8 | shark-pos-b 1d6d3abb | 59/61 — ST6 + L2 wip-only (merge-base accepted) |

## Fix round 3 (R3 MERGEABLE · hunter final N4 N5 Low, 14 Oct)
Oracle first: `c1f2e64d` (ORACLE-ADD G12 · MG3, dated `ผู้คุม 14 ต.ค. (fix 3)`) · 60 → **62**. Red-before block 5 (`b6a84df1`, fix-2 code): **60/62** — red G12 (same key + other card served the first bill) and MG3 (credit landed on the just-orphaned keeper K: K 30000, W 15000).

| finding | commit | change |
|---|---|---|
| N4 same key, different gift card | e93a05a8 | `pos/service.ts samePayload` + `register.ts regSameSubmission`: GIFT_CARD rows compare the normalised card number too (stored rows: `giftCardId` → number via member facade `giftCardNumbersByIds` → giftcard `tenderCardNumbers`, server-side only; `regLoadSale` adds `payments[].giftCardNumber`) ⇒ a different card on a committed key = `IDEMPOTENCY_CONFLICT`; the PIN pre-check sees the existing bill and never touches the other card. G12 (register + createSale, card Y balance/counter/txns unchanged). |
| N5 keeper merged again while the void waits | e65d3ef7 | `giftcard/service.ts lockMergeTarget`: after the old card is locked, resolve → lock → re-resolve from the locked card until stable (≤ 5 hops, each new target locked); used by `refundTenderUse` and `refundToCard`. MG3: a third tx holds K, the void waits on K, the tx folds K → W and commits ⇒ W +300, K 0, REFUND on W. |
Upstream `origin/session/pos` merged (ledger only) → **cd1e93f3**.

### Gates — fix round 3
All logs headed `tree=/root/projects/shark-pos-b head=cd1e93f3 dirty=0` (scratch `p29/gates-fix3/*.out`).
| gate | result |
|---|---|
| typecheck | rc 0 |
| fitness no-env / env | 50/50 · 50/50 |
| fitness-pos | 8/8 |
| qc-pos-p2.9 forced ×2 / unforced | **62/62 · 62/62 · 62/62** (residue 0) |
| qc-hf-tx | 22/22 |
| qc-pos-p1.3 / p1.1 / p1.6 | 128/128 · 180/180 · 48/48 |
| qc-pos-account | 16/16 |
| qc-pos-p2.8 | 59/61 — ST6 + L2 wip-only (merge-base accepted) |
