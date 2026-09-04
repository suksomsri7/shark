// QC WO 7.2 — กล่องขาเข้า + AI อ่านบิล (DESIGN-SPEC-V2 §12 · เฟรม g15-documents-inbox.png / g20-inbox.png)
//
// requires: acc-v2-seed (seed บล็อก 8.12 เติมผลอ่าน AI ให้ไฟล์ลอย 3 ใบ: DONE ปตท. · ยังไม่อ่าน · FAILED)
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-inbox.mts
//
// 🔴 ไม่มีการยิงเน็ตแม้แต่ครั้งเดียว — ทุกการเรียก AI ฉีด provider ปลอม (CannedProvider) ผ่านพารามิเตอร์
//    `provider` ของ readBill/readPendingInbox · ร้าน QC จริง (SIAM DIVE QC) = **อ่านอย่างเดียว** (T1–T4)
//    การเขียนทั้งหมดเกิดใน "ร้านทิ้ง" ที่สคริปต์สร้างเองแล้วลบใน finally (กติกาเดียวกับ WO 5.3/5.4/7.1)
//
// ครอบคลุม
//   T1  seed: แท็บ "ยังไม่เชื่อมต่อ" 3 ไฟล์ · ที่มา/ผู้ส่ง/สถานะ AI ตรงเฉลย
//   T2  ผลอ่านบิล ปตท. = เฉลย (ผู้ขาย/ยอด 1,240.00/VAT 81.12/ก่อน VAT 1,158.88/เลขที่/วันที่/ชนิด) + เลขคณิตลงตัว
//   T3  ตัวกรอง "ที่มา" + ค้นหาชื่อไฟล์ · แถวที่อ่านไม่ได้มีเหตุผลไทย · แถวที่ยังไม่อ่าน aiStatus = null
//   T4  inboxStats: รออ่าน 1 · เอกสารจากกล่องขาเข้าเดือนนี้ = 0 (เทียบ SQL อิสระ)
//   T5  normalizeExtract (ฟังก์ชันบริสุทธิ์): สตางค์ integer · แปลง พ.ศ.→ค.ศ. · เติมยอดก่อน VAT ให้เอง ·
//       เลขคณิตไม่ลงตัว → ลดความมั่นใจ + ใส่หมายเหตุ · JSON ใน ``` อ่านออก · ขยะ = null
//   T6  readBill (mock): DONE · เก็บ aiExtract/aiModel/aiReadAt/aiCostSatang · ส่ง imageUrls ให้โมเดลจริง
//   T7  หักเครดิต 1 ครั้งต่อการอ่าน 1 ครั้ง (AiCreditTxn source=ACCOUNT_INBOX)
//   T8  idempotent: อ่านซ้ำ = cached ไม่เรียกโมเดล ไม่หักเงินซ้ำ · force = อ่านใหม่ + หักใหม่
//   T9  ซ่อม JSON 1 ครั้ง (โมเดลตอบเป็นข้อความก่อน) → DONE · เรียก 2 ครั้ง แต่หักเงินครั้งเดียว
//   T10 อ่านไม่ออกจริง → FAILED + เหตุผลไทย (ไม่ throw) · PDF → UNSUPPORTED (ไม่แตะ provider ไม่หักเงิน)
//   T11 ปิดผู้ช่วย AI / เครดิตหมด → SKIPPED (ไม่ throw · ไม่หักเงิน · สถานะเดิมไม่เปลี่ยน)
//   T12 readPendingInbox: อ่านทีละชุด ≤10 · ข้ามไฟล์ที่อ่านแล้ว · เครดิตหมด = หยุดทั้งชุด
//   T13 createExpenseFromAttachment: EXP ร่าง ยอดรวม = ยอดบิลเป๊ะ · VAT ตามชนิดเอกสาร · บรรทัดจากบิล ·
//       ผู้ขายถูกสร้างเป็น VENDOR · ไฟล์ LINKED + expenseDocId · source=INBOX
//   T14 กดสร้างซ้ำไม่ได้ · ไม่มียอด/ไม่มีชื่อผู้ขาย = ปฏิเสธพร้อมเหตุผล · overrides ของผู้ใช้ชนะผลอ่าน AI
//   T15 จับคู่ผู้ขาย: เลขภาษีเดิม = ผู้ติดต่อเดิม · ชื่อเดิม = ผู้ติดต่อเดิม · รายใหม่ = สร้างใหม่
//   T16 ใบเสร็จ (RECEIPT) = ไม่มี VAT (vatMode NONE) · ใบแจ้งหนี้ = รอใบกำกับ (ON_PAYMENT)
//   T17 แนบกับเอกสารที่มี (linkAttachment) · ไม่ใช่เอกสารบัญชี (markNotAccounting) ยังทำงานกับไฟล์กล่องขาเข้า
//   T18 consumer แชท: มีทะเบียน "chat.message.received" · ไฟล์เข้ากล่อง (source CHAT · ผู้ส่ง = ชื่อลูกค้า) ·
//       ยิงซ้ำไม่เกิดไฟล์ซ้ำ · ร้านที่ไม่เปิด inboxFromChat = ไม่ทำอะไร · ข้อความตัวอักษรล้วน = ไม่มีไฟล์
//   T19 guard: ไม่มีสิทธิ์ = ถูกปฏิเสธ · tenant isolation: ctx ข้ามร้านอ่าน/สร้างไม่ได้ และไม่แก้ข้อมูลจริง

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { readFileSync } = await import("node:fs");
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const glMod = await import("@/lib/modules/account/gl");
const svc = await import("@/lib/modules/account/service");
const att = await import("@/lib/modules/account/attachment");
const inbox = await import("@/lib/modules/account/inbox");
const inboxAi = await import("@/lib/modules/account/inbox-ai");
const { assertAccountCan } = await import("@/lib/modules/account/access");
const { consumers } = await import("@/lib/outbox-consumers");
type AiChatMessage = import("@/lib/ai/provider").AiChatMessage;

let passed = 0;
const findings: string[] = [];
const ok = (name: string) => { passed++; console.log("  ✅ " + name); };
const bad = (name: string, detail: string) => { findings.push(`${name} — ${detail}`); console.log("  ❌ " + name + " — " + detail); };
const assert = (name: string, cond: boolean, detail = "") => (cond ? ok(name) : bad(name, detail));
const eq = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(name, a === b, `ได้ ${a} · ควรได้ ${b}`);
};
const rejected = async (name: string, fn: () => Promise<{ ok: boolean } | unknown>, mustContain?: string) => {
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

console.log(`\n===== QC WO 7.2 · กล่องขาเข้า + AI อ่านบิล =====`);
console.log(`[env] DB ${host}\n`);

const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as {
  tenantId: string;
  systemId: string;
  attachments: { unlinked: number; ids: Record<string, string> };
  inbox: {
    unlinked: number; aiDone: number; aiUnread: number; aiFailed: number; aiUnsupported: number; docsFromInboxThisMonth: number;
    ids: { done: string; unread: string; failed: string };
    sources: { done: string; unread: string; failed: string };
    senderLabels: { done: string; unread: string; failed: string };
    ptt: {
      vendorName: string; vendorTaxId: string; invoiceNo: string; issueDate: string;
      totalSatang: number; vatSatang: number; subtotalSatang: number; vatRateBp: number;
      docKind: string; confidence: number;
    };
    inboxEmail: string;
  };
};
const { tenantId, systemId } = E;
const I = E.inbox;

// ── provider ปลอม: คืนข้อความตามคิวที่กำหนด + จำว่าถูกเรียกกี่ครั้ง/ได้รูปอะไรไป ──
class CannedProvider {
  calls = 0;
  lastImages: string[] = [];
  lastPrompt = "";
  constructor(private replies: string[]) {}
  async chat(messages: AiChatMessage[]) {
    const user = [...messages].reverse().find((m) => m.role === "user");
    this.lastImages = user?.imageUrls ?? [];
    this.lastPrompt = messages.map((m) => m.content).join("\n");
    const text = this.replies[Math.min(this.calls, this.replies.length - 1)] ?? "";
    this.calls++;
    return { text, tokensIn: 1200, tokensOut: 180, model: "mock/vision-1" };
  }
}
const billJson = (o: Record<string, unknown>) => JSON.stringify(o);
const PTT_JSON = billJson({
  vendorName: "ปตท. สถานีบริการฉลอง",
  vendorTaxId: "0107544000094",
  branchCode: "00000",
  invoiceNo: "6609-00231",
  issueDate: "2026-08-22",
  currency: "THB",
  subtotalSatang: 115_888,
  vatSatang: 8_112,
  vatRateBp: 700,
  totalSatang: 124_000,
  whtSatang: null,
  lineItems: [{ description: "น้ำมันดีเซล B7", qty: 1, unitPriceSatang: 124_000, amountSatang: 124_000 }],
  docKind: "TAX_INVOICE",
  confidence: 0.92,
  notes: null,
});

let sTenantId: string | null = null;
let sTenantId2: string | null = null;
const userIds: string[] = [];

try {
  // ═════════ T1 — ชุดข้อมูล seed ของกล่องขาเข้า (ร้านจริง อ่านอย่างเดียว) ═════════
  console.log("T1 กล่องขาเข้าในชุดข้อมูล QC:");
  const unlinked = await att.listAttachmentsPaged(tenantId, systemId, { tab: "unlinked", pageSize: 50 });
  eq("T1.1 แท็บ 'ยังไม่เชื่อมต่อ' = เฉลย", unlinked.rows.length, I.unlinked);
  const done = unlinked.rows.find((r) => r.id === I.ids.done);
  const unread = unlinked.rows.find((r) => r.id === I.ids.unread);
  const failed = unlinked.rows.find((r) => r.id === I.ids.failed);
  assert("T1.2 พบทั้ง 3 ไฟล์ (อ่านได้/ยังไม่อ่าน/อ่านไม่ได้)", !!done && !!unread && !!failed);
  // ไฟล์ใบที่สามเป็น PDF ⇒ UNSUPPORTED (ชนิดไฟล์ที่ AI ยังอ่านไม่ได้) ไม่ใช่ FAILED
  eq("T1.3 สถานะ AI ของ 3 ไฟล์", [done?.aiStatus, unread?.aiStatus, failed?.aiStatus], ["DONE", null, "UNSUPPORTED"]);
  eq("T1.4 ที่มาของ 3 ไฟล์", [done?.source, unread?.source, failed?.source], [I.sources.done, I.sources.unread, I.sources.failed]);
  eq("T1.5 ผู้ส่งของไฟล์ที่มาจากแชท", done?.senderLabel, I.senderLabels.done);
  assert("T1.6 ไฟล์ที่อ่านไม่ได้มีเหตุผลภาษาไทย", !!failed?.aiReason && failed!.aiReason!.includes("กรอกเอง"), `ได้ ${failed?.aiReason}`);
  eq("T1.7 ไฟล์ที่ยังไม่อ่าน ไม่มีผลอ่าน", [unread?.aiExtract, unread?.aiReason], [null, null]);

  // ═════════ T2 — ผลอ่านบิล ปตท. ตรงเฉลย ═════════
  console.log("\nT2 ผลอ่านบิล ปตท. (เฉลย g15):");
  const ex = done?.aiExtract;
  assert("T2.1 มีผลอ่านบนแถว DONE", !!ex);
  eq("T2.2 ผู้ขาย", ex?.vendorName, I.ptt.vendorName);
  eq("T2.3 ยอดรวม (สตางค์)", ex?.totalSatang, I.ptt.totalSatang);
  eq("T2.4 VAT (สตางค์)", ex?.vatSatang, I.ptt.vatSatang);
  eq("T2.5 ยอดก่อน VAT (สตางค์)", ex?.subtotalSatang, I.ptt.subtotalSatang);
  eq("T2.6 เลขที่ใบกำกับ", ex?.invoiceNo, I.ptt.invoiceNo);
  eq("T2.7 วันที่บนบิล", ex?.issueDate, I.ptt.issueDate);
  eq("T2.8 ชนิดเอกสาร", ex?.docKind, I.ptt.docKind);
  eq("T2.9 เลขผู้เสียภาษี 13 หลัก", ex?.vendorTaxId, I.ptt.vendorTaxId);
  assert("T2.10 เลขคณิตลงตัว (ก่อน VAT + VAT = ยอดรวม)", (ex?.subtotalSatang ?? 0) + (ex?.vatSatang ?? 0) === (ex?.totalSatang ?? -1));
  assert("T2.11 ทุกยอดเป็นจำนวนเต็มสตางค์", [ex?.totalSatang, ex?.vatSatang, ex?.subtotalSatang].every((n) => Number.isInteger(n)));
  assert("T2.12 ความมั่นใจอยู่ใน 0–1", (ex?.confidence ?? -1) >= 0 && (ex?.confidence ?? 2) <= 1);
  // เฉลยอิสระ: อ่านค่าจาก DB ดิบ (คนละเส้นกับ listAttachmentsPaged)
  const rawRow = await prisma.accountAttachment.findFirst({ where: { id: I.ids.done }, select: { aiExtract: true, aiModel: true, aiCostSatang: true } });
  eq("T2.13 ยอดรวมใน DB ดิบ = เฉลย", (rawRow?.aiExtract as { totalSatang?: number } | null)?.totalSatang, I.ptt.totalSatang);
  assert("T2.14 เก็บชื่อโมเดลที่อ่าน", !!rawRow?.aiModel);

  // ═════════ T3 — ตัวกรองที่มา + ค้นหา ═════════
  console.log("\nT3 ตัวกรองของกล่องขาเข้า:");
  const chatOnly = await att.listAttachmentsPaged(tenantId, systemId, { tab: "unlinked", source: "CHAT", pageSize: 50 });
  eq("T3.1 กรองที่มา = แชท เหลือ 1 แถว", chatOnly.rows.map((r) => r.id), [I.ids.done]);
  const appOnly = await att.listAttachmentsPaged(tenantId, systemId, { tab: "unlinked", source: "APP", pageSize: 50 });
  eq("T3.2 กรองที่มา = แอปถ่ายบิล เหลือ 1 แถว", appOnly.rows.map((r) => r.id), [I.ids.unread]);
  const emailOnly = await att.listAttachmentsPaged(tenantId, systemId, { tab: "unlinked", source: "EMAIL", pageSize: 50 });
  eq("T3.3 กรองที่มา = อีเมล ยังไม่มีไฟล์", emailOnly.rows.length, 0);
  const byQ = await att.listAttachmentsPaged(tenantId, systemId, { tab: "unlinked", q: "ปตท", pageSize: 50 });
  eq("T3.4 ค้นหาชื่อไฟล์ 'ปตท'", byQ.rows.map((r) => r.id), [I.ids.done]);
  eq("T3.5 ที่อยู่อีเมลกล่องขาเข้า = เฉลย", inbox.inboxEmailAddress(I.inboxEmail.replace(/^inbox-|@shark\.in\.th$/g, "")), I.inboxEmail);

  // ═════════ T4 — ตัวเลขแผงขวา g15 ═════════
  console.log("\nT4 ตัวเลขแผงขวา (g15):");
  const stats = await inbox.inboxStats({ tenantId, systemId });
  eq("T4.1 ไฟล์ที่ยังไม่ได้ให้ AI อ่าน", stats.unreadCount, I.aiUnread);
  eq("T4.2 เอกสารที่สร้างจากกล่องขาเข้าเดือนนี้", stats.docsThisMonth, I.docsFromInboxThisMonth);
  const sqlDocs = await prisma.$queryRaw<Array<{ n: bigint }>>`
    SELECT COUNT(*)::bigint AS n FROM "AccountDocument"
     WHERE "systemId" = ${systemId} AND "source" = 'INBOX'
       AND "createdAt" >= date_trunc('month', (now() AT TIME ZONE 'Asia/Bangkok')) AT TIME ZONE 'Asia/Bangkok'`;
  eq("T4.3 เทียบกับ SQL อิสระ", Number(sqlDocs[0]?.n ?? -1), stats.docsThisMonth);

  // ═════════ T5 — normalizeExtract (ฟังก์ชันบริสุทธิ์ ไม่แตะ DB) ═════════
  console.log("\nT5 ด่านตรวจผลอ่าน (normalizeExtract):");
  const okExtract = inboxAi.normalizeExtract(JSON.parse(PTT_JSON));
  eq("T5.1 แปลง JSON ปกติได้ครบ", [okExtract?.totalSatang, okExtract?.vatSatang, okExtract?.docKind], [124_000, 8_112, "TAX_INVOICE"]);
  const beYear = inboxAi.normalizeExtract({ vendorName: "ร้านทดสอบ", totalSatang: 10_000, issueDate: "2569-08-22" });
  eq("T5.2 ปี พ.ศ. 2569 → ค.ศ. 2026", beYear?.issueDate, "2026-08-22");
  const onlyTotal = inboxAi.normalizeExtract({ vendorName: "ร้าน", totalSatang: 107_000, vatRateBp: 700 });
  eq("T5.3 มีแต่ยอดรวม → ถอด VAT ให้เอง", [onlyTotal?.subtotalSatang, onlyTotal?.vatSatang], [100_000, 7_000]);
  const mismatch = inboxAi.normalizeExtract({ vendorName: "ร้าน", totalSatang: 100_000, subtotalSatang: 90_000, vatSatang: 5_000, confidence: 0.95 });
  assert("T5.4 เลขคณิตไม่ลงตัว → ลดความมั่นใจ", (mismatch?.confidence ?? 1) <= 0.4, `ได้ ${mismatch?.confidence}`);
  assert("T5.5 เลขคณิตไม่ลงตัว → มีหมายเหตุเตือน", !!mismatch?.notes?.includes("ไม่เท่ายอดรวม"), `ได้ ${mismatch?.notes}`);
  const decimals = inboxAi.normalizeExtract({ vendorName: "ร้าน", totalSatang: "1,240.4", subtotalSatang: 0, vatSatang: 0 });
  assert("T5.6 ค่าที่ไม่ใช่ integer ถูกปัดเป็นสตางค์เต็ม", Number.isInteger(decimals?.totalSatang), `ได้ ${decimals?.totalSatang}`);
  eq("T5.7 เลขภาษีไม่ครบ 13 หลัก = ทิ้ง", inboxAi.normalizeExtract({ vendorName: "ร้าน", totalSatang: 100, vendorTaxId: "123" })?.vendorTaxId, null);
  eq("T5.8 ขยะ = null (ไม่มีทั้งชื่อผู้ขายและยอด)", inboxAi.normalizeExtract({ hello: "world" }), null);
  assert("T5.9 อ่าน JSON ที่ห่อด้วย ``` ได้", !!inboxAi.extractJsonBlock("นี่คือผลลัพธ์\n```json\n{\"vendorName\":\"x\"}\n```"));
  eq("T5.10 ข้อความที่ไม่มี JSON = null", inboxAi.extractJsonBlock("ขอโทษครับ อ่านรูปไม่ออก"), null);
  // prompt ต้องเป็นอังกฤษ (ไทยกิน token ~4 เท่า) — ยกเว้นคำไทยที่ "ต้องอ้างตัวอักษรบนบิลจริง"
  // ยกเว้น 2 คำ: "ใบกำกับภาษี" (ตัดสิน docKind) และ "สำนักงานใหญ่" (รหัสสาขา 00000) — แปลเป็นอังกฤษแล้ว
  // โมเดลจะหาไม่เจอบนรูป · เพดาน 30 ตัวอักษร = กันไม่ให้ prompt ค่อย ๆ กลายเป็นภาษาไทยทั้งก้อน
  const thaiChars = (inboxAi.BILL_PROMPT.match(/[ก-๙]/g) ?? []).length;
  assert("T5.11 prompt ที่ส่งโมเดลเป็นภาษาอังกฤษเกือบทั้งหมด (ประหยัด token)", thaiChars <= 30, `มีอักษรไทย ${thaiChars} ตัว`);
  assert("T5.12 คำอธิบายบนจอเป็นภาษาไทย (ไม่ใช่ enum ดิบ)", /[ก-๙]/.test(inboxAi.normalizeExtract({ vendorName: "ร้าน", totalSatang: 100_000, subtotalSatang: 90_000, vatSatang: 5_000 })?.notes ?? ""));

  // ═════════ ร้านทิ้ง (การเขียนทั้งหมด) ═════════
  console.log("\n── สร้างร้านทดสอบ ──");
  const stamp = Date.now();
  const tag = `qc-inbox-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag } });
  sTenantId = t.id;
  const tid = sTenantId;
  const owner = await prisma.user.create({ data: { email: `${tag}-owner@qc.local`, name: "QC เจ้าของ" } });
  const staff = await prisma.user.create({ data: { email: `${tag}-staff@qc.local`, name: "QC พนักงาน" } });
  userIds.push(owner.id, staff.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"] } });
  const mStaff = await prisma.membership.create({
    data: { userId: staff.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } },
  });
  const unit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${stamp}`, status: "ACTIVE" } });
  const accSys = await sysMod.createSystem(tid, "ACCOUNT", "บัญชี " + tag);
  await sysMod.linkUnit(tid, accSys.id, unit.id);
  const sys = accSys.id;
  await glMod.ensureAccounting({ tenantId: tid, systemId: sys });
  const ctx = { tenantId: tid, systemId: sys };

  // ร้าน B (tenant isolation)
  const tag2 = `qc-inbox2-${stamp}`;
  const t2 = await prisma.tenant.create({ data: { name: tag2, slug: tag2 } });
  sTenantId2 = t2.id;
  const owner2 = await prisma.user.create({ data: { email: `${tag2}-owner@qc.local`, name: "QC เจ้าของ B" } });
  userIds.push(owner2.id);
  await prisma.membership.create({ data: { userId: owner2.id, tenantId: t2.id, role: "OWNER", unitAccess: ["*"] } });
  const unit2 = await prisma.businessUnit.create({ data: { tenantId: t2.id, type: "BOOKING", name: "สาขา B", slug: `u2-${stamp}`, status: "ACTIVE" } });
  const accSys2 = await sysMod.createSystem(t2.id, "ACCOUNT", "บัญชี " + tag2);
  await sysMod.linkUnit(t2.id, accSys2.id, unit2.id);
  const sys2 = accSys2.id;
  await glMod.ensureAccounting({ tenantId: t2.id, systemId: sys2 });

  const mkFile = async (fileName: string, mimeType = "image/jpeg", source: "UPLOAD" | "CHAT" | "APP" = "UPLOAD") => {
    const r = await att.createAttachment({
      tenantId: tid, systemId: sys, fileName, fileUrl: `https://cdn.example.com/qc/${encodeURIComponent(fileName)}`,
      mimeType, sizeBytes: 12_345, uploadedById: owner.id, source, docTypeHint: "EXPENSE_ANY",
    });
    if (!r.ok) throw new Error(`สร้างไฟล์ทดสอบไม่สำเร็จ: ${r.reason}`);
    return r.id;
  };
  const usageCount = () => prisma.aiCreditTxn.count({ where: { tenantId: tid, kind: "USAGE", source: "ACCOUNT_INBOX" } });

  // ═════════ T6 — readBill (mock) ═════════
  console.log("\nT6 อ่านบิลด้วย AI (provider ปลอม):");
  const f1 = await mkFile("bill-ptt-real.jpg");
  const p1 = new CannedProvider([PTT_JSON]);
  const r1 = await inboxAi.readBill(ctx, f1, { provider: p1 });
  eq("T6.1 สถานะ = DONE", r1.status, "DONE");
  eq("T6.2 ค่าที่อ่านได้ = เฉลย ปตท.", [r1.extract?.vendorName, r1.extract?.totalSatang, r1.extract?.vatSatang], [I.ptt.vendorName, I.ptt.totalSatang, I.ptt.vatSatang]);
  eq("T6.3 เรียกโมเดล 1 ครั้ง", p1.calls, 1);
  eq("T6.4 ส่ง URL รูปเข้าโมเดลจริง (vision)", p1.lastImages.length, 1);
  const row1 = await prisma.accountAttachment.findFirst({ where: { id: f1 }, select: { aiStatus: true, aiExtract: true, aiModel: true, aiReadAt: true, aiCostSatang: true } });
  eq("T6.5 เก็บสถานะ/โมเดลลง DB", [row1?.aiStatus, row1?.aiModel], ["DONE", "mock/vision-1"]);
  assert("T6.6 เก็บเวลาที่อ่าน", !!row1?.aiReadAt);
  assert("T6.7 เก็บค่าใช้จ่ายเป็นสตางค์จำนวนเต็ม > 0", Number.isInteger(row1?.aiCostSatang) && (row1?.aiCostSatang ?? 0) > 0, `ได้ ${row1?.aiCostSatang}`);
  eq("T6.8 ยอดใน DB = ยอดบิล", (row1?.aiExtract as { totalSatang?: number } | null)?.totalSatang, I.ptt.totalSatang);

  // ═════════ T7/T8 — เครดิต + idempotent ═════════
  console.log("\nT7 หักเครดิต + T8 อ่านซ้ำ:");
  eq("T7.1 หักเครดิต 1 รายการต่อการอ่าน 1 ครั้ง", await usageCount(), 1);
  const txn1 = await prisma.aiCreditTxn.findFirst({ where: { tenantId: tid, source: "ACCOUNT_INBOX" }, orderBy: { createdAt: "desc" } });
  assert("T7.2 รายการหักเงินติดป้ายต้นทาง ACCOUNT_INBOX + ยอดติดลบ", txn1?.source === "ACCOUNT_INBOX" && (txn1?.amountMicro ?? 0) < 0);
  const r1b = await inboxAi.readBill(ctx, f1, { provider: p1 });
  eq("T8.1 อ่านซ้ำ = คืนของเดิม (cached)", [r1b.status, r1b.cached], ["DONE", true]);
  eq("T8.2 ไม่เรียกโมเดลซ้ำ", p1.calls, 1);
  eq("T8.3 ไม่หักเงินซ้ำ", await usageCount(), 1);
  const r1c = await inboxAi.readBill(ctx, f1, { provider: p1, force: true });
  eq("T8.4 force = อ่านใหม่จริง", [r1c.status, r1c.cached, p1.calls], ["DONE", false, 2]);
  eq("T8.5 force = หักเงินเพิ่ม 1 รายการ", await usageCount(), 2);

  // ═════════ T9 — ซ่อม JSON 1 ครั้ง ═════════
  console.log("\nT9 โมเดลตอบไม่เป็น JSON → ขอซ่อม 1 ครั้ง:");
  const f2 = await mkFile("bill-repair.jpg");
  const p2 = new CannedProvider(["ได้เลยครับ นี่คือข้อมูลจากบิล...", PTT_JSON]);
  const before9 = await usageCount();
  const r2 = await inboxAi.readBill(ctx, f2, { provider: p2 });
  eq("T9.1 สุดท้ายอ่านได้ (DONE)", r2.status, "DONE");
  eq("T9.2 เรียกโมเดล 2 ครั้ง (ต้นฉบับ + ซ่อม)", p2.calls, 2);
  eq("T9.3 แต่หักเงินครั้งเดียว", (await usageCount()) - before9, 1);

  // ═════════ T10 — อ่านไม่ออก / ชนิดไฟล์ไม่รองรับ ═════════
  console.log("\nT10 อ่านไม่ออก / PDF:");
  const f3 = await mkFile("blurry.jpg");
  const p3 = new CannedProvider(["ขอโทษครับ รูปเบลอมาก", "ยังอ่านไม่ออกครับ"]);
  const before10 = await usageCount();
  const r3 = await inboxAi.readBill(ctx, f3, { provider: p3 });
  eq("T10.1 สถานะ = FAILED (ไม่ throw)", r3.status, "FAILED");
  assert("T10.2 เหตุผลเป็นภาษาไทย บอกทางออก", !!r3.reason && /กรอกเอง|ถ่ายรูป/.test(r3.reason), `ได้ ${r3.reason}`);
  eq("T10.3 ยังหักเงินตามจริง (โมเดลตอบแล้ว)", (await usageCount()) - before10, 1);
  const f4 = await mkFile("scan0091.pdf", "application/pdf");
  const p4 = new CannedProvider([PTT_JSON]);
  const before10b = await usageCount();
  const r4 = await inboxAi.readBill(ctx, f4, { provider: p4 });
  eq("T10.4 PDF = UNSUPPORTED", r4.status, "UNSUPPORTED");
  eq("T10.5 ไม่แตะ provider เลย", p4.calls, 0);
  eq("T10.6 ไม่หักเงิน", (await usageCount()) - before10b, 0);
  assert("T10.7 เหตุผลบอกว่ายังอ่าน PDF ไม่ได้", !!r4.reason?.includes("PDF"), `ได้ ${r4.reason}`);

  // ═════════ T11 — ปิด AI / เครดิตหมด ═════════
  console.log("\nT11 ปิดผู้ช่วย AI / เครดิตหมด:");
  const f5 = await mkFile("no-ai.jpg");
  const keyBackup = process.env.SHARK_AI_KEY;
  const mockBackup = process.env.SHARK_AI_MOCK;
  delete process.env.SHARK_AI_KEY;
  delete process.env.SHARK_AI_MOCK;
  const r5 = await inboxAi.readBill(ctx, f5);
  eq("T11.1 ไม่มี provider = SKIPPED (ไม่ throw)", r5.status, "SKIPPED");
  assert("T11.2 บอกเหตุเป็นภาษาคน", !!r5.reason?.includes("ผู้ช่วย AI"), `ได้ ${r5.reason}`);
  const row5 = await prisma.accountAttachment.findFirst({ where: { id: f5 }, select: { aiStatus: true } });
  eq("T11.3 ไม่ไปแตะสถานะของไฟล์", row5?.aiStatus, null);
  if (keyBackup !== undefined) process.env.SHARK_AI_KEY = keyBackup;
  if (mockBackup !== undefined) process.env.SHARK_AI_MOCK = mockBackup;

  await prisma.aiCreditWallet.update({ where: { tenantId: tid }, data: { balanceMicro: 0 } });
  const beforeBudget = await usageCount();
  const p5 = new CannedProvider([PTT_JSON]);
  const r6 = await inboxAi.readBill(ctx, f5, { provider: p5 });
  eq("T11.4 เครดิตหมด = SKIPPED", r6.status, "SKIPPED");
  assert("T11.5 บอกให้เติมเครดิต", !!r6.reason?.includes("เครดิต"), `ได้ ${r6.reason}`);
  eq("T11.6 ไม่เรียกโมเดล/ไม่หักเงิน", [p5.calls, (await usageCount()) - beforeBudget], [0, 0]);
  await prisma.aiCreditWallet.update({ where: { tenantId: tid }, data: { balanceMicro: 10_000_000 } });

  // ═════════ T12 — อ่านทีละชุด ═════════
  console.log("\nT12 อ่านด้วย AI ทั้งหมด (readPendingInbox):");
  const f6 = await mkFile("batch-1.jpg");
  const f7 = await mkFile("batch-2.jpg");
  const p6 = new CannedProvider([PTT_JSON]);
  const batch = await inboxAi.readPendingInbox(ctx, { provider: p6 });
  assert("T12.1 อ่านไฟล์ที่ยังไม่เคยอ่านได้ทั้งชุด", batch.done >= 2, JSON.stringify(batch));
  eq("T12.2 ไม่อ่านซ้ำไฟล์ที่อ่านไปแล้ว", (await inboxAi.readPendingInbox(ctx, { provider: p6 })).scanned, 0);
  assert("T12.3 เพดานต่อครั้ง = 10 ใบ", inboxAi.INBOX_AI_BATCH_MAX === 10);
  const rows67 = await prisma.accountAttachment.findMany({ where: { id: { in: [f6, f7] } }, select: { aiStatus: true } });
  assert("T12.4 ทั้ง 2 ไฟล์เป็น DONE", rows67.every((r) => r.aiStatus === "DONE"));

  // ═════════ T13 — สร้างบันทึกค่าใช้จ่ายจากบิล ═════════
  console.log("\nT13 สร้างบันทึกค่าใช้จ่ายจากบิล:");
  const created = await inbox.createExpenseFromAttachment(ctx, f1, undefined, owner.id);
  assert("T13.1 สร้างสำเร็จ", created.ok, JSON.stringify(created));
  if (!created.ok) throw new Error("สร้างเอกสารจากบิลไม่สำเร็จ: " + created.reason);
  const doc = await prisma.accountDocument.findFirstOrThrow({
    where: { id: created.docId },
    include: { lines: true, contact: { select: { name: true, kind: true, taxId: true } } },
  });
  eq("T13.2 ชนิด/สถานะ = บันทึกค่าใช้จ่าย ฉบับร่าง", [doc.docType, doc.status], ["EXPENSE", "DRAFT"]);
  eq("T13.3 ยอดรวมเอกสาร = ยอดบิลเป๊ะ", doc.grandTotal, I.ptt.totalSatang);
  eq("T13.4 VAT ในเอกสาร = VAT บนบิล", doc.vatAmount, I.ptt.vatSatang);
  eq("T13.5 ยอดก่อน VAT = เฉลย", doc.subTotal, I.ptt.subtotalSatang);
  eq("T13.6 ใบกำกับภาษี → ขอคืนภาษีซื้อได้ (INCLUDE + ON_ISSUE)", [doc.vatMode, doc.vatTiming], ["INCLUDE", "ON_ISSUE"]);
  eq("T13.7 ที่มาของเอกสาร = กล่องขาเข้า", doc.source, "INBOX");
  eq("T13.8 บรรทัดมาจากบิล", [doc.lines.length, doc.lines[0]?.description], [1, "น้ำมันดีเซล B7"]);
  eq("T13.9 ผู้ขายถูกสร้างเป็นผู้ติดต่อชนิดผู้ขาย", [doc.contact?.name, doc.contact?.kind, doc.contact?.taxId], [I.ptt.vendorName, "VENDOR", I.ptt.vendorTaxId]);
  eq("T13.10 เอกสารอ้างกลับไปที่ไฟล์", [doc.refType, doc.refId], ["AccountAttachment", f1]);
  const attAfter = await prisma.accountAttachment.findFirst({ where: { id: f1 }, select: { status: true, documentId: true, expenseDocId: true, docTypeHint: true } });
  eq("T13.11 ไฟล์ผูกกับเอกสารแล้ว", [attAfter?.status, attAfter?.documentId, attAfter?.expenseDocId], ["LINKED", created.docId, created.docId]);
  eq("T13.12 ผู้ติดต่อใหม่ (ยังไม่เคยมีผู้ขายรายนี้)", created.contactCreated, true);
  const auditRow = await prisma.auditLog.findFirst({ where: { tenantId: tid, targetId: created.docId }, select: { action: true } });
  assert("T13.13 มี audit ของการสร้าง", !!auditRow, "ไม่พบ AuditLog");
  eq("T13.14 หน้ากล่องขาเข้านับเอกสารเดือนนี้เพิ่ม 1", (await inbox.inboxStats(ctx)).docsThisMonth, 1);

  // ═════════ T14 — กันสร้างซ้ำ + ข้อมูลไม่พอ + overrides ═════════
  console.log("\nT14 กันสร้างซ้ำ / ข้อมูลไม่พอ / ผู้ใช้แก้ค่า:");
  await rejected("T14.1 สร้างซ้ำจากไฟล์เดิมไม่ได้", () => inbox.createExpenseFromAttachment(ctx, f1), "ผูกกับเอกสารอยู่แล้ว");
  const fEmpty = await mkFile("unknown-bill.jpg");
  await rejected("T14.2 ไม่รู้ยอดเงิน = ปฏิเสธ", () => inbox.createExpenseFromAttachment(ctx, fEmpty), "ยอดรวม");
  await rejected("T14.3 ไม่รู้ชื่อผู้ขาย = ปฏิเสธ", () => inbox.createExpenseFromAttachment(ctx, fEmpty, { totalSatang: 50_000 }), "ชื่อผู้ขาย");
  const overridden = await inbox.createExpenseFromAttachment(
    ctx, fEmpty,
    { vendorName: "ร้านที่ผู้ใช้พิมพ์เอง", totalSatang: 53_500, vatSatang: 3_500, vatRateBp: 700, docKind: "TAX_INVOICE", issueDate: "2026-09-01" },
    owner.id,
  );
  assert("T14.4 กรอกเองแล้วสร้างได้", overridden.ok, JSON.stringify(overridden));
  if (overridden.ok) {
    const d2 = await prisma.accountDocument.findFirstOrThrow({ where: { id: overridden.docId }, include: { lines: true, contact: { select: { name: true } } } });
    eq("T14.5 ยอด/ผู้ขาย = ค่าที่ผู้ใช้กรอก", [d2.grandTotal, d2.contact?.name], [53_500, "ร้านที่ผู้ใช้พิมพ์เอง"]);
    eq("T14.6 ไม่มีรายการจากบิล → บรรทัดเดียว 'ค่าใช้จ่ายตามบิล'", [d2.lines.length, d2.lines[0]?.description], [1, "ค่าใช้จ่ายตามบิล"]);
    eq("T14.7 วันที่เอกสาร = วันบนบิลที่ผู้ใช้ยืนยัน", d2.issueDate.toISOString().slice(0, 10), "2026-09-01");
  }

  // ═════════ T15 — จับคู่ผู้ขาย ═════════
  console.log("\nT15 จับคู่ผู้ขายเดิม:");
  const f8 = await mkFile("ptt-again.jpg");
  await inboxAi.readBill(ctx, f8, { provider: new CannedProvider([PTT_JSON]) });
  const again = await inbox.createExpenseFromAttachment(ctx, f8, undefined, owner.id);
  assert("T15.1 สร้างใบที่สองของผู้ขายเดิมได้", again.ok, JSON.stringify(again));
  if (again.ok) {
    eq("T15.2 ใช้ผู้ติดต่อเดิม (จับด้วยเลขภาษี)", [again.contactId, again.contactCreated], [created.contactId, false]);
  }
  const byNameOnly = await inbox.findOrCreateVendorContact(ctx, { name: I.ptt.vendorName });
  eq("T15.3 ชื่อตรงกับผู้ขายเดิม = ไม่สร้างซ้ำ", [byNameOnly.id, byNameOnly.created], [created.contactId, false]);
  const brandNew = await inbox.findOrCreateVendorContact(ctx, { name: "ร้านใหม่เอี่ยม จำกัด", taxId: "0105561000111" });
  eq("T15.4 ผู้ขายรายใหม่ = สร้างใหม่", brandNew.created, true);
  const vendorCount = await prisma.accountContact.count({ where: { systemId: sys, kind: "VENDOR" } });
  eq("T15.5 มีผู้ขายทั้งหมด 3 ราย (ปตท. · ที่ผู้ใช้พิมพ์ · รายใหม่)", vendorCount, 3);

  // ═════════ T16 — โหมด VAT ตามชนิดเอกสาร ═════════
  console.log("\nT16 โหมด VAT ตามชนิดเอกสาร (§9.3):");
  const RECEIPT_JSON = billJson({
    vendorName: "ร้านอาหารทะเลสด", totalSatang: 89_000, subtotalSatang: 89_000, vatSatang: 0, vatRateBp: 0,
    issueDate: "2026-09-02", docKind: "RECEIPT", confidence: 0.8, lineItems: [],
  });
  const f9 = await mkFile("receipt-seafood.jpg");
  await inboxAi.readBill(ctx, f9, { provider: new CannedProvider([RECEIPT_JSON]) });
  const receiptDoc = await inbox.createExpenseFromAttachment(ctx, f9, undefined, owner.id);
  assert("T16.1 สร้างจากใบเสร็จได้", receiptDoc.ok, JSON.stringify(receiptDoc));
  if (receiptDoc.ok) {
    const d3 = await prisma.accountDocument.findFirstOrThrow({ where: { id: receiptDoc.docId } });
    eq("T16.2 ใบเสร็จ = ไม่มี VAT (ขอคืนไม่ได้)", [d3.vatMode, d3.vatAmount], ["NONE", 0]);
    eq("T16.3 ยอดรวม = ยอดบิล", d3.grandTotal, 89_000);
  }
  eq("T16.4 ใบแจ้งหนี้ = รอใบกำกับ", inbox.vatPurchaseModeFor("INVOICE", true), "AWAITING");
  eq("T16.5 ใบกำกับภาษี = ขอคืนได้", inbox.vatPurchaseModeFor("TAX_INVOICE", true), "CLAIM");
  eq("T16.6 สลิปโอน = ขอคืนไม่ได้", inbox.vatPurchaseModeFor("SLIP", true), "NO_CLAIM");
  eq("T16.7 ไม่มี VAT บนบิล = ขอคืนไม่ได้เสมอ", inbox.vatPurchaseModeFor("TAX_INVOICE", false), "NO_CLAIM");

  // ═════════ T17 — แนบกับเอกสารที่มี / ไม่ใช่เอกสารบัญชี ═════════
  console.log("\nT17 ปุ่มอีก 2 ปุ่มบนการ์ด:");
  const f10 = await mkFile("attach-me.jpg");
  const linkRes = await att.linkAttachment(tid, sys, f10, created.docId, owner.id);
  assert("T17.1 แนบกับเอกสารที่มีอยู่ได้", linkRes.ok, JSON.stringify(linkRes));
  const f10row = await prisma.accountAttachment.findFirst({ where: { id: f10 }, select: { status: true, documentId: true, expenseDocId: true } });
  eq("T17.2 สถานะ LINKED · ไม่ตั้ง expenseDocId (ไม่ได้สร้างจากกล่องขาเข้า)", [f10row?.status, f10row?.documentId, f10row?.expenseDocId], ["LINKED", created.docId, null]);
  const f11 = await mkFile("not-accounting.jpg");
  const naRes = await att.markNotAccounting(tid, sys, f11, owner.id);
  assert("T17.3 ทำเครื่องหมาย 'ไม่ใช่เอกสารบัญชี' ได้", naRes.ok, JSON.stringify(naRes));
  const unlinkedNow = await att.listAttachmentsPaged(tid, sys, { tab: "unlinked", pageSize: 100 });
  assert("T17.4 ไฟล์นั้นหายจากกล่องขาเข้า", !unlinkedNow.rows.some((r) => r.id === f11));

  // ═════════ T18 — consumer แชท ═════════
  console.log("\nT18 รับบิลจากห้องแชทผ่าน outbox:");
  assert("T18.1 มี consumer ของ chat.message.received ในทะเบียน", typeof consumers["chat.message.received"] === "function");
  const chatSys = await sysMod.createSystem(tid, "CHAT", "แชท " + tag);
  const chatContact = await prisma.chatContact.create({
    data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", externalUserId: `U${stamp}`, displayName: "คุณเพชร (ลูกค้า)" },
  });
  const conv = await prisma.chatConversation.create({
    data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", contactId: chatContact.id, status: "OPEN" },
  });
  const chatMsg = await prisma.chatMessage.create({
    data: { tenantId: tid, systemId: chatSys.id, conversationId: conv.id, direction: "IN", type: "IMAGE", body: null },
  });
  const chatAtt = await prisma.chatAttachment.create({
    data: {
      tenantId: tid, systemId: chatSys.id, messageId: chatMsg.id, kind: "IMAGE",
      storageKey: `qc/${stamp}.jpg`, url: `https://cdn.example.com/chat/${stamp}.jpg`,
      fileName: "บิลจากไลน์.jpg", mimeType: "image/jpeg", sizeBytes: 45_678,
    },
  });
  const evt = { id: `evt-${stamp}`, tenantId: tid, type: "chat.message.received", payload: { conversationId: conv.id, channel: "LINE" } };
  const runConsumer = async () => consumers["chat.message.received"]!(evt as never);

  await runConsumer();
  const noOptIn = await prisma.accountAttachment.count({ where: { systemId: sys, source: "CHAT" } });
  eq("T18.2 ร้านที่ยังไม่เปิด inboxFromChat = ไม่ดูดไฟล์เข้ามา", noOptIn, 0);

  await prisma.accountSystemLink.create({
    data: { tenantId: tid, systemId: sys, linkedKind: "POS", linkedId: chatSys.id, config: { inboxFromChat: true } },
  });
  await runConsumer();
  const fromChat = await prisma.accountAttachment.findMany({ where: { systemId: sys, source: "CHAT" }, select: { id: true, fileName: true, senderLabel: true, sourceRef: true, status: true, docTypeHint: true } });
  eq("T18.3 เปิดแล้ว: ได้ไฟล์เข้ากล่อง 1 ไฟล์", fromChat.length, 1);
  eq("T18.4 ชื่อไฟล์/ผู้ส่ง/สถานะถูกต้อง", [fromChat[0]?.fileName, fromChat[0]?.senderLabel, fromChat[0]?.status], ["บิลจากไลน์.jpg", "คุณเพชร (ลูกค้า)", "UNLINKED"]);
  eq("T18.5 sourceRef ผูกกับข้อความ+ไฟล์ต้นทาง", fromChat[0]?.sourceRef, `chat:${chatMsg.id}#${chatAtt.id}`);
  await runConsumer();
  await runConsumer();
  eq("T18.6 ยิงซ้ำ (replay) ไม่เกิดไฟล์ซ้ำ", await prisma.accountAttachment.count({ where: { systemId: sys, source: "CHAT" } }), 1);
  // ข้อความตัวอักษรล้วนในห้องใหม่ = ไม่มีไฟล์เข้ากล่อง
  // 🔴 มี partial unique `chat_conv_active` (1 ห้องที่ยังไม่ปิดต่อ 1 ผู้ติดต่อ) → ต้องใช้ผู้ติดต่อคนใหม่
  const chatContact2 = await prisma.chatContact.create({
    data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", externalUserId: `U${stamp}b`, displayName: "คุณสมชาย (ลูกค้า)" },
  });
  const conv2 = await prisma.chatConversation.create({
    data: { tenantId: tid, systemId: chatSys.id, channel: "LINE", contactId: chatContact2.id, status: "OPEN" },
  });
  await prisma.chatMessage.create({
    data: { tenantId: tid, systemId: chatSys.id, conversationId: conv2.id, direction: "IN", type: "TEXT", body: "สวัสดีครับ" },
  });
  await consumers["chat.message.received"]!({ ...evt, payload: { conversationId: conv2.id, channel: "LINE" } } as never);
  eq("T18.7 ข้อความตัวอักษรล้วน = ไม่เกิดไฟล์", await prisma.accountAttachment.count({ where: { systemId: sys, source: "CHAT" } }), 1);
  // ไฟล์ที่ดูดเข้ามาต้องอ่านด้วย AI ได้เหมือนไฟล์อื่น
  const chatFileId = fromChat[0]!.id;
  const rChat = await inboxAi.readBill(ctx, chatFileId, { provider: new CannedProvider([PTT_JSON]) });
  eq("T18.8 ไฟล์จากแชทให้ AI อ่านได้", rChat.status, "DONE");

  // ═════════ T19 — สิทธิ์ + ข้ามร้าน ═════════
  console.log("\nT19 ด่านสิทธิ์ + ข้ามร้าน:");
  const staffAuth = {
    user: { id: staff.id },
    active: { ...mStaff, tenant: { id: tid } },
    memberships: [mStaff],
  } as unknown as Parameters<typeof assertAccountCan>[0];
  await rejected("T19.1 พนักงานที่ไม่มีสิทธิ์จัดการเอกสารแนบ = ถูกปฏิเสธ", async () => {
    assertAccountCan(staffAuth, "account.document.manage");
    return { ok: true };
  });
  const crossCtx = { tenantId: t2.id, systemId: sys2 };
  const crossRead = await inboxAi.readBill(crossCtx, f6);
  eq("T19.2 อ่านไฟล์ของร้านอื่นไม่ได้", [crossRead.status, crossRead.reason], ["FAILED", "ไม่พบไฟล์"]);
  await rejected("T19.3 สร้างเอกสารจากไฟล์ของร้านอื่นไม่ได้", () => inbox.createExpenseFromAttachment(crossCtx, f6), "ไม่พบไฟล์");
  const f6Row = await prisma.accountAttachment.findFirst({ where: { id: f6 }, select: { tenantId: true, systemId: true, documentId: true } });
  eq("T19.4 ไฟล์จริงไม่ถูกแตะเลย", [f6Row?.tenantId, f6Row?.systemId, f6Row?.documentId], [tid, sys, null]);
  eq("T19.5 ร้าน B ไม่มีเอกสาร/ไฟล์เกิดขึ้น", [
    await prisma.accountDocument.count({ where: { systemId: sys2 } }),
    await prisma.accountAttachment.count({ where: { systemId: sys2 } }),
  ], [0, 0]);
  const crossList = await att.listAttachmentsPaged(t2.id, sys2, { tab: "unlinked", pageSize: 50 });
  eq("T19.6 รายการกล่องขาเข้าของร้าน B ว่างเปล่า", crossList.rows.length, 0);
  eq("T19.7 อีเมลกล่องขาเข้าแยกต่อร้าน", inbox.inboxEmailAddress(tag) === inbox.inboxEmailAddress(tag2), false);
} finally {
  // ─────────── ลบร้านทดสอบ ───────────
  async function cleanupTenant(id: string | null) {
    if (!id) return;
    const d = async (fn: () => Promise<unknown>) => {
      try { await fn(); } catch { /* best-effort */ }
    };
    await d(() => prisma.chatAttachment.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.chatMessage.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.chatConversation.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.chatContact.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountAttachment.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountJournalEntry.updateMany({ where: { tenantId: id }, data: { reversalOfId: null } }));
    await d(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountDocument.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.accountContact.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.aiCreditTxn.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.aiCreditWallet.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: id } }));
    for (const m of [
      "accountFinanceOpening", "accountFinanceTransfer", "accountFinance",
      "accountLedger", "accountPeriod", "accountDocSequence", "accountSettings", "accountSystemLink",
      "appNotification", "outboxEvent", "appSystemUnit", "appSystem", "businessUnit", "membership",
    ]) {
      await d(() => (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    }
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await cleanupTenant(sTenantId);
  await cleanupTenant(sTenantId2);
  if (userIds.length) {
    try { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); } catch { /* best-effort */ }
  }
  console.log(`\n🧹 ลบร้านทดสอบแล้ว`);
}

console.log(`\n===== QC WO 7.2 · กล่องขาเข้า + AI อ่านบิล สรุป =====`);
console.log(`ผ่าน ${passed} · ตก ${findings.length} (รวม ${passed + findings.length} ข้อ)`);
if (findings.length) {
  console.log("\nพบปัญหา:");
  for (const f of findings) console.log("  - " + f);
}
console.log(`\nJSON_SUMMARY ${JSON.stringify({ total: passed + findings.length, passed, findings })}`);
await prisma.$disconnect();
process.exit(findings.length > 0 ? 1 : 0);
