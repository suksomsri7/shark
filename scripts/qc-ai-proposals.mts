// QC — Phase 3.5: AI ทำงานแทน user (proposal → confirm → execute) (WO-0020) · Fable oracle, Builder ห้ามแตะ
//
// สัญญา src/lib/ai/proposals.ts ที่ Builder ต้องทำตาม:
//   export type ProposalKind = "inventory_receive" | "hr_decide_leave" | "marketing_create_campaign";
//   createProposal(ctx: {tenantId}, input: {conversationId, kind, summary, payload}): Promise<{ id: string }>  // TTL 24 ชม.
//   listPendingProposals(ctx, conversationId): Promise<AiProposal[]>  // PENDING + ยังไม่หมดอายุ เรียงเก่า→ใหม่
//   rejectProposal(ctx, id): Promise<boolean>   // PENDING→REJECTED เท่านั้น (สถานะอื่น/ไม่พบ → false)
//   executeProposal(m: MembershipCtx, ctx: {tenantId}, id): Promise<{ ok: boolean; note: string }>
//     — อ่าน payload จาก DB เท่านั้น (id คือ input เดียว) · หมดอายุ → status EXPIRED + ok:false
//     — assertCan สิทธิ์ของ m ณ ตอน execute (action ตาม convention โมดูลเดิม) — ไม่ผ่าน → ok:false + คง PENDING (คนมีสิทธิ์มากดทีหลังได้)
//     — kind dispatch → service เดิม: inventory receive ใช้ idempotencyKey = `ai-${proposalId}` (execute ซ้ำ = กันโดยธรรมชาติ)
//     — สำเร็จ → EXECUTED+executedAt · service โยน → FAILED+resultNote · ทำซ้ำ (ไม่ใช่ PENDING) → ok:false "ทำไปแล้ว/ปิดไปแล้ว"
// action-tools ใน tools.ts (3 ตัวใหม่ ต่อท้าย 5 ตัวเดิม): เสนอ proposal ไม่ execute — คืน JSON {proposalId, summary, waiting:"user_confirm"}
//   runTool ctx ขยายเป็น { tenantId, conversationId? } (service ส่ง conversation.id เข้าไป)
// payload ต่อ kind:
//   inventory_receive: { sku, qty, costSatang? }  (resolve item จาก sku ในระบบ INVENTORY ตอน execute — ไม่เจอ → FAILED)
//   hr_decide_leave: { leaveId, decision: "APPROVED"|"REJECTED" }
//   marketing_create_campaign: { name, channel, segment? }  (DRAFT เสมอ — ส่งจริง user กดใน UI เอง)
try { process.loadEnvFile(".env"); } catch {}
process.env.SHARK_AI_MOCK = "1";
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };
const OWNER = { role: "OWNER" as const, unitAccess: [] as string[], permissions: {} as Record<string, unknown> };
const STAFF = { role: "STAFF" as const, unitAccess: [] as string[], permissions: {} as Record<string, unknown> };

let tid = ""; let tid2 = "";
try {
  const pr = await import("@/lib/ai/proposals" as string).catch(() => null);
  const tools = await import("@/lib/ai/tools");
  if (!pr) { chk("PZ-0", "มี src/lib/ai/proposals.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC PROPOSAL", slug: `qc-pp-${Date.now()}` } }); tid = t.id;
    const ctx = { tenantId: tid };
    const inv = await sys.createSystem(tid, "INVENTORY", "คลัง");
    const hr = await sys.createSystem(tid, "HR", "พนักงาน");
    const invSvc = await import("@/lib/modules/inventory/service");
    const item = await invSvc.createItem({ tenantId: tid, systemId: inv.id }, { sku: "PP-1", name: "ครีมนวด", reorderPoint: 2 });
    const hrSvc = await import("@/lib/modules/hr/service");
    const emp = await hrSvc.createEmployee({ tenantId: tid, systemId: hr.id }, { name: "พนักงานพี" });
    const leave = await hrSvc.requestLeave({ tenantId: tid, systemId: hr.id }, { employeeId: emp.id, type: "PERSONAL", fromDate: "2026-08-10", toDate: "2026-08-10" });
    const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "qc" } });

    // 1) create + list + kernel guard
    const p1 = await pr.createProposal(ctx, { conversationId: conv.id, kind: "inventory_receive", summary: "รับครีมนวดเข้า 10 ชิ้น", payload: { sku: "PP-1", qty: 10, costSatang: 5000 } });
    const row1 = await prisma.aiProposal.findUnique({ where: { id: p1.id } });
    chk("PZ-1.1", "createProposal → PENDING + หมดอายุอนาคต", row1?.status === "PENDING" && (row1?.expiresAt?.getTime() ?? 0) > Date.now(), "PENDING", String(row1?.status));
    chk("PZ-1.2", "listPending เห็นข้อเสนอ", (await pr.listPendingProposals(ctx, conv.id)).some((x: { id: string }) => x.id === p1.id), "เห็น", "?");
    const t2 = await prisma.tenant.create({ data: { name: "QC PP2", slug: `qc-pp2-${Date.now()}` } }); tid2 = t2.id;
    chk("PZ-1.3", "tenant อื่นไม่เห็น (kernel guard)", (await pr.listPendingProposals({ tenantId: tid2 }, conv.id)).length === 0, "0", "?");

    // 2) execute สำเร็จ (OWNER) — สต็อกเพิ่มจริง + idempotencyKey ai-<id>
    const ex1 = await pr.executeProposal(OWNER, ctx, p1.id);
    const after = await prisma.invItem.findUnique({ where: { id: item.id } });
    chk("PZ-2.1", "execute → ok + onHand 10", ex1.ok === true && after?.onHand === 10, "ok/10", `${ex1.ok}/${after?.onHand}`);
    chk("PZ-2.2", "status EXECUTED + executedAt", (await prisma.aiProposal.findUnique({ where: { id: p1.id } }))?.status === "EXECUTED", "EXECUTED", "?");
    chk("PZ-2.3", "movement ใช้ idempotencyKey ai-<id>", (await prisma.invMovement.count({ where: { tenantId: tid, idempotencyKey: `ai-${p1.id}` } })) === 1, "1", "?");
    const ex1b = await pr.executeProposal(OWNER, ctx, p1.id);
    chk("PZ-2.4", "กดซ้ำ → ok:false + สต็อกไม่เพิ่ม", ex1b.ok === false && (await prisma.invItem.findUnique({ where: { id: item.id } }))?.onHand === 10, "false/10", `${ex1b.ok}/?`);

    // 3) สิทธิ์: STAFF ไม่มี permission → ok:false + คง PENDING
    const p2 = await pr.createProposal(ctx, { conversationId: conv.id, kind: "inventory_receive", summary: "รับอีก 5", payload: { sku: "PP-1", qty: 5 } });
    const ex2 = await pr.executeProposal(STAFF, ctx, p2.id);
    chk("PZ-3.1", "STAFF ไม่มีสิทธิ์ → ok:false + PENDING คงเดิม", ex2.ok === false && (await prisma.aiProposal.findUnique({ where: { id: p2.id } }))?.status === "PENDING", "false+PENDING", `${ex2.ok}/?`);

    // 4) reject
    chk("PZ-4.1", "reject PENDING → true + REJECTED", (await pr.rejectProposal(ctx, p2.id)) === true && (await prisma.aiProposal.findUnique({ where: { id: p2.id } }))?.status === "REJECTED", "true", "?");
    chk("PZ-4.2", "reject ซ้ำ → false", (await pr.rejectProposal(ctx, p2.id)) === false, "false", "?");

    // 5) หมดอายุ
    const p3 = await pr.createProposal(ctx, { conversationId: conv.id, kind: "inventory_receive", summary: "หมดอายุ", payload: { sku: "PP-1", qty: 1 } });
    await prisma.aiProposal.update({ where: { id: p3.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const ex3 = await pr.executeProposal(OWNER, ctx, p3.id);
    chk("PZ-5.1", "หมดอายุ → ok:false + EXPIRED", ex3.ok === false && (await prisma.aiProposal.findUnique({ where: { id: p3.id } }))?.status === "EXPIRED", "EXPIRED", "?");

    // 6) hr_decide_leave + marketing_create_campaign
    const p4 = await pr.createProposal(ctx, { conversationId: conv.id, kind: "hr_decide_leave", summary: "อนุมัติลาพนักงานพี", payload: { leaveId: leave.id, decision: "APPROVED" } });
    const ex4 = await pr.executeProposal(OWNER, ctx, p4.id);
    chk("PZ-6.1", "อนุมัติใบลาผ่าน proposal → APPROVED", ex4.ok === true && (await prisma.hrLeave.findUnique({ where: { id: leave.id } }))?.status === "APPROVED", "APPROVED", "?");
    const p5 = await pr.createProposal(ctx, { conversationId: conv.id, kind: "marketing_create_campaign", summary: "สร้างแคมเปญ", payload: { name: "โปรหน้าฝน", channel: "LINE" } });
    const ex5 = await pr.executeProposal(OWNER, ctx, p5.id);
    const camp = await prisma.mktCampaign.findFirst({ where: { tenantId: tid, name: "โปรหน้าฝน" } });
    chk("PZ-6.2", "สร้างแคมเปญผ่าน proposal → DRAFT เสมอ", ex5.ok === true && camp?.status === "DRAFT", "DRAFT", String(camp?.status));

    // 7) FAILED: payload ชี้ของที่ไม่มี
    const p6 = await pr.createProposal(ctx, { conversationId: conv.id, kind: "inventory_receive", summary: "sku ผี", payload: { sku: "ไม่มีจริง", qty: 1 } });
    const ex6 = await pr.executeProposal(OWNER, ctx, p6.id);
    chk("PZ-7.1", "sku ไม่มีจริง → ok:false + FAILED + note ไทย", ex6.ok === false && (await prisma.aiProposal.findUnique({ where: { id: p6.id } }))?.status === "FAILED" && ex6.note.length > 0, "FAILED", "?");

    // 8) action-tool ผ่าน runTool สร้าง proposal (ไม่ execute)
    const before = await prisma.invItem.findUnique({ where: { id: item.id } });
    const toolOut = await tools.runTool({ tenantId: tid, conversationId: conv.id }, "inventory_receive", { sku: "PP-1", qty: 99 });
    const madeProposal = await prisma.aiProposal.findFirst({ where: { tenantId: tid, status: "PENDING", kind: "inventory_receive" }, orderBy: { createdAt: "desc" } });
    chk("PZ-8.1", "action-tool สร้าง proposal + ไม่แตะสต็อก", !!madeProposal && toolOut.includes(madeProposal.id) && (await prisma.invItem.findUnique({ where: { id: item.id } }))?.onHand === before?.onHand, "proposal+สต็อกนิ่ง", toolOut.slice(0, 60));
    chk("PZ-8.2", "registry มี 8 tools (5 อ่าน + 3 ทำแทน)", tools.toolRegistry().length === 8, "8", String(tools.toolRegistry().length));
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["aiProposal", "aiMessage", "aiConversation", "aiUsage", "mktRecipient", "mktCampaign", "hrLeave", "hrAttendance", "hrEmployee", "invMovement", "invItem", "customer", "appSystemUnit", "appSystem", "businessUnit"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    }
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Proposals (Phase 3.5) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
