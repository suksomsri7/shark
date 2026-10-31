// ─────────────────────────────────────────────────────────────
// platform/dorm-announce.ts — ส่งประกาศหอถึงผู้เช่า (LINE) · หน้าประกาศของผู้เช่า (ลิงก์เซ็นของ D.9) · เมนู "ประกาศ" · SVC D.17 · ใบสั่ง §3.3
//
// 🔴 ส่งผ่าน notifyCustomer เท่านั้น (OA ของหน่วย · เวลาเงียบ · ยินยอม · dedupe `rooms:announcement:<id>:<canonicalPartyId>`) + precheck
//    ไม่ข้ามเวลาเงียบ (ไม่ส่ง bypassQuiet) · ลิงก์ = ปุ่ม uri (ไม่เพิ่มตัวแปรในแม่แบบ)
// 🔴 อ่านสดทุกครั้ง — ไม่เชื่อ payload ของ event (บทเรียน D.8 F1 / D.11 L1) · ผู้รับคิด ณ ตอนส่ง (สัญญา live · ห้อง active · Party ตัวจริง)
// 🔴 ตัวตรวจคำ สคบ. ก่อนส่งทุกครั้ง: ตัวแม่แบบ · หัวเรื่อง/เนื้อหาดิบ · ข้อความ render th/en ⇒ พบ = ไม่มีข้อความออก ไม่มีแถว log
// 🔴 ด่าน token (X7) ลำดับเดียวกับ D.9 §3.1: rate limit (ถัง dorm:portal:view ร่วม D.9) → verifyLink → สัญญา live ของร้านใน token
//    → ประกาศที่ระบุต้องเป็นประกาศที่สัญญานี้เห็น · ล้มข้อใด ⇒ ผลเดียวกันทุกไบต์ (null / NOT_FOUND)
//    เขียนด่านเองที่นี่ (dorm-portal.ts เป็นไฟล์ที่ D.10 กำลังแก้ — ไม่ export gateLease) โดยใช้ชิ้นเดียวกัน
// 🔴 GET ไม่นับอ่าน (LINE ดึงตัวอย่างลิงก์ได้) — นับจาก action ฝั่งเบราว์เซอร์ (markPortalAnnouncementRead) เท่านั้น
// 🔴 ไม่ import prisma ดิบ · ไม่ส่ง LINE ตรง · ข้อความ/ปุ่ม/log/audit ไม่มีชื่อ เบอร์ ยอดเงิน
// ─────────────────────────────────────────────────────────────
import { bkkYmd } from "@/lib/core/quiet-hours";
import { checkRateLimitDb } from "@/lib/core/rate-limit-db";
import { resolveSettings } from "@/lib/core/settings";
import { verifyLink } from "@/lib/core/signed-link";
import {
  ANNOUNCE_BLOCKED_ACTION,
  ANNOUNCE_IDLE_ACTION,
  announceAuditOnce,
  announceDateLabel,
  announceForSend,
  announceMarkRead,
  announceRecipients,
  announceResendCandidates,
  announceSendBlocked,
  announceStaffGate,
  announceStampLogParty,
  announceTemplate,
  announceVisibleForLease,
  portalLiveLease,
  type AnnounceCursor,
  type AnnounceLeaseRef,
  type PortalLeaseRow,
} from "@/lib/modules/dorm";
import { DORM_PORTAL_PURPOSE, PORTAL_RATE, portalUrl, type PortalOpts } from "@/lib/platform/dorm-portal";
import { notifyCustomer } from "@/lib/platform/notify-customer";

export type { PortalOpts };
export type AnnounceSendResult = {
  status: "DONE" | "NOT_FOUND" | "NOT_PUBLISHED" | "DISABLED" | "TEMPLATE_BLOCKED";
  recipients: number;
  sent: number;
  quiet: number;
  duplicate: number;
  noLine: number;
  failed: number;
};
export type PortalNewsView = {
  unitName: string;
  roomNumber: string;
  items: { id: string; title: string; publishedAt: string; publishedLabel: string; current: boolean }[];
  detail: null | { id: string; title: string; body: string; publishedLabel: string };
  links: { self: string; portal: string };
};

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const LOG_PREFIX = "rooms:announcement:";
const EVENT = "dorm.announcement.published";
const RESEND_WINDOW_MS = 3 * 86_400_000;
const JOB_PAGE = 50;
const PORTAL_MAX = 50;
const MENU_MAX = 3;
const MENU_EMPTY = "ยังไม่มีประกาศจากหอในตอนนี้ — เมื่อหอส่งประกาศใหม่ จะแจ้งในแชทนี้และดูย้อนหลังได้จากเมนู \"ประกาศ\"";
const BUTTON_LABEL = "อ่านประกาศ";

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const nowOf = (d: Date | undefined): Date => (d instanceof Date && Number.isFinite(d.getTime()) ? d : new Date());
const keyOf = (v: unknown): string => (typeof v === "string" ? v.slice(0, 128) : "") || "unknown";
const errName = (e: unknown) => (e instanceof Error ? e.name : "error");
const result = (status: AnnounceSendResult["status"], recipients = 0): AnnounceSendResult => ({ status, recipients, sent: 0, quiet: 0, duplicate: 0, noLine: 0, failed: 0 });
const leaseRef = (l: PortalLeaseRow): AnnounceLeaseRef => ({ id: l.id, tenantId: l.tenantId, unitId: l.unitId, roomId: l.roomId, partyId: l.partyId, startDate: l.startDate });

// ───────────────────────── ลิงก์ ─────────────────────────

/** ลิงก์หน้าประกาศของสัญญา = <portalUrl ของ D.9>/news?a=<id> (อายุ rooms.notify.portalLinkDays) · สัญญาไม่ live ⇒ "" · ไม่ throw */
export async function announcementPortalUrl(ctx: { tenantId: string }, i: { leaseId: string; announcementId: string }, opts?: { now?: Date }): Promise<string> {
  try {
    if (!isRec(i) || !isStr(i.announcementId) || !ID_RE.test(i.announcementId)) return "";
    const base = await portalUrl(ctx, { leaseId: i.leaseId }, opts);
    return base ? `${base}/news?a=${i.announcementId}` : "";
  } catch {
    return "";
  }
}

// ───────────────────────── ส่ง ─────────────────────────

/** precheck: สัญญาตัวแทนยัง live (ร้าน/หน่วยเดิม) และประกาศยังเผยแพร่ ณ ตอนส่ง */
async function stillSendable(tenantId: string, unitId: string, leaseId: string, announcementId: string, now: Date): Promise<{ ok: true } | { ok: false; reason: string }> {
  const lease = await portalLiveLease(tenantId, leaseId, bkkYmd(now));
  if (!lease || lease.unitId !== unitId) return { ok: false, reason: "LEASE_ENDED" };
  const a = await announceForSend(tenantId, announcementId);
  if (!a || !a.publishedAt) return { ok: false, reason: "NOT_PUBLISHED" };
  return { ok: true };
}

export type AnnounceSendOpts = { now?: Date; signal?: AbortSignal; deadlineMs?: number };

/**
 * ส่งประกาศหนึ่งฉบับถึงผู้รับ ณ now — อ่านสดทุกครั้ง · คืนข้อแรกที่เข้า · ไม่ throw
 *   F3: ล้มต่อผู้รับ ⇒ นับ failed แล้วไปคนถัดไป (แถว log ของคนนั้นเป็น FAILED/ไม่มี — งานส่งซ้ำเก็บต่อ) · ล้มก่อนถึงผู้รับ ⇒ DONE + failed 1 (ไม่ใช่ NOT_FOUND)
 *   F4: เคารพ signal/deadlineMs (ของงานตามเวลา) ระหว่างวนผู้รับ — หยุดก่อนเริ่มคนถัดไป
 */
export async function sendDormAnnouncement(ctx: { tenantId: string }, i: { announcementId: string }, opts?: AnnounceSendOpts): Promise<AnnounceSendResult> {
  const now = nowOf(opts?.now);
  const stop = () => opts?.signal?.aborted === true || (typeof opts?.deadlineMs === "number" && Date.now() >= opts.deadlineMs);
  let out: AnnounceSendResult | null = null;
  try {
    const tenantId = isRec(ctx) && isStr(ctx.tenantId) ? ctx.tenantId : "";
    const announcementId = isRec(i) && isStr(i.announcementId) ? i.announcementId : "";
    if (!tenantId || !ID_RE.test(announcementId)) return result("NOT_FOUND");
    const a = await announceForSend(tenantId, announcementId);
    if (!a) return result("NOT_FOUND");
    if (!a.publishedAt) return result("NOT_PUBLISHED");
    const s = await resolveSettings({ tenantId }, ["rooms.notify.announceLine"], { unitId: a.unitId });
    if (s["rooms.notify.announceLine"]?.value === false) return result("DISABLED");
    const tpl = await announceTemplate(tenantId, a.unitId);
    if (announceSendBlocked(tpl, a)) {
      await announceAuditOnce(tenantId, a.unitId, ANNOUNCE_BLOCKED_ACTION, a.id); // F2: ครั้งเดียวต่อประกาศ
      return result("TEMPLATE_BLOCKED");
    }
    const people = await announceRecipients(tenantId, a, now);
    out = result("DONE", people.length);
    if (!people.length) await announceAuditOnce(tenantId, a.unitId, ANNOUNCE_IDLE_ACTION, a.id); // งานส่งซ้ำไม่วนหยิบประกาศที่ไม่มีผู้รับ
    for (const p of people) {
      if (stop()) break;
      try {
        const url = await announcementPortalUrl({ tenantId }, { leaseId: p.leaseId, announcementId: a.id }, { now });
        const dedupeKey = `${LOG_PREFIX}${a.id}:${p.canonicalPartyId}`;
        const r = await notifyCustomer(
          { tenantId },
          {
            unitId: a.unitId,
            domain: "rooms",
            messageKey: "announcement",
            partyId: p.partyId,
            vars: { unitName: a.unitName, title: a.title, body: a.body },
            buttons: url.startsWith("https://") ? [{ label: BUTTON_LABEL, kind: "uri", data: url }] : undefined,
            dedupeKey,
            at: now,
            precheck: () => stillSendable(tenantId, a.unitId, p.leaseId, a.id, now),
          },
        );
        if (r.duplicate) {
          out.duplicate++;
          continue;
        }
        // NO_CHANNEL ไม่มีผู้ติดต่อ ⇒ notifyCustomer ปิดแถวด้วย partyId ว่าง — เติม Party (id ล้วน) ให้แถวเป็นรายชื่อผู้รับ
        await announceStampLogParty(tenantId, a.unitId, dedupeKey, p.partyId);
        if (r.precheckFailed !== undefined || r.code === "QUOTA" || r.status === "NO_CHANNEL" || r.status === "SKIPPED_CONSENT") out.noLine++;
        else if (r.status === "SENT") out.sent++;
        else if (r.status === "SKIPPED_QUIET") out.quiet++;
        else out.failed++;
      } catch (e) {
        out.failed++;
        console.error("[dorm.announce] send one", errName(e));
      }
    }
    return out;
  } catch (e) {
    console.error("[dorm.announce] send", errName(e));
    const r = out ?? result("DONE");
    return { ...r, failed: r.failed + 1 };
  }
}

/** ส่งซ้ำจากจอพนักงาน — ด่าน §3.2 (dorm.announce + ขอบเขตอาคาร) · คนที่ได้แล้วไม่ได้ซ้ำ */
export async function resendDormAnnouncement(
  ctx: { tenantId: string; actorUserId: string },
  i: { unitId: string; announcementId: string },
  opts?: { now?: Date },
): Promise<({ ok: true } & AnnounceSendResult) | { ok: false; code: "NOT_FOUND"; reason: string }> {
  const g = await announceStaffGate(ctx, i);
  if (!g.ok) return g;
  const r = await sendDormAnnouncement({ tenantId: g.tenantId }, { announcementId: g.announcementId }, opts);
  return { ok: true, ...r };
}

/** consumer ของ dorm.announcement.published — ไม่ throw (ส่งซ้ำผ่าน runDormAnnounceJobs) */
export async function onDormAnnouncementPublished(evt: { id: string; tenantId: string; type: string; payload: unknown; unitId: string | null }): Promise<void> {
  try {
    if (!isRec(evt) || evt.type !== EVENT || !isStr(evt.tenantId)) return;
    const p = isRec(evt.payload) ? evt.payload : {};
    if (!isStr(p.announcementId)) return;
    await sendDormAnnouncement({ tenantId: evt.tenantId }, { announcementId: p.announcementId }, { now: new Date() });
  } catch (e) {
    console.error("[dorm.announce] published", errName(e));
  }
}

/**
 * งานส่งซ้ำ (minute-job dorm.announce ทุก 5 นาที) — F1: วนทีละหน้า keyset จนหมดงบ/หมดงาน
 *   ลำดับ: ประกาศที่มีคนรอ (SKIPPED_QUIET/FAILED) ก่อน → ประกาศที่ยังไม่เคยส่ง (consumer ล้ม) · ประกาศใน 3 วันตาม publishedAt
 *   ตัดหน่วยที่ปิด LINE ประกาศ + ประกาศที่ถูกบล็อก/ไม่มีผู้รับออกในคิวรี · ซ้อนกันกี่รอบ = ข้อความเดียวต่อคน (dedupe ของ notifyCustomer · X5)
 *   คืนจำนวน SENT · เคารพ budgetMs/signal ทั้งระหว่างประกาศและระหว่างผู้รับ (F4)
 */
export async function runDormAnnounceJobs(now: Date, opts?: { tenantId?: string; budgetMs?: number; signal?: AbortSignal }): Promise<{ resent: number }> {
  const t0 = Date.now();
  const out = { resent: 0 };
  const budget = typeof opts?.budgetMs === "number" && opts.budgetMs > 0 ? opts.budgetMs : 120_000;
  const deadlineMs = t0 + budget;
  const left = () => (opts?.signal?.aborted ? 0 : deadlineMs - Date.now());
  const at = nowOf(now);
  const since = new Date(at.getTime() - RESEND_WINDOW_MS);
  const tid = isStr(opts?.tenantId) ? opts.tenantId : null;
  try {
    for (const phase of ["RETRY", "FRESH"] as const) {
      let cursor: AnnounceCursor | null = null;
      while (left() > 0) {
        const rows = await announceResendCandidates(at, since, tid, phase, cursor, JOB_PAGE);
        if (!rows.length) break;
        for (const r of rows) {
          if (left() <= 0) break;
          const s = await sendDormAnnouncement({ tenantId: r.tenantId }, { announcementId: r.announcementId }, { now: at, signal: opts?.signal, deadlineMs });
          out.resent += s.sent;
        }
        const last = rows[rows.length - 1]!;
        cursor = { publishedAt: last.publishedAt, id: last.announcementId };
        if (rows.length < JOB_PAGE) break;
      }
    }
  } catch (e) {
    console.error("[dorm.announce] jobs", errName(e));
  }
  return out;
}

// ───────────────────────── ด่าน token (X7) ─────────────────────────
type Gate = { ok: true; lease: PortalLeaseRow } | { ok: false; code: "RATE_LIMITED" | "NOT_FOUND" };

/** ข้อ 1–3: rate (ถังร่วม D.9) → verifyLink → สัญญา live (วิ่งคิวรีสัญญาเสมอ แม้ token ล้ม) */
async function gateLease(token: unknown, opts: PortalOpts, now: Date): Promise<Gate> {
  const rl = await checkRateLimitDb(`dorm:portal:view:${keyOf(opts?.clientKey)}`, PORTAL_RATE.view, now.getTime());
  if (!rl.ok) return { ok: false, code: "RATE_LIMITED" };
  const v = verifyLink(token, DORM_PORTAL_PURPOSE);
  const lease = await portalLiveLease(v?.tenantId ?? "", v?.subjectId ?? "", bkkYmd(now));
  if (!v || !lease || lease.tenantId !== v.tenantId || lease.id !== v.subjectId) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, lease };
}

/** หน้าประกาศของผู้เช่า — ล้มทุกกรณี ⇒ null (หน้าเรียก notFound()) · ไม่เขียนอะไร (นอกจากถังนับ rate) */
export async function loadPortalAnnouncements(token: string, q: { a?: string | null }, opts: PortalOpts): Promise<PortalNewsView | null> {
  try {
    const now = nowOf(opts?.now);
    const g = await gateLease(token, opts, now);
    if (!g.ok) return null;
    const want = isRec(q) && typeof q.a === "string" && q.a ? q.a : null;
    const ref = leaseRef(g.lease);
    let detail: PortalNewsView["detail"] = null;
    if (want !== null) {
      const [d] = await announceVisibleForLease(ref, now, { only: want, limit: 1 });
      if (!d) return null;
      detail = { id: d.id, title: d.title, body: d.body, publishedLabel: announceDateLabel(d.publishedAt) };
    }
    const rows = await announceVisibleForLease(ref, now, { limit: PORTAL_MAX });
    return {
      unitName: g.lease.unitName,
      roomNumber: g.lease.roomNumber,
      items: rows.map((r) => ({ id: r.id, title: r.title, publishedAt: r.publishedAt.toISOString(), publishedLabel: announceDateLabel(r.publishedAt), current: r.id === detail?.id })),
      detail,
      links: { self: `/d/${token}/news`, portal: `/d/${token}` },
    };
  } catch (e) {
    console.error("[dorm.announce] load", errName(e));
    return null;
  }
}

/** บันทึกว่าอ่านแล้ว (action ฝั่งเบราว์เซอร์) — ต่อคน (Party ตัวจริง) · พร้อมกัน/หลายโพรเซส/2 สัญญาของคนเดียว = แถวเดียว */
export async function markPortalAnnouncementRead(
  token: string,
  i: { announcementId: string },
  opts: PortalOpts,
): Promise<{ ok: true; counted: boolean } | { ok: false; code: "NOT_FOUND" | "RATE_LIMITED" }> {
  try {
    const now = nowOf(opts?.now);
    const g = await gateLease(token, opts, now);
    if (!g.ok) return g.code === "RATE_LIMITED" ? { ok: false, code: "RATE_LIMITED" } : { ok: false, code: "NOT_FOUND" };
    const id = isRec(i) && typeof i.announcementId === "string" ? i.announcementId : "";
    const ref = leaseRef(g.lease);
    const [a] = await announceVisibleForLease(ref, now, { only: id, limit: 1 });
    if (!a) return { ok: false, code: "NOT_FOUND" };
    return { ok: true, counted: await announceMarkRead(ref, a.id) };
  } catch (e) {
    console.error("[dorm.announce] read", errName(e));
    return { ok: false, code: "NOT_FOUND" };
  }
}

// ───────────────────────── เมนู LINE "ประกาศ" ─────────────────────────

/** คำตอบ postback dorm.announce: ประกาศที่สัญญาใดของผู้กดเห็น ≤ 3 ฉบับล่าสุด (ลิงก์ของสัญญาที่เห็น) · ไม่มี ⇒ ข้อความคงที่ · ไม่เขียนอะไร */
export async function dormAnnounceMenuReply(
  ctx: { tenantId: string },
  leases: { id: string; unitId: string; roomId: string; roomNumber: string; unitName: string; partyId: string }[],
  opts?: { now?: Date },
): Promise<{ text: string }> {
  try {
    const now = nowOf(opts?.now);
    const tenantId = isRec(ctx) && isStr(ctx.tenantId) ? ctx.tenantId : "";
    if (!tenantId || !Array.isArray(leases)) return { text: MENU_EMPTY };
    const seen = new Map<string, { leaseId: string; title: string; at: Date }>();
    for (const l of leases.slice(0, 20)) {
      const live = isRec(l) && isStr(l.id) ? await portalLiveLease(tenantId, l.id, bkkYmd(now)) : null;
      if (!live) continue;
      for (const r of await announceVisibleForLease(leaseRef(live), now, { limit: MENU_MAX })) if (!seen.has(r.id)) seen.set(r.id, { leaseId: live.id, title: r.title, at: r.publishedAt });
    }
    const top = [...seen.entries()].sort((x, y) => y[1].at.getTime() - x[1].at.getTime() || (x[0] < y[0] ? 1 : -1)).slice(0, MENU_MAX);
    if (!top.length) return { text: MENU_EMPTY };
    const rows: string[] = [];
    for (const [id, r] of top) {
      const url = await announcementPortalUrl({ tenantId }, { leaseId: r.leaseId, announcementId: id }, { now });
      rows.push(`${r.title} · ${announceDateLabel(r.at)}${url ? `\n${url}` : ""}`);
    }
    return { text: `ประกาศล่าสุดจากหอ — เปิดลิงก์เพื่ออ่านรายละเอียด\n\n${rows.join("\n\n")}` };
  } catch (e) {
    console.error("[dorm.announce] menu", errName(e));
    return { text: MENU_EMPTY };
  }
}
