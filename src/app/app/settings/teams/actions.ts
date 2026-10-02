"use server";

// actions.ts — server actions ของหน้า "ทีมขาย" `/app/settings/teams` (CRM v2 ใบ C1.7 · พิมพ์เขียว §5.9 · §11.6 · ภาพ 10 ซ้าย)
// 🔴 "use server" = export ได้เฉพาะ async function · tenantId จาก session เท่านั้น (ไม่รับจาก client)
// 🔴 AUDIT-CLASS X2: ทุก action ตรวจซ้ำฝั่งเซิร์ฟเวอร์ — เจ้าของร้าน หรือผู้ได้รับคีย์ `crm.team.manage` (MANAGER ปริยายไม่ได้ §6.1)
// 🔴 AUDIT-CLASS X9: ทุกการเขียนผ่าน core `@/lib/core/teams` ตัวเดียว (แถว + event team.updated + AuditLog ในนั้น) —
//    ไฟล์นี้ไม่เขียนตาราง Team/TeamMember เอง · ไม่มีแคชทีมที่ไหนให้ล้าง (การมองเห็นของ CRM อ่านสดทุกคำขอ)

import { revalidatePath } from "next/cache";
import type { TeamRole } from "@prisma/client";
import { requireTenant } from "@/lib/core/context";
import { addMember, archiveTeam, createTeam, removeMember, restoreTeam, setAcceptingLeads, setLead, updateTeam, TeamError } from "@/lib/core/teams";
import { toMemberActor } from "@/lib/modules/member";
import { crmCan, wakeOutbox } from "@/lib/modules/crm";

// C4.3-fix part 2 ▸ code + fieldErrors = ช่องที่ข้อความปฏิเสธเป็นของ (หน้าจอแสดงใต้ช่อง + โฟกัส) · `error` ยังอยู่เสมอ
//   (รูปเดียวกับ crm/field-errors-shared แต่เขียนตรงนี้ — ไฟล์นี้อยู่นอกโมดูล CRM แตะได้แค่ facade · fitness F2.3) ◂
type Result = { ok: true } | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };
type Fail = Extract<Result, { ok: false }>;
const onField = (f: Fail, field: string): Fail => ({ ...f, fieldErrors: { [field]: f.error } });

class NoTeamAccess extends Error {}

async function session(): Promise<{ tenantId: string; actorUserId: string }> {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  if (actor.role !== "OWNER" && !crmCan(actor, "crm.team.manage")) throw new NoTeamAccess();
  return { tenantId: auth.active.tenantId, actorUserId: auth.user.id };
}

function failOf(e: unknown): Fail {
  if (e instanceof NoTeamAccess) return { ok: false, error: 'บัญชีนี้ยังไม่ได้รับสิทธิ์ "จัดการทีมขาย" — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง' };
  if (e instanceof TeamError) return { ok: false, error: e.message, code: e.code };
  console.error(`[settings.teams] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (ข้อมูลไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : []);
const touch = () => revalidatePath("/app/settings/teams");

async function run(fn: (ctx: { tenantId: string; actorUserId: string }) => Promise<unknown>): Promise<Result> {
  try {
    const ctx = await session();
    await fn(ctx);
    touch();
    wakeOutbox(); // CRM C5.5-fix13 ▸ P-it5-2: ปลุกคิว outbox หลังเขียนสำเร็จ — event team.updated (กลไกเดียวกับ action/REST ของ CRM — `wakeOutbox` หลัง commit · ไม่เคยทำให้คำขอล้ม) ◂
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function createTeamAction(input: { name: string; unitIds?: string[]; leadUserId?: string | null }): Promise<Result> {
  const r = await run((ctx) => createTeam(ctx, { name: s(input?.name), unitIds: ids(input?.unitIds), leadUserId: s(input?.leadUserId) || null }));
  if (r.ok) return r;
  // ชื่อว่าง/ยาวเกิน (cleanName · 80 ตัว) หรือชื่อซ้ำ = ข้อความของช่อง "ชื่อทีม"
  const name = s(input?.name).replace(/\s+/g, " ");
  return r.code === "DUPLICATE" || (r.code === "VALIDATION" && (!name || name.length > 80)) ? onField(r, "name") : r;
}

export async function renameTeamAction(teamId: string, name: string): Promise<Result> {
  return run((ctx) => updateTeam(ctx, s(teamId), { name: s(name) }));
}

export async function setTeamUnitsAction(teamId: string, unitIds: string[]): Promise<Result> {
  return run((ctx) => updateTeam(ctx, s(teamId), { unitIds: ids(unitIds) }));
}

export async function archiveTeamAction(teamId: string): Promise<Result> {
  return run((ctx) => archiveTeam(ctx, s(teamId)));
}

export async function restoreTeamAction(teamId: string): Promise<Result> {
  return run((ctx) => restoreTeam(ctx, s(teamId)));
}

export async function addMemberAction(teamId: string, userId: string, role?: string): Promise<Result> {
  const r: TeamRole = role === "LEAD" ? "LEAD" : "MEMBER";
  const res = await run((ctx) => addMember(ctx, s(teamId), { userId: s(userId), role: r }));
  // ฟอร์มนี้มีช่องเดียว (พนักงาน): ค่าไม่ผ่าน (ไม่ได้เลือก/ไม่ใช่คนในร้าน) = ข้อความของช่องเลือกพนักงาน
  return res.ok || res.code !== "VALIDATION" ? res : onField(res, "userId");
}

/** §11.6: ดีลของคนที่ถูกย้ายออกยังเป็นของเขา (ทีมเดิมมองไม่เห็น) — หน้าจอเตือน "โอนดีลก่อนไหม" ก่อนเรียกตัวนี้ */
export async function removeMemberAction(teamId: string, userId: string): Promise<Result> {
  return run((ctx) => removeMember(ctx, s(teamId), s(userId)));
}

export async function setLeadAction(teamId: string, userId: string | null): Promise<Result> {
  return run((ctx) => setLead(ctx, s(teamId), s(userId) || null));
}

export async function setAcceptingLeadsAction(teamId: string, userId: string, accepting: boolean): Promise<Result> {
  return run((ctx) => setAcceptingLeads(ctx, s(teamId), s(userId), accepting === true));
}
