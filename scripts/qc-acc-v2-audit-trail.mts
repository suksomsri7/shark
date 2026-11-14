// QC ACC T4.4 — ร่องรอย: ด่านฐานข้อมูลกันแก้/ลบ (สมุดรายวัน + AuditLog บัญชี) · log เข้าระบบ · รายงานการแก้ไขของบัญชี · เหตุผลยกเลิก
// ใบงาน ledger/ACCOUNT-TAX-PLAN.md T4.4 (ปิด E12 G2 G7) · design note ledger/wo-notes/T4.4.md
// ฟิกซ์เจอร์ของตัวเอง (ร้าน "QC T4.4 ร่องรอย" สร้าง/ลบเอง · KEEP=1 = เก็บไว้)
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-acc-v2-audit-trail.mts
//
// ฐานทดสอบอยู่โหมด qc (ล้างฟิกซ์เจอร์ได้) — ข้อสอบโหมดเข้มทำในธุรกรรมที่ `SET LOCAL shark.ledger_guard = 'strict'` แล้วย้อน (rollback) ทุกครั้ง
// และช่วงเดินทางจริงของ service (G3) สลับโหมดฐานเป็น strict ชั่วคราว แล้วคืน qc ใน finally
//
// เฉลยมือ (สตางค์):
//   R1 ใบเสร็จ ฐาน 100,000 VAT 7,000 = 107,000 → ยกเลิก (เหตุผล "ออกผิดลูกค้า") → JV กลับรายการ Σ เดบิต 107,000
//   J1 JV มือ Dr 6900 50,000 / Cr ธนาคาร 50,000 → กลับรายการ (เหตุผล "ลงผิดบัญชี") → JV กลับ Σ เดบิต 50,000
//   รายงานการแก้ไข (ทั้งหมด): ยกเลิกเอกสาร R1 (audit · ยอด 107,000 · เหตุผล) · กลับรายการ 2 ใบ (journal) · กดยืนยันคำเตือน 1 · เข้าระบบ 2 + ไม่สำเร็จ 1
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-acc-v2-audit-trail");
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
const KEEP = process.env.KEEP === "1";
const ROOT = process.cwd();
const src = (p: string) => readFileSync(join(ROOT, p), "utf8");
const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const acc: Any = await import("@/lib/modules/account/service" as string);
const gl: Any = await import("@/lib/modules/account/gl" as string);
const fin: Any = await import("@/lib/modules/account/finance" as string);
const J2: Any = await import("@/lib/modules/account/journal-v2" as string);
const AT: Any = await import("@/lib/modules/account/audit-trail" as string);
const SL: Any = await import("@/lib/core/signin-log" as string);
const AUTH: Any = await import("@/lib/core/auth" as string);
const AUD: Any = await import("@/lib/core/audit" as string);
const ACK: Any = await import("@/lib/core/legal-ack" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const sysSvc: Any = await import("@/lib/modules/system/service" as string);

const TENANT_NAME = "QC T4.4 ร่องรอย";
const ROLLBACK = "__qc_rollback__";

async function purgeTenant(tenantId: string) {
  const rows: { table_name: string }[] = await prisma.$queryRaw`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE'`;
  let pending = rows.map((r) => r.table_name).filter((t) => t !== "TenantDeletionLog");
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

/** รันในธุรกรรมโหมดเข้มแล้วย้อนเสมอ · คืน "ok" หรือข้อความ error */
async function strict(fn: (tx: Any) => Promise<unknown>, opts: { purge?: string } = {}): Promise<string> {
  try {
    await prisma.$transaction(async (tx: Any) => {
      await tx.$executeRawUnsafe(`SET LOCAL shark.ledger_guard = 'strict'`);
      if (opts.purge) await tx.$executeRaw`SELECT set_config('shark.ledger_purge', ${opts.purge}, true)`;
      await fn(tx);
      throw new Error(ROLLBACK);
    });
    return "?";
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return m.includes(ROLLBACK) ? "ok" : m;
  }
}
const rejected = (r: string) => r.includes("LEDGER_GUARD");
const setMode = (m: "qc" | "strict") => prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION public.account_ledger_guard_mode() RETURNS text LANGUAGE sql STABLE AS $$ SELECT '${m}'::text $$`);

let tid = "";
const users: string[] = [];
try {
  // ═══ G0 โครง ═══
  console.log("\n── G0 ด่านในฐานข้อมูล ──");
  const trg: { tgname: string }[] = await prisma.$queryRaw`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('account_journal_entry_guard','account_journal_line_guard','account_audit_guard','tenant_deletion_log_guard')`;
  chk("G0.1", "trigger 4 ตัว (สมุดรายวัน หัว/บรรทัด · AuditLog · log การลบร้าน)", trg.length === 4, 4, trg.map((t) => t.tgname));
  const mode = (await prisma.$queryRaw`SELECT public.account_ledger_guard_mode() AS m`)[0]?.m;
  chk("G0.2", "ฐานทดสอบนี้โหมด qc (ล้างฟิกซ์เจอร์ได้) · migration ตั้ง strict เป็นค่าเริ่ม", mode === "qc" && /SELECT 'strict'::text/.test(src("prisma/migrations/20270103100000_acc_t44_ledger_guard/migration.sql")), "qc + strict ค่าเริ่ม", mode);

  // ═══ ฟิกซ์เจอร์ ═══
  console.log("\n── G1 ฟิกซ์เจอร์ ──");
  for (const old of await prisma.tenant.findMany({ where: { name: TENANT_NAME }, select: { id: true } })) await purgeTenant(old.id);
  const stamp = Date.now().toString(36);
  tid = (await prisma.tenant.create({ data: { name: TENANT_NAME, slug: `qc-t44-${stamp}`, status: "ACTIVE", enabledModules: ["ACCOUNT"] } })).id;
  const owner = await prisma.user.create({ data: { email: `qc-t44-${stamp}@qc.local`, name: "เจ้าของ T4.4" } });
  const clerk = await prisma.user.create({ data: { email: `qc-t44c-${stamp}@qc.local`, name: "พนักงานบัญชี T4.4" } });
  users.push(owner.id, clerk.id);
  await prisma.membership.create({ data: { userId: owner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  await prisma.membership.create({ data: { userId: clerk.id, tenantId: tid, role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const SYS = (await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T4.4")).id;
  const ctx = { tenantId: tid, systemId: SYS };
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน T4.4", vatRegistered: true, vatRateBp: 700, taxId: "0105561000017", branchCode: "00000" });
  await gl.ensureAccounting(ctx);
  const bankRes = await fin.createFinanceAccount({ tenantId: tid, systemId: SYS, type: "BANK", name: "ออมทรัพย์", bankName: "กสิกรไทย" });
  const bank = await prisma.accountFinance.findFirstOrThrow({ where: { id: bankRes.id }, select: { id: true, ledgerAccountId: true } });
  const cust = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "ลูกค้า T4.4", taxId: "0105561999917", branchCode: "00000" });
  const ledgerId = async (code: string) => (await prisma.accountLedger.findFirst({ where: { systemId: SYS, code }, select: { id: true } }))!.id;

  const today = new Date();
  const r1 = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "RECEIPT", contactId: cust.id, issueDate: today, vatMode: "EXCLUDE", lines: [{ description: "R1", qty: 1, unitPrice: 100_000, vatRateBp: 700 }], createdById: owner.id });
  const r1i = await acc.issueDocument(tid, SYS, r1.id);
  chk("G1.1", "ออกใบเสร็จ R1 (ลง JV)", r1i.ok, true, r1i);
  const e1 = await prisma.accountJournalEntry.findFirstOrThrow({ where: { systemId: SYS, refId: r1.id }, include: { lines: true } });
  const anyLine = e1.lines[0];

  // ═══ G2 โหมดเข้ม — ทางที่ปฏิเสธ / ทางที่ยอม (ย้อนทุกข้อ) ═══
  console.log("\n── G2 โหมดเข้ม (ธุรกรรมย้อน) ──");
  chk("G2.1", "แก้เดบิตของบรรทัด = ปฏิเสธ", rejected(await strict((tx) => tx.accountJournalLine.update({ where: { id: anyLine.id }, data: { debit: anyLine.debit + 1 } }))), "LEDGER_GUARD", "ผ่าน");
  chk("G2.2", "ย้ายบรรทัดไปบัญชีอื่น = ปฏิเสธ", rejected(await strict(async (tx) => tx.accountJournalLine.update({ where: { id: anyLine.id }, data: { accountId: await ledgerId("6900") } }))), "LEDGER_GUARD", "ผ่าน");
  chk("G2.3", "เปลี่ยนวันที่/งวดของใบสำคัญ = ปฏิเสธ", rejected(await strict((tx) => tx.accountJournalEntry.update({ where: { id: e1.id }, data: { date: new Date("2020-01-01"), periodKey: "2020-01" } }))), "LEDGER_GUARD", "ผ่าน");
  chk("G2.4", "แก้คำอธิบาย (memo) = ปฏิเสธ", rejected(await strict((tx) => tx.accountJournalEntry.update({ where: { id: e1.id }, data: { memo: "แก้เงียบ" } }))), "LEDGER_GUARD", "ผ่าน");
  chk("G2.5", "ลบบรรทัด = ปฏิเสธ", rejected(await strict((tx) => tx.accountJournalLine.delete({ where: { id: anyLine.id } }))), "LEDGER_GUARD", "ผ่าน");
  chk("G2.6", "ลบใบสำคัญ = ปฏิเสธ", rejected(await strict((tx) => tx.accountJournalEntry.delete({ where: { id: e1.id } }))), "LEDGER_GUARD", "ผ่าน");
  chk("G2.7", "SQL ตรง DELETE ทั้งร้าน = ปฏิเสธ", rejected(await strict((tx) => tx.$executeRawUnsafe(`DELETE FROM "AccountJournalLine" WHERE "tenantId" = $1`, tid))), "LEDGER_GUARD", "ผ่าน");
  chk("G2.8", "ติด/ปลดธงตรวจ (needsReview/flagNote) = ยอม", (await strict((tx) => tx.accountJournalEntry.update({ where: { id: e1.id }, data: { needsReview: true, flagNote: "ตรวจ" } }))) === "ok", "ok", "ปฏิเสธ");
  chk("G2.9", "สถานะ POSTED → REVERSED = ยอม", (await strict((tx) => tx.accountJournalEntry.update({ where: { id: e1.id }, data: { status: "REVERSED" } }))) === "ok", "ok", "ปฏิเสธ");
  chk(
    "G2.10",
    "สถานะ REVERSED → POSTED = ปฏิเสธ",
    rejected(await strict(async (tx) => {
      await tx.accountJournalEntry.update({ where: { id: e1.id }, data: { status: "REVERSED" } });
      await tx.accountJournalEntry.update({ where: { id: e1.id }, data: { status: "POSTED" } });
    })),
    "LEDGER_GUARD",
    "ผ่าน",
  );
  chk("G2.11", "กระทบยอดบรรทัด (reconciledAt) = ยอม", (await strict((tx) => tx.accountJournalLine.update({ where: { id: anyLine.id }, data: { reconciledAt: new Date() } }))) === "ok", "ok", "ปฏิเสธ");
  chk("G2.12", "ย้ายผู้ติดต่อของบรรทัด (รวมผู้ติดต่อ) = ยอม", (await strict((tx) => tx.accountJournalLine.update({ where: { id: anyLine.id }, data: { contactId: cust.id } }))) === "ok", "ok", "ปฏิเสธ");
  chk("G2.13", "เปลี่ยนที่มาที่ผูกแล้ว (refId) = ปฏิเสธ", rejected(await strict((tx) => tx.accountJournalEntry.update({ where: { id: e1.id }, data: { refId: "x" } }))), "LEDGER_GUARD", "ผ่าน");
  chk("G2.14", "ลบร้านของระบบ (shark.ledger_purge = ร้านนี้) = ยอมลบบรรทัด/ใบ", (await strict(async (tx) => { await tx.accountJournalLine.deleteMany({ where: { tenantId: tid } }); await tx.accountJournalEntry.deleteMany({ where: { tenantId: tid } }); }, { purge: tid })) === "ok", "ok", "ปฏิเสธ");
  chk("G2.15", "ค่าลบร้านเป็นร้านอื่น = ยังปฏิเสธ", rejected(await strict((tx) => tx.accountJournalLine.deleteMany({ where: { tenantId: tid } }), { purge: "other-tenant" })), "LEDGER_GUARD", "ผ่าน");
  // AuditLog
  const aAcc = await prisma.auditLog.create({ data: { tenantId: tid, actorType: "USER", actorId: owner.id, action: "account.doc.issue", targetType: "AccountDocument", targetId: r1.id, after: { x: 1 } } });
  const aPos = await prisma.auditLog.create({ data: { tenantId: tid, actorType: "USER", actorId: owner.id, action: "pos.qc.test", after: { x: 1 } } });
  chk("G2.16", "AuditLog บัญชี: แก้ after = ปฏิเสธ", rejected(await strict((tx) => tx.auditLog.update({ where: { id: aAcc.id }, data: { after: { x: 2 } } }))), "LEDGER_GUARD", "ผ่าน");
  chk("G2.17", "AuditLog บัญชี: ลบ = ปฏิเสธ", rejected(await strict((tx) => tx.auditLog.delete({ where: { id: aAcc.id } }))), "LEDGER_GUARD", "ผ่าน");
  chk("G2.18", "AuditLog บัญชี: tenantId → NULL (FK ตอนลบร้าน) = ยอม", (await strict((tx) => tx.$executeRawUnsafe(`UPDATE "AuditLog" SET "tenantId" = NULL WHERE id = $1`, aAcc.id))) === "ok", "ok", "ปฏิเสธ");
  chk("G2.19", "AuditLog ของโมดูลอื่น (pos.*) แก้/ลบได้เหมือนเดิม (PDPA ขัดตัวตน · ถอนการจอง)", (await strict(async (tx) => { await tx.auditLog.update({ where: { id: aPos.id }, data: { after: { x: 2 } } }); await tx.auditLog.delete({ where: { id: aPos.id } }); })) === "ok", "ok", "ปฏิเสธ");
  chk("G2.20", "AuditLog legal.warning.ack / auth.* อยู่ในชุดที่กัน", (await prisma.$queryRaw`SELECT public.account_audit_protected('legal.warning.ack') AND public.account_audit_protected('auth.signin') AND NOT public.account_audit_protected('crm.contact.erase') AS ok`)[0]?.ok === true, true, false);
  const modeAfter = (await prisma.$queryRaw`SELECT public.account_ledger_guard_mode() AS m`)[0]?.m;
  chk("G2.21", "โหมด qc (ไม่ตั้ง SET LOCAL) ยังล้างฟิกซ์เจอร์ได้", modeAfter === "qc" && (await prisma.$transaction(async (tx: Any) => { await tx.auditLog.delete({ where: { id: aAcc.id } }); return true; }).catch(() => false)), true, "ลบไม่ได้");

  // ═══ G3 ทางจริงของ service ทำงานได้ในโหมด strict (สลับโหมดฐานชั่วคราว) ═══
  console.log("\n── G3 ทางของระบบในโหมด strict ──");
  let r1voided: Any = null;
  let jvId = "";
  let jvRev: Any = null;
  let flag: Any = null;
  try {
    await setMode("strict");
    r1voided = await acc.voidDocument(tid, SYS, r1.id, "ออกผิดลูกค้า");
    await AUD.writeAudit({ tenantId: tid, actorId: clerk.id, action: "account.doc.void", targetType: "AccountDocument", targetId: r1.id, after: { ok: true, reason: "ออกผิดลูกค้า" } });
    const jv = await gl.postManualJV(ctx, { date: today, memo: "J1 ค่าใช้จ่าย", postedById: clerk.id, lines: [{ accountId: await ledgerId("6900"), debit: 50_000, credit: 0 }, { accountId: bank.ledgerAccountId ?? (await ledgerId("1010")), debit: 0, credit: 50_000 }] });
    jvId = jv.entryId;
    jvRev = await J2.reverseJournalEntry(ctx, jvId, "ลงผิดบัญชี");
    await AUD.writeAudit({ tenantId: tid, actorId: clerk.id, action: "account.journal.reverse", targetType: "AccountJournalEntry", targetId: jvId, after: jvRev?.ok ? { reversedBy: jvRev.entryId, reason: "ลงผิดบัญชี" } : { error: jvRev?.reason } }); // เหมือน action ของจอ
    flag = await J2.toggleNeedsReview(ctx, jvId, "ตรวจอีกครั้ง");
  } finally {
    await setMode("qc");
  }
  chk("G3.1", "ยกเลิกเอกสาร (กลับรายการ) ผ่านในโหมด strict", r1voided?.ok === true, true, r1voided);
  chk("G3.2", "JV มือ + กลับรายการ ผ่านในโหมด strict", !!jvId && jvRev?.ok === true, true, jvRev);
  chk("G3.3", "ติดธงตรวจ ผ่านในโหมด strict", flag?.ok === true, true, flag);
  const revs = await prisma.accountJournalEntry.findMany({ where: { systemId: SYS, reversalOfId: { not: null } }, include: { lines: true } });
  chk("G3.4", "กลับรายการ 2 ใบ (R1 107,000 · J1 50,000)", revs.length === 2 && revs.map((r: Any) => r.lines.reduce((n: number, l: Any) => n + l.debit, 0)).sort((a: number, b: number) => a - b).join() === "50000,107000", "50000,107000", revs.map((r: Any) => r.lines.reduce((n: number, l: Any) => n + l.debit, 0)));

  // ═══ G4 log เข้าระบบ ═══
  console.log("\n── G4 log การเข้าระบบ ──");
  await SL.writeSignInLog({ action: "auth.signin", userId: clerk.id, method: "otp", ip: "203.0.113.5", userAgent: "QC" });
  await SL.writeSignInLog({ action: "auth.signout", userId: clerk.id });
  const before = await prisma.auditLog.count({ where: { action: "auth.signin.failed", actorId: clerk.id } });
  await prisma.authToken.create({ data: { email: `qc-t44c-${stamp}@qc.local`, purpose: "OTP", tokenHash: "00", expiresAt: new Date(Date.now() + 600_000) } });
  const bad = await AUTH.verifyOtp(`qc-t44c-${stamp}@qc.local`, "999999");
  const after = await prisma.auditLog.count({ where: { action: "auth.signin.failed", actorId: clerk.id } });
  chk("G4.1", "รหัส OTP ผิด → auth.signin.failed ของผู้ใช้นั้น (ไม่เก็บอีเมลดิบ)", bad.ok === false && after === before + 1, before + 1, { bad, after });
  const failRow = await prisma.auditLog.findFirst({ where: { action: "auth.signin.failed", actorId: clerk.id }, orderBy: { createdAt: "desc" } });
  chk("G4.2", "แถว failed: targetId = sha256 ไม่ใช่อีเมล", !!failRow && failRow.targetId !== `qc-t44c-${stamp}@qc.local` && /^[0-9a-f]{64}$/.test(failRow.targetId ?? ""), "sha256", failRow?.targetId);
  const sess = src("src/lib/core/session.ts");
  chk("G4.3", "createSession เขียน auth.signin ทุกทางเข้า · ทุกจุดเรียกส่ง method", /writeSignInLog\(\{ action: "auth\.signin"/.test(sess) && ["src/lib/actions/auth.ts", "src/app/api/page-login/route.ts", "src/app/api/auth/line/callback/route.ts", "src/app/api/auth/google/callback/route.ts", "src/app/api/auth/facebook/callback/route.ts", "src/app/api/mobile/webview-exchange/route.ts"].every((p) => src(p).split("\n").filter((l) => /await createSession\(/.test(l)).every((l) => /method:/.test(l))), "ครบ", "ขาด");
  const sRow = await prisma.auditLog.findFirst({ where: { action: "auth.signin", actorId: clerk.id } });
  chk("G4.4", "log เข้าระบบแก้ไม่ได้ (โหมดเข้ม)", !!sRow && rejected(await strict((tx) => tx.auditLog.update({ where: { id: sRow.id }, data: { ip: "1.1.1.1" } }))), "LEDGER_GUARD", "ผ่าน");

  // ═══ G5 รายงานการแก้ไข ═══
  console.log("\n── G5 รายงานการแก้ไขของบัญชี ──");
  await prisma.$transaction((tx: Any) => ACK.recordLegalAckInTx(tx, { tenantId: tid, ack: { codes: ["FILED_PERIOD_VAT_CHANGE"], actorId: owner.id, actorType: "USER", via: "screen" }, op: "account.doc.issue", targetType: "AccountDocument", targetId: r1.id, warnings: [W.legalWarning("FILED_PERIOD_VAT_CHANGE", { period: "2026-11" })] }));
  const all = await AT.listAccountChanges(ctx, {});
  const voidRow = all.rows.find((r: Any) => r.action === "account.doc.void");
  chk("G5.1", "ยกเลิกเอกสาร: ใคร · เลขที่ · ยอด 107,000 · เหตุผล", voidRow?.actorName === "พนักงานบัญชี T4.4" && voidRow?.ref === r1i.docNo && voidRow?.amountSatang === 107_000 && voidRow?.reason === "ออกผิดลูกค้า" && voidRow?.category === "cancel", { name: "พนักงานบัญชี T4.4", amt: 107_000, reason: "ออกผิดลูกค้า" }, voidRow);
  const jr = all.rows.filter((r: Any) => r.source === "journal");
  chk("G5.2", "กลับรายการ 2 แถว · ยอด 107,000 + 50,000 · J1 มีเหตุผล 'ลงผิดบัญชี' + ผู้ทำ", jr.length === 2 && jr.reduce((n: number, r: Any) => n + r.amountSatang, 0) === 157_000 && jr.some((r: Any) => (r.reason ?? "").includes("ลงผิดบัญชี") && r.actorName === "พนักงานบัญชี T4.4"), "2 แถว 157,000", jr.map((r: Any) => ({ a: r.amountSatang, reason: r.reason, by: r.actorName })));
  const lg = all.rows.filter((r: Any) => r.category === "legal");
  chk("G5.3", "กดยืนยันคำเตือน: แถว legal พร้อมรหัส", lg.length === 1 && /FILED_PERIOD_VAT_CHANGE/.test(lg[0].detail ?? ""), 1, lg);
  const si = all.rows.filter((r: Any) => r.category === "signin");
  chk("G5.4", "เข้า/ออก/ไม่สำเร็จ ของสมาชิกร้าน 3 แถว · ทาง OTP · IP", si.length === 3 && si.some((r: Any) => r.action === "auth.signin" && /OTP/.test(r.detail ?? "") && /203\.0\.113\.5/.test(r.detail ?? "")), 3, si.map((r: Any) => [r.action, r.detail]));
  const cancelOnly = await AT.listAccountChanges(ctx, { kind: "cancel" });
  chk("G5.5", "ตัวกรอง 'ยกเลิก/กลับรายการ' = 3 แถว (ยกเลิก R1 + กลับรายการ 2)", cancelOnly.total === 3 && cancelOnly.rows.every((r: Any) => r.category === "cancel"), 3, cancelOnly.rows.map((r: Any) => r.action));
  const signOnly = await AT.listAccountChanges(ctx, { kind: "signin" });
  chk("G5.6", "ตัวกรอง 'เข้าระบบ' = 3 แถว", signOnly.total === 3, 3, signOnly.total);
  const page1 = await AT.listAccountChanges(ctx, { take: 2 });
  const page2 = await AT.listAccountChanges(ctx, { take: 2, cursor: page1.nextCursor });
  chk("G5.7", "แบ่งหน้า (2 ต่อหน้า) ไม่ซ้ำ", page1.rows.length === 2 && page2.rows.length >= 1 && !page2.rows.some((r: Any) => page1.rows.some((x: Any) => x.id === r.id)), "ไม่ซ้ำ", { p1: page1.rows.map((r: Any) => r.id), p2: page2.rows.map((r: Any) => r.id) });
  // สมุดอื่นของร้านเดียวกัน — แถวของสมุดนี้ไม่รั่ว
  const SYS2 = (await sysSvc.createSystem(tid, "ACCOUNT", "บัญชี T4.4 เล่ม 2")).id;
  const other = await AT.listAccountChanges({ tenantId: tid, systemId: SYS2 }, {});
  chk("G5.8", "สมุดเล่ม 2: ไม่เห็นยกเลิกเอกสาร/กลับรายการของเล่ม 1", !other.rows.some((r: Any) => r.action === "account.doc.void" || r.source === "journal"), "ไม่เห็น", other.rows.map((r: Any) => r.action));
  const csv = AT.auditTrailCsv(all.rows);
  chk("G5.9", "CSV: BOM + หัวคอลัมน์ตามรายงานการแก้ไข (วันเวลา · ผู้ทำ · รายการ · เอกสาร · จำนวนเงิน · เหตุผล)", csv.startsWith("﻿") && /วันเวลา.*ผู้ทำ.*รายการ.*เอกสาร.*จำนวนเงิน.*เหตุผล/.test(csv.split("\n")[0]) && /1070\.00/.test(csv), "ครบ", csv.split("\n")[0]);

  // ═══ G6 เหตุผลยกเลิก (ทางของผู้ใช้) ═══
  console.log("\n── G6 เหตุผลยกเลิก ──");
  const files = ["src/lib/modules/account/actions.ts", "src/lib/modules/account/expense-actions.ts", "src/lib/modules/account/payment-actions.ts", "src/lib/modules/account/group-actions.ts"];
  chk("G6.1", "ทุก action ยกเลิกของจอใช้ CANCEL_REASON_REQUIRED_TH (เหตุผลว่าง = ไม่ทำ)", files.every((p) => /CANCEL_REASON_REQUIRED_TH/.test(src(p))), "ครบ", files.filter((p) => !/CANCEL_REASON_REQUIRED_TH/.test(src(p))));
  chk("G6.2", "ไม่มีการเติม 'ยกเลิกการชำระ' แทนเหตุผลที่ว่างแล้ว", !files.some((p) => /\|\| "ยกเลิกการชำระ"/.test(src(p))) && !/\|\| "ยกเลิกการชำระ"/.test(src("src/components/account-v2/PaymentPanel.tsx")) && !/\|\| "ยกเลิกการชำระ"/.test(src("src/components/account-v2/GroupPaymentPanel.tsx")), "ไม่มี", "ยังมี");
  chk("G6.3", "audit ของยกเลิกเอกสาร/รายการชำระเก็บ reason", /action: "account\.doc\.void"[\s\S]{0,200}reason/.test(src("src/lib/modules/account/actions.ts")) && /action: "account\.payment\.void"[\s\S]{0,200}reason/.test(src("src/lib/modules/account/actions.ts")), "มี", "ไม่มี");
  chk("G6.4", "กล่องยืนยันยกเลิกเอกสารบนหน้าเอกสาร: เหตุผล required", /label: "เหตุผลการยกเลิก", required: true/.test(src("src/components/account-v2/DocDetailPage.tsx")), "required", "ไม่ required");
  chk("G6.5", "REST: documents.void / payments.void / journal.reverse / cheques.void / wht.unmark-filed ต้องมี reason", /reason: z\.string\(\)\.min\(5\)/.test(src("src/lib/modules/account/api/ops/documents-write.ts")) && /reasonField\("Why the entry is being reversed\."\)/.test(src("src/lib/modules/account/api/ops/gl-write.ts")), "มี", "ไม่มี", "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message.slice(0, 400)}\n${e.stack?.split("\n").slice(1, 5).join("\n")}` : String(e));
  await setMode("qc").catch(() => undefined);
} finally {
  if (tid && !KEEP) await purgeTenant(tid).catch(() => undefined);
  for (const u of users) {
    await prisma.authToken.deleteMany({ where: { email: { startsWith: "qc-t44" } } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: u } }).catch(() => undefined);
  }
  await prisma.$disconnect();
}

const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC ACC T4.4 ร่องรอย =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
