// ─────────────────────────────────────────────────────────────
// platform/notify-customer.ts — ประตูเดียวของ "ข้อความบริการ" ถึงลูกค้า (คิว · นัด · บิลหอ · ใบเสร็จ) · SVC R0.7 · CC §4 · ใบสั่ง §3.6
//
// ลำดับ: ตรวจ input (ไม่ log) → อ้างสิทธิ์ dedupeKey (แถว ServiceMessageLog เดียวต่อคีย์) → เวลาเงียบ
//   → ช่องทางตาม `messaging.channelOrder` ของหน่วย (LINE ⇒ OA = `messaging.lineConnectionId` ตรงตัว · SMS ⇒ ยังไม่มี · WEB_LINK)
//   → เขียนสถานะสุดท้าย (SENT · SKIPPED_CONSENT · SKIPPED_QUIET · NO_CHANNEL · FAILED · QUOTA) — ผู้แพ้ dedupe คืนทันที (pending)
// 🔴 dedupeKey ประกอบจาก id เท่านั้น (carry R0.7) — มีเบอร์/อักขระนอกชุด ⇒ VALIDATION
// 🔴 log ไม่มีเบอร์/ชื่อ/ข้อความ · ไม่เขียน outbox/audit ที่มี vars · `phone` ไม่ถูกเก็บ/พิมพ์ที่ไหนเลย (สำหรับ SMS ในอนาคต)
// 🔴 OA ต่อหน่วย = ค่าตั้งตรงตัว (null = ไม่มี LINE · ไม่เดา OA อื่น) · ผู้รับต้องอยู่บน OA นั้น (LINE userId ผูกกับ OA)
// 🔴 optOut (มติ 5 · รอ PDPA J5 — ค่าปลอดภัยเอียงไม่ส่ง): ผู้ติดต่อถูกบล็อก หรือเพิกถอนยินยอมช่อง LINE อย่างชัดแจ้ง
//    "ไม่เคยให้ยินยอมการตลาด" ไม่บล็อกข้อความบริการ (CC §4.4)
// 🔴 แชทผ่าน facade `@/lib/modules/chat` เท่านั้น
// ─────────────────────────────────────────────────────────────
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { prisma } from "@/lib/core/db";
import { inQuietWindow, nextQuietEnd } from "@/lib/core/quiet-hours";
import { getDef, renderTemplate, resolveSettings } from "@/lib/core/settings";
import { signLink } from "@/lib/core/signed-link";
import { pushLineMessagesToContact, type LineMessage } from "@/lib/modules/chat";

export type NotifyChannel = "LINE" | "SMS" | "NONE";
/**
 * สถานะของผล: SENT · SKIPPED_CONSENT · NO_CHANNEL (จบ) · SKIPPED_QUIET · FAILED (ลองซ้ำด้วยคีย์เดิมได้)
 * ยกเว้น FAILED + `code: "QUOTA"` (LINE 429) = จบ ไม่ลองซ้ำ (แถว log เก็บสถานะ `QUOTA` เพื่อให้ dedupe ถือเป็นสถานะจบ)
 * ผู้แพ้ dedupe ที่อีกทางกำลังส่งอยู่ได้ `pending: true` + สถานะแถวขณะนั้น (`SENDING`)
 */
export type NotifyStatus = "SENT" | "SKIPPED_CONSENT" | "SKIPPED_QUIET" | "NO_CHANNEL" | "FAILED" | "SENDING";
/** สถานะในแถว ServiceMessageLog (เพิ่ม QUOTA ที่เป็นสถานะจบ) */
type RowStatus = NotifyStatus | "QUOTA";
export type NotifyButton = { label: string; kind: "postback" | "uri"; data: string };
export type NotifyCustomerInput = {
  unitId: string;
  domain: "booking" | "rooms";
  messageKey: string;
  partyId?: string;
  chatContactId?: string;
  /** สำหรับ SMS ในอนาคต — ห้ามเก็บ/log */
  phone?: string;
  vars: Record<string, string>;
  buttons?: NotifyButton[];
  flex?: Record<string, unknown>;
  /** ประกอบจาก id เท่านั้น — รูปแนะนำ `<domain>:<messageKey>:<id>[:<รอบ>]` */
  dedupeKey: string;
  /** "ตอนนี้" ของการตัดสินเวลาเงียบ (ค่าเริ่ม new Date()) */
  at?: Date;
  /** ข้อความที่ลูกค้ารอทันที (ถึงคิว/ใบเสร็จ) — ผู้เรียกประกาศ */
  bypassQuiet?: boolean;
  link?: { purpose: string; subjectId: string; path: string; expMin: number };
};
export type NotifyCustomerResult = {
  channel: NotifyChannel;
  status: NotifyStatus;
  /** path สัมพัทธ์ + token (ลงท้าย path ด้วย "/") — คืนทุกครั้งที่มี link และ WEB_LINK อยู่ในลำดับ */
  webLink?: string | null;
  retryAt?: Date;
  duplicate?: boolean;
  /** ผู้แพ้ dedupe: อีกทางกำลังส่งคีย์นี้อยู่ (คืนทันที ไม่รอ) */
  pending?: boolean;
  error?: "VALIDATION" | "NOT_FOUND";
  /** QUOTA = LINE ตอบ 429 (โควตา OA เต็ม) — สถานะจบ ไม่ส่งซ้ำ · ร้านได้ audit เตือน */
  code?: "QUOTA";
  /** ตัวแปรที่แม่แบบใช้แต่ไม่มีค่า (ข้อความออกไปเป็นช่องว่าง) — ผู้เรียกควรแก้ */
  missingVars?: string[];
};

const FINAL_NO_RETRY = new Set(["SENT", "SKIPPED_CONSENT", "NO_CHANNEL", "QUOTA"]);
const RETRYABLE = ["SKIPPED_QUIET", "FAILED"];
/** สถานะชั่วคราวระหว่างส่ง (ผู้อ้างสิทธิ์ถือไว้) — จบแล้วต้องเป็นสถานะจบเสมอ */
const CLAIMED = "SENDING";
/** ผู้อ้างสิทธิ์ที่ค้างนานเกินนี้ (โพรเซสตายกลางทาง) ⇒ ให้คนถัดไปอ้างสิทธิ์ต่อได้ — ยาวกว่า LINE timeout (10 วิ) ชัดเจน */
const STALE_CLAIM_MS = 2 * 60_000;
/** ตัวแปรลิงก์ที่ประตูนี้เติมให้เมื่อผู้เรียกไม่ส่ง (URL เต็มของ webLink) */
const LINK_VARS = ["link", "payLink", "receiptLink"];

const DEDUPE_RE = /^[A-Za-z0-9:._-]+$/;
const TH_PHONE_RE = /(\+?66|0)[689]\d{8}/;
const PATH_RE = /^\/[A-Za-z0-9/_-]*$/;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,60}$/;
const PURPOSE_RE = /^[a-z][a-z0-9._-]*$/;
const POSTBACK_RE = /^(booking|dorm|hotel)\.[a-z][A-Za-z0-9_]*(\.[a-z][A-Za-z0-9_]*)*(\?.*)?$/;
const VAR_RE = /\{([^{}]+)\}/g;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const failed = (error: "VALIDATION" | "NOT_FOUND"): NotifyCustomerResult => ({ channel: "NONE", status: "FAILED", error });

function validButtons(b: unknown): b is NotifyButton[] {
  if (!Array.isArray(b) || b.length < 1 || b.length > 6) return false;
  return b.every((x) => {
    if (!isRec(x) || typeof x.label !== "string" || !x.label.trim() || Array.from(x.label).length > 40 || typeof x.data !== "string") return false;
    if (CONTROL_RE.test(x.data)) return false;
    if (x.kind === "postback") return x.data.length <= 300 && POSTBACK_RE.test(x.data);
    if (x.kind === "uri") return x.data.startsWith("https://") && x.data.length <= 1000;
    return false;
  });
}

function validLink(l: unknown): l is NonNullable<NotifyCustomerInput["link"]> {
  if (!isRec(l)) return false;
  const { purpose, subjectId, path, expMin } = l;
  if (typeof purpose !== "string" || purpose.length > 100 || !PURPOSE_RE.test(purpose)) return false;
  if (typeof subjectId !== "string" || !subjectId || subjectId.length > 100) return false;
  if (typeof path !== "string" || path.length > 200 || !PATH_RE.test(path)) return false;
  return typeof expMin === "number" && Number.isInteger(expMin) && expMin >= 1;
}

/** X-Line-Retry-Key คงที่ต่อ (ร้าน, dedupeKey) — รูป UUID (v5-style จาก sha256) · ส่งซ้ำหลังโพรเซสตาย ⇒ LINE ไม่ส่งซ้ำ */
export function lineRetryKeyOf(tenantId: string, dedupeKey: string): string {
  const h = createHash("sha256").update(`notify-customer:line-retry:v1:${tenantId}:${dedupeKey}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** origin ของแอปสำหรับลิงก์เต็ม (APP_URL → NEXT_PUBLIC_APP_URL) · ไม่มี/ผิดรูป ⇒ null (ใช้ path สัมพัทธ์) */
function appOrigin(): string | null {
  for (const raw of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const u = new URL(raw.trim());
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* ค่าเพี้ยน — ลองตัวถัดไป */
    }
  }
  return null;
}

type Row = { id: string; channel: string; status: string; at: Date };
type Claim = { id: string } | { dup: Row; pending: boolean };

/**
 * อ้างสิทธิ์คีย์ — คืน id แถวที่เราถือ หรือแถวของคนอื่น (ไม่รอ: ผู้แพ้คืนทันที · R0.7 fix B4)
 * ยิงพร้อมกัน N ทาง ⇒ ผู้ชนะ 1 ราย (create ชน unique / updateMany แบบมีเงื่อนไข)
 */
async function claim(base: { tenantId: string; unitId: string; domain: string; messageKey: string; dedupeKey: string }): Promise<Claim> {
  try {
    const c = await prisma.serviceMessageLog.create({ data: { ...base, channel: "NONE", status: CLAIMED, at: new Date() }, select: { id: true } });
    return { id: c.id };
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
  }
  const where = { tenantId_dedupeKey: { tenantId: base.tenantId, dedupeKey: base.dedupeKey } };
  const row = (await prisma.serviceMessageLog.findUnique({ where, select: { id: true, channel: true, status: true, at: true } })) as Row | null;
  if (!row) return { dup: { id: "", channel: "NONE", status: CLAIMED, at: new Date() }, pending: true }; // ถูกลบระหว่างทาง — ถือว่ากำลังมีคนส่ง
  if (FINAL_NO_RETRY.has(row.status)) return { dup: row, pending: false };
  const now = new Date();
  const retry = RETRYABLE.includes(row.status) || (row.status === CLAIMED && row.at.getTime() < now.getTime() - STALE_CLAIM_MS);
  if (!retry) return { dup: row, pending: true };
  const n = await prisma.serviceMessageLog.updateMany({
    where: { id: row.id, tenantId: base.tenantId, status: row.status, at: row.at },
    data: { status: CLAIMED, at: now },
  });
  return n.count === 1 ? { id: row.id } : { dup: { ...row, status: CLAIMED }, pending: true };
}

/** ส่งข้อความบริการถึงลูกค้าหนึ่งราย (ไม่ throw) — เป้า ≤ 10 คำสั่ง SQL ต่อครั้ง */
export async function notifyCustomer(ctx: { tenantId: string }, input: NotifyCustomerInput): Promise<NotifyCustomerResult> {
  // ── 1. ตรวจ input (ไม่เขียน log · ไม่ส่ง) ──
  const tenantId = str(ctx?.tenantId);
  if (!tenantId || !isRec(input)) return failed("VALIDATION");
  const domain = input.domain;
  const messageKey = str(input.messageKey);
  if ((domain !== "booking" && domain !== "rooms") || !KEY_RE.test(messageKey)) return failed("VALIDATION");
  const settingKey = `${domain}.msg.${messageKey}`;
  const def = getDef(settingKey);
  if (!def || def.type !== "template") return failed("VALIDATION");
  const dedupeKey = typeof input.dedupeKey === "string" ? input.dedupeKey : "";
  if (dedupeKey.length < 1 || dedupeKey.length > 200 || !DEDUPE_RE.test(dedupeKey) || TH_PHONE_RE.test(dedupeKey)) return failed("VALIDATION");
  if (input.link !== undefined && !validLink(input.link)) return failed("VALIDATION");
  if (input.buttons !== undefined && !validButtons(input.buttons)) return failed("VALIDATION");
  if (input.flex !== undefined && !(isRec(input.flex) && (input.flex.type === "bubble" || input.flex.type === "carousel"))) return failed("VALIDATION");
  if (input.vars !== undefined && !isRec(input.vars)) return failed("VALIDATION");
  if (input.chatContactId !== undefined && typeof input.chatContactId !== "string") return failed("VALIDATION");
  if (input.partyId !== undefined && typeof input.partyId !== "string") return failed("VALIDATION");
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.vars ?? {})) if (typeof v === "string") vars[k] = v;
  const at = input.at instanceof Date && !Number.isNaN(input.at.getTime()) ? input.at : new Date();
  const unitId = str(input.unitId);
  if (!unitId) return failed("NOT_FOUND");
  const ccId = str(input.chatContactId);
  const pid = str(input.partyId);

  try {
    const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId }, select: { id: true } });
    if (!unit) return failed("NOT_FOUND");
    // A5: ส่งทั้งผู้ติดต่อและ Party ⇒ ต้องเป็นคนเดียวกัน (ผู้ติดต่อของร้านนี้ที่ผูก Party นี้)
    if (ccId && pid) {
      const c = await prisma.chatContact.findFirst({ where: { id: ccId, tenantId }, select: { partyId: true } });
      if (!c || c.partyId !== pid) return failed("VALIDATION");
    }

    // ค่าตั้งทั้งชุดคิวรีเดียว (อ่าน ณ เวลาจริง — `at` ใช้ตัดสินเวลาเงียบอย่างเดียว)
    const S = await resolveSettings(
      { tenantId },
      ["messaging.channelOrder", "messaging.quietHours", "messaging.lineConnectionId", settingKey],
      { unitId },
    );
    const orderV = S["messaging.channelOrder"]?.value;
    const order = Array.isArray(orderV) ? orderV.filter((x): x is string => typeof x === "string") : ["LINE", "WEB_LINK"];

    // ลิงก์เว็บ: คืนทุกครั้งที่มี link และ WEB_LINK อยู่ในลำดับ (รวมเวลาเงียบ/ซ้ำ · ผู้เรียกแสดง/พิมพ์ให้ลูกค้า)
    let webLink: string | null | undefined;
    if (input.link && order.includes("WEB_LINK")) {
      const path = input.link.path.endsWith("/") ? input.link.path : `${input.link.path}/`;
      try {
        webLink = path + signLink({ tenantId, purpose: input.link.purpose, subjectId: input.link.subjectId, expMin: input.link.expMin });
      } catch {
        webLink = null; // ไม่มีกุญแจ — ไม่มีลิงก์ (ไม่ใช่ลิงก์ที่ปลอมได้)
      }
    }
    const withLink = (r: NotifyCustomerResult): NotifyCustomerResult => (webLink !== undefined ? { ...r, webLink } : r);

    // ── 2. อ้างสิทธิ์ dedupeKey ──
    const c = await claim({ tenantId, unitId, domain, messageKey, dedupeKey });
    if ("dup" in c) {
      const ch = (["LINE", "SMS"].includes(c.dup.channel) ? c.dup.channel : "NONE") as NotifyChannel;
      const quota = c.dup.status === "QUOTA";
      return withLink({
        duplicate: true,
        ...(c.pending ? { pending: true } : {}),
        channel: ch,
        status: (quota ? "FAILED" : c.dup.status) as NotifyStatus,
        ...(quota ? { code: "QUOTA" as const } : {}),
      });
    }

    let final: Delivered = { channel: "NONE", status: "FAILED", partyId: null };
    let retryAt: Date | undefined;
    try {
      // ── 3. เวลาเงียบ ──
      const q = isRec(S["messaging.quietHours"]?.value) ? (S["messaging.quietHours"].value as Record<string, unknown>) : null;
      const qs = q && typeof q.start === "string" ? q.start : null;
      const qe = q && typeof q.end === "string" ? q.end : null;
      if (!input.bypassQuiet && qs && qe && inQuietWindow(at, qs, qe)) {
        retryAt = nextQuietEnd(at, qe);
        final = { channel: "NONE", status: "SKIPPED_QUIET", partyId: null };
      } else {
        // ตัวแปรลิงก์: ผู้เรียกไม่ส่ง ⇒ เติม URL เต็มของ webLink
        if (webLink) {
          const origin = appOrigin();
          const full = origin ? origin + webLink : webLink;
          for (const k of LINK_VARS) if (vars[k] === undefined) vars[k] = full;
        }
        const lineV = S["messaging.lineConnectionId"]?.value;
        final = await deliver({
          tenantId,
          order,
          lineConnectionId: typeof lineV === "string" ? lineV : null,
          input,
          ccId,
          pid,
          tplDef: def,
          tplValue: S[settingKey]?.value,
          vars,
          retryKey: lineRetryKeyOf(tenantId, dedupeKey),
        });
        if (final.status === "QUOTA" && final.connectionId) {
          // เตือนร้าน (ไม่มี vars/ข้อความ/เบอร์) — โควตา OA เต็มต้องให้คนไปแก้ ไม่ใช่วนส่งซ้ำ
          await writeAudit({
            tenantId,
            actorType: "SYSTEM",
            action: "messaging.line.quota",
            targetType: "ChatChannelConnection",
            targetId: final.connectionId,
            after: { unitId, domain, messageKey },
          });
        }
      }
    } finally {
      // จบแล้วแถวต้องเป็นสถานะจบเสมอ (พังกลางทาง = FAILED ลองใหม่ได้)
      //   UPDATE คำสั่งเดียว (updateMany ของ Prisma ห่อ BEGIN/COMMIT = 3 คำสั่ง · เป้า B6 ≤ 10 SQL)
      await prisma.$executeRaw`
        UPDATE "ServiceMessageLog"
        SET "channel" = ${final.channel}, "status" = ${final.status}, "partyId" = ${final.partyId}, "at" = ${new Date()}
        WHERE "id" = ${c.id} AND "tenantId" = ${tenantId}`;
    }
    const out: NotifyCustomerResult =
      final.status === "QUOTA" ? { channel: final.channel, status: "FAILED", code: "QUOTA" } : { channel: final.channel, status: final.status };
    if (retryAt) out.retryAt = retryAt;
    if (final.missingVars?.length) out.missingVars = final.missingVars;
    return withLink(out);
  } catch {
    return { channel: "NONE", status: "FAILED" };
  }
}

type Delivered = { channel: NotifyChannel; status: RowStatus; partyId: string | null; missingVars?: string[]; connectionId?: string };

async function deliver(a: {
  tenantId: string;
  order: string[];
  lineConnectionId: string | null;
  input: NotifyCustomerInput;
  ccId: string;
  pid: string;
  tplDef: NonNullable<ReturnType<typeof getDef>>;
  tplValue: unknown;
  vars: Record<string, string>;
  retryKey: string;
}): Promise<Delivered> {
  const { tenantId, input } = a;
  let consent = false;
  let lineFailed = false;
  let quota: string | null = null;
  let partyOfRecipient: string | null = null;
  let missingVars: string[] | undefined;

  for (const ch of a.order) {
    if (ch !== "LINE") continue; // SMS = ยังไม่มีผู้ให้บริการ (S.1) · WEB_LINK = ลิงก์คืนให้ผู้เรียกแล้ว
    const connId = str(a.lineConnectionId);
    if (!connId || (!a.ccId && !a.pid)) continue;

    // ผู้รับบน OA ของหน่วยเท่านั้น — คำสั่งเดียว (connection ต้องเป็น LINE ของร้านนี้ ไม่ DISABLED)
    const rows = await prisma.chatContact.findMany({
      where: {
        tenantId,
        channel: "LINE",
        channelConnectionId: connId,
        channelConnection: { tenantId, type: "LINE", status: { not: "DISABLED" } },
        ...(a.ccId ? { id: a.ccId } : { partyId: a.pid }),
      },
      orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: { id: true, partyId: true, blockedAt: true, lang: true },
    });
    const contact = rows.find((r) => !r.blockedAt) ?? rows[0];
    if (!contact) continue;
    partyOfRecipient = contact.partyId;

    if (contact.blockedAt || (contact.partyId && (await revokedLine(tenantId, contact.partyId)))) {
      consent = true;
      continue;
    }

    const locale = (contact.lang ?? "").toLowerCase().startsWith("en") ? "en" : "th";
    missingVars = missingVarsOf(a.tplValue, locale, a.vars);
    const text = renderTemplate(a.tplDef, a.tplValue, a.vars, locale).trim();
    if (!text) {
      lineFailed = true;
      continue;
    }
    const alt = Array.from(text).slice(0, 400).join("");
    let message: LineMessage;
    if (input.flex) message = { type: "flex", altText: alt, contents: input.flex };
    else if (input.buttons?.length) message = { type: "flex", altText: alt, contents: buttonsBubble(text, input.buttons) };
    else message = { type: "text", text: Array.from(text).slice(0, 5000).join("") };

    const r = await pushLineMessagesToContact({ tenantId }, { chatContactId: contact.id, connectionId: connId, messages: [message], retryKey: a.retryKey });
    if (r.ok) return { channel: "LINE", status: "SENT", partyId: partyOfRecipient, missingVars };
    if (r.code === "QUOTA") quota = connId;
    else lineFailed = true;
  }
  if (consent) return { channel: "LINE", status: "SKIPPED_CONSENT", partyId: partyOfRecipient };
  if (quota) return { channel: "LINE", status: "QUOTA", partyId: partyOfRecipient, missingVars, connectionId: quota };
  if (lineFailed) return { channel: "LINE", status: "FAILED", partyId: partyOfRecipient, missingVars };
  return { channel: "NONE", status: "NO_CHANNEL", partyId: partyOfRecipient };
}

/** ตัวแปรที่ข้อความ (ภาษาที่ใช้จริง) อ้างถึงแต่ไม่มีค่า */
function missingVarsOf(value: unknown, locale: string, vars: Record<string, string>): string[] | undefined {
  let text = "";
  if (typeof value === "string") text = value;
  else if (isRec(value)) {
    const loc = value[locale];
    text = typeof loc === "string" && loc.length > 0 ? loc : typeof value.th === "string" ? value.th : "";
  }
  const miss = new Set<string>();
  for (const m of text.matchAll(VAR_RE)) {
    const k = m[1].trim();
    if (typeof vars[k] !== "string") miss.add(k);
  }
  return miss.size ? [...miss] : undefined;
}

/** เพิกถอนยินยอมช่อง LINE อย่างชัดแจ้ง (granted=false + revokedAt) ของสมาชิกที่เป็น Party เดียวกันในร้านนี้ */
async function revokedLine(tenantId: string, partyId: string): Promise<boolean> {
  const hit = await prisma.memberConsent.findFirst({
    where: { tenantId, channel: "LINE", granted: false, revokedAt: { not: null }, customer: { tenantId, partyId } },
    select: { id: true },
  });
  return !!hit;
}

function buttonsBubble(text: string, buttons: NotifyButton[]): Record<string, unknown> {
  return {
    type: "bubble",
    body: { type: "box", layout: "vertical", contents: [{ type: "text", text: Array.from(text).slice(0, 2000).join(""), wrap: true }] },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: buttons.map((b) => ({
        type: "button",
        style: "link",
        height: "sm",
        action: b.kind === "postback" ? { type: "postback", label: b.label, data: b.data, displayText: b.label } : { type: "uri", label: b.label, uri: b.data },
      })),
    },
  };
}
