// campaigns-shared.ts — ส่วน "บริสุทธิ์" ของแคมเปญ v2 (M3.2)
//
// 🔴 ไฟล์นี้ห้าม import อะไรที่ลากถึง prisma / env / facade ของโมดูลอื่น
//    เหตุผล (บทเรียน M3.1 · 11 ก.ย. 2569): client component ที่ import ไฟล์ซึ่งลากถึง `core/db`
//    จะพา `pg` เข้าบันเดิลเบราว์เซอร์ ⇒ `tsc` ผ่านแต่ `next build` แดง "Module not found: pg"
//    ⇒ ชนิดข้อมูล · ทะเบียนช่องทาง/ป้ายไทย · ตัวแปรในข้อความ · การแทนค่า อยู่ที่นี่ที่เดียว
//    แล้วทั้งเอนจิน (campaigns.ts) และหน้าจอ (Campaign*.tsx) ใช้ชุดเดียวกัน

// ───────────────────────── ช่องทาง ─────────────────────────

export type CampaignChannel = "LINE" | "EMAIL" | "SMS" | "PUSH";

/** ลำดับปริยายที่หน้าจอโชว์ (และลำดับ fallback ตอนส่งถ้าผู้ใช้ไม่ได้จัดเอง) */
export const CAMPAIGN_CHANNELS: readonly CampaignChannel[] = Object.freeze(["LINE", "EMAIL", "SMS", "PUSH"] as const);

/** ป้ายที่คนอ่าน — ตรงกับแท็บในภาพ 21 (LINE · อีเมล · SMS · push) */
export const CAMPAIGN_CHANNEL_LABELS: Readonly<Record<CampaignChannel, string>> = Object.freeze({
  LINE: "LINE",
  EMAIL: "อีเมล",
  SMS: "SMS",
  PUSH: "push",
});

/**
 * ค่าส่งต่อ 1 ข้อความ (สตางค์) — ใช้คิด "ต้นทุนสูงสุด" ก่อนส่ง และ "ต้นทุน" ในสถิติ
 * LINE/อีเมล/push = 0 เพราะรวมอยู่ในค่าบริการที่ร้านจ่ายอยู่แล้ว · SMS จ่ายต่อข้อความจริง
 */
export const CHANNEL_SEND_COST_SATANG: Readonly<Record<CampaignChannel, number>> = Object.freeze({
  LINE: 0,
  EMAIL: 0,
  SMS: 60,
  PUSH: 0,
});

export function isCampaignChannel(v: unknown): v is CampaignChannel {
  return typeof v === "string" && (CAMPAIGN_CHANNELS as readonly string[]).includes(v);
}

// ───────────────────────── เนื้อหา ─────────────────────────

export type CampaignEmailContent = { subject: string; body: string };
export type CampaignPushContent = { title: string; body: string };

export type CampaignContent = {
  line?: string;
  email?: CampaignEmailContent;
  sms?: string;
  push?: CampaignPushContent;
};

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** อ่านค่า Json จาก DB / ฟอร์ม ให้เป็นรูปเดียวกันเสมอ (ค่าที่อ่านไม่ออก = ไม่มีเนื้อหาช่องนั้น) */
export function parseContent(raw: unknown): CampaignContent {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: CampaignContent = {};
  if (str(o.line).trim()) out.line = str(o.line);
  if (o.email && typeof o.email === "object") {
    const e = o.email as Record<string, unknown>;
    if (str(e.subject).trim() || str(e.body).trim()) out.email = { subject: str(e.subject), body: str(e.body) };
  }
  if (str(o.sms).trim()) out.sms = str(o.sms);
  if (o.push && typeof o.push === "object") {
    const p = o.push as Record<string, unknown>;
    if (str(p.title).trim() || str(p.body).trim()) out.push = { title: str(p.title), body: str(p.body) };
  }
  return out;
}

/** ช่องทางนี้มีเนื้อหาให้ส่งไหม (ช่องที่ติ๊กไว้แต่ไม่ได้พิมพ์อะไร = ส่งไม่ได้) */
export function hasContentFor(content: CampaignContent, channel: CampaignChannel): boolean {
  if (channel === "LINE") return !!content.line?.trim();
  if (channel === "SMS") return !!content.sms?.trim();
  if (channel === "EMAIL") return !!content.email?.body.trim();
  return !!content.push?.body.trim();
}

// ───────────────────────── ตัวแปรในข้อความ ─────────────────────────

/** ตัวแปรที่แทนค่าได้ (ภาพ 21 โชว์เป็นชิปใต้กล่องข้อความ) */
export const CAMPAIGN_VARS: readonly { token: string; label: string }[] = Object.freeze([
  { token: "{ชื่อ}", label: "ชื่อสมาชิก" },
  { token: "{ระดับ}", label: "ระดับสมาชิก" },
  { token: "{voucher}", label: "รหัส voucher ที่แนบ" },
  { token: "{รหัสสมาชิก}", label: "รหัสสมาชิก" },
]);

export type CampaignMessageVars = {
  ชื่อ: string;
  ระดับ: string;
  voucher: string;
  รหัสสมาชิก: string;
};

/**
 * แทนตัวแปรในข้อความ
 * 🔴 ตัวแปรที่ไม่มีค่า (เช่น `{voucher}` ตอนไม่ได้แนบ voucher) ต้อง **หายไป** ไม่ใช่ค้างเป็นวงเล็บ —
 *    ลูกค้าจริงจะได้ข้อความว่า "รับ voucher {voucher} ไปใช้ได้เลย" ซึ่งดูเหมือนระบบพัง
 */
export function renderMessage(template: string, vars: Partial<CampaignMessageVars>): string {
  const map = vars as Record<string, string | undefined>;
  return String(template ?? "")
    .replace(/\{([^{}]+)\}/g, (whole, key: string) => {
      const v = map[key.trim()];
      return v === undefined ? whole : v;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// ───────────────────────── สถานะ / ผู้รับ ─────────────────────────

export type CampaignStatus = "DRAFT" | "SCHEDULED" | "SENT" | "CANCELLED";

export const CAMPAIGN_STATUS_LABELS: Readonly<Record<CampaignStatus, string>> = Object.freeze({
  DRAFT: "ร่าง",
  SCHEDULED: "ตั้งเวลาไว้",
  SENT: "ส่งแล้ว",
  CANCELLED: "ยกเลิกแล้ว",
});

export type RecipientStatus = "PENDING" | "SENT" | "FAILED" | "SKIPPED" | "HOLDOUT";

export const RECIPIENT_STATUS_LABELS: Readonly<Record<RecipientStatus, string>> = Object.freeze({
  PENDING: "รอส่ง",
  SENT: "ส่งแล้ว",
  FAILED: "ส่งไม่สำเร็จ",
  SKIPPED: "ข้าม",
  HOLDOUT: "กลุ่มเทียบ",
});

/** "A" | "B" = กลุ่มที่ได้รับข้อความ · "HOLDOUT" = กลุ่มเทียบที่ตั้งใจไม่ส่ง */
export type CampaignVariant = "A" | "B" | "HOLDOUT";

export const VARIANT_LABELS: Readonly<Record<CampaignVariant, string>> = Object.freeze({
  A: "ข้อความ A",
  B: "ข้อความ B",
  HOLDOUT: "กลุ่มเทียบ (ไม่ส่ง)",
});

// ───────────────────────── ชนิดข้อมูลที่หน้าจอใช้ ─────────────────────────

export type CampaignPreview = {
  /** คนในกลุ่มเป้าหมายทั้งหมด */
  audience: number;
  /** จะส่งจริงกี่คน (หักกลุ่มเทียบและคนที่ไม่มีช่องทางออกแล้ว) */
  willSend: number;
  /** กันไว้เป็นกลุ่มเทียบกี่คน */
  holdout: number;
  /** แยกตามช่องทางที่จะใช้จริง + `none` = ไม่มีช่องทางไหนส่งได้เลย */
  byChannel: Record<CampaignChannel, number> & { none: number };
  /** ต้นทุนสูงสุด = มูลค่า voucher/คูปองที่อาจถูกใช้ครบทุกใบ + ค่าส่งทุกข้อความ */
  maxCostSatang: number;
  /** คาดว่าจะมีคนใช้สิทธิ์กี่ % (ค่ากลางจากแคมเปญก่อนหน้า · ยังไม่มีสถิติ = 25) */
  expectedUsePct: number;
  /** โควตาข้อความที่เหลือของวันนี้ (ตามแพ็กเกจ) */
  remainingToday: number;
  /** จะส่งเกินโควตาของวันนี้ไหม */
  overCap: boolean;
};

export type CampaignVariantStatView = {
  variant: CampaignVariant;
  sent: number;
  opened: number;
  used: number;
  usePct: number;
  saleSatang: number;
  costSatang: number;
  roi: number;
};

export type CampaignStatsView = {
  variants: CampaignVariantStatView[];
  uplift: { usePct: number; saleSatangPerHead: number };
  total: {
    audience: number;
    sent: number;
    opened: number;
    used: number;
    saleSatang: number;
    costSatang: number;
    roi: number;
  };
};

export type CampaignListRow = {
  id: string;
  name: string;
  status: CampaignStatus;
  segmentId: string | null;
  segmentName: string | null;
  channels: CampaignChannel[];
  audience: number;
  sent: number;
  opened: number;
  used: number;
  saleSatang: number;
  costSatang: number;
  roi: number;
  scheduledAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
};

export type CampaignDto = {
  id: string;
  name: string;
  status: CampaignStatus;
  segmentId: string | null;
  segmentName: string | null;
  channels: CampaignChannel[];
  content: CampaignContent;
  variantB: CampaignContent | null;
  holdoutPct: number;
  attachVoucherTemplateId: string | null;
  couponCode: string | null;
  scheduledAt: Date | null;
  sentAt: Date | null;
  createdAt: Date;
};

export type CampaignRecipientRow = {
  id: string;
  customerId: string | null;
  name: string;
  variant: CampaignVariant;
  status: RecipientStatus;
  channel: CampaignChannel | null;
  error: string | null;
  sentAt: Date | null;
  openedAt: Date | null;
  usedAt: Date | null;
  saleSatang: number;
};

export type SaveCampaignInput = {
  name: string;
  segmentId?: string | null;
  definition?: unknown;
  channels: string[];
  content: unknown;
  variantB?: unknown;
  holdoutPct?: number;
  attachVoucherTemplateId?: string | null;
  couponCode?: string | null;
  scheduledAt?: Date | string | null;
};

/** เพดาน holdout ตามพิมพ์เขียว §11.6 — เกินครึ่งกลุ่ม = แคมเปญไม่มีความหมายอีกต่อไป */
export const HOLDOUT_MAX_PCT = 50;

/** ยกความดีให้แคมเปญได้ไม่เกินกี่วันหลังส่ง (§11.6) */
export const ATTRIBUTION_DAYS = 30;

/** ค่าคาดการณ์ "ใช้สิทธิ์จริง" เมื่อร้านยังไม่เคยส่งแคมเปญมาก่อน */
export const DEFAULT_EXPECTED_USE_PCT = 25;

/** ROI = (ยอดที่เกิด − ต้นทุน) / ต้นทุน · ต้นทุน 0 = หารด้วย 1 (ไม่โชว์ Infinity ให้ผู้ใช้) */
export function roiOf(saleSatang: number, costSatang: number): number {
  return (saleSatang - costSatang) / Math.max(costSatang, 1);
}

/** บาทแบบมีลูกน้ำ (หน้าจอใช้ชุดเดียวกันทุกที่) */
export function bahtOf(satang: number): string {
  return Math.round(satang / 100).toLocaleString("th-TH");
}
