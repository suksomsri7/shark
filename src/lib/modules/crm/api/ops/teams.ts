// ops/teams.ts — ทีมขาย (ใบ C1.10 · RESOLUTIONS R-C.7: REST `/api/v1/teams/*` — route นั้นส่งต่อเข้าทะเบียนนี้)
//
// 🔴 ทีมเป็นของกลางทั้งร้าน (`src/lib/core/teams.ts` · ใบ C1.1) — ไม่ผูกระบบ CRM · บริการ core คุม "ข้อมูลถูกร้าน + กติกาของทีม"
//    (ล็อกแถวทีม · หัวหน้า 1 คน · event `team.updated` id ล้วน) · ไฟล์นี้คุม "ใครเรียกได้" (คีย์ `crm.team.manage`)
// AUDIT-CLASS X1: ทีม/ผู้ใช้/สาขาของร้านอื่น = 404 (core ผูก tenantId ทุกคำสั่ง)

import { z } from "zod";
import * as teams from "@/lib/core/teams";
import { crmCtxOf } from "../actor";
import { crmApiError } from "../http-errors";
import { defineCrmOp, type ApiOp } from "../op";
import { flag, idStr, isOn, optText, text } from "../schema";

const teamCtx = (actor: Parameters<typeof crmCtxOf>[0]) => {
  const c = crmCtxOf(actor);
  return { tenantId: c.tenantId, actorUserId: c.actorUserId };
};

const TEAM_NOT_FOUND = () => crmApiError(404, "not_found", "ไม่พบทีมนี้ในร้าน", "The team was not found in this shop.");

const list = defineCrmOp({
  id: "teams.list",
  method: "GET",
  path: "/teams",
  kind: "read",
  action: "crm.contact.read",
  summary: "The sales teams of the shop (name, lead, branches).",
  label: "ทีมขาย",
  input: z.object({ includeArchived: flag }).strict(),
  test: "C1.10-S2.5",
  async handler({ actor, input }) {
    const items = await teams.listTeams(teamCtx(actor), { includeArchived: isOn(input.includeArchived) });
    return { items };
  },
});

const get = defineCrmOp({
  id: "teams.get",
  method: "GET",
  path: "/teams/{id}",
  kind: "read",
  action: "crm.contact.read",
  summary: "One sales team with its members (user id, role, accepting leads).",
  label: "ทีมขาย 1 ทีม",
  test: "C1.10-X1.2",
  async handler({ actor, params }) {
    const t = await teams.getTeam(teamCtx(actor), params.id ?? "");
    if (!t) throw TEAM_NOT_FOUND();
    return { team: t, members: await teams.membersOf(teamCtx(actor), t.id) };
  },
});

const create = defineCrmOp({
  id: "teams.create",
  method: "POST",
  path: "/teams",
  kind: "write",
  action: "crm.team.manage",
  summary: "Create a sales team (name unique in the shop), optionally with a lead and branches.",
  label: "สร้างทีมขาย",
  input: z
    .object({
      name: text(80).min(1),
      leadUserId: idStr.nullable().optional(),
      unitIds: z.array(idStr).max(50).optional(),
      color: optText(20),
      description: optText(500),
    })
    .strict(),
  test: "C1.10-S2.5",
  async handler({ actor, input }) {
    const team = await teams.createTeam(teamCtx(actor), input);
    return { teamId: team.id, team };
  },
});

const update = defineCrmOp({
  id: "teams.update",
  method: "PATCH",
  path: "/teams/{id}",
  kind: "write",
  action: "crm.team.manage",
  summary: "Rename a team or change its branches, colour or description.",
  label: "แก้ไขทีมขาย",
  input: z.object({ name: text(80).min(1).optional(), unitIds: z.array(idStr).max(50).optional(), color: optText(20), description: optText(500) }).strict(),
  test: "C1.10-X1.2",
  async handler({ actor, params, input }) {
    const team = await teams.updateTeam(teamCtx(actor), params.id ?? "", input);
    return { teamId: team.id, team };
  },
});

const setMembers = defineCrmOp({
  id: "teams.members.set",
  method: "PUT",
  path: "/teams/{id}/members",
  kind: "write",
  action: "crm.team.manage",
  summary: "Set the team's members in one call: listed users are added or updated (role, accepting leads), everyone else is removed.",
  label: "ตั้งสมาชิกทีม",
  input: z
    .object({
      members: z
        .array(z.object({ userId: idStr, role: z.enum(["MEMBER", "LEAD"]).optional(), acceptingLeads: z.boolean().optional() }).strict())
        .max(200),
    })
    .strict(),
  test: "C1.10-S2.5",
  async handler({ actor, params, input }) {
    // AUDIT-CLASS X1 · X3: core `setMembers` ตรวจผู้ใช้ทุกคนก่อน แล้วทำทั้งชุดใน tx เดียว (ล็อกแถวทีม · event ครั้งเดียว) — ทีมร้านอื่น = 404
    const members = await teams.setMembers(teamCtx(actor), params.id ?? "", input.members);
    return { teamId: params.id ?? "", members };
  },
});

const archive = defineCrmOp({
  id: "teams.archive",
  method: "POST",
  path: "/teams/{id}/archive",
  kind: "write",
  action: "crm.team.manage",
  summary: "Archive a team (members and history are kept; it no longer appears in lists).",
  label: "เก็บถาวรทีมขาย",
  input: z.object({}).strict(),
  test: "C1.10-X1.2",
  async handler({ actor, params }) {
    await teams.archiveTeam(teamCtx(actor), params.id ?? "");
    return { teamId: params.id ?? "", archived: true };
  },
});

export const TEAMS_OPS: ApiOp[] = [list, create, get, update, setMembers, archive];
