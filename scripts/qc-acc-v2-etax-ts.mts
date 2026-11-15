// QC ACC T5.4 e-Tax Invoice by Time Stamp (เลน 2) — หัวเรื่องตามประกาศ ข้อ 9 · อีเมล 1 ฉบับ = 1 ใบ · ถึงผู้ซื้อ 1 ที่อยู่ + สำเนาถึงระบบประทับเวลา
//   PDF จากข้อมูลพิมพ์ที่ตรึงไว้ (ข้อความไทยถอดกลับได้ · โครง PDF/A-3b · ไม่เข้ารหัส) · hash ตรงทุกที่ · เครื่องสถานะ · ยกเลิก/ออกแทน · ไม่มีเครือข่าย
//   ช่องทางส่ง = ตัวจับ (CAPTURE) เท่านั้น — fetch ทั้งโพรเซสถูกแทนด้วยตัวนับที่โยน (ยิงเครือข่าย = แดง)
//   ร้านทดสอบแยก (ลบตอนจบ · KEEP=1 = เก็บไว้) · ค่าคาดหวังคำนวณมือ — ledger/wo-notes/T5.4.md
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-etax-ts.mts
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-etax-ts");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 900)}`}`);
};
const eq = (id: string, n: string, act: unknown, exp: unknown, sev: Sev = "CRITICAL") => chk(id, n, JSON.stringify(act) === JSON.stringify(exp), exp, act, sev);

// ── ห้ามเครือข่าย: fetch ทั้งโพรเซส = ตัวนับที่โยน ──
let netCalls = 0;
globalThis.fetch = (async (...a: unknown[]) => {
  netCalls += 1;
  throw new Error(`QC: ห้ามเรียกเครือข่าย ${String(a[0]).slice(0, 80)}`);
}) as typeof fetch;

const KEEP = process.env.KEEP === "1";
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
const ET: Any = await import("@/lib/modules/account/etax-ts" as string);
const TR: Any = await import("@/lib/modules/account/etax-transport" as string);
const PDF: Any = await import("@/lib/modules/account/etax-pdf" as string);
const TH: Any = await import("@/lib/core/settings/legal/th-tax-2569" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const clock: Any = await import("@/lib/modules/account/clock" as string);
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const nfkc = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
const DIR = mkdtempSync(join(tmpdir(), "qc-etax-"));
const pdfText = (bytes: Uint8Array, name: string) => {
  const p = join(DIR, name);
  writeFileSync(p, bytes);
  return { raw: execFileSync("pdftotext", ["-raw", p, "-"]).toString("utf8"), fonts: execFileSync("pdffonts", [p]).toString("utf8"), info: execFileSync("pdfinfo", [p]).toString("utf8") };
};

console.log("\n── E0 ตัวคิดล้วน: หัวเรื่อง (ประกาศ ข้อ 9) · ชื่อไฟล์ · ตาราง · ทะเบียนคำเตือน ──");
eq("E0.1", "ใบกำกับ [14112569][INV][IV-001] (วันเดือนปี พ.ศ. ตามตัวอย่างในคู่มือ · ไม่เว้นวรรค)", ET.etaxSubject("INV", "2026-11-14", "IV-001", null, "DDMMYYYY_BE"), "[14112569][INV][IV-001]");
eq("E0.2", "ใบเพิ่มหนี้ / ใบลดหนี้ / ยกเลิกออกใหม่ — เลขที่ใบเดิมเป็นวงเล็บที่ 4", [ET.etaxSubject("DBN", "2026-01-18", "DN1", "IV-001", "DDMMYYYY_BE"), ET.etaxSubject("CRN", "2026-01-18", "CN 1", "IV-001", "DDMMYYYY_BE"), ET.etaxSubject("INV_REPLACE", "2026-01-18", "IV-004", "IV-001", "DDMMYYYY_BE")], ["[18012569][DBN][DN1][IV-001]", "[18012569][CRN][CN1][IV-001]", "[18012569][INV][IV-004][IV-001]"]);
eq("E0.3", "รูป ค.ศ. (ค่าตั้ง) · วงเล็บในเลขที่ถูกตัด", [ET.etaxSubject("INV", "2026-11-14", "IV-001", null, "DDMMYYYY_CE"), ET.etaxSubject("INV", "2026-11-14", "IV[9]", null, "DDMMYYYY_BE")], ["[14112026][INV][IV-001]", "[14112569][INV][IV9]"]);
eq("E0.4", "ชื่อไฟล์แนบ = เลขที่ + .pdf (อักขระต้องห้ามเป็น -)", [ET.etaxAttachmentName("IV2026110001"), ET.etaxAttachmentName("IV/2026 1"), ET.etaxAttachmentName("")], ["IV2026110001.pdf", "IV-20261.pdf", "tax-invoice.pdf"]);
eq("E0.5", "ตาราง: สำเนาถึง csemail@etax.teda.th [V] · ≤3,000,000 ไบต์ · ถึง 1 ที่อยู่ · 1 ใบ/อีเมล · PDF/A-3", ["ETAX_TS_CC_ADDRESS", "ETAX_TS_MAX_BYTES", "ETAX_TS_TO_MAX", "ETAX_TS_DOCS_PER_MAIL", "ETAX_TS_FILE_FORMAT"].map((k) => [TH.etaxTsRow(k).value, TH.etaxTsRow(k).tag]), [["csemail@etax.teda.th", "V"], [3_000_000, "V"], [1, "V"], [1, "V"], ["PDF/A-3", "V"]]);
eq("E0.6", "คำเตือน: ยังไม่ยืนยันสิทธิ/ไม่จด VAT = ต้องยืนยัน [V] · ไม่มีอีเมล/ยังไม่ผ่านตัวตรวจ PDF/A = แจ้ง [S] · ไม่มีคำว่า \"ถูกกฎหมาย\"", ["ETAX_TS_NOT_DECLARED", "ETAX_TS_NOT_VAT_REGISTERED", "ETAX_TS_NO_BUYER_EMAIL", "ETAX_TS_PDFA_NOT_VALIDATED", "ETAX_TS_REPLACE_DATE", "ETAX_TS_CANCELLED", "ETAX_TS_FILE_TOO_LARGE"].map((c) => { const w = W.legalWarning(c, {}); return [w.tag, w.ack, /ถูกกฎหมาย/.test(w.messageTh)]; }), [["V", true, false], ["V", true, false], ["S", false, false], ["S", false, false], ["V", false, false], ["V", false, false], ["V", false, false]]);
eq("E0.7", "ชนิดที่ครอบ = ใบกำกับภาษี ใบเพิ่มหนี้ ใบลดหนี้ (ไม่มีใบเสร็จ)", ET.ETAX_TS_DOC_TYPES, ["TAX_INVOICE", "DEBIT_NOTE", "CREDIT_NOTE"]);
eq("E0.8", "นอก production = ตัวจับ (CAPTURE)", TR.etaxTransport().name, "CAPTURE");

let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T5.4 e-Tax", "qc-t54-etax");
  tid = S.tid;
  prisma = S.prisma;
  const ctx = S.ctx;
  const ALL = { codes: W.LEGAL_WARNING_CODES, actorId: S.owner.id, via: "screen" };
  const buyer = await acc.createContact({ tenantId: S.tid, systemId: S.SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ผู้ซื้อ อีแท็กซ์ จำกัด", taxId: F.thaiTaxId("010556177771"), branchCode: "00000", address: "77 ถ.ผู้ซื้อ เชียงใหม่", email: "buyer@example.test" });
  const noMail = await acc.createContact({ tenantId: S.tid, systemId: S.SYS, kind: "CUSTOMER", legalType: "PERSON", name: "นายไม่มี อีเมล", address: "8 ถ.แปด ภูเก็ต" });
  const mk = async (docType: string, contactId: string, extra: Any = {}) => {
    const d = await acc.createDocument({ tenantId: S.tid, systemId: S.SYS, docType, contactId, vatMode: "EXCLUDE", lines: [{ description: "ค่าบริการดำน้ำลึก", qty: 1, unitPrice: 1_000_000, discount: 0, vatRateBp: 700 }], createdById: S.owner.id, ...extra });
    const r = await acc.issueDocument(S.tid, S.SYS, d.id, { ack: ALL });
    if (!r.ok) throw new Error(`ออก ${docType}: ${r.reason}`);
    return (await prisma.accountDocument.findFirstOrThrow({ where: { id: d.id }, select: { id: true, docNo: true, issueDate: true, status: true } })) as { id: string; docNo: string; issueDate: Date; status: string };
  };
  const bkk = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
  const be = (d: Date) => { const [y, m, dd] = bkk(d).split("-"); return `${dd}${m}${Number(y) + 543}`; };
  const iv = await mk("TAX_INVOICE", buyer.id);

  console.log("\n── E1 ค่าเริ่ม: ปิด ──");
  const s0 = await ET.etaxTsSettings(ctx);
  eq("E1.1", "ค่าตั้งเริ่ม: ปิด · ไม่อัตโนมัติ · ไม่มีอีเมลผู้ส่ง · สำเนาถึงจากตาราง · ยังไม่ยืนยันสิทธิ · CAPTURE", [s0.enabled, s0.autoOnIssue, s0.senderEmail, s0.ccAddress, s0.ccSource, s0.eligibility, s0.transport, s0.subjectDateFormat], [false, false, "", "csemail@etax.teda.th", "TABLE", "UNDECLARED", "CAPTURE", "DDMMYYYY_BE"]);
  const st0 = await ET.etaxDocState(ctx, iv.id);
  eq("E1.2", "สถานะ: ยังไม่ส่ง · ส่งไม่ได้เพราะยังไม่เปิดค่าตั้ง · หัวเรื่องตัวอย่างถูกรูป", [st0.state, st0.canSend, /ยังไม่ได้เปิด/.test(st0.blockedReason), st0.subjectPreview], ["NOT_SENT", false, true, `[${be(iv.issueDate)}][INV][${iv.docNo}]`]);
  const r0 = await ET.sendEtaxTs(ctx, { documentId: iv.id, ack: ALL });
  eq("E1.3", "ส่งตอนปิด = NOT_ELIGIBLE · ไม่มีแถว", [r0.ok, r0.code, await prisma.accountEtaxSubmission.count({ where: { tenantId: S.tid } })], [false, "NOT_ELIGIBLE", 0]);

  console.log("\n── E2 เปิด + อีเมลผู้ส่ง ──");
  const sv = await ET.saveEtaxTsSettings(S.ownerActor, ctx, { enabled: true, senderEmail: "tax@shop.test" });
  const bad = await ET.saveEtaxTsSettings(S.ownerActor, ctx, { senderEmail: "ไม่ใช่อีเมล" });
  eq("E2.1", "บันทึกค่าตั้ง · อีเมลผิดรูป = ปฏิเสธ (รูปแบบข้อมูล)", [sv.ok, sv.settings?.enabled, sv.settings?.senderEmail, bad.ok], [true, true, "tax@shop.test", false]);
  const st1 = await ET.etaxDocState(ctx, iv.id);
  eq("E2.2", "ส่งได้แล้ว · อีเมลผู้ซื้อจากผู้ติดต่อ · ไม่มีข้อความแจ้ง", [st1.canSend, st1.buyerEmail, st1.infos.map((w: Any) => w.code)], [true, "buyer@example.test", []]);

  console.log("\n── E3 ยังไม่ยืนยันสิทธิ = ต้องกดยืนยัน (ไม่บล็อก) ──");
  const r1 = await ET.sendEtaxTs(ctx, { documentId: iv.id });
  eq("E3.1", "ไม่ยืนยัน → LEGAL_ACK_REQUIRED (ETAX_TS_NOT_DECLARED) · ไม่มีแถว · ไม่มีอีเมล", [r1.ok, r1.code, r1.legal?.warnings.filter((w: Any) => w.ack).map((w: Any) => w.code), await prisma.accountEtaxSubmission.count({ where: { tenantId: S.tid } }), TR.CAPTURED_ETAX_MAILS.length], [false, "LEGAL_ACK_REQUIRED", ["ETAX_TS_NOT_DECLARED"], 0, 0]);

  console.log("\n── E4 ส่งครั้งแรก ──");
  const before = TR.CAPTURED_ETAX_MAILS.length;
  const r2 = await ET.sendEtaxTs(ctx, { documentId: iv.id, actorId: S.owner.id, ack: { codes: ["ETAX_TS_NOT_DECLARED"], actorId: S.owner.id, via: "test" } });
  const mail = TR.CAPTURED_ETAX_MAILS[TR.CAPTURED_ETAX_MAILS.length - 1];
  eq("E4.1", "ส่งสำเร็จ: ครั้งที่ 1 · SENT · อีเมล 1 ฉบับ", [r2.ok, r2.attemptNo, r2.status, TR.CAPTURED_ETAX_MAILS.length - before], [true, 1, "SENT", 1]);
  eq("E4.2", "หัวจดหมาย: จาก = อีเมลที่ร้านแจ้ง · ถึง = ผู้ซื้อ 1 ที่อยู่ · สำเนาถึง = ระบบประทับเวลา · หัวเรื่อง [วันที่ พ.ศ.][INV][เลขที่]", [mail.from, mail.to, mail.cc, mail.subject], ["tax@shop.test", "buyer@example.test", "csemail@etax.teda.th", `[${be(iv.issueDate)}][INV][${iv.docNo}]`]);
  eq("E4.3", "ไฟล์แนบ 1 ไฟล์ ชื่อ <เลขที่>.pdf · application/pdf · ขึ้นต้น %PDF- · เนื้อความไม่ว่าง (Gmail)", [mail.attachment.filename, mail.attachment.contentType, Buffer.from(mail.attachment.content.subarray(0, 5)).toString("latin1"), mail.text.length > 10], [`${iv.docNo}.pdf`, "application/pdf", "%PDF-", true]);
  const row = await prisma.accountEtaxSubmission.findFirstOrThrow({ where: { documentId: iv.id, attemptNo: 1 } });
  const file = await prisma.accountEtaxFile.findFirstOrThrow({ where: { id: row.pdfFileId } });
  eq("E4.4", "hash: ไฟล์ที่ส่ง = ไฟล์ที่เก็บ = แถวความพยายาม = คำนวณใหม่ · ขนาดตรง", [sha(mail.attachment.content) === row.pdfSha256, sha(new Uint8Array(file.bytes)) === row.pdfSha256, file.sha256 === row.pdfSha256, r2.sha256 === row.pdfSha256, file.sizeBytes === mail.attachment.content.length, row.attachmentBytes === file.sizeBytes, file.role], [true, true, true, true, true, true, "SENT"]);
  eq("E4.5", "แถว: จาก/ถึง/สำเนา/หัวเรื่อง/ช่องทาง CAPTURE/เวลาส่ง · ข้อความความสอดคล้องไม่อ้างว่าผ่าน PDF/A", [row.fromAddress, row.toAddress, row.ccAddress, row.subject, row.transport, !!row.sentAt, /ยังไม่ผ่านตัวตรวจ PDF\/A/.test(row.pdfConformance)], ["tax@shop.test", "buyer@example.test", "csemail@etax.teda.th", mail.subject, "CAPTURE", true, true]);
  const audits = await prisma.auditLog.findMany({ where: { tenantId: S.tid, targetId: iv.id, action: { in: ["account.etax.ts.send", "legal.warning.ack"] } }, select: { action: true, after: true } });
  eq("E4.6", "ประวัติเอกสาร: ส่ง 1 + รอยกดยืนยัน 1 (รหัส ETAX_TS_NOT_DECLARED)", [audits.filter((a: Any) => a.action === "account.etax.ts.send").length, audits.filter((a: Any) => a.action === "legal.warning.ack").map((a: Any) => a.after.codes)], [1, [["ETAX_TS_NOT_DECLARED"]]]);
  chk("E4.7", "คำเตือนที่คืนมี ETAX_TS_PDFA_NOT_VALIDATED [S] (บอกตรงว่ายังไม่ผ่านตัวตรวจ)", r2.warnings.some((w: Any) => w.code === "ETAX_TS_PDFA_NOT_VALIDATED" && w.tag === "S"), true, r2.warnings.map((w: Any) => w.code));

  console.log("\n── E5 เนื้อไฟล์ PDF ──");
  const pt = pdfText(mail.attachment.content, "iv.pdf");
  const text = nfkc(pt.raw);
  const want = ["ใบกำกับภาษี", iv.docNo, "หักภาษีทดสอบจำกัด", "บริษัทผู้ซื้ออีแท็กซ์จำกัด", "77ถ.ผู้ซื้อเชียงใหม่", "ค่าบริการดำน้ำลึก", "10,000.00", "700.00", "10,700.00", "ภาษีมูลค่าเพิ่ม7%", "สำนักงานใหญ่"];
  eq("E5.1", "ข้อความไทยถอดกลับได้ครบ (NFKC · ตัดช่องว่าง): ชื่อเอกสาร เลขที่ ผู้ขาย ผู้ซื้อ ที่อยู่ รายการ ยอด VAT", want.filter((w) => !text.includes(nfkc(w))), []);
  const ins = PDF.inspectEtaxPdf(mail.attachment.content);
  eq("E5.2", "โครง PDF/A-3b: XMP pdfaid 3/B · OutputIntent sRGB · ไม่เข้ารหัส · ฟอนต์ฝัง ≥1 · ≤3,000,000 ไบต์", [ins.pdfaPart, ins.pdfaConformance, ins.outputIntent, ins.encrypted, ins.fontFiles >= 1, ins.sizeBytes <= 3_000_000], ["3", "B", true, false, true, true]);
  const fontLines = pt.fonts.split("\n").slice(2).filter((l) => l.trim());
  eq("E5.3", "pdffonts: ทุกฟอนต์ฝัง (emb yes) · มีแผนที่ยูนิโค้ด (uni yes) · ไม่มี Helvetica", [fontLines.length > 0, fontLines.every((l) => / yes +yes +yes /.test(l)), /Helvetica/.test(pt.fonts)], [true, true, false]);
  eq("E5.4", "pdfinfo: ไม่เข้ารหัส · มี XMP · 1 หน้า A4", [/Encrypted:\s+no/.test(pt.info), /Metadata Stream:\s+yes/.test(pt.info), /Pages:\s+1\b/.test(pt.info), /595\.28 x 841\.89/.test(pt.info)], [true, true, true, true]);

  console.log("\n── E6 เครื่องสถานะ ──");
  const st2 = await ET.etaxDocState(ctx, iv.id);
  eq("E6.1", "หลังส่ง: SENT \"ส่งแล้ว รอไฟล์ประทับเวลา\" · 1 ครั้ง", [st2.state, st2.stateLabel, st2.attempts.length], ["SENT", "ส่งแล้ว รอไฟล์ประทับเวลา", 1]);
  const r3 = await ET.sendEtaxTs(ctx, { documentId: iv.id, ack: { codes: ["ETAX_TS_NOT_DECLARED"] } });
  eq("E6.2", "ส่งซ้ำ = ความพยายามใหม่ (ครั้งที่ 2 · RESEND) · ไฟล์ใหม่แถวใหม่", [r3.ok, r3.attemptNo, (await prisma.accountEtaxSubmission.findFirst({ where: { id: r3.submissionId } })).mode, await prisma.accountEtaxFile.count({ where: { documentId: iv.id, role: "SENT" } })], [true, 2, "RESEND", 2]);
  const notPdf = await ET.recordStampedFile(ctx, { documentId: iv.id, fileName: "x.txt", bytes: new Uint8Array(Buffer.from("hello")) });
  eq("E6.3", "ไฟล์ประทับเวลาไม่ใช่ PDF = ปฏิเสธ", [notPdf.ok, /PDF/.test(notPdf.reason)], [false, true]);
  const stampedBytes = new Uint8Array(Buffer.concat([Buffer.from(mail.attachment.content), Buffer.from("\n%ETDA-TS-SIMULATED\n")]));
  const rs = await ET.recordStampedFile(ctx, { documentId: iv.id, fileName: `${iv.docNo}.pdf`, bytes: stampedBytes, actorId: S.owner.id });
  const st3 = await ET.etaxDocState(ctx, iv.id);
  eq("E6.4", "บันทึกไฟล์ประทับเวลา → STAMPED · sha256 ของไฟล์ที่อัปโหลด · ผูกกับความพยายามล่าสุด (ครั้งที่ 2)", [rs.ok, rs.sha256 === sha(stampedBytes), rs.sameAsSent, st3.state, st3.attempts[0].attemptNo, st3.attempts[0].stampedSha256 === sha(stampedBytes)], [true, true, false, "STAMPED", 2, true]);
  const ef = await ET.etaxFile(ctx, rs.fileId);
  eq("E6.5", "อ่านไฟล์ที่เก็บ: ไบต์ตรง · hash ตรง (intact)", [ef.role, ef.intact, sha(ef.bytes) === rs.sha256], ["STAMPED", true, true]);
  let upd = "ไม่ถูกปฏิเสธ";
  try {
    await prisma.accountEtaxFile.update({ where: { id: rs.fileId }, data: { fileName: "แก้.pdf" } });
  } catch (e) {
    upd = /append-only/.test(String((e as Error).message)) ? "append-only" : String((e as Error).message).slice(0, 80);
  }
  eq("E6.6", "แก้ไฟล์ที่เก็บไม่ได้ (trigger ฐานข้อมูล)", upd, "append-only");
  const before2 = TR.CAPTURED_ETAX_MAILS.length;
  const rr = await ET.sendEtaxTs(ctx, { documentId: iv.id, mode: "RESEND_STAMPED" });
  const mail2 = TR.CAPTURED_ETAX_MAILS[TR.CAPTURED_ETAX_MAILS.length - 1];
  eq("E6.7", "ประกาศ ข้อ 7: ส่งไฟล์ประทับเวลาเดิมให้ผู้ซื้อ — ไม่สำเนาระบบ · ไบต์ = ไฟล์ประทับเวลา · สถานะยังเป็น STAMPED", [rr.ok, TR.CAPTURED_ETAX_MAILS.length - before2, mail2.cc, sha(mail2.attachment.content) === sha(stampedBytes), (await ET.etaxDocState(ctx, iv.id)).state], [true, 1, null, true, "STAMPED"]);
  const again = await ET.sendEtaxTs(ctx, { documentId: iv.id, ack: { codes: ["ETAX_TS_NOT_DECLARED"] } });
  eq("E6.8", "ได้ไฟล์ประทับเวลาแล้ว: ส่งเข้าระบบอีก = ปฏิเสธ (กันใบประทับเวลาซ้ำ) ชี้ไปที่ส่งไฟล์ซ้ำ · ไม่เพิ่มแถว", [again.ok, again.code, /ส่งไฟล์ประทับเวลาซ้ำ/.test(again.reason), await prisma.accountEtaxSubmission.count({ where: { documentId: iv.id } })], [false, "NOT_ELIGIBLE", true, 3]);

  console.log("\n── E7 ช่องทางส่งล้ม → FAILED + เหตุ ──");
  const iv2 = await mk("TAX_INVOICE", buyer.id);
  TR.setEtaxTransportForTests({ name: "CAPTURE", send: async () => ({ ok: false, error: "SMTP 550 ผู้รับปฏิเสธ" }) });
  const rf = await ET.sendEtaxTs(ctx, { documentId: iv2.id, ack: { codes: ["ETAX_TS_NOT_DECLARED"] } });
  TR.setEtaxTransportForTests(null);
  const stf = await ET.etaxDocState(ctx, iv2.id);
  eq("E7.1", "ล้ม: FAILED · เหตุเก็บในแถว · สถานะเอกสาร \"ส่งไม่สำเร็จ\" · ไฟล์ยังถูกเก็บ (หลักฐานการพยายาม)", [rf.ok, rf.status, rf.error, stf.state, stf.stateLabel, await prisma.accountEtaxFile.count({ where: { documentId: iv2.id } })], [true, "FAILED", "SMTP 550 ผู้รับปฏิเสธ", "FAILED", "ส่งไม่สำเร็จ", 1]);
  const rf2 = await ET.sendEtaxTs(ctx, { documentId: iv2.id, ack: { codes: ["ETAX_TS_NOT_DECLARED"] } });
  eq("E7.2", "ส่งซ้ำหลังล้ม = ครั้งที่ 2 SENT → สถานะ SENT", [rf2.attemptNo, rf2.status, (await ET.etaxDocState(ctx, iv2.id)).state], [2, "SENT", "SENT"]);
  const k = `etax-key-${S.tid}`;
  const i1 = await ET.sendEtaxTs(ctx, { documentId: iv2.id, ack: { codes: ["ETAX_TS_NOT_DECLARED"] }, idempotencyKey: k });
  const i2 = await ET.sendEtaxTs(ctx, { documentId: iv2.id, ack: { codes: ["ETAX_TS_NOT_DECLARED"] }, idempotencyKey: k });
  eq("E7.3", "คีย์กันซ้ำ: ครั้งที่สอง = ผลเดิม (duplicate) ไม่เพิ่มแถว", [i1.ok, i1.attemptNo, i2.duplicate, i2.submissionId === i1.submissionId, await prisma.accountEtaxSubmission.count({ where: { documentId: iv2.id } })], [true, 3, true, true, 3]);
  const two = await ET.sendEtaxTs(ctx, { documentId: iv2.id, to: "a@x.test,b@x.test", ack: { codes: ["ETAX_TS_NOT_DECLARED"] } });
  eq("E6.9", "ผู้ซื้อ 2 ที่อยู่ = ปฏิเสธ (คู่มือ: ระบุได้ 1 ที่อยู่)", [two.ok, /1 ที่อยู่/.test(two.reason)], [false, true]);

  console.log("\n── E8 ใบลดหนี้ / ใบเพิ่มหนี้อ้างใบกำกับเดิม ──");
  const cn = await mk("CREDIT_NOTE", buyer.id, { sourceDocId: iv2.id, vatMode: "INCLUDE", lines: [{ description: "ลดค่าบริการ", qty: 1, unitPrice: 107_000, discount: 0, vatRateBp: 700 }], adjustReasonCode: "CN_SERVICE_DEFECT", adjustReason: "บริการบกพร่อง" });
  const before3 = TR.CAPTURED_ETAX_MAILS.length;
  const rc = await ET.sendEtaxTs(ctx, { documentId: cn.id, ack: { codes: ["ETAX_TS_NOT_DECLARED"] } });
  const mail3 = TR.CAPTURED_ETAX_MAILS[TR.CAPTURED_ETAX_MAILS.length - 1];
  eq("E8.1", "ใบลดหนี้: หัวเรื่อง [วันที่][CRN][เลขที่ใบลดหนี้][เลขที่ใบกำกับเดิม] · สำเนาถึงระบบ", [rc.ok, TR.CAPTURED_ETAX_MAILS.length - before3, mail3.subject, mail3.cc], [true, 1, `[${be(cn.issueDate)}][CRN][${cn.docNo}][${iv2.docNo}]`, "csemail@etax.teda.th"]);
  const cnText = nfkc(pdfText(mail3.attachment.content, "cn.pdf").raw);
  eq("E8.2", "ไฟล์ใบลดหนี้มีเลขที่ใบเดิม + ผลต่าง 1,000.00 + ภาษี 70.00", [iv2.docNo, "1,000.00", "70.00"].filter((w) => !cnText.includes(nfkc(w))), []);
  const dn = await mk("DEBIT_NOTE", buyer.id, { sourceDocId: iv2.id, vatMode: "EXCLUDE", lines: [{ description: "คิดค่าบริการขาด", qty: 1, unitPrice: 50_000, discount: 0, vatRateBp: 700 }], adjustReasonCode: "OTHER", adjustReason: "อื่น ๆ — คิดราคาต่ำกว่าจริง" });
  eq("E8.3", "ใบเพิ่มหนี้: หัวเรื่อง DBN อ้างใบเดิม", (await ET.etaxDocState(ctx, dn.id)).subjectPreview, `[${be(dn.issueDate)}][DBN][${dn.docNo}][${iv2.docNo}]`);

  console.log("\n── E9 ชนิดที่ไม่ครอบ · ผู้ซื้อไม่มีอีเมล/เลข ──");
  const rc0 = await mk("RECEIPT", buyer.id);
  const strc = await ET.etaxDocState(ctx, rc0.id);
  const srr = await ET.sendEtaxTs(ctx, { documentId: rc0.id, ack: ALL });
  eq("E9.1", "ใบเสร็จ: ไม่ครอบ · ส่งไม่ได้ (ไม่รวมใบเสร็จ) · ไม่มีแถว", [strc.covered, strc.canSend, /ไม่รวมใบเสร็จ/.test(strc.blockedReason), srr.ok, await prisma.accountEtaxSubmission.count({ where: { documentId: rc0.id } })], [false, false, true, false, 0]);
  const ivNo = await mk("TAX_INVOICE", noMail.id);
  const stn = await ET.etaxDocState(ctx, ivNo.id);
  eq("E9.2", "ผู้ซื้อไม่มีอีเมล+ไม่มีเลข: แจ้งให้ทราบ 2 ข้อ (ไม่ต้องยืนยัน) · ปุ่มยังใช้ได้", [stn.infos.map((w: Any) => [w.code, w.ack]), stn.canSend], [[["ETAX_TS_NO_BUYER_EMAIL", false], ["BUYER_TAX_ID_MISSING", false]], true]);
  const rn = await ET.sendEtaxTs(ctx, { documentId: ivNo.id, ack: { codes: ["ETAX_TS_NOT_DECLARED"] } });
  eq("E9.3", "ไม่มีอีเมลและไม่กรอก = NO_BUYER_EMAIL (ไม่มีแถว)", [rn.ok, rn.code, await prisma.accountEtaxSubmission.count({ where: { documentId: ivNo.id } })], [false, "NO_BUYER_EMAIL", 0]);
  const rn2 = await ET.sendEtaxTs(ctx, { documentId: ivNo.id, to: "walkin@example.test", ack: { codes: ["ETAX_TS_NOT_DECLARED"] } });
  eq("E9.4", "กรอกอีเมลตอนส่ง → ส่งได้ · ผู้ซื้อไม่มีเลข = คำเตือนแจ้ง BUYER_TAX_ID_MISSING (ไม่บล็อก)", [rn2.ok, rn2.status, rn2.to, rn2.warnings.some((w: Any) => w.code === "BUYER_TAX_ID_MISSING")], [true, "SENT", "walkin@example.test", true]);

  console.log("\n── E10 ยกเลิกและออกแทน (ประกาศ ข้อ 6) ──");
  const iv3 = await mk("TAX_INVOICE", buyer.id);
  const s3 = await ET.sendEtaxTs(ctx, { documentId: iv3.id, ack: { codes: ["ETAX_TS_NOT_DECLARED"] } });
  if (!s3.ok) throw new Error(`send iv3: ${s3.reason}`);
  const rp = await acc.replaceTaxInvoice(ctx, iv3.id, { reason: "ชื่อผู้ซื้อผิด", ack: ALL, createdById: S.owner.id });
  if (!rp.ok) throw new Error(`replace: ${rp.reason}`);
  const stOld = await ET.etaxDocState(ctx, iv3.id);
  eq("E10.1", "ใบเดิม (ส่งแล้ว) ถูกยกเลิก: ส่งไม่ได้ · แจ้ง ETAX_TS_CANCELLED พร้อมเลขใบใหม่", [stOld.live, stOld.canSend, stOld.infos.map((w: Any) => w.code), stOld.infos[0]?.messageTh.includes(rp.newDocNo)], [false, false, ["ETAX_TS_CANCELLED"], true]);
  const before4 = TR.CAPTURED_ETAX_MAILS.length;
  const rnw = await ET.sendEtaxTs(ctx, { documentId: rp.newId, ack: { codes: ["ETAX_TS_NOT_DECLARED"] } });
  const mail4 = TR.CAPTURED_ETAX_MAILS[TR.CAPTURED_ETAX_MAILS.length - 1];
  eq("E10.2", "ใบใหม่: หัวเรื่อง [วันที่][INV][เลขใหม่][เลขเดิม] · ใบลงวันที่เดิม (แบบกระดาษ) = คำเตือน ETAX_TS_REPLACE_DATE (ไม่บล็อก)", [rnw.ok, TR.CAPTURED_ETAX_MAILS.length - before4, mail4.subject, rnw.warnings.some((w: Any) => w.code === "ETAX_TS_REPLACE_DATE" && !w.ack)], [true, 1, `[${be(iv3.issueDate)}][INV][${rp.newDocNo}][${iv3.docNo}]`, true]);
  const oldSend = await ET.sendEtaxTs(ctx, { documentId: iv3.id, ack: ALL });
  eq("E10.3", "ส่งใบเดิมที่ยกเลิกแล้วไม่ได้", [oldSend.ok, oldSend.code], [false, "NOT_ELIGIBLE"]);

  console.log("\n── E11 ไฟล์ใหญ่เกิน · ค่าที่ร้านทับ · ไม่จด VAT ──");
  const bigGen = { name: "big", generate: async () => { const b = new Uint8Array(3_100_000); b.set(Buffer.from("%PDF-1.7\n")); return { bytes: b, sha256: sha(b), pages: 1 }; } };
  const rbig = await ET.sendEtaxTs(ctx, { documentId: rp.newId, ack: { codes: ["ETAX_TS_NOT_DECLARED"] }, generator: bigGen });
  eq("E11.1", "ไฟล์ 3,100,000 ไบต์ → คำเตือน ETAX_TS_FILE_TOO_LARGE (ยังส่ง — ระบบประทับเวลาจะตอบเอง)", [rbig.ok, rbig.status, rbig.warnings.some((w: Any) => w.code === "ETAX_TS_FILE_TOO_LARGE")], [true, "SENT", true]);
  await ET.saveEtaxTsSettings(S.ownerActor, ctx, { ccAddress: "other@etax.test", subjectDateFormat: "DDMMYYYY_CE" });
  const s2 = await ET.etaxTsSettings(ctx);
  eq("E11.2", "ร้านทับสำเนาถึง + รูปวันที่ ค.ศ. → ใช้ค่าร้าน + SHOP_DIFFERS_FROM_DEFAULT 2 ข้อ", [s2.ccAddress, s2.ccSource, s2.warnings.map((w: Any) => w.code)], ["other@etax.test", "SHOP", ["SHOP_DIFFERS_FROM_DEFAULT", "SHOP_DIFFERS_FROM_DEFAULT"]]);
  eq("E11.3", "หัวเรื่องใช้ปี ค.ศ.", (await ET.etaxDocState(ctx, ivNo.id)).subjectPreview, `[${bkk(ivNo.issueDate).split("-").reverse().join("")}][INV][${ivNo.docNo}]`);
  await ET.saveEtaxTsSettings(S.ownerActor, ctx, { ccAddress: "", subjectDateFormat: "DDMMYYYY_BE" });

  console.log("\n── E12 อัตโนมัติตอนออก ──");
  await ET.saveEtaxTsSettings(S.ownerActor, ctx, { autoOnIssue: true });
  const ivA = await mk("TAX_INVOICE", buyer.id);
  const a0 = await ET.onDocumentIssuedEtax({ tenantId: S.tid, systemId: S.SYS, payload: { documentId: ivA.id, type: "TAX_INVOICE" } });
  eq("E12.1", "ยังไม่ยืนยันสิทธิ = ไม่ส่งอัตโนมัติ (ไม่ถามแทนร้าน)", [a0, await prisma.accountEtaxSubmission.count({ where: { documentId: ivA.id } })], ["SKIPPED", 0]);
  await ET.saveEtaxTsSettings(S.ownerActor, ctx, { eligibility: "LISTED" });
  const a1 = await ET.onDocumentIssuedEtax({ tenantId: S.tid, systemId: S.SYS, payload: { documentId: ivA.id, type: "TAX_INVOICE" } });
  const a2 = await ET.onDocumentIssuedEtax({ tenantId: S.tid, systemId: S.SYS, payload: { documentId: ivA.id, type: "TAX_INVOICE" } });
  const aRow = await prisma.accountEtaxSubmission.findFirst({ where: { documentId: ivA.id } });
  eq("E12.2", "ยืนยันสิทธิแล้ว: ส่งอัตโนมัติ 1 ครั้ง (event ซ้ำ = ข้าม) · ผู้กระทำ SYSTEM", [a1, a2, await prisma.accountEtaxSubmission.count({ where: { documentId: ivA.id } }), aRow?.actorType], ["SENT", "SKIPPED", 1, "SYSTEM"]);
  const aRc = await ET.onDocumentIssuedEtax({ tenantId: S.tid, systemId: S.SYS, payload: { documentId: rc0.id, type: "RECEIPT" } });
  eq("E12.3", "ใบเสร็จออก = ไม่ส่งอัตโนมัติ", aRc, "SKIPPED");
  const rL = await ET.sendEtaxTs(ctx, { documentId: ivNo.id, to: "walkin@example.test" });
  eq("E12.4", "ยืนยันสิทธิแล้ว: ส่งมือได้โดยไม่ต้องกดยืนยัน ETAX_TS_NOT_DECLARED", [rL.ok, rL.warnings.some((w: Any) => w.code === "ETAX_TS_NOT_DECLARED")], [true, false]);

  console.log("\n── E13 สมุดไม่จด VAT ──");
  await acc.saveSettings(S.tid, S.SYS, { vatRegistered: false });
  const rv = await ET.sendEtaxTs(ctx, { documentId: ivNo.id, to: "walkin@example.test" });
  eq("E13.1", "ไม่จด VAT = ต้องกดยืนยัน ETAX_TS_NOT_VAT_REGISTERED (ไม่บล็อก)", [rv.ok, rv.code, rv.legal?.warnings.filter((w: Any) => w.ack).map((w: Any) => w.code)], [false, "LEGAL_ACK_REQUIRED", ["ETAX_TS_NOT_VAT_REGISTERED"]]);
  const rv2 = await ET.sendEtaxTs(ctx, { documentId: ivNo.id, to: "walkin@example.test", ack: { codes: ["ETAX_TS_NOT_VAT_REGISTERED"] } });
  eq("E13.2", "กดยืนยัน → ส่งได้", [rv2.ok, rv2.status], [true, "SENT"]);
  await acc.saveSettings(S.tid, S.SYS, { vatRegistered: true });

  console.log("\n── E14 ไม่มีเครือข่าย ──");
  eq("E14.1", "fetch ไม่ถูกเรียกเลยตลอดชุด (ทุกการส่ง = ตัวจับ)", netCalls, 0);
  eq("E14.2", "ทุกแถวของร้านนี้ = CAPTURE", [...new Set((await prisma.accountEtaxSubmission.findMany({ where: { tenantId: S.tid }, select: { transport: true } })).map((r: Any) => r.transport))], ["CAPTURE"]);
  void clock;
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  TR.setEtaxTransportForTests?.(null);
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T5.4 e-Tax by Time Stamp =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length ? 1 : 0);
