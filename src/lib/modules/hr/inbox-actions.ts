"use server";
// HR H2.11 ▸ server action ของกล่องคำขอรวม — ร้าน/ผู้ใช้จาก session เสมอ · ระบบ HR ที่ส่งมาต้องเป็นของร้านนี้ · ไม่ส่งเวลาเข้า service ·
//   ใช้ตัวเดียวกันทั้งปุ่มบนการ์ด (1 รายการ) และแถบเลือกหลายรายการ (R7) · ผลลัพธ์ = ผลของ decideInbox (ข้อความของแต่ละชนิดทุกไบต์) ◂
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { tenantDb } from "@/lib/core/db";
import { hrViewerOf } from "./privacy";
import { assertInboxAccess, decideInbox } from "./inbox";
import { INBOX_TEXT, type InboxDecideInput, type InboxDecideOutcome } from "./inbox-shared";

export async function decideInboxAction(systemId: string, input: InboxDecideInput): Promise<InboxDecideOutcome> {
  const auth = await requireTenant();
  const v = hrViewerOf(auth);
  try {
    assertInboxAccess(v); // ด่านสิทธิ์ก่อนอ่านฟอร์ม (ผู้ไม่เห็นคำขอชนิดใดเลย = ปฏิเสธ)
  } catch {
    return { ok: false, reason: INBOX_TEXT.noAccess };
  }
  const sid = typeof systemId === "string" ? systemId.trim() : "";
  const sys = sid ? await tenantDb({ tenantId: auth.active.tenantId }).appSystem.findFirst({ where: { id: sid, type: "HR" }, select: { id: true } }) : null;
  if (!sys) return { ok: false, reason: INBOX_TEXT.noAccess };
  const res = await decideInbox({ tenantId: auth.active.tenantId, systemId: sid }, v, input);
  if (res.ok && !res.replayed) {
    for (const p of ["", "/hr/requests", "/hr/leave", "/hr/attendance", "/hr/roster", "/hr/payroll"]) revalidatePath(`/app/sys/${sid}${p}`);
    revalidatePath("/app/approvals");
  }
  return res;
}
// ◂ HR H2.11
