// ทะเบียน scope ของทุก Prisma model — ใช้โดย tenant/unit guard (db.ts)
// โมดูล (Stage B/C) เพิ่มชื่อ model ของตัวเองที่นี่ผ่าน registerScopes()
// - "tenant"   : มี tenantId, inject อัตโนมัติ (Member/Point/Coupon/Chat/...)
// - "unit"     : มี tenantId + unitId, inject + บังคับ unitId (Hotel/POS/Booking/...)
// - "platform" : ตาราง backoffice — เข้าถึงผ่าน platformDb เท่านั้น
// - "global"   : ไม่ผูก tenant (Tenant, User, AuthToken, Session, PlatformUser)

export type Scope = "tenant" | "unit" | "platform" | "global";

// core models (Stage A) — FROZEN
const CORE_SCOPES: Record<string, Scope> = {
  Tenant: "global",
  BusinessUnit: "global", // ถูก guard ด้วย tenantId ในชั้น service (เป็น root ของ unit tree)
  User: "global",
  Membership: "global", // ตรวจสิทธิ์ผ่าน can() ไม่ผ่าน row-filter
  AuthToken: "global",
  Session: "global",
  PlatformUser: "platform",
  AuditLog: "tenant",
};

// module scopes (Stage B/C) — ลงทะเบียนที่นี่จนกว่าจะมี bootstrap loader
const MODULE_SCOPES: Record<string, Scope> = {
  // System instances
  AppSystem: "tenant",
  AppSystemUnit: "tenant",
  // Member
  Customer: "tenant",
  MemberActivity: "tenant",
  // Reward
  Reward: "tenant",
  RewardRedemption: "tenant",
  // Point (tenant-scoped)
  PointSettings: "tenant",
  PointLedger: "tenant",
  PointBalance: "tenant",
  // POS (unit-scoped)
  PosSale: "unit",
  PosSaleLine: "unit",
  PosPayment: "unit",
  PosReceiptCounter: "unit",
  // Booking (unit-scoped)
  BookingService: "unit",
  BookingStaff: "unit",
  BookingStaffHours: "unit",
  Appointment: "unit",
};

const REGISTRY: Record<string, Scope> = { ...CORE_SCOPES, ...MODULE_SCOPES };

/** โมดูลเรียกตอน bootstrap เพื่อลงทะเบียน scope ของ model ตัวเอง */
export function registerScopes(scopes: Record<string, Scope>): void {
  for (const [model, scope] of Object.entries(scopes)) {
    if (REGISTRY[model] && REGISTRY[model] !== scope) {
      throw new Error(
        `[scope] model "${model}" ถูกลงทะเบียนซ้ำด้วย scope ต่างกัน (${REGISTRY[model]} vs ${scope})`,
      );
    }
    REGISTRY[model] = scope;
  }
}

export function scopeOf(model: string): Scope {
  return REGISTRY[model] ?? "global";
}
