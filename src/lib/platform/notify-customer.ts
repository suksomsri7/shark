// ─────────────────────────────────────────────────────────────
// platform/notify-customer.ts — ประตูเดียวของ "ข้อความบริการ" ถึงลูกค้า (คิว · นัด · บิลหอ · ใบเสร็จ) · SVC R0.7 · CC §4 · ใบสั่ง §3.6
//
// ลำดับ: ตรวจ input (ไม่ log) → อ้างสิทธิ์ dedupeKey (แถว ServiceMessageLog เดียวต่อคีย์) → เวลาเงียบ
//   → ช่องทางตาม `messaging.channelOrder` ของหน่วย (LINE ⇒ OA = `messaging.lineConnectionId` ตรงตัว · SMS ⇒ ยังไม่มี · WEB_LINK)
//   → เขียนสถานะสุดท้าย (SENT · SKIPPED_CONSENT · SKIPPED_QUIET · NO_CHANNEL · FAILED)
// 🔴 dedupeKey ประกอบจาก id เท่านั้น (carry R0.7) — มีเบอร์/อักขระนอกชุด ⇒ VALIDATION
// 🔴 log ไม่มีเบอร์/ชื่อ/ข้อความ · ไม่เขียน outbox/audit ที่มี vars · `phone` ไม่ถูกเก็บ/พิมพ์ที่ไหนเลย (สำหรับ SMS ในอนาคต)
// 🔴 OA ต่อหน่วย = ค่าตั้งตรงตัว (null = ไม่มี LINE · ไม่เดา OA อื่น) · ผู้รับต้องอยู่บน OA นั้น (LINE userId ผูกกับ OA)
// 🔴 optOut (มติ 5 · รอ PDPA J5 — ค่าปลอดภัยเอียงไม่ส่ง): ผู้ติดต่อถูกบล็อก หรือเพิกถอนยินยอมช่อง LINE อย่างชัดแจ้ง
//    "ไม่เคยให้ยินยอมการตลาด" ไม่บล็อกข้อความบริการ (CC §4.4)
// 🔴 แชทผ่าน facade `@/lib/modules/chat` เท่านั้น
// ─────────────────────────────────────────────────────────────
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/core/db";
import { inQuietWindow, nextQuietEnd } from "@/lib/core/quiet-hours";
import { getDef, renderTemplate, resolveSetting } from "@/lib/core/settings";
import { signLink } from "@/lib/core/signed-link";
import { pushLineMessagesToContact, type LineMessage } from "@/lib/modules/chat";

export type NotifyChannel = "LINE" | "SMS" | "NONE";
export type NotifyStatus = "SENT" | "SKIPPED_CONSENT" | "SKIPPED_QUIET" | "NO_CHANNEL" | "FAILED";
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
  webLink?: string | null;
  retryAt?: Date;
  duplicate?: boolean;
  error?: "VALIDATION" | "NOT_FOUND";
};

const FINAL_NO_RETRY = new Set(["SENT", "SKIPPED_CONSENT", "NO_CHANNEL"]);
const RETRYABLE = ["SKIPPED_QUIET", "FAILED"];
/** สถานะชั่วคราวระหว่างส่ง (ผู้อ้างสิทธิ์ถือไว้) — จบแล้วต้องเป็นหนึ่งใน 5 สถานะเสมอ */
const CLAIMED = "SENDING";
/** ผู้อ้างสิทธิ์ที่ค้างนานเกินนี้ (โพรเซสตายกลางทาง) ⇒ ให้คนถัดไปอ้างสิทธิ์ต่อได้ */
const STALE_CLAIM_MS = 2 * 60_000;
const WAIT_CLAIM_MS = 15_000;

const DEDUPE_RE = /^[A-Za-z0-9:._-]+$/;
const TH_PHONE_RE = /(\+?66|0)[689]\d{8}/;
const PATH_RE = /^\/[A-Za-z0-9/_-]*$/;
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,60}$/;
const PURPOSE_RE = /^[a-z][a-z0-9._-]*$/;
const POSTBACK_RE = /^(booking|dorm|hotel)\.[a-z][A-Za-z0-9_]*(\.[a-z][A-Za-z0-9_]*)*(\?.*)?$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const failed = (error: "VALIDATION" | "NOT_FOUND"): NotifyCustomerResult => ({ channel: "NONE", status: "FAILED", error });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

type Row = { id: string; channel: string; status: string; at: Date };

/**
 * อ้างสิทธิ์คีย์ — คืน id แถวที่เราถือ หรือ "dup" พร้อมแถวสถานะสุดท้ายของคนอื่น
 * ยิงพร้อมกัน N ทาง ⇒ ผู้ชนะ 1 ราย (create ชน unique / updateMany แบบมีเงื่อนไข) · คนแพ้รอผลของผู้ชนะ
 */
async function claim(base: { tenantId: string; unitId: string; domain: string; messageKey: string; dedupeKey: string }): Promise<{ id: string } | { dup: Row }> {
  const where = { tenantId_dedupeKey: { tenantId: base.tenantId, dedupeKey: base.dedupeKey } };
  const deadline = Date.now() + WAIT_CLAIM_MS;
  for (;;) {
    const row = (await prisma.serviceMessageLog.findUnique({ where, select: { id: true, channel: true, status: true, at: true } })) as Row | null;
    if (!row) {
      try {
        const c = await prisma.serviceMessageLog.create({ data: { ...base, channel: "NONE", status: CLAIMED, at: new Date() }, select: { id: true } });
        return { id: c.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue; // คนอื่นสร้างก่อน — อ่านใหม่
        throw e;
      }
    }
    if (FINAL_NO_RETRY.has(row.status)) return { dup: row };
    const now = new Date();
    const retry =
      RETRYABLE.includes(row.status) ||
      (row.status === CLAIMED && row.at.getTime() < now.getTime() - STALE_CLAIM_MS);
    if (retry) {
      const n = await prisma.serviceMessageLog.updateMany({
        where: { id: row.id, tenantId: base.tenantId, status: row.status, at: row.at },
        data: { status: CLAIMED, at: now },
      });
      if (n.count === 1) return { id: row.id };
      continue;
    }
    // อีกทางกำลังส่งอยู่ — รอผล (ไม่ส่งซ้ำ)
    if (Date.now() > deadline) return { dup: row };
    await sleep(150);
  }
}

/** ส่งข้อความบริการถึงลูกค้าหนึ่งราย (ไม่ throw) */
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
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.vars ?? {})) if (typeof v === "string") vars[k] = v;
  const at = input.at instanceof Date && !Number.isNaN(input.at.getTime()) ? input.at : new Date();
  const unitId = str(input.unitId);
  if (!unitId) return failed("NOT_FOUND");

  try {
    const unit = await prisma.businessUnit.findFirst({ where: { id: unitId, tenantId }, select: { id: true } });
    if (!unit) return failed("NOT_FOUND");

    // ค่าตั้งอ่าน ณ เวลาจริง (effectiveFrom ≤ ตอนนี้) — `at` ใช้ตัดสินเวลาเงียบอย่างเดียว
    const refs = { unitId };
    const [orderS, quietS, lineS] = await Promise.all([
      resolveSetting({ tenantId }, "messaging.channelOrder", refs),
      resolveSetting({ tenantId }, "messaging.quietHours", refs),
      resolveSetting({ tenantId }, "messaging.lineConnectionId", refs),
    ]);
    const order = Array.isArray(orderS.value) ? orderS.value.filter((x): x is string => typeof x === "string") : ["LINE", "WEB_LINK"];

    // ลิงก์เว็บ: คืนทุกครั้งที่มี link และ WEB_LINK อยู่ในลำดับ (ผู้เรียกแสดง/พิมพ์ให้ลูกค้า)
    let webLink: string | null | undefined;
    if (input.link && order.includes("WEB_LINK")) {
      try {
        webLink = input.link.path + signLink({ tenantId, purpose: input.link.purpose, subjectId: input.link.subjectId, expMin: input.link.expMin });
      } catch {
        webLink = null; // ไม่มีกุญแจ — ไม่มีลิงก์ (ไม่ใช่ลิงก์ที่ปลอมได้)
      }
    }

    // ── 2. อ้างสิทธิ์ dedupeKey ──
    const c = await claim({ tenantId, unitId, domain, messageKey, dedupeKey });
    if ("dup" in c) {
      const st = (c.dup.status === CLAIMED ? "FAILED" : c.dup.status) as NotifyStatus;
      const ch = (["LINE", "SMS"].includes(c.dup.channel) ? c.dup.channel : "NONE") as NotifyChannel;
      return { duplicate: true, channel: ch, status: st };
    }

    let final: { channel: NotifyChannel; status: NotifyStatus; partyId: string | null } = { channel: "NONE", status: "FAILED", partyId: null };
    let retryAt: Date | undefined;
    try {
      // ── 3. เวลาเงียบ ──
      const q = isRec(quietS.value) ? quietS.value : null;
      const qs = q && typeof q.start === "string" ? q.start : null;
      const qe = q && typeof q.end === "string" ? q.end : null;
      if (!input.bypassQuiet && qs && qe && inQuietWindow(at, qs, qe)) {
        retryAt = nextQuietEnd(at, qe);
        final = { channel: "NONE", status: "SKIPPED_QUIET", partyId: null };
      } else {
        final = await deliver({ tenantId, unitId, order, lineConnectionId: typeof lineS.value === "string" ? lineS.value : null, input, settingKey, vars });
      }
    } finally {
      // จบแล้วแถวต้องเป็นหนึ่งใน 5 สถานะเสมอ (พังกลางทาง = FAILED ลองใหม่ได้)
      await prisma.serviceMessageLog.updateMany({
        where: { id: c.id, tenantId },
        data: { channel: final.channel, status: final.status, partyId: final.partyId, at: new Date() },
      });
    }
    const out: NotifyCustomerResult = { channel: final.channel, status: final.status };
    if (retryAt) out.retryAt = retryAt;
    else if (webLink !== undefined) out.webLink = webLink;
    return out;
  } catch {
    return { channel: "NONE", status: "FAILED" };
  }
}

async function deliver(a: {
  tenantId: string;
  unitId: string;
  order: string[];
  lineConnectionId: string | null;
  input: NotifyCustomerInput;
  settingKey: string;
  vars: Record<string, string>;
}): Promise<{ channel: NotifyChannel; status: NotifyStatus; partyId: string | null }> {
  const { tenantId, input } = a;
  let consent = false;
  let lineFailed = false;
  let partyOfRecipient: string | null = null;

  for (const ch of a.order) {
    if (ch !== "LINE") continue; // SMS = ยังไม่มีผู้ให้บริการ (S.1) · WEB_LINK = ลิงก์คืนให้ผู้เรียกแล้ว
    const connId = str(a.lineConnectionId);
    if (!connId) continue;
    const conn = await prisma.chatChannelConnection.findFirst({
      where: { id: connId, tenantId, type: "LINE", status: { not: "DISABLED" } },
      select: { id: true },
    });
    if (!conn) continue;

    // ผู้รับบน OA นี้เท่านั้น
    const sel = { id: true, partyId: true, blockedAt: true, lang: true } as const;
    const base = { tenantId, channel: "LINE" as const, channelConnectionId: conn.id };
    let contact: { id: string; partyId: string | null; blockedAt: Date | null; lang: string | null } | null = null;
    const ccId = str(input.chatContactId);
    const pid = str(input.partyId);
    if (ccId) contact = await prisma.chatContact.findFirst({ where: { ...base, id: ccId }, select: sel });
    else if (pid) {
      const order = [{ lastSeenAt: "desc" as const }, { createdAt: "desc" as const }];
      contact =
        (await prisma.chatContact.findFirst({ where: { ...base, partyId: pid, blockedAt: null }, orderBy: order, select: sel })) ??
        (await prisma.chatContact.findFirst({ where: { ...base, partyId: pid }, orderBy: order, select: sel }));
    }
    if (!contact) continue;
    partyOfRecipient = contact.partyId;

    if (contact.blockedAt || (contact.partyId && (await revokedLine(tenantId, contact.partyId)))) {
      consent = true;
      continue;
    }

    const def = getDef(a.settingKey);
    const tpl = await resolveSetting({ tenantId }, a.settingKey, { unitId: a.unitId });
    const locale = (contact.lang ?? "").toLowerCase().startsWith("en") ? "en" : "th";
    const text = def ? renderTemplate(def, tpl.value, a.vars, locale).trim() : "";
    if (!text) {
      lineFailed = true;
      continue;
    }
    const alt = Array.from(text).slice(0, 400).join("");
    let message: LineMessage;
    if (input.flex) message = { type: "flex", altText: alt, contents: input.flex };
    else if (input.buttons?.length) message = { type: "flex", altText: alt, contents: buttonsBubble(text, input.buttons) };
    else message = { type: "text", text: Array.from(text).slice(0, 5000).join("") };

    const r = await pushLineMessagesToContact({ tenantId }, { chatContactId: contact.id, connectionId: conn.id, messages: [message] });
    if (r.ok) return { channel: "LINE", status: "SENT", partyId: partyOfRecipient };
    lineFailed = true;
  }
  if (consent) return { channel: "LINE", status: "SKIPPED_CONSENT", partyId: partyOfRecipient };
  if (lineFailed) return { channel: "LINE", status: "FAILED", partyId: partyOfRecipient };
  return { channel: "NONE", status: "NO_CHANNEL", partyId: partyOfRecipient };
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
