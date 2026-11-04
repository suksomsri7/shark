// POST /api/mobile/secretary/account/delete {confirm: "ลบบัญชี"} — ลบบัญชีผู้ใช้ (App Store 5.1.1(v) · Q10) · Bearer อย่างเดียว · 3/นาที
//   `deleteAccount` ก่อน (ส่งมอบร้าน/คิวลบร้าน/ลบ User — Session cascade) → สำเร็จแล้วถอน Session ที่อาจเหลือ (R-S1.14h · ลบล้ม = ยังเข้าใช้ได้ตามเดิม) · หนี้ S3: step-up OTP
import { z } from "zod";
import { prisma } from "@/lib/core/db";
import { deleteAccount } from "@/lib/platform/account-deletion";
import { fail, ok, readBody, thrown, userGate, withRateLimit } from "../../_shared";

const CONFIRM = "ลบบัญชี";
const Body = z.object({ confirm: z.string().max(40) }).strict();

export async function POST(req: Request) {
  const a = await userGate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(a.userId, "account-delete", 3);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  if (b.v.confirm.trim() !== CONFIRM) return fail(400, "confirm_required", `พิมพ์คำว่า "${CONFIRM}" เพื่อยืนยัน`);
  try {
    const r = await deleteAccount(a.userId);
    if (!r.ok) return fail(404, "not_found", r.reason);
    await prisma.session.updateMany({ where: { userId: a.userId, revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => {});
    return ok({ ok: true, impact: r.impact });
  } catch (e) {
    return thrown(e, "account.delete");
  }
}
