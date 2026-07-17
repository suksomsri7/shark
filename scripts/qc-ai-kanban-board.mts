// QC — AI สร้างบอร์ด Kanban (feedback เจ้าของ 2026-07-17: "สั่ง AI สร้างบอร์ด แต่ทำไม่ได้") · Fable oracle
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`); };
let tid = "";
try {
  const tools = (await import("@/lib/ai/tools")) as unknown as { toolRegistry: () => { def: { name: string } }[] };
  const props = (await import("@/lib/ai/proposals")) as unknown as { createProposal: (c: any, i: any) => Promise<any>; executeProposal: (m: any, c: any, id: string) => Promise<any> };
  const t = await prisma.tenant.create({ data: { name: "QC AIKB", slug: `qc-aikb-${Date.now()}` } }); tid = t.id;
  const kb = await sys.createSystem(tid, "KANBAN", "บอร์ดงาน");
  const ctx = { tenantId: tid };
  chk("KB-1", "tool kanban_create_board ลงทะเบียนแล้ว", tools.toolRegistry().some((x) => x.def.name === "kanban_create_board"));
  const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "บอร์ด" } });
  const p = await props.createProposal(ctx, { conversationId: conv.id, kind: "kanban_create_board", summary: 'สร้างบอร์ด "ระบบงานทดสอบ"', payload: { name: "ระบบงานทดสอบ" } });
  const OWNER = { role: "OWNER", unitAccess: [] as string[], permissions: {}, userId: "own-1" };
  const ex = await props.executeProposal(OWNER, ctx, p.id);
  const board = await prisma.kanbanBoard.findFirst({ where: { tenantId: tid, name: "ระบบงานทดสอบ" }, include: { columns: true } });
  chk("KB-2", "execute → บอร์ด 'ระบบงานทดสอบ' เกิดจริง", !!board && (ex?.ok === true || ex?.executed === true));
  chk("KB-3", "บอร์ดมีคอลัมน์เริ่มต้น (≥1)", (board?.columns?.length ?? 0) >= 1);
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 120) : String(e)), false); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["kanbanCard", "kanbanColumn", "kanbanBoard", "aiProposal", "aiConversation", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
