"use server";
// ai-panel-actions.ts — ตัวอ่านของแผง "ผู้ช่วย AI" บนจอ 08 ภาพรวมรายงาน (POS P3.9U ▸ CD-P39U-1 · มติ 1 ◂)
//
// เปลือกบางแบบ report-actions.ts: session → ร้าน/ผู้ทำรายการ (role · unitAccess · permissions ของ membership) → loadBriefInput → composeBrief
// 🔴 "use server" export ได้เฉพาะ async function · ชนิดผลลัพธ์อยู่ในไฟล์นี้ (ไม่ export) — จอใช้ Awaited<ReturnType<…>>
// 🔴 ไม่มี throw · คำปฏิเสธ "คืน" เสมอ {ok:false, code, message} · ด่านสิทธิ์คืน boolean (กฎ P1.6-R2 แบบ settings-actions.ts)
// 🔴 ข้อความสรุป = แม่แบบของ composeBrief ล้วน (ไม่มี LLM — มติ 3) · จอแสดงบรรทัดตามตัวอักษร ไม่จัดรูปตัวเลขใหม่
// ลำดับด่าน: ไม่มี pos.report.view ที่สาขาใดเลยที่ผูกระบบนี้ = PERMISSION_DENIED (ไม่มีตัวเลข) → ผู้ช่วย AI ปิด = AI_OFF (canManage = เจ้าของร้าน)
// วันธุรกิจ = "วันนี้" ตามเวลาตัดวันของระบบ (ค่าปริยาย · CD-P39U-1) · จอส่ง `date` ของภาพรวมได้ (วันสุดท้ายของช่วง) — อนาคต/ผิดรูป = วันนี้

import { unstable_rethrow } from "next/navigation";
import { requireTenant } from "@/lib/core/context";
import { assertCan, evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { posMembership } from "./access";
import { prisma } from "./db";
import { loadBriefInput } from "./ai-brief";
import { composeBrief, type BriefSection } from "./ai-brief-shared";
import { bkkBusinessDate, REPORT_PERMISSION } from "./reports";
import type { RegisterActor } from "./register-shared";
import { posAiSettings, posDayCutoffMinutes } from "./settings-shared";

type PanelCode = "PERMISSION_DENIED" | "NOT_FOUND" | "AI_OFF" | "INTERNAL";
type PanelRefusal = { ok: false; code: PanelCode; message: string; canManage: boolean };
type PanelOk = {
  ok: true;
  title: string;
  lines: string[];
  /** รหัสส่วนของแต่ละบรรทัด (ลำดับเดียวกับ lines) — จอใช้เลือกจุดสีแดงของบรรทัดเงินขาด/จุดผิดปกติ */
  sections: BriefSection[];
  /** มีจุดผิดปกติอย่างน้อย 1 กฎ (บรรทัด anomalies ไม่ใช่ "ไม่พบ") */
  anomalyHits: boolean;
  /** POS P3.9U ▸ fix1 N1: ไม่มีบรรทัดที่ต้องทำต่อ (86 · ใกล้หมด · จุดผิดปกติที่ถูกจับ · ข้อเสนอ AI) — ไม่ขึ้นกับจำนวนบิล ◂ */
  empty: boolean;
  businessDate: string;
  generatedAt: string;
  canManage: boolean;
};

/** POS P3.9U ▸ fix1 N1 (CD-P39U-B1 แก้): บรรทัดที่ "ต้องทำอะไรต่อ" — ของหมด (86) · ใกล้หมด · จุดผิดปกติที่มีกฎถูกจับ · ข้อเสนอ AI รอยืนยัน ◂ */
const ACTIONABLE: ReadonlySet<BriefSection> = new Set<BriefSection>(["soldOut", "stock", "anomalies", "proposals"]);
const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const refuse = (code: PanelCode, message: string, canManage = false): PanelRefusal => ({ ok: false, code, message, canManage });
/** ด่านสิทธิ์ระดับร้าน (assertCan · คืน boolean ไม่โยน — กฎ P1.6-R2) */
function can(m: MembershipCtx, action: string): boolean {
  try {
    assertCan(m, { module: "pos", action });
    return true;
  } catch {
    return false;
  }
}

/** สรุปของผู้ช่วย AI สำหรับแผงจอ 08 (ผู้ดูรายงาน · สิทธิ์/ขอบเขตของผู้ขอเอง) */
export async function posAiPanelAction(args: { systemId: string; date?: string; locale?: string }): Promise<PanelOk | PanelRefusal> {
  try {
    const auth = await requireTenant();
    const tenantId = auth.active.tenantId;
    const a = args && typeof args === "object" ? args : ({} as typeof args);
    const m = posMembership(auth.active);
    const canManage = auth.active.role === "OWNER";
    const denied = () => refuse("PERMISSION_DENIED", "บัญชีนี้ยังไม่มีสิทธิ์ดูรายงาน — ขอสิทธิ์จากเจ้าของร้าน", canManage);
    if (!can(m, REPORT_PERMISSION)) return denied();
    const sys = await prisma.appSystem.findFirst({ where: { id: String(a.systemId ?? ""), tenantId, type: "POS" }, select: { id: true, settings: true } });
    if (!sys) return refuse("NOT_FOUND", "ไม่พบระบบขายหน้าร้านนี้", canManage);
    // ต้องดูรายงานได้อย่างน้อยหนึ่งสาขาที่ผูกระบบนี้ (กติกาเดียวกับ loadBriefInput — ไม่ได้เลย = การ์ดปฏิเสธ ไม่ใช่ "ว่าง")
    const units = await prisma.appSystemUnit.findMany({ where: { tenantId, systemId: sys.id, type: "POS" }, select: { unitId: true } });
    if (!units.some((u) => evaluate(m, { module: "pos", action: REPORT_PERMISSION, unitId: u.unitId }))) return denied();
    if (!posAiSettings(sys.settings).enabled) return refuse("AI_OFF", "ผู้ช่วย AI ของหน้าขายปิดอยู่", canManage);
    const now = new Date();
    const today = bkkBusinessDate(now, posDayCutoffMinutes(sys.settings));
    const businessDate = isDate(a.date) && a.date <= today ? a.date : today;
    const actor: RegisterActor = { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions };
    const input = await loadBriefInput({ tenantId, systemId: sys.id }, actor, businessDate);
    const b = composeBrief(input, a.locale === "en" ? "en" : "th");
    const anomalyHits = !!input.anomalies && input.anomalies.length > 0;
    // POS P3.9U ▸ fix1 N1: วันที่ยังไม่มีบิล = ตัดเฉพาะบรรทัดยอดขาย ฿0 (บรรทัดอื่นแสดงตามเดิม) ◂
    const zeroBills = input.daily !== null && input.daily.billCount === 0;
    const keep = b.sections.map((sec, i) => ({ sec, line: b.lines[i] ?? "" })).filter((x) => !(zeroBills && x.sec === "sales"));
    return {
      ok: true,
      title: b.title,
      lines: keep.map((x) => x.line),
      sections: keep.map((x) => x.sec),
      anomalyHits,
      // POS P3.9U ▸ fix1 N1 (CD-P39U-B1 แก้ · มติผู้คุม): "ว่าง" = ไม่มีบรรทัดที่ต้องทำต่อ ไม่ขึ้นกับจำนวนบิล ◂
      empty: !keep.some((x) => ACTIONABLE.has(x.sec) && (x.sec !== "anomalies" || anomalyHits)),
      businessDate,
      generatedAt: now.toISOString(),
      canManage,
    };
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pos/ai-panel-actions] posAiPanelAction", e);
    return refuse("INTERNAL", "เกิดข้อผิดพลาด — ลองอีกครั้ง");
  }
}
