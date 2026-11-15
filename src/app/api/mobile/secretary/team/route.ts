// GET /api/mobile/secretary/team — รายชื่อแชททีม (B27 · จอ 1 ของ team2.png)
//   threads = ห้อง 1:1 ที่มีข้อความแล้ว + กลุ่มทุกห้องที่ฉันอยู่ (ใหม่→เก่า · unread · ข้อความล่าสุด "คุณ: …" ฝั่งแอป)
//   people  = คนในทีมทั้งหมด (ชื่อ · ป้ายบทบาท OWNER/MANAGER/STAFF/CHAT_ONLY · directThreadId ถ้ามีห้องแล้ว) — ไม่มีอีเมล/เบอร์
//   pending = คำเชิญที่ยังไม่รับ (เฉพาะ OWNER/MANAGER · ชื่อ + เวลา · ไม่มีเบอร์เต็ม) · canManage = เพิ่มคน/ตั้งสิทธิ์ได้
//   ด่าน = สมาชิกร้าน (gate null) · 60/นาที
import { listThreads, roleTagOf } from "@/lib/team-chat/service";
import { pendingInviteRows } from "@/lib/staff/invite";
import { gate, ok, withRateLimit, withErrors } from "../_shared";
import { rlKey, teamCtx, teamFail } from "./_team";

async function GET_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-list", 60);
  if (rl) return rl;
  const r = await listThreads(teamCtx(a.c));
  if (!r.ok) return teamFail(r);
  const manage = a.c.m.role === "OWNER" || a.c.m.role === "MANAGER";
  const pending = manage ? (await pendingInviteRows(a.c.tenantId)).filter((p) => !p.expired) : [];
  return ok({
    me: { userId: a.c.userId, tag: roleTagOf(a.c.m.role, a.c.m.permissions), canManage: manage },
    threads: r.threads,
    people: r.people.map((p) => ({ userId: p.userId, membershipId: p.membershipId, name: p.name, tag: p.tag, me: p.me, directThreadId: p.directThreadId })),
    pending: pending.map((p) => ({ inviteId: p.inviteId, name: p.name, expiresAt: p.expiresAt.toISOString(), at: new Date(p.expiresAt.getTime() - 7 * 86_400_000).toISOString() })),
  });
}

export const GET = withErrors("secretary/team GET", GET_);
