// SVC H.6 ▸ แม่บ้านมือถือ — ของกลางฝั่งจอ (pure · ไม่มี directive · ไม่ import ค่านอกจาก hk-state ที่ pure)
//   ป้ายไทยของบริบท/สถานะ · ข้อความการ์ด (ภาพ 13 ก) · เวลาไทย · คีย์กันส่งซ้ำ · รูปข้อมูลที่หน้าเซิร์ฟเวอร์ส่งให้จอ
import { hkPriority } from "@/lib/modules/hotel/hk-state";

export type HkContextKey = "DEPARTED" | "DEPARTING" | "ARRIVING" | "STAYOVER" | "VACANT" | "OOO";
export type HkStatusKey = "DIRTY" | "CLEAN" | "INSPECTED" | "OUT_OF_ORDER";

/** แถวบอร์ด (สำเนาสัญญา hkBoard — จอไม่ import โมดูลเซิร์ฟเวอร์) */
export type HkRow = {
  roomId: string;
  number: string;
  floor: number | null;
  typeName: string;
  roomTypeId: string;
  hkStatus: string;
  context: string;
  arrivalTime: string | null;
  arrivalName: string | null;
  guestRequest: string | null;
  assignedTo: string | null;
  startedAt: string | null;
  departedAt: string | null;
  hkUpdatedAt: string | null;
  priority: number;
  done: boolean;
  upcoming?: true;
  upcomingDate?: string;
};
export type HkCounts = { mine: number; total: number; done: number };
export type HkMinibarItem = { key: string; name: string; priceSatang: number };
export type HkResult = { ok: boolean; code?: string; reason?: string };
/** action ที่หน้าเซิร์ฟเวอร์ผูก unitSlug แล้วส่งให้จอ */
export type HkSend = (input: Record<string, unknown>) => Promise<HkResult>;
export type HkDefectSend = (form: FormData) => Promise<HkResult & { conflicts?: { code: string; guestName: string }[] }>;

export const HK_CONTEXT_TH: Record<HkContextKey, string> = {
  DEPARTED: "ออกแล้ว",
  DEPARTING: "ออกวันนี้",
  ARRIVING: "แขกเข้า",
  STAYOVER: "ค้างต่อ",
  VACANT: "ห้องว่าง",
  OOO: "ปิดซ่อม",
};
export const HK_STATUS_TH: Record<HkStatusKey, string> = {
  DIRTY: "รอทำความสะอาด",
  CLEAN: "สะอาด · รอตรวจ",
  INSPECTED: "ตรวจแล้ว ✓",
  OUT_OF_ORDER: "ปิดซ่อม",
};
export const contextTh = (c: string): string => HK_CONTEXT_TH[c as HkContextKey] ?? c;
export const statusTh = (s: string, inspectionRequired = true): string => (s === "CLEAN" && !inspectionRequired ? "สะอาด · ขายได้" : (HK_STATUS_TH[s as HkStatusKey] ?? s));

const TH_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "ศ. 6 พ.ย." จาก YYYY-MM-DD (คิดจากวันที่ UTC ของสตริงเอง ไม่ใช้นาฬิกาเครื่อง) */
export function thShortDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return ymd;
  return `${TH_DOW[d.getUTCDay()]} ${d.getUTCDate()} ${TH_MON[d.getUTCMonth()]}`;
}
/** "10:12" เวลาไทยของ ISO */
export function thTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + 7 * 3_600_000).toISOString().slice(11, 16);
}
/** นาทีตั้งแต่เริ่มทำ (ปัดลง · ไม่ติดลบ) */
export function minutesSince(iso: string | null | undefined, nowMs: number): number {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? Math.max(0, Math.floor((nowMs - ms) / 60_000)) : 0;
}

/** หัว/รอง/ป้ายของการ์ดห้อง (ภาพ 13 ก) */
export function cardText(r: HkRow, opts: { inspectionRequired: boolean; meId: string | null }): { title: string; sub: string; badge: string | null; urgent: boolean; dim: boolean } {
  const tier = hkPriority(r);
  const req = r.guestRequest ? r.guestRequest : "";
  const mineNow = r.assignedTo && r.assignedTo === opts.meId ? "กำลังทำ" : r.assignedTo ? "มีคนทำอยู่" : "";
  const join = (...xs: string[]) => xs.filter(Boolean).join(" · ");
  if (r.context === "OOO") return { title: "ปิดซ่อม", sub: "ห้องปิดอยู่ — รอช่าง", badge: null, urgent: false, dim: true };
  if (r.context === "DEPARTED") {
    if (r.hkStatus === "DIRTY") return { title: "ออกแล้ว · ทำความสะอาด", sub: join(opts.inspectionRequired ? "ขายได้หลังตรวจ" : "ขายได้เมื่อเสร็จ", r.arrivalTime ? `เป้า ${r.arrivalTime}` : "", mineNow, req), badge: tier === 0 ? "ด่วน" : null, urgent: tier === 0, dim: false };
    return { title: `ออกแล้ว · ${statusTh(r.hkStatus, opts.inspectionRequired)}`, sub: join(r.arrivalTime ? `แขกเข้า ${r.arrivalTime}` : "", req), badge: r.hkStatus === "CLEAN" && opts.inspectionRequired ? "ตรวจ" : null, urgent: false, dim: r.done };
  }
  if (r.context === "DEPARTING") return { title: "ออกวันนี้ · รอแขกออก", sub: join(statusTh(r.hkStatus, opts.inspectionRequired), mineNow, req), badge: null, urgent: false, dim: false };
  if (r.context === "ARRIVING") {
    const head = `แขกเข้า ${r.arrivalTime ?? ""}`.trim();
    if (r.hkStatus === "DIRTY") return { title: `${head} · ทำความสะอาด`, sub: join(r.arrivalName ?? "", mineNow, req), badge: "ด่วน", urgent: true, dim: false };
    return { title: `${head} · ตรวจห้อง`, sub: join(r.arrivalName ?? "", req), badge: "ตรวจ", urgent: false, dim: r.done };
  }
  if (r.context === "STAYOVER") {
    if (r.hkStatus === "DIRTY") return { title: "ค้างต่อ · ทำระหว่างพัก", sub: join(req, mineNow), badge: "ค้างต่อ", urgent: false, dim: false };
    return { title: `ค้างต่อ · ${statusTh(r.hkStatus, opts.inspectionRequired)}`, sub: req, badge: "ค้างต่อ", urgent: false, dim: r.done };
  }
  if (r.upcoming && r.hkStatus === "INSPECTED") return { title: "ตรวจแล้ว ✓", sub: join(`พร้อมรับ${r.arrivalName ? ` ${r.arrivalName}` : ""}`, r.upcomingDate ? thShortDate(r.upcomingDate) : ""), badge: null, urgent: false, dim: true };
  if (r.hkStatus === "DIRTY") return { title: "ห้องว่าง · ทำความสะอาด", sub: join(mineNow, req), badge: null, urgent: false, dim: false };
  return { title: `ห้องว่าง · ${statusTh(r.hkStatus, opts.inspectionRequired)}`, sub: req, badge: null, urgent: false, dim: true };
}

/** ห้องในงานวันนี้ (นิยามเดียวกับเซิร์ฟเวอร์ — มติ h.6 §9 ข้อ 4) */
export const isWorkRow = (r: HkRow): boolean => r.context !== "OOO" && (r.context !== "VACANT" || r.hkStatus === "DIRTY" || r.upcoming === true);

/** คีย์กันส่งซ้ำของการกดหนึ่งครั้ง (ส่งซ้ำตอนเน็ตกลับ = คีย์เดิม) */
export function newIdempotencyKey(prefix = "hk"): string {
  const c = typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function" ? globalThis.crypto.randomUUID().replace(/-/g, "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${c}`.slice(0, 80);
}

/** เงินบาทจากสตางค์ "฿40" / "฿40.50" */
export const baht = (satang: number): string => `฿${(satang / 100).toLocaleString("th-TH", { minimumFractionDigits: satang % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;

// ───────────────────────── คิวออฟไลน์ (localStorage) ─────────────────────────
export type HkQueueKind = "setStatus" | "finish" | "inspect" | "minibar" | "start";
export type HkQueued = { id: string; kind: HkQueueKind; input: Record<string, unknown>; at: number; tries: number };
export const HK_QUEUE_STORE = "shark.hotel.hk.queue.v1";
export const HK_QUEUE_EVENT = "shark-hk-queue";
