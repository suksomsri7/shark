// tool-access.ts — ด่านสิทธิ์ของเครื่องมือผู้ช่วย AI ต่อ "ผู้กระทำ" (CRM C5.5-G1)
//
// หลัก (เดียวกับ hotfix 1 ต.ค.): เครื่องมือที่แตะข้อมูลของโมดูลใด ใช้ **คีย์สิทธิ์ตัวเดียวกับประตูเว็บ/REST ของข้อมูลนั้น**
//   ตัดสินด้วยตัวตัดสินของโมดูลนั้นเอง (CRM `crmCan` · สมาชิก `canReadMember`/`hasMemberPerm` · บัญชี `membershipCanAccount` ·
//   บอร์ดงาน `kanbanMembershipCan` · โมดูลอื่น `evaluate` ของ RBAC กลาง) — ไม่มีคีย์สิทธิ์ใหม่
//   ประตูเว็บที่ไม่มีคีย์อ่าน (POS · คลัง · ลา · นัด · คิว ฯลฯ — สมาชิกทุกคนของร้านเปิดหน้าได้) = ไม่มีคีย์เพิ่มจาก `ai.chat.send`
//   ขอบเขตการมองเห็นรายแถว (สาขา/ทีม/ระบบ CRM/ผู้อนุมัติ) ตรวจในตัวเครื่องมือด้วย helper ของโมดูล (tools.ts)
//
// ใช้ 2 ที่ (ตารางเดียวกัน):
//   1) `service.sendMessage` — **ไม่ยื่น** เครื่องมือ/สกิลที่ผู้ถามใช้ไม่ได้ให้โมเดลเลย (ประหยัด token ด้วย)
//   2) `tools.runTool` — ตรวจซ้ำทุกครั้งก่อนรัน (defence in depth: ประตู REST / โมเดลเรียกชื่อที่ไม่ได้ยื่น)
// ไม่ผ่าน = ข้อความปฏิเสธสั้น ๆ ให้โมเดลบอกผู้ใช้ — ไม่มีข้อมูลบางส่วน ไม่โยน error ทั้งแชท
//
// เครื่องมือเสนอการกระทำ (action) ใช้คีย์ของ "คนกดยืนยัน" ของ kind นั้น (`kindAccessOf` = ตารางเดียวกับ executeProposal)
//   ⇒ คนที่กดยืนยันเองไม่ได้ ก็ไม่ได้รับเครื่องมือเสนอ (สรุปของข้อเสนอหลายตัวอ่านข้อมูลของโมดูลนั้นมาแสดง)
//
// คีย์ API: เครื่องมือของ 4 โมดูลที่มีทะเบียน scope (บัญชี · บอร์ดงาน · สมาชิก · CRM) = scope ของคีย์ (`toolAllowedForApiKey`
//   ตัวเดียวกับ route) · เครื่องมือเขียนมือที่แตะข้อมูลของ 4 โมดูลนั้น = ปฏิเสธทุกคีย์ (มีคู่ในทะเบียนที่ผูก scope แล้ว —
//   กติกาเดียวกับ AUDIT H1 ของสมาชิก) · เครื่องมือที่เขียนทันที (ความจำ · คลังความรู้ · เปิดเคส) = ปฏิเสธทุกคีย์ (คำสัญญาของ route:
//   AI ภายนอกเปลี่ยนข้อมูลเองไม่ได้ ต้องผ่านข้อเสนอ) · เครื่องมือเขียนมืออื่น = "คีย์กลาง" เท่านั้น (scope ว่าง ไม่ผูกระบบ — ผลเดียวกับ
//   ด่าน `generalToolGate` ของ hotfix/apiv1-scope ที่ route · ที่นี่คือชั้นที่สอง ไม่ได้แทน)
//
// 🔴 ห้าม import บริการที่ลาก `@/lib/env` (fitness F10 โหลดทะเบียนนี้ในโหมดไร้ env)

import { evaluate, type MembershipCtx } from "@/lib/core/rbac";
import { crmCan, crmApi } from "@/lib/modules/crm";
import { canReadMember, hasMemberPerm, isUnitScoped, toMemberActor } from "@/lib/modules/member/access";
import { membershipCanAccount } from "@/lib/modules/account/api/actor";
import { memberToolScope } from "@/lib/modules/member/api/tools";
import { accountToolScope } from "./account-ops";
import { kanbanMembershipCan, kanbanToolScope } from "./kanban-ops";
import { aiActorMembership, isGeneralKeyActor, type AiActor, type AiApiKeyActor } from "./actor";
import { kindAccessOf } from "./proposals";
import { toolAllowedForApiKey } from "./skills";

export type AccessQuery = { module: string; action: string };

/** โมดูลที่มีทะเบียน scope ของคีย์ API เป็นของตัวเอง */
const SCOPED_MODULES = new Set(["crm", "member", "account", "kanban"]);

type HandRule = {
  /** คีย์สิทธิ์ที่ต้องมี **ทุกตัว** (ว่าง = ใครก็ตามที่เข้าผู้ช่วยได้แล้ว — ประตูเว็บไม่มีคีย์อ่าน) */
  needs: readonly AccessQuery[];
  /** แตะข้อมูลของโมดูลที่มีทะเบียน scope (ตัดสินรายแถว/รายระบบในเครื่องมือ) ⇒ คีย์ API ใช้คู่ในทะเบียนแทน */
  scopedData?: true;
  /** เขียนทันทีไม่ผ่านข้อเสนอ ⇒ คีย์ API ใช้ไม่ได้ทุกใบ (หัว route `/api/v1/ai/tools`: "AI ภายนอกเปลี่ยนข้อมูลร้านเองไม่ได้เลย") */
  writesNow?: true;
  /**
   * r2 (F2) ข้อมูลแยกตามสาขา (ประตูเว็บ `requireUnit`) ⇒ ผู้กระทำที่ไม่มีสาขาใดเปิดได้เลย = **ปฏิเสธ + ไม่ยื่น**
   * ("ไม่มีสิทธิ์" ต้องไม่ดูเหมือน "ไม่มีข้อมูล" — งานประจำเคยประกาศ "วันนี้ไม่มีนัด" ให้ทั้งร้านทั้งที่มีนัด)
   */
  branchScoped?: true;
  /** r2 (F2) แถวที่เห็นขึ้นกับ "ตัวคน" (ผู้อนุมัติ) ⇒ งานภายในที่ไม่มีตัวคน = ปฏิเสธ + ไม่ยื่น */
  needsPerson?: true;
  /** r2 (F7) ตัวเลขรวมทั้งระบบสมาชิก ⇒ ต้องอ่านสมาชิกได้ทั้งร้าน (ผู้ถูกจำกัดสาขาตาม `isUnitScoped` ของโมดูลสมาชิก = ปฏิเสธ) */
  memberWholeShop?: true;
};

const BRANCH: HandRule = { needs: [], branchScoped: true };

const OPEN: HandRule = { needs: [] };

/**
 * เครื่องมือเขียนมือที่ไม่ใช่ "เสนอ" (tools.ts) — ชื่อที่ไม่อยู่ที่นี่ / HAND_ACTION_KIND / ทะเบียนโมดูล = ปฏิเสธ (ปิดไว้ก่อน)
 * ประตูเว็บ/REST ของแต่ละแถว: ledger/wo-notes/crm-C5.5-G1.md (ตาราง map 2)
 */
export const HAND_TOOL_ACCESS: Readonly<Record<string, HandRule>> = {
  // ── แกนกลาง / ไม่มีข้อมูลของโมดูล ──
  list_systems: OPEN,
  ask_clarify: OPEN,
  support_open_case: { needs: [], writesNow: true },
  growth_recommendations: OPEN, // นับลูกค้า/บิลทั้งร้าน — แดชบอร์ดหน้าแรกโชว์ตัวเลขชุดนี้ให้สมาชิกทุกคน
  // D1 (มติเจ้าของ): ความจำของผู้ช่วยเปิดให้ทุกคนที่ใช้ผู้ช่วยได้ · ความจำเป็นของร้าน (tenant) ตามเดิม — ไม่มีของรายคน
  remember_fact: { needs: [], writesNow: true },
  forget_fact: { needs: [], writesNow: true },
  list_memories: OPEN,
  // ── อ่าน · ประตูเว็บไม่มีคีย์อ่าน ──
  sales_summary: OPEN, // /app/sys/[id] (POS) · pos/sales
  sales_by_day: OPEN,
  low_stock: OPEN, // inventory hub / items
  pending_leaves: OPEN, // hr/leave
  kb_search: OPEN, // /app/kb
  reward_list_redemptions: OPEN, // reward/history (ระบบแลกรางวัลรุ่นเดิม)
  // ── อ่าน · ประตูเว็บไม่มีคีย์ แต่ผูกสาขา (requireUnit) ⇒ กรองสาขาในเครื่องมือ ──
  today_appointments: BRANCH,
  queue_waiting: BRANCH,
  shop_pending_orders: BRANCH,
  rental_active: BRANCH,
  restaurant_today: BRANCH,
  ticket_event_sales: BRANCH,
  // ── อ่าน · ประตูเว็บกรองรายแถวด้วยผู้อนุมัติ (approval/service listPending) ──
  approvals_pending: { needs: [], needsPerson: true },
  // ── อ่าน · มีคีย์ ──
  upcoming_schedule: { needs: [{ module: "calendar", action: "calendar.event.read" }] }, // /app/calendar (+ วันลาต้อง hr.leave.read)
  chat_unread_conversations: { needs: [{ module: "chat", action: "chat.conversation.read" }] }, // chat/guard requireChatRead
  member_count: { needs: [{ module: "member", action: "member.customer.read" }], scopedData: true, memberWholeShop: true },
  customer_search: { needs: [{ module: "member", action: "member.customer.read" }], scopedData: true },
  customer_points: { needs: [{ module: "member", action: "member.customer.read" }], scopedData: true },
  financial_summary: { needs: [{ module: "account", action: "account.report.view" }], scopedData: true },
  // CRM v1 ไม่มีคีย์อ่าน (CrmHub เดิม) · CRM v2 = crm.contact.read + การมองเห็น — ตัดสินรายระบบในเครื่องมือ
  recent_leads: { needs: [], scopedData: true },
  // ── เขียนทันที ──
  kb_auto_save: { needs: [{ module: "kb", action: "kb.article.create" }], writesNow: true }, // app/kb/actions.ts · คู่ข้อเสนอ kb_create_article
};

/** เครื่องมือเสนอการกระทำที่เขียนมือ → kind ของข้อเสนอ (ชื่อไม่ตรงกันเฉพาะ schedule_task) */
export const HAND_ACTION_KIND: Readonly<Record<string, string>> = {
  inventory_receive: "inventory_receive",
  hr_decide_leave: "hr_decide_leave",
  marketing_create_campaign: "marketing_create_campaign",
  member_create: "member_create",
  reward_redeem: "reward_redeem",
  open_system: "open_system",
  inventory_create_item: "inventory_create_item",
  inventory_adjust: "inventory_adjust",
  hr_create_employee: "hr_create_employee",
  coupon_create: "coupon_create",
  record_expense: "record_expense",
  schedule_task: "ai_schedule_task",
  automation_create_rule: "automation_create_rule",
  void_sale: "void_sale",
  pos_create_sale: "pos_create_sale",
  booking_create_appointment: "booking_create_appointment",
  hotel_create_reservation: "hotel_create_reservation",
  queue_issue_ticket: "queue_issue_ticket",
  shop_confirm_order: "shop_confirm_order",
  shop_refund_order: "shop_refund_order",
  kb_create_article: "kb_create_article",
  school_enroll: "school_enroll",
  school_mark_paid: "school_mark_paid",
  clinic_create_patient: "clinic_create_patient",
  rental_create_booking: "rental_create_booking",
  approval_decide: "approval_decide",
  inventory_consume: "inventory_consume",
  point_adjust: "point_adjust",
  ticket_mark_paid: "ticket_mark_paid",
  restaurant_close_bill: "restaurant_close_bill",
};

/** `propose_plan` — ยื่นให้ทุกคน · แต่ละขั้นตรวจด้วย kind ของขั้นนั้นใน tools.ts (`actorCanConfirmKind`) */
export const PLAN_TOOL = "propose_plan";

/** เครื่องมือของทะเบียนโมดูล → คีย์ของ op (อ่าน = คีย์อ่าน · เขียน = คีย์ของคนกดยืนยัน = KIND_ACCESS ของ kind นั้น) */
function moduleToolQuery(name: string): AccessQuery | null {
  const account = accountToolScope(name);
  if (account) return { module: "account", action: account };
  const kanban = kanbanToolScope(name);
  if (kanban) return { module: "kanban", action: kanban };
  const member = memberToolScope(name);
  if (member) return { module: "member", action: member };
  const crm = crmApi.crmToolScope(name);
  if (crm) return { module: "crm", action: crm };
  return null;
}

/** เครื่องมือของทะเบียนที่อ่านข้อมูลของโมดูลที่สองมาประกอบข้อเสนอ ⇒ ต้องมีคีย์ของโมดูลนั้นด้วย */
const EXTRA_MODULE_TOOL_NEEDS: Readonly<Record<string, readonly AccessQuery[]>> = {
  // อ่านข้อความในห้องแชทลูกค้ามาร่างการ์ด — ประตูเว็บของการอ่านแชท = chat.conversation.read (chat/guard.ts requireChatRead)
  kanban_card_from_chat: [{ module: "chat", action: "chat.conversation.read" }],
};

/** คนในร้าน/งานภายใน ทำ action นี้ได้ไหม — ตัวตัดสินของโมดูลนั้นเอง (ความหมายเดียวกับหน้าจอ) */
export function membershipCan(m: MembershipCtx, q: AccessQuery, userId = ""): boolean {
  switch (q.module) {
    case "crm":
      return crmCan({ role: m.role, unitAccess: m.unitAccess, permissions: m.permissions }, q.action);
    case "member": {
      const actor = toMemberActor(userId, m);
      return q.action === "member.customer.read" ? canReadMember(actor) : hasMemberPerm(actor, q.action);
    }
    case "account":
      return membershipCanAccount(m, q.action);
    case "kanban":
      return kanbanMembershipCan(m, q.action);
    default:
      return evaluate(m, q);
  }
}

export type ToolVerdict = { ok: true } | { ok: false; reason: string };

const OK: ToolVerdict = { ok: true };
const DENY_KEY: ToolVerdict = { ok: false, reason: "คีย์ API นี้ใช้เครื่องมือนี้ไม่ได้ — ใช้เครื่องมือของระบบที่คีย์ได้รับสิทธิ์ หรือคีย์ API กลางของร้าน" };
const denyMember = (q: AccessQuery): ToolVerdict => ({
  ok: false,
  reason: `คุณไม่มีสิทธิ์เข้าถึงข้อมูลส่วนนี้ (ต้องมีสิทธิ์ ${q.action}) — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ก่อน`,
});

function apiKeyHandOk(actor: AiApiKeyActor, rule: HandRule): boolean {
  if (rule.writesNow || rule.scopedData || rule.needs.some((q) => SCOPED_MODULES.has(q.module))) return false;
  return isGeneralKeyActor(actor);
}

/** ชื่อนี้รู้จักในตารางสิทธิ์ไหม (ทะเบียนเครื่องมือทุกตัวต้องรู้จัก — ข้อสอบ G1 ตรวจ) */
export function toolIsMapped(name: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(HAND_TOOL_ACCESS, name) ||
    (Object.prototype.hasOwnProperty.call(HAND_ACTION_KIND, name) && kindAccessOf(HAND_ACTION_KIND[name]) !== null) ||
    name === PLAN_TOOL ||
    moduleToolQuery(name) !== null
  );
}

/**
 * ผู้กระทำนี้ใช้เครื่องมือนี้ได้ไหม (ด่านคีย์สิทธิ์ — การมองเห็นรายแถวตรวจในเครื่องมือ)
 * `opts.crmLegacyLead` = ร้าน CRM รุ่นเดิม (ผู้เรียกคำนวณ) — `crm_create_lead` เปิดให้คีย์ทุกใบเหมือนก่อน C1.10 (กติกาเดิมของ route)
 */
export function toolVerdict(actor: AiActor, name: string, opts: { crmLegacyLead?: boolean } = {}): ToolVerdict {
  const hand = Object.prototype.hasOwnProperty.call(HAND_TOOL_ACCESS, name) ? HAND_TOOL_ACCESS[name] : null;
  const kind = Object.prototype.hasOwnProperty.call(HAND_ACTION_KIND, name) ? HAND_ACTION_KIND[name] : null;
  const mod = hand || kind || name === PLAN_TOOL ? null : moduleToolQuery(name);
  if (!hand && !kind && name !== PLAN_TOOL && !mod) return { ok: false, reason: `ไม่รู้จักเครื่องมือ "${name}"` };

  if (actor.kind === "apiKey") {
    if (mod) {
      const extra = EXTRA_MODULE_TOOL_NEEDS[name] ?? [];
      if (extra.length > 0 && !isGeneralKeyActor(actor)) return DENY_KEY;
      return toolAllowedForApiKey(name, actor.scopes, opts) ? OK : DENY_KEY;
    }
    if (hand) return apiKeyHandOk(actor, hand) ? OK : DENY_KEY;
    if (kind) return actorCanConfirmKind(actor, kind) ? OK : DENY_KEY;
    return isGeneralKeyActor(actor) ? OK : DENY_KEY; // propose_plan
  }

  const m = aiActorMembership(actor);
  if (!m) return { ok: false, reason: "ไม่ทราบว่าใครเป็นผู้ใช้เครื่องมือนี้ จึงยังทำรายการให้ไม่ได้" }; // งานภายในปลอม (r2 F5)
  const userId = actor.kind === "member" ? actor.userId : "";
  if (hand?.branchScoped && actorBranches(actor)?.length === 0) {
    return { ok: false, reason: "คุณไม่มีสิทธิ์ดูข้อมูลส่วนนี้: ข้อมูลแยกตามสาขา และบัญชีนี้ยังไม่ได้รับสิทธิ์สาขาใดเลย (ไม่ได้แปลว่าไม่มีข้อมูล) — ขอให้เจ้าของร้านกำหนดสาขาให้ก่อน" };
  }
  if (hand?.needsPerson && actor.kind !== "member") {
    return { ok: false, reason: "งานอัตโนมัติไม่มีสิทธิ์ดูรายการนี้: รายการรออนุมัติขึ้นกับว่าใครเป็นผู้อนุมัติ (ไม่ได้แปลว่าไม่มีรายการรออนุมัติ)" };
  }
  if (hand?.memberWholeShop && isUnitScoped(toMemberActor(userId, m))) {
    return { ok: false, reason: "คุณไม่มีสิทธิ์ดูตัวเลขนี้: จำนวนสมาชิกเป็นตัวเลขรวมทั้งร้าน แต่บัญชีนี้เห็นสมาชิกเฉพาะบางสาขา — ค้นสมาชิกรายคนได้ตามปกติ" };
  }
  const needs: readonly AccessQuery[] = hand
    ? hand.needs
    : kind
      ? [kindAccessOf(kind) ?? { module: "ai", action: "__unknown_kind__" }]
      : mod
        ? [mod, ...(EXTRA_MODULE_TOOL_NEEDS[name] ?? [])]
        : [];
  for (const q of needs) {
    if (!membershipCan(m, q, userId)) return denyMember(q);
  }
  return OK;
}

/** ผู้ถามกดยืนยันข้อเสนอ kind นี้เองได้ไหม — ด่านของเครื่องมือเสนอ + แต่ละขั้นของแผน */
export function actorCanConfirmKind(actor: AiActor, kind: string): boolean {
  const q = kindAccessOf(kind);
  if (!q) return false;
  if (actor.kind === "apiKey") {
    // คีย์: kind ของโมดูลที่มีทะเบียน = เครื่องมือของทะเบียน (route + toolVerdict ตรวจ scope แล้ว) · kind เขียนมือ = คีย์กลางเท่านั้น
    return SCOPED_MODULES.has(q.module) ? false : isGeneralKeyActor(actor);
  }
  const m = aiActorMembership(actor);
  return !!m && membershipCan(m, q, actor.kind === "member" ? actor.userId : "");
}

/**
 * สาขาที่ผู้กระทำเปิดได้ — ประตูเว็บของโมดูลแกนสาขา (นัด/คิว/ร้านค้า/เช่า/ร้านอาหาร/ตั๋ว) = `requireUnit` → `canAccessUnit`
 * null = ไม่จำกัด (OWNER · unitAccess "*" · คีย์ API = ระดับร้านแบบ REST รุ่นเดิมที่วนทุกสาขา) · [] = ไม่มีสาขาใดเลย (⇒ ปฏิเสธที่ toolVerdict)
 * (ความหมายเดียวกับ `canAccessUnit` ของ rbac ทุกกรณี — tools.ts ทำเป็น where เพื่อนับ/รวมยอดในฐานข้อมูล)
 */
export function actorBranches(actor: AiActor): string[] | null {
  if (actor.kind === "apiKey") return null;
  const m = aiActorMembership(actor);
  if (!m) return [];
  if (m.role === "OWNER" || m.unitAccess.includes("*")) return null;
  return [...m.unitAccess];
}

/** ชื่อเครื่องมือที่ผู้กระทำนี้ใช้ได้ (ตัวกรองของการยื่นเครื่องมือ) */
export function toolsOfferedTo(actor: AiActor, names: readonly string[]): string[] {
  return names.filter((n) => toolVerdict(actor, n).ok);
}
