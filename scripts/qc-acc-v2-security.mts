// QC WO 9.2 — audit ความปลอดภัยโมดูลบัญชี V2 (BLUEPRINT §3 แถว 9.2)
//
// รัน:  export DATABASE_URL=$(grep -m1 '^DATABASE_URL=' .env.qc | cut -d= -f2-)
//       export DIRECT_URL=$(grep -m1 '^DIRECT_URL=' .env.qc | cut -d= -f2-)
//       pnpm exec tsx scripts/qc-acc-v2-security.mts
//   (หรือ QC_ENV_FILE=.env.qc — ด่านใน qc-env-guard.mts จะตายเองถ้าเผลอชี้ prod)
//
// 🔴 ชุดนี้ **สร้าง 2 ร้านทิ้ง** (ร้านเหยื่อ A + ร้านผู้บุกรุก B) แล้วลบทั้งคู่เมื่อจบ
//    ทุก query ผูก tenantId ของตัวเอง — ไม่แตะข้อมูลร้านอื่นเลย
//
// ครอบคลุมตามใบสั่งงาน 9.2 (A–D):
//   S1  ด่านสิทธิ์: ทุก `*Action` มีด่าน (หรือ delegate ไปตัวที่มี) — ระดับ page อยู่ที่ qc-acc-v2-guard G1
//   S2  IDOR: เรียกฟังก์ชันบริการด้วย id ของ "ร้าน B" และ "ระบบที่ 2 ในร้าน A" → ต้องไม่เห็น/ไม่เขียน
//   S3  บทบาท: STAFF ไม่มีสิทธิ์ → ถูกปฏิเสธทุกการกระทำที่แตะเงิน/ตั้งค่า
//   S4  ลิงก์สาธารณะ: เอนโทรปี token · หมดอายุ · ปิดสวิตช์ · ไม่รั่วข้อมูลลูกค้า · token มั่วตอบเหมือนกัน · rate limit
//   S5  webhook: HMAC บน raw body · กันยิงซ้ำ · 200 เมื่อข้อมูลเพี้ยน · ไม่ log ข้อมูลดิบ
//   S6  เงิน: ทุกทางเป็นสตางค์จำนวนเต็ม (ทดสอบ "1,234.56" และ "1e3")
//   S7  CSV injection: ทุกตัวส่งออกกันสูตร + ชื่อไฟล์ใน header ไม่รับค่าดิบ
//   S8  อัปโหลด: ตรวจไบต์จริง · เพดานขนาด · ชื่อไฟล์ · key ไม่ user-controlled
//   S9  คำค้น/SQL: จำกัดความยาว · ไม่มี string interpolation ใน raw SQL · ORDER BY จาก allowlist
//   S10 XSS: dangerouslySetInnerHTML ในขอบเขตบัญชี = เฉพาะไอคอนคงที่
//   S11 rate limit: ตัวจำกัดทำงานจริง + ถูกต่อไว้ที่จุดที่ต้องมี
//   S12 แข่งกันรับชำระ (Promise.all) — ห้ามจ่ายเกิน
//   S13 แข่งกันออกเลขที่ (เอกสาร/ผู้ติดต่อ/สินค้า) + P2002 ที่ไม่ใช่ code ต้องเด้งทันที
//   S14 กดออก/อนุมัติ/ยกเลิกรัว = idempotent
//   S15 ล็อกงวด/ล็อกก่อนวันที่ ที่คอขวด GL ทุกเส้นทาง
//   S16 audit trail ครบทุก action ที่ต้องมี
//   S17 สุขอนามัย: token ผี · any · console · ความลับในรีโป
//
// ⏰ ห้ามผูกเฉลยกับ "วันที่ N ของเดือน" — ทุกวันที่ในชุดนี้คำนวณสัมพัทธ์จาก now เสมอ

import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-security");

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";

const { prisma } = await import("@/lib/core/db");
const system = await import("@/lib/modules/system/service");
const acc = await import("@/lib/modules/account/service");
const contactsList = await import("@/lib/modules/account/contacts-list");
const contactMerge = await import("@/lib/modules/account/contact-merge");
const product = await import("@/lib/modules/account/product");
const finance = await import("@/lib/modules/account/finance");
const attach = await import("@/lib/modules/account/attachment");
const attachShared = await import("@/lib/modules/account/attachment-shared");
const payReq = await import("@/lib/modules/account/payment-request");
const docSettings = await import("@/lib/modules/account/doc-settings");
const policy = await import("@/lib/modules/account/policy");
const journalV2 = await import("@/lib/modules/account/journal-v2");
const docDetail = await import("@/lib/modules/account/doc-detail");
const expense = await import("@/lib/modules/account/expense");
const gl = await import("@/lib/modules/account/gl");
const wht = await import("@/lib/modules/account/wht");
const reports = await import("@/lib/modules/account/reports");
const importShared = await import("@/lib/modules/account/import-shared");
const coreCsv = await import("@/lib/core/csv");
const rateLimit = await import("@/lib/modules/account/rate-limit");
const rateLimitDb = await import("@/lib/core/rate-limit-db");
const { assertAccountCan } = await import("@/lib/modules/account/access");
const { clampSearch, MAX_SEARCH_LEN } = await import("@/lib/modules/account/search-input");

// ─────────────────── harness (แบบเดียวกับ qc-acc-v2-guard.mts) ───────────────────
let passed = 0;
const findings: string[] = [];
function ok(name: string) {
  passed++;
  console.log("  ✅ " + name);
}
function bad(name: string, detail: string) {
  findings.push(name + " — " + detail);
  console.log("  ❌ " + name + " — " + detail);
}
function assert(name: string, cond: boolean, detail = "") {
  if (cond) ok(name);
  else bad(name, detail);
}
function eq(name: string, actual: unknown, expected: unknown) {
  assert(name, actual === expected, `ได้ ${JSON.stringify(actual)} · ควรได้ ${JSON.stringify(expected)}`);
}
/** เรียกแล้วต้อง "ไม่สำเร็จ" — รับได้ทั้งโยน error, คืน {ok:false}, คืน null/undefined, คืน [] */
async function refuses(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    const r = await fn();
    if (r === null || r === undefined) return ok(name + " (คืน null)");
    if (Array.isArray(r)) return assert(name + " (คืนลิสต์ว่าง)", r.length === 0, `ได้ ${r.length} แถว`);
    if (typeof r === "object" && "ok" in (r as object)) {
      const res = r as { ok: boolean; reason?: string };
      return assert(name + " (ok:false)", res.ok === false, `ได้ ok:true — ${JSON.stringify(r).slice(0, 120)}`);
    }
    if (typeof r === "number") return assert(name + " (นับได้ 0)", r === 0, `ได้ ${r}`);
    bad(name, `ไม่ปฏิเสธ — คืน ${JSON.stringify(r).slice(0, 160)}`);
  } catch {
    ok(name + " (โยน error)");
  }
}

const ROOT = process.cwd();
const ROUTE_DIR = join(ROOT, "src/app/app/sys/[id]/account");
const MODULE_DIR = join(ROOT, "src/lib/modules/account");

console.log(`\n===== QC WO 9.2 · audit ความปลอดภัยบัญชี V2 =====\n`);

const tag = "QCSEC92-" + Date.now();
const tenantIds: string[] = [];
const userIds: string[] = [];

// ระเบียนที่สร้างไว้ให้ S2 ใช้ยิงข้ามร้าน/ข้ามระบบ
type Scope = { tenantId: string; systemId: string };
let A: Scope = { tenantId: "", systemId: "" }; // ร้านเหยื่อ · ระบบหลัก
let A2: Scope = { tenantId: "", systemId: "" }; // ร้านเหยื่อ · ระบบบัญชีตัวที่ 2
let B: Scope = { tenantId: "", systemId: "" }; // ร้านผู้บุกรุก

try {
  // ═══════════════════════════════════════════════════════════
  // S1 — ด่านสิทธิ์ระดับ server action (structural)
  // ═══════════════════════════════════════════════════════════
  console.log("S1 ด่านสิทธิ์ของ server action ทุกตัว:");
  const actionFiles = execFileSync(
    "bash",
    ["-lc", `find "${ROUTE_DIR}" "${MODULE_DIR}" -name '*actions*.ts' | sort`],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  assert("พบไฟล์ actions ครบทุกโฟลเดอร์ (≥ 20 ไฟล์)", actionFiles.length >= 20, `พบ ${actionFiles.length}`);

  const GUARD_RE = /assertAccountCan|loadAccountSystem|requireAccountPage|requireAccountCtx/;
  /** wrapper ที่ไม่มีด่านของตัวเอง แต่ delegate ไป action อื่นในไฟล์เดียวกันที่มีด่านครบ */
  const DELEGATING_WRAPPERS: Record<string, string> = {
    archiveFinanceFormAction: "archiveFinanceActionDirect",
    refundDepositFormAction: "refundDepositAction",
  };
  let actionCount = 0;
  const unguarded: string[] = [];
  for (const f of actionFiles) {
    const src = readFileSync(f, "utf8");
    // helper ท้องถิ่นที่มีด่านอยู่ข้างใน (เช่น `gate()` ของ permissions/connections-actions)
    const helpers: string[] = [];
    for (const m of src.matchAll(/^(?:async )?function (\w+)\s*\([\s\S]*?\n\}/gm))
      if (GUARD_RE.test(m[0])) helpers.push(m[1]!);
    for (const m of src.matchAll(/^const (\w+) = async[\s\S]*?\n\};/gm))
      if (GUARD_RE.test(m[0])) helpers.push(m[1]!);
    for (const m of src.matchAll(/^export async function (\w+)\(([\s\S]*?)\n\}/gm)) {
      const name = m[1]!;
      if (!name.endsWith("Action")) continue;
      actionCount++;
      const body = m[0];
      const direct = GUARD_RE.test(body);
      const viaHelper = helpers.some((h) => new RegExp(`\\b${h}\\(`).test(body));
      const delegate = DELEGATING_WRAPPERS[name];
      const viaDelegate = !!delegate && new RegExp(`\\b${delegate}\\(`).test(body);
      if (!direct && !viaHelper && !viaDelegate) unguarded.push(`${f.replace(ROOT + "/", "")}:${name}`);
    }
  }
  assert("นับ server action ได้ครบตามที่สำรวจไว้ (≥ 160 ตัว)", actionCount >= 160, `นับได้ ${actionCount}`);
  assert(
    "ทุก *Action มีด่านสิทธิ์ (ตรง / ผ่าน helper / delegate ไปตัวที่มีด่าน)",
    unguarded.length === 0,
    unguarded.join(" | "),
  );
  // ข้อยกเว้นต้องยังเป็น wrapper จริง ๆ (ถ้าวันหนึ่งมันเริ่มแตะ DB เอง = ต้องมาใส่ด่าน)
  for (const [wrapper, target] of Object.entries(DELEGATING_WRAPPERS)) {
    const hit = actionFiles.find((f) => readFileSync(f, "utf8").includes(`export async function ${wrapper}(`));
    if (!hit) {
      bad(`ข้อยกเว้น ${wrapper}`, "ไม่พบ action นี้แล้ว — ลบออกจากรายการข้อยกเว้นได้");
      continue;
    }
    const body =
      readFileSync(hit, "utf8").match(new RegExp(`^export async function ${wrapper}\\(([\\s\\S]*?)\\n\\}`, "m"))?.[0] ??
      "";
    assert(
      `ข้อยกเว้น ${wrapper} ยังเป็น wrapper บาง ๆ (delegate → ${target} · ไม่แตะ prisma เอง)`,
      body.includes(`${target}(`) && !body.includes("prisma."),
    );
  }

  // inline server action ที่เขียนอยู่ในตัว page.tsx ("use server" ในฟังก์ชัน) — ด่านต้องมีเหมือนกัน
  //   (S1 ข้างบนสแกนเฉพาะไฟล์ *actions*.ts · ของพวกนี้อยู่คนละที่ ถ้าไม่ตรวจจะหลุดทั้งกลุ่ม)
  const inlineFiles = execFileSync("bash", ["-lc", `grep -rl '"use server"' "${ROUTE_DIR}" --include=page.tsx | sort`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  assert("S1 พบหน้าที่มี server action เขียนในตัวหน้า (inline)", inlineFiles.length > 0, `พบ ${inlineFiles.length}`);
  let inlineCount = 0;
  const inlineUnguarded: string[] = [];
  for (const f of inlineFiles) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/^\s*async function (\w+)\(([\s\S]*?)\n\s{2}\}/gm)) {
      if (!m[0].includes('"use server"')) continue;
      inlineCount++;
      if (!GUARD_RE.test(m[0])) inlineUnguarded.push(`${f.replace(ROOT + "/", "")}:${m[1]}`);
    }
  }
  assert(`S1 ทุก inline server action (${inlineCount} ตัว) มีด่านสิทธิ์`, inlineUnguarded.length === 0, inlineUnguarded.join(" | "));

  // ═══════════════════════════════════════════════════════════
  // seed — 2 ร้าน + 3 ระบบ
  // ═══════════════════════════════════════════════════════════
  const mkTenant = async (suffix: string) => {
    const t = await prisma.tenant.create({ data: { name: `${tag}-${suffix}`, slug: `${tag}-${suffix}`.toLowerCase() } });
    tenantIds.push(t.id);
    return t.id;
  };
  const tenantA = await mkTenant("A");
  const tenantB = await mkTenant("B");
  const sysA = await system.createSystem(tenantA, "ACCOUNT", "บัญชี A " + tag);
  const sysA2 = await system.createSystem(tenantA, "ACCOUNT", "บัญชี A2 " + tag);
  const sysB = await system.createSystem(tenantB, "ACCOUNT", "บัญชี B " + tag);
  A = { tenantId: tenantA, systemId: sysA.id };
  A2 = { tenantId: tenantA, systemId: sysA2.id };
  B = { tenantId: tenantB, systemId: sysB.id };
  console.log(`\n[seed] A ${A.systemId} · A2 ${A2.systemId} · B ${B.systemId}\n`);

  const mkUser = async (kind: string) => {
    const u = await prisma.user.create({ data: { email: `${tag.toLowerCase()}-${kind}@qc.local`, name: `QC ${kind}` } });
    userIds.push(u.id);
    return u.id;
  };
  const ownerAId = await mkUser("ownerA");
  const staffAId = await mkUser("staffA");
  const staffPayId = await mkUser("staffPay");
  const mOwnerA = await prisma.membership.create({
    data: { userId: ownerAId, tenantId: tenantA, role: "OWNER", unitAccess: ["*"] },
    include: { tenant: true },
  });
  const mStaffA = await prisma.membership.create({
    data: { userId: staffAId, tenantId: tenantA, role: "STAFF", unitAccess: ["*"], permissions: {} },
    include: { tenant: true },
  });
  const mStaffPay = await prisma.membership.create({
    data: {
      userId: staffPayId,
      tenantId: tenantA,
      role: "STAFF",
      unitAccess: ["*"],
      permissions: { "account.payment.record": true },
    },
    include: { tenant: true },
  });

  // ข้อมูลของร้าน A (เหยื่อ)
  const finA = await finance.createFinanceAccount({
    tenantId: A.tenantId,
    systemId: A.systemId,
    type: "CASH",
    name: "เงินสด A",
    promptpayId: "0812345678",
  });
  if (!finA.ok) throw new Error("สร้างช่องทางการเงิน A ไม่สำเร็จ: " + finA.reason);
  const finA2 = await finance.createFinanceAccount({
    tenantId: A.tenantId,
    systemId: A.systemId,
    type: "BANK",
    name: "ธนาคาร A",
  });
  if (!finA2.ok) throw new Error("สร้างบัญชีธนาคาร A ไม่สำเร็จ: " + finA2.reason);
  const contactA = await acc.createContact({
    tenantId: A.tenantId,
    systemId: A.systemId,
    kind: "CUSTOMER",
    name: "บจก. ลูกค้าลับ (ห้ามรั่ว)",
    phone: "081-000-0001",
    email: "secret@qc.local",
  });
  const contactA2 = await acc.createContact({
    tenantId: A.tenantId,
    systemId: A.systemId,
    kind: "CUSTOMER",
    name: "บจก. ลูกค้าลับ (คู่รวม)",
    phone: "081-000-0003",
  });
  const xssContactIdForMerge = contactA2.id;
  const prodA = await product.createProduct(A.tenantId, A.systemId, { name: "สินค้า A", salePrice: 10_000 });
  if (!prodA.ok) throw new Error("สร้างสินค้า A ไม่สำเร็จ");

  const mkInvoiceA = async (amountSatang: number) => {
    const doc = await acc.createDocument({
      tenantId: A.tenantId,
      systemId: A.systemId,
      docType: "INVOICE",
      contactId: contactA.id,
      lines: [{ description: "บริการ QC", qty: 1, unitPrice: amountSatang, vatRateBp: 0 }],
      vatMode: "NONE",
      createdById: ownerAId,
    });
    const iss = await acc.issueDocument(A.tenantId, A.systemId, doc.id);
    if (!iss.ok) throw new Error("ออกใบแจ้งหนี้ไม่สำเร็จ: " + iss.reason);
    return doc.id;
  };
  const invA = await mkInvoiceA(100_000); // ฿1,000.00
  const attA = await attach.createAttachment({
    tenantId: A.tenantId,
    systemId: A.systemId,
    fileName: "บิลลับ.pdf",
    fileUrl: "https://cdn.example/qc/a.pdf",
    mimeType: "application/pdf",
  });
  if (!attA.ok) throw new Error("สร้างไฟล์แนบ A ไม่สำเร็จ");

  // ═══════════════════════════════════════════════════════════
  // S2 — IDOR (ข้ามร้าน + ข้ามระบบในร้านเดียวกัน)
  // ═══════════════════════════════════════════════════════════
  console.log("\nS2 IDOR — เรียกด้วย id ของร้าน A จากสโคป B และสโคป A2:");
  const attackScopes: [string, Scope][] = [
    ["ร้าน B", B],
    ["ระบบ A2 (ร้านเดียวกัน คนละระบบ)", A2],
  ];
  const before = {
    doc: await prisma.accountDocument.findUnique({ where: { id: invA } }),
    contact: await prisma.accountContact.findUnique({ where: { id: contactA.id } }),
    product: await prisma.accountProduct.findUnique({ where: { id: prodA.id } }),
    attachment: await prisma.accountAttachment.findUnique({ where: { id: attA.id } }),
    payments: await prisma.accountDocumentPayment.count({ where: { documentId: invA } }),
    entries: await prisma.accountJournalEntry.count({ where: { systemId: A.systemId } }),
  };

  for (const [label, S] of attackScopes) {
    // อ่าน
    await refuses(`S2 [${label}] getDocRef เอกสารของ A`, () => acc.getDocRef(S.tenantId, S.systemId, invA));
    await refuses(`S2 [${label}] getDocDetailData เอกสารของ A`, () =>
      docDetail.getDocDetailData(S.tenantId, S.systemId, invA),
    );
    await refuses(`S2 [${label}] getContactDetail ผู้ติดต่อของ A`, () => contactsList.getContactDetail(S, contactA.id));
    await refuses(`S2 [${label}] getProduct สินค้าของ A`, () => product.getProduct(S.tenantId, S.systemId, prodA.id));
    await refuses(`S2 [${label}] financeStatement บัญชีการเงินของ A`, () =>
      finance.financeStatement(S.tenantId, S.systemId, finA.id, {}),
    );
    // เขียน
    await refuses(`S2 [${label}] recordPayment ใส่เอกสารของ A`, () =>
      acc.recordPayment(S.tenantId, S.systemId, invA, { amount: 1_00, channel: "CASH", financeAccountId: finA.id }),
    );
    await refuses(`S2 [${label}] voidDocument เอกสารของ A`, () =>
      acc.voidDocument(S.tenantId, S.systemId, invA, "บุกรุก"),
    );
    await refuses(`S2 [${label}] issueDocument เอกสารของ A`, () => acc.issueDocument(S.tenantId, S.systemId, invA));
    await refuses(`S2 [${label}] convertDocument เอกสารของ A`, () =>
      acc.convertDocument(S.tenantId, S.systemId, invA, "RECEIPT", null),
    );
    await refuses(`S2 [${label}] updateDocument เอกสารของ A`, () =>
      acc.updateDocument(S.tenantId, S.systemId, invA, { note: "แก้โดยคนนอก" }),
    );
    await refuses(`S2 [${label}] updateProduct สินค้าของ A`, () =>
      product.updateProduct(S.tenantId, S.systemId, prodA.id, { name: "ถูกแก้" }),
    );
    await refuses(`S2 [${label}] archiveProduct สินค้าของ A`, () =>
      product.archiveProduct(S.tenantId, S.systemId, prodA.id),
    );
    await refuses(`S2 [${label}] moveAttachment ไฟล์แนบของ A`, () =>
      attach.moveAttachment(S.tenantId, S.systemId, attA.id, "โฟลเดอร์คนนอก"),
    );
    await refuses(`S2 [${label}] archiveAttachment ไฟล์แนบของ A`, () =>
      attach.archiveAttachment(S.tenantId, S.systemId, attA.id, null),
    );
    await refuses(`S2 [${label}] createPaymentRequest ให้เอกสารของ A`, () =>
      payReq.createPaymentRequest(S, invA, { financeId: finA.id }),
    );
    await refuses(`S2 [${label}] mergeContacts ผู้ติดต่อของ A`, () =>
      contactMerge.mergeContacts(S, { primaryId: contactA.id, secondaryId: xssContactIdForMerge }),
    );
    await refuses(`S2 [${label}] transferBetweenFinance บัญชีของ A`, () =>
      finance.transferBetweenFinance(S.tenantId, S.systemId, { fromId: finA.id, toId: finA2.id, amount: 100, date: new Date() }),
    );
    // รายการ: ต้องมองไม่เห็นของ A เลย
    const docs = await acc.listDocumentsPaged(S.tenantId, S.systemId, { docType: "INVOICE" });
    assert(`S2 [${label}] listDocumentsPaged ไม่เห็นเอกสารของ A`, docs.total === 0, `เห็น ${docs.total} ใบ`);
    const atts = await attach.listAttachments(S.tenantId, S.systemId);
    assert(`S2 [${label}] listAttachments ไม่เห็นไฟล์แนบของ A`, atts.length === 0, `เห็น ${atts.length} ไฟล์`);
    const jr = await journalV2.listJournalPaged(S, {});
    assert(`S2 [${label}] สมุดรายวันไม่เห็นรายการของ A`, jr.rows.length === 0, `เห็น ${jr.rows.length} แถว`);
  }

  // ยืนยัน "ไม่มีการเขียนเกิดขึ้นจริง" หลังยิงทั้งชุด
  const after = {
    doc: await prisma.accountDocument.findUnique({ where: { id: invA } }),
    contact: await prisma.accountContact.findUnique({ where: { id: contactA.id } }),
    product: await prisma.accountProduct.findUnique({ where: { id: prodA.id } }),
    attachment: await prisma.accountAttachment.findUnique({ where: { id: attA.id } }),
    payments: await prisma.accountDocumentPayment.count({ where: { documentId: invA } }),
    entries: await prisma.accountJournalEntry.count({ where: { systemId: A.systemId } }),
  };
  eq("S2 เอกสารของ A ไม่ถูกแตะ (status)", after.doc?.status, before.doc?.status);
  eq("S2 เอกสารของ A ไม่ถูกแตะ (note)", after.doc?.note ?? null, before.doc?.note ?? null);
  eq("S2 เอกสารของ A ไม่ถูกแตะ (paidTotal)", after.doc?.paidTotal, before.doc?.paidTotal);
  eq("S2 ผู้ติดต่อของ A ไม่ถูกเก็บ/แก้", after.contact?.archivedAt ?? null, before.contact?.archivedAt ?? null);
  eq("S2 สินค้าของ A ไม่ถูกแก้ชื่อ", after.product?.name, before.product?.name);
  eq("S2 สินค้าของ A ไม่ถูกเก็บ", after.product?.archivedAt ?? null, before.product?.archivedAt ?? null);
  eq("S2 ไฟล์แนบของ A ไม่ถูกย้ายโฟลเดอร์", after.attachment?.folder ?? null, before.attachment?.folder ?? null);
  eq("S2 ไฟล์แนบของ A ไม่ถูกเก็บ", after.attachment?.archivedAt ?? null, before.attachment?.archivedAt ?? null);
  eq("S2 ไม่มี payment ใหม่ในเอกสารของ A", after.payments, before.payments);
  eq("S2 ไม่มีรายการบัญชีใหม่ในระบบ A", after.entries, before.entries);
  // positive control — เจ้าของตัวจริงยังทำได้ (ไม่งั้น "ปฏิเสธหมด" ก็ผ่านข้อสอบได้ฟรี ๆ)
  const ownDetail = await acc.getDocRef(A.tenantId, A.systemId, invA);
  assert("S2 positive control: สโคปที่ถูกต้องยังอ่านเอกสารได้", ownDetail?.id === invA);

  // ═══════════════════════════════════════════════════════════
  // S3 — บทบาท/สิทธิ์
  // ═══════════════════════════════════════════════════════════
  console.log("\nS3 บทบาท STAFF ไม่มีสิทธิ์ → ถูกปฏิเสธ:");
  const authOf = (m: typeof mOwnerA) => ({ user: { id: m.userId }, active: m });
  const denies = (m: typeof mOwnerA, action: string) => {
    try {
      assertAccountCan(authOf(m) as never, action);
      return false;
    } catch {
      return true;
    }
  };
  const GUARDED_ACTIONS: [string, string][] = [
    ["บันทึกรับ/จ่ายเงิน", "account.payment.record"],
    ["ยกเลิกเอกสาร", "account.doc.void"],
    ["ยกเลิกการชำระ", "account.payment.void"],
    ["อนุมัติเอกสาร", "account.doc.approve"],
    ["ปิดงวดบัญชี", "account.period.close"],
    ["บันทึกตั้งค่า", "account.settings.manage"],
    ["จัดการผังบัญชี", "account.chart.manage"],
    ["ปรับปรุงสมุดรายวัน", "account.journal.adjust"],
    ["นำเข้าข้อมูล", "account.import"],
    ["รวมผู้ติดต่อ", "account.contact.merge"],
  ];
  for (const [label, action] of GUARDED_ACTIONS)
    assert(`S3 STAFF ไม่มีสิทธิ์ → ปฏิเสธ: ${label} (${action})`, denies(mStaffA, action));
  assert(
    "S3 positive control: OWNER ผ่านทุก action ข้างต้น",
    GUARDED_ACTIONS.every(([, a]) => !denies(mOwnerA, a)),
  );
  assert(
    "S3 สิทธิ์แคบไม่ลามไปกว้าง: STAFF ที่ได้ payment.record บันทึกเงินได้ แต่ปิดงวด/แก้ตั้งค่าไม่ได้",
    !denies(mStaffPay, "account.payment.record") &&
      denies(mStaffPay, "account.period.close") &&
      denies(mStaffPay, "account.settings.manage"),
  );
  // สร้าง API key / แก้สิทธิ์ = ต้องใช้ account.settings.manage (ตรงกับหน้า settings/connections + permissions)
  const connSrc = readFileSync(join(MODULE_DIR, "connections-actions.ts"), "utf8");
  const permSrc = readFileSync(join(MODULE_DIR, "permissions-actions.ts"), "utf8");
  assert(
    "S3 สร้าง API key ต้องมี account.settings.manage (connections-actions gate)",
    /assertAccountCan\(auth, "account\.settings\.manage"\)/.test(connSrc) &&
      /createApiKeyAction[\s\S]{0,400}?gate\(/.test(connSrc),
  );
  assert(
    "S3 บันทึกสิทธิ์ผู้ใช้ต้องมี account.settings.manage (permissions-actions gate)",
    /assertAccountCan\(auth, "account\.settings\.manage"\)/.test(permSrc) &&
      /saveRoleAction[\s\S]{0,400}?gate\(/.test(permSrc),
  );

  // ═══════════════════════════════════════════════════════════
  // S4 — ลิงก์สาธารณะ
  // ═══════════════════════════════════════════════════════════
  console.log("\nS4 ลิงก์สาธารณะ (/pay/<token> · /r/<token>):");
  const invForPay = await mkInvoiceA(250_000);
  const pr = await payReq.createPaymentRequest(A, invForPay, { financeId: finA.id, userId: ownerAId });
  assert("S4 สร้างคำขอชำระเงินได้ (positive control)", pr.ok, pr.ok ? "" : pr.reason);
  if (pr.ok) {
    const token = pr.request.token;
    // เอนโทรปี: base64url ของ 16 ไบต์ = 22 ตัวอักษร = 128 บิต
    assert(`S4 token ยาว 22 ตัว (128 บิต) และเป็น base64url`, /^[A-Za-z0-9_-]{22}$/.test(token), `ได้ "${token}"`);
    const page = await payReq.getPublicPaymentPage(token);
    assert("S4 เปิดหน้าจ่ายด้วย token ที่ถูกต้องได้", !!page);
    if (page) {
      const blob = JSON.stringify(page);
      assert("S4 หน้าจ่ายไม่มีชื่อลูกค้า", !blob.includes("ลูกค้าลับ"), blob.slice(0, 200));
      assert("S4 หน้าจ่ายไม่มีเบอร์/อีเมลลูกค้า", !blob.includes("0810000001") && !blob.includes("secret@qc.local"));
      assert("S4 หน้าจ่ายไม่มี id ภายใน (documentId/tenantId/systemId)", !blob.includes(invForPay) && !blob.includes(A.tenantId));
      eq("S4 หน้าจ่ายบอกยอดเป็นสตางค์จำนวนเต็ม", Number.isInteger(page.amountSatang), true);
    }
    // token มั่ว = null เหมือนกันหมด (ไม่แยกว่า "ไม่มี" กับ "หมดอายุ")
    eq("S4 token ที่ไม่มีอยู่จริง → null", await payReq.getPublicPaymentPage("A".repeat(22)), null);
    eq("S4 token รูปแบบผิด (สั้น) → null (ไม่แตะ DB)", await payReq.getPublicPaymentPage("xx"), null);
    eq("S4 token ที่มีอักขระนอกชุด → null", await payReq.getPublicPaymentPage("../../etc/passwd"), null);
    // หมดอายุ → สถานะ EXPIRED + ไม่มี QR ให้จ่ายต่อ
    await prisma.accountPaymentRequest.update({
      where: { id: pr.request.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expiredPage = await payReq.getPublicPaymentPage(token);
    eq("S4 ลิงก์หมดอายุ → status EXPIRED", expiredPage?.status, "EXPIRED");
    eq("S4 ลิงก์หมดอายุ → ไม่มี QR ให้สแกนต่อ", expiredPage?.qrPayload ?? null, null);
    eq("S4 ลิงก์หมดอายุ → ไม่มีลิงก์ผู้ให้บริการ", expiredPage?.providerUrl ?? null, null);
  }

  // /r/<token> — ลิงก์ขอใบกำกับภาษี
  await acc.saveSettings(A.tenantId, A.systemId, { vatRegistered: true, taxId: "0105561111115" });
  const rcpDoc = await acc.createDocument({
    tenantId: A.tenantId,
    systemId: A.systemId,
    docType: "RECEIPT",
    contactId: contactA.id,
    lines: [{ description: "ขายสินค้า QC", qty: 1, unitPrice: 100_000, vatRateBp: 700 }],
    vatMode: "EXCLUDE",
    createdById: ownerAId,
  });
  const rcpIssued = await acc.issueDocument(A.tenantId, A.systemId, rcpDoc.id);
  assert("S4 ออกใบเสร็จสำหรับทดสอบลิงก์ได้", rcpIssued.ok, rcpIssued.ok ? "" : rcpIssued.reason);
  const link = await acc.ensurePublicTaxInvoiceLink(A.tenantId, A.systemId, rcpDoc.id);
  assert("S4 สร้างลิงก์ขอใบกำกับได้", link.ok, link.ok ? "" : link.reason);
  if (link.ok) {
    assert(
      "S4 publicToken ยาว 24 ตัว (144 บิต) เป็น base64url",
      /^[A-Za-z0-9_-]{24}$/.test(link.token),
      `ได้ "${link.token}" (${link.token.length})`,
    );
    const again = await acc.ensurePublicTaxInvoiceLink(A.tenantId, A.systemId, rcpDoc.id);
    assert("S4 สร้างลิงก์ซ้ำ → token เดิม (idempotent ไม่งอก token)", again.ok && again.token === link.token);
    const ctx0 = await acc.getPublicTaxContext(link.token);
    assert("S4 เปิดหน้าใบเสร็จสาธารณะได้ (positive control)", !!ctx0);
    if (ctx0) {
      const blob = JSON.stringify(ctx0);
      assert("S4 หน้าใบเสร็จสาธารณะไม่มีเบอร์/อีเมลลูกค้า", !blob.includes("0810000001") && !blob.includes("secret@qc.local"));
      assert("S4 หน้าใบเสร็จสาธารณะไม่มีรายการสินค้า/บรรทัดเอกสาร", !blob.includes("ขายสินค้า QC"));
    }
    eq("S4 token ใบเสร็จที่ไม่มีอยู่ → null", await acc.getPublicTaxContext("Z".repeat(24)), null);

    // ปิดสวิตช์ "แสดงข้อมูลสาธารณะ" → ทั้งหน้าและ **การส่งฟอร์ม** ต้องตาย (9.2 ปิดรูรั่ว)
    await docSettings.saveDocSettings(A, { publicView: { enabled: false } } as never);
    eq("S4 ปิดลิงก์สาธารณะ → getPublicTaxContext = null", await acc.getPublicTaxContext(link.token), null);
    const blockedSubmit = await acc.issuePublicTaxInvoice(link.token, { name: "ผู้บุกรุก", taxId: "0105561111115" });
    assert(
      "S4 🔴 ปิดลิงก์สาธารณะแล้ว ยิง server action ตรง ๆ ก็ต้องไม่ผ่าน",
      !blockedSubmit.ok,
      JSON.stringify(blockedSubmit),
    );
    const leaked = await prisma.accountDocument.count({
      where: { systemId: A.systemId, docType: "TAX_INVOICE", sourceDocId: rcpDoc.id },
    });
    eq("S4 🔴 ไม่มีใบกำกับ/คำขอถูกสร้างตอนปิดสวิตช์", leaked, 0);

    // เปิดหน้าไว้ แต่ปิดเฉพาะ "ให้ลูกค้าขอใบกำกับเอง"
    await docSettings.saveDocSettings(A, {
      publicView: { enabled: true },
      taxRequest: { enabled: false },
    } as never);
    const ctxOn = await acc.getPublicTaxContext(link.token);
    eq("S4 เปิดหน้าใหม่ → อ่านใบเสร็จได้ตามเดิม", !!ctxOn, true);
    eq("S4 taxRequestEnabled = false ตามที่ตั้งไว้", ctxOn?.taxRequestEnabled, false);
    const blocked2 = await acc.issuePublicTaxInvoice(link.token, { name: "ผู้บุกรุก", taxId: "0105561111115" });
    assert("S4 🔴 ปิดคำขอใบกำกับแล้ว ยิง action ตรงต้องไม่ผ่าน", !blocked2.ok, JSON.stringify(blocked2));

    // เปิดครบ → ทำได้ (positive control) แล้วปิดกลับ
    await docSettings.saveDocSettings(A, {
      publicView: { enabled: true },
      taxRequest: { enabled: true },
    } as never);
    const okSubmit = await acc.issuePublicTaxInvoice(link.token, { name: "บจก. ผู้ซื้อ QC", taxId: "0105561111115" });
    assert("S4 positive control: เปิดครบแล้วขอใบกำกับได้จริง", okSubmit.ok, JSON.stringify(okSubmit));
    // เลขภาษีมั่ว → ไม่ผ่าน (checksum)
    const badTax = await acc.issuePublicTaxInvoice(link.token, { name: "x", taxId: "1111111111111" });
    assert("S4 เลขผู้เสียภาษี checksum ผิด → ปฏิเสธ", !badTax.ok);
    // ลิงก์หมดอายุตามตั้งค่า (expiryDays) — เลื่อน issueDate ย้อนหลังแทนการรอเวลาจริง
    await docSettings.saveDocSettings(A, { publicView: { enabled: true, expiryDays: 7 } } as never);
    await prisma.accountDocument.update({
      where: { id: rcpDoc.id },
      data: { issueDate: new Date(Date.now() - 30 * 86_400_000) },
    });
    eq("S4 เกินอายุลิงก์ตามตั้งค่า (7 วัน) → null", await acc.getPublicTaxContext(link.token), null);
    const expiredSubmit = await acc.issuePublicTaxInvoice(link.token, { name: "y", taxId: "0105561111115" });
    assert("S4 🔴 ลิงก์หมดอายุแล้ว ยิง action ตรงต้องไม่ผ่าน", !expiredSubmit.ok);
    await docSettings.saveDocSettings(A, { publicView: { enabled: true, expiryDays: 0 } } as never);
  }

  // เส้นทางสาธารณะต้องต่อ rate limit ไว้จริง (โครงสร้าง — ตัวจำกัดเองทดสอบที่ S11)
  const payPageSrc = readFileSync(join(ROOT, "src/app/(store)/pay/[token]/page.tsx"), "utf8");
  const rPageSrc = readFileSync(join(ROOT, "src/app/(store)/r/[token]/page.tsx"), "utf8");
  const rActionSrc = readFileSync(join(ROOT, "src/app/(store)/r/[token]/actions.ts"), "utf8");
  assert("S4 /pay/<token> ต่อ rate limit ต่อ IP", /accountRateGuard\("publicToken"/.test(payPageSrc));
  assert("S4 /r/<token> ต่อ rate limit ต่อ IP", /accountRateGuard\("publicToken"/.test(rPageSrc));
  assert("S4 ฟอร์มขอใบกำกับต่อ rate limit ต่อ IP", /accountRateGuard\("publicSubmit"/.test(rActionSrc));
  assert(
    "S4 หน้า /pay ไม่แสดงชื่อ/ที่อยู่ลูกค้า (ไม่มีการอ้าง contact ในไฟล์)",
    !/contact(Name|Snapshot|\.name)/.test(payPageSrc),
  );

  // ═══════════════════════════════════════════════════════════
  // S5 — webhook Beam
  // ═══════════════════════════════════════════════════════════
  console.log("\nS5 webhook ผู้ให้บริการชำระเงิน:");
  const webhookSrc = readFileSync(join(ROOT, "src/app/api/payment/beam/webhook/route.ts"), "utf8");
  assert("S5 อ่าน raw body ก่อนตรวจลายเซ็น (ไม่ parse JSON ก่อน)", /const raw = await req\.text\(\)[\s\S]{0,400}verifyWebhook\(raw/.test(webhookSrc));
  assert("S5 ลายเซ็นไม่ผ่าน → 401 สั้น ๆ", /verifyWebhook\(raw, sig\)\)\s*\{[\s\S]{0,600}status: 401/.test(webhookSrc));
  assert("S5 🔴 ไม่ทิ้ง body ดิบลง log ตอนลายเซ็นไม่ผ่าน", !/detail: raw\.slice/.test(webhookSrc));
  assert("S5 JSON เพี้ยน → ตอบ 200 (กัน Beam ยิงซ้ำไม่รู้จบ)", /bad_json[\s\S]{0,80}status: 200/.test(webhookSrc));
  assert("S5 บันทึกไม่สำเร็จก็ยังตอบ 200 พร้อมเหตุผล", /accRes\.reason[\s\S]{0,200}status: 200/.test(webhookSrc));
  // ตรวจ HMAC จริงจาก lib (ไม่ยิง route — route ต้องมี request context ของ Next)
  const beam = await import("@/lib/payment/beam");
  const prevBeam = {
    m: process.env.BEAM_MERCHANT_ID,
    k: process.env.BEAM_API_KEY,
    s: process.env.BEAM_WEBHOOK_SECRET,
  };
  // beamConfig() ต้องครบทั้ง 3 ตัวถึงจะเปิด — ตั้งชั่วคราวเฉพาะในชุดนี้แล้วคืนค่าเดิม
  // ใช้ bracket notation: ตัวสแกนความลับข้างล่าง (S17) จะได้ไม่จับค่าทดสอบของตัวเองเป็นคีย์จริง
  process.env["BEAM_MERCHANT_ID"] = "qc-merchant";
  process.env["BEAM_API_KEY"] = "qc-api-key";
  process.env["BEAM_WEBHOOK_SECRET"] = "qc-secret-9-2";
  const bodyStr = JSON.stringify({ chargeId: "ch_qc_1", referenceId: "acc:x", status: "SUCCEEDED", amount: 100 });
  const goodSig = createHmac("sha256", "qc-secret-9-2").update(bodyStr).digest("hex");
  assert("S5 ลายเซ็นถูก → verifyWebhook ผ่าน", beam.verifyWebhook(bodyStr, goodSig) === true);
  assert("S5 ลายเซ็นผิด → ไม่ผ่าน", beam.verifyWebhook(bodyStr, "0".repeat(64)) === false);
  assert("S5 ไม่มีลายเซ็น → ไม่ผ่าน", beam.verifyWebhook(bodyStr, null) === false);
  assert(
    "S5 body ถูกแก้ 1 ตัวอักษร → ลายเซ็นเดิมใช้ไม่ได้ (คิดจากไบต์ดิบจริง)",
    beam.verifyWebhook(bodyStr.replace('"amount":100', '"amount":999'), goodSig) === false,
  );
  for (const [k, v] of [["BEAM_MERCHANT_ID", prevBeam.m], ["BEAM_API_KEY", prevBeam.k], ["BEAM_WEBHOOK_SECRET", prevBeam.s]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  // กันยิงซ้ำ (idempotent ต่อ chargeId) — ผ่าน handleBeamPaid ตรง
  const invWebhook = await mkInvoiceA(50_000);
  const prW = await payReq.createPaymentRequest(A, invWebhook, { financeId: finA.id, userId: ownerAId });
  if (prW.ok) {
    await prisma.accountPaymentRequest.update({ where: { id: prW.request.id }, data: { method: "PROMPTPAY_BEAM" } });
    const ref = `acc:${prW.request.id}`;
    const p1 = await payReq.handleBeamPaid({ referenceId: ref, chargeId: "ch_qc_dup", paidSatang: 50_000 });
    assert("S5 webhook จ่ายสำเร็จ → บันทึกรับชำระได้", p1.ok, JSON.stringify(p1));
    const p2 = await payReq.handleBeamPaid({ referenceId: ref, chargeId: "ch_qc_dup", paidSatang: 50_000 });
    assert("S5 🔴 ยิง webhook ซ้ำ chargeId เดิม → duplicated ไม่บันทึกเงินซ้ำ", p2.ok && p2.duplicated === true, JSON.stringify(p2));
    const payCount = await prisma.accountDocumentPayment.count({ where: { documentId: invWebhook, voidedAt: null } });
    eq("S5 เอกสารมี payment ใบเดียวหลังยิงซ้ำ", payCount, 1);
    const docW = await prisma.accountDocument.findUnique({ where: { id: invWebhook }, select: { paidTotal: true } });
    eq("S5 paidTotal ไม่เบิ้ล", docW?.paidTotal, 50_000);
    const bogus = await payReq.handleBeamPaid({ referenceId: "topup:123", chargeId: "ch_x", paidSatang: 1 });
    assert("S5 referenceId ที่ไม่ใช่ของบัญชี → ปฏิเสธ", !bogus.ok);
    const noCharge = await payReq.handleBeamPaid({ referenceId: ref, chargeId: "", paidSatang: 1 });
    assert("S5 ไม่มี chargeId → ปฏิเสธ", !noCharge.ok);
  }

  // ═══════════════════════════════════════════════════════════
  // S6 — เงินเป็นสตางค์จำนวนเต็มเสมอ
  // ═══════════════════════════════════════════════════════════
  console.log("\nS6 เงินเป็นสตางค์ (integer) ทุกทาง:");
  eq('S6 bahtToSatang("1,234.56") = 123456', importShared.bahtToSatang("1,234.56"), 123456);
  eq('S6 bahtToSatang("1e3") = 100000 (จำนวนเต็ม)', importShared.bahtToSatang("1e3"), 100_000);
  eq('S6 bahtToSatang("0.005") ปัดเป็นจำนวนเต็ม', importShared.bahtToSatang("0.005"), 1);
  eq('S6 bahtToSatang("abc") = fallback 0', importShared.bahtToSatang("abc"), 0);
  eq('S6 bahtToSatang("") = fallback 0', importShared.bahtToSatang(""), 0);
  const bankCsv = await import("@/lib/modules/account/bank-statement-csv");
  eq('S6 parseAmountSatang("1,234.56") = 123456', bankCsv.parseAmountSatang("1,234.56"), 123456);
  eq('S6 parseAmountSatang("(250.00)") = -25000 (วงเล็บ = ติดลบ)', bankCsv.parseAmountSatang("(250.00)"), -25000);
  eq('S6 parseAmountSatang("1e3") = null (ไม่ใช่รูปแบบเงิน)', bankCsv.parseAmountSatang("1e3"), null);
  const permMatrix = await import("@/lib/modules/account/permissions-matrix");
  eq('S6 bahtFieldToSatang("50,000.00") = 5000000', permMatrix.bahtFieldToSatang("50,000.00"), 5_000_000);
  eq('S6 bahtFieldToSatang("฿ 1 234") ตัดสัญลักษณ์/ช่องว่าง', permMatrix.bahtFieldToSatang("฿ 1234"), 123_400);
  eq('S6 bahtFieldToSatang("-1") = invalid (เพดานติดลบไม่ได้)', permMatrix.bahtFieldToSatang("-1"), "invalid");
  // เงินที่ผ่าน service จริงต้องเป็น integer เสมอ
  const moneyRows = await prisma.accountDocument.findMany({
    where: { systemId: A.systemId },
    select: { subTotal: true, vatAmount: true, grandTotal: true, paidTotal: true },
  });
  assert(
    "S6 ทุกยอดเงินของเอกสารในระบบ A เป็นจำนวนเต็ม",
    moneyRows.every((r) => [r.subTotal, r.vatAmount, r.grandTotal, r.paidTotal].every(Number.isInteger)),
  );
  const glRows = await prisma.accountJournalLine.findMany({
    where: { systemId: A.systemId },
    select: { debit: true, credit: true },
  });
  assert(
    "S6 ทุกบรรทัดสมุดรายวันเป็นจำนวนเต็ม",
    glRows.length > 0 && glRows.every((r) => Number.isInteger(r.debit) && Number.isInteger(r.credit)),
  );
  // ยิงยอดทศนิยม/ค่าเพี้ยนเข้า service → ต้องถูกปัด/ปฏิเสธ ไม่หลุดเป็นทศนิยมลง DB
  const invRound = await mkInvoiceA(33_333);
  const payRound = await acc.recordPayment(A.tenantId, A.systemId, invRound, {
    amount: 100.6 as number,
    channel: "CASH",
    financeAccountId: finA.id,
  });
  assert("S6 รับชำระด้วยยอดทศนิยม → บันทึกได้", payRound.ok, JSON.stringify(payRound));
  const roundRow = await prisma.accountDocumentPayment.findFirst({
    where: { documentId: invRound },
    select: { amount: true },
  });
  assert("S6 🔴 ยอดที่เก็บลง DB เป็นจำนวนเต็ม (ไม่มีทศนิยมหลุดเข้าบัญชี)", Number.isInteger(roundRow?.amount), `ได้ ${roundRow?.amount}`);
  const payNeg = await acc.recordPayment(A.tenantId, A.systemId, invRound, {
    amount: -100,
    channel: "CASH",
    financeAccountId: finA.id,
  });
  assert("S6 รับชำระยอดติดลบ → ปฏิเสธ", !payNeg.ok);

  // ═══════════════════════════════════════════════════════════
  // S7 — CSV injection
  // ═══════════════════════════════════════════════════════════
  console.log("\nS7 CSV injection (ตัวส่งออกทุกตัว):");
  const EVIL = ['=SUM(A1:A9)', '+66812345678', '-2+3+cmd|\'/c calc\'!A0', '@SUM(1)', '\t=1+1', '\r=1+1'];
  for (const v of EVIL)
    assert(`S7 csvCell กันสูตร: ${JSON.stringify(v)}`, coreCsv.csvCell(v).replace(/^"/, "").startsWith("'"), coreCsv.csvCell(v));
  eq("S7 ข้อความไทยปกติไม่ถูกแตะ", coreCsv.csvCell("บริษัท ทดสอบ จำกัด"), "บริษัท ทดสอบ จำกัด");
  eq("S7 ตัวเลขติดลบยังเป็นตัวเลข (ไม่ถูกเติม ')", coreCsv.csvCell("-1234.50"), "-1234.50");
  eq("S7 number ไม่ถูกแตะ", coreCsv.csvCell(-125), "-125");
  eq('S7 มีคอมมา/quote → ครอบ quote + escape', coreCsv.csvCell('a,b"c'), '"a,b""c"');
  eq("S7 ขึ้นบรรทัดใหม่ → ครอบ quote", coreCsv.csvCell("a\nb"), '"a\nb"');
  eq("S7 csvRow ต่อบรรทัดผ่าน csvCell ทุกช่อง", coreCsv.csvRow(["=1", "ปกติ"]), "'=1,ปกติ");
  // ตัวส่งออกจริง — ตั้งชื่อคู่ค้าเป็นสูตรแล้วดูไฟล์ที่ได้
  const evilContact = await acc.createContact({
    tenantId: A.tenantId,
    systemId: A.systemId,
    kind: "VENDOR",
    name: '=HYPERLINK("http://evil","คลิก")',
    taxId: "0105561111115",
    phone: "081-000-0009",
  });
  const now = new Date();
  const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const pndOut = await wht.pndCsv(A.tenantId, A.systemId, { type: 53, period: periodKey });
  assert("S7 ภ.ง.ด. CSV ไม่มี cell ที่ขึ้นต้นด้วย = (ดิบ)", !/(^|,)=/m.test(pndOut), pndOut.slice(0, 200));
  const creditsOut = await wht.whtCreditsCsv(A.tenantId, A.systemId, { period: periodKey });
  assert("S7 CSV เครดิตภาษีถูกหัก ไม่มี cell ขึ้นต้นด้วย =", !/(^|,)=/m.test(creditsOut));
  const pp30Out = await reports.pp30Csv(A, periodKey);
  assert("S7 ภ.พ.30 CSV ไม่มี cell ขึ้นต้นด้วย = (ดิบ)", !/(^|,)=/m.test(pp30Out), pp30Out.slice(0, 300));
  assert("S7 ภ.พ.30 CSV มี BOM ให้ Excel ไทยอ่านได้", pp30Out.charCodeAt(0) === 0xfeff);
  const tmpl = importShared.buildTemplateCsv("contacts");
  assert("S7 เทมเพลตนำเข้าไม่มี cell ขึ้นต้นด้วย =", !/(^|,)=/m.test(tmpl));
  // แหล่งที่ยังหนี escape เองแบบไม่กันสูตร = ต้องไม่มีอีกแล้วในโมดูลบัญชี/หน้าบัญชี
  const rawEsc = grepAll(
    ["src/lib/modules/account", "src/app/app/sys/[id]/account", "src/components/account-v2"],
    String.raw`\/\[",\\n\]\/\.test`,
  );
  assert("S7 ไม่มีตัวหนี CSV เขียนมือที่ไม่กันสูตรหลงเหลือ", rawEsc.length === 0, rawEsc.join(" | "));
  const toolbarSrc = readFileSync(join(ROUTE_DIR, "reports/ReportToolbar.tsx"), "utf8");
  assert("S7 ปุ่ม Excel ของทุกรายงานใช้ csvRow กลาง", /csvRow\(/.test(toolbarSrc));
  // ชื่อไฟล์ใน Content-Disposition ต้องไม่รับค่าดิบจาก query
  const taxRouteSrc = readFileSync(join(ROUTE_DIR, "tax/export/route.ts"), "utf8");
  assert(
    "S7 🔴 ชื่อไฟล์ CSV กรอง period/year ก่อนใส่ header (กัน header injection)",
    /const safe = \(v: string\) => v\.replace\(\/\[\^0-9-\]\/g, ""\)/.test(taxRouteSrc),
  );

  // ═══════════════════════════════════════════════════════════
  // S8 — อัปโหลดไฟล์
  // ═══════════════════════════════════════════════════════════
  console.log("\nS8 อัปโหลดไฟล์แนบ:");
  const bytesOf = (head: number[], size = 64) => {
    const b = new Uint8Array(size);
    b.set(head, 0);
    return b;
  };
  const PDF = bytesOf([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  const JPG = bytesOf([0xff, 0xd8, 0xff, 0xe0]);
  const PNG = bytesOf([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const HTML = new TextEncoder().encode("<html><script>alert(1)</script></html>".padEnd(64, " "));
  const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'.padEnd(64, " "));
  eq("S8 sniff PDF", attachShared.sniffAttachmentMime(PDF), "application/pdf");
  eq("S8 sniff JPEG", attachShared.sniffAttachmentMime(JPG), "image/jpeg");
  eq("S8 sniff PNG", attachShared.sniffAttachmentMime(PNG), "image/png");
  eq("S8 sniff HTML → null (ไม่ใช่ชนิดที่รับ)", attachShared.sniffAttachmentMime(HTML), null);
  eq("S8 sniff SVG → null (ไม่รับ SVG เด็ดขาด — XSS)", attachShared.sniffAttachmentMime(SVG), null);
  const htmlAsJpg = attachShared.validateAttachmentBytes("image/jpeg", HTML);
  assert("S8 🔴 .html เปลี่ยนชื่อเป็น .jpg (แจ้ง image/jpeg) → ปฏิเสธ", !htmlAsJpg.ok, JSON.stringify(htmlAsJpg));
  const svgAsPng = attachShared.validateAttachmentBytes("image/png", SVG);
  assert("S8 🔴 SVG แจ้งเป็น image/png → ปฏิเสธ", !svgAsPng.ok);
  const realJpg = attachShared.validateAttachmentBytes("image/jpeg", JPG);
  assert("S8 positive control: JPEG จริงผ่าน", realJpg.ok && realJpg.mimeType === "image/jpeg");
  const pngAsJpeg = attachShared.validateAttachmentBytes("image/jpeg", PNG);
  assert(
    "S8 PNG ที่แจ้งว่า jpeg → เก็บด้วยชนิดจริงจากไบต์ (image/png)",
    pngAsJpeg.ok && pngAsJpeg.mimeType === "image/png",
    JSON.stringify(pngAsJpeg),
  );
  const tooBig = attachShared.validateAttachmentBytes("application/pdf", new Uint8Array(21 * 1024 * 1024));
  assert("S8 ไฟล์ 21MB → ปฏิเสธ (เพดาน 20MB)", !tooBig.ok && /ใหญ่เกิน/.test(tooBig.reason));
  eq("S8 เพดานคือ 20MB", attachShared.ATTACHMENT_MAX_BYTES, 20 * 1024 * 1024);
  const badMime = attachShared.validateAttachmentUpload("text/html", 10);
  assert("S8 ชนิดนอก allowlist (text/html) → ปฏิเสธตั้งแต่ชนิดที่แจ้ง", !badMime.ok);
  const emptyFile = attachShared.validateAttachmentBytes("application/pdf", new Uint8Array(0));
  assert("S8 ไฟล์ว่าง → ปฏิเสธ", !emptyFile.ok);
  assert("S8 allowlist ไม่มี svg/html/xml", !["image/svg+xml", "text/html", "application/xml"].some((m) => attachShared.ATTACHMENT_ALLOWED_MIME.has(m)));
  // ชื่อไฟล์
  eq("S8 ชื่อไฟล์ตัดตัวคั่น path", attach.sanitizeAttachmentFileName("../../x.pdf"), "..-..-x.pdf");
  eq("S8 ชื่อไฟล์ตัด backslash", attach.sanitizeAttachmentFileName("C:\\temp\\bill.pdf"), "C:-temp-bill.pdf");
  eq("S8 ชื่อไฟล์ตัดอักขระควบคุม (กัน header injection)", attach.sanitizeAttachmentFileName("a\r\nb.pdf"), "ab.pdf");
  eq("S8 ชื่อไฟล์ภาษาไทย/อีโมจิยังใช้ได้", attach.sanitizeAttachmentFileName("ใบกำกับ 📄.pdf"), "ใบกำกับ 📄.pdf");
  assert("S8 ชื่อไฟล์ยาวเกินถูกตัดที่ 200", attach.sanitizeAttachmentFileName("ก".repeat(500)).length === 200);
  const pathAtt = await attach.createAttachment({
    tenantId: A.tenantId,
    systemId: A.systemId,
    fileName: "../../../etc/passwd.pdf",
    fileUrl: "https://cdn.example/qc/p.pdf",
    mimeType: "application/pdf",
  });
  assert("S8 สร้างไฟล์แนบชื่อมี path → เก็บชื่อที่ล้างแล้ว", pathAtt.ok);
  if (pathAtt.ok) {
    const row = await prisma.accountAttachment.findUnique({ where: { id: pathAtt.id }, select: { fileName: true } });
    assert("S8 ชื่อไฟล์ที่เก็บไม่มี / หรือ \\", !/[\\/]/.test(row?.fileName ?? "x/"), row?.fileName);
  }
  // key ที่เก็บจริงไม่ได้มาจากผู้ใช้
  const storageSrc = readFileSync(join(ROOT, "src/lib/storage/service.ts"), "utf8");
  assert(
    "S8 path ที่เก็บบน storage ประกอบจาก tenantId + uuid + ext ของ allowlist (ไม่ใช้ชื่อไฟล์ผู้ใช้)",
    /const path = `t\/\$\{ctx\.tenantId\}\/\$\{input\.kind\.toLowerCase\(\)\}\/\$\{id\}\.\$\{ext\}`/.test(storageSrc),
  );
  assert(
    "S8 ext มาจากตาราง ALLOWED_TYPES เท่านั้น (ไม่มี fallback ให้ตกเป็นนามสกุลอื่น)",
    /const ext = ALLOWED_TYPES\[normalizeUploadType\(input\.contentType\)\];\n\s*if \(!ext\)/.test(storageSrc),
  );
  const uploadActionSrc = readFileSync(join(ROUTE_DIR, "documents/actions.ts"), "utf8");
  assert("S8 🔴 action อัปโหลดตรวจไบต์จริง (validateAttachmentBytes) ไม่ใช่แค่ file.type", /validateAttachmentBytes\(file\.type, data\)/.test(uploadActionSrc));
  assert("S8 ชนิดที่เก็บ/ส่งขึ้น storage ใช้ชนิดที่ sniff ได้ ไม่ใช่ที่ browser แจ้ง", !/contentType: file\.type/.test(uploadActionSrc));

  // ═══════════════════════════════════════════════════════════
  // S9 — คำค้น / SQL
  // ═══════════════════════════════════════════════════════════
  console.log("\nS9 คำค้น + SQL:");
  eq("S9 MAX_SEARCH_LEN = 200", MAX_SEARCH_LEN, 200);
  eq("S9 clampSearch ตัดที่ 200 ตัว", clampSearch("ก".repeat(5000)).length, 200);
  eq("S9 clampSearch trim หัวท้าย", clampSearch("  ab  "), "ab");
  eq("S9 clampSearch null → ''", clampSearch(null), "");
  const longQ = "%_".repeat(5000);
  const longRes = await acc.listDocumentsPaged(A.tenantId, A.systemId, { docType: "INVOICE", q: longQ });
  assert("S9 คำค้นยาว 10,000 ตัว → ทำงานได้และไม่เจอ (ถูกตัดแล้ว)", longRes.total === 0);
  // ⚠️ ข้อเท็จจริงที่วัดได้: Prisma `contains` ส่งค่าเป็นพารามิเตอร์ (ไม่มี SQL injection) แต่ **ไม่ escape
  //    `%`/`_`** ⇒ ค้น "%" = ตรงทุกแถว · **ไม่ใช่ช่องโหว่** เพราะ where ผูก tenantId+systemId อยู่แล้ว
  //    (ผู้ใช้เห็นได้เฉพาะร้านตัวเอง ซึ่งกดล้างคำค้นก็เห็นอยู่ดี) — ที่ต้องยืนยันคือ "ไม่ข้ามร้าน"
  const wildcardOwn = await acc.listDocumentsPaged(A.tenantId, A.systemId, { docType: "INVOICE", q: "%" });
  const wildcardCross = await acc.listDocumentsPaged(B.tenantId, B.systemId, { docType: "INVOICE", q: "%" });
  assert("S9 ค้น '%' ในร้านตัวเอง = เห็นของตัวเอง (positive control)", wildcardOwn.total > 0, `เจอ ${wildcardOwn.total}`);
  eq("S9 🔴 ค้น '%' จากร้านอื่น = 0 (wildcard ไม่ข้ามขอบเขตร้าน)", wildcardCross.total, 0);
  const sqlish = await acc.listDocumentsPaged(A.tenantId, A.systemId, { docType: "INVOICE", q: "' OR 1=1 --" });
  assert("S9 คำค้นทรง SQL injection → 0 แถว (ไม่หลุดทั้งตาราง)", sqlish.total === 0, `เจอ ${sqlish.total}`);
  // raw SQL: มีได้แต่ต้องผูกค่า ($n / tagged template) — ห้าม string interpolation
  const rawUnsafe = grepAll(["src/lib/modules/account", "src/app/app/sys/[id]/account"], String.raw`\$(queryRawUnsafe|executeRawUnsafe)`);
  const rawFiles = [...new Set(rawUnsafe.map((h) => h.split(":")[0]!))];
  for (const file of rawFiles) {
    const src = readFileSync(join(ROOT, file), "utf8");
    // ดึง "สตริง SQL" (อาร์กิวเมนต์แรก) ของทุกจุดที่เรียก แล้วยืนยันว่าไม่มี ${} และมี $n ผูกค่า
    const sqls = [...src.matchAll(/\$(?:query|execute)RawUnsafe\(\s*`([\s\S]*?)`/g)].map((m) => m[1]!);
    assert(`S9 ${file}: ดึงสตริง SQL ของ raw call ได้ครบ`, sqls.length > 0, `ดึงได้ ${sqls.length}`);
    for (const [i, sql] of sqls.entries()) {
      assert(`S9 ${file} raw#${i + 1}: SQL ไม่มี template interpolation (\${...})`, !sql.includes("${"), sql.slice(0, 80));
      assert(`S9 ${file} raw#${i + 1}: ผูกค่าด้วย $1… (placeholder)`, /\$\d/.test(sql), sql.slice(0, 80));
    }
  }
  assert("S9 จำนวนจุดที่ใช้ raw SQL ยังจำกัด (≤ 4 จุด — เพิ่มเมื่อไหร่ต้องมาทบทวน)", rawUnsafe.length <= 4, rawUnsafe.join(" | "));
  const interpolated = grepAll(
    ["src/lib/modules/account", "src/app/app/sys/[id]/account"],
    String.raw`\$(queryRawUnsafe|executeRawUnsafe)\([^)]*\$\{`,
  );
  assert("S9 🔴 ไม่มี raw SQL ที่ยัดค่าด้วย template string", interpolated.length === 0, interpolated.join(" | "));
  // ORDER BY จาก allowlist
  const svcSrc = readFileSync(join(MODULE_DIR, "service.ts"), "utf8");
  assert(
    "S9 ORDER BY ของรายการเอกสารมาจากตารางคงที่ (DOC_SORT_ORDER)",
    /const DOC_SORT_ORDER: Record<DocSort,/.test(svcSrc) && /orderBy: DOC_SORT_ORDER\[input\.sort \?\? "recent"\]/.test(svcSrc),
  );
  const listPageSrc = readFileSync(join(ROUTE_DIR, "docs/[docType]/page.tsx"), "utf8");
  assert(
    "S9 หน้ารายการกรอง sort จาก query ให้เหลือค่าที่รู้จักก่อนส่งเข้า service",
    /sp\.sort === "docNo" \|\| sp\.sort === "amount" \|\| sp\.sort === "issueDate" \? sp\.sort : "issueDate"/.test(listPageSrc),
  );
  // ขอบเขตหน้า/ขนาดหน้า (กันดึงทั้งตาราง)
  const big = await acc.listDocumentsPaged(A.tenantId, A.systemId, { docType: "INVOICE", pageSize: 100000 });
  eq("S9 pageSize เกินเพดาน → 100", big.pageSize, 100);

  // ═══════════════════════════════════════════════════════════
  // S10 — XSS
  // ═══════════════════════════════════════════════════════════
  console.log("\nS10 XSS:");
  const dsi = grepAll(
    ["src/lib/modules/account", "src/app/app/sys/[id]/account", "src/components/account-v2", "src/app/(store)/pay", "src/app/(store)/r"],
    "dangerouslySetInnerHTML",
  );
  eq("S10 dangerouslySetInnerHTML ในขอบเขตบัญชี+หน้าสาธารณะ มีจุดเดียว", dsi.length, 1);
  assert("S10 จุดเดียวนั้นคือ AccountIcon (ไอคอน SVG คงที่ในไฟล์)", dsi[0]?.includes("AccountIcon.tsx"), dsi.join(" | "));
  const iconSrc = readFileSync(join(ROOT, "src/components/account-v2/AccountIcon.tsx"), "utf8");
  assert(
    "S10 เนื้อ HTML ของไอคอนมาจากตารางคงที่ (ICONS[name] ?? FALLBACK) ไม่ใช่ค่าจากผู้ใช้",
    /__html: ICONS\[name\] \?\? FALLBACK/.test(iconSrc) && /const ICONS[^=]*=\s*\{/.test(iconSrc),
  );
  // เนื้อความของผู้ใช้ (หมายเหตุ/เงื่อนไข) ต้องไม่ถูกฉีดเป็น HTML ที่หน้าพิมพ์
  const printSrcs = execFileSync("bash", ["-lc", `grep -rl "note\\|terms" "${ROUTE_DIR}/print" 2>/dev/null || true`], {
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  assert(
    "S10 หน้าพิมพ์เอกสารไม่ใช้ dangerouslySetInnerHTML กับหมายเหตุ/เงื่อนไข",
    printSrcs.every((f) => !readFileSync(f, "utf8").includes("dangerouslySetInnerHTML")),
    printSrcs.join(" | "),
  );
  // เก็บชื่อที่มีแท็กแล้วอ่านกลับ = ต้องได้ข้อความเดิม (React escape ตอนเรนเดอร์)
  const xssName = '<img src=x onerror="alert(1)">';
  const xssContact = await acc.createContact({
    tenantId: A.tenantId,
    systemId: A.systemId,
    kind: "CUSTOMER",
    name: xssName,
    phone: "081-000-0002",
  });
  const readBack = await prisma.accountContact.findUnique({ where: { id: xssContact.id }, select: { name: true } });
  eq("S10 ชื่อที่มีแท็ก HTML ถูกเก็บเป็นข้อความดิบ (ไม่ถูกตีความ/ไม่ถูกกลืน)", readBack?.name, xssName);

  // ═══════════════════════════════════════════════════════════
  // S11 — rate limit
  // ═══════════════════════════════════════════════════════════
  console.log("\nS11 rate limit:");
  const rlKey = `qc-sec-${Date.now()}`;
  await rateLimitDb.resetRateLimitDb(`acc:publicSubmit:${rlKey}`);
  const spec = rateLimit.ACCOUNT_RATE.publicSubmit;
  eq("S11 เพดานส่งฟอร์มสาธารณะ = 10 ครั้ง/นาที", `${spec.limit}/${spec.windowMs}`, "10/60000");
  let lastVerdict: Awaited<ReturnType<typeof rateLimit.accountRateGuard>> = { ok: true };
  for (let i = 0; i < spec.limit; i++) lastVerdict = await rateLimit.accountRateGuard("publicSubmit", rlKey);
  assert("S11 ยิงเท่าเพดานพอดี → ยังผ่าน", lastVerdict.ok);
  const over = await rateLimit.accountRateGuard("publicSubmit", rlKey);
  assert("S11 เกินเพดาน 1 ครั้ง → ถูกปฏิเสธ", !over.ok);
  assert("S11 ข้อความปฏิเสธเป็นภาษาไทยและบอกเวลารอ", !over.ok && /รออีก/.test(over.reason), !over.ok ? over.reason : "");
  assert("S11 มี retryAfterSec ให้ UI ใช้", !over.ok && over.retryAfterSec > 0);
  const otherIp = await rateLimit.accountRateGuard("publicSubmit", rlKey + "-other");
  assert("S11 ถังแยกตาม scope (IP อื่นยังผ่าน)", otherIp.ok);
  await rateLimitDb.resetRateLimitDb(`acc:publicSubmit:${rlKey}`);
  await rateLimitDb.resetRateLimitDb(`acc:publicSubmit:${rlKey}-other`);
  assert("S11 ตัวจำกัดอยู่บน DB (ทนหลาย instance) ไม่ใช่ Map ในโปรเซส", /rate-limit-db/.test(readFileSync(join(MODULE_DIR, "rate-limit.ts"), "utf8")));
  // ต่อไว้ครบทุกจุดที่ใบสั่งงานระบุ
  const WIRED: [string, string, string][] = [
    ["สร้างลิงก์ชำระเงิน (5.5)", "payment-request.ts", 'accountRateGuard("paymentRequest"'],
    ["นำเข้า CSV (1.8)", "import-actions.ts", 'accountRateGuard("import"'],
    ["อ่านบิลด้วย AI (7.2)", "inbox-ai.ts", 'accountRateGuard("aiBill"'],
    ["ส่งอีเมลรายงาน (8.2)", "service.ts", 'accountRateGuard("emailReport"'],
  ];
  for (const [label, file, needle] of WIRED)
    assert(`S11 ต่อ rate limit แล้ว: ${label}`, readFileSync(join(MODULE_DIR, file), "utf8").includes(needle));
  const inboxAiSrc = readFileSync(join(MODULE_DIR, "inbox-ai.ts"), "utf8");
  assert("S11 อ่านบิล AI มี credit gate (canSpend) ก่อนยิง provider", /if \(!\(await canSpend\(ctx\.tenantId\)\)\)/.test(inboxAiSrc));
  assert(
    "S11 เพดาน AI ถูกนับหลัง credit gate (cache/ปิด AI ไม่กินโควตา)",
    inboxAiSrc.indexOf("canSpend(ctx.tenantId)") < inboxAiSrc.indexOf('accountRateGuard("aiBill"'),
  );

  // ═══════════════════════════════════════════════════════════
  // S12 — แข่งกันรับชำระ
  // ═══════════════════════════════════════════════════════════
  console.log("\nS12 แข่งกันรับชำระ (Promise.all):");
  const raceInv = await mkInvoiceA(500_00); // ฿500.00
  const raceRes = await Promise.all([
    acc.recordPayment(A.tenantId, A.systemId, raceInv, { amount: 500_00, channel: "CASH", financeAccountId: finA.id }),
    acc.recordPayment(A.tenantId, A.systemId, raceInv, { amount: 500_00, channel: "CASH", financeAccountId: finA.id }),
  ]);
  const wins = raceRes.filter((r) => r.ok).length;
  eq("S12 🔴 ยิงรับชำระเต็มยอดพร้อมกัน 2 ครั้ง → สำเร็จ 1 ครั้งเท่านั้น", wins, 1);
  const raceDoc = await prisma.accountDocument.findUnique({
    where: { id: raceInv },
    select: { paidTotal: true, grandTotal: true, status: true },
  });
  eq("S12 paidTotal = ยอดเอกสาร (ไม่เกิน)", raceDoc?.paidTotal, raceDoc?.grandTotal);
  eq("S12 สถานะเป็น PAID", raceDoc?.status, "PAID");
  const racePays = await prisma.accountDocumentPayment.count({ where: { documentId: raceInv, voidedAt: null } });
  eq("S12 มี payment ใบเดียว", racePays, 1);
  const raceCash = await prisma.accountJournalLine.aggregate({
    where: { systemId: A.systemId, entry: { refType: "AccountDocumentPayment", refId: { in: (await prisma.accountDocumentPayment.findMany({ where: { documentId: raceInv }, select: { id: true } })).map((p) => p.id) } } },
    _sum: { debit: true, credit: true },
  });
  eq("S12 สมุดรายวันของการรับชำระใบนี้สมดุล (Σdr = Σcr)", raceCash._sum.debit, raceCash._sum.credit);
  // แข่งกันจ่ายครึ่งหนึ่ง 3 ครั้ง (รวมเกินยอด) — ต้องผ่านแค่ 2
  const raceInv2 = await mkInvoiceA(300_00);
  const race2 = await Promise.all([
    acc.recordPayment(A.tenantId, A.systemId, raceInv2, { amount: 150_00, channel: "CASH", financeAccountId: finA.id }),
    acc.recordPayment(A.tenantId, A.systemId, raceInv2, { amount: 150_00, channel: "CASH", financeAccountId: finA.id }),
    acc.recordPayment(A.tenantId, A.systemId, raceInv2, { amount: 150_00, channel: "CASH", financeAccountId: finA.id }),
  ]);
  eq("S12 จ่ายครึ่งยอด 3 ครั้งพร้อมกัน → ผ่าน 2 ตกไป 1", race2.filter((r) => r.ok).length, 2);
  const race2Doc = await prisma.accountDocument.findUnique({ where: { id: raceInv2 }, select: { paidTotal: true, grandTotal: true } });
  assert(
    "S12 ยอดที่ชำระไม่เกินยอดเอกสาร",
    (race2Doc?.paidTotal ?? 0) <= (race2Doc?.grandTotal ?? 0),
    `paidTotal ${race2Doc?.paidTotal} > grandTotal ${race2Doc?.grandTotal}`,
  );
  // idempotencyKey เดิม = ไม่บันทึกซ้ำแม้ยิงพร้อมกัน
  const idemInv = await mkInvoiceA(200_00);
  const idemKey = `qc-idem-${Date.now()}`;
  const idemRes = await Promise.all([
    acc.recordPayment(A.tenantId, A.systemId, idemInv, { amount: 100_00, channel: "CASH", financeAccountId: finA.id, idempotencyKey: idemKey }),
    acc.recordPayment(A.tenantId, A.systemId, idemInv, { amount: 100_00, channel: "CASH", financeAccountId: finA.id, idempotencyKey: idemKey }),
  ]);
  const idemPays = await prisma.accountDocumentPayment.count({ where: { documentId: idemInv, voidedAt: null } });
  assert("S12 idempotencyKey เดียวกันยิงพร้อมกัน → payment ใบเดียว", idemPays === 1, `ได้ ${idemPays} ใบ · ${JSON.stringify(idemRes.map((r) => r.ok))}`);

  // ═══════════════════════════════════════════════════════════
  // S13 — แข่งกันออกเลขที่
  // ═══════════════════════════════════════════════════════════
  console.log("\nS13 แข่งกันออกเลขที่ (เอกสาร/ผู้ติดต่อ/สินค้า):");
  const seqDocs = await Promise.all(
    Array.from({ length: 5 }, () =>
      acc.createDocument({
        tenantId: A.tenantId,
        systemId: A.systemId,
        docType: "QUOTATION",
        contactId: contactA.id,
        lines: [{ description: "แข่งเลขที่", qty: 1, unitPrice: 1_00, vatRateBp: 0 }],
        vatMode: "NONE",
      }),
    ),
  );
  const issued = await Promise.all(seqDocs.map((d) => acc.issueDocument(A.tenantId, A.systemId, d.id)));
  const docNos = issued.filter((r) => r.ok).map((r) => (r as { ok: true; docNo: string }).docNo);
  eq("S13 ออกเอกสารพร้อมกัน 5 ใบ → สำเร็จครบ 5", docNos.length, 5);
  eq("S13 🔴 เลขที่เอกสารไม่ซ้ำกันเลย", new Set(docNos).size, 5);
  const seqRow = await prisma.accountDocSequence.findFirst({
    where: { systemId: A.systemId, docType: "QUOTATION" },
    select: { lastNo: true },
  });
  assert("S13 ตัวนับเดินครบ 5 (ไม่มีเลขหาย)", (seqRow?.lastNo ?? 0) >= 5, `lastNo = ${seqRow?.lastNo}`);
  const raceContacts = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      acc.createContact({ tenantId: A.tenantId, systemId: A.systemId, kind: "CUSTOMER", name: `แข่งเลขที่ ${i}`, phone: `08110000${i}0` }),
    ),
  );
  const cCodes = raceContacts.map((c) => c.code).filter(Boolean);
  eq("S13 สร้างผู้ติดต่อพร้อมกัน 5 ราย → มีเลขที่ครบ 5", cCodes.length, 5);
  eq("S13 เลขที่ผู้ติดต่อไม่ซ้ำ", new Set(cCodes).size, 5);
  const raceProducts = await Promise.all(
    Array.from({ length: 5 }, (_, i) => product.createProduct(A.tenantId, A.systemId, { name: `สินค้าแข่ง ${i}` })),
  );
  const pCodes = raceProducts.filter((p) => p.ok).map((p) => (p as { ok: true; code: string | null }).code);
  eq("S13 สร้างสินค้าพร้อมกัน 5 ตัว → มีเลขที่ครบ 5", pCodes.filter(Boolean).length, 5);
  eq("S13 เลขที่สินค้าไม่ซ้ำ", new Set(pCodes).size, 5);
  // P2002 ที่ **ไม่ใช่** เลขที่ (SKU ซ้ำ) ต้องเด้งทันที ไม่วน 6 รอบแล้วสร้างแถวไร้เลข
  const skuOne = await product.createProduct(A.tenantId, A.systemId, { name: "สินค้า SKU", sku: "QC-SKU-1" });
  assert("S13 สร้างสินค้าที่มี SKU ได้", skuOne.ok);
  const beforeDupCount = await prisma.accountProduct.count({ where: { systemId: A.systemId } });
  const t0 = Date.now();
  const skuDup = await product.createProduct(A.tenantId, A.systemId, { name: "สินค้า SKU ซ้ำ", sku: "QC-SKU-1" });
  const dupMs = Date.now() - t0;
  assert("S13 🔴 SKU ซ้ำ (P2002 คนละ index) → ปฏิเสธทันที ไม่วนขอเลขใหม่", !skuDup.ok, JSON.stringify(skuDup));
  assert("S13 ข้อความบอกว่าเป็นเรื่อง SKU ไม่ใช่เลขที่", !skuDup.ok && /SKU/.test(skuDup.reason), !skuDup.ok ? skuDup.reason : "");
  const afterDupCount = await prisma.accountProduct.count({ where: { systemId: A.systemId } });
  eq("S13 ไม่มีแถวสินค้าไร้เลขที่ถูกสร้างจากการชน SKU", afterDupCount, beforeDupCount);
  assert("S13 การปฏิเสธเร็ว (ไม่ได้วนลอง 6 รอบ)", dupMs < 4000, `ใช้ ${dupMs}ms`);
  // เลขที่ผู้ติดต่อกรอกเอง ซ้ำ = เด้งให้ผู้ใช้เห็น (ไม่เดาแทน)
  const manualCode = await acc.createContact({
    tenantId: A.tenantId,
    systemId: A.systemId,
    kind: "CUSTOMER",
    name: "เลขที่กรอกเอง",
    code: "C-MANUAL-1",
    phone: "0812220001",
  });
  eq("S13 เลขที่ผู้ติดต่อที่กรอกเองถูกใช้ตามนั้น", manualCode.code, "C-MANUAL-1");
  let manualDupThrew = false;
  try {
    await acc.createContact({
      tenantId: A.tenantId,
      systemId: A.systemId,
      kind: "CUSTOMER",
      name: "เลขที่กรอกเองซ้ำ",
      code: "C-MANUAL-1",
      phone: "0812220002",
    });
  } catch {
    manualDupThrew = true;
  }
  assert("S13 เลขที่ผู้ติดต่อที่กรอกเองซ้ำ → เด้ง error ไม่เดาเลขใหม่ให้", manualDupThrew);

  // ═══════════════════════════════════════════════════════════
  // S14 — กดรัว/กดพร้อมกัน = idempotent
  // ═══════════════════════════════════════════════════════════
  console.log("\nS14 กดออก/อนุมัติ/ยกเลิกรัว:");
  const dblDoc = await acc.createDocument({
    tenantId: A.tenantId,
    systemId: A.systemId,
    docType: "INVOICE",
    contactId: contactA.id,
    lines: [{ description: "กดรัว", qty: 1, unitPrice: 400_00, vatRateBp: 0 }],
    vatMode: "NONE",
  });
  const dblIssue = await Promise.all([
    acc.issueDocument(A.tenantId, A.systemId, dblDoc.id),
    acc.issueDocument(A.tenantId, A.systemId, dblDoc.id),
  ]);
  eq("S14 🔴 กด 'ออกเอกสาร' พร้อมกัน 2 ครั้ง → สำเร็จ 1 ครั้ง", dblIssue.filter((r) => r.ok).length, 1);
  const dblEntries = await prisma.accountJournalEntry.count({
    where: { systemId: A.systemId, refType: "AccountDocument", refId: dblDoc.id, journal: { not: "REVERSAL" } },
  });
  eq("S14 มีรายการบัญชีชุดเดียว (ไม่โพสต์ซ้ำ)", dblEntries, 1);

  const dblPay = await acc.recordPayment(A.tenantId, A.systemId, dblDoc.id, {
    amount: 400_00,
    channel: "CASH",
    financeAccountId: finA.id,
  });
  assert("S14 รับชำระเต็มยอดได้ (เตรียมทดสอบยกเลิก)", dblPay.ok, JSON.stringify(dblPay));
  if (dblPay.ok && dblPay.paymentId) {
    const dblVoid = await Promise.all([
      acc.voidPayment(A.tenantId, A.systemId, dblDoc.id, dblPay.paymentId, "กดรัว"),
      acc.voidPayment(A.tenantId, A.systemId, dblDoc.id, dblPay.paymentId, "กดรัว"),
    ]);
    eq("S14 🔴 ยกเลิกการชำระพร้อมกัน 2 ครั้ง → สำเร็จ 1 ครั้ง", dblVoid.filter((r) => r.ok).length, 1);
    const afterVoid = await prisma.accountDocument.findUnique({ where: { id: dblDoc.id }, select: { paidTotal: true, status: true } });
    eq("S14 paidTotal กลับเป็น 0 (ไม่ลบซ้ำจนติดลบ)", afterVoid?.paidTotal, 0);
    eq("S14 สถานะกลับเป็นรอชำระ", afterVoid?.status, "AWAITING_PAYMENT");
    const revEntries = await prisma.accountJournalEntry.count({
      where: { systemId: A.systemId, refType: "AccountDocumentPayment", refId: dblPay.paymentId, journal: "REVERSAL" },
    });
    eq("S14 มีรายการกลับรายการชุดเดียว", revEntries, 1);
  }
  const dblVoidDoc = await Promise.all([
    acc.voidDocument(A.tenantId, A.systemId, dblDoc.id, "กดรัว"),
    acc.voidDocument(A.tenantId, A.systemId, dblDoc.id, "กดรัว"),
  ]);
  eq("S14 🔴 ยกเลิกเอกสารพร้อมกัน 2 ครั้ง → สำเร็จ 1 ครั้ง", dblVoidDoc.filter((r) => r.ok).length, 1);
  const voidedDoc = await prisma.accountDocument.findUnique({ where: { id: dblDoc.id }, select: { status: true } });
  eq("S14 เอกสารอยู่สถานะ VOIDED", voidedDoc?.status, "VOIDED");
  // อนุมัติใบสั่งซื้อพร้อมกัน
  const poDoc = await expense.createExpenseDoc({
    tenantId: A.tenantId,
    systemId: A.systemId,
    docType: "PURCHASE_ORDER",
    contactId: evilContact.id,
    lines: [{ description: "สั่งซื้อ QC", qty: 1, unitPrice: 100_00, vatRateBp: 0 }],
    vatMode: "NONE",
  });
  const poId = typeof poDoc === "string" ? poDoc : (poDoc as { id: string }).id;
  await prisma.accountDocument.update({ where: { id: poId }, data: { status: "AWAITING_APPROVAL" } });
  const dblApprove = await Promise.all([
    expense.approvePurchaseOrder(A.tenantId, A.systemId, poId, ownerAId),
    expense.approvePurchaseOrder(A.tenantId, A.systemId, poId, ownerAId),
  ]);
  eq("S14 🔴 อนุมัติใบสั่งซื้อพร้อมกัน 2 ครั้ง → สำเร็จ 1 ครั้ง", dblApprove.filter((r) => r.ok).length, 1);
  const poAfter = await prisma.accountDocument.findUnique({ where: { id: poId }, select: { status: true } });
  eq("S14 ใบสั่งซื้ออยู่สถานะ APPROVED", poAfter?.status, "APPROVED");

  // ═══════════════════════════════════════════════════════════
  // S15 — ล็อกงวด / ล็อกก่อนวันที่
  // ═══════════════════════════════════════════════════════════
  console.log("\nS15 ล็อกงวด + ล็อกก่อนวันที่ (คอขวด GL):");
  const glSrc = readFileSync(join(MODULE_DIR, "gl.ts"), "utf8");
  assert(
    "S15 commitEntry (คอขวดเดียว) เรียกทั้ง assertPeriodOpen และ assertNotLockedGl",
    /async function commitEntry[\s\S]*?await assertPeriodOpen\(ctx, periodKey, db\);\s*\n\s*await assertNotLockedGl\(ctx, o\.date, db\);/.test(glSrc),
  );
  const postFns = [...glSrc.matchAll(/export async function (post\w+)\(/g)].map((m) => m[1]!);
  assert(`S15 ทุกตัวโพสต์บัญชี (${postFns.length} ตัว) ลงท้ายที่ commitEntry`, postFns.length >= 10);
  const noCommit = postFns.filter((fn) => {
    const body = glSrc.match(new RegExp(`export async function ${fn}\\(([\\s\\S]*?)\\n\\}\\n`, "m"))?.[0] ?? "";
    return !/commitEntry\(/.test(body) && !/postManualJV\(|postDocument\(/.test(body);
  });
  assert("S15 ไม่มีตัวโพสต์บัญชีที่เลี่ยงคอขวด", noCommit.length === 0, noCommit.join(", "));

  const lockNow = new Date();
  const lockKey = `${lockNow.getUTCFullYear()}-${String(lockNow.getUTCMonth() + 1).padStart(2, "0")}`;
  const closed = await gl.closePeriod(A, lockKey, ownerAId);
  assert("S15 ปิดงวดปัจจุบันได้ (positive control)", !!closed, JSON.stringify(closed));
  // 1) เส้นทางเอกสารปกติ
  const lockedDoc = await acc.createDocument({
    tenantId: A.tenantId,
    systemId: A.systemId,
    docType: "INVOICE",
    contactId: contactA.id,
    issueDate: lockNow,
    lines: [{ description: "งวดปิด", qty: 1, unitPrice: 100_00, vatRateBp: 0 }],
    vatMode: "NONE",
  });
  const lockedIssue = await acc.issueDocument(A.tenantId, A.systemId, lockedDoc.id);
  assert("S15 [ทาง 1 เอกสาร] งวดปิดแล้ว → ออกเอกสารลงงวดนั้นไม่ได้", !lockedIssue.ok, JSON.stringify(lockedIssue));
  // 2) เส้นทาง POS (applyExternalSale)
  await refuses("S15 [ทาง 2 POS] applyExternalSale ลงงวดที่ปิดแล้ว → ปฏิเสธ", () =>
    gl.postExternalSale(A, {
      refType: "PosSale",
      refId: `qc-pos-${Date.now()}`,
      date: lockNow,
      totalSatang: 10_000,
      vatSatang: 0,
      financeAccountId: finA.id,
    } as never),
  );
  // 3) เส้นทาง JV ค่าธรรมเนียมจากการกระทบยอด
  await refuses("S15 [ทาง 3 JV กระทบยอด] postManualJV ลงงวดที่ปิดแล้ว → ปฏิเสธ", () =>
    gl.postManualJV(A, {
      date: lockNow,
      memo: "ค่าธรรมเนียมธนาคาร QC",
      lines: [
        { accountCode: "6500", debit: 5_00, credit: 0 },
        { accountCode: "1110", debit: 0, credit: 5_00 },
      ],
    } as never),
  );
  await gl.reopenPeriod(A, lockKey, "เปิดกลับเพื่อทดสอบ QC 9.2", ownerAId);
  const reopened = await acc.issueDocument(A.tenantId, A.systemId, lockedDoc.id);
  assert("S15 positive control: เปิดงวดกลับแล้วออกเอกสารได้", reopened.ok, JSON.stringify(reopened));
  // ล็อกก่อนวันที่ (§9.3) — ตั้งเป็น "พรุ่งนี้" แบบสัมพัทธ์ ไม่ผูกวันที่ตายตัว
  await policy.savePolicy(A, { lockBeforeDate: new Date(Date.now() + 86_400_000) } as never);
  const lockedByDate = await acc.recordPayment(A.tenantId, A.systemId, invA, {
    amount: 1_00,
    channel: "CASH",
    financeAccountId: finA.id,
    paidAt: new Date(),
  });
  assert("S15 ล็อกข้อมูลก่อนวันที่ → รับชำระย้อนหลังไม่ได้", !lockedByDate.ok, JSON.stringify(lockedByDate));
  await policy.savePolicy(A, { lockBeforeDate: null } as never);
  const unlockedPay = await acc.recordPayment(A.tenantId, A.systemId, invA, {
    amount: 1_00,
    channel: "CASH",
    financeAccountId: finA.id,
  });
  assert("S15 positive control: ปลดล็อกแล้วรับชำระได้", unlockedPay.ok, JSON.stringify(unlockedPay));

  // ═══════════════════════════════════════════════════════════
  // S16 — audit trail
  // ═══════════════════════════════════════════════════════════
  console.log("\nS16 audit trail:");
  // (ก) โครงสร้าง: action ที่ต้องมี writeAudit อยู่ในไฟล์ที่รับผิดชอบ
  const AUDIT_REQUIRED: [string, string, string][] = [
    ["อนุมัติเอกสาร", "expense-actions.ts", "account.doc.approve"],
    ["ยกเลิกเอกสาร", "actions.ts", "account.doc.void"],
    ["บันทึกรับ/จ่ายเงิน", "actions.ts", "account.payment.record"],
    ["ยกเลิกการชำระ", "actions.ts", "account.payment.void"],
    ["รวมผู้ติดต่อ", "contact-merge.ts", "account.contact.merge"],
    ["บันทึกตั้งค่า", "settings-actions.ts", "account.settings"],
    ["สิทธิ์ผู้ใช้", "permissions-actions.ts", "account.settings"],
    ["เชื่อมต่อ/API key", "connections-actions.ts", "account.settings"],
    ["คลังเอกสาร (เก็บไฟล์)", "attachment.ts", "account.document.manage"],
    ["ลิงก์ขอใบกำกับ", "actions.ts", "account.doc.public_link"],
    ["นำเข้าข้อมูล", "import-actions.ts", "account.import"],
  ];
  for (const [label, file, action] of AUDIT_REQUIRED) {
    const src = readFileSync(join(MODULE_DIR, file), "utf8");
    assert(
      `S16 มี writeAudit สำหรับ: ${label} (${action} ใน ${file})`,
      /writeAudit\(/.test(src) && src.includes(action),
    );
  }
  // ปิด/เปิดงวด: writeAudit อยู่ที่ inline server action ของหน้า periods (ไม่ใช่ period-close.ts)
  const periodsPageSrc = readFileSync(join(ROUTE_DIR, "periods/page.tsx"), "utf8");
  assert(
    'S16 มี writeAudit สำหรับ: ปิดงวด (account.period.close ใน periods/page.tsx)',
    /writeAudit\(\{[\s\S]{0,200}action: "account\.period\.close"/.test(periodsPageSrc),
  );
  assert(
    'S16 มี writeAudit สำหรับ: เปิดงวดใหม่ (account.period.reopen ใน periods/page.tsx)',
    /writeAudit\(\{[\s\S]{0,200}action: "account\.period\.reopen"/.test(periodsPageSrc),
  );
  // (ข) รันจริง: ทำงานแล้วต้องมีแถว AuditLog โผล่จริง ๆ
  const auditDoc = await acc.createDocument({
    tenantId: A.tenantId,
    systemId: A.systemId,
    docType: "INVOICE",
    contactId: contactA.id,
    lines: [{ description: "audit", qty: 1, unitPrice: 100_00, vatRateBp: 0 }],
    vatMode: "NONE",
  });
  await acc.issueDocument(A.tenantId, A.systemId, auditDoc.id);
  const { writeAudit } = await import("@/lib/modules/account/access");
  await writeAudit({
    tenantId: A.tenantId,
    actorId: ownerAId,
    action: "account.payment.record",
    targetType: "AccountDocument",
    targetId: auditDoc.id,
    after: { qc: true },
  });
  const auditRows = await prisma.auditLog.findMany({ where: { tenantId: A.tenantId, targetId: auditDoc.id } });
  assert("S16 writeAudit เขียนแถวจริงและผูก tenant ถูก", auditRows.length >= 1);
  const { listDocAuditLogs } = await import("@/lib/modules/account/access");
  const docLogs = await listDocAuditLogs(A.tenantId, auditDoc.id);
  assert("S16 อ่านประวัติของเอกสารได้", docLogs.length >= 1, `ได้ ${docLogs.length} แถว`);
  assert(
    "S16 ทุกแถวประวัติมีป้ายไทย (ไม่ใช่โค้ดดิบ)",
    docLogs.length > 0 && docLogs.every((r) => /[ก-๙]/.test(r.actionLabel)),
    docLogs.map((r) => r.actionLabel).join(" | "),
  );
  assert(
    "S16 ประวัติมีรายการ 'บันทึกรับ/จ่ายเงิน' ที่เพิ่งเขียน",
    docLogs.some((r) => r.action === "account.payment.record" && /บันทึกรับ/.test(r.actionLabel)),
    docLogs.map((r) => `${r.action}=${r.actionLabel}`).join(" | "),
  );
  // ประวัติต้องไม่รั่วข้ามร้าน
  const { listAuditLogs } = await import("@/lib/modules/account/access");
  const crossAudit = await listAuditLogs({ tenantId: B.tenantId, targetId: auditDoc.id });
  eq("S16 🔴 ร้าน B อ่านประวัติของเอกสารร้าน A ไม่ได้", crossAudit.rows.length, 0);
  // writeAudit ห้ามทำ action หลักพัง (fire-and-forget)
  const accessSrc = readFileSync(join(MODULE_DIR, "access.ts"), "utf8");
  assert("S16 writeAudit ถูกครอบ try/catch (audit ล้มห้ามทำงานหลักพัง)", /export async function writeAudit[\s\S]*?try \{[\s\S]*?\} catch \{/.test(accessSrc));
  assert("S16 listAuditLogs ผูก tenantId ทุกครั้ง", /tenantId: input\.tenantId, \/\/ ← scope ร้าน/.test(accessSrc));

  // ═══════════════════════════════════════════════════════════
  // S17 — สุขอนามัย
  // ═══════════════════════════════════════════════════════════
  console.log("\nS17 สุขอนามัยโค้ด:");
  const ghost = grepAll(["src/components/account-v2", "src/app/app/sys/[id]/account"], "color-(fg|bg)");
  eq("S17 grep 'color-(fg|bg)' ในขอบเขต 9.2 = ว่าง", ghost.length, 0);
  const anyHits = grepAll(
    ["src/lib/modules/account", "src/components/account-v2", "src/app/app/sys/[id]/account"],
    String.raw`(:\s*any\b|<any>|\bas any\b|\bany\[\])`,
  ).filter((l) => !/^\S+:\d+:\s*(\/\/|\*)/.test(l));
  eq("S17 ไม่มี any ในโมดูลบัญชี", anyHits.length, 0);
  const consoleHits = grepAll(["src/lib/modules/account", "src/app/app/sys/[id]/account"], String.raw`console\.(log|info|debug)\(`);
  eq("S17 ไม่มี console.log/info/debug (เหลือแค่ warn/error ที่ตั้งใจ)", consoleHits.length, 0);
  const warnHits = grepAll(["src/lib/modules/account", "src/app/app/sys/[id]/account"], String.raw`console\.(warn|error)\(`);
  // สิ่งที่รั่วจริงคือการ "ดึงฟิลด์ออกจากระเบียนแล้วยัดลง log" เช่น `${row.name}` / `${c.phone}` /
  //   `${input.email}` / `${…taxId}` — ตัวแปรท้องถิ่นชื่อ `name` ที่ถือ `e.name` (ชนิด error) ไม่ใช่ PII
  //   ⇒ ตัดสินจากรูป **property access** เท่านั้น (แม่นกว่าและไม่ false positive)
  const PII_RE = /\$\{[^}]*\b\w+\.(name|phone|email|taxId|address|contactName)\b/;
  const pii = warnHits
    .map((l) => l.replace(/\b\w*[eE]rr(or)?\.name\b/g, "«errName»").replace(/\be\.name\b/g, "«errName»"))
    .filter((l) => PII_RE.test(l));
  eq("S17 console.warn/error ไม่พิมพ์ข้อมูลลูกค้า (ชื่อ/เบอร์/อีเมล/เลขภาษี)", pii.length, 0);
  const secrets = grepAll(
    ["src", "scripts"],
    String.raw`(sk_(live|test)_[A-Za-z0-9]{10}|vcp_[A-Za-z0-9]{10}|BEAM_(SECRET|API_KEY)\s*=\s*["'][A-Za-z0-9])`,
  );
  eq("S17 ไม่มีคีย์/ความลับฝังในรีโป", secrets.length, 0);
  const hex = grepAll(["src/components/account-v2"], String.raw`#[0-9a-fA-F]{6}\b`).filter((l) => !/\/\/|\/\*/.test(l));
  // 🔴 หนี้ที่รู้ตัว (ไม่ใช่ขอบเขต 9.2 — เกณฑ์ผ่านของ 9.2 อ้าง "ชุด components" ซึ่งคุมไฟล์ของ WO 0.5):
  //    6 ไฟล์นี้ยังมีสี hex ดิบ เพราะเป็น SVG ที่วาดเอง (กราฟ/โดนัท/มิเตอร์) + สีสถานะ 2 จุด
  //    ที่ยังไม่มี token กลางรองรับ · ด่านนี้ทำหน้าที่ **กันไม่ให้ลามไปไฟล์ใหม่** ไม่ใช่บังคับให้แก้ตอนนี้
  //    ⇒ ถ้าจะแก้ ต้องออก token สีกราฟก่อน (งานของ WO ดีไซน์ ไม่ใช่ audit ความปลอดภัย)
  const HEX_DEBT_FILES = [
    "DashChart.tsx",
    "DashStackChart.tsx",
    "DashDonut.tsx",
    "FinanceOverviewPanel.tsx",
    "ReconcilePanel.tsx",
    "ImportWizard.tsx",
  ];
  const hexNew = hex.filter((l) => !HEX_DEBT_FILES.some((f) => l.includes(`account-v2/${f}`)));
  assert("S17 ไม่มีสี hex ดิบในไฟล์ใหม่ของส่วนประกอบ V2 (นอกรายการหนี้ที่รู้ตัว)", hexNew.length === 0, hexNew.slice(0, 5).join(" | "));
  const hexFiles = [...new Set(hex.map((l) => l.split(":")[0]!.replace(/^.*\//, "")))];
  assert(
    `S17 รายการหนี้สี hex ไม่โตขึ้น (ตอนนี้ ${hexFiles.length} ไฟล์ / ${hex.length} บรรทัด)`,
    hexFiles.every((f) => HEX_DEBT_FILES.includes(f)),
    hexFiles.filter((f) => !HEX_DEBT_FILES.includes(f)).join(", "),
  );
  // ข้อ 18 — ข้อสอบรุ่นเก่าเคารพ QC env + กัน prod
  const cpaSrc = readFileSync(join(ROOT, "scripts/qc-account-cpa.mts"), "utf8");
  const cpaActiveLoad = cpaSrc.split("\n").filter((l) => !l.trim().startsWith("//") && /process\.loadEnvFile\(/.test(l));
  assert(
    "S17 qc-account-cpa โหลด env ผ่านด่านกลาง (ไม่มีบรรทัดโค้ดที่เรียก loadEnvFile เอง)",
    /loadLegacyQcEnv\(/.test(cpaSrc) && cpaActiveLoad.length === 0,
    cpaActiveLoad.join(" | "),
  );
  const legacySuites = ["qc-account-cpa", "qc-account-deep", "qc-account-doc-settings", "qc-account-deletion", "qc-account-gatea", "qc-account-qc7", "qc-account-p2p3"];
  const missingGuard = legacySuites.filter((n) => !readFileSync(join(ROOT, `scripts/${n}.mts`), "utf8").includes("loadLegacyQcEnv("));
  eq("S17 ข้อสอบบัญชีรุ่นเก่าทุกชุดผ่านด่าน env เดียวกัน", missingGuard.length, 0);
  const qcAllSrc = readFileSync(join(ROOT, "scripts/qc-all.mts"), "utf8");
  assert("S17 qc:all มีด่านกัน production", /isProdDbUrl\(process\.env\.DATABASE_URL\)/.test(qcAllSrc) && /ALLOW_PROD_QC/.test(qcAllSrc));
  const guardSrc = readFileSync(join(ROOT, "scripts/qc-env-guard.mts"), "utf8");
  assert("S17 ด่าน env ไม่มี URL/รหัสผ่านจริงในไฟล์ (เก็บแค่ชิ้นส่วน host)", !/postgres(ql)?:\/\//.test(guardSrc));

  // ข้อ 19 — entryId ถูกเขียนกลับแล้ว
  console.log("\nS18 (ข้อ 19) entryId ของ payment:");
  const entryInv = await mkInvoiceA(120_00);
  const entryPay = await acc.recordPayment(A.tenantId, A.systemId, entryInv, {
    amount: 120_00,
    channel: "CASH",
    financeAccountId: finA.id,
  });
  assert("S18 รับชำระเพื่อทดสอบ entryId ได้", entryPay.ok, JSON.stringify(entryPay));
  if (entryPay.ok && entryPay.paymentId) {
    const payRow = await prisma.accountDocumentPayment.findUnique({
      where: { id: entryPay.paymentId },
      select: { entryId: true },
    });
    assert("S18 🔴 AccountDocumentPayment.entryId ถูกเขียนกลับ (เดิม null เสมอ)", !!payRow?.entryId, `ได้ ${payRow?.entryId}`);
    if (payRow?.entryId) {
      const entry = await prisma.accountJournalEntry.findUnique({
        where: { id: payRow.entryId },
        select: { systemId: true, refType: true, refId: true },
      });
      eq("S18 entryId ชี้ JV ของ payment ใบนั้นจริง", entry?.refId, entryPay.paymentId);
      eq("S18 entryId อยู่ในระบบเดียวกัน", entry?.systemId, A.systemId);
      eq("S18 refType ถูกต้อง", entry?.refType, "AccountDocumentPayment");
    }
  }
} catch (e) {
  bad("สคริปต์ล้มกลางทาง", e instanceof Error ? (e.stack ?? e.message) : String(e));
} finally {
  // ─── cleanup: ลบเฉพาะข้อมูลของ 2 ร้านทดสอบ ───
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.log("  [cleanup] ข้าม: " + (e instanceof Error ? e.message : String(e)));
    }
  };
  for (const tenantId of tenantIds) {
    await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountPaymentRequest.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountAttachment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountProduct.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountContact.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountFinance.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountPeriod.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountSettings.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appNotification.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystemUnit.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId } }));
    await del(() => prisma.auditLog.deleteMany({ where: { tenantId } }));
    await del(() => prisma.membership.deleteMany({ where: { tenantId } }));
    await del(() => prisma.tenant.delete({ where: { id: tenantId } }));
  }
  for (const uid of userIds) await del(() => prisma.user.delete({ where: { id: uid } }));
  console.log("\n[cleanup] ลบ test data (2 ร้าน) เรียบร้อย");
}

console.log(`\n===== สรุป: ผ่าน ${passed} · ไม่ผ่าน ${findings.length} =====`);
if (findings.length > 0) console.log(findings.map((f) => "  • " + f).join("\n"));
console.log(findings.length === 0 ? "🎉 WO 9.2 ผ่านทั้งหมด\n" : "⚠️ มีข้อไม่ผ่าน\n");
await prisma.$disconnect();
process.exit(findings.length === 0 ? 0 : 1);

// ─────────────────── helpers ───────────────────
/** grep -rnE ในหลายโฟลเดอร์ · คืนบรรทัดแบบ path สัมพัทธ์ (ไม่เจอ = []) */
function grepAll(dirs: string[], pattern: string): string[] {
  const hits: string[] = [];
  for (const d of dirs) {
    try {
      const out = execFileSync("grep", ["-rnE", "--", pattern, join(ROOT, d)], { encoding: "utf8" });
      hits.push(...out.split("\n").filter(Boolean).map((l) => l.replace(ROOT + "/", "")));
    } catch {
      // grep exit 1 = ไม่เจอ
    }
  }
  return hits;
}
