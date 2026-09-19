// config.ts — CRM ต่อเข้าแกน REST ของกลางอย่างไร (ใบ C1.10 · แบบเดียวกับ member/api/config.ts)
//
// แกนกลาง (`src/lib/api/*`) ไม่รู้จัก CRM — ของ CRM ทั้งหมดอยู่ที่นี่: ชนิดระบบที่คีย์ผูกได้ · namespace ถังเพดาน ·
// วิธีแปลง scope เป็น actor · ข้อความไทย · และ **ประตู uiVersion** (R-E.14 · PERMANENT RULE)
//
// 🔴 R-E.14: ระบบ CRM ที่ `settings.crm.uiVersion = 1` (ทุกร้านบน prod จนกว่าเจ้าของเปิด v2) ⇒ ทุก op ยกเว้น `ping`
//    ตอบ 409 `crm_v2_disabled` **ก่อน** การอ่าน body / confirm / สคีมา / กันซ้ำ / เพดานอัตรา ⇒ ไม่มีอะไรถูกเขียน ไม่มีแถว audit
//    ทำผ่าน `altAuth` (ทางเข้าที่แกนเปิดให้โมดูลแทรกก่อนด่านคีย์) โดยใช้ตัวตรวจคีย์ตัวเดียวกับแกน (`verifyApiKeyDetailed`)
//    แล้วส่งต่อให้ด่านคีย์ของแกน (`requireApi`) ตามปกติ — ไม่ต้องแก้แกนกลางสักบรรทัด
import { verifyApiKeyDetailed } from "@/lib/api-keys/service";
import { tenantDb } from "@/lib/core/db";
import type { ApiOp } from "@/lib/api/op";
import type { ApiModuleConfig } from "@/lib/api/require";
import { requireApi } from "@/lib/api/require";
import { fail, type ApiErrorCode } from "@/lib/api/respond";
import { parseCrmSettings } from "../settings";
import { crmApiKeyActor, crmScopesCan } from "./actor";
import { CRM_RATE_LIMITS } from "./rate";

export { CRM_RATE_LIMITS } from "./rate";

export const CRM_V2_DISABLED_TH = "ระบบ CRM นี้ยังใช้หน้าจอรุ่นเดิม (CRM ใหม่ยังไม่เปิด) — ให้เจ้าของร้านเปิดใช้ CRM ใหม่ก่อน แล้วค่อยเรียก API นี้";
export const CRM_V2_DISABLED_EN = "This CRM system still runs the previous version. The shop owner must switch on CRM v2 before this API can be used.";

const MESSAGES: ApiModuleConfig["messages"] = {
  keyExpiredTh: "คีย์ API หมดอายุแล้ว — กรุณาหมุนคีย์ใหม่ที่หน้า CRM › ตั้งค่า › API",
  keyExpiredEn: "This API key has expired. Rotate it from the CRM settings page.",
  systemMismatchTh: "ระบบ CRM ที่ระบุใช้กับคีย์นี้ไม่ได้",
  systemMismatchEn: "The requested CRM system is not available to this API key.",
  systemRequiredTh: "คีย์นี้ไม่ได้ผูกระบบ CRM — ต้องส่งส่วนหัว X-Shark-System บอกว่าจะทำงานกับระบบไหน",
  systemRequiredEn: "This key is not bound to a CRM system. Send the X-Shark-System header with the AppSystem id.",
  scopeMissingTh: "คีย์นี้ไม่มีสิทธิ์ทำรายการนี้ในระบบ CRM",
  scopeMissingEn: "This API key does not have the scope required for this operation.",
  notFoundTh: "ไม่พบปลายทางนี้ใน API ของ CRM",
  notFoundEn: "No API operation matches this path.",
};

/** ส่วนของ config ที่ไม่มี altAuth — ใช้เดินด่านคีย์ของแกนจากใน altAuth (กันเรียกตัวเองวน) */
const CORE_CONFIG: ApiModuleConfig = {
  module: "crm",
  systemType: "CRM",
  scopePrefix: "crm.",
  // 🔴 AUDIT-CLASS X7: ถังของ CRM เอง (ไม่ใช่ acct / kb / mbr)
  rateNs: "crm",
  rateLimits: CRM_RATE_LIMITS,
  makeActor: crmApiKeyActor,
  messages: MESSAGES,
};

const HEADER_SYSTEM = "x-shark-system";

/** op ที่ตอบได้แม้ระบบยังเป็น uiVersion 1 (มติผู้คุมงาน C1.10 ข้อ 3 — ตรวจสุขภาพคีย์) */
const V1_ALLOWED_OPS = new Set(["ping"]);

/** Bearer ของคำขอ (รูปเดียวกับ require.ts ของแกน) */
function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec((req.headers.get("authorization") ?? "").trim());
  return m?.[1]?.trim() || null;
}

const isTeamsPath = (op: ApiOp) => op.path === "/teams" || op.path.startsWith("/teams/");

/** คำขอเดิม + ส่วนหัว X-Shark-System (ด่านคีย์ของแกนอ่านแค่ส่วนหัว — body ไม่ถูกแตะ) */
function withSystemHeader(req: Request, systemId: string): Request {
  const headers = new Headers(req.headers);
  headers.set(HEADER_SYSTEM, systemId);
  return new Request(req.url, { method: req.method, headers });
}

const v1Response = (requestId: string) =>
  fail(409, "crm_v2_disabled" as ApiErrorCode, CRM_V2_DISABLED_TH, CRM_V2_DISABLED_EN, requestId, { hint: "เปิดที่ CRM › ตั้งค่า › รุ่นหน้าจอ" });

async function isV2(tenantId: string, systemId: string): Promise<boolean | null> {
  const row = await tenantDb({ tenantId }).appSystem.findFirst({ where: { id: systemId, type: "CRM" }, select: { settings: true } });
  return row ? parseCrmSettings(row.settings).uiVersion === 2 : null;
}

export const CRM_API_CONFIG: ApiModuleConfig = {
  ...CORE_CONFIG,
  /**
   * ด่านของ CRM ก่อนด่านคีย์ของแกน (คืนผลของด่านแกนเสมอ ยกเว้น 409 crm_v2_disabled):
   *  (1) R-E.14 ประตูรุ่น **ก่อนเพดานอัตรา** — คีย์ที่ถือ scope ของ op นั้นบนระบบรุ่นเดิมได้ 409 เสมอ ไม่ใช่ 429
   *      (คำตอบ 409 ไม่ทำงานใด ๆ · คีย์ที่ไม่มี scope ยังได้ 403 ของแกนเหมือนเดิม)
   *  (2) R-C.7 ทีมเป็นของทั้งร้าน — คีย์ที่ไม่ผูกระบบเรียก `/teams…` ได้โดยไม่ต้องส่ง X-Shark-System (ใช้ระบบ CRM แรกของร้าน)
   */
  altAuth: async (req, op, requestId) => {
    let effective = req;
    let gated = false;
    const raw = bearer(req);
    const verdict = raw ? await verifyApiKeyDetailed(raw) : null;
    if (verdict?.status === "ok") {
      const key = verdict.key;
      const header = req.headers.get(HEADER_SYSTEM)?.trim() || null;
      let systemId = key.systemId ?? header;
      if (!systemId && isTeamsPath(op)) {
        // มติผู้คุมงาน C1.10: ด่านรุ่นต้องใช้ "ระบบที่ op ทำงานด้วย" — คีย์ไม่ผูกระบบ + ไม่ส่งหัว:
        //   ไม่มี scope ของ op = 403 เหมือนเดิม (ไม่บอกอะไรเพิ่ม) · ร้านมีระบบ CRM เดียว = ใช้ระบบนั้น · หลายระบบ = ขอให้ระบุ (ไม่เดา)
        if (!crmScopesCan(key.scopes, op.action)) {
          return { ok: false, response: fail(403, "scope_missing", MESSAGES.scopeMissingTh, MESSAGES.scopeMissingEn, requestId, { hint: `ต้องการสิทธิ์ ${op.action}` }) };
        }
        const crms = await tenantDb({ tenantId: key.tenantId }).appSystem.findMany({ where: { type: "CRM" }, select: { id: true }, take: 2 });
        if (crms.length > 1) {
          return { ok: false, response: fail(400, "system_required", "ร้านนี้มีระบบ CRM มากกว่าหนึ่งระบบ — ระบุ X-Shark-System (id ของระบบ CRM) ในส่วนหัวของคำขอ", "This shop has more than one CRM system. Send X-Shark-System.", requestId) };
        }
        if (crms[0]) {
          systemId = crms[0].id;
          effective = withSystemHeader(req, crms[0].id);
        }
      }
      const mismatch = !!key.systemId && !!header && header !== key.systemId;
      if (systemId && !mismatch && !V1_ALLOWED_OPS.has(op.id)) {
        const v2 = await isV2(key.tenantId, systemId);
        gated = v2 !== null;
        if (v2 === false && crmScopesCan(key.scopes, op.action)) return { ok: false, response: v1Response(requestId) };
      }
    }
    const auth = await requireApi(effective, op, CORE_CONFIG, requestId);
    if (!auth.ok || gated || V1_ALLOWED_OPS.has(op.id)) return auth;
    // ด่านรุ่นยังไม่ได้ตัดสิน (ไม่ควรเกิด — กันไว้แบบปิดก่อน): อ่านจากระบบที่ด่านแกนเลือกให้แล้ว
    return (await isV2(auth.actor.tenantId, auth.actor.systemId)) === true ? auth : { ok: false, response: v1Response(requestId) };
  },
};
