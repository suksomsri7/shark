// QC — API บัญชี WO E2: AI ภายนอกเสียบสกิลบัญชี — GET /api/v1/ai/skills(/account) + POST /api/v1/ai/tools/account_* + golden cases + persona นักบัญชี
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §E2
// อ่านใช้ seed SIAM DIVE QC · เขียน (proposal) ใช้ tenant ใหม่ · MockProvider
// ⚠️ standalone-typesafe: dynamic import + wide cast
process.env.SHARK_AI_MOCK = "1";
import { readFileSync } from "node:fs";
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string }; QC: { expectedPath: string } };
const { loadQcEnv, QC } = accEnv;
loadQcEnv();
// ⏭️ WO ยังไม่สร้าง → ข้ามแบบเห็นชัด (exit 0) ไม่ทำ qc:all/CI แดงค้าง (บทเรียน WO 0.7) — ด่านนี้หายไปเองเมื่อ WO ลงจริง
if (!((await import("@/lib/ai/skills" as string)) as { SKILLS: { id: string }[] }).SKILLS.some((x) => x.id === "account")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (account)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
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

let tid = "";
try {
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const skillsRoute = (await import("@/app/api/v1/ai/skills/route" as string)) as { GET: (r: Request) => Promise<Response> };
  const skillRoute = (await import("@/app/api/v1/ai/skills/[id]/route" as string)) as { GET: (r: Request, c: { params: Promise<{ id: string }> }) => Promise<Response> };
  const toolRoute = (await import("@/app/api/v1/ai/tools/[name]/route" as string)) as { POST: (r: Request, c: { params: Promise<{ name: string }> }) => Promise<Response> };
  const evalMod = (await import("@/lib/ai/eval" as string)) as Record<string, Any>;
  const persona = (await import("@/lib/ai/persona" as string)) as Record<string, Any>;
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;

  const keySeed = await ak.createApiKey({ tenantId: E.tenantId }, "QC E2 ai", { scopes: [] });
  const req = (path: string, key: string, body?: unknown) => new Request(`http://x${path}`, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = async (r: Response) => { const t = await r.text(); try { return { status: r.status, body: JSON.parse(t) }; } catch { return { status: r.status, body: { _raw: t } }; } };

  // ═══ X1 manifest ═══
  const list = await json(await skillsRoute.GET(req("/api/v1/ai/skills", keySeed.rawKey)));
  const entry = (list.body?.skills ?? []).find((s: Any) => s.id === "account");
  chk("E2-X1.1", "GET /api/v1/ai/skills (ร้านที่เปิดบัญชี) → มีสกิล account พร้อม summary EN + href", list.status === 200 && !!entry && /^[\x00-\x7F]+$/.test(entry.summary ?? "") && entry.href === "/api/v1/ai/skills/account" && entry.toolCount >= 30, "มี", JSON.stringify(entry).slice(0, 200));
  const one = await json(await skillRoute.GET(req("/api/v1/ai/skills/account", keySeed.rawKey), { params: Promise.resolve({ id: "account" }) }));
  const tools = (one.body?.tools ?? []) as Any[];
  chk("E2-X1.2", "GET /api/v1/ai/skills/account → tools[] รูปแบบ OpenAI function (type/function{name,description,parameters}) + write flag ถูกต้อง", one.status === 200 && tools.length >= 30 && tools.every((t) => t.type === "function" && typeof t.function?.name === "string" && t.function?.parameters?.type === "object" && typeof t.write === "boolean") && tools.find((t) => t.function.name === "account_create_document")?.write === true && tools.find((t) => t.function.name === "account_dashboard")?.write === false, "OpenAI tools", `${one.status} n=${tools.length}`);
  chk("E2-X1.3", "parameters ของ account_create_document มี properties.lines (array) + required type/lines", (() => { const p = tools.find((t) => t.function.name === "account_create_document")?.function?.parameters; return p?.properties?.lines?.type === "array" && Array.isArray(p?.required) && p.required.includes("type") && p.required.includes("lines"); })(), "schema", JSON.stringify(tools.find((t) => t.function.name === "account_create_document")?.function?.parameters).slice(0, 200));

  // ═══ X2 เรียก tool ผ่าน API ภายนอก ═══
  const dash = await json(await toolRoute.POST(req("/api/v1/ai/tools/account_dashboard", keySeed.rawKey, { args: {} }), { params: Promise.resolve({ name: "account_dashboard" }) }));
  chk("E2-X2.1", "POST /api/v1/ai/tools/account_dashboard → 200 {tool,skill:'account',write:false,result มีตัวเลขเฉลย}", dash.status === 200 && dash.body?.skill === "account" && dash.body?.write === false && String(dash.body?.result ?? "").includes(String(E.receivable / 100)), "200", `${dash.status} ${JSON.stringify(dash.body).slice(0, 200)}`);
  const t = await prisma.tenant.create({ data: { name: "QC API E2", slug: `qc-api-e2-${Date.now()}` } });
  tid = t.id;
  const s = await sys.createSystem(tid, "ACCOUNT", "บัญชี E2");
  await acc.saveSettings(tid, s.id, { orgName: "ร้าน E2", taxId: "0105561000014", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting({ tenantId: tid, systemId: s.id });
  const customer = await acc.createContact({ tenantId: tid, systemId: s.id, kind: "CUSTOMER", name: "ลูกค้า อีทู" });
  const keyB = await ak.createApiKey({ tenantId: tid }, "QC E2 ext", { scopes: [] });
  const write = await json(await toolRoute.POST(req("/api/v1/ai/tools/account_create_document", keyB.rawKey, { args: { type: "INVOICE", contactId: customer.id, lines: [{ description: "x", qty: 1, unitPriceSatang: 100000, vatRateBp: 700 }] } }), { params: Promise.resolve({ name: "account_create_document" }) }));
  chk("E2-X2.2", "POST tools/account_create_document (AI ภายนอก) → 200 write:true pendingConfirmation:true conversationId · ยังไม่มีเอกสาร", write.status === 200 && write.body?.write === true && write.body?.pendingConfirmation === true && typeof write.body?.conversationId === "string" && (await prisma.accountDocument.count({ where: { systemId: s.id } })) === 0, "pending", `${write.status} ${JSON.stringify(write.body).slice(0, 200)}`);
  const prop = await prisma.aiProposal.findFirst({ where: { tenantId: tid, kind: "account.documents.create" } });
  chk("E2-X2.3", "proposal ผูก conversation 'คำขอจากผู้ช่วยภายนอก' รอเจ้าของยืนยันในแอป", !!prop && prop.status === "PENDING" && prop.conversationId === write.body?.conversationId, "PENDING", JSON.stringify(prop).slice(0, 160));
  const bad = await json(await toolRoute.POST(req("/api/v1/ai/tools/account_report", keyB.rawKey, { args: { kind: "nope" } }), { params: Promise.resolve({ name: "account_report" }) }));
  chk("E2-X2.4", "args ผิด → 200 result มี error ไทย (ไม่ 500)", bad.status === 200 && /error/.test(String(bad.body?.result ?? "")) && /[ก-๙]/.test(String(bad.body?.result ?? "")), "error ไทย", `${bad.status} ${String(bad.body?.result).slice(0, 120)}`, "MAJOR");
  const keyPos = await ak.createApiKey({ tenantId: tid }, "QC E2 x", { scopes: [] });
  await prisma.appSystem.updateMany({ where: { id: s.id }, data: { active: false } });
  const hidden = await json(await skillRoute.GET(req("/api/v1/ai/skills/account", keyPos.rawKey), { params: Promise.resolve({ id: "account" }) }));
  await prisma.appSystem.updateMany({ where: { id: s.id }, data: { active: true } });
  chk("E2-X2.5", "ร้านที่ปิดระบบบัญชี → GET skills/account = 404 (ไม่รู้ว่ามี)", hidden.status === 404, "404", `${hidden.status}`, "MAJOR");

  // ═══ X3 golden cases + persona ═══
  const cases = (evalMod.GOLDEN_CASES as { prompt: string; expectTool: string }[]).filter((c) => c.expectTool.startsWith("account_"));
  chk("E2-X3.1", "GOLDEN_CASES มีโจทย์บัญชี ≥ 12 ข้อ (ครอบ dashboard/list/report/create/issue/payment/void/contact)", cases.length >= 12 && ["account_dashboard", "account_list_documents", "account_report", "account_create_document", "account_record_payment", "account_void_document", "account_create_contact"].every((t) => cases.some((c) => c.expectTool === t)), "≥12", `${cases.length}: ${[...new Set(cases.map((c) => c.expectTool))].join(",")}`);
  const valid = evalMod.assertGoldenCasesValid();
  chk("E2-X3.2", "assertGoldenCasesValid ok (ทุก expectTool มีจริง)", valid?.ok === true, "ok", JSON.stringify(valid));
  const hits = cases.filter((c) => evalMod.evalToolFromRegistry(c.prompt) === c.expectTool).length;
  chk("E2-X3.3", "heuristic baseline เลือก tool บัญชีถูก ≥ 90% ของโจทย์บัญชี", cases.length > 0 && hits / cases.length >= 0.9, "≥90%", `${hits}/${cases.length}`, "MAJOR");
  const oldHits = (evalMod.scoreEvalWithHeuristic() as Any);
  chk("E2-X3.4", "โจทย์เดิมทั้งชุดไม่ถดถอย (score รวม ≥ ค่าเดิม 0.9)", (oldHits?.accuracy ?? oldHits?.score ?? 0) >= 0.9 || (oldHits?.passed ?? 0) / Math.max(1, oldHits?.total ?? 1) >= 0.9, "≥0.9", JSON.stringify(oldHits).slice(0, 120), "MAJOR");
  const prompt = persona.buildSystemPrompt({ tenantName: "ร้านทดสอบ", systems: [{ type: "ACCOUNT", name: "บัญชี" }] }) as string;
  chk("E2-X3.5", "persona เมื่อร้านเปิดบัญชี: มีกติกานักบัญชี (ตัวเลขจากเครื่องมือเท่านั้น · เขียน=เสนอให้ยืนยัน · เงินเป็นบาทตอนตอบ)", /บัญชี/.test(prompt) && /ยืนยัน/.test(prompt) && /บาท/.test(prompt), "มี", prompt.slice(-300).replace(/\n/g, " "), "MAJOR");
  const promptNoAcc = persona.buildSystemPrompt({ tenantName: "ร้าน", systems: [{ type: "POS", name: "ขาย" }] }) as string;
  chk("E2-X3.6", "ร้านที่ไม่มีระบบบัญชี → ไม่ฉีดบล็อกนักบัญชี (ประหยัด token)", prompt.length > promptNoAcc.length, "สั้นกว่า", `${prompt.length}/${promptNoAcc.length}`, "MINOR");

  // ═══ X4 เอกสาร ═══
  const md = readFileSync("docs/api/ACCOUNT-API.md", "utf8");
  chk("E2-X4.1", "คู่มือมีหัวข้อ 'AI agents' อธิบาย /api/v1/ai/skills/account + tools + pendingConfirmation", /\/api\/v1\/ai\/skills\/account/.test(md) && /pendingConfirmation/.test(md), "มี", "ไม่มี", "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  await d(() => prisma.apiKey.deleteMany({ where: { tenantId: E.tenantId, name: { startsWith: "QC E2 " } } }));
  if (tid) {
    for (const m of ["aiProposal", "aiMessage", "aiConversation", "accountJournalLine", "accountJournalEntry", "accountDocumentLine", "accountDocument", "accountDocSequence", "accountContact", "accountMapping", "accountLedger", "accountPeriod", "accountSettings", "apiKey", "auditLog", "outboxEvent", "party", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await d(() => prisma.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE 'acct:api:%'`));
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API AI external (E2) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
