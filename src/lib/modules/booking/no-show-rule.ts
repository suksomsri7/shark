// SVC B.17 — ไม่มาซ้ำ (บังคับมัดจำ / ต้องโทรจอง) · สัญญา: ledger/svc-briefs/svc-brief-b.17.md §3.2 · ข้อสอบ scripts/qc-svc-b.17.mts (N-*)
//
// 🔴 ไฟล์นี้ไม่ import prisma ดิบ (F5): คิวรีผ่าน tenantDb เท่านั้น · ทุกคิวรีผูก tenantId + unitId (X1)
// 🔴 ตัวตนมาจากทางที่ยืนยันแล้วเท่านั้น (บทเรียน B.8 §8 ข้อ 10):
//    LINE ⇒ นับเฉพาะนัดที่ผูก Party ของลิงก์ตัวตน (เบอร์บนนัดไม่เกี่ยว ⇒ เปลี่ยนเบอร์ไม่หลุด · คนอื่นกรอกเบอร์เราบน ONLINE ไม่ทำให้เราโดน)
//    ONLINE/STAFF/PHONE ⇒ นับจากคีย์เบอร์ที่กรอก + Party ของร้านที่เบอร์ตรงคีย์ (ใช้ตัดสิทธิ์ได้อย่างเดียว · ไม่เคยลด)
// 🔴 นโยบายอ่านจากทะเบียนค่าตั้ง (booking.late.repeatNoShow) ทุกคำขอ — ไม่ฮาร์ดโค้ดจำนวนครั้ง/จำนวนวัน · นาฬิกา now ฉีดได้
// 🔴 X8: ผลคืน/audit ไม่มีชื่อ/เบอร์ · ข้อความปฏิเสธเป็นข้อความกลาง ไม่บอกเหตุ (R12)
import { tenantDb } from "@/lib/core/db";
import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { resolveSettings } from "@/lib/core/settings";

export type RepeatNoShowAction = "REQUIRE_DEPOSIT" | "PHONE_ONLY";
export type RepeatNoShowRule = { count: number; windowDays: number; action: RepeatNoShowAction };
export type RepeatNoShowState = { action: RepeatNoShowAction | null; count: number; rule: RepeatNoShowRule | null };

/** ข้อความกลางเมื่อจองเองไม่ได้ตามกติกา (R12 · ไม่บอกว่าเพราะอะไร — หน้า ONLINE ใครก็กรอกเบอร์คนอื่นได้) */
export const REPEAT_NO_SHOW_REASON = "ขออภัย ไม่สามารถจองออนไลน์สำหรับรายการนี้ได้ กรุณาโทรจองกับร้านโดยตรง";

const RULE_KEY = "booking.late.repeatNoShow";
const WAIVE_KEY = "booking.deposit.waive";
const DAY_MS = 86_400_000;
const SHOP_NF = "ไม่พบนัดนี้";
const BUSY_REASON = "ระบบกำลังทำรายการพร้อมกันหลายรายการ กรุณาลองใหม่อีกครั้ง";

type Ctx = { tenantId: string; unitId: string };
type Who = { channel: "ONLINE" | "LINE" | "STAFF" | "PHONE"; partyId?: string | null; phone?: string | null };

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const nowOf = (o?: { now?: Date }): Date => (o?.now instanceof Date && !Number.isNaN(o.now.getTime()) ? o.now : new Date());
const NONE: RepeatNoShowState = { action: null, count: 0, rule: null };

/** คีย์เบอร์แบบเดียวกับ bookingPhoneKey ของ service.ts (G6) — ต้องเท่ากับ SQL ด้านล่างทุกกรณี */
function phoneKeyOf(phone: string | null | undefined): string {
  let d = (phone ?? "").replace(/[^0-9]/g, "");
  if (d.startsWith("0066")) d = d.slice(4);
  else if (d.startsWith("66")) d = d.slice(2);
  if (!d) return "";
  return d.startsWith("0") ? d : `0${d}`;
}

function ruleOf(v: unknown): RepeatNoShowRule | null {
  if (!isRec(v)) return null;
  const { count, windowDays, action } = v;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) return null;
  if (typeof windowDays !== "number" || !Number.isInteger(windowDays) || windowDays < 1) return null;
  if (action !== "REQUIRE_DEPOSIT" && action !== "PHONE_ONLY") return null;
  return { count, windowDays, action };
}

/**
 * สถานะกติกาไม่มาซ้ำของผู้จองที่หน่วยนี้ (§3.2 ข้อ 1–3)
 *   นับนัด NO_SHOW ของหน่วยนั้นที่ `now − windowDays×24 ชม. < startAt ≤ now` (R15) · ไม่นับนัดที่ร้านยกเว้น (policySnapshot.noShow.excused)
 *   ปิดกติกา (null) ⇒ { action: null, count: 0, rule: null }
 */
export async function repeatNoShowOf(ctx: Ctx, who: Who, opts?: { now?: Date }): Promise<RepeatNoShowState> {
  if (!ctx || typeof ctx.tenantId !== "string" || typeof ctx.unitId !== "string" || !ctx.tenantId || !ctx.unitId) return NONE;
  const now = nowOf(opts);
  const s = await resolveSettings({ tenantId: ctx.tenantId }, [RULE_KEY], { unitId: ctx.unitId }, now);
  const rule = ruleOf(s[RULE_KEY]?.value);
  if (!rule) return { ...NONE };

  const partyId = typeof who?.partyId === "string" && who.partyId ? who.partyId : null;
  const key = phoneKeyOf(typeof who?.phone === "string" ? who.phone : "");
  const keyOk = key !== "" && key !== "0";
  // LINE = Party ของลิงก์ตัวตนเท่านั้น (ไม่มี Party ⇒ ถอยไปนับจากเบอร์ — ทางที่เข้มกว่า ไม่ใช่ช่องหลุด)
  const line = who?.channel === "LINE";
  const byParty = partyId !== null;
  const byPhone = keyOk && (!line || !byParty);
  if (!byParty && !byPhone) return { action: null, count: 0, rule };

  const from = new Date(now.getTime() - rule.windowDays * DAY_MS);
  const db = tenantDb({ tenantId: ctx.tenantId, unitId: ctx.unitId });
  const [r] = await db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM "Appointment" a
    CROSS JOIN LATERAL (SELECT regexp_replace(COALESCE(a."customerPhone", ''), '[^0-9]', '', 'g') AS d1) p1
    CROSS JOIN LATERAL (SELECT CASE WHEN p1.d1 LIKE '0066%' THEN substr(p1.d1, 5) WHEN p1.d1 LIKE '66%' THEN substr(p1.d1, 3) ELSE p1.d1 END AS d2) p2
    WHERE a."tenantId" = ${ctx.tenantId} AND a."unitId" = ${ctx.unitId}
      AND a."status" = 'NO_SHOW'
      AND a."startAt" > ${from} AND a."startAt" <= ${now}
      AND (a."policySnapshot" -> 'noShow' ->> 'excused') IS DISTINCT FROM 'true'
      AND (
        (${byParty}::boolean AND a."partyId" = ${partyId}::text)
        OR (${byPhone}::boolean AND (
          (CASE WHEN p2.d2 = '' THEN '' WHEN p2.d2 LIKE '0%' THEN p2.d2 ELSE '0' || p2.d2 END) = ${key}
          OR a."partyId" IN (
            SELECT p."id" FROM "Party" p
            CROSS JOIN LATERAL (SELECT unnest(ARRAY[regexp_replace(COALESCE(p."phone", ''), '[^0-9]', '', 'g'), regexp_replace(COALESCE(p."phoneNorm", ''), '[^0-9]', '', 'g')]) AS d1) x1
            CROSS JOIN LATERAL (SELECT CASE WHEN x1.d1 LIKE '0066%' THEN substr(x1.d1, 5) WHEN x1.d1 LIKE '66%' THEN substr(x1.d1, 3) ELSE x1.d1 END AS d2) x2
            WHERE p."tenantId" = ${ctx.tenantId} AND x2.d2 <> ''
              AND (CASE WHEN x2.d2 LIKE '0%' THEN x2.d2 ELSE '0' || x2.d2 END) = ${key}
          )
        ))
      )`;
  const count = r?.n ?? 0;
  return { action: count >= rule.count ? rule.action : null, count, rule };
}

/**
 * ยอดมัดจำบังคับของนัดที่ติด REQUIRE_DEPOSIT (§3.2 ข้อ 4 · R10) — pure
 *   วิธีรับมัดจำ NONE/ไม่มี ⇒ 0 · ยอดปกติ > 0 ⇒ ยอดปกติ · PERCENT ⇒ round(ราคา × bp / 10000) ไม่ดูเกณฑ์ minDurationMin ·
 *   PER_SERVICE ⇒ ยอดต่อบริการ · อื่น ⇒ 0  — ผู้เรียก: 0 ⇒ ปฏิเสธแบบต้องโทรจอง
 */
export function forcedDepositSatang(method: unknown, amount: unknown, i: { baseSatang: number; priceSatang: number; serviceDepositSatang: number }): number {
  if (typeof method !== "string" || method === "NONE") return 0;
  if (i.baseSatang > 0) return i.baseSatang;
  if (!isRec(amount)) return 0;
  if (amount.mode === "PERCENT") {
    const bp = amount.bp;
    if (typeof bp !== "number" || !Number.isFinite(bp) || bp <= 0) return 0;
    const v = Math.round((i.priceSatang * bp) / 10000);
    return v > 0 ? v : 0;
  }
  if (amount.mode === "PER_SERVICE") return i.serviceDepositSatang > 0 ? i.serviceDepositSatang : 0;
  return 0;
}

// ═════════════════════════ ร้านยกเว้นรายนัด (§3.2 ข้อ 5 · R11) ═════════════════════════

/** สิทธิ์สด: Membership ที่ตอบรับแล้วของร้าน + หน่วย BOOKING ของร้าน + ถือ booking.deposit.waive ที่หน่วยนั้น */
async function waiveAllowed(ctx: unknown, unitId: unknown): Promise<{ tenantId: string; unitId: string; userId: string } | null> {
  if (!isRec(ctx) || typeof ctx.tenantId !== "string" || !ctx.tenantId || typeof ctx.actorUserId !== "string" || !ctx.actorUserId) return null;
  if (typeof unitId !== "string" || !unitId || unitId.length > 200) return null;
  const tenantId = ctx.tenantId;
  const db = tenantDb({ tenantId });
  const [mem, unit] = await Promise.all([
    db.membership.findFirst({ where: { tenantId, userId: ctx.actorUserId, acceptedAt: { not: null } }, select: { role: true, unitAccess: true, permissions: true } }),
    db.businessUnit.findFirst({ where: { id: unitId, tenantId, type: "BOOKING" }, select: { id: true } }),
  ]);
  if (!mem || !unit) return null;
  const m: MembershipCtx = {
    role: mem.role,
    unitAccess: Array.isArray(mem.unitAccess) ? mem.unitAccess.filter((x): x is string => typeof x === "string") : [],
    permissions: isRec(mem.permissions) ? mem.permissions : {},
  };
  if (!evaluate(m, { module: "booking", action: WAIVE_KEY, unitId })) return null;
  return { tenantId, unitId, userId: ctx.actorUserId };
}

const isRetryable = (e: unknown): boolean => {
  const c = e as { code?: unknown; meta?: { code?: unknown } } | null;
  return c?.code === "P2034" || c?.code === "40P01" || c?.meta?.code === "40P01" || (e instanceof Error && /deadlock detected|40P01/.test(e.message));
};

/**
 * "ยกเว้นไม่มาครั้งนี้" — นัด NO_SHOW ไม่ถูกนับในกติกาไม่มาซ้ำอีก
 *   ไม่มีสิทธิ์/หน่วยอื่น/ร้านอื่น/ไม่มีนัด ⇒ NOT_FOUND คำตอบเดียว · เหตุผล 1–200 ตัว ⇒ ไม่งั้น BAD_INPUT · ไม่ใช่ NO_SHOW ⇒ BAD_STATE
 *   CAS ใต้ FOR UPDATE: policySnapshot.noShow = { excused, at, by } (additive) + audit booking.no_show.excused ใน tx เดียว ·
 *   ยกเว้นแล้ว ⇒ { ok, duplicated } (audit แถวเดียว) · deadlock ⇒ ลองใหม่ 1 ครั้ง แล้ว BUSY
 */
export async function excuseNoShow(
  ctx: { tenantId: string; actorUserId: string },
  input: { unitId: string; appointmentId: string; reason: string },
): Promise<{ ok: true; duplicated?: true } | { ok: false; code: "NOT_FOUND" | "BAD_STATE" | "BAD_INPUT" | "BUSY"; reason: string }> {
  const nf = { ok: false as const, code: "NOT_FOUND" as const, reason: SHOP_NF };
  const s = await waiveAllowed(ctx, isRec(input) ? input.unitId : undefined);
  if (!s) return nf;
  const reason = typeof input.reason === "string" ? input.reason.normalize("NFKC").trim() : "";
  if (reason.length < 1 || reason.length > 200 || /[\u0000-\u001F\u007F]/.test(reason)) {
    return { ok: false, code: "BAD_INPUT", reason: "ใส่เหตุผลที่ยกเว้น 1–200 ตัวอักษร" };
  }
  const apptId = typeof input.appointmentId === "string" && input.appointmentId.length <= 200 ? input.appointmentId : "";
  if (!apptId) return nf;

  type Out = "OK" | "DUP" | "NF" | "BAD_STATE";
  const db = tenantDb({ tenantId: s.tenantId, unitId: s.unitId });
  let out: Out | null = null;
  for (let attempt = 0; attempt < 2 && out === null; attempt++) {
    try {
      out = await db.$transaction(async (tx): Promise<Out> => {
        const [row] = await tx.$queryRaw<{ id: string; status: string; excused: boolean }[]>`
          SELECT "id", "status"::text AS "status", COALESCE(("policySnapshot" -> 'noShow' ->> 'excused') = 'true', false) AS "excused"
          FROM "Appointment"
          WHERE "id" = ${apptId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId}
          FOR UPDATE`;
        if (!row) return "NF";
        if (row.status !== "NO_SHOW") return "BAD_STATE";
        if (row.excused) return "DUP";
        const at = new Date();
        const n = await tx.$executeRaw`
          UPDATE "Appointment"
          SET "policySnapshot" =
                (CASE WHEN jsonb_typeof("policySnapshot") = 'object' THEN "policySnapshot" ELSE '{}'::jsonb END)
                || jsonb_build_object('noShow',
                     (CASE WHEN jsonb_typeof("policySnapshot" -> 'noShow') = 'object' THEN "policySnapshot" -> 'noShow' ELSE '{}'::jsonb END)
                     || jsonb_build_object('excused', true, 'at', ${at.toISOString()}::text, 'by', ${s.userId}::text)),
              "updatedAt" = now()
          WHERE "id" = ${apptId} AND "tenantId" = ${s.tenantId} AND "unitId" = ${s.unitId} AND "status" = 'NO_SHOW'
            AND (("policySnapshot" -> 'noShow' ->> 'excused') IS DISTINCT FROM 'true')`;
        if (n !== 1) return "DUP";
        await tx.auditLog.create({
          data: {
            tenantId: s.tenantId, unitId: s.unitId, actorType: "USER", actorId: s.userId, action: "booking.no_show.excused",
            targetType: "Appointment", targetId: apptId, after: { appointmentId: apptId, unitId: s.unitId, reason },
          },
        });
        return "OK";
      }, { maxWait: 10_000, timeout: 15_000 });
    } catch (e) {
      if (!isRetryable(e)) throw e;
    }
  }
  if (out === null) return { ok: false, code: "BUSY", reason: BUSY_REASON };
  if (out === "NF") return nf;
  if (out === "BAD_STATE") return { ok: false, code: "BAD_STATE", reason: "ยกเว้นได้เฉพาะนัดที่บันทึกว่าไม่มา" };
  if (out === "DUP") return { ok: true, duplicated: true };
  return { ok: true };
}
