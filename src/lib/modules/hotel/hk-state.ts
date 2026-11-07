// SVC H.6 ▸ แม่บ้าน — state machine ของ hkStatus (S §7.6) · ลำดับด่วนของงานห้อง · hkNote JSON (ใบสั่ง ledger/svc-briefs/svc-brief-h.6.md §0 · §9 ข้อ 2/8)
//   pure ล้วน: ไม่มี directive · ไม่ import ค่า (prisma/db/settings/next) — ใช้ได้ทั้งเซิร์ฟเวอร์และจอ
//   • แม่บ้าน (MAID): DIRTY→CLEAN · CLEAN|INSPECTED→DIRTY (สั่งทำใหม่/ใช้งาน)
//   • หัวหน้า (INSPECTOR = hotel.housekeeping.inspect): ทุกอย่างของแม่บ้าน + CLEAN→INSPECTED
//   • ระบบ (SYSTEM = BLOCK ของ H.2 · night audit): *→OUT_OF_ORDER · OUT_OF_ORDER→DIRTY · CLEAN|INSPECTED→DIRTY
//   • คนกด OUT_OF_ORDER เข้า/ออกเองไม่ได้ (ต้องปิดห้อง/ปล่อยห้อง) · DIRTY→INSPECTED ไม่ได้ (ต้องทำความสะอาดก่อน) · INSPECTED→CLEAN ไม่ได้

export const HK_STATUS_LIST = ["DIRTY", "CLEAN", "INSPECTED", "OUT_OF_ORDER"] as const;
export type HkState = (typeof HK_STATUS_LIST)[number];
export const HK_ROLES = ["MAID", "INSPECTOR", "SYSTEM"] as const;
export type HkRole = (typeof HK_ROLES)[number];
export type HkTransitionOpts = { role: HkRole | string; inspectionRequired?: boolean };
export type HkTransition = { from: HkState; to: HkState; roles: readonly HkRole[] };

/** ตารางเส้นทางที่อนุญาต (แหล่งเดียวของ canHkTransition) */
export const HK_TRANSITIONS: readonly HkTransition[] = [
  { from: "DIRTY", to: "CLEAN", roles: ["MAID", "INSPECTOR"] },
  { from: "CLEAN", to: "INSPECTED", roles: ["INSPECTOR"] },
  { from: "CLEAN", to: "DIRTY", roles: ["MAID", "INSPECTOR", "SYSTEM"] },
  { from: "INSPECTED", to: "DIRTY", roles: ["MAID", "INSPECTOR", "SYSTEM"] },
  { from: "DIRTY", to: "OUT_OF_ORDER", roles: ["SYSTEM"] },
  { from: "CLEAN", to: "OUT_OF_ORDER", roles: ["SYSTEM"] },
  { from: "INSPECTED", to: "OUT_OF_ORDER", roles: ["SYSTEM"] },
  { from: "OUT_OF_ORDER", to: "DIRTY", roles: ["SYSTEM"] },
];

export const isHkState = (v: unknown): v is HkState => typeof v === "string" && (HK_STATUS_LIST as readonly string[]).includes(v);
const isRole = (v: unknown): v is HkRole => typeof v === "string" && (HK_ROLES as readonly string[]).includes(v);

/**
 * เปลี่ยนสถานะ from→to ได้ไหมสำหรับบทบาทนี้ — คืน boolean เสมอ (ค่าขยะ/บทบาทแปลก/opts หาย ⇒ false ไม่ throw)
 *   inspectionRequired ไม่ปิดทางตรวจของหัวหน้า (ปิด = CLEAN ขายได้เลย แต่หัวหน้ายังตรวจได้ถ้าต้องการ)
 */
export function canHkTransition(from: unknown, to: unknown, opts?: HkTransitionOpts | null): boolean {
  if (!isHkState(from) || !isHkState(to) || from === to) return false;
  const role = opts && typeof opts === "object" ? opts.role : undefined;
  if (!isRole(role)) return false;
  return HK_TRANSITIONS.some((t) => t.from === from && t.to === to && t.roles.includes(role));
}

// ───────────────────────── ลำดับด่วน (ใบ §0) ─────────────────────────
export const HK_CONTEXTS = ["DEPARTED", "DEPARTING", "ARRIVING", "STAYOVER", "VACANT", "OOO"] as const;
export type HkContext = (typeof HK_CONTEXTS)[number];
export type HkPriorityRow = { context: string; hkStatus: string; arrivalTime?: string | null };

/**
 * ค่าน้อย = ด่วนก่อน (ทิศเดียวกับการเรียงบอร์ด) · ห้องชั้นเดียวกันได้ค่าเท่ากัน:
 *   0 ออกแล้ว + มีแขกเข้าวันนี้ · 1 แขกเข้าวันนี้ · 2 ออกแล้ว/ออกวันนี้ · 3 ค้างต่อ · 4 ว่างแต่ยังไม่สะอาด · 5 อื่น (ว่างสะอาด · ปิดซ่อม)
 */
export function hkPriority(row: HkPriorityRow): number {
  const c = row?.context;
  const hasArrival = typeof row?.arrivalTime === "string" && row.arrivalTime.length > 0;
  if (c === "DEPARTED" && hasArrival) return 0;
  if (c === "ARRIVING") return 1;
  if (c === "DEPARTED" || c === "DEPARTING") return 2;
  if (c === "STAYOVER") return 3;
  if (c === "VACANT" && row?.hkStatus === "DIRTY") return 4;
  return 5;
}

// ───────────────────────── hkNote JSON (มติ §9 ข้อ 2) ─────────────────────────
/** เก็บใน HotelRoom.hkNote — 3 คีย์เท่านั้น: ใครกดเริ่มทำ · เริ่มเมื่อ (ISO) · คำขอแขก */
export type HkNote = { assignedTo?: string; startedAt?: string; guestRequest?: string };
const NOTE_KEYS = ["assignedTo", "startedAt", "guestRequest"] as const;
const NOTE_MAX = 300;

/** อ่าน hkNote: ว่าง/JSON ขยะ/array ⇒ {} · ข้อความธรรมดาแบบเดิม (ไม่ใช่ JSON) ⇒ ถือเป็นคำขอแขก · ไม่ throw */
export function parseHkNote(raw: unknown): HkNote {
  if (typeof raw !== "string") return {};
  const s = raw.trim();
  if (!s) return {};
  if (s.startsWith("{")) {
    try {
      const v: unknown = JSON.parse(s);
      if (!v || typeof v !== "object" || Array.isArray(v)) return {};
      const src = v as Record<string, unknown>;
      const out: HkNote = {};
      for (const k of NOTE_KEYS) {
        const x = src[k];
        if (typeof x === "string" && x.trim()) out[k] = x.slice(0, NOTE_MAX);
      }
      return out;
    } catch {
      return {};
    }
  }
  // ข้อความเดิมก่อน H.6 (หรือ "[1,2]" / "42" = ไม่ใช่โน้ต) ⇒ เฉพาะข้อความที่ไม่ใช่ JSON ค่าเดี่ยว
  try {
    JSON.parse(s);
    return {};
  } catch {
    return { guestRequest: s.slice(0, NOTE_MAX) };
  }
}

/** เขียน hkNote: เฉพาะ 3 คีย์ที่มีค่า · ว่างทั้งหมด ⇒ null (ล้างคอลัมน์) */
export function serializeHkNote(note: HkNote | null | undefined): string | null {
  if (!note || typeof note !== "object") return null;
  const out: HkNote = {};
  for (const k of NOTE_KEYS) {
    const x = (note as Record<string, unknown>)[k];
    if (typeof x === "string" && x.trim()) out[k] = x.trim().slice(0, NOTE_MAX);
  }
  return Object.keys(out).length ? JSON.stringify(out) : null;
}
