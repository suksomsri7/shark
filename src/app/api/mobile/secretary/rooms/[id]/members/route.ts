// GET/POST /api/mobile/secretary/rooms/[id]/members — สมาชิกห้องร่วม (S1.6 · R5) · ไม่รวมผู้เปิดห้อง · เพิ่มได้เฉพาะผู้เปิดห้อง/OWNER
//   `userId` ใน body = คนที่จะถูกเพิ่ม (เป้าหมาย ไม่ใช่ตัวผู้ทำ — ผู้ทำมาจากโทเค็น) · ต้องเป็นสมาชิกของกิจการที่รับแล้ว (lib ตรวจ)
import { z } from "zod";
import { addMember, listMembers } from "@/lib/ai/secretary/members";
import { memberDto } from "@/lib/ai/secretary/dto";
import { fail, forbidden, gate, ID_MAX, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx, withErrors } from "../../../_shared";

const Body = z.object({ userId: z.string().trim().min(1).max(ID_MAX), seeHistory: z.boolean().optional() }).strict();

async function GET_(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const id = await idParam(ctx, "id");
  const rows = id ? await listMembers(a.c.conv, id) : null;
  if (!rows) return notFound("ไม่พบห้องงานนี้");
  return ok({ items: rows.map(memberDto), max: 20 });
}

async function POST_(req: Request, ctx: RouteCtx) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "room-members");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound("ไม่พบห้องงานนี้");
  const r = await addMember(a.c.conv, id, { userId: b.v.userId, seeHistory: b.v.seeHistory === true });
  if (r.ok) return ok({ ok: true, member: memberDto(r.member) });
  if (r.error === "not_found") return notFound(r.message);
  if (r.error === "forbidden" || r.error === "forbidden_chat") return r.error === "forbidden" ? forbidden(r.message) : fail(403, "forbidden_chat", r.message); // R-Z23 ◂
  if (r.error === "already" || r.error === "limit" || r.error === "closed") return fail(409, r.error, r.message);
  return fail(400, r.error, r.message); // self · not_member_of_tenant
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/rooms/[id]/members GET", GET_);
export const POST = withErrors("secretary/rooms/[id]/members POST", POST_);
