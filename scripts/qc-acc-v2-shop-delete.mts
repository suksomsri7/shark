// QC ACC T4.5 — ลบร้าน/ยกเลิกบริการ: หน้าที่เก็บเอกสาร (ค่ากฎหมาย) · ส่งออกสมุดบัญชีที่พิมพ์ได้ + ไฟล์แนบ (ZIP) · log การลบ · purge ผ่านด่าน T4.4
// ใบงาน ledger/ACCOUNT-TAX-PLAN.md T4.5 (ปิด K2 K6 G1) · design note ledger/wo-notes/T4.5.md
// ฟิกซ์เจอร์ของตัวเอง (ร้าน "QC T4.5 ลบร้าน" สร้างเอง · ลบด้วยทางลบร้านของระบบ (sweepPendingDeletes) ในโหมด strict)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-shop-delete.mts
//
// เฉลยมือ: ใบเสร็จ 1 ใบ ฐาน 100,000 VAT 7,000 วันนี้ (นาฬิกาบัญชี) · ปีบัญชีเริ่มมกราคม ⇒ ปิดบัญชี 31 ธ.ค. ปีนี้ ⇒ เก็บถึง ปีนี้+5 · ร้านตั้ง 7 ปี ⇒ ปีนี้+7 + SHOP_DIFFERS_FROM_DEFAULT
//   ZIP: 7 ไฟล์หลัก + ไฟล์แนบ 1 (ไฟล์บนคลัง — ตัวดึงจำลอง) · ไฟล์ส่วนตัว 1 + URL ภายนอก 1 = ไม่ดึง (อยู่ใน manifest)
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-shop-delete");
import { readFileSync } from "node:fs";
import { join } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 500)}`}`);
};
const ROOT = process.cwd();
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const acc: Any = await import("@/lib/modules/account/service" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const LV: Any = await import("@/lib/modules/account/legal-values" as string);
const BE: Any = await import("@/lib/modules/account/books-export" as string);
const RT: Any = await import("@/lib/pdpa/retention" as string);
const PD: Any = await import("@/lib/platform/pdpa" as string);
const ATT: Any = await import("@/lib/modules/account/attachment" as string);
const ZIP: Any = await import("@/lib/core/zip" as string);
const TH: Any = await import("@/lib/core/settings/legal/th-tax-2569" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const CLK: Any = await import("@/lib/modules/account/clock" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);

const TENANT_NAME = "QC T4.5 ลบร้าน";
const FORBID = /references\/|\.md\b|skill|\[(?:V2|V|S|U)\]/i;
const setMode = (m: "qc" | "strict") => prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION public.account_ledger_guard_mode() RETURNS text LANGUAGE sql STABLE AS $$ SELECT '${m}'::text $$`);

// ═══ D0 ตารางค่ากฎหมาย + ทะเบียน ═══
console.log("\n── D0 ค่ากฎหมาย + คำเตือน ──");
{
  const rows = TH.SYSTEM_COMPLIANCE_ROWS as Any[];
  const by = (k: string) => rows.find((r) => r.key === k);
  chk("D0.1", "ระยะเก็บขั้นต่ำ 5 ปี [V] อ้าง ม.14 · แนะนำ 7 ปี [U]", by("BOOKS_RETENTION_YEARS")?.value === 5 && by("BOOKS_RETENTION_YEARS")?.tag === "V" && /ม\.14/.test(by("BOOKS_RETENTION_YEARS")?.source) && by("BOOKS_RETENTION_SUGGESTED_YEARS")?.value === 7 && by("BOOKS_RETENTION_SUGGESTED_YEARS")?.tag === "U", "5 V · 7 U", rows.map((r) => [r.key, r.value, r.tag]));
  chk("D0.2", "เงินประกันหอ 6 เท่า [V] · สัญญา 3 ปี [V] (ป.73/2541)", by("DORM_DEPOSIT_MAX_RENT_MULTIPLE")?.value === 6 && by("DORM_DEPOSIT_MAX_CONTRACT_YEARS")?.value === 3 && /ป\.73\/2541/.test(by("DORM_DEPOSIT_MAX_RENT_MULTIPLE")?.source), "6 · 3", rows.map((r) => [r.key, r.value]));
  const ws = ["SHOP_RECORDS_RETENTION_DUTY", "SHOP_DELETE_WITHIN_RETENTION", "PAPER_ORIGINALS_KEEP"].map((c) => W.legalWarning(c, { years: 5, book: "ก", last: "1", until: "2" }));
  chk("D0.3", "คำเตือน 3 รหัส: หน้าที่ [V] · ลบก่อนครบ [V ต้องยืนยัน] · ต้นฉบับกระดาษ [U + โปรดตรวจกับนักบัญชี]", ws[0].tag === "V" && !ws[0].ack && ws[1].ack === true && ws[2].tag === "U" && ws[2].messageTh.includes(W.CHECK_WITH_ACCOUNTANT_TH), "ตามนั้น", ws.map((w: Any) => [w.code, w.tag, w.ack]));
  chk("D0.4", "ข้อความ/อ้างอิงที่ผู้ใช้เห็นไม่มี path ภายใน", !FORBID.test(W.legalWarningsText(ws)), "สะอาด", W.legalWarningsText(ws).match(FORBID));
  chk("D0.5", "ไม่มีคำว่า \"ถูกกฎหมาย\"", ws.every((w: Any) => !/ถูกกฎหมาย/.test(w.messageTh)), "ไม่มี", "มี");
}

let tid = "";
const users: string[] = [];
try {
  console.log("\n── D1 ฟิกซ์เจอร์ ──");
  const stale = await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } });
  if (stale.length) {
    await prisma.tenant.updateMany({ where: { id: { in: stale.map((t: Any) => t.id) } }, data: { status: "PENDING_DELETE", deleteRequestedAt: new Date("2000-01-01T00:00:00Z") } });
    await PD.sweepPendingDeletes(new Date("2000-02-15T00:00:00Z"), 30);
  }
  const stamp = Date.now().toString(36);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t45-${stamp}`, status: "ACTIVE", enabledModules: ["ACCOUNT"] } })).id;
  const owner = await prisma.user.create({ data: { email: `qc-t45-${stamp}@qc.local`, name: "เจ้าของ T4.5" } });
  users.push(owner.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const SYS = (await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T4.5")).id;
  const ctx = { tenantId: tid, systemId: SYS };
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน T4.5", vatRegistered: true, vatRateBp: 700, taxId: "0105561000017", branchCode: "00000" });
  await gl.ensureAccounting(ctx);
  const cust = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า T4.5", taxId: "0105561999917", branchCode: "00000" });
  const now = CLK.accountNow();
  const r1 = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: cust.id, issueDate: now, vatMode: "EXCLUDE", lines: [{ description: "ขาย T4.5", qty: 1, unitPrice: 100_000, vatRateBp: 700 }], createdById: owner.id });
  const r1i = await acc.issueDocument(tid, SYS, r1.id);
  chk("D1.1", "ออกใบเสร็จ (ลง JV)", r1i.ok, true, r1i);
  const year = Number(new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 4));

  // ═══ D2 หน้าที่เก็บเอกสาร ═══
  console.log("\n── D2 หน้าที่เก็บเอกสาร ──");
  const n1 = (await BE.retentionNotice(tid, now)).find((b: Any) => b.systemId === SYS);
  chk("D2.1", `เก็บถึง ${year + 5}-12-31 (ปิดบัญชี 31 ธ.ค. + 5 ปี) · ยังไม่ครบ · ค่าจากระบบ`, n1?.keepUntil === `${year + 5}-12-31` && n1?.withinRetention === true && n1?.retentionYears === 5 && n1?.retentionOrigin === "SYSTEM" && n1?.entries >= 1, `${year + 5}-12-31`, n1);
  const save = await LV.saveBookTax({ role: "OWNER", userId: owner.id, unitAccess: ["*"], permissions: {} }, ctx, { complianceRows: [{ id: "", key: "BOOKS_RETENTION_YEARS", value: 7, from: null, to: null, source: "นักบัญชีแนะนำ", checkedAt: null }] });
  chk("D2.2", "ร้านตั้ง 7 ปี: บันทึกได้ + คำเตือน SHOP_DIFFERS_FROM_DEFAULT (ไม่บล็อก)", save.ok === true && save.warnings.some((w: Any) => w.code === "SHOP_DIFFERS_FROM_DEFAULT"), "ok + เตือน", save);
  const n2 = (await BE.retentionNotice(tid, now)).find((b: Any) => b.systemId === SYS);
  chk("D2.3", `เก็บถึง ${year + 7}-12-31 · ค่าของร้าน`, n2?.keepUntil === `${year + 7}-12-31` && n2?.retentionOrigin === "SHOP", `${year + 7}-12-31`, n2);
  const cv = await LV.complianceValueAt(ctx, "BOOKS_RETENTION_YEARS", now);
  chk("D2.4", "ตัวอ่านเดียว complianceValueAt: 7 · SHOP · แถวร้านติดป้าย SHOP", cv.value === 7 && cv.origin === "SHOP" && cv.row?.tag === "SHOP", 7, cv);
  const rw = await RT.deletionRetentionWarnings(tid);
  chk("D2.5", "คำเตือนตอนขอลบ: หน้าที่ (7 ปี) · ลบก่อนครบ (ต้องยืนยัน) · ต้นฉบับกระดาษ", JSON.stringify(rw.warnings.map((w: Any) => w.code)) === JSON.stringify(["SHOP_RECORDS_RETENTION_DUTY", "SHOP_DELETE_WITHIN_RETENTION", "PAPER_ORIGINALS_KEEP"]) && rw.warnings[1].ack === true && /7 ปี/.test(rw.warnings[0].messageTh), ["DUTY", "WITHIN", "PAPER"], rw.warnings.map((w: Any) => w.code));
  const tx = await LV.complianceValueAt(ctx, "BOOKS_RETENTION_SUGGESTED_YEARS", now);
  chk("D2.6", "ค่าแนะนำ 7 ปี [U] → คำเตือน UNVERIFIED_DEFAULT", tx.value === 7 && tx.warnings.some((w: Any) => w.code === "UNVERIFIED_DEFAULT"), "เตือน", tx.warnings);

  // ═══ D3 ส่งออก ZIP ═══
  console.log("\n── D3 ส่งออกสมุดบัญชี + ไฟล์แนบ ──");
  const okUrl = "https://cdn.qc.invalid/t45/slip.pdf";
  await ATT.createAttachment({ tenantId: tid, systemId: SYS, documentId: r1.id, fileName: "slip.pdf", fileUrl: okUrl, mimeType: "application/pdf", sizeBytes: 12 });
  await ATT.createAttachment({ tenantId: tid, systemId: SYS, documentId: r1.id, fileName: "outside.pdf", fileUrl: "https://example.invalid/outside.pdf", mimeType: "application/pdf", sizeBytes: 10 });
  await prisma.accountAttachment.create({ data: { tenantId: tid, systemId: SYS, documentId: r1.id, fileName: "private.jpg", fileUrl: "private://x/y.jpg", mimeType: "image/jpeg", sizeBytes: 5 } });
  const fetched: string[] = [];
  const out = await BE.buildBooksArchive(ctx, { fetchFile: async (u: string) => { fetched.push(u); return u === okUrl ? new TextEncoder().encode("%PDF-qc-slip") : null; } });
  const entries = ZIP.readZipStore(out.zip);
  const names = entries.map((e: Any) => e.name);
  chk("D3.1", "ZIP อ่านกลับได้ · CRC ถูกทุกไฟล์", entries.length > 0 && entries.every((e: Any) => e.crcOk), "ครบ", names);
  chk("D3.2", "มีไฟล์หลัก 7 ไฟล์ (อ่านก่อน · สมุดรายวัน/แยกประเภท HTML · CSV 4)", ["อ่านก่อน.txt", "สมุดรายวัน.html", "บัญชีแยกประเภท.html", "สมุดรายวัน.csv", "ผังบัญชี.csv", "เอกสาร.csv", "ไฟล์แนบ.csv"].every((n) => names.includes(n)), "7 ไฟล์", names);
  chk("D3.3", "ไฟล์แนบบนคลังรวมอยู่ใต้โฟลเดอร์เลขที่เอกสาร · ไฟล์ส่วนตัวไม่ถูกดึง", names.includes(`ไฟล์แนบ/${r1i.docNo}/slip.pdf`) && entries.find((e: Any) => e.name.endsWith("slip.pdf"))?.data.toString() === "%PDF-qc-slip" && !fetched.some((u) => u.startsWith("private://")), "slip.pdf", { names, fetched });
  chk("D3.4", "สรุป: แนบ 3 · รวม 1 · ต้องดาวน์โหลดเอง 2 · ระยะเก็บ 7", out.summary.attachments === 3 && out.summary.attachmentsIncluded === 1 && out.summary.attachmentsSkipped === 2 && out.summary.retentionYears === 7, "3/1/2/7", out.summary);
  const txt = (n: string) => entries.find((e: Any) => e.name === n)?.data.toString("utf8") ?? "";
  const je = await prisma.accountJournalEntry.findFirstOrThrow({ where: { systemId: SYS, refId: r1.id }, include: { lines: true } });
  chk("D3.5", "สมุดรายวัน.html พิมพ์ได้: เลขใบสำคัญ · ยอดรวม 1,070.00 · @media print", txt("สมุดรายวัน.html").includes(je.docNo) && txt("สมุดรายวัน.html").includes("1,070.00") && /@media print/.test(txt("สมุดรายวัน.html")), "มี", txt("สมุดรายวัน.html").slice(0, 200));
  chk("D3.6", "สมุดรายวัน.csv: บรรทัด = จำนวนบรรทัด JV + หัว (BOM)", txt("สมุดรายวัน.csv").startsWith("﻿") && txt("สมุดรายวัน.csv").trim().split(/\r\n/).length === out.summary.lines + 1, out.summary.lines + 1, txt("สมุดรายวัน.csv").trim().split(/\r\n/).length);
  const rd = txt("อ่านก่อน.txt");
  chk("D3.7", "อ่านก่อน.txt: หน้าที่เก็บ 7 ปี + ต้นฉบับกระดาษ · ไม่มี path ภายใน", rd.includes("ไม่น้อยกว่า 7 ปี") && rd.includes("ต้นฉบับกระดาษ") && !FORBID.test(rd), "ครบ", rd.slice(0, 300));
  chk("D3.8", "ไฟล์แนบ.csv ระบุสถานะไฟล์ที่ไม่ได้รวม", /ไฟล์ส่วนตัว/.test(txt("ไฟล์แนบ.csv")) && /ดึงไฟล์ไม่ได้/.test(txt("ไฟล์แนบ.csv")), "มี", txt("ไฟล์แนบ.csv"));
  const def = await BE.buildBooksArchive(ctx, {});
  chk("D3.9", "ตัวดึงจริง: URL ภายนอก/ที่ไม่ใช่คลังของ SHARK ไม่ถูกดึง (กัน SSRF)", def.summary.attachmentsIncluded === 0, 0, def.summary);
  chk("D3.10", "route ส่งออก: สิทธิ์ account.report.view + ลง log EXPORTED", /assertAccountCan\(auth, "account\.report\.view"\)/.test(src("src/app/app/sys/[id]/account/export/books/route.ts")) && /logTenantDeletion\(tenantId, "EXPORTED"/.test(src("src/app/app/sys/[id]/account/export/books/route.ts")), "มี", "ไม่มี");
  await PD.logTenantDeletion(tid, "EXPORTED", owner.id, { systemId: SYS, entries: out.summary.entries });
  const n3 = (await BE.retentionNotice(tid, now)).find((b: Any) => b.systemId === SYS);
  chk("D3.11", "หน้าขอลบเห็น 'ดาวน์โหลดล่าสุด' ของสมุดนี้", !!n3?.exportedAt, "มี", n3);

  // ═══ D4 ขอลบ / ยกเลิก / log ═══
  console.log("\n── D4 log การลบ ──");
  chk("D4.1", "ขอลบร้าน → PENDING_DELETE", (await PD.requestTenantDeletion(tid, { userId: owner.id, detail: { acknowledged: ["SHOP_DELETE_WITHIN_RETENTION"] } })) === true, true, false);
  chk("D4.2", "ยกเลิกคำขอ → ACTIVE", (await PD.cancelTenantDeletion(tid, owner.id)) === true, true, false);
  const log1 = await PD.listTenantDeletionLog(tid);
  chk("D4.3", "log: EXPORTED → REQUESTED (ผู้ขอ + คำเตือนที่ยืนยัน) → CANCELLED", JSON.stringify(log1.map((l: Any) => l.event)) === JSON.stringify(["EXPORTED", "REQUESTED", "CANCELLED"]) && log1[1].actorUserId === owner.id && (log1[1].detail as Any)?.acknowledged?.[0] === "SHOP_DELETE_WITHIN_RETENTION", ["EXPORTED", "REQUESTED", "CANCELLED"], log1.map((l: Any) => [l.event, l.actorUserId]));
  const act = src("src/lib/pdpa/actions.ts");
  chk("D4.4", "action ขอลบ: คำเตือนที่ต้องยืนยันยังไม่ติ๊ก = ไม่ขอลบ · ติ๊กแล้ว = บันทึกผู้ยืนยัน (ไม่บล็อกกฎหมาย)", /deletionRetentionWarnings/.test(act) && /unacknowledged\(warnings, acked\)/.test(act) && /recordLegalAckInTx/.test(act), "มี", "ไม่มี");
  const pg = src("src/app/app/settings/privacy/page.tsx");
  chk("D4.5", "หน้าความเป็นส่วนตัว: ลิงก์ดาวน์โหลดต่อสมุด + คำเตือนกลาง + ประวัติการขอลบ", /export\/books/.test(pg) && /DeleteShopForm/.test(pg) && /privacy-deletion-log/.test(pg), "ครบ", "ขาด");

  // ═══ D5 ลบร้านจริงผ่านทางของระบบ ในโหมด strict ═══
  console.log("\n── D5 purge ผ่านด่าน T4.4 ──");
  await prisma.tenant.update({ where: { id: tid }, data: { status: "PENDING_DELETE", deleteRequestedAt: new Date("2000-01-01T00:00:00Z") } });
  let purged = -1;
  try {
    await setMode("strict");
    purged = await PD.sweepPendingDeletes(new Date("2000-02-15T00:00:00Z"), 30);
  } finally {
    await setMode("qc");
  }
  const left = { tenant: await prisma.tenant.count({ where: { id: tid } }), jv: await prisma.accountJournalEntry.count({ where: { tenantId: tid } }), audit: await prisma.auditLog.count({ where: { tenantId: tid } }) };
  chk("D5.1", "โหมด strict: ทางลบร้านของระบบลบได้ครบ (ร้าน · สมุดรายวัน · AuditLog)", purged === 1 && left.tenant === 0 && left.jv === 0 && left.audit === 0, { purged: 1, left: 0 }, { purged, left });
  const log2 = await PD.listTenantDeletionLog(tid);
  const pr = log2.find((l: Any) => l.event === "PURGED");
  chk("D5.2", "log PURGED อยู่หลังร้านถูกลบ · มีชื่อร้าน", !!pr && pr.tenantName === TENANT_NAME, TENANT_NAME, log2.map((l: Any) => [l.event, l.tenantName]));
  let r = "ok";
  try {
    await prisma.$transaction(async (t: Any) => {
      await t.$executeRawUnsafe(`SET LOCAL shark.ledger_guard = 'strict'`);
      await t.tenantDeletionLog.delete({ where: { id: pr.id } });
    });
  } catch (e) {
    r = e instanceof Error ? e.message : String(e);
  }
  chk("D5.3", "log การลบแก้/ลบไม่ได้ (โหมดเข้ม)", r.includes("LEDGER_GUARD"), "LEDGER_GUARD", r);
  tid = "";
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
  await setMode("qc").catch(() => undefined);
} finally {
  if (tid) {
    await prisma.tenant.update({ where: { id: tid }, data: { status: "PENDING_DELETE", deleteRequestedAt: new Date("2000-01-01T00:00:00Z") } }).catch(() => undefined);
    await PD.sweepPendingDeletes(new Date("2000-02-15T00:00:00Z"), 30).catch(() => undefined);
  }
  for (const u of users) await prisma.user.delete({ where: { id: u } }).catch(() => undefined);
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T4.5 ลบร้าน/ยกเลิกบริการ =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
