// ระบบของร้านบนแถบบน + แผ่นดึงลง (เจ้าของอนุมัติแบบ topbar2 · 17 พ.ย.) — store กลางเดียวของแอป
//   แถบบนทุกจอ (SecTopBar · แถบเลื่อนไอคอนระบบ) และแผ่นดึงลง (BusinessSwitcherSheet · ตาราง "ระบบของร้าน") อ่านชุดเดียวกันจากที่นี่
//   ⇒ ลากจัดลำดับในแผ่น = `setLiveOrder` ทุกครั้งที่ตำแหน่งวางเปลี่ยน → แถบบนเรียงตามทันที (ไม่ต้องรอ "เสร็จ") · "เสร็จ" = `saveNavOrder` (PUT systems/order)
//   ที่มา: GET secretary/systems (items เรียงตามลำดับของผู้ใช้แล้ว + `order` รวมช่อง "home") · เซิร์ฟเวอร์รุ่นเก่าไม่มี `order` = หน้าหลักขึ้นก่อน
//   แคชต่อ "ผู้ใช้ + กิจการ" (วาดทันทีตอนเปลี่ยนจอ · คนละคนบนเครื่องเดียว = คนละลำดับ) · โหลดใหม่: ครั้งแรกของกิจการ + ทุกครั้งที่เปิดแผ่น (badge สด) · พลาด = คงของเดิม (แถบยังมีทีม/ปฏิทิน/?)
//   ไอคอน Feather ตามรหัสระบบ (SYS_ICON) · สีจากธีม c.navSys[รหัส] (light/dark · ห้าม hex ในไฟล์นี้)
// 17 พ.ย. (เจ้าของสั่งจากเครื่องจริง: ทีม/ปฏิทิน จัดลำดับได้ · เว้นที่เหนือแถวแรก): ปุ่มโซน "ทีม" (/secretary/staff) "ปฏิทิน" (/secretary/calendar)
//   เป็นช่องในตัว (built-in) แบบเดียวกับ "home" — อยู่ในลำดับเดียวกัน · อยู่ในตารางของแผ่น · ลากจัดได้ · badge = badges.team / badges.calendar (store โซน)
//   ลำดับที่ไม่มี 2 คีย์นี้ (ไม่เคยบันทึก/บันทึกก่อน 17 พ.ย./เซิร์ฟเวอร์รุ่นเก่า) = ขึ้นหน้าสุด ทีม → ปฏิทิน (กติกาเดียวกับ orderNavKeys ของเซิร์ฟเวอร์)
//   แตะ = จอ native ของโซน (useOpenSystem รู้จักรหัส TEAM/CALENDAR) · สีธีม c.navSys.TEAM / CALENDAR
//   ช่อง "home" (คีย์/href /app เดิม) ชื่อใหม่ "Dashboard" (th/en · sec.sheet.home) ไอคอน grid · ระบบรหัสที่ไม่รู้จัก = package แทน grid
import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { IconName } from "@/src/components/airy";
import { secGet, secPut, type NavSystemRow } from "@/src/api/secretary";
import { useAuth } from "@/src/lib/auth-context";
import { useZoneBadgeCounts, type ZoneCounts } from "@/src/api/secretary";
import { useT } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";

export const HOME_KEY = "home";
export const TEAM_KEY = "team";
export const CAL_KEY = "calendar";
/** ช่องที่ขาดจากลำดับที่บันทึก ⇒ ขึ้นหน้าสุดตามนี้ (ผู้ใช้เดิมเห็นแถบเหมือนเดิมจนจัดเอง) — ตรงกับ NAV_FRONT_KEYS ของเซิร์ฟเวอร์ */
const FRONT_KEYS = [TEAM_KEY, CAL_KEY] as const;
/** ช่องในตัวของแอป (ไม่ใช่ระบบของร้าน): ทีม ปฏิทิน หน้าหลัก */
export const BUILTIN_KEYS: readonly string[] = [TEAM_KEY, CAL_KEY, HOME_KEY];
/** รหัสของช่องที่เปิดจอ native (href = เส้นทางในแอป ไม่ใช่หน้าเว็บ) */
export const NATIVE_CODES: readonly string[] = ["TEAM", "CALENDAR"];

/** ไอคอน Feather ของแต่ละรหัสระบบ (ใกล้ภาพในแบบที่สุดที่ Feather มี) — รหัสใหม่ที่ยังไม่รู้จัก = package (17 พ.ย. เดิม grid · grid เป็นของ Dashboard แล้ว) */
const SYS_ICON: Record<string, IconName> = {
  HOME: "grid", // 17 พ.ย. (เจ้าของสั่ง): ช่อง "home" = Dashboard ไอคอน grid
  HOTEL: "key",
  RESTAURANT: "coffee",
  SHOP: "shopping-bag",
  BOOKING: "calendar",
  QUEUE: "credit-card", // แบบ topbar2 = บัตรคิว (รูปตั๋ว)
  TICKET: "tag",
  MEMBER: "user",
  REWARD: "gift",
  COUPON: "percent",
  POINT: "star",
  CHAT: "message-square",
  MEETING: "message-circle",
  ACCOUNT: "file-text",
  KANBAN: "clipboard",
  POS: "shopping-cart",
  CRM: "target",
  KB: "book-open",
  HR: "user", // แบบ topbar2 = รูปคน (สีม่วง) แยกจากสมาชิกด้วยสี
  INVENTORY: "box",
  MARKETING: "volume-2",
  RENTAL: "truck",
  SCHOOL: "award",
  CLINIC: "activity",
  PAGES: "layout",
};

export type NavTile = { key: string; label: string; icon: IconName; fg: string; bg: string; badge: number; href: string; code: string };

type Entry = { items: NavSystemRow[]; order: string[] };
type State = { cache: Record<string, Entry>; failed: Record<string, boolean>; live: string[] | null; v: number };
let state: State = { cache: {}, failed: {}, live: null, v: 0 };
const listeners = new Set<() => void>();
const inflight = new Map<string, Promise<void>>();
function emit(next: Partial<State>) {
  state = { ...state, ...next, v: state.v + 1 };
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** ลำดับเต็ม (รวม ทีม/ปฏิทิน/"home") จากคำตอบ — ไม่มี `order` (เซิร์ฟเวอร์รุ่นเก่า) = ทีม ปฏิทิน หน้าหลัก แล้วตาม items
 *  ทีม/ปฏิทินที่ไม่อยู่ใน `order` = หน้าสุด · คีย์อื่นที่ขาด = ต่อท้าย (🔴 กติกาเดียวกับ orderNavKeys ใน src/lib/core/nav-systems.ts) */
export function fullOrder(items: readonly NavSystemRow[], order: readonly string[] | undefined): string[] {
  const keys = [...BUILTIN_KEYS, ...items.map((x) => x.key)];
  const have = new Set(keys);
  const kept = new Set(order ?? []);
  const out: string[] = [];
  for (const k of FRONT_KEYS) if (!kept.has(k)) out.push(k);
  for (const k of order ?? []) if (have.has(k) && !out.includes(k)) out.push(k);
  for (const k of keys) if (!out.includes(k)) out.push(k);
  return out;
}

/** คีย์แคช = ผู้ใช้ + กิจการ */
export function navKey(userId: string | null | undefined, tenantId: string | null | undefined): string | null {
  return tenantId ? `${userId ?? ""}|${tenantId}` : null;
}

/** โหลดระบบของกิจการ active (ซ้ำซ้อนกันได้ = ใช้คำขอเดียว) · `force` = โหลดแม้มีแคช · key = navKey(ผู้ใช้, กิจการ) */
export function loadNavSystems(key: string | null, force = false): Promise<void> {
  if (!key) return Promise.resolve();
  const tenantId = key;
  if (!force && state.cache[tenantId]) return Promise.resolve();
  const running = inflight.get(tenantId);
  if (running) return running;
  const p = secGet("secretary/systems")
    .then((r) => {
      const items = Array.isArray(r?.items) ? r.items : [];
      emit({ cache: { ...state.cache, [tenantId]: { items, order: fullOrder(items, r?.order) } }, failed: { ...state.failed, [tenantId]: false } });
    })
    .catch(() => emit({ failed: { ...state.failed, [tenantId]: true } }))
    .finally(() => inflight.delete(tenantId));
  inflight.set(tenantId, p);
  return p;
}

/** ระหว่างลากในแผ่น: ลำดับชั่วคราว (แถบบนเรียงตามทันที) · null = เลิก (กลับลำดับที่บันทึก) */
export function setLiveOrder(keys: string[] | null) {
  emit({ live: keys });
}

/** "เสร็จ": บันทึกลำดับของผู้ใช้คนนี้ในกิจการนี้ (PUT systems/order) — เขียนแคชก่อน (ไม่กระพริบ) · ล้ม = โยนให้ผู้เรียกบอกผู้ใช้ */
export async function saveNavOrder(key: string, keys: string[]): Promise<void> {
  const tenantId = key;
  const cur = state.cache[tenantId];
  if (cur) emit({ cache: { ...state.cache, [tenantId]: { ...cur, order: fullOrder(cur.items, keys) } }, live: null });
  else emit({ live: null });
  const r = await secPut("secretary/systems/order", { keys });
  const now = state.cache[tenantId];
  if (now && Array.isArray(r?.order)) emit({ cache: { ...state.cache, [tenantId]: { ...now, order: fullOrder(now.items, r.order) } } });
}

/** ระบบของกิจการ active เป็นช่องพร้อมวาด (ลำดับของผู้ใช้ · ระหว่างลาก = ลำดับชั่วคราว) — โหลดเองครั้งแรกของกิจการ
 *  `zoneBadges` ใส่มา = badge ทีม/ปฏิทินจากค่านี้ (props `badges` ของแถบบน) · ไม่ใส่ = store โซนกลาง (useZoneBadgeCounts) */
export function useNavTiles(zoneBadges?: Partial<ZoneCounts>): { tiles: NavTile[]; loaded: boolean; failed: boolean; order: string[]; key: string | null } {
  const { c } = useTheme();
  const shared = useZoneBadgeCounts();
  const teamN = (zoneBadges ?? shared).team ?? 0;
  const calN = (zoneBadges ?? shared).calendar ?? 0;
  const t = useT();
  const { user, activeTenantId } = useAuth();
  const key = navKey(user?.id, activeTenantId);
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    void loadNavSystems(key);
  }, [key]);
  const entry = key ? s.cache[key] : undefined;
  const failed = !!(key && s.failed[key]);
  return useMemo(() => {
    const items = entry?.items ?? [];
    // ยังไม่โหลด/โหลดพลาด = ช่องในตัว (ทีม ปฏิทิน หน้าหลัก) ⇒ แถบยังมีทีม/ปฏิทิน/?
    const order = s.live && entry ? fullOrder(items, s.live) : (entry?.order ?? fullOrder([], undefined));
    const byKey = new Map(items.map((x) => [x.key, x]));
    const tiles: NavTile[] = [];
    for (const k of order) {
      if (k === HOME_KEY) {
        const look = c.navSys.HOME;
        tiles.push({ key: HOME_KEY, label: t("sec.sheet.home"), icon: "grid", fg: look.fg, bg: look.bg, badge: 0, href: "/app", code: "HOME" });
        continue;
      }
      if (k === TEAM_KEY) {
        const look = c.navSys.TEAM;
        tiles.push({ key: TEAM_KEY, label: t("sec.zone.team"), icon: "users", fg: look.fg, bg: look.bg, badge: teamN, href: "/secretary/staff", code: "TEAM" });
        continue;
      }
      if (k === CAL_KEY) {
        const look = c.navSys.CALENDAR;
        tiles.push({ key: CAL_KEY, label: t("cal.zone"), icon: "calendar", fg: look.fg, bg: look.bg, badge: calN, href: "/secretary/calendar", code: "CALENDAR" });
        continue;
      }
      const x = byKey.get(k);
      if (!x) continue;
      const look = (c.navSys as Record<string, { fg: string; bg: string }>)[x.code] ?? c.navSys.other;
      tiles.push({ key: x.key, label: x.label, icon: SYS_ICON[x.code] ?? "package", fg: look.fg, bg: look.bg, badge: x.badge, href: x.href, code: x.code });
    }
    return { tiles, loaded: !!entry, failed, order, key };
  }, [entry, s.live, failed, c, t, key, teamN, calN]);
}

/** ช่องที่ "เปิดอยู่" ตามพาธเว็บในหน้าระบบ — href ที่ยาวที่สุดที่เป็นต้นพาธ (/app เปล่า = หน้าหลักเท่านั้น) */
export function activeTileKey(tiles: readonly NavTile[], path: string | undefined | null): string | null {
  if (!path) return null;
  const p = path.split("?")[0]!.replace(/\/+$/, "") || "/";
  let best: NavTile | null = null;
  for (const x of tiles) {
    if (NATIVE_CODES.includes(x.code)) continue; // ทีม/ปฏิทิน = จอ native ไม่ใช่หน้าเว็บ
    const h = x.href.replace(/\/+$/, "");
    const hit = x.key === HOME_KEY ? p === h : p === h || p.startsWith(`${h}/`);
    if (hit && (!best || h.length > best.href.length)) best = x;
  }
  return best?.key ?? null;
}

/** QC/ทดสอบ: ล้าง store (เปลี่ยนผู้ใช้) */
export function resetNavSystems() {
  inflight.clear();
  emit({ cache: {}, failed: {}, live: null });
}
