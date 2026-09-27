// manifest.ts — สัญญาทั้งหมดของ REST/AI ของ CRM ในเอกสาร JSON เดียว (ใบ C3.8 · `GET /api/v1/crm/manifest.json` ไม่ต้องใช้คีย์)
//
// 🔴 บริสุทธิ์ + มาจากทะเบียนล้วน (ไม่มีรายชื่อมือ): op ของร้าน = `CRM_OPS` · เลนลูกค้า = `PORTAL_OPS` · tool ของ AI = `crmToolInfos()` ·
//    เว็บฮุค = `crmWebhookEvents()` · event ภายใน = `CRM_INTERNAL_EVENTS` ⇒ เพิ่ม op/tool/event ที่ทะเบียน = manifest ตามมาเอง
//    (ข้อสอบ C3.8-S4.1/S4.2 เทียบทุกชุดกับทะเบียน) · ไม่แตะ DB · ไม่มีข้อมูลของร้านใด · เรียกซ้ำได้ผลเท่ากันทุกไบต์
import type { ApiOp } from "@/lib/api/op";
import { PORTAL_OPS } from "./portal-lane";
import { CRM_OPS } from "./registry";
import { crmToolInfos } from "./tools";
import { CRM_INTERNAL_EVENTS, crmWebhookEvents } from "./webhook-events";

/** เวอร์ชันของ "สัญญา" (เท่ากับ info.version ของ OpenAPI) */
export const CRM_MANIFEST_VERSION = "1.0.0";

export type CrmManifestOp = { id: string; method: string; path: string; kind: string; action: string; label: string; rate: string; tool?: string };
export type CrmManifest = {
  version: string;
  baseUrl: string;
  openapi: string;
  ops: CrmManifestOp[];
  portalOps: CrmManifestOp[];
  tools: { name: string; opId: string; write: boolean; danger: boolean }[];
  webhookEvents: string[];
  internalEvents: string[];
};

const BASE_URL = "https://shark.in.th/api/v1/crm";

function opEntry(o: ApiOp): CrmManifestOp {
  return {
    id: o.id,
    method: o.method,
    path: o.path,
    kind: o.kind,
    action: o.action,
    label: o.label,
    rate: o.rate ?? (o.kind === "read" ? "read" : "write"),
    ...(o.tool ? { tool: o.tool.name } : {}),
  };
}

/** manifest ของ CRM (ลำดับ = ลำดับของทะเบียน) */
export function crmManifest(): CrmManifest {
  return {
    version: CRM_MANIFEST_VERSION,
    baseUrl: BASE_URL,
    openapi: `${BASE_URL}/openapi.json`,
    ops: CRM_OPS.map(opEntry),
    portalOps: PORTAL_OPS.map(opEntry),
    tools: crmToolInfos().map((t) => ({ name: t.name, opId: t.opId, write: t.write, danger: t.danger })),
    webhookEvents: crmWebhookEvents(),
    internalEvents: [...CRM_INTERNAL_EVENTS],
  };
}
