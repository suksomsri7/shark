import { prisma, tenantDb } from "@/lib/core/db";
import { getSetting } from "./menu";
import { kitchenOpenNow } from "./scope";
import { createOrder, type CartLine } from "./order";
import "./scope";

// resolve unit จาก slug (public/no-auth) → tenant+unit (type RESTAURANT, ACTIVE)
export async function resolveUnit(tenantSlug: string, unitSlug: string) {
  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || tenant.status !== "ACTIVE") return null;
  const unit = await prisma.businessUnit.findUnique({
    where: { tenantId_slug: { tenantId: tenant.id, slug: unitSlug } },
  });
  if (!unit || unit.status !== "ACTIVE" || unit.type !== "RESTAURANT") return null;
  return { tenant, unit };
}

// เมนู public: หมวด/เมนู กรอง 86/ซ่อน/นอกเวลาแล้ว + สถานะครัว
export async function publicMenu(tenantId: string, unitId: string) {
  const db = tenantDb({ tenantId, unitId });
  const setting = await getSetting(tenantId, unitId);
  const kitchen = kitchenOpenNow(setting);
  const [categories, items] = await Promise.all([
    db.menuCategory.findMany({
      where: { archivedAt: null, isVisible: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    db.menuItem.findMany({
      where: { archivedAt: null, status: "ACTIVE" },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        optionGroups: {
          orderBy: { sortOrder: "asc" },
          include: { group: { include: { choices: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } } } },
        },
      },
    }),
  ]);
  // กรองหมวดตามช่วงเวลา (availableFrom/To)
  const nowMin = new Date(Date.now() + 7 * 3_600_000);
  const cur = nowMin.getUTCHours() * 60 + nowMin.getUTCMinutes();
  const inWindow = (from?: string | null, to?: string | null) => {
    if (!from || !to) return true;
    const [fh, fm] = from.split(":").map(Number);
    const [th, tm] = to.split(":").map(Number);
    return cur >= fh * 60 + fm && cur <= th * 60 + tm;
  };
  const visibleCats = categories.filter((c) => inWindow(c.availableFrom, c.availableTo));
  const byCat = new Map<string, typeof items>();
  for (const it of items) {
    const arr = byCat.get(it.categoryId) ?? [];
    arr.push(it);
    byCat.set(it.categoryId, arr);
  }
  return {
    kitchen,
    serviceChargeBps: setting.serviceChargeBps,
    categories: visibleCats
      .map((c) => ({ id: c.id, name: c.name, nameEn: c.nameEn, items: byCat.get(c.id) ?? [] }))
      .filter((c) => c.items.length > 0),
  };
}

// resolve session จาก qrToken → get-or-create OPEN (ตาม merge chain 1 ชั้น)
export async function resolveTableSession(
  tenantId: string,
  unitId: string,
  qrToken: string,
): Promise<{ ok: true; sessionId: string; tableName: string } | { ok: false; reason: string }> {
  const table = await prisma.restaurantTable.findFirst({ where: { tenantId, unitId, qrToken } });
  if (!table) return { ok: false, reason: "ไม่พบโต๊ะ (QR ไม่ถูกต้อง)" };
  if (table.status !== "ACTIVE") return { ok: false, reason: "โต๊ะนี้ปิดใช้งานอยู่" };

  try {
    const s = await prisma.$transaction(async (tx) => {
      const open = await tx.tableSession.findFirst({ where: { tenantId, unitId, tableId: table.id, status: "OPEN" } });
      if (open) return open.id;
      // โต๊ะนี้เพิ่งถูก merge เข้าโต๊ะอื่น? (MERGED ล่าสุด → ใช้ปลายทาง)
      const merged = await tx.tableSession.findFirst({
        where: { tenantId, unitId, tableId: table.id, status: "MERGED" },
        orderBy: { closedAt: "desc" },
      });
      if (merged?.mergedIntoId) {
        const into = await tx.tableSession.findFirst({ where: { id: merged.mergedIntoId, status: "OPEN" } });
        if (into) return into.id;
      }
      const created = await tx.tableSession.create({ data: { tenantId, unitId, tableId: table.id } });
      return created.id;
    });
    return { ok: true, sessionId: s, tableName: table.name };
  } catch {
    const again = await prisma.tableSession.findFirst({ where: { tenantId, unitId, tableId: table.id, status: "OPEN" } });
    if (again) return { ok: true, sessionId: again.id, tableName: table.name };
    return { ok: false, reason: "เปิดโต๊ะไม่สำเร็จ ลองใหม่" };
  }
}

// สถานะโต๊ะสำหรับลูกค้า (ออเดอร์รวมโต๊ะ + สถานะรายจาน + บิลโดยประมาณ)
export async function tableStatusForGuest(tenantId: string, unitId: string, sessionId: string) {
  const db = tenantDb({ tenantId, unitId });
  const session = await db.tableSession.findFirst({
    where: { id: sessionId },
    include: {
      table: true,
      orders: {
        where: { status: { notIn: ["CANCELLED"] } },
        orderBy: { createdAt: "asc" },
        include: { items: { where: { kdsStatus: { not: "CANCELLED" } }, include: { options: true } } },
      },
      serviceRequests: { where: { status: { in: ["PENDING", "ACKED"] } } },
    },
  });
  if (!session) return null;
  const setting = await getSetting(tenantId, unitId);
  let subtotal = 0;
  for (const o of session.orders) for (const it of o.items) subtotal += it.lineTotal;
  const serviceCharge = Math.floor((subtotal * setting.serviceChargeBps) / 10000);
  return {
    status: session.status,
    tableName: session.table.name,
    memberLinked: !!session.memberId,
    orders: session.orders,
    subtotalSatang: subtotal,
    serviceChargeSatang: serviceCharge,
    totalSatang: subtotal + serviceCharge,
    hasBillRequest: session.serviceRequests.some((r) => r.type === "REQUEST_BILL"),
    hasCallRequest: session.serviceRequests.some((r) => r.type === "CALL_STAFF"),
  };
}

// ลูกค้าสั่งอาหารผ่าน QR
export async function placeGuestOrder(input: {
  tenantId: string;
  unitId: string;
  qrToken: string;
  cart: CartLine[];
  note?: string;
  guestToken?: string;
}) {
  const resolved = await resolveTableSession(input.tenantId, input.unitId, input.qrToken);
  if (!resolved.ok) return { ok: false as const, err: { code: "SESSION_GONE" as const, reason: resolved.reason } };
  const res = await createOrder({
    tenantId: input.tenantId,
    unitId: input.unitId,
    type: "DINE_IN",
    sessionId: resolved.sessionId,
    cart: input.cart,
    note: input.note,
    guestToken: input.guestToken,
  });
  return res.ok ? { ok: true as const, id: res.id, dailyNo: res.dailyNo, sessionId: resolved.sessionId } : res;
}
