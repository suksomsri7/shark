// ai-bridges.ts — ผู้ช่วย AI ในหน้า CRM + สะพานห้องทีม (MEETING) + คลังความรู้ (KB) · ใบ C3.4
//
//   runAssist            — ปุ่ม AI บนดีล 360 (สรุป · ทำไมเสี่ยง · ขั้นถัดไป · ร่างอีเมล) · ผู้ติดต่อ 360 (ทำไมร้อน · ข้อความปิดการขาย) ·
//                          บริษัท 360 (สรุป · โอกาสต่อยอด) · หน้าแรก ("ดีลไหนเสี่ยงเดือนนี้" → ตาราง + ข้อเสนอสร้างงานติดตาม)
//   atRiskDeals          — ชุด "ดีลเสี่ยงเดือนนี้" ตัวเดียว (tool crm_deals_at_risk · ตารางหน้าแรก · ข้อเสนอ crm.assist.tasks ใช้ร่วม)
//   confirmProposal /    — "ประตูเดียว" ของข้อเสนอ CRM (addendum ข้อ 9): ยืนยัน/ยกเลิกได้เฉพาะคนที่ "ยืนยันได้" =
//   cancelProposal         ร้านเดียวกัน · ระบบเดียวกับ payload · มีคีย์ของ kind · มองเห็นทุกดีล/ผู้ติดต่อ/บริษัทที่ payload อ้าง
//   onDealWonTeamRoom /  — แจ้งห้องทีมใน MEETING (ปิดดีลได้ · lead ร้อน) — ของแถมใต้ `compose` ของ `crm.deal.won` / `crm.score.threshold`
//   onHotLeadTeamRoom
//   postStaleDigest      — งานรายวัน `crm.teamroom.stale`: สรุปดีลนิ่งของแต่ละทีมเข้าห้องทีม วันละข้อความ (วันตามปฏิทินไทย)
//   unfurlDealLink       — ลิงก์ดีลที่วางในห้องแชท → การ์ด (ชื่อ · ขั้น · มูลค่า) เฉพาะคนที่มองเห็นดีลนั้น
//   renderKbTokens       — `{{kb:<articleId>}}` (ตัวจริงอยู่ `./kb-tokens` — ใช้ร่วมกับตัวเรนเดอร์แม่แบบอีเมล)
//   setTeamRoom          — ผูกทีม → ห้อง (`settings.crm.teamRooms[teamId]` · jsonb_set คำสั่งเดียว)
//
// 🔴 AUDIT H3 (สมาชิก) = ข้อบังคับของใบนี้: ทุกการอ่านของ AI วิ่งด้วย actor ของ "คนที่ถาม" (visibleWhere ของเขา · ทีม/สาขาของเขา) ·
//    prompt ไม่มีเบอร์/อีเมล/เลขภาษี (ไม่อ่านช่องพวกนั้นเลย + ปิดซ้ำด้วย redactContactInfo ในข้อความอิสระ) และไม่มีค่าฟิลด์อ่อนไหว
//    (ไม่อ่านฟิลด์กำหนดเองเลย) · การเขียนทุกอย่างเป็นข้อเสนอ 24 ชม. · ยกเลิกได้เฉพาะคนที่ยืนยันได้
// 🔴 ลำดับการปฏิเสธของ runAssist (addendum ข้อ 2): ประตู v2 → การมองเห็น (NOT_FOUND · ไม่เรียก ไม่หัก) → ผู้ให้บริการ (NOT_CONFIGURED) →
//    canSpend (NO_CREDIT) → เรียกโมเดล **ครั้งเดียว** → หัก CRM_ASSIST ครั้งเดียว (note = id ล้วน) · โมเดลล้ม = ปฏิเสธ ไม่หัก ไม่ทิ้งข้อเสนอค้าง
// 🔴 โมดูลอื่นผ่าน facade เท่านั้น: MEETING (`@/lib/modules/meeting` · เส้น crm→meeting) · KB (ผ่าน `./kb-tokens` · เส้น crm→kb) —
//    dynamic import ตอนใช้ (ไม่ลากกราฟโมดูลอื่นตอนโหลด facade CRM)

import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { emitOutbox } from "@/lib/core/outbox";
import { logOps } from "@/lib/core/ops";
import type { MemberActor } from "@/lib/modules/member";
import { canSpend, chargeUsageSafe } from "@/lib/ai/credit";
import { resolveProvider, type AiChatMessage, type AiProvider } from "@/lib/ai/provider";
import { prisma } from "./db";
import { crmCan, crmForbiddenMessage } from "./access";
import { CrmV2DisabledError } from "./ui-version";
import { activityWhere, contactWhere, dealWhere, recordWhere } from "./where";
import * as companiesSvc from "./companies"; // CRM C3.4 ▸ อ่านบริษัทผ่านบริการบริษัท (C1.3-S0.3) ◂
import { parseCrmSettings } from "./settings";
import { redactContactInfo } from "./calls-shared";
import { DAY_MS, TH_OFFSET_MS, thaiDateLabel, thaiDayKey } from "./activities-shared";
import { dayKey as dealDayKey, thaiToday } from "./deals-shared"; // CRM C5.5 ▸ fix3a H2b-3: วันไทยแบบเดียวกับกระดานดีล ◂
import { kbGrounding } from "./kb-tokens";
import { crmKindAccess, crmDestructiveKinds, dispatchCrmKind, isCrmKind } from "./api/tools";
import {
  ASSIST_KIND_LABEL,
  ASSIST_PROPOSAL_TTL_MS,
  ASSIST_TASKS_KIND,
  ASSIST_WORKING_STALE_MS,
  AT_RISK_LATE_DAYS,
  AT_RISK_REASON_LABEL,
  CRM_TEAMROOM_AUTHOR,
  CRM_TEAMROOM_DIGEST_MAX,
  CRM_TEAMROOM_EVENT,
  NEXT_STEP_KIND,
  NEXT_STEP_OP_ID,
  isAssistKind,
  type AssistKind,
  type AssistResultView,
  type AtRiskItemView,
  type AtRiskReason,
  type TeamRoom,
} from "./ai-bridges-shared";

export { renderKbTokens } from "./kb-tokens";

// ═════════════════════════ ชนิด · error · ตัวช่วย ═════════════════════════

export type AiBridgeCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
type Actor = MemberActor;
type Tx = Prisma.TransactionClient;
type Sys = { id: string; tenantId: string; settings: unknown };

export type AiBridgeErrorCode = "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "EXPIRED" | "NO_CREDIT" | "NOT_CONFIGURED" | "VALIDATION" | "AI_FAILED";

/** ปฏิเสธของใบนี้ — ข้อความไทยที่ไม่โทษผู้ใช้ · `.code` ให้ REST/หน้าจอแปลเป็นสถานะ */
export class AiBridgeError extends Error {
  readonly code: AiBridgeErrorCode;
  constructor(code: AiBridgeErrorCode, message: string) {
    super(message);
    this.name = "AiBridgeError";
    this.code = code;
  }
}
const fail = (code: AiBridgeErrorCode, message: string) => new AiBridgeError(code, message);

const MSG = {
  sys: "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่",
  deal: "ไม่พบดีลนี้ในระบบ CRM ที่เปิดอยู่ หรือบัญชีนี้ยังมองไม่เห็นดีลนี้",
  contact: "ไม่พบผู้ติดต่อคนนี้ในระบบ CRM ที่เปิดอยู่ หรือบัญชีนี้ยังมองไม่เห็นผู้ติดต่อนี้",
  company: "ไม่พบบริษัทนี้ในระบบ CRM ที่เปิดอยู่ หรือบัญชีนี้ยังมองไม่เห็นบริษัทนี้",
  kind: "ไม่รู้จักปุ่มผู้ช่วย AI นี้ — รีเฟรชหน้าแล้วลองใหม่",
  noAi: "ยังไม่ได้ตั้งค่าผู้ช่วย AI ของระบบ — ขอให้ผู้ดูแลระบบตั้งค่าก่อน แล้วกดอีกครั้ง",
  noCredit: "เครดิตผู้ช่วย AI หมดแล้ว — เติมเครดิตที่ ตั้งค่า → เครดิต AI แล้วกดอีกครั้งได้ทันที",
  aiFailed: "ผู้ช่วย AI ตอบไม่สำเร็จในรอบนี้ ระบบไม่ได้หักเครดิตและไม่ได้บันทึกอะไร — ลองกดอีกครั้งในอีกสักครู่",
  noNextStep: "ผู้ช่วย AI ยังเสนอขั้นถัดไปของดีลนี้ไม่ได้ ระบบไม่ได้หักเครดิต — ลองกดอีกครั้ง",
  working: "ผู้ช่วย AI กำลังเตรียมข้อเสนอนี้อยู่ — รอสักครู่แล้วลองอีกครั้ง",
  proposal: "ไม่พบข้อเสนอนี้ในระบบ CRM ที่เปิดอยู่ (อาจถูกจัดการไปแล้วหรืออยู่คนละระบบ)",
  taken: "ข้อเสนอนี้ถูกจัดการไปแล้วจากอีกหน้าจอหนึ่ง — รีเฟรชหน้าเพื่อดูผลล่าสุด",
  expired: "ข้อเสนอนี้หมดอายุแล้ว (เกิน 24 ชั่วโมง) — กดปุ่มผู้ช่วย AI ใหม่เพื่อสร้างข้อเสนอใหม่",
  cannotAct: "บัญชีนี้ยืนยันหรือยกเลิกข้อเสนอนี้ไม่ได้ — ต้องเป็นผู้ที่มีสิทธิ์และมองเห็นทุกดีลในข้อเสนอ",
  confirm2x: "ข้อเสนอนี้ลบหรือยกเลิกข้อมูลถาวร — ต้องยืนยันอีกครั้งก่อนระบบจะทำรายการ",
  team: "ไม่พบทีมนี้ในร้าน — รีเฟรชหน้าแล้วเลือกใหม่",
  room: "ไม่พบห้องนี้ในแชททีมของร้าน (หรือถูกเก็บถาวรแล้ว) — เลือกห้องอื่น",
} as const;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const lockKey = (tx: Tx, key: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
const baht = (satang: number | bigint) => `฿${(Number(satang) / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
/** ข้อความอิสระที่พนักงานพิมพ์ (ชื่อดีล · หัวข้อกิจกรรม · ชื่อคน) — ปิดเบอร์/อีเมล/เลขยาวก่อนออกจากเครื่อง (AUDIT-CLASS X8) */
const safe = (v: unknown, max = 200): string => redactContactInfo(String(v ?? "").replace(/\s+/g, " ").trim()).slice(0, max);
// CRM C5.4-B ▸ L5-M3: ห้องทีม (สมาชิกห้อง ≠ คนที่เห็นผู้ติดต่อใน CRM) ไม่ได้ชื่อลูกค้า — ชื่อดีลที่มีชื่อผู้ติดต่อของดีลนั้น (ค่าปริยาย "ดีล <ชื่อ>")
//   ถูกแทนชื่อด้วย "ลูกค้า" ก่อนโพสต์ (โพสต์ที่ออกไปแล้วไม่มีทางถูกปิดคำตอนลบข้อมูล) · lead ร้อน = ลิงก์ + คะแนน ไม่มีชื่อ ◂
type NameParts = { name: string | null; firstName: string | null; lastName: string | null } | null;
// hunter H3(d): ชื่อของผู้ติดต่อ **ทุกคน** ของดีล (หลัก + CrmDealContact) ไม่ใช่แค่คนหลัก
const withoutName = (title: string, c: NameParts, more: readonly { contact: NameParts }[] = []): string => {
  let t = withoutOne(title, c);
  for (const m of more) t = withoutOne(t, m.contact);
  return t;
};
const withoutOne = (title: string, c: NameParts): string => {
  if (!c) return title;
  const toks = [c.name, [c.firstName, c.lastName].filter(Boolean).join(" "), c.firstName, c.lastName]
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length >= 3)
    .sort((a, b) => b.length - a.length);
  let t = title;
  for (const tk of toks) if (t.includes(tk)) t = t.split(tk).join("ลูกค้า");
  return t;
};
const NAME_SEL = { select: { name: true, firstName: true, lastName: true } } as const;
const MORE_SEL = { select: { contact: NAME_SEL }, take: 50 } as const;
const dayLabel = (d: Date | null | undefined): string => (d ? thaiDateLabel(d.getTime(), true) : "-");
const nowOf = (v: unknown): Date => (v instanceof Date && Number.isFinite(v.getTime()) ? v : new Date());

/** ประตูของทุกทางเข้าที่มีคน: actor ต้องเป็นพนักงาน · ระบบต้องเป็น CRM ของร้านนี้ (NOT_FOUND) · uiVersion 2 (R-E.14) */
async function enter(ctx: AiBridgeCtx, actor: Actor | null | undefined): Promise<{ a: Actor; sys: Sys }> {
  if (!actor || actor.role === "CUSTOMER" || !str(actor.userId)) throw fail("NOT_FOUND", MSG.sys);
  const tenantId = str(ctx?.tenantId);
  const systemId = str(ctx?.systemId);
  const sys = tenantId && systemId ? await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { id: true, tenantId: true, settings: true } }) : null;
  if (!sys) throw fail("NOT_FOUND", MSG.sys);
  if (parseCrmSettings(sys.settings).uiVersion !== 2) throw new CrmV2DisabledError();
  return { a: actor, sys };
}

const scopeOf = (sys: Sys) => ({ tenantId: sys.tenantId, systemId: sys.id });

async function audit(ctx: AiBridgeCtx, action: string, targetType: string, targetId: string, after: Record<string, unknown>): Promise<void> {
  // AUDIT-CLASS X8: ประวัติเก็บแค่ id/ชนิด/จำนวน — ไม่มีข้อความจากโมเดล ไม่มีชื่อ/เบอร์/อีเมล
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? null,
    actorType: ctx.actorUserId ? "USER" : "SYSTEM",
    action,
    targetType,
    targetId,
    after,
  }).catch(() => null);
}

// ═════════════════════════ ดีลเสี่ยงเดือนนี้ ═════════════════════════

/** "YYYY-MM" (ปฏิทินไทย) ของขณะ `ms` */
function thaiMonthKeyOf(ms: number): string {
  return thaiDayKey(ms).slice(0, 7);
}
/** ขณะแรกของเดือนไทยถัดจาก "YYYY-MM" (exclusive) */
function nextThaiMonthStart(monthKey: string): Date {
  const [y, m] = monthKey.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 1) - TH_OFFSET_MS); // m เป็นเลขเดือน 1–12 ⇒ Date.UTC(y, m) = วันที่ 1 ของเดือนถัดไป
}
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type AtRiskInput = { now?: Date | null; month?: string | null; team?: string | null; owner?: string | null };
export type AtRiskResult = { month: string; items: AtRiskItemView[] };

/**
 * ดีลเสี่ยงของเดือนไทย (addendum ข้อ 7) — ชุดเดียวของ tool / ตารางหน้าแรก / ข้อเสนอสร้างงาน
 *   OPEN · ไม่เก็บถาวร · มองเห็นได้โดยคนที่ถาม · expectedCloseAt < ขณะแรกของเดือนไทยถัดไป (เลยกำหนดแล้วก็นับ) ·
 *   มีเหตุผลอย่างน้อย 1: STALE (stalledAt) · CLOSE_OVERDUE (วันไทยของ expectedCloseAt < วันนี้ตามปฏิทินไทย) · NO_NEXT_ACTIVITY (ไม่มี/เลยแล้ว) ·
 *   PIPELINE_LATE_MONTH (forecast PIPELINE และปิดภายใน 7 วัน)
 * AUDIT-CLASS X1/X2: ขอบเขต = `dealWhere` ของ actor (คนที่ถาม — ผู้ช่วยได้ actor ของคนนั้นจาก crmActorOf) · ตัวกรองทีม/ผู้ดูแลแค่ "แคบลง"
 */
export async function atRiskDeals(ctx: AiBridgeCtx, actor: Actor, input: AtRiskInput = {}): Promise<AtRiskResult> {
  const { a, sys } = await enter(ctx, actor);
  const now = nowOf(input?.now);
  const wanted = str(input?.month);
  if (wanted && !MONTH_RE.test(wanted)) throw fail("VALIDATION", "เดือนต้องอยู่ในรูป ปี-เดือน เช่น 2026-09");
  const month = wanted ?? thaiMonthKeyOf(now.getTime());
  const end = nextThaiMonthStart(month);
  const team = str(input?.team);
  const ownerRaw = str(input?.owner);
  const owner = ownerRaw === "me" ? a.userId : ownerRaw;
  const scope = scopeOf(sys);
  const rows = await prisma.crmDeal.findMany({
    where: {
      AND: [
        await dealWhere(scope, a),
        { kind: "OPEN", archivedAt: null, expectedCloseAt: { not: null, lt: end } },
        ...(team ? [{ teamId: team }] : []),
        ...(owner ? [{ ownerUserId: owner }] : []),
      ],
    },
    select: { id: true, title: true, companyId: true, valueSatang: true, ownerUserId: true, teamId: true, stalledAt: true, expectedCloseAt: true, nextActivityAt: true, forecastCategory: true },
    orderBy: [{ expectedCloseAt: "asc" }, { id: "asc" }],
    take: 500,
  });
  // CRM C5.5 ▸ (fix3b · F5) "ปิดภายใน 7 วัน" = วันไทยของวันปิด ≤ วันไทยของวันนี้ + 7 (เดิมเทียบขณะ `expectedCloseAt <= now + 7 วัน` ⇒ ดีลที่ปิดวันที่
  //   วันนี้+7 เข้า/ออกเหตุผลนี้ตอน 07:00 น.) — วันปิดเก็บเป็นเที่ยงคืน UTC ของวันไทย จึงอ่านด้วย `dealDayKey` แบบเดียวกับ CLOSE_OVERDUE ◂
  const lateKey = thaiDayKey(now.getTime() + AT_RISK_LATE_DAYS * DAY_MS);
  const todayKey = thaiToday(now); // CRM C5.5 ▸ fix3a H2b-3 ◂
  const risky = rows
    .map((d) => {
      const reasons: AtRiskReason[] = [];
      if (d.stalledAt) reasons.push("STALE");
      // CRM C5.5 ▸ (fix3a · H2b-3) วันคาดว่าจะปิดเก็บเป็นเที่ยงคืน UTC ของ "วันไทย" (= 07:00 น.) ⇒ เทียบ "วันไทย" กับวันนี้ตามปฏิทินไทย
      //   กติกาเดียวกับกระดานดีล (`DealBoard` `expectedCloseAt < nowKey` · nowKey = `thaiToday()`) — เลยกำหนด = วันปิดอยู่ก่อนวันนี้เท่านั้น
      //   (เดิมเทียบขณะ ⇒ ดีลที่ปิด "วันนี้" ถูกติด "เลยวันคาดว่าจะปิด" ตั้งแต่ 07:00 น.) ◂
      if (d.expectedCloseAt && (dealDayKey(d.expectedCloseAt) ?? "") < todayKey) reasons.push("CLOSE_OVERDUE");
      if (!d.nextActivityAt || d.nextActivityAt.getTime() < now.getTime()) reasons.push("NO_NEXT_ACTIVITY");
      if (d.forecastCategory === "PIPELINE" && d.expectedCloseAt && (dealDayKey(d.expectedCloseAt) ?? "") <= lateKey) reasons.push("PIPELINE_LATE_MONTH");
      return { d, reasons };
    })
    .filter((x) => x.reasons.length > 0);
  // ชื่อบริษัทเฉพาะที่คนถามมองเห็น (มองไม่เห็น = null — ไม่เดา ไม่เปิดเผย)
  const coIds = [...new Set(risky.map((x) => x.d.companyId).filter((x): x is string => !!x))];
  const cos = coIds.length ? await companiesSvc.namesByIds(scope, a, coIds) : [];
  const coName = new Map(cos.map((c) => [c.id, c.name]));
  return {
    month,
    items: risky.map(({ d, reasons }) => ({
      dealId: d.id,
      title: d.title,
      companyName: d.companyId ? coName.get(d.companyId) ?? null : null,
      valueSatang: d.valueSatang,
      ownerUserId: d.ownerUserId,
      teamId: d.teamId,
      reasons,
      expectedCloseAt: d.expectedCloseAt ? d.expectedCloseAt.toISOString() : null,
    })),
  };
}

// ═════════════════════════ ผู้ช่วย AI ในหน้า ═════════════════════════

export type RunAssistInput = { kind: AssistKind | string; id?: string | null; now?: Date | null };
export type RunAssistDeps = { ai?: AiProvider };

const SYSTEM_PROMPT = [
  "You are the sales assistant inside a Thai CRM. Answer in Thai, short and practical (at most 6 lines unless asked for an e-mail).",
  "Use ONLY the facts given. Never invent numbers, names, dates or promises. Never write phone numbers, e-mail addresses or tax ids.",
  "Reply with ONE JSON object only, no prose around it.",
].join("\n");

const FORMAT: Record<AssistKind, string> = {
  "deal.summary": 'JSON: {"summary": "3-5 lines: where the deal stands, value, what happened last, what is missing"}',
  "deal.risk": 'JSON: {"text": "why this deal is at risk (2-4 bullet lines) and what would reduce the risk"}',
  "deal.nextStep": 'JSON: {"nextStep": "ONE concrete next action for the deal owner, max 200 characters", "text": "one line why"}',
  "deal.draftEmail": 'JSON: {"subject": "e-mail subject", "body": "polite follow-up e-mail body in Thai, may use the shop knowledge given"}',
  "contact.whyHot": 'JSON: {"text": "why this lead scores hot (2-4 lines) and the best time/way to follow up"}',
  "contact.closingMessage": 'JSON: {"message": "a short friendly closing message the salesperson can send (chat style, Thai)"}',
  "company.summary": 'JSON: {"summary": "3-5 lines: who the company is for us, open deals, money, recent contact"}',
  "company.upsell": 'JSON: {"text": "2-4 upsell or repeat-sale ideas grounded in what they bought before"}',
  "home.atRisk": 'JSON: {"text": "2-4 lines: which of these deals need attention first and why"}',
};

type Built = { facts: string; kbIds: string[]; targetType: string; targetId: string };

async function dealFacts(scope: { tenantId: string; systemId: string }, a: Actor, dealId: string, kind: AssistKind): Promise<Built> {
  const d = await prisma.crmDeal.findFirst({
    where: { AND: [await dealWhere(scope, a), { id: dealId }] },
    select: {
      id: true, title: true, valueSatang: true, kind: true, expectedCloseAt: true, stalledAt: true, lastActivityAt: true, nextActivityAt: true,
      nextStep: true, forecastCategory: true, stageEnteredAt: true, companyId: true, contactId: true, tags: true,
      stage: { select: { name: true, probability: true } }, pipeline: { select: { name: true } },
      lines: { select: { name: true, qty: true, unitPriceSatang: true }, orderBy: { sortOrder: "asc" }, take: 20 },
    },
  });
  if (!d) throw fail("NOT_FOUND", MSG.deal);
  const [co, ct, acts] = await Promise.all([
    d.companyId ? companiesSvc.briefForAssist(scope, a, d.companyId) : null,
    prisma.crmContact.findFirst({ where: { AND: [await contactWhere(scope, a), { id: d.contactId }] }, select: { name: true, jobTitle: true } }),
    prisma.crmActivity.findMany({
      where: { AND: [await activityWhere(scope, a), { dealId: d.id }] },
      select: { type: true, title: true, startAt: true, doneAt: true, dueAt: true, outcome: true },
      orderBy: [{ createdAt: "desc" }],
      take: 8,
    }),
  ]);
  const lines = [
    `Deal: ${safe(d.title)}`,
    `Stage: ${safe(d.stage?.name ?? "-")} (${d.stage?.probability ?? 0}%) · pipeline ${safe(d.pipeline?.name ?? "-")} · status ${d.kind}`,
    `Value: ${baht(d.valueSatang)} · forecast ${d.forecastCategory} · expected close ${dayLabel(d.expectedCloseAt)}`,
    `In this stage since ${dayLabel(d.stageEnteredAt)} · stalled: ${d.stalledAt ? `yes (since ${dayLabel(d.stalledAt)})` : "no"}`,
    `Last activity ${dayLabel(d.lastActivityAt)} · next activity ${dayLabel(d.nextActivityAt)}`,
    `Next step written: ${safe(d.nextStep ?? "-", 300)}`,
    `Company: ${co ? `${safe(co.name)}${co.industry ? ` (${safe(co.industry, 60)})` : ""}` : "-"} · contact: ${ct ? `${safe(ct.name, 80)}${ct.jobTitle ? ` (${safe(ct.jobTitle, 60)})` : ""}` : "-"}`,
    d.tags.length ? `Tags: ${d.tags.slice(0, 10).map((t) => safe(t, 40)).join(", ")}` : "",
    d.lines.length ? `Lines: ${d.lines.map((l) => `${safe(l.name, 80)} × ${Number(l.qty)} @ ${baht(l.unitPriceSatang)}`).join(" · ")}` : "Lines: none",
    acts.length
      ? `Recent activities:\n${acts.map((x) => `- ${x.type} ${dayLabel(x.startAt ?? x.dueAt)} ${safe(x.title, 120)}${x.outcome ? ` → ${safe(x.outcome, 40)}` : ""}${x.doneAt ? "" : " (open)"}`).join("\n")}`
      : "Recent activities: none",
  ];
  let kbIds: string[] = [];
  if (kind === "deal.draftEmail" || kind === "deal.summary") {
    // addendum ข้อ 10: บทความของร้าน (≤ 3) ที่ตรงกับคำของดีล — ชื่อดีล + ชื่อสินค้า (ไม่มีข้อมูลลูกค้าในคำค้น)
    const kb = await kbGrounding({ tenantId: scope.tenantId }, [d.title, ...d.lines.map((l) => l.name)]);
    kbIds = kb.map((k) => k.id);
    if (kb.length) lines.push(`Shop knowledge (use only if relevant):\n${kb.map((k, i) => `[${i + 1}] ${safe(k.title)}: ${safe(k.text, 1200)}`).join("\n")}`);
  }
  return { facts: lines.filter(Boolean).join("\n"), kbIds, targetType: "CrmDeal", targetId: d.id };
}

async function contactFacts(scope: { tenantId: string; systemId: string }, a: Actor, contactId: string): Promise<Built> {
  // 🔴 select ระบุช่องเอง: ไม่อ่าน phone/email/lineUserId/ฟิลด์กำหนดเอง (อ่อนไหว) เลย — ไม่มีทางหลุดเข้า prompt
  const c = await prisma.crmContact.findFirst({
    where: { AND: [await contactWhere(scope, a), { id: contactId }] },
    select: { id: true, name: true, jobTitle: true, lifecycleStage: true, leadStatus: true, score: true, scoreBand: true, scoreUpdatedAt: true, tags: true, sourceKind: true, lastActivityAt: true, nextActivityAt: true, companyId: true, createdAt: true },
  });
  if (!c) throw fail("NOT_FOUND", MSG.contact);
  const [co, logs, deals, acts] = await Promise.all([
    c.companyId ? companiesSvc.briefForAssist(scope, a, c.companyId) : null,
    prisma.crmScoreLog.findMany({ where: { tenantId: scope.tenantId, contactId: c.id }, select: { points: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 6 }).catch(() => [] as { points: number; reason: string; createdAt: Date }[]),
    prisma.crmDeal.findMany({ where: { AND: [await dealWhere(scope, a), { contactId: c.id, archivedAt: null }] }, select: { title: true, valueSatang: true, kind: true, stage: { select: { name: true } } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.crmActivity.findMany({ where: { AND: [await activityWhere(scope, a), { contactId: c.id }] }, select: { type: true, title: true, startAt: true, dueAt: true, doneAt: true }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const lines = [
    `Contact: ${safe(c.name, 80)}${c.jobTitle ? ` (${safe(c.jobTitle, 60)})` : ""} · company ${co ? safe(co.name) : "-"}`,
    `Lifecycle ${c.lifecycleStage} · lead status ${c.leadStatus} · source ${c.sourceKind ?? "-"} · created ${dayLabel(c.createdAt)}`,
    `Score ${c.score} (${c.scoreBand ?? "-"}) · updated ${dayLabel(c.scoreUpdatedAt)}`,
    c.tags.length ? `Tags: ${c.tags.slice(0, 10).map((t) => safe(t, 40)).join(", ")}` : "",
    logs.length ? `Score changes:\n${logs.map((l) => `- ${l.points > 0 ? "+" : ""}${l.points} ${safe(l.reason, 80)} (${dayLabel(l.createdAt)})`).join("\n")}` : "",
    `Last activity ${dayLabel(c.lastActivityAt)} · next activity ${dayLabel(c.nextActivityAt)}`,
    deals.length ? `Deals: ${deals.map((d) => `${safe(d.title, 80)} ${baht(d.valueSatang)} ${d.kind} (${safe(d.stage?.name ?? "-", 40)})`).join(" · ")}` : "Deals: none",
    acts.length ? `Recent activities:\n${acts.map((x) => `- ${x.type} ${dayLabel(x.startAt ?? x.dueAt)} ${safe(x.title, 120)}${x.doneAt ? "" : " (open)"}`).join("\n")}` : "",
  ];
  return { facts: lines.filter(Boolean).join("\n"), kbIds: [], targetType: "CrmContact", targetId: c.id };
}

async function companyFacts(scope: { tenantId: string; systemId: string }, a: Actor, companyId: string, kind: AssistKind): Promise<Built> {
  // 🔴 ไม่อ่าน taxId/phone/email/website ของบริษัท (ไม่ต้องใช้ในการสรุป และห้ามออกจากเครื่อง)
  const c = await companiesSvc.factsForAssist(scope, a, companyId);
  if (!c) throw fail("NOT_FOUND", MSG.company);
  const dealsWhere = await dealWhere(scope, a);
  const [open, won, acts] = await Promise.all([
    prisma.crmDeal.findMany({ where: { AND: [dealsWhere, { companyId: c.id, kind: "OPEN", archivedAt: null }] }, select: { title: true, valueSatang: true, expectedCloseAt: true, stage: { select: { name: true } } }, orderBy: { expectedCloseAt: "asc" }, take: 8 }),
    prisma.crmDeal.findMany({
      where: { AND: [dealsWhere, { companyId: c.id, kind: "WON" }] },
      select: { title: true, valueSatang: true, closedAt: true, lines: { select: { name: true, qty: true, unitPriceSatang: true }, take: 10 } },
      orderBy: { closedAt: "desc" },
      take: kind === "company.upsell" ? 10 : 5,
    }),
    prisma.crmActivity.findMany({ where: { AND: [await activityWhere(scope, a), { companyId: c.id }] }, select: { type: true, title: true, startAt: true, dueAt: true }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const lines = [
    `Company: ${safe(c.name)}${c.industry ? ` · industry ${safe(c.industry, 60)}` : ""}${c.size ? ` · size ${c.size}` : ""}${c.employeeCount ? ` · ${c.employeeCount} staff` : ""}`,
    `Lifecycle ${c.lifecycleStage} · open deals ${c.openDealCount} · won value ${baht(c.wonValueSatang)} · outstanding ${baht(c.outstandingSatang)} · last activity ${dayLabel(c.lastActivityAt)}`,
    c.tags.length ? `Tags: ${c.tags.slice(0, 10).map((t) => safe(t, 40)).join(", ")}` : "",
    open.length ? `Open deals:\n${open.map((d) => `- ${safe(d.title, 100)} ${baht(d.valueSatang)} (${safe(d.stage?.name ?? "-", 40)}) close ${dayLabel(d.expectedCloseAt)}`).join("\n")}` : "Open deals: none",
    won.length
      ? `Purchase history (won deals):\n${won.map((d) => `- ${dayLabel(d.closedAt)} ${safe(d.title, 100)} ${baht(d.valueSatang)}${d.lines.length ? `: ${d.lines.map((l) => `${safe(l.name, 80)} × ${Number(l.qty)}`).join(", ")}` : ""}`).join("\n")}`
      : "Purchase history: none",
    acts.length ? `Recent activities:\n${acts.map((x) => `- ${x.type} ${dayLabel(x.startAt ?? x.dueAt)} ${safe(x.title, 120)}`).join("\n")}` : "",
  ];
  return { facts: lines.filter(Boolean).join("\n"), kbIds: [], targetType: "CrmCompany", targetId: c.id };
}

function atRiskFacts(r: AtRiskResult): string {
  return [
    `Month ${r.month} · at-risk deals ${r.items.length}`,
    ...r.items
      .slice(0, 30)
      .map((x) => `- ${safe(x.title, 100)} · ${x.companyName ? safe(x.companyName, 80) : "-"} · ${baht(x.valueSatang)} · close ${x.expectedCloseAt ? dayLabel(new Date(x.expectedCloseAt)) : "-"} · ${x.reasons.map((k) => AT_RISK_REASON_LABEL[k]).join(", ")}`),
  ].join("\n");
}

/** อ่าน JSON จากคำตอบของโมเดล (มักห่อ ```json) — อ่านไม่ได้ = ข้อความทั้งก้อนเป็น `text` (addendum ข้อ 2) */
function parseReply(raw: unknown): Record<string, string> {
  const s = String(raw ?? "").trim();
  const m = /\{[\s\S]*\}/.exec(s);
  if (m) {
    try {
      const v: unknown = JSON.parse(m[0]);
      if (isObj(v)) {
        const out: Record<string, string> = {};
        for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x.trim();
        return out;
      }
    } catch {
      /* ไม่ใช่ JSON — ใช้ทั้งข้อความ */
    }
  }
  return s ? { text: s } : {};
}
const pick = (o: Record<string, string>, ...keys: string[]): string => {
  for (const k of keys) if (o[k]) return o[k]!;
  return "";
};

// ── ธงก่อน (AUDIT-CLASS X3 · แบบ C2.4 transcribeCall): ข้อเสนอ PENDING = ธง · สร้างใต้ advisory lock ในธุรกรรมสั้นก่อนเรียกโมเดล ──
const WORKING = "WORKING#";
const workingSince = (note: unknown): number | null => {
  const s = typeof note === "string" && note.startsWith(WORKING) ? note.slice(WORKING.length) : "";
  const n = Number(s);
  return s && Number.isFinite(n) ? n : null;
};

type Claim = { id: string; mine: boolean; summary: string | null };

/**
 * รีวิว C3.4 S2 (ค): `conversationId` ของข้อเสนอ = `<prefix>:<สุ่ม 128 บิต>` — เดาไม่ได้ (ทางอ่านรายการของแชท
 * `listPendingProposalsAction(conversationId)` จึงไม่เห็นใบของคนอื่น) · หาใบเดิมด้วย prefix ใต้ advisory lock ต่อ prefix เดียวกัน
 */
async function claimProposal(
  tenantId: string,
  lock: string,
  convPrefix: string,
  kind: string,
  build: () => { summary: string; payload: Record<string, unknown>; working: boolean },
  /** ใบเดิมยังใช้ต่อได้ไหม (รีวิว C3.4 รอบ 2 N4: ใบที่อ้างดีลซึ่งคนกดมองไม่เห็นแล้ว = ปิดแล้วออกใบใหม่ ไม่ใช้ซ้ำไปจนหมดอายุ) */
  reusable: (payload: unknown) => boolean = () => true,
): Promise<Claim> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, lock);
    const open = await tx.aiProposal.findFirst({
      where: { tenantId, kind, conversationId: { startsWith: `${convPrefix}:` }, status: "PENDING", expiresAt: { gt: new Date() } },
      select: { id: true, summary: true, resultNote: true, payload: true },
      orderBy: { createdAt: "desc" },
    });
    if (open && !reusable(open.payload)) {
      await tx.aiProposal.updateMany({ where: { id: open.id, tenantId, status: "PENDING" }, data: { status: "EXPIRED", resultNote: "STALE_SCOPE" } });
    } else if (open) {
      const since = workingSince(open.resultNote);
      if (since === null || Date.now() - since <= ASSIST_WORKING_STALE_MS) return { id: open.id, mine: false, summary: open.summary };
      // ธงค้างจากโพรเซสที่ตาย — ปิดเป็น EXPIRED (เก็บไว้ตรวจย้อนหลัง) แล้วจองใหม่
      await tx.aiProposal.updateMany({ where: { id: open.id, tenantId, status: "PENDING" }, data: { status: "EXPIRED", resultNote: "STALE" } });
    }
    const b = build();
    const row = await tx.aiProposal.create({
      data: {
        tenantId,
        conversationId: `${convPrefix}:${randomBytes(16).toString("hex")}`,
        kind,
        risk: "NORMAL",
        summary: b.summary,
        payload: b.payload as Prisma.InputJsonValue,
        resultNote: b.working ? `${WORKING}${Date.now()}` : null,
        expiresAt: new Date(Date.now() + ASSIST_PROPOSAL_TTL_MS),
      },
      select: { id: true },
    });
    return { id: row.id, mine: true, summary: b.summary };
  });
}

/** เพดานงานต่อข้อเสนอ "สร้างงานติดตาม" หนึ่งใบ */
const ASSIST_TASKS_MAX = 200;

const releaseClaim = (tenantId: string, id: string) => prisma.aiProposal.deleteMany({ where: { id, tenantId, status: "PENDING" } }).catch(() => null);

/** วันถัดไป 09:00 เวลาไทยของขณะ `ms` (กำหนดส่งงานติดตามของข้อเสนอหน้าแรก) */
function nextThaiNine(ms: number): Date {
  const start = Math.floor((ms + TH_OFFSET_MS) / DAY_MS) * DAY_MS - TH_OFFSET_MS; // 00:00 ไทยของวันนี้
  return new Date(start + DAY_MS + 9 * 3600_000);
}

/**
 * ปุ่มผู้ช่วย AI ในหน้า 1 ครั้ง (addendum ข้อ 2 · ข้อ 8)
 *   deal.nextStep → ข้อเสนอ `crm.deals.nextStep.set` (payload รูปเดียวกับ runCrmTool + requestedByUserId) · ไม่เขียนดีลเอง
 *   deal.draftEmail → ร่างเท่านั้น (ไม่มีแถวอีเมล ไม่มีข้อเสนอส่ง)
 *   home.atRisk → ตารางดีลเสี่ยง + ข้อเสนอ `crm.assist.tasks` ใบเดียวต่อ (ระบบ · คนกด · เดือนไทย) ที่ยังรออยู่
 */
export async function runAssist(ctx: AiBridgeCtx, actor: Actor, input: RunAssistInput, deps: RunAssistDeps = {}): Promise<AssistResultView> {
  const kind = input?.kind;
  if (!isAssistKind(kind)) throw fail("VALIDATION", MSG.kind);
  const { a, sys } = await enter(ctx, actor);
  const scope = scopeOf(sys);
  const now = nowOf(input?.now);
  const tenantId = sys.tenantId;

  // ── 1) การมองเห็นของเป้าหมาย (NOT_FOUND ก่อนเรียกหรือหักอะไรทั้งนั้น) ──
  let built: Built | null = null;
  let risk: AtRiskResult | null = null;
  const id = str(input?.id);
  if (kind.startsWith("deal.")) built = await dealFacts(scope, a, id ?? "", kind);
  else if (kind.startsWith("contact.")) built = await contactFacts(scope, a, id ?? "");
  else if (kind.startsWith("company.")) built = await companyFacts(scope, a, id ?? "", kind);
  else risk = await atRiskDeals(scope, a, { now });
  // ข้อเสนอที่ใบนี้สร้างต้องเป็นของที่คนกดยืนยันเองได้ (ไม่งั้นเป็นข้อเสนอที่ไม่มีใครในหน้านี้กดได้)
  if (kind === "deal.nextStep" && !crmCan(a, "crm.deal.update")) throw fail("FORBIDDEN", crmForbiddenMessage("crm.deal.update"));

  // หน้าแรกที่ไม่มีดีลเสี่ยง = ตอบทันที (ไม่เรียกโมเดล ไม่หัก ไม่มีข้อเสนอ)
  if (risk && risk.items.length === 0) {
    return { kind, text: `เดือนนี้ (${risk.month}) ยังไม่มีดีลที่เข้าเกณฑ์เสี่ยงในส่วนที่คุณเห็น`, items: [], proposalId: null };
  }

  // ── 2) ผู้ให้บริการ → เครดิต ──
  const ai = deps?.ai ?? resolveProvider("fast");
  if (!ai) throw fail("NOT_CONFIGURED", MSG.noAi);
  if (!(await canSpend(tenantId))) throw fail("NO_CREDIT", MSG.noCredit);

  // ── 3) ธงก่อน (ข้อเสนอที่ยังรออยู่ = ใช้ใบเดิม ไม่เรียกโมเดลซ้ำ ไม่หักซ้ำ) ──
  let claim: Claim | null = null;
  const requester = a.userId;
  if (kind === "home.atRisk" && risk && crmCan(a, "crm.activity.create")) {
    const r = risk;
    const due = nextThaiNine(Date.now()).toISOString();
    // AUDIT-CLASS X8: payload = id ล้วน (ไม่มีชื่อดีล/ชื่อคน/มูลค่า) · ผู้ดูแลของงาน = ผู้ดูแลดีล ณ ตอนนี้ (ตอนยืนยันอ่านใหม่อีกครั้ง)
    // รีวิว C3.4 N3: เพดานต่อข้อเสนอตัดที่ "ตอนสร้าง" และบอกในสรุป — ตอนยืนยันสร้างครบทุกใบใน payload (ไม่ตัดเงียบ)
    const capped = r.items.slice(0, ASSIST_TASKS_MAX);
    const over = r.items.length - capped.length;
    claim = await claimProposal(tenantId, `crm:assist:tasks:${sys.id}:${requester}:${r.month}`, `crm:assist:tasks:${sys.id}:${requester}:${r.month}`, ASSIST_TASKS_KIND, () => ({
      summary: `สร้างงานติดตาม ${capped.length.toLocaleString("th-TH")} งาน · มอบผู้ดูแลดีลเดิม · กำหนดพรุ่งนี้ 09:00${over > 0 ? ` (ดีลเสี่ยงทั้งหมด ${r.items.length.toLocaleString("th-TH")} ดีล — ข้อเสนอหนึ่งใบสร้างได้ไม่เกิน ${ASSIST_TASKS_MAX} งาน)` : ""}`,
      payload: { systemId: sys.id, month: r.month, requestedByUserId: requester, items: capped.map((x) => ({ dealId: x.dealId, ownerUserId: x.ownerUserId, dueAt: due })) },
      working: false,
    }), (pl) => {
      // ใช้ใบเดิมได้เฉพาะเมื่อทุกดีลในใบยังอยู่ในชุดเสี่ยงที่คนกดมองเห็นตอนนี้
      const now = new Set(r.items.map((x) => x.dealId));
      const its = isObj(pl) && Array.isArray(pl.items) ? pl.items : [];
      return its.every((it) => isObj(it) && now.has(String(it.dealId ?? "")));
    });
    if (!claim.mine) {
      return { kind, text: "ผู้ช่วย AI สรุปดีลเสี่ยงของเดือนนี้ไว้แล้ว — ตรวจตารางและข้อเสนอด้านล่าง", items: r.items, proposalId: claim.id, proposalSummary: claim.summary, reused: true };
    }
  } else if (kind === "deal.nextStep" && built) {
    const dealId = built.targetId;
    claim = await claimProposal(tenantId, `crm:assist:next:${sys.id}:${dealId}:${requester}`, `crm:assist:next:${sys.id}:${dealId}:${requester}`, NEXT_STEP_KIND, () => ({
      summary: "ผู้ช่วย AI กำลังเสนอขั้นถัดไปของดีลนี้",
      payload: { dealId, nextStep: "", opId: NEXT_STEP_OP_ID, input: { nextStep: "" }, params: { id: dealId }, systemId: sys.id, requestedByUserId: requester },
      working: true,
    }));
    if (!claim.mine) {
      const p = await prisma.aiProposal.findFirst({ where: { id: claim.id, tenantId }, select: { payload: true, resultNote: true } });
      const ns = isObj(p?.payload) ? String(p!.payload.nextStep ?? "") : "";
      if (!ns || workingSince(p?.resultNote) !== null) throw fail("CONFLICT", MSG.working);
      return { kind, text: `มีข้อเสนอขั้นถัดไปของดีลนี้รออยู่แล้ว: ${ns}`, nextStep: ns, proposalId: claim.id, proposalSummary: claim.summary, reused: true };
    }
  }

  // ── 4) เรียกโมเดลครั้งเดียว ──
  const facts = risk ? atRiskFacts(risk) : built!.facts;
  const messages: AiChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Task: ${ASSIST_KIND_LABEL[kind]}\n${FORMAT[kind]}\n\nFacts:\n${facts}` },
  ];
  let reply: Awaited<ReturnType<AiProvider["chat"]>>;
  try {
    reply = await ai.chat(messages, { maxTokens: kind === "deal.draftEmail" ? 900 : 500 });
  } catch {
    if (claim?.mine) await releaseClaim(tenantId, claim.id);
    throw fail("AI_FAILED", MSG.aiFailed);
  }
  const o = parseReply(reply?.text);
  const text = pick(o, kind === "contact.closingMessage" ? "message" : kind.endsWith("summary") ? "summary" : "text", "text", "summary", "message", "body");
  const nextStep = pick(o, "nextStep").slice(0, 300);
  if (kind === "deal.nextStep" && !nextStep) {
    if (claim?.mine) await releaseClaim(tenantId, claim.id);
    throw fail("AI_FAILED", MSG.noNextStep);
  }
  if (!text && !nextStep && !o.body) {
    if (claim?.mine) await releaseClaim(tenantId, claim.id);
    throw fail("AI_FAILED", MSG.aiFailed);
  }

  // ── 5) เติมข้อเสนอขั้นถัดไป (เฉพาะใบที่ยัง PENDING ของเรา) ──
  let applied = true;
  if (kind === "deal.nextStep" && claim && built) {
    const dealId = built.targetId;
    const u = await prisma.aiProposal.updateMany({
      where: { id: claim.id, tenantId, status: "PENDING" },
      data: {
        summary: `ตั้งขั้นถัดไปของดีล · ขั้นถัดไป: ${nextStep.length > 60 ? `${nextStep.slice(0, 60)}…` : nextStep}`,
        payload: { dealId, nextStep, opId: NEXT_STEP_OP_ID, input: { nextStep }, params: { id: dealId }, systemId: sys.id, requestedByUserId: requester } as Prisma.InputJsonValue,
        resultNote: null,
      },
    });
    applied = u.count === 1;
  }

  // ── 6) หักเครดิตครั้งเดียว (note = id ล้วน · AUDIT-CLASS X8) ──
  await chargeUsageSafe(
    { tenantId },
    {
      source: "CRM_ASSIST",
      model: String(reply?.model ?? "unknown"),
      tokensIn: Number(reply?.tokensIn ?? 0),
      tokensOut: Number(reply?.tokensOut ?? 0),
      userId: requester,
      note: `crm.assist.${kind}#${built?.targetId ?? sys.id}`,
    },
  );
  await audit({ tenantId, systemId: sys.id, actorUserId: requester }, "crm.ai.assist", built?.targetType ?? "AppSystem", built?.targetId ?? sys.id, {
    kind,
    proposalId: claim?.id ?? null,
    kbArticleIds: built?.kbIds ?? [],
    items: risk?.items.length ?? null,
  });
  if (!applied) throw fail("CONFLICT", MSG.taken);

  const view: AssistResultView = { kind, text: text || o.body || nextStep, proposalId: claim?.id ?? null, reused: false };
  if (kind === "deal.draftEmail") {
    view.subject = pick(o, "subject").slice(0, 200);
    view.body = pick(o, "body", "text").slice(0, 8000);
    view.text = view.body || text;
  }
  if (kind === "deal.nextStep") view.nextStep = nextStep;
  if (risk) view.items = risk.items;
  if (claim) view.proposalSummary = kind === "deal.nextStep" ? `ตั้งขั้นถัดไปของดีล · ขั้นถัดไป: ${nextStep}` : claim.summary;
  if (built?.kbIds.length) view.kbArticleIds = built.kbIds;
  return view;
}

// ═════════════════════════ ประตูข้อเสนอ (ยืนยัน / ยกเลิก) ═════════════════════════

const LEGACY_LEAD_KIND = "crm_create_lead";
const CALL_AI_KIND = "crm.activity.ai_fill";

/** ข้อเสนอนี้ต้องผ่าน "ประตู CRM" ไหม — `crm.*` ทุกตัว + `crm_create_lead` ที่มี systemId (นามบัตร · C2.4) */
export function isCrmDoorKind(kind: string, payload: unknown): boolean {
  if (typeof kind !== "string") return false;
  if (kind.startsWith("crm.")) return true;
  return kind === LEGACY_LEAD_KIND && isObj(payload) && typeof payload.systemId === "string" && payload.systemId.length > 0;
}

/** คีย์สิทธิ์ของ kind (null = kind ที่ประตูนี้ไม่รู้จัก ⇒ ปฏิเสธเสมอ) */
function keyOfKind(kind: string): string | null {
  if (kind === ASSIST_TASKS_KIND) return "crm.activity.create";
  if (kind === LEGACY_LEAD_KIND) return "crm.contact.create";
  if (kind === CALL_AI_KIND) return "crm.activity.create";
  return crmKindAccess()[kind]?.action ?? null;
}

type PayloadIds = { deals: string[]; contacts: string[]; companies: string[]; activities: string[]; records: string[]; enrollments: string[]; parents: string[] };

/**
 * id ของดีล/ผู้ติดต่อ/บริษัท/กิจกรรม/รายการวัตถุ/การลงทะเบียนลำดับ ทุกตัวที่ payload อ้าง — บนสุด · `input.*` · `items[]`
 * (รีวิว C3.4 N1: + recordId · customRecordId · enrollmentId ⇒ ยกเลิกข้อเสนอ crm_update_record / crm_stop_sequence ต้องมองเห็นเป้าหมายด้วย)
 */
function idsOfPayload(p: Record<string, unknown>): PayloadIds {
  const sets = { deals: new Set<string>(), contacts: new Set<string>(), companies: new Set<string>(), activities: new Set<string>(), records: new Set<string>(), enrollments: new Set<string>(), parents: new Set<string>() };
  const add = (set: Set<string>, v: unknown) => {
    if (typeof v === "string" && v.trim()) set.add(v.trim());
  };
  const scan = (o: Record<string, unknown>) => {
    add(sets.deals, o.dealId);
    add(sets.contacts, o.contactId);
    add(sets.companies, o.companyId);
    add(sets.activities, o.activityId);
    add(sets.records, o.recordId);
    add(sets.records, o.customRecordId);
    add(sets.enrollments, o.enrollmentId);
    add(sets.parents, o.parentId); // รีวิว C3.4 รอบ 2 N3: แม่ของรายการวัตถุ (crm_create_record) — ผู้ติดต่อ/บริษัท/ดีล
  };
  scan(p);
  if (isObj(p.input)) scan(p.input);
  if (Array.isArray(p.items)) for (const it of p.items) if (isObj(it)) add(sets.deals, it.dealId);
  return { deals: [...sets.deals], contacts: [...sets.contacts], companies: [...sets.companies], activities: [...sets.activities], records: [...sets.records], enrollments: [...sets.enrollments], parents: [...sets.parents] };
}

type DoorRow = { id: string; kind: string; status: string; payload: Record<string, unknown>; expiresAt: Date; resultNote: string | null; risk: string };

/**
 * "คนที่ยืนยันได้" (addendum ข้อ 9): ร้านเดียวกัน · payload.systemId = ระบบของ ctx · มีคีย์ของ kind · มองเห็นทุก id ที่ payload อ้าง
 * AUDIT-CLASS X1/X9: ข้อเสนอของร้าน/ระบบอื่น = NOT_FOUND (ไม่บอกว่ามีอยู่) · ไม่มีคีย์ = FORBIDDEN · มองไม่เห็นบางดีล = FORBIDDEN
 */
async function loadDoorRow(ctx: AiBridgeCtx, actor: Actor, proposalId: string): Promise<{ a: Actor; sys: Sys; row: DoorRow }> {
  const { a, sys } = await enter(ctx, actor);
  const id = str(proposalId);
  const raw = id ? await prisma.aiProposal.findFirst({ where: { id, tenantId: sys.tenantId }, select: { id: true, kind: true, status: true, payload: true, expiresAt: true, resultNote: true, risk: true } }) : null;
  if (!raw || !isCrmDoorKind(raw.kind, raw.payload)) throw fail("NOT_FOUND", MSG.proposal);
  const payload = isObj(raw.payload) ? raw.payload : {};
  if (str(payload.systemId) !== sys.id) throw fail("NOT_FOUND", MSG.proposal);
  const row: DoorRow = { id: raw.id, kind: raw.kind, status: raw.status, payload, expiresAt: raw.expiresAt, resultNote: raw.resultNote, risk: String(raw.risk) };
  const key = keyOfKind(row.kind);
  if (!key || !crmCan(a, key)) throw fail("FORBIDDEN", MSG.cannotAct);
  const scope = scopeOf(sys);
  const ids = idsOfPayload(payload);
  const visible = async (n: number, total: number) => n === total;
  // รีวิว C3.4 รอบ 2 N4: ข้อเสนอ "สร้างงานติดตาม" **ของคนกดเอง** ที่มีดีลซึ่งเขามองไม่เห็นแล้ว (ดีลย้ายทีมระหว่างรอ) = ตัดดีลนั้นออก
  //   ไม่ล็อกทั้งใบ · ใบของ "คนอื่น" ยังต้องมองเห็นครบทุกดีลเหมือนเดิม (addendum ข้อ 9 · X9.1: thana แตะใบของผู้จัดการที่มีดีลกระบี่ไม่ได้)
  if (row.kind === ASSIST_TASKS_KIND && str(payload.requestedByUserId) === a.userId && ids.deals.length) {
    const seen = new Set((await prisma.crmDeal.findMany({ where: { AND: [await dealWhere(scope, a), { id: { in: ids.deals } }] }, select: { id: true } })).map((d) => d.id));
    const items = (Array.isArray(payload.items) ? payload.items : []).filter((it) => isObj(it) && seen.has(String(it.dealId ?? "")));
    if (items.length === 0) throw fail("FORBIDDEN", "ดีลในข้อเสนอนี้ไม่อยู่ในส่วนที่คุณมองเห็นแล้ว — กดปุ่มผู้ช่วยใหม่เพื่อสร้างข้อเสนอใหม่");
    row.payload = { ...payload, items };
    ids.deals = [...seen];
  }
  if (ids.deals.length && !(await visible(await prisma.crmDeal.count({ where: { AND: [await dealWhere(scope, a), { id: { in: ids.deals } }] } }), ids.deals.length))) throw fail("FORBIDDEN", MSG.cannotAct);
  if (ids.contacts.length && !(await visible(await prisma.crmContact.count({ where: { AND: [await contactWhere(scope, a), { id: { in: ids.contacts } }] } }), ids.contacts.length))) throw fail("FORBIDDEN", MSG.cannotAct);
  if (ids.companies.length && !(await visible(await companiesSvc.countVisibleByIds(scope, a, ids.companies), ids.companies.length))) throw fail("FORBIDDEN", MSG.cannotAct);
  if (ids.activities.length && !(await visible(await prisma.crmActivity.count({ where: { AND: [await activityWhere(scope, a), { id: { in: ids.activities } }] } }), ids.activities.length))) throw fail("FORBIDDEN", MSG.cannotAct);
  if (ids.records.length && !(await visible(await prisma.customRecord.count({ where: await recordWhere(scope, a, { recordIds: ids.records }) }), ids.records.length))) throw fail("FORBIDDEN", MSG.cannotAct);
  if (ids.enrollments.length) {
    // การลงทะเบียนลำดับ = ของผู้ติดต่อ (และดีลถ้ามี) ⇒ ต้องมองเห็นทั้งสอง
    const ens = await prisma.crmSequenceEnrollment.findMany({ where: { id: { in: ids.enrollments }, tenantId: sys.tenantId }, select: { contactId: true, dealId: true } });
    if (ens.length !== ids.enrollments.length) throw fail("FORBIDDEN", MSG.cannotAct);
    const cIds = [...new Set(ens.map((e) => e.contactId))];
    const dIds = [...new Set(ens.map((e) => e.dealId).filter((x): x is string => !!x))];
    if (!(await visible(await prisma.crmContact.count({ where: { AND: [await contactWhere(scope, a), { id: { in: cIds } }] } }), cIds.length))) throw fail("FORBIDDEN", MSG.cannotAct);
    if (dIds.length && !(await visible(await prisma.crmDeal.count({ where: { AND: [await dealWhere(scope, a), { id: { in: dIds } }] } }), dIds.length))) throw fail("FORBIDDEN", MSG.cannotAct);
  }
  // รีวิว C3.4 รอบ 2 N3: parentId ที่เป็นผู้ติดต่อ/บริษัท/ดีลของระบบนี้ต้องมองเห็น · id ที่ไม่ใช่ของตาราง CRM (สมาชิก ฯลฯ) ให้ op ตรวจเองตอนยืนยัน
  for (const pid of ids.parents) {
    const own = { id: pid, tenantId: sys.tenantId, systemId: sys.id };
    if (await prisma.crmContact.count({ where: own })) {
      if (!(await prisma.crmContact.count({ where: { AND: [await contactWhere(scope, a), { id: pid }] } }))) throw fail("FORBIDDEN", MSG.cannotAct);
    } else if (await companiesSvc.countVisibleCompany(scope, null, pid)) {
      if (!(await companiesSvc.countVisibleCompany(scope, a, pid))) throw fail("FORBIDDEN", MSG.cannotAct);
    } else if (await prisma.crmDeal.count({ where: own })) {
      if (!(await prisma.crmDeal.count({ where: { AND: [await dealWhere(scope, a), { id: pid }] } }))) throw fail("FORBIDDEN", MSG.cannotAct);
    }
  }
  return { a, sys, row };
}

/** PENDING ที่หมดอายุแล้ว → EXPIRED (ปิดของเก่าไม่ให้ถูกกด) แล้วปฏิเสธ */
async function refuseIfExpired(tenantId: string, row: DoorRow): Promise<void> {
  if (row.status !== "PENDING") throw fail("CONFLICT", row.status === "EXPIRED" ? MSG.expired : MSG.taken);
  if (row.expiresAt.getTime() <= Date.now()) {
    await prisma.aiProposal.updateMany({ where: { id: row.id, tenantId, status: "PENDING" }, data: { status: "EXPIRED" } });
    throw fail("EXPIRED", MSG.expired);
  }
}

export type DoorResult = { ok: true; note: string; contactId?: string; taskIds?: string[] };

/**
 * ยืนยันข้อเสนอ CRM (ทางเดียว) — จอง PENDING→EXECUTED แบบอะตอมมิกก่อนลงมือ (AUDIT-CLASS X3: กดพร้อมกัน 10 ครั้ง = ทำครั้งเดียว)
 *   crm.assist.tasks → งาน TASK หนึ่งใบต่อดีล (ผู้ดูแล = ผู้ดูแลดีล ณ ตอนยืนยัน · กำหนด = dueAt ใน payload) · กุญแจกันซ้ำต่อ (ข้อเสนอ, ดีล)
 *   crm.<op>        → dispatchCrmKind ด้วยสิทธิ์ของคนกด (op ตรวจการมองเห็น/คีย์ซ้ำอีกชั้น) · op ชนิด danger ต้อง `confirm2x`
 *   crm_create_lead → calls.acceptLeadProposal (ผู้ติดต่อใหม่ · sourceDetail.via = card-scan · ผูกบริษัทที่จับคู่ได้)
 */
export type ConfirmEdits = { nextStep?: string | null; dealIds?: string[] | null };

export async function confirmProposal(ctx: AiBridgeCtx, actor: Actor, proposalId: string, opts: { confirm2x?: boolean; edits?: ConfirmEdits | null } = {}): Promise<DoorResult> {
  const { a, sys, row } = await loadDoorRow(ctx, actor, proposalId);
  // ปุ่ม "แก้ไข" ของการ์ด (ภาพ 14 ซ้าย): คนกดแก้ได้เฉพาะ "ลดขอบเขต/แก้ถ้อยคำ" — ขั้นถัดไปเป็นข้อความใหม่ (≤ 300) · งานติดตามเลือกได้เฉพาะดีล
  //   ที่อยู่ในข้อเสนออยู่แล้ว (เพิ่มดีลใหม่ไม่ได้ ⇒ ด่านการมองเห็นข้างบนยังครอบทุกดีลที่จะถูกแตะ)
  const edits = opts?.edits ?? null;
  if (edits && row.kind === NEXT_STEP_KIND && typeof edits.nextStep === "string") {
    const ns = edits.nextStep.replace(/\s+/g, " ").trim().slice(0, 300);
    if (!ns) throw fail("VALIDATION", "ขั้นถัดไปต้องไม่ว่าง — พิมพ์สิ่งที่จะทำต่อ หรือกดยกเลิกข้อเสนอ");
    row.payload = { ...row.payload, nextStep: ns, input: { ...(isObj(row.payload.input) ? row.payload.input : {}), nextStep: ns } };
  }
  if (edits && row.kind === ASSIST_TASKS_KIND && Array.isArray(edits.dealIds)) {
    const keep = new Set(edits.dealIds.filter((x): x is string => typeof x === "string"));
    const items = Array.isArray(row.payload.items) ? row.payload.items.filter((it) => isObj(it) && keep.has(String(it.dealId ?? ""))) : [];
    if (items.length === 0) throw fail("VALIDATION", "เลือกดีลอย่างน้อย 1 ดีลก่อนสร้างงานติดตาม — หรือกดยกเลิกข้อเสนอ");
    row.payload = { ...row.payload, items };
  }
  const tenantId = sys.tenantId;
  const cctx = { tenantId, systemId: sys.id, actorUserId: a.userId };
  await refuseIfExpired(tenantId, row);
  if (workingSince(row.resultNote) !== null) throw fail("CONFLICT", MSG.working);

  if (row.kind === LEGACY_LEAD_KIND) {
    const calls = await import("./calls");
    const r = await calls.acceptLeadProposal(cctx, a, row.id);
    await audit(cctx, "crm.ai.proposal.confirm", "AiProposal", row.id, { kind: row.kind, contactId: r.contactId });
    return { ok: true, note: "เพิ่มผู้ติดต่อใหม่จากนามบัตรแล้ว", contactId: r.contactId };
  }
  if (row.kind === CALL_AI_KIND) {
    const calls = await import("./calls");
    await calls.acceptCallAiProposal(cctx, a, row.id, null);
    return { ok: true, note: "บันทึกสรุปสายลงกิจกรรมแล้ว" };
  }
  if (row.kind !== ASSIST_TASKS_KIND) {
    if (!isCrmKind(row.kind)) throw fail("FORBIDDEN", MSG.cannotAct);
    if ((row.risk === "DESTRUCTIVE" || crmDestructiveKinds().includes(row.kind)) && opts?.confirm2x !== true) throw fail("CONFLICT", MSG.confirm2x);
  }

  const claim = await prisma.aiProposal.updateMany({
    where: { id: row.id, tenantId, status: "PENDING", expiresAt: { gt: new Date() } },
    // ค่าที่คนกดแก้ถูกเก็บลงแถว (ประวัติตรงกับสิ่งที่ทำจริง) — ไม่มีการแก้ = payload เดิม
    data: { status: "EXECUTED", executedAt: new Date(), payload: row.payload as Prisma.InputJsonValue },
  });
  if (claim.count !== 1) throw fail("CONFLICT", MSG.taken);

  try {
    if (row.kind === ASSIST_TASKS_KIND) {
      const taskIds = await executeAssistTasks(cctx, a, row);
      const note = `สร้างงานติดตามแล้ว ${taskIds.length.toLocaleString("th-TH")} งาน`;
      await prisma.aiProposal.update({ where: { id: row.id }, data: { resultNote: note } });
      await audit(cctx, "crm.ai.proposal.confirm", "AiProposal", row.id, { kind: row.kind, tasks: taskIds.length });
      return { ok: true, note, taskIds };
    }
    const note = await dispatchCrmKind({ tenantId, systemId: sys.id, userId: a.userId, role: a.role === "CUSTOMER" ? "STAFF" : a.role, unitAccess: a.unitAccess, permissions: a.permissions, proposalId: row.id }, row.kind, row.payload);
    await prisma.aiProposal.update({ where: { id: row.id }, data: { resultNote: note.slice(0, 500) } });
    await audit(cctx, "crm.ai.proposal.confirm", "AiProposal", row.id, { kind: row.kind });
    return { ok: true, note };
  } catch (e) {
    const note = e instanceof Error && /[ก-๙]/.test(e.message) ? e.message.slice(0, 400) : "ทำรายการไม่สำเร็จ";
    // รีวิว C3.4 N3: งานติดตามล้มกลางทาง = คืนใบเป็น PENDING ให้กดใหม่ได้ (กุญแจกันซ้ำ `sourceRef` ต่อ (ข้อเสนอ, ดีล) ⇒ งานที่สร้างไปแล้วไม่ซ้ำ)
    //   kind อื่น (op เดียว) = FAILED ตามเดิมของ executeProposal
    const retryable = row.kind === ASSIST_TASKS_KIND;
    await prisma.aiProposal
      .updateMany({ where: { id: row.id, tenantId }, data: { status: retryable ? "PENDING" : "FAILED", executedAt: null, resultNote: note } })
      .catch(() => null);
    if (e instanceof AiBridgeError) throw e;
    throw fail("CONFLICT", note);
  }
}

async function executeAssistTasks(ctx: { tenantId: string; systemId: string; actorUserId: string }, a: Actor, row: DoorRow): Promise<string[]> {
  const activities = await import("./activities");
  const items = Array.isArray(row.payload.items) ? row.payload.items.filter(isObj) : [];
  const scope = { tenantId: ctx.tenantId, systemId: ctx.systemId };
  const out: string[] = [];
  for (const it of items) {
    const dealId = str(it.dealId);
    if (!dealId) continue;
    // รีวิว C3.4 N3: ดีลต้องยังเปิดอยู่และไม่ถูกเก็บ (ปิด/แพ้/เก็บไประหว่างรอ = ไม่ต้องติดตามแล้ว — ข้ามใบนั้น)
    const deal = await prisma.crmDeal.findFirst({ where: { AND: [await dealWhere(scope, a), { id: dealId, kind: "OPEN", archivedAt: null }] }, select: { id: true, title: true, ownerUserId: true } });
    if (!deal) continue;
    const due = typeof it.dueAt === "string" && Number.isFinite(Date.parse(it.dueAt)) ? it.dueAt : nextThaiNine(Date.now()).toISOString();
    const r = await activities.logActivity(
      ctx,
      a,
      { type: "TASK", title: `ติดตามดีลเสี่ยง: ${deal.title}`.slice(0, 300), dealId: deal.id, dueAt: due },
      // AUDIT-CLASS X4: กุญแจกันซ้ำต่อ (ข้อเสนอ, ดีล) — ยืนยันซ้ำ/ลองใหม่ไม่เกิดงานซ้ำ · ผู้ดูแลงาน = ผู้ดูแลดีล (อ่านจากฐาน ไม่ใช่จาก payload)
      { sourceRef: `crm.assist.tasks:${row.id}:${deal.id}`, ownerUserId: deal.ownerUserId ?? a.userId },
    );
    out.push(r.id);
  }
  return out;
}

/**
 * ยกเลิกข้อเสนอ CRM — ได้เฉพาะคนที่ "ยืนยันได้" (addendum ข้อ 9) · PENDING→REJECTED แบบอะตอมมิก · หมดอายุแล้ว = EXPIRED (ไม่ปลุกกลับ)
 * ข้อเสนอนามบัตรที่ถูกยกเลิก: ล้างชื่อ/เบอร์/อีเมลออกจาก payload ด้วย (AUDIT-CLASS X8 — แบบ rejectLeadProposal ของ C2.4)
 */
export async function cancelProposal(ctx: AiBridgeCtx, actor: Actor, proposalId: string): Promise<DoorResult> {
  const { a, sys, row } = await loadDoorRow(ctx, actor, proposalId);
  const tenantId = sys.tenantId;
  await refuseIfExpired(tenantId, row);
  const data: Prisma.AiProposalUpdateManyMutationInput =
    row.kind === LEGACY_LEAD_KIND ? { status: "REJECTED", payload: { systemId: sys.id } as Prisma.InputJsonValue, resultNote: "ทิ้งผลนี้" } : { status: "REJECTED" };
  const n = await prisma.aiProposal.updateMany({ where: { id: row.id, tenantId, status: "PENDING" }, data });
  if (n.count !== 1) throw fail("CONFLICT", MSG.taken);
  await audit({ tenantId, systemId: sys.id, actorUserId: a.userId }, "crm.ai.proposal.cancel", "AiProposal", row.id, { kind: row.kind, rejected: true });
  return { ok: true, note: "ยกเลิกข้อเสนอแล้ว" };
}

/**
 * ทางเข้าของ "ประตูทั่วไป" (แชทผู้ช่วย · แอปมือถือ) ที่รู้แค่ id ข้อเสนอ: ข้อเสนอ CRM → ยกเลิก/ยืนยันผ่านประตูนี้ด้วยสิทธิ์ของคนกด
 * (ระบบ = payload.systemId ซึ่งประตูตรวจว่าเป็นระบบ CRM ของร้านนี้) · ไม่ใช่ข้อเสนอ CRM = `{ handled: false }` ให้ผู้เรียกทำทางเดิม
 */
export async function cancelProposalById(tenantId: string, actor: Actor, proposalId: string): Promise<{ handled: boolean; ok: boolean; note: string }> {
  const row = await prisma.aiProposal.findFirst({ where: { id: String(proposalId ?? ""), tenantId }, select: { kind: true, payload: true } });
  if (!row || !isCrmDoorKind(row.kind, row.payload)) return { handled: false, ok: false, note: "" };
  const systemId = isObj(row.payload) ? str(row.payload.systemId) : null;
  if (!systemId) return { handled: true, ok: false, note: MSG.proposal };
  try {
    const r = await cancelProposal({ tenantId, systemId, actorUserId: actor.userId }, actor, proposalId);
    return { handled: true, ok: true, note: r.note };
  } catch (e) {
    return { handled: true, ok: false, note: e instanceof Error && /[ก-๙]/.test(e.message) ? e.message : MSG.cannotAct };
  }
}

export async function confirmProposalById(tenantId: string, actor: Actor, proposalId: string, opts: { confirm2x?: boolean } = {}): Promise<{ handled: boolean; ok: boolean; note: string }> {
  const row = await prisma.aiProposal.findFirst({ where: { id: String(proposalId ?? ""), tenantId }, select: { kind: true, payload: true } });
  if (!row || !isCrmDoorKind(row.kind, row.payload)) return { handled: false, ok: false, note: "" };
  const systemId = isObj(row.payload) ? str(row.payload.systemId) : null;
  if (!systemId) return { handled: true, ok: false, note: MSG.proposal };
  try {
    const r = await confirmProposal({ tenantId, systemId, actorUserId: actor.userId }, actor, proposalId, opts);
    return { handled: true, ok: true, note: r.note };
  } catch (e) {
    return { handled: true, ok: false, note: e instanceof Error && /[ก-๙]/.test(e.message) ? e.message : MSG.cannotAct };
  }
}

// ═════════════════════════ ห้องทีม (MEETING) ═════════════════════════

type MeetingFacade = {
  postSystemMessage: (
    input: { tenantId: string; systemId: string; channelId: string; body: string; author?: string | null },
    tx?: Tx,
  ) => Promise<{ ok: true; id: string } | { ok: false; reason: string }>;
  listRoomOptions: (tenantId: string, viewerUserId: string) => Promise<{ meetingSystemId: string; systemName: string; channelId: string; channelName: string }[]>;
  liveChannelIds: (tenantId: string, ids: string[]) => Promise<string[]>;
};
async function meeting(): Promise<MeetingFacade> {
  return (await import("@/lib/modules/meeting")) as unknown as MeetingFacade;
}

/** `settings.crm.teamRooms` (ค่าเพี้ยน = ข้ามแถวนั้น) */
export function teamRoomsOf(settings: unknown): Record<string, TeamRoom> {
  const crm = isObj(settings) && isObj(settings.crm) ? settings.crm : null;
  const raw = crm && isObj(crm.teamRooms) ? crm.teamRooms : null;
  const out: Record<string, TeamRoom> = {};
  if (!raw) return out;
  for (const [teamId, v] of Object.entries(raw)) {
    if (!isObj(v)) continue;
    const meetingSystemId = str(v.meetingSystemId);
    const channelId = str(v.channelId);
    if (meetingSystemId && channelId) out[teamId] = { meetingSystemId, channelId };
  }
  return out;
}

class RoomRefused extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "RoomRefused";
  }
}

/**
 * ปักธง + โพสต์ใน tx เดียว (addendum ข้อ 5 · H5 "ธงก่อน แล้วค่อยโพสต์"): ล็อกต่อคีย์ → ธงมีแล้ว = จบ (ซ้ำ/พร้อมกัน = ข้อความเดียว) →
 * แถวธง (OutboxEvent `crm.teamroom.posted` · payload id ล้วน) → โพสต์ผ่าน facade MEETING · ห้องถูกปฏิเสธ = ย้อนทั้งคู่ (ไม่มีธง ⇒ รอบหลังโพสต์ได้)
 */
async function postFlagged(input: { tenantId: string; crmSystemId: string; key: string; room: TeamRoom; body: string; payload: Record<string, unknown>; warnOnceKey?: string }): Promise<"posted" | "dup" | "refused"> {
  const M = await meeting();
  try {
    return await prisma.$transaction(async (tx) => {
      await lockKey(tx, input.key);
      const had = await tx.outboxEvent.findUnique({ where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.key } }, select: { id: true } });
      if (had) return "dup" as const;
      await emitOutbox(tx, { tenantId: input.tenantId, systemId: input.crmSystemId, type: CRM_TEAMROOM_EVENT, idempotencyKey: input.key, payload: { ...input.payload, channelId: input.room.channelId, meetingSystemId: input.room.meetingSystemId } });
      const r = await M.postSystemMessage({ tenantId: input.tenantId, systemId: input.room.meetingSystemId, channelId: input.room.channelId, body: input.body, author: CRM_TEAMROOM_AUTHOR }, tx);
      if (!r.ok) throw new RoomRefused(r.reason);
      return "posted" as const;
    });
  } catch (e) {
    if (e instanceof RoomRefused) {
      // รีวิว C3.4 รอบ 2 N1: ดิจิสต์ (รอบเก็บตกรายชั่วโมง) ที่เจอห้องใช้ไม่ได้ เตือนได้ **ครั้งเดียวต่อ (ระบบ·ทีม·วันไทย)** —
      //   กุญแจอยู่หัว `detail` ของ OpsEvent ของร้านนั้นเอง (ไม่มีตารางธงเพิ่ม · ลบไปพร้อมร้าน) · แข่งกันสองรอบ = อย่างมากซ้ำหนึ่งแถว
      if (input.warnOnceKey) {
        const had = await prisma.opsEvent.findFirst({ where: { tenantId: input.tenantId, source: "crm.teamroom", detail: { startsWith: `${input.warnOnceKey} ` } }, select: { id: true } });
        if (had) return "refused";
      }
      await logOps("WARN", "crm.teamroom", "โพสต์เข้าห้องทีมไม่สำเร็จ — ห้องที่ผูกไว้ใช้ไม่ได้", {
        tenantId: input.tenantId,
        detail: `${input.warnOnceKey ? `${input.warnOnceKey} ` : ""}system:${input.crmSystemId} room:${input.room.meetingSystemId}/${input.room.channelId} reason:${e.reason} ${String(input.payload.kind ?? "")}:${String(input.payload.dealId ?? input.payload.contactId ?? input.payload.teamId ?? "")}`,
      });
      return "refused";
    }
    throw e;
  }
}

async function v2System(tenantId: string, systemId: string): Promise<Sys | null> {
  const sys = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "CRM" }, select: { id: true, tenantId: true, settings: true } });
  if (!sys || parseCrmSettings(sys.settings).uiVersion !== 2) return null;
  return sys;
}

/** ห้องของทีม — ร้านที่ไม่ได้ผูกห้องเลย = null เงียบ ๆ · ผูกบางทีมแต่ทีมนี้ไม่มี/ไม่มีทีม = WARN (ids ล้วน) แล้ว null */
async function roomFor(sys: Sys, teamId: string | null, what: string): Promise<TeamRoom | null> {
  const rooms = teamRoomsOf(sys.settings);
  if (Object.keys(rooms).length === 0) return null;
  const room = teamId ? rooms[teamId] ?? null : null;
  if (!room) {
    await logOps("WARN", "crm.teamroom", teamId ? "ทีมนี้ยังไม่ได้ผูกห้องแชท — ไม่ได้แจ้งห้องทีม" : "รายการนี้ไม่มีทีม — ไม่ได้แจ้งห้องทีม", {
      tenantId: sys.tenantId,
      detail: `system:${sys.id} team:${teamId ?? "-"} ${what}`,
    });
  }
  return room;
}

type Evt = { id: string; tenantId: string; type: string; payload: unknown; systemId: string | null };

/** ของแถมของ `crm.deal.won`: แจ้งห้องของทีมดีล (ข้อความเดียวต่อ event · ห้องใช้ไม่ได้ = WARN ไม่ throw · uiVersion 1 = ไม่ทำ) */
export async function onDealWonTeamRoom(evt: Evt): Promise<void> {
  const p = isObj(evt?.payload) ? evt.payload : {};
  const dealId = str(p.dealId);
  if (!dealId || !evt?.tenantId || !evt.id) return;
  const deal = await prisma.crmDeal.findFirst({ where: { id: dealId, tenantId: evt.tenantId }, select: { id: true, systemId: true, title: true, valueSatang: true, teamId: true, contact: NAME_SEL, contacts: MORE_SEL } });
  if (!deal) return;
  const sys = await v2System(evt.tenantId, deal.systemId);
  if (!sys) return;
  const room = await roomFor(sys, deal.teamId, `won deal:${deal.id}`);
  if (!room) return;
  // AUDIT-CLASS X8: ชื่อดีล (ปิดเบอร์/อีเมลที่อาจพิมพ์ไว้) + มูลค่า + ลิงก์ — ไม่มีเบอร์/อีเมล/เลขภาษีของลูกค้า
  const body = `🎉 ปิดดีลได้แล้ว: ${safe(withoutName(deal.title, deal.contact, deal.contacts))} · ${baht(deal.valueSatang)}\nเปิดดู: /app/sys/${sys.id}/crm/deals/${deal.id}`;
  await postFlagged({ tenantId: evt.tenantId, crmSystemId: sys.id, key: `crm.teamroom#won#${evt.id}`, room, body, payload: { kind: "won", dealId: deal.id, teamId: deal.teamId } });
}

/** ของแถมของ `crm.score.threshold`: band HOT เท่านั้น → แจ้งห้องของทีมผู้ติดต่อ (band อื่นไม่ทำอะไร) */
export async function onHotLeadTeamRoom(evt: Evt): Promise<void> {
  const p = isObj(evt?.payload) ? evt.payload : {};
  if (p.band !== "HOT") return;
  const contactId = str(p.contactId);
  if (!contactId || !evt?.tenantId || !evt.id) return;
  const c = await prisma.crmContact.findFirst({ where: { id: contactId, tenantId: evt.tenantId }, select: { id: true, systemId: true, score: true, teamId: true } });
  if (!c) return;
  const sys = await v2System(evt.tenantId, c.systemId);
  if (!sys) return;
  const room = await roomFor(sys, c.teamId, `hot contact:${c.id}`);
  if (!room) return;
  // C5.4-B L5-M3: ลิงก์ + คะแนนเท่านั้น (ไม่มีชื่อ — คนในห้องที่มองเห็นผู้ติดต่อนี้เปิดลิงก์ดูเอง)
  const body = `🔥 มี lead ร้อนใหม่ · คะแนน ${c.score}\nเปิดดู: /app/sys/${sys.id}/crm/contacts/${c.id}`;
  await postFlagged({ tenantId: evt.tenantId, crmSystemId: sys.id, key: `crm.teamroom#hot#${evt.id}`, room, body, payload: { kind: "hot", contactId: c.id, teamId: c.teamId } });
}

/**
 * งานรายวัน `crm.teamroom.stale`: ห้องทีมที่ผูกไว้ได้ข้อความสรุปดีลนิ่งวันละหนึ่งข้อความ (วันตามปฏิทินไทย — ไม่ใช่ UTC)
 * ดีล = ของทีมนั้น · OPEN · ไม่เก็บถาวร · stalledAt มีค่า (ธงของ C2.10) · ไม่มีดีลนิ่ง = ไม่โพสต์
 * 🔴 ต้องเคารพ `tenantIds`/`systemIds` (ฐาน QC ใช้ร่วมกัน) · ระบบ uiVersion 1 ถูกข้าม (R-E.14)
 * AUDIT-CLASS X5: ธงต่อ (ระบบ · ทีม · วันไทย) ใต้ advisory lock ⇒ รอบซ้อน/รอบสาย = ข้อความเดียว · โพสต์ล้ม = ไม่มีธง ⇒ รอบหลังวันเดียวกันโพสต์ได้
 */
export async function postStaleDigest(now: Date, opts: { tenantIds?: string[]; systemIds?: string[]; deadline?: number; signal?: AbortSignal } = {}): Promise<{ posted: number; skipped: number; refused: number }> {
  const at = nowOf(now);
  const dayKey = thaiDayKey(at.getTime());
  const tenantIds = Array.isArray(opts.tenantIds) ? opts.tenantIds.filter((x): x is string => typeof x === "string" && !!x) : null;
  const systemIds = Array.isArray(opts.systemIds) ? opts.systemIds.filter((x): x is string => typeof x === "string" && !!x) : null;
  const systems = await prisma.appSystem.findMany({
    where: { type: "CRM", ...(tenantIds ? { tenantId: { in: tenantIds } } : {}), ...(systemIds ? { id: { in: systemIds } } : {}) },
    select: { id: true, tenantId: true, settings: true },
    orderBy: { id: "asc" },
  });
  const sum = { posted: 0, skipped: 0, refused: 0 };
  for (const sys of systems) {
    if (opts.signal?.aborted || (opts.deadline && Date.now() > opts.deadline)) break;
    if (parseCrmSettings(sys.settings).uiVersion !== 2) continue;
    const rooms = teamRoomsOf(sys.settings);
    for (const [teamId, room] of Object.entries(rooms)) {
      // รีวิว C3.4 S3: ห้องหนึ่งล้ม (ฐานสะดุด · ข้อมูลเพี้ยน) ต้องไม่ตัดห้อง/ร้านถัดไปทั้งวัน ⇒ จับต่อห้อง · WARN ids ล้วน · ไปต่อ
      //   (ไม่มีธง ⇒ รอบเก็บตกรายชั่วโมง `crm.teamroom.stale.sweep` โพสต์ให้ภายในวันเดียวกันได้ครั้งเดียว)
      try {
        const where: Prisma.CrmDealWhereInput = { tenantId: sys.tenantId, systemId: sys.id, teamId, kind: "OPEN", archivedAt: null, stalledAt: { not: null } };
        const count = await prisma.crmDeal.count({ where });
        if (count === 0) {
          sum.skipped += 1;
          continue;
        }
        const deals = await prisma.crmDeal.findMany({ where, select: { id: true, title: true, valueSatang: true, stalledAt: true, contact: NAME_SEL, contacts: MORE_SEL }, orderBy: [{ stalledAt: "asc" }, { id: "asc" }], take: CRM_TEAMROOM_DIGEST_MAX });
        const more = count - deals.length;
        const body = [
          `📋 สรุปดีลนิ่งของทีม ประจำวันที่ ${thaiDateLabel(at.getTime(), true)} — ${count.toLocaleString("th-TH")} ดีล`,
          ...deals.map((d) => `• ${safe(withoutName(d.title, d.contact, d.contacts))} · ${baht(d.valueSatang)} — /app/sys/${sys.id}/crm/deals/${d.id}`),
          more > 0 ? `…และอีก ${more.toLocaleString("th-TH")} ดีล — ดูทั้งหมด: /app/sys/${sys.id}/crm/deals?stale=1&team=${teamId}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        const r = await postFlagged({ tenantId: sys.tenantId, crmSystemId: sys.id, key: `crm.teamroom#stale#${sys.id}#${teamId}#${dayKey}`, room, body, payload: { kind: "stale", teamId, day: dayKey, count }, warnOnceKey: `warn:stale:${sys.id}:${teamId}:${dayKey}` });
        if (r === "posted") sum.posted += 1;
        else if (r === "dup") sum.skipped += 1;
        else sum.refused += 1;
      } catch (e) {
        sum.refused += 1;
        await logOps("WARN", "crm.teamroom", "สรุปดีลนิ่งของห้องทีมล้มเหลว — ข้ามไปห้องถัดไป (รอบเก็บตกจะลองใหม่)", {
          tenantId: sys.tenantId,
          detail: `system:${sys.id} team:${teamId} room:${room.meetingSystemId}/${room.channelId} day:${dayKey} error:${e instanceof Error ? e.name : "unknown"}`,
        });
      }
    }
  }
  return sum;
}

/**
 * ผูกทีม → ห้องแชท (`settings.crm.teamRooms[teamId]`) — คีย์ `crm.settings.manage` · jsonb_set คำสั่งเดียว (ไม่อ่านทั้งก้อนมาเขียนทับ)
 * `channelId: null` = เอาการผูกออก · ทีมต้องเป็นของร้าน · ห้องต้องเป็นห้องที่ยังใช้ได้ของระบบ MEETING ในร้านเดียวกัน (อื่น ๆ = NOT_FOUND)
 */
export async function setTeamRoom(ctx: AiBridgeCtx, actor: Actor, input: { teamId: string; meetingSystemId?: string | null; channelId?: string | null }): Promise<{ teamRooms: Record<string, TeamRoom> }> {
  const { a, sys } = await enter(ctx, actor);
  if (!crmCan(a, "crm.settings.manage")) throw fail("FORBIDDEN", crmForbiddenMessage("crm.settings.manage"));
  const teamId = str(input?.teamId);
  const team = teamId ? await prisma.team.findFirst({ where: { id: teamId, tenantId: sys.tenantId }, select: { id: true } }) : null;
  if (!team || !teamId) throw fail("NOT_FOUND", MSG.team);
  const channelId = str(input?.channelId);
  const meetingSystemId = str(input?.meetingSystemId);
  if (channelId) {
    const rooms = await (await meeting()).listRoomOptions(sys.tenantId, a.userId); // รีวิว S1: ห้องที่คนผูกมองเห็นเท่านั้น (PUBLIC หรือเป็นสมาชิก)
    const ok = rooms.some((r) => r.channelId === channelId && (!meetingSystemId || r.meetingSystemId === meetingSystemId));
    if (!ok) throw fail("NOT_FOUND", MSG.room);
    const room = rooms.find((r) => r.channelId === channelId)!;
    const json = JSON.stringify({ meetingSystemId: room.meetingSystemId, channelId: room.channelId });
    await prisma.$executeRaw`
      UPDATE "AppSystem"
      SET "settings" = jsonb_set(
        CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
        '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END)
          || jsonb_build_object('teamRooms',
               (CASE WHEN jsonb_typeof("settings"->'crm'->'teamRooms') = 'object' THEN "settings"->'crm'->'teamRooms' ELSE '{}'::jsonb END)
                 || jsonb_build_object(${teamId}::text, ${json}::jsonb)),
        true)
      WHERE "id" = ${sys.id} AND "tenantId" = ${sys.tenantId} AND "type" = 'CRM'`;
  } else {
    await prisma.$executeRaw`
      UPDATE "AppSystem"
      SET "settings" = jsonb_set(
        CASE WHEN jsonb_typeof("settings") = 'object' THEN "settings" ELSE '{}'::jsonb END,
        '{crm}',
        (CASE WHEN jsonb_typeof("settings"->'crm') = 'object' THEN "settings"->'crm' ELSE '{}'::jsonb END)
          || jsonb_build_object('teamRooms',
               (CASE WHEN jsonb_typeof("settings"->'crm'->'teamRooms') = 'object' THEN "settings"->'crm'->'teamRooms' ELSE '{}'::jsonb END) - ${teamId}::text),
        true)
      WHERE "id" = ${sys.id} AND "tenantId" = ${sys.tenantId} AND "type" = 'CRM'`;
  }
  await audit({ tenantId: sys.tenantId, systemId: sys.id, actorUserId: a.userId }, "crm.settings.team_room", "Team", teamId, { channelId: channelId ?? null });
  const fresh = await prisma.appSystem.findFirst({ where: { id: sys.id, tenantId: sys.tenantId }, select: { settings: true } });
  return { teamRooms: teamRoomsOf(fresh?.settings) };
}

/** ข้อมูลของตัวเลือกห้องบนหน้าตั้งค่า (ทีม · ห้องที่เลือกได้ · การผูกปัจจุบัน) — คีย์ `crm.settings.manage` */
export async function teamRoomOptions(ctx: AiBridgeCtx, actor: Actor): Promise<{ teams: { id: string; name: string }[]; rooms: { meetingSystemId: string; systemName: string; channelId: string; channelName: string }[]; current: Record<string, TeamRoom>; hiddenLive: string[] }> {
  const { a, sys } = await enter(ctx, actor);
  if (!crmCan(a, "crm.settings.manage")) throw fail("FORBIDDEN", crmForbiddenMessage("crm.settings.manage"));
  const M = await meeting();
  const current = teamRoomsOf(sys.settings);
  const [teams, rooms] = await Promise.all([
    prisma.team.findMany({ where: { tenantId: sys.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    M.listRoomOptions(sys.tenantId, a.userId),
  ]);
  // รีวิว C3.4 รอบ 2 N2: ห้องที่ผูกไว้แต่ผู้ดูมองไม่เห็น (ห้องส่วนตัวที่เขาไม่ได้อยู่) — บอกแค่ "ยังใช้งานอยู่" ด้วย id (ไม่เปิดเผยชื่อห้อง)
  const seen = new Set(rooms.map((r) => r.channelId));
  const unseen = Object.values(current).map((r) => r.channelId).filter((id) => !seen.has(id));
  const hiddenLive = unseen.length ? await M.liveChannelIds(sys.tenantId, unseen) : [];
  return { teams, rooms, current, hiddenLive };
}

// ═════════════════════════ ลิงก์ดีลในห้องแชท (unfurl) ═════════════════════════

const DEAL_PATH_RE = /^\/app\/sys\/([A-Za-z0-9_-]{1,64})\/crm\/deals\/([A-Za-z0-9_-]{1,64})\/?$/;

export type DealUnfurl = { dealId: string; systemId: string; title: string; stageName: string; valueSatang: number; ownerName: string | null; companyName: string | null; href: string };

/**
 * ลิงก์ `/app/sys/<systemId>/crm/deals/<dealId>` (เต็มหรือสัมพัทธ์) → การ์ด · `null` เมื่อ: ไม่ใช่ลิงก์ดีล · ระบบไม่ใช่ CRM v2 ของร้านนี้ ·
 * ดีลไม่อยู่ในระบบนั้น · ผู้ดูมองไม่เห็นดีล (AUDIT-CLASS X1/X10 — ไม่บอกว่ามีอยู่ · การ์ดไม่มีเบอร์/อีเมล/เลขภาษี)
 */
export async function unfurlDealLink(ctx: { tenantId: string }, viewer: Actor, url: string): Promise<DealUnfurl | null> {
  try {
    if (!viewer || viewer.role === "CUSTOMER" || !str(viewer.userId)) return null;
    const raw = String(url ?? "").trim().slice(0, 500);
    let path = "";
    if (raw.startsWith("/")) path = raw;
    else {
      const u = new URL(raw);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      path = u.pathname;
    }
    path = path.split(/[?#]/)[0] ?? "";
    const m = DEAL_PATH_RE.exec(path);
    if (!m) return null;
    const [, systemId, dealId] = m as unknown as [string, string, string];
    const sys = await v2System(String(ctx?.tenantId ?? ""), systemId);
    if (!sys) return null;
    const scope = scopeOf(sys);
    const d = await prisma.crmDeal.findFirst({
      where: { AND: [await dealWhere(scope, viewer), { id: dealId }] },
      select: { id: true, title: true, valueSatang: true, ownerUserId: true, companyId: true, stage: { select: { name: true } } },
    });
    if (!d) return null;
    const [co, owner] = await Promise.all([
      d.companyId ? companiesSvc.briefForAssist(scope, viewer, d.companyId) : null,
      d.ownerUserId ? prisma.user.findUnique({ where: { id: d.ownerUserId }, select: { name: true } }) : null,
    ]);
    return {
      dealId: d.id,
      systemId: sys.id,
      title: d.title,
      stageName: d.stage?.name ?? "",
      valueSatang: d.valueSatang,
      ownerName: owner?.name ?? null,
      companyName: co?.name ?? null,
      href: `/app/sys/${sys.id}/crm/deals/${d.id}`,
    };
  } catch {
    return null;
  }
}

// ชนิดที่ใช้ภายนอกไฟล์ (หน้า/ops) — ตัวจริงอยู่ที่ ./ai-bridges-shared
export type { AssistKind, AssistResultView, AtRiskItemView, TeamRoom } from "./ai-bridges-shared";
