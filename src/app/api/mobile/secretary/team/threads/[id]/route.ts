// GET   /api/mobile/secretary/team/threads/[id] — รายละเอียดห้อง (ชื่อ · อีกฝ่าย/สมาชิก + ป้ายบทบาท + membershipId สำหรับ ⚙ · ผู้ดูแล · ปิดเสียง)
// PATCH /api/mobile/secretary/team/threads/[id] {name?, photoFileId?, muted?} — muted = ของฉันเอง (ทุกห้อง) · name/photo = ผู้ดูแลกลุ่มเท่านั้น
//   ไม่ใช่สมาชิกห้อง/ห้องร้านอื่น = 404 (B27)
import { z } from "zod";
import { getThread, setMuted, updateGroup } from "@/lib/team-chat/service";
import { gate, ID_MAX, idParam, notFound, ok, readBody, withRateLimit, type RouteCtx, withErrors } from "../../../_shared";
import { rlKey, teamCtx, teamFail } from "../../_team";

const NF = "ไม่พบห้องแชทนี้ หรือคุณไม่ได้อยู่ในห้องนี้";

async function GET_(req: Request, ctx: RouteCtx<"id">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-thread", 120);
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  const t = id ? await getThread(teamCtx(a.c), id) : null;
  if (!t) return notFound(NF);
  return ok({ thread: t });
}

const Patch = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    photoFileId: z.string().max(ID_MAX).nullable().optional(),
    muted: z.boolean().optional(),
  })
  .strict();

async function PATCH_(req: Request, ctx: RouteCtx<"id">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-thread-w");
  if (rl) return rl;
  const b = await readBody(req, Patch);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound(NF);
  const c = teamCtx(a.c);
  if (b.v.name !== undefined || b.v.photoFileId !== undefined) {
    const r = await updateGroup(c, id, { ...(b.v.name !== undefined ? { name: b.v.name } : {}), ...(b.v.photoFileId !== undefined ? { photoFileId: b.v.photoFileId } : {}) });
    if (!r.ok) return teamFail(r);
  }
  if (b.v.muted !== undefined && !(await setMuted(c, id, b.v.muted))) return notFound(NF);
  const t = await getThread(c, id);
  if (!t) return notFound(NF);
  return ok({ thread: t });
}

export const GET = withErrors("secretary/team/threads/[id] GET", GET_);
export const PATCH = withErrors("secretary/team/threads/[id] PATCH", PATCH_);
