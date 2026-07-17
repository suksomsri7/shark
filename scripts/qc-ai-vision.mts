// QC — AI แนบรูป + วิเคราะห์รูป + เซฟใบเสร็จเข้าบัญชี (feedback #4) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา:
// 1) src/lib/ai/provider.ts AiChatMessage เพิ่ม imageUrls?: string[] (data URL/http) · OpenRouterProvider สร้าง content แบบ vision
//    ([{type:"text"},{type:"image_url",image_url:{url}}]) เมื่อ message มี imageUrls · MockProvider สะท้อนจำนวนรูป ("เห็นรูป N ใบ")
// 2) src/lib/ai/service.ts sendMessage(ctx, { conversationId?, text, imageUrls? }) — ส่ง imageUrls เข้า provider (ผ่านเข้า message user)
// 3) proposals: ProposalKind เพิ่ม "record_expense" + KIND_ACCESS {module:"account", action ที่มีจริง} ·
//    dispatch → account.createExpenseDoc (docType "EXPENSE" · lines จาก payload {vendor?, note, amountSatang, date?}) → คืนข้อความไทย
//    payload: { vendor?: string, note: string, amountSatang: number, date?: string }
// 4) AI tool "record_expense" ใน tools.ts — LLM เรียกหลังอ่านใบเสร็จ → createProposal(kind record_expense) (เสนอ ไม่ทำเอง)
// 5) UI AiChat: ปุ่มแนบรูป (file→dataURL cap ~2MB, preview, ลบได้) + ส่ง imageUrls
try { process.loadEnvFile(".env"); } catch {}
process.env.SHARK_AI_MOCK = "1";
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

// provider ที่จับ message ที่ส่งเข้า (ยืนยัน imageUrls ไหลถึง provider)
class VisionSpy {
  seen: any[] = [];
  async chat(messages: any[]): Promise<{ text: string; tokensIn: number; tokensOut: number; model: string }> {
    this.seen.push(messages);
    const withImg = messages.find((m: any) => Array.isArray(m.imageUrls) && m.imageUrls.length);
    return { text: withImg ? `เห็นรูป ${withImg.imageUrls.length} ใบ` : "ไม่มีรูป", tokensIn: 1, tokensOut: 1, model: "spy" };
  }
}
let tid = "";
try {
  const provMod = (await import("@/lib/ai/provider")) as unknown as { AiChatMessage?: unknown };
  const aiSvc = (await import("@/lib/ai/service")) as unknown as { sendMessage: (c: any, i: any, d?: any) => Promise<any> };
  const props = (await import("@/lib/ai/proposals")) as unknown as { executeProposal: (c: any, id: string, m: any) => Promise<any>; createProposal: (c: any, i: any) => Promise<any> };
  const tools = (await import("@/lib/ai/tools")) as unknown as { toolRegistry: () => { def: { name: string } }[] };
  const t = await prisma.tenant.create({ data: { name: "QC AIVISION", slug: `qc-av-${Date.now()}` } }); tid = t.id;
  const acc = await sys.createSystem(tid, "ACCOUNT", "บัญชี");
  const accSvc = (await import("@/lib/modules/account/service")) as unknown as { saveSettings: (t: string, s: string, x: unknown) => Promise<unknown> };
  const gl = (await import("@/lib/modules/account/gl")) as unknown as { ensureAccounting: (c: { tenantId: string; systemId: string }) => Promise<unknown> };
  await accSvc.saveSettings(tid, acc.id, { orgName: "ร้าน QC", taxId: "0105561177639", vatRegistered: false } as never);
  await gl.ensureAccounting({ tenantId: tid, systemId: acc.id });
  const ctx = { tenantId: tid };

  // 1) sendMessage imageUrls → provider เห็นรูป
  const spy = new VisionSpy();
  const r1 = await aiSvc.sendMessage(ctx, { text: "นี่คือใบเสร็จ ช่วยดูหน่อย", imageUrls: ["data:image/png;base64,AAA", "data:image/png;base64,BBB"] }, { provider: spy });
  const userMsg = spy.seen[0]?.find((m: any) => m.role === "user");
  chk("AV-1.1", "imageUrls ไหลถึง provider (user message มี 2 รูป)", Array.isArray(userMsg?.imageUrls) && userMsg.imageUrls.length === 2, "2 รูป", JSON.stringify(userMsg?.imageUrls?.length));
  chk("AV-1.2", "ตอบกลับอ้างจำนวนรูป (reply ไม่ error)", r1.ok !== false && /2/.test(JSON.stringify(r1)), "เห็น 2", JSON.stringify(r1).slice(0, 60));

  // 2) OpenRouter สร้าง vision content — ตรวจ source
  const provSrc = (await import("node:fs")).readFileSync("src/lib/ai/provider.ts", "utf8");
  chk("AV-2.1", "OpenRouterProvider รองรับ image_url (vision format)", /image_url/.test(provSrc) && /imageUrls/.test(provSrc), "มี", "?");

  // 3) record_expense proposal → สร้างเอกสารบัญชีจริง
  const reg = tools.toolRegistry().map((x) => x.def.name);
  chk("AV-3.1", "tool record_expense ลงทะเบียนแล้ว", reg.includes("record_expense"), "มี", JSON.stringify(reg.slice(-3)));
  const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "ใบเสร็จ" } });
  const p = await props.createProposal(ctx, { conversationId: conv.id, kind: "record_expense", summary: "บันทึกค่าใช้จ่าย ร้านวัสดุ 500 บาท", payload: { vendor: "ร้านวัสดุ ก", note: "ซื้อของใช้สำนักงาน", amountSatang: 50000, date: "2026-07-17" } });
  const before = await prisma.accountDocument.count({ where: { tenantId: tid } });
  const ex = await props.executeProposal({ tenantId: tid, role: "OWNER", unitAccess: [], permissions: {}, userId: "own-1" }, p.id, { role: "OWNER", unitAccess: [], permissions: {}, userId: "own-1" });
  const after = await prisma.accountDocument.count({ where: { tenantId: tid } });
  chk("AV-3.2", "execute record_expense → AccountDocument EXPENSE เกิด (เซฟใบเสร็จเข้าบัญชีจริง)", (ex?.ok === true || ex?.executed === true || after > before) && after === before + 1, "+1 doc", `${before}→${after}`);
  chk("AV-3.3", "เอกสารเป็นค่าใช้จ่าย (docType EXPENSE) ยอด 500", await (async () => { const d = await prisma.accountDocument.findFirst({ where: { tenantId: tid }, orderBy: { createdAt: "desc" } }); return d?.docType === "EXPENSE" && d?.grandTotal === 50000; })(), "EXPENSE/50000", "?");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["aiMessage", "aiProposal", "aiConversation", "aiUsage", "accountJournalLine", "accountJournalEntry", "accountDocumentLine", "accountDocument", "accountLedger", "accountContact", "accountDocSequence", "accountSettings", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Vision =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
