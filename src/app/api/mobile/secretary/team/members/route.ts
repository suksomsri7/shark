// POST /api/mobile/secretary/team/members {phone} — "เพิ่มเข้าทีม" (B27 · จอ 2): คำเชิญ "คุยอย่างเดียว" ถึงผู้ใช้ Lekaa เดิม
//   OWNER/MANAGER · ไม่ส่ง SMS (inviteStaff channel "app") · ไม่สร้าง Membership จนกว่าอีกฝ่ายกดรับ (invites/pending → invites/accept)
//   แจ้ง push ถึงผู้ถูกเชิญ (link /secretary/staff) หลังตอบ · เพดาน 10/นาที + เพดานคำเชิญเดิมของ lib (ต่อเบอร์/ร้าน/ผู้เชิญต่อวัน)
//   เบอร์ไม่มี Lekaa = 404 not_lekaa ("ให้เขาดาวน์โหลดแอปและสมัครก่อน" · แอปเปิดแผ่นแชร์ลิงก์ดาวน์โหลด)
import { z } from "zod";
import { prisma } from "@/lib/core/db";
import { addByPhone, displayNameOf } from "@/lib/team-chat/service";
import { notifyTeamInvite } from "@/lib/team-chat/notify";
import { gate, ok, readBody, runAfter, withRateLimit, withErrors } from "../../_shared";
import { rlKey, teamCtx, teamFail } from "../_team";

const Body = z.object({ phone: z.string().trim().min(6).max(20) }).strict();

async function POST_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-add", 10);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const r = await addByPhone(teamCtx(a.c), b.v.phone);
  if (!r.ok) return teamFail(r);
  const tenantId = a.c.tenantId;
  const inviterId = a.c.userId;
  await runAfter(async () => {
    const [t, u] = await Promise.all([
      prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: inviterId }, select: { name: true, email: true } }),
    ]);
    await notifyTeamInvite({ inviteeUserId: r.inviteeUserId, tenantName: t?.name ?? "ร้าน", inviterName: displayNameOf(u) });
  });
  return ok({ ok: true, inviteId: r.inviteId, name: r.name, role: "CHAT_ONLY", expiresAt: r.expiresAt.toISOString() });
}

export const POST = withErrors("secretary/team/members POST", POST_);
