// memory-proposals.ts — ลงมือข้อเสนอ `memory.forget` ของห้องเลขา (SEC S3a.1-S2 · R-Z22 · L5 M1)
//
// ในห้องเลขา (AiRoom) `forget_fact` ไม่ลบทันที — เสนอ `{ ids }` แล้วคนอนุมัติกด · ตอนลงมือลบด้วย "สิทธิ์ของผู้อนุมัติ"
//   (`forgetMemory` ตัวเดียวกับเครื่องมือเดิม: ของตัวเอง · OWNER ลบความจำของร้านได้) — ลบไม่ได้สักแถว ⇒ throw ไทย (ข้อเสนอ FAILED)
import type { MembershipCtx } from "@/lib/core/rbac";
import { tenantDb } from "@/lib/core/db";
import { forgetMemory } from "../memory";

const IDS_MAX = 20;

export async function dispatchMemoryForget(tenantId: string, payload: Record<string, unknown>, m: MembershipCtx | undefined, userId: string | null | undefined): Promise<string> {
  if (!m || !userId) throw new Error("ลบความจำต้องให้คนในร้านกดอนุมัติจากแอปหรือเว็บ");
  const ids = (Array.isArray(payload.ids) ? payload.ids : []).filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, IDS_MAX);
  if (ids.length === 0) throw new Error("ไม่มีความจำที่จะลบในข้อเสนอนี้");
  const ctx = { tenantId, actor: { kind: "member" as const, tenantId, userId, membership: m } };
  let removed = 0;
  for (const id of ids) if (await forgetMemory(ctx, id)) removed += 1;
  if (removed === 0) throw new Error("ลบความจำไม่ได้ — ความจำถูกลบไปแล้ว หรือเป็นความจำของร้านที่เจ้าของร้านเท่านั้นลบได้");
  return `ลบความจำแล้ว ${removed.toLocaleString("th-TH")} เรื่อง`;
}

/**
 * SEC S3a.1-S2 ▸ R-Z34 (RC1 M1): ลงมือข้อเสนอ `support.open` — เปิดเคสแจ้งทีมงานผูกห้องของข้อเสนอ · ผู้เปิด = ผู้อนุมัติ
 *   (ห้องบริบทลูกค้าไม่ส่งเรื่องออกนอกร้านเองจากข้อความที่ลูกค้าพิมพ์) · ลงมือครั้งเดียว (executeProposal claim แล้ว)
 */
export async function dispatchSupportOpen(tenantId: string, proposalId: string, payload: Record<string, unknown>, userId: string | null | undefined): Promise<string> {
  if (!userId) throw new Error("เปิดเรื่องแจ้งทีมงานต้องให้คนในร้านกดอนุมัติจากแอปหรือเว็บ");
  const subject = String(payload.subject ?? "").trim().slice(0, 200);
  const detail = String(payload.detail ?? "").trim().slice(0, 4000);
  if (!subject || !detail) throw new Error("ข้อเสนอนี้ไม่มีหัวข้อหรือรายละเอียดของเรื่อง");
  const row = await tenantDb({ tenantId }).aiProposal.findFirst({ where: { id: proposalId }, select: { conversationId: true } });
  if (!row) throw new Error("ไม่พบข้อเสนอนี้");
  const { openCaseFromAi } = await import("@/lib/support/service");
  const { caseNo } = await openCaseFromAi({ tenantId }, { userId, conversationId: row.conversationId, subject, body: detail });
  return `เปิดเรื่องแจ้งทีมงานแล้ว (เคส #${caseNo}) — ทีมงานจะตอบกลับในห้องนี้`;
}
