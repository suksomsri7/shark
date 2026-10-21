// board-settings-shared.ts — ตัวอ่านบริสุทธิ์ของค่าตั้ง "บอร์ดงาน + ห้องทีม" ของ POS + ตัวประกอบข้อความการ์ด/โพสต์ (POS P3.8 ▸ R2 R4–R9 R11 · มติ 2 3 6 · CD-1 CD-4 ◂)
//
// 🔴 บริสุทธิ์: ไม่มี prisma / db / นาฬิกา / เครือข่าย — client component (แท็บตั้งค่า P3.8U) import ไฟล์นี้ได้
// 🔴 ตัวอ่านเดียวต่อคีย์: posBoardSettings (settings.pos.board) · posTeamRoomSettings (settings.pos.teamRoom) — อ่าน AppSystem.settings ทั้งก้อน ·
//    คีย์แปลก = ถูกทิ้ง · จำนวนเต็มนอกช่วง = ตัดเข้าขอบ · ไม่ใช่จำนวนเต็ม/ชนิดผิด = ค่าปริยาย · boolean ปริยายปิด = ต้องเป็น true จริงเท่านั้น
//    ตัวเขียน (board-settings.ts) ปฏิเสธค่านอกช่วงเดียวกันนี้ ⇒ เขียนแล้วอ่านกลับได้ค่าเดิมเสมอ
// 🔴 ปริยาย = ปิดทุกกฎ (มติ 3) · เจ้าของร้านเปิดเอง
// 🔴 ข้อความการ์ด/โพสต์ (มติ 10 PDPA): ไม่มีชื่อพนักงาน/ลูกค้า · เบอร์โทร · ทิป · ค่าคอมฯ · เงินเดือน — ตัวประกอบรับเฉพาะเลข/ชื่อสาขา/ชื่อเครื่อง/ชื่อสินค้า/รหัสออเดอร์

// ═══════════ ค่าตั้ง (R2) ═══════════
export const POS_BOARD_SOLD_OUT_SOURCES = ["MANUAL", "KDS", "STOCK"] as const;
export type PosBoardSoldOutSource = (typeof POS_BOARD_SOLD_OUT_SOURCES)[number];
export const POS_BOARD_LIMITS = {
  minAbsSatang: { min: 0, max: 10_000_000 },
  hours: { min: 1, max: 168 },
  briefHourBkk: { min: 0, max: 23 },
  unitEntries: 200,
} as const;
export type PosBoardRules = {
  shiftDiff: { enabled: boolean; minAbsSatang: number; everyClose: boolean; forcedClose: boolean };
  soldOut: { enabled: boolean; hours: number; sources: PosBoardSoldOutSource[] };
  refundNeeded: { enabled: boolean };
};
export type PosBoardSettings = { enabled: boolean; defaultBoardId: string | null; boardByUnit: Record<string, string>; assignManager: boolean; rules: PosBoardRules };
/** ห้องหนึ่งห้องของระบบ MEETING */
export type PosRoomRef = { meetingSystemId: string; channelId: string };
export type PosTeamRoomSettings = {
  enabled: boolean;
  defaultRoom: PosRoomRef | null;
  roomByUnit: Record<string, PosRoomRef>;
  posts: { shiftClose: boolean; showOverShort: boolean; dailyBrief: boolean };
  briefHourBkk: number;
  /** เจ้าของร้านคนที่บันทึกค่าตั้งห้องล่าสุด (เซิร์ฟเวอร์ตั้งเอง · CD-4) — สรุปเช้าในห้องโหลดข้อมูลด้วยสิทธิ์ของคนนี้ */
  enabledByUserId: string | null;
};

export const POS_BOARD_DEFAULTS: Readonly<PosBoardSettings> = Object.freeze({
  enabled: false,
  defaultBoardId: null,
  boardByUnit: {},
  assignManager: true,
  rules: {
    shiftDiff: { enabled: false, minAbsSatang: 10_000, everyClose: false, forcedClose: true },
    soldOut: { enabled: false, hours: 4, sources: ["MANUAL", "KDS", "STOCK"] },
    refundNeeded: { enabled: false },
  },
}) as PosBoardSettings;
export const POS_TEAM_ROOM_DEFAULTS: Readonly<PosTeamRoomSettings> = Object.freeze({
  enabled: false,
  defaultRoom: null,
  roomByUnit: {},
  posts: { shiftClose: false, showOverShort: true, dailyBrief: false },
  briefHourBkk: 7,
  enabledByUserId: null,
}) as PosTeamRoomSettings;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** รหัสแถว (cuid/uuid ฯลฯ) — สตริงไม่ว่าง ≤ 64 ตัว ไม่มีช่องว่าง */
export const isBoardSettingsId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 64 && !/\s/.test(v);
const onlyTrue = (v: unknown) => v === true;
const boolOr = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const intClamp = (v: unknown, lim: { min: number; max: number }, d: number) => (typeof v === "number" && Number.isInteger(v) ? Math.min(lim.max, Math.max(lim.min, v)) : d);
const posOf = (settings: unknown): Record<string, unknown> | null => (isRecord(settings) && isRecord(settings.pos) ? settings.pos : null);

/** {meetingSystemId, channelId} ที่ถูกรูป · อื่น = null */
export function posRoomRef(v: unknown): PosRoomRef | null {
  if (!isRecord(v) || !isBoardSettingsId(v.meetingSystemId) || !isBoardSettingsId(v.channelId)) return null;
  return { meetingSystemId: v.meetingSystemId, channelId: v.channelId };
}

/** settings.pos.board ทั้งก้อน (ค่าปริยายปิด) */
export function posBoardSettings(settings: unknown): PosBoardSettings {
  const pos = posOf(settings);
  const b = pos && isRecord(pos.board) ? pos.board : null;
  const D = POS_BOARD_DEFAULTS;
  const rules = b && isRecord(b.rules) ? b.rules : null;
  const sd = rules && isRecord(rules.shiftDiff) ? rules.shiftDiff : null;
  const so = rules && isRecord(rules.soldOut) ? rules.soldOut : null;
  const rf = rules && isRecord(rules.refundNeeded) ? rules.refundNeeded : null;
  const byUnit: Record<string, string> = {};
  if (b && isRecord(b.boardByUnit)) {
    for (const [unitId, boardId] of Object.entries(b.boardByUnit)) {
      if (Object.keys(byUnit).length >= POS_BOARD_LIMITS.unitEntries) break;
      if (isBoardSettingsId(unitId) && isBoardSettingsId(boardId)) byUnit[unitId] = boardId;
    }
  }
  let sources: PosBoardSoldOutSource[] = [...D.rules.soldOut.sources];
  if (so && Array.isArray(so.sources)) {
    sources = [];
    for (const s of so.sources as unknown[]) if ((POS_BOARD_SOLD_OUT_SOURCES as readonly unknown[]).includes(s) && !sources.includes(s as PosBoardSoldOutSource)) sources.push(s as PosBoardSoldOutSource);
  }
  return {
    enabled: onlyTrue(b?.enabled),
    defaultBoardId: isBoardSettingsId(b?.defaultBoardId) ? (b!.defaultBoardId as string) : null,
    boardByUnit: byUnit,
    assignManager: boolOr(b?.assignManager, D.assignManager),
    rules: {
      shiftDiff: {
        enabled: onlyTrue(sd?.enabled),
        minAbsSatang: intClamp(sd?.minAbsSatang, POS_BOARD_LIMITS.minAbsSatang, D.rules.shiftDiff.minAbsSatang),
        everyClose: onlyTrue(sd?.everyClose),
        forcedClose: boolOr(sd?.forcedClose, D.rules.shiftDiff.forcedClose),
      },
      soldOut: { enabled: onlyTrue(so?.enabled), hours: intClamp(so?.hours, POS_BOARD_LIMITS.hours, D.rules.soldOut.hours), sources },
      refundNeeded: { enabled: onlyTrue(rf?.enabled) },
    },
  };
}

/** settings.pos.teamRoom ทั้งก้อน (ค่าปริยายปิด) */
export function posTeamRoomSettings(settings: unknown): PosTeamRoomSettings {
  const pos = posOf(settings);
  const r = pos && isRecord(pos.teamRoom) ? pos.teamRoom : null;
  const D = POS_TEAM_ROOM_DEFAULTS;
  const posts = r && isRecord(r.posts) ? r.posts : null;
  const byUnit: Record<string, PosRoomRef> = {};
  if (r && isRecord(r.roomByUnit)) {
    for (const [unitId, ref] of Object.entries(r.roomByUnit)) {
      if (Object.keys(byUnit).length >= POS_BOARD_LIMITS.unitEntries) break;
      const room = posRoomRef(ref);
      if (isBoardSettingsId(unitId) && room) byUnit[unitId] = room;
    }
  }
  return {
    enabled: onlyTrue(r?.enabled),
    defaultRoom: posRoomRef(r?.defaultRoom),
    roomByUnit: byUnit,
    posts: { shiftClose: onlyTrue(posts?.shiftClose), showOverShort: boolOr(posts?.showOverShort, D.posts.showOverShort), dailyBrief: onlyTrue(posts?.dailyBrief) },
    briefHourBkk: intClamp(r?.briefHourBkk, POS_BOARD_LIMITS.briefHourBkk, D.briefHourBkk),
    enabledByUserId: isBoardSettingsId(r?.enabledByUserId) ? (r!.enabledByUserId as string) : null,
  };
}

/** บอร์ดของสาขา: boardByUnit ก่อน · ไม่ผูก = บอร์ดปริยาย (R3) */
export const posBoardIdForUnit = (b: PosBoardSettings, unitId: string | null): string | null => (unitId ? (b.boardByUnit[unitId] ?? null) : null) ?? b.defaultBoardId;
/** ห้องของสาขา: roomByUnit ก่อน · ไม่ผูก = ห้องปริยาย */
export const posRoomForUnit = (r: PosTeamRoomSettings, unitId: string | null): PosRoomRef | null => (unitId ? (r.roomByUnit[unitId] ?? null) : null) ?? r.defaultRoom;

// ═══════════ กุญแจ (CD-1) ═══════════
export const posBoardKeys = {
  shift: (shiftId: string) => `pos-shift:${shiftId}`,
  soldOutPrefix: (unitId: string, productId: string) => `pos-86:${unitId}:${productId}:`,
  soldOut: (unitId: string, productId: string, markId: string) => `pos-86:${unitId}:${productId}:${markId}`,
  refund: (orderId: string) => `pos-refund:${orderId}`,
  anomaly: (rule: string, unitId: string, businessDate: string, ref: string) => `pos-anomaly:${rule}:${unitId}:${businessDate}:${ref}`,
  roomZ: (shiftId: string) => `pos-room:z:${shiftId}`,
  roomBrief: (posSystemId: string, channelId: string, businessDate: string) => `pos-room:brief:${posSystemId}:${channelId}:${businessDate}`,
} as const;

// ═══════════ ข้อความ (R11 · th/en ตาม settings.pos.receiptLocale) ═══════════
export type PosBoardLocale = "th" | "en";
/** ฿ + หลักพันแบบ en-US + ทศนิยมเท่าที่มี (สูตรเดียวกับ kanban-bridges baht()) */
export const posBoardBaht = (satang: number) => `฿${(satang / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const THAI_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const EN_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const BKK_MS = 7 * 3_600_000;
const pad2 = (n: number) => String(n).padStart(2, "0");
/** "HH:mm d MMM" เวลาไทย (คิดที่ +07:00 เอง) */
export function posBoardBkkStamp(d: Date, locale: PosBoardLocale = "th"): string {
  const b = new Date(d.getTime() + BKK_MS);
  return `${pad2(b.getUTCHours())}:${pad2(b.getUTCMinutes())} ${b.getUTCDate()} ${(locale === "en" ? EN_MONTH : THAI_MONTH)[b.getUTCMonth()] ?? ""}`.trim();
}

/** ป้ายกฎจุดผิดปกติ (ชุดเดียวกับ pos.reports.anomaly.rule.* ใน messages) */
export const POS_ANOMALY_RULE_LABEL: Readonly<Record<PosBoardLocale, Record<string, string>>> = {
  th: { A1: "ยกเลิกบิลบ่อย", A2: "คืนเงินบ่อย", A3: "ส่วนลดสูง (พนักงาน)", A4: "ส่วนลดสูง (บิล)", A5: "ใช้สิทธิ์เกินเพดาน", A6: "ราคากำหนดเอง", A7: "พิมพ์สำเนาซ้ำ", A8: "เงินขาด/เกิน", A9: "เงินขาดซ้ำ", A10: "ยกเลิก/ปฏิเสธออเดอร์", A11: "ข้ามตารางงานบ่อย" },
  en: { A1: "Frequent voids", A2: "Frequent refunds", A3: "High discount (staff)", A4: "High discount (bill)", A5: "Over-cap overrides", A6: "Custom prices", A7: "Repeated reprints", A8: "Cash over/short", A9: "Repeated shortages", A10: "Order rejections/cancellations", A11: "Frequent schedule overrides" },
};
const REFUND_CAUSE: Readonly<Record<PosBoardLocale, Record<string, string>>> = {
  th: { rejected_prepaid: "ปฏิเสธหลังจ่าย", expired_paid: "จ่ายแล้วไม่มีคนรับ", late_payment: "เงินเข้าหลังยกเลิก" },
  en: { rejected_prepaid: "Rejected after payment", expired_paid: "Paid but never accepted", late_payment: "Paid after cancellation" },
};
const SOURCE_LABEL: Readonly<Record<PosBoardLocale, Record<string, string>>> = {
  th: { MANUAL: "ปิดขายเอง", KDS: "ครัวแจ้งหมด", STOCK: "สต็อกหมด" },
  en: { MANUAL: "marked manually", KDS: "marked by kitchen", STOCK: "out of stock" },
};

export type ShiftCardInput = {
  zNumber: number;
  unitName: string;
  deviceLabel: string;
  forced: boolean;
  /** counted − expected · null = ไม่ได้นับ */
  overShortSatang: number | null;
  expectedCashSatang: number | null;
  countedCashSatang: number | null;
  billCount: number;
  salesTotalSatang: number;
};
/** R4 การ์ดตรวจเงินกะ — ไม่มีชื่อคนเปิด/ปิดกะ · ไม่มีทิป */
export function posShiftCardText(x: ShiftCardInput, locale: PosBoardLocale = "th"): { title: string; description: string; linkLabel: string } {
  const os = x.overShortSatang ?? 0;
  const uncounted = x.forced && x.countedCashSatang === null;
  const dash = (v: number | null) => (v === null ? "—" : posBoardBaht(v));
  if (locale === "en") {
    const word = os < 0 ? "short" : os > 0 ? "over" : "balanced";
    const title = uncounted
      ? `Shift force-closed Z#${x.zNumber} · ${x.unitName} · ${x.deviceLabel} — cash not counted`
      : `Cash check Z#${x.zNumber} · ${x.unitName} · ${x.deviceLabel} · ${word} ${posBoardBaht(Math.abs(os))}`;
    const description = [
      `Expected cash: ${dash(x.expectedCashSatang)}`,
      `Counted cash: ${uncounted ? "not counted" : dash(x.countedCashSatang)}`,
      `Over/short: ${uncounted ? "—" : `${os < 0 ? "-" : os > 0 ? "+" : ""}${posBoardBaht(Math.abs(os))}`}`,
      `Bills: ${x.billCount}`,
      `Sales: ${posBoardBaht(x.salesTotalSatang)}`,
    ].join("\n");
    return { title, description, linkLabel: `Shift Z#${x.zNumber}` };
  }
  const word = os < 0 ? "ขาด" : os > 0 ? "เกิน" : "ตรงยอด";
  const title = uncounted
    ? `กะถูกบังคับปิด Z#${x.zNumber} · ${x.unitName} · ${x.deviceLabel} — ยังไม่ได้นับเงิน`
    : `ตรวจเงินกะ Z#${x.zNumber} · ${x.unitName} · ${x.deviceLabel} · ${word} ${posBoardBaht(Math.abs(os))}`;
  const description = [
    `ยอดเงินสดที่ควรมี: ${dash(x.expectedCashSatang)}`,
    `ยอดที่นับได้: ${uncounted ? "ยังไม่ได้นับเงิน" : dash(x.countedCashSatang)}`,
    `ขาด/เกิน: ${uncounted ? "—" : `${word} ${posBoardBaht(Math.abs(os))}`}`,
    `จำนวนบิล: ${x.billCount}`,
    `ยอดขาย: ${posBoardBaht(x.salesTotalSatang)}`,
  ].join("\n");
  return { title, description, linkLabel: `กะ Z#${x.zNumber}` };
}

/** R7 โพสต์ปิดกะในห้องทีม — ยอดขาย/บิลจาก Z · เงินสดขาด/เกินเฉพาะ showOverShort และ ≠ 0 · ไม่มีชื่อ */
export function posZPostBody(x: { zNumber: number; unitName: string; deviceLabel: string; salesTotalSatang: number; billCount: number; overShortSatang: number | null; showOverShort: boolean }, locale: PosBoardLocale = "th"): string {
  const os = x.overShortSatang ?? 0;
  if (locale === "en") {
    const head = `Shift closed Z#${x.zNumber} · ${x.unitName} · ${x.deviceLabel} · sales ${posBoardBaht(x.salesTotalSatang)} (${x.billCount} ${x.billCount === 1 ? "bill" : "bills"})`;
    return head + (x.showOverShort && os !== 0 ? ` · cash ${os < 0 ? "short" : "over"} ${posBoardBaht(Math.abs(os))}` : "");
  }
  const head = `ปิดกะ Z#${x.zNumber} · ${x.unitName} · ${x.deviceLabel} · ขาย ${posBoardBaht(x.salesTotalSatang)} (${x.billCount} บิล)`;
  return head + (x.showOverShort && os !== 0 ? ` · เงินสด ${os < 0 ? "ขาด" : "เกิน"} ${posBoardBaht(Math.abs(os))}` : "");
}

/** R5 การ์ดสินค้าหมดนาน */
export function posSoldOutCardText(x: { hours: number; productName: string; unitName: string; markedAt: Date; source: string }, locale: PosBoardLocale = "th"): { title: string; description: string } {
  const src = SOURCE_LABEL[locale][x.source] ?? x.source;
  if (locale === "en")
    return {
      title: `Sold out over ${x.hours} h: ${x.productName} · ${x.unitName}`,
      description: `Sold out since ${posBoardBkkStamp(x.markedAt, "en")} (${src})`,
    };
  return {
    title: `สินค้าหมดนานเกิน ${x.hours} ชม.: ${x.productName} · ${x.unitName}`,
    description: `หมดตั้งแต่ ${posBoardBkkStamp(x.markedAt, "th")} (${src})`,
  };
}
/** ความเห็นของระบบเมื่อสินค้ากลับมาขาย (บอร์ดที่ไม่มีคอลัมน์เสร็จ) — ทุกภาษามีคำไทยหลักไว้ค้นหาได้ */
export const posSoldOutBackComment = (locale: PosBoardLocale = "th") => (locale === "en" ? "Back on sale (กลับมาขายแล้ว)" : "กลับมาขายแล้ว");

/** R6 การ์ดคืนเงิน — ไม่มีชื่อ/เบอร์ลูกค้า */
export function posRefundCardText(x: { orderCode: string; amountSatang: number; cause: string }, locale: PosBoardLocale = "th"): { title: string; description: string; linkLabel: string } {
  const cause = REFUND_CAUSE[locale][x.cause] ?? x.cause;
  if (locale === "en")
    return {
      title: `Refund customer: order ${x.orderCode} ${posBoardBaht(x.amountSatang)}`,
      description: [`Cause: ${cause}`, `Amount to refund: ${posBoardBaht(x.amountSatang)}`, "Refund through the original payment channel, then move this card to done."].join("\n"),
      linkLabel: `Order ${x.orderCode}`,
    };
  return {
    title: `คืนเงินลูกค้า: ออเดอร์ ${x.orderCode} ${posBoardBaht(x.amountSatang)}`,
    description: [`สาเหตุ: ${cause}`, `ยอดที่ต้องคืน: ${posBoardBaht(x.amountSatang)}`, "คืนเงินผ่านช่องทางที่ลูกค้าจ่ายมา แล้วย้ายการ์ดนี้ไปคอลัมน์เสร็จ"].join("\n"),
    linkLabel: `ออเดอร์ ${x.orderCode}`,
  };
}

/** ค่าของแถวจุดผิดปกติเป็นข้อความ (A1 A2 A8 A9 = สตางค์ · A3 A4 = 1/100 % · อื่น = จำนวน) */
export function posAnomalyValueText(rule: string, value: number, locale: PosBoardLocale = "th"): string {
  if (["A1", "A2", "A8", "A9"].includes(rule)) return posBoardBaht(value);
  if (rule === "A3" || rule === "A4") return `${(value / 100).toFixed(2)}%`;
  return locale === "en" ? `${value} times` : `${value} ครั้ง`;
}

/** R9 การ์ดจุดผิดปกติ (กดเอง) — ไม่มี userName */
export function posAnomalyCardText(x: { rule: string; unitName: string; businessDate: string; valueText: string }, locale: PosBoardLocale = "th"): { title: string; description: string; linkLabel: string } {
  const label = POS_ANOMALY_RULE_LABEL[locale][x.rule] ?? x.rule;
  if (locale === "en")
    return {
      title: `Check anomaly ${label} · ${x.unitName} · ${x.businessDate} · ${x.valueText}`,
      description: [`Rule ${x.rule}: ${label}`, "See the details in the anomaly report (permission required)."].join("\n"),
      linkLabel: "Anomaly report",
    };
  return {
    title: `ตรวจจุดผิดปกติ ${label} · ${x.unitName} · ${x.businessDate} · ${x.valueText}`,
    description: [`กฎ ${x.rule}: ${label}`, "ดูรายละเอียดในรายงานจุดผิดปกติ (ต้องมีสิทธิ์)"].join("\n"),
    linkLabel: "รายงานจุดผิดปกติ",
  };
}
