// QC Account REST — ACC T5.4 e-Tax by Time Stamp + ACC T5c ของค้าง (เลน 2) ผ่าน route จริง /api/v1/account + เครื่องมือเลขา AI (ทะเบียนเดียวกัน)
//   GET/PATCH /etax/settings (T5.4-API.1/2) · GET /documents/{id}/etax (T5.4-API.3) · POST /documents/{id}/etax/send (409 legal_ack_required → acknowledge · T5.4-API.4)
//   POST /documents/{id}/etax/stamped (T5.4-API.5) · GET /etax/files/{id} (T5.4-API.6)
//   POST /documents/{id}/bad-debt-recovery (T5c-API.1a) · POST /bad-debt/recoveries/{id}/void (T5c-API.1b · danger) · PUT /settings/statement-meetings/{fyEnd} (T5c-API.2)
//   ห้ามเครือข่าย: fetch ทั้งโพรเซส = ตัวนับที่โยน · ร้านทดสอบแยก "QC T5.4 REST"
// รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-account-api-etax.mts
import { createHash } from "node:crypto";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-etax");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 900)}`}`);
};
const eq = (id: string, n: string, act: unknown, exp: unknown, sev: Sev = "CRITICAL") => chk(id, n, JSON.stringify(act) === JSON.stringify(exp), exp, act, sev);
let netCalls = 0;
globalThis.fetch = (async () => {
  netCalls += 1;
  throw new Error("QC: ห้ามเรียกเครือข่าย");
}) as typeof fetch;

const KEEP = process.env.KEEP === "1";
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
const ak: Any = await import("@/lib/api-keys/service" as string);
const scopes: Any = await import("@/lib/api-keys/scopes" as string);
const route: Any = await import("@/app/api/v1/account/[...path]/route" as string);
const AO: Any = await import("@/lib/ai/account-ops" as string);
const SK: Any = await import("@/lib/ai/skills" as string);
const REG: Any = await import("@/lib/modules/account/api/registry" as string);
const TR: Any = await import("@/lib/modules/account/etax-transport" as string);
const W: Any = await import("@/lib/core/settings/legal/warnings" as string);
const BD: Any = await import("@/lib/modules/account/bad-debt" as string);

console.log("\n── A0 ทะเบียน REST + เครื่องมือเลขา AI ──");
{
  const tools = AO.accountToolInfos();
  const want: Record<string, [string, boolean]> = {
    account_etax_status: ["etax.document", false],
    account_etax_send: ["etax.send", true],
    account_etax_record_stamped: ["etax.stamped", true],
    account_update_etax_settings: ["etax.settings.update", true],
    account_recover_bad_debt: ["bad-debt.recover", true],
    account_void_bad_debt_recovery: ["bad-debt.recovery-void", true],
    account_set_statement_meeting: ["settings.statement-meeting", true],
  };
  eq("A0.1", "เครื่องมือใหม่ผูก op · เขียน = ข้อเสนอ", Object.keys(want).map((n) => { const t = tools.find((x: Any) => x.name === n); return t ? [t.opId, t.write] : null; }), Object.values(want));
  const inSkills = (n: string) => (SK.SKILLS ?? []).filter((s: Any) => (s.tools ?? []).includes(n)).map((s: Any) => s.id);
  eq("A0.2", "ทุกเครื่องมือใหม่อยู่ในสกิล account สกิลเดียว", Object.keys(want).map(inSkills), Object.keys(want).map(() => ["account"]));
  const IDS: Record<string, string> = { "etax.settings": "T5.4-API.1", "etax.settings.update": "T5.4-API.2", "etax.document": "T5.4-API.3", "etax.send": "T5.4-API.4", "etax.stamped": "T5.4-API.5", "etax.file": "T5.4-API.6", "bad-debt.recover": "T5c-API.1a", "bad-debt.recovery-void": "T5c-API.1b", "settings.statement-meeting": "T5c-API.2" };
  eq("A0.3", "op ใหม่ 9 ตัวอยู่ในทะเบียน + test id ตรง", Object.keys(IDS).map((id) => (REG.ACCOUNT_OPS as Any[]).find((o) => o.id === id)?.test ?? null), Object.values(IDS));
  eq("A0.4", "ยกเลิกรายการรับคืน = danger · summary ASCII ล้วน", [(REG.ACCOUNT_OPS as Any[]).find((o) => o.id === "bad-debt.recovery-void")?.kind, Object.keys(IDS).every((id) => /^[\x20-\x7E]*$/.test((REG.ACCOUNT_OPS as Any[]).find((o) => o.id === id)?.summary ?? "x"))], ["danger", true]);
}

let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T5.4 REST", "qc-t54-api");
  tid = S.tid;
  prisma = S.prisma;
  const SYS = S.SYS;
  const kW = await ak.createApiKey({ tenantId: S.tid }, "T5.4 write", { scopes: scopes.expandBundles(["accountant", "settings", "danger"]), systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: S.tid }, "T5.4 read", { scopes: ["account.journal.view", "account.report.view", "account.doc.view"], systemId: SYS });
  const call = async (method: string, path: string, key: string, body?: unknown) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : { "idempotency-key": `t54-${Date.now()}-${Math.random().toString(16).slice(2)}` }) };
    let b: string | undefined;
    if (body !== undefined) {
      b = JSON.stringify(body);
      headers["content-type"] = "application/json";
    }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body: b });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let parsed: Any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { _raw: text };
    }
    return { status: res.status, body: parsed };
  };
  const acc: Any = await import("@/lib/modules/account/service" as string);
  const buyer = await acc.createContact({ tenantId: S.tid, systemId: SYS, kind: "CUSTOMER", legalType: "COMPANY", name: "บริษัท ผู้ซื้อ เรสต์ จำกัด", taxId: F.thaiTaxId("010556166661"), branchCode: "00000", address: "66 ถ.หก ระยอง", email: "rest-buyer@example.test" });
  const tx = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType: "TAX_INVOICE", contactId: buyer.id, vatMode: "EXCLUDE", lines: [{ description: "ค่าเช่าเรือ", qty: 1, unitPrice: 500_000, discount: 0, vatRateBp: 700 }], createdById: S.owner.id });
  const iss = await acc.issueDocument(S.tid, SYS, tx.id, { ack: { codes: W.LEGAL_WARNING_CODES, actorId: S.owner.id } });
  if (!iss.ok) throw new Error(iss.reason);

  console.log("\n── T5.4 ค่าตั้ง ──");
  const g0 = await call("GET", "/etax/settings", kR.rawKey);
  eq("E1.1", "GET settings: ปิด · CAPTURE · แถวตาราง 7 แถว [V] · จุดต่อผู้ให้บริการปิด", [g0.status, g0.body?.data?.enabled, g0.body?.data?.transport, g0.body?.data?.legalRows?.length, (g0.body?.data?.legalRows ?? []).every((r: Any) => r.tag === "V"), g0.body?.data?.provider?.available], [200, false, "CAPTURE", 7, true, false]);
  const pR = await call("PATCH", "/etax/settings", kR.rawKey, { enabled: true });
  eq("E1.2", "คีย์อ่านอย่างเดียวแก้ค่าตั้งไม่ได้ → 403", pR.status, 403);
  const p1 = await call("PATCH", "/etax/settings", kW.rawKey, { enabled: true, senderEmail: "tax@rest.test" });
  const pBad = await call("PATCH", "/etax/settings", kW.rawKey, { senderEmail: "x" });
  const pUnk = await call("PATCH", "/etax/settings", kW.rawKey, { eligibility: "MAYBE" });
  eq("E1.3", "PATCH: เปิด + อีเมลผู้ส่ง → 200 · อีเมลผิดรูป 422 · ค่า enum ไม่รู้จัก 422", [p1.status, p1.body?.data?.enabled, p1.body?.data?.senderEmail, pBad.status, pUnk.status], [200, true, "tax@rest.test", 422, 422]);

  console.log("\n── T5.4 ส่ง ──");
  const d0 = await call("GET", `/documents/${tx.id}/etax`, kR.rawKey);
  eq("E2.1", "GET สถานะ: NOT_SENT · ส่งได้ · หัวเรื่องตัวอย่าง [..][INV][เลขที่]", [d0.status, d0.body?.data?.state, d0.body?.data?.canSend, /^\[\d{8}\]\[INV\]\[[^\]]+\]$/.test(d0.body?.data?.subject ?? "")], [200, "NOT_SENT", true, true]);
  const s0 = await call("POST", `/documents/${tx.id}/etax/send`, kW.rawKey, {});
  eq("E2.2", "ส่งไม่ยืนยัน → 409 legal_ack_required + ETAX_TS_NOT_DECLARED (ไม่มีแถว)", [s0.status, s0.body?.error?.code, (s0.body?.error?.warnings ?? []).filter((w: Any) => w.ack ?? w.needsAcknowledge).map((w: Any) => w.code), await prisma.accountEtaxSubmission.count({ where: { tenantId: S.tid } })], [409, "legal_ack_required", ["ETAX_TS_NOT_DECLARED"], 0]);
  const sR = await call("POST", `/documents/${tx.id}/etax/send`, kR.rawKey, { acknowledge: ["ETAX_TS_NOT_DECLARED"] });
  eq("E2.3", "คีย์อ่านอย่างเดียวส่งไม่ได้ → 403", sR.status, 403);
  const n0 = TR.CAPTURED_ETAX_MAILS.length;
  const s1 = await call("POST", `/documents/${tx.id}/etax/send`, kW.rawKey, { acknowledge: ["ETAX_TS_NOT_DECLARED"] });
  const m = TR.CAPTURED_ETAX_MAILS[TR.CAPTURED_ETAX_MAILS.length - 1];
  eq("E2.4", "ส่ง → 200 SENT · อีเมล 1 ฉบับ (จับไว้) · ถึงผู้ซื้อ · สำเนา csemail · sha256 ตรงไฟล์ที่จับ", [s1.status, s1.body?.data?.status, TR.CAPTURED_ETAX_MAILS.length - n0, s1.body?.data?.to, s1.body?.data?.cc, s1.body?.data?.sha256 === createHash("sha256").update(m.attachment.content).digest("hex")], [200, "SENT", 1, "rest-buyer@example.test", "csemail@etax.teda.th", true]);
  const ack = await prisma.auditLog.findFirst({ where: { tenantId: S.tid, action: "legal.warning.ack", targetId: tx.id }, select: { actorType: true, after: true } });
  eq("E2.5", "รอยกดยืนยันของคีย์ API (via rest)", [ack?.actorType, ack?.after?.via], ["API_KEY", "rest"]);
  const rc = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType: "RECEIPT", contactId: buyer.id, vatMode: "EXCLUDE", lines: [{ description: "ค่าบริการ", qty: 1, unitPrice: 10_000, discount: 0, vatRateBp: 700 }], createdById: S.owner.id });
  await acc.issueDocument(S.tid, SYS, rc.id, { ack: { codes: W.LEGAL_WARNING_CODES, actorId: S.owner.id } });
  const sRc = await call("POST", `/documents/${rc.id}/etax/send`, kW.rawKey, { acknowledge: ["ETAX_TS_NOT_DECLARED"] });
  const sNo = await call("POST", `/documents/nope-xyz/etax/send`, kW.rawKey, { acknowledge: ["ETAX_TS_NOT_DECLARED"] });
  eq("E2.6", "ใบเสร็จ → 409 state_conflict (ไม่ครอบ) · ไม่มีเอกสาร → 404", [sRc.status, sRc.body?.error?.code, sNo.status], [409, "state_conflict", 404]);

  console.log("\n── T5.4 ไฟล์ประทับเวลา + อ่านไฟล์ ──");
  const stamped = Buffer.concat([Buffer.from(m.attachment.content), Buffer.from("\n%SIMULATED-STAMP\n")]);
  const bad = await call("POST", `/documents/${tx.id}/etax/stamped`, kW.rawKey, { fileName: "x.pdf", contentBase64: Buffer.from("not a pdf at all").toString("base64") });
  const st = await call("POST", `/documents/${tx.id}/etax/stamped`, kW.rawKey, { fileName: "stamped.pdf", contentBase64: stamped.toString("base64") });
  eq("E3.1", "ไม่ใช่ PDF → 422 · PDF → 200 STAMPED · sha256 ของไฟล์ที่ส่งมา", [bad.status, st.status, st.body?.data?.state, st.body?.data?.sha256 === createHash("sha256").update(stamped).digest("hex")], [422, 200, "STAMPED", true]);
  const d1 = await call("GET", `/documents/${tx.id}/etax`, kR.rawKey);
  const att = d1.body?.data?.attempts?.[0];
  eq("E3.2", "GET สถานะ: STAMPED · ครั้งที่ 1 มีไฟล์ที่ส่ง + ไฟล์ประทับเวลา", [d1.body?.data?.state, att?.attemptNo, !!att?.sentFileId, att?.stampedFileId === st.body?.data?.fileId], ["STAMPED", 1, true, true]);
  const f1 = await call("GET", `/etax/files/${att.sentFileId}`, kR.rawKey);
  eq("E3.3", "GET ไฟล์ที่ส่ง: base64 ไบต์ตรงกับที่จับ · intact · role SENT", [f1.status, f1.body?.data?.role, f1.body?.data?.intact, Buffer.from(f1.body?.data?.contentBase64 ?? "", "base64").equals(Buffer.from(m.attachment.content))], [200, "SENT", true, true]);
  const f404 = await call("GET", "/etax/files/nope-xyz", kR.rawKey);
  eq("E3.4", "ไฟล์ที่ไม่มี → 404", f404.status, 404);
  const ai = await AO.runAccountTool(S.tid, "account_etax_status", { id: tx.id, documentId: tx.id }, { systemId: SYS, viewer: { role: "OWNER", unitAccess: ["*"], permissions: {} } });
  chk("E3.ai", "เลขา: account_etax_status อ่านได้ทันที", ai.mode === "read", "read", ai);
  const ai2 = await AO.runAccountTool(S.tid, "account_etax_send", { id: tx.id, documentId: tx.id }, { systemId: SYS, viewer: { role: "OWNER", unitAccess: ["*"], permissions: {} } });
  chk("E3.ai2", "เลขา: account_etax_send = ข้อเสนอ (ไม่ส่งเอง)", ai2.mode !== "read" && (await prisma.accountEtaxSubmission.count({ where: { documentId: tx.id } })) === 1, "proposal", ai2);

  console.log("\n── T5c หนี้สูญได้รับคืน · วันประชุม ──");
  const inv = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType: "INVOICE", contactId: S.cust.id, vatMode: "NONE", lines: [{ description: "บริการ", qty: 1, unitPrice: 300_000, vatRateBp: 0 }], createdById: S.owner.id });
  await acc.issueDocument(S.tid, SYS, inv.id, { ack: { codes: W.LEGAL_WARNING_CODES, actorId: S.owner.id } });
  await BD.writeOffBadDebt(S.ctx, { documentId: inv.id, ack: { codes: ["BAD_DEBT_TAX_CONDITIONS"] } });
  const r1 = await call("POST", `/documents/${inv.id}/bad-debt-recovery`, kW.rawKey, { amountSatang: 100_000, channel: "TRANSFER", financeAccountId: S.bank.id });
  eq("C1.1", "รับคืน 1,000 → 200 · คำเตือน BAD_DEBT_RECOVERY_INCOME", [r1.status, r1.body?.data?.amountSatang, (r1.body?.data?.warnings ?? []).map((w: Any) => w.code)], [200, 100_000, ["BAD_DEBT_RECOVERY_INCOME"]]);
  const rOver = await call("POST", `/documents/${inv.id}/bad-debt-recovery`, kW.rawKey, { amountSatang: 300_000 });
  const rR = await call("POST", `/documents/${inv.id}/bad-debt-recovery`, kR.rawKey, { amountSatang: 1 });
  eq("C1.2", "เกินยอดคงเหลือ 2,000 → 4xx · คีย์อ่านอย่างเดียว → 403", [rOver.status >= 400 && rOver.status < 500, rR.status], [true, 403]);
  const sum = await call("GET", "/bad-debt", kR.rawKey);
  const wd = (sum.body?.data?.writtenOffDocuments ?? []).find((w: Any) => w.documentId === inv.id);
  eq("C1.3", "GET /bad-debt: ตัด 3,000 รับคืน 1,000 คงเหลือ 2,000 · รายการรับคืน 1", [wd?.writtenOffSatang, wd?.recoveredSatang, wd?.recoverableSatang, (sum.body?.data?.recoveries ?? []).length], [300_000, 100_000, 200_000, 1]);
  const dd = await call("GET", `/documents/${inv.id}`, kR.rawKey);
  eq("C1.4", "GET เอกสาร: status PAID + badDebt FULL \"ตัดหนี้สูญ\" (ฟิลด์ที่คำนวณ)", [dd.body?.data?.status, dd.body?.data?.badDebt], ["PAID", { state: "FULL", writtenOffSatang: 300_000, label: "ตัดหนี้สูญ" }]);
  const lst = await call("GET", "/documents?type=INVOICE", kR.rawKey);
  const row = (lst.body?.data ?? lst.body?.data?.rows ?? []).find?.((r: Any) => r.id === inv.id);
  eq("C1.5", "GET รายการ: แถวเดียวกันมี badDebt FULL", row?.badDebt?.state ?? null, "FULL");
  const v0 = await call("POST", `/bad-debt/recoveries/${r1.body?.data?.recoveryId}/void`, kW.rawKey, { reason: "สั้น", confirm: true });
  const v1 = await call("POST", `/bad-debt/recoveries/${r1.body?.data?.recoveryId}/void`, kW.rawKey, { reason: "บันทึกผิดใบ ยกเลิก", confirm: true });
  eq("C1.6", "ยกเลิก (danger): เหตุผลสั้น → 422 · ครบ → 200", [v0.status, v1.status < 300, v1.body?.data?.voided], [422, true, true]);
  const mt = await call("PUT", "/settings/statement-meetings/2026-12-31", kW.rawKey, { meetingDate: "2027-04-20" });
  const mtBad = await call("PUT", "/settings/statement-meetings/2026-12-31", kW.rawKey, { meetingDate: "2026-01-01" });
  const mtPath = await call("PUT", "/settings/statement-meetings/abc", kW.rawKey, { meetingDate: "2027-04-20" });
  eq("C2.1", "วันประชุม: บันทึก 200 · ก่อนสิ้นรอบ 4xx · path ผิดรูป 422", [mt.status, mt.body?.data?.meetings, mtBad.status >= 400 && mtBad.status < 500, mtPath.status], [200, [{ fyEnd: "2026-12-31", meetingDate: "2027-04-20" }], true, 422]);
  const dl = await call("GET", "/settings/tax/deadlines?asOf=2027-03-10", kR.rawKey);
  eq("C2.2", "ปฏิทิน (op เดิม): ยื่นงบบริษัทมีวัน 2027-05-20", dl.body?.data?.calendar?.items?.find((i: Any) => i.form === "FS_COMPANY")?.paper?.date ?? null, "2027-05-20");
  const ab = await call("GET", "/reports/tax-add-back?asOf=2026-12-31&carMonths=1", kR.rawKey);
  eq("C3.1", "tax-add-back รับ carMonths · คืน donation/carRent (มีหรือ null)", [ab.status, "donation" in (ab.body?.data ?? {}), ab.body?.data?.carRent?.carMonths], [200, true, 1]);
  eq("Z.1", "ไม่มีการเรียกเครือข่าย", netCalls, 0);
} catch (e) {
  chk("X", "ไม่มี exception", false, "no error", String((e as Error)?.stack ?? e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account REST — ACC T5.4 e-Tax + T5c =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length ? 1 : 0);
