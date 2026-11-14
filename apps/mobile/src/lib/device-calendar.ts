// ปฏิทินในเครื่อง (CAL2.11 · สัญญา §10.6 · มติ M4) — expo-calendar (legacy API) · ฝั่งเครื่องเท่านั้น
//   🔴 ไม่ส่งอีเวนต์ในเครื่องขึ้นเซิร์ฟเวอร์เลย (ไม่เข้า API · ไม่เข้าเครื่องมือ AI · สรุปเช้าแบบ push ไม่รวม) — รวมเฉพาะตอนแสดงในแอป
//   ค่าเลือก (เปิด/ปิด · ปฏิทินที่ดึง · ส่งออกนัดส่วนตัว + ปฏิทินปลายทาง) + แผนที่ id { [calItemId]: deviceEventId } เก็บในเครื่อง
//     คีย์ `cal.device.<userId>` (SecureStore · เว็บ = localStorage) — เปลี่ยนผู้ใช้ = ค่าของอีกคน
//   ส่งออกได้เฉพาะ EVENT (นัดส่วนตัว) · แถว AgendaItem source "device" id "device:<eventId>" · mine true · ใช้ในนัดชนฝั่งแอป
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as Cal from "expo-calendar/legacy";
import type { AgendaItem, CalItemDto } from "@/src/api/calendar";
import { dayStartMs } from "./cal-date";

export type DeviceCalPrefs = { enabled: boolean; calendarIds: string[]; exportEvents: boolean; exportCalendarId: string | null; map: Record<string, string> };
export type DeviceCalendar = { id: string; title: string; color: string | null; writable: boolean; primary: boolean; source: string };

const EMPTY: DeviceCalPrefs = { enabled: false, calendarIds: [], exportEvents: false, exportCalendarId: null, map: {} };
export const deviceCalSupported = Platform.OS === "ios" || Platform.OS === "android";
/** ป้ายแหล่ง (จอ 10 "iPhone") */
export const deviceLabel = Platform.OS === "android" ? "ปฏิทินในเครื่อง" : "iPhone";

let userId: string | null = null;
let cache: { uid: string; p: DeviceCalPrefs } | null = null;
const listeners = new Set<() => void>();
/** ผู้ใช้ปัจจุบัน (ตั้งจาก CalSheetHost ของโซนเลขา) */
export function setDeviceCalUser(uid: string | null): void {
  if (uid === userId) return;
  userId = uid;
  cache = null;
  listeners.forEach((fn) => fn());
}
export function onDeviceCalChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const key = (uid: string) => `cal.device.${uid.replace(/[^A-Za-z0-9_.-]/g, "_")}`;

export async function loadDevicePrefs(): Promise<DeviceCalPrefs> {
  const uid = userId;
  if (!uid) return EMPTY;
  if (cache?.uid === uid) return cache.p;
  let p = EMPTY;
  try {
    const raw = Platform.OS === "web" ? (typeof localStorage === "undefined" ? null : localStorage.getItem(key(uid))) : await SecureStore.getItemAsync(key(uid));
    if (raw) p = { ...EMPTY, ...(JSON.parse(raw) as Partial<DeviceCalPrefs>) };
  } catch {
    p = EMPTY;
  }
  cache = { uid, p };
  return p;
}
export async function saveDevicePrefs(next: DeviceCalPrefs): Promise<void> {
  const uid = userId;
  if (!uid) return;
  cache = { uid, p: next };
  const raw = JSON.stringify(next);
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.setItem(key(uid), raw);
    } else await SecureStore.setItemAsync(key(uid), raw);
  } catch {
    /* จำในหน่วยความจำต่อ */
  }
  listeners.forEach((fn) => fn());
}

export async function devicePermission(): Promise<"granted" | "denied" | "undetermined"> {
  if (!deviceCalSupported) return "denied";
  try {
    const r = await Cal.getCalendarPermissionsAsync();
    return r.status === "granted" ? "granted" : r.canAskAgain === false || r.status === "denied" ? "denied" : "undetermined";
  } catch {
    return "denied";
  }
}

/** ขออนุญาตครั้งแรก (ตอนกด "ปฏิทิน iPhone" · จอ 8) — อนุญาต = เปิดใช้ + เลือกทุกปฏิทินของเครื่องเป็นค่าเริ่ม */
export async function connectDeviceCalendar(): Promise<"granted" | "denied"> {
  if (!deviceCalSupported) return "denied";
  try {
    const r = await Cal.requestCalendarPermissionsAsync();
    if (r.status !== "granted") return "denied";
    const cals = await listDeviceCalendars();
    const p = await loadDevicePrefs();
    await saveDevicePrefs({ ...p, enabled: true, calendarIds: p.calendarIds.length ? p.calendarIds : cals.map((c) => c.id), exportCalendarId: p.exportCalendarId ?? cals.find((c) => c.primary && c.writable)?.id ?? cals.find((c) => c.writable)?.id ?? null });
    return "granted";
  } catch {
    return "denied";
  }
}

export async function listDeviceCalendars(): Promise<DeviceCalendar[]> {
  if (!deviceCalSupported) return [];
  try {
    const list = await Cal.getCalendarsAsync(Cal.EntityTypes.EVENT);
    let defId: string | null = null;
    if (Platform.OS === "ios") defId = (await Cal.getDefaultCalendarAsync().catch(() => null))?.id ?? null;
    return list.map((c) => ({
      id: c.id,
      title: c.title,
      color: c.color ?? null,
      writable: !!c.allowsModifications,
      primary: c.id === defId || !!c.isPrimary,
      source: c.source?.name ?? "",
    }));
  } catch {
    return [];
  }
}

/** แถว AgendaItem ของช่วงวันไทย [from..to] — ปิดใช้/ไม่มีสิทธิ์ = [] · ไม่รวมอีเวนต์ที่แอปส่งออกเอง (มีแถวนัดส่วนตัวอยู่แล้ว) */
export async function deviceEventsFor(from: string, to: string): Promise<AgendaItem[]> {
  if (!deviceCalSupported) return [];
  const p = await loadDevicePrefs();
  if (!p.enabled || p.calendarIds.length === 0) return [];
  if ((await devicePermission()) !== "granted") return [];
  try {
    const start = new Date(dayStartMs(from));
    const end = new Date(dayStartMs(to) + 86_400_000 - 1);
    const mine = new Set(Object.values(p.map));
    const evs = await Cal.getEventsAsync(p.calendarIds, start, end);
    return evs
      .filter((e) => !mine.has(e.id) && e.status !== Cal.EventStatus.CANCELED)
      .slice(0, 300)
      .map((e) => {
        const s = new Date(e.startDate as string | Date).toISOString();
        const en = e.endDate ? new Date(e.endDate as string | Date).toISOString() : undefined;
        return {
          id: `device:${e.id}`,
          source: "device",
          title: (e.title || "—").slice(0, 120),
          sub: `จากปฏิทิน ${deviceLabel}`,
          label: deviceLabel,
          startAt: e.allDay ? new Date(dayStartMs(new Date(Date.parse(s) + 7 * 3600_000).toISOString().slice(0, 10))).toISOString() : s,
          endAt: e.allDay ? undefined : en,
          allDay: !!e.allDay,
          timeHint: e.allDay ? null : "DURATION",
          deepLink: null,
          checkable: false,
          done: false,
          mine: true,
          colorKey: "device",
        } satisfies AgendaItem;
      });
  } catch {
    return [];
  }
}

/**
 * ส่งออกนัดส่วนตัว (EVENT ที่ยัง OPEN) ไปปฏิทินในเครื่อง + ลบ/แก้ตามสถานะ · เก็บแผนที่ id ในเครื่อง
 * `open` = นัดส่วนตัวที่ยังเปิดอยู่ (ชุดที่จอรู้จัก) · `closedIds` = id ที่ยืนยันแล้วว่าปิด/ยกเลิก/ไม่พบ (ลบสำเนา)
 */
export async function syncDeviceExports(open: CalItemDto[], closedIds: string[]): Promise<void> {
  if (!deviceCalSupported) return;
  const p = await loadDevicePrefs();
  if (!p.enabled || !p.exportEvents || !p.exportCalendarId) return;
  if ((await devicePermission()) !== "granted") return;
  const map = { ...p.map };
  for (const it of open) {
    if (it.kind !== "EVENT" || it.status !== "OPEN") continue;
    const details = {
      title: it.title,
      startDate: new Date(it.startAt),
      endDate: new Date(it.endAt ?? Date.parse(it.startAt) + 3600_000),
      allDay: it.allDay,
      notes: it.note ?? undefined,
    };
    try {
      if (map[it.id]) await Cal.updateEventAsync(map[it.id], details);
      else map[it.id] = await Cal.createEventAsync(p.exportCalendarId, details);
    } catch {
      // สำเนาถูกลบในเครื่องแล้ว ⇒ สร้างใหม่ครั้งหน้า
      delete map[it.id];
    }
  }
  for (const id of closedIds) {
    if (!map[id]) continue;
    await Cal.deleteEventAsync(map[id]).catch(() => {});
    delete map[id];
  }
  if (JSON.stringify(map) !== JSON.stringify(p.map)) await saveDevicePrefs({ ...p, map });
}

/** ปิดใช้ปฏิทินในเครื่อง (ไม่ลบอีเวนต์ในเครื่อง · ล้างแผนที่ส่งออก) */
export async function disconnectDeviceCalendar(): Promise<void> {
  await saveDevicePrefs({ ...EMPTY });
}
