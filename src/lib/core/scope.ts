// ทะเบียน scope ของทุก Prisma model — ใช้โดย tenant/unit/system guard (db.ts)
//
// 🔴 กติกาเหล็ก: **fail-closed** — model ที่ไม่ได้ลงทะเบียน = `scopeOf()` โยน error
//    (ของเดิม `?? "global"` = ลืม register model ใหม่ → ไม่มี tenant filter → ข้อมูลข้ามร้านเงียบ ๆ)
//    + `assertRegistryComplete()` เช็คตอน boot ว่าทุก model ใน schema มีในทะเบียน
//    + fitness F1.1 เช็คตอน CI (แดงใน PR ไม่ใช่แดงบน prod)
//
// แกน (axis) — ต้องตรงกับฟิลด์จริงใน schema:
// - "global"   : ไม่ผูก tenant (Tenant, User, AuthToken, Session)
// - "platform" : ตาราง backoffice — เข้าผ่าน platformDb เท่านั้น
// - "tenant"   : มี tenantId → inject อัตโนมัติ
// - "unit"     : มี tenantId + unitId → inject + บังคับ unitId
// - "system"   : มี tenantId + systemId → inject + บังคับ systemId
//                **แกนจริงของ feature system** (systemId โผล่ 124 ครั้งใน schema)
//                ของเดิม guard ไม่รู้จักแกนนี้ → 11/15 โมดูลเลยเขียน where เอง = ข้าม guard
//
// หมายเหตุ: วันนี้ยังไม่มีโมดูลไหนเรียก tenantDb กับ model แกน "system"
// (ตรวจแล้ว: tenantDb ถูกใช้กับ model แกน unit เท่านั้น 24 ตัว — booking/hotel/ticket/restaurant)
// → การประกาศแกน system ตอนนี้ = เตรียมไว้ให้ Phase 3 port + ทำให้ทะเบียนพูดความจริง

export type ScopeAxis = "global" | "platform" | "tenant" | "unit" | "system";

export type ScopeDescriptor = {
  axis: ScopeAxis;
  /** ชื่อฟิลด์ systemId — ส่วนใหญ่ "systemId" แต่ Customer ใช้ "memberSystemId" */
  systemField?: string;
  /** เหตุผลที่ไม่ผูก tenant — บังคับเขียนเมื่อ axis = global/platform (กันใส่ global มั่ว) */
  why?: string;
};

const g = (why: string): ScopeDescriptor => ({ axis: "global", why });
const tenant: ScopeDescriptor = { axis: "tenant" };
const unit: ScopeDescriptor = { axis: "unit" };
const sys = (systemField = "systemId"): ScopeDescriptor => ({ axis: "system", systemField });

// core models (Stage A) — FROZEN
const CORE_SCOPES: Record<string, ScopeDescriptor> = {
  Tenant: g("ตัว tenant เอง"),
  User: g("ตัวตนเดียวข้าม tenant ได้ — auth ต้อง query ด้วย email/id ข้ามร้าน"),
  AuthToken: g("ใช้ตอนยังไม่รู้ว่า tenant ไหน (ขั้น login)"),
  Session: g("ผูก user ไม่ผูก tenant — 1 session สลับ tenant ได้"),
  Membership: g("auth ต้อง list membership ทุก tenant ของ user (tenant switcher) — ตรวจสิทธิ์ผ่าน can() ไม่ใช่ row filter"),
  PlatformUser: { axis: "platform", why: "backoffice — เข้าผ่าน platformDb เท่านั้น" },
  BusinessUnit: tenant,
  AuditLog: tenant,
};

// module scopes — Stage B/C
const MODULE_SCOPES: Record<string, ScopeDescriptor> = {
  // System instances (ทะเบียนระบบ — เป็น tenant-scoped เพราะ list ทั้งร้าน)
  AppSystem: tenant,
  AppSystemUnit: tenant, // ตารางเชื่อม system↔unit — query ด้วย unitId/tenantId ไม่ใช่ scope ใต้ system
  // Member — ⚠️ ใช้ชื่อฟิลด์ memberSystemId ไม่ใช่ systemId
  Customer: sys("memberSystemId"),
  MemberActivity: tenant,
  // Reward
  Reward: sys(),
  RewardRedemption: sys(),
  // Point
  PointSettings: tenant,
  PointLedger: sys(),
  PointBalance: sys(),
  // POS
  PosSale: sys(),
  PosSaleLine: unit,
  PosPayment: unit,
  PosReceiptCounter: unit,
  // Booking
  BookingService: unit,
  BookingStaff: unit,
  BookingStaffHours: unit,
  Appointment: unit,
  // Coupon
  Coupon: sys(),
  CouponRedemption: sys(),
  // Meeting
  MeetingChannel: sys(),
  MeetingChannelMember: sys(),
  MeetingMessage: sys(),
  // Kanban
  KanbanBoard: sys(),
  KanbanColumn: sys(),
  KanbanCard: sys(),
  // Account — P1 core
  AccountDocument: sys(),
  AccountDocumentLine: sys(),
  AccountDocumentPayment: sys(),
  AccountDocumentRelation: sys(),
  AccountDocSequence: sys(),
  AccountContact: sys(),
  AccountSettings: sys(),
  // Account — GL/finance/asset (P2/P3)
  AccountUnit: sys(),
  AccountProduct: sys(),
  AccountCategory: sys(),
  AccountFinance: sys(),
  AccountCheque: sys(),
  AccountLedger: sys(),
  AccountMapping: sys(),
  AccountJournalEntry: sys(),
  AccountJournalLine: sys(),
  AccountPeriod: sys(),
  AccountFixedAsset: sys(),
  AccountDepreciation: sys(),
  AccountAttachment: sys(),
  AccountSystemLink: sys(),
  // Hotel
  HotelRoomType: unit,
  HotelRoom: unit,
  HotelReservation: unit,
  // Ticket
  TicketEvent: unit,
  TicketType: unit,
  TicketOrder: unit,
  TicketAdmission: unit,
  // Chat
  ChatChannelConnection: sys(),
  ChatContact: sys(),
  ChatConversation: sys(),
  ChatMessage: sys(),
  ChatAttachment: sys(),
  ChatReadState: sys(),
  ChatConversationEvent: sys(),
  ChatQuickReply: sys(),
  ChatSetting: sys(),
  ChatWebhookLog: g("log ดิบตอนรับ webhook — ยังไม่รู้ว่า tenant ไหนจนกว่าจะ resolve connection (ตั้งใจไม่มี tenantId)"),
  // Restaurant
  RestaurantSetting: unit,
  MenuCategory: unit,
  MenuItem: unit,
  MenuOptionGroup: unit,
  MenuOptionChoice: unit,
  MenuItemOptionGroup: unit,
  KdsStation: unit,
  RestaurantZone: unit,
  RestaurantTable: unit,
  TableSession: unit,
  RestaurantDailyCounter: unit,
  RestaurantOrder: unit,
  RestaurantOrderItem: unit,
  RestaurantOrderItemOption: unit,
  RestaurantServiceRequest: unit,
  // Queue
  QueueType: unit,
  QueueCounter: unit,
  QueueCounterType: unit,
  QueuePolicy: unit,
  QueueDailySequence: unit,
  QueueTicket: unit,
  QueueTicketEvent: unit,
  QueueDisplay: unit,
};

const REGISTRY: Record<string, ScopeDescriptor> = { ...CORE_SCOPES, ...MODULE_SCOPES };

/**
 * โมดูลเรียกตอน bootstrap เพื่อลงทะเบียน scope ของ model ตัวเอง
 * รับได้ทั้งแกนสั้น ๆ ("unit") และ descriptor เต็ม ({ axis: "system", systemField: "..." })
 */
export function registerScopes(scopes: Record<string, ScopeAxis | ScopeDescriptor>): void {
  for (const [model, raw] of Object.entries(scopes)) {
    const d: ScopeDescriptor = typeof raw === "string" ? { axis: raw } : raw;
    const prev = REGISTRY[model];
    if (prev && prev.axis !== d.axis) {
      throw new Error(`[scope] model "${model}" ถูกลงทะเบียนซ้ำด้วยแกนต่างกัน (${prev.axis} vs ${d.axis})`);
    }
    REGISTRY[model] = d;
  }
}

/**
 * 🔴 fail-closed — ไม่รู้จัก = โยน ไม่ใช่เดาว่า global
 * ของเดิม `?? "global"` แปลว่า "ลืม register = ปิด tenant isolation เงียบ ๆ"
 */
export function scopeOf(model: string): ScopeDescriptor {
  const d = REGISTRY[model];
  if (!d) {
    throw new Error(
      `[scope] model "${model}" ยังไม่ได้ลงทะเบียน scope — เพิ่มใน src/lib/core/scope.ts ` +
        `(fail-closed: ห้ามเดาเป็น global เพราะจะปิด tenant isolation เงียบ ๆ)`,
    );
  }
  return d;
}

export const isRegistered = (model: string): boolean => model in REGISTRY;
export const registeredModels = (): string[] => Object.keys(REGISTRY);

/**
 * เช็คว่าทุก model ใน schema อยู่ในทะเบียน — เรียกตอน boot + ใน fitness F1.1
 * (ทะเบียนพิมพ์มือ → คนลืมได้ แต่เครื่องไม่ลืม)
 */
export function assertRegistryComplete(schemaModels: string[]): void {
  const missing = schemaModels.filter((m) => !(m in REGISTRY));
  if (missing.length) {
    throw new Error(
      `[scope] ${missing.length} model ในschema ยังไม่ได้ลงทะเบียน: ${missing.join(", ")} — ` +
        `เพิ่มใน src/lib/core/scope.ts (ไม่งั้น query จะโยนตอน runtime)`,
    );
  }
  const extra = Object.keys(REGISTRY).filter((m) => !schemaModels.includes(m));
  if (extra.length) {
    throw new Error(`[scope] ลงทะเบียน model ที่ไม่มีใน schema แล้ว: ${extra.join(", ")} — ลบออกจาก scope.ts`);
  }
}
