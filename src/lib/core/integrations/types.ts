// types.ts — ศูนย์เชื่อมต่อ (SVC R0.5 · CC §2.1/§2.4) — ชนิดล้วน ไม่มี I/O ไม่มีค่าลับ
// ไฟล์ฝั่ง client (หน้า /app/settings/integrations) import ชนิดจากไฟล์นี้ได้ (type-only) — ห้าม import service/secret-box

/** ชนิดที่ร้านเก็บคีย์ไว้ในศูนย์ (แถว TenantIntegration) */
export const STORED_INTEGRATION_KINDS = ["SLIP_VERIFY", "PAYMENT_GATEWAY", "SMS", "CHANNEL_MANAGER", "METER", "CALENDAR", "EDC"] as const;
/** ชนิดเสมือน — อ่านจากของเดิม ไม่เก็บซ้ำ (LINE = ChatChannelConnection · พร้อมเพย์ = PaymentProfile) */
export const VIRTUAL_INTEGRATION_KINDS = ["LINE_OA", "PROMPTPAY"] as const;

export type StoredIntegrationKind = (typeof STORED_INTEGRATION_KINDS)[number];
export type VirtualIntegrationKind = (typeof VIRTUAL_INTEGRATION_KINDS)[number];
export type IntegrationKind = StoredIntegrationKind | VirtualIntegrationKind;

export type IntegrationStatus = "DRAFT" | "CONNECTED" | "ERROR" | "DISABLED";
export type IntegrationOnFailure = "MANUAL" | "REJECT";
export type CallCode = "TIMEOUT" | "PROVIDER_ERROR" | "QUOTA" | "NOT_READY";

// ── interface ต่อชนิด (CC §2.4) — ทุกตัวมี test() ──────────────────────────
// 🔴 ทุกเมธอดรับ `opts.signal` (ส่งต่อจาก callIntegration — ถูก abort เมื่อหมดเวลา) · adapter ที่มี "ผลข้างเคียง"
//    (สร้างรายการเก็บเงิน · ส่ง SMS · ดัน ARI) ต้องเคารพ signal **และ** ส่ง idempotency ref ให้ผู้ให้บริการ
//    (เรียกซ้ำหลัง TIMEOUT ต้องไม่เกิดผลซ้ำ) — มติผู้ตรวจ R0.5 ข้อ 5
export type CallOpts = { signal?: AbortSignal };
export type SlipVerifyResult = {
  status: "VALID" | "INVALID" | "DUPLICATE" | "UNKNOWN";
  amountSatang?: number;
  transRef?: string;
  payerName?: string;
  receiverMasked?: string;
  transferredAt?: string;
  providerRef?: string;
};
export interface SlipVerifyAdapter {
  test(opts?: CallOpts): Promise<void>;
  verify(
    input: { image?: Buffer; qrPayload?: string },
    expect: { amountSatang: number; receiver: { promptpayId?: string; bankAccount?: string } },
    opts?: CallOpts,
  ): Promise<SlipVerifyResult>;
  quota(opts?: CallOpts): Promise<{ remaining?: number; limit?: number; resetsAt?: string }>; // C.3 ▸ + limit (เตือนเป็น %) ◂
}
export interface PaymentGatewayAdapter {
  test(opts?: CallOpts): Promise<void>;
  createCharge(input: { amountSatang: number; ref: string; returnUrl: string }, opts?: CallOpts): Promise<{ chargeId: string; payUrl?: string; qr?: string }>;
  verifyWebhook(raw: string, headers: Record<string, string>, opts?: CallOpts): Promise<{ chargeId: string; paid: boolean }>;
}
export interface SmsAdapter {
  test(opts?: CallOpts): Promise<void>;
  send(input: { toE164: string; text: string; ref: string }, opts?: CallOpts): Promise<{ ok: boolean; externalId?: string }>;
}
export interface ChannelManagerAdapter {
  test(opts?: CallOpts): Promise<void>;
  pushAri(map: unknown, dates: string[], ari: unknown, opts?: CallOpts): Promise<void>;
  pullReservations(since: Date, opts?: CallOpts): Promise<unknown[]>;
  ackReservation(externalId: string, opts?: CallOpts): Promise<void>;
}
export interface MeterAdapter {
  test(opts?: CallOpts): Promise<void>;
  readings(meterIds: string[], period: { from: string; to: string }, opts?: CallOpts): Promise<{ meterId: string; value: number; at: string }[]>;
}
export interface CalendarAdapter {
  test(opts?: CallOpts): Promise<void>;
}
export interface EdcAdapter {
  test(opts?: CallOpts): Promise<void>;
}

export type AdapterMap = {
  SLIP_VERIFY: SlipVerifyAdapter;
  PAYMENT_GATEWAY: PaymentGatewayAdapter;
  SMS: SmsAdapter;
  CHANNEL_MANAGER: ChannelManagerAdapter;
  METER: MeterAdapter;
  CALENDAR: CalendarAdapter;
  EDC: EdcAdapter;
};
export type AdapterOf<K extends StoredIntegrationKind> = AdapterMap[K];

/** ประตูที่ getIntegration คืน — ค่าลับอยู่ใน closure ของ adapter เท่านั้น (JSON.stringify(handle) ไม่มีค่าลับ) */
export type IntegrationHandle<K extends StoredIntegrationKind = StoredIntegrationKind> = {
  integrationId: string;
  kind: K;
  provider: string;
  onFailure: IntegrationOnFailure;
  adapter: AdapterOf<K>;
};

export type CallResult<T> = { ok: true; value: T } | { ok: false; code: CallCode; fallback: IntegrationOnFailure };

// ── ผู้ให้บริการ (registry) ──────────────────────────────────────────────
export type ProviderField = { name: string; label: string; secret: boolean; required: boolean };
export type ProviderCreds = { secrets: Record<string, string>; publicFields: Record<string, string> };
export type ProviderDef = {
  code: string;
  label: string;
  fields: readonly ProviderField[];
  /** ชนิดที่ผู้ให้บริการนี้รองรับ */
  kinds: readonly StoredIntegrationKind[];
  /**
   * ความสามารถที่ผู้ให้บริการประกาศ (SVC R0.6 fix 7) — ไม่ประกาศ = ไม่มี
   * checksReceiver: ตรวจบัญชีผู้รับกับธนาคารจริง ⇒ สลิปอนุมัติอัตโนมัติได้ (ไม่มี = ต้องให้คนตรวจเสมอแม้ร้านเปิด autoApprove)
   */
  capabilities?: { checksReceiver?: boolean };
  /** สร้าง adapter — ค่าลับถูกจับไว้ใน closure */
  create<K extends StoredIntegrationKind>(kind: K, creds: ProviderCreds): AdapterOf<K>;
};

// ── DTO ของ service / หน้า (ไม่มีค่าลับ) ─────────────────────────────────
export type IntegrationCtx = { tenantId: string };
export type IntegrationActor = {
  userId: string;
  role: "OWNER" | "MANAGER" | "STAFF";
  unitAccess: string[];
  permissions: Record<string, unknown>;
};
export type RefusalCode = "NOT_FOUND" | "PERMISSION_DENIED" | "VALIDATION" | "NOT_CONFIGURED" | "UNKNOWN";
export type RefusalReason = "DUPLICATE_LABEL";
export type Refusal = { ok: false; code: RefusalCode; message: string; detail?: RefusalReason };

export type FieldView = { name: string; label: string; secret: boolean; required: boolean; filled: boolean; masked: string };
export type IntegrationView = {
  id: string;
  kind: StoredIntegrationKind;
  provider: string;
  label: string;
  unitIds: string[];
  status: IntegrationStatus;
  onFailure: IntegrationOnFailure;
  fields: FieldView[];
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastError: string | null;
  consecutiveFailures: number;
  virtual: false;
};
export type VirtualView = {
  id: string;
  kind: VirtualIntegrationKind;
  label: string;
  status: "CONNECTED" | "ERROR" | "DISABLED" | "NOT_CONNECTED";
  summary: string;
  manageHref: string;
  virtual: true;
};
export type CatalogEntry = {
  kind: IntegrationKind;
  label: string;
  ready: boolean;
  virtual: boolean;
  providers: { code: string; label: string; fields: ProviderField[] }[];
};

export type SaveIntegrationInput = {
  id?: string;
  /** โหมดสร้างใหม่ — ชื่อชนแถวเดิม ⇒ VALIDATION detail DUPLICATE_LABEL (ไม่แก้แถวเดิม) */
  create?: boolean;
  kind: string;
  provider: string;
  label?: string;
  unitIds?: string[];
  onFailure?: IntegrationOnFailure;
  fields?: Record<string, string>;
};
export type SaveIntegrationResult = { ok: true; integration: IntegrationView } | Refusal;
export type TestIntegrationResult = { ok: true; passed: boolean; code: CallCode | null; integration: IntegrationView } | Refusal;
export type ListIntegrationsResult =
  | { ok: true; keyConfigured: boolean; canManage: boolean; items: (IntegrationView | VirtualView)[]; catalog: CatalogEntry[] }
  | Refusal;

// ── SVC C.3 ▸ สุขภาพตัวต่อ (ใบสั่ง §3.1) — DTO ไม่มีค่าลับ/ฟิลด์/ข้อความดิบ · ชุดคีย์ตรงตัว (ข้อสอบเทียบ) ──
export type IntegrationHealthCall = { op: string; ok: boolean; ms: number; code: CallCode | null; at: string };
/** day = "YYYY-MM-DD" วันไทย · avgMs = Math.round(เฉลี่ย ms ทุกครั้งของวัน) · ไม่มีการเรียก = null */
export type IntegrationHealthDay = { day: string; ok: number; fail: number; avgMs: number | null };
export type IntegrationQuotaView = {
  remaining: number | null;
  limit: number | null;
  /** limit > 0 && remaining != null ? Math.round(remaining*100/limit) : null */
  percent: number | null;
  /** quotaIsLow(quota, เกณฑ์ #83 ของร้าน) */
  low: boolean;
  checkedAt: string | null;
  resetsAt: string | null;
};
export type IntegrationHealthView = {
  id: string;
  kind: StoredIntegrationKind;
  provider: string;
  label: string;
  status: IntegrationStatus;
  onFailure: IntegrationOnFailure;
  unitIds: string[];
  /** แถวยังไม่เคยอ่านโควตา = null */
  quota: IntegrationQuotaView | null;
  /** ≤ 20 ครั้งล่าสุด ใหม่ → เก่า */
  recent: IntegrationHealthCall[];
  /** 14 วันไทยพอดี เก่า → ใหม่ (วันสุดท้าย = วันนี้) */
  daily: IntegrationHealthDay[];
};
export type IntegrationHealthResult = { ok: true; thresholdPercent: number; health: IntegrationHealthView } | Refusal;
export type IntegrationHealthListResult = { ok: true; thresholdPercent: number; items: IntegrationHealthView[] } | Refusal;
/** รูปที่เก็บใน TenantIntegration.quota (ผู้เขียนเดียว = health.ts · ใบสั่ง §2.3) */
export type StoredIntegrationQuota = {
  remaining: number | null;
  limit: number | null;
  resetsAt: string | null;
  checkedAt: string;
  lowAlertedAt: string | null;
};
// ◂ SVC C.3
