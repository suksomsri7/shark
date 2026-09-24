// action-runner.ts — ตัวรันการกระทำ "กลาง" ของกฎอัตโนมัติแบบมีตัวตน (journey สมาชิก M3.3 · กฎ CRM C2.1) — มติ C18
//
// ── ที่มา ──────────────────────────────────────────────────────────────────────
//   โค้ดชุดนี้ **ย้ายออกมา** จาก `src/lib/modules/member/journeys.ts` (ไม่ใช่เขียนใหม่ · ไม่ใช่สำเนา):
//   ลำดับขั้น (executeActions) · ส่งข้อความตามช่องทางพร้อมด่านความยินยอม "ณ เวลาส่ง" · แถว "รอ n วันแล้วทำต่อ"
//   (WAIT_THEN) · ตัวเก็บขั้นที่ถึงเวลา (runDueWaits: จองแบบ lease) · กุญแจกันซ้ำของ event (eventKeyOf)
//   ⇒ journey สมาชิกและกฎ CRM ใช้ชุดเดียวกัน (มติ C13/C18: ห้ามมีชุดที่สอง)
//
// ── สิ่งที่ "ต่างกันตามโลก" อยู่หลัง SubjectAdapter ──────────────────────────────
//   ตัวตน (subject) ของสมาชิก = Customer · ของ CRM = CrmContact — ที่อยู่ปลายทาง (addressOf) · ความยินยอม (consentOf)
//   · การกระทำเฉพาะโลก (runDomainAction: แท็ก/แต้ม/ย้ายขั้นดีล …) · หน้าตาข้อความ/ตัวส่งจริง ถูกส่งเข้ามาจากผู้ใช้
//   🔴 ไฟล์นี้ **ไม่ import `@/lib/modules/*` แบบ static** — adapter ถูกส่งเข้ามา (หรือลงทะเบียนตอนโมดูลเจ้าของโหลด)
//
// ── กติกาที่ห้ามหัก (ย้ายมาพร้อมโค้ด) ──────────────────────────────────────────
// 1) ความยินยอมถูกถาม **ตอนส่งจริง** (ไม่ใช่ตอนตั้งคิว) — ถอน/ไม่อนุญาต = ไม่เรียกตัวส่งเลย (ขั้นถูกข้ามพร้อมเหตุผลไทย)
// 2) ขั้นที่รอเวลา = แถว AutomationRun สถานะ WAITING + scheduledAt · ผูกกฎผ่าน `journeyId` (= ruleId)
// 3) ตัวเก็บขั้นที่ถึงเวลาจอง **แบบ lease** (updateMany เทียบ scheduledAt เดิม) — cron ซ้อนกันได้ตัวเดียว · เครื่องดับกลางทาง
//    = รอบหลังหมด lease หยิบไปทำต่อเอง · แต่ละแถวถูกทำด้วย handler ของ scope ของกฎตัวเอง (สมาชิกไม่แตะแถว CRM และกลับกัน)

import type { AutomationScope, Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { sha256 } from "@/lib/core/hash";

// ───────────────────────── ชนิดกลาง ─────────────────────────

export type RunnerAction = { type: string; params?: Record<string, unknown> };
export type RunnerChannel = "LINE" | "EMAIL" | "SMS" | "PUSH";
/** GRANTED = ส่งได้ · REVOKED = ห้ามส่ง (ถอน/ขอไม่รับ/ไม่อนุญาต) · NONE = ไม่เคยให้คำตอบ (ตัวส่งจริงตัดสินต่อ) */
export type RunnerConsent = "GRANTED" | "REVOKED" | "NONE";
export type RunnerSendResult = { ok: boolean; error?: string; skipped?: boolean };

/** ผลของ 1 ขั้น (เก็บใน payload.steps ของแถว run) */
export type StepOutcome = {
  i: number;
  type: string;
  ok: boolean;
  skipped?: boolean;
  note: string;
  channel?: RunnerChannel;
  voucherId?: string;
};

export type RunnerRuleRef = { id: string; tenantId: string; name: string };
export type RunnerEventRef = { type: string; payload: unknown };

/** สภาพแวดล้อมขั้นต่ำของการเดินกฎ 1 รอบ — adapter ขยายเพิ่มได้ (deps · voucher · ดีล …) */
export type RunnerEnv<S> = {
  rule: RunnerRuleRef;
  subject: S;
  runId: string;
  event: RunnerEventRef;
  now: Date;
};

/** event ขาเข้า (OutboxEvent หรือ event จำลองจาก cron/ข้อสอบ) */
export type RunnerEventInput = {
  tenantId: string;
  type: string;
  payload: unknown;
  /** กุญแจกันซ้ำของ event (OutboxEvent.idempotencyKey) — คิวส่ง `id` มาแทนได้ ตัวรันไปอ่านกุญแจเอง */
  idempotencyKey?: string | null;
  id?: string | null;
  systemId?: string | null;
};

/** ส่วนกลางของคำขอส่ง 1 ข้อความ — adapter เติมตัวตน/ระบบของโลกตัวเองแล้วเรียกตัวส่งจริง */
export type RunnerSendCore = {
  channel: RunnerChannel;
  to: string;
  consent: RunnerConsent;
  body: string;
  subject?: string;
  title?: string;
};

/**
 * ตัวตนของกฎ 1 โลก (สมาชิก = Customer · CRM = CrmContact)
 *   resolveSubject — หาตัวตนของ event (โหลดด้วย id ในร้านนั้นเท่านั้น)
 *   addressOf      — ที่อยู่ปลายทางของช่องทาง ("" = ยังไม่มี)
 *   consentOf      — ความยินยอม **ณ เวลาส่ง** (REVOKED = ตัวรันไม่เรียกตัวส่งเลย)
 *   runDomainAction — การกระทำที่ไม่ใช่ "ส่งข้อความ"/"รอ n วัน" (แท็ก · แต้ม · ย้ายขั้นดีล …)
 */
export interface SubjectAdapter<S, E extends RunnerEnv<S> = RunnerEnv<S>> {
  /** AutomationRule.scope ของโลกนี้ */
  scope: string;
  resolveSubject(evt: RunnerEventInput): Promise<S | null>;
  addressOf(subject: S, channel: RunnerChannel): Promise<string>;
  consentOf(subject: S, channel: RunnerChannel): Promise<RunnerConsent>;
  runDomainAction(kind: string, params: Record<string, unknown>, env: E, at: { action: RunnerAction; index: number; depth: number }): Promise<StepOutcome>;
  /** ชื่อไทยของช่องทาง ("LINE" · "อีเมล" …) */
  channelLabel(channel: RunnerChannel): string;
  /** เหตุผลไทยเมื่อความยินยอม ณ เวลาส่งไม่ผ่าน */
  consentBlockedNote(channel: RunnerChannel, label: string): string;
  /** ตัวแปรของข้อความ ({ชื่อ} …) — `text` = ข้อความทั้งหมดที่จะถูกแทนค่า (คำนวณเฉพาะตัวแปรที่ใช้จริง) */
  messageVars(env: E, text: string): Promise<Record<string, string | undefined>>;
  /** แทนค่าตัวแปร **ครั้งเดียว** (ห้ามขยายซ้ำ) */
  render(template: string, vars: Record<string, string | undefined>): string;
  /** เรียกตัวส่งจริงของช่องทาง (ไม่มีตัวส่ง = คืน skipped พร้อมเหตุผลไทย) — ตัวรันครอบ try/catch ให้ */
  send(env: E, core: RunnerSendCore): Promise<RunnerSendResult>;
  /** คอลัมน์ตัวตนของแถว WAITING (สมาชิก = customerId · CRM = crmContactId) */
  waitColumns(subject: S): { customerId?: string | null; crmContactId?: string | null };
  /** ของเฉพาะโลกที่ขั้นหลังรอต้องใช้ + ข้อความต่อท้ายรายละเอียดของแถวที่รอ */
  waitExtras?(env: E, params: Record<string, unknown>): { payload: Record<string, unknown>; note: string };
  /** หลังขั้นสำเร็จ (สมาชิก: เขียนไทม์ไลน์) — ล้ม = เงียบ */
  onStepDone?(env: E, index: number, action: RunnerAction, note: string): Promise<void>;
  /** สร้าง env ของโลกนี้จากตัวตน (ให้โลกอื่นเรียกการกระทำของโลกนี้ได้ — CRM → สมาชิก: แต้ม/voucher) */
  makeEnv?(subject: S, base: Omit<RunnerEnv<S>, "subject">): E;
}

// ───────────────────────── ทะเบียน adapter (โหลดตอนโมดูลเจ้าของโหลด) ─────────────────────────
// เก็บบน globalThis — โมดูลถูกโหลดซ้ำได้ (bundle ของ Next / ตัวรันสคริปต์) แต่ทะเบียนต้องมีชุดเดียวต่อโพรเซส

type AnyAdapter = SubjectAdapter<unknown, RunnerEnv<unknown>>;
const ADAPTERS_KEY = Symbol.for("shark.automation.action-runner.adapters");
const adapterHolder = globalThis as unknown as Record<symbol, Map<string, AnyAdapter> | undefined>;
const adapters: Map<string, AnyAdapter> = adapterHolder[ADAPTERS_KEY] ?? new Map<string, AnyAdapter>();
adapterHolder[ADAPTERS_KEY] = adapters;

export function registerSubjectAdapter<S, E extends RunnerEnv<S>>(adapter: SubjectAdapter<S, E>): void {
  adapters.set(adapter.scope, adapter as unknown as AnyAdapter);
}

/** adapter ที่ลงทะเบียนไว้ของ scope นี้ (โมดูลเจ้าของต้องถูกโหลดก่อน — ผู้เรียก dynamic import เอง) */
export function subjectAdapter(scope: string): AnyAdapter | null {
  return adapters.get(scope) ?? null;
}

// ───────────────────────── ตัวช่วย ─────────────────────────

const DAY_MS = 86_400_000;

/** อายุการจองขั้นที่รอเวลา — cron ที่จองไว้แล้วตายกลางทาง แถวจะถูกหยิบใหม่หลังหมดเวลานี้ */
// AUDIT-CLASS X5: lease 15 นาที (MASTER-PLAN §4 X5) — ที่เดียวของทั้งระบบ (สมาชิก + CRM ใช้ตัวนี้)
export const WAIT_LEASE_MS = 15 * 60_000;

const asJson = (v: unknown): Prisma.InputJsonValue => (v ?? {}) as Prisma.InputJsonValue;
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const numOr = (v: unknown, fallback: number): number => {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) return fallback;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : fallback;
};
export const thaiDate = (d: Date): string => d.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });

function stableJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
}

/** ขั้นที่ซ้อนอยู่ใน "รอ n วัน" */
export function thenActionsOf(action: RunnerAction): RunnerAction[] {
  const raw = action.params?.thenActions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is RunnerAction => !!a && typeof a === "object" && typeof (a as RunnerAction).type === "string");
}

/** นับการกระทำทั้งหมดรวมที่ซ้อนอยู่ใน "รอ n วัน" */
export function countActions(actions: RunnerAction[]): number {
  let n = 0;
  for (const a of actions) n += 1 + countActions(thenActionsOf(a));
  return n;
}

/**
 * แทนค่าตัวแปร `{ชื่อ}` **รอบเดียว** — ค่าที่แทนเข้าไปไม่ถูกสแกนซ้ำ (ชื่อลูกค้าที่มี "{…}" อยู่ในตัวจึงออกมาตรงตัว)
 * AUDIT-CLASS X6: ตัวแปรที่ไม่รู้จักคงไว้ตามเดิม · ช่องว่างซ้อนถูกยุบ
 */
export function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  return String(template ?? "")
    .replace(/\{([^{}]+)\}/g, (whole, key: string) => {
      const v = vars[key.trim()];
      return v === undefined ? whole : v;
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** การกระทำ "ส่งข้อความ" → ช่องทาง */
export const SEND_ACTION_CHANNEL: Readonly<Record<string, RunnerChannel>> = Object.freeze({
  SEND_LINE: "LINE",
  SEND_EMAIL: "EMAIL",
  SEND_SMS: "SMS",
  SEND_PUSH: "PUSH",
});

// ───────────────────────── กุญแจกันซ้ำของ event ─────────────────────────

/** กุญแจกันซ้ำ: idempotencyKey ที่ส่งมา → ของแถว OutboxEvent (จาก id) → แฮชของชนิด+payload */
export async function eventKeyOf(evt: RunnerEventInput): Promise<string> {
  const direct = str(evt.idempotencyKey);
  if (direct) return direct.slice(0, 190);
  if (evt.id) {
    const row = await prisma.outboxEvent.findFirst({ where: { id: evt.id, tenantId: evt.tenantId }, select: { idempotencyKey: true } });
    if (row?.idempotencyKey) return row.idempotencyKey.slice(0, 190);
  }
  return `evt:${evt.type}:${sha256(stableJson(evt.payload)).slice(0, 24)}`;
}

// ───────────────────────── ขั้นเดียว ─────────────────────────

/** ส่งข้อความ 1 ขั้น — ด่านความยินยอม ณ เวลาส่ง → ตัวแปร → ที่อยู่ → ตัวส่งจริง (ส่งไม่ถึง = บันทึกแล้วไปขั้นถัดไป) */
async function sendStep<S, E extends RunnerEnv<S>>(env: E, action: RunnerAction, index: number, adapter: SubjectAdapter<S, E>): Promise<StepOutcome> {
  const p = (action.params ?? {}) as Record<string, unknown>;
  const base = { i: index, type: action.type };
  const channel = SEND_ACTION_CHANNEL[action.type] as RunnerChannel;
  const label = adapter.channelLabel(channel);
  // AUDIT-CLASS X8: ความยินยอมถูกถาม "ตอนนี้" (ตอนส่งจริง) — ไม่ใช่ตอนตั้งคิว/ตอนเริ่มรอ
  const consent = await adapter.consentOf(env.subject, channel);
  if (consent === "REVOKED") return { ...base, ok: false, skipped: true, channel, note: adapter.consentBlockedNote(channel, label) };
  const template = str(p.template);
  const vars = await adapter.messageVars(env, `${template} ${str(p.subject)} ${str(p.title)}`);
  let res: RunnerSendResult;
  try {
    res = await adapter.send(env, {
      channel,
      to: await adapter.addressOf(env.subject, channel),
      consent,
      body: adapter.render(template, vars),
      ...(action.type === "SEND_EMAIL" ? { subject: adapter.render(str(p.subject), vars) } : {}),
      ...(action.type === "SEND_PUSH" ? { title: adapter.render(str(p.title), vars) } : {}),
    });
  } catch (e) {
    res = { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
  return { ...base, ok: res.ok, ...(res.skipped ? { skipped: true } : {}), channel, note: res.ok ? `ส่งทาง${label}แล้ว` : (res.error ?? "ส่งไม่สำเร็จ") };
}

/** "รอ n วันแล้วทำต่อ" — แถว WAITING (+ scheduledAt) ของตัวตนนี้ · ขั้นข้างในถูกเก็บไว้ใน payload */
async function waitStep<S, E extends RunnerEnv<S>>(env: E, action: RunnerAction, index: number, depth: number, adapter: SubjectAdapter<S, E>): Promise<StepOutcome> {
  const p = (action.params ?? {}) as Record<string, unknown>;
  const base = { i: index, type: action.type };
  const days = Math.round(numOr(p.days, 1));
  const scheduledAt = new Date(env.now.getTime() + days * DAY_MS);
  const extra = adapter.waitExtras?.(env, p) ?? { payload: {}, note: "" };
  const payload = {
    thenActions: thenActionsOf(action),
    ...extra.payload,
    event: env.event,
    parentRunId: env.runId,
    baseIndex: index + 1,
    depth: depth + 1,
  };
  await prisma.automationRun.create({
    data: {
      tenantId: env.rule.tenantId,
      ruleId: env.rule.id,
      journeyId: env.rule.id,
      ...adapter.waitColumns(env.subject),
      status: "WAITING",
      stepIndex: index,
      scheduledAt,
      detail: `รอถึง ${thaiDate(scheduledAt)} แล้วค่อยทำต่อ${extra.note}`,
      payload: asJson(payload),
    },
  });
  return { ...base, ok: true, note: `รอถึง ${thaiDate(scheduledAt)}` };
}

async function runStep<S, E extends RunnerEnv<S>>(env: E, action: RunnerAction, index: number, depth: number, adapter: SubjectAdapter<S, E>): Promise<StepOutcome> {
  if (SEND_ACTION_CHANNEL[action.type]) return sendStep(env, action, index, adapter);
  if (action.type === "WAIT_THEN") return waitStep(env, action, index, depth, adapter);
  return adapter.runDomainAction(action.type, (action.params ?? {}) as Record<string, unknown>, env, { action, index, depth });
}

/**
 * ทำขั้นตามลำดับ · `baseIndex` = เลขขั้นแบบไล่ลึกของขั้นแรกในรายการนี้ (ตรงกับ AutomationRun.stepIndex)
 * ขั้นที่ adapter จับ error เองแล้วคืน ok:false ไม่หยุดขั้นถัดไป · error ที่หลุดออกมา = ผู้เรียกบันทึก FAILED
 */
export async function executeActions<S, E extends RunnerEnv<S>>(
  env: E,
  actions: RunnerAction[],
  baseIndex: number,
  depth: number,
  adapter: SubjectAdapter<S, E>,
): Promise<{ steps: StepOutcome[] }> {
  const steps: StepOutcome[] = [];
  let index = baseIndex;
  for (const action of actions) {
    const outcome = await runStep(env, action, index, depth, adapter);
    steps.push(outcome);
    if (outcome.ok && adapter.onStepDone) await adapter.onStepDone(env, index, action, outcome.note).catch(() => null);
    index += 1 + countActions(thenActionsOf(action));
  }
  return { steps };
}

// ───────────────────────── ขั้นที่รอเวลา ─────────────────────────

export type WaitRow = {
  id: string;
  tenantId: string;
  ruleId: string;
  customerId: string | null;
  crmContactId: string | null;
  stepIndex: number | null;
  scheduledAt: Date | null;
  payload: Prisma.JsonValue | null;
};

/** ผู้รับแถวที่ถึงเวลาของ 1 scope — `accept` = false ⇒ ไม่จอง ไม่แตะ (แถวคงสถานะ WAITING ไว้รอบหน้า) */
export type WaitHandler = {
  /** ตัวกรองกฎเพิ่มเติมของ scope นี้ใน SQL (เช่น CRM: เฉพาะระบบ uiVersion 2) — แถวที่ไม่ผ่านไม่ถูกดึงเลย จึงไม่แย่งที่แถวอื่น */
  ruleWhere?: Prisma.AutomationRuleWhereInput;
  accept?: (row: WaitRow) => Promise<boolean>;
  resume: (row: WaitRow, now: Date) => Promise<void>;
};

/** ปิดแถวที่รอเวลา (ทุกทางออก = "จบจริง" ⇒ ปิด finishedAt ที่นี่ — ตัวจองไม่ได้ปิดให้) */
export function closeWait(w: Pick<WaitRow, "id" | "payload">, status: "OK" | "SKIPPED" | "CANCELLED", detail: string, extra: Record<string, unknown> = {}) {
  return prisma.automationRun.update({
    where: { id: w.id },
    data: { status, detail, finishedAt: new Date(), payload: asJson({ ...((w.payload as Record<string, unknown>) ?? {}), ...extra }) },
  });
}

/** ยกเลิกขั้นที่รออยู่ทั้งหมดของกฎ (ปิดกฎ = ยกเลิกทันที ไม่รอให้ cron ไปเจอ) */
export async function cancelWaiting(ruleId: string, detail: string): Promise<number> {
  const r = await prisma.automationRun.updateMany({
    where: { ruleId, status: "WAITING" },
    data: { status: "CANCELLED", finishedAt: new Date(), detail },
  });
  return r.count;
}

/**
 * ขั้น "รอ n วัน" ที่ถึงเวลาแล้ว (ทุกร้าน หรือร้านเดียว) — แต่ละแถวถูกทำโดย handler ของ scope ของกฎตัวเอง
 * 🔴 AUDIT M7 / AUDIT-CLASS X5: จองแบบ **lease** — เลื่อน `scheduledAt` ออกไป WAIT_LEASE_MS โดยเทียบกับค่าเดิม
 *    (updateMany เงื่อนไข "ยังรอ + scheduledAt ยังเป็นค่าเดิม") ⇒ cron 2 ตัวซ้อนกันได้ตัวเดียว · เครื่องดับกลางทาง
 *    = รอบถัดไป (หลังหมด lease) หยิบไปทำต่อได้เอง · `finishedAt` เป็น "ทำจบแล้วจริง" เท่านั้น ไม่ใช่ตัวจอง
 * 🔴 ส่ง handler มาเฉพาะ scope ของตัวเอง ⇒ ตัวเก็บของสมาชิกมองไม่เห็นแถวของ CRM (และกลับกัน) — ไม่มีใครยกเลิกแถวของอีกโลก
 */
export async function runDueWaits(
  opts: { now?: Date; tenantId?: string; limit?: number; drain?: boolean; shouldStop?: () => boolean } = {},
  handlers: Record<string, WaitHandler> = {},
): Promise<{ ran: number }> {
  const scopes = Object.keys(handlers);
  if (scopes.length === 0) return { ran: 0 };
  const now = opts.now ?? new Date();
  const take = Math.min(Math.max(opts.limit ?? 500, 1), 2000);
  let ran = 0;
  // `drain` = ไล่ทีละหน้าจนหมด (แถวที่จองแล้วถูกเลื่อน scheduledAt ออกไป หน้าถัดไปจึงได้แถวใหม่) · `shouldStop` = หมดงบเวลา
  for (;;) {
  const due = await prisma.automationRun.findMany({
    where: {
      status: "WAITING",
      scheduledAt: { lte: now },
      journeyId: { not: null },
      OR: scopes.map((sc) => ({ rule: { scope: sc as AutomationScope, ...(handlers[sc]?.ruleWhere ?? {}) } })),
      ...(opts.tenantId ? { tenantId: opts.tenantId } : {}),
    },
    orderBy: { scheduledAt: "asc" },
    take,
    select: { id: true, tenantId: true, ruleId: true, customerId: true, crmContactId: true, stepIndex: true, scheduledAt: true, payload: true, rule: { select: { scope: true } } },
  });
  let claimedHere = 0;
  for (const w of due) {
    if (opts.shouldStop?.()) return { ran };
    const handler = w.rule ? handlers[w.rule.scope] : undefined;
    if (!handler) continue;
    const row: WaitRow = { id: w.id, tenantId: w.tenantId, ruleId: w.ruleId, customerId: w.customerId, crmContactId: w.crmContactId, stepIndex: w.stepIndex, scheduledAt: w.scheduledAt, payload: w.payload };
    if (handler.accept && !(await handler.accept(row))) continue;
    const claimed = await prisma.automationRun.updateMany({
      where: { id: w.id, status: "WAITING", scheduledAt: w.scheduledAt },
      data: { scheduledAt: new Date(now.getTime() + WAIT_LEASE_MS), finishedAt: null },
    });
    if (claimed.count !== 1) continue;
    ran += 1;
    claimedHere += 1;
    try {
      await handler.resume(row, now);
    } catch (e) {
      await prisma.automationRun.update({
        where: { id: w.id },
        data: { status: "FAILED", finishedAt: new Date(), detail: `ทำขั้นหลังรอไม่สำเร็จ — ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}` },
      }).catch(() => null);
    }
  }
  if (!opts.drain || due.length < take || claimedHere === 0) break;
  }
  return { ran };
}
