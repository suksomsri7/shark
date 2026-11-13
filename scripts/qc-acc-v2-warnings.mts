// QC ACC T0.4 — กลไกคำเตือนกฎหมายกลาง + บล็อกกฎหมายกลายเป็นคำเตือนที่กดยืนยันผ่านได้
//
// ใบงาน: ledger/ACCOUNT-TAX-PLAN.md แถว T0.4 · design note ledger/wo-notes/T0.4.md
// ฟิกซ์เจอร์ของตัวเอง (ร้านทิ้ง สร้างเอง ลบใน finally) — ไม่พึ่ง seed กลาง
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-warnings.mts
//
// ครอบคลุม
//   W1  ทะเบียน: ทุกรหัสมีมาตรา/แหล่ง + ป้าย V/V2/S/U + วันที่ตรวจ · [S]/[U] ต่อท้าย "โปรดตรวจกับนักบัญชี" · ไม่มีคำ "ถูกกฎหมาย"
//       · รหัสของ T0.2 อยู่ในทะเบียนเดียวกัน (th-tax-2569/legal-values ไม่สร้างคำเตือนเอง)
//   W2  ใบกำกับภาษีเมื่อไม่จด VAT + ไม่มีเลขผู้ขาย: ไม่ยืนยัน = คืนคำเตือน (ok:false + legal ไม่ crash · ยังเป็นร่าง)
//       · ยืนยันไม่ครบ = ยังไม่ผ่าน · ยืนยันครบ = ออกได้ + AuditLog legal.warning.ack (ใคร · รหัส · เอกสาร)
//   W3  ใบลดหนี้ (ขาย) / รับใบลดหนี้ (ซื้อ) ไม่มีเหตุผล: แบบเดียวกัน
//   W4  ลิงก์ขอใบกำกับ: ผู้ซื้อไม่มีเลข = รับคำขอ + คำเตือน BUYER_TAX_ID_MISSING (บนคำขอด้วย) · เลขผิดหลักตรวจ = ยังปฏิเสธ
//   W5  บัตรกำนัล: อายุ < 12 เดือน ไม่ยืนยัน = LegalAckRequiredError (ไม่ใช่ error อื่น) · ยืนยัน = บันทึก + AuditLog
//   W6  REST: 409 legal_ack_required + error.warnings[] รูปเดียวกับทะเบียน · ส่งซ้ำ (คีย์เดิม) พร้อม acknowledge = 200 + ผู้ยืนยัน API key
//   W7  จอ/เลขา: คอมโพเนนต์กลางตัวเดียวใช้ทุกจุด · ข้อความถึงเลขามีรหัสให้ส่งซ้ำ · ไม่ใช้ emoji
//   W8  ค้างจาก T0.2: ตัวอ่านค่ากฎหมายในโมดูลบัญชีใช้นาฬิกาโมดูล (accountNow) ไม่ใช่ new Date()
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-warnings");
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 400)}`}`);
};
const codes = (w: { code: string }[] | undefined) => (w ?? []).map((x) => x.code).sort();
const ROOT = process.cwd();
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const W = (await import("@/lib/core/settings/legal/warnings" as string)) as Any;
const TH = (await import("@/lib/core/settings/legal/th-tax-2569" as string)) as Any;
const LV = (await import("@/lib/modules/account/legal-values" as string)) as Any;

// ═══ W1 ทะเบียนกลาง ═══
console.log("\nW1 ทะเบียนคำเตือน:");
{
  const all: string[] = [...W.LEGAL_WARNING_CODES];
  const defs = all.map((c) => W.LEGAL_WARNINGS[c]);
  chk("W1.1", "ทุกรหัสมีแถวในทะเบียน (code ตรงกุญแจ)", defs.every((d: Any, i: number) => d && d.code === all[i]), "ครบ", all.filter((c) => !W.LEGAL_WARNINGS[c]));
  chk("W1.2", "ทุกแถวมีมาตรา/แหล่ง (citation)", defs.every((d: Any) => typeof d.citation === "string" && d.citation.length >= 10), "มี", defs.filter((d: Any) => !d.citation).map((d: Any) => d.code));
  chk("W1.3", "ทุกแถวมีป้าย V/V2/S/U", defs.every((d: Any) => ["V", "V2", "S", "U"].includes(d.tag)), "V/V2/S/U", defs.map((d: Any) => `${d.code}:${d.tag}`));
  chk("W1.4", "ทุกแถวมีวันที่ตรวจ YYYY-MM-DD", defs.every((d: Any) => /^\d{4}-\d{2}-\d{2}$/.test(d.checkedAt)), "มี", defs.filter((d: Any) => !/^\d{4}-\d{2}-\d{2}$/.test(d.checkedAt)).map((d: Any) => d.code));
  const built = all.map((c) => W.legalWarning(c, { shop: "2%", system: "3%", ymd: "2026-11-13", value: "7%", months: 6, default: 12 }));
  chk("W1.5", "คำเตือนที่สร้างแล้วมี code · messageTh · citation · tag · checkedAt · ack ครบ", built.every((w: Any) => w.code && w.messageTh && w.citation && w.tag && w.checkedAt && typeof w.ack === "boolean"), "ครบ", built[0]);
  const su = built.filter((w: Any) => w.tag === "S" || w.tag === "U");
  chk("W1.6", "ป้าย [S]/[U] ทุกข้อบอกว่าเป็นค่าเริ่มต้นของระบบ + โปรดตรวจกับนักบัญชีของร้าน", su.length > 0 && su.every((w: Any) => w.messageTh.includes(W.CHECK_WITH_ACCOUNTANT_TH) && w.messageTh.includes("ค่าเริ่มต้นของระบบ")), "ครบ", su.filter((w: Any) => !w.messageTh.includes(W.CHECK_WITH_ACCOUNTANT_TH)).map((w: Any) => w.code));
  chk("W1.7", "ไม่มีข้อความใดบอกว่าสิ่งใด \"ถูกกฎหมาย\" / \"ตามกฎหมายแล้ว\"", built.every((w: Any) => !/ถูกกฎหมาย|ตามกฎหมายแล้ว|ชอบด้วยกฎหมาย/.test(w.messageTh)), "ไม่มี", built.filter((w: Any) => /ถูกกฎหมาย/.test(w.messageTh)).map((w: Any) => w.code));
  const converted = ["TAX_INVOICE_NOT_VAT_REGISTERED", "TAX_INVOICE_SELLER_TAX_ID_MISSING", "ADJUST_NOTE_REASON_MISSING", "GIFTCARD_EXPIRY_BELOW_DEFAULT"];
  chk("W1.8", "บล็อกเดิม 4 ชนิดเป็นคำเตือนที่ต้องกดยืนยัน (ack=true) · คำเตือนของตาราง T0.2 ไม่ต้องยืนยัน", converted.every((c) => W.LEGAL_WARNINGS[c].ack === true) && ["SHOP_DIFFERS_FROM_DEFAULT", "UNVERIFIED_DEFAULT", "NO_ROW_FOR_DATE", "NO_ROW", "EWHT_NOT_IN_EFFECT", "ENTITY_KIND_UNSET", "RECIPIENT_ASSUMED"].every((c) => W.LEGAL_WARNINGS[c].ack === false), "ตามนั้น", converted.map((c) => `${c}:${W.LEGAL_WARNINGS[c].ack}`));
  chk("W1.9", "คำเตือนที่อ้างตัวบทจริงระบุมาตรา (ม./ฉ./พ.ร.บ.) ใน citation", converted.every((c) => /ม\.\d|ฉบับที่|ฉ\.\d|พ\.ร\.บ\./.test(W.LEGAL_WARNINGS[c].citation)), "มี", converted.map((c) => W.LEGAL_WARNINGS[c].citation));
  // T0.2 fold-in
  chk("W1.10", "th-tax-2569 ใช้ legalWarning ตัวเดียวกับทะเบียน (re-export ไม่ใช่ของซ้ำ)", TH.legalWarning === W.legalWarning && TH.CHECK_WITH_ACCOUNTANT_TH === W.CHECK_WITH_ACCOUNTANT_TH, "ตัวเดียวกัน", "ต่าง");
  const inline = /code:\s*"[A-Z_]+",\s*messageTh/;
  const offenders = ["src/lib/core/settings/legal/th-tax-2569.ts", "src/lib/modules/account/legal-values.ts"].filter((p) => inline.test(strip(src(p))));
  chk("W1.11", "th-tax-2569.ts / legal-values.ts ไม่สร้างคำเตือนเอง (ทุกคำเตือนผ่าน legalWarning ของทะเบียน)", offenders.length === 0, [], offenders);
  const v = LV.legalValueFrom({ entityKind: "UNSET", shop: { vat: [], wht: [], deadline: [] } }, "wht.rate", new Date("2026-11-13T05:00:00Z"), { incomeType: "M40_2" });
  const reg = v.warnings.every((w: Any) => W.isLegalWarningCode(w.code) && w.tag && w.checkedAt);
  chk("W1.12", "คำเตือนจากตัวอ่าน T0.2 (ENTITY_KIND_UNSET/RECIPIENT_ASSUMED) มาจากทะเบียน (มีป้าย+วันตรวจ)", v.warnings.length >= 2 && reg, "มาจากทะเบียน", v.warnings);
}

// ═══ W7/W8 แหล่งโค้ด (ไม่แตะฐาน) ═══
console.log("\nW7 จอ/เลขา + W8 นาฬิกา:");
{
  const comp = strip(src("src/components/account-v2/LegalWarnings.tsx")); // หมายเหตุในคอมเมนต์ (🔴 ของทีม) ไม่นับ
  chk("W7.1", "คอมโพเนนต์กลางใช้ไอคอน warn ของ AccountIcon · ไม่มี emoji · ไม่มีสี hex", /AccountIcon name="warn"/.test(comp) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(comp) && !/#[0-9a-fA-F]{6}\b/.test(comp), "ตามนั้น", "ไม่ตรง");
  const users = ["src/components/account-v2/DocDetailPage.tsx", "src/components/account-v2/LegalValuesPanel.tsx", "src/components/member/GiftCardSettingsForm.tsx"];
  chk("W7.2", "หน้าเอกสาร · ตารางค่ากฎหมาย · ตั้งค่าบัตรกำนัล ใช้คอมโพเนนต์เดียวกัน (LegalWarnings)", users.every((p) => /<LegalWarnings\b/.test(src(p))), "ทุกหน้า", users.filter((p) => !/<LegalWarnings\b/.test(src(p))));
  const aiSrc = src("src/lib/ai/account-ops.ts");
  chk("W7.3", "เลขา AI: error legal_ack_required ต่อท้ายทางทำต่อ (hint มีรหัส) — ไม่ใช่ข้อความดิบ", /legal_ack_required/.test(aiSrc) && /function aiErrorTh/.test(aiSrc), "มี", "ไม่มี");
  const gc = strip(src("src/lib/modules/giftcard/service.ts")) + strip(src("src/components/member/GiftCardSettingsForm.tsx")) + strip(src("src/components/member/GiftCardsBoard.tsx"));
  chk("W7.4", "บัตรกำนัล: ไม่มีข้อความ \"ขั้นต่ำตามกฎหมาย\" ที่ผู้ใช้เห็นแล้ว", !/ขั้นต่ำตามกฎหมาย|ที่กฎหมายกำหนด/.test(gc), "ไม่มี", "ยังมี");
  const acct = ["product.ts", "policy.ts", "group.ts", "payment.ts", "inbox-ai.ts", "editor-actions.ts", "recurring-actions.ts", "service.ts", "api/ops/documents-write.ts", "api/ops/settings-write.ts"]
    .map((f) => `src/lib/modules/account/${f}`)
    .filter((p) => /(vatRateBpAt|vatRuleAt|vatRuleFrom|legalUiOptionsAt|settingsViewOf|bookTaxView)\([^\n]*new Date\(\)/.test(src(p)));
  chk("W8.1", "ตัวอ่านค่ากฎหมาย T0.2 ในโมดูลบัญชีไม่ใช้ new Date() (ใช้ accountNow)", acct.length === 0, [], acct, "MAJOR");
}

// ═══ ฐานข้อมูล: W2–W6 ═══
let tid = "";
const users: string[] = [];
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const exp = (await import("@/lib/modules/account/expense" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const GC = (await import("@/lib/modules/giftcard/service" as string)) as Any;
  const ACK = (await import("@/lib/core/legal-ack" as string)) as Any;
  const RESP = (await import("@/lib/api/respond" as string)) as Any;

  const stamp = Date.now();
  const t = await prisma.tenant.create({ data: { name: "QC T0.4 warnings", slug: `qc-t04-${stamp}` } });
  tid = t.id;
  const owner = await prisma.user.create({ data: { email: `qc-t04-${stamp}@qc.local`, name: "เจ้าของ T0.4" } });
  users.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() } });

  // สมุด A: ไม่จด VAT + ไม่มีเลขผู้ขาย (ร้านเลือกออกใบกำกับเองหลังเห็นคำเตือน)
  const sA = (await sys.createSystem(tid, "ACCOUNT", "บัญชี T0.4 ไม่จด VAT")).id;
  await acc.saveSettings(tid, sA, { orgName: "ร้าน T0.4 ไม่จด", vatRegistered: false });
  await gl.ensureAccounting({ tenantId: tid, systemId: sA });
  // สมุด B: จด VAT + มีเลข (ใช้ทดสอบใบลดหนี้ ลิงก์ขอใบกำกับ และ REST)
  const sB = (await sys.createSystem(tid, "ACCOUNT", "บัญชี T0.4 จด VAT")).id;
  await acc.saveSettings(tid, sB, { orgName: "ร้าน T0.4 จด", vatRegistered: true, vatRateBp: 700, taxId: "0105561000000" });
  await gl.ensureAccounting({ tenantId: tid, systemId: sB });
  const cust = await acc.createContact({ tenantId: tid, systemId: sA, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า T0.4", taxId: "0105561999991", branchCode: "00000" });
  const custB = await acc.createContact({ tenantId: tid, systemId: sB, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า B T0.4", taxId: "0105561999992", branchCode: "00000" });
  const vendB = await acc.createContact({ tenantId: tid, systemId: sB, kind: "VENDOR", legalType: "COMPANY", name: "ผู้ขาย B T0.4", taxId: "0105561888881", branchCode: "00000" });
  const line = { description: "บริการ T0.4", qty: 1, unitPrice: 100_000, discount: 0, vatRateBp: 700 };
  const ackRows = (targetId: string) => prisma.auditLog.findMany({ where: { tenantId: tid, action: "legal.warning.ack", targetId } });

  // ═══ W2 ใบกำกับภาษี ═══
  console.log("\nW2 ใบกำกับภาษี (ไม่จด VAT · ไม่มีเลขผู้ขาย):");
  {
    const ti = await acc.createDocument({ tenantId: tid, systemId: sA, docType: "TAX_INVOICE", contactId: cust.id, vatMode: "EXCLUDE", lines: [line], createdById: owner.id });
    const r0 = await acc.issueDocument(tid, sA, ti.id);
    chk("W2.1", "ไม่ยืนยัน → ok:false + legal LEGAL_ACK_REQUIRED (ไม่ใช่ error ดิบ)", r0.ok === false && r0.legal?.code === "LEGAL_ACK_REQUIRED", "legal", r0);
    eqCodes("W2.2", "คำเตือน = ไม่จด VAT + ไม่มีเลขผู้ขาย (มีมาตรา ม.86/13 · ม.86/4)", r0.legal?.warnings, ["TAX_INVOICE_NOT_VAT_REGISTERED", "TAX_INVOICE_SELLER_TAX_ID_MISSING"]);
    // T0.4b (เจ้าของตัดสิน 13 พ.ย.) — ใบไม่ถูกบังคับเป็น "ไม่มี VAT" · ข้อความบอกยอด VAT ของใบ (100,000 สต. × 7% = ฿70.00)
    const tiRow = await prisma.accountDocument.findUnique({ where: { id: ti.id }, select: { vatMode: true, vatAmount: true } });
    chk("W2.3a", "T0.4b: ร่างใบกำกับของสมุดไม่จด VAT คงโหมด VAT ที่ตั้ง (EXCLUDE · VAT 7,000 สต.)", tiRow?.vatMode === "EXCLUDE" && tiRow?.vatAmount === 7_000, "EXCLUDE/7000", tiRow);
    const nv = (r0.legal?.warnings ?? []).find((w: Any) => w.code === "TAX_INVOICE_NOT_VAT_REGISTERED");
    chk("W2.3b", "T0.4b: ข้อความบอกว่าใบนี้ยังคิด VAT ฿70.00 + ระบบไม่เปลี่ยนเป็นไม่มี VAT + ให้แก้โหมด VAT", !!nv && /ยังคิดภาษีมูลค่าเพิ่ม ฿70\.00/.test(nv.messageTh) && /ไม่เปลี่ยนเป็น "ไม่มี VAT"/.test(nv.messageTh) && /แก้โหมด VAT/.test(nv.messageTh), "มี", nv);
    const w0 = W;
    chk("W2.3c", "T0.4b: ผู้เรียกไม่ส่งยอด → ข้อความบอกว่าคิดตามโหมดที่ตั้ง · ยอด 0 → บอก ฿0.00", /ตามโหมด VAT ที่ตั้งไว้ในเอกสาร/.test(w0.legalWarning("TAX_INVOICE_NOT_VAT_REGISTERED").messageTh) && /฿0\.00/.test(w0.legalWarning("TAX_INVOICE_NOT_VAT_REGISTERED", { vat: "0.00" }).messageTh), "ครบ", null);
    chk("W2.3", "คำเตือนอ้าง ม.86/13 และ ม.86/4(2)", (r0.legal?.warnings ?? []).some((w: Any) => /86\/13/.test(w.citation)) && (r0.legal?.warnings ?? []).some((w: Any) => /86\/4/.test(w.citation)), "มี", r0.legal?.warnings);
    const st0 = await prisma.accountDocument.findUnique({ where: { id: ti.id }, select: { status: true, docNo: true } });
    chk("W2.4", "ยังเป็นร่าง · ไม่กินเลขที่ · ไม่มีแถวยืนยัน", st0?.status === "DRAFT" && !st0.docNo && (await ackRows(ti.id)).length === 0, "DRAFT", st0);
    const r1 = await acc.issueDocument(tid, sA, ti.id, { ack: { codes: ["TAX_INVOICE_NOT_VAT_REGISTERED"], actorId: owner.id } });
    chk("W2.5", "ยืนยันไม่ครบ (1 ใน 2) → ยังคืนคำเตือนทั้งชุด ไม่ออก", r1.ok === false && codes(r1.legal?.warnings).length === 2 && (await ackRows(ti.id)).length === 0, "ยังไม่ออก", r1);
    const r2 = await acc.issueDocument(tid, sA, ti.id, { ack: { codes: ["TAX_INVOICE_NOT_VAT_REGISTERED", "TAX_INVOICE_SELLER_TAX_ID_MISSING"], actorId: owner.id, via: "screen" } });
    chk("W2.6", "ยืนยันครบ → ออกได้ (ok + เลขที่)", r2.ok === true && !!r2.docNo, "ok", r2);
    const tiAfter = await prisma.accountDocument.findUnique({ where: { id: ti.id }, select: { vatMode: true, vatAmount: true } });
    chk("W2.6a", "T0.4b: หลังกดยืนยัน ระบบไม่เปลี่ยนใบเป็นไม่มี VAT (EXCLUDE · 7,000 สต.)", tiAfter?.vatMode === "EXCLUDE" && tiAfter?.vatAmount === 7_000, "EXCLUDE/7000", tiAfter);
    const rows = await ackRows(ti.id);
    const a = rows[0]?.after as Any;
    chk("W2.7", "AuditLog legal.warning.ack 1 แถว: ผู้ยืนยัน = เจ้าของ · เอกสาร · รหัส 2 ตัว · มาตรา+ป้าย+วันตรวจ", rows.length === 1 && rows[0]!.actorId === owner.id && rows[0]!.actorType === "USER" && rows[0]!.targetType === "AccountDocument" && JSON.stringify([...(a?.codes ?? [])].sort()) === JSON.stringify(["TAX_INVOICE_NOT_VAT_REGISTERED", "TAX_INVOICE_SELLER_TAX_ID_MISSING"]) && a?.op === "account.doc.issue" && a?.via === "screen" && (a?.warnings ?? []).every((w: Any) => w.citation && w.tag && w.checkedAt), "ครบ", rows);
    const hist = await ACK.listLegalAcks(tid, "AccountDocument", ti.id);
    chk("W2.8", "ตัวอ่านประวัติ listLegalAcks คืนแถวเดียวกัน", hist.length === 1 && hist[0].actorId === owner.id && hist[0].codes.length === 2, "1", hist);
    // ใบแจ้งหนี้ธรรมดา = ไม่มีคำเตือน (ด่านไม่รบกวนงานปกติ)
    const iv = await acc.createDocument({ tenantId: tid, systemId: sA, docType: "INVOICE", contactId: cust.id, vatMode: "NONE", lines: [{ ...line, vatRateBp: 0 }], createdById: owner.id });
    const rIv = await acc.issueDocument(tid, sA, iv.id);
    chk("W2.9", "positive control: ใบแจ้งหนี้ของสมุดเดียวกันออกได้เลย ไม่มีคำเตือน/แถวยืนยัน", rIv.ok === true && (await ackRows(iv.id)).length === 0, "ok", rIv);
  }

  // ═══ W3 ใบลด/เพิ่มหนี้ไม่มีเหตุผล ═══
  console.log("\nW3 ใบลด/เพิ่มหนี้ไม่มีเหตุผล:");
  {
    const cn = await acc.createDocument({ tenantId: tid, systemId: sB, docType: "CREDIT_NOTE", contactId: custB.id, vatMode: "EXCLUDE", lines: [{ ...line, unitPrice: 10_000 }], createdById: owner.id, adjustReason: null });
    // ORACLE-EDIT (ACC T2.3 เลน 2): ใบลด/เพิ่มหนี้ไม่อ้างใบเดิม = คำเตือนใหม่ ADJUST_NOTE_ORIGINAL_MISSING · ข้อ W3 ตรวจ "เหตุผล" อย่างเดียว ⇒
    //   ใส่เลขที่ใบเดิม (นอกระบบ) ในช่องอ้างอิง/เลขเอกสารผู้ขาย ให้เหลือคำเตือนเหตุผลตัวเดียวเหมือนเดิม
    const refOut = (id: string, purchase = false) => prisma.accountDocument.update({ where: { id }, data: { reference: "TX-นอกระบบ-0001", ...(purchase ? { vendorInvoiceDate: new Date() } : {}) } });
    await refOut(cn.id);
    const c0 = await acc.issueDocument(tid, sB, cn.id);
    eqCodes("W3.1", "CN ไม่มีเหตุผล ไม่ยืนยัน → คำเตือน ADJUST_NOTE_REASON_MISSING (ไม่ crash)", c0.ok === false ? c0.legal?.warnings : [{ code: "ISSUED!" }], ["ADJUST_NOTE_REASON_MISSING"]);
    chk("W3.2", "ข้อความยังพูดถึง \"เหตุผล\" (ผู้ใช้รู้ว่าขาดอะไร)", c0.ok === false && /เหตุผล/.test(c0.reason), "มี", c0);
    const c1 = await acc.issueDocument(tid, sB, cn.id, { ack: { codes: ["ADJUST_NOTE_REASON_MISSING"], actorId: owner.id } });
    const cRows = await ackRows(cn.id);
    chk("W3.3", "CN ยืนยัน → ออกได้ + แถวยืนยัน 1", c1.ok === true && cRows.length === 1 && (cRows[0]!.after as Any)?.codes?.[0] === "ADJUST_NOTE_REASON_MISSING", "ok", { c1, n: cRows.length });
    const cnOk = await acc.createDocument({ tenantId: tid, systemId: sB, docType: "DEBIT_NOTE", contactId: custB.id, vatMode: "EXCLUDE", lines: [{ ...line, unitPrice: 10_000 }], createdById: owner.id, adjustReason: "ส่งของเกิน" });
    await refOut(cnOk.id);
    const dOk = await acc.issueDocument(tid, sB, cnOk.id);
    chk("W3.4", "positive control: DN มีเหตุผล → ออกได้เลย ไม่มีแถวยืนยัน", dOk.ok === true && (await ackRows(cnOk.id)).length === 0, "ok", dOk);
    const cnr = await exp.createExpenseDoc({ tenantId: tid, systemId: sB, docType: "CREDIT_NOTE_RECEIVED", contactId: vendB.id, issueDate: new Date(), vatMode: "EXCLUDE", vatPurchaseMode: "CLAIM", lines: [{ ...line, unitPrice: 10_000 }], createdById: owner.id, adjustReason: "  " });
    await refOut(cnr.id, true);
    const e0 = await exp.issueExpenseDoc(tid, sB, cnr.id);
    eqCodes("W3.5", "รับใบลดหนี้ (ซื้อ) เหตุผลว่าง ไม่ยืนยัน → คำเตือนเดียวกัน", e0.ok === false ? e0.legal?.warnings : [{ code: "ISSUED!" }], ["ADJUST_NOTE_REASON_MISSING"]);
    const e1 = await exp.issueExpenseDoc(tid, sB, cnr.id, { ack: { codes: ["ADJUST_NOTE_REASON_MISSING"], actorId: owner.id } });
    chk("W3.6", "รับใบลดหนี้ ยืนยัน → บันทึกได้ + แถวยืนยัน", e1.ok === true && (await ackRows(cnr.id)).length === 1, "ok", e1);
  }

  // ═══ W4 ลิงก์ขอใบกำกับ ═══
  console.log("\nW4 ลิงก์ขอใบกำกับ (ผู้ซื้อไม่มีเลข):");
  {
    const rc = await acc.createDocument({ tenantId: tid, systemId: sB, docType: "RECEIPT", contactId: null, vatMode: "INCLUDE", lines: [{ description: "ขายสด", qty: 1, unitPrice: 32_100 }] });
    await acc.issueDocument(tid, sB, rc.id);
    const link = await acc.ensurePublicTaxInvoiceLink(tid, sB, rc.id);
    const bad = link.ok ? await acc.issuePublicTaxInvoice(link.token, { name: "เลขผิด", taxId: "1111111111111" }) : { ok: true };
    chk("W4.1", "เลขที่กรอกมาแต่หลักตรวจผิด → ยังปฏิเสธ (กันพิมพ์ผิด ไม่ใช่เหตุผลกฎหมาย)", link.ok && bad.ok === false, "ปฏิเสธ", { link: link.ok, bad });
    const pub = link.ok ? await acc.issuePublicTaxInvoice(link.token, { name: "นายผู้ซื้อทั่วไป", taxId: "" }) : { ok: false };
    chk("W4.2", "ไม่มีเลขผู้ซื้อ → รับคำขอได้ + คำเตือน BUYER_TAX_ID_MISSING (อ้าง ฉ.39 ข้อ 7)", pub.ok === true && pub.requested === true && codes(pub.warnings).join() === "BUYER_TAX_ID_MISSING" && /39/.test(pub.warnings[0].citation), "ok+เตือน", pub);
    const req = await prisma.accountDocument.findFirst({ where: { systemId: sB, docType: "TAX_INVOICE", sourceDocId: rc.id }, select: { status: true, contactSnapshot: true, internalNote: true } });
    const snap = req?.contactSnapshot as Any;
    chk("W4.3", "คำขอร่าง: ผู้ซื้อ = บุคคล ไม่มีเลข · หมายเหตุภายในมีคำเตือน (ผู้อนุมัติเห็น)", req?.status === "DRAFT" && snap?.taxId === null && snap?.legalType === "PERSON" && /คำเตือน/.test(req?.internalNote ?? ""), "ครบ", req);
  }

  // ═══ W5 บัตรกำนัล ═══
  console.log("\nW5 บัตรกำนัล (อายุ < 12 เดือน):");
  {
    const mem = (await sys.createSystem(tid, "MEMBER", "สมาชิก T0.4")).id;
    const ctx = { tenantId: tid, systemId: mem, actorUserId: owner.id };
    const actor = { userId: owner.id, role: "OWNER", unitAccess: ["*"], permissions: {} };
    let err: unknown = null;
    try { await GC.setSettings(ctx, actor, { expiryMonths: 6 }); } catch (e) { err = e; }
    chk("W5.1", "6 เดือน ไม่ยืนยัน → LegalAckRequiredError (คำเตือน ไม่ใช่ error อื่น) · ค่าเดิมไม่เปลี่ยน", W.isLegalAckRequiredError(err) && codes((err as Any).warnings).join() === "GIFTCARD_EXPIRY_BELOW_DEFAULT" && (await GC.getSettings(ctx)).expiryMonths !== 6, "เตือน", String(err));
    chk("W5.2", "คำเตือนบัตรกำนัลป้าย [U] + อ้าง ม.4 + บอกตรวจกับนักบัญชี · ไม่เขียนว่าขั้นต่ำตามกฎหมาย", (err as Any)?.warnings?.[0]?.tag === "U" && /ม\.4/.test((err as Any)?.warnings?.[0]?.citation ?? "") && /โปรดตรวจกับนักบัญชี/.test((err as Any)?.warnings?.[0]?.messageTh ?? "") && !/ขั้นต่ำตามกฎหมาย/.test((err as Any)?.warnings?.[0]?.messageTh ?? ""), "ตามนั้น", (err as Any)?.warnings);
    const saved = await GC.setSettings(ctx, actor, { expiryMonths: 6 }, { ack: ["GIFTCARD_EXPIRY_BELOW_DEFAULT"] });
    const gRows = await prisma.auditLog.findMany({ where: { tenantId: tid, action: "legal.warning.ack", targetType: "GiftCardSettings", targetId: mem } });
    chk("W5.3", "ยืนยัน → บันทึก 6 เดือน + แถวยืนยัน (ผู้ยืนยัน = เจ้าของ)", saved.expiryMonths === 6 && (await GC.getSettings(ctx)).expiryMonths === 6 && gRows.length === 1 && gRows[0]!.actorId === owner.id, "6 + 1 แถว", { saved: saved.expiryMonths, rows: gRows.length });
    const again = await GC.setSettings(ctx, actor, { transferable: false });
    chk("W5.4", "แก้ช่องอื่นภายหลัง (อายุยัง 6) ไม่ต้องยืนยันซ้ำ", again.transferable === false && again.expiryMonths === 6, "ผ่าน", again);
    let e0: unknown = null;
    try { await GC.setSettings(ctx, actor, { expiryMonths: 0 }); } catch (e) { e0 = e; }
    chk("W5.5", "อายุ 0 เดือน = ข้อมูลผิด (ยังปฏิเสธ ไม่ใช่คำเตือน)", !!e0 && !W.isLegalAckRequiredError(e0), "ปฏิเสธ", String(e0), "MAJOR");
  }

  // ═══ W6 REST ═══
  console.log("\nW6 REST (409 legal_ack_required):");
  {
    const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
    const scopes = (await import("@/lib/api-keys/scopes" as string)) as Record<string, Any>;
    const route = (await import("@/app/api/v1/account/[...path]/route" as string)) as Record<string, (req: Request, ctx: { params: Promise<{ path: string[] }> }) => Promise<Response>>;
    const key = (await ak.createApiKey({ tenantId: tid }, "T0.4 accountant", { scopes: scopes.expandBundles(["accountant"]), systemId: sB })).rawKey as string;
    const call = async (method: string, path: string, body: unknown, idem: string) => {
      const req = new Request(`http://x/api/v1/account${path}`, { method, headers: { authorization: `Bearer ${key}`, "idempotency-key": idem, "content-type": "application/json" }, body: JSON.stringify(body) });
      const res = await route[method]!(req, { params: Promise.resolve({ path: path.split("/").filter(Boolean) }) });
      const text = await res.text();
      let parsed: Any = null; try { parsed = JSON.parse(text); } catch { parsed = { _raw: text }; }
      return { status: res.status, body: parsed };
    };
    const cn = await acc.createDocument({ tenantId: tid, systemId: sB, docType: "CREDIT_NOTE", contactId: custB.id, vatMode: "EXCLUDE", lines: [{ ...line, unitPrice: 5_000 }], createdById: owner.id, adjustReason: "" });
    await prisma.accountDocument.update({ where: { id: cn.id }, data: { reference: "TX-นอกระบบ-0002" } }); // ORACLE-EDIT (T2.3): ดู W3 — ข้อนี้ตรวจรูป 409 ของคำเตือนเหตุผลตัวเดียว
    const idem = `t04-${stamp}`;
    const r0 = await call("POST", `/documents/${cn.id}/issue`, {}, idem);
    const w = r0.body?.error?.warnings ?? [];
    chk("W6.1", "ไม่ส่ง acknowledge → 409 legal_ack_required + error.warnings[] (รหัส ADJUST_NOTE_REASON_MISSING)", r0.status === 409 && r0.body?.error?.code === "legal_ack_required" && codes(w).join() === "ADJUST_NOTE_REASON_MISSING", "409", r0);
    chk("W6.2", "รูป warnings[] = LegalWarning ของทะเบียน (code · messageTh · citation · tag · checkedAt · ack)", w.length === 1 && ["code", "messageTh", "citation", "tag", "checkedAt", "ack"].every((k) => k in w[0]) && w[0].messageTh === W.legalWarning("ADJUST_NOTE_REASON_MISSING").messageTh, "ตรงทะเบียน", w);
    chk("W6.3", "hint บอกให้ส่ง acknowledge พร้อมรหัส", /acknowledge/.test(r0.body?.error?.hint ?? "") && /ADJUST_NOTE_REASON_MISSING/.test(r0.body?.error?.hint ?? ""), "มี", r0.body?.error?.hint);
    const bogus = await call("POST", `/documents/${cn.id}/issue`, { acknowledge: ["NOT_A_CODE"] }, `${idem}-bad`);
    chk("W6.4", "รหัสที่ไม่รู้จัก → 422 validation", bogus.status === 422, "422", bogus.status, "MAJOR");
    const r1 = await call("POST", `/documents/${cn.id}/issue`, { acknowledge: ["ADJUST_NOTE_REASON_MISSING"] }, idem);
    chk("W6.5", "ส่งซ้ำด้วยคีย์เดิม + acknowledge → 200 ออกแล้ว (409 เดิมไม่ถูกเก็บตอบซ้ำ)", r1.status === 200 && r1.body?.data?.status !== "DRAFT", "200", r1);
    const rows = await ackRows(cn.id);
    chk("W6.6", "แถวยืนยันของ REST: actorType API_KEY · via rest", rows.length === 1 && rows[0]!.actorType === "API_KEY" && (rows[0]!.after as Any)?.via === "rest", "API_KEY", rows);
    const m = RESP.mapError(new W.LegalAckRequiredError([W.legalWarning("GIFTCARD_EXPIRY_BELOW_DEFAULT", { months: 6, default: 12 })]));
    chk("W6.7", "mapError ของ LegalAckRequiredError ที่หลุดมาตรง ๆ → 409 legal_ack_required + warnings · ถือว่ายังไม่ได้เขียน", m.status === 409 && m.code === "legal_ack_required" && m.warnings?.length === 1 && RESP.isNothingWritten(new W.LegalAckRequiredError([])), "409", m);
    chk("W6.8", "รหัส legal_ack_required อยู่ในรายการรหัส error ของ REST (เอกสาร/OpenAPI ขยับตาม)", RESP.API_ERROR_CODES.includes("legal_ack_required"), "มี", "ไม่มี");
  }
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 300)}\n${e.stack?.split("\n").slice(1, 4).join("\n")}` : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown>; updateMany: (a: unknown) => Promise<unknown> }>;
    await d(() => P.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountJournalEntry.updateMany({ where: { tenantId: tid }, data: { reversalOfId: null } }));
    await d(() => P.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentPayment.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentRelation.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocumentLine.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.accountDocument.updateMany({ where: { tenantId: tid }, data: { sourceDocId: null, replacedById: null, sourcePaymentId: null } }));
    for (const m of ["accountAttachment", "accountDocument", "accountDocSequence", "accountMapping", "accountFinance", "accountContact", "accountPeriod", "accountSettings", "giftCardSettings", "settingChange", "settingValue", "apiIdempotency", "apiKey", "auditLog", "outboxEvent", "membership", "appSystemUnit"]) {
      await d(() => P[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => P.accountLedger.updateMany({ where: { tenantId: tid }, data: { parentId: null } }));
    await d(() => P.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await d(() => P.appSystem.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  for (const u of users) await d(() => prisma.user.delete({ where: { id: u } }));
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}

function eqCodes(id: string, n: string, ws: { code: string }[] | undefined, exp: string[]) {
  chk(id, n, JSON.stringify(codes(ws)) === JSON.stringify([...exp].sort()), exp, codes(ws));
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T0.4 คำเตือนกฎหมายกลาง =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
