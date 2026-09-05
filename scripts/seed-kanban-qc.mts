// seed ชุดข้อมูล QC ของ RUN "บอร์ดงาน" — ลบร้าน QC ทิ้งแล้วสร้างใหม่ทั้งก้อน (idempotent)
//
// ใช้:  pnpm exec tsx scripts/seed-kanban-qc.mts
// 🔴 โหลด `.env.qc` เท่านั้น (ผ่าน acc-v2-env.loadQcEnv) — `.env` = production
// 🔴 บอร์ด/คอลัมน์/การ์ด "เดินผ่าน service จริง" ของโมดูล kanban — ไม่ยัด row ตรง
//    (ยกเว้น tenant/user/membership/unit ที่เป็นของแพลตฟอร์ม)
//
// โครงตาม ledger/KANBAN-RUN.md "ชุดข้อมูล QC" + ภาพ ledger/design-kanban/02-board.png

import { writeFileSync } from "node:fs";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
const kq = (await import("./kanban-qc-env.mts" as string)) as {
  KQC: Any;
  dayFromToday: (n: number, h?: number) => Date;
};
const { KQC, dayFromToday } = kq;
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const kanban = (await import("@/lib/modules/kanban/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;

// ── 1. ลบร้านเดิม (ทุกตารางที่ผูก tenantId) ──
const old = await prisma.tenant.findFirst({ where: { slug: KQC.tenantSlug } });
if (old) {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ตารางอาจยังไม่มีในรอบนี้ */ } };
  for (const m of [
    "kanbanActivity", "kanbanComment", "kanbanAttachment", "kanbanChecklistItem", "kanbanChecklist", "kanbanCardLabel", "kanbanCardAssignee",
    "kanbanLabel", "kanbanBoardMember", "kanbanBoardStar", "kanbanCard", "kanbanColumn", "kanbanBoard",
    "appNotification", "outboxEvent", "auditLog", "session", "membership", "appSystemUnit", "appSystem", "businessUnit",
  ]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: old.id } }));
  await prisma.tenant.delete({ where: { id: old.id } });
}
// ผู้ใช้ QC (อีเมลคงที่ · รันซ้ำได้)
const emails = [KQC.ownerEmail, KQC.managerEmail, ...KQC.staff.map((s: Any) => s.email), KQC.noPermEmail];
await prisma.membership.deleteMany({ where: { user: { email: { in: emails } } } });
await prisma.user.deleteMany({ where: { email: { in: emails } } });

// ── 2. ร้าน + หน่วยธุรกิจ + ระบบบอร์ดงาน ──
const tenant = await prisma.tenant.create({ data: { name: KQC.tenantName, slug: KQC.tenantSlug } });
const tenantId = tenant.id;
const units: Record<string, string> = {};
for (const u of KQC.units) {
  const row = await prisma.businessUnit.create({ data: { tenantId, type: "SHOP" as Any, name: u.name, slug: u.slug } });
  units[u.key] = row.id;
}
const system = await sys.createSystem(tenantId, "KANBAN", "บอร์ดงาน");
const systemId = system.id;

// ── 3. คน ──
const KANBAN_PERMS = { "kanban.board.create": true, "kanban.card.create": true, "kanban.card.update": true, "kanban.card.move": true };
async function mkUser(email: string, name: string, role: "OWNER" | "MANAGER" | "STAFF", unitAccess: string[], permissions: Record<string, boolean>) {
  const u = await prisma.user.create({ data: { email, name } });
  const m = await prisma.membership.create({ data: { userId: u.id, tenantId, role, unitAccess, permissions, acceptedAt: new Date() } });
  return { userId: u.id, membershipId: m.id, name, email };
}
const owner = await mkUser(KQC.ownerEmail, KQC.ownerName, "OWNER", ["*"], {});
const manager = await mkUser(KQC.managerEmail, "ผู้จัดการป่าตอง", "MANAGER", [units.patong!], {});
const staff: Record<string, Awaited<ReturnType<typeof mkUser>>> = {};
for (const s of KQC.staff) staff[s.key] = await mkUser(s.email, s.name, "STAFF", ["*"], KANBAN_PERMS);
const noPerm = await mkUser(KQC.noPermEmail, "พนักงานไม่มีสิทธิ์บอร์ด", "STAFF", ["*"], {});

// ── 4. บอร์ด (ผ่าน service) ──
type CardSpec = { t: string; labels?: string[]; who?: string; due?: number; desc?: string };
async function mkBoard(name: string, columns: string[], cards: Record<string, CardSpec[]>, extra: Record<string, unknown> = {}) {
  const board = await kanban.createBoard({ tenantId, systemId, name, ...extra });
  // service สร้างคอลัมน์ default 3 ตัว → ลบทิ้งแล้วสร้างตามสเปค (ผ่าน archive + create)
  const existing = await prisma.kanbanColumn.findMany({ where: { boardId: board.id } });
  for (const c of existing) await prisma.kanbanColumn.delete({ where: { id: c.id } });
  const colIds: Record<string, string> = {};
  for (const c of columns) {
    const col = await kanban.createColumn(tenantId, systemId, board.id, c);
    colIds[c] = col.id;
  }
  const cardIds: string[] = [];
  for (const [colName, specs] of Object.entries(cards)) {
    for (const spec of specs) {
      const card = await kanban.createCard({
        tenantId, systemId, columnId: colIds[colName]!, title: spec.t, description: spec.desc ?? null,
        assigneeUserId: spec.who ? staff[spec.who]!.userId : null,
        dueAt: spec.due === undefined ? null : dayFromToday(spec.due, 18),
        labels: spec.labels ?? [],
      });
      cardIds.push(card.id);
    }
  }
  return { id: board.id, columns: colIds, cardIds };
}

// บอร์ด 1 — ตามภาพ 02 (5 คอลัมน์ · 24 การ์ด)
const patong = await mkBoard(KQC.boards.patong, ["กล่องงานเข้า", "รอทำ", "กำลังทำ", "รอตรวจ", "เสร็จแล้ว"], {
  "กล่องงานเข้า": [
    { t: "ลูกค้าถามคอร์ส Open Water รอบเสาร์นี้ — ยังไม่ตอบ", labels: ["ลูกค้า", "ด่วน"], who: "pook", due: 0 },
    { t: "ขอใบเสนอราคา ทริปกลุ่มบริษัท ABC 12 คน", labels: ["งานขาย"], due: 9 },
    { t: "แจ้งซ่อม: ไฟใต้น้ำห้องล้างอุปกรณ์ดับ 2 ดวง", labels: ["ซ่อมบำรุง"] },
    { t: "หาครูสอนแทน พี่ก้อง ลาป่วย 8–9 ก.ย.", labels: ["ทีมงาน", "ด่วน"], who: "thana", due: 1 },
    { t: "ตอบรีวิว Google 3 ดาวของคุณสมหญิง", labels: ["ลูกค้า"] },
  ],
  "รอทำ": [
    { t: "เติมถังอากาศ 12 ใบ ก่อนทริปพรุ่งนี้เช้า", labels: ["ด่วน", "อุปกรณ์"], who: "kitti", due: 0 },
    { t: "ทำใบเสนอราคาทริปเรือ Sea Fox — 3 วัน 2 คืน", labels: ["งานขาย"], who: "thana", due: 11 },
    { t: "เช็คสต็อกตะกั่ว + ชุดเว็ทสูท M ก่อนสั่งเพิ่ม", labels: ["คลัง"], who: "pook" },
    { t: "ต่อทะเบียนเรือ Sea Fox (หมดอายุ 30 ก.ย.)", labels: ["เอกสาร"], who: "thana", due: 30 },
    { t: "อบรมพนักงานใหม่ 2 คน — ระบบ SHARK POS", labels: ["ทีมงาน"], who: "pook" },
    { t: "ทำป้ายราคาคอร์สใหม่ติดหน้าร้าน", labels: ["การตลาด"] },
  ],
  "กำลังทำ": [
    { t: "ซ่อมเรกกูเลเตอร์ Scubapro MK25 (2 ตัว)", labels: ["ซ่อมบำรุง"], who: "kitti", due: 1 },
    { t: "ตัดคลิปทริปสิมิลัน ลง Facebook + TikTok", labels: ["การตลาด"], who: "pook", due: 7 },
    { t: "เคลมประกันอุปกรณ์ที่หายทริปสิมิลัน 28 ส.ค.", labels: ["เอกสาร", "การเงิน"], who: "thana", due: -4 },
  ],
  "รอตรวจ": [
    { t: "ตรวจรับชุดเว็ท 10 ตัว จากผู้ขาย Aqua Thai", labels: ["คลัง", "การเงิน"], who: "pook", due: 3 },
    { t: "รอผู้จัดการอนุมัติซื้อคอมเพรสเซอร์ตัวใหม่", labels: ["การเงิน"], who: "thana" },
    { t: "รีวิวสัญญาเช่าห้องเก็บอุปกรณ์", labels: ["เอกสาร"] },
  ],
  "เสร็จแล้ว": [
    { t: "ล้างและอบชุดดำน้ำหลังทริป 3 ก.ย.", labels: ["อุปกรณ์"], who: "kitti", due: -26 },
    { t: "จ่ายค่าน้ำมันเรือ งวด ส.ค.", labels: ["การเงิน"], who: "thana", due: -27 },
    { t: "อัปเดตตารางทริปเดือน ก.ย. บนหน้าเว็บ", labels: ["การตลาด"], who: "pook", due: -28 },
    { t: "ส่งรายงานยอดขายสัปดาห์ให้เจ้าของ", labels: ["การเงิน"], who: "thana", due: -29 },
    { t: "จองที่จอดเรือเดือนหน้า", labels: ["เอกสาร"], who: "thana", due: -20 },
    { t: "เปลี่ยนโอริงถังอากาศชุดที่ 3", labels: ["อุปกรณ์"], who: "kitti", due: -15 },
    { t: "ตอบอีเมลสอบถามคอร์ส Advanced", labels: ["ลูกค้า"], who: "pook", due: -10 },
  ],
}, { unitId: units.patong, visibility: "PRIVATE", color: "BLUE", createdById: owner.userId });

// บอร์ด 2 — ซ่อมบำรุง (4 คอลัมน์ · 11 การ์ด)
const maint = await mkBoard(KQC.boards.maint, ["แจ้งเข้า", "กำลังซ่อม", "รออะไหล่", "เสร็จ"], {
  "แจ้งเข้า": [
    { t: "BCD Aqualung ตัวที่ 4 ปุ่มเติมลมค้าง", labels: ["อุปกรณ์"], who: "kitti", due: 2 },
    { t: "ไฟฉายดำน้ำ 3 กระบอกชาร์จไม่เข้า", labels: ["อุปกรณ์"] },
    { t: "คอมเพรสเซอร์เสียงดังผิดปกติ", labels: ["ด่วน"], who: "kitti", due: 0 },
  ],
  "กำลังซ่อม": [
    { t: "เรกกูเลเตอร์ Apeks XTX50 รั่วขั้นสอง", labels: ["อุปกรณ์"], who: "kitti", due: 1 },
    { t: "เปลี่ยนสายเวลาเรือ Sea Fox", labels: ["เรือ"], who: "thana", due: 4 },
  ],
  "รออะไหล่": [
    { t: "โอริงชุดใหญ่ Scubapro (สั่งจาก กทม.)", labels: ["อุปกรณ์"], who: "kitti", due: 6 },
    { t: "ใบพัดเรือลำเล็ก", labels: ["เรือ"], due: 10 },
  ],
  "เสร็จ": [
    { t: "เปลี่ยนแบตเตอรี่คอมพิวเตอร์ดำน้ำ 5 เครื่อง", labels: ["อุปกรณ์"], who: "kitti", due: -3 },
    { t: "ซ่อมซิปเว็ทสูท 2 ตัว", labels: ["อุปกรณ์"], who: "pook", due: -5 },
    { t: "ล้างถังอากาศประจำปี ชุด A", labels: ["อุปกรณ์"], who: "kitti", due: -12 },
    { t: "ตรวจเช็คเครื่องยนต์เรือ 100 ชม.", labels: ["เรือ"], who: "thana", due: -14 },
  ],
}, { visibility: "TENANT", color: "GREEN", createdById: owner.userId });

// บอร์ด 3 — ลับสาขากะตะ (ใช้ทดสอบ 404/สิทธิ์)
const kata = await mkBoard(KQC.boards.kataSecret, ["รอทำ", "เสร็จ"], {
  "รอทำ": [
    { t: "เงินเดือนทีมกะตะ เดือน ก.ย.", labels: ["การเงิน"], due: 5 },
    { t: "เรื่องร้องเรียนพนักงาน (ลับ)", labels: ["ทีมงาน"] },
  ],
  "เสร็จ": [{ t: "ประชุมสาขาประจำเดือน", due: -2 }],
}, { unitId: units.kata, visibility: "PRIVATE", color: "RED", createdById: owner.userId });

// ── 5. เฉลย ──
const expected = {
  _readme: "เฉลยของชุดข้อมูล QC บอร์ดงาน — เขียนโดย scripts/seed-kanban-qc.mts ทุกครั้งที่ seed",
  generatedAt: new Date().toISOString(),
  today: KQC.today,
  oracleValidUntil: KQC.oracleValidUntil,
  tenantId, systemId, units,
  users: { owner, manager, staff, noPerm },
  boards: {
    patong: { ...patong, unitKey: "patong", visibility: "PRIVATE", columns: patong.columns, cardCount: 24 },
    maint: { ...maint, unitKey: null, visibility: "TENANT", cardCount: 11 },
    kata: { ...kata, unitKey: "kata", visibility: "PRIVATE", cardCount: 3 },
  },
  counts: { boards: 3, cards: 38, overduePatong: 1, dueTodayPatong: 2 },
};
writeFileSync(KQC.expectedPath, JSON.stringify(expected, null, 2));
console.log(`✅ seed บอร์ดงาน: ร้าน ${tenantId} ระบบ ${systemId} · บอร์ด 3 · การ์ด ${patong.cardIds.length + maint.cardIds.length + kata.cardIds.length} · เฉลย ${KQC.expectedPath}`);
await prisma.$disconnect();
