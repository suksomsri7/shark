// QC — AI Growth (WO-0033): แนะนำเปิดระบบเมื่อธุรกิจโต + เปิดระบบให้ผ่าน proposal · Fable oracle, Builder ห้ามแตะ
// วิสัยทัศน์ Blank_6: "เมื่อธุรกิจเติบโต AI จะแนะนำโมดูลใหม่ … Continuous Optimization"
//
// สัญญา (ต่อยอด tools.ts + proposals.ts):
// read tool `growth_recommendations` ({}) — วิเคราะห์ตามกติกา deterministic (ห้ามใช้ LLM ใน tool):
//   R1: มีลูกค้า > 20 คน และยังไม่เปิด MARKETING → แนะนำ MARKETING (เหตุผลไทย)
//   R2: มีบิล POS PAID > 50 บิล และยังไม่เปิด INVENTORY → แนะนำ INVENTORY
//   R3: มีลูกค้า > 20 คน และยังไม่เปิด CRM → แนะนำ CRM
//   ระบบที่เปิดอยู่แล้ว = ห้ามแนะนำ · ไม่มีอะไรเข้าเกณฑ์ → JSON บอก "ยังไม่มีคำแนะนำ"
// action tool `open_system` ({ type, name? }) → proposal kind "open_system" (ห้ามเปิดทันที)
//   execute: assertCan module "system" action "system.system.create" → ถ้ามีระบบ type นั้นอยู่แล้ว → FAILED "เปิดอยู่แล้ว"
//            ไม่งั้น createSystem(tenantId, type, name ?? ป้ายไทย default) → note ไทย
// persona: แนะนำเชิงรุกเมื่อ user ถามแนวทาง/เมื่อบริบทเหมาะ — ห้ามยัดเยียดทุกข้อความ
// registry รวม = 13 (11 + 2)
try { process.loadEnvFile(".env"); } catch {}
process.env.SHARK_AI_MOCK = "1";
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const OWNER = { role: "OWNER" as const, unitAccess: [] as string[], permissions: {} as Record<string, unknown> };

let tid = "";
try {
  const tools = await import("@/lib/ai/tools");
  const pr = await import("@/lib/ai/proposals");
  const reg = tools.toolRegistry();
  const names = reg.map((t) => t.def.name);
  chk("GR-0.1", "registry 13 + มี growth_recommendations/open_system", reg.length === 13 && ["growth_recommendations", "open_system"].every((n) => names.includes(n)), "13+ครบ", `${reg.length}`);

  const t = await prisma.tenant.create({ data: { name: "QC GROW", slug: `qc-gr-${Date.now()}` } }); tid = t.id;
  const member = await sys.createSystem(tid, "MEMBER", "สมาชิก");
  await sys.createSystem(tid, "CRM", "ลูกค้าสัมพันธ์"); // เปิด CRM แล้ว — ห้ามแนะนำซ้ำ
  await prisma.customer.createMany({ data: Array.from({ length: 25 }, (_, i) => ({ tenantId: tid, memberSystemId: member.id, name: `ล${i}` })) });
  const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "qc" } });
  const rt = tools.runTool as unknown as (c: unknown, n: string, a: unknown) => Promise<string>;

  const rec = await rt({ tenantId: tid }, "growth_recommendations", {});
  chk("GR-1.1", "ลูกค้า 25 + ไม่มี MARKETING → แนะนำ MARKETING", rec.includes("MARKETING"), "มี", rec.slice(0, 100));
  chk("GR-1.2", "CRM เปิดแล้ว → ห้ามแนะนำ CRM", !rec.includes("\"CRM\""), "ไม่มี", rec.slice(0, 100));
  chk("GR-1.3", "บิล POS ไม่ถึงเกณฑ์ → ไม่แนะนำ INVENTORY", !rec.includes("INVENTORY"), "ไม่มี", "?");

  const before = await prisma.appSystem.count({ where: { tenantId: tid } });
  const out = await rt({ tenantId: tid, conversationId: conv.id }, "open_system", { type: "MARKETING" });
  const prop = await prisma.aiProposal.findFirst({ where: { tenantId: tid, kind: "open_system", status: "PENDING" }, orderBy: { createdAt: "desc" } });
  chk("GR-2.1", "open_system → proposal PENDING ไม่เปิดทันที", !!prop && out.includes(prop.id) && (await prisma.appSystem.count({ where: { tenantId: tid } })) === before, "proposal+นิ่ง", out.slice(0, 60));
  const ex = await pr.executeProposal(OWNER, { tenantId: tid }, prop!.id);
  chk("GR-2.2", "ยืนยัน → ระบบ MARKETING เปิดจริง", ex.ok === true && (await prisma.appSystem.count({ where: { tenantId: tid, type: "MARKETING" } })) === 1, "เปิด", ex.note.slice(0, 60));

  const p2 = await pr.createProposal({ tenantId: tid }, { conversationId: conv.id, kind: "open_system", summary: "ซ้ำ", payload: { type: "MARKETING" } });
  const ex2 = await pr.executeProposal(OWNER, { tenantId: tid }, p2.id);
  chk("GR-2.3", "เปิดซ้ำ type เดิม → FAILED 'เปิดอยู่แล้ว'", ex2.ok === false && (await prisma.aiProposal.findUnique({ where: { id: p2.id } }))?.status === "FAILED", "FAILED", ex2.note.slice(0, 50));

  const rec2 = await rt({ tenantId: tid }, "growth_recommendations", {});
  chk("GR-3.1", "หลังเปิด MARKETING แล้ว → ไม่แนะนำซ้ำ", !rec2.includes("MARKETING"), "ไม่มี", rec2.slice(0, 80));
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["aiProposal", "aiConversation", "aiUsage", "customer", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Growth =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
