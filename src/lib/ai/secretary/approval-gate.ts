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
  by: { userId: string; membership: MembershipCtx; tenantId?: string },
  key: string,
  patch: { enabled?: boolean; limitSatang?: number | null },
): Promise<RuleMap> {
  const deny = () => new ForbiddenError({ module: "ai", action: "ai.approval.rule.set" });
  // R-S1.7e: ผู้ตั้งต้องเป็นของร้านนี้ — ตรวจก่อนอ่าน role (ctx ของร้านอื่นที่หลุดมา = ปฏิเสธ)
  if (by?.tenantId !== undefined && by.tenantId !== tenantId) throw deny();
  if (by?.membership?.role !== "OWNER") throw deny();
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
  // R-S1.7e: ผูก tenant จากฐาน — ผู้ตั้งต้องเป็น OWNER ของร้านนี้จริง (Membership สด · รับคำเชิญแล้ว) ไม่ใช่แค่ role ที่ส่งมา
  const own = await prisma.membership.findFirst({ where: { tenantId, userId: by.userId, acceptedAt: { not: null } }, select: { role: true } });
  if (own?.role !== "OWNER") throw deny();
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

export const GATE_FAIL_NOTE = "ตรวจกฎอนุมัติไม่ได้ ลองใหม่อีกครั้ง";
const NO_PERM_NOTE = "คุณยังไม่มีสิทธิ์อนุมัติรายการนี้ ให้ผู้มีสิทธิ์เป็นผู้กดยืนยัน";

export type GateResult = { ok: true; why?: string } | { ok: false; note: string };

/** ผู้กดผ่านด่านผู้อนุมัติของห้องเลขาไหม (pure · ใช้ทั้งข้อเสนอและทุกขั้นของแผน) */
function approverVerdict(m: MembershipCtx, kind: string, userId: string | null | undefined): string | null {
  if (!APPROVER_ROLES.has(String(m?.role ?? ""))) return APPROVER_NOTE;
  const access = kindAccessOf(kind);
  if (!access || !membershipCan(m, access, userId ?? "")) return NO_PERM_NOTE;
  return null;
}

async function roomOf(tenantId: string, conversationId: string | null | undefined): Promise<boolean> {
  if (!conversationId) return false;
  return !!(await tenantDb({ tenantId }).aiRoom.findFirst({ where: { conversationId }, select: { id: true } }));
}

/**
 * ด่านผู้อนุมัติ — เรียกใน executeProposal หลังด่านสิทธิ์เดิม (assertCan + ระดับต่อระบบ) ก่อนยืนยัน 2 ชั้น
 *   ห้องเดิม (ไม่มี AiRoom) ⇒ `{ok:true}` ทันที — ไม่อ่านกฎ ไม่คำนวณ why (R-S1.7b: ไม่มี query เพิ่มนอกจากหาแถว AiRoom)
 *   ห้องเลขา ⇒ ผู้กดต้องเป็น OWNER/MANAGER และผ่านตัวตัดสินของโมดูลนั้น (`membershipCan`) · ไม่งั้น {ok:false} คง PENDING ·
 *     ผ่าน = `why` เหตุผลไทยสำหรับการ์ด/บันทึก
 *   อ่านฐานไม่ได้ ⇒ `{ok:false, note: GATE_FAIL_NOTE}` (fail-closed · ไม่ throw ออกไปถึง executeProposal)
 */
export async function approvalGate(
  tenantId: string,
  m: MembershipCtx,
  row: { kind: string; conversationId: string; payload: unknown },
  userId?: string | null,
): Promise<GateResult> {
  try {
    if (!(await roomOf(tenantId, row.conversationId))) return { ok: true };
    const bad = approverVerdict(m, row.kind, userId);
    if (bad) return { ok: false, note: bad };
    return { ok: true, why: whyApproval(row.kind, row.payload, await listRules(tenantId)) };
  } catch {
    return { ok: false, note: GATE_FAIL_NOTE };
  }
}

/**
 * R-S1.7a: ด่านเดียวกันสำหรับแผน (executePlan) — ทุกขั้นต้องผ่าน **ก่อน claim** · หา AiRoom ครั้งเดียวต่อแผน
 *   คืน null = ผ่าน (ห้องเดิมผ่านเสมอ) · string = note ไทย (ไม่ทำสักขั้น · แผนคง PENDING)
 */
export async function planApprovalGate(
  tenantId: string,
  m: MembershipCtx,
  conversationId: string | null | undefined,
  steps: readonly { kind?: unknown }[],
  userId?: string | null,
): Promise<string | null> {
  try {
    if (!(await roomOf(tenantId, conversationId))) return null;
    for (const st of steps) {
      const bad = approverVerdict(m, String(st?.kind ?? ""), userId);
      if (bad) return bad;
    }
    return null;
  } catch {
    return GATE_FAIL_NOTE;
  }
}
