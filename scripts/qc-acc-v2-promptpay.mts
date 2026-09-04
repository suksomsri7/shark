// QC WO 5.5 — PromptPay จ่ายจากลิงก์ → รับชำระ + JV + กระทบยอดอัตโนมัติ
// DESIGN-SPEC-V2 §5.3 (ปุ่ม "ส่ง") · §10.2 (กระทบยอด) · BLUEPRINT §0.3 ข้อ 5
//
// requires: acc-v2-seed
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-promptpay.mts
//
// 🔴 ร้าน QC จริง (SIAM DIVE QC) = **อ่านอย่างเดียว** · การเขียนทั้งหมดเกิดใน "ร้านทิ้ง"
//    ที่สคริปต์สร้างเองแล้วลบใน finally (กติกาเดียวกับ WO 5.2/5.3)
//
// 🔑 กุญแจ Beam: prod **ยังไม่มี** (รอเจ้าของ) ⇒ ข้อสอบตั้ง `process.env.BEAM_*` เองในหน่วยความจำ
//    เฉพาะระหว่างรัน (ไม่แตะ .env / .env.qc) เพื่อให้ `verifyWebhook` (HMAC) ทำงานได้จริง
//    ส่วนการ "สร้าง charge" ใช้ `beamAdapter` ปลอม ⇒ **ไม่มีการยิงเน็ตออกไปหา Beam เลย**
//
// ครอบคลุม
//   PP1  สร้างคำขอโหมด QR นิ่ง: payload EMVCo ถูกต้อง (CRC คิดใหม่อิสระในข้อสอบ) · ยอด tag 54 · หมายเหตุ
//   PP2  สร้างคำขอโหมด Beam (เสียบ createCharge ปลอม): เก็บ chargeId + referenceId = "acc:<id>"
//   PP3  หน้าสาธารณะจาก token · token ไม่รู้จัก/รูปผิด → null · ไม่มีข้อมูลลูกค้าหลุด
//   PP4  webhook เซ็นถูก + PAID → payment 1 ใบ · เอกสาร PAID · JV สมดุล · คำขอ PAID
//   PP5  ยิง webhook เดิมซ้ำ → ไม่เกิด payment ใบที่สอง (idempotent ต่อ chargeId)
//   PP6  ลายเซ็นผิด → 401 และไม่มีอะไรถูกบันทึก
//   PP7  จ่ายเกิน → บันทึกได้แค่ยอดคงค้าง + จดหมายเหตุ · จ่ายบางส่วน → เอกสาร PARTIAL
//   PP8  FAILED/EXPIRED → แตะแค่สถานะคำขอ ไม่มีเงิน/JV
//   PP9  นำเข้า statement **หลัง** จ่ายแล้ว → autoMatch ผูกบรรทัด JV ให้ (MATCHED)
//   PP10 statement มีแถวตรงกับคำขอ QR นิ่งที่ยังรอชำระ → บันทึกรับชำระ + จับคู่ให้เอง · รันซ้ำไม่เกิดซ้ำ
//   PP11 statement ถูกนำเข้า **ก่อน** webhook → จ่ายแล้วผูกแถวเดิมทันที (MATCHED)
//   PP12 ยืนยันรับเงินเองของ QR นิ่ง (คีย์ pp-manual:<id>) · กดซ้ำไม่เกิดซ้ำ
//   PP13 expireRequests ปิดเฉพาะใบที่เลยกำหนด
//   PP14 referenceId ของ "เติมเครดิต AI" ยังวิ่งไปทาง creditFromCharge เหมือนเดิม (ไม่ถูกดักโดยบัญชี)
//   PP15 ด่านสิทธิ์ (account.payment.record) + ด่านชนิด/สถานะเอกสาร
//   PP16 tenant isolation: คำขอ/เอกสารของอีกร้านแตะไม่ได้

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

// 🔑 ตั้งกุญแจ Beam "ในหน่วยความจำ" ก่อน import อะไรที่อ่าน env (beamConfig อ่านตอนเรียก ไม่ใช่ตอน import)
process.env.BEAM_MERCHANT_ID ??= "qc-merchant";
process.env.BEAM_API_KEY ??= "qc-api-key";
process.env.BEAM_WEBHOOK_SECRET ??= "qc-test-secret";
const WEBHOOK_SECRET = process.env.BEAM_WEBHOOK_SECRET;

const { readFileSync } = await import("node:fs");
const crypto = await import("node:crypto");
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const glMod = await import("@/lib/modules/account/gl");
const svc = await import("@/lib/modules/account/service");
const fin = await import("@/lib/modules/account/finance");
const rec = await import("@/lib/modules/account/reconcile");
const pr = await import("@/lib/modules/account/payment-request");
const { assertAccountCan } = await import("@/lib/modules/account/access");
const { POST: webhookPOST } = await import("@/app/api/payment/beam/webhook/route");

const E = JSON.parse(readFileSync(QC.expectedPath, "utf8"));

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
const rejected = async (name: string, fn: () => Promise<unknown>, mustContain?: string) => {
  try {
    const r = (await fn()) as { ok?: boolean; reason?: string };
    if (r && r.ok === false) {
      if (mustContain && !(r.reason ?? "").includes(mustContain)) {
        bad(name, `ปฏิเสธแล้วแต่เหตุผลไม่ตรง: "${r.reason}" (ต้องมี "${mustContain}")`);
        return;
      }
      ok(`${name} (เหตุผล: ${r.reason})`);
      return;
    }
    bad(name, `ไม่ถูกปฏิเสธ — ได้ ${JSON.stringify(r)}`);
  } catch (e) {
    ok(`${name} (โยน: ${e instanceof Error ? e.message : String(e)})`);
  }
};

console.log(`\n===== QC WO 5.5 · PromptPay ลิงก์ชำระเงิน =====`);
console.log(`[env] DB ${host}\n`);

// ─────────── ตัวช่วยของข้อสอบ (คิดเองอิสระจากโค้ดจริง) ───────────

/** CRC16-CCITT-FALSE เขียนใหม่ในข้อสอบ (ไม่ import จาก lib) — ใช้ตรวจ payload ที่ระบบสร้าง */
function crcIndependent(s: string): string {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** แกะ TLV ระดับบนสุดของสตริง EMVCo → map tag→value */
function parseTlv(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= s.length) {
    const tag = s.slice(i, i + 2);
    const len = Number.parseInt(s.slice(i + 2, i + 4), 10);
    if (!Number.isFinite(len)) break;
    out[tag] = s.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

const sign = (raw: string) => crypto.createHmac("sha256", WEBHOOK_SECRET).update(raw, "utf8").digest("hex");

/** ยิง webhook เหมือน Beam ยิงจริง (raw body + ลายเซ็น) — เรียก handler ของ route ตรง ๆ */
async function callWebhook(body: unknown, opts?: { badSignature?: boolean }): Promise<{ status: number; json: Record<string, unknown> }> {
  const raw = JSON.stringify(body);
  const req = new Request("https://qc.local/api/payment/beam/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-beam-signature": opts?.badSignature ? "deadbeef".repeat(8) : sign(raw) },
    body: raw,
  });
  const res = await webhookPOST(req);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

const dayKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** ไฟล์ statement รูปแบบทั่วไป (คอลัมน์เดียวมีเครื่องหมาย) */
function genericCsv(rows: { day: string; desc: string; ref: string; amountSatang: number }[]): string {
  let bal = 0;
  const lines = ["วันที่,รายละเอียด,อ้างอิง,จำนวนเงิน,ยอดคงเหลือ"];
  for (const r of rows) {
    bal += r.amountSatang;
    lines.push(`${r.day},${r.desc},${r.ref},${(r.amountSatang / 100).toFixed(2)},${(bal / 100).toFixed(2)}`);
  }
  return lines.join("\n");
}

let sTenantId: string | null = null;
let ownerId: string | null = null;
let staffId: string | null = null;

// เก็บของจริงของ Beam adapter ไว้คืนตอนจบ (ห้ามให้สคริปต์อื่นใน process เดียวกันได้ของปลอมไป)
const realEnabled = pr.beamAdapter.enabled;
const realCreateCharge = pr.beamAdapter.createCharge;
let chargeSeq = 0;
const fakeCharge: typeof pr.beamAdapter.createCharge = async (input) => ({
  url: `https://beam.qc.local/pay/${encodeURIComponent(input.referenceId)}`,
  chargeId: `qc_ch_${Date.now()}_${++chargeSeq}`,
});

try {
  // ═════════ ร้านทิ้ง ═════════
  const stamp = Date.now();
  const tag = `qc-pp-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag } });
  sTenantId = t.id;
  const owner = await prisma.user.create({ data: { email: `${tag}-owner@qc.local`, name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: `${tag}-staff@qc.local`, name: "QC พนักงาน" } });
  ownerId = owner.id;
  staffId = staff.id;
  await prisma.membership.create({ data: { userId: owner.id, tenantId: sTenantId, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId: sTenantId, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } },
  });
  const unit = await prisma.businessUnit.create({ data: { tenantId: sTenantId, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${stamp}`, status: "ACTIVE" } });
  const accSys = await sysMod.createSystem(sTenantId, "ACCOUNT", "บัญชี " + tag);
  await sysMod.linkUnit(sTenantId, accSys.id, unit.id);
  const sSystemId = accSys.id;
  const S = { tenantId: sTenantId, systemId: sSystemId };
  await glMod.ensureAccounting(S);

  const PROMPTPAY_ID = "0812345678"; // เบอร์มือถือ 10 หลัก → tag 01 = "0066" + 9 หลักหลัง
  const wallet = await fin.createFinanceAccount({
    tenantId: sTenantId,
    systemId: sSystemId,
    type: "E_WALLET",
    name: "พร้อมเพย์ทดสอบ",
    promptpayId: PROMPTPAY_ID,
    openingEntries: [],
  });
  if (!wallet.ok) throw new Error("สร้างช่องทางพร้อมเพย์ไม่สำเร็จ: " + wallet.reason);
  const noPpWallet = await fin.createFinanceAccount({
    tenantId: sTenantId,
    systemId: sSystemId,
    type: "BANK",
    name: "ธนาคารไม่มีพร้อมเพย์",
    bankName: "ทดสอบ",
    openingEntries: [],
  });
  if (!noPpWallet.ok) throw new Error("สร้างช่องทางธนาคารไม่สำเร็จ: " + noPpWallet.reason);

  const cust = await svc.createContact({ tenantId: sTenantId, systemId: sSystemId, kind: "CUSTOMER", name: "ลูกค้าทดสอบพร้อมเพย์" });

  /** ออกใบแจ้งหนี้ 1 ใบ (ราคาแยก VAT 7%) → grand = base × 1.07 */
  async function makeInvoice(baseSatang: number, issue: Date) {
    const doc = await svc.createDocument({
      tenantId: sTenantId!,
      systemId: sSystemId,
      docType: "INVOICE",
      contactId: cust.id,
      issueDate: issue,
      dueDate: new Date(issue.getTime() + 30 * 86_400_000),
      vatMode: "EXCLUDE",
      lines: [{ description: "ค่าบริการทดสอบ", qty: 1, unitPrice: baseSatang }],
      createdById: owner.id,
    });
    const issued = await svc.issueDocument(sTenantId!, sSystemId, doc.id);
    if (!issued.ok) throw new Error("ออกใบแจ้งหนี้ไม่สำเร็จ: " + issued.reason);
    const row = await prisma.accountDocument.findUniqueOrThrow({ where: { id: doc.id }, select: { grandTotal: true, docNo: true } });
    return { id: doc.id, docNo: row.docNo, grand: row.grandTotal };
  }

  const today = new Date();
  const paymentCount = (docId: string) => prisma.accountDocumentPayment.count({ where: { systemId: sSystemId, documentId: docId } });

  // ═════════ PP1 — คำขอโหมด QR นิ่ง ═════════
  console.log("PP1 คำขอโหมด QR นิ่ง (ไม่มีกุญแจ Beam):");
  pr.beamAdapter.enabled = () => false;
  pr.beamAdapter.createCharge = fakeCharge;

  const invStatic = await makeInvoice(200_000, today);
  eq("PP1.0 ยอดใบแจ้งหนี้ = 214,000 สตางค์ (200,000 + VAT 7%)", invStatic.grand, 214_000);
  const reqStatic = await pr.createPaymentRequest(S, invStatic.id, { financeId: wallet.id, expiresInDays: 7, userId: owner.id });
  if (!reqStatic.ok) throw new Error("สร้างคำขอ QR นิ่งไม่สำเร็จ: " + reqStatic.reason);
  eq("PP1.1 โหมด = QR นิ่ง · ไม่มี provider · สถานะรอชำระ", [reqStatic.request.method, reqStatic.request.providerUrl, reqStatic.request.status], ["PROMPTPAY_STATIC", null, "PENDING"]);
  eq("PP1.2 ยอดของคำขอ = ยอดคงค้างของเอกสาร (ไม่รับยอดจาก client)", reqStatic.request.amountSatang, invStatic.grand);
  eq("PP1.3 หมายเหตุบอกวิธียืนยัน", reqStatic.request.note, "ยืนยันเมื่อเห็นยอดใน statement");

  const payload = reqStatic.request.qrPayload ?? "";
  const tlv = parseTlv(payload);
  eq("PP1.4 tag 00 = 01 · tag 01 = 12 (dynamic ล็อกยอด) · tag 53 = 764 · tag 58 = TH", [tlv["00"], tlv["01"], tlv["53"], tlv["58"]], ["01", "12", "764", "TH"]);
  eq("PP1.5 tag 54 (ยอดเงิน) = 2140.00 บาท", tlv["54"], "2140.00");
  const merchant = parseTlv(tlv["29"] ?? "");
  eq("PP1.6 tag 29 = AID พร้อมเพย์ + proxy เบอร์มือถือ (0066 + 9 หลักหลัง)", [merchant["00"], merchant["01"]], ["A000000677010111", "0066812345678"]);
  const body = payload.slice(0, -4);
  eq("PP1.7 CRC ท้าย payload ถูกต้อง (คิดใหม่อิสระในข้อสอบ)", payload.slice(-4), crcIndependent(body));
  assert("PP1.8 CRC ปิดท้ายด้วย tag+len '6304'", body.endsWith("6304"), body.slice(-8));

  const again = await pr.createPaymentRequest(S, invStatic.id, { financeId: wallet.id, expiresInDays: 7, userId: owner.id });
  eq("PP1.9 กดสร้างซ้ำ ยอด/ช่องทางเดิม → คืนใบเดิม (ไม่งอกลิงก์เป็นพรวน)", [again.ok && again.reused, again.ok && again.request.id], [true, reqStatic.request.id]);

  await rejected(
    "PP1.10 ช่องทางที่ไม่ได้กรอกพร้อมเพย์ → ปฏิเสธพร้อมบอกวิธีแก้",
    () => pr.createPaymentRequest(S, invStatic.id, { financeId: noPpWallet.id, userId: owner.id }),
    "ยังไม่ได้กรอกพร้อมเพย์",
  );

  // ═════════ PP2 — คำขอโหมด Beam ═════════
  console.log("\nPP2 คำขอโหมด Beam (เสียบ createCharge ปลอม):");
  pr.beamAdapter.enabled = () => true;
  let seenReference = "";
  pr.beamAdapter.createCharge = async (input) => {
    seenReference = input.referenceId;
    return fakeCharge(input);
  };
  const invBeam = await makeInvoice(300_000, today);
  const reqBeam = await pr.createPaymentRequest(S, invBeam.id, { financeId: wallet.id, expiresInDays: 7, userId: owner.id });
  if (!reqBeam.ok) throw new Error("สร้างคำขอ Beam ไม่สำเร็จ: " + reqBeam.reason);
  const rowBeam = await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: reqBeam.request.id } });
  eq("PP2.1 โหมด = Beam · provider = beam · เก็บ chargeId แล้ว", [rowBeam.method, rowBeam.provider, !!rowBeam.providerChargeId], ["PROMPTPAY_BEAM", "beam", true]);
  eq("PP2.2 referenceId ที่ส่งให้ผู้ให้บริการ = 'acc:<id คำขอ>'", seenReference, `acc:${reqBeam.request.id}`);
  eq("PP2.3 โหมด Beam ไม่ส่ง payload QR ให้หน้าจอ (ใช้ลิงก์ผู้ให้บริการแทน)", [reqBeam.request.qrPayload, !!reqBeam.request.providerUrl], [null, true]);

  // ═════════ PP3 — หน้าสาธารณะ ═════════
  console.log("\nPP3 หน้าสาธารณะ /pay/<token>:");
  const pub = await pr.getPublicPaymentPage(reqStatic.request.token);
  assert("PP3.1 เปิดด้วย token ได้ (ไม่ต้องล็อกอิน)", !!pub, JSON.stringify(pub));
  if (pub) {
    eq("PP3.2 ยอด/เลขที่เอกสาร/สถานะ ถูกต้อง", [pub.amountSatang, pub.docNo, pub.status], [invStatic.grand, invStatic.docNo, "PENDING"]);
    eq("PP3.3 โหมดนิ่งส่ง payload ไปวาด QR ให้ลูกค้า", pub.qrPayload, payload);
    const leaked = JSON.stringify(pub);
    assert("PP3.4 ไม่มีชื่อลูกค้า/id ภายในหลุดในหน้าสาธารณะ", !leaked.includes("ลูกค้าทดสอบพร้อมเพย์") && !leaked.includes(invStatic.id), leaked.slice(0, 160));
  }
  eq("PP3.5 token ไม่รู้จัก → null (ข้อความเดียวกับหมดอายุ กันไล่เดา)", await pr.getPublicPaymentPage("aaaaaaaaaaaaaaaaaaaaaa"), null);
  eq("PP3.6 token รูปผิด (สั้น/มีอักขระแปลก) → null โดยไม่แตะฐานข้อมูล", [await pr.getPublicPaymentPage("x"), await pr.getPublicPaymentPage("../../etc/passwd")], [null, null]);

  // ═════════ PP4/PP5/PP6 — webhook ═════════
  console.log("\nPP4 webhook เซ็นถูก + จ่ายสำเร็จ:");
  const chargeBeam = rowBeam.providerChargeId!;
  const w1 = await callWebhook({ chargeId: chargeBeam, referenceId: `acc:${reqBeam.request.id}`, status: "SUCCEEDED", amount: invBeam.grand });
  eq("PP4.1 webhook ตอบ 200 + handled=paid", [w1.status, w1.json.ok, w1.json.handled], [200, true, "paid"]);
  const docBeam = await prisma.accountDocument.findUniqueOrThrow({ where: { id: invBeam.id }, select: { status: true, paidTotal: true } });
  eq("PP4.2 ใบแจ้งหนี้ = ชำระเงินแล้ว · ยอดครบ", [docBeam.status, docBeam.paidTotal], ["PAID", invBeam.grand]);
  eq("PP4.3 มีรายการรับเงิน 1 ใบ", await paymentCount(invBeam.id), 1);
  const payBeam = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { systemId: sSystemId, documentId: invBeam.id } });
  eq("PP4.4 ช่องทาง PROMPTPAY · เข้าช่องทางของคำขอ · คีย์กันซ้ำ pp:<chargeId> · ผูกกลับคำขอ", [payBeam.channel, payBeam.financeAccountId, payBeam.idempotencyKey, payBeam.paymentRequestId], ["PROMPTPAY", wallet.id, `pp:${chargeBeam}`, reqBeam.request.id]);
  const entryBeam = await prisma.accountJournalEntry.findFirstOrThrow({
    where: { systemId: sSystemId, refType: "AccountDocumentPayment", refId: payBeam.id },
    include: { lines: { select: { debit: true, credit: true, accountId: true } } },
  });
  const drBeam = entryBeam.lines.reduce((a, l) => a + l.debit, 0);
  const crBeam = entryBeam.lines.reduce((a, l) => a + l.credit, 0);
  eq("PP4.5 JV ของการรับเงินสมดุลและเท่ายอดที่รับ", [drBeam, crBeam], [invBeam.grand, invBeam.grand]);
  const reqBeamAfter = await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: reqBeam.request.id } });
  eq("PP4.6 คำขอ = PAID · จดยอดที่จ่ายจริง · ผูก paymentId", [reqBeamAfter.status, reqBeamAfter.paidAmountSatang, reqBeamAfter.paymentId], ["PAID", invBeam.grand, payBeam.id]);
  const pubPaid = await pr.getPublicPaymentPage(reqBeam.request.token);
  eq("PP4.7 หน้าสาธารณะกลายเป็นสถานะ 'จ่ายแล้ว' และเลิกโชว์ช่องทางจ่าย", [pubPaid?.status, pubPaid?.qrPayload, pubPaid?.providerUrl], ["PAID", null, null]);

  console.log("\nPP5 ยิง webhook เดิมซ้ำ:");
  const w2 = await callWebhook({ chargeId: chargeBeam, referenceId: `acc:${reqBeam.request.id}`, status: "SUCCEEDED", amount: invBeam.grand });
  eq("PP5.1 ตอบ 200 เหมือนเดิม (ไม่ใช่ error)", [w2.status, w2.json.ok], [200, true]);
  eq("PP5.2 ยังมีรายการรับเงินใบเดียว (idempotent ต่อ chargeId)", await paymentCount(invBeam.id), 1);
  const docBeam2 = await prisma.accountDocument.findUniqueOrThrow({ where: { id: invBeam.id }, select: { paidTotal: true } });
  eq("PP5.3 ยอดที่ชำระไม่เบิ้ล", docBeam2.paidTotal, invBeam.grand);

  console.log("\nPP6 ลายเซ็นผิด:");
  const invBad = await makeInvoice(150_000, today);
  const reqBad = await pr.createPaymentRequest(S, invBad.id, { financeId: wallet.id, userId: owner.id });
  if (!reqBad.ok) throw new Error("สร้างคำขอ (ลายเซ็นผิด) ไม่สำเร็จ");
  const chargeBad = (await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: reqBad.request.id } })).providerChargeId!;
  const w3 = await callWebhook({ chargeId: chargeBad, referenceId: `acc:${reqBad.request.id}`, status: "SUCCEEDED", amount: invBad.grand }, { badSignature: true });
  eq("PP6.1 ลายเซ็นไม่ผ่าน → 401", w3.status, 401);
  eq("PP6.2 ไม่มีการบันทึกเงินเลย", await paymentCount(invBad.id), 0);
  const reqBadAfter = await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: reqBad.request.id } });
  eq("PP6.3 สถานะคำขอไม่เปลี่ยน", reqBadAfter.status, "PENDING");

  // ═════════ PP7 — จ่ายเกิน / จ่ายบางส่วน ═════════
  console.log("\nPP7 ยอดไม่ตรง:");
  const invOver = await makeInvoice(400_000, today); // 428,000
  const reqOver = await pr.createPaymentRequest(S, invOver.id, { financeId: wallet.id, userId: owner.id });
  if (!reqOver.ok) throw new Error("สร้างคำขอ (จ่ายเกิน) ไม่สำเร็จ");
  const chargeOver = (await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: reqOver.request.id } })).providerChargeId!;
  const wOver = await callWebhook({ chargeId: chargeOver, referenceId: `acc:${reqOver.request.id}`, status: "PAID", amount: invOver.grand + 50_000 });
  eq("PP7.1 จ่ายเกิน → รับไว้ (200) ไม่ตีกลับ", [wOver.status, wOver.json.ok], [200, true]);
  const payOver = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { systemId: sSystemId, documentId: invOver.id } });
  const docOver = await prisma.accountDocument.findUniqueOrThrow({ where: { id: invOver.id }, select: { status: true, paidTotal: true } });
  eq("PP7.2 บันทึกได้แค่ยอดคงค้าง (ลูกหนี้ไม่ติดลบ) · เอกสาร PAID", [payOver.amount, docOver.paidTotal, docOver.status], [invOver.grand, invOver.grand, "PAID"]);
  const reqOverAfter = await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: reqOver.request.id } });
  eq("PP7.3 จดยอดที่จ่ายมาจริง + หมายเหตุส่วนเกินให้คนตามคืนเงิน", [reqOverAfter.paidAmountSatang, (reqOverAfter.note ?? "").includes("จ่ายเกิน")], [invOver.grand + 50_000, true]);

  const invPart = await makeInvoice(500_000, today); // 535,000
  const reqPart = await pr.createPaymentRequest(S, invPart.id, { financeId: wallet.id, userId: owner.id });
  if (!reqPart.ok) throw new Error("สร้างคำขอ (จ่ายบางส่วน) ไม่สำเร็จ");
  const chargePart = (await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: reqPart.request.id } })).providerChargeId!;
  await callWebhook({ chargeId: chargePart, referenceId: `acc:${reqPart.request.id}`, status: "SUCCEEDED", amount: 235_000 });
  const docPart = await prisma.accountDocument.findUniqueOrThrow({ where: { id: invPart.id }, select: { status: true, paidTotal: true } });
  eq("PP7.4 จ่ายบางส่วน → เอกสาร PARTIAL · ยอดที่ชำระ = ที่จ่ายจริง", [docPart.status, docPart.paidTotal], ["PARTIAL", 235_000]);
  const wZero = await callWebhook({ chargeId: `${chargePart}-zero`, referenceId: `acc:${reqPart.request.id}`, status: "SUCCEEDED", amount: 0 });
  eq("PP7.5 ยอด 0 → ไม่บันทึก (ตอบ 200 พร้อมเหตุผล ให้ผู้ให้บริการเลิกยิงซ้ำ)", [wZero.status, wZero.json.ok], [200, false]);

  // ═════════ PP8 — ไม่สำเร็จ / หมดอายุ ═════════
  console.log("\nPP8 สถานะที่ไม่ใช่จ่ายสำเร็จ:");
  const invFail = await makeInvoice(100_000, today);
  const reqFail = await pr.createPaymentRequest(S, invFail.id, { financeId: wallet.id, userId: owner.id });
  if (!reqFail.ok) throw new Error("สร้างคำขอ (ล้มเหลว) ไม่สำเร็จ");
  const wFail = await callWebhook({ chargeId: "qc_ch_fail", referenceId: `acc:${reqFail.request.id}`, status: "FAILED", amount: 0 });
  eq("PP8.1 FAILED → 200 · handled=closed", [wFail.status, wFail.json.handled], [200, "closed"]);
  const reqFailAfter = await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: reqFail.request.id } });
  eq("PP8.2 คำขอถูกปิด (CANCELLED) · ไม่มีเงิน/JV", [reqFailAfter.status, await paymentCount(invFail.id)], ["CANCELLED", 0]);
  const wPending = await callWebhook({ chargeId: "qc_ch_pending", referenceId: `acc:${reqFail.request.id}`, status: "PROCESSING", amount: 0 });
  eq("PP8.3 สถานะที่ไม่รู้จัก → รับทราบเฉย ๆ (ห้ามเดาว่าจ่ายแล้ว)", [wPending.status, wPending.json.handled], [200, "ignored"]);
  const wUnknownRef = await callWebhook({ chargeId: "qc_ch_x", referenceId: "acc:ไม่มีจริงเลย1234", status: "SUCCEEDED", amount: 100 });
  eq("PP8.4 referenceId ของบัญชีที่ไม่มีคำขอจริง → 200 + ok:false (ไม่ 500)", [wUnknownRef.status, wUnknownRef.json.ok], [200, false]);

  // ═════════ PP9 — นำเข้า statement หลังจ่ายแล้ว ═════════
  console.log("\nPP9 นำเข้า statement หลังจ่ายแล้ว → จับคู่อัตโนมัติ:");
  const periodKey = dayKey(today).slice(0, 7);
  const csv1 = genericCsv([{ day: dayKey(payBeam.paidAt), desc: "รับโอนพร้อมเพย์", ref: "PP001", amountSatang: invBeam.grand }]);
  const imp1 = await rec.importStatement(S, { financeId: wallet.id, periodKey, source: "GENERIC", fileName: "pp1.csv", text: csv1, userId: owner.id });
  if (!("statementId" in imp1)) throw new Error("นำเข้า statement ล้ม: " + JSON.stringify(imp1));
  eq("PP9.1 นำเข้า 1 แถว", imp1.imported, 1);
  const auto1 = await rec.autoMatch(S, imp1.statementId, owner.id);
  if (!("matched" in auto1)) throw new Error("autoMatch ล้ม: " + JSON.stringify(auto1));
  eq("PP9.2 จับคู่ได้ 1 แถว (ยอด+วันตรงกับ JV ของการรับเงินผ่านลิงก์)", [auto1.matched, auto1.suggested, auto1.unmatched], [1, 0, 0]);
  const line1 = await prisma.accountBankStatementLine.findFirstOrThrow({ where: { systemId: sSystemId, statementId: imp1.statementId } });
  eq("PP9.3 แถว statement = MATCHED และผูกกับ JV ใบรับเงินจริง", [line1.status, line1.matchedEntryId], ["MATCHED", entryBeam.id]);
  const jlMatched = await prisma.accountJournalLine.findUniqueOrThrow({ where: { id: line1.matchedLineId! }, select: { debit: true, reconciledAt: true } });
  eq("PP9.4 บรรทัดสมุดรายวันถูกทำเครื่องหมายกระทบยอดแล้ว (เดบิตช่องทาง)", [jlMatched.debit, jlMatched.reconciledAt !== null], [invBeam.grand, true]);

  // ═════════ PP10 — statement จับคู่คำขอ QR นิ่งที่ยังรอชำระ ═════════
  console.log("\nPP10 statement ↔ คำขอ QR นิ่งที่ยังรอชำระ:");
  eq("PP10.0 ก่อนนำเข้า: ยังไม่มีเงินของใบ QR นิ่ง", await paymentCount(invStatic.id), 0);
  const csv2 = genericCsv([{ day: dayKey(today), desc: "รับโอนพร้อมเพย์ (ลูกค้าโอนเอง)", ref: "PP002", amountSatang: invStatic.grand }]);
  const imp2 = await rec.importStatement(S, { financeId: wallet.id, periodKey, source: "GENERIC", fileName: "pp2.csv", text: csv2, userId: owner.id });
  if (!("statementId" in imp2)) throw new Error("นำเข้า statement รอบ 2 ล้ม");
  const auto2 = await rec.autoMatch(S, imp2.statementId, owner.id);
  if (!("matched" in auto2)) throw new Error("autoMatch รอบ 2 ล้ม");
  eq("PP10.1 บันทึกรับชำระให้อัตโนมัติ 1 ใบ", await paymentCount(invStatic.id), 1);
  const payStatic = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { systemId: sSystemId, documentId: invStatic.id } });
  eq("PP10.2 คีย์กันซ้ำ = pp-stmt:<lineId> · ช่องทาง PROMPTPAY · ผูกกลับคำขอ", [payStatic.idempotencyKey?.startsWith("pp-stmt:"), payStatic.channel, payStatic.paymentRequestId], [true, "PROMPTPAY", reqStatic.request.id]);
  const docStatic = await prisma.accountDocument.findUniqueOrThrow({ where: { id: invStatic.id }, select: { status: true, paidTotal: true } });
  eq("PP10.3 ใบแจ้งหนี้ = ชำระเงินแล้ว", [docStatic.status, docStatic.paidTotal], ["PAID", invStatic.grand]);
  const reqStaticAfter = await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: reqStatic.request.id } });
  eq("PP10.4 คำขอ = PAID · ผูกแถว statement ที่เป็นต้นเหตุ", [reqStaticAfter.status, reqStaticAfter.statementLineId !== null], ["PAID", true]);
  const lineStatic = await prisma.accountBankStatementLine.findFirstOrThrow({ where: { systemId: sSystemId, statementId: imp2.statementId } });
  eq("PP10.5 แถว statement = MATCHED (ตัวจับคู่รอบปกติเห็นบรรทัดใหม่แล้วผูกให้)", lineStatic.status, "MATCHED");
  const auto2b = await rec.autoMatch(S, imp2.statementId, owner.id);
  if (!("matched" in auto2b)) throw new Error("autoMatch ซ้ำล้ม");
  eq("PP10.6 รัน autoMatch ซ้ำ → ไม่บันทึกเงินซ้ำ (idempotent ต่อ lineId)", await paymentCount(invStatic.id), 1);

  // ลิงก์อายุยาว ลูกค้าจ่ายกลางทาง (ไม่ใช่ ±3 วันจากวันสร้าง) ต้องจับได้ด้วย — ไม่งั้นลิงก์ 30 วันไร้ประโยชน์
  const invLate = await makeInvoice(310_000, today); // 331,700
  pr.beamAdapter.enabled = () => false; // ต้องเป็นคำขอโหมด QR นิ่ง (ตะขอนี้ทำงานเฉพาะโหมดนิ่ง)
  const reqLate = await pr.createPaymentRequest(S, invLate.id, { financeId: wallet.id, expiresInDays: 30, userId: owner.id });
  pr.beamAdapter.enabled = () => true;
  if (!reqLate.ok) throw new Error("สร้างคำขอ (จ่ายกลางทาง) ไม่สำเร็จ");
  eq("PP10.7a คำขอนี้เป็นโหมด QR นิ่งจริง (positive control ของตะขอ)", reqLate.request.method, "PROMPTPAY_STATIC");
  // ย้อนวันสร้างไป 10 วัน (ลิงก์ยังไม่หมดอายุ) — จำลอง "ส่งลิงก์ไปนานแล้วเพิ่งจ่าย"
  await prisma.accountPaymentRequest.update({
    where: { id: reqLate.request.id },
    data: { createdAt: new Date(today.getTime() - 10 * 86_400_000) },
  });
  const csvLate = genericCsv([{ day: dayKey(today), desc: "รับโอนพร้อมเพย์ (จ่ายกลางทาง)", ref: "PP004", amountSatang: 331_700 }]);
  const impLate = await rec.importStatement(S, { financeId: wallet.id, periodKey, source: "GENERIC", fileName: "pp4.csv", text: csvLate, userId: owner.id });
  if (!("statementId" in impLate)) throw new Error("นำเข้า statement (จ่ายกลางทาง) ล้ม");
  await rec.autoMatch(S, impLate.statementId, owner.id);
  const docLate = await prisma.accountDocument.findUniqueOrThrow({ where: { id: invLate.id }, select: { status: true } });
  eq("PP10.7b ลิงก์อายุ 30 วัน ลูกค้าจ่ายหลังสร้าง 10 วัน → ยังจับคู่+บันทึกให้ (ใช้ช่วงอายุลิงก์ ไม่ใช่ ±3 วันจากวันสร้าง)", [docLate.status, await paymentCount(invLate.id)], ["PAID", 1]);

  // ═════════ PP11 — statement มาก่อน แล้วค่อยจ่าย ═════════
  console.log("\nPP11 statement นำเข้าก่อน แล้วค่อยจ่าย:");
  const invPre = await makeInvoice(600_000, today); // 642,000
  const csv3 = genericCsv([{ day: dayKey(today), desc: "รับโอนพร้อมเพย์ (ล่วงหน้า)", ref: "PP003", amountSatang: 642_000 }]);
  const imp3 = await rec.importStatement(S, { financeId: wallet.id, periodKey, source: "GENERIC", fileName: "pp3.csv", text: csv3, userId: owner.id });
  if (!("statementId" in imp3)) throw new Error("นำเข้า statement รอบ 3 ล้ม");
  await rec.autoMatch(S, imp3.statementId, owner.id);
  // 🔴 1 ช่องทาง 1 เดือน = statement ใบเดียว ⇒ ต้องเจาะแถวด้วย "ยอด" ไม่ใช่หยิบแถวแรกของใบ
  const linePre0 = await prisma.accountBankStatementLine.findFirstOrThrow({
    where: { systemId: sSystemId, statementId: imp3.statementId, amountSatang: 642_000 },
  });
  eq("PP11.1 ก่อนจ่าย แถวนี้ยังไม่มีคู่", linePre0.status, "UNMATCHED");
  const reqPre = await pr.createPaymentRequest(S, invPre.id, { financeId: wallet.id, userId: owner.id });
  if (!reqPre.ok) throw new Error("สร้างคำขอ (statement มาก่อน) ไม่สำเร็จ");
  const chargePre = (await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: reqPre.request.id } })).providerChargeId!;
  const wPre = await callWebhook({ chargeId: chargePre, referenceId: `acc:${reqPre.request.id}`, status: "SUCCEEDED", amount: 642_000 });
  eq("PP11.2 webhook สำเร็จ", [wPre.status, wPre.json.handled], [200, "paid"]);
  const linePre1 = await prisma.accountBankStatementLine.findUniqueOrThrow({ where: { id: linePre0.id } });
  eq("PP11.3 ผูกแถว statement ที่มีอยู่แล้วให้ทันที (MATCHED)", [linePre1.status, linePre1.matchedLineId !== null], ["MATCHED", true]);
  const reqPreAfter = await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: reqPre.request.id } });
  eq("PP11.4 คำขอจดว่าไปผูกกับแถวไหน", reqPreAfter.statementLineId, linePre0.id);

  // ═════════ PP12 — ยืนยันรับเงินเอง ═════════
  console.log("\nPP12 ยืนยันรับเงินเอง (โหมด QR นิ่ง):");
  pr.beamAdapter.enabled = () => false;
  const invManual = await makeInvoice(250_000, today); // 267,500
  const reqManual = await pr.createPaymentRequest(S, invManual.id, { financeId: wallet.id, userId: owner.id });
  if (!reqManual.ok) throw new Error("สร้างคำขอ (ยืนยันเอง) ไม่สำเร็จ");
  const cm1 = await pr.confirmStaticPaymentRequest(S, reqManual.request.id, { userId: owner.id });
  eq("PP12.1 ยืนยันสำเร็จ", cm1.ok === true, true);
  const payManual = await prisma.accountDocumentPayment.findFirstOrThrow({ where: { systemId: sSystemId, documentId: invManual.id } });
  eq("PP12.2 คีย์กันซ้ำ = pp-manual:<requestId>", payManual.idempotencyKey, `pp-manual:${reqManual.request.id}`);
  const cm2 = await pr.confirmStaticPaymentRequest(S, reqManual.request.id, { userId: owner.id });
  eq("PP12.3 กดยืนยันซ้ำ → คืนผลเดิม ไม่บันทึกเงินซ้ำ", [cm2.ok === true, (cm2 as { duplicated?: boolean }).duplicated, await paymentCount(invManual.id)], [true, true, 1]);
  await rejected("PP12.4 คำขอโหมด Beam กด 'ยืนยันรับเงินแล้ว' เองไม่ได้", () => pr.confirmStaticPaymentRequest(S, reqBeam.request.id), "ผู้ให้บริการ");

  // ═════════ PP13 — หมดอายุ ═════════
  console.log("\nPP13 ปิดลิงก์ที่หมดอายุ (cron):");
  const invExp = await makeInvoice(120_000, today);
  const reqExp = await pr.createPaymentRequest(S, invExp.id, { financeId: wallet.id, expiresInDays: 1, userId: owner.id });
  if (!reqExp.ok) throw new Error("สร้างคำขอ (หมดอายุ) ไม่สำเร็จ");
  await prisma.accountPaymentRequest.update({ where: { id: reqExp.request.id }, data: { expiresAt: new Date(Date.now() - 3_600_000) } });
  const invAlive = await makeInvoice(130_000, today);
  const reqAlive = await pr.createPaymentRequest(S, invAlive.id, { financeId: wallet.id, expiresInDays: 30, userId: owner.id });
  if (!reqAlive.ok) throw new Error("สร้างคำขอ (ยังไม่หมดอายุ) ไม่สำเร็จ");
  const expRes = await pr.expireRequests(new Date());
  assert("PP13.1 ปิดอย่างน้อย 1 ใบ", expRes.expired >= 1, JSON.stringify(expRes));
  const afterExp = await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: reqExp.request.id } });
  const afterAlive = await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: reqAlive.request.id } });
  eq("PP13.2 ใบที่เลยกำหนด = EXPIRED · ใบที่ยังไม่ถึง = PENDING", [afterExp.status, afterAlive.status], ["EXPIRED", "PENDING"]);
  const pubExp = await pr.getPublicPaymentPage(reqExp.request.token);
  eq("PP13.3 หน้าสาธารณะของใบหมดอายุ ไม่ปล่อย QR ให้จ่ายต่อ", [pubExp?.status, pubExp?.qrPayload], ["EXPIRED", null]);
  const invCancel = await makeInvoice(140_000, today);
  const reqCancel = await pr.createPaymentRequest(S, invCancel.id, { financeId: wallet.id, userId: owner.id });
  if (!reqCancel.ok) throw new Error("สร้างคำขอ (ยกเลิก) ไม่สำเร็จ");
  const cancelRes = await pr.cancelPaymentRequest(S, reqCancel.request.id, owner.id);
  eq("PP13.4 ยกเลิกลิงก์ที่ยังรอชำระได้", cancelRes.ok === true, true);
  await rejected("PP13.5 ยืนยันรับเงินของลิงก์ที่ยกเลิกแล้วไม่ได้", () => pr.confirmStaticPaymentRequest(S, reqCancel.request.id), "ไม่อยู่ในสถานะรอชำระ");
  await rejected("PP13.6 ยกเลิกซ้ำไม่ได้", () => pr.cancelPaymentRequest(S, reqCancel.request.id, owner.id), "ไม่อยู่ในสถานะรอชำระ");
  eq("PP13.7 ลิงก์ที่ยกเลิกแล้วไม่มีเงินเข้า", await paymentCount(invCancel.id), 0);

  // ═════════ PP14 — เติมเครดิต AI ต้องไม่ถูกดัก ═════════
  console.log("\nPP14 referenceId ของเติมเครดิต AI (positive control):");
  const wTopup = await callWebhook({ chargeId: "qc_ch_topup", referenceId: "tenantX:1000000:abcd1234", status: "SUCCEEDED", amount: 35_000 });
  eq("PP14.1 ยังวิ่งไปทาง creditFromCharge (ไม่มี handled ของฝั่งบัญชี)", [wTopup.status, wTopup.json.handled === undefined], [200, true]);
  assert("PP14.2 ตอบกลับเป็นผลของตัวเติมเครดิต ไม่ใช่ของบัญชี", typeof wTopup.json.reason === "string" || wTopup.json.ok === true, JSON.stringify(wTopup.json));
  const prCountBefore = await prisma.accountPaymentRequest.count({ where: { systemId: sSystemId } });
  await callWebhook({ chargeId: "qc_ch_topup2", referenceId: "tenantX:2000000:efgh5678", status: "SUCCEEDED", amount: 70_000 });
  eq("PP14.3 คำขอชำระเงินฝั่งบัญชีไม่ถูกแตะเลย", await prisma.accountPaymentRequest.count({ where: { systemId: sSystemId } }), prCountBefore);

  // ═════════ PP15 — ด่านสิทธิ์ + ด่านชนิด/สถานะเอกสาร ═════════
  console.log("\nPP15 ด่านสิทธิ์และด่านเอกสาร:");
  const authStaff = { user: { id: staff.id }, active: { ...mStaff, tenant: t } } as never;
  const authOwner = { user: { id: owner.id }, active: { ...(await prisma.membership.findFirstOrThrow({ where: { userId: owner.id, tenantId: sTenantId } })), tenant: t } } as never;
  await rejected("PP15.1 พนักงานที่ไม่มี account.payment.record ถูกปฏิเสธ", async () => {
    assertAccountCan(authStaff, "account.payment.record");
    return { ok: true };
  });
  let ownerPassed = true;
  try {
    assertAccountCan(authOwner, "account.payment.record");
  } catch {
    ownerPassed = false;
  }
  assert("PP15.2 เจ้าของผ่านด่านเดียวกัน (positive control)", ownerPassed);

  const draft = await svc.createDocument({
    tenantId: sTenantId,
    systemId: sSystemId,
    docType: "INVOICE",
    contactId: cust.id,
    issueDate: today,
    vatMode: "EXCLUDE",
    lines: [{ description: "ร่าง", qty: 1, unitPrice: 100_000 }],
    createdById: owner.id,
  });
  await rejected("PP15.3 เอกสารร่างยังสร้างลิงก์เก็บเงินไม่ได้", () => pr.createPaymentRequest(S, draft.id, { financeId: wallet.id, userId: owner.id }), "สถานะ");
  await rejected("PP15.4 เอกสารที่ชำระครบแล้วสร้างลิงก์ไม่ได้", () => pr.createPaymentRequest(S, invBeam.id, { financeId: wallet.id, userId: owner.id }), "สถานะ");
  const quo = await svc.createDocument({
    tenantId: sTenantId,
    systemId: sSystemId,
    docType: "QUOTATION",
    contactId: cust.id,
    issueDate: today,
    vatMode: "EXCLUDE",
    lines: [{ description: "ใบเสนอราคา", qty: 1, unitPrice: 100_000 }],
    createdById: owner.id,
  });
  await svc.issueDocument(sTenantId, sSystemId, quo.id);
  await rejected("PP15.5 ใบเสนอราคาไม่อยู่ในชนิดที่เก็บเงินผ่านลิงก์ได้", () => pr.createPaymentRequest(S, quo.id, { financeId: wallet.id, userId: owner.id }), "ชนิดนี้");
  await rejected("PP15.6 ช่องทางการเงินของร้านอื่นใช้ไม่ได้", () => pr.createPaymentRequest(S, invPart.id, { financeId: E.promptPay.financeId, userId: owner.id }), "ช่องทางการเงินไม่ถูกต้อง");

  // ═════════ PP16 — tenant isolation ═════════
  console.log("\nPP16 แยกร้าน (tenant isolation):");
  const seedReqId = E.promptPay.staticPending.requestId as string;
  await rejected("PP16.1 ยืนยันรับเงินคำขอของร้าน QC จากร้านทดสอบไม่ได้", () => pr.confirmStaticPaymentRequest(S, seedReqId), "ไม่พบคำขอ");
  await rejected("PP16.2 ยกเลิกคำขอของร้าน QC จากร้านทดสอบไม่ได้", () => pr.cancelPaymentRequest(S, seedReqId), "ยกเลิกไม่ได้");
  const seedStill = await prisma.accountPaymentRequest.findUniqueOrThrow({ where: { id: seedReqId } });
  eq("PP16.3 คำขอของร้าน QC ยังเป็น PENDING เหมือนเดิม (ไม่ถูกแตะ)", seedStill.status, "PENDING");
  await rejected("PP16.4 สร้างลิงก์ให้เอกสารของร้านอื่นไม่ได้", () => pr.createPaymentRequest(S, E.promptPay.staticPending.documentId, { financeId: wallet.id, userId: owner.id }), "ไม่พบเอกสาร");
  const listOther = await pr.listPaymentRequests(S, E.promptPay.staticPending.documentId as string);
  eq("PP16.5 อ่านรายการคำขอของเอกสารร้านอื่น = ว่าง", listOther.length, 0);
} catch (e) {
  bad("CRASH", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
} finally {
  pr.beamAdapter.enabled = realEnabled;
  pr.beamAdapter.createCharge = realCreateCharge;
}

// ─────────── ลบร้านทดสอบ ───────────
if (sTenantId) {
  const d = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      /* best-effort */
    }
  };
  await d(() => prisma.accountBankStatementLine.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountBankStatement.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountPaymentRequest.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: sTenantId! }, data: { reversalOfId: null } }));
  await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId: sTenantId! } }));
  await d(() => prisma.accountDocument.deleteMany({ where: { tenantId: sTenantId! } }));
  for (const m of [
    "accountContact", "accountFinanceOpening", "accountFinanceTransfer", "accountFinance",
    "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "accountSystemLink",
    "appNotification", "outboxEvent", "appSystemUnit", "appSystem", "businessUnit", "membership",
  ]) {
    await d(() => (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: sTenantId! } }));
  }
  await d(() => prisma.tenant.delete({ where: { id: sTenantId! } }));
  await d(() => prisma.user.deleteMany({ where: { id: { in: [ownerId!, staffId!] } } }));
  console.log(`\n🧹 ลบร้านทดสอบแล้ว`);
}

console.log(`\n===== QC WO 5.5 · PromptPay สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length}`);
if (findings.length > 0) console.log(findings.map((f) => "  - " + f).join("\n"));
console.log(`JSON_SUMMARY ${JSON.stringify({ total: passed + findings.length, passed, findings })}`);
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);
