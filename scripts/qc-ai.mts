// QC — AI Layer Phase 1: kernel + chat service (docs/AI_LAYER.md) · Fable oracle
// รันด้วย MockProvider เสมอ (SHARK_AI_MOCK=1 ตั้งในไฟล์นี้) — deterministic ไม่เผาเงิน
process.env.SHARK_AI_MOCK = "1";
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const rules = await import("@/lib/ai/rules");
const prov = await import("@/lib/ai/provider");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

// ── RULES (pure) ──
// dayKey: 2026-07-16 17:30 UTC = 17 ก.ค. 00:30 BKK → ข้ามวันถูก
chk("AI-R.1", "dayKeyBangkok ข้ามเที่ยงคืนไทย", rules.dayKeyBangkok(new Date("2026-07-16T17:30:00Z")) === "2026-07-17" && rules.dayKeyBangkok(new Date("2026-07-16T16:30:00Z")) === "2026-07-16", "17/16", `${rules.dayKeyBangkok(new Date("2026-07-16T17:30:00Z"))}/${rules.dayKeyBangkok(new Date("2026-07-16T16:30:00Z"))}`);
const lim = { maxRequests: 10, maxTokens: 1000 };
chk("AI-R.2", "overBudget ครบแกน requests/tokens", rules.overBudget({ requests: 10, tokensIn: 0, tokensOut: 0 }, lim) && rules.overBudget({ requests: 0, tokensIn: 600, tokensOut: 400 }, lim) && !rules.overBudget({ requests: 9, tokensIn: 500, tokensOut: 499 }, lim), "t/t/f", "?");
const trimmed = rules.trimHistory([{ content: "a".repeat(100) }, { content: "b".repeat(100) }, { content: "c".repeat(100) }], 250);
chk("AI-R.3", "trimHistory งบ 250 → เก็บ 2 แถวท้าย (b,c) ทิ้งหัว", trimmed.length === 2 && trimmed[0].content[0] === "b" && trimmed[1].content[0] === "c", "2 แถวท้าย", `${trimmed.length} แถว`);
chk("AI-R.4", "trimHistory เก็บข้อความท้ายสุดเสมอ (แม้ยาวเกินงบ)", rules.trimHistory([{ content: "x".repeat(999) }], 10).length === 1, "1", String(rules.trimHistory([{ content: "x".repeat(999) }], 10).length));
chk("AI-R.5", "titleFrom ตัด 60 + บรรทัดเดียว", rules.titleFrom("สวัสดี\nบรรทัดสอง") === "สวัสดี" && rules.titleFrom("ก".repeat(80)).length === 60, "สวัสดี/60", "?");
chk("AI-R.6", "resolveProvider: MOCK=1 → MockProvider", prov.resolveProvider() instanceof prov.MockProvider, "Mock", "?");

// ── SVC (Mock + DB) ──
let tid = ""; let tid2 = "";
try {
  const svc = await import("@/lib/ai/service");
  const t = await prisma.tenant.create({ data: { name: "QC AI", slug: `qc-ai-${Date.now()}` } }); tid = t.id;
  const ctx = { tenantId: tid };

  chk("AI-0.1", "aiEnabled = true (mock)", svc.aiEnabled() === true, "true", String(svc.aiEnabled()));

  const r1 = await svc.sendMessage(ctx, { text: "ร้านผมขายอะไรดี" });
  chk("AI-1.1", "ส่งข้อความ → ok + ได้คำตอบ", r1.ok && r1.reply.includes("ร้านผมขายอะไรดี"), "ok+ทวนข้อความ", JSON.stringify(r1).slice(0, 60));
  const convId = r1.ok ? r1.conversationId : "";
  const msgs1 = await svc.listMessages(ctx, convId);
  chk("AI-1.2", "persist USER+ASSISTANT 2 แถว", msgs1.length === 2 && msgs1[0].role === "USER" && msgs1[1].role === "ASSISTANT", "2 แถว", String(msgs1.length));
  chk("AI-1.3", "title มาจากข้อความแรก", (await svc.latestConversation(ctx))?.title === "ร้านผมขายอะไรดี", "ร้านผมขายอะไรดี", "?");

  const r2 = await svc.sendMessage(ctx, { conversationId: convId, text: "ต่อบทสนทนาเดิม" });
  chk("AI-2.1", "ต่อบทสนทนาเดิม → conversation เดียวกัน", r2.ok && r2.conversationId === convId, "id เดิม", "?");
  chk("AI-2.2", "history สะสม 4 แถว", (await svc.listMessages(ctx, convId)).length === 4, "4", String((await svc.listMessages(ctx, convId)).length));

  const day = rules.dayKeyBangkok(new Date());
  const u = await prisma.aiUsage.findUnique({ where: { tenantId_day: { tenantId: tid, day } } });
  chk("AI-3.1", "usage นับสะสม (2 requests + tokens > 0)", (u?.requests ?? 0) === 2 && (u?.tokensIn ?? 0) > 0 && (u?.tokensOut ?? 0) > 0, "2/+/+", JSON.stringify({ r: u?.requests, i: u?.tokensIn, o: u?.tokensOut }));

  // เกินเพดาน → over_budget (บีบเพดานทาง env)
  process.env.SHARK_AI_DAILY_REQ = "2";
  const r3 = await svc.sendMessage(ctx, { conversationId: convId, text: "เกินโควตา" });
  chk("AI-4.1", "เกินเพดานวัน → over_budget ไม่ throw", !r3.ok && r3.error === "over_budget", "over_budget", JSON.stringify(r3));
  delete process.env.SHARK_AI_DAILY_REQ;

  chk("AI-4.2", "ข้อความว่าง → empty", !(await svc.sendMessage(ctx, { text: "   " })).ok, "empty", "?");

  // kernel guard: tenant อื่นมองไม่เห็นบทสนทนา
  const t2 = await prisma.tenant.create({ data: { name: "QC AI 2", slug: `qc-ai2-${Date.now()}` } }); tid2 = t2.id;
  chk("AI-5.1", "tenant อื่นไม่เห็นบทสนทนา (kernel guard)", (await svc.latestConversation({ tenantId: tid2 })) === null, "null", "?");
  chk("AI-5.2", "tenant อื่นอ่านข้อความ conv นี้ไม่ได้", (await svc.listMessages({ tenantId: tid2 }, convId)).length === 0, "0", "?");
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    await d(() => prisma.aiMessage.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.aiConversation.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.aiUsage.deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Layer =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
