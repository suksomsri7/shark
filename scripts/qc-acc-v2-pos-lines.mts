// QC WO 4.2 — "POS ส่งบรรทัด": ยอดขายหน้าร้านต้องมองเห็นได้ต่อสินค้า/ต่อลูกค้า (MAP §F.13 · SPEC §4 บล็อก 8)
//
// requires: acc-v2-seed
//
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-pos-lines.mts
//
// 🔴 ความปลอดภัยข้อมูล: ทุกการ **เขียน** เกิดบน "ร้านทิ้ง" ที่สคริปต์สร้างเอง แล้วลบทิ้งใน finally เสมอ
//    ร้าน QC จริง (`SIAM DIVE QC`) = **อ่านอย่างเดียว** (PL1/PL10)
//
// ครอบคลุม (ดู ledger/wo-notes/4.2.md)
//   PL1  ชุดข้อมูล QC: บิล POS 2 ใบ → เอกสาร 2 · บรรทัด 3 · productId ครบ · เลขที่ = เลขใบเสร็จ · ไม่มี JV ซ้ำ
//   PL2  ขาย 2 บรรทัด (ร้านทิ้ง) → เอกสาร 1 ใบ + 2 บรรทัด · productId มาจาก InvItem ↔ AccountProduct
//   PL3  GL ไม่เปลี่ยน: บิลที่ "ส่งบรรทัด" กับบิลที่ "ไม่ส่ง" ยอดเท่ากัน → JV เหมือนกันทุกขา
//   PL4  Σ บรรทัด ≠ ยอดบิล → ปฏิเสธเป็นภาษาไทย · ไม่มีเอกสาร · ไม่มี JV (เงินไม่เข้าบัญชีแบบผิด ๆ)
//   PL5  เรียกซ้ำ (replay/drain ซ้อน) → เอกสารใบเดิม บรรทัดไม่เพิ่ม JV ไม่เบิ้ล
//   PL6  void บิล → JV กลับรายการ + เอกสารเป็น "ยกเลิก" (บรรทัดยังอยู่ครบ ไม่ลบ)
//   PL7  ลูกค้ามี partyId → ใช้ผู้ติดต่อเดิม (ไม่สร้างซ้ำ) · บิลถัดไปของคนเดิมก็ใบเดิม
//   PL8  ลูกค้าเดินเข้าร้าน (ไม่ส่ง customer) → เอกสารไม่ผูกผู้ติดต่อ (รายงานนับเป็น "ไม่ระบุคู่ค้า")
//   PL9  tenant isolation: itemId/accountProductId ของร้านอื่น → ไม่ผูก productId (ไม่มีข้อมูลข้ามร้าน)
//   PL10 รายงานหน้าหลัก "ขายอะไรดี/ขายใคร" เห็นยอด POS จริง (เทียบ SQL อิสระ ไม่ใช่ไฟล์เฉลย)
//   PL11 bridge เกลี่ยส่วนลดท้ายบิล/คูปองลงบรรทัด → Σ บรรทัด = ยอดบิลเป๊ะ (บิลมีส่วนลดก็ยังได้เอกสาร)
import { readFileSync, existsSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { prisma } = await import("@/lib/core/db");
const system = await import("@/lib/modules/system/service");
const accIdx = await import("@/lib/modules/account");
const svc = await import("@/lib/modules/account/service");
const prod = await import("@/lib/modules/account/product");
const inv = await import("@/lib/modules/inventory/service");
const invLink = await import("@/lib/modules/account/inventory-link");
const dash = await import("@/lib/modules/account/dashboard");
const gl = await import("@/lib/modules/account/gl");
const bridge = await import("@/lib/modules/pos/account-bridge");

let passed = 0;
const findings: string[] = [];
const ok = (name: string) => {
  passed++;
  console.log("  ✅ " + name);
};
const bad = (name: string, detail: string) => {
  findings.push(`${name} — ${detail}`);
  console.log("  ❌ " + name + " — " + detail);
};
const assert = (name: string, cond: boolean, detail = "") => (cond ? ok(name) : bad(name, detail));
const eq = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(name, a === b, `ได้ ${a} · ควรได้ ${b}`);
};

console.log(`\n===== QC WO 4.2 · POS ส่งบรรทัด (ขายอะไรดี / ขายใคร) =====`);
console.log(`[env] DB ${host}\n`);

// ─────────────────── ร้านทิ้ง (ทุกการเขียนเกิดที่นี่) ───────────────────
const stamp = Date.now();
const tenantIds: string[] = [];

/** ร้านทิ้ง: ACCOUNT + POS (+ ผูก AccountSystemLink) + INVENTORY */
async function makeShop(name: string, opts: { link?: boolean } = {}) {
  const t = await prisma.tenant.create({
    data: { name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${stamp}-${tenantIds.length}` },
  });
  tenantIds.push(t.id);
  const acc = await system.createSystem(t.id, "ACCOUNT", "บัญชี");
  const pos = await system.createSystem(t.id, "POS", "ขายหน้าร้าน");
  const ivs = await system.createSystem(t.id, "INVENTORY", "คลัง");
  await gl.ensureAccounting({ tenantId: t.id, systemId: acc.id }); // ผังบัญชี + mapping (หน้าจอจริงทำตอนเปิดโมดูล)
  if (opts.link !== false)
    await prisma.accountSystemLink.create({
      data: { tenantId: t.id, systemId: acc.id, linkedKind: "POS", linkedId: pos.id },
    });
  return { tenantId: t.id, accSystemId: acc.id, posSystemId: pos.id, invSystemId: ivs.id };
}

/** สินค้าบัญชีที่ผูกคลัง → คืน { productId, itemId } */
async function makeLinkedProduct(
  shop: { tenantId: string; accSystemId: string; invSystemId: string },
  o: { sku: string; name: string; sale: number; cost: number; onHand: number },
) {
  const p = await prod.createProduct(shop.tenantId, shop.accSystemId, {
    sku: o.sku,
    name: o.name,
    type: "GOODS",
    salePrice: o.sale,
    buyPrice: o.cost,
    vatRateBp: 700,
  });
  if (!p.ok) throw new Error(`สร้างสินค้า ${o.sku} ไม่สำเร็จ: ${p.reason}`);
  const item = await inv.createItem(
    { tenantId: shop.tenantId, systemId: shop.invSystemId },
    { sku: o.sku, name: o.name, kind: "PRODUCT", costSatang: o.cost },
  );
  await inv.adjust(
    { tenantId: shop.tenantId, systemId: shop.invSystemId },
    { itemId: item.id, newQty: o.onHand, idempotencyKey: `qc42-stock-${item.id}`, note: "ตั้งต้น" },
  );
  const link = await invLink.linkProductToItem(
    { tenantId: shop.tenantId, systemId: shop.accSystemId },
    p.id,
    { itemId: item.id },
  );
  if (!link.ok) throw new Error(`ผูกสินค้า ${o.sku} ไม่สำเร็จ: ${link.reason}`);
  return { productId: p.id, itemId: item.id };
}

const jvOf = async (systemId: string, refId: string) =>
  prisma.accountJournalEntry.findMany({
    where: { systemId, refType: "PosSale", refId },
    include: { lines: { include: { account: { select: { code: true } } } } },
    orderBy: { createdAt: "asc" },
  });
type Jv = Awaited<ReturnType<typeof jvOf>>;
/** ลายเซ็นของ JV (บัญชี+เดบิต+เครดิต เรียงแน่นอน) — ใช้เทียบว่า GL "ไม่เปลี่ยน" */
const jvSig = (entries: Jv) =>
  entries
    .flatMap((e) => e.lines.map((l) => `${l.account.code}:${l.debit}:${l.credit}`))
    .sort()
    .join(" | ");

const docOf = async (systemId: string, refId: string) =>
  prisma.accountDocument.findFirst({
    where: { systemId, docType: "TAX_INVOICE_ABB", refType: "PosSale", refId },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });

try {
  // ═════════ PL1 — ชุดข้อมูล QC (อ่านอย่างเดียว) ═════════
  console.log("PL1 ชุดข้อมูล QC: บิลขายหน้าร้าน 2 ใบ");
  if (!existsSync(QC.expectedPath)) {
    bad("PL1.0 มีไฟล์เฉลย", `ไม่พบ ${QC.expectedPath} — รัน seed-acc-v2-qc.mts ก่อน`);
  } else {
    const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as {
      tenantId: string;
      systemId: string;
      contacts: { all: number };
      posSales?: {
        docType: string;
        count: number;
        lineCount: number;
        grandTotal: number;
        withContact: number;
        sales: { key: string; saleId: string; receiptNo: string | null; grandTotalSatang: number }[];
        docs: { id: string; docNo: string | null; refId: string | null; contactId: string | null; subTotal: number; vatAmount: number; grandTotal: number; lines: { productId: string | null; qty: number; amount: number }[] }[];
      };
    };
    if (!E.posSales) {
      bad("PL1.0 เฉลยมีคีย์ posSales", "ไม่มี — seed เก่า ต้อง seed ใหม่หลัง WO 4.2");
    } else {
      const P = E.posSales;
      const docs = await prisma.accountDocument.findMany({
        where: { tenantId: E.tenantId, systemId: E.systemId, docType: "TAX_INVOICE_ABB" },
        include: { lines: { orderBy: { sortOrder: "asc" } } },
        orderBy: { issueDate: "asc" },
      });
      eq("PL1.1 เอกสารบิลขายหน้าร้าน 2 ใบ", docs.length, P.count);
      eq("PL1.2 บรรทัดรวม 3 บรรทัด", docs.reduce((n, d) => n + d.lines.length, 0), P.lineCount);
      eq(
        "PL1.3 ทุกบรรทัดผูกทะเบียนสินค้า (productId)",
        docs.reduce((n, d) => n + d.lines.filter((l) => l.productId).length, 0),
        P.lineCount,
      );
      eq("PL1.4 ยอดรวม 2 ใบ = ฿13,500.00", docs.reduce((n, d) => n + d.grandTotal, 0), P.grandTotal);
      assert(
        "PL1.5 ทุกใบ: ฐาน + VAT = ยอดรวม",
        docs.every((d) => d.subTotal + d.vatAmount === d.grandTotal),
        docs.map((d) => `${d.subTotal}+${d.vatAmount}≠${d.grandTotal}`).join(" "),
      );
      eq("PL1.6 ใบที่ผูกผู้ติดต่อ (สมาชิก) = 1", docs.filter((d) => d.contactId).length, P.withContact);
      eq("PL1.7 ใบที่ไม่ผูกผู้ติดต่อ (เดินเข้าร้าน) = 1", docs.filter((d) => !d.contactId).length, P.count - P.withContact);
      assert("PL1.8 ทุกใบสถานะ 'ชำระเงินแล้ว'", docs.every((d) => d.status === "PAID"), docs.map((d) => d.status).join(","));
      assert("PL1.9 ทุกใบที่มา = POS", docs.every((d) => d.source === "POS"), docs.map((d) => d.source).join(","));
      assert(
        "PL1.10 ทุกใบอ้างอิงบิล POS จริง (refType/refId)",
        docs.every((d) => d.refType === "PosSale" && !!d.refId),
        "refType/refId ไม่ครบ",
      );
      const sales = await prisma.posSale.findMany({
        where: { tenantId: E.tenantId, id: { in: docs.map((d) => d.refId ?? "") } },
        select: { id: true, receiptNo: true, grandTotalSatang: true, status: true },
      });
      eq("PL1.11 บิล POS ต้นทางครบทุกใบ", sales.length, P.count);
      const byId = new Map(sales.map((s) => [s.id, s]));
      assert(
        "PL1.12 เลขที่เอกสาร = เลขใบเสร็จของ POS",
        docs.every((d) => d.docNo === (byId.get(d.refId ?? "")?.receiptNo ?? null)),
        docs.map((d) => `${d.docNo}≠${byId.get(d.refId ?? "")?.receiptNo}`).join(" "),
      );
      assert(
        "PL1.13 ยอดเอกสาร = ยอดบิล POS ทุกใบ",
        docs.every((d) => d.grandTotal === byId.get(d.refId ?? "")?.grandTotalSatang),
        "ยอดไม่ตรง",
      );
      // 🔴 ห้ามมี JV ที่ผูกกับเอกสารพวกนี้ — เงินเข้าทาง JV ของ PosSale ทางเดียว (ไม่งั้นรายได้ 2 เท่า)
      const docEntries = await prisma.accountJournalEntry.count({
        where: { systemId: E.systemId, refType: "AccountDocument", refId: { in: docs.map((d) => d.id) } },
      });
      eq("PL1.14 เอกสารบิล POS ไม่มี JV ของตัวเอง (กันรายได้ซ้ำ)", docEntries, 0);
      const posEntries = await prisma.accountJournalEntry.findMany({
        where: { systemId: E.systemId, refType: "PosSale" },
        include: { lines: true },
      });
      eq("PL1.15 JV ของบิล POS = 2 (ใบละ 1)", posEntries.length, P.count);
      assert(
        "PL1.16 JV ของบิล POS สมดุลทุกใบ",
        posEntries.every((e) => e.lines.reduce((n, l) => n + l.debit, 0) === e.lines.reduce((n, l) => n + l.credit, 0)),
        "ไม่สมดุล",
      );
      // ฐาน/VAT ของเอกสาร ต้องตรงกับ JV ของบิลเดียวกัน (ปัดเศษเส้นเดียวกันเมื่ออัตราเดียว)
      const contactsNow = await prisma.accountContact.count({ where: { systemId: E.systemId } });
      eq("PL1.17 จำนวนผู้ติดต่อไม่เพิ่ม (สมาชิกเดิมถูกใช้ซ้ำ)", contactsNow, E.contacts.all);
    }
  }

  // ═════════ PL2 — ขาย 2 บรรทัดบนร้านทิ้ง ═════════
  console.log("\nPL2 ขาย POS 2 บรรทัด → เอกสาร 1 ใบ + 2 บรรทัด");
  const shop = await makeShop("QC42 ร้านหลัก");
  const mask = await makeLinkedProduct(shop, { sku: "M-01", name: "หน้ากากดำน้ำ", sale: 285_000, cost: 168_000, onHand: 10 });
  const tank = await makeLinkedProduct(shop, { sku: "T-12", name: "ถังอากาศ", sale: 780_000, cost: 520_000, onHand: 5 });
  const SALE1 = "qc42-sale-1";
  const gross1 = 285_000 + 780_000;
  const r1 = await accIdx.applyExternalSale({
    tenantId: shop.tenantId,
    sourceSystemId: shop.posSystemId,
    refId: SALE1,
    occurredAt: new Date(`${QC.today}T05:00:00.000Z`),
    grossSatang: gross1,
    payMethods: [{ channel: "CASH", amountSatang: gross1 }],
    lines: [
      { itemId: mask.itemId, name: "หน้ากากดำน้ำ", qty: 1, unitPriceSatang: 285_000 },
      { itemId: tank.itemId, name: "ถังอากาศ", qty: 1, unitPriceSatang: 780_000 },
    ],
    receiptNo: "202609-0009",
  });
  assert("PL2.1 โพสต์บัญชีสำเร็จ", r1.posted === true, JSON.stringify(r1));
  const d1 = await docOf(shop.accSystemId, SALE1);
  assert("PL2.2 มีเอกสาร 1 ใบ", !!d1, "ไม่พบเอกสาร");
  eq("PL2.3 เอกสารมี 2 บรรทัด", d1?.lines.length ?? 0, 2);
  eq("PL2.4 ยอดรวมเอกสาร = ยอดบิล", d1?.grandTotal ?? 0, gross1);
  eq("PL2.5 ฐาน + VAT = ยอดรวม", (d1?.subTotal ?? 0) + (d1?.vatAmount ?? 0), gross1);
  eq(
    "PL2.6 productId ของบรรทัด = สินค้าบัญชีที่ผูก item",
    d1?.lines.map((l) => l.productId),
    [mask.productId, tank.productId],
  );
  eq("PL2.7 ยอดต่อบรรทัด (รวม VAT)", d1?.lines.map((l) => l.amount), [285_000, 780_000]);
  eq("PL2.8 เลขที่เอกสาร = เลขใบเสร็จ POS", d1?.docNo, "202609-0009");
  eq("PL2.9 เอกสารมาจาก POS", d1?.source, "POS");
  eq("PL2.10 เอกสารสถานะชำระแล้ว", d1?.status, "PAID");

  // ═════════ PL3 — GL ต้องไม่เปลี่ยนเพราะมี lines ═════════
  console.log("\nPL3 GL เหมือนเดิมทุกประการ (มี lines vs ไม่มี lines · ยอดเท่ากัน)");
  const SALE2 = "qc42-sale-2-nolines";
  const r2 = await accIdx.applyExternalSale({
    tenantId: shop.tenantId,
    sourceSystemId: shop.posSystemId,
    refId: SALE2,
    occurredAt: new Date(`${QC.today}T05:00:00.000Z`),
    grossSatang: gross1,
    payMethods: [{ channel: "CASH", amountSatang: gross1 }],
  });
  assert("PL3.1 บิลที่ไม่ส่ง lines โพสต์สำเร็จ", r2.posted === true, JSON.stringify(r2));
  const jv1 = await jvOf(shop.accSystemId, SALE1);
  const jv2 = await jvOf(shop.accSystemId, SALE2);
  eq("PL3.2 JV ของทั้งสองบิลเหมือนกันทุกขา", jvSig(jv1), jvSig(jv2));
  eq("PL3.3 บิลที่ไม่ส่ง lines ไม่มีเอกสาร (พฤติกรรมเดิม)", await docOf(shop.accSystemId, SALE2), null);
  assert("PL3.4 JV มีบรรทัดเงินสด 1000 เต็มยอด", jvSig(jv1).includes(`1000:${gross1}:0`), jvSig(jv1));

  // ═════════ PL4 — Σ บรรทัด ≠ ยอดบิล ═════════
  console.log("\nPL4 บรรทัดไม่ตรงยอดบิล → ปฏิเสธทั้งใบ");
  const SALE3 = "qc42-sale-3-mismatch";
  const r3 = await accIdx.applyExternalSale({
    tenantId: shop.tenantId,
    sourceSystemId: shop.posSystemId,
    refId: SALE3,
    occurredAt: new Date(`${QC.today}T05:00:00.000Z`),
    grossSatang: 1_000_000,
    payMethods: [{ channel: "CASH", amountSatang: 1_000_000 }],
    lines: [{ itemId: mask.itemId, name: "หน้ากากดำน้ำ", qty: 1, unitPriceSatang: 285_000 }],
  });
  eq("PL4.1 ไม่โพสต์", r3.posted, false);
  assert("PL4.2 เหตุผลเป็นภาษาไทย บอกยอดทั้งสองฝั่ง", /ยอดรวมของบรรทัด.*ไม่เท่ากับยอดบิล/.test(r3.reason ?? ""), r3.reason ?? "(ว่าง)");
  eq("PL4.3 ไม่มีเอกสาร", await docOf(shop.accSystemId, SALE3), null);
  eq("PL4.4 ไม่มี JV", (await jvOf(shop.accSystemId, SALE3)).length, 0);
  const r3b = await accIdx.applyExternalSale({
    tenantId: shop.tenantId,
    sourceSystemId: shop.posSystemId,
    refId: "qc42-sale-3b",
    occurredAt: new Date(`${QC.today}T05:00:00.000Z`),
    grossSatang: 100_000,
    payMethods: [{ channel: "CASH", amountSatang: 100_000 }],
    lines: [{ name: "ของแปลก", qty: 0, unitPriceSatang: 100_000 }],
  });
  eq("PL4.5 จำนวน 0/ติดลบ → ไม่โพสต์", r3b.posted, false);
  assert("PL4.6 เหตุผลบอกว่าบรรทัดไม่ถูกต้อง", /ไม่ถูกต้อง/.test(r3b.reason ?? ""), r3b.reason ?? "(ว่าง)");
  eq("PL4.7 ไม่มี JV ของบิลที่บรรทัดเพี้ยน", (await jvOf(shop.accSystemId, "qc42-sale-3b")).length, 0);

  // ═════════ PL5 — idempotent ═════════
  console.log("\nPL5 เรียกซ้ำ (replay) → ไม่เบิ้ล");
  const r1again = await accIdx.applyExternalSale({
    tenantId: shop.tenantId,
    sourceSystemId: shop.posSystemId,
    refId: SALE1,
    occurredAt: new Date(`${QC.today}T05:00:00.000Z`),
    grossSatang: gross1,
    payMethods: [{ channel: "CASH", amountSatang: gross1 }],
    lines: [
      { itemId: mask.itemId, name: "หน้ากากดำน้ำ", qty: 1, unitPriceSatang: 285_000 },
      { itemId: tank.itemId, name: "ถังอากาศ", qty: 1, unitPriceSatang: 780_000 },
    ],
    receiptNo: "202609-0009",
  });
  eq("PL5.1 เรียกซ้ำได้เอกสารใบเดิม", r1again.docId, d1?.id);
  eq("PL5.2 จำนวนเอกสารของบิลนี้ยังเป็น 1", await prisma.accountDocument.count({ where: { systemId: shop.accSystemId, refType: "PosSale", refId: SALE1 } }), 1);
  eq("PL5.3 บรรทัดไม่เพิ่ม", (await docOf(shop.accSystemId, SALE1))?.lines.length ?? 0, 2);
  eq("PL5.4 JV ไม่เบิ้ล", (await jvOf(shop.accSystemId, SALE1)).length, 1);

  // ═════════ PL6 — void ═════════
  console.log("\nPL6 void บิล → JV กลับรายการ + เอกสารถูกยกเลิก (บรรทัดยังอยู่)");
  const rev = await accIdx.reverseExternalSale({ tenantId: shop.tenantId, sourceSystemId: shop.posSystemId, refId: SALE1 });
  eq("PL6.1 กลับรายการ JV สำเร็จ", rev.posted, true);
  eq("PL6.2 ยกเลิกเอกสารสำเร็จ", rev.docVoided, true);
  const d1v = await docOf(shop.accSystemId, SALE1);
  eq("PL6.3 เอกสารสถานะ VOIDED", d1v?.status, "VOIDED");
  assert("PL6.4 มีวันที่ยกเลิก + เหตุผล", !!d1v?.voidedAt && !!d1v?.voidReason, JSON.stringify({ v: d1v?.voidedAt, r: d1v?.voidReason }));
  eq("PL6.5 บรรทัดยังอยู่ครบ 2 (ไม่ลบ)", d1v?.lines.length ?? 0, 2);
  eq("PL6.6 JV ของบิลนี้กลายเป็น 2 entry (ต้นฉบับ + กลับรายการ)", (await jvOf(shop.accSystemId, SALE1)).length, 2);
  {
    const entries = await jvOf(shop.accSystemId, SALE1);
    const net = entries.flatMap((e) => e.lines).reduce((n, l) => n + l.debit - l.credit, 0);
    eq("PL6.7 ผลรวมสุทธิหลังกลับรายการ = 0", net, 0);
  }
  const revAgain = await accIdx.reverseExternalSale({ tenantId: shop.tenantId, sourceSystemId: shop.posSystemId, refId: SALE1 });
  eq("PL6.8 void ซ้ำไม่ยกเลิกเอกสารซ้ำ (idempotent)", revAgain.docVoided, false);
  eq("PL6.9 ยังมี 2 entry เท่าเดิม", (await jvOf(shop.accSystemId, SALE1)).length, 2);

  // ═════════ PL7 — ลูกค้ามี partyId ═════════
  console.log("\nPL7 ลูกค้ามี partyId → ใช้ผู้ติดต่อเดิม ไม่สร้างซ้ำ");
  const partyMod = await import("@/lib/modules/party");
  const partyId = await partyMod.safeFindOrCreate(shop.tenantId, { name: "คุณสมาชิก ทดสอบ", phone: "0812345678", kind: "PERSON" });
  assert("PL7.0 สร้าง Party ได้", !!partyId, "safeFindOrCreate คืน null");
  const existingContact = await svc.createContact({
    tenantId: shop.tenantId,
    systemId: shop.accSystemId,
    kind: "CUSTOMER",
    name: "คุณสมาชิก ทดสอบ",
    phone: "0812345678",
    partyId: partyId ?? undefined,
  } as Parameters<typeof svc.createContact>[0]);
  const contactsBefore = await prisma.accountContact.count({ where: { systemId: shop.accSystemId } });
  const SALE4 = "qc42-sale-4-member";
  await accIdx.applyExternalSale({
    tenantId: shop.tenantId,
    sourceSystemId: shop.posSystemId,
    refId: SALE4,
    occurredAt: new Date(`${QC.today}T05:00:00.000Z`),
    grossSatang: 285_000,
    payMethods: [{ channel: "CASH", amountSatang: 285_000 }],
    lines: [{ itemId: mask.itemId, name: "หน้ากากดำน้ำ", qty: 1, unitPriceSatang: 285_000 }],
    customer: { memberId: "m-1", partyId, name: "คุณสมาชิก ทดสอบ", phone: "0812345678" },
  });
  const d4 = await docOf(shop.accSystemId, SALE4);
  eq("PL7.1 เอกสารผูกผู้ติดต่อเดิม (partyId)", d4?.contactId, existingContact.id);
  eq("PL7.2 ไม่มีผู้ติดต่อใหม่", await prisma.accountContact.count({ where: { systemId: shop.accSystemId } }), contactsBefore);
  const SALE5 = "qc42-sale-5-member-again";
  await accIdx.applyExternalSale({
    tenantId: shop.tenantId,
    sourceSystemId: shop.posSystemId,
    refId: SALE5,
    occurredAt: new Date(`${QC.today}T05:00:00.000Z`),
    grossSatang: 285_000,
    payMethods: [{ channel: "CASH", amountSatang: 285_000 }],
    lines: [{ itemId: mask.itemId, name: "หน้ากากดำน้ำ", qty: 1, unitPriceSatang: 285_000 }],
    customer: { memberId: "m-1", partyId, name: "คุณสมาชิก ทดสอบ", phone: "0812345678" },
  });
  eq("PL7.3 บิลที่ 2 ของคนเดิม → ผู้ติดต่อเดิม", (await docOf(shop.accSystemId, SALE5))?.contactId, existingContact.id);
  eq("PL7.4 ผู้ติดต่อยังไม่เพิ่ม", await prisma.accountContact.count({ where: { systemId: shop.accSystemId } }), contactsBefore);
  eq(
    "PL7.5 เอกสารของลูกค้ารายนี้ = 2 ใบ (โปรไฟล์ 360° เห็นครบ)",
    await prisma.accountDocument.count({ where: { systemId: shop.accSystemId, contactId: existingContact.id } }),
    2,
  );

  // ═════════ PL8 — ลูกค้าเดินเข้าร้าน ═════════
  console.log("\nPL8 ลูกค้าเดินเข้าร้าน (ไม่มีข้อมูลลูกค้า) → ไม่ผูกผู้ติดต่อ · ไม่สร้าง 'ลูกค้าทั่วไป'");
  const SALE6 = "qc42-sale-6-walkin";
  await accIdx.applyExternalSale({
    tenantId: shop.tenantId,
    sourceSystemId: shop.posSystemId,
    refId: SALE6,
    occurredAt: new Date(`${QC.today}T05:00:00.000Z`),
    grossSatang: 285_000,
    payMethods: [{ channel: "CASH", amountSatang: 285_000 }],
    lines: [{ itemId: mask.itemId, name: "หน้ากากดำน้ำ", qty: 1, unitPriceSatang: 285_000 }],
  });
  eq("PL8.1 เอกสารไม่ผูกผู้ติดต่อ", (await docOf(shop.accSystemId, SALE6))?.contactId, null);
  eq("PL8.2 ไม่มีผู้ติดต่อใหม่", await prisma.accountContact.count({ where: { systemId: shop.accSystemId } }), contactsBefore);
  const SALE7 = "qc42-sale-7-emptycustomer";
  await accIdx.applyExternalSale({
    tenantId: shop.tenantId,
    sourceSystemId: shop.posSystemId,
    refId: SALE7,
    occurredAt: new Date(`${QC.today}T05:00:00.000Z`),
    grossSatang: 285_000,
    payMethods: [{ channel: "CASH", amountSatang: 285_000 }],
    lines: [{ itemId: mask.itemId, name: "หน้ากากดำน้ำ", qty: 1, unitPriceSatang: 285_000 }],
    customer: { memberId: null, partyId: null, name: null, phone: null },
  });
  eq("PL8.3 customer ว่างเปล่า = เดินเข้าร้าน (ไม่ผูก ไม่สร้าง)", (await docOf(shop.accSystemId, SALE7))?.contactId, null);
  eq("PL8.4 ผู้ติดต่อยังเท่าเดิม", await prisma.accountContact.count({ where: { systemId: shop.accSystemId } }), contactsBefore);
  const SALE8 = "qc42-sale-8-newcustomer";
  await accIdx.applyExternalSale({
    tenantId: shop.tenantId,
    sourceSystemId: shop.posSystemId,
    refId: SALE8,
    occurredAt: new Date(`${QC.today}T05:00:00.000Z`),
    grossSatang: 285_000,
    payMethods: [{ channel: "CASH", amountSatang: 285_000 }],
    lines: [{ itemId: mask.itemId, name: "หน้ากากดำน้ำ", qty: 1, unitPriceSatang: 285_000 }],
    customer: { memberId: "m-2", name: "ลูกค้าใหม่ ทดสอบ", phone: "0899999999" },
  });
  const d8 = await docOf(shop.accSystemId, SALE8);
  assert("PL8.5 ลูกค้าใหม่ (มีเบอร์) → สร้างผู้ติดต่อให้", !!d8?.contactId, "ไม่ผูกผู้ติดต่อ");
  eq("PL8.6 ผู้ติดต่อเพิ่มขึ้น 1", await prisma.accountContact.count({ where: { systemId: shop.accSystemId } }), contactsBefore + 1);

  // ═════════ PL9 — tenant isolation ═════════
  console.log("\nPL9 ของร้านอื่นต้องไม่ถูกผูกเข้ามา (tenant isolation)");
  const other = await makeShop("QC42 ร้านอื่น");
  const otherProd = await makeLinkedProduct(other, { sku: "X-99", name: "ของร้านอื่น", sale: 100_000, cost: 50_000, onHand: 3 });
  const SALE9 = "qc42-sale-9-cross";
  const r9 = await accIdx.applyExternalSale({
    tenantId: shop.tenantId,
    sourceSystemId: shop.posSystemId,
    refId: SALE9,
    occurredAt: new Date(`${QC.today}T05:00:00.000Z`),
    grossSatang: 100_000,
    payMethods: [{ channel: "CASH", amountSatang: 100_000 }],
    lines: [{ itemId: otherProd.itemId, accountProductId: otherProd.productId, name: "ของร้านอื่น", qty: 1, unitPriceSatang: 100_000 }],
  });
  assert("PL9.1 บิลยังโพสต์ได้ (เงินต้องเข้าบัญชี)", r9.posted === true, JSON.stringify(r9));
  const d9 = await docOf(shop.accSystemId, SALE9);
  eq("PL9.2 บรรทัดไม่ผูกสินค้าข้ามร้าน (productId = null)", d9?.lines.map((l) => l.productId), [null]);
  eq(
    "PL9.3 ไม่มีบรรทัดของร้านอื่นถูกสร้างในร้านนี้",
    await prisma.accountDocumentLine.count({ where: { systemId: shop.accSystemId, productId: otherProd.productId } }),
    0,
  );
  eq("PL9.4 ร้านอื่นไม่มีเอกสารเกิดขึ้นเลย", await prisma.accountDocument.count({ where: { systemId: other.accSystemId } }), 0);

  // ═════════ PL10 — รายงานหน้าหลัก (ร้าน QC · อ่านอย่างเดียว · เทียบ SQL อิสระ) ═════════
  console.log("\nPL10 'ขายอะไรดี / ขายใคร' เห็นยอดขายหน้าร้าน (เทียบ SQL อิสระ)");
  if (existsSync(QC.expectedPath)) {
    const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as { tenantId: string; systemId: string };
    const YEAR = Number(QC.today.slice(0, 4));
    const from = new Date(`${YEAR}-01-01T00:00:00+07:00`);
    const to = new Date(`${YEAR + 1}-01-01T00:00:00+07:00`);
    const ctx = { tenantId: E.tenantId, systemId: E.systemId };
    // SQL อิสระ: ยอดขาย POS ต่อสินค้า/ต่อผู้ติดต่อ ปีนี้ (คำนวณคนละสำนวนกับ dashboard.ts)
    const posByProduct = await prisma.$queryRaw<Array<{ name: string; qty: string; amount: bigint }>>`
      SELECT ln."description" AS name, SUM(ln."qty")::text AS qty, SUM(ln."amount")::bigint AS amount
        FROM "AccountDocumentLine" ln
        JOIN "AccountDocument" d ON d."id" = ln."documentId"
       WHERE ln."systemId" = ${E.systemId} AND d."docType" = 'TAX_INVOICE_ABB'
         AND d."status" NOT IN ('DRAFT','CANCELLED','VOIDED')
         AND d."issueDate" >= ${from} AND d."issueDate" < ${to}
       GROUP BY 1`;
    const products = await dash.topProducts(ctx, { from, to }, 50);
    for (const row of posByProduct) {
      const hit = products.find((p) => p.name === row.name);
      assert(`PL10.1 "${row.name}" อยู่ในอันดับสินค้า`, !!hit, "ไม่อยู่ในผลลัพธ์ topProducts");
      if (hit) {
        assert(
          `PL10.2 "${row.name}" ยอดรวมอันดับ ≥ ยอดขาย POS (${Number(row.amount)})`,
          hit.amount >= Number(row.amount),
          `อันดับได้ ${hit.amount} · POS ขายได้ ${Number(row.amount)}`,
        );
      }
    }
    const maskRow = products.find((p) => p.name === "หน้ากากดำน้ำ Aqualung");
    eq("PL10.3 หน้ากากดำน้ำ Aqualung: จำนวน 2 ชิ้น (ขายจาก POS 2 บิล)", maskRow?.qty ?? 0, 2);
    eq("PL10.4 หน้ากากดำน้ำ Aqualung: ยอด 570,000 สตางค์", maskRow?.amount ?? 0, 570_000);
    const tankRow = products.find((p) => p.name === "ถังอากาศ 12 ลิตร");
    eq("PL10.5 ถังอากาศ 12 ลิตร: ยอด 780,000 สตางค์", tankRow?.amount ?? 0, 780_000);
    assert(
      "PL10.6 อันดับสินค้าที่มาจาก POS ผูก productId จริง (ไม่ใช่จับกลุ่มด้วยชื่อ)",
      !!maskRow?.productId && !!tankRow?.productId,
      JSON.stringify({ mask: maskRow?.productId, tank: tankRow?.productId }),
    );
    // ขายใคร: ลูกค้าที่มีบิล POS ต้องรวมยอด POS เข้าไป · บิล walk-in ไปอยู่ "ไม่ระบุคู่ค้า"
    const posByContact = await prisma.$queryRaw<Array<{ contactId: string | null; amount: bigint; cnt: bigint }>>`
      SELECT d."contactId", SUM(d."grandTotal")::bigint AS amount, COUNT(*)::bigint AS cnt
        FROM "AccountDocument" d
       WHERE d."systemId" = ${E.systemId} AND d."docType" = 'TAX_INVOICE_ABB'
         AND d."status" NOT IN ('DRAFT','CANCELLED','VOIDED')
         AND d."issueDate" >= ${from} AND d."issueDate" < ${to}
       GROUP BY 1`;
    const customers = await dash.topCustomers(ctx, { from, to }, 100);
    const walkin = posByContact.find((r) => r.contactId === null);
    assert("PL10.7 มีบิล POS ที่ไม่ผูกผู้ติดต่อ (เดินเข้าร้าน) ในข้อมูลจริง", !!walkin, "ไม่มี");
    if (walkin) {
      const row = customers.find((c) => c.contactId === null);
      eq("PL10.8 'ไม่ระบุคู่ค้า' ปรากฏในอันดับลูกค้า", row?.name, "ไม่ระบุคู่ค้า");
      eq("PL10.9 ยอดของ 'ไม่ระบุคู่ค้า' = ยอดบิล walk-in", row?.amount ?? 0, Number(walkin.amount));
    }
    const member = posByContact.find((r) => r.contactId !== null);
    if (member) {
      const row = customers.find((c) => c.contactId === member.contactId);
      assert("PL10.10 ลูกค้าสมาชิกที่ซื้อผ่าน POS อยู่ในอันดับ", !!row, "ไม่อยู่ในอันดับ");
      if (row)
        assert(
          "PL10.11 ยอดของลูกค้าคนนั้นรวมยอด POS แล้ว",
          row.amount >= Number(member.amount),
          `อันดับได้ ${row.amount} · POS ${Number(member.amount)}`,
        );
    }
  }

  // ═════════ PL11 — bridge เกลี่ยส่วนลดท้ายบิล ═════════
  console.log("\nPL11 bridge: บิลมีส่วนลดท้ายบิล → เกลี่ยลงบรรทัดให้ Σ = ยอดบิล");
  const SALE10 = "qc42-sale-10-billdiscount";
  const disc = await bridge.bridgePosSalePaid(
    {
      id: SALE10,
      tenantId: shop.tenantId,
      systemId: shop.posSystemId,
      grandTotalSatang: 1_000_000, // 1,065,000 − ส่วนลดท้ายบิล 65,000
      paidAt: new Date(`${QC.today}T05:00:00.000Z`),
      createdAt: new Date(`${QC.today}T05:00:00.000Z`),
      receiptNo: "202609-0010",
    },
    [{ type: "CASH", amountSatang: 1_000_000 }],
    0,
    {
      lines: [
        { name: "หน้ากากดำน้ำ", qty: 1, unitPriceSatang: 285_000, discountSatang: 0, lineTotalSatang: 285_000, itemId: mask.itemId },
        { name: "ถังอากาศ", qty: 1, unitPriceSatang: 780_000, discountSatang: 0, lineTotalSatang: 780_000, itemId: tank.itemId },
      ],
      customer: null,
    },
  );
  assert("PL11.1 โพสต์สำเร็จ", disc.posted === true, JSON.stringify(disc));
  const d10 = await docOf(shop.accSystemId, SALE10);
  assert("PL11.2 บิลที่มีส่วนลดท้ายบิลก็ยังได้เอกสาร", !!d10, "ไม่มีเอกสาร (บรรทัดถูกปฏิเสธ)");
  eq("PL11.3 ยอดเอกสาร = ยอดบิลหลังส่วนลด", d10?.grandTotal ?? 0, 1_000_000);
  eq("PL11.4 บรรทัดครบ 2", d10?.lines.length ?? 0, 2);
  eq(
    "PL11.5 Σ ยอดบรรทัด = ยอดบิล (เกลี่ยส่วนลดแล้ว)",
    (d10?.lines ?? []).reduce((n, l) => n + l.amount, 0),
    1_000_000,
  );
  assert(
    "PL11.6 ส่วนลดถูกเกลี่ยตามสัดส่วน (บรรทัดแพงกว่าโดนมากกว่า)",
    (d10?.lines[1]?.discount ?? 0) > (d10?.lines[0]?.discount ?? 0),
    JSON.stringify((d10?.lines ?? []).map((l) => l.discount)),
  );
  eq("PL11.7 JV ของบิลนี้ยังลงเต็มยอดสุทธิ", jvSig(await jvOf(shop.accSystemId, SALE10)).includes("1000:1000000:0"), true);
} finally {
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* ล้างแบบ best-effort */
    }
  };
  for (const id of tenantIds) {
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: id }, data: { reversalOfId: null } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountDocument.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountContact.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.party.deleteMany({ where: { tenantId: id } }));
    for (const m of [
      "accountSystemLink", "accountProduct", "accountUnit", "accountCategory", "accountMapping", "accountLedger",
      "accountPeriod", "accountDocSequence", "accountSettings",
      "invMovement", "invLot", "invLocationStock", "invLocation", "invItemImage", "invItem", "invSettings", "invCategory",
      "appNotification", "outboxEvent", "appSystemUnit", "appSystem",
    ]) {
      await d(() => (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    }
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  console.log(`\n🧹 ลบร้านทดสอบ ${tenantIds.length} ร้าน`);
}

console.log(`\n===== QC WO 4.2 · POS ส่งบรรทัด สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length}`);
if (findings.length > 0) console.log(findings.map((f) => "  - " + f).join("\n"));
console.log(`JSON_SUMMARY ${JSON.stringify({ total: passed + findings.length, passed, findings })}`);
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
