// Contract stubs (Stage A3) — อินเทอร์เฟซกลางที่โมดูลธุรกิจเรียก
// ตาม docs/modules/_CONVENTIONS.md §2 (v2) — Stage B สลับ stub เป็น impl จริงผ่าน register*()
// stub โยน NotImplemented เพื่อให้ dev รู้ทันทีว่ายังไม่เชื่อมของจริง

export class NotImplementedError extends Error {
  constructor(contract: string) {
    super(`[contract] "${contract}" ยังเป็น stub (Stage A) — โมดูลเจ้าของยังไม่ register impl จริง`);
    this.name = "NotImplementedError";
  }
}

// ── 2.1 Payment (POS) ─────────────────────────────────────────
export type PayMethod =
  | "CASH" | "TRANSFER" | "PROMPTPAY" | "CARD" | "VOUCHER" | "DEPOSIT" | "ROOM_CHARGE";
export type SourceModule = "HOTEL" | "RESTAURANT" | "BOOKING" | "TICKET" | "POS";

export interface CreateSaleInput {
  tenantId: string;
  unitId: string;
  memberId?: string;
  sourceModule: SourceModule;
  sourceId?: string;
  idempotencyKey: string;
  paymentMode: "PAID_NOW" | "PENDING_PAYMENT";
  lines: { name: string; qty: number; unitPriceSatang: number; discount?: number }[];
  couponCode?: string;
  burnPoints?: number;
  payMethods: { type: PayMethod; amount: number; refSaleId?: string }[];
}
export interface CreateSaleResult {
  saleId: string;
  receiptNo?: string;
  grandTotal: number;
  pointEarned?: number;
}

// ── 2.2 Point ─────────────────────────────────────────────────
export interface PointEarnInput {
  tenantId: string; memberId: string; unitId?: string;
  amountSatang: number; sourceModule: SourceModule;
  refType: string; refId: string; idempotencyKey: string;
}
export interface PointBurnInput {
  tenantId: string; memberId: string; points: number;
  refType: string; refId: string; idempotencyKey: string;
}

// ── 2.3 Coupon ────────────────────────────────────────────────
export interface CouponValidateInput {
  code: string; tenantId: string; unitId: string;
  memberId?: string; amountSatang: number; module: string;
}
export interface CouponValidateResult { valid: boolean; discountSatang: number; reason?: string }

// ── 2.5 Notify ────────────────────────────────────────────────
export interface NotifyInput {
  tenantId: string;
  to: { memberId?: string; userId?: string; email?: string; phone?: string };
  channel: "EMAIL" | "LINE" | "WEB";
  template: string;
  data: Record<string, unknown>;
}

// ── 2.6 Member ────────────────────────────────────────────────
export interface FindOrCreateMemberInput {
  tenantId: string; phone?: string; email?: string; name?: string;
  source: "AUTO" | "STAFF" | "SELF" | "IMPORT";
  consents?: string[];
}

// ── 2.7 Activity ──────────────────────────────────────────────
export interface ActivityLogInput {
  tenantId: string; memberId: string; unitId?: string;
  module: string; type: string; refType: string; refId: string; summary: string;
}

// registry — Stage B/C แทนที่ด้วย impl จริง
export interface Contracts {
  createSale(i: CreateSaleInput): Promise<CreateSaleResult>;
  pointEarn(i: PointEarnInput): Promise<void>;
  pointBurn(i: PointBurnInput): Promise<void>;
  couponValidate(i: CouponValidateInput): Promise<CouponValidateResult>;
  notify(i: NotifyInput): Promise<void>;
  memberFindOrCreate(i: FindOrCreateMemberInput): Promise<{ memberId: string }>;
  activityLog(i: ActivityLogInput): Promise<void>;
}

const stub = <K extends keyof Contracts>(name: K): Contracts[K] =>
  (async () => {
    throw new NotImplementedError(name);
  }) as Contracts[K];

export const contracts: Contracts = {
  createSale: stub("createSale"),
  pointEarn: stub("pointEarn"),
  pointBurn: stub("pointBurn"),
  couponValidate: stub("couponValidate"),
  notify: stub("notify"),
  memberFindOrCreate: stub("memberFindOrCreate"),
  activityLog: stub("activityLog"),
};

/** โมดูลเจ้าของ contract เรียกตอน bootstrap เพื่อลง impl จริง */
export function registerContracts(impls: Partial<Contracts>): void {
  Object.assign(contracts, impls);
}
