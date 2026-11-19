// POST /api/mobile/secretary/team/lookup {phone} — ค้นผู้ใช้ Lekaa ด้วยเบอร์ (B27 · จอ 2 ของ team2.png)
//   OWNER/MANAGER เท่านั้น (lib อ่านจาก DB) · เบอร์ที่ยืนยันแล้วเท่านั้น · คืน `{found:false}` หรือ `{found:true, name, member, invited}` — ไม่มี id/อีเมล/เบอร์
//   anti-enumeration: 10/นาที ต่อคน (เส้นนี้) + 30/วัน ต่อคน + 100/วัน ต่อร้าน (lib) · จด AuditLog `team.phone.lookup` (เก็บ hash ของเบอร์)
import { z } from "zod";
import { lookupPhone } from "@/lib/team-chat/service";
import { gate, ok, readBody, withRateLimit, withErrors } from "../../_shared";
import { rlKey, teamCtx, teamFail } from "../_team";

const Body = z.object({ phone: z.string().trim().min(6).max(20) }).strict();

async function POST_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-lookup", 10);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const r = await lookupPhone(teamCtx(a.c), b.v.phone);
  if (!r.ok) return teamFail(r);
  return ok(r.found ? { found: true, name: r.name, member: r.member, invited: r.invited } : { found: false });
}

export const POST = withErrors("secretary/team/lookup POST", POST_);
