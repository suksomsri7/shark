// QC ACC T2.2 — แก้ใบกำกับที่ผิด: "ยกเลิกและออกแทน" (เลขใหม่ · วันที่เดิม · หมายเหตุอ้างเลขเดิม · หมายเหตุในรายงานภาษีขาย)
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md แถว T2.2 (ปิด B7) · design note ledger/wo-notes/T2.2.md
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง สร้างเอง ลบใน finally)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-taxinv-replace.mts
//
// เฉลยคำนวณมือ (7% แยก VAT · สตางค์):
//   X1 ใบแจ้งหนี้สินค้า 5 ส.ค. 1,000,000 ⇒ ใบกำกับพร้อมใบแจ้งหนี้ (T1.2) VAT 70,000 ชื่อผู้ซื้อผิด
//      ยกเลิกและออกแทน ⇒ ใบใหม่ เลขใหม่ ลงวันที่ 2026-08-05 · ยอด 1,070,000 / VAT 70,000 เท่าเดิม · ผู้ซื้อใหม่
//      GL: JV เดิม +70,000 (2200) · กลับรายการ −70,000 · JV ใหม่ +70,000 — ทุกตัวลงงวด 2026-08 ⇒ 2200 ส.ค. สุทธิ 70,000
//   X2 รายงานภาษีขาย ส.ค.: ใบเดิม ฐาน 0 VAT 0 + หมายเหตุ "ออกใบกำกับภาษีฉบับใหม่แทนเลขที่ <ใหม่>" · ใบใหม่ VAT 70,000 + "ออกแทน…เลขที่ <เดิม>" · รวม 70,000
//   X5 ใบกำกับงวดรับเงิน (บริการ 200,000 · VAT 14,000) ออกแทน ⇒ ยกงวดเดิม · ยกเลิกรับชำระ ⇒ ใบใหม่ยกเลิกตาม · 2200 สุทธิ 0
//   X6 เดือนที่ยื่นแล้ว (ก.ย.) ⇒ ต้องยืนยัน FILED_PERIOD_VAT_CHANGE ด้วย (ไม่บล็อกเมื่อยืนยัน)
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-taxinv-replace");

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 700)}`}`);
};
const D = (m: number, d: number) => new Date(Date.UTC(2026, m - 1, d, 5));
const ymd = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

let tid = "";
const users: string[] = [];
const keys: string[] = [];
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Any;
  const STR = (await import("@/lib/modules/account/sales-tax-report" as string)) as Any;
  const LG = (await import("@/lib/modules/account/legal-gate" as string)) as Any;
  const PC = (await import("@/lib/modules/account/period-close" as string)) as Any;
  const ak = (await import("@/lib/api-keys/service" as string)) as Any;
  const scopes = (await import("@/lib/api-keys/scopes" as string)) as Any;
  const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Any;

  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC T2.2 replace", slug: `qc-t22-${stamp}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-t22-${stamp}@qc.local`, name: "เจ้าของ T2.2" } });
  users.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });
  const S = (await sys.createSystem(tid, "ACCOUNT", "บัญชี T2.2")).id;
  const ctx = { tenantId: tid, systemId: S };
  await acc.saveSettings(tid, S, { orgName: "ร้าน T2.2", vatRegistered: true, vatRateBp: 700, taxId: "0105561000022" });
  await gl.ensureAccounting(ctx);
  const bank = await fin.createFinanceAccount({ tenantId: tid, systemId: S, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
  const cust = await acc.createContact({ tenantId: tid, systemId: S, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท สะกดผิด จำกัด", taxId: "0105561999922", branchCode: "00000" });
  const A2200 = (await prisma.accountLedger.findFirst({ where: { systemId: S, code: "2200" }, select: { id: true } }))!.id;
  const net2200 = async (refIds: string[]) => {
    const ls = await prisma.accountJournalLine.findMany({ where: { systemId: S, accountId: A2200, entry: { refType: "AccountDocument", refId: { in: refIds } } }, select: { debit: true, credit: true } });
    return ls.reduce((a, l) => a + l.credit - l.debit, 0);
  };
  const screen = (codes: string[], fn: () => Promise<Any>) => LG.withScreenLegal(LG.screenAck(codes, owner.id), fn);
  const tisOf = (srcId: string) => prisma.accountDocument.findMany({ where: { systemId: S, docType: "TAX_INVOICE", sourceDocId: srcId }, orderBy: { createdAt: "asc" }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
  const BUYER = { name: "บริษัท สะกดถูก จำกัด", taxId: "0105561999922", branchCode: "00001", address: "99 ถนนเจริญกรุง กรุงเทพฯ" };

  // ═══ X1 ═══
  console.log("\nX1 ใบกำกับสินค้าผู้ซื้อผิด → ยกเลิกและออกแทน:");
  const iv = await acc.createDocument({ tenantId: tid, systemId: S, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", issueDate: D(8, 5), dueDate: D(9, 5), lines: [{ description: "ถังดำน้ำ", qty: 1, unitPrice: 1_000_000, vatRateBp: 700, lineKind: "GOODS" }], createdById: owner.id });
  await acc.issueDocument(tid, S, iv.id);
  const old = (await tisOf(iv.id))[0];
  let fresh: Any = null;
  {
    const r0 = await screen([], () => acc.replaceTaxInvoice(ctx, old.id, { reason: "ชื่อผู้ซื้อสะกดผิด", buyer: BUYER, key: `x1-${stamp}`, createdById: owner.id }));
    const after0 = await prisma.accountDocument.findUnique({ where: { id: old.id } });
    chk("X1.1", "ไม่ยืนยัน → คำเตือน TAX_INVOICE_REPLACE (ป้าย V · อ้าง ข้อ 25 · ack) · ไม่มีอะไรถูกเขียน", !r0.ok && r0.legal?.warnings?.some((w: Any) => w.code === "TAX_INVOICE_REPLACE" && w.tag === "V" && /ข้อ 25/.test(w.citation) && w.ack === true && w.messageTh.includes(old.docNo)) && after0?.status === "ISSUED" && (await tisOf(iv.id)).length === 1, "legal", { r0, s: after0?.status });
    const r = await screen(["TAX_INVOICE_REPLACE"], () => acc.replaceTaxInvoice(ctx, old.id, { reason: "ชื่อผู้ซื้อสะกดผิด", buyer: BUYER, key: `x1-${stamp}`, createdById: owner.id }));
    chk("X1.2", "ยืนยันแล้ว → สำเร็จ · เลขใหม่ ≠ เลขเดิม", r.ok && !!r.newDocNo && r.newDocNo !== old.docNo && r.oldDocNo === old.docNo, "ok", r);
    fresh = await prisma.accountDocument.findUnique({ where: { id: r.newId }, include: { lines: { orderBy: { sortOrder: "asc" } } } });
    const o = await prisma.accountDocument.findUnique({ where: { id: old.id } });
    chk("X1.3", "ใบใหม่ลงวันที่ฉบับเดิม 2026-08-05 · ISSUED · ยอด/VAT/บรรทัดเท่าเดิม · ต้นทางเดิม", fresh?.status === "ISSUED" && ymd(fresh.issueDate) === "2026-08-05" && fresh.grandTotal === old.grandTotal && fresh.vatAmount === 70_000 && fresh.subTotal === old.subTotal && fresh.sourceDocId === iv.id && JSON.stringify(fresh.lines.map((l: Any) => [l.description, l.amount, l.vatRateBp])) === JSON.stringify(old.lines.map((l) => [l.description, l.amount, l.vatRateBp])), "เท่าเดิม", fresh && { d: ymd(fresh.issueDate), g: fresh.grandTotal, v: fresh.vatAmount });
    const snap = fresh?.contactSnapshot as Any;
    chk("X1.4", "ผู้ซื้อของใบใหม่ = ที่แก้ (ชื่อ · สาขา 00001 · ที่อยู่) · ใบเดิมคงผู้ซื้อเดิม", snap?.name === BUYER.name && snap?.branchCode === "00001" && snap?.address === BUYER.address && (o?.contactSnapshot as Any)?.name === "บริษัท สะกดผิด จำกัด", "แก้แล้ว", { n: snap, o: o?.contactSnapshot });
    chk("X1.5", "หมายเหตุใบใหม่อ้างเลข/วันที่ฉบับเดิม + เหตุผล", (fresh?.note ?? "").includes(`ออกแทนใบกำกับภาษีฉบับเดิมเลขที่ ${old.docNo}`) && (fresh?.note ?? "").includes("ชื่อผู้ซื้อสะกดผิด"), "note", fresh?.note);
    chk("X1.6", "ใบเดิม VOIDED · เหตุผล · replacedById = ใบใหม่ · relation REPLACE เดิม→ใหม่", o?.status === "VOIDED" && o.replacedById === fresh?.id && (o.voidReason ?? "").includes("ชื่อผู้ซื้อสะกดผิด") && (await prisma.accountDocumentRelation.count({ where: { fromId: old.id, toId: fresh?.id, type: "REPLACE" } })) === 1, "ตามนั้น", { s: o?.status, r: o?.replacedById, v: o?.voidReason });
    const jes = await prisma.accountJournalEntry.findMany({ where: { systemId: S, refType: "AccountDocument", refId: { in: [old.id, fresh.id] } }, include: { lines: true } });
    chk("X1.7", "GL: JV เดิม + กลับรายการ + JV ใหม่ ทุกตัวงวด 2026-08 · ดุลทุกตัว · 2200 สุทธิ (ใบแจ้งหนี้+ใบกำกับทั้งสอง) = 70,000", jes.length === 3 && jes.every((e) => e.periodKey === "2026-08" && e.lines.reduce((a, l) => a + l.debit - l.credit, 0) === 0) && (await net2200([iv.id, old.id, fresh.id])) === 70_000, "3 JV 2026-08", { n: jes.map((e) => [e.periodKey, !!e.reversalOfId]), net: await net2200([iv.id, old.id, fresh.id]) });
    const ack = await prisma.auditLog.findFirst({ where: { tenantId: tid, action: "legal.warning.ack", targetId: old.id } });
    chk("X1.8", "บันทึกผู้ยืนยันคำเตือน (AuditLog legal.warning.ack · screen)", !!ack && (ack.after as Any)?.codes?.includes("TAX_INVOICE_REPLACE"), "1 แถว", ack?.after);
    const again = await screen(["TAX_INVOICE_REPLACE"], () => acc.replaceTaxInvoice(ctx, old.id, { reason: "ซ้ำ", key: `x1-${stamp}`, createdById: owner.id }));
    chk("X1.9", "คีย์เดิมซ้ำ → คืนใบใหม่เดิม (idempotent) ไม่สร้างเพิ่ม", again.ok && again.newId === fresh.id && (await tisOf(iv.id)).length === 2, "เดิม", again);
    const other = await screen(["TAX_INVOICE_REPLACE"], () => acc.replaceTaxInvoice(ctx, old.id, { reason: "อีกครั้ง", key: `x1b-${stamp}`, createdById: owner.id }));
    chk("X1.10", "ใบที่ถูกแทนแล้ว ออกแทนซ้ำด้วยคีย์ใหม่ไม่ได้ (ออกแทนได้เฉพาะฉบับปัจจุบัน)", !other.ok && /ฉบับปัจจุบัน|แทนไปแล้ว/.test(other.reason), "ปฏิเสธ", other);
  }

  // ═══ X2 รายงานภาษีขาย ═══
  console.log("\nX2 รายงานภาษีขาย ส.ค. — หมายเหตุทั้งสองใบ:");
  {
    const r = await STR.salesTaxReport(ctx, "2026-08");
    const ro = r.rows.find((x: Any) => x.docNo === old.docNo);
    const rn = r.rows.find((x: Any) => x.docNo === fresh.docNo);
    chk("X2.1", "ใบเดิม: ฐาน 0 VAT 0 · หมายเหตุอ้างเลขใบใหม่ + เหตุผล", !!ro && ro.vat === 0 && ro.base === 0 && ro.notes.some((n: string) => n.includes(`ออกใบกำกับภาษีฉบับใหม่แทน`) && n.includes(fresh.docNo)), "แถวเดิม", ro);
    chk("X2.2", "ใบใหม่: วันที่ 2026-08-05 ฐาน 1,000,000 VAT 70,000 · หมายเหตุออกแทนเลขเดิม · ผู้ซื้อใหม่ สาขา 00001", !!rn && rn.date === "2026-08-05" && rn.base === 1_000_000 && rn.vat === 70_000 && rn.notes.some((n: string) => n.includes(`ออกแทนใบกำกับภาษีฉบับเดิมเลขที่ ${old.docNo}`)) && rn.buyerName === BUYER.name && rn.buyerBranchCode === "00001", "แถวใหม่", rn);
    chk("X2.3", "รวม ส.ค. = 70,000 = GL", r.total.vat === 70_000 && r.glVat === 70_000, 70_000, { r: r.total.vat, g: r.glVat });
  }

  // ═══ X3 แก้ใบที่ออกแล้วตรง ๆ ═══
  console.log("\nX3 แก้ใบกำกับที่ออกแล้วตรง ๆ ไม่ได้ — ชี้ไปที่ flow ออกแทน:");
  {
    const u = await acc.updateDocument(tid, S, fresh.id, { lines: [{ description: "แก้", qty: 1, unitPrice: 1, vatRateBp: 700 }] });
    chk("X3.1", "updateDocument ใบกำกับที่ออกแล้ว → ปฏิเสธ + ข้อความ 'ยกเลิกและออกแทน'", !u.ok && /ยกเลิกและออกแทน/.test(u.reason), "ปฏิเสธ", u);
    const draft = await acc.createDocument({ tenantId: tid, systemId: S, docType: "TAX_INVOICE", contactId: cust.id, vatMode: "EXCLUDE", issueDate: D(8, 6), lines: [{ description: "x", qty: 1, unitPrice: 1000, vatRateBp: 700 }], createdById: owner.id });
    const rd = await screen(["TAX_INVOICE_REPLACE"], () => acc.replaceTaxInvoice(ctx, draft.id, { reason: "x", key: `x3-${stamp}` }));
    chk("X3.2", "ร่าง/ใบที่ไม่ใช่ใบกำกับที่ออกแล้ว → ปฏิเสธ", !rd.ok, "ปฏิเสธ", rd);
  }

  // ═══ X5 ใบกำกับงวดรับเงิน ═══
  console.log("\nX5 ใบกำกับงวดรับเงิน ออกแทน → ยกเลิกรับชำระแล้วใบใหม่ยกเลิกตาม:");
  {
    const sv = await acc.createDocument({ tenantId: tid, systemId: S, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", issueDate: D(8, 10), dueDate: D(9, 10), lines: [{ description: "ล่องเรือ", qty: 1, unitPrice: 200_000, vatRateBp: 700, lineKind: "SERVICE" }], createdById: owner.id });
    await acc.issueDocument(tid, S, sv.id);
    const p = await acc.recordPayment(tid, S, sv.id, { paidAt: D(8, 12), financeAccountId: bank.id, channel: "TRANSFER", amount: 214_000, createdById: owner.id, idempotencyKey: `x5-${stamp}` });
    const ti = (await tisOf(sv.id))[0];
    const r = await screen(["TAX_INVOICE_REPLACE"], () => acc.replaceTaxInvoice(ctx, ti.id, { reason: "ที่อยู่ผิด", buyer: { ...BUYER, branchCode: "00000" }, lines: [{ description: "ล่องเรือเกาะเต่า 1 วัน" }], key: `x5-${stamp}` }));
    const nw = await prisma.accountDocument.findUnique({ where: { id: r.newId }, include: { lines: true } });
    chk("X5.1", "ออกแทนได้ · ยกงวดรับเงินเดิม (sourcePaymentId) · ลงวันที่ 2026-08-12 · แก้คำอธิบายบรรทัดได้ ยอดคงเดิม", r.ok && nw?.sourcePaymentId === p.paymentId && ymd(nw.issueDate) === "2026-08-12" && nw.lines[0]?.description === "ล่องเรือเกาะเต่า 1 วัน" && nw.lines[0].amount === ti.lines[0].amount && nw.vatAmount === 14_000, "ตามนั้น", { r, nw: nw && { p: nw.sourcePaymentId, d: ymd(nw.issueDate), l: nw.lines.map((l) => [l.description, l.amount]) } });
    const v = await acc.voidPayment(tid, S, sv.id, p.paymentId, "บันทึกผิด");
    const nw2 = await prisma.accountDocument.findUnique({ where: { id: r.newId } });
    chk("X5.2", "ยกเลิกรับชำระ → ใบใหม่ VOIDED · 2200 ของเรื่องนี้สุทธิ 0", v.ok && nw2?.status === "VOIDED" && (await net2200([sv.id, ti.id, r.newId])) === 0, "VOIDED/0", { v, s: nw2?.status, n: await net2200([sv.id, ti.id, r.newId]) });
  }

  // ═══ X6 เดือนที่ยื่นแล้ว ═══
  console.log("\nX6 ใบกำกับในเดือนที่ยื่น ภ.พ.30 แล้ว:");
  {
    const g = await acc.createDocument({ tenantId: tid, systemId: S, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", issueDate: D(9, 3), dueDate: D(10, 3), lines: [{ description: "หน้ากาก", qty: 1, unitPrice: 100_000, vatRateBp: 700, lineKind: "GOODS" }], createdById: owner.id });
    await acc.issueDocument(tid, S, g.id);
    const ti = (await tisOf(g.id))[0];
    const mk = await PC.markVatFiled(ctx, { periodKey: "2026-09", userId: owner.id });
    const r1 = await screen(["TAX_INVOICE_REPLACE"], () => acc.replaceTaxInvoice(ctx, ti.id, { reason: "เลขผู้เสียภาษีผู้ซื้อผิด", buyer: BUYER, key: `x6-${stamp}` }));
    chk("X6.1", "ยื่นแล้ว + ยืนยันแค่ TAX_INVOICE_REPLACE → คำเตือน FILED_PERIOD_VAT_CHANGE (ยังไม่เขียน)", mk.ok && !r1.ok && r1.legal?.warnings?.some((w: Any) => w.code === "FILED_PERIOD_VAT_CHANGE") && (await tisOf(g.id)).length === 1, "legal", r1);
    const r2 = await screen(["TAX_INVOICE_REPLACE", "FILED_PERIOD_VAT_CHANGE"], () => acc.replaceTaxInvoice(ctx, ti.id, { reason: "เลขผู้เสียภาษีผู้ซื้อผิด", buyer: BUYER, key: `x6-${stamp}` }));
    chk("X6.2", "ยืนยันครบ → ออกแทนได้ (ไม่บล็อก) ลงวันที่ 2026-09-03", r2.ok && ymd((await prisma.accountDocument.findUnique({ where: { id: r2.newId } }))!.issueDate) === "2026-09-03", "ok", r2);
  }

  // ═══ X7 REST ═══
  console.log("\nX7 REST POST /documents/{id}/replace-tax-invoice:");
  {
    const g = await acc.createDocument({ tenantId: tid, systemId: S, docType: "INVOICE", contactId: cust.id, vatMode: "EXCLUDE", issueDate: D(8, 20), dueDate: D(9, 20), lines: [{ description: "ฟิน", qty: 1, unitPrice: 300_000, vatRateBp: 700, lineKind: "GOODS" }], createdById: owner.id });
    await acc.issueDocument(tid, S, g.id);
    const ti = (await tisOf(g.id))[0];
    const k = await ak.createApiKey({ tenantId: tid }, "T22", { scopes: scopes.expandBundles(["accountant"]), systemId: S });
    keys.push(k.id ?? k.key?.id ?? "");
    const call = async (path: string, body: unknown) => {
      const req = new Request(`http://x/api/v1/account${path}`, { method: "POST", headers: { authorization: `Bearer ${k.rawKey}`, "content-type": "application/json", "idempotency-key": `t22-${stamp}-${path}-${JSON.stringify(body).length}` }, body: JSON.stringify(body) });
      const res = await route.POST(req, { params: Promise.resolve({ path: path.split("/").filter(Boolean) }) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };
    const a = await call(`/documents/${ti.id}/replace-tax-invoice`, { reason: "สาขาผิด", buyer: BUYER });
    chk("X7.1", "ไม่ส่ง acknowledge → 409 legal_ack_required + TAX_INVOICE_REPLACE", a.status === 409 && a.body?.error?.code === "legal_ack_required" && a.body.error.warnings?.some((w: Any) => w.code === "TAX_INVOICE_REPLACE"), "409", a);
    const b = await call(`/documents/${ti.id}/replace-tax-invoice`, { reason: "สาขาผิด", buyer: BUYER, acknowledge: ["TAX_INVOICE_REPLACE"] });
    chk("X7.2", "ส่ง acknowledge → 200 · คืน id/เลขใบใหม่ + เลขใบเดิม · วันที่ 2026-08-20", b.status === 200 && !!b.body?.data?.taxInvoiceNo && b.body.data.replacedTaxInvoiceNo === ti.docNo && b.body.data.date === "2026-08-20", "200", b);
  }
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown>; updateMany: (a: unknown) => Promise<unknown> }>;
    await d(() => P.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountJournalEntry.updateMany({ where: { tenantId: tid }, data: { reversalOfId: null } }));
    await d(() => P.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocument.updateMany({ where: { tenantId: tid }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    await d(() => P.accountDocumentPayment.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentRelation.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentLine.deleteMany({ where: { tenantId: tid } }));
    for (const m of ["accountAttachment", "accountDocument", "accountDocSequence", "accountProduct", "accountMapping", "accountFinance", "accountContact", "accountPeriod", "accountVatFiling", "accountSettings", "settingChange", "settingValue", "auditLog", "outboxEvent", "apiKey", "membership", "appSystemUnit"]) {
      await d(() => P[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => P.accountLedger.updateMany({ where: { tenantId: tid }, data: { parentId: null } }));
    await d(() => P.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.appSystem.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  for (const u of users) await d(() => prisma.user.delete({ where: { id: u } }));
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T2.2 ยกเลิกและออกใบกำกับแทน =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
