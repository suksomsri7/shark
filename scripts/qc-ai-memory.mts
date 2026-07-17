// QC — AI Memory (agentic-1): ความจำถาวรต่อร้าน · Fable oracle
// สัญญา:
//   src/lib/ai/memory.ts: rememberFact(ctx, content) → {id} (ว่าง throw ไทย · ซ้ำเนื้อหาเดิม → อัปเดต updatedAt ไม่งอกแถว · cap 100 ต่อร้าน — เกิน throw ไทย)
//     listMemories(ctx, take=50) เรียง updatedAt desc · forgetMemory(ctx, id) → boolean · memoryBlock(ctx) → string ("" ถ้าไม่มี — ไทย รวมเป็น bullet)
//   tools: remember_fact (action=false! จดทันทีไม่ต้อง proposal — เป็นการจดโน้ต ไม่ใช่ mutation ธุรกิจ) + forget_fact + list_memories
//   service.ts: buildSystemPrompt ได้รับ memoryBlock ฉีดเข้า system prompt (persona รับ field memories)
try { process.loadEnvFile(".env"); } catch {}
process.env.SHARK_AI_MOCK = "1";
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`); };
let tid = ""; let tid2 = "";
try {
  const mem = (await import("@/lib/ai/memory" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null;
  const tools = (await import("@/lib/ai/tools")) as unknown as { toolRegistry: () => { def: { name: string } }[]; runTool: (c: any, n: string, a: any) => Promise<string> };
  if (!mem) { chk("ME-0", "มี ai/memory.ts", false); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC MEM", slug: `qc-mem-${Date.now()}` } }); tid = t.id;
    const ctx = { tenantId: tid };
    const m1 = await mem.rememberFact(ctx, "ร้านหยุดทุกวันจันทร์");
    await mem.rememberFact(ctx, "เจ้าของชอบสรุปสั้น ๆ");
    await mem.rememberFact(ctx, "ร้านหยุดทุกวันจันทร์"); // ซ้ำ → ไม่งอก
    chk("ME-1.1", "จด 2 เรื่อง (ซ้ำไม่งอกแถว)", !!m1.id && (await prisma.aiMemory.count({ where: { tenantId: tid } })) === 2);
    const block = await mem.memoryBlock(ctx);
    chk("ME-1.2", "memoryBlock รวมความจำ (มีทั้ง 2 เรื่อง)", block.includes("หยุดทุกวันจันทร์") && block.includes("สรุปสั้น"));
    chk("ME-1.3", "forgetMemory → ลบจริง + block ไม่มีแล้ว", (await mem.forgetMemory(ctx, m1.id)) === true && !(await mem.memoryBlock(ctx)).includes("หยุดทุกวันจันทร์"));
    const reg = tools.toolRegistry().map((x) => x.def.name);
    chk("ME-2.1", "tools remember_fact/forget_fact/list_memories ครบ", ["remember_fact", "forget_fact", "list_memories"].every((n) => reg.includes(n)));
    const out = await tools.runTool({ tenantId: tid }, "remember_fact", { content: "ลูกค้าประจำชื่อคุณโอ๋" });
    chk("ME-2.2", "tool remember_fact จดทันที (ไม่ผ่าน proposal)", !out.includes('"error"') && (await prisma.aiMemory.count({ where: { tenantId: tid, content: { contains: "คุณโอ๋" } } })) === 1);
    // system prompt ฉีด memory
    const personaSrc = (await import("node:fs")).readFileSync("src/lib/ai/persona.ts", "utf8");
    const svcSrc = (await import("node:fs")).readFileSync("src/lib/ai/service.ts", "utf8");
    chk("ME-3.1", "persona+service ฉีด memoryBlock เข้า system prompt", /memor/i.test(personaSrc) && /memoryBlock|memories/.test(svcSrc));
    const t2 = await prisma.tenant.create({ data: { name: "QC MEM2", slug: `qc-mem2-${Date.now()}` } }); tid2 = t2.id;
    chk("ME-4.1", "tenant อื่นไม่เห็นความจำ (guard)", (await mem.memoryBlock({ tenantId: tid2 })) === "");
  }
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 130) : String(e)), false); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) { await d(() => prisma.aiMemory.deleteMany({ where: { tenantId: id } })); await d(() => prisma.tenant.delete({ where: { id } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Memory =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
