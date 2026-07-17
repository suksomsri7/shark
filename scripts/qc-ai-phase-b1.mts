// QC — AI Phase B1: ทำแทนโมดูลเงินเดิน (POS ขาย·จองบริการ·จองห้อง·ออกบัตรคิว·ยืนยันออเดอร์ร้านออนไลน์) · Fable oracle
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา (proposal→confirm→execute pattern เดิม · ทุก kind NORMAL ยกเว้นที่ระบุ):
// [kinds ใหม่ใน proposals.ts + tools ใน tools.ts — resolve unit: ถ้าร้านมี unit ประเภทนั้นตัวเดียวใช้เลย · หลายตัว payload ต้องมี unitName ไม่งั้น dispatch throw ไทยชวนระบุ]
//   pos_create_sale { unitName?, lines:[{name,qty,unitPriceSatang}], payType:"CASH"|"TRANSFER"|"PROMPTPAY" } → pos.createSale (idempotencyKey `ai-<proposalId>`)
//   booking_create_appointment { unitName?, serviceName, staffName?, dateStr:"YYYY-MM-DD", startMin:number, customerName, customerPhone }
//     → resolve service จากชื่อ (contains) · staff จากชื่อ หรือคนแรก active · เรียก booking.createAppointment · reason ไม่ ok → throw ไทย
//   hotel_create_reservation { unitName?, roomTypeName, guestName, guestPhone?, checkInDate, checkOutDate } → resolve roomType จากชื่อ → hotel.createReservation
//   queue_issue_ticket { unitName?, typeName?, customerName? } → queue.issueTicket (channel "STAFF" หรือ enum ที่มีจริง — เช็ค QueueIssueChannel)
//   shop_confirm_order { orderCode } → shop.confirmOrderPaid (resolve order จาก code ทุก unit SHOP) — เงินเข้า = NORMAL
// [read tools ใหม่]:
//   today_appointments — นัดวันนี้ (BKK) ทุก unit · queue_waiting — คิวที่รอตอนนี้ · shop_pending_orders — ออเดอร์รอชำระ/รอยืนยัน
// validate-explain: pos_create_sale lines ว่าง/qty≤0/ราคาติดลบ → {error,suggestion} ไม่สร้าง proposal
try { process.loadEnvFile(".env"); } catch {}
process.env.SHARK_AI_MOCK = "1";
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, s: Sev = "CRITICAL") => { cks.push({ id, ok, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}`); };
const OWNER = { role: "OWNER", unitAccess: [] as string[], permissions: {}, userId: "own-1" };
let tid = "";
try {
  const tools = (await import("@/lib/ai/tools")) as unknown as { toolRegistry: () => { def: { name: string } }[]; runTool: (c: any, n: string, a: any) => Promise<string> };
  const props = (await import("@/lib/ai/proposals")) as unknown as { createProposal: (c: any, i: any) => Promise<any>; executeProposal: (m: any, c: any, id: string, o?: any) => Promise<any> };
  const t = await prisma.tenant.create({ data: { name: "QC PB1", slug: `qc-pb1-${Date.now()}` } }); tid = t.id;
  const ctx = { tenantId: tid };
  const conv = await prisma.aiConversation.create({ data: { tenantId: tid, title: "b1" } });

  const NEW_TOOLS = ["pos_create_sale", "booking_create_appointment", "hotel_create_reservation", "queue_issue_ticket", "shop_confirm_order", "today_appointments", "queue_waiting", "shop_pending_orders"];
  const reg = tools.toolRegistry().map((x) => x.def.name);
  chk("B1-0", "tools ใหม่ครบ 8 ตัว", NEW_TOOLS.every((n) => reg.includes(n)));

  // 1) POS ขาย: หน่วยเดียว → ขายจริงผ่าน proposal
  const shopUnit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "หน้าร้าน", slug: `pb1-${Date.now()}` } });
  await sys.createSystem(tid, "POS", "ขาย");
  const sp = await props.createProposal(ctx, { conversationId: conv.id, kind: "pos_create_sale", summary: "เปิดบิล 150 บาท", payload: { lines: [{ name: "กาแฟ", qty: 1, unitPriceSatang: 15000 }], payType: "CASH" } });
  const sx = await props.executeProposal(OWNER, ctx, sp.id);
  const sale = await prisma.posSale.findFirst({ where: { tenantId: tid, status: "PAID" } });
  chk("B1-1.1", "pos_create_sale → PosSale PAID 150 บาทเกิดจริง + idempotencyKey ai-<proposalId>", sx?.ok === true && sale?.grandTotalSatang === 15000 && sale?.idempotencyKey === `ai-${sp.id}`);
  const bad = await tools.runTool({ tenantId: tid, conversationId: conv.id }, "pos_create_sale", { lines: [{ name: "ผี", qty: 0, unitPriceSatang: 100 }], payType: "CASH" });
  let badParsed: any = {}; try { badParsed = JSON.parse(bad); } catch {}
  chk("B1-1.2", "ขาย qty 0 → error+ไม่สร้าง proposal (validate-explain)", !!badParsed.error && (await prisma.aiProposal.count({ where: { tenantId: tid, kind: "pos_create_sale" } })) === 1);

  // 2) จองบริการ
  const bkUnit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "BOOKING", name: "ร้านตัดผม", slug: `pb1b-${Date.now()}` } });
  const svc = await prisma.bookingService.create({ data: { tenantId: tid, unitId: bkUnit.id, name: "ตัดผมชาย", durationMin: 30 } });
  const stf = await prisma.bookingStaff.create({ data: { tenantId: tid, unitId: bkUnit.id, name: "ช่างเอ" } });
  await prisma.bookingStaffHours.create({ data: { tenantId: tid, unitId: bkUnit.id, staffId: stf.id, weekday: new Date("2026-08-03T00:00:00+07:00").getDay(), startMin: 540, endMin: 1080 } });
  const bp = await props.createProposal(ctx, { conversationId: conv.id, kind: "booking_create_appointment", summary: "จองตัดผม", payload: { serviceName: "ตัดผม", dateStr: "2026-08-03", startMin: 600, customerName: "คุณจอง", customerPhone: "0801234567" } });
  const bx = await props.executeProposal(OWNER, ctx, bp.id);
  chk("B1-2.1", "booking_create_appointment → นัดเกิดจริง (resolve service จากชื่อบางส่วน + ช่างคนแรก)", bx?.ok === true && (await prisma.appointment.count({ where: { tenantId: tid, customerName: "คุณจอง" } })) === 1);

  // 3) จองห้องพัก
  const htUnit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "HOTEL", name: "รีสอร์ต", slug: `pb1h-${Date.now()}` } });
  const rtDeluxe = await prisma.hotelRoomType.create({ data: { tenantId: tid, unitId: htUnit.id, name: "Deluxe" } });
  await prisma.hotelRoom.create({ data: { tenantId: tid, unitId: htUnit.id, roomTypeId: rtDeluxe.id, number: "101" } });
  await prisma.hotelRoomType.create({ data: { tenantId: tid, unitId: htUnit.id, name: "Suite ไม่มีห้อง" } }); // ประเภทที่ยังไม่ตั้งห้องจริง
  const hp = await props.createProposal(ctx, { conversationId: conv.id, kind: "hotel_create_reservation", summary: "จองห้อง", payload: { roomTypeName: "Deluxe", guestName: "คุณพัก", checkInDate: "2026-08-10", checkOutDate: "2026-08-12" } });
  const hx = await props.executeProposal(OWNER, ctx, hp.id);
  const resv = await prisma.hotelReservation.findFirst({ where: { tenantId: tid, guestName: "คุณพัก" } });
  chk("B1-3.1", "hotel_create_reservation → ใบจองเกิด (มี code)", hx?.ok === true && !!resv?.code);
  // ประเภทห้องไม่มีห้องจริง → ห้าม auto-เปิดห้อง ต้อง throw ไทยบอกให้ตั้งห้องก่อน (กันจองผี)
  const hp2 = await props.createProposal(ctx, { conversationId: conv.id, kind: "hotel_create_reservation", summary: "จองห้องผี", payload: { roomTypeName: "Suite", guestName: "คุณผี", checkInDate: "2026-08-15", checkOutDate: "2026-08-16" } });
  const hx2 = await props.executeProposal(OWNER, ctx, hp2.id);
  chk("B1-3.2", "ประเภทห้องไม่มีห้องจริง → ok:false บอกให้เพิ่มห้องก่อน + ไม่แอบสร้างห้อง", hx2?.ok === false && (await prisma.hotelRoom.count({ where: { tenantId: tid } })) === 1 && (await prisma.hotelReservation.count({ where: { tenantId: tid, guestName: "คุณผี" } })) === 0);

  // 4) ออกบัตรคิว
  const qUnit = await prisma.businessUnit.create({ data: { tenantId: tid, type: "QUEUE", name: "คิวหน้าร้าน", slug: `pb1q-${Date.now()}` } });
  await prisma.queueType.create({ data: { tenantId: tid, unitId: qUnit.id, name: "ทั่วไป", code: "GENERAL", prefix: "A" } });
  const qp = await props.createProposal(ctx, { conversationId: conv.id, kind: "queue_issue_ticket", summary: "ออกบัตรคิว", payload: { customerName: "คุณคิว" } });
  const qx = await props.executeProposal(OWNER, ctx, qp.id);
  chk("B1-4.1", "queue_issue_ticket → บัตรคิวเกิดจริง", qx?.ok === true && (await prisma.queueTicket.count({ where: { tenantId: tid } })) >= 1);

  // 5) ยืนยันออเดอร์ร้านออนไลน์
  const shopSvc = (await import("@/lib/modules/shop/service")) as unknown as { createProduct: (c: any, i: any) => Promise<any>; createOrder: (c: any, i: any) => Promise<any> };
  const sctx = { tenantId: tid, unitId: shopUnit.id };
  const prod = await shopSvc.createProduct(sctx, { name: "เสื้อ", priceSatang: 20000 });
  const order = await shopSvc.createOrder(sctx, { customerName: "ลูกค้าเว็บ", customerPhone: "1", lines: [{ productId: prod.id, qty: 1 }] });
  const op = await props.createProposal(ctx, { conversationId: conv.id, kind: "shop_confirm_order", summary: "ยืนยันรับเงินออเดอร์", payload: { orderCode: order.code } });
  const ox = await props.executeProposal(OWNER, ctx, op.id);
  chk("B1-5.1", "shop_confirm_order → ออเดอร์ PAID + เส้นเงินเดิน (PosSale ecom)", ox?.ok === true && (await prisma.shopOrder.findUnique({ where: { id: order.id } }))?.status === "PAID" && (await prisma.posSale.count({ where: { tenantId: tid, idempotencyKey: `ecom-${order.id}` } })) === 1);

  // 6) read tools ตอบข้อมูลจริง
  const tq = await tools.runTool({ tenantId: tid }, "queue_waiting", {});
  const ta = await tools.runTool({ tenantId: tid }, "shop_pending_orders", {});
  chk("B1-6.1", "read tools ตอบ JSON ไทยไม่ error", !JSON.parse(tq).error !== false && !String(ta).includes('"error"'), "MAJOR");
} catch (e) { chk("CRASH", "จบ: " + (e instanceof Error ? e.message.slice(0, 140) : String(e)), false); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) { for (const m of ["aiProposal", "aiMessage", "aiConversation", "queueTicket", "queueCounter", "queueType", "queueDisplay", "appointment", "bookingStaffHours", "bookingStaff", "bookingService", "hotelReservation", "hotelRoom", "hotelRoomType", "shopOrderLine", "shopOrder", "shopProduct", "posPayment", "posSaleLine", "posSale", "posReceiptCounter", "outboxEvent", "appNotification", "appSystemUnit", "appSystem"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } })); await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } })); await d(() => prisma.tenant.delete({ where: { id: tid } })); }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC AI Phase B1 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
