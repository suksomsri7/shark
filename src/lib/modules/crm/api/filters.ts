// filters.ts — ตัวกรองของคีย์ API (`crm.filter.team:` / `crm.filter.owner:` · R-C.3) ฝั่ง "เขียน" (มติผู้คุมงาน C1.10 รีวิว)
//
// ฝั่งอ่านบังคับใน `visibleWhere` แล้ว · ฝั่งเขียนต้องกันไม่ให้คีย์สร้าง/โอนระเบียนไป "นอกกรอบ" ของตัวเอง
// (สร้างแล้วมองไม่เห็น = ผู้เชื่อมต่อคิดว่าหาย แล้วยิงซ้ำ · โอนออกนอกทีม = ทางหนีของคีย์ที่ถูกจำกัด)
// ⇒ ระเบียนที่สร้าง/โอนต้องลงในตัวกรอง: owner ∈ ตัวกรองผู้ดูแล · team ∈ ตัวกรองทีม — ไม่ใช่ = 422 validation ภาษาไทย (ไม่เขียนอะไร)
// 🔴 ผู้ติดต่อ/ดีลที่สร้างใหม่ยังไม่ผูกทีม (บริการตั้งทีมตอนมอบหมาย — C2.3) ⇒ คีย์ที่จำกัดทีมสร้างสองอย่างนี้ไม่ได้ (บอกเหตุผลตรง ๆ)
import type { ApiActor } from "@/lib/api/actor";
import { crmFilterTargetsOf } from "@/lib/api-keys/scopes";
import * as teams from "@/lib/core/teams";
import { crmApiError } from "./http-errors";

export type KeyFilter = { teamIds: string[]; ownerIds: string[] };

/** ตัวกรองของคีย์ (คนจริง/ผู้ช่วย = ไม่มีตัวกรอง) */
export function keyFilterOf(actor: ApiActor): KeyFilter {
  return actor.kind === "apikey" ? crmFilterTargetsOf(actor.scopes) : { teamIds: [], ownerIds: [] };
}

const outside = (th: string) => crmApiError(422, "validation", th, "The record would land outside this API key's owner/team filter.");

/** AUDIT-CLASS X2: ผู้ดูแลปลายทางต้องอยู่ในตัวกรองผู้ดูแลของคีย์ */
export function assertOwnerInFilter(actor: ApiActor, ownerUserId: string | null | undefined): void {
  const f = keyFilterOf(actor);
  if (f.ownerIds.length === 0) return;
  if (!ownerUserId || !f.ownerIds.includes(ownerUserId)) {
    throw outside("คีย์นี้จำกัดให้ทำงานกับข้อมูลของผู้ดูแลที่กำหนดเท่านั้น — เลือกผู้ดูแลที่อยู่ในขอบเขตของคีย์");
  }
}

/** AUDIT-CLASS X2: ทีมปลายทางต้องอยู่ในตัวกรองทีมของคีย์ · ไม่ส่ง + ตัวกรองมีทีมเดียว = ใช้ทีมนั้น (คืนทีมที่จะใช้) */
export function teamInFilter(actor: ApiActor, teamId: string | null | undefined): string | null | undefined {
  const f = keyFilterOf(actor);
  if (f.teamIds.length === 0) return teamId;
  const t = teamId ?? (f.teamIds.length === 1 ? f.teamIds[0] : null);
  if (!t || !f.teamIds.includes(t)) throw outside("คีย์นี้จำกัดให้ทำงานกับข้อมูลของทีมที่กำหนดเท่านั้น — ระบุทีม (teamId) ที่อยู่ในขอบเขตของคีย์");
  return t;
}

/** ผู้ติดต่อ/ดีลใหม่ยังไม่ผูกทีม ⇒ คีย์ที่จำกัดทีมสร้างไม่ได้ */
export function assertNoTeamFilter(actor: ApiActor, what: string): void {
  if (keyFilterOf(actor).teamIds.length > 0) {
    throw outside(`คีย์นี้จำกัดให้เห็นเฉพาะทีมที่กำหนด แต่${what}ใหม่ยังไม่ผูกทีมตอนสร้าง จึงจะหลุดขอบเขตของคีย์ — ใช้คีย์ที่ไม่จำกัดทีมเพื่อเพิ่ม${what}`);
  }
}

/** กิจกรรมเป็นของ "ผู้บันทึก" (ผู้สร้างคีย์) — ต้องเป็นสมาชิกทีมในตัวกรอง / ผู้ดูแลในตัวกรอง */
export async function assertActivityOwnerInFilter(actor: ApiActor): Promise<void> {
  const f = keyFilterOf(actor);
  const me = actor.userId ?? null;
  if (f.ownerIds.length > 0) assertOwnerInFilter(actor, me);
  if (f.teamIds.length > 0) {
    const members = new Set<string>();
    for (const t of f.teamIds) for (const m of await teams.membersOf({ tenantId: actor.tenantId }, t)) members.add(m.userId);
    if (!me || !members.has(me)) throw outside("คีย์นี้จำกัดทีม แต่ผู้สร้างคีย์ไม่ได้อยู่ในทีมนั้น กิจกรรมที่บันทึกจึงจะหลุดขอบเขตของคีย์ — ใช้คีย์ที่สมาชิกทีมเป็นผู้สร้าง");
  }
}
