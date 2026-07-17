// QC — AI Wave5-B: สั่งงานแทนโมดูลที่เดิม AI ทำแทนไม่ได้ · Fable oracle
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น (ห้าม typecheck รวม)
//
// kinds ใหม่ (proposal-confirm เดิม):
//   point_adjust {delta(+/-), memberCode?|customerPhone?|customerName?, reason?} → point.adjustPoints (NORMAL)
//     resolve สมาชิกจาก listPointCustomers (memberCode→เบอร์→ชื่อ contains) · guard ไม่พบ/กำกวม
//   ticket_mark_paid {orderNo?|eventName?+buyerName?+buyerPhone?} → ticket.markPaid (NORMAL · post POS ถ้าผูก)
//     resolve TicketOrder PENDING · guard ไม่พบ/กำกวม
//   restaurant_close_bill {tableName, unitName?, payMethod?} → restaurant.checkout (DESTRUCTIVE ยืนยัน 2 ชั้น)
//     resolve โต๊ะ (ชื่อ contains) → session OPEN · conservative ยอดตามบิล
// read ใหม่: kanban_my_tasks {assignee?} → resolve userId ผ่าน membership (ข้อจำกัด: ctx ไม่มี userId)
try { process.loadEnvFile(".env"); } catch {}
process.env.SHARK_AI_MOCK = "1";
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const memberSvc = await import("@/lib/modules/member/service");
const point = await import("@/lib/modules/point/service");
const ticket = (await import("@/lib/modules/ticket/service")) as unknown as { [k: string]: (...a: any[]) => Promise<any> };
const menu = (await import("@/lib/modules/restaurant/menu")) as unknown as { [k: string]: (...a: any[]) => Promise<any> };
const rtable = (await import("@/lib/modules/restaurant/table")) as unknown as { [k: string]: (...a: any[]) => Promise<any> };
const rorder = (await import("@/lib/modules/restaurant/order")) as unknown as { [k: string]: (...a: any[]) => Promise<any> };
const kanban = (await import("@/lib/modules/kanban/service")) as unknown as { [k: string]: (...a: any[]) => Promise<any> };

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`); };
const OWNER = { role: "OWNER", unitAccess: [] as string[], permissions: {}, userId: "own-1" };
let tid = "";
try {
  const tools = (await import("@/lib/ai/tools")) as unknown as { toolRegistry: () => { def: { name: string }; action?: boolean }[]; runTool: (c: any, n: string, a: any) => Promise<string> };
  const props = (await import("@/lib/ai/proposals")) as unknown as {
    createProposal: (c: any, i: any) => Promise<{ id: string }>;
    executeProposal: (m: any, c: any, id: string, o?: any) => Promise<any>;
    DESTRUCTIVE_KINDS: Set<string>;
  };
  const t = await prisma.tenant.create({ data: { name: "QC W5B", slug: `qc-w5b-${Date.now()}` } }); tid = t.id;
  const ctx = { tenantId: tid };
  const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "w5b" } });
  const mkProp = async (kind: string, payload: Record<string, unknown>) => props.createProposal(ctx, { conversationId: conv.id, kind, summary: kind, payload });
  const run = async (kind: string, payload: Record<string, unknown>, opts?: any) => { const p = await mkProp(kind, payload); return props.executeProposal(OWNER, ctx, p.id, opts); };
  const parse = (s: string) => { try { return JSON.parse(s); } catch { return {}; } };

  // ── tools ใหม่ครบ ──
  const reg = tools.toolRegistry();
  const names = reg.map((x) => x.def.name);
  const NEW = ["point_adjust", "ticket_mark_paid", "restaurant_close_bill", "kanban_my_tasks"];
  chk("W5B-0.1", "tools ใหม่ครบ 4 ตัว", NEW.every((n) => names.includes(n)));
  chk("W5B-0.2", "risk: restaurant_close_bill=DESTRUCTIVE · point/ticket=NORMAL",
    props.DESTRUCTIVE_KINDS.has("restaurant_close_bill") && !props.DESTRUCTIVE_KINDS.has("point_adjust") && !props.DESTRUCTIVE_KINDS.has("ticket_mark_paid"));

  // ══ point_adjust ══
  const pUnit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "ร้านแต้ม", slug: `w5bp-${Date.now()}` } });
  const pSystems = await sys.ensureUnitSystems(tid, pUnit.id, "คาเฟ่แต้ม");
  const cust = await memberSvc.findOrCreate({ tenantId: tid, memberSystemId: pSystems.MEMBER, name: "คุณสมชาย", phone: "0810000001", source: "STAFF" });
  await point.adjustPoints({ tenantId: tid, systemId: pSystems.POINT, customerId: cust.id, delta: 100, idempotencyKey: `seed-${cust.id}` });
  const bal0 = await point.getBalance(pSystems.POINT, cust.id);

  const pa1 = await run("point_adjust", { delta: 50, customerName: "สมชาย", reason: "โปรโมชั่น" });
  const bal1 = await point.getBalance(pSystems.POINT, cust.id);
  chk("W5B-1.1", `แจก +50 (resolve ชื่อ) → balance ${bal0}→${bal0 + 50}`, pa1?.ok === true && bal1 === bal0 + 50);
  const ledgerGrant = await prisma.pointLedger.findFirst({ where: { systemId: pSystems.POINT, customerId: cust.id, type: "ADJUST", delta: 50 } });
  chk("W5B-1.2", "เกิด ledger ADJUST +50 พร้อมเหตุผล", !!ledgerGrant && ledgerGrant.reason === "โปรโมชั่น");

  const pa2 = await run("point_adjust", { delta: -20, customerPhone: "0810000001" });
  const bal2 = await point.getBalance(pSystems.POINT, cust.id);
  chk("W5B-1.3", `หัก -20 (resolve เบอร์) → balance ${bal1}→${bal1 - 20}`, pa2?.ok === true && bal2 === bal1 - 20);

  const pa3 = await run("point_adjust", { delta: 10, customerName: "ไม่มีคนนี้จริง" });
  chk("W5B-1.4", "resolve ไม่พบ → ok:false (guard)", pa3?.ok === false);

  const pa4 = await run("point_adjust", { delta: -99999, customerName: "สมชาย" });
  const bal4 = await point.getBalance(pSystems.POINT, cust.id);
  chk("W5B-1.5", "หักเกินแต้ม → FAILED ไม่แตะยอด", pa4?.ok === false && bal4 === bal2);

  // eval tool-level: สร้าง proposal + validate delta=0
  const paTool = parse(await tools.runTool({ tenantId: tid, conversationId: conv.id }, "point_adjust", { delta: 50, customerName: "สมชาย" }));
  chk("W5B-1.6", "tool point_adjust → proposal (waiting user_confirm)", !!paTool.proposalId && paTool.waiting === "user_confirm", "MAJOR");
  const paZero = parse(await tools.runTool({ tenantId: tid, conversationId: conv.id }, "point_adjust", { delta: 0, customerName: "สมชาย" }));
  chk("W5B-1.7", "delta=0 → error ไม่สร้าง proposal", !!paZero.error && !paZero.proposalId, "MAJOR");

  // ══ ticket_mark_paid ══
  const tUnit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "TICKET", name: "งานอีเวนต์", slug: `w5bt-${Date.now()}` } });
  const tPos = await sys.createSystem(tid, "POS", "POS ตั๋ว");
  await sys.linkUnit(tid, tPos.id, tUnit.id);
  const tctx = { tenantId: tid, unitId: tUnit.id };
  const ev = await ticket.createEvent(tctx, { name: "คอนเสิร์ตทะเล", startAt: new Date(Date.now() + 86400000) });
  const tt = await ticket.addTicketType(tctx, ev.id, { name: "บัตรทั่วไป", priceSatang: 50000, quota: 100 });
  const ord = await ticket.createOrder(tctx, { eventId: ev.id, buyerName: "คุณเอไอ", buyerPhone: "0820000002", lines: [{ ticketTypeId: tt.id, qty: 2 }] });
  chk("W5B-2.0", "setup: สร้างออเดอร์ตั๋ว PENDING", ord?.ok === true);
  const orderRow = await prisma.ticketOrder.findFirst({ where: { tenantId: tid, id: ord.orderId } });

  const tm1 = await run("ticket_mark_paid", { orderNo: orderRow?.orderNo });
  const orderPaid = await prisma.ticketOrder.findFirst({ where: { tenantId: tid, id: ord.orderId } });
  chk("W5B-2.1", "ticket_mark_paid (orderNo) → PAID", tm1?.ok === true && orderPaid?.status === "PAID");
  const posFromTicket = await prisma.posSale.count({ where: { tenantId: tid, sourceModule: "TICKET" } });
  chk("W5B-2.2", "post เส้นเงิน → PosSale (sourceModule TICKET) เกิด", posFromTicket >= 1);

  const tm2 = await run("ticket_mark_paid", { orderNo: "TO-NOPE-9999" });
  chk("W5B-2.3", "orderNo ไม่พบ → ok:false (guard)", tm2?.ok === false);

  // eval tool-level: resolve ด้วย eventName+buyer → proposal
  const ord2 = await ticket.createOrder(tctx, { eventId: ev.id, buyerName: "คุณสอง", lines: [{ ticketTypeId: tt.id, qty: 1 }] });
  void ord2;
  const tmTool = parse(await tools.runTool({ tenantId: tid, conversationId: conv.id }, "ticket_mark_paid", { eventName: "คอนเสิร์ต", buyerName: "คุณสอง" }));
  chk("W5B-2.4", "tool ticket_mark_paid (event+buyer) → proposal", !!tmTool.proposalId, "MAJOR");
  const tmEmpty = parse(await tools.runTool({ tenantId: tid, conversationId: conv.id }, "ticket_mark_paid", {}));
  chk("W5B-2.5", "ไม่ระบุอะไรเลย → error", !!tmEmpty.error && !tmEmpty.proposalId, "MAJOR");

  // ══ restaurant_close_bill (DESTRUCTIVE) ══
  const rUnit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "RESTAURANT", name: "ครัวปิดบิล", slug: `w5br-${Date.now()}` } });
  const rPos = await sys.createSystem(tid, "POS", "POS ครัว");
  await sys.linkUnit(tid, rPos.id, rUnit.id);
  await menu.ensureDefaultStations(tid, rUnit.id);
  const stations = await menu.listStations(tid, rUnit.id);
  const cat = await menu.createCategory(tid, rUnit.id, { name: "จานเดียว" });
  const it = await menu.createItem(tid, rUnit.id, { categoryId: cat.id, stationId: stations[0].id, name: "ข้าวกะเพรา", basePrice: 6000 });
  const zone = await rtable.createZone(tid, rUnit.id, "หน้าร้าน");
  const tb = await rtable.createTable(tid, rUnit.id, { zoneId: zone.id, name: "A1", seats: 4 });
  const sess = await rtable.openSession(tid, rUnit.id, tb.id, { guestCount: 2 });
  await rorder.createOrder({ tenantId: tid, unitId: rUnit.id, type: "DINE_IN", sessionId: sess.id, cart: [{ menuItemId: it.id, qty: 2, choiceIds: [] }], placedByUserId: "staff-qc" });

  // ชั้นแรก (ไม่มี confirm2x) → ต้องขอยืนยันอีกครั้ง ไม่ปิดโต๊ะ
  const rc1a = await run("restaurant_close_bill", { tableName: "A1" });
  const sessMid = await prisma.tableSession.findFirst({ where: { tenantId: tid, id: sess.id } });
  chk("W5B-3.1", "DESTRUCTIVE ชั้นแรก → needsSecondConfirm ไม่ปิดโต๊ะ", rc1a?.ok === false && rc1a?.needsSecondConfirm === true && sessMid?.status === "OPEN");

  // ปิดบิลจริง (confirm2x) — proposal ใหม่
  const rc1b = await run("restaurant_close_bill", { tableName: "A1", payMethod: "CASH" }, { confirm2x: true });
  const sessClosed = await prisma.tableSession.findFirst({ where: { tenantId: tid, id: sess.id } });
  chk("W5B-3.2", "confirm2x → ปิดบิล + โต๊ะ CLOSED", rc1b?.ok === true && sessClosed?.status === "CLOSED");
  const posFromRest = await prisma.posSale.count({ where: { tenantId: tid, sourceModule: "RESTAURANT" } });
  chk("W5B-3.3", "เช็คบิล → PosSale (sourceModule RESTAURANT) เกิด", posFromRest >= 1);

  const rc2 = await run("restaurant_close_bill", { tableName: "Z9" }, { confirm2x: true });
  chk("W5B-3.4", "โต๊ะไม่พบ → ok:false (guard)", rc2?.ok === false);

  const rcTool = parse(await tools.runTool({ tenantId: tid, conversationId: conv.id }, "restaurant_close_bill", { tableName: "A1" }));
  chk("W5B-3.5", "tool restaurant_close_bill → proposal", !!rcTool.proposalId, "MAJOR");

  // ══ kanban_my_tasks (READ) ══
  const kSys = await sys.createSystem(tid, "KANBAN", "บอร์ดงาน");
  const u = await prisma.user.create({ data: { email: `w5b-${Date.now()}@qc.local`, name: "พนักงานเอ" } });
  await prisma.membership.create({ data: { tenantId: tid, userId: u.id, role: "STAFF" } });
  const board = await kanban.createBoard({ tenantId: tid, systemId: kSys.id, name: "งานร้าน" });
  const full = await kanban.getBoard(tid, kSys.id, board.id);
  const col0 = full.columns[0];
  await kanban.createCard({ tenantId: tid, systemId: kSys.id, columnId: col0.id, title: "จัดของหน้าร้าน", assigneeUserId: u.id });
  await kanban.createCard({ tenantId: tid, systemId: kSys.id, columnId: col0.id, title: "งานไร้เจ้าของ" }); // unassigned

  const kt1 = parse(await tools.runTool({ tenantId: tid, conversationId: conv.id }, "kanban_my_tasks", { assignee: "พนักงานเอ" }));
  chk("W5B-4.1", "assignee ชื่อ → คืนงานของคนนั้น 1 งาน", kt1.จำนวนงาน === 1 && Array.isArray(kt1.งานของฉัน) && kt1.งานของฉัน.length === 1);

  const kt2 = parse(await tools.runTool({ tenantId: tid, conversationId: conv.id }, "kanban_my_tasks", {}));
  chk("W5B-4.2", "ไม่ระบุ → มีงานไร้เจ้าของ + งานทั้งหมด + หมายเหตุข้อจำกัด",
    !!kt2.หมายเหตุ && Array.isArray(kt2.งานที่ยังไม่มีผู้รับ) && kt2.งานที่ยังไม่มีผู้รับ.length === 1 && Array.isArray(kt2.งานทั้งหมดที่กำลังทำ) && kt2.งานทั้งหมดที่กำลังทำ.length === 2);

  const kt3 = parse(await tools.runTool({ tenantId: tid, conversationId: conv.id }, "kanban_my_tasks", { assignee: "ไม่มีพนักงานคนนี้" }));
  chk("W5B-4.3", "assignee ไม่พบ → error", !!kt3.error, "MAJOR");

  const kt4 = parse(await tools.runTool({ tenantId: tid, conversationId: conv.id }, "kanban_my_tasks", { assignee: "พนักงานเอ" }));
  void kt4; // (no KANBAN check moved earlier)
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? (e.stack ?? e.message).slice(0, 300) : String(e)), false); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of [
      "aiProposal", "aiMessage", "aiConversation",
      "kanbanCard", "kanbanColumn", "kanbanBoard",
      "ticketAdmission", "ticketOrder", "ticketType", "ticketEvent",
      "restaurantServiceRequest", "restaurantOrderItemOption", "restaurantOrderItem", "restaurantOrder", "restaurantDailyCounter", "tableSession", "restaurantTable", "restaurantZone", "menuItemOptionGroup", "menuOptionChoice", "menuOptionGroup", "menuItem", "menuCategory", "kdsStation", "restaurantSetting",
      "posPayment", "posSaleLine", "posSale", "posReceiptCounter",
      "pointLedger", "pointBalance", "pointSettings", "memberActivity", "customer",
      "appSystemUnit", "appSystem",
    ]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.membership.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.user.deleteMany({ where: { email: { contains: "@qc.local" }, memberships: { none: {} } } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Wave5-B =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
