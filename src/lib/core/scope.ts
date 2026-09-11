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
  PushDevice: g("ผูก user (mobile push) — tenantId เป็นแค่ hint กิจการ active ตอนลงทะเบียน"),
  Membership: g("auth ต้อง list membership ทุก tenant ของ user (tenant switcher) — ตรวจสิทธิ์ผ่าน can() ไม่ใช่ row filter"),
  PlatformUser: { axis: "platform", why: "backoffice — เข้าผ่าน platformDb เท่านั้น" },
  BusinessUnit: tenant,
  AuditLog: tenant,
};

// module scopes — Stage B/C
const MODULE_SCOPES: Record<string, ScopeDescriptor> = {
  // Outbox (kernel — side effects post-commit · WO-0002)
  OutboxEvent: tenant,
  // Party (WO 3.1) — ตัวตนกลางระดับ tenant ข้ามทุกระบบ (ตรงข้าม AccountContact ที่ scope ต่อ systemId)
  Party: tenant,
  PartyMergeCandidate: tenant,
  // Business DNA (M3 — WO-0005)
  DnaProfile: tenant,
  DnaBlueprint: tenant,
  // CRM (ระบบ 19 — WO-0009)
  CrmContact: sys(),
  CrmPipeline: sys(),
  CrmStage: sys(),
  CrmDeal: sys(),
  CrmActivity: sys(),
  // Inventory (ระบบ 18 — WO-0011)
  InvItem: sys(),
  InvCategory: sys(),
  InvSettings: sys(),
  InvItemImage: sys(),
  InvMovement: sys(),
  InvLocation: sys(),
  InvLocationStock: sys(),
  InvLot: sys(),
  // HR (ระบบ 17 — WO-0012)
  HrEmployee: sys(),
  HrAttendance: sys(),
  HrLeave: sys(),
  HrWorkSchedule: sys(),
  HrEmployeeDoc: sys(),
  Page: unit,
  PageWidget: tenant,
  PageMember: tenant,
  // Marketing (ระบบ 20 — WO-0013)
  MktCampaign: sys(),
  MktRecipient: sys(),
  // M3.2 — สถิติต่อ variant ของแคมเปญ (อยู่ในระบบ MARKETING เดียวกับตัวแคมเปญ)
  CampaignVariantStat: sys(),
  // AI Layer (WO-0014) — ผู้ช่วยผูกกิจการ ไม่ผูก system
  AiConversation: tenant,
  AiMessage: tenant,
  AiUsage: tenant,
  AiUsageWindow: tenant,
  // กระเป๋าเครดิต AI (prepaid) — แถว tenantId="__platform__" = บัญชีกลางของแพลตฟอร์ม
  // (เข้าผ่าน prisma ตรงใน lib/ai/credit.ts เท่านั้น ไม่ผ่าน tenantDb)
  AiSettings: tenant,
  AiCreditWallet: tenant,
  AiCreditTxn: tenant,
  AiProposal: tenant,
  AiTrainingSample: tenant,
  AiMemory: tenant,
  AiPlan: tenant,
  AiScheduledTask: tenant,
  AiFeedback: tenant,
  AiPromptTweak: { axis: "platform", why: "ปรับ prompt AI ระดับแพลตฟอร์ม (ทุกร้าน) — เข้าผ่าน src/lib/platform เท่านั้น" }, // Phase 3.5 — ข้อเสนอการกระทำ (WO-0020)
  // Observability (WO-0041) — logger กลางเขียน · backoffice อ่าน (ข้ามร้านโดยเจตนา)
  OpsEvent: { axis: "platform", why: "ops log ข้ามร้าน — เขียนผ่าน core/ops.ts อ่านทาง backoffice" },
  OpsAlertState: { axis: "platform", why: "สถานะ throttle alert — ไม่ใช่ข้อมูลร้าน" },
  // Backoffice (WO-0019) — แยกจากร้านโดยสิ้นเชิง เข้าผ่าน src/lib/platform เท่านั้น
  PlatformAuthToken: { axis: "platform", why: "backoffice auth — tenantDb ห้ามแตะ" },
  PlatformSession: { axis: "platform", why: "backoffice session — tenantDb ห้ามแตะ" },
  // Support Desk (WO-0021) — ฝั่งร้าน tenant-scoped · ฝั่ง platform อ่านข้ามร้านผ่าน src/lib/platform
  SupportCase: tenant,
  SupportMessage: tenant,
  PlatformAuditLog: { axis: "platform", why: "audit การกระทำฝั่งแพลตฟอร์ม — tenantDb ห้ามแตะ" },
  // การเงิน (WO-0023) + storage (WO-0024)
  PaymentProfile: tenant,
  PlatformInvoice: tenant, // ร้านอ่านของตัวเอง · backoffice เขียนผ่าน src/lib/platform (prisma ตรง)
  FileAsset: tenant,
  // Automation (WO-0026)
  AutomationRule: tenant,
  AutomationRun: tenant,
  AppNotification: tenant,
  // ประกาศระบบ (WO-0031) — ประกาศเป็น global (ทุกร้านอ่านฉบับ published) · dismiss ต่อร้าน
  PlatformAnnouncement: g("ประกาศถึงทุกร้าน — เขียนได้เฉพาะ backoffice (src/lib/platform)"),
  AnnouncementDismiss: tenant,
  // Approval Engine (WO-0049) — กติกากลางใช้ข้ามระบบย่อยในร้าน
  ApprovalPolicy: tenant,
  ApprovalStep: tenant,
  ApprovalRequest: tenant,
  ApprovalDecision: tenant,
  // Payroll (WO-0036)
  HrSalaryProfile: sys(),
  HrPayrollRun: sys(),
  HrPayrollItem: sys(),
  HrPayAdjustment: sys(),
  // Subscription (WO-0027) + Procurement (WO-0028)
  MemberPlan: sys(),
  MemberSubscription: sys(),
  Supplier: sys(),
  PurchaseOrder: sys(),
  PoLine: tenant, // ลูกของ PO — query ผ่าน poId + tenantId
  // Clinic (WO-0052)
  PatientRecord: unit,
  ClinicVisit: unit,
  ClinicAppointment: unit, // คำขอนัด public (WO clinic public)
  // School (WO-0051) + Delivery (WO-0060)
  SchoolCourse: unit,
  SchoolClass: unit,
  SchoolEnrollment: unit,
  SchoolAttendance: tenant, // ลูกของ enrollment — query ผ่าน enrollmentId + tenantId
  Shipment: unit,
  // Dashboard builder (WO-0056) + Marketplace (WO-0063)
  TenantDashboard: tenant,
  TenantInstall: tenant,
  // White label (WO-0064) + ธีมกิจการ (B1)
  TenantBranding: tenant,
  // "แจ้งปัญหาการใช้งาน" (B1 · T8) — เรื่องที่ผู้ใช้ของร้านแจ้งเข้ามา
  IssueReport: tenant,
  // Rental (WO-0050)
  RentalAsset: unit,
  RentalBooking: unit,
  // Report builder (WO-0055)
  ReportDef: tenant,
  // คลังความรู้ (WO-0073)
  KbArticle: tenant,
  // Public API (WO-0061) + Webhooks ขาออก (WO-0062)
  ApiKey: tenant,
  ApiIdempotency: tenant, // กันคำสั่งซ้ำของ REST บัญชี (WO A1) — คิวรีด้วย keyId+idemKey ภายใต้ tenant
  WebhookEndpoint: tenant,
  WebhookDelivery: tenant,
  // Form builder (WO-0054)
  FormDef: tenant,
  FormSubmission: tenant,
  // E-commerce (WO-0053)
  ShopProduct: unit,
  ShopOrder: unit,
  ShopOrderLine: tenant, // ลูกของ order — query ผ่าน orderId + tenantId (แบบ PoLine)
  // System instances (ทะเบียนระบบ — เป็น tenant-scoped เพราะ list ทั้งร้าน)
  AppSystem: tenant,
  AppSystemUnit: tenant, // ตารางเชื่อม system↔unit — query ด้วย unitId/tenantId ไม่ใช่ scope ใต้ system
  // Member — ⚠️ ใช้ชื่อฟิลด์ memberSystemId ไม่ใช่ systemId
  Customer: sys("memberSystemId"),
  MemberTierConfig: tenant, // เกณฑ์ระดับสมาชิกของร้าน (เจ้าของกำหนดเอง)
  MemberActivity: tenant,
  // ── ระบบสมาชิก v2 (M1.1) — 18 ตารางใหม่ ──
  // กติกาเลือกแกน: ตารางที่มี `systemId` ของระบบ MEMBER (ตั้งค่าต่อระบบ) = sys()
  //   ตารางที่แขวนกับ "ตัวลูกค้า" (customerId) = tenant — เพราะ 1 ลูกค้าอยู่ระบบเดียวอยู่แล้ว
  //   (Customer.memberSystemId เป็นตัวคุม) และหน้ารวม/PDPA ต้องกวาดข้ามระบบภายในร้านเดียวกัน
  MemberSection: sys(),
  MemberField: sys(),
  MemberFieldValue: tenant,
  MemberFieldValueHistory: tenant,
  MemberAddress: tenant,
  MemberConsent: tenant,
  MemberPrivacyPolicy: sys(),
  MemberSensitivePolicy: sys(),
  MemberAccessLog: tenant,
  MemberPrivacyRequest: tenant,
  MemberSavedView: sys(),
  MemberTag: sys(),
  MemberSegment: sys(), // M3.1 — กลุ่มลูกค้าเป็นของ "ระบบสมาชิก" หนึ่งระบบ (เงื่อนไขอ้างฟิลด์/ระดับของระบบนั้น)
  MemberChannelIdentity: tenant, // ค้นด้วย (tenantId, channel, externalId) — ขาเข้ายังไม่รู้ระบบ
  // M3.2 — เครื่องของลูกค้าที่รับ push (ค้นด้วย token ตอนแอปลงทะเบียน ซึ่งยังไม่รู้ระบบสมาชิก)
  MemberPushDevice: tenant,
  // M2.9 — ตัวตนของ "ลูกค้า" ฝั่ง `/m/*` (คนละตารางกับ Session ของพนักงาน)
  //   แกน tenant: ค้นด้วย tokenHash/otpId ก่อนรู้ว่าเป็นระบบสมาชิกไหน (Customer.memberSystemId เป็นตัวคุมต่อ)
  CustomerSession: tenant,
  CustomerOtp: tenant,
  AcquisitionLink: sys(),
  MemberAttribution: tenant,
  MemberTierDef: sys(),
  MemberTierBenefit: tenant, // ลูกของ TierDef — query ผ่าน tierDefId + tenantId
  MemberTierHistory: tenant,
  // Reward
  Reward: sys(),
  RewardRedemption: sys(),
  // Point
  PointSettings: tenant,
  PointLedger: sys(),
  PointBalance: sys(),
  // แต้ม v2 (M2.1) — กฎ/ล็อตผูกกับ "ระบบแต้ม" · การโอนผูกกับตัวลูกค้า (คู่โอนอยู่ร้านเดียวกันเสมอ)
  PointRule: sys(),
  PointLot: sys(),
  PointTransfer: tenant,
  // M2.2 — คำขอปรับแต้มมือที่รอสายอนุมัติ ผูกกับ "ระบบแต้ม" เหมือน PointRule/PointLot
  PointAdjustRequest: sys(),
  // บัตรกำนัล (M2.6) — บัตร/ตั้งค่าผูกกับ "ระบบสมาชิก" · รายการบนบัตรผูกกับตัวบัตร (query ผ่าน giftCardId + tenantId)
  GiftCard: sys(),
  GiftCardSettings: sys(),
  GiftCardTxn: tenant,
  // voucher (M2.5) — เทมเพลต/ใบ/คำขอออกเป็นชุด ผูกกับ "ระบบสมาชิก" ทั้งหมด
  //   (ใบผูก systemId ตรง ๆ ไม่ผ่าน templateId เพราะใบ adhoc ไม่มีเทมเพลต)
  VoucherTemplate: sys(),
  Voucher: sys(),
  VoucherIssueBatch: sys(),
  // สแตมป์การ์ด (M2.3) — ตัวใบผูกกับ "ระบบสมาชิก" · ใบของลูกค้า/เหตุการณ์ผูกกับตัวใบ (query ผ่าน cardId/progressId + tenantId)
  StampCard: sys(),
  StampCardProgress: tenant,
  StampEvent: tenant,
  // POS
  PosSale: sys(),
  PosSaleLine: unit,
  PosPayment: unit,
  PosReceiptCounter: unit,
  // Booking
  BookingService: unit,
  BookingStaff: unit,
  BookingStaffHours: unit,
  BookingHours: unit,
  BookingClosure: unit,
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
  KanbanLabel: sys(),
  // ตาราง join ของ Kanban (K1.2) — มีแต่ `tenantId` ไม่มี `systemId` (กรอง systemId ที่การ์ด/ป้ายต้นทาง)
  // แกนต้องตรงกับฟิลด์จริงใน schema ⇒ ประกาศเป็น tenant ไม่ใช่ sys() ไม่งั้น guard จะ inject
  // `systemId` ที่ไม่มีอยู่จริงแล้วพังตอนใครสักคนเริ่มใช้ tenantDb กับมันใน Phase 3
  KanbanCardLabel: tenant,
  KanbanCardAssignee: tenant,
  // สมาชิกบอร์ด + ดาว (K1.3) — เหตุผลเดียวกัน: มีแต่ `tenantId` (systemId อยู่ที่บอร์ดต้นทาง)
  KanbanBoardMember: tenant,
  KanbanBoardStar: tenant,
  // เช็คลิสต์ (K1.7) — เหตุผลเดียวกัน: มีแต่ `tenantId` (systemId อยู่ที่การ์ดต้นทาง)
  KanbanChecklist: tenant,
  KanbanChecklistItem: tenant,
  // ความเห็นในการ์ด (K1.8) — เหตุผลเดียวกัน: มีแต่ `tenantId` (systemId อยู่ที่การ์ดต้นทาง)
  KanbanComment: tenant,
  // ไฟล์แนบ (K1.9) — เหตุผลเดียวกัน: มีแต่ `tenantId` (systemId อยู่ที่การ์ดต้นทาง)
  KanbanAttachment: tenant,
  // ประวัติกิจกรรม (K1.10) — เหตุผลเดียวกัน: มีแต่ `tenantId` (systemId อยู่ที่บอร์ด/การ์ดต้นทาง)
  KanbanActivity: tenant,
  // K1.13 — undo token (ปัดเสร็จ/เก็บบนมือถือ) มี tenantId+systemId เหมือน KanbanBoard/Card
  KanbanUndoToken: sys(),
  // K2.5 — มุมมองที่บันทึกไว้ · มี tenantId+systemId เสมอ (boardId เป็น null ได้จาก K3.8 แต่ไม่กระทบแกน scope)
  KanbanBoardView: sys(),
  // K2.6 — ฟิลด์กำหนดเอง (นิยาม+ค่า) — เหตุผลเดียวกับ KanbanBoardMember/KanbanChecklist: มีแต่ `tenantId`
  // (systemId อยู่ที่บอร์ด/การ์ดต้นทาง) ⇒ แกน tenant ไม่ใช่ sys() ให้ตรงกับฟิลด์จริงใน schema
  KanbanCustomField: tenant,
  KanbanCustomFieldValue: tenant,
  // K2.7 — เทมเพลตการ์ด · มีทั้ง tenantId+systemId เหมือน KanbanBoard/Card ⇒ แกน sys()
  KanbanCardTemplate: sys(),
  // K2.8 — กล่องงานเข้าส่วนตัว · มีทั้ง tenantId+systemId เหมือน KanbanBoard/Card ⇒ แกน sys()
  KanbanInboxItem: sys(),
  // K2.11 — ติดตามการ์ด/คอลัมน์/บอร์ด · มีทั้ง tenantId+systemId ⇒ แกน sys()
  KanbanWatcher: sys(),
  // K3.1 — เชื่อมการ์ดกับวัตถุของโมดูลอื่น · มีทั้ง tenantId+systemId เหมือน KanbanCard ⇒ แกน sys()
  KanbanCardLink: sys(),
  // K2.11 — หลักฐานอีเมลสรุปที่ส่งไปแล้ว (1 ฉบับ/คน/รอบ) · มีแต่ tenantId (ไม่ผูกระบบใดระบบหนึ่ง
  // เพราะสรุปคือ "งานของฉันในร้านนี้" ข้ามทุกบอร์ดของร้าน) ⇒ แกน tenant เหมือน join table อื่น
  KanbanDigestSent: tenant,
  // เทมเพลตบอร์ด (K1.12) — tenantId เป็น null ได้ (แพลตฟอร์ม) ⇒ แกน global ไม่ใช่ tenant
  // (ผิดจาก join table อื่นข้างบน: ตารางนี้มีทั้งแถวไม่ผูก tenant และแถวผูก tenant ปนกัน
  // ถ้าลงเป็น tenant แล้ว tenantDb() ถูกเรียกวันหน้า จะกรอง tenantId=ปัจจุบันทับ WHERE เดิม
  // ⇒ แถวแพลตฟอร์ม tenantId=null หายไปเงียบ ๆ — โมดูลนี้ query ตรงผ่าน raw prisma อยู่แล้วเสมอ
  // และกรอง tenantId เอง (`templates.ts`) ไม่ผ่าน tenantDb() จึงไม่กระทบพฤติกรรมจริงวันนี้)
  KanbanBoardTemplate: g("เทมเพลตบอร์ด — tenantId null (แพลตฟอร์ม) หรือของร้าน (TENANT) ปนกัน · service กรอง tenantId เองทุกจุด ไม่ผ่าน tenantDb()"),
  // Account — P1 core
  AccountDocument: sys(),
  AccountDocumentLine: sys(),
  AccountDocumentPayment: sys(),
  AccountDocumentRelation: sys(),
  AccountDocSequence: sys(),
  AccountDocTag: sys(), // WO 8.1 — นิยามแท็กเอกสาร (§9.2)
  AccountContact: sys(),
  AccountContactGroup: sys(),
  AccountContactGroupMember: sys(),
  AccountSettings: sys(),
  // Account — GL/finance/asset (P2/P3)
  AccountUnit: sys(),
  AccountProduct: sys(),
  // WO 4.3 (บัญชี V2 §8.2) — สูตรรายการจัดชุด + ยอดยกมาของสินค้า (ผูก tenantId+systemId ทั้งคู่)
  AccountProductBundleItem: sys(),
  AccountProductOpeningLot: sys(),
  AccountCategory: sys(),
  AccountFinance: sys(),
  // WO 5.1 (บัญชี V2 §10.1) — ยอดยกมาหลายรายการ + โอนระหว่างช่องทาง ของ AccountFinance (ผูก tenantId+systemId ทั้งคู่)
  AccountFinanceOpening: sys(),
  AccountFinanceTransfer: sys(),
  // WO 5.3 (บัญชี V2 §10.2) — กระทบยอดธนาคาร (statement ที่นำเข้า + แถวในนั้น)
  AccountBankStatement: sys(),
  AccountBankStatementLine: sys(),
  AccountCheque: sys(),
  // WO 5.4 (บัญชี V2 §10.5) — บันทึกการนำส่ง ภ.ง.ด.3/53 ต่องวด
  AccountWhtFiling: sys(),
  AccountVatFiling: sys(), // V2 (WO 6.2 §11.4): ทำเครื่องหมายยื่น ภ.พ.30 ต่องวด — ใช้ในเช็กลิสต์ปิดงวด
  // WO 5.5 (บัญชี V2 §0.3 ข้อ 5) — คำขอชำระเงินผ่านลิงก์+QR PromptPay (ผูก tenantId+systemId)
  //   ทางเข้าที่ยังไม่รู้ร้าน (webhook ของผู้ให้บริการ · ลิงก์สาธารณะ · cron หมดอายุ) อ่านผ่าน
  //   ตัวเข้าถึงใน service.ts ที่ตั้งใจไม่ผูก scope — ตัว token/chargeId เองคือ capability
  AccountPaymentRequest: sys(),
  AccountLedger: sys(),
  AccountMapping: sys(),
  AccountJournalEntry: sys(),
  AccountJournalLine: sys(),
  AccountPeriod: sys(),
  AccountFixedAsset: sys(),
  AccountDepreciation: sys(),
  AccountAttachment: sys(),
  AccountSystemLink: sys(),
  // Account — เอกสารประจำ (V2 · WO 1.9)
  AccountRecurringRule: sys(),
  AccountRecurringRun: sys(),
  // Account — soft-undo 5 นาที (V2 · WO 9.4)
  AccountUndoToken: sys(),
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
  // WO-CV2 — ค่าตั้งของคนต่อห้อง (ปิดเสียง) มี tenantId + systemId ครบ ⇒ แกน system เหมือนพี่น้อง
  // 🔴 ลืมลงทะเบียน = fitness F1.1 แดง และ query โยนตอน runtime (fail-closed ตั้งใจให้เป็นแบบนั้น)
  ChatConversationPref: sys(),
  ChatConversationEvent: sys(),
  ChatQuickReply: sys(),
  ChatSetting: sys(),
  // WO-CW1 — ทั้งคู่มี tenantId + systemId ครบ และเป็น "ข้อมูลของร้าน" ที่ต้องกันข้ามร้านเด็ดขาด
  // (prompt ของ AI ประกอบจากตารางนี้ — หลุดข้ามร้าน = คำตอบของร้าน A ไปโผล่ให้ลูกค้าร้าน B)
  ChatAiSuggestion: sys(),
  ChatAnswerExample: sys(),
  ChatWebhookLog: g("log ดิบตอนรับ webhook — ยังไม่รู้ว่า tenant ไหนจนกว่าจะ resolve connection (ตั้งใจไม่มี tenantId)"),
  ChatRateBucket: g("bucket นับ rate limit ต่อ key ดิบ (ip/connectionId) — สร้างก่อนรู้ tenant (ตั้งใจไม่มี tenantId)"),
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
