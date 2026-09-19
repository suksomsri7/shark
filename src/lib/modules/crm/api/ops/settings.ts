// ops/settings.ts — ตั้งค่าระบบ CRM ผ่าน REST (ใบ C1.10 · RESOLUTIONS R-A: บริการ `settings.ts` ของใบ C1.5 เท่านั้น)
//
// 🔴 เขียนด้วย `setCrmSettingsKey` (jsonb_set คำสั่งเดียว) ทีละคีย์ — ไม่อ่านทั้งก้อนมาแก้แล้วเขียนทับ
// 🔴 `uiVersion` **เปลี่ยนผ่าน REST ไม่ได้** (การเปิด/ปิด CRM ใหม่เป็นการตัดสินของเจ้าของร้านบนหน้าจอ)
// AUDIT-CLASS X2: คีย์ `crm.settings.manage` (มีเฉพาะชุด crm.admin)

import { z } from "zod";
import { getCrmSettings, setCrmSettingsKey } from "../../settings";
import { crmCtxOf } from "../actor";
import { defineCrmOp, type ApiOp } from "../op";

const get = defineCrmOp({
  id: "settings.get",
  method: "GET",
  path: "/settings",
  kind: "read",
  action: "crm.settings.manage",
  summary: "The CRM system settings: uiVersion (2 = CRM v2 on), bridgesEnabled, chatToLead.",
  label: "ตั้งค่า CRM",
  input: z.object({}).strict(),
  test: "C1.10-S2.5",
  async handler({ actor }) {
    return getCrmSettings(crmCtxOf(actor));
  },
});

const set = defineCrmOp({
  id: "settings.set",
  method: "PUT",
  path: "/settings",
  kind: "write",
  action: "crm.settings.manage",
  summary: "Change CRM settings: chatToLead (a chat from an unknown customer opens a lead) and bridgesEnabled (links to other modules).",
  label: "แก้ตั้งค่า CRM",
  input: z.object({ chatToLead: z.boolean().optional(), bridgesEnabled: z.boolean().optional() }).strict(),
  test: "C1.10-S2.5",
  async handler({ actor, input }) {
    const c = crmCtxOf(actor);
    let out = await getCrmSettings(c);
    if (input.chatToLead !== undefined) out = await setCrmSettingsKey(c, "chatToLead", input.chatToLead);
    if (input.bridgesEnabled !== undefined) out = await setCrmSettingsKey(c, "bridgesEnabled", input.bridgesEnabled);
    return out;
  },
});

export const SETTINGS_OPS: ApiOp[] = [get, set];
