// prefs.ts — ค่าตั้งปฏิทินต่อ (ผู้ใช้, ร้าน) (CAL1.6 · สัญญา §2.2 · §8 `GET/PUT calendar/prefs` · จอ 8)
//   🔴 M3: actor เท่านั้น · ไม่มีแถว = ค่าเริ่ม M2 (ไม่ backfill) · แถวสร้างเมื่อ PUT
//   แหล่งที่แสดงในจอ 8 = เฉพาะที่ร้านเปิด + ผู้ใช้มีสิทธิ์ (คีย์ที่ไม่มีสิทธิ์ใน PUT = เพิกเฉย)
import { tenantDb } from "@/lib/core/db";
import { canViewPayroll, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { CalError } from "./items";

type Actor = { userId: string; tenantId: string; membership: MembershipCtx };
export type SourceKey = "booking" | "account" | "tax" | "kanban" | "crm" | "hr" | "dorm" | "ticket";
const ORDER: { key: SourceKey; label: string; sub: string }[] = [
  { key: "booking", label: "บัตรคิว", sub: "นัดลูกค้า" },
  { key: "account", label: "บัญชี", sub: "ใบแจ้งหนี้ครบกำหนด" },
  { key: "tax", label: "ภาษี", sub: "กำหนดยื่นแบบ" },
  { key: "kanban", label: "บอร์ดงาน", sub: "การ์ดของฉัน" },
  { key: "crm", label: "CRM", sub: "งาน/นัด" },
  { key: "hr", label: "HR", sub: "เงินเดือน · ลา" },
  { key: "dorm", label: "หอพัก", sub: "บิลครบกำหนด" },
  { key: "ticket", label: "ตั๋ว", sub: "รอบอีเวนต์" },
];
export const DEFAULT_PREFS = { morningOn: true, morningMinute: 480, eveningOn: false, eveningMinute: 1140, travelMinutes: 0 } as const;

export type CalPrefsDto = {
  tenantName: string;
  morning: { on: boolean; minute: number };
  evening: { on: boolean; minute: number };
  travelMinutes: number;
  sources: { key: SourceKey; label: string; sub: string; on: boolean }[];
  google: { status: "NONE" | "ACTIVE" | "NEEDS_RECONNECT"; email: string | null };
};

/** แหล่งที่ร้านเปิด + ผู้ใช้มีสิทธิ์ (ตัวกรองหยาบสำหรับจอ 8 · agenda ตรวจละเอียดเองต่อแถว) */
async function availableSources(actor: Actor): Promise<Set<SourceKey>> {
  const db = tenantDb({ tenantId: actor.tenantId });
  const [systems, units] = await Promise.all([
    db.appSystem.findMany({ where: { tenantId: actor.tenantId, active: true }, select: { type: true } }),
    db.businessUnit.findMany({ where: { tenantId: actor.tenantId }, select: { type: true } }),
  ]);
  const sys = new Set(systems.map((s) => String(s.type)));
  const ut = new Set(units.map((u) => String(u.type)));
  const m = actor.membership;
  const can = (module: string, action: string) => evaluate(m, { module, action });
  const out = new Set<SourceKey>();
  if (ut.has("BOOKING")) out.add("booking");
  if (sys.has("ACCOUNT") && can("account", "account.doc.view")) out.add("account");
  if ((sys.has("ACCOUNT") && (can("account", "account.tax.view") || can("account", "account.wht.manage"))) || (sys.has("HR") && canViewPayroll(m))) out.add("tax");
  if (sys.has("KANBAN")) out.add("kanban");
  if (sys.has("CRM")) out.add("crm");
  if (sys.has("HR")) out.add("hr");
  if (ut.has("DORM") && can("dorm", "dorm.view")) out.add("dorm");
  if (ut.has("TICKET")) out.add("ticket");
  return out;
}

export async function getPrefs(actor: Actor): Promise<CalPrefsDto> {
  const db = tenantDb({ tenantId: actor.tenantId });
  const [row, tenant, link, avail] = await Promise.all([
    db.calPref.findFirst({ where: { userId: actor.userId, tenantId: actor.tenantId } }),
    db.tenant.findUnique({ where: { id: actor.tenantId }, select: { name: true } }),
    db.calLink.findFirst({ where: { userId: actor.userId, provider: "GOOGLE" }, select: { status: true, email: true } }),
    availableSources(actor),
  ]);
  const src = (row?.sources ?? {}) as Record<string, unknown>;
  return {
    tenantName: tenant?.name ?? "",
    morning: { on: row?.morningOn ?? DEFAULT_PREFS.morningOn, minute: row?.morningMinute ?? DEFAULT_PREFS.morningMinute },
    evening: { on: row?.eveningOn ?? DEFAULT_PREFS.eveningOn, minute: row?.eveningMinute ?? DEFAULT_PREFS.eveningMinute },
    travelMinutes: row?.travelMinutes ?? DEFAULT_PREFS.travelMinutes,
    sources: ORDER.filter((o) => avail.has(o.key)).map((o) => ({ ...o, on: src[o.key] !== false })),
    google: link ? { status: link.status, email: link.email } : { status: "NONE", email: null },
  };
}

export type PrefsPatch = {
  morning?: { on?: boolean; minute?: number };
  evening?: { on?: boolean; minute?: number };
  travelMinutes?: number;
  sources?: Partial<Record<string, boolean>>;
};

const badMinute = (v: number | undefined) => v !== undefined && (!Number.isInteger(v) || v < 0 || v > 1439);

export async function setPrefs(actor: Actor, patch: PrefsPatch): Promise<CalPrefsDto> {
  if (badMinute(patch.morning?.minute) || badMinute(patch.evening?.minute)) throw new CalError(400, "invalid", "เวลาไม่ถูกต้อง");
  if (patch.travelMinutes !== undefined && (!Number.isInteger(patch.travelMinutes) || patch.travelMinutes < 0 || patch.travelMinutes > 240)) throw new CalError(400, "invalid", "เวลาเดินทางไม่ถูกต้อง (0–240 นาที)");
  const db = tenantDb({ tenantId: actor.tenantId });
  const row = await db.calPref.findFirst({ where: { userId: actor.userId, tenantId: actor.tenantId } });
  const avail = await availableSources(actor);
  const sources = { ...((row?.sources ?? {}) as Record<string, boolean>) };
  for (const [k, v] of Object.entries(patch.sources ?? {})) if (avail.has(k as SourceKey) && typeof v === "boolean") sources[k] = v; // ไม่มีสิทธิ์ = เพิกเฉย
  const data = {
    ...(patch.morning?.on !== undefined ? { morningOn: patch.morning.on } : {}),
    ...(patch.morning?.minute !== undefined ? { morningMinute: patch.morning.minute } : {}),
    ...(patch.evening?.on !== undefined ? { eveningOn: patch.evening.on } : {}),
    ...(patch.evening?.minute !== undefined ? { eveningMinute: patch.evening.minute } : {}),
    ...(patch.travelMinutes !== undefined ? { travelMinutes: patch.travelMinutes } : {}),
    sources,
  };
  if (row) await db.calPref.updateMany({ where: { id: row.id, userId: actor.userId, tenantId: actor.tenantId }, data });
  else {
    try {
      await db.calPref.create({ data: { userId: actor.userId, tenantId: actor.tenantId, ...data } });
    } catch {
      await db.calPref.updateMany({ where: { userId: actor.userId, tenantId: actor.tenantId }, data }); // อีกคำขอสร้างพร้อมกัน
    }
  }
  return getPrefs(actor);
}
