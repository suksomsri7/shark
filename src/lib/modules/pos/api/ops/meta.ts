// ops/meta.ts — op อ่านโครงของระบบขายหน้าร้าน (ใบ P2.13 · brief §1 #1)
// `GET /units` = สาขาที่ผูกระบบ POS ของคีย์ (posUnits · ไม่รวมสาขาที่เก็บถาวร) ∩ ตัวกรองสาขาของคีย์ — จุดเริ่มของทุกงาน (unitId)
import { z } from "zod";
import { posUnits } from "../../register";
import { posActorCanUseUnit } from "../actor";
import { definePosOp, POS_SCOPES, type ApiOp } from "../op";

const unitsList = definePosOp({
  id: "units.list",
  method: "GET",
  path: "/units",
  kind: "read",
  action: POS_SCOPES.saleRead,
  summary: "Branches (points of sale) linked to the POS system of this key, oldest first. Every other operation takes one of these ids as unitId.",
  label: "สาขาที่ผูกระบบขาย",
  test: "units.list",
  input: z.object({}).strict(),
  async handler({ actor }) {
    const units = await posUnits(actor.tenantId, actor.systemId);
    return units.filter((u) => posActorCanUseUnit(actor, u.id));
  },
});

export const META_OPS: ApiOp[] = [unitsList];
