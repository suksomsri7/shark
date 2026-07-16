// QC service-layer ของ 7 ระบบใหม่ (P1) — สร้าง tenant ทดสอบ, รัน happy path ผ่าน service จริง,
// verify runtime กับ Neon, แล้วลบ test data ทั้งหมด. รัน: pnpm exec tsx scripts/qc-systems.ts
try { process.loadEnvFile(".env"); } catch { /* CI ไม่มี .env — env มาจาก secrets โดยตรง */ }
try { process.loadEnvFile(".env.local"); } catch {}

const { prisma } = await import("@/lib/core/db");
const system = await import("@/lib/modules/system/service");
const account = await import("@/lib/modules/account/service");
const coupon = await import("@/lib/modules/coupon/service");
const meeting = await import("@/lib/modules/meeting/service");
const kanban = await import("@/lib/modules/kanban/service");
const hotel = await import("@/lib/modules/hotel/service");
const queue = await import("@/lib/modules/queue/service");
const ticket = await import("@/lib/modules/ticket/service");

const log: string[] = [];
const pass = (n: string) => log.push("  ✅ " + n);
const fail = (n: string, e: unknown) =>
  log.push("  ❌ " + n + " — " + (e instanceof Error ? e.message : String(e)));
function check(name: string, r: unknown) {
  if (r === null || r === undefined) throw new Error(name + " → null/undefined");
  if (typeof r === "object" && r !== null && "ok" in r && (r as { ok: unknown }).ok === false)
    throw new Error(name + " → " + JSON.stringify(r));
  return r;
}

const tag = "QCTEST-" + Date.now();
let tenantId = "";
let userId = "";
const email = tag.toLowerCase() + "@qc.local";

try {
  // ── seed core ──
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tenantId = t.id;
  const u = await prisma.user.create({ data: { email, name: "QC" } });
  userId = u.id;
  await prisma.membership.create({ data: { userId, tenantId, role: "OWNER", unitAccess: ["*"] } });
  const mk = (type: "HOTEL" | "QUEUE" | "TICKET", slug: string) =>
    prisma.businessUnit.create({ data: { tenantId, type, name: type + " " + tag, slug: slug + "-" + tag.toLowerCase() } });
  const hUnit = await mk("HOTEL", "h");
  const qUnit = await mk("QUEUE", "q");
  const tkUnit = await mk("TICKET", "tk");
  log.push(`[seed] tenant ${tenantId} + 3 business units OK`);

  // ── Account ──
  try {
    const sys = await system.createSystem(tenantId, "ACCOUNT", "บัญชี " + tag);
    await account.saveSettings(tenantId, sys.id, { orgName: "ร้าน QC", vatRegistered: true, vatRateBp: 700 });
    const contact = check("account.createContact", await account.createContact({ tenantId, systemId: sys.id, name: "ลูกค้า QC", kind: "CUSTOMER" }));
    const qDoc = check("account.createDocument(QUOTATION)", await account.createDocument({
      tenantId, systemId: sys.id, docType: "QUOTATION", contactId: (contact as { id: string }).id,
      vatMode: "EXCLUDE", lines: [{ description: "งานออกแบบ", qty: 1, unitPrice: 500000 }],
    }));
    const issued = check("account.issueDocument", await account.issueDocument(tenantId, sys.id, (qDoc as { id: string }).id)) as { ok: true; docNo: string };
    const conv = check("account.convertDocument(→INVOICE)", await account.convertDocument(tenantId, sys.id, (qDoc as { id: string }).id, "INVOICE")) as { ok: true; newId: string };
    const inv = check("account.issueDocument(INVOICE)", await account.issueDocument(tenantId, sys.id, conv.newId)) as { ok: true };
    check("account.recordPayment", await account.recordPayment(tenantId, sys.id, conv.newId, { amount: 535000, channel: "TRANSFER" }));
    pass(`Account: QT ${issued.docNo} → INVOICE → PAID`);
  } catch (e) { fail("Account", e); }

  // ── Coupon ──
  try {
    const sys = await system.createSystem(tenantId, "COUPON", "คูปอง " + tag);
    check("coupon.createCoupon", await coupon.createCoupon({ tenantId, systemId: sys.id, code: "QC10", name: "ลด 10%", type: "PERCENT", percent: 10 }));
    const v = check("coupon.validate", await coupon.validate({ code: "QC10", tenantId, systemId: sys.id, amountSatang: 100000 })) as { ok: true; discountSatang: number };
    const r = check("coupon.redeem", await coupon.redeem({ code: "QC10", tenantId, systemId: sys.id, amountSatang: 100000, refType: "QC", refId: "x" })) as { ok: true };
    pass(`Coupon: validate ลด ${v.discountSatang / 100}฿ + redeem OK`);
  } catch (e) { fail("Coupon", e); }

  // ── Meeting ──
  try {
    const sys = await system.createSystem(tenantId, "MEETING", "ทีม " + tag);
    const ws = check("meeting.ensureWorkspace", await meeting.ensureWorkspace(tenantId, sys.id, userId)) as { id: string };
    const ch = check("meeting.createChannel", await meeting.createChannel({ tenantId, systemId: sys.id, name: "qc-room", kind: "PUBLIC", createdByUserId: userId })) as { ok: true; id: string };
    check("meeting.postMessage", await meeting.postMessage({ tenantId, systemId: sys.id, channelId: ch.id, authorUserId: userId, body: "สวัสดีทีม 👋" }));
    const msgs = check("meeting.listMessages", await meeting.listMessages(sys.id, ch.id)) as unknown[];
    pass(`Meeting: #general + #qc-room + ${msgs.length} ข้อความ`);
  } catch (e) { fail("Meeting", e); }

  // ── Kanban ──
  try {
    const sys = await system.createSystem(tenantId, "KANBAN", "บอร์ด " + tag);
    const b = check("kanban.createBoard", await kanban.createBoard({ tenantId, systemId: sys.id, name: "Sprint QC" })) as { id: string };
    const board = check("kanban.getBoard", await kanban.getBoard(tenantId, sys.id, b.id)) as { columns: { id: string }[] };
    const col0 = board.columns[0].id, col1 = board.columns[1].id;
    const card = check("kanban.createCard", await kanban.createCard({ tenantId, systemId: sys.id, columnId: col0, title: "งานทดสอบ", assigneeUserId: userId })) as { id: string };
    check("kanban.moveCard", await kanban.moveCard({ tenantId, systemId: sys.id, cardId: card.id, toColumnId: col1 }));
    pass(`Kanban: board ${board.columns.length} คอลัมน์ + สร้าง/ย้ายการ์ด OK`);
  } catch (e) { fail("Kanban", e); }

  // ── Hotel ──
  try {
    const uid = hUnit.id;
    const rt = check("hotel.createRoomType", await hotel.createRoomType({ tenantId, unitId: uid, name: "Deluxe", capacity: 2, baseRateSatang: 120000 })) as { id: string };
    const room = check("hotel.createRoom", await hotel.createRoom({ tenantId, unitId: uid, roomTypeId: rt.id, number: "101" })) as { ok: true; id: string };
    const today = hotel.todayBkk();
    const out = hotel.addDaysStr(today, 2);
    const rv = check("hotel.createReservation", await hotel.createReservation({ tenantId, unitId: uid, roomTypeId: rt.id, checkInDate: today, checkOutDate: out, guestName: "คุณทดสอบ" })) as { ok: true; id: string; code: string };
    check("hotel.checkIn", await hotel.checkIn(tenantId, uid, rv.id, room.id));
    check("hotel.checkOut", await hotel.checkOut(tenantId, uid, rv.id));
    pass(`Hotel: จอง ${rv.code} → check-in ห้อง 101 → check-out OK`);
  } catch (e) { fail("Hotel", e); }

  // ── Queue ──
  try {
    const uid = qUnit.id;
    const ctx = { tenantId, unitId: uid };
    const qt = await prisma.queueType.create({ data: { tenantId, unitId: uid, code: "A", name: "ทั่วไป", prefix: "A", priority: 0 } });
    const counter = await prisma.queueCounter.create({ data: { tenantId, unitId: uid, code: "1", name: "ช่อง 1", status: "OPEN" } });
    await prisma.queueCounterType.create({ data: { tenantId, unitId: uid, counterId: counter.id, typeId: qt.id } });
    const tk = check("queue.issueTicket", await queue.issueTicket({ tenantId, unitId: uid, typeId: qt.id, channel: "STAFF", actorType: "STAFF" })) as { ok: true; ticket: { number: number } };
    const called = check("queue.callNext", await queue.callNext(ctx, counter.id, userId)) as { ok: true; ticket: { id: string } };
    check("queue.markDone", await queue.markDone(ctx, called.ticket.id, userId));
    pass(`Queue: ออกบัตร A${tk.ticket.number} → เรียกคิว → เสร็จ OK`);
  } catch (e) { fail("Queue", e); }

  // ── Ticket ──
  try {
    const uid = tkUnit.id;
    const ctx = { tenantId, unitId: uid };
    const ev = check("ticket.createEvent", await ticket.createEvent(ctx, { name: "คอนเสิร์ต QC", startAt: new Date(Date.now() + 86400000) })) as { id: string };
    const ty = check("ticket.addTicketType", await ticket.addTicketType(ctx, ev.id, { name: "บัตรทั่วไป", priceSatang: 50000, quota: 100 })) as { id: string };
    const order = check("ticket.createOrder", await ticket.createOrder(ctx, { eventId: ev.id, buyerName: "ผู้ซื้อ QC", lines: [{ ticketTypeId: ty.id, qty: 2 }], markPaid: true })) as { ok: true; orderId: string; orderNo: string };
    const adm = await prisma.ticketAdmission.findFirst({ where: { tenantId, unitId: uid, orderId: order.orderId } });
    if (!adm) throw new Error("ไม่พบตั๋วที่ออก");
    check("ticket.checkIn", await ticket.checkIn(ctx, adm.code, { eventId: ev.id }));
    pass(`Ticket: ${order.orderNo} ขาย 2 ใบ (paid) → check-in ตั๋ว ${adm.code} OK`);
  } catch (e) { fail("Ticket", e); }
} finally {
  // ── cleanup: ลบ test data ทั้งหมด (module tables ไม่ cascade เพราะ tenantId เป็น scalar) ──
  const del = async (fn: () => Promise<unknown>) => { try { await fn(); } catch {} };
  if (tenantId) {
    await del(() => prisma.kanbanCard.deleteMany({ where: { tenantId } }));
    await del(() => prisma.kanbanColumn.deleteMany({ where: { tenantId } }));
    await del(() => prisma.kanbanBoard.deleteMany({ where: { tenantId } }));
    await del(() => prisma.meetingMessage.updateMany({ where: { tenantId }, data: { threadParentId: null } }));
    await del(() => prisma.meetingMessage.deleteMany({ where: { tenantId } }));
    await del(() => prisma.meetingChannelMember.deleteMany({ where: { tenantId } }));
    await del(() => prisma.meetingChannel.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocument.updateMany({ where: { tenantId }, data: { sourceDocId: null } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountDocSequence.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountContact.deleteMany({ where: { tenantId } }));
    await del(() => prisma.accountSettings.deleteMany({ where: { tenantId } }));
    await del(() => prisma.couponRedemption.deleteMany({ where: { tenantId } }));
    await del(() => prisma.coupon.deleteMany({ where: { tenantId } }));
    await del(() => prisma.hotelReservation.deleteMany({ where: { tenantId } }));
    await del(() => prisma.hotelRoom.deleteMany({ where: { tenantId } }));
    await del(() => prisma.hotelRoomType.deleteMany({ where: { tenantId } }));
    await del(() => prisma.queueTicketEvent.deleteMany({ where: { tenantId } }));
    await del(() => prisma.queueTicket.deleteMany({ where: { tenantId } }));
    await del(() => prisma.queueDailySequence.deleteMany({ where: { tenantId } }));
    await del(() => prisma.queueCounterType.deleteMany({ where: { tenantId } }));
    await del(() => prisma.queueCounter.deleteMany({ where: { tenantId } }));
    await del(() => prisma.queueType.deleteMany({ where: { tenantId } }));
    await del(() => prisma.queueDisplay.deleteMany({ where: { tenantId } }));
    await del(() => prisma.ticketAdmission.deleteMany({ where: { tenantId } }));
    await del(() => prisma.ticketOrder.deleteMany({ where: { tenantId } }));
    await del(() => prisma.ticketType.deleteMany({ where: { tenantId } }));
    await del(() => prisma.ticketEvent.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystemUnit.deleteMany({ where: { tenantId } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId } }));
    await del(() => prisma.tenant.delete({ where: { id: tenantId } })); // cascade BU/Membership/AuditLog
  }
  if (userId) await del(() => prisma.user.delete({ where: { id: userId } })); // cascade sessions
  log.push("[cleanup] ลบ test data + tenant เรียบร้อย");
}

console.log("\n===== QC 7 ระบบใหม่ (service layer, Neon) =====");
console.log(log.join("\n"));
const failed = log.filter((l) => l.includes("❌")).length;
console.log(`\n${failed === 0 ? "🎉 ผ่านทั้งหมด" : "⚠️ มี " + failed + " รายการล้มเหลว"}\n`);
await prisma.$disconnect();
process.exit(failed === 0 ? 0 : 1);
