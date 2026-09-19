// ops/core.ts — op พื้นฐานของ REST CRM (ใบ C1.10): `GET /ping` (smoke test ของคีย์) · `GET /search` (ค้นทุกชนิดในครั้งเดียว)
//
// `ping` ตอบได้แม้ระบบยังเป็น CRM รุ่นเดิม (uiVersion 1 · มติผู้คุมงาน C1.10 ข้อ 3) — ผู้เชื่อมต่อแยกได้ว่า "คีย์ใช้ได้"
// ออกจาก "ร้านยังไม่เปิด CRM ใหม่" (op อื่นทุกตัวตอบ 409 crm_v2_disabled)
// `search` อ่านผ่านบริการของแต่ละชนิด (การมองเห็น C1.7 เต็มรูป) · ชนิดที่คีย์/ผู้ถามไม่มีคีย์อ่าน = ข้ามเงียบ ๆ (ไม่ใช่ 403 ทั้งคำขอ)

import { z } from "zod";
import * as contacts from "../../contacts";
import * as companies from "../../companies";
import * as deals from "../../deals";
import { crmCan } from "../../access";
import { crmActorOf, crmApiRoleForScopes, crmCtxOf } from "../actor";
import { defineCrmOp, type ApiOp } from "../op";
import { take, text } from "../schema";

const ping = defineCrmOp({
  id: "ping",
  method: "GET",
  path: "/ping",
  kind: "read",
  action: "crm.contact.read",
  summary: "Check that the API key works, and see which CRM system and permission bundle it is bound to.",
  label: "ทดสอบการเชื่อมต่อ",
  input: z.object({}).strict(),
  test: "C1.10-S2.1",
  async handler({ actor }) {
    return {
      ok: true,
      systemId: actor.systemId,
      keyName: actor.keyName,
      apiRole: actor.kind === "apikey" ? crmApiRoleForScopes(actor.scopes) : null,
      scopes: actor.scopes,
    };
  },
});

const search = defineCrmOp({
  id: "search",
  method: "GET",
  path: "/search",
  kind: "read",
  action: "crm.contact.read",
  summary: "Search contacts, companies and deals by text in one call (up to 10 of each).",
  label: "ค้นหาใน CRM",
  input: z.object({ q: text(100).min(1), take }).strict(),
  tool: { name: "crm_search", hint: "Use first when the user names a person, company or deal, to find its id." },
  test: "C1.10-S6.2",
  async handler({ actor, input }) {
    const c = crmCtxOf(actor);
    const a = crmActorOf(actor);
    const n = Math.min(10, input.take ?? 10);
    const [cs, cos, ds] = await Promise.all([
      contacts.listContacts(c, a, { q: input.q, pageSize: n }),
      crmCan(a, "crm.company.read") ? companies.listCompanies(c, a, { q: input.q, page: 1, pageSize: n }) : Promise.resolve(null),
      crmCan(a, "crm.deal.read") ? deals.listDeals(c, a, { q: input.q, pageSize: n }) : Promise.resolve(null),
    ]);
    return {
      contacts: cs.items.map((x) => ({ id: x.id, name: x.name, companyName: x.companyName, leadStatus: x.leadStatus, lifecycleStage: x.lifecycleStage, ownerName: x.ownerName })),
      companies: (cos?.items ?? []).map((x) => ({ id: x.id, name: x.name, industry: x.industry, openDealCount: x.openDealCount })),
      deals: (ds?.items ?? []).map((x) => ({ id: x.id, title: x.title, stageName: x.stageName, kind: x.kind, valueSatang: x.valueSatang, contactName: x.contactName })),
    };
  },
});

export const CORE_OPS: ApiOp[] = [ping, search];
