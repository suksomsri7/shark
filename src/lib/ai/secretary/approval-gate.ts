// approval-gate.ts — กฎอนุมัติ (B4) + ด่านผู้อนุมัติของห้องเลขา (S1.7 · R-K3 · R-K3b · R-K4)
//
// - กฎ 3 ข้อ (`RULE_KEYS`) เก็บใน `AiApprovalRule` (แกน tenant · 1 แถว/กฎ) · ไม่มีแถว = ค่าเริ่มต้น (เปิดทั้ง 3 · วงเงิน 5,000 บาท)
//   เปลี่ยนได้ทางเดียว = `setRule` โดย OWNER — ผลของโมเดล/ความจำ/ข้อความลูกค้าไม่มีทางมาถึงที่นี่ (COMMON §C.3)
// - R-K3b: รุ่นแรกกฎ **ไม่เปิดทางอัตโนมัติ** — ทุกข้อเสนอยังต้องมีคนกดอนุมัติ · กฎมีผลแค่ข้อความ "ทำไมต้องอนุมัติ"
// - R-K4: ด่านผู้อนุมัติ (OWNER/MANAGER) ใช้เฉพาะข้อเสนอที่บทสนทนามีแถว `AiRoom` · ห้อง AI เดิม = ผ่านทันที (พฤติกรรมเดิม)
//   ผู้อนุมัติยังต้องผ่าน `assertCan` + ระดับต่อระบบเดิมใน executeProposal ด้วยสิทธิ์ตัวเอง (ด่านนี้เพิ่มเท่านั้น ไม่แทน)

import { prisma, tenantDb } from "@/lib/core/db";
import { ForbiddenError, type MembershipCtx } from "@/lib/core/rbac";
import { kindAccessOf } from "../proposals";
import { membershipCan } from "../tool-access";
import { RULE_KEYS, isRuleKey, whyApproval, type RuleKey, type RuleMap } from "./kind-class";

export { RULE_KEYS, type RuleKey, type RuleMap } from "./kind-class";

export const DEFAULT_RULES: RuleMap = Object.freeze({
  "chat.send": Object.freeze({ enabled: true, limitSatang: null }),
  "money.limit": Object.freeze({ enabled: true, limitSatang: 500_000 }), // 5,000 บาท
  "pii.export": Object.freeze({ enabled: true, limitSatang: null }),
}) as RuleMap;

const APPROVER_ROLES = new Set(["OWNER", "MANAGER"]);
export const APPROVER_NOTE = "ข้อเสนอของเลขาต้องให้เจ้าของหรือผู้จัดการอนุมัติ";

function cloneDefaults(): RuleMap {
  const out = {} as RuleMap;
  for (const k of RULE_KEYS) out[k] = { ...DEFAULT_RULES[k] };
  return out;
}

/** กฎของร้าน (เติมค่าเริ่มต้นให้ครบ 3 ข้อ) — อ่านอย่างเดียว ไม่เขียนแถว */
export async function listRules(tenantId: string): Promise<RuleMap> {
  const out = cloneDefaults();
  const rows = await tenantDb({ tenantId }).aiApprovalRule.findMany({ select: { key: true, enabled: true, limitSatang: true } });
  for (const r of rows) {
    if (!isRuleKey(r.key)) continue;
    out[r.key] = { enabled: r.enabled, limitSatang: r.key === "money.limit" ? (r.limitSatang ?? DEFAULT_RULES["money.limit"].limitSatang) : null };
  }
  return out;
}

/** ตั้งกฎ — OWNER เท่านั้น (ForbiddenError) · key ไม่รู้จัก / วงเงินไม่ใช่จำนวนเต็ม ≥ 0 ⇒ throw ไทย (ยังไม่เขียน) */
export async function setRule(
  tenantId: string,
  by: { userId: string; membership: MembershipCtx },
  key: string,
  patch: { enabled?: boolean; limitSatang?: number | null },
): Promise<RuleMap> {
  if (by?.membership?.role !== "OWNER") throw new ForbiddenError({ module: "ai", action: "ai.approval.rule.set" });
  if (!isRuleKey(key)) throw new Error(`ไม่รู้จักกฎอนุมัติ "${String(key).slice(0, 40)}" — กฎที่ตั้งได้: ${RULE_KEYS.join(", ")}`);
  const p = patch ?? {};
  if (p.enabled !== undefined && typeof p.enabled !== "boolean") throw new Error("ค่าเปิด/ปิดกฎต้องเป็นใช่หรือไม่ใช่");
  if (p.limitSatang !== undefined && p.limitSatang !== null) {
    if (typeof p.limitSatang !== "number" || !Number.isInteger(p.limitSatang) || p.limitSatang < 0) {
      throw new Error("วงเงินต้องเป็นจำนวนเต็ม (สตางค์) ที่ไม่ติดลบ");
    }
    if (key !== "money.limit") throw new Error("ตั้งวงเงินได้เฉพาะกฎ money.limit");
  }
  if (!by.userId) throw new Error("ต้องรู้ตัวผู้ตั้งกฎ");
  const cur = (await listRules(tenantId))[key as RuleKey];
  const enabled = p.enabled ?? cur.enabled;
  const limitSatang = key === "money.limit" ? (p.limitSatang !== undefined ? p.limitSatang : cur.limitSatang) : null;
  // prisma ตรง: guard ของ tenantDb ห่อ where ของ upsert ด้วย AND ซึ่งใช้กับคีย์ unique ผสมไม่ได้ — tenantId อยู่ในคีย์เองแล้ว (แบบ setAccess)
  await prisma.aiApprovalRule.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, enabled, limitSatang, setById: by.userId },
    update: { enabled, limitSatang, setById: by.userId },
  });
  return listRules(tenantId);
}

/**
 * ด่านผู้อนุมัติ — เรียกใน executeProposal หลังด่านสิทธิ์เดิม (assertCan + ระดับต่อระบบ) ก่อนยืนยัน 2 ชั้น
 *   ห้องเลขา (มี AiRoom) ⇒ ผู้กดต้องเป็น OWNER/MANAGER และผ่านตัวตัดสินของโมดูลนั้น (`membershipCan`) · ไม่งั้น {ok:false} คง PENDING
 *   ห้องเดิม ⇒ ผ่านเสมอ · `why` = เหตุผลไทยสำหรับการ์ด/บันทึก
 */
export async function approvalGate(
  tenantId: string,
  m: MembershipCtx,
  row: { kind: string; conversationId: string; payload: unknown },
  userId?: string | null,
): Promise<{ ok: true; why: string } | { ok: false; note: string }> {
  const room = row.conversationId
    ? await tenantDb({ tenantId }).aiRoom.findFirst({ where: { conversationId: row.conversationId }, select: { id: true } })
    : null;
  if (room) {
    if (!APPROVER_ROLES.has(String(m?.role ?? ""))) return { ok: false, note: APPROVER_NOTE };
    const access = kindAccessOf(row.kind);
    if (!access || !membershipCan(m, access, userId ?? "")) return { ok: false, note: "คุณยังไม่มีสิทธิ์อนุมัติรายการนี้ ให้ผู้มีสิทธิ์เป็นผู้กดยืนยัน" };
  }
  return { ok: true, why: whyApproval(row.kind, row.payload, await listRules(tenantId)) };
}
