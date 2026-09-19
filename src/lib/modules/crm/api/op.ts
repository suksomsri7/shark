// op.ts — ประกาศ op ของ REST CRM (ใบ C1.10 · แบบเดียวกับ member/api/op.ts)
//
// ห่อ `defineOp` ของแกนกลางชั้นเดียว เพื่อเติมของที่ทุก op ของ CRM ต้องมีเหมือนกัน:
//   `module: "crm"` · `auditAction: "crm.api.<id>"` (คีย์สิทธิ์ 1 ตัวครอบหลาย op — ประวัติต้องอ่านออกว่า "op ไหน")
//   · เป้าหมายของแถว audit = ระเบียนที่ถูกแตะ (ผู้ติดต่อ/บริษัท/ดีล/กิจกรรม/รายการ/ทีม) ไม่ใช่ชื่อ op
//   · error ของบริการ → รหัส REST ตามสัญญา (`http-errors.ts`) · คำตอบผ่าน `present()` เสมอ (ปิดบัง/ตัดค่าอ่อนไหว — X8)
//
// ⚠️ ห้าม import `./registry` จากที่นี่ (registry → ops/* → op.ts เป็นวงกลม)

import type { ZodType } from "zod";
import { defineOp, type ApiOp, type ApiOpCtx } from "@/lib/api/op";
import { crmApiError, toCrmApiError } from "./http-errors";
import { apiRoleOfActor, present } from "./serialize";

export type { ApiOp, ApiOpCtx, ApiOpKind, ApiMethod, ApiRateKind } from "@/lib/api/op";

type CrmOpDefinition<S extends ZodType | undefined> = Omit<Parameters<typeof defineOp<S>>[0], "module" | "auditAction">;

/** segment แรกของ path → ชนิดเป้าหมายของแถว audit */
const TARGET_OF: Record<string, string> = {
  contacts: "CrmContact",
  companies: "CrmCompany",
  deals: "CrmDeal",
  activities: "CrmActivity",
  teams: "Team",
};

function crmAuditTarget(path: string) {
  const segs = path.split("/").filter(Boolean);
  return (a: { params: Record<string, string>; data: unknown }): { targetType: string; targetId: string } | null => {
    // `/objects/{key}/records/{id}` → CustomRecord
    if (segs[0] === "objects" && segs[2] === "records") {
      const id = a.params.id ?? idFromData(a.data, ["recordId"]);
      return id ? { targetType: "CustomRecord", targetId: id } : null;
    }
    const type = TARGET_OF[segs[0] ?? ""];
    if (!type) return null;
    const id = a.params.id ?? idFromData(a.data, ["contactId", "companyId", "dealId", "activityId", "teamId"]);
    return id ? { targetType: type, targetId: id } : null;
  };
}

function idFromData(data: unknown, keys: string[]): string | null {
  if (typeof data !== "object" || data === null) return null;
  for (const k of keys) {
    const v = (data as Record<string, unknown>)[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

/** ประกาศ op ของ CRM (ชนิดของ `input` มาจาก zod schema เหมือน `defineOp` ของแกน) */
export function defineCrmOp<S extends ZodType | undefined = undefined>(def: CrmOpDefinition<S>): ApiOp {
  const base = defineOp<S>({ auditTarget: crmAuditTarget(def.path), ...def, module: "crm", auditAction: `crm.api.${def.id}` });
  const inner = base.handler;
  return {
    ...base,
    // AUDIT-CLASS X2: error ทุกตัวของบริการถูกแปลเป็นรหัสตามสัญญาที่นี่ที่เดียว · AUDIT-CLASS X8: คำตอบผ่าน present() เสมอ
    handler: async (ctx: ApiOpCtx<unknown>) => {
      // AUDIT-CLASS X2: คีย์ชุดอ่านอย่างเดียวไม่เขียน/ไม่ส่งออกอะไรเลย แม้ scope ของ op จะเป็นคีย์อ่าน (records.export = crm.record.read)
      if (base.kind !== "read" && apiRoleOfActor(ctx.actor) === "READONLY") {
        throw crmApiError(403, "forbidden", "คีย์นี้เป็นแบบอ่านอย่างเดียว จึงเพิ่ม แก้ หรือส่งออกข้อมูลไม่ได้ — ใช้คีย์ชุดที่ทำรายการได้", "Read-only keys cannot write or export.");
      }
      try {
        return present(ctx.actor, await inner(ctx));
      } catch (e) {
        throw toCrmApiError(e);
      }
    },
  };
}

/**
 * AUDIT-CLASS X2 (มติผู้คุมงาน C1.10 S1): การส่งออกทั้งชุด (CSV) = คีย์ชุดผู้ดูแลเท่านั้น (apiRole ADMIN) นอกเหนือจาก scope ของ op
 * คีย์ operate/readonly = 403 · คนจริง (ผู้ช่วย/คนกดยืนยัน) ไม่ผ่านทางนี้
 */
export function assertAdminKeyForExport(actor: ApiActorLike): void {
  if (actor.kind === "apikey" && apiRoleOfActor(actor) !== "ADMIN") {
    throw crmApiError(403, "forbidden", "การส่งออกข้อมูลทั้งชุดใช้ได้เฉพาะคีย์ชุดผู้ดูแล (crm.admin) — ขอให้เจ้าของร้านออกคีย์ผู้ดูแลสำหรับงานนี้", "Exports need a crm.admin key.");
  }
}
type ApiActorLike = Parameters<typeof apiRoleOfActor>[0];
