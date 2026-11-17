// GET  /api/mobile/secretary/team/threads/[id]/messages?before=<iso|id>&after=<iso|id>&take=50 — ข้อความ (เก่า→ใหม่)
//   ไม่ส่ง cursor = ล่าสุด take ข้อความ · after = ใหม่กว่า (แอป poll 5 วิ) · before = เก่ากว่า (เลื่อนขึ้น)
//   reads = เวลาอ่านล่าสุดของสมาชิกอื่น (แอปคิด "อ่านแล้ว" ของข้อความเก่าเอง) · ข้อความของเรามี read/readBy
// POST /api/mobile/secretary/team/threads/[id]/messages {body?, attachments?:[{id,name}], clientMessageId?} — ส่ง (30/นาที)
//   ไฟล์ = ที่ผู้ส่งอัปเองผ่าน team/attachments ≤ 24 ชม. (≤ 5 ไฟล์) · clientMessageId ซ้ำ = คืนข้อความเดิม (แอป retry)
//   push ถึงสมาชิกที่ไม่ปิดเสียงหลังตอบ (runAfter) · ไม่ใช่สมาชิกห้อง = 404 (B27)
import { z } from "zod";
import { listMessages, sendMessage } from "@/lib/team-chat/service";
import { notifyTeamMessage } from "@/lib/team-chat/notify";
import {
  claimClientMessageId,
  claimFailed,
  fail,
  gate,
  ID_MAX,
  idParam,
  notFound,
  ok,
  pairCursor,
  readBody,
  rememberFailed,
  runAfter,
  takeOf,
  withRateLimit,
  type RouteCtx,
  withErrors,
} from "../../../../_shared";
import { rlKey, teamCtx, teamFail } from "../../../_team";

const NF = "ไม่พบห้องแชทนี้ หรือคุณไม่ได้อยู่ในห้องนี้";

async function GET_(req: Request, ctx: RouteCtx<"id">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-msgs", 120);
  if (rl) return rl;
  const id = await idParam(ctx, "id");
  if (!id) return notFound(NF);
  const u = new URL(req.url);
  const before = pairCursor(u.searchParams.get("before"));
  const after = pairCursor(u.searchParams.get("after"));
  if (before === null || after === null) return fail(400, "invalid", "ตำแหน่งข้อความไม่ถูกต้อง");
  const r = await listMessages(teamCtx(a.c), id, { before, after, take: takeOf(u.searchParams.get("take"), 50, 100) });
  if (!r) return notFound(NF);
  return ok(r);
}

const Body = z
  .object({
    body: z.string().max(4000).optional(),
    attachments: z.array(z.object({ id: z.string().min(1).max(ID_MAX), name: z.string().max(200).optional() }).strict()).max(5).optional(),
    clientMessageId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/).optional(),
  })
  .strict();

async function POST_(req: Request, ctx: RouteCtx<"id">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(rlKey(a.c), "team-send", 30);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "id");
  if (!id) return notFound(NF);
  const c = teamCtx(a.c);
  let claim: Awaited<ReturnType<typeof claimClientMessageId>> | null = null;
  if (b.v.clientMessageId) {
    try {
      claim = await claimClientMessageId(a.c.tenantId, `team-${id}`, a.c.userId, b.v.clientMessageId);
      if (!claim.first) {
        const prev = await claim.existingMessageId();
        return prev ? ok({ duplicate: true, messageId: prev }) : fail(409, "pending", "ข้อความนี้กำลังส่งอยู่ — รอสักครู่");
      }
    } catch (e) {
      return claimFailed(e, "team.send");
    }
  }
  let r: Awaited<ReturnType<typeof sendMessage>>;
  try {
    r = await sendMessage(c, id, { body: b.v.body, attachments: b.v.attachments });
  } catch (e) {
    await claim?.release().catch(() => undefined);
    throw e;
  }
  if (!r.ok) {
    await claim?.release().catch(() => undefined);
    return r.reason === "not_found" ? notFound(NF) : teamFail(r);
  }
  if (claim) {
    try {
      await claim.remember(r.message.id);
    } catch (e) {
      await rememberFailed(e, claim, "team.send");
    }
  }
  const tenantId = a.c.tenantId;
  const sent = r;
  await runAfter(() =>
    notifyTeamMessage({
      tenantId,
      threadId: id,
      kind: sent.thread.kind,
      groupName: sent.thread.name,
      senderName: sent.message.senderName,
      body: sent.message.body,
      attachments: sent.message.attachments,
      recipients: sent.recipients,
    }),
  );
  return ok({ message: r.message });
}

export const GET = withErrors("secretary/team/threads/[id]/messages GET", GET_);
export const POST = withErrors("secretary/team/threads/[id]/messages POST", POST_);
