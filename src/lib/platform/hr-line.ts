// ─────────────────────────────────────────────────────────────
// platform/hr-line.ts — กาวระหว่าง HR กับ LINE ของร้าน · HR H4.5 · ใบสั่ง ledger/hr-briefs/hr-brief-H4.5.md R4 · R7 · R8
//   รหัสผูกของพนักงาน (HR_EMPLOYEE) · route postback `hr.*` (เมนู · ยกเลิกผูก) · ผู้ส่งแจ้งเตือน (เวลาเงียบ · เพดาน · ส่งซ้ำ · สรุปรายวัน) · ตัวบริโภคเหตุการณ์
//
// 🔴 HR ไม่ import แชท/แพลตฟอร์ม — ไฟล์นี้เป็นที่เดียวที่รู้ทั้งสองฝั่ง (แบบ dorm-line.ts) · import แชทและ HR ผ่าน facade เท่านั้น
// 🔴 ตัวตนจาก webhook เท่านั้น: (ctx.tenantId, ctx.connectionId, ctx.chatContactId) — ไม่อ่าน id ใด ๆ จากข้อมูล postback (P4)
// 🔴 รหัสผูกคืนครั้งเดียวถึงผู้ขอ — ไฟล์นี้ไม่ log อะไรเลย · ข้อความ LINE จากตารางคงที่ (ไม่มีชื่อ · วันที่ · เงิน · สาขา · P1)
// 🔴 ผู้ส่งไม่ throw · ส่งด้วย retryKey คงที่ต่อแจ้งเตือน (lineRetryKeyOf) ⇒ ส่งซ้ำหลังโพรเซสตาย LINE ไม่ส่งซ้ำ (409 = สำเร็จ) ·
//    ข้อความไม่ถูกเก็บในห้องแชท (pushLineMessagesToContact ไม่เขียนห้อง · P7)
// ─────────────────────────────────────────────────────────────
import { prisma } from "@/lib/core/db";
import { inQuietWindow, nextQuietEnd } from "@/lib/core/quiet-hours";
import { resolveSettings } from "@/lib/core/settings";
import { issueLinkCode, pushLineMessagesToContact } from "@/lib/modules/chat";
import {
  abortLineLink,
  activeLinkOfContact,
  auditLineCapReached,
  auditLineQuota,
  beginLineLink,
  buildLineDigests,
  cancelExpiredLineLinks,
  claimLineNotices,
  completeLineLink,
  endLineLinks,
  finishLineNotice,
  hrefOf,
  lineTextOf,
  LINE_CLAIM_BATCH,
  LINE_LINK_TEXT,
  myLineContactId,
  myLineStatus,
  nextAttemptAt,
  noticeMessage,
  planHrNotices,
  renewLineClaim,
  reserveLineCap,
  skipPendingNotices,
  skipRunSlipNotices,
  type ClaimedNotice,
  type HrLineLocale,
  type SelfActor,
} from "@/lib/modules/hr";
import { lineRetryKeyOf } from "@/lib/platform/notify-customer";
import { LINK_FAILED_TEXT } from "@/lib/platform/postback-routes";
import type { LinkedInfo, PostbackCtx, PostbackEvent, PostbackReply } from "@/lib/platform/postback-routes";

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const nowOf = (d: Date | undefined): Date => (d instanceof Date && Number.isFinite(d.getTime()) ? d : new Date());

/** origin ของแอปสำหรับลิงก์เต็ม (APP_URL → NEXT_PUBLIC_APP_URL) · ไม่มี/ผิดรูป ⇒ null (ไม่ส่ง) */
function appOrigin(): string | null {
  for (const raw of [process.env.APP_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const u = new URL(raw.trim());
      if (u.protocol === "https:" || u.protocol === "http:") return u.origin;
    } catch {
      /* ค่าเสีย = ลองตัวถัดไป */
    }
  }
  return null;
}

/** ภาษา + สถานะบล็อก + ชื่อที่แสดงของผู้ติดต่อ (ร้านเดียวกันเท่านั้น · อ่านแบบ notify-customer — ชั้นแพลตฟอร์ม ไม่ใช่ HR) */
async function contactOf(tenantId: string, chatContactId: string): Promise<{ locale: HrLineLocale; blocked: boolean; displayName: string | null } | null> {
  const c = await prisma.chatContact.findFirst({ where: { id: chatContactId, tenantId }, select: { lang: true, blockedAt: true, displayName: true } });
  if (!c) return null;
  return { locale: (c.lang ?? "").toLowerCase().startsWith("en") ? "en" : "th", blocked: c.blockedAt !== null, displayName: c.displayName ?? null };
}
/** H4.5 fix ▸ G: ร้านที่ไม่ใช่ ACTIVE ไม่ได้คำตอบเมนู/ไม่ส่ง */
async function tenantActive(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { status: true } });
  return t?.status === "ACTIVE";
}

/**
 * HR H4.5 fix ▸ MJ-2: สถานะ LINE ของตัวเองสำหรับหน้า "ของฉัน" = HR myLineStatus (ไม่มีชื่อ) + ชื่อ LINE ของผู้ติดต่อที่ผูกกับตัวเอง (ชั้นแพลตฟอร์มอ่าน · Q14) ·
 * ไม่คืนรหัสผู้ติดต่อ · การผูกที่ใช้ไม่ได้แล้ว (บัญชี/สมาชิกภาพเปลี่ยน) ⇒ ไม่มีชื่อ
 */
export async function myHrLineStatus(actor: SelfActor): Promise<{ ok: true; state: "NONE" | "PENDING" | "ACTIVE" | "NOT_AVAILABLE"; linkedAt: string | null; displayName: string | null; shopEnabled: boolean } | { ok: false; reason: string }> {
  const s = await myLineStatus(actor);
  if (!s.ok) return s;
  let displayName: string | null = null;
  if (s.state === "ACTIVE") {
    const c = await myLineContactId(actor);
    displayName = c ? ((await contactOf(c.tenantId, c.chatContactId))?.displayName ?? null) : null;
  }
  return { ok: true, state: s.state, linkedAt: s.linkedAt, displayName, shopEnabled: s.shopEnabled };
}

// ───────────────────────── R4 รหัสผูก ─────────────────────────

/** ออกรหัสผูก LINE ให้พนักงานของบัญชีที่ล็อกอิน (รหัสคืนครั้งเดียว — ไม่ log/audit) */
export async function issueHrLineCode(
  actor: SelfActor,
): Promise<{ ok: true; code: string; deepLink: string | null; expiresAt: Date } | { ok: false; code: string; reason: string }> {
  try {
    const b = await beginLineLink(actor);
    if (!b.ok) return { ok: false, code: b.code, reason: b.reason };
    const r = await issueLinkCode({ tenantId: b.tenantId }, { purpose: "HR_EMPLOYEE", refId: b.linkId, ttlMin: 10, connectionId: b.connectionId });
    if (!r.ok) {
      await abortLineLink({ tenantId: b.tenantId, linkId: b.linkId });
      return r.error === "NOT_FOUND" ? { ok: false, code: "NO_OA", reason: LINE_LINK_TEXT.NO_OA } : { ok: false, code: "FAILED", reason: LINE_LINK_TEXT.FAILED };
    }
    return { ok: true, code: r.code, deepLink: r.deepLink, expiresAt: r.expiresAt };
  } catch {
    return { ok: false, code: "FAILED", reason: LINE_LINK_TEXT.FAILED };
  }
}

/** แชทอ้างสิทธิ์รหัส HR_EMPLOYEE แล้ว ⇒ HR ตัดสินผูกจากฐาน · ไม่ผ่าน = ข้อความกลางเดียวกับรหัสผิด (X7) */
export async function onHrLinked(ctx: PostbackCtx, a: LinkedInfo, opts?: { now?: Date }): Promise<PostbackReply> {
  try {
    if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.connectionId) || !isStr(ctx.chatContactId) || !isRec(a) || a.purpose !== "HR_EMPLOYEE" || !isStr(a.refId)) return { text: LINK_FAILED_TEXT };
    const r = await completeLineLink({ tenantId: ctx.tenantId, connectionId: ctx.connectionId, chatContactId: ctx.chatContactId, linkId: a.refId }, { now: nowOf(opts?.now) });
    if (!r.ok) return { text: LINK_FAILED_TEXT };
    const c = await contactOf(ctx.tenantId, ctx.chatContactId);
    return { text: lineTextOf(c?.locale ?? "th").linked! };
  } catch {
    return { text: LINK_FAILED_TEXT };
  }
}

// ───────────────────────── R7 ผู้ส่ง ─────────────────────────

type SendTally = { sent: number; failed: number; held: number; skipped: number; cap: number; quota: number };
const tally = (): SendTally => ({ sent: 0, failed: 0, held: 0, skipped: 0, cap: 0, quota: 0 });

/** ส่งแถวที่จองแล้ว 1 แถว — ทุกทางจบด้วย finishLineNotice */
async function sendClaimed(row: ClaimedNotice, now: Date, t: SendTally): Promise<void> {
  const skip = async (code: string, attempted = false) => {
    t.skipped++;
    await finishLineNotice(row, { line: "SKIPPED", skipCode: code, attempted }, now);
  };
  const origin = appOrigin();
  if (!origin) return skip("NO_URL");
  if (row.homeUnitId) {
    const q = (await resolveSettings({ tenantId: row.tenantId }, ["messaging.quietHours"], { unitId: row.homeUnitId }))["messaging.quietHours"]?.value;
    if (isRec(q) && typeof q.start === "string" && typeof q.end === "string" && inQuietWindow(now, q.start, q.end)) {
      t.held++;
      await finishLineNotice(row, { line: "HELD", nextAttemptAt: nextQuietEnd(now, q.end) }, now);
      return;
    }
  }
  const contact = await contactOf(row.tenantId, row.chatContactId);
  if (!contact || contact.blocked) {
    await endLineLinks({ tenantId: row.tenantId, chatContactId: row.chatContactId }, "BLOCKED", { now });
    return skip("BLOCKED");
  }
  const path = hrefOf({ kind: row.kind, refId: row.refId });
  const msg = path ? noticeMessage({ kind: row.kind, outcome: row.outcome, n: row.n }, contact.locale, `${origin}${path}`) : null;
  if (!msg) return skip("KIND");
  if (!(await renewLineClaim(row, now))) return; // H4.5 fix ▸ H: ตั๋วถูกจองใหม่โดยผู้อื่น (สัญญาเช่าหมด) ⇒ ไม่ยิง ไม่แตะแถว ◂
  if (!(await reserveLineCap(row, row.policy.monthlyCap, now))) {
    t.cap++;
    await finishLineNotice(row, { line: "CAP" }, now);
    await auditLineCapReached(row, now);
    return;
  }
  const r = await pushLineMessagesToContact(
    { tenantId: row.tenantId },
    { chatContactId: row.chatContactId, connectionId: row.connectionId, messages: [{ type: "flex", altText: msg.altText, contents: msg.flex }], retryKey: lineRetryKeyOf(row.tenantId, row.dedupeKey) },
  );
  if (r.ok) {
    t.sent++;
    await finishLineNotice(row, { line: "SENT", attempted: true }, now);
    return;
  }
  if (r.code === "QUOTA") {
    t.quota++;
    await finishLineNotice(row, { line: "QUOTA", attempted: true }, now);
    await auditLineQuota({ tenantId: row.tenantId, connectionId: row.connectionId }, now);
    return;
  }
  if (r.code === "NO_LINE_IDENTITY") {
    const c = await contactOf(row.tenantId, row.chatContactId);
    if (!c || c.blocked) await endLineLinks({ tenantId: row.tenantId, chatContactId: row.chatContactId }, "BLOCKED", { now });
    return skip("NO_LINE_IDENTITY", true);
  }
  t.failed++;
  await finishLineNotice(row, { line: "FAILED", attempted: true, nextAttemptAt: nextAttemptAt(row.lineAttempts + 1, now) }, now);
}

async function sendAll(rows: ClaimedNotice[], now: Date, t: SendTally): Promise<void> {
  for (const row of rows) {
    try {
      await sendClaimed(row, now, t);
    } catch {
      // แถวค้าง SENDING ⇒ สัญญาเช่าหมดแล้วงานตามเวลาหยิบใหม่ (คีย์ส่งซ้ำเดิม)
    }
  }
}

/** ส่งแจ้งเตือนตาม id (ของร้านนี้) — ไม่ throw */
export async function sendHrLineNotices(i: { tenantId: string; ids?: string[] }, opts: { now?: Date } = {}): Promise<SendTally> {
  const t = tally();
  try {
    const now = nowOf(opts.now);
    if (!isRec(i) || !isStr(i.tenantId) || !Array.isArray(i.ids) || !i.ids.length) return t;
    for (let k = 0; k < i.ids.length; k += LINE_CLAIM_BATCH) await sendAll(await claimLineNotices({ tenantId: i.tenantId, ids: i.ids.slice(k, k + LINE_CLAIM_BATCH), now }), now, t); // H4.5 fix ▸ H: รอบละ ≤ 20 แถว ◂
  } catch {
    /* ไม่ throw — แถวที่ค้างถูกหยิบใหม่โดยงานตามเวลา */
  }
  return t;
}

/** ส่งแถวที่จองไว้แล้ว (ผู้เรียกถือผลของ claimLineNotices) — ไม่ throw */
export async function sendClaimedLineNotices(rows: ClaimedNotice[], opts: { now?: Date } = {}): Promise<SendTally> {
  const t = tally();
  try {
    await sendAll(Array.isArray(rows) ? rows : [], nowOf(opts.now), t);
  } catch {
    /* ไม่ throw */
  }
  return t;
}

/**
 * งานตามเวลา `hr.line` (ทุก 5 นาที): รหัสหมดอายุ ⇒ CANCELLED · สรุปรายวันที่ถึงเวลา · แถวที่ถึงเวลาส่งซ้ำ (FAILED · HELD · SENDING ค้าง · PENDING ตกหล่น)
 * ซ้อนกันได้ (จองด้วย SKIP LOCKED) · ไม่ throw
 */
export async function runHrLineJobs(now: Date, opts: { budgetMs?: number; signal?: AbortSignal; tenantId?: string } = {}): Promise<SendTally> {
  const t0 = Date.now();
  const t = tally();
  const at = nowOf(now);
  const budget = typeof opts.budgetMs === "number" && opts.budgetMs > 0 ? opts.budgetMs : 60_000;
  const left = () => (opts.signal?.aborted ? 0 : budget - (Date.now() - t0));
  try {
    await cancelExpiredLineLinks(at);
    // H4.5 fix ▸ H: ตรวจงบก่อนสรุปรายวัน + ส่งเส้นตายเข้าไป (หยุดระหว่างระบบ) ◂
    const digests = left() >= 2_000 ? await buildLineDigests(at, { tenantId: opts.tenantId ?? null, deadline: t0 + budget - 2_000 }) : [];
    for (const d of digests) {
      if (left() < 2_000) break;
      for (let k = 0; k < d.ids.length && left() >= 2_000; k += LINE_CLAIM_BATCH) await sendAll(await claimLineNotices({ tenantId: d.tenantId, ids: d.ids.slice(k, k + LINE_CLAIM_BATCH), now: at }), at, t);
    }
    for (let pass = 0; pass < 50 && left() >= 2_000; pass++) {
      const rows = await claimLineNotices({ tenantId: opts.tenantId ?? null, now: at, limit: LINE_CLAIM_BATCH });
      if (!rows.length) break;
      await sendAll(rows, at, t);
    }
  } catch {
    /* ไม่ throw — รอบหน้าทำต่อ */
  }
  return t;
}

// ───────────────────────── R8 ตัวบริโภคเหตุการณ์ ─────────────────────────

/** ของแถมใต้ compose ของ 7 เหตุการณ์ HR: วางแผน (ในแอป + คิว) แล้วส่ง id ของตัวเอง · พ้นสภาพ ⇒ ปิดการผูก + แจ้งเตือนค้าง SKIPPED */
export async function onHrEventForLine(evt: { id?: string; tenantId: string; systemId?: string | null; type: string; payload: unknown }): Promise<void> {
  if (!isRec(evt) || !isStr(evt.tenantId) || !isStr(evt.type)) return;
  if (evt.type === "hr.employee.offboarded") {
    const p = isRec(evt.payload) ? evt.payload : {};
    if (!isStr(p.employeeId)) return;
    await endLineLinks({ tenantId: evt.tenantId, employeeId: p.employeeId }, "OFFBOARD", { includePending: true });
    await skipPendingNotices({ tenantId: evt.tenantId, employeeId: p.employeeId }, "OFFBOARD");
    return;
  }
  if (evt.type === "hr.payroll.reversed") {
    // H4.5 gate fix ▸ ถอนสลิปที่ยังไม่ส่งของรอบนี้ · ไม่ส่งข้อความใหม่ · ล้ม = event retry (bothMain)
    const p = isRec(evt.payload) ? evt.payload : {};
    if (isStr(p.runId)) await skipRunSlipNotices({ tenantId: evt.tenantId, runId: p.runId });
    return;
  }
  const plan = await planHrNotices(evt);
  if (plan.ids.length) await sendHrLineNotices({ tenantId: plan.tenantId, ids: plan.ids });
}

// ───────────────────────── R4 postback `hr.*` ─────────────────────────

const ME = { week: "/app/me/hr/week", requests: "/app/me/hr/requests", leave: "/app/me/hr/requests?form=leave", pay: "/app/me/hr/pay" } as const;

function menuFlex(locale: HrLineLocale, origin: string): PostbackReply["flex"] {
  const T = lineTextOf(locale);
  const btn = (label: string, path: string) => ({ type: "button", style: "secondary", height: "sm", action: { type: "uri", label, uri: `${origin}${path}` } });
  return {
    altText: T.menuTitle!,
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: T.menuTitle!, weight: "bold", size: "md" },
          btn(T.menuWeek!, ME.week),
          btn(T.menuRequests!, ME.requests),
          btn(T.menuLeave!, ME.leave),
          btn(T.menuPay!, ME.pay),
          { type: "text", text: T.FOOTER!, wrap: true, size: "xs" },
        ],
      },
    },
  };
}

/** postback `hr.menu` · `hr.unlink` — ผู้กด = ผู้ติดต่อของ webhook นี้เท่านั้น · ไม่ผูก/ร้านอื่น/อื่น ๆ ⇒ ข้อความ notLinked เดียวกัน */
export async function onHrPostback(ctx: PostbackCtx, evt: PostbackEvent): Promise<PostbackReply> {
  const action = isRec(evt) && typeof evt.action === "string" ? evt.action : "";
  if (!isRec(ctx) || !isStr(ctx.tenantId) || !isStr(ctx.connectionId) || !isStr(ctx.chatContactId)) return { text: lineTextOf("th").notLinked! };
  if (!(await tenantActive(ctx.tenantId))) return {}; // H4.5 fix ▸ G: ร้านไม่ ACTIVE ⇒ ไม่ตอบ ◂
  const c = await contactOf(ctx.tenantId, ctx.chatContactId);
  const T = lineTextOf(c?.locale ?? "th");
  const notLinked: PostbackReply = { text: T.notLinked! };
  const link = await activeLinkOfContact({ tenantId: ctx.tenantId, connectionId: ctx.connectionId, chatContactId: ctx.chatContactId });
  if (!link) return notLinked;
  if (action === "menu") {
    const origin = appOrigin();
    return origin ? { flex: menuFlex(c?.locale ?? "th", origin) } : { text: T.appBody! };
  }
  if (action === "unlink") {
    const r = await endLineLinks({ tenantId: ctx.tenantId, connectionId: ctx.connectionId, chatContactId: ctx.chatContactId }, "LINE");
    return r.ended ? { text: T.unlinked! } : notLinked;
  }
  return notLinked;
}
