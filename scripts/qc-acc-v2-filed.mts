// QC ACC T1.7 — "ยื่นแล้ว" มีผล: เตือน+ยืนยันเมื่อรายการลงเดือนที่ยื่น ภ.พ.30 / ภ.ง.ด. แล้ว · ผลต่างหลังยื่น · ยกเลิกเครื่องหมายเก็บประวัติ
// ใบงาน ledger/ACCOUNT-TAX-PLAN.md T1.7 (ปิด E10 · G5) · design note ledger/wo-notes/T1.7.md
// ฟิกซ์เจอร์ของตัวเอง (ร้าน "QC T1.7 ยื่นแล้ว" สร้าง/ลบเอง · KEEP=1 = เก็บไว้)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-filed.mts
//
// เดือนคงที่ในอดีต (ไม่ผูกนาฬิกา) — เฉลยมือ (สตางค์):
//   X = 2026-03 (ภ.พ.30) · ก่อนยื่น: ใบเสร็จ S1 ฐาน 1,000,000 VAT 70,000 · ทำเครื่องหมายยื่น X
//   หลังยื่น (ลงวันที่ใน X):
//     S2 ใบเสร็จผ่านจอ ฐาน 200,000 VAT 14,000 — ไม่ติ๊ก = คำเตือน (ไม่มีอะไรถูกเขียน) · ติ๊ก = ออกได้ + บันทึกผู้ยืนยัน → ภาษีขาย +14,000
//     S3 ใบเสร็จจากงานเบื้องหลัง (ไม่มีบริบท) ฐาน 100,000 VAT 7,000 → ไม่บล็อก · ขึ้นในผลต่าง (ไม่มีการยืนยัน) → ภาษีขาย +7,000
//     R2 JV มือผ่าน REST: Dr ภาษีขาย 5,000 / Cr ธนาคาร 5,000 — ไม่ส่ง acknowledge = 409 · ส่ง = 201 → ภาษีขาย −5,000
//     S5 ค่าใช้จ่ายใช้สิทธิ์ภาษีซื้อ ฐาน 300,000 VAT 21,000 (ติ๊ก) → ภาษีซื้อ +21,000
//     S6 รับชำระใบแจ้งหนี้บริการ (ออก ก.พ. ฐาน 400,000 VAT 28,000 พัก 2210) ลงวันที่ใน X (ติ๊ก) → ใบกำกับงวดลง X: ภาษีขาย +28,000 · พัก −28,000
//   ผลต่างหลังยื่น X: 5 รายการ · ภาษีขาย 14,000 + 7,000 − 5,000 + 28,000 = 44,000 · ภาษีซื้อ 21,000 · สุทธิ 23,000 · พัก −28,000 · ยืนยันแล้ว 4
//   แบบเพิ่มเติม X: ผลต่าง ภาษีขาย +44,000 · ภาษีซื้อ +21,000 (= ผลรวมของรายการผลต่าง) → รายการทั้งหมด "อยู่ในแบบเพิ่มเติมแล้ว"
//   Z = 2026-01: ทำเครื่องหมาย → ยกเลิก (เหตุผล) → แถวยังอยู่ · ทำใหม่ → ประวัติ MARK/UNMARK/REFILE · ยกเลิกผ่าน REST → UNMARK ที่ 2 (API_KEY)
//   งวดปิด Z: ลงรายการใน Z แม้ยืนยันทุกคำเตือน = ปฏิเสธ (ความถูกต้องของข้อมูล ไม่ใช่คำเตือน)
//   Y = 2026-02 (ภ.ง.ด.53): จ่ายผู้ขาย (นิติบุคคล) 485,000 + WHT 15,000 (3% ของ 500,000) วันที่ 10 → 50 ทวิ C1 · ทำเครื่องหมายนำส่ง 53
//     P1 จ่ายอีกงวด 485,000 + WHT 15,000 วันที่ 20 (จอ) — ไม่ติ๊ก = คำเตือน PND · ติ๊ก = ได้ C2
//     P2 ยกเลิกงวดแรก (C1) — ไม่ติ๊ก = คำเตือน PND (ยกเลิก 50 ทวิ ของเดือนที่นำส่งแล้ว) · ติ๊ก = C1 ยกเลิก
//     ผลต่าง Y: C2 ออกหลังยื่น +15,000 · C1 ยกเลิกหลังยื่น −15,000 · รวม 53 = 0
//     ยกเลิกเครื่องหมาย 53 (เหตุผล) → แถวอยู่ · ตราประทับ 50 ทวิ ถูกล้าง · ทำใหม่ = C2 ใบเดียว ภาษี 15,000
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-filed");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 600)}`}`);
};
const eq = (id: string, n: string, act: unknown, exp: unknown, sev: Sev = "CRITICAL") => chk(id, n, JSON.stringify(act) === JSON.stringify(exp), exp, act, sev);

const KEEP = process.env.KEEP === "1";
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const acc: Any = await import("@/lib/modules/account/service" as string);
const exp: Any = await import("@/lib/modules/account/expense" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const fin: Any = await import("@/lib/modules/account/finance" as string);
const PC: Any = await import("@/lib/modules/account/period-close" as string);
const PF: Any = await import("@/lib/modules/account/pp30-filing" as string);
const PR: Any = await import("@/lib/modules/account/pp30-return" as string);
const WHT: Any = await import("@/lib/modules/account/wht" as string);
const LG: Any = await import("@/lib/modules/account/legal-gate" as string);
const FD: Any = await import("@/lib/modules/account/filed-differences" as string);
const FH: Any = await import("@/lib/modules/account/filing-history" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);
const ak: Any = await import("@/lib/api-keys/service" as string);
const scopes: Any = await import("@/lib/api-keys/scopes" as string);
const route: Any = await import("@/app/api/v1/account/[...path]/route" as string);

const X = "2026-03";
const Y = "2026-02";
const Z = "2026-01";
const day = (ym: string, d: number) => new Date(`${ym}-${String(d).padStart(2, "0")}T10:00:00+07:00`);
const TENANT_NAME = "QC T1.7 ยื่นแล้ว";

async function purgeTenant(tenantId: string) {
  const rows: { table_name: string }[] = await prisma.$queryRaw`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`;
  let pending = rows.map((r) => r.table_name);
  for (let pass = 0; pass < 12 && pending.length > 0; pass++) {
    const still: string[] = [];
    for (const t of pending) {
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM "${t}" WHERE "tenantId" = $1`, tenantId);
      } catch {
        still.push(t);
      }
    }
    if (still.length === pending.length) break;
    pending = still;
  }
  await prisma.tenant.deleteMany({ where: { id: tenantId } });
}

// ═══ F0 ทะเบียน ═══
console.log("\n── F0 ทะเบียนคำเตือน ──");
{
  const v = W.LEGAL_WARNINGS.FILED_PERIOD_VAT_CHANGE;
  const p = W.LEGAL_WARNINGS.FILED_PERIOD_PND_CHANGE;
  chk("F0.1", "FILED_PERIOD_VAT_CHANGE: ต้องยืนยัน · [V] · อ้าง ม.83 + common-vat-invoice §19 · วันที่ตรวจ", v?.ack === true && v.tag === "V" && /ม\.83/.test(v.citation) && /§19/.test(v.citation) && /^\d{4}-\d{2}-\d{2}$/.test(v.checkedAt), "ack/V/ม.83", v && { ack: v.ack, tag: v.tag, c: v.citation });
  chk("F0.2", "FILED_PERIOD_PND_CHANGE: ต้องยืนยัน · [S] (แหล่งไม่พูดตรง) · ข้อความต่อท้ายให้ตรวจกับนักบัญชี", p?.ack === true && p.tag === "S" && W.legalWarning("FILED_PERIOD_PND_CHANGE", { period: Y }).messageTh.includes(W.CHECK_WITH_ACCOUNTANT_TH), "ack/S", p && { ack: p.ack, tag: p.tag });
}

let tid = "";
try {
  console.log("\n── F1 ฟิกซ์เจอร์ ──");
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } })) await purgeTenant(old.id);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t17-${Date.now().toString(36)}`, status: "ACTIVE", enabledModules: ["ACCOUNT"] } })).id;
  const owner = await prisma.user.create({ data: { email: `qc-t17-${Date.now()}@qc.local`, name: "เจ้าของ T1.7" } });
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const SYS = (await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T1.7")).id;
  const ctx = { tenantId: tid, systemId: SYS };
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน T1.7", vatRegistered: true, vatRateBp: 700, taxId: "0105561000017", branchCode: "00000" });
  await gl.ensureAccounting(ctx);
  const bankRes = await fin.createFinanceAccount({ tenantId: tid, systemId: SYS, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
  const bank = await prisma.accountFinance.findFirstOrThrow({ where: { id: bankRes.id }, select: { id: true, ledgerAccountId: true } });
  const cust = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า T1.7", taxId: "0105561999917", branchCode: "00000" });
  const vend = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "VENDOR", legalType: "COMPANY", name: "ผู้ขาย T1.7 จำกัด", taxId: "0105561999927", branchCode: "00000" });
  const expAccts = await exp.listExpenseAccounts(SYS);
  const expLedger = expAccts.find((a: Any) => a.code === "6900") ?? expAccts[0];
  const ledgerId = async (code: string) => (await prisma.accountLedger.findFirst({ where: { systemId: SYS, code }, select: { id: true } }))!.id;
  const A2200 = await ledgerId("2200");

  const mkReceipt = async (label: string, date: Date, amt: number) =>
    acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: cust.id, issueDate: date, vatMode: "EXCLUDE", lines: [{ description: label, qty: 1, unitPrice: amt, vatRateBp: 700 }], createdById: owner.id });
  const screen = (codes: string[], fn: () => Promise<Any>) => LG.withScreenLegal(LG.screenAck(codes, owner.id), fn);
  const entriesOf = (refId: string) => prisma.accountJournalEntry.count({ where: { systemId: SYS, refId } });
  const ackRows = (targetType: string) => prisma.auditLog.count({ where: { tenantId: tid, action: "legal.warning.ack", targetType } });

  // ─── S1 ก่อนยื่น + ทำเครื่องหมายยื่น X ───
  const s1 = await mkReceipt("S1", day(X, 5), 1_000_000);
  const s1r = await acc.issueDocument(tid, SYS, s1.id);
  if (!s1r.ok) throw new Error("S1: " + s1r.reason);
  // ใบแจ้งหนี้บริการ ก.พ. (VAT พัก 2210) สำหรับ S6 — ก่อนยื่น X
  const iv = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "INVOICE", contactId: cust.id, issueDate: day(Y, 15), vatMode: "EXCLUDE", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 400_000, vatRateBp: 700, lineKind: "SERVICE" }], createdById: owner.id });
  const ivr = await acc.issueDocument(tid, SYS, iv.id);
  if (!ivr.ok) throw new Error("IV: " + ivr.reason);
  const mk = await PC.markVatFiled(ctx, { periodKey: X, userId: owner.id });
  chk("F1.1", `ทำเครื่องหมายยื่น ${X} ได้ (ภาษีขาย 70,000)`, mk.ok && mk.lines.outputVat === 70_000, "ok/70000", mk.ok ? mk.lines.outputVat : mk.reason);
  await new Promise((r) => setTimeout(r, 20)); // เวลายื่น < เวลาลงรายการถัดไป

  // ─── S2 ออกเอกสารผ่านจอ ───
  console.log("\n── F2 ออกเอกสารย้อนเข้าเดือนที่ยื่นแล้ว (จอ) ──");
  const s2 = await mkReceipt("S2", day(X, 20), 200_000);
  const s2a = await screen([], () => acc.issueDocument(tid, SYS, s2.id, { ack: LG.screenAck([], owner.id) }));
  const s2doc = await prisma.accountDocument.findUniqueOrThrow({ where: { id: s2.id }, select: { status: true, docNo: true } });
  chk("F2.1", "ไม่ติ๊ก → ผลคำเตือน (ok:false + legal FILED_PERIOD_VAT_CHANGE) ไม่ใช่ error ดิบ", !s2a.ok && s2a.legal?.code === "LEGAL_ACK_REQUIRED" && s2a.legal.warnings.some((w: Any) => w.code === "FILED_PERIOD_VAT_CHANGE"), "legal", s2a);
  chk("F2.2", "ข้อความบอกเดือน + ผลต่อภาษีขาย +140.00 บาท · มีมาตรา/ป้าย/วันที่ตรวจ", !s2a.ok && s2a.legal?.warnings?.[0]?.messageTh.includes(X) && s2a.legal.warnings[0].messageTh.includes("+140.00") && !!s2a.legal.warnings[0].citation && s2a.legal.warnings[0].tag === "V", "ข้อความ", s2a.legal?.warnings?.[0]?.messageTh);
  chk("F2.3", "ไม่มีอะไรถูกเขียน: ยังเป็นร่าง ไม่มีเลข ไม่มี JV", s2doc.status === "DRAFT" && s2doc.docNo === null && (await entriesOf(s2.id)) === 0, "DRAFT/null/0", { ...s2doc, je: await entriesOf(s2.id) });
  const acks0 = await ackRows("AccountJournalEntry");
  const s2b = await screen(["FILED_PERIOD_VAT_CHANGE"], () => acc.issueDocument(tid, SYS, s2.id, { ack: LG.screenAck(["FILED_PERIOD_VAT_CHANGE"], owner.id) }));
  chk("F2.4", "ติ๊กแล้ว → ออกได้ (ไม่บล็อก)", s2b.ok, "ok", s2b);
  const ackRow = await prisma.auditLog.findFirst({ where: { tenantId: tid, action: "legal.warning.ack", targetType: "AccountJournalEntry" }, orderBy: { createdAt: "desc" } });
  chk("F2.5", "บันทึกผู้ยืนยัน (T0.4 ack trail): ใคร · ช่องทาง screen · รหัส", (await ackRows("AccountJournalEntry")) === acks0 + 1 && ackRow?.actorId === owner.id && ackRow?.after?.via === "screen" && ackRow?.after?.codes?.includes("FILED_PERIOD_VAT_CHANGE"), "1 แถว owner/screen", ackRow && { a: ackRow.actorId, after: ackRow.after });

  // ─── S3 งานเบื้องหลัง ───
  const s3 = await mkReceipt("S3", day(X, 21), 100_000);
  const s3r = await acc.issueDocument(tid, SYS, s3.id);
  chk("F2.6", "งานเบื้องหลัง (ไม่มีบริบทการยืนยัน) → ไม่บล็อก", s3r.ok, "ok", s3r);

  // ─── S5 ค่าใช้จ่ายใช้สิทธิ์ภาษีซื้อ ───
  const s5 = await exp.createExpenseDoc({ tenantId: tid, systemId: SYS, docType: "EXPENSE", contactId: vend.id, issueDate: day(X, 22), vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ description: "S5 ซื้อ", qty: 1, unitPrice: 300_000, vatRateBp: 700, accountId: expLedger.id }], createdById: owner.id });
  const s5a = await screen([], () => exp.issueExpenseDoc(tid, SYS, s5.id, { ack: LG.screenAck([], owner.id) }));
  chk("F2.7", "ภาษีซื้อลงเดือนที่ยื่นแล้ว: ไม่ติ๊ก = คำเตือน (ภาษีซื้อ +210.00 บาท)", !s5a.ok && s5a.legal?.warnings?.some((w: Any) => w.code === "FILED_PERIOD_VAT_CHANGE" && w.messageTh.includes("+210.00")), "legal", s5a);
  const s5b = await screen(["FILED_PERIOD_VAT_CHANGE"], () => exp.issueExpenseDoc(tid, SYS, s5.id, { ack: LG.screenAck(["FILED_PERIOD_VAT_CHANGE"], owner.id) }));
  chk("F2.8", "ติ๊กแล้ว = บันทึกได้", s5b.ok, "ok", s5b);

  // ─── S6 รับชำระที่ปล่อย VAT ───
  // ORACLE-EDIT (ACC T2.6 lane 1): ใบกำกับงวดรับเงินของบริการลงวันที่ **วันรับเงิน** (paidAt = day(X, 25)) แล้ว (เดิม = วันที่บันทึก)
  //   ⇒ VAT ที่ปล่อยเข้าเดือน X ที่ยื่นแล้ว (ไม่ใช่เดือนปัจจุบัน) · ด่านเดียวกันที่ชั้นลงบัญชี — คงการทำเครื่องหมายเดือนปัจจุบันไว้
  //   (ยืนยันว่าเดือนปัจจุบันไม่มีผลต่าง) · ผลต่างของ X เพิ่ม 1 แถว (+28,000 ภาษีขาย · −28,000 พัก · ยืนยันแล้ว) ⇒ F4.1/F4.2/F3.4/F4.4 ปรับตาม
  const CUR = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const mc = await PC.markVatFiled(ctx, { periodKey: CUR, userId: owner.id });
  chk("F2.8b", `ทำเครื่องหมายยื่นเดือนปัจจุบัน ${CUR} (ยังไม่มีรายการ)`, mc.ok, "ok", mc);
  await new Promise((r) => setTimeout(r, 20));
  const s6pay = (codes: string[]) => screen(codes, () => acc.recordPayment(tid, SYS, iv.id, { paidAt: day(X, 25), financeAccountId: bank.id, channel: "TRANSFER", amount: 428_000, createdById: owner.id, idempotencyKey: `t17-s6-${tid}` }));
  const s6a = await s6pay([]);
  const paysA = await prisma.accountDocumentPayment.count({ where: { documentId: iv.id } });
  chk("F2.9", "รับชำระที่ปล่อย VAT พักเข้าเดือนที่ยื่นแล้ว: ไม่ติ๊ก = คำเตือน (service กลืน error ก็ยังได้รูปคำเตือน) · ไม่มีแถวรับชำระค้าง", !s6a.ok && s6a.legal?.warnings?.some((w: Any) => w.code === "FILED_PERIOD_VAT_CHANGE" && w.messageTh.includes("+280.00")) && paysA === 0, "legal/0", { s6a, paysA });
  const s6b = await s6pay(["FILED_PERIOD_VAT_CHANGE"]);
  chk("F2.10", "ติ๊กแล้ว = รับชำระได้", s6b.ok, "ok", s6b);
  const dc = await FD.vatFiledDifferences(ctx, CUR);
  const dx = await FD.vatFiledDifferences(ctx, X);
  eq("F2.11", `ผลต่างหลังยื่น: ${CUR} ไม่มีรายการ · ${X} มีใบกำกับงวดรับเงิน ภาษีขาย +28,000 · พัก −28,000 · ยืนยันแล้ว (ลงวันรับเงิน)`, [dc.rows.length, dx.rows.filter((r: Any) => r.docType === "TAX_INVOICE").map((r: Any) => [r.outputDelta, r.parkedDelta, r.acknowledged, r.docType])], [0, [[28_000, -28_000, true, "TAX_INVOICE"]]]);
  const uc = await PC.unmarkVatFiled(ctx, CUR, { userId: owner.id, reason: "ทดสอบเดือนปัจจุบันเสร็จแล้ว" });
  chk("F2.12", "ยกเลิกเครื่องหมายเดือนปัจจุบันได้ (ไม่มีแบบเพิ่มเติม)", uc.ok, "ok", uc);

  // ─── REST ───
  console.log("\n── F3 REST / เครื่องมือเลขา (runOpAsActor เดียวกัน) ──");
  const kW = await ak.createApiKey({ tenantId: tid }, "T17 write", { scopes: scopes.expandBundles(["accountant"]), systemId: SYS });
  const kO = await ak.createApiKey({ tenantId: tid }, "T17 owner", { scopes: [...scopes.expandBundles(["accountant"]), "account.period.reopen", "account.wht.unmark"], systemId: SYS });
  const call = async (method: string, path: string, key: string, body?: unknown) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : { "idempotency-key": `t17-${Date.now()}-${Math.random().toString(16).slice(2)}` }) };
    let b: string | undefined;
    if (body !== undefined) { b = JSON.stringify(body); headers["content-type"] = "application/json"; }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body: b });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
    return { status: res.status, body: parsed };
  };
  const jvBody = { date: `${X}-26`, memo: "ปรับภาษีขาย", lines: [{ accountId: A2200, debitSatang: 5_000, creditSatang: 0 }, { accountId: bank.ledgerAccountId, debitSatang: 0, creditSatang: 5_000 }] };
  const jeBefore = await prisma.accountJournalEntry.count({ where: { systemId: SYS, source: "MANUAL" } });
  const r1 = await call("POST", "/journal", kW.rawKey, jvBody);
  chk("F3.1", "REST JV มือลงเดือนที่ยื่นแล้ว ไม่ส่ง acknowledge → 409 legal_ack_required + warnings[FILED_PERIOD_VAT_CHANGE] (มาตรา/ป้าย)", r1.status === 409 && r1.body?.error?.code === "legal_ack_required" && r1.body?.error?.warnings?.some((w: Any) => w.code === "FILED_PERIOD_VAT_CHANGE" && w.citation && w.tag === "V"), "409", { s: r1.status, e: r1.body?.error });
  chk("F3.2", "409 = ยังไม่ได้เขียน (ไม่มี JV ใหม่)", (await prisma.accountJournalEntry.count({ where: { systemId: SYS, source: "MANUAL" } })) === jeBefore, jeBefore, await prisma.accountJournalEntry.count({ where: { systemId: SYS, source: "MANUAL" } }));
  const r2 = await call("POST", "/journal", kW.rawKey, { ...jvBody, acknowledge: ["FILED_PERIOD_VAT_CHANGE"] });
  const apiAck = await prisma.auditLog.findFirst({ where: { tenantId: tid, action: "legal.warning.ack", actorType: "API_KEY" }, orderBy: { createdAt: "desc" } });
  chk("F3.3", "ส่ง acknowledge → บันทึกได้ + ผู้ยืนยันเป็นคีย์ API (via rest)", (r2.status === 201 || r2.status === 200) && apiAck?.after?.via === "rest", "201/rest", { s: r2.status, e: r2.body?.error, a: apiAck?.after });

  // ─── F4 ผลต่างหลังยื่น ───
  console.log("\n── F4 ผลต่างหลังยื่น ──");
  const d = await FD.vatFiledDifferences(ctx, X);
  // ORACLE-EDIT (ACC T2.6): + แถวใบกำกับงวดรับเงิน S6 (ลงวันรับเงินในเดือนนี้แล้ว) ภาษีขาย +28,000 · พัก −28,000
  eq("F4.1", "5 รายการ · ภาษีขาย 44,000 · ภาษีซื้อ 21,000 · สุทธิ 23,000 · พัก −28,000", [d.rows.length, d.totals.output, d.totals.input, d.totals.net, d.totals.parked], [5, 44_000, 21_000, 23_000, -28_000]);
  eq("F4.2", "ยืนยันแล้ว 4 · ไม่มีการยืนยัน 1 (งานเบื้องหลัง S3)", [d.rows.filter((r: Any) => r.acknowledged).length, d.rows.filter((r: Any) => !r.acknowledged).map((r: Any) => r.outputDelta)], [4, [7_000]]);
  chk("F4.3", "แต่ละแถวมีเอกสาร/ที่มา · ผู้ทำ (ชื่อ) · เวลา · JV มือแยกป้าย", d.rows.every((r: Any) => r.createdAt && (r.docNo || r.manual)) && d.rows.some((r: Any) => r.manual && r.outputDelta === -5_000) && d.rows.some((r: Any) => r.byName === "เจ้าของ T1.7"), "ครบ", d.rows.map((r: Any) => ({ doc: r.docNo, m: r.manual, o: r.outputDelta, i: r.inputDelta, by: r.byName, ack: r.acknowledged })));
  const rest = await call("GET", `/periods/${X}/filed-differences`, kW.rawKey);
  chk("F3.4", "GET /periods/{key}/filed-differences: vat.rows 5 · totals (สตางค์) · pnd ว่าง · history (ORACLE-EDIT T2.6: +แถวใบกำกับงวด)", rest.status === 200 && rest.body?.data?.vat?.rows?.length === 5 && rest.body.data.vat.totals.outputSatang === 44_000 && rest.body.data.vat.totals.inputSatang === 21_000 && Array.isArray(rest.body.data.vat.history) && rest.body.data.pnd.rows.length === 0, "200", { s: rest.status, d: JSON.stringify(rest.body?.data ?? rest.body).slice(0, 400) });
  const add = await PF.fileVatAdditional(ctx, { periodKey: X, userId: owner.id });
  chk("F4.4", "แบบเพิ่มเติม: ผลต่าง ภาษีขาย +44,000 · ภาษีซื้อ +21,000 = ผลรวมผลต่างหลังยื่น (ORACLE-EDIT T2.6)", add.ok && add.diff.outputVat === 44_000 && add.diff.inputVat === 21_000, "16000/21000", add.ok ? add.diff : add.reason);
  const d2 = await FD.vatFiledDifferences(ctx, X);
  eq("F4.5", "หลังยื่นเพิ่มเติม: ทุกแถวอยู่ในแบบแล้ว · ยอดที่ยังไม่อยู่ในแบบ = 0", [d2.rows.every((r: Any) => !r.afterLatestFiling), d2.pending.net, d2.pending.output], [true, 0, 0]);

  // ─── F5 ยกเลิกเครื่องหมาย = เก็บประวัติ ───
  console.log("\n── F5 ยกเลิกเครื่องหมายยื่น ภ.พ.30 (ไม่ลบแถว) ──");
  const mz = await PC.markVatFiled(ctx, { periodKey: Z, userId: owner.id });
  chk("F5.0", `ทำเครื่องหมาย ${Z} ได้`, mz.ok, "ok", mz);
  const un = await PC.unmarkVatFiled(ctx, Z, { userId: owner.id, reason: "ทำเครื่องหมายผิดเดือน" });
  const rowZ = await prisma.accountVatFiling.findMany({ where: { systemId: SYS, periodKey: Z } });
  chk("F5.1", "ยกเลิกแล้วแถวยังอยู่ · unmarkedAt/โดยใคร/เหตุผล", un.ok && rowZ.length === 1 && !!rowZ[0].unmarkedAt && rowZ[0].unmarkedById === owner.id && rowZ[0].unmarkReason === "ทำเครื่องหมายผิดเดือน", "1 แถว", rowZ.map((r: Any) => ({ u: r.unmarkedAt, by: r.unmarkedById, why: r.unmarkReason })));
  const stZ = await PR.vatFiledState(ctx, Z);
  chk("F5.2", "สถานะ = ยังไม่ยื่น แต่ยังอ่านตัวเลขที่เคยยื่น + เหตุผลได้ · เช็กลิสต์/รายการยื่นไม่นับ", !stZ.filed && stZ.unmarked?.reason === "ทำเครื่องหมายผิดเดือน" && (await PC.listVatFilings(ctx)).every((f: Any) => f.periodKey !== Z), "unfiled+history", stZ);
  const re = await PC.markVatFiled(ctx, { periodKey: Z, userId: owner.id });
  const hz = await FH.filingHistory(ctx, "PP30", Z);
  chk("F5.3", "ทำเครื่องหมายใหม่ได้ (แถวเดิม) · ประวัติ MARK → UNMARK(เหตุผล) → REFILE", re.ok && (await prisma.accountVatFiling.count({ where: { systemId: SYS, periodKey: Z } })) === 1 && JSON.stringify(hz.map((h: Any) => h.action)) === JSON.stringify(["MARK", "UNMARK", "REFILE"]) && hz[1].reason === "ทำเครื่องหมายผิดเดือน" && hz[1].actorId === owner.id && !!hz[2].before?.unmarkedAt, "MARK/UNMARK/REFILE", hz.map((h: Any) => ({ a: h.action, r: h.reason, b: h.before })));
  const ru = await call("DELETE", `/periods/${Z}/vat-filed`, kO.rawKey, { reason: "ยกเลิกผ่าน API ทดสอบ", confirm: true });
  const hz2 = await FH.filingHistory(ctx, "PP30", Z);
  chk("F5.4", "REST DELETE /periods/{key}/vat-filed: แถวยังอยู่ · ประวัติ UNMARK ที่ 2 พร้อมเหตุผล", ru.status === 200 && (await prisma.accountVatFiling.count({ where: { systemId: SYS, periodKey: Z } })) === 1 && hz2.at(-1)?.action === "UNMARK" && hz2.at(-1)?.reason === "ยกเลิกผ่าน API ทดสอบ", "200", { s: ru.status, e: ru.body?.error, h: hz2.map((h: Any) => h.action) });
  const unX = await PC.unmarkVatFiled(ctx, X, { userId: owner.id, reason: "x" });
  chk("F5.5", "เดือนที่มีแบบเพิ่มเติมแล้ว ยกเลิกเครื่องหมายไม่ได้ (กติกา T1.3 คงเดิม)", !unX.ok && /แบบยื่นเพิ่มเติม/.test(unX.reason), "ปฏิเสธ", unX);

  // ─── F6 งวดปิด ≠ ยื่นแล้ว ───
  console.log("\n── F6 งวดปิด (ความถูกต้องของข้อมูล) ต่างจากยื่นแล้ว (คำเตือน) ──");
  const cz = await gl.closePeriod(ctx, Z, owner.id);
  const sz = await mkReceipt("SZ", day(Z, 10), 10_000);
  const szr = await screen(["FILED_PERIOD_VAT_CHANGE", "FILED_PERIOD_PND_CHANGE"], () => acc.issueDocument(tid, SYS, sz.id, { ack: LG.screenAck(["FILED_PERIOD_VAT_CHANGE", "FILED_PERIOD_PND_CHANGE"], owner.id) }));
  chk("F6.1", "งวดปิด: ยืนยันทุกคำเตือนแล้วก็ยังปฏิเสธ (ไม่ใช่ผลคำเตือน)", cz.ok && !szr.ok && !szr.legal && /ปิดแล้ว/.test(szr.reason), "ปฏิเสธ งวดปิด", { cz, szr });

  // ─── F7 ภ.ง.ด. ───
  console.log("\n── F7 ภ.ง.ด.53 ──");
  const e1 = await exp.createExpenseDoc({ tenantId: tid, systemId: SYS, docType: "EXPENSE", contactId: vend.id, issueDate: day(Y, 5), vatMode: "NONE", lines: [{ description: "ค่าบริการผู้ขาย", qty: 1, unitPrice: 1_000_000, vatRateBp: 0, accountId: expLedger.id }], createdById: owner.id });
  const e1r = await exp.issueExpenseDoc(tid, SYS, e1.id);
  if (!e1r.ok) throw new Error("E1: " + e1r.reason);
  const vpay = (dd: number, key: string) => exp.recordVendorPayment(tid, SYS, e1.id, { paidAt: day(Y, dd), channel: "TRANSFER", financeAccountId: bank.id, amount: 485_000, whtAmountSatang: 15_000, whtRateBp: 300, whtIncomeType: "M40_8", createdById: owner.id, idempotencyKey: key });
  const p0 = await vpay(10, `t17-p0-${tid}`);
  if (!p0.ok) throw new Error("P0: " + p0.reason);
  const c1 = await prisma.accountDocument.findFirstOrThrow({ where: { systemId: SYS, docType: "WHT_CERT", direction: "IN", status: "ISSUED" } });
  const mf = await WHT.markFiled(tid, SYS, { form: 53, periodKey: Y, filedById: owner.id });
  chk("F7.0", "ทำเครื่องหมายนำส่ง ภ.ง.ด.53 ได้ (1 ใบ · 15,000)", mf.ok && mf.certCount === 1 && mf.totalTaxSatang === 15_000, "1/15000", mf);
  await new Promise((r) => setTimeout(r, 20));
  const p1a = await screen([], () => vpay(20, `t17-p1-${tid}`));
  chk("F7.1", "จ่ายหัก ณ ที่จ่ายลงเดือนที่นำส่งแล้ว: ไม่ติ๊ก = คำเตือน FILED_PERIOD_PND_CHANGE · ยังไม่มี 50 ทวิ ใหม่", !p1a.ok && p1a.legal?.warnings?.some((w: Any) => w.code === "FILED_PERIOD_PND_CHANGE" && w.messageTh.includes("ภ.ง.ด.53")) && (await prisma.accountDocument.count({ where: { systemId: SYS, docType: "WHT_CERT" } })) === 1, "legal", p1a);
  const p1b = await screen(["FILED_PERIOD_PND_CHANGE"], () => vpay(20, `t17-p1-${tid}`));
  chk("F7.2", "ติ๊กแล้ว = จ่ายได้ + ออก 50 ทวิ ใบที่ 2", p1b.ok && (await prisma.accountDocument.count({ where: { systemId: SYS, docType: "WHT_CERT", status: "ISSUED" } })) === 2, "ok/2", p1b);
  const pay1 = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { documentId: e1.id, whtCertDocId: c1.id } });
  const p2a = await screen([], () => exp.voidVendorPayment(tid, SYS, e1.id, pay1.id, "จ่ายซ้ำ"));
  const c1a = await prisma.accountDocument.findUniqueOrThrow({ where: { id: c1.id }, select: { status: true } });
  chk("F7.3", "ยกเลิกงวดที่มี 50 ทวิ ของเดือนที่นำส่งแล้ว: ไม่ติ๊ก = คำเตือน · 50 ทวิ ยังไม่ถูกยกเลิก", !p2a.ok && p2a.legal?.warnings?.some((w: Any) => w.code === "FILED_PERIOD_PND_CHANGE" && /ยกเลิก 50 ทวิ/.test(w.messageTh)) && c1a.status === "ISSUED", "legal/ISSUED", { p2a, c1a });
  const p2b = await screen(["FILED_PERIOD_PND_CHANGE"], () => exp.voidVendorPayment(tid, SYS, e1.id, pay1.id, "จ่ายซ้ำ"));
  const c1b = await prisma.accountDocument.findUniqueOrThrow({ where: { id: c1.id }, select: { status: true } });
  const certAck = await prisma.auditLog.count({ where: { tenantId: tid, action: "legal.warning.ack", targetType: "AccountDocument", targetId: c1.id } });
  chk("F7.4", "ติ๊กแล้ว = ยกเลิกได้ · บันทึกผู้ยืนยันที่ 50 ทวิ", p2b.ok && c1b.status === "VOIDED" && certAck === 1, "VOIDED/1", { p2b, c1b, certAck });
  const pd = await FD.pndFiledDifferences(ctx, Y);
  eq("F7.5", "ผลต่าง ภ.ง.ด.53: ออกหลังยื่น +15,000 · ยกเลิกหลังยื่น −15,000 · รวม 0 · ยืนยันทั้งคู่", [pd.rows.map((r: Any) => [r.form, r.change, r.whtDelta, r.acknowledged]), pd.totals["53"]], [[[53, "ISSUED_AFTER", 15_000, true], [53, "VOIDED_AFTER", -15_000, true]], 0]);
  const restY = await call("GET", `/periods/${Y}/filed-differences`, kW.rawKey);
  chk("F7.6", "REST ผลต่างของ ภ.ง.ด.: 2 แถว · forms [53]", restY.status === 200 && restY.body?.data?.pnd?.rows?.length === 2 && restY.body.data.pnd.forms[0]?.form === 53, "2", { s: restY.status, p: restY.body?.data?.pnd });
  const uw = await WHT.unmarkFiled(tid, SYS, { form: 53, periodKey: Y, userId: owner.id, reason: "ยื่นผิดยอด" });
  const wrow = await prisma.accountWhtFiling.findMany({ where: { systemId: SYS, form: 53, periodKey: Y } });
  const stamped = await prisma.accountDocument.count({ where: { systemId: SYS, whtFiledPeriodKey: `53:${Y}` } });
  chk("F7.7", "ยกเลิกเครื่องหมาย ภ.ง.ด.: แถวอยู่ + เหตุผล · ตราประทับ 50 ทวิ ถูกล้าง · ไม่อยู่ในรายการยื่น", uw.ok && wrow.length === 1 && wrow[0].unmarkReason === "ยื่นผิดยอด" && !!wrow[0].unmarkedAt && stamped === 0 && (await WHT.listWhtFilings(tid, SYS)).length === 0, "แถว 1", { uw, w: wrow.map((r: Any) => r.unmarkReason), stamped });
  const mf2 = await WHT.markFiled(tid, SYS, { form: 53, periodKey: Y, filedById: owner.id });
  const hy = await FH.filingHistory(ctx, 53, Y);
  chk("F7.8", "ทำเครื่องหมายใหม่ = 50 ทวิ ที่ยังมีผล 1 ใบ ภาษี 15,000 · ประวัติ MARK/UNMARK/REFILE · ภาพเดิมมีรายชื่อ 50 ทวิ ที่เคยประทับ", mf2.ok && mf2.certCount === 1 && mf2.totalTaxSatang === 15_000 && JSON.stringify(hy.map((h: Any) => h.action)) === JSON.stringify(["MARK", "UNMARK", "REFILE"]) && Array.isArray(hy[1].before?.certIds) && hy[1].before.certIds.length === 1, "MARK/UNMARK/REFILE", { mf2, h: hy.map((h: Any) => ({ a: h.action, b: h.before })) });
} catch (e) {
  chk("F-CRASH", "ชุดข้อสอบรันจบโดยไม่ล้ม", false, "no crash", e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  if (tid && !KEEP) await purgeTenant(tid);
  else if (tid && KEEP) {
    // KEEP=1: เก็บร้านไว้ + ให้เจ้าของ QC (ผู้ใช้ของภาพจอ) เข้าดูได้
    const accEnv: Any = await import("./acc-v2-env.mts" as string);
    const qcOwner = await prisma.user.findFirst({ where: { email: accEnv.QC.ownerEmail }, select: { id: true } });
    if (qcOwner) await prisma.membership.upsert({ where: { userId_tenantId: { userId: qcOwner.id, tenantId: tid } }, create: { userId: qcOwner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() }, update: {} }).catch((e: unknown) => console.log(`membership: ${String(e)}`));
    const syss = await prisma.appSystem.findMany({ where: { tenantId: tid, type: "ACCOUNT" }, select: { id: true, name: true } });
    console.log(`KEEP=1 → ร้าน ${tid} · ${syss.map((x: Any) => `${x.name}: /app/sys/${x.id}/account/reports/pp30?period=2026-03`).join(" · ")}`);
  }
}

const failed = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T1.7 ยื่นแล้ว: ผ่าน ${cks.length - failed.length}/${cks.length} · ไม่ผ่าน ${failed.length} =====`);
if (failed.length) console.log("ไม่ผ่าน: " + failed.map((f) => `${f.id}(${f.sev})`).join(", "));
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);
