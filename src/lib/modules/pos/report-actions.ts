"use server";
// report-actions.ts — server action ของรายงาน POS (P1.17 · มติ R14) · เปลือกบาง: session → ctx/actor → reports.* → คืนผลตามเดิม
// 🔴 ไฟล์ "use server" export ได้เฉพาะ async function · ชนิดข้อมูลอยู่ที่ reports.ts
// 🔴 คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} · ขัดข้องที่ไม่คาดคิด = {ok:false, code:"INTERNAL"}
// 🔴 ร้าน + ผู้ทำรายการ (role · unitAccess · permissions) มาจาก membership ของ SESSION เท่านั้น — สิทธิ์/ขอบเขตตัดสินใน reports.ts
// อ่านอย่างเดียว ⇒ ไม่มี revalidatePath · CSV คืนเป็นข้อความ (หน้าจอแปลงเป็นไฟล์ดาวน์โหลดเอง)

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { posMembership } from "./access";
import {
  isReportKind,
  posDashboardCard,
  reportCsv,
  reportDailySales,
  reportMargin,
  reportPayments,
  reportProducts,
  reportShifts,
  reportStaff,
  reportTax,
  type AnyReportResult,
  type DashboardCardResult,
  type ReportCsvResult,
  type ReportCtx,
  type ReportInput,
  type ReportKind,
  type ReportRefusal,
  CARD_PERMISSION,
  REPORT_PERMISSION,
} from "./reports";
import type { RegisterActor } from "./register-shared";
// POS P1.17U R6 ▸ ภาพรวมในคำขอเดียว (Server Action จาก client ถูกส่งทีละตัว — ขนานฝั่งเซิร์ฟเวอร์แทน) ◂
import { reportOverview, type OverviewSection, type ReportOverviewResult } from "./report-overview";

type Internal = { ok: false; code: "INTERNAL"; message: string };
type Session = Awaited<ReturnType<typeof requireTenant>>;
type Target = { systemId: string; unitId?: string };

/** ชนิด → ฟังก์ชันรายงาน (R14) */
const KIND_FN: Record<ReportKind, (ctx: ReportCtx, actor: RegisterActor, input: ReportInput) => Promise<AnyReportResult>> = { daily: reportDailySales, products: reportProducts, staff: reportStaff, payments: reportPayments, margin: reportMargin, shifts: reportShifts, tax: reportTax };

function unexpected(where: string, e: unknown): Internal {
  console.error(`[pos/report-actions] ${where}`, e);
  return { ok: false, code: "INTERNAL", message: "เกิดข้อผิดพลาด — ลองอีกครั้ง" };
}
async function session(where: string): Promise<Session | Internal> {
  try {
    return await requireTenant();
  } catch (e) {
    unstable_rethrow(e);
    return unexpected(`${where} requireTenant`, e);
  }
}
/**
 * session → ctx (ร้านจาก session · ระบบ/สาขาจากคำขอ) + actor
 * ด่านหยาบระดับร้าน (assertCan ไม่ส่ง unitId): ต้องมีสิทธิ์นี้อย่างน้อยในบทบาท — สาขา/ระบบ/สิทธิ์ต่อสาขาตัดสินซ้ำใน reports.ts จาก DB
 */
function scopeOf(auth: Session, args: unknown, permission: string): { ctx: ReportCtx; actor: RegisterActor } | ReportRefusal {
  const a = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
  const m = posMembership(auth.active);
  try {
    assertCan(m, { module: "pos", action: permission });
  } catch {
    return { ok: false, code: "PERMISSION_DENIED", message: "บัญชีนี้ยังไม่มีสิทธิ์ดูรายงาน — ขอสิทธิ์จากเจ้าของร้าน" };
  }
  return {
    ctx: {
      tenantId: auth.active.tenantId,
      systemId: typeof a.systemId === "string" ? a.systemId : "",
      ...(typeof a.unitId === "string" && a.unitId ? { unitId: a.unitId } : {}),
    },
    actor: { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
  };
}

/** รายงาน 1 ชนิด (daily · products · staff · payments · margin · shifts · tax) */
export async function posReportAction(args: Target & { kind: ReportKind; from: string; to: string; limit?: number }): Promise<AnyReportResult | ReportRefusal | Internal> {
  const auth = await session("posReportAction");
  if ("ok" in auth) return auth;
  try {
    const s = scopeOf(auth, args, REPORT_PERMISSION);
    if ("ok" in s) return s;
    const a = (args ?? {}) as Partial<typeof args>;
    if (!isReportKind(a.kind)) return { ok: false, code: "VALIDATION", message: "ไม่รู้จักชนิดรายงานนี้" } satisfies ReportRefusal;
    return await KIND_FN[a.kind](s.ctx, s.actor, {
      from: a.from as string,
      to: a.to as string,
      ...(a.limit !== undefined ? { limit: a.limit } : {}),
    });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("posReportAction", e);
  }
}

/** CSV ของรายงาน 1 ชนิด → { filename, contentType, body } */
export async function posReportCsvAction(args: Target & { kind: ReportKind; from: string; to: string }): Promise<ReportCsvResult | Internal> {
  const auth = await session("posReportCsvAction");
  if ("ok" in auth) return auth;
  try {
    const s = scopeOf(auth, args, REPORT_PERMISSION);
    if ("ok" in s) return s;
    const a = (args ?? {}) as Partial<typeof args>;
    return await reportCsv(s.ctx, s.actor, { kind: a.kind as ReportKind, from: a.from as string, to: a.to as string });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("posReportCsvAction", e);
  }
}

/** ตัวเลขการ์ดภาพรวมวันนี้ (สิทธิ์ขาย · R16) */
export async function posDashboardCardAction(args: Target): Promise<DashboardCardResult | Internal> {
  const auth = await session("posDashboardCardAction");
  if ("ok" in auth) return auth;
  try {
    const s = scopeOf(auth, args, CARD_PERMISSION);
    if ("ok" in s) return s;
    return await posDashboardCard(s.ctx, s.actor, {});
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("posDashboardCardAction", e);
  }
}

// POS P1.17U R6 ▸ ภาพรวมการขาย (ภาพ 08) — action เดียวแทน 5–24 คำขอเรียงกัน · ขอบเขต/สิทธิ์ชุดเดียวกับ posReportAction ◂
/** ภาพรวม: daily · ช่วงก่อน · margin · payments · staff · กราฟ 14 วัน · เปรียบเทียบสาขา — ปฏิเสธต่อส่วน (`only` = โหลดใหม่เฉพาะส่วน) */
export async function posReportOverviewAction(args: Target & { from: string; to: string; only?: OverviewSection[] }): Promise<ReportOverviewResult | Internal> {
  const auth = await session("posReportOverviewAction");
  if ("ok" in auth) return auth;
  try {
    const s = scopeOf(auth, args, REPORT_PERMISSION);
    if ("ok" in s) return s;
    const a = (args ?? {}) as Partial<typeof args>;
    return await reportOverview(s.ctx, s.actor, {
      from: a.from as string,
      to: a.to as string,
      ...(a.only !== undefined ? { only: a.only } : {}),
    });
  } catch (e) {
    unstable_rethrow(e);
    return unexpected("posReportOverviewAction", e);
  }
}
