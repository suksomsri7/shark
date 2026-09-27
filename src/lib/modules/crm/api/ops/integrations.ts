// ops/integrations.ts — "เชื่อมต่อทุกระบบ" ของ CRM ผ่าน REST (ใบ C3.8 · บริการของใบ C3.6)
//
//   integrations.status       GET /integrations          crm.settings.manage  read   สถานะ 24 ระบบ + งานเบื้องหลัง
//   integrations.targets.get  GET /integrations/targets  crm.settings.manage  read   (แนะนำ) ค่าที่เลือก + ค่าที่ใช้จริง + ตัวเลือก
//   integrations.targets.set  PUT /integrations/targets  crm.settings.manage  write  ระบบปลายทาง 5 ชนิด (null = อัตโนมัติ)
//
// 🔴 ไม่มี engine ที่สอง: `integrations.ts` (ตัวตัดสินปลายทางตัวเดียว · jsonb_set คำสั่งเดียว · audit `crm.integrations.targets`)
// AUDIT-CLASS X1: id ปลายทางของร้านอื่น/ชนิดอื่น/ปิดแล้ว = 422 ข้อความไทยของบริการ (ไม่บอกว่ามีอยู่) · AUDIT-CLASS X8: สถานะไม่มี payload ของ event
import { z } from "zod";
import * as integrations from "../../integrations";
import { crmActorOf, crmCtxOf } from "../actor";
import { defineCrmOp, type ApiOp } from "../op";
import { idStr } from "../schema";

const target = idStr.nullable().optional();

const status = defineCrmOp({
  id: "integrations.status",
  method: "GET",
  path: "/integrations",
  kind: "read",
  action: "crm.settings.manage",
  summary:
    "Connection status of the 24 SHARK systems with this CRM (enabled, last event time and events in the last 7 days per system) and the health of the " +
    "background jobs. Event types and counts only - never an event payload.",
  label: "สถานะการเชื่อมต่อ",
  input: z.object({}).strict(),
  rate: "report",
  test: "C3.8-S1.1",
  async handler({ actor }) {
    return integrations.integrationStatus(crmCtxOf(actor), crmActorOf(actor));
  },
});

const targetsGet = defineCrmOp({
  id: "integrations.targets.get",
  method: "GET",
  path: "/integrations/targets",
  kind: "read",
  action: "crm.settings.manage",
  summary:
    "Which member, account, task-board, chat and inventory system this CRM works with: the stored choice, the system used right now and why " +
    "(chosen, linked unit, only system), and the shop's systems of each kind to choose from.",
  label: "ระบบปลายทางของ CRM",
  input: z.object({}).strict(),
  test: "C3.8-S8.1",
  async handler({ actor }) {
    const c = crmCtxOf(actor);
    const a = crmActorOf(actor);
    const [targets, rows] = await Promise.all([integrations.getTargets(c, a), integrations.targetPicker(c, a)]);
    return { targets, rows };
  },
});

const targetsSet = defineCrmOp({
  id: "integrations.targets.set",
  method: "PUT",
  path: "/integrations/targets",
  kind: "write",
  action: "crm.settings.manage",
  summary:
    "Choose the member, account, task-board, chat or inventory system this CRM works with (only the keys sent change; null = back to automatic). " +
    "Each id must be an active system of that kind in this shop; the account book must already be linked to this CRM.",
  label: "ตั้งระบบปลายทางของ CRM",
  input: z
    .object({ memberSystemId: target, accountSystemId: target, kanbanSystemId: target, chatSystemId: target, inventorySystemId: target })
    .strict(),
  test: "C3.8-S1.1",
  async handler({ actor, input }) {
    return integrations.setTargets(crmCtxOf(actor), crmActorOf(actor), input);
  },
});

export const INTEGRATIONS_OPS: ApiOp[] = [status, targetsGet, targetsSet];
