// ถ่ายภาพหน้าจอจริงของ "ระบบสมาชิก v2" (RUN Member System) — เดสก์ท็อป 1440×900 + มือถือ 390×844 (fullPage)
//
// ใช้:
//   bash scripts/acc-v2-serve.sh                       # production build บน .env.qc :3215 (ต้องมีก่อน)
//   pnpm exec tsx scripts/visual-member.mts 1.3        # ถ่ายชุดของ WO M1.3 (ดู SPECS ด้านล่าง)
//   pnpm exec tsx scripts/visual-member.mts 1.3 --user thana        # สายตา STAFF สาขาป่าตอง (default owner)
//   pnpm exec tsx scripts/visual-member.mts 2.9 --user customer:M-0001   # สายตาลูกค้า (/m/* · session ลูกค้า — มีตั้งแต่ M2.9)
//   pnpm exec tsx scripts/visual-member.mts path /app/sys/<sys>/member/members   # หน้าเดียวตามใจ
//   bash scripts/acc-v2-serve.sh stop
//
// 🔴 ชื่อไฟล์จงใจไม่ขึ้นต้น qc- (ต้อง build+server+chromium — ไม่เข้า qc:all)
// 🔴 session ที่ mint ต้องถูกลบเสมอ — ปักธง userAgent = "qc-visual-member" (ลบใน finally)
// 🔴 ชื่อคุกกี้ผูกกับ APP_ENV: http = `shark_session` · https = `__Host-shark_session`
// 🔴 ทุกบล็อก "เตรียมของ" ต่อ WO ต้องคืนสภาพใน restoreSeed() (อยู่ใน finally — พังกลางทางก็คืน)
// โครง/ขั้นตอน (Step) สืบทอดจาก scripts/visual-kanban.mts (K1.5–K3.9)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any };
const { MQC } = mq;
const { prisma } = await import("@/lib/core/db");
const { sha256 } = await import("@/lib/core/hash");

const argv = process.argv.slice(2);
const WO = argv[0] ?? "1.3";
const userKey = argv.includes("--user") ? argv[argv.indexOf("--user") + 1]! : "owner";
const isCustomer = userKey.startsWith("customer:");
const BASE = process.env.QC_BASE ?? "http://127.0.0.1:3215";
const OUT = `${MQC.shotsDir}/${WO}`;
mkdirSync(OUT, { recursive: true });
if (!existsSync(MQC.expectedPath)) { console.error(`❌ ไม่พบเฉลย ${MQC.expectedPath} — รัน seed ก่อน`); process.exit(2); }
const E = JSON.parse(readFileSync(MQC.expectedPath, "utf8"));
const SYS: string = E.systemId;
const MEMBER_BASE = `/app/sys/${SYS}/member`;

type Step =
  | { click: string }
  | { select: { on: string; value: string } }
  | { fill: string; value: string }
  | { press: string }
  | { waitFor: string; timeoutMs?: number }
  | { drag: { from: string; to: string; steps?: number } }
  | { dragBy: { on: string; dx: number; dy?: number; steps?: number } }
  | { wait: number }
  | { swipe: { on: string; dx: number } }
  | { upload: { on: string; filePath: string } }
  | { longPress: { on: string; ms?: number } }
  | { scrollTo: string };
type Spec = {
  name: string;
  path: string;
  note?: string;
  steps?: Step[];
  onlyDevice?: "desktop" | "mobile";
  expect?: string[];
  /** งานฝั่งข้อมูลก่อนสเปคนี้ (รันครั้งเดียวต่อสเปค) — ต้องคืนใน restoreSeed() */
  before?: () => Promise<void>;
};

// ── ของชั่วคราวต่อ WO (จำไว้คืนใน restoreSeed) ──
const TMP = { fieldIds: [] as string[], sectionIds: [] as string[], customerIds: [] as string[] };
const TMP12 = { linkedConv: "", unlinkedConv: "", contacts: [] as string[], convs: [] as string[] };
if (WO === "1.12") {
  const chatSys = E.systems.CHAT as string;
  // แผงสมาชิกในห้องแชทอ่านระบบสมาชิกจาก ChatSetting.memberSystemId (ตั้งที่หน้าตั้งค่าแชทในของจริง) — ชุดข้อมูล QC ต้องผูกไว้
  await (prisma as Any).chatSetting.upsert({ where: { systemId: chatSys }, update: { memberSystemId: SYS }, create: { tenantId: E.tenantId, systemId: chatSys, memberSystemId: SYS } }).catch(() => null);
  const P12 = prisma as Any;
  const m11 = E.members[10]; const m13 = E.members[12]; const c9 = await prisma.customer.findUnique({ where: { id: E.members[8].id } }) as Any;
  const mk = async (data: Record<string, unknown>, preview: string) => { const c = await prisma.chatContact.create({ data: { tenantId: E.tenantId, systemId: chatSys, channel: "WEBCHAT" as Any, externalUserId: `vis112-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...data } as Any }); TMP12.contacts.push(c.id); const v = await prisma.chatConversation.create({ data: { tenantId: E.tenantId, systemId: chatSys, channel: (data.channel as Any) ?? "WEBCHAT", contactId: c.id, lastMessagePreview: preview, lastMessageAt: new Date(), lastMessageDirection: "IN" as Any } as Any }); TMP12.convs.push(v.id); await P12.chatMessage.create({ data: { tenantId: E.tenantId, systemId: chatSys, conversationId: v.id, direction: "IN", type: "TEXT", body: preview } }).catch(() => null); return { c, v }; };
  const linked = await mk({ channel: "LINE", phone: m11.phone, displayName: "คุณสมชาย (บริษัท เอบีซี)" }, "สวัสดีครับ พอดีบริษัทอยากจัดทริปดำน้ำให้พนักงาน 12 คน ช่วง 24–26 ต.ค. ครับ");
  const M12 = (await import("@/lib/modules/member" as string)) as Any;
  await M12.linkContact({ tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId }, { contactId: linked.c.id }).catch(() => null);
  const unlinked = await mk({ channel: "WEBCHAT", phone: m13.phone, displayName: c9?.firstName ?? c9?.name ?? "สมชาย" }, "ขอใบเสนอราคาทริปสิมิลันครับ");
  TMP12.linkedConv = linked.v.id; TMP12.unlinkedConv = unlinked.v.id;
  console.log(`🧪 เตรียม 1.12: ห้องผูกแล้ว ${linked.v.id} (สมาชิก 11) · ห้องยังไม่ผูก ${unlinked.v.id} (เบอร์ตรงสมาชิก 13 · ชื่อคล้ายสมาชิก 9)`);
}
if (WO === "3.7") {
  const H37 = (await import("@/lib/modules/member/history" as string).catch(() => null)) as Any;
  if (H37?.recordOnce) {
    const ctx37 = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId };
    const c1 = E.members[0].id; const day = 86_400_000;
    const rows = [
      { module: "pos", type: "PURCHASE", refType: "PosSale", refId: `tmp37-sale`, summary: "ชำระเงิน ฿4,550 (ใบเสร็จ R-1042) · ได้ 45 แต้ม · ใช้ voucher ส่วนลด ฿300", data: { netSatang: 455_000, receiptNo: "R-1042", pointsEarned: 45, voucherUsed: 1 }, at: new Date(Date.now() - 1 * day) },
      { module: "booking", type: "VISIT", refType: "Appointment", refId: `tmp37-appt`, summary: "มาตามนัด จองเรือ Sea Fox · ครูเอก", data: { serviceName: "จองเรือ Sea Fox", staffName: "ครูเอก" }, at: new Date(Date.now() - 3 * day) },
      { module: "chat", type: "MESSAGE", refType: "ChatConversation", refId: `tmp37-conv`, summary: "แชท LINE: สนใจคอร์ส Advanced ครับ", data: { channel: "LINE", preview: "สนใจคอร์ส Advanced ครับ", count: 3 }, at: new Date(Date.now() - 4 * day) },
      { module: "account", type: "DOCUMENT", refType: "AccountDocument", refId: `tmp37-doc`, summary: "ใบเสนอราคา QT-2568-031 ฿12,900", data: { docType: "QUOTATION", docNo: "QT-2568-031", totalSatang: 1_290_000 }, at: new Date(Date.now() - 6 * day) },
      { module: "member", type: "TIER_CHANGED", refType: "MemberTierHistory", refId: `tmp37-tier`, summary: "เลื่อนระดับ Silver → Gold", data: { from: "Silver", to: "Gold", reason: "ยอดซื้อ 12 เดือน ฿24,500 ≥ ฿20,000" }, at: new Date(Date.now() - 8 * day) },
      { module: "point", type: "POINTS_EXPIRED", refType: "PointLot", refId: `tmp37-lot`, summary: "แต้มหมดอายุ 200 แต้ม", data: { points: 200 }, at: new Date(Date.now() - 12 * day) },
      { module: "kanban", type: "CARD_COMPLETED", refType: "KanbanCard", refId: `tmp37-card`, summary: "งานบอร์ด \"เคลมประกันอุปกรณ์\" ปิดแล้ว", data: { cardNo: 57, title: "เคลมประกันอุปกรณ์", boardName: "งานร้าน" }, at: new Date(Date.now() - 15 * day) },
      { module: "review", type: "REVIEW_RECEIVED", refType: "MemberReview", refId: `tmp37-rv`, summary: "รีวิว 5 ดาว: ครูสอนดีมาก", data: { rating: 5 }, at: new Date(Date.now() - 18 * day) },
      { module: "referral", type: "REFERRAL_CONVERTED", refType: "Referral", refId: `tmp37-rf`, summary: "แนะนำเพื่อนสำเร็จ · สมหญิง ซื้อครั้งแรก", data: {}, at: new Date(Date.now() - 22 * day) },
      { module: "booking", type: "NO_SHOW", refType: "Appointment", refId: `tmp37-appt2`, summary: "ไม่มาตามนัด ทริปดำน้ำเกาะพีพี", data: { serviceName: "ทริปดำน้ำเกาะพีพี" }, at: new Date(Date.now() - 30 * day) },
    ];
    for (const r of rows) await H37.recordOnce(ctx37, { customerId: c1, unitId: E.units.patong, ...r }).catch(() => null);
    console.log(`🧪 เตรียม 3.7: ไทม์ไลน์สมาชิก 1 = ${rows.length} รายการ 10 ชนิด`);
  }
}
const TMP35 = { code: "" };
if (WO === "3.5") {
  const R35 = (await import("@/lib/modules/member/referrals" as string).catch(() => null)) as Any;
  const PR35 = (await import("@/lib/modules/member/profile" as string).catch(() => null)) as Any;
  if (R35?.setProgram && PR35?.createMember) {
    const memO35 = await prisma.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId } });
    const ownerActor35 = { userId: E.users.owner.userId, role: memO35!.role, unitAccess: memO35!.unitAccess as string[], permissions: memO35!.permissions as Record<string, unknown> };
    const ctx35 = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId };
    await R35.setProgram(ctx35, ownerActor35, { enabled: true, convertOn: "SIGNUP", referrerRewardKind: "POINTS", referrerRewardValue: { points: 300 }, refereeRewardKind: "VOUCHER", refereeRewardValue: { kind: "FIXED", value: 100, validDays: 30 } }).catch(() => null);
    const code1 = (await R35.codeFor(ctx35, E.members[0].id))?.code ?? "";
    const code2 = (await R35.codeFor(ctx35, E.members[1].id))?.code ?? "";
    TMP35.code = code1;
    const names = ["สมหญิง", "วิชัย", "นภา", "ธีรพล", "อรุณ"];
    for (const [i, nm] of names.entries()) {
      await PR35.createMember(ctx35, ownerActor35, { phone: `0899${String(300000 + i)}`, firstName: nm, lastName: "ทดสอบ", source: "WALK_IN", homeUnitId: E.units.patong, referralCode: i < 3 ? code1 : code2 }).catch(() => null);
    }
    // ใบ REJECTED (แนะนำตัวเอง) + PENDING (ปิดโปรแกรมชั่วคราว)
    await R35.attach(ctx35, { refereeCustomerId: E.members[0].id, code: code1 }).catch(() => null);
    await R35.setProgram(ctx35, ownerActor35, { enabled: false }).catch(() => null);
    await PR35.createMember(ctx35, ownerActor35, { phone: "0899300009", firstName: "รอแปลง", lastName: "ทดสอบ", source: "WALK_IN", homeUnitId: E.units.patong, referralCode: code1 }).catch(() => null);
    await R35.setProgram(ctx35, ownerActor35, { enabled: true }).catch(() => null);
    console.log(`🧪 เตรียม 3.5: โปรแกรมเปิด · แนะนำ 6 ใบ (สำเร็จ 5 · รอ 1 · ปฏิเสธ 1) · code สมาชิก 1 = ${code1}`);
  }
}
const TMP34 = { token: "", usedToken: "" };
if (WO === "3.4") {
  const R34 = (await import("@/lib/modules/member/reviews" as string).catch(() => null)) as Any;
  if (R34?.requestReview) {
    process.env.SHARK_AI_MOCK = "1";
    const memO34 = await prisma.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId } });
    const ownerActor34 = { userId: E.users.owner.userId, role: memO34!.role, unitAccess: memO34!.unitAccess as string[], permissions: memO34!.permissions as Record<string, unknown> };
    const ctx34 = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId };
    const sales = await prisma.posSale.findMany({ where: { tenantId: E.tenantId, status: "PAID" as Any, memberId: { in: E.members.slice(0, 6).map((x: Any) => x.id) } }, orderBy: { createdAt: "asc" }, take: 6 });
    const ratings = [5, 2, 5, 4, 2, 5]; const bodies = ["ครูสอนดีมาก อุปกรณ์พร้อม แนะนำเลยครับ", "รอคิวรับอุปกรณ์นานเกินไป พนักงานดูวุ่นมาก", "ทริปดีมาก จุดดำน้ำสวย ทีมงานดูแลดี", "โดยรวมดี แต่เวลานัดคลาดเคลื่อนไปหน่อย", "อุปกรณ์เก่าไปหน่อย ชุดยางเริ่มขาด", "ครูใจเย็น สอนละเอียด ประทับใจมากค่ะ"];
    for (const [i, sl] of sales.entries()) {
      const rq = await R34.requestReview(ctx34, { customerId: sl.memberId, refType: "PosSale", refId: sl.id, unitId: sl.unitId }, { deps: { line: async () => ({ ok: true }) } }).catch(() => null);
      if (!rq?.token) continue;
      if (sl.memberId === E.members[0].id && !TMP34.token) { TMP34.token = rq.token; continue; } // เก็บ token ของสมาชิก 1 ไว้ถ่าย LIFF
      await R34.submitReview({ token: rq.token, rating: ratings[i] ?? 5, body: bodies[i] ?? "ดีมาก" }).catch(() => null);
    }
    await R34.reply(ctx34, ownerActor34, (await (prisma as Any).memberReview.findFirst({ where: { tenantId: E.tenantId, rating: 5, status: "NEW" } }))?.id ?? "-", { body: "ขอบคุณมากค่ะ แล้วพบกันใหม่นะคะ" }, { deps: { line: async () => ({ ok: true }) } }).catch(() => null);
    console.log(`🧪 เตรียม 3.4: รีวิว ${sales.length - 1} ใบ · token LIFF สมาชิก 1 = ${TMP34.token ? "มี" : "ไม่มี"}`);
  }
}
const TMP33 = { journeyId: "" };
if (WO === "3.3") {
  const J33 = (await import("@/lib/modules/member/journeys" as string).catch(() => null)) as Any;
  if (J33?.createFromPreset) {
    const memO33 = await prisma.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId } });
    const ownerActor33 = { userId: E.users.owner.userId, role: memO33!.role, unitAccess: memO33!.unitAccess as string[], permissions: memO33!.permissions as Record<string, unknown> };
    const ctx33 = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId };
    for (const k of ["birthday", "new_member", "inactive", "at_risk", "no_show", "review"]) { const j = await J33.createFromPreset(ctx33, ownerActor33, k).catch(() => null); if (j?.id && k === "inactive") TMP33.journeyId = j.id; }
    console.log(`🧪 เตรียม 3.3: journey สำเร็จรูป 6 · detail = ${TMP33.journeyId || "(ไม่มี)"}`);
  }
}
const TMP31 = { segmentId: "" };
if (WO === "3.1") {
  const S31 = (await import("@/lib/modules/member/segments" as string).catch(() => null)) as Any;
  if (S31?.saveSegment) {
    const memO3 = await prisma.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId } });
    const ownerActor3 = { userId: E.users.owner.userId, role: memO3!.role, unitAccess: memO3!.unitAccess as string[], permissions: memO3!.permissions as Record<string, unknown> };
    const seg = await S31.saveSegment({ tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId }, ownerActor3, { name: "Gold ที่ไม่มา 30 วัน", definition: { groups: [{ conditions: [{ field: "tier", op: "in", value: ["gold", "platinum"] }, { field: "inactiveDays", op: "gt", value: 30 }, { field: "consent.LINE", op: "eq", value: true }] }] }, scope: "TEAM" }).catch(() => null);
    if (seg?.id) TMP31.segmentId = seg.id;
    console.log(`🧪 เตรียม 3.1: segment ${TMP31.segmentId || "(สร้างไม่ได้)"}`);
  }
}
const TMP28 = { active: false };
if (WO === "2.8") {
  const PS28 = (await import("@/lib/modules/point" as string)) as Any;
  await PS28.earnWithLot({ tenantId: E.tenantId, systemId: E.systems.POINT, memberSystemId: SYS, actorUserId: E.users.owner.userId }, { customerId: E.members[0].id, points: 2340, refType: "QC", refId: `vis28-${Date.now()}`, idempotencyKey: `vis28-${Date.now()}` }).catch(() => null);
  TMP28.active = true;
  console.log("🧪 เตรียม 2.8: แต้ม 2,340 ให้สมาชิก 1 (แผงสิทธิ์ที่ POS)");
}
const TMP26 = { cards: [] as string[], sales: [] as string[], set0: null as Any };
if (WO === "2.6") {
  const G26 = (await import("@/lib/modules/giftcard" as string).catch(() => null)) as Any;
  if (G26?.sell) {
    const memO26 = await prisma.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId } });
    const ownerActor26 = { userId: E.users.owner.userId, role: memO26!.role, unitAccess: memO26!.unitAccess as string[], permissions: memO26!.permissions as Record<string, unknown> };
    const gctx = { tenantId: E.tenantId, systemId: SYS, posSystemId: E.systems.POS, actorUserId: E.users.owner.userId };
    TMP26.set0 = await G26.getSettings(gctx).catch(() => null);
    await G26.setSettings(gctx, ownerActor26, { enabled: true }).catch((e: Any) => console.error("settings", e?.message));
    const spec26 = [
      { satang: 200_000, buyer: E.members[0].id, recipient: { customerId: E.members[1].id }, message: "สุขสันต์วันเกิดนะ" },
      { satang: 100_000, buyer: E.members[2].id, recipient: { contact: { name: "คุณนภา", line: "napa.d" } } },
      { satang: 50_000, buyer: E.members[3].id, recipient: { print: true } },
      { satang: 300_000, buyer: E.members[4].id, recipient: { customerId: E.members[5].id } },
    ];
    for (const [i, sp] of spec26.entries()) {
      const r = await G26.sell(gctx, ownerActor26, { satang: sp.satang, buyerCustomerId: sp.buyer, recipient: sp.recipient, message: (sp as Any).message, payMethods: [{ type: "CASH", amountSatang: sp.satang }], unitId: E.units.patong, idempotencyKey: `vis26-${Date.now()}-${i}` }).catch((e: Any) => { console.error("sell", e?.message); return null; });
      if (r?.giftCardId) { TMP26.cards.push(r.giftCardId); if (r.saleId) TMP26.sales.push(r.saleId); }
    }
    // ใบที่ 4 ใช้ไปบางส่วน (สถานะ 'ใช้แล้วบางส่วน')
    if (TMP26.cards[3]) await (prisma as Any).giftCard.update({ where: { id: TMP26.cards[3] }, data: { balanceSatang: 120_000 } }).catch(() => null);
    console.log(`🧪 เตรียม 2.6: gift card ${TMP26.cards.length} ใบ`);
  }
}
const TMP27 = { active: false };
if (WO === "2.7") {
  const PS27 = (await import("@/lib/modules/point" as string)) as Any;
  await PS27.earnWithLot({ tenantId: E.tenantId, systemId: E.systems.POINT, memberSystemId: SYS, actorUserId: E.users.owner.userId }, { customerId: E.members[0].id, points: 1234, refType: "QC", refId: `vis27-${Date.now()}`, idempotencyKey: `vis27-${Date.now()}` }).catch(() => null);
  TMP27.active = true;
  console.log("🧪 เตรียม 2.7: แต้ม 1,234 ให้สมาชิก 1 (ดูแท็บกระเป๋า)");
}
const TMP24 = { rewardId: "", code: "" };
const TMP25 = { templateId: "" };
if (WO === "2.4" || WO === "2.5") {
  const memO2 = await prisma.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId } });
  const ownerActor2 = { userId: E.users.owner.userId, role: memO2!.role, unitAccess: memO2!.unitAccess as string[], permissions: memO2!.permissions as Record<string, unknown> };
  if (WO === "2.4") {
    const RV24 = (await import("@/lib/modules/reward" as string)) as Any;
    const PS24 = (await import("@/lib/modules/point" as string)) as Any;
    const rctx = { tenantId: E.tenantId, systemId: E.systems.REWARD, memberSystemId: SYS, pointSystemId: E.systems.POINT, actorUserId: E.users.owner.userId };
    const rw = await RV24.createRewardV2(rctx, ownerActor2, { name: "เสื้อยืด SHARK", kind: "ITEM", pointsCost: 800, stock: 12, tierDefIds: [], unitIds: [E.units.patong, E.units.kata], pickupDays: 14, showToCustomer: true, perMemberMonthly: 1 });
    TMP24.rewardId = rw.id;
    await PS24.earnWithLot({ tenantId: E.tenantId, systemId: E.systems.POINT, memberSystemId: SYS, actorUserId: E.users.owner.userId }, { customerId: E.members[0].id, points: 1000, refType: "QC", refId: `vis24-${Date.now()}`, idempotencyKey: `vis24-${Date.now()}` }).catch(() => null);
    const rd = await RV24.redeemV2(rctx, ownerActor2, { rewardId: rw.id, customerId: E.members[0].id, idempotencyKey: `vis24-${Date.now()}` });
    TMP24.code = rd.qrCode;
    console.log(`🧪 เตรียม 2.4: รางวัล ${rw.id} · รอรับ ${rd.redemptionId} (${rd.qrCode})`);
  }
  if (WO === "2.5") {
    const V25 = (await import("@/lib/modules/voucher" as string)) as Any;
    const vctx = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId };
    const tpl = await V25.createTemplate(vctx, ownerActor2, { name: "ส่วนลด ฿300 คอร์ส", kind: "FIXED", value: 30_000, config: { minSatang: 100_000, stackWithCoupon: false, unitIds: [] }, validDays: 30, origin: "MANUAL" });
    TMP25.templateId = tpl.id;
    await V25.issue(vctx, ownerActor2, { customerIds: E.members.slice(0, 8).map((x: Any) => x.id), templateId: tpl.id, origin: "MANUAL", originRef: { campaignId: `vis25-${Date.now()}` }, reason: "ชดเชยความล่าช้า" });
    console.log(`🧪 เตรียม 2.5: เทมเพลต ${tpl.id} + ใบ 8 ใบ`);
  }
}
const TMP23 = { cardId: "" };
if (WO === "2.3") {
  const ST23 = (await import("@/lib/modules/stamp" as string)) as Any;
  const memO = await prisma.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId } });
  const ownerActor23 = { userId: E.users.owner.userId, role: memO!.role, unitAccess: memO!.unitAccess as string[], permissions: memO!.permissions as Record<string, unknown> };
  const ctx23 = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId };
  const card = await ST23.createCard(ctx23, ownerActor23, { name: "ดำน้ำครบ 10 ไดฟ์ ฟรี 1", description: "ได้ตราเมื่อจองที่มาจริง", slots: 10, ruleKind: "PER_VISIT", ruleConfig: { serviceIds: [], perDayMax: 1, allowStaffScan: true, allowAutoFromSale: true, staffPin: "1234" }, rewardKind: "VOUCHER", rewardConfig: { templateId: null, note: "ดำน้ำฟรี 1 ไดฟ์" }, autoRestart: true, validMonths: 12, tierDefIds: [], unitIds: [] });
  TMP23.cardId = card.id;
  // ประทับ 7 ตราให้สมาชิก 1 ใช้ดูตัวอย่างการ์ดจริง (7/10 ตามภาพ 17) — perDayMax ไม่บังคับใน MANUAL refType? ใช้ count 7 ผ่าน perDayMax สูงชั่วคราวไม่ได้ → ใส่ตรงที่ DB
  const prog = await (prisma as Any).stampCardProgress.create({ data: { tenantId: E.tenantId, cardId: card.id, customerId: E.members[0].id, cycle: 1, stamps: 7, startedAt: new Date(), expiresAt: new Date(Date.now() + 365 * 86_400_000) } });
  await (prisma as Any).stampEvent.create({ data: { tenantId: E.tenantId, progressId: prog.id, type: "ADD", count: 7, refType: "MANUAL", byUserId: E.users.owner.userId, idempotencyKey: `vis23-${Date.now()}` } });
  console.log(`🧪 เตรียม 2.3: การ์ด ${card.id} (7/10 ของสมาชิก 1)`);
}
if (WO === "1.6") {
  mkdirSync(`${MQC.shotsDir}/1.6`, { recursive: true });
  writeFileSync(`${MQC.shotsDir}/1.6/fixture.csv`, "\uFEFFชื่อ,นามสกุล,เบอร์โทร,อีเมล,วันเกิด,ระดับใบรับรอง\nวิภา,นำเข้า,0898800001,wipa@example.com,1990-03-03,Open Water\nกิตติ,นำเข้า,0898800002,,1988-07-21,Advanced\nเบอร์ผิด,นำเข้า,12,,,\n");
  if (userKey === "owner") {
    const PR = (await import("@/lib/modules/member/profile" as string)) as Any;
    const mem = await prisma.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId } });
    const ownerActor = { userId: E.users.owner.userId, role: mem!.role, unitAccess: mem!.unitAccess as string[], permissions: mem!.permissions as Record<string, unknown> };
    const ctx = { tenantId: E.tenantId, systemId: SYS, actorUserId: E.users.owner.userId };
    for (const [i, phone] of [["1", "0898811001"], ["2", "0898811002"]] as const) { const r = await PR.createMember(ctx, ownerActor, { phone, firstName: "สมพงษ์", lastName: "ซ้ำเพื่อภาพ", source: "POS", homeUnitId: E.units.patong }); if (r?.customerId) TMP.customerIds.push(r.customerId); void i; }
    const PRd = PR as Any; await PRd.findDuplicates(ctx, ownerActor, {}).catch(() => null);
    console.log(`🧪 เตรียม 1.6: สมาชิกชื่อซ้ำ 2 คน ${TMP.customerIds.join(",")} + fixture.csv`);
  }
}

const SPECS: Record<string, Spec[]> = {
  // M1.5 — หน้ารวมสมาชิก (ภาพ 01) + สมาชิก 360 (ภาพ 02) · owner / thana (STAFF ป่าตอง — ส่วนสุขภาพต้อง "ซ่อน") / noperm (404)
  "1.5": [
    {
      name: `members-home-${userKey}`,
      path: `${MEMBER_BASE}/members`,
      note: userKey === "owner" ? "เทียบภาพ 01: KPI 6 · แถบกรอง (ค้นหา/ระดับ/สาขา/แท็ก/ฟิลด์กำหนดเอง) + มุมมองบันทึก · ตาราง 10 คอลัมน์ · bulk · เพิ่ม/นำเข้า" : userKey === "thana" ? "ธนาเห็นเฉพาะสมาชิกสาขาป่าตอง (KPI total ตาม scope)" : "ไม่มีสิทธิ์ member.* → 404",
      expect: userKey === "noperm" ? [] : ["[data-testid=members-page]", "[data-testid=members-kpi]", "[data-testid=members-filter]", "[data-testid=members-table]"],
      steps: userKey === "noperm" ? [{ wait: 800 }] : [{ waitFor: "[data-testid=members-table]" }, { wait: 500 }],
    },
    ...(userKey === "noperm" ? [] : [{
      name: `member-360-${userKey}`,
      path: `${MEMBER_BASE}/members/${E.members[0].id}`,
      note: userKey === "owner" ? "เทียบภาพ 02: หัว+ปุ่ม 5 · ตัวเลข 6 · แท็บ 5 · ส่วนตามเลย์เอาต์ (รวมสุขภาพเห็นค่า) · แถบขวา AI/การเชื่อมต่อ/PDPA/ระดับถัดไป" : "ธนา: ส่วนสุขภาพต้องเป็นกล่อง 'ซ่อน' (testid member-360-section-hidden) ไม่มีค่า",
      expect: ["[data-testid=member-360]", "[data-testid=member-360-header]", "[data-testid=member-360-tabs]", "[data-testid=member-360-stats]", ...(userKey === "thana" ? ["[data-testid=member-360-section-hidden]"] : [])],
      steps: [{ waitFor: "[data-testid=member-360]" }, { wait: 500 }],
    }]),
  ],
  // M1.6 — สมัคร (ภาพ 10) · นำเข้า 3 ขั้น (ภาพ 12) · ตัวซ้ำ/รวมคน (ภาพ 11)
  //   🔴 fixture CSV ต้องอยู่ใต้ /root ไม่ใช่ /tmp (chromium เป็น snap มี /tmp ส่วนตัว — reference_snap_chromium_headless)
  "1.6": [
    {
      name: `members-new-${userKey}`,
      path: `${MEMBER_BASE}/members/new`,
      note: userKey === "owner" ? "เทียบภาพ 10: ฟอร์มตามเลย์เอาต์ · ตรวจซ้ำสด · ที่มา · ผู้แนะนำ · ยินยอม · QR/ลิงก์ให้ลูกค้ากรอกเอง" : "ธนา (มี member.customer.create) เห็นฟอร์ม",
      expect: ["[data-testid=members-new-form]", "[data-testid=members-new-phone]", "[data-testid=members-new-consents]", "[data-testid=members-new-qr]"],
      steps: [{ waitFor: "[data-testid=members-new-form]" }, { wait: 500 }],
    },
    {
      name: `members-import-${userKey}`,
      path: `${MEMBER_BASE}/members/import`,
      onlyDevice: "desktop",
      note: userKey === "owner" ? "เทียบภาพ 12 ขั้น 1: อัปโหลด CSV" : "ธนา (ไม่มี member.customer.import) → 404",
      expect: userKey === "owner" ? ["[data-testid=members-import-step-1]", "[data-testid=members-import-upload]"] : [],
      steps: userKey === "owner" ? [{ waitFor: "[data-testid=members-import-upload]" }, { wait: 300 }] : [{ wait: 800 }],
    },
    ...(userKey === "owner" ? [
      { name: "members-import-mapping", path: `${MEMBER_BASE}/members/import`, onlyDevice: "desktop" as const, note: "อัปโหลด fixture.csv → ขั้น 2 ตาราง mapping (autoMapping + dropdown ฟิลด์)", expect: ["[data-testid=members-import-step-2]", "[data-testid=members-import-mapping]", "[data-testid=members-import-dup-option]"], steps: [{ waitFor: "[data-testid=members-import-upload]" }, { upload: { on: "[data-testid=members-import-upload] input[type=file], input[type=file]", filePath: `${process.cwd()}/${MQC.shotsDir}/1.6/fixture.csv` } }, { waitFor: "[data-testid=members-import-step-1] [data-testid=members-import-next]:not([disabled])", timeoutMs: 15_000 }, { wait: 300 }, { click: "[data-testid=members-import-step-1] [data-testid=members-import-next]" }, { waitFor: "[data-testid=members-import-mapping]", timeoutMs: 15_000 }, { wait: 400 }] },
      { name: "members-import-preview", path: `${MEMBER_BASE}/members/import`, onlyDevice: "desktop" as const, note: "ขั้น 3 ตรวจแถว ok/warn/err + ตัวเลือกซ้ำ", expect: ["[data-testid=members-import-step-3]", "[data-testid=members-import-preview]", "[data-testid=members-import-run]"], steps: [{ waitFor: "[data-testid=members-import-upload]" }, { upload: { on: "[data-testid=members-import-upload] input[type=file], input[type=file]", filePath: `${process.cwd()}/${MQC.shotsDir}/1.6/fixture.csv` } }, { waitFor: "[data-testid=members-import-step-1] [data-testid=members-import-next]:not([disabled])", timeoutMs: 15_000 }, { wait: 300 }, { click: "[data-testid=members-import-step-1] [data-testid=members-import-next]" }, { waitFor: "[data-testid=members-import-mapping]", timeoutMs: 15_000 }, { wait: 300 }, { click: "[data-testid=members-import-step-2] [data-testid=members-import-next]" }, { waitFor: "[data-testid=members-import-preview]", timeoutMs: 20_000 }, { wait: 400 }] },
      { name: "members-duplicates-owner", path: `${MEMBER_BASE}/members/duplicates`, onlyDevice: "desktop" as const, note: "เทียบภาพ 11: รายการคู่ที่สงสัย (เหตุผล/คะแนน)", expect: ["[data-testid=members-dup-list]"], steps: [{ waitFor: "[data-testid=members-dup-list]" }, { wait: 400 }] },
      { name: "members-dup-compare", path: `${MEMBER_BASE}/members/duplicates`, onlyDevice: "desktop" as const, note: "คลิกคู่แรก → เปรียบเทียบข้างกัน เลือกค่าต่อฟิลด์ + ปุ่มรวม 2 ขั้น", expect: ["[data-testid=members-dup-compare]", "[data-testid=members-dup-merge]"], steps: [{ waitFor: "[data-testid=members-dup-list]" }, { click: "[data-testid^=members-dup-pair-]" }, { waitFor: "[data-testid=members-dup-compare]", timeoutMs: 15_000 }, { wait: 400 }] },
    ] : []),
  ],
  // M2.2 — ตั้งค่าแต้ม (ภาพ 16) + ledger รวม + ปรับมือ + ใกล้หมดอายุ
  "2.2": [
    { name: `points-settings-${userKey}`, path: `${MEMBER_BASE}/points/settings`, note: userKey === "owner" ? "เทียบภาพ 16: (ก) กฎการได้แต้ม + ตารางกฎเพิ่ม 5 แถว · (ข) หมดอายุ · (ค) ใช้แต้ม · (ง) โอน · (จ) ปรับมือ · การ์ดผลกระทบ" : "ธนา → 404", expect: userKey === "owner" ? ["[data-testid=points-settings]", "[data-testid=points-settings-earn]", "[data-testid=points-settings-rules]", "[data-testid=points-settings-expiry]", "[data-testid=points-settings-impact]"] : [], steps: userKey === "owner" ? [{ waitFor: "[data-testid=points-settings]" }, { wait: 500 }] : [{ wait: 800 }] },
    ...(userKey === "owner" ? [
      { name: "points-home-owner", path: `${MEMBER_BASE}/points`, onlyDevice: "desktop" as const, note: "ledger รวม + KPI + ตัวกรอง", expect: ["[data-testid=points-page]", "[data-testid=points-kpi]", "[data-testid=points-ledger]"], steps: [{ waitFor: "[data-testid=points-ledger]" }, { wait: 400 }] },
      { name: "points-adjust-owner", path: `${MEMBER_BASE}/points/adjust`, onlyDevice: "desktop" as const, note: "ฟอร์มปรับแต้มมือ + คำเตือนต้องอนุมัติ", expect: ["[data-testid=points-adjust]", "[data-testid=points-adjust-form]"], steps: [{ waitFor: "[data-testid=points-adjust-form]" }, { wait: 300 }] },
      { name: "points-expiring-owner", path: `${MEMBER_BASE}/points/expiring`, onlyDevice: "desktop" as const, note: "ตารางแต้มใกล้หมดอายุ", expect: ["[data-testid=points-expiring]", "[data-testid=points-expiring-table]"], steps: [{ waitFor: "[data-testid=points-expiring]" }, { wait: 300 }] },
    ] : []),
  ],
  // M1.12 — แผงข้าง "สมาชิก" ในห้องแชท (ภาพ 26) + มือถือ (28ก/ข) — ห้องเตรียมไว้ใน TMP12 (ลบใน restoreSeed)
  "1.12": [
    { name: "chat-member-linked", path: `/app/sys/${E.systems.CHAT}/chat?c=${TMP12.linkedConv}`, note: "เทียบภาพ 26 สถานะ 1: แผงขวา สมาชิก (ชื่อ/ระดับ/รหัส/เปิดโปรไฟล์ 360 · ตัวเลข 4 · ช่องทางที่ผูก · ปุ่มด่วน 4 · สิทธิ์ · ประวัติ · ฟิลด์ที่ร้านตั้ง)", expect: ["[data-testid=chat-member-panel]", "[data-testid=chat-member-brief]", "[data-testid=chat-member-channels]", "[data-testid=chat-member-actions]"], steps: [{ waitFor: "[data-testid=chat-member-panel]", timeoutMs: 20_000 }, { wait: 600 }] },
    { name: "chat-member-unlinked", path: `/app/sys/${E.systems.CHAT}/chat?c=${TMP12.unlinkedConv}`, onlyDevice: "desktop", note: "เทียบภาพ 26 สถานะ 2: ยังไม่ผูก — candidates ชื่อคล้าย (เลือก) · สมัครใหม่จากแชท · พบคนเดียวกัน (เบอร์ตรง) → ผูกรวม", expect: ["[data-testid=chat-member-panel]", "[data-testid=chat-member-candidates]", "[data-testid=chat-member-register]", "[data-testid=chat-member-merge-hint]"], steps: [{ waitFor: "[data-testid=chat-member-panel]", timeoutMs: 20_000 }, { wait: 600 }] },
  ],
  // M1.11 — ตั้งค่า API (ภาพ 27 ครึ่งขวา): คีย์ 3 ชุดสิทธิ์ · curl · manifest/OpenAPI · webhook
  "1.11": [
    {
      name: `settings-api-${userKey}`,
      path: `${MEMBER_BASE}/settings/api`,
      onlyDevice: "desktop",
      note: userKey === "owner" ? "เทียบภาพ 27 ขวา: คีย์ API 3 ชุดสิทธิ์ · ตัวอย่าง curl · ลิงก์ manifest/OpenAPI · webhook" : "ธนา → 404",
      expect: userKey === "owner" ? ["[data-testid=member-api-page]", "[data-testid=member-api-keys]", "[data-testid=member-api-curl]", "[data-testid=member-api-webhooks]"] : [],
      steps: userKey === "owner" ? [{ waitFor: "[data-testid=member-api-page]" }, { wait: 400 }] : [{ wait: 800 }],
    },
  ],
  // M3.8 — รายงานสมาชิก (ภาพ 25)
  "3.8": [
    ...(userKey === "owner" ? [
      { name: "reports-owner", path: `${MEMBER_BASE}/reports`, note: "เทียบภาพ 25: แท็บ 7 · KPI 6 · กราฟสมาชิกใหม่ 12 แท่ง · RFM 3×3 · การ์ดระดับ/แต้ม/โปรโมชัน · ปุ่ม CSV/ตั้งเวลา", expect: ["[data-testid=reports-page]", "[data-testid=reports-tabs]", "[data-testid=reports-kpi]", "[data-testid=reports-chart-new]", "[data-testid=reports-rfm-grid]", "[data-testid=reports-tiers]", "[data-testid=reports-points]", "[data-testid=reports-promotions]", "[data-testid=reports-export]", "[data-testid=reports-schedule]"], steps: [{ waitFor: "[data-testid=reports-rfm-grid]" }, { wait: 600 }] },
      { name: "reports-rfm-owner", path: `${MEMBER_BASE}/reports?tab=rfm`, onlyDevice: "desktop" as const, note: "แท็บ RFM: กริด 9 ช่อง + คำอธิบาย", expect: ["[data-testid=reports-rfm-grid]", "[data-testid=reports-rfm-cell-champions]", "[data-testid=reports-rfm-cell-lost]"], steps: [{ waitFor: "[data-testid=reports-rfm-grid]" }, { wait: 400 }] },
      { name: "reports-cohort-owner", path: `${MEMBER_BASE}/reports?tab=cohort`, onlyDevice: "desktop" as const, note: "แท็บ cohort รายเดือน", expect: ["[data-testid=reports-cohort]"], steps: [{ waitFor: "[data-testid=reports-cohort]" }, { wait: 400 }] },
      { name: "reports-schedule-owner", path: `${MEMBER_BASE}/reports`, onlyDevice: "desktop" as const, note: "กดตั้งเวลาส่งอีเมล → ฟอร์ม (อีเมล · ชั่วโมง · แท็บ · สวิตช์)", expect: ["[data-testid=reports-schedule-form]"], steps: [{ waitFor: "[data-testid=reports-schedule]" }, { click: "[data-testid=reports-schedule]" }, { waitFor: "[data-testid=reports-schedule-form]" }, { wait: 400 }] },
    ] : userKey === "noperm" ? [
      { name: "reports-noperm", path: `${MEMBER_BASE}/reports`, onlyDevice: "desktop" as const, note: "ไม่มีสิทธิ์ → 404", expect: [], steps: [{ wait: 800 }] },
    ] : []),
  ],
  // M3.7 — แท็บประวัติ (ภาพ 08 ซ้าย/กลาง) — TMP37 ไทม์ไลน์สมาชิก 1 10 ชนิด
  "3.7": [
    ...(userKey === "owner" ? [
      { name: "member-history-owner", path: `${MEMBER_BASE}/members/${E.members[0].id}?tab=history`, note: "เทียบภาพ 08: ชิปกรอง 9+ทั้งหมด (นับ) · ช่วงเวลา · สาขา · ไทม์ไลน์ 10 ชนิด ไอคอน+จุดสี · ลิงก์ต้นทาง", expect: ["[data-testid=member-history]", "[data-testid=member-history-filter]", "[data-testid=member-history-list]", "[data-testid=member-history-chip-purchase]"], steps: [{ waitFor: "[data-testid=member-history-list]" }, { wait: 600 }] },
      { name: "member-history-filter-owner", path: `${MEMBER_BASE}/members/${E.members[0].id}?tab=history`, onlyDevice: "desktop" as const, note: "คลิกชิป 'ซื้อ' → เฉพาะรายการซื้อ", expect: ["[data-testid=member-history-list]"], steps: [{ waitFor: "[data-testid=member-history-chip-purchase]" }, { click: "[data-testid=member-history-chip-purchase]" }, { wait: 1200 }] },
    ] : userKey === "thana" ? [
      { name: "member-history-thana", path: `${MEMBER_BASE}/members/${E.members[0].id}?tab=history`, onlyDevice: "desktop" as const, note: "พนักงานป่าตองเห็นประวัติสมาชิกป่าตอง", expect: ["[data-testid=member-history]"], steps: [{ waitFor: "[data-testid=member-history]" }, { wait: 500 }] },
    ] : []),
  ],
  // M3.6 — การแจ้งเตือนสมาชิก (ภาพ 30)
  "3.6": [
    ...(userKey === "owner" ? [
      { name: "notifications-owner", path: `${MEMBER_BASE}/settings/notifications`, note: "เทียบภาพ 30: ตาราง 8 แถว × ชิป 4 ช่อง · ส่งเมื่อ · สถานะ · แถบสรุปเดือนนี้", expect: ["[data-testid=notif-page]", "[data-testid=notif-table]", "[data-testid=notif-row-WELCOME]", "[data-testid=notif-row-REVIEW_REQUEST]", "[data-testid=notif-month-summary]"], steps: [{ waitFor: "[data-testid=notif-table]" }, { wait: 500 }] },
      { name: "notifications-edit-owner", path: `${MEMBER_BASE}/settings/notifications`, onlyDevice: "desktop" as const, note: "คลิกแถว 'แต้มใกล้หมดอายุ' → แผงขวา: แท็บ 4 ช่อง · ข้อความ+ตัวแปร · ตัวอย่างบับเบิล LINE · 30/7 วันก่อน · quiet/consent · ทดสอบ/บันทึก", expect: ["[data-testid=notif-panel]", "[data-testid=notif-panel-tabs]", "[data-testid=notif-panel-body]", "[data-testid=notif-vars]", "[data-testid=notif-preview]", "[data-testid=notif-lead-days]", "[data-testid=notif-quiet]", "[data-testid=notif-consent]", "[data-testid=notif-test-send]", "[data-testid=notif-save]"], steps: [{ waitFor: "[data-testid=notif-row-POINTS_EXPIRING]" }, { click: "[data-testid=notif-row-POINTS_EXPIRING]" }, { waitFor: "[data-testid=notif-preview]" }, { wait: 600 }] },
    ] : userKey === "thana" ? [
      { name: "notifications-thana", path: `${MEMBER_BASE}/settings/notifications`, onlyDevice: "desktop" as const, note: "พนักงานไม่มี settings.manage → 403/redirect", expect: [], steps: [{ wait: 800 }] },
    ] : []),
  ],
  // M3.5 — แนะนำเพื่อน (ภาพ 24 · 08 ขวา · LIFF) — TMP35 โปรแกรม + 6 ใบ
  "3.5": [
    ...(userKey === "owner" ? [
      { name: "referrals-owner", path: `${MEMBER_BASE}/referrals`, note: "เทียบภาพ 24: ซ้าย ตั้งค่า (สวิตช์/รางวัล/ขั้นต่ำ/cap/กันโกง/ข้อความแชร์/ลิงก์) · ขวา KPI 4 · ผู้แนะนำสูงสุด · การแนะนำล่าสุด (รอ/สำเร็จ/ถูกปฏิเสธ)", expect: ["[data-testid=referrals-page]", "[data-testid=referrals-settings]", "[data-testid=referrals-kpi]", "[data-testid=referrals-leaderboard]", "[data-testid=referrals-recent]"], steps: [{ waitFor: "[data-testid=referrals-recent]" }, { wait: 600 }] },
      { name: "member-referrals-owner", path: `${MEMBER_BASE}/members/${E.members[0].id}?tab=referrals`, onlyDevice: "desktop" as const, note: "เทียบภาพ 08 ขวา: การ์ดแนะนำเพื่อน (โค้ด · ลิงก์ LINE · แนะนำแล้ว/สำเร็จ/แต้มที่ได้ · ต้นไม้)", expect: ["[data-testid=member-referrals-tab]", "[data-testid=member-referral-card]", "[data-testid=member-referral-code]", "[data-testid=member-referral-tree]"], steps: [{ waitFor: "[data-testid=member-referral-card]" }, { wait: 500 }] },
      ...(TMP35.code ? [{ name: "r-landing", path: `/r/${TMP35.code}`, onlyDevice: "mobile" as const, note: "/r/<code> → LIFF join/login พร้อม ?ref=", expect: [], steps: [{ wait: 1200 }] }] : []),
    ] : []),
    ...(isCustomer ? [
      { name: "m-referral", path: `/m/${MQC.tenantSlug}/referral`, onlyDevice: "mobile" as const, note: "LIFF แชร์: โค้ด · QR · ปุ่มแชร์ LINE · สถิติของฉัน", expect: ["[data-testid=m-referral]", "[data-testid=m-referral-code]", "[data-testid=m-referral-share]", "[data-testid=m-referral-stats]"], steps: [{ waitFor: "[data-testid=m-referral]" }, { wait: 400 }] },
    ] : []),
  ],
  // M3.4 — รีวิว (ภาพ 23 · 08 ขวา · LIFF) — TMP34 รีวิว 5 ใบ + token ของสมาชิก 1
  "3.4": [
    ...(userKey === "owner" ? [
      { name: "reviews-owner", path: `${MEMBER_BASE}/reviews`, note: "เทียบภาพ 23: KPI 4 · ตัวกรอง · รายการรีวิว (ดาว/ชื่อ/บริการ/ข้อความ/ป้ายเปิดการ์ด/กล่องตอบ+AI) · AI สรุป · ตั้งค่า", expect: ["[data-testid=reviews-page]", "[data-testid=reviews-kpi]", "[data-testid=reviews-filter]", "[data-testid=reviews-list]", "[data-testid=reviews-ai-summary]", "[data-testid=reviews-settings]"], steps: [{ waitFor: "[data-testid=reviews-list]" }, { wait: 600 }] },
      { name: "member-reviews-owner", path: `${MEMBER_BASE}/members/${E.members[1].id}?tab=reviews`, onlyDevice: "desktop" as const, note: "เทียบภาพ 08 ขวา: แท็บรีวิวใน 360 + กล่องรีวิวร้าน (เฉลี่ย/แจกแจง/รีวิวล่าสุด/ป้ายเปิดการ์ด)", expect: ["[data-testid=member-reviews-tab]", "[data-testid=member-reviews-summary]"], steps: [{ waitFor: "[data-testid=member-reviews-tab]" }, { wait: 500 }] },
      { name: "m-review-invalid", path: `/m/${MQC.tenantSlug}/review/not-a-real-token-00000000000000`, onlyDevice: "mobile" as const, note: "token มั่ว → 404 หรือข้อความไทย", expect: [], steps: [{ wait: 800 }] },
    ] : []),
    ...(isCustomer && TMP34.token ? [
      { name: "m-review", path: `/m/${MQC.tenantSlug}/review/${TMP34.token}`, onlyDevice: "mobile" as const, note: "LIFF เขียนรีวิว: ดาว 5 · ข้อความ · รูป ≤ 3 · ปุ่มส่ง", expect: ["[data-testid=m-review]", "[data-testid=m-review-stars]", "[data-testid=m-review-submit]"], steps: [{ waitFor: "[data-testid=m-review]" }, { wait: 400 }] },
      { name: "m-review-thanks", path: `/m/${MQC.tenantSlug}/review/${TMP34.token}`, onlyDevice: "mobile" as const, note: "กดดาว 5 + ส่ง → ขอบคุณ + แต้มที่ได้", expect: ["[data-testid=m-review-thanks]"], steps: [{ waitFor: "[data-testid=m-review-stars]" }, { click: "[data-testid=m-review-stars] button:last-child" }, { click: "[data-testid=m-review-submit]" }, { waitFor: "[data-testid=m-review-thanks]", timeoutMs: 15_000 }, { wait: 500 }] },
      { name: "m-review-done", path: `/m/${MQC.tenantSlug}/review/${TMP34.token}`, onlyDevice: "mobile" as const, note: "token ใช้แล้ว → หน้า 'รีวิวไปแล้ว'", expect: ["[data-testid=m-review-done]"], steps: [{ waitFor: "[data-testid=m-review-done]", timeoutMs: 15_000 }, { wait: 300 }] },
    ] : []),
  ],
  // M3.3 — journey (ภาพ 07 บน · 22) — TMP33 journey สำเร็จรูป 6
  "3.3": [
    {
      name: `journeys-${userKey}`,
      path: `${MEMBER_BASE}/journeys`,
      note: userKey === "owner" ? "เทียบภาพ 07 บน: builder ประโยค (เมื่อ/และถ้า/ให้ทำ/และ) + ทดลองรัน/บันทึก · ตาราง Journey ที่เปิดใช้อยู่ (ส่ง/ใช้/ยอด/ต้นทุน/ROI/toggle) · ป้าย holdout" : userKey === "thana" ? "ธนา read-โดยนัย" : "404",
      expect: userKey === "noperm" ? [] : ["[data-testid=journeys-page]", "[data-testid=journeys-table]", ...(userKey === "owner" ? ["[data-testid=journeys-builder]", "[data-testid=journeys-presets]"] : [])],
      steps: userKey === "noperm" ? [{ wait: 800 }] : [{ waitFor: "[data-testid=journeys-table]" }, { wait: 500 }],
    },
    ...(userKey === "owner" ? [
      { name: "journey-new-owner", path: `${MEMBER_BASE}/journeys/new`, onlyDevice: "desktop" as const, note: "builder ว่าง + เลือกสำเร็จรูป 6", expect: ["[data-testid=journeys-builder]", "[data-testid=journey-trigger]", "[data-testid=journey-add]", "[data-testid=journeys-save]", "[data-testid=journeys-presets]"], steps: [{ waitFor: "[data-testid=journeys-builder]" }, { wait: 400 }] },
      { name: "journey-detail-owner", path: `${MEMBER_BASE}/journeys/${TMP33.journeyId || "new"}`, onlyDevice: "desktop" as const, note: "เทียบภาพ 22: ขั้นตอน 5 การ์ด · ผลลัพธ์ 30 วัน · กล่อง holdout · กราฟรายวัน · เข้าล่าสุด · ปุ่ม แก้ไข/หยุดชั่วคราว/ทำสำเนา", expect: ["[data-testid=journey-detail]", "[data-testid=journey-steps]", "[data-testid=journey-results]", "[data-testid=journey-holdout]", "[data-testid=journey-daily]", "[data-testid=journey-recent]"], steps: [{ waitFor: "[data-testid=journey-detail]" }, { wait: 600 }] },
    ] : []),
  ],
  // M3.2 — แคมเปญ v2 (ภาพ 21 เต็ม · 07 ล่าง)
  "3.2": [
    {
      name: `campaigns-${userKey}`,
      path: `${MEMBER_BASE}/campaigns`,
      note: userKey === "owner" ? "ตารางแคมเปญ (ชื่อ · segment · ช่องทาง · สถานะ · ส่ง/เปิด/ใช้/ยอด/ต้นทุน/ROI) + ปุ่มสร้าง" : userKey === "thana" ? "ธนา read-โดยนัย" : "404",
      expect: userKey === "noperm" ? [] : ["[data-testid=campaigns-page]", "[data-testid=campaigns-table]", ...(userKey === "owner" ? ["[data-testid=campaigns-add]"] : [])],
      steps: userKey === "noperm" ? [{ wait: 800 }] : [{ waitFor: "[data-testid=campaigns-table]" }, { wait: 400 }],
    },
    ...(userKey === "owner" ? [
      { name: "campaign-new-owner", path: `${MEMBER_BASE}/campaigns/new`, note: "เทียบภาพ 21: ขั้น 1 กลุ่มเป้าหมาย (builder + กล่องฟ้า) · ขั้น 2 ช่องทาง/ข้อความ/AI/voucher/คูปอง/A-B · ขั้น 3 ตั้งเวลา + holdout · ขวา ตัวอย่าง LINE + ประมาณการ + ทดสอบส่ง", expect: ["[data-testid=campaign-new]", "[data-testid=campaign-step-segment]", "[data-testid=campaign-step-message]", "[data-testid=campaign-step-schedule]", "[data-testid=campaign-channel-tabs]", "[data-testid=campaign-preview-line]", "[data-testid=campaign-estimate]", "[data-testid=campaign-send]"], steps: [{ waitFor: "[data-testid=campaign-new]" }, { wait: 800 }] },
      { name: "campaign-detail-owner", path: `${MEMBER_BASE}/campaigns`, onlyDevice: "desktop" as const, note: "คลิกแถวแรก → รายละเอียด/สถิติ (variant + holdout + uplift + ผู้รับ)", expect: ["[data-testid=campaign-detail]", "[data-testid=campaign-stats]", "[data-testid=campaign-recipients]"], steps: [{ waitFor: "[data-testid=campaigns-table]" }, { click: "[data-testid^=campaign-row-]" }, { waitFor: "[data-testid=campaign-detail]", timeoutMs: 15_000 }, { wait: 500 }] },
    ] : []),
  ],
  // M3.1 — segment builder (ภาพ 21 ขั้น 1) — TMP31 segment ตัวอย่าง
  "3.1": [
    {
      name: `segments-${userKey}`,
      path: `${MEMBER_BASE}/segments`,
      note: userKey === "owner" ? "รายการ segment (ชื่อ · เงื่อนไขย่อ · จำนวน · scope) + ปุ่มสร้าง" : userKey === "thana" ? "ธนา (read-โดยนัย) เห็นรายการ ไม่มีปุ่มบันทึก" : "ไม่มีสิทธิ์ → 404",
      expect: userKey === "noperm" ? [] : ["[data-testid=segments-page]", "[data-testid=segments-list]", ...(userKey === "owner" ? ["[data-testid=segments-add]"] : [])],
      steps: userKey === "noperm" ? [{ wait: 800 }] : [{ waitFor: "[data-testid=segments-list]" }, { wait: 400 }],
    },
    ...(userKey === "owner" ? [
      { name: "segments-builder-owner", path: `${MEMBER_BASE}/segments/${TMP31.segmentId || "new"}`, onlyDevice: "desktop" as const, note: "เทียบภาพ 21 ขั้น 1: ประโยค [สมาชิกที่][ระดับ][เป็น][Gold, Platinum] · และ [ไม่ซื้อ/ไม่จอง][มากกว่า][30 วัน] · และ [ยินยอมรับข่าวสารทาง][LINE] · + เพิ่มเงื่อนไข · กล่องฟ้า n คน/ยอดเฉลี่ย/ตัวอย่าง · บันทึกเป็น Segment", expect: ["[data-testid=segments-builder]", "[data-testid=segment-condition]", "[data-testid=segment-add-condition]", "[data-testid=segment-count]", "[data-testid=segment-sample]", "[data-testid=segments-save]"], steps: [{ waitFor: "[data-testid=segment-count]", timeoutMs: 15_000 }, { wait: 800 }] },
    ] : []),
  ],
  // M2.9 — ฝั่งลูกค้า /m/<slug>/* (ภาพ 09 · มือถือ) — ถ่ายด้วย --user customer:<รหัสสมาชิก 1> · หน้า login/ไม่มี session ถ่ายด้วย --user owner
  "2.9": [
    ...(isCustomer ? [
      { name: "m-card", path: `/m/${MQC.tenantSlug}/card`, onlyDevice: "mobile" as const, note: "เทียบภาพ 09 ก: การ์ดดำ ชื่อร้าน/ชื่อ+ระดับ/รหัส/QR ใหญ่/แต้ม+แถบ/อีก ฿x → ระดับถัดไป · ปุ่ม 4 · สิทธิ์ที่ใช้ได้ตอนนี้ · แถบล่าง 4", expect: ["[data-testid=m-card]", "[data-testid=m-card-qr]", "[data-testid=m-card-points]", "[data-testid=m-card-actions]", "[data-testid=m-card-benefits]", "[data-testid=m-nav]"], steps: [{ waitFor: "[data-testid=m-card-qr]" }, { wait: 600 }] },
      { name: "m-wallet", path: `/m/${MQC.tenantSlug}/wallet`, onlyDevice: "mobile" as const, note: "เทียบภาพ 09 ข: เตือนแต้มใกล้หมดอายุ · voucher · สแตมป์วงกลม · gift card · ของรางวัลรอรับ", expect: ["[data-testid=m-wallet]", "[data-testid=m-wallet-vouchers]", "[data-testid=m-wallet-stamps]", "[data-testid=m-wallet-giftcards]", "[data-testid=m-wallet-rewards]"], steps: [{ waitFor: "[data-testid=m-wallet]" }, { wait: 500 }] },
      { name: "m-profile", path: `/m/${MQC.tenantSlug}/profile`, onlyDevice: "mobile" as const, note: "เทียบภาพ 09 ค: หัวชื่อ/รหัส/ระดับ · ฟิลด์ (ดินสอ/กุญแจ) · ความยินยอม toggle · ปุ่ม PDPA", expect: ["[data-testid=m-profile]", "[data-testid=m-profile-fields]", "[data-testid=m-profile-consents]", "[data-testid=m-profile-pdpa]"], steps: [{ waitFor: "[data-testid=m-profile]" }, { wait: 500 }] },
      { name: "m-history", path: `/m/${MQC.tenantSlug}/history`, onlyDevice: "mobile" as const, note: "ไทม์ไลน์ของฉัน", expect: ["[data-testid=m-history]"], steps: [{ waitFor: "[data-testid=m-history]" }, { wait: 400 }] },
    ] : userKey === "owner" ? [
      { name: "m-login", path: `/m/${MQC.tenantSlug}/login`, onlyDevice: "mobile" as const, note: "หน้าเข้าสู่ระบบลูกค้า: เบอร์/อีเมล → OTP · ปุ่ม LINE (cookie พนักงานไม่มีผล)", expect: ["[data-testid=m-login]", "[data-testid=m-login-form]", "[data-testid=m-login-line]"], steps: [{ waitFor: "[data-testid=m-login]" }, { wait: 400 }] },
      { name: "m-card-nosession", path: `/m/${MQC.tenantSlug}/card`, onlyDevice: "mobile" as const, note: "ไม่มี session ลูกค้า → พาไปหน้า login", expect: ["[data-testid=m-login]"], steps: [{ waitFor: "[data-testid=m-login]", timeoutMs: 15_000 }, { wait: 300 }] },
    ] : []),
  ],
  // M2.8 — แผงสิทธิ์ที่หน้าขาย POS (ภาพ 06) — TMP28 เติมแต้มให้สมาชิก 1
  "2.8": [
    ...(userKey === "owner" ? [
      { name: "pos-register-owner", path: `/app/sys/${E.systems.POS}/pos/register?unit=${E.units.patong}`, onlyDevice: "desktop" as const, note: "หน้าขายเดิม ไม่เลือกสมาชิก — ไม่มีแผงสิทธิ์", expect: ["[data-testid=pos-register]", "[data-testid=pos-member-select]"], steps: [{ waitFor: "[data-testid=pos-register]" }, { wait: 400 }] },
      { name: "pos-register-member-owner", path: `/app/sys/${E.systems.POS}/pos/register?unit=${E.units.patong}`, note: "เทียบภาพ 06: เลือกสมาชิก 1 + หยิบสินค้า 1 รายการ → แผงขวา สิทธิ์ของ (ระดับ · voucher · แต้ม toggle · gift card · สแตมป์ · ลำดับ · แต้มที่จะได้) + สรุปยอด + ปุ่มใช้สิทธิ์และรับชำระ", expect: ["[data-testid=pos-member-panel]", "[data-testid=pos-panel-tier]", "[data-testid=pos-panel-vouchers]", "[data-testid=pos-panel-points]", "[data-testid=pos-panel-giftcard]", "[data-testid=pos-panel-stamps]", "[data-testid=pos-panel-order]", "[data-testid=pos-panel-earn]", "[data-testid=pos-pay-button]"], steps: [{ waitFor: "[data-testid=pos-member-select]" }, { select: { on: "[data-testid=pos-member-select]", value: E.members[0].id } }, { wait: 300 }, { click: "[data-testid=pos-catalog-item]" }, { waitFor: "[data-testid=pos-member-panel]", timeoutMs: 15_000 }, { wait: 600 }] },
    ] : []),
  ],
  // M2.6 — gift card (ภาพ 20) — TMP26 ขาย 4 ใบ
  "2.6": [
    ...(userKey === "owner" ? [
      { name: "giftcards-owner", path: `${MEMBER_BASE}/promotions/giftcards`, note: "เทียบภาพ 20: KPI 3 · ป้ายผูกบัญชี · ตาราง 7 คอลัมน์ · ปุ่มขาย", expect: ["[data-testid=giftcards-page]", "[data-testid=giftcards-kpi]", "[data-testid=giftcards-table]", "[data-testid=giftcards-sell]"], steps: [{ waitFor: "[data-testid=giftcards-table]" }, { wait: 500 }] },
      { name: "giftcards-sell-modal-owner", path: `${MEMBER_BASE}/promotions/giftcards`, onlyDevice: "desktop" as const, note: "กดขาย → drawer ขาย (มูลค่า · ผู้ซื้อ · ผู้รับ · ออกบัตร)", expect: ["[data-testid=giftcards-sell-modal]", "[data-testid=giftcards-sell-amount]", "[data-testid=giftcards-sell-recipient]", "[data-testid=giftcards-sell-submit]"], steps: [{ waitFor: "[data-testid=giftcards-sell]" }, { click: "[data-testid=giftcards-sell]" }, { waitFor: "[data-testid=giftcards-sell-modal]" }, { wait: 500 }] },
      { name: "giftcards-settings-owner", path: `${MEMBER_BASE}/promotions/giftcards/settings`, onlyDevice: "desktop" as const, note: "ตั้งค่า gift card (เปิด/ผูกบัญชี/อายุ)", expect: ["[data-testid=giftcards-settings]", "[data-testid=giftcards-settings-form]"], steps: [{ waitFor: "[data-testid=giftcards-settings-form]" }, { wait: 400 }] },
    ] : userKey === "thana" ? [
      { name: "giftcards-thana", path: `${MEMBER_BASE}/promotions/giftcards`, onlyDevice: "desktop" as const, note: "พนักงาน (read โดยนัย) เห็นตาราง ไม่มีปุ่มขาย", expect: ["[data-testid=giftcards-page]", "[data-testid=giftcards-table]"], steps: [{ waitFor: "[data-testid=giftcards-table]" }, { wait: 400 }] },
    ] : userKey === "noperm" ? [
      { name: "giftcards-noperm", path: `${MEMBER_BASE}/promotions/giftcards`, onlyDevice: "desktop" as const, note: "ไม่มีสิทธิ์ → 404", expect: [], steps: [{ wait: 800 }] },
    ] : []),
  ],
  // M2.7 — แท็บกระเป๋าสิทธิ์ใน 360 (ภาพ 02) — TMP27 เติมแต้มให้สมาชิก 1
  "2.7": [
    ...(userKey === "owner" || userKey === "thana" ? [{
      name: `member-wallet-${userKey}`,
      path: `${MEMBER_BASE}/members/${E.members[0].id}?tab=wallet`,
      note: "เทียบภาพ 02 แท็บกระเป๋า: แต้ม (คงเหลือ/ใกล้หมดอายุ) · voucher · คูปอง · gift card · รางวัลรอรับ · สแตมป์ · สิทธิ์ระดับ",
      expect: ["[data-testid=member-wallet]", "[data-testid=member-wallet-points]", "[data-testid=member-wallet-vouchers]", "[data-testid=member-wallet-giftcards]", "[data-testid=member-wallet-rewards]", "[data-testid=member-wallet-stamps]", "[data-testid=member-wallet-benefits]"],
      steps: [{ waitFor: "[data-testid=member-wallet]" }, { wait: 500 }],
    }] : []),
  ],
  // M2.4 — รางวัล v2 (ภาพ 05 แคตตาล็อก+รอรับ · ภาพ 18 editor + รับของ + ประวัติ) — TMP24 (ลบใน restoreSeed)
  "2.4": [
    {
      name: `rewards-${userKey}`,
      path: `${MEMBER_BASE}/rewards`,
      note: userKey === "owner" ? "เทียบภาพ 05: แคตตาล็อกการ์ด (รูป/ชื่อ/'n แต้ม · สต็อก n') + ตารางรอรับ (สมาชิก/ราคา/รหัสรับของ/สถานะ) + ปุ่มเพิ่มของรางวัล" : userKey === "thana" ? "ธนา (read-โดยนัย) อ่านอย่างเดียว" : "ไม่มีสิทธิ์ → 404",
      expect: userKey === "noperm" ? [] : ["[data-testid=rewards-page]", "[data-testid=rewards-catalog]", "[data-testid=rewards-pending]", ...(userKey === "owner" ? ["[data-testid=rewards-add]"] : [])],
      steps: userKey === "noperm" ? [{ wait: 800 }] : [{ waitFor: "[data-testid=rewards-catalog]" }, { wait: 400 }],
    },
    ...(userKey === "owner" ? [
      { name: "rewards-editor-owner", path: `${MEMBER_BASE}/rewards/${TMP24.rewardId}`, onlyDevice: "desktop" as const, note: "เทียบภาพ 18 ซ้าย: ฟอร์มของรางวัล (รูป · ชื่อ · ชนิด · ราคา แต้ม และ/หรือ สแตมป์ · สต็อก · จำกัดระดับ · จำกัด ชิ้น/คน/เดือน · ช่วงเวลา · สาขาที่รับได้ · รับของภายใน · แสดงบน LINE) + ประวัติการแลก", expect: ["[data-testid=rewards-editor]", "[data-testid=rewards-editor-form]", "[data-testid=rewards-kind]", "[data-testid=rewards-cost]", "[data-testid=rewards-save]"], steps: [{ waitFor: "[data-testid=rewards-editor-form]" }, { wait: 400 }] },
      { name: "rewards-new-owner", path: `${MEMBER_BASE}/rewards/new`, onlyDevice: "desktop" as const, note: "ฟอร์มเพิ่มของรางวัลใหม่", expect: ["[data-testid=rewards-editor]", "[data-testid=rewards-editor-form]"], steps: [{ waitFor: "[data-testid=rewards-editor-form]" }, { wait: 300 }] },
      { name: "rewards-fulfil-owner", path: `${MEMBER_BASE}/rewards/fulfil`, onlyDevice: "desktop" as const, note: "เทียบภาพ 18 ขวา (ก่อนสแกน): ช่องสแกน QR / พิมพ์รหัส", expect: ["[data-testid=rewards-fulfil]", "[data-testid=rewards-fulfil-input]"], steps: [{ waitFor: "[data-testid=rewards-fulfil-input]" }, { wait: 300 }] },
      { name: "rewards-fulfil-result-owner", path: `${MEMBER_BASE}/rewards/fulfil`, onlyDevice: "desktop" as const, note: "เทียบภาพ 18 ขวา (หลังสแกน): ผลการสแกน ของรางวัล/สมาชิก+ระดับ/แลกเมื่อ/หมดอายุรับ + ปุ่มส่งมอบแล้ว/ยกเลิก (คืนแต้ม)", expect: ["[data-testid=rewards-fulfil-result]", "[data-testid=rewards-fulfil-confirm]", "[data-testid=rewards-fulfil-cancel]"], steps: [{ waitFor: "[data-testid=rewards-fulfil-input]" }, { fill: "[data-testid=rewards-fulfil-input]", value: TMP24.code }, { press: "Enter" }, { waitFor: "[data-testid=rewards-fulfil-result]", timeoutMs: 15_000 }, { wait: 400 }] },
      { name: "rewards-redemptions-owner", path: `${MEMBER_BASE}/rewards/redemptions`, onlyDevice: "desktop" as const, note: "ประวัติการแลก: รหัส · ของรางวัล · สมาชิก · สถานะชิป · สาขา · พนักงานที่ส่งมอบ", expect: ["[data-testid=rewards-redemptions]", "[data-testid=rewards-redemptions-table]"], steps: [{ waitFor: "[data-testid=rewards-redemptions-table]" }, { wait: 300 }] },
    ] : []),
  ],
  // M2.5 — voucher (ภาพ 19: KPI + ตาราง + โมดัลออก voucher) — TMP25 (ลบใน restoreSeed)
  "2.5": [
    {
      name: `vouchers-${userKey}`,
      path: `${MEMBER_BASE}/promotions/vouchers`,
      note: userKey === "owner" ? "เทียบภาพ 19 ซ้าย: KPI ใช้ได้/ใช้แล้วเดือนนี้ · ค้นหา · ตาราง 8 คอลัมน์ + ปุ่มออก voucher" : userKey === "thana" ? "ธนา (read-โดยนัย) เห็นตาราง ไม่มีปุ่มออก" : "ไม่มีสิทธิ์ → 404",
      expect: userKey === "noperm" ? [] : ["[data-testid=vouchers-page]", "[data-testid=vouchers-kpi]", "[data-testid=vouchers-table]", ...(userKey === "owner" ? ["[data-testid=vouchers-issue]"] : [])],
      steps: userKey === "noperm" ? [{ wait: 800 }] : [{ waitFor: "[data-testid=vouchers-table]" }, { wait: 400 }],
    },
    ...(userKey === "owner" ? [
      { name: "vouchers-issue-modal-owner", path: `${MEMBER_BASE}/promotions/vouchers`, onlyDevice: "desktop" as const, note: "เทียบภาพ 19 ขวา: โมดัลออก voucher (ให้ใคร รายคน/กลุ่ม · แบบ · มูลค่า · เงื่อนไข · อายุ · ต้นทาง · แจ้ง LINE · กล่องต้องอนุมัติ · แถบล่าง ผู้อนุมัติ + ปุ่ม)", expect: ["[data-testid=vouchers-issue-modal]", "[data-testid=vouchers-issue-target]", "[data-testid=vouchers-issue-kind]", "[data-testid=vouchers-issue-value]", "[data-testid=vouchers-issue-submit]"], steps: [{ waitFor: "[data-testid=vouchers-issue]" }, { click: "[data-testid=vouchers-issue]" }, { waitFor: "[data-testid=vouchers-issue-modal]", timeoutMs: 10_000 }, { wait: 400 }] },
      { name: "vouchers-templates-owner", path: `${MEMBER_BASE}/promotions/vouchers/templates`, onlyDevice: "desktop" as const, note: "ตารางเทมเพลต + ฟอร์มเพิ่ม", expect: ["[data-testid=vouchers-templates]", "[data-testid=vouchers-template-add]"], steps: [{ waitFor: "[data-testid=vouchers-templates]" }, { wait: 300 }] },
      { name: "promotions-owner", path: `${MEMBER_BASE}/promotions`, onlyDevice: "desktop" as const, note: "hub โปรโมชัน: แท็บ voucher · คูปอง · gift card (soon) · journey (soon)", expect: ["[data-testid=promotions-page]"], steps: [{ waitFor: "[data-testid=promotions-page]" }, { wait: 300 }] },
    ] : []),
  ],
  // M2.3 — สแตมป์การ์ด (ภาพ 17): ตาราง + editor + การ์ดจริง 7/10 + สถิติ — การ์ดเตรียมใน TMP23 (ลบใน restoreSeed)
  "2.3": [
    {
      name: `stamps-${userKey}`,
      path: `${MEMBER_BASE}/stamps`,
      note: userKey === "owner" ? "เทียบภาพ 17 ล่าง: ตาราง 'สแตมป์การ์ดทั้งหมด' (ชื่อ/คำอธิบาย · ช่อง · ใบที่ใช้อยู่ · ครบแล้ว · สถานะ toggle) + ปุ่มสร้าง" : userKey === "thana" ? "ธนา (read-โดยนัย) เห็นตาราง อ่านอย่างเดียว ไม่มี stamps-add" : "ไม่มีสิทธิ์ → 404",
      expect: userKey === "noperm" ? [] : ["[data-testid=stamps-page]", "[data-testid=stamps-table]", ...(userKey === "owner" ? ["[data-testid=stamps-add]"] : [])],
      steps: userKey === "noperm" ? [{ wait: 800 }] : [{ waitFor: "[data-testid=stamps-table]" }, { wait: 400 }],
    },
    ...(userKey === "owner" ? [
      { name: "stamps-editor-owner", path: `${MEMBER_BASE}/stamps/${TMP23.cardId}`, onlyDevice: "desktop" as const, note: "เทียบภาพ 17: ฟอร์มตั้งค่าการ์ด (ซ้าย) · ตัวอย่างการ์ดจริง 7/10 (✓ 7 วง) + สถิติ 3 (ขวา) · ยกเลิก/บันทึก", expect: ["[data-testid=stamps-editor]", "[data-testid=stamps-editor-form]", "[data-testid=stamps-preview]", "[data-testid=stamps-stats]", "[data-testid=stamps-save]", "[data-testid=stamps-rule-kind]", "[data-testid=stamps-reward-kind]"], steps: [{ waitFor: "[data-testid=stamps-preview]" }, { wait: 500 }] },
      { name: "stamps-new-owner", path: `${MEMBER_BASE}/stamps/new`, onlyDevice: "desktop" as const, note: "ฟอร์มสร้างการ์ดใหม่ (ค่าปริยาย 10 ช่อง · MANUAL · POINTS)", expect: ["[data-testid=stamps-editor]", "[data-testid=stamps-editor-form]", "[data-testid=stamps-preview]"], steps: [{ waitFor: "[data-testid=stamps-editor-form]" }, { wait: 400 }] },
    ] : []),
  ],
  // M1.10 — ระดับสมาชิก (ภาพ 04) + benefits editor (ภาพ 15)
  "1.10": [
    {
      name: `tiers-${userKey}`,
      path: `${MEMBER_BASE}/tiers`,
      note: userKey === "owner" ? "เทียบภาพ 04: บันได 4 ขั้น+จำนวนคน · กฎ upgrade/keep · รอบประเมิน · ทดลองรัน · ประวัติ · แบบเสียเงิน · ตัวอย่างบัตร LINE" : userKey === "thana" ? "อ่านอย่างเดียว (ไม่มี tiers-add)" : "404",
      expect: userKey === "noperm" ? [] : ["[data-testid=tiers-page]", "[data-testid=tiers-ladder]", "[data-testid=tiers-rule-builder]", "[data-testid=tiers-history]", ...(userKey === "owner" ? ["[data-testid=tiers-add]"] : [])],
      steps: userKey === "noperm" ? [{ wait: 800 }] : [{ waitFor: "[data-testid=tiers-page]" }, { wait: 500 }],
    },
    ...(userKey === "owner" ? [
      { name: "tiers-dryrun-result", path: `${MEMBER_BASE}/tiers`, onlyDevice: "desktop" as const, note: "กดทดลองรัน → ตารางผล (เลื่อน/ลด/คง/ใกล้ลด)", expect: ["[data-testid=tiers-dryrun-result]"], steps: [{ waitFor: "[data-testid=tiers-dryrun-run]" }, { click: "[data-testid=tiers-dryrun-run]" }, { waitFor: "[data-testid=tiers-dryrun-result]", timeoutMs: 30_000 }, { wait: 500 }] },
      { name: "tiers-benefits-owner", path: `${MEMBER_BASE}/tiers/${E.tierDefs.gold}`, onlyDevice: "desktop" as const, note: "เทียบภาพ 15: benefits editor 9–10 ชนิด + ตั้งค่าระดับ", expect: ["[data-testid=tiers-benefits]", "[data-testid=tiers-benefit-DISCOUNT_PCT]"], steps: [{ waitFor: "[data-testid=tiers-benefits]" }, { wait: 400 }] },
    ] : []),
  ],
  // M1.8 — ช่องทางที่มา (ภาพ 13): KPI · แท่งต่อช่องทาง first/last · ตารางลิงก์/QR · โมดัลสร้างลิงก์
  "1.8": [
    {
      name: `settings-sources-${userKey}`,
      path: `${MEMBER_BASE}/settings/sources`,
      note: userKey === "owner" ? "เทียบภาพ 13: KPI · แท่งต่อช่องทาง (first vs last) · ลิงก์/QR ที่มา" : "ธนา → 404",
      expect: userKey === "owner" ? ["[data-testid=sources-page]", "[data-testid=sources-kpi]", "[data-testid=sources-chart]", "[data-testid=sources-links]"] : [],
      steps: userKey === "owner" ? [{ waitFor: "[data-testid=sources-page]" }, { wait: 500 }] : [{ wait: 800 }],
    },
    ...(userKey === "owner" ? [{
      name: "sources-link-new-modal",
      path: `${MEMBER_BASE}/settings/sources`,
      onlyDevice: "desktop" as const,
      note: "กด 'สร้างลิงก์/QR' → โมดัล (ชื่อ/ที่มา/สาขา/แคมเปญ/ต้นทุน) — ถ่ายตอนเปิด",
      expect: ["[data-testid=sources-link-new-modal]"],
      steps: [{ waitFor: "[data-testid=sources-link-new]" }, { click: "[data-testid=sources-link-new]" }, { waitFor: "[data-testid=sources-link-new-modal]" }, { wait: 400 }],
    }] : []),
  ],
  // M1.7 — ตั้งค่าความเป็นส่วนตัว (ภาพ 14): นโยบายเวอร์ชัน · ช่องทางยินยอม · ใครดูอ่อนไหว (ชิปตำแหน่ง HR + เตือนยังไม่ผูก) · บันทึกการดู · คำขอ PDPA · ลบอัตโนมัติ
  "1.7": [
    {
      name: `settings-privacy-${userKey}`,
      path: `${MEMBER_BASE}/settings/privacy`,
      note: userKey === "owner" ? "เทียบภาพ 14 ทั้ง 6 บล็อก · ชิปตำแหน่ง/แผนกจาก HR · คำเตือน 'n คนยังไม่ผูก'" : "ธนา (ไม่มี member.privacy.manage) → 404",
      expect: userKey === "owner" ? ["[data-testid=privacy-page]", "[data-testid=privacy-policies]", "[data-testid=privacy-consent-channels]", "[data-testid=privacy-sensitive]", "[data-testid=privacy-access-log]", "[data-testid=privacy-requests]", "[data-testid=privacy-auto-erase]"] : [],
      steps: userKey === "owner" ? [{ waitFor: "[data-testid=privacy-page]" }, { wait: 500 }] : [{ wait: 800 }],
    },
  ],
  // M1.3 — ตัวออกแบบฟิลด์ · เทียบภาพ ledger/design-member/03-field-designer.png
  //   palette 11 ชนิดซ้าย · ผืนกลางลากเรียงส่วน/ฟิลด์ (dnd-kit) · แผงคุณสมบัติขวา 10 รายการ · ตัวอย่างมือถือ · dropdown เทมเพลต · ตัวนับ n/60
  "1.3": [
    {
      name: `field-designer-${userKey}`,
      path: `${MEMBER_BASE}/settings/fields`,
      note: userKey === "owner"
        ? "เทียบภาพ 03: palette 11 ชนิด · ส่วน (ข้อมูลพื้นฐาน/ช่องทางติดต่อ/ที่อยู่/ข้อมูลภายใน/ข้อมูลดำน้ำ/สุขภาพ 🔒) · ฟิลด์ระบบมีป้าย 'ระบบ' · แผงคุณสมบัติขวา · ตัวอย่างมือถือ · ตัวนับ 33/60 · dropdown เทมเพลตกิจการ"
        : "ธนา (STAFF · ไม่มี member.settings.manage) → 404/ไม่มีสิทธิ์ ไม่ใช่หน้าว่าง",
      expect: userKey === "owner" ? ["[data-testid=field-designer]", "[data-testid=field-palette]", "[data-testid=field-props]", "[data-testid=field-template-select]"] : [],
      steps: userKey === "owner" ? [{ waitFor: "[data-testid=field-designer]" }, { wait: 500 }] : [{ wait: 800 }],
    },
    ...(userKey !== "owner" ? [] : [{
      name: "field-designer-selected",
      path: `${MEMBER_BASE}/settings/fields`,
      onlyDevice: "desktop" as const,
      note: "คลิกฟิลด์ 'ระดับใบรับรอง' → แผงขวาแสดงคุณสมบัติ 10 รายการ (ป้าย/ชนิด/ตัวเลือก/บังคับ/ค่าเริ่มต้น/ไม่ซ้ำ/กรองได้/แสดงในตาราง/ลูกค้าแก้เอง/อ่อนไหว/เก็บประวัติ) และตัวอย่างมือถือเลื่อนไปที่ฟิลด์นั้น",
      expect: ["[data-testid=field-props]", "[data-testid=field-props-label]"],
      steps: [{ waitFor: "[data-testid=field-designer]" }, { click: `[data-testid=field-item-certLevel]` }, { waitFor: "[data-testid=field-props-label]" }, { wait: 400 }],
    }]),
  ],
};

async function restoreSeed(): Promise<void> {
  const P = prisma as Any;
  if (TMP12.contacts.length) {
    await P.memberChannelIdentity.deleteMany({ where: { contactId: { in: TMP12.contacts } } }).catch(() => null);
    await P.chatMessage.deleteMany({ where: { conversationId: { in: TMP12.convs } } }).catch(() => null);
    await prisma.chatConversation.deleteMany({ where: { id: { in: TMP12.convs } } }).catch(() => null);
    await prisma.chatContact.deleteMany({ where: { id: { in: TMP12.contacts } } }).catch(() => null);
  }
  if (WO === "2.6" && TMP26.set0) { const G26c = (await import("@/lib/modules/giftcard" as string)) as Any; const memO = await prisma.membership.findFirst({ where: { tenantId: E.tenantId, userId: E.users.owner.userId } }); await G26c.setSettings({ tenantId: E.tenantId, systemId: SYS, posSystemId: E.systems.POS, actorUserId: E.users.owner.userId }, { userId: E.users.owner.userId, role: memO!.role, unitAccess: memO!.unitAccess as string[], permissions: memO!.permissions as Record<string, unknown> }, { enabled: TMP26.set0.enabled, accountingLink: TMP26.set0.accountingLink }).catch(() => null); }
  if (WO === "2.6" && TMP26.cards.length) { await P.giftCardTxn.deleteMany({ where: { giftCardId: { in: TMP26.cards } } }).catch(() => null); await P.giftCard.deleteMany({ where: { id: { in: TMP26.cards } } }).catch(() => null); if (TMP26.sales.length) { for (const mdl of ["posSalePayment", "posSaleLine", "posSaleItem"]) await P[mdl]?.deleteMany?.({ where: { saleId: { in: TMP26.sales } } }).catch(() => null); await prisma.posSale.deleteMany({ where: { id: { in: TMP26.sales } } }).catch(() => null); } }
  if (WO === "3.7") { await P.memberActivity.deleteMany({ where: { tenantId: E.tenantId, refId: { startsWith: "tmp37-" } } }).catch(() => null); }
  if (WO === "3.5") { const cs = await prisma.customer.findMany({ where: { tenantId: E.tenantId, phone: { startsWith: "0899300" } }, select: { id: true, partyId: true } }).catch(() => []); const ids = cs.map((c: Any) => c.id); const refs = await P.referral.findMany({ where: { tenantId: E.tenantId, OR: [{ refereeCustomerId: { in: ids } }, { refereeCustomerId: E.members[0].id }] }, select: { id: true } }).catch(() => []); const rids = refs.map((r: Any) => r.id); const leds = await prisma.pointLedger.findMany({ where: { tenantId: E.tenantId, refType: "REFERRAL", refId: { in: rids } }, select: { id: true, customerId: true, delta: true } }).catch(() => [] as Any[]); await P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l: Any) => l.id) } } }).catch(() => null); await prisma.pointLedger.deleteMany({ where: { id: { in: leds.map((l: Any) => l.id) } } }).catch(() => null); for (const l of leds) await P.pointBalance.updateMany({ where: { customerId: l.customerId }, data: { balance: { decrement: l.delta } } }).catch(() => null); await P.voucher.deleteMany({ where: { tenantId: E.tenantId, origin: "REFERRAL" } }).catch(() => null); await P.memberActivity.deleteMany({ where: { tenantId: E.tenantId, refId: { in: rids } } }).catch(() => null); await P.referral.deleteMany({ where: { id: { in: rids } } }).catch(() => null); if (ids.length) { for (const mdl of ["pointLot", "pointLedger", "pointBalance", "memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberChannelIdentity", "memberAccessLog", "memberActivity"]) await P[mdl].deleteMany({ where: { customerId: { in: ids } } }).catch(() => null); await prisma.auditLog.deleteMany({ where: { tenantId: E.tenantId, targetId: { in: ids } } }).catch(() => null); await prisma.customer.deleteMany({ where: { id: { in: ids } } }).catch(() => null); const parties = cs.map((c: Any) => c.partyId).filter(Boolean); if (parties.length) { await prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } }).catch(() => null); await prisma.party.deleteMany({ where: { id: { in: parties } } }).catch(() => null); } } }
  if (WO === "3.4") { const rvs = await P.memberReview.findMany({ where: { tenantId: E.tenantId, createdAt: { gte: new Date(Date.now() - 3600_000) } }, select: { id: true, kanbanCardId: true } }).catch(() => []); const ids = rvs.map((r: Any) => r.id); if (ids.length) { const leds = await prisma.pointLedger.findMany({ where: { tenantId: E.tenantId, refType: "REVIEW", refId: { in: ids } }, select: { id: true, customerId: true, delta: true } }).catch(() => [] as Any[]); await P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l: Any) => l.id) } } }).catch(() => null); await prisma.pointLedger.deleteMany({ where: { id: { in: leds.map((l: Any) => l.id) } } }).catch(() => null); for (const l of leds) await P.pointBalance.updateMany({ where: { customerId: l.customerId }, data: { balance: { decrement: l.delta } } }).catch(() => null); await P.memberActivity.deleteMany({ where: { tenantId: E.tenantId, refId: { in: ids } } }).catch(() => null); const cards = rvs.map((r: Any) => r.kanbanCardId).filter(Boolean); if (cards.length) { await P.kanbanCardAssignee?.deleteMany?.({ where: { cardId: { in: cards } } }).catch(() => null); await P.kanbanCard.deleteMany({ where: { id: { in: cards } } }).catch(() => null); } await P.memberReview.deleteMany({ where: { id: { in: ids } } }).catch(() => null); } }
  if (WO === "3.3") { const rs = await P.automationRule.findMany({ where: { tenantId: E.tenantId, scope: "MEMBER_JOURNEY", createdAt: { gte: new Date(Date.now() - 3600_000) } }, select: { id: true } }).catch(() => []); const ids = rs.map((r: Any) => r.id); if (ids.length) { await P.automationRun.deleteMany({ where: { ruleId: { in: ids } } }).catch(() => null); await P.automationRule.deleteMany({ where: { id: { in: ids } } }).catch(() => null); } }
  if (TMP31.segmentId) await P.memberSegment.deleteMany({ where: { id: TMP31.segmentId } }).catch(() => null);
  if (TMP28.active) {
    const vl = await prisma.pointLedger.findMany({ where: { tenantId: E.tenantId, refType: "QC", refId: { startsWith: "vis28-" } }, select: { id: true, customerId: true, delta: true } }).catch(() => [] as Any[]);
    await P.pointLot.deleteMany({ where: { ledgerId: { in: vl.map((l: Any) => l.id) } } }).catch(() => null);
    await prisma.pointLedger.deleteMany({ where: { id: { in: vl.map((l: Any) => l.id) } } }).catch(() => null);
    for (const l of vl) await P.pointBalance.updateMany({ where: { customerId: l.customerId }, data: { balance: { decrement: l.delta } } }).catch(() => null);
  }
  if (TMP27.active) {
    const vl = await prisma.pointLedger.findMany({ where: { tenantId: E.tenantId, refType: "QC", refId: { startsWith: "vis27-" } }, select: { id: true, customerId: true, delta: true } }).catch(() => [] as Any[]);
    await P.pointLot.deleteMany({ where: { ledgerId: { in: vl.map((l: Any) => l.id) } } }).catch(() => null);
    await prisma.pointLedger.deleteMany({ where: { id: { in: vl.map((l: Any) => l.id) } } }).catch(() => null);
    for (const l of vl) await P.pointBalance.updateMany({ where: { customerId: l.customerId }, data: { balance: { decrement: l.delta } } }).catch(() => null);
  }
  if (TMP24.rewardId) {
    const reds = await P.rewardRedemption.findMany({ where: { rewardId: TMP24.rewardId }, select: { id: true } }).catch(() => []);
    const rids = reds.map((r: Any) => r.id);
    if (rids.length) {
      const leds = await prisma.pointLedger.findMany({ where: { tenantId: E.tenantId, refId: { in: rids } }, select: { id: true, customerId: true, delta: true } }).catch(() => [] as Any[]);
      await P.pointLot.deleteMany({ where: { ledgerId: { in: leds.map((l: Any) => l.id) } } }).catch(() => null);
      await prisma.pointLedger.deleteMany({ where: { id: { in: leds.map((l: Any) => l.id) } } }).catch(() => null);
      for (const l of leds) await P.pointBalance.updateMany({ where: { customerId: l.customerId }, data: { balance: { decrement: l.delta } } }).catch(() => null);
      await P.rewardRedemption.deleteMany({ where: { id: { in: rids } } }).catch(() => null);
    }
    const vl = await prisma.pointLedger.findMany({ where: { tenantId: E.tenantId, refType: "QC", refId: { startsWith: "vis24-" } }, select: { id: true, customerId: true, delta: true } }).catch(() => [] as Any[]);
    await P.pointLot.deleteMany({ where: { ledgerId: { in: vl.map((l: Any) => l.id) } } }).catch(() => null);
    await prisma.pointLedger.deleteMany({ where: { id: { in: vl.map((l: Any) => l.id) } } }).catch(() => null);
    for (const l of vl) await P.pointBalance.updateMany({ where: { customerId: l.customerId }, data: { balance: { decrement: l.delta } } }).catch(() => null);
    await prisma.reward.deleteMany({ where: { id: TMP24.rewardId } }).catch(() => null);
  }
  if (TMP25.templateId) {
    await P.memberActivity.deleteMany({ where: { tenantId: E.tenantId, module: "voucher", refId: { in: (await P.voucher.findMany({ where: { templateId: TMP25.templateId }, select: { id: true } })).map((v: Any) => v.id) } } }).catch(() => null);
    await P.voucher.deleteMany({ where: { templateId: TMP25.templateId } }).catch(() => null);
    await P.voucherTemplate.deleteMany({ where: { id: TMP25.templateId } }).catch(() => null);
  }
  if (TMP23.cardId) {
    const progs = await P.stampCardProgress.findMany({ where: { cardId: TMP23.cardId }, select: { id: true } }).catch(() => []);
    const pids = progs.map((p: Any) => p.id);
    if (pids.length) { await P.stampEvent.deleteMany({ where: { progressId: { in: pids } } }).catch(() => null); await P.stampCardProgress.deleteMany({ where: { id: { in: pids } } }).catch(() => null); }
    await P.stampCard.deleteMany({ where: { id: TMP23.cardId } }).catch(() => null);
  }
  if (TMP.customerIds.length) {
    const ids = TMP.customerIds;
    const parties = (await prisma.customer.findMany({ where: { id: { in: ids } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberActivity", "memberChannelIdentity"]) await P[mdl].deleteMany({ where: { customerId: { in: ids } } }).catch(() => null);
    await prisma.auditLog.deleteMany({ where: { targetId: { in: ids } } }).catch(() => null);
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
    if (parties.length) { await prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } }); await prisma.party.deleteMany({ where: { id: { in: parties } } }); }
    // สมาชิกที่นำเข้าจากภาพขั้น 3 (ถ้ากด run) — ลบด้วยเบอร์ fixture
    const imported = await prisma.customer.findMany({ where: { tenantId: E.tenantId, phone: { in: ["0898800001", "0898800002"] } }, select: { id: true, partyId: true } });
    if (imported.length) { const iid = imported.map((c) => c.id); for (const mdl of ["memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberActivity"]) await P[mdl].deleteMany({ where: { customerId: { in: iid } } }).catch(() => null); await prisma.customer.deleteMany({ where: { id: { in: iid } } }); await prisma.party.deleteMany({ where: { id: { in: imported.map((c) => c.partyId).filter(Boolean) as string[] } } }).catch(() => null); }
  }
  if (TMP.fieldIds.length) { await P.memberFieldValue.deleteMany({ where: { fieldId: { in: TMP.fieldIds } } }); await P.memberField.deleteMany({ where: { id: { in: TMP.fieldIds } } }); }
  if (TMP.sectionIds.length) await P.memberSection.deleteMany({ where: { id: { in: TMP.sectionIds } } });
}

const specs: Spec[] = WO === "path" ? [{ name: "custom", path: argv[1]! }] : (SPECS[WO] ?? []);
if (specs.length === 0) { console.error(`❌ ไม่มี spec ของ WO ${WO}`); process.exit(2); }

// ── mint session ──
const UA = "qc-visual-member";
const token = "mb" + Math.random().toString(36).slice(2) + Date.now().toString(36);
const ttl = new Date(Date.now() + 60 * 60 * 1000);
let cookies: Any[] = [];
const https = BASE.startsWith("https:");
const host = new URL(BASE).hostname;
if (isCustomer) {
  // M2.9 — session ลูกค้า (platform_auth) · ผู้ทำ M2.9 ต้อง export `mintCustomerSession(customerId, {userAgent})` ที่ `src/lib/modules/member/customer-session.ts`
  const code = userKey.slice("customer:".length);
  const cust = (E.members as Any[]).find((m) => m.memberCode === code) ?? (await prisma.customer.findFirst({ where: { tenantId: E.tenantId, memberCode: code }, select: { id: true } }));
  if (!cust) { console.error(`❌ ไม่พบสมาชิก ${code}`); process.exit(2); }
  const cs = (await import("@/lib/modules/member/customer-session" as string).catch(() => null)) as Any;
  if (!cs?.mintCustomerSession) { console.error("❌ ยังไม่มี customer-session.ts (M2.9)"); process.exit(2); }
  const minted = await cs.mintCustomerSession(cust.id, { userAgent: UA });
  cookies = https
    ? [{ name: minted.cookieName, value: minted.token, url: BASE, path: "/", secure: true }]
    : [{ name: minted.cookieName, value: minted.token, domain: host, path: "/" }];
} else {
  const email = userKey === "owner" ? MQC.ownerEmail : userKey === "manager" ? MQC.managerEmail : userKey === "noperm" ? MQC.noPermEmail : (MQC.staff.find((s: Any) => s.key === userKey)?.email ?? MQC.ownerEmail);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) { console.error(`❌ ไม่พบผู้ใช้ ${email}`); process.exit(2); }
  await prisma.session.create({ data: { userId: user.id, tokenHash: sha256(token), userAgent: UA, idleExpiresAt: ttl, expiresAt: ttl } });
  cookies = https
    ? [{ name: "__Host-shark_session", value: token, url: BASE, path: "/", secure: true }, { name: "shark_tenant", value: E.tenantId, url: BASE, path: "/", secure: true }]
    : [{ name: "shark_session", value: token, domain: host, path: "/" }, { name: "shark_tenant", value: E.tenantId, domain: host, path: "/" }];
}

let failures = 0;
const shots: string[] = [];
/** สรุปต่อภาพ (HTTP · selector ที่หาไม่เจอ · console error) — เขียนลง `${OUT}/summary-${userKey}.json` ให้ oracle อ่าน */
const results: { name: string; device: string; status: number; missing: string[]; errors: string[]; file: string; overflow: boolean }[] = [];
try {
  const pptr = await import("/root/dive3d/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js" as string);
  const browser = await pptr.default.launch({
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", `--user-data-dir=/tmp/chr-member-${process.pid}`],
  });
  try {
    for (const spec of specs) {
      if (spec.before) await spec.before();
      const viewports: readonly (readonly [string, number, number])[] = process.env.KQC_VIEWPORTS
        ? process.env.KQC_VIEWPORTS.split(",").map((v) => { const [name, wh] = v.split(":"); const [w, h] = wh!.split("x").map(Number); return [name!, w!, h!] as const; })
        : ([["desktop", 1440, 900], ["mobile", 390, 844]] as const);
      for (const [device, w, h] of viewports) {
        if (spec.onlyDevice && spec.onlyDevice !== device) continue;
        const page = await browser.newPage();
        if (process.env.KQC_UA) await page.setUserAgent(`${await browser.userAgent()} ${process.env.KQC_UA}`);
        await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: device === "mobile", hasTouch: device === "mobile" });
        await page.setCookie(...cookies);
        const errors: string[] = [];
        page.on("pageerror", (e: Error) => errors.push(e.message.slice(0, 120)));
        page.on("console", (m: Any) => { if (m.type() === "error") errors.push(String(m.text()).slice(0, 120)); });
        const resp = await page.goto(`${BASE}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => null);
        await new Promise((r) => setTimeout(r, 1200));
        for (const step of spec.steps ?? []) {
          try {
            if ("waitFor" in step) await page.waitForSelector(step.waitFor, { timeout: step.timeoutMs ?? 10_000 });
            else if ("click" in step) await page.click(step.click);
            else if ("select" in step) await page.select(step.select.on, step.select.value);
            else if ("fill" in step) { await page.click(step.fill, { clickCount: 3 }); await page.keyboard.type(step.value, { delay: 15 }); }
            else if ("press" in step) await page.keyboard.press(step.press as Any);
            else if ("wait" in step) await new Promise((r) => setTimeout(r, step.wait));
            else if ("drag" in step) {
              const from = await page.$(step.drag.from); const to = await page.$(step.drag.to);
              if (!from || !to) throw new Error(`ไม่พบ element สำหรับลาก ${!from ? step.drag.from : step.drag.to}`);
              const a = (await from.boundingBox())!; const b = (await to.boundingBox())!;
              const sx = a.x + a.width / 2, sy = a.y + a.height / 2, tx = b.x + b.width / 2, ty = b.y + 8;
              await page.mouse.move(sx, sy); await page.mouse.down();
              await new Promise((r) => setTimeout(r, 350));
              const n = step.drag.steps ?? 12;
              for (let i = 1; i <= n; i++) { await page.mouse.move(sx + ((tx - sx) * i) / n, sy + ((ty - sy) * i) / n); await new Promise((r) => setTimeout(r, 30)); }
              await page.mouse.up();
            } else if ("dragBy" in step) {
              const el = await page.$(step.dragBy.on);
              if (!el) throw new Error(`ไม่พบ element สำหรับลาก ${step.dragBy.on}`);
              const bb = (await el.boundingBox())!;
              const sx = bb.x + bb.width / 2, sy = bb.y + bb.height / 2;
              const dx = step.dragBy.dx, dy = step.dragBy.dy ?? 0;
              await page.mouse.move(sx, sy); await page.mouse.down();
              await new Promise((r) => setTimeout(r, 250));
              const n = step.dragBy.steps ?? 10;
              for (let i = 1; i <= n; i++) { await page.mouse.move(sx + (dx * i) / n, sy + (dy * i) / n); await new Promise((r) => setTimeout(r, 30)); }
              await page.mouse.up();
            } else if ("upload" in step) {
              const input = await page.$(step.upload.on);
              if (!input) throw new Error(`ไม่พบ input สำหรับอัปโหลด ${step.upload.on}`);
              await input.uploadFile(step.upload.filePath);
            } else if ("swipe" in step) {
              const el = await page.$(step.swipe.on); const bb = (await el!.boundingBox())!;
              const y = bb.y + bb.height / 2; const x0 = bb.x + bb.width / 2;
              await page.touchscreen.touchStart(x0, y); for (let i = 1; i <= 8; i++) await page.touchscreen.touchMove(x0 + (step.swipe.dx * i) / 8, y); await page.touchscreen.touchEnd();
            } else if ("scrollTo" in step) {
              const sel = step.scrollTo;
              await page.evaluate((q: string) => { document.querySelector(q)?.scrollIntoView({ block: "center", inline: "nearest" }); }, sel);
            } else if ("longPress" in step) {
              const el = await page.$(step.longPress.on);
              if (!el) throw new Error(`ไม่พบ element สำหรับกดค้าง ${step.longPress.on}`);
              const bb = (await el.boundingBox())!;
              await page.touchscreen.touchStart(bb.x + bb.width / 2, bb.y + bb.height / 2);
              await new Promise((r) => setTimeout(r, step.longPress.ms ?? 400));
            }
          } catch (e) { failures++; console.log(`  ❌ step ${JSON.stringify(step).slice(0, 80)} — ${e instanceof Error ? e.message.slice(0, 120) : e}`); }
        }
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await new Promise((r) => setTimeout(r, 250));
        // M1.12 — วัดล้นแนวนอนของมือถือ (scrollWidth > viewport = เลย์เอาต์แตก) เก็บลง summary.overflow
        const overflow = await page.evaluate((w: number) => document.documentElement.scrollWidth > w + 2, w).catch(() => false);
        const file = `${OUT}/${spec.name}-${device}.png`;
        await page.screenshot({ path: file, fullPage: true });
        shots.push(file);
        const missing: string[] = [];
        for (const sel of spec.expect ?? []) { if (!(await page.$(sel))) missing.push(sel); }
        const status = resp?.status() ?? 0;
        const ok = status < 400 && missing.length === 0 && errors.length === 0;
        if (!ok) failures++;
        results.push({ name: spec.name, device, status, missing, errors, file, overflow });
        console.log(`  ${ok ? "✅" : "❌"} ${spec.name} [${device}] HTTP ${status} → ${file}${missing.length ? ` · ไม่พบ ${missing.join(",")}` : ""}${errors.length ? ` · console error ${errors.length}: ${errors[0]}` : ""}${spec.note ? `\n       ↳ ${spec.note}` : ""}`);
        await page.close();
      }
    }
  } finally { await browser.close(); }
} finally {
  try { await restoreSeed(); } catch (e) { failures++; console.log(`  ❌ คืนสภาพ seed ไม่สำเร็จ — ${e instanceof Error ? e.message.slice(0, 200) : e}`); }
  const { count } = await prisma.session.deleteMany({ where: { userAgent: UA } });
  if (isCustomer) { try { await (prisma as Any).platformSession.deleteMany({ where: { userAgent: UA } }); } catch { /* ยังไม่มี */ } }
  await prisma.$disconnect();
  writeFileSync(`${OUT}/summary-${userKey}.json`, JSON.stringify({ wo: WO, user: userKey, at: new Date().toISOString(), results }, null, 2));
  console.log(`\n🧹 ลบ session QC ${count} · ภาพ ${shots.length} ใบใน ${OUT} · สรุป summary-${userKey}.json`);
}
console.log(`JSON_SUMMARY ${JSON.stringify({ wo: WO, user: userKey, shots, failures })}`);
process.exit(failures > 0 ? 1 : 0);
