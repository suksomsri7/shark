// POST /api/mobile/secretary/account/delete {confirm: "ลบบัญชี", code} — ลบบัญชีผู้ใช้ (App Store 5.1.1(v) · Q10) · Bearer อย่างเดียว · 3/นาที
//   SEC S3a.1-S2 ▸ R-Z21 step-up: `code` = OTP ที่เพิ่งขอ — มีเบอร์ ⇒ SMS ของเบอร์ตัวเอง (`auth/sms/request`) · บัญชีอีเมล ⇒ `auth/otp` ·
//     ไม่ส่ง ⇒ 400 code_required · ผิด/หมดอายุ ⇒ 401 invalid_code · ผิดเกินเพดาน ⇒ 401 locked (ขอรหัสใหม่) ◂
//   `deleteAccount` ก่อน (ส่งมอบร้าน/คิวลบร้าน/ลบ User — Session cascade) → สำเร็จแล้วถอน Session ที่อาจเหลือ (R-S1.14h · ลบล้ม = ยังเข้าใช้ได้ตามเดิม)
import { z } from "zod";
import { prisma } from "@/lib/core/db";
import { deleteAccount, verifyDeletionStepUp } from "@/lib/platform/account-deletion";
import { fail, ok, readBody, thrown, userGate, withRateLimit, withErrors } from "../../_shared";

const CONFIRM = "ลบบัญชี";
const Body = z.object({ confirm: z.string().max(40), code: z.string().max(20).optional() }).strict();

async function POST_(req: Request) {
  const a = await userGate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.userId, "account-delete", 3);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  if (b.v.confirm.trim() !== CONFIRM) return fail(400, "confirm_required", `พิมพ์คำว่า "${CONFIRM}" เพื่อยืนยัน`);
  if (!b.v.code?.trim()) return fail(400, "code_required", "ขอรหัสยืนยันก่อน แล้วใส่รหัส 6 หลักเพื่อยืนยันการลบบัญชี");
  try {
    const step = await verifyDeletionStepUp(a.userId, b.v.code);
    if (!step.ok) {
      return step.reason === "locked"
        ? fail(401, "locked", "ใส่รหัสผิดหลายครั้ง กรุณาขอรหัสใหม่")
        : fail(401, "invalid_code", "รหัสไม่ถูกต้องหรือหมดอายุแล้ว — ขอรหัสใหม่แล้วลองอีกครั้ง");
    }
    const r = await deleteAccount(a.userId);
    if (!r.ok) return fail(404, "not_found", r.reason);
    await prisma.session.updateMany({ where: { userId: a.userId, revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => {});
    return ok({ ok: true, impact: r.impact });
  } catch (e) {
    return thrown(e, "account.delete");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const POST = withErrors("secretary/account/delete POST", POST_);
