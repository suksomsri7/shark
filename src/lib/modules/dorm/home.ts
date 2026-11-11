// SVC D.13 ▸ โมเดลหน้าแรกหอ (หอ 01: KPI · ผัง · ต้องทำวันนี้ · รอบบิล) — สัญญา ledger/svc-briefs/svc-brief-d.13.md §4
//   • ด่าน: หน่วย DORM ของร้าน → Membership สด (ไม่เชื่อ role/permissions ใน actor) → dormAccess(สด).board · ไม่ผ่าน ⇒ null
//   • ขอบเขตอาคาร (#64): ทุกตัวเลข/ป้าย/รายการคิดเฉพาะห้องที่ผู้ดูเห็น (dormScopeFor) — ตัดฝั่งเซิร์ฟเวอร์
//   • เงิน: อ่าน DormBillRun · DormBill · PaymentSlip ตรง ๆ แบบอ่านอย่างเดียว (D.8/D.10 เขียน) · ไม่เห็นเงิน ⇒ ไม่มีตัวเลขเงินในโมเดลเลย
//   • อ่านผ่าน tenantDb + facade rooms เท่านั้น (ไม่ import prisma) · วันที่ = สตริง "YYYY-MM-DD" วันไทย (ไม่ใช้เมธอดวันที่ดิบ)
//   • ชื่อบนผัง/รายการ = ชื่อแรกของผู้เช่าเท่านั้น (ไม่มีนามสกุล/เบอร์/อีเมล)
import { tenantDb } from "@/lib/core/db";
import { bkkYmd } from "@/lib/core/quiet-hours";
import type { SettingsActor } from "@/lib/core/settings";
import { roomBoard, type RoomBoardCell } from "@/lib/modules/rooms";
import { bahtFloor, bahtText, thaiMonthShort, thaiShortDate } from "@/components/dorm/dorm-home-shared";
import { dormAccess } from "./access";
import { dormLiveMember, dormScopeFor, dormUnitOf } from "./scope";

export type DormHomeFinance = { tone: "overdue" | "pending" | "unpaid" | "paid"; text: string };
export type DormHomeTodoKind = "overdue" | "slips" | "repairs" | "moveIns" | "expiring" | "expired" | "refundDue"; // SVC D.12 ▸ expired · refundDue ◂
export type DormHomeModel = {
  unitId: string;
  unitName: string;
  basePath: string;
  date: string;
  money: boolean;
  scope: { all: boolean; buildingIds: string[] | null };
  buildings: { id: string; name: string }[];
  cells: RoomBoardCell[];
  occupantLabels: Record<string, string>;
  finance: Record<string, DormHomeFinance>;
  kpi: {
    rooms: { total: number; floors: number; byType: { name: string; count: number }[] };
    occupied: { count: number; pct: number; prevMonthCount: number; prevMonthPct: number };
    vacant: number;
    booked: number;
    repair: number;
    longestVacant: { roomNumber: string; days: number } | null;
    collected: { satang: number; paidBills: number; billCount: number; dueDate: string | null; periodKey: string } | null;
    overdue: { satang: number; rooms: string[]; maxDaysLate: number } | null;
  };
  todo: { kind: DormHomeTodoKind; count: number; textTh: string; href: string }[];
  billing: {
    periodKey: string;
    status: string;
    sentAt: string | null;
    billCount: number;
    paid: number;
    slipPending: number;
    unpaid: number;
    held: number;
    draft: number;
    totalSatang: number;
    collectedSatang: number;
    outstandingSatang: number;
  } | null;
};

const YMD_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const DAY_MS = 86_400_000;
const BOOKED_WITHIN = 31;
const SOON_DAYS = 30;
const HISTORY_DAYS = 400;
const BOOKABLE_NEXT = ["LEASE", "STAY", "HOLD", "CHANNEL_HOLD"];
const OPEN_BILL = ["SENT", "PARTIALLY_PAID"];
const SLIP_WAITING = ["PENDING", "NEEDS_REVIEW"];

const ms = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const dbDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const ymdOf = (d: Date | null | undefined): string | null => (d instanceof Date ? d.toISOString().slice(0, 10) : null);
const addDays = (ymd: string, n: number) => new Date(ms(ymd) + n * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY_MS);
const pct = (n: number, total: number) => (total > 0 ? Math.round((n * 100) / total) : 0);
const byNumber = (a: string, b: string) => a.localeCompare(b, "th", { numeric: true });
const firstName = (name: string | null | undefined): string => (name ?? "").trim().split(/\s+/)[0] ?? "";
function monthShift(period: string, n: number): string {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${String(yy).padStart(4, "0")}-${String(mm + 1).padStart(2, "0")}`;
}
/** วันสุดท้ายของเดือนก่อนหน้า (3 พ.ย. ⇒ 31 ต.ค.) */
const prevMonthEnd = (date: string) => addDays(`${date.slice(0, 7)}-01`, -1);

type CellStatus = "occupied" | "booked" | "repair" | "vacant" | "other";
function statusOf(c: RoomBoardCell, date: string): CellStatus {
  if (c.use === "LEASED" || c.use === "GUEST") return "occupied";
  if (c.use === "HOLD") return "booked";
  if (c.use === "BLOCKED") return "repair";
  if (c.use !== "VACANT") return "other";
  if (c.hkStatus === "OUT_OF_ORDER") return "repair";
  const n = c.next;
  if (n && BOOKABLE_NEXT.includes(n.kind)) {
    const d = daysBetween(date, n.startDate);
    if (d > 0 && d <= BOOKED_WITHIN) return "booked";
  }
  return "vacant";
}

function validCells(v: unknown): RoomBoardCell[] | null {
  if (!Array.isArray(v)) return null;
  return v.filter((c): c is RoomBoardCell => !!c && typeof c === "object" && typeof (c as { roomId?: unknown }).roomId === "string" && typeof (c as { number?: unknown }).number === "string");
}

export async function dormHomeModel(
  actor: SettingsActor,
  ctx: { tenantId: string },
  input: { unitId: string; date?: string; cells?: RoomBoardCell[] },
): Promise<DormHomeModel | null> {
  const tenantId = ctx?.tenantId;
  if (!input || typeof input !== "object" || !actor || typeof tenantId !== "string") return null;
  const unit = await dormUnitOf(tenantId, input.unitId);
  if (!unit) return null;
  const mem = await dormLiveMember(tenantId, actor.userId);
  if (!mem) return null;
  const acc = dormAccess(mem.ctx, unit.id);
  if (!acc.board) return null;
  const money = acc.money;
  const date = typeof input.date === "string" && YMD_RE.test(input.date) ? input.date : bkkYmd(new Date());
  const d = dbDate(date);
  const scope = await dormScopeFor(tenantId, unit.id, mem);
  const db = tenantDb({ tenantId, unitId: unit.id });
  const basePath = `/app/u/${unit.slug}/dorm`;

  // ── ห้องที่เห็น (ทุกสถานะ active ไว้ตัดบิล/ซ่อม/สัญญา · active ไว้ผัง/KPI) ──
  const scopeRooms = await db.hotelRoom.findMany({
    where: scope.all ? {} : { buildingId: { in: scope.buildingIds } },
    select: { id: true, number: true, active: true, roomTypeId: true, roomType: { select: { name: true } } },
  });
  const roomById = new Map(scopeRooms.map((r) => [r.id, r]));
  const activeIds = new Set(scopeRooms.filter((r) => r.active).map((r) => r.id));
  const scopeIds = scopeRooms.map((r) => r.id);
  const roomWhere = scope.all ? {} : { roomId: { in: scopeIds } };

  const given = validCells(input.cells);
  const rawCells = given ?? (await roomBoard({ tenantId }, { unitId: unit.id, date }));
  const seen = new Set<string>();
  const cells = rawCells.filter((c) => activeIds.has(c.roomId) && !seen.has(c.roomId) && (seen.add(c.roomId), true));
  const cellIds = cells.map((c) => c.roomId);
  const numberOf = (roomId: string) => roomById.get(roomId)?.number ?? "";

  const buildingRows = await db.roomBuilding.findMany({
    where: scope.all ? {} : { id: { in: scope.buildingIds } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });

  // ── KPI ห้อง ──
  const status = new Map(cells.map((c) => [c.roomId, statusOf(c, date)]));
  const countOf = (s: CellStatus) => cells.filter((c) => status.get(c.roomId) === s).length;
  const floors = new Set(cells.filter((c) => c.floorNo !== null).map((c) => `${c.buildingId ?? "-"}|${c.floorNo}`)).size;
  const typeCount = new Map<string, number>();
  for (const c of cells) {
    const name = roomById.get(c.roomId)?.roomType?.name ?? "ไม่ระบุประเภท";
    typeCount.set(name, (typeCount.get(name) ?? 0) + 1);
  }
  const byType = [...typeCount.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "th"));

  const prevEnd = dbDate(prevMonthEnd(date));
  const vacantIds = cells.filter((c) => status.get(c.roomId) === "vacant").map((c) => c.roomId);
  const [prevOcc, history] = await Promise.all([
    cellIds.length
      ? db.roomOccupancy.findMany({ where: { active: true, kind: { in: ["LEASE", "STAY"] }, roomId: { in: cellIds }, startDate: { lte: prevEnd }, endDate: { gt: prevEnd } }, select: { roomId: true } })
      : Promise.resolve([] as { roomId: string }[]),
    vacantIds.length
      ? db.roomOccupancy.findMany({
          where: { active: true, kind: { in: ["LEASE", "STAY"] }, roomId: { in: vacantIds }, endDate: { lte: d, gte: dbDate(addDays(date, -HISTORY_DAYS)) } },
          select: { roomId: true, endDate: true },
        })
      : Promise.resolve([] as { roomId: string; endDate: Date }[]),
  ]);
  const prevMonthCount = new Set(prevOcc.map((o) => o.roomId)).size;
  const lastEnd = new Map<string, string>();
  for (const o of history) {
    const e = ymdOf(o.endDate);
    if (e && (!lastEnd.has(o.roomId) || e > lastEnd.get(o.roomId)!)) lastEnd.set(o.roomId, e);
  }
  let longestVacant: { roomNumber: string; days: number } | null = null;
  for (const [roomId, e] of lastEnd) {
    const days = daysBetween(e, date);
    const n = numberOf(roomId);
    if (!longestVacant || days > longestVacant.days || (days === longestVacant.days && byNumber(n, longestVacant.roomNumber) < 0)) longestVacant = { roomNumber: n, days };
  }

  // ── สัญญา (ชื่อบนผัง · ผู้เช่าใหม่ · ใกล้หมด) ──
  const leases = cellIds.length
    ? await db.dormLease.findMany({
        where: { status: { in: ["DRAFT", "ACTIVE", "NOTICE"] }, roomId: { in: cellIds } },
        orderBy: [{ startDate: "asc" }, { id: "asc" }],
        select: { id: true, roomId: true, partyId: true, status: true, startDate: true, endDate: true, occupancyId: true },
      })
    : [];

  // ── เงิน (เฉพาะผู้เห็นเงิน) ──
  const run = money
    ? await db.dormBillRun.findFirst({
        where: { periodKey: { lte: monthShift(date.slice(0, 7), 1) } },
        orderBy: [{ periodKey: "desc" }],
        select: { id: true, periodKey: true, status: true, sentAt: true, dueDate: true },
      })
    : null;
  const BILL_SELECT = { id: true, roomId: true, partyId: true, periodKey: true, status: true, totalSatang: true, paidSatang: true, dueDate: true } as const;
  const [curBills, overdueRaw] = money
    ? await Promise.all([
        run ? db.dormBill.findMany({ where: { runId: run.id, status: { not: "VOID" }, ...roomWhere }, select: BILL_SELECT }) : Promise.resolve([]),
        db.dormBill.findMany({ where: { status: { in: OPEN_BILL }, dueDate: { lt: d }, ...roomWhere }, orderBy: [{ periodKey: "asc" }, { id: "asc" }], select: BILL_SELECT }),
      ])
    : [[], []];
  const owe = (b: { totalSatang: number; paidSatang: number }) => Math.max(0, b.totalSatang - b.paidSatang);
  const overdueBills = overdueRaw.filter((b) => owe(b) > 0);
  const openIds = [...new Set([...curBills.filter((b) => OPEN_BILL.includes(b.status)), ...overdueBills].map((b) => b.id))];
  const slipRows = money && openIds.length
    ? await db.paymentSlip.findMany({ where: { domain: "DORM", refType: "DORM_BILL", refId: { in: openIds }, status: { in: SLIP_WAITING } }, select: { refId: true } })
    : [];
  const withSlip = new Set(slipRows.map((s) => s.refId));

  // ── ซ่อม ──
  const repairs = cellIds.length
    ? await db.dormRepair.findMany({ where: { status: "OPEN", roomId: { in: cellIds } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { roomId: true, text: true } })
    : [];

  // ── ชื่อผู้เช่า (ชื่อแรก) ──
  const partyIds = [...new Set([...leases.map((l) => l.partyId), ...overdueBills.map((b) => b.partyId)])];
  const parties = partyIds.length ? await tenantDb({ tenantId }).party.findMany({ where: { id: { in: partyIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(parties.map((p) => [p.id, firstName(p.name)]));

  const occupantLabels: Record<string, string> = {};
  for (const c of cells) {
    const st = status.get(c.roomId);
    const mine = leases.filter((l) => l.roomId === c.roomId);
    if (st === "occupied" && c.use === "LEASED") {
      const l =
        (c.occupancy ? mine.find((x) => x.occupancyId === c.occupancy?.occupancyId) : undefined) ??
        mine.find((x) => (x.status === "ACTIVE" || x.status === "NOTICE") && (ymdOf(x.startDate) ?? "") <= date);
      const n = l ? nameOf.get(l.partyId) : undefined;
      if (n) occupantLabels[c.roomId] = n;
    } else if (st === "booked") {
      const l = mine.find((x) => x.status === "DRAFT" && (ymdOf(x.startDate) ?? "") > date);
      const n = l ? nameOf.get(l.partyId) : undefined;
      if (n) occupantLabels[c.roomId] = `${n} (ใหม่)`;
    }
  }

  // ── ป้ายเงินต่อห้อง ──
  const finance: Record<string, DormHomeFinance> = {};
  if (money) {
    const cellSet = new Set(cellIds);
    const overdueByRoom = new Map<string, { oldest: string; satang: number }>();
    for (const b of overdueBills) {
      const cur = overdueByRoom.get(b.roomId);
      overdueByRoom.set(b.roomId, { oldest: cur && cur.oldest < b.periodKey ? cur.oldest : b.periodKey, satang: (cur?.satang ?? 0) + owe(b) });
    }
    const curMonth = run ? thaiMonthShort(run.periodKey) : "";
    for (const b of curBills) {
      if (!cellSet.has(b.roomId)) continue;
      if (b.status === "PAID") finance[b.roomId] = { tone: "paid", text: `${curMonth} จ่ายแล้ว` };
      else if (OPEN_BILL.includes(b.status)) finance[b.roomId] = withSlip.has(b.id) ? { tone: "pending", text: "สลิปรอตรวจ" } : { tone: "unpaid", text: `${curMonth} ยังไม่จ่าย` };
    }
    for (const [roomId, o] of overdueByRoom) if (cellSet.has(roomId)) finance[roomId] = { tone: "overdue", text: `ค้าง ${thaiMonthShort(o.oldest)} ฿${bahtFloor(o.satang)}` };
  }

  // ── รอบบิล + KPI เงิน ──
  let billing: DormHomeModel["billing"] = null;
  let collected: DormHomeModel["kpi"]["collected"] = null;
  let overdue: DormHomeModel["kpi"]["overdue"] = null;
  if (money) {
    if (run) {
      const paid = curBills.filter((b) => b.status === "PAID");
      const open = curBills.filter((b) => OPEN_BILL.includes(b.status));
      const collectedSatang = curBills.reduce((a, b) => a + b.paidSatang, 0);
      const dueDate = ymdOf(run.dueDate) ?? curBills.map((b) => ymdOf(b.dueDate)).filter((x): x is string => !!x).sort()[0] ?? null;
      billing = {
        periodKey: run.periodKey,
        status: run.status,
        sentAt: run.sentAt ? bkkYmd(run.sentAt) : null,
        billCount: curBills.length,
        paid: paid.length,
        slipPending: open.filter((b) => withSlip.has(b.id)).length,
        unpaid: open.filter((b) => !withSlip.has(b.id)).length,
        held: curBills.filter((b) => b.status === "HELD").length,
        draft: curBills.filter((b) => b.status === "DRAFT").length,
        totalSatang: curBills.reduce((a, b) => a + b.totalSatang, 0),
        collectedSatang,
        outstandingSatang: curBills.filter((b) => b.status !== "PAID").reduce((a, b) => a + owe(b), 0),
      };
      collected = { satang: collectedSatang, paidBills: paid.length, billCount: curBills.length, dueDate, periodKey: run.periodKey };
    }
    const cutoff = run?.periodKey ?? date.slice(0, 7);
    const prev = overdueBills.filter((b) => b.periodKey < cutoff);
    const oldestDue = prev.map((b) => ymdOf(b.dueDate)).filter((x): x is string => !!x).sort()[0];
    overdue = {
      satang: prev.reduce((a, b) => a + owe(b), 0),
      rooms: [...new Set(prev.map((b) => numberOf(b.roomId)))].sort(byNumber),
      maxDaysLate: oldestDue ? daysBetween(oldestDue, date) : 0,
    };
  }

  // ── ต้องทำวันนี้ (ลำดับตายตัว · ละรายการที่เป็น 0) ──
  const todo: DormHomeModel["todo"] = [];
  const push = (kind: DormHomeTodoKind, count: number, textTh: string, href: string) => {
    if (count > 0) todo.push({ kind, count, textTh, href });
  };
  if (money) {
    const rows = [...overdueBills].sort((a, b) => byNumber(numberOf(a.roomId), numberOf(b.roomId)) || a.periodKey.localeCompare(b.periodKey));
    const months = [...new Set(rows.map((b) => thaiMonthShort(b.periodKey)))].join(" · ");
    const oldestDue = rows.map((b) => ymdOf(b.dueDate)).filter((x): x is string => !!x).sort()[0];
    const late = oldestDue ? daysBetween(oldestDue, date) : 0;
    const items = rows.map((b) => `${numberOf(b.roomId)} ${nameOf.get(b.partyId) ?? ""} ฿${bahtText(owe(b))}`.replace(/\s+/g, " ")).join(" · ");
    push("overdue", rows.length, `ค้างจ่าย ${months} เลยกำหนด ${late} วัน — ${items}`, `${basePath}?finance=overdue`);
    const slipBills = [...new Map([...curBills, ...overdueBills].filter((b) => withSlip.has(b.id)).map((b) => [b.id, b])).values()];
    const slipRooms = [...new Set(slipBills.map((b) => numberOf(b.roomId)))].sort(byNumber);
    push("slips", slipBills.length, `สลิปรอตรวจ — ${slipRooms.join(" · ")}`, `${basePath}?finance=pending`);
  }
  push("repairs", repairs.length, `แจ้งซ่อมใหม่ — ${repairs.map((r) => `${numberOf(r.roomId)} ${r.text}`).join(" · ")}`, `${basePath}?status=REPAIR`);
  const soon = addDays(date, SOON_DAYS);
  const moveIns = leases
    .filter((l) => l.status === "DRAFT" && (ymdOf(l.startDate) ?? "") > date && (ymdOf(l.startDate) ?? "") <= soon)
    .sort((a, b) => (ymdOf(a.startDate) ?? "").localeCompare(ymdOf(b.startDate) ?? "") || byNumber(numberOf(a.roomId), numberOf(b.roomId)));
  push(
    "moveIns",
    moveIns.length,
    `ผู้เช่าใหม่เข้า — ${moveIns.map((l) => `${numberOf(l.roomId)} ${nameOf.get(l.partyId) ?? ""} เข้า ${thaiShortDate(ymdOf(l.startDate) ?? "")}`.replace(/\s+/g, " ")).join(" · ")}`,
    `${basePath}/tenants?tab=BOOKED`,
  );
  const expiring = leases
    .filter((l) => (l.status === "ACTIVE" || l.status === "NOTICE") && !!ymdOf(l.endDate) && ymdOf(l.endDate)! >= date && ymdOf(l.endDate)! <= soon)
    .sort((a, b) => byNumber(numberOf(a.roomId), numberOf(b.roomId)));
  push("expiring", expiring.length, `สัญญาหมดภายใน ${SOON_DAYS} วัน — ${expiring.map((l) => numberOf(l.roomId)).join(" · ")}`, `${basePath}/tenants?tab=EXPIRING`);
  // SVC D.12 ▸ (หนี้ D.9 Q4) สัญญาเลยวันจบแต่ยังไม่ปิด (ไม่มีสัญญาต่อ · ไม่มีใบย้ายออก) · ใบย้ายออกที่ถึงวันออกแล้วแต่ยังไม่คืนเงินประกัน ◂
  const endedRaw = await db.dormLease.findMany({
    where: { status: "ACTIVE", endDate: { lt: d }, ...roomWhere },
    orderBy: [{ endDate: "asc" }, { id: "asc" }],
    select: { id: true, roomId: true },
    take: 200,
  });
  const endedIds = endedRaw.map((l) => l.id);
  const [renewedRows, moRows] = endedIds.length
    ? await Promise.all([
        db.dormLease.findMany({ where: { previousLeaseId: { in: endedIds } }, select: { previousLeaseId: true } }),
        db.dormMoveOut.findMany({ where: { leaseId: { in: endedIds }, status: { not: "CANCELLED" } }, select: { leaseId: true } }),
      ])
    : [[], []];
  const skipEnded = new Set([...renewedRows.map((r) => r.previousLeaseId ?? ""), ...moRows.map((r) => r.leaseId)]);
  const expired = endedRaw.filter((l) => !skipEnded.has(l.id) && roomById.has(l.roomId)).sort((a, b) => byNumber(numberOf(a.roomId), numberOf(b.roomId)));
  push("expired", expired.length, `สัญญาเลยวันจบแล้วยังไม่ต่อ/ไม่แจ้งย้ายออก — ห้อง ${expired.map((l) => numberOf(l.roomId)).join(" · ")}`, `${basePath}/tenants?tab=CURRENT`);
  const dueMo = (
    await db.dormMoveOut.findMany({
      where: { status: { in: ["NOTICE", "INSPECTED"] }, moveOutDate: { lte: d } },
      orderBy: [{ moveOutDate: "asc" }, { id: "asc" }],
      select: { leaseId: true, moveOutDate: true, refundDueAt: true, lease: { select: { roomId: true } } },
      take: 200,
    })
  ).filter((m) => roomById.has(m.lease.roomId));
  const dueRooms = [...dueMo].sort((a, b) => byNumber(numberOf(a.lease.roomId), numberOf(b.lease.roomId)));
  push(
    "refundDue",
    dueRooms.length,
    `ต้องคืนเงินประกันผู้เช่าที่ย้ายออก — ${dueRooms.map((m) => `ห้อง ${numberOf(m.lease.roomId)}${m.refundDueAt ? ` (ครบ ${thaiShortDate(addDays(bkkYmd(m.refundDueAt), -1))})` : ""}`).join(" · ")}`,
    dueRooms.length ? `${basePath}/moveout?room=${encodeURIComponent(numberOf(dueRooms[0].lease.roomId))}` : `${basePath}/tenants?tab=ENDED`,
  );
  // ◂ SVC D.12

  const occupied = countOf("occupied");
  return {
    unitId: unit.id,
    unitName: unit.name,
    basePath,
    date,
    money,
    scope: scope.all ? { all: true, buildingIds: null } : { all: false, buildingIds: scope.buildingIds },
    buildings: buildingRows.map((b) => ({ id: b.id, name: b.name })),
    cells,
    occupantLabels,
    finance,
    kpi: {
      rooms: { total: cells.length, floors, byType },
      occupied: { count: occupied, pct: pct(occupied, cells.length), prevMonthCount, prevMonthPct: pct(prevMonthCount, cells.length) },
      vacant: countOf("vacant"),
      booked: countOf("booked"),
      repair: countOf("repair"),
      longestVacant,
      collected,
      overdue,
    },
    todo,
    billing,
  };
}
