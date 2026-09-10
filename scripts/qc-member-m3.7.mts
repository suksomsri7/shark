// QC — ระบบสมาชิก v2 WO M3.7: ไทม์ไลน์ประวัติ — consumer ทุกโมดูล → MemberActivity (pos paid/voided · booking completed/no_show (event ใหม่) · chat ทุกช่องทาง (linked + message) · ecommerce shop.order.paid (marketplace → สมาชิก/แต้ม/ที่มา MARKETPLACE + linkIdentity) · crm.deal.won (event ใหม่ + auto-link) · loyalty ทั้งหมด) · อ่านผ่าน (read-through): เอกสารบัญชี listDocsByParty · การ์ดบอร์ดงานที่ผูก PARTY · แท็บประวัติกรอง ชนิด/ช่วง/สาขา · unit scope · perf
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M3.7 · พิมพ์เขียว §4.3 (MemberActivity data/unitId/actorUserId) §7.1 (booking.completed/no_show · crm.deal.won · shop.order.paid) §8 (บรรทัด 503–529) · ภาพ 08 (ซ้าย/กลาง)
// requires: member-seed
//
// สัญญา (ไม่มี migration — ใช้ MemberActivity เดิม · src/lib/modules/member/{history.ts, history-kinds.ts} · facade member/index.ts · consumers ใน outbox-consumers.ts ผ่าน src/lib/member-bridges.ts (composition root · M2.8) · booking/service.ts emit `booking.completed`/`booking.no_show` ใน setAppointmentStatus (DONE/NO_SHOW · idempotencyKey booking.<status>.<appointmentId>) · crm/service.ts#moveDeal emit `crm.deal.won` {dealId, contactId, valueSatang, partyId?, phone?, email?, name} · shop/service.ts#confirmOrderPaid emit `shop.order.paid` {orderId, unitId, code, customerName, customerPhone, totalSatang, posSaleId?, channel ("SHOP" | "SHOPEE" | "LAZADA" | "TIKTOK")} · ทั้ง 4 ลง 3 ทะเบียน (consumers · AUTOMATION_EVENTS label ไทย · WEBHOOK_EVENTS))
//   history-kinds.ts: HISTORY_KINDS (ลำดับชิปภาพ 08): [{ key: "purchase", label "ซื้อ", modules ["pos"] }, { key: "booking", label "จอง", modules ["booking"] }, { key: "chat", label "แชท", modules ["chat"] }, { key: "document", label "เอกสาร", modules ["account"] }, { key: "tier", label "ระดับ", types ["TIER_CHANGED", "SET_TIER"] }, { key: "loyalty", label "แต้ม/สิทธิ์", modules ["point", "voucher", "stamp", "reward", "giftcard", "wallet"] }, { key: "task", label "งาน", modules ["kanban"] }, { key: "review", label "รีวิว/แนะนำ", modules ["review", "referral"] }, { key: "profile", label "โปรไฟล์", modules ["member"] }] · kindOf(row) → key · สีต่อ kind ใช้ token (ไม่มี hex ใน component)
//   ชนิดที่ consumer ต้องเขียน (module/type · data ย่อ · summary ไทย · unitId ถ้ามี · actorUserId ถ้ามี):
//     pos.sale.paid → pos/PURCHASE refType PosSale data { netSatang, receiptNo, pointsEarned?, voucherUsed?: n, stampsAdded?: n } (M2.8 bridges เขียนอยู่แล้ว — M3.7 เติม data ให้ครบ) · pos.sale.voided → pos/PURCHASE_VOIDED data { netSatang, receiptNo }
//     booking.completed → booking/VISIT refType Appointment data { serviceName, staffName, startAt } + เรียก stamp.autoStampFromVisit + point EVENT_BONUS CHECKIN (ถ้ามีกฎ) + reviews.requestReview (ถ้ามี M3.4 · ผ่าน bridges · ไม่ throw) · booking.no_show → booking/NO_SHOW data { serviceName, startAt }
//     chat.contact.linked → chat/CHANNEL_LINKED refType ChatContact data { channel } · chat.message.received (conversation.contact.customerId ไม่ว่าง) → chat/MESSAGE refType ChatConversation refId conversationId data { channel, preview } — 1 แถว/ห้อง/วันไทย (ข้อความถัดไปวันเดียวกัน = ไม่เพิ่ม · แต่ update data.count)
//     kanban.card.completed (การ์ดผูก PARTY = party ของสมาชิก) → kanban/CARD_COMPLETED refType KanbanCard data { cardNo, title, boardName } · การ์ดที่ยังเปิด = read-through (listCardsForTarget PARTY) ไม่เขียนแถว
//     crm.deal.won → crm/DEAL_WON refType CrmDeal data { valueSatang, title } · หา/สร้างสมาชิกจาก contact (partyId → phone → email · ไม่พบ + มีเบอร์/อีเมล → createMember source "CRM" sourceDetail { crmContactId } · ผูก CrmContact.partyId = Customer.partyId)
//     shop.order.paid → pos/PURCHASE refType ShopOrder data { channel, code, netSatang, pointsEarned } · หา/สร้างสมาชิกจาก customerPhone (ไม่พบ → createMember source "MARKETPLACE" sourceChannel = channel) · linkIdentity(channel, externalId = customerPhone) · แต้มผ่าน point facade earnWithLot refType "ShopOrder" idempotencyKey `shop-earn-<orderId>` (computeEarn · ไม่ให้ซ้ำกับ posSaleId ที่ M2.8 จะให้แต้มอยู่แล้ว → ถ้ามี posSaleId ให้ข้ามการให้แต้ม) · ซ้ำ (event เดิม drain 2 รอบ / re-emit) → 1 แถว 1 ledger
//     loyalty (recordOnce idempotent บน customerId+module+type+refId): point.earned → point/POINTS_EARNED data { points, refType, expiresAt } · point.burned → point/POINTS_BURNED · point.expired → point/POINTS_EXPIRED data { points } · member.tier.changed → member/TIER_CHANGED data { from, to, reason } (M1.9 เขียนอยู่แล้ว — ต้องมี data.reason เป็นข้อความไทยมีตัวเลข) · voucher.issued → voucher/VOUCHER_ISSUED · voucher.used → voucher/VOUCHER_USED · stamp.completed → stamp/STAMP_COMPLETED · reward.redeemed → reward/REWARD_REDEEMED · giftcard.sold/used → giftcard/GIFTCARD_* (ถ้าโมดูลเขียนเองแล้ว consumer ต้องไม่เขียนซ้ำ)
//   recordOnce(ctx, { customerId, module, type, refType, refId, summary, data?, unitId?, actorUserId?, at? }) → { id, created } — กันซ้ำด้วย findFirst (customerId, module, type, refId) · at = เวลาเหตุการณ์จริง (createdAt) ถ้าส่งมา
//   listHistory(ctx, actor, customerId, { kind?: key | "all", from?, to?, unitId?, take? ≤ 100, cursor? }) → { items: [{ id, at, kind, module, type, title (ไทยสั้น เช่น "ซื้อบิล R-1042"), summary, data, ref: { type, id, href? } | null, unit: { id, name } | null, actor: { id, name } | null }], nextCursor, counts: { all, purchase, booking, chat, document, tier, loyalty, task, review, profile } } — รวม read-through: เอกสารบัญชีของ party (account facade listDocsByParty(tenantId, partyId) → kind document · title "<ชนิดเอกสาร> <docNo>" · data { totalSatang, status } · ref ACCOUNT_DOC) + การ์ดบอร์ดที่ผูก PARTY ยังเปิดอยู่ (kanban links facade listCardsForTarget → kind task · title 'งานบอร์ด "<title>"' · data { cardNo, boardName, columnName, status }) · เรียง at desc · cursor เดินหน้า (คอมโพสิต at+id · read-through ถูกผสานตามเวลา) · unit scope: actor ที่ unitAccess จำกัด เห็นเฉพาะแถว unitId ∈ unitAccess หรือ unitId null · มองไม่เห็นสมาชิก → throw ไม่พบ (ด่านเดียวกับ briefFor)
//   account facade เพิ่ม listDocsByParty(tenantId, partyId, { take? }) → [{ id, docType, docNo, status, totalSatang, issuedAt|createdAt, systemId }] (ไม่รวม DRAFT? — รวม แต่ data.status บอก) · kanban facade (links.ts) export listCardsForTarget อยู่แล้ว
//   UI (ภาพ 08 ซ้าย/กลาง): แท็บ ?tab=history ใน 360 — แถบกรองชนิด 9 ชิป + "ทั้งหมด" (นับจำนวนต่อชิป) · ช่วงเวลา (from/to) · สาขา (select) · ไทม์ไลน์: แต่ละแถว ไอคอน (MemberIcon) + จุดสีตาม kind + title + summary + เวลา (ไทย) + ลิงก์ไปต้นทาง (บิล/นัด/ห้องแชท/เอกสาร/การ์ด) · "โหลดเพิ่ม" (cursor) · ว่าง → "ยังไม่มีประวัติ"
//   testid: member-history member-history-filter member-history-chip-<key> member-history-range member-history-unit member-history-list member-history-row-<id> member-history-more member-history-empty
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/member/history.ts") || !existsSync("src/lib/modules/member/history-kinds.ts") || !/booking\.completed/.test(readFileSync("src/lib/modules/booking/service.ts", "utf8"))) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (member/history.ts · history-kinds.ts · booking.completed ใน booking/service.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const thai = (e: Error | null) => !!e && /[ก-๙]/.test(e.message);
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const P = prisma as Any;
let tid = ""; let SYS = ""; let PT = ""; let POS = ""; let BK = ""; let CH = "";
const tag = Date.now().toString(36);
const made = { customers: [] as string[], sales: [] as string[], appts: [] as string[], contacts: [] as string[], convs: [] as string[], msgs: [] as string[], boards: [] as string[], cards: [] as string[], crm: { contacts: [] as string[], deals: [] as string[], pipelines: [] as string[] }, orders: [] as string[], acts: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId; PT = scope.systems.POINT as string; POS = scope.systems.POS as string; BK = scope.systems.BOOKING as string; CH = scope.systems.CHAT as string;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const H = (await import("@/lib/modules/member/history" as string)) as Record<string, (...a: Any[]) => Any>;
  const HK = (await import("@/lib/modules/member/history-kinds" as string)) as Any;
  const M = (await import("@/lib/modules/member" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const PS = (await import("@/lib/modules/point" as string)) as Record<string, (...a: Any[]) => Any>;
  const pos = (await import("@/lib/modules/pos/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const booking = (await import("@/lib/modules/booking/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const crm = (await import("@/lib/modules/crm/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const kanban = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const klinks = (await import("@/lib/modules/kanban/links" as string)) as Record<string, (...a: Any[]) => Any>;
  const kmoves = (await import("@/lib/modules/kanban/moves" as string)) as Record<string, (...a: Any[]) => Any>;
  const sys = (await import("@/lib/modules/system/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const acc = (await import("@/lib/modules/account" as string)) as Record<string, (...a: Any[]) => Any>;
  const { emitOutboxOutsideTx, drainOutbox } = await import("@/lib/core/outbox");
  const { consumers: CONS } = (await import("@/lib/outbox-consumers" as string)) as Any;
  const drain = async () => { for (let i = 0; i < 4; i += 1) await drainOutbox(CONS, { limit: 300 }); };
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const owner = await actorOf(E.users.owner.userId);
  const thana = await actorOf(E.users.staff.thana.userId);
  const kata = await actorOf(E.users.staff.kata.userId);
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const acts = (cid: string, where: Any = {}) => P.memberActivity.findMany({ where: { tenantId: tid, customerId: cid, ...where }, orderBy: { createdAt: "asc" } });
  const one = async (cid: string, module: string, type: string, extra: Any = {}) => (await acts(cid, { module, type, ...extra })) as Any[];
  const mkCust = async (nm: string, unit = E.units.patong, extra: Any = {}) => { const c = await PR.createMember(ctx as Any, owner, { phone: `0855${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`, firstName: nm, lastName: "ประวัติ", source: "WALK_IN", homeUnitId: unit, ...extra }); made.customers.push(c.customerId); return c.customerId as string; };
  const buy = async (cid: string, satang: number, unit = E.units.patong) => { const s = await pos.createSale({ tenantId: tid, unitId: unit, systemId: POS, pointSystemId: PT, memberSystemId: SYS, memberId: cid, idempotencyKey: `h-${tag}-${cid.slice(-6)}-${satang}`, lines: [{ name: "คอร์สทดลอง", qty: 1, unitPriceSatang: satang }], payMethods: [{ type: "CASH", amountSatang: satang }] }); made.sales.push(s.saleId ?? s.id); return (s.saleId ?? s.id) as string; };
  // ระบบบัญชี + ลิงก์ POS (เหมือน M2.6) เพื่อให้ pos.sale.paid ออกใบเสร็จผูก party
  const accSvc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Any>;
  let accSys = await prisma.appSystem.findFirst({ where: { tenantId: tid, type: "ACCOUNT" as Any } });
  if (!accSys) { accSys = await sys.createSystem(tid, "ACCOUNT", "บัญชี (MB QC)"); for (const u of [E.units.patong, E.units.kata]) await sys.linkUnit(tid, accSys!.id, u); await accSvc.saveSettings(tid, accSys!.id, { orgPrefix: "บริษัท", orgName: "สยามไดฟ์ เมมเบอร์ คิวซี จำกัด", taxId: "0835565009999", branchCode: "00000", vatRegistered: false, vatRateBp: 700 }); await gl.ensureAccounting({ tenantId: tid, systemId: accSys!.id }); }
  const ACC = accSys!.id;
  if (!(await P.accountSystemLink.findFirst({ where: { tenantId: tid, systemId: ACC, linkedKind: "POS", linkedId: POS } }))) await P.accountSystemLink.create({ data: { tenantId: tid, systemId: ACC, linkedKind: "POS", linkedId: POS } });

  // ═══ S1 ทะเบียน · events ═══
  const kinds: Any[] = HK.HISTORY_KINDS;
  const consumers = read("src/lib/outbox-consumers.ts");
  const A2 = (await import("@/lib/automation/labels" as string)) as Any; const W2 = (await import("@/lib/webhooks/labels" as string)) as Any;
  const in3 = (e: string) => new RegExp(`"${e.replace(/\./g, "\\.")}":`).test(consumers) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === e && /[ก-๙]/.test(x.label)) && W2.WEBHOOK_EVENTS.filter((x: Any) => x.value === e).length === 1;
  chk("M3.7-S1.1", "HISTORY_KINDS 9 ตัว ลำดับ purchase/booking/chat/document/tier/loyalty/task/review/profile · label ไทย · kindOf({module:'pos'}) = purchase · kindOf({module:'member', type:'TIER_CHANGED'}) = tier · kindOf({module:'stamp'}) = loyalty · ไม่รู้จัก → profile/other ไม่ throw", kinds?.length === 9 && ["purchase", "booking", "chat", "document", "tier", "loyalty", "task", "review", "profile"].every((k, i) => kinds[i]?.key === k && /[ก-๙]/.test(kinds[i]?.label ?? "")) && HK.kindOf({ module: "pos", type: "PURCHASE" }) === "purchase" && HK.kindOf({ module: "member", type: "TIER_CHANGED" }) === "tier" && HK.kindOf({ module: "stamp", type: "STAMP_COMPLETED" }) === "loyalty" && typeof HK.kindOf({ module: "xyz", type: "Q" }) === "string", "9 kinds", `kinds=${kinds?.map((k) => k.key).join(",")} pos=${HK.kindOf?.({ module: "pos", type: "PURCHASE" })} tier=${HK.kindOf?.({ module: "member", type: "TIER_CHANGED" })}`);
  chk("M3.7-S1.2", "event ใหม่ 4 ตัว booking.completed / booking.no_show / crm.deal.won / shop.order.paid ลง 3 ทะเบียน + consumer · booking/service.ts emit ใน setAppointmentStatus · crm/service.ts#moveDeal emit · shop/service.ts#confirmOrderPaid emit", ["booking.completed", "booking.no_show", "crm.deal.won", "shop.order.paid"].every(in3) && /booking\.no_show/.test(read("src/lib/modules/booking/service.ts")) && /crm\.deal\.won/.test(read("src/lib/modules/crm/service.ts")) && /shop\.order\.paid/.test(read("src/lib/modules/shop/service.ts")), "ครบ", `reg=${["booking.completed", "booking.no_show", "crm.deal.won", "shop.order.paid"].filter((e) => !in3(e)).join(",") || "-"} bk=${/booking\.no_show/.test(read("src/lib/modules/booking/service.ts"))} crm=${/crm\.deal\.won/.test(read("src/lib/modules/crm/service.ts"))} shop=${/shop\.order\.paid/.test(read("src/lib/modules/shop/service.ts"))}`);

  // ═══ S2 consumers ═══
  const X = await mkCust("ไทม์ไลน์");
  const saleX = await buy(X, 455_000);
  await drain();
  const pur = await one(X, "pos", "PURCHASE", { refId: saleX });
  const hx = await H.listHistory(ctx, owner, X, { take: 50 });
  const docRow = hx?.items?.find((i: Any) => i.kind === "document");
  const purRow = hx?.items?.find((i: Any) => i.kind === "purchase" && i.ref?.id === saleX);
  chk("M3.7-S2.1", "pos.sale.paid → pos/PURCHASE refType PosSale data { netSatang 455000, receiptNo, pointsEarned ≥ 0 } unitId ป่าตอง · listHistory: แถว purchase title มี 'ซื้อ' + เลขบิล · ref { type PosSale, id } · read-through เอกสารบัญชี (ใบเสร็จของ party) kind document title มี docNo · data.totalSatang 455000", pur.length === 1 && pur[0].refType === "PosSale" && pur[0].data?.netSatang === 455_000 && !!pur[0].data?.receiptNo && typeof pur[0].data?.pointsEarned === "number" && pur[0].unitId === E.units.patong && !!purRow && /ซื้อ/.test(purRow.title ?? "") && purRow.ref?.type === "PosSale" && !!docRow && /[A-Z]{1,4}-?\d/.test(docRow.title ?? "") && docRow.data?.totalSatang === 455_000, "PURCHASE + เอกสาร", `pur=${JSON.stringify(pur[0]?.data)} n=${pur.length} purRow=${JSON.stringify({ t: purRow?.title, ref: purRow?.ref })} doc=${JSON.stringify({ t: docRow?.title, d: docRow?.data })}`);
  await pos.voidSale(tid, E.units.patong, saleX);
  await drain();
  const vd = await one(X, "pos", "PURCHASE_VOIDED", { refId: saleX });
  chk("M3.7-S2.2", "pos.sale.voided → pos/PURCHASE_VOIDED refId saleId data { netSatang, receiptNo } summary ไทยมี 'ยกเลิก'", vd.length === 1 && vd[0].data?.netSatang === 455_000 && /ยกเลิก/.test(vd[0].summary), "VOIDED", `n=${vd.length} ${JSON.stringify(vd[0]?.data)} s=${vd[0]?.summary}`);
  // booking: นัดใหม่ของ X แล้ว DONE / NO_SHOW
  const svc = await prisma.bookingService.findFirst({ where: { tenantId: tid, unitId: E.units.patong } });
  const staff = await prisma.bookingStaff.findFirst({ where: { tenantId: tid, unitId: E.units.patong } });
  const mkAppt = async (cid: string, dayOff: number) => { const d = new Date(Date.now() + dayOff * 86_400_000); const a = await prisma.appointment.create({ data: { tenantId: tid, unitId: E.units.patong, customerId: cid, staffId: staff!.id, serviceId: svc!.id, startAt: d, endAt: new Date(d.getTime() + 3600_000), status: "CONFIRMED", customerName: "ไทม์ไลน์", customerPhone: "0855000000", priceSatang: svc!.priceSatang ?? 0 } as Any }); made.appts.push(a.id); return a.id; };
  const a1 = await mkAppt(X, -1); const a2 = await mkAppt(X, -2);
  await booking.setAppointmentStatus(tid, E.units.patong, a1, "DONE");
  await booking.setAppointmentStatus(tid, E.units.patong, a1, "DONE");
  await booking.setAppointmentStatus(tid, E.units.patong, a2, "NO_SHOW");
  await drain();
  const ev1 = await P.outboxEvent.findMany({ where: { tenantId: tid, type: "booking.completed", payload: { path: ["appointmentId"], equals: a1 } } });
  const vis = await one(X, "booking", "VISIT", { refId: a1 });
  const ns = await one(X, "booking", "NO_SHOW", { refId: a2 });
  chk("M3.7-S2.3", "setAppointmentStatus DONE → event booking.completed {appointmentId, customerId} 1 ใบ (ซ้ำ = idempotent) DONE · consumer → booking/VISIT refType Appointment data { serviceName, staffName, startAt } unitId ป่าตอง · NO_SHOW → booking.no_show → booking/NO_SHOW data { serviceName } summary มี 'ไม่มาตามนัด'", ev1.length === 1 && ev1[0].status === "DONE" && ev1[0].payload?.customerId === X && vis.length === 1 && vis[0].refType === "Appointment" && !!vis[0].data?.serviceName && !!vis[0].data?.staffName && !!vis[0].data?.startAt && vis[0].unitId === E.units.patong && ns.length === 1 && /ไม่มาตามนัด/.test(ns[0].summary) && !!ns[0].data?.serviceName, "VISIT + NO_SHOW", `ev=${ev1.length}/${ev1[0]?.status} vis=${vis.length} ${JSON.stringify(vis[0]?.data)} ns=${ns.length} ${ns[0]?.summary}`);
  const bridges = read("src/lib/member-bridges.ts");
  chk("M3.7-S2.4", "booking.completed ใน bridges เรียกต่อ: stamp.autoStampFromVisit + point (CHECKIN) + reviews.requestReview (ถ้ามี · try/catch ไม่ล้ม consumer) · booking.no_show → journey trigger ได้ (AUTOMATION_EVENTS มี booking.no_show)", /autoStampFromVisit/.test(bridges) && /CHECKIN/.test(bridges) && /requestReview|review/.test(bridges) && A2.AUTOMATION_EVENTS.some((x: Any) => x.value === "booking.no_show"), "ต่อครบ", `stamp=${/autoStampFromVisit/.test(bridges)} checkin=${/CHECKIN/.test(bridges)} review=${/requestReview|review/.test(bridges)}`);
  // chat
  const contact = await prisma.chatContact.create({ data: { tenantId: tid, systemId: CH, channel: "LINE" as Any, externalUserId: `U-h-${tag}`, displayName: "ไทม์ไลน์ LINE", customerId: X } as Any });
  made.contacts.push(contact.id);
  const conv = await prisma.chatConversation.create({ data: { tenantId: tid, systemId: CH, channel: "LINE" as Any, contactId: contact.id, lastMessagePreview: "สนใจคอร์สครับ", lastMessageAt: new Date() } as Any });
  made.convs.push(conv.id);
  await emitOutboxOutsideTx({ tenantId: tid, type: "chat.contact.linked", idempotencyKey: `h-link-${tag}`, payload: { contactId: contact.id, customerId: X, channel: "LINE" }, systemId: CH });
  await emitOutboxOutsideTx({ tenantId: tid, type: "chat.message.received", idempotencyKey: `h-msg1-${tag}`, payload: { conversationId: conv.id, channel: "LINE" }, systemId: CH });
  await emitOutboxOutsideTx({ tenantId: tid, type: "chat.message.received", idempotencyKey: `h-msg2-${tag}`, payload: { conversationId: conv.id, channel: "LINE" }, systemId: CH });
  await drain();
  const lk = await one(X, "chat", "CHANNEL_LINKED");
  const msg = await one(X, "chat", "MESSAGE", { refId: conv.id });
  chk("M3.7-S2.5", "chat.contact.linked → chat/CHANNEL_LINKED data { channel LINE } · chat.message.received ×2 วันเดียวกัน (ห้องที่ผูกสมาชิก) → chat/MESSAGE 1 แถว refType ChatConversation data { channel, preview, count 2 } summary มี 'LINE'", lk.length === 1 && lk[0].data?.channel === "LINE" && msg.length === 1 && msg[0].refType === "ChatConversation" && msg[0].data?.channel === "LINE" && !!msg[0].data?.preview && msg[0].data?.count === 2 && /LINE/.test(msg[0].summary), "1 แถว/วัน", `lk=${lk.length} ${JSON.stringify(lk[0]?.data)} msg=${msg.length} ${JSON.stringify(msg[0]?.data)}`);
  // kanban: บอร์ด + การ์ดผูก PARTY → read-through · complete → แถว
  let kb = await prisma.appSystem.findFirst({ where: { tenantId: tid, type: "KANBAN" as Any } });
  if (!kb) { kb = await sys.createSystem(tid, "KANBAN", "บอร์ดงาน (MB QC)"); for (const u of [E.units.patong, E.units.kata]) await sys.linkUnit(tid, kb!.id, u); }
  const board = await kanban.createBoard({ tenantId: tid, systemId: kb!.id, name: `งานร้าน ${tag}`, unitId: null, createdById: owner.userId });
  const boardId = (board?.id ?? board?.boardId ?? board) as string; made.boards.push(boardId);
  const colsK = await P.kanbanColumn.findMany({ where: { boardId }, orderBy: { position: "asc" } });
  const doneCol = colsK.find((c: Any) => c.isDoneColumn) ?? colsK[colsK.length - 1];
  const card = await kanban.createCard({ tenantId: tid, systemId: kb!.id, columnId: colsK[0].id, title: "เคลมประกันอุปกรณ์", createdById: owner.userId });
  made.cards.push(card.id);
  const partyX = (await prisma.customer.findUnique({ where: { id: X }, select: { partyId: true } }))!.partyId!;
  const kctx = { tenantId: tid, systemId: kb!.id, actorUserId: owner.userId };
  await klinks.addLink(kctx, card.id, { linkType: "PARTY", linkId: partyX });
  const hOpen = await H.listHistory(ctx, owner, X, { kind: "task", take: 20 });
  const openRow = hOpen?.items?.find((i: Any) => i.data?.cardNo === card.cardNo || i.ref?.id === card.id);
  await kmoves.moveCard(kctx, { cardId: card.id, toColumnId: doneCol.id, position: 0 } as Any).catch(async () => { await P.kanbanCard.update({ where: { id: card.id }, data: { columnId: doneCol.id, completedAt: new Date() } }); await emitOutboxOutsideTx({ tenantId: tid, type: "kanban.card.completed", idempotencyKey: `h-kc-${tag}`, payload: { cardId: card.id, boardId, cardNo: card.cardNo, title: card.title }, systemId: kb!.id }); });
  await drain();
  const kc = await one(X, "kanban", "CARD_COMPLETED", { refId: card.id });
  chk("M3.7-S2.6", "การ์ดผูก PARTY ยังเปิด → listHistory kind task (read-through listCardsForTarget) title 'งานบอร์ด \"เคลมประกันอุปกรณ์\"' data { cardNo, boardName, columnName } · ย้ายเข้าคอลัมน์เสร็จ → kanban.card.completed → kanban/CARD_COMPLETED refType KanbanCard data { cardNo, title, boardName } summary มี 'ปิดแล้ว'", !!openRow && /เคลมประกันอุปกรณ์/.test(openRow.title ?? "") && !!openRow.data?.boardName && kc.length === 1 && kc[0].refType === "KanbanCard" && kc[0].data?.cardNo === card.cardNo && /ปิดแล้ว/.test(kc[0].summary), "task ทั้ง 2 แบบ", `open=${JSON.stringify({ t: openRow?.title, d: openRow?.data })} kc=${kc.length} ${kc[0]?.summary}`);
  // crm.deal.won
  let crmSys = await prisma.appSystem.findFirst({ where: { tenantId: tid, type: "CRM" as Any } });
  if (!crmSys) { crmSys = await sys.createSystem(tid, "CRM", "CRM (MB QC)"); for (const u of [E.units.patong]) await sys.linkUnit(tid, crmSys!.id, u); }
  const cctx = { tenantId: tid, systemId: crmSys!.id };
  const pipe = await crm.ensureCrm(cctx);
  const pipelineId = (pipe?.id ?? pipe?.pipelineId ?? pipe) as string;
  const stages = await P.crmStage.findMany({ where: { tenantId: tid, pipelineId }, orderBy: { position: "asc" } });
  const wonStage = stages.find((s: Any) => s.kind === "WON"); const openStage = stages.find((s: Any) => s.kind === "OPEN") ?? stages[0];
  const phoneX = (await prisma.customer.findUnique({ where: { id: X }, select: { phone: true } }))!.phone!;
  const cX = await P.crmContact.create({ data: { tenantId: tid, systemId: crmSys!.id, name: "ไทม์ไลน์ (CRM)", phone: phoneX, lifecycleStage: "LEAD" } }); made.crm.contacts.push(cX.id);
  const dX = await P.crmDeal.create({ data: { tenantId: tid, systemId: crmSys!.id, contactId: cX.id, pipelineId, stageId: openStage.id, title: "คอร์ส Advanced", valueSatang: 1_290_000, kind: "OPEN" } }); made.crm.deals.push(dX.id);
  await crm.moveDeal(cctx, dX.id, wonStage.id);
  const newPhone = `0855${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
  const cN = await P.crmContact.create({ data: { tenantId: tid, systemId: crmSys!.id, name: "ลูกค้าใหม่จาก CRM", phone: newPhone, lifecycleStage: "LEAD" } }); made.crm.contacts.push(cN.id);
  const dN = await P.crmDeal.create({ data: { tenantId: tid, systemId: crmSys!.id, contactId: cN.id, pipelineId, stageId: openStage.id, title: "ทริปดำน้ำ", valueSatang: 500_000, kind: "OPEN" } }); made.crm.deals.push(dN.id);
  await crm.moveDeal(cctx, dN.id, wonStage.id);
  await drain();
  const won = await one(X, "crm", "DEAL_WON", { refId: dX.id });
  const evW = await P.outboxEvent.findFirst({ where: { tenantId: tid, type: "crm.deal.won", payload: { path: ["dealId"], equals: dX.id } } });
  const custN = await prisma.customer.findFirst({ where: { tenantId: tid, memberSystemId: SYS, phone: newPhone } });
  if (custN) made.customers.push(custN.id);
  const cNrow = await P.crmContact.findUnique({ where: { id: cN.id } });
  const wonN = custN ? await one(custN.id, "crm", "DEAL_WON", { refId: dN.id }) : [];
  chk("M3.7-S2.7", "moveDeal → WON: event crm.deal.won {dealId, contactId, valueSatang, phone} DONE · contact เบอร์ตรง X → crm/DEAL_WON refType CrmDeal data { valueSatang 1290000, title } summary มี 'ดีล' · contact ไม่มีสมาชิก + มีเบอร์ → createMember source CRM (sourceDetail.crmContactId) · CrmContact.partyId = Customer.partyId · DEAL_WON ของคนใหม่ด้วย", !!evW && evW.status === "DONE" && evW.payload?.valueSatang === 1_290_000 && won.length === 1 && won[0].refType === "CrmDeal" && won[0].data?.valueSatang === 1_290_000 && /ดีล/.test(won[0].summary) && !!custN && custN.source === "CRM" && !!cNrow?.partyId && cNrow.partyId === custN.partyId && wonN.length === 1, "DEAL_WON + auto-link", `ev=${!!evW}/${evW?.status} won=${won.length} ${JSON.stringify(won[0]?.data)} custN=${custN?.source} party=${cNrow?.partyId === custN?.partyId} wonN=${wonN.length}`);
  // shop.order.paid (marketplace)
  const shopPhone = `0855${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
  const orderId = `so-${tag}`;
  const shopPayload = { orderId, unitId: E.units.patong, code: `SO-${tag.toUpperCase()}`, customerName: "ลูกค้า Shopee", customerPhone: shopPhone, totalSatang: 150_000, posSaleId: null, channel: "SHOPEE" };
  await emitOutboxOutsideTx({ tenantId: tid, type: "shop.order.paid", idempotencyKey: `h-shop1-${tag}`, payload: shopPayload, systemId: POS, unitId: E.units.patong });
  await drain();
  await emitOutboxOutsideTx({ tenantId: tid, type: "shop.order.paid", idempotencyKey: `h-shop2-${tag}`, payload: shopPayload, systemId: POS, unitId: E.units.patong });
  await drain();
  const custS = await prisma.customer.findFirst({ where: { tenantId: tid, memberSystemId: SYS, phone: shopPhone } });
  if (custS) made.customers.push(custS.id);
  const shopAct = custS ? await one(custS.id, "pos", "PURCHASE", { refId: orderId }) : [];
  const idS = custS ? await P.memberChannelIdentity.findFirst({ where: { customerId: custS.id, channel: "SHOPEE" } }) : null;
  const ledS = custS ? await prisma.pointLedger.findMany({ where: { customerId: custS.id, refType: "ShopOrder" as Any, refId: orderId } }) : [];
  chk("M3.7-S2.8", "shop.order.paid (SHOPEE · เบอร์ใหม่): สร้างสมาชิก source MARKETPLACE sourceChannel SHOPEE · MemberChannelIdentity channel SHOPEE externalId = เบอร์ · pos/PURCHASE refType ShopOrder refId orderId data { channel SHOPEE, code, netSatang 150000, pointsEarned } summary มี 'Shopee' · แต้ม ledger refType ShopOrder 1 แถว (computeEarn) · re-emit → ยัง 1 แถว 1 ledger", !!custS && custS.source === "MARKETPLACE" && custS.sourceChannel === "SHOPEE" && !!idS && idS.externalId === shopPhone && shopAct.length === 1 && shopAct[0].data?.channel === "SHOPEE" && shopAct[0].data?.netSatang === 150_000 && typeof shopAct[0].data?.pointsEarned === "number" && /Shopee/i.test(shopAct[0].summary) && ledS.length === 1 && ledS[0].delta === shopAct[0].data?.pointsEarned, "สมาชิก+แต้ม+แถว", `cust=${custS?.source}/${custS?.sourceChannel} id=${idS?.externalId === shopPhone} act=${shopAct.length} ${JSON.stringify(shopAct[0]?.data)} led=${ledS.length}/${ledS[0]?.delta}`);
  // loyalty rows
  const b0 = await PS.getBalance(PT, X);
  const e1 = await PS.earnWithLot({ tenantId: tid, systemId: PT, memberSystemId: SYS }, { customerId: X, points: 120, refType: "MANUAL", refId: `h-e-${tag}`, idempotencyKey: `h-e-${tag}` });
  await PS.burnFifo?.({ tenantId: tid, systemId: PT, memberSystemId: SYS }, { customerId: X, points: 20, refType: "MANUAL", refId: `h-b-${tag}`, idempotencyKey: `h-b-${tag}` }).catch(() => null);
  await drain(); await drain();
  const pe = await one(X, "point", "POINTS_EARNED", { refId: e1?.ledgerId ?? `h-e-${tag}` });
  const pe2 = (await acts(X, { module: "point", type: "POINTS_EARNED" })).filter((r: Any) => r.data?.points === 120);
  const pb = (await acts(X, { module: "point", type: "POINTS_BURNED" })).filter((r: Any) => r.data?.points === 20);
  const tierRows = await acts(m(2).id, { module: "member", type: "TIER_CHANGED" });
  chk("M3.7-S2.9", "point.earned (earnWithLot 120) → point/POINTS_EARNED data { points 120, refType, expiresAt } 1 แถว (drain 2 รอบไม่ซ้ำ) · point.burned (20) → POINTS_BURNED data { points 20 } · TIER_CHANGED ของสมาชิกที่เคยเลื่อนระดับ (seed) มี data { from, to, reason ไทยมีตัวเลข }", (pe.length + pe2.length) >= 1 && pe2.length === 1 && !!pe2[0].data?.refType && "expiresAt" in (pe2[0].data ?? {}) && pb.length <= 1 && (pb.length === 0 || pb[0].data?.points === 20) && (tierRows.length === 0 || tierRows.every((r: Any) => !!r.data?.from && !!r.data?.to && /[ก-๙]/.test(r.data?.reason ?? "") && /\d/.test(r.data?.reason ?? ""))) && (await PS.getBalance(PT, X)) >= b0 + 100, "loyalty rows", `pe=${pe2.length} ${JSON.stringify(pe2[0]?.data)} pb=${pb.length} tier=${tierRows.length} ${JSON.stringify(tierRows[0]?.data)}`);
  const ro1 = await H.recordOnce(ctx, { customerId: X, module: "review", type: "REVIEW_RECEIVED", refType: "MemberReview", refId: `h-rv-${tag}`, summary: "รีวิว 5 ดาว", data: { rating: 5 } });
  const ro2 = await H.recordOnce(ctx, { customerId: X, module: "review", type: "REVIEW_RECEIVED", refType: "MemberReview", refId: `h-rv-${tag}`, summary: "รีวิว 5 ดาว (ซ้ำ)", data: { rating: 5 } });
  const past = new Date(Date.now() - 40 * 86_400_000);
  const ro3 = await H.recordOnce(ctx, { customerId: X, module: "referral", type: "REFERRAL_CONVERTED", refType: "Referral", refId: `h-rf-${tag}`, summary: "แนะนำเพื่อนสำเร็จ", at: past, unitId: E.units.kata });
  chk("M3.7-S2.10", "recordOnce: ครั้งแรก created true · ซ้ำ (customerId+module+type+refId) → created false id เดิม · at ย้อนหลัง 40 วัน → createdAt = at · unitId กะตะ", ro1?.created === true && ro2?.created === false && ro2.id === ro1.id && ro3?.created === true && Math.abs(new Date((await P.memberActivity.findUnique({ where: { id: ro3.id } })).createdAt).getTime() - past.getTime()) < 5000, "idempotent", `${JSON.stringify(ro1)} ${JSON.stringify(ro2)}`);

  // ═══ S3 listHistory: กรอง / นับ / cursor ═══
  const all = await H.listHistory(ctx, owner, X, { take: 100 });
  const counts = all?.counts ?? {};
  const kindsSeen = new Set(all?.items?.map((i: Any) => i.kind));
  chk("M3.7-S3.1", "listHistory(X) ทั้งหมด: items เรียง at desc · ทุกแถวมี id/at/kind/module/type/title/summary · kind ครอบ purchase/booking/chat/document/task/loyalty/review/profile/crm(=purchase? — DEAL_WON อยู่ kind 'purchase' หรือ 'profile' ตามทะเบียน · ไม่ throw) · counts.all = items.length (≤ take) · counts ต่อ kind รวม = all", (all?.items?.length ?? 0) >= 12 && all.items.every((i: Any, k: number) => i.id && i.at && i.kind && i.module && i.type && i.title && (k === 0 || new Date(all.items[k - 1].at) >= new Date(i.at))) && ["purchase", "booking", "chat", "document", "task", "loyalty", "review", "profile"].every((k) => kindsSeen.has(k)) && counts.all === all.items.length && Object.entries(counts).filter(([k]) => k !== "all").reduce((s, [, v]) => s + Number(v), 0) === counts.all, "ครบทุก kind", `n=${all?.items?.length} kinds=${[...kindsSeen].join(",")} counts=${JSON.stringify(counts)}`);
  const onlyChat = await H.listHistory(ctx, owner, X, { kind: "chat", take: 50 });
  const onlyLoy = await H.listHistory(ctx, owner, X, { kind: "loyalty", take: 50 });
  const onlyBk = await H.listHistory(ctx, owner, X, { kind: "booking", take: 50 });
  chk("M3.7-S3.2", "กรอง kind: chat → เฉพาะ module chat (2 แถว: CHANNEL_LINKED + MESSAGE) · loyalty → เฉพาะ point/voucher/stamp… · booking → APPOINTMENT_BOOKED ×2 + VISIT + NO_SHOW = 4", onlyChat?.items?.length === 2 && onlyChat.items.every((i: Any) => i.module === "chat") && (onlyLoy?.items?.length ?? 0) >= 1 && onlyLoy.items.every((i: Any) => ["point", "voucher", "stamp", "reward", "giftcard", "wallet"].includes(i.module)) && onlyBk?.items?.length === 4 && onlyBk.items.every((i: Any) => i.module === "booking"), "กรองถูก", `chat=${onlyChat?.items?.length} loy=${onlyLoy?.items?.length} bk=${onlyBk?.items?.length}`);
  const rng = await H.listHistory(ctx, owner, X, { from: new Date(Date.now() - 60 * 86_400_000), to: new Date(Date.now() - 30 * 86_400_000), take: 50 });
  const unitK = await H.listHistory(ctx, owner, X, { unitId: E.units.kata, take: 50 });
  chk("M3.7-S3.3", "ช่วงเวลา 60→30 วันก่อน → เฉพาะ REFERRAL_CONVERTED (at 40 วัน) · unitId กะตะ → เฉพาะแถว unitId กะตะ (1)", rng?.items?.length === 1 && rng.items[0].type === "REFERRAL_CONVERTED" && unitK?.items?.length === 1 && unitK.items[0].type === "REFERRAL_CONVERTED", "กรองช่วง/สาขา", `rng=${rng?.items?.map((i: Any) => i.type).join(",")} unit=${unitK?.items?.map((i: Any) => i.type).join(",")}`);
  const p1 = await H.listHistory(ctx, owner, X, { take: 5 });
  const p2 = await H.listHistory(ctx, owner, X, { take: 5, cursor: p1?.nextCursor });
  const ids1 = new Set(p1?.items?.map((i: Any) => i.id));
  const eTake = await fails(() => H.listHistory(ctx, owner, X, { take: 500 }));
  chk("M3.7-S3.4", "cursor: หน้า 1 take 5 → nextCursor · หน้า 2 ไม่ซ้ำหน้า 1 และ at ≤ ตัวสุดท้ายหน้า 1 (read-through ผสานตามเวลา) · take 500 → throw ไทย หรือ clamp 100", p1?.items?.length === 5 && !!p1.nextCursor && (p2?.items?.length ?? 0) >= 1 && p2.items.every((i: Any) => !ids1.has(i.id) && new Date(i.at) <= new Date(p1.items[4].at)) && (thai(eTake) || eTake === null), "เดินหน้า", `p1=${p1?.items?.length} p2=${p2?.items?.length} dup=${p2?.items?.filter((i: Any) => ids1.has(i.id)).length}`);

  // ═══ S4 unit scope ═══
  const hThana = await H.listHistory(ctx, thana, X, { take: 100 });
  const eKata = await fails(() => H.listHistory(ctx, kata, X, { take: 10 }));
  const Y = await mkCust("กะตะ", E.units.kata);
  const hKataOwn = await H.listHistory(ctx, kata, Y, { take: 10 });
  chk("M3.7-S4.1", "thana (ป่าตอง) เห็นประวัติ X (home ป่าตอง) แต่ไม่เห็นแถว unitId กะตะ (REFERRAL_CONVERTED) · แถว unitId null ยังเห็น · พนักงานกะตะ ดู X → throw ไม่พบ (ไทย) · กะตะดูสมาชิก home กะตะ → ได้", (hThana?.items?.length ?? 0) >= 10 && !hThana.items.some((i: Any) => i.type === "REFERRAL_CONVERTED") && hThana.items.some((i: Any) => i.unit === null || i.unit?.id === E.units.patong) && thai(eKata) && Array.isArray(hKataOwn?.items), "scope ทำงาน", `thana=${hThana?.items?.length} hasKata=${hThana?.items?.some((i: Any) => i.type === "REFERRAL_CONVERTED")} eKata=${thai(eKata)}`);
  const m360 = await M.getMember360(ctx, owner, X);
  chk("M3.7-S4.2", "getMember360(X).history (หรือ recentActivity) ใช้ listHistory เดียวกัน (มี kind/title) · counters.visits นับ VISIT · facade member/index.ts export listHistory/recordOnce · history.ts import account/kanban ผ่าน facade (@/lib/modules/account · @/lib/modules/kanban/links) · fitness F2 มี member→account/kanban · ไม่มี any", (Array.isArray(m360?.history) ? m360.history.every((i: Any) => !!i.kind && !!i.title) : Array.isArray(m360?.recentActivity)) && ["listHistory", "recordOnce"].every((f) => new RegExp(`\\b${f}\\b`).test(read("src/lib/modules/member/index.ts"))) && /@\/lib\/modules\/account"/.test(read("src/lib/modules/member/history.ts")) && /@\/lib\/modules\/kanban\/links"/.test(read("src/lib/modules/member/history.ts")) && /member→account|member->account|\["member", "account"\]/.test(read("scripts/fitness.mts")) && !/:\s*any\b/.test(read("src/lib/modules/member/history.ts")), "ต่อครบ", `h=${Array.isArray(m360?.history)} idx=${["listHistory", "recordOnce"].filter((f) => !new RegExp(`\\b${f}\\b`).test(read("src/lib/modules/member/index.ts"))).join(",") || "-"} fit=${/member→account/.test(read("scripts/fitness.mts"))}`);

  // ═══ S5 perf ═══
  const Z = await mkCust("พันแถว");
  await P.memberActivity.createMany({ data: Array.from({ length: 1200 }, (_, i) => ({ tenantId: tid, customerId: Z, module: ["pos", "booking", "chat", "point"][i % 4], type: ["PURCHASE", "VISIT", "MESSAGE", "POINTS_EARNED"][i % 4], refType: "Perf", refId: `perf-${i}`, summary: `แถวทดสอบ ${i}`, data: { i }, unitId: i % 3 === 0 ? E.units.kata : E.units.patong, createdAt: new Date(Date.now() - i * 3600_000) })) });
  const t0 = Date.now(); const big = await H.listHistory(ctx, owner, Z, { take: 50 }); const t1 = Date.now();
  const bigF = await H.listHistory(ctx, owner, Z, { kind: "chat", from: new Date(Date.now() - 200 * 3600_000), take: 50 }); const t2 = Date.now();
  const plan = (await prisma.$queryRawUnsafe(`explain select * from "MemberActivity" where "customerId" = '${Z}' and "module" = 'chat' order by "createdAt" desc limit 50`)) as Any[];
  const planTxt = plan.map((r: Any) => r["QUERY PLAN"]).join("\n");
  chk("M3.7-S5.1", "1,200 แถว: listHistory take 50 < 600ms · กรอง kind+from < 600ms · counts.all = 1200 (+read-through 0) · EXPLAIN customerId+module order createdAt ใช้ Index Scan (index [customerId, module, createdAt])", big?.items?.length === 50 && t1 - t0 < 600 && bigF?.items?.length === 50 && t2 - t1 < 600 && big.counts?.all === 1200 && /Index (Only )?Scan/.test(planTxt) && !/Seq Scan on "?MemberActivity/.test(planTxt), "เร็ว+ใช้ index", `t=${t1 - t0}/${t2 - t1}ms n=${big?.items?.length} all=${big?.counts?.all} plan=${planTxt.split("\n")[0]?.slice(0, 80)}`, "MAJOR");
  chk("M3.7-S5.2", "consumer ทุกตัวของ M3.7 ห่อ try/catch (ต้นทางพัง เช่น สมาชิกถูกลบ → WARN แล้วปิด DONE ไม่ค้าง PENDING) · drain แล้ว event ทุกชนิดของร้าน QC ไม่ค้าง (PENDING/FAILED = 0 ยกเว้น chat.message.received ที่ไม่มี provider)", (await P.outboxEvent.count({ where: { tenantId: tid, status: { in: ["PENDING", "FAILED"] }, type: { in: ["pos.sale.paid", "pos.sale.voided", "booking.completed", "booking.no_show", "chat.contact.linked", "kanban.card.completed", "crm.deal.won", "shop.order.paid", "point.earned", "point.burned"] } } })) === 0 && /catch/.test(bridges), "คิวว่าง", `stuck=${await P.outboxEvent.count({ where: { tenantId: tid, status: { in: ["PENDING", "FAILED"] } } })}`);

  // ═══ S6 UI / ภาพ ═══
  const compDir = "src/components/member";
  const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => /history|timeline|Member360/i.test(f)).map((f) => read(`${compDir}/${f}`)).join("\n") : "";
  const page = read("src/app/app/sys/[id]/member/members/[memberId]/page.tsx");
  const allSrc = comps + page;
  const TIDS = ["member-history", "member-history-filter", "member-history-chip-", "member-history-range", "member-history-unit", "member-history-list", "member-history-row-", "member-history-more", "member-history-empty"];
  const missingT = TIDS.filter((t) => !allSrc.includes(t));
  const LABELS = ["ทั้งหมด", "ซื้อ", "จอง", "แชท", "เอกสาร", "ระดับ", "แต้ม/สิทธิ์", "งาน", "รีวิว/แนะนำ", "โปรไฟล์", "โหลดเพิ่ม", "ยังไม่มีประวัติ"];
  const missingL = LABELS.filter((l) => !allSrc.includes(l));
  chk("M3.7-S6.1", "แท็บประวัติใน 360: testid 9 · ชิป 9+ทั้งหมด (label จาก HISTORY_KINDS) · ช่วงเวลา · สาขา · โหลดเพิ่ม · ว่าง 'ยังไม่มีประวัติ' · ไม่มีอีโมจิ/hex (ไอคอน MemberIcon · สีผ่าน token) · ไม่มี 'เร็ว ๆ นี้' ที่แท็บ history", missingT.length === 0 && missingL.length === 0 && /HISTORY_KINDS|history-kinds/.test(allSrc) && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(comps.replace(/\/\/.*$/gm, "")) && !/#[0-9a-fA-F]{6}\b/.test(comps.replace(/\/\/.*$/gm, "")) && !/history[^\n]{0,80}เร็ว ๆ นี้/.test(allSrc), "ครบ", `tid-missing=${missingT.join(",") || "-"} labels-missing=${missingL.join(",") || "-"}`);
  const dir = `${mq.MQC.shotsDir}/3.7`;
  const sum = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sum(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const ok = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0 && !r(u, n, d)?.overflow;
  chk("M3.7-S6.2", "ภาพ 08: member-history-owner desktop+mobile 200 ไม่ล้น (TMP37 สมาชิก 1 มีเหตุการณ์ ≥ 8 ชนิด) · member-history-filter-owner desktop (คลิกชิป 'ซื้อ' → เฉพาะซื้อ) · member-history-thana desktop 200", ok("owner", "member-history-owner", "desktop") && ok("owner", "member-history-owner", "mobile") && ok("owner", "member-history-filter-owner", "desktop") && ok("thana", "member-history-thana", "desktop"), "200 ×4", `${r("owner", "member-history-owner", "desktop")?.status}/${r("owner", "member-history-owner", "mobile")?.status}/${r("owner", "member-history-filter-owner", "desktop")?.status}/${r("thana", "member-history-thana", "desktop")?.status} missing=${JSON.stringify(r("owner", "member-history-owner", "desktop")?.missing)}`);
  chk("M3.7-S6.3", "🔴 parity ภาพ 08 (ซ้าย/กลาง) — Fable ตรวจด้วยตา · wo-notes/member-M3.7.md มี 'PARITY: ผ่าน'", /^\s*-?\s*\*\*PARITY:\s*ผ่าน\*\*/m.test(read("ledger/wo-notes/member-M3.7.md")), "PARITY: ผ่าน", "ยังไม่ได้ตรวจภาพ", "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M3.7-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const r of restore) await d(r);
  if (made.cards.length) { await d(() => P.kanbanCardLink.deleteMany({ where: { cardId: { in: made.cards } } })); await d(() => P.kanbanActivity?.deleteMany?.({ where: { cardId: { in: made.cards } } })); }
  if (made.boards.length) { await d(() => P.kanbanCard.deleteMany({ where: { boardId: { in: made.boards } } })); await d(() => P.kanbanColumn.deleteMany({ where: { boardId: { in: made.boards } } })); await d(() => P.kanbanBoard.deleteMany({ where: { id: { in: made.boards } } })); }
  if (made.crm.deals.length) await d(() => P.crmDeal.deleteMany({ where: { id: { in: made.crm.deals } } }));
  if (made.crm.contacts.length) await d(() => P.crmContact.deleteMany({ where: { id: { in: made.crm.contacts } } }));
  if (made.convs.length) { await d(() => P.chatMessage.deleteMany({ where: { conversationId: { in: made.convs } } })); await d(() => P.chatConversation.deleteMany({ where: { id: { in: made.convs } } })); }
  if (made.contacts.length) await d(() => P.chatContact.deleteMany({ where: { id: { in: made.contacts } } }));
  if (made.appts.length) await d(() => prisma.appointment.deleteMany({ where: { id: { in: made.appts } } }));
  if (made.sales.length) { const docs = await P.accountDocument.findMany({ where: { tenantId: tid, refType: "PosSale", refId: { in: made.sales } }, select: { id: true } }).catch(() => [] as Any[]); const dIds = docs.map((x: Any) => x.id); if (dIds.length) { for (const mdl of ["accountDocumentPayment", "accountDocumentLine", "accountDocumentRelation"]) await d(() => P[mdl].deleteMany({ where: { OR: [{ documentId: { in: dIds } }, { fromId: { in: dIds } }, { toId: { in: dIds } }] } })); await d(() => P.accountJournalLine?.deleteMany?.({ where: { entry: { documentId: { in: dIds } } } })); await d(() => P.accountJournalEntry?.deleteMany?.({ where: { documentId: { in: dIds } } })); await d(() => P.accountDocument.deleteMany({ where: { id: { in: dIds } } })); } for (const mdl of ["posSalePayment", "posSaleLine", "posSaleItem"]) await d(() => P[mdl].deleteMany({ where: { saleId: { in: made.sales } } })); await d(() => P.stampEvent?.deleteMany?.({ where: { refId: { in: made.sales } } })); await d(() => prisma.posSale.deleteMany({ where: { id: { in: made.sales } } })); }
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    await d(() => P.voucher.deleteMany({ where: { customerId: { in: made.customers } } }));
    for (const mdl of ["memberNotification", "memberReview", "referral", "pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity", "stampProgress"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) { await d(() => P.accountContact.updateMany({ where: { partyId: { in: parties } }, data: { partyId: null } })); await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  for (const t of ["pos.", "booking.", "chat.", "kanban.", "crm.", "shop.", "point.", "member.", "account.", "review.", "referral."]) await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: t }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M3.7: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
