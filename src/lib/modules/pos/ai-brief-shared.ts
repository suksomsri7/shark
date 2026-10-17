// ai-brief-shared.ts — ตัวประกอบข้อความ "สรุปเช้า POS" (Daily Brief) แบบบริสุทธิ์ (POS P3.9 ▸ R6 R12 · มติ 3 · addendum TEAM_SAFE_SECTIONS ◂)
//
// 🔴 บริสุทธิ์: ไม่มี prisma / db / เครือข่าย / นาฬิกา — ข้อความเดียวกันทุกครั้งสำหรับ input เดียวกัน (ข้อสอบเทียบตัวอักษร · golden F1–F3)
// 🔴 ไม่มี LLM (มติ 3): แม่แบบล้วน · ต้นทุน 0 · ไม่มีข้อมูลส่วนตัว (ชื่อแสดงผลของสินค้า/เครื่อง/กฎเท่านั้น · ไม่มีเงินเดือน/ค่าคอมฯ พนักงาน)
// 🔴 ส่วนที่เป็น null = ถูกปฏิเสธ/ปิด ⇒ ไม่มีบรรทัด (ไม่แสดงเป็น 0) · client component import ไฟล์นี้ได้

export type BriefDaily = { netSalesSatang: number; billCount: number; avgBillSatang: number };
export type BriefProduct = { name: string; qty: number; salesSatang: number };
export type BriefInput = {
  businessDate: string;
  systemName: string;
  daily: BriefDaily | null;
  lastWeek: BriefDaily | null;
  topProducts: BriefProduct[] | null;
  bottomProducts: BriefProduct[] | null;
  peakHour: { hour: number; netSalesSatang: number } | null;
  openShifts: number | null;
  overShort: { label: string; overShortSatang: number }[] | null;
  anomalies: { rule: string; count: number }[] | null;
  stockRisks: { name: string; onHand: number; reorderPoint: number }[] | null;
  soldOut: { name: string }[] | null;
  pendingApprovals: number | null;
  pendingProposals: number | null;
};
export type BriefLocale = "th" | "en";
export const BRIEF_SECTIONS = ["sales", "vsLastWeek", "top", "bottom", "peak", "openShifts", "overShort", "anomalies", "stock", "soldOut", "approvals", "proposals"] as const;
export type BriefSection = (typeof BRIEF_SECTIONS)[number];
export type BriefResult = { title: string; lines: string[]; sections: BriefSection[] };

/**
 * addendum P3.8 §10.4: ส่วนที่ "ห้องทีม" ใช้ได้ (ยอดขาย·จำนวนบิล · ขายดี · ของหมด · กะที่ยังเปิด) —
 * ไม่มีจุดผิดปกติรายคน · ไม่มีเงินขาด/เกินของกะ · ไม่มีงานรออนุมัติ/ข้อเสนอของคนใดคนหนึ่ง
 */
export const TEAM_SAFE_SECTIONS: readonly BriefSection[] = ["sales", "top", "soldOut", "openShifts"];

/** หัวเรื่อง — ใช้เป็นคีย์กันซ้ำต่อผู้รับด้วย (CD-2: มีชื่อระบบ POS · ร้านที่มี POS 2 ระบบไม่ชนกัน) */
export const BRIEF_TITLE_PREFIX: Readonly<Record<BriefLocale, string>> = { th: "สรุปเช้า POS", en: "POS morning brief" };
export const briefTitle = (systemName: string, businessDate: string, locale: BriefLocale = "th") => `${BRIEF_TITLE_PREFIX[locale]} · ${systemName} · ${businessDate}`;

const money = (satang: number) => `${satang < 0 ? "-" : ""}฿${(Math.abs(satang) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedMoney = (satang: number) => (satang > 0 ? `+${money(satang)}` : money(satang));
const pad2 = (n: number) => String(n).padStart(2, "0");
/** deltaBp → "+12.23%" / "-49.99%" / "0.00%" */
const pct = (bp: number) => `${bp > 0 ? "+" : bp < 0 ? "-" : ""}${(Math.abs(bp) / 100).toFixed(2)}%`;
/** สูตรเดียวกับ posDashboardCard.deltaBp (ปัดครึ่งขึ้นแบบ Math.round) · lastNet ≤ 0 = null */
export function briefDeltaBp(net: number, lastNet: number): number | null {
  return lastNet > 0 ? Math.round(((net - lastNet) * 10_000) / lastNet) : null;
}
const J = " · ";
const STOCK_SHOWN = 5;

const TXT = {
  th: {
    sales: (d: BriefDaily) => `ยอดขายสุทธิ ${money(d.netSalesSatang)}${J}${d.billCount} บิล${J}เฉลี่ย ${money(d.avgBillSatang)}/บิล`,
    vs: (bp: number) => `เทียบวันเดียวกันสัปดาห์ก่อน ${pct(bp)}`,
    top: "ขายดี: ",
    bottom: "ขายน้อย: ",
    peak: "ชั่วโมงขายดี ",
    open: (n: number) => `กะที่ยังไม่ปิด ${n} กะ`,
    overShort: "เงินขาด/เกิน: ",
    anomalies: "จุดผิดปกติ: ",
    none: "ไม่พบ",
    stock: "ใกล้หมด: ",
    soldOut: "ของหมด (86): ",
    approvals: (n: number) => `รออนุมัติ ${n} รายการ`,
    proposals: (n: number) => `ข้อเสนอ AI รอยืนยัน ${n} รายการ`,
  },
  en: {
    sales: (d: BriefDaily) => `Net sales ${money(d.netSalesSatang)}${J}${d.billCount} ${d.billCount === 1 ? "bill" : "bills"}${J}avg ${money(d.avgBillSatang)}/bill`,
    vs: (bp: number) => `vs same day last week ${pct(bp)}`,
    top: "Top sellers: ",
    bottom: "Slow sellers: ",
    peak: "Peak hour ",
    open: (n: number) => `Open shifts: ${n}`,
    overShort: "Cash over/short: ",
    anomalies: "Anomalies: ",
    none: "none",
    stock: "Low stock: ",
    soldOut: "Sold out (86): ",
    approvals: (n: number) => `Pending approvals: ${n}`,
    proposals: (n: number) => `AI proposals awaiting confirmation: ${n}`,
  },
} as const;

/**
 * R6 — สรุปเช้าของผู้รับหนึ่งคน (input = สิ่งที่ "คนนั้น" มีสิทธิ์เห็น · loadBriefInput)
 * ลำดับ/รหัสส่วน = BRIEF_SECTIONS · `opts.sections` = เลือกเฉพาะส่วน (เช่น TEAM_SAFE_SECTIONS ของห้องทีม P3.8)
 */
export function composeBrief(input: BriefInput, locale: BriefLocale = "th", opts: { sections?: readonly string[] } = {}): BriefResult {
  const t = TXT[locale === "en" ? "en" : "th"];
  const out: { id: BriefSection; line: string }[] = [];
  const add = (id: BriefSection, line: string) => out.push({ id, line });
  const d = input.daily;
  if (d) {
    add("sales", t.sales(d));
    const bp = input.lastWeek ? briefDeltaBp(d.netSalesSatang, input.lastWeek.netSalesSatang) : null;
    if (bp !== null) add("vsLastWeek", t.vs(bp));
  }
  const prods = (xs: BriefProduct[]) => xs.map((p) => `${p.name} ${p.qty}`).join(J);
  if (input.topProducts && input.topProducts.length) add("top", t.top + prods(input.topProducts));
  if (input.bottomProducts && input.bottomProducts.length) add("bottom", t.bottom + prods(input.bottomProducts));
  if (input.peakHour) add("peak", `${t.peak}${pad2(input.peakHour.hour)}:00-${pad2(input.peakHour.hour + 1)}:00 ${money(input.peakHour.netSalesSatang)}`);
  if (typeof input.openShifts === "number" && input.openShifts > 0) add("openShifts", t.open(input.openShifts));
  const os = (input.overShort ?? []).filter((x) => x.overShortSatang !== 0);
  if (os.length) add("overShort", t.overShort + os.map((x) => `${x.label} ${signedMoney(x.overShortSatang)}`).join(J));
  if (input.anomalies) add("anomalies", t.anomalies + (input.anomalies.length ? input.anomalies.map((a) => `${a.rule} ×${a.count}`).join(J) : t.none));
  if (input.stockRisks && input.stockRisks.length) add("stock", t.stock + input.stockRisks.slice(0, STOCK_SHOWN).map((s) => `${s.name} (${s.onHand}/${s.reorderPoint})`).join(J));
  if (input.soldOut && input.soldOut.length) add("soldOut", t.soldOut + input.soldOut.map((s) => s.name).join(J));
  if (typeof input.pendingApprovals === "number" && input.pendingApprovals > 0) add("approvals", t.approvals(input.pendingApprovals));
  if (typeof input.pendingProposals === "number" && input.pendingProposals > 0) add("proposals", t.proposals(input.pendingProposals));
  const keep = opts.sections ? out.filter((x) => opts.sections!.includes(x.id)) : out;
  return { title: briefTitle(input.systemName, input.businessDate, locale === "en" ? "en" : "th"), lines: keep.map((x) => x.line), sections: keep.map((x) => x.id) };
}
