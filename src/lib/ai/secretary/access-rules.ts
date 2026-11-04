// access-rules.ts — กติกาสิทธิ์ต่อระบบ 3 ระดับของเลขา ส่วน pure (S1.3 · ไม่ import อะไรเลย)
//
// ระดับ: OFF = เลขาแตะระบบนี้ไม่ได้เลย · READ = ดูได้อย่างเดียว · DRAFT = ร่างให้คนอนุมัติ (ค่าเริ่มต้น)
// AUTO (ทำเองไม่ต้องอนุมัติ) ไม่มีในรุ่นแรก (มติเจ้าของ 5)
// สิทธิ์สุทธิ = สิทธิ์ของคนที่พิมพ์ (membership) ∩ ระดับของร้าน — ตัวตรวจ membership อยู่ที่ tool-access.ts (ตรวจก่อน)
//   แล้วค่อยระดับที่นี่ (`levelVerdict`) · ใช้ 3 ที่: ยื่นเครื่องมือ (service) · runTool · executeProposal/runKind
// ไฟล์นี้ไม่ import อะไร: tool-access.ts (pure) และ persona.ts ใช้ได้โดยไม่เกิดวงโหลด · ส่วนฐานข้อมูลอยู่ที่ ./access.ts

export const ACCESS_LEVELS = ["OFF", "READ", "DRAFT"] as const; // AUTO ไม่มีในรุ่นแรก
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/**
 * โมดูลที่เจ้าของตั้งระดับได้ — ชื่อ = `module` ของ AccessQuery ที่ด่านเครื่องมือ/ข้อเสนอใช้จริง
 * (HAND_TOOL_ACCESS.needs · HAND_TOOL_MODULE · KIND_ACCESS ของ proposals.ts · ทะเบียน op ของ 5 โมดูล) — ข้อสอบ B-0 ตรวจว่าครบ
 */
export const AI_MODULES = [
  "pos", "crm", "member", "account", "kanban", "chat", "inventory", "hr", "booking", "queue", "hotel", "dorm",
  "rental", "school", "clinic", "shop", "kb", "approval", "automation", "system",
  "marketing", "coupon", "reward", "point", "ticket", "restaurant", "calendar",
] as const;
export type AiModule = (typeof AI_MODULES)[number];

/** โมดูลแกนกลางที่ปิดไม่ได้ (ask_clarify · list_systems · support_open_case · remember_fact · งานประจำของผู้ช่วย ฯลฯ) */
export const ALWAYS_ON = ["ai", "support", "secretary"] as const;

/** map ระดับต่อโมดูล — ครบทุก AI_MODULES เสมอ (ค่าที่ไม่มีแถว = ค่าเริ่มต้น) */
export type AccessMap = Readonly<Record<string, AccessLevel>>;

export const DEFAULT_LEVEL: AccessLevel = "DRAFT";
/** แชทลูกค้าเริ่มที่ดูอย่างเดียวจนกว่าเจ้าของจะเปิด (ส่งถึงลูกค้า = ต้องอนุมัติเสมอ) */
export const DEFAULT_OVERRIDES = { chat: "READ" } as const;

export const MODULE_LABEL_TH: Readonly<Record<AiModule, string>> = {
  pos: "ขายหน้าร้าน (POS)",
  crm: "ลูกค้าสัมพันธ์ (CRM)",
  member: "สมาชิก",
  account: "บัญชี",
  kanban: "บอร์ดงาน",
  chat: "แชทลูกค้า",
  inventory: "คลังสินค้า",
  hr: "พนักงาน/ใบลา",
  booking: "นัดหมาย",
  queue: "บัตรคิว",
  hotel: "ห้องพัก/โรงแรม",
  dorm: "หอพัก",
  rental: "เช่าของ",
  school: "โรงเรียน/คอร์สเรียน",
  clinic: "คลินิก",
  shop: "ร้านค้าออนไลน์",
  kb: "คลังความรู้",
  approval: "สายอนุมัติ",
  automation: "กฎอัตโนมัติ",
  system: "เปิดระบบใหม่",
  marketing: "การตลาด/แคมเปญ",
  coupon: "คูปอง",
  reward: "แลกรางวัล",
  point: "แต้มสะสม",
  ticket: "ตั๋วอีเวนต์",
  restaurant: "ร้านอาหาร (โต๊ะ/บิล)",
  calendar: "ปฏิทิน",
};

export const isAiModule = (m: string): m is AiModule => (AI_MODULES as readonly string[]).includes(m);
export const isAlwaysOn = (m: string): boolean => (ALWAYS_ON as readonly string[]).includes(m);
export const isAccessLevel = (v: unknown): v is AccessLevel => typeof v === "string" && (ACCESS_LEVELS as readonly string[]).includes(v);
export const moduleLabel = (m: string): string => (isAiModule(m) ? MODULE_LABEL_TH[m] : m);

export function defaultLevelOf(module: string): AccessLevel {
  return (DEFAULT_OVERRIDES as Readonly<Record<string, AccessLevel>>)[module] ?? DEFAULT_LEVEL;
}

/**
 * แถวในฐาน → map ครบทุกโมดูล · โมดูลที่ไม่รู้จัก = ข้าม ·
 * ระดับที่ไม่รู้จัก = OFF (ปิดไว้ก่อน) ยกเว้น "AUTO" (จากรุ่นถัดไปที่ถูกถอยกลับ) = DRAFT (ยังต้องอนุมัติ)
 */
export function accessFromRows(rows: readonly { module: string; level: string }[]): AccessMap {
  const out: Record<string, AccessLevel> = {};
  for (const m of AI_MODULES) out[m] = defaultLevelOf(m);
  for (const r of rows) {
    if (!isAiModule(r.module)) continue;
    out[r.module] = isAccessLevel(r.level) ? r.level : r.level === "AUTO" ? "DRAFT" : "OFF";
  }
  return Object.freeze(out);
}

export type LevelVerdict = { ok: true } | { ok: false; reason: string };
const OK: LevelVerdict = { ok: true };

/**
 * ระดับของร้านยอมให้แตะโมดูลนี้ไหม · module null / ALWAYS_ON = แกนกลาง (ผ่านเสมอ)
 * โมดูลที่ไม่อยู่ในรายการ = ปฏิเสธ (ปิดไว้ก่อน — B-0 รับประกันว่าทุกโมดูลที่ด่านรู้จักอยู่ในรายการ)
 * map ที่ไม่มีคีย์ของโมดูล = ค่าเริ่มต้นของโมดูลนั้น
 */
export function levelVerdict(access: AccessMap, module: string | null, write: boolean): LevelVerdict {
  if (module === null || isAlwaysOn(module)) return OK;
  if (!isAiModule(module)) {
    return { ok: false, reason: `ระบบ "${module}" ยังไม่อยู่ในรายการสิทธิ์ของเลขา จึงยังให้เลขาใช้ไม่ได้ — แจ้งทีมงาน SHARK ได้ที่เมนูช่วยเหลือ` };
  }
  const level = access[module] ?? defaultLevelOf(module);
  if (level === "OFF") {
    return { ok: false, reason: `เจ้าของร้านปิดไม่ให้เลขาใช้ระบบ${MODULE_LABEL_TH[module]} — ถ้าต้องการให้ช่วยเรื่องนี้ ให้เจ้าของร้านเปิดที่ ตั้งค่าเลขา › สิทธิ์ต่อระบบ` };
  }
  if (level === "READ" && write) {
    return { ok: false, reason: `ระบบ${MODULE_LABEL_TH[module]} ตั้งไว้ให้เลขาดูได้อย่างเดียว จึงเสนอหรือแก้ไขรายการไม่ได้ — เจ้าของร้านปรับเป็น "ร่างให้อนุมัติ" ได้ที่ ตั้งค่าเลขา › สิทธิ์ต่อระบบ` };
  }
  return OK;
}

/**
 * pure · บรรทัดสำหรับ system prompt — "" เมื่อทุกโมดูลอยู่ที่ค่าเริ่มต้นหรือ DRAFT (chat READ ค่าเริ่มต้น = ไม่พูดถึง)
 * ⇒ ร้านที่ไม่เคยตั้งระดับได้ prompt เดิมทุกไบต์
 */
export function accessSummaryForPrompt(access: Readonly<Record<string, string>>): string {
  const off: string[] = [];
  const read: string[] = [];
  for (const m of AI_MODULES) {
    const level = access[m];
    if (level === undefined || level === defaultLevelOf(m)) continue;
    if (level === "OFF") off.push(MODULE_LABEL_TH[m]);
    else if (level === "READ") read.push(MODULE_LABEL_TH[m]);
  }
  const lines: string[] = [];
  if (off.length > 0) lines.push(`- ระบบที่เจ้าของร้านปิดไม่ให้เลขาแตะ (ห้ามดู ห้ามเสนอ — ถ้าผู้ใช้ขอ ให้บอกตรง ๆ ว่าเจ้าของร้านปิดไว้): ${off.join(" · ")}`);
  if (read.length > 0) lines.push(`- ระบบที่ดูได้อย่างเดียว (ดูข้อมูลได้ แต่ห้ามเสนอการเพิ่ม/แก้ไข/ลบ): ${read.join(" · ")}`);
  return lines.join("\n");
}
