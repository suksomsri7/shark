// brief.ts — งานรายนาที `calendar.brief` สรุปเช้า/เย็น (CAL1.5 · สัญญา §6 · §7.2 · R-CAL-12/30/31) — ไม่เรียกโมเดล
//
// 🔴 ข้อยกเว้น M3 ตาม §3.3: อ่าน Membership × CalPref ข้ามผู้ใช้/ร้าน แต่ส่งถึง "เจ้าของคู่ (ผู้ใช้,ร้าน)" คนเดียวเสมอ
// 🔴 จองก่อนส่ง (lastMorningDay/lastEveningDay = วันนี้) ⇒ ≤ 1 ข้อความ/วัน/กิจการ · วันว่าง = จองแต่ไม่ส่ง · เลยหน้าต่าง 90 นาที = ข้ามวันนั้น
// 🔴 ชุดละ ≤ 50 คู่/ชนิด/รอบ (กัน pool Neon แบบ MAX_PUSH_USERS) · ส่ง 1 ข้อความต่อกิจการ ด้วย sendPushToUser ไม่กรองร้าน (R-CAL-12)
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { logOps } from "@/lib/core/ops";
import { sendPushToUser } from "@/lib/core/push";
import type { MembershipCtx } from "@/lib/core/rbac";
import { agendaFor } from "./agenda";
import { bkkDayNo, dayNoToYmd, BKK_OFFSET_MS } from "./next-fire";
import { briefMessage } from "./push-msg";
import { briefPushParts } from "./summary";

export const BRIEF_BATCH = 50;
export const BRIEF_WINDOW_MIN = 90;
const DAY_MS = 86_400_000;
export const DEFAULTS = { morningOn: true, morningMinute: 480, eveningOn: false, eveningMinute: 1140 } as const;

export type BriefKind = "morning" | "evening";
export type BriefDeps = {
  post?: (payloads: unknown[]) => Promise<unknown>;
  /** QC เท่านั้น: จำกัดผู้ใช้ที่พิจารณา (ฐาน QC มีผู้ใช้อื่นที่มีเครื่องปน) */
  scope?: { userIds?: string[] };
};
export type BriefResult = { claimed: number; sent: number; empty: number; failed: number };

/** นาทีไทยของวัน 0..1439 */
export const bkkMinute = (now: Date) => Math.floor((((+now + BKK_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS / 60_000);

/**
 * R-CAL-31 กิจการหลักของผู้ใช้ (นับอีเวนต์ Google ในสรุปของกิจการนี้เท่านั้น) — บริสุทธิ์
 *   = กิจการที่เปิดสรุปชนิดนี้ (แถว CalPref หรือค่าเริ่ม) และนาทีน้อยสุด (เท่ากัน → tenantId น้อยสุด) · ไม่มีเลย = สมาชิกภาพแรกตาม createdAt
 */
export function pickPrimaryTenant(
  kind: BriefKind,
  memberships: { tenantId: string; createdAt: Date }[],
  prefs: { tenantId: string; morningOn: boolean; morningMinute: number; eveningOn: boolean; eveningMinute: number }[],
): string | null {
  if (!memberships.length) return null;
  const prefOf = new Map(prefs.map((p) => [p.tenantId, p]));
  const on = memberships
    .map((m) => {
      const p = prefOf.get(m.tenantId) ?? DEFAULTS;
      return kind === "morning" ? { t: m.tenantId, on: p.morningOn, min: p.morningMinute } : { t: m.tenantId, on: p.eveningOn, min: p.eveningMinute };
    })
    .filter((x) => x.on)
    .sort((a, b) => a.min - b.min || (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  if (on.length) return on[0]!.t;
  return [...memberships].sort((a, b) => +a.createdAt - +b.createdAt || (a.tenantId < b.tenantId ? -1 : 1))[0]!.tenantId;
}

type Pair = { userId: string; tenantId: string; tenantName: string; role: MembershipCtx["role"]; unitAccess: unknown; permissions: unknown; minute: number };

async function eligible(kind: BriefKind, today: string, nowMin: number, deps?: BriefDeps): Promise<Pair[]> {
  const on = kind === "morning" ? Prisma.sql`COALESCE(p."morningOn", ${DEFAULTS.morningOn})` : Prisma.sql`COALESCE(p."eveningOn", ${DEFAULTS.eveningOn})`;
  const minute = kind === "morning" ? Prisma.sql`COALESCE(p."morningMinute", ${DEFAULTS.morningMinute})` : Prisma.sql`COALESCE(p."eveningMinute", ${DEFAULTS.eveningMinute})`;
  const last = kind === "morning" ? Prisma.sql`p."lastMorningDay"` : Prisma.sql`p."lastEveningDay"`;
  const scope = deps?.scope?.userIds ? Prisma.sql`AND m."userId" IN (${Prisma.join(deps.scope.userIds.length ? deps.scope.userIds : ["__none__"])})` : Prisma.empty;
  return prisma.$queryRaw<Pair[]>`
    SELECT m."userId", m."tenantId", t."name" AS "tenantName", m."role", m."unitAccess", m."permissions", ${minute}::int AS "minute"
    FROM "Membership" m
    JOIN "Tenant" t ON t."id" = m."tenantId" AND t."status" = 'ACTIVE'
    LEFT JOIN "CalPref" p ON p."userId" = m."userId" AND p."tenantId" = m."tenantId"
    WHERE m."acceptedAt" IS NOT NULL
      AND EXISTS (SELECT 1 FROM "PushDevice" d WHERE d."userId" = m."userId")
      AND ${on}
      AND ${minute} <= ${nowMin} AND ${nowMin} <= ${minute} + ${BRIEF_WINDOW_MIN}
      AND (${last} IS NULL OR ${last} <> ${today})
      ${scope}
    ORDER BY "minute", m."userId", m."tenantId"
    LIMIT ${BRIEF_BATCH}`;
}

/** จองวันนี้ของคู่ (ผู้ใช้,ร้าน) — true = ได้สิทธิ์ส่ง · ไม่มีแถว = สร้าง (unique ชน = คนอื่นจองแล้ว) */
async function claim(kind: BriefKind, userId: string, tenantId: string, today: string): Promise<boolean> {
  const field = kind === "morning" ? "lastMorningDay" : "lastEveningDay";
  const u = await prisma.calPref.updateMany({ where: { userId, tenantId, OR: [{ [field]: null }, { [field]: { not: today } }] }, data: { [field]: today } });
  if (u.count === 1) return true;
  const exists = await prisma.calPref.findFirst({ where: { userId, tenantId }, select: { id: true } });
  if (exists) return false;
  try {
    await prisma.calPref.create({ data: { userId, tenantId, [field]: today } });
    return true;
  } catch {
    return false; // P2002 — อีกรอบจองไปแล้ว
  }
}

async function primaryOf(kind: BriefKind, userId: string, cache: Map<string, string | null>): Promise<string | null> {
  const k = `${kind}:${userId}`;
  if (cache.has(k)) return cache.get(k)!;
  const [mems, prefs] = await Promise.all([
    prisma.membership.findMany({ where: { userId, acceptedAt: { not: null }, tenant: { status: "ACTIVE" } }, select: { tenantId: true, createdAt: true } }),
    prisma.calPref.findMany({ where: { userId }, select: { tenantId: true, morningOn: true, morningMinute: true, eveningOn: true, eveningMinute: true } }),
  ]);
  const t = pickPrimaryTenant(kind, mems, prefs);
  cache.set(k, t);
  return t;
}

/** หนึ่งรอบของ calendar.brief (เช้า แล้ว เย็น) — ไม่โยน */
export async function runCalendarBrief(now: Date, opts: { deadline?: number; deps?: BriefDeps } = {}): Promise<BriefResult> {
  const deadline = opts.deadline ?? Date.now() + 6_000;
  const res: BriefResult = { claimed: 0, sent: 0, empty: 0, failed: 0 };
  const todayNo = bkkDayNo(now);
  const today = dayNoToYmd(todayNo);
  const nowMin = bkkMinute(now);
  const primary = new Map<string, string | null>();
  for (const kind of ["morning", "evening"] as const) {
    let pairs: Pair[];
    try {
      pairs = await eligible(kind, today, nowMin, opts.deps);
    } catch (e) {
      await logOps("WARN", "calendar", `calendar.brief: อ่านผู้รับ${kind === "morning" ? "สรุปเช้า" : "สรุปเย็น"}ล้ม`, { detail: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) }).catch(() => undefined);
      continue;
    }
    const day = kind === "morning" ? today : dayNoToYmd(todayNo + 1);
    for (const p of pairs) {
      if (Date.now() > deadline) return res; // ที่เหลือยังไม่จอง ⇒ รอบหน้าทำต่อ (ยังอยู่ในหน้าต่าง)
      try {
        if (!(await claim(kind, p.userId, p.tenantId, today))) continue;
        res.claimed++;
        const membership: MembershipCtx = {
          role: p.role,
          unitAccess: Array.isArray(p.unitAccess) ? (p.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
          permissions: (p.permissions ?? {}) as Record<string, unknown>,
        };
        const actor = { userId: p.userId, tenantId: p.tenantId, membership };
        // วันนั้น + 7 วันข้างหน้า (กำหนดยื่นที่ใกล้ถึง §4.4) — คำขอเดียว
        const ag = await agendaFor(actor, { from: day, to: dayNoToYmd(bkkDayNo(new Date(`${day}T12:00:00+07:00`)) + 7) }, { now });
        const dayNo = bkkDayNo(new Date(`${day}T12:00:00+07:00`));
        const ofDay = ag.items.filter((i) => bkkDayNo(new Date(i.startAt)) === dayNo);
        const includeGoogle = (await primaryOf(kind, p.userId, primary)) === p.tenantId;
        const parts = briefPushParts(ofDay, day, { upcomingTax: ag.items.filter((i) => i.source === "tax"), includeGoogle });
        if (!parts.length) {
          res.empty++; // วันว่าง = ไม่ส่ง (จองแล้ว — ไม่ถามซ้ำทั้งวัน)
          continue;
        }
        const msg = briefMessage({ kind, tenantId: p.tenantId, tenantName: p.tenantName, day, lines: parts });
        const r = await sendPushToUser(p.userId, msg, opts.deps?.post ? { post: opts.deps.post } : undefined);
        if (r.sent > 0) res.sent++;
        else res.failed++;
      } catch (e) {
        res.failed++;
        await logOps("WARN", "calendar", "calendar.brief: คู่ล้ม", { tenantId: p.tenantId, detail: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) }).catch(() => undefined);
      }
    }
  }
  return res;
}
