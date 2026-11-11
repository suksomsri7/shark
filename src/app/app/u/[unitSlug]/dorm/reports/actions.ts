"use server";
// SVC D.19 ▸ ส่งออก CSV ของจอรายงานหอ — ใบสั่ง ledger/svc-briefs/svc-brief-d.19.md §5.2
//   ร้าน/ผู้กระทำมาจาก session เท่านั้น (requireUnit → auth.active) · ไม่รับรหัสร้าน/หน่วย/ผู้ใช้จาก client
//   ด่านละเอียด (Membership สด · dorm.view + เห็นเงิน · ขอบเขตอาคาร) ตรวจใน facade ทุกครั้ง · อ่านอย่างเดียว (ไม่ revalidate)
import { requireUnit } from "@/lib/core/context";
import { dormReportCsv, type DormReportCsvKind } from "@/lib/modules/dorm";

const KINDS: readonly DormReportCsvKind[] = ["AGING", "OCCUPANCY", "REVENUE"];
const NO_ACCESS = { ok: false as const, reason: "ไม่พบหอนี้ หรือบัญชีนี้ไม่มีสิทธิ์ดูรายงานการเงินของหอ" };
const BAD_INPUT = { ok: false as const, reason: "ชนิดไฟล์ส่งออกไม่ถูกต้อง" };

export async function exportDormReportCsvAction(unitSlug: string, kind: string, fromMonth: string | null, toMonth: string | null) {
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "DORM") return NO_ACCESS;
  const k = KINDS.find((x) => x === kind);
  if (!k) return BAD_INPUT;
  const r = await dormReportCsv(
    { tenantId: auth.active.tenantId, actorUserId: auth.active.userId },
    { unitId: unit.id, kind: k, fromMonth: typeof fromMonth === "string" ? fromMonth : undefined, toMonth: typeof toMonth === "string" ? toMonth : undefined },
  );
  if (!r.ok) return { ok: false as const, reason: r.reason };
  return { ok: true as const, filename: r.filename, csv: r.csv };
}
