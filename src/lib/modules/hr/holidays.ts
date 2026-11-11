// HR H2.8 ▸ วันหยุด: ชุดวันหยุดราชการ (preset) · วันหยุดของสาขา/ร้าน · ชนิดของวัน (dayClassOf — ตัวอ่านของ H2.9) — brief H2.7 R13
//
//   • ชุดวันหยุดราชการ = เฉพาะวันที่ยืนยันได้ในรีโป (15 วันที่ตายตัวของ crm/sequences-shared.ts) — ไม่คำนวณ/ไม่เดาวันตามจันทรคติ
//     หรือวันหยุดชดเชย (Q14) · รายการที่ยังรอประกาศทางการอยู่ใน `pending` ของไฟล์ JSON · ร้านเพิ่มเองที่หน้าตั้งค่า
//   • ใส่ชุดวันหยุด (applyHolidayPreset) = กดเอง (Q15) · เพิ่มเฉพาะวันที่ยังไม่มีแถวทั้งร้าน (unitId null) · กดซ้ำ = ไม่เพิ่ม ·
//     สิทธิ์ = ด่านหน้าตั้งค่า (OWNER หรือ hr.employee.create) + ผู้ดูแลทุกสาขา (แถวทั้งร้าน)
//   • วันหยุดของวัน: แถวของสาขาชนะแถวทั้งร้าน (H1.2 Q12) · shopOpen = ร้านเปิดแม้เป็นวันหยุด (ยังนับเป็นวันหยุดของการลา — Q5)
//   • ทุกคำสั่งใน tx ใช้ tx ของผู้เรียก (§C.8) ◂
import type { HrHolidayKind, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { writeAudit } from "@/lib/core/audit";
import { hrScopeOf } from "./scope";
import { canManageHrSettings, SETTINGS_TEXT, type SettingsViewer } from "./settings";
import { dayKey, LEAVE_TEXT } from "./leave-rules";
import th2569 from "./holidays-th-2569.json";
import th2570 from "./holidays-th-2570.json";

type Ctx = { tenantId: string; systemId: string };
type Db = Prisma.TransactionClient | ReturnType<typeof tenantDb>;

export type HolidayPresetDay = { date: string; name: string; kind: "PUBLIC"; source?: string };
export type HolidayPreset = {
  year: number;
  beYear: number;
  status: string;
  source: string;
  verified?: string;
  days: HolidayPresetDay[];
  pending: { name: string; note: string }[];
};
const PRESETS: Record<number, HolidayPreset> = { 2026: th2569 as HolidayPreset, 2027: th2570 as HolidayPreset };

/** ชุดวันหยุดราชการของปี (รับ ค.ศ. หรือ พ.ศ.) — ไม่มีชุด = null */
export function holidayPreset(year: number | string): HolidayPreset | null {
  const n = typeof year === "number" ? year : Number(String(year ?? "").trim());
  if (!Number.isInteger(n)) return null;
  const ce = n > 2400 ? n - 543 : n;
  return PRESETS[ce] ?? null;
}
/** ปี (ค.ศ.) ที่มีชุดวันหยุด */
export const HOLIDAY_PRESET_YEARS: readonly number[] = Object.keys(PRESETS).map(Number);

export type PresetResult = { ok: true; added: number; skipped: number } | { ok: false; reason: string };

/** ใส่ชุดวันหยุดราชการของปีลงวันหยุดทั้งร้าน — เพิ่มเฉพาะวันที่ยังไม่มี (idempotent) */
export async function applyHolidayPreset(ctx: Ctx, v: SettingsViewer, input: { year: number | string }): Promise<PresetResult> {
  if (!canManageHrSettings(v)) return { ok: false, reason: SETTINGS_TEXT.noPermission };
  if (hrScopeOf({ role: v.role, unitAccess: v.unitAccess }).unitIds !== "*") return { ok: false, reason: SETTINGS_TEXT.shopWide };
  const preset = holidayPreset(input?.year);
  if (!preset) return { ok: false, reason: LEAVE_TEXT.presetNone };
  try {
    const added = await tenantDb(ctx).$transaction(async (t) => {
      const tx = t as unknown as Prisma.TransactionClient;
      // ON CONFLICT DO NOTHING กับ unique (systemId, date, COALESCE(unitId,'')) — วันที่มีแถวทั้งร้านแล้ว (ชื่อใดก็ตาม) = ข้าม
      const r = await tx.hrHoliday.createMany({
        data: preset.days.map((d) => ({
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          unitId: null,
          date: new Date(`${d.date}T00:00:00Z`),
          name: d.name,
          kind: "PUBLIC" as HrHolidayKind,
          presetYear: preset.year,
          shopOpen: false,
        })),
        skipDuplicates: true,
      });
      return r.count;
    });
    await writeAudit({
      tenantId: ctx.tenantId,
      actorType: v.userId ? "USER" : "SYSTEM",
      actorId: v.userId ?? null,
      action: "hr.settings.holiday.preset",
      targetType: "AppSystem",
      targetId: ctx.systemId,
      after: { systemId: ctx.systemId, year: preset.year, added },
    });
    return { ok: true, added, skipped: preset.days.length - added };
  } catch {
    return { ok: false, reason: SETTINGS_TEXT.failed };
  }
}

export type HolidayDay = { date: string; holidayId: string; name: string; kind: HrHolidayKind; shopOpen: boolean };

/** แถววันหยุดในช่วงวัน (ทั้งร้าน + สาขาเหล่านี้) — ผู้เรียกในธุรกรรมส่ง tx ของตัวเอง */
export async function holidayRowsInRange(db: Db, from: string, to: string, unitIds: (string | null)[]) {
  const units = [...new Set(unitIds.filter((u): u is string => !!u))];
  return (db as Prisma.TransactionClient).hrHoliday.findMany({
    where: { date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) }, OR: [{ unitId: null }, ...(units.length ? [{ unitId: { in: units } }] : [])] },
    select: { id: true, unitId: true, date: true, name: true, kind: true, shopOpen: true },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    take: 2000,
  });
}
type HRow = Awaited<ReturnType<typeof holidayRowsInRange>>[number];
/** วันหยุดของสาขาในวันนั้น — แถวของสาขาชนะแถวทั้งร้าน */
export function holidayOfDay(rows: HRow[], unitId: string | null, day: string): HRow | null {
  const same = rows.filter((h) => h.date.toISOString().slice(0, 10) === day);
  return (unitId ? same.find((h) => h.unitId === unitId) : undefined) ?? same.find((h) => h.unitId === null) ?? null;
}

/** วันหยุดของสาขาในช่วงวัน (เรียงตามวัน) */
export async function holidaysBetween(ctx: Ctx, input: { unitId?: string | null; from: string | Date; to: string | Date }): Promise<HolidayDay[]> {
  const from = dayKey(input.from);
  const to = dayKey(input.to);
  if (from > to) return [];
  const unitId = typeof input.unitId === "string" && input.unitId.trim() ? input.unitId.trim() : null;
  const rows = await holidayRowsInRange(tenantDb(ctx), from, to, [unitId]);
  const days = [...new Set(rows.map((r) => r.date.toISOString().slice(0, 10)))].sort();
  const out: HolidayDay[] = [];
  for (const d of days) {
    const h = holidayOfDay(rows, unitId, d);
    if (h) out.push({ date: d, holidayId: h.id, name: h.name, kind: h.kind, shopOpen: h.shopOpen });
  }
  return out;
}

export type DayClass = { dayClass: "HOLIDAY" | "WORKDAY"; holidayId: string | null; name: string | null; kind: HrHolidayKind | null; shopOpen: boolean };

/** ชนิดของวันสำหรับสาขา (H2.9 อ่าน) — วันหยุด (แถวสาขาชนะแถวทั้งร้าน) หรือวันทำงาน */
export async function dayClassOf(ctx: Ctx, input: { unitId?: string | null; date: string | Date }): Promise<DayClass> {
  const d = dayKey(input.date);
  const [h] = await holidaysBetween(ctx, { unitId: input.unitId ?? null, from: d, to: d });
  return h
    ? { dayClass: "HOLIDAY", holidayId: h.holidayId, name: h.name, kind: h.kind, shopOpen: h.shopOpen }
    : { dayClass: "WORKDAY", holidayId: null, name: null, kind: null, shopOpen: false };
}
// ◂ HR H2.8
