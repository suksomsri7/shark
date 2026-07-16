// QC — AI actions ชุดขยาย 5 ตัว (WO-0045) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา (ต่อยอด tools.ts + proposals.ts — pattern เดิมเป๊ะ: tool เสนอ proposal · execute ผ่าน service เดิม + assertCan):
// action ใหม่ 5 (registry 13 → 18):
//   inventory_create_item { sku, name, reorderPoint?, costBaht? } → invSvc.createItem · perm inventory.item.create · sku ซ้ำ → FAILED ไทย
//   inventory_adjust { sku, newQty, note? } → **Builder เพิ่ม service ใหม่ inventory.adjust(ctx,{itemId,newQty,idempotencyKey,note?})**:
//     movement type ADJUST · qtyDelta = newQty-onHand · balanceAfter = newQty · idempotencyKey กันซ้ำ (`ai-<proposalId>`) · onHand = newQty
//     perm "inventory.movement.adjust" · sku ไม่พบ → FAILED
//   hr_create_employee { name, position?, phone? } → hrSvc.createEmployee · perm hr.employee.create
//   coupon_create { code, type: "PERCENT"|"FIXED", percent?, valueBaht?, maxUses? } → couponSvc.createCoupon (แปลง valueBaht→สตางค์)
//     คืน ok:false จาก service (โค้ดซ้ำ/ค่าผิด) → FAILED + reason ไทยของ service · perm ตาม convention ใน coupon/actions.ts
//   kanban_create_card { title, detail?, boardName? } → หา KanbanBoard (ชื่อตรง หรือบอร์ดแรกถ้าไม่ระบุ) → createCard คอลัมน์แรก
//     ไม่มีบอร์ดเลย → FAILED "ยังไม่มีบอร์ด" · perm ตาม convention ใน kanban/actions.ts
// หมายเหตุ: support_reply_case เลื่อนเป็น 0045b (ต้องส่ง actor userId เข้า execute — แตะ signature กลาง)
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
  const pr = (await import("@/lib/ai/proposals")) as unknown as {
    createProposal: (c: unknown, i: unknown) => Promise<{ id: string }>;
    executeProposal: (m: unknown, c: unknown, id: string) => Promise<{ ok: boolean; note: string }>;
  };
  const reg = tools.toolRegistry();
  const names = reg.map((t) => t.def.name);
  chk("AA-0.1", "registry 18 + ครบ 5 action ใหม่", reg.length === 18 && ["inventory_create_item", "inventory_adjust", "hr_create_employee", "coupon_create", "kanban_create_card"].every((n) => names.includes(n)), "18+ครบ", `${reg.length}`);

  const t = await prisma.tenant.create({ data: { name: "QC ACT", slug: `qc-aa-${Date.now()}` } }); tid = t.id;
  const inv = await sys.createSystem(tid, "INVENTORY", "คลัง");
  const hr = await sys.createSystem(tid, "HR", "คน");
  const coupon = await sys.createSystem(tid, "COUPON", "คูปอง");
  const kanban = await sys.createSystem(tid, "KANBAN", "บอร์ด");
  const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "qc" } });
  const rt = tools.runTool as unknown as (c: unknown, n: string, a: unknown) => Promise<string>;
  const cx = { tenantId: tid, conversationId: conv.id };
  const lastProp = async (kind: string) => prisma.aiProposal.findFirst({ where: { tenantId: tid, kind, status: "PENDING" }, orderBy: { createdAt: "desc" } });

  // 1) inventory_create_item
  const o1 = await rt(cx, "inventory_create_item", { sku: "AA-1", name: "เจลล้างมือ", reorderPoint: 3 });
  const p1 = await lastProp("inventory_create_item");
  chk("AA-1.1", "create_item → proposal ไม่สร้างทันที", !!p1 && o1.includes(p1.id) && (await prisma.invItem.count({ where: { tenantId: tid } })) === 0, "นิ่ง", "?");
  const e1 = await pr.executeProposal(OWNER, { tenantId: tid }, p1!.id);
  chk("AA-1.2", "ยืนยัน → InvItem เกิด (sku AA-1)", e1.ok === true && (await prisma.invItem.count({ where: { tenantId: tid, sku: "AA-1" } })) === 1, "เกิด", e1.note.slice(0, 40));
  const p1b = await pr.createProposal({ tenantId: tid }, { conversationId: conv.id, kind: "inventory_create_item", summary: "ซ้ำ", payload: { sku: "AA-1", name: "ซ้ำ" } });
  chk("AA-1.3", "sku ซ้ำ → FAILED", (await pr.executeProposal(OWNER, { tenantId: tid }, p1b.id)).ok === false, "FAILED", "?");

  // 2) inventory_adjust (service ใหม่)
  const item = await prisma.invItem.findFirst({ where: { tenantId: tid, sku: "AA-1" } });
  const invSvc = (await import("@/lib/modules/inventory/service")) as unknown as { receive: (c: unknown, i: unknown) => Promise<unknown> };
  await invSvc.receive({ tenantId: tid, systemId: inv.id }, { itemId: item!.id, qty: 10, costSatang: 100, idempotencyKey: "aa-r" });
  const o2 = await rt(cx, "inventory_adjust", { sku: "AA-1", newQty: 7, note: "นับจริง" });
  const p2 = await lastProp("inventory_adjust");
  chk("AA-2.1", "adjust → proposal + สต็อกยังนิ่ง (10)", !!p2 && o2.includes(p2!.id) && (await prisma.invItem.findFirst({ where: { id: item!.id } }))?.onHand === 10, "10", "?");
  const e2 = await pr.executeProposal(OWNER, { tenantId: tid }, p2!.id);
  const mv = await prisma.invMovement.findFirst({ where: { tenantId: tid, type: "ADJUST" } });
  chk("AA-2.2", "ยืนยัน → onHand=7 + movement ADJUST delta -3 balance 7", e2.ok === true && (await prisma.invItem.findFirst({ where: { id: item!.id } }))?.onHand === 7 && mv?.qtyDelta === -3 && mv?.balanceAfter === 7, "7/-3/7", JSON.stringify({ d: mv?.qtyDelta, b: mv?.balanceAfter }));
  chk("AA-2.3", "execute ซ้ำ → ok:false + ไม่เบิ้ล", (await pr.executeProposal(OWNER, { tenantId: tid }, p2!.id)).ok === false && (await prisma.invMovement.count({ where: { tenantId: tid, type: "ADJUST" } })) === 1, "1", "?");

  // 3) hr_create_employee
  const o3 = await rt(cx, "hr_create_employee", { name: "พนักงานใหม่", position: "ช่างตัดผม" });
  const p3 = await lastProp("hr_create_employee");
  const e3 = await pr.executeProposal(OWNER, { tenantId: tid }, p3!.id);
  chk("AA-3.1", "create_employee → proposal → เกิดจริง", !!p3 && o3.includes(p3!.id) && e3.ok === true && (await prisma.hrEmployee.count({ where: { tenantId: tid, name: "พนักงานใหม่" } })) === 1, "เกิด", "?");

  // 4) coupon_create
  const o4 = await rt(cx, "coupon_create", { code: "SAVE10", type: "PERCENT", percent: 10, maxUses: 100 });
  const p4 = await lastProp("coupon_create");
  const e4 = await pr.executeProposal(OWNER, { tenantId: tid }, p4!.id);
  chk("AA-4.1", "coupon_create → เกิดจริง (SAVE10)", !!p4 && e4.ok === true && (await prisma.coupon.count({ where: { tenantId: tid, code: "SAVE10" } })) === 1, "เกิด", e4.note.slice(0, 40));
  const p4b = await pr.createProposal({ tenantId: tid }, { conversationId: conv.id, kind: "coupon_create", summary: "ซ้ำ", payload: { code: "SAVE10", type: "PERCENT", percent: 5 } });
  const e4b = await pr.executeProposal(OWNER, { tenantId: tid }, p4b.id);
  chk("AA-4.2", "โค้ดซ้ำ → FAILED + เหตุผลไทยจาก service", e4b.ok === false && e4b.note.length > 0, "FAILED", e4b.note.slice(0, 50));

  // 5) kanban_create_card
  const p5x = await pr.createProposal({ tenantId: tid }, { conversationId: conv.id, kind: "kanban_create_card", summary: "ไม่มีบอร์ด", payload: { title: "งานทดสอบ" } });
  chk("AA-5.1", "ยังไม่มีบอร์ด → FAILED ไทย", (await pr.executeProposal(OWNER, { tenantId: tid }, p5x.id)).ok === false, "FAILED", "?");
  const kb = (await import("@/lib/modules/kanban/service")) as unknown as { createBoard: (i: unknown) => Promise<{ id?: string } | unknown> };
  await kb.createBoard({ tenantId: tid, systemId: kanban.id, name: "งานร้าน" });
  const o5 = await rt(cx, "kanban_create_card", { title: "โทรหาซัพพลายเออร์", boardName: "งานร้าน" });
  const p5 = await lastProp("kanban_create_card");
  const e5 = await pr.executeProposal(OWNER, { tenantId: tid }, p5!.id);
  chk("AA-5.2", "มีบอร์ด → การ์ดเกิดจริง", !!p5 && o5.includes(p5!.id) && e5.ok === true && (await prisma.kanbanCard.count({ where: { tenantId: tid, title: "โทรหาซัพพลายเออร์" } })) === 1, "เกิด", e5.note.slice(0, 40));
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["aiProposal", "aiConversation", "aiUsage", "kanbanCard", "kanbanColumn", "kanbanBoard", "couponRedemption", "coupon", "hrEmployee", "invMovement", "invItem", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Actions (WO-0045) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
