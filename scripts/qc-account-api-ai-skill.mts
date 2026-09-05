// QC — API บัญชี WO E1: สกิล AI `account` — tools สร้างจากทะเบียน op (อ่าน=ทำทันที · เขียน=proposal) + proposal kinds + dispatch ผ่าน command เดียวกับ REST
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §E1
// อ่านใช้ seed SIAM DIVE QC (ตัวเลขเฉลย) · เขียนใช้ tenant ใหม่ (ลบทิ้งใน finally) · MockProvider เสมอ
// ⚠️ standalone-typesafe: dynamic import + wide cast
process.env.SHARK_AI_MOCK = "1";
import { readFileSync } from "node:fs";
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string }; QC: { expectedPath: string } };
const { loadQcEnv, QC } = accEnv;
loadQcEnv();
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as Any;
const parse = (s: string): Any => { try { return JSON.parse(s); } catch { return { _raw: s }; } };
const ymd = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);

let tid = "";
try {
  const skills = (await import("@/lib/ai/skills" as string)) as Record<string, Any>;
  const tools = (await import("@/lib/ai/tools" as string)) as Record<string, Any>;
  const proposals = (await import("@/lib/ai/proposals" as string)) as Record<string, Any>;
  const registry = (await import("@/lib/modules/account/api/registry" as string)) as Record<string, Any>;
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;

  // ═══ K1 ทะเบียนสกิล ═══
  const skill = (skills.SKILLS as Any[]).find((s) => s.id === "account");
  chk("E1-K1.1", "SKILLS มีสกิล id=account · label ไทย · summary อังกฤษ · systems [ACCOUNT]", !!skill && /[ก-๙]/.test(skill.label) && /^[\x00-\x7F]+$/.test(skill.summary) && JSON.stringify(skill.systems) === JSON.stringify(["ACCOUNT"]), "มี", JSON.stringify(skill).slice(0, 200));
  const toolNames = (skill?.tools ?? []) as string[];
  chk("E1-K1.2", "สกิลมี tool ≥ 30 ตัว ทุกตัวขึ้นต้น account_", toolNames.length >= 30 && toolNames.every((n) => n.startsWith("account_")), "≥30", `${toolNames.length}`);
  const reg = tools.toolRegistry() as Any[];
  const regNames = new Set(reg.map((t) => t.def.name));
  chk("E1-K1.3", "ทุก tool ของสกิลอยู่ใน toolRegistry จริง + assertSkillRegistryComplete ไม่โยน", toolNames.every((n) => regNames.has(n)) && (() => { try { skills.assertSkillRegistryComplete(); return true; } catch { return false; } })(), "ครบ", toolNames.filter((n) => !regNames.has(n)).join(","));
  const ops = (registry.ACCOUNT_OPS as Any[]).filter((o) => o.tool);
  chk("E1-K1.4", "op ที่ประกาศ tool ในทะเบียน = tool ของสกิล (ชื่อตรงกันทุกตัว ไม่ขาดไม่เกิน)", ops.length === toolNames.length && ops.every((o) => toolNames.includes(o.tool.name)), `${ops.length}`, `ops=${ops.length} skill=${toolNames.length} missing=${ops.filter((o) => !toolNames.includes(o.tool.name)).map((o) => o.tool.name).join(",")}`);
  const must = ["account_dashboard", "account_list_documents", "account_get_document", "account_report", "account_search_contacts", "account_search_products", "account_finance_balances", "account_create_document", "account_issue_document", "account_record_payment", "account_void_document", "account_create_contact", "account_create_payment_link", "account_close_period"];
  chk("E1-K1.5", "มี tool หลักครบ (dashboard/list/get/report/contacts/products/balances/create/issue/payment/void/contact/payment-link/close-period)", must.every((n) => toolNames.includes(n)), "ครบ", must.filter((n) => !toolNames.includes(n)).join(","));
  const writeTools = reg.filter((t) => toolNames.includes(t.def.name) && t.action);
  const readTools = reg.filter((t) => toolNames.includes(t.def.name) && !t.action);
  chk("E1-K1.6", "tool ที่มาจาก op write/danger มี action=true · จาก op read ไม่มี", ops.filter((o) => o.kind !== "read").every((o) => writeTools.some((t) => t.def.name === o.tool.name)) && ops.filter((o) => o.kind === "read").every((o) => readTools.some((t) => t.def.name === o.tool.name)), "ตรง", `write=${writeTools.length} read=${readTools.length}`);
  chk("E1-K1.7", "description ของทุก tool เป็นอังกฤษ + parameters เป็น object schema (additionalProperties false)", reg.filter((t) => toolNames.includes(t.def.name)).every((t) => /^[\x00-\x7F]+$/.test(t.def.description) && t.def.parameters?.type === "object" && t.def.parameters?.additionalProperties === false), "EN + strict", reg.filter((t) => toolNames.includes(t.def.name) && !/^[\x00-\x7F]+$/.test(t.def.description)).map((t) => t.def.name).join(","), "MAJOR");
  chk("E1-K1.8", "skillsForTenant([\"POS\"]) ไม่เห็น account · ([\"ACCOUNT\"]) เห็น", !(skills.skillsForTenant(["POS"]) as Any[]).some((s) => s.id === "account") && (skills.skillsForTenant(["ACCOUNT"]) as Any[]).some((s) => s.id === "account"), "กรองตามระบบ", "?");

  // ═══ K2 อ่าน (seed) ═══
  const seedCtx = { tenantId: E.tenantId as string };
  const dash = parse(await tools.runTool(seedCtx, "account_dashboard", {}));
  const dashStr = JSON.stringify(dash);
  chk("E1-K2.1", "account_dashboard → JSON ไม่ error · มียอดค้างรับ (บาท) = เฉลย", !dash.error && dashStr.includes(String(E.receivable / 100)) , `${E.receivable / 100}`, dashStr.slice(0, 200));
  chk("E1-K2.2", "ผล tool ใช้คีย์ภาษาไทย (สำหรับ LLM เรียบเรียง) และไม่มี tenantId/systemId", /[ก-๙]/.test(dashStr) && !/tenantId|systemId/.test(dashStr), "ไทย", dashStr.slice(0, 120), "MAJOR");
  const list = parse(await tools.runTool(seedCtx, "account_list_documents", { type: "INVOICE", tab: "overdue" }));
  chk("E1-K2.3", "account_list_documents {type:INVOICE,tab:overdue} → รายการ 4 ใบ (เฉลย overdue)", !list.error && JSON.stringify(list).includes(`${E.invoiceTabs.overdue}`) && Array.isArray(Object.values(list).find((v) => Array.isArray(v))) && (Object.values(list).find((v) => Array.isArray(v)) as Any[]).length === E.invoiceTabs.overdue, `${E.invoiceTabs.overdue}`, JSON.stringify(list).slice(0, 200));
  const badList = parse(await tools.runTool(seedCtx, "account_list_documents", { type: "NOPE" }));
  chk("E1-K2.4", "args ผิด (type ไม่รู้จัก) → {error: ไทย} ไม่ throw", typeof badList.error === "string" && /[ก-๙]/.test(badList.error), "error ไทย", JSON.stringify(badList).slice(0, 120));
  const rep = parse(await tools.runTool(seedCtx, "account_report", { kind: "profit-loss", from: "2026-09-01", to: "2026-09-30" }));
  chk("E1-K2.5", "account_report {kind:profit-loss} → มีกำไรสุทธิ/รายได้ (ตัวเลขจาก GL จริง)", !rep.error && /กำไร|รายได้/.test(JSON.stringify(rep)), "มี", JSON.stringify(rep).slice(0, 200));
  const aging = parse(await tools.runTool(seedCtx, "account_report", { kind: "aging", direction: "AR" }));
  chk("E1-K2.6", "account_report {kind:aging} → ยอดรวม = เฉลย receivable (บาท)", !aging.error && JSON.stringify(aging).includes(String(E.receivable / 100)), `${E.receivable / 100}`, JSON.stringify(aging).slice(0, 160));
  const noSys = parse(await tools.runTool({ tenantId: "no-such-tenant" }, "account_dashboard", {}));
  chk("E1-K2.7", "ร้านที่ไม่มีระบบบัญชี → {error: 'ยังไม่ได้เปิดระบบบัญชี'} ไทย", typeof noSys.error === "string" && /[ก-๙]/.test(noSys.error), "error ไทย", JSON.stringify(noSys).slice(0, 120));
  const contacts = parse(await tools.runTool(seedCtx, "account_search_contacts", { q: "ณัฐพล" }));
  chk("E1-K2.8", "account_search_contacts {q} → เจอ ณัฐพล", !contacts.error && /ณัฐพล/.test(JSON.stringify(contacts)), "เจอ", JSON.stringify(contacts).slice(0, 160));

  // ═══ K3 เขียน = proposal (tenant ใหม่) ═══
  const t = await prisma.tenant.create({ data: { name: "QC API E1", slug: `qc-api-e1-${Date.now()}` } });
  tid = t.id;
  const s = await sys.createSystem(tid, "ACCOUNT", "บัญชี E1");
  const SYS = s.id;
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน E1", taxId: "0105561000013", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: tid, systemId: SYS });
  const customer = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", name: "ณัฐพล ทดสอบ" });
  const cash = await fin.createFinanceAccount({ tenantId: tid, systemId: SYS, type: "CASH", name: "เงินสด" });
  const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "QC E1" } });
  const ctx = { tenantId: tid, conversationId: conv.id };
  const owner: Any = { role: "OWNER", unitAccess: ["*"], permissions: {} };
  const staffNoPerm: Any = { role: "STAFF", unitAccess: ["*"], permissions: {} };

  const noConv = parse(await tools.runTool({ tenantId: tid }, "account_create_document", { type: "INVOICE", contactId: customer.id, lines: [{ description: "x", qty: 1, unitPriceSatang: 100000 }] }));
  chk("E1-K3.1", "tool เขียนโดยไม่มี conversationId → error ไทย (ต้องอยู่ในบทสนทนา)", typeof noConv.error === "string", "error", JSON.stringify(noConv).slice(0, 120));
  const created = parse(await tools.runTool(ctx, "account_create_document", { type: "INVOICE", contactId: customer.id, issueDate: ymd(), lines: [{ description: "ทริปดำน้ำ", qty: 2, unitPriceSatang: 500000, vatRateBp: 700 }] }));
  chk("E1-K3.2", "account_create_document → {proposalId, summary ไทย, waiting:user_confirm} · ยังไม่มีเอกสารเกิด", typeof created.proposalId === "string" && created.waiting === "user_confirm" && /[ก-๙]/.test(created.summary ?? "") && (await prisma.accountDocument.count({ where: { systemId: SYS } })) === 0, "proposal", JSON.stringify(created).slice(0, 200));
  const prop = await prisma.aiProposal.findUnique({ where: { id: created.proposalId } });
  chk("E1-K3.3", "AiProposal kind=account.documents.create · risk NORMAL · summary มีชื่อลูกค้า+ยอดบาท", prop?.kind === "account.documents.create" && prop?.risk === "NORMAL" && /ณัฐพล/.test(prop?.summary ?? "") && /1,070,000|10,700/.test(prop?.summary ?? ""), "NORMAL + สรุป", `${prop?.kind} ${prop?.risk} ${prop?.summary}`);
  const denied = await proposals.executeProposal(staffNoPerm, { tenantId: tid }, created.proposalId);
  chk("E1-K3.4", "STAFF ไม่มีสิทธิ์กดยืนยัน → ok:false note ไทย 'ไม่มีสิทธิ์' · proposal ยัง PENDING", denied?.ok === false && /สิทธิ์/.test(denied?.note ?? "") && (await prisma.aiProposal.findUnique({ where: { id: created.proposalId } }))?.status === "PENDING", "PENDING", JSON.stringify(denied));
  const exec = await proposals.executeProposal(owner, { tenantId: tid }, created.proposalId);
  const doc = await prisma.accountDocument.findFirst({ where: { systemId: SYS }, select: { id: true, status: true, grandTotal: true, source: true } });
  chk("E1-K3.5", "OWNER ยืนยัน → ok:true · เอกสาร DRAFT 1,070,000 source AI · note ไทยบอกผล", exec?.ok === true && doc?.status === "DRAFT" && doc?.grandTotal === 1_070_000 && doc?.source === "AI" && /[ก-๙]/.test(exec?.note ?? ""), "DRAFT", `${JSON.stringify(exec)} ${JSON.stringify(doc)}`);
  const issued = parse(await tools.runTool(ctx, "account_issue_document", { documentId: doc?.id }));
  const execIssue = await proposals.executeProposal(owner, { tenantId: tid }, issued.proposalId);
  const docIssued = await prisma.accountDocument.findUnique({ where: { id: doc?.id }, select: { status: true, docNo: true } });
  chk("E1-K3.6", "account_issue_document → proposal → ยืนยัน → เอกสาร AWAITING_PAYMENT docNo IV… + JV", execIssue?.ok === true && docIssued?.status === "AWAITING_PAYMENT" && /^IV/.test(docIssued?.docNo ?? "") && (await prisma.accountJournalEntry.count({ where: { systemId: SYS, refId: doc?.id } })) === 1, "IV", `${JSON.stringify(execIssue)} ${JSON.stringify(docIssued)}`);
  const paid = parse(await tools.runTool(ctx, "account_record_payment", { documentId: doc?.id, paidAt: ymd(), financeAccountId: cash.id, amountSatang: 1_070_000 }));
  const execPaid = await proposals.executeProposal(owner, { tenantId: tid }, paid.proposalId);
  chk("E1-K3.7", "account_record_payment → proposal → ยืนยัน → PAID", execPaid?.ok === true && (await prisma.accountDocument.findUnique({ where: { id: doc?.id }, select: { status: true } }))?.status === "PAID", "PAID", JSON.stringify(execPaid));
  const execAgain = await proposals.executeProposal(owner, { tenantId: tid }, paid.proposalId);
  chk("E1-K3.8", "ยืนยัน proposal ซ้ำ → ok:false (ทำไปแล้ว) ไม่จ่ายซ้ำ", execAgain?.ok === false && (await prisma.accountDocumentPayment.count({ where: { documentId: doc?.id } })) === 1, "ok:false", JSON.stringify(execAgain));
  const voidP = parse(await tools.runTool(ctx, "account_void_document", { documentId: doc?.id, reason: "ลูกค้าขอยกเลิก" }));
  const voidRow = await prisma.aiProposal.findUnique({ where: { id: voidP.proposalId } });
  chk("E1-K3.9", "account_void_document → proposal risk DESTRUCTIVE", voidRow?.risk === "DESTRUCTIVE" && voidRow?.kind === "account.documents.void", "DESTRUCTIVE", `${voidRow?.risk} ${voidRow?.kind}`);
  const first = await proposals.executeProposal(owner, { tenantId: tid }, voidP.proposalId);
  chk("E1-K3.10", "ยืนยันชั้นแรกของ DESTRUCTIVE → needsSecondConfirm · ยังไม่ VOIDED", first?.ok === false && first?.needsSecondConfirm === true && (await prisma.accountDocument.findUnique({ where: { id: doc?.id }, select: { status: true } }))?.status !== "VOIDED", "needsSecondConfirm", JSON.stringify(first));
  const second = await proposals.executeProposal(owner, { tenantId: tid }, voidP.proposalId, { confirm2x: true });
  chk("E1-K3.11", "ยืนยันชั้นสอง → VOIDED + reversal JV", second?.ok === true && (await prisma.accountDocument.findUnique({ where: { id: doc?.id }, select: { status: true } }))?.status === "VOIDED", "VOIDED", JSON.stringify(second));
  const badArgs = parse(await tools.runTool(ctx, "account_record_payment", { documentId: doc?.id, amountSatang: -5 }));
  chk("E1-K3.12", "args ไม่ผ่าน schema → {error ไทย} ไม่สร้าง proposal", typeof badArgs.error === "string" && !badArgs.proposalId, "error", JSON.stringify(badArgs).slice(0, 120));
  const contactP = parse(await tools.runTool(ctx, "account_create_contact", { kind: "VENDOR", name: "ผู้ขาย จากผู้ช่วย", phone: "0899999999" }));
  await proposals.executeProposal(owner, { tenantId: tid }, contactP.proposalId);
  chk("E1-K3.13", "account_create_contact → ยืนยัน → ผู้ติดต่อเกิดจริง", !!(await prisma.accountContact.findFirst({ where: { systemId: SYS, name: "ผู้ขาย จากผู้ช่วย" } })), "เกิด", "?");
  const link = parse(await tools.runTool(ctx, "account_create_payment_link", { documentId: doc?.id }));
  chk("E1-K3.14", "account_create_payment_link บนเอกสาร VOIDED → proposal สร้างได้ แต่ยืนยันแล้ว ok:false note ไทย (service ปฏิเสธ)", typeof link.proposalId === "string" && (await proposals.executeProposal(owner, { tenantId: tid }, link.proposalId))?.ok === false, "ok:false", JSON.stringify(link).slice(0, 120), "MAJOR");
  const audits = await prisma.auditLog.count({ where: { tenantId: tid, action: { startsWith: "account." } } });
  chk("E1-K3.15", "การกระทำผ่าน proposal เขียน AuditLog (actorType USER ของคนกด)", audits >= 3, "≥3", `${audits}`, "MAJOR");
  chk("E1-K3.16", "isKnownKind(account.documents.create) = true · DESTRUCTIVE_KINDS มี account.documents.void/payments.void/periods.reopen", proposals.isKnownKind("account.documents.create") === true && ["account.documents.void", "account.payments.void", "account.periods.reopen"].every((k) => (proposals.DESTRUCTIVE_KINDS as Set<string>).has(k)), "ครบ", "?");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["aiProposal", "aiMessage", "aiConversation", "accountJournalLine", "accountJournalEntry", "accountPaymentRequest", "accountDocumentPayment", "accountDocumentRelation", "accountDocumentLine", "accountDocument", "accountDocSequence", "accountFinanceOpening", "accountFinance", "accountContact", "accountMapping", "accountLedger", "accountPeriod", "accountSettings", "auditLog", "outboxEvent", "party", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API AI skill (E1) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
