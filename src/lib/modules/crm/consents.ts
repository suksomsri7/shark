// consents.ts — ความยินยอมรายช่องทางของผู้ติดต่อ CRM (ใบ C1.4 · มติ C20 · R-E.11 · พิมพ์เขียว §4.3 §11.4 §11.7)
//
// ของที่ไฟล์นี้เป็นเจ้าของ
//   • `set` — **append-only** ลง CrmContactConsent (ไม่มี update/delete แถวเดิมเด็ดขาด — ประวัติคือหลักฐาน PDPA)
//   • `current` / `history` — สถานะล่าสุดต่อช่องทาง = แถวล่าสุดของช่องทางนั้น
//   • `canContact(contact, channel, {transactional?})` — **ตัวตัดสินตัวเดียว** ที่ผู้ส่งทุกเส้นทางของใบหลังเรียก (อีเมล · LINE ·
//     sequence · กฎอัตโนมัติ · portal) "ตอนส่งจริง" — ห้ามเขียนกติกานี้ซ้ำที่อื่น
// 🔴 แหล่งความจริงแหล่งเดียว (C20): ผู้ติดต่อที่ผูกสมาชิกแล้ว (`memberCustomerId`) อ่าน/เขียน `MemberConsent` ผ่าน facade สมาชิก
//    (`getConsents` / `setConsent`) และ **ไม่เขียน** CrmContactConsent — สองที่เก็บ = วันหนึ่งไม่ตรงกันเงียบ ๆ
// 🔴 ระบบสมาชิกของลูกค้าคนนั้นหาได้ผ่าน facade (`memberRefs` ต่อระบบ MEMBER ของร้าน) — ไม่อ่านตาราง Customer ตรง
// AUDIT-CLASS X8: marketing ต้องมีความยินยอมที่ "ให้ไว้" + ไม่ได้ขอไม่รับ · transactional ข้ามความยินยอม/การขอไม่รับได้
//   แต่ **อีเมลที่เด้ง (emailBouncedAt) = ส่งไม่ได้เสมอ** (มติผู้คุมงาน C1.4 ข้อ 7) · ไม่มีแถวความยินยอม = ไม่ส่ง marketing

import { randomUUID } from "node:crypto";
import type { CrmContact, Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/core/audit";
import { consentChannels, getChannel } from "@/lib/core/channels";
import { emitOutbox } from "@/lib/core/outbox";
import type { MemberActor } from "@/lib/modules/member";
import { prisma } from "./db";
import { contactWhere } from "./where";
import {
  CONSENT_SOURCES,
  ContactsError,
  OPT_OUT_CHANNEL,
  type ConsentHistoryRow,
  type ConsentState,
  type ConsentView,
  type ContactConsentSource,
} from "./contacts-shared";

// facade สมาชิก **โหลดตอนใช้** — crm facade ถูก import จาก account/ทะเบียน AI (วงกลมตอนโหลดไฟล์ = TDZ · เหตุผลเดียวกับ companies.ts)
const memberFacade = () => import("@/lib/modules/member");

export type ConsentsCtx = { tenantId: string; systemId: string; actorUserId?: string | null };
type Tx = Prisma.TransactionClient;
type Db = typeof prisma | Tx;

const NOT_FOUND_MSG = "ไม่พบผู้ติดต่อนี้ในระบบ CRM ที่เปิดอยู่ (อาจถูกลบหรืออยู่คนละระบบ) — รีเฟรชหน้าแล้วลองใหม่";
const fail = (code: ContactsError["code"], message: string) => new ContactsError(code, message);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** ช่องที่ canContact / current ต้องรู้ (รับแถวเต็มของ CrmContact หรือส่วนย่อยที่มีคอลัมน์เหล่านี้) */
export type ContactConsentSubject = Pick<CrmContact, "id" | "tenantId" | "memberCustomerId" | "marketingOptOut" | "emailOptOut" | "emailBouncedAt"> &
  Partial<Pick<CrmContact, "systemId">>;

// ───────────────────────── ขอบเขต ─────────────────────────

async function resolveSystem(ctx: ConsentsCtx): Promise<void> {
  const ok =
    typeof ctx?.systemId === "string" && typeof ctx?.tenantId === "string" && ctx.systemId && ctx.tenantId
      ? await prisma.appSystem.findFirst({ where: { id: ctx.systemId, tenantId: ctx.tenantId, type: "CRM" }, select: { id: true } })
      : null;
  if (!ok) throw fail("NOT_FOUND", "ไม่พบระบบ CRM นี้ในร้านที่เปิดอยู่ — รีเฟรชหน้าแล้วลองใหม่");
}

/** AUDIT-CLASS X1: ผู้ติดต่อ 1 แถวผ่าน contactWhere (ระบบอื่น/ร้านอื่น = NOT_FOUND · ข้อความไม่สะท้อนข้อมูลของเขา) */
async function loadContact(ctx: ConsentsCtx, actor: MemberActor | null | undefined, id: unknown, db: Db = prisma): Promise<CrmContact> {
  if (!actor || actor.role === "CUSTOMER") throw fail("NOT_FOUND", NOT_FOUND_MSG);
  await resolveSystem(ctx);
  const cid = str(id);
  const row = cid ? await db.crmContact.findFirst({ where: { AND: [await contactWhere(ctx, actor, { db }), { id: cid }] } }) : null;
  if (!row) throw fail("NOT_FOUND", NOT_FOUND_MSG);
  return row;
}

/**
 * ระบบสมาชิกของลูกค้าคนนี้ (ถามผ่าน facade ทีละระบบ MEMBER ของร้าน — ร้านส่วนใหญ่มี 1–2 ระบบ)
 * null = ไม่พบในระบบสมาชิกใดของร้าน (ถูกลบตาม PDPA / id เก่า) ⇒ ผู้เรียกถือว่า "ไม่มีความยินยอม"
 */
export async function memberSystemOf(tenantId: string, customerId: string | null | undefined): Promise<{ systemId: string; memberCode: string; name: string } | null> {
  const cid = str(customerId);
  if (!tenantId || !cid) return null;
  const systems = await prisma.appSystem.findMany({ where: { tenantId, type: "MEMBER" }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 20 });
  const m = await memberFacade();
  for (const s of systems) {
    const refs = await m.memberRefs({ tenantId, systemId: s.id, actorUserId: null }, [cid]);
    const hit = refs.find((r) => r.id === cid);
    if (hit) return { systemId: s.id, memberCode: hit.memberCode, name: hit.name };
  }
  return null;
}

function memberError(e: unknown): unknown {
  if (e instanceof ContactsError) return e;
  const name = e instanceof Error ? e.name : "";
  if (name === "MemberNotFoundError") return fail("NOT_FOUND", (e as Error).message);
  if (name === "MemberInputError") return fail("VALIDATION", (e as Error).message);
  if (name === "MemberForbiddenError") return fail("FORBIDDEN", (e as Error).message);
  if (name === "MemberConflictError") return fail("CONFLICT", (e as Error).message);
  return e;
}

/** ช่องทางที่เก็บความยินยอมได้จริง (ทะเบียนกลาง D19 · `canConsent`) — ไม่รู้จัก/เก็บไม่ได้ = VALIDATION */
function consentChannel(raw: unknown): string {
  const key = String(raw ?? "").trim().toUpperCase();
  const def = key ? getChannel(key) : undefined;
  if (!def) throw fail("VALIDATION", `ยังไม่รู้จักช่องทาง "${String(raw ?? "").slice(0, 30)}" — เลือกจากรายการช่องทางของระบบ`);
  if (!def.canConsent) throw fail("VALIDATION", `ช่องทาง "${def.label}" ไม่ได้ใช้ส่งข่าวสารถึงลูกค้าโดยตรง จึงไม่ต้องเก็บความยินยอม — เลือกช่องทางอื่น`);
  return def.key;
}

function consentSource(raw: unknown): ContactConsentSource {
  const s = String(raw ?? "STAFF").trim().toUpperCase() || "STAFF";
  if (!(CONSENT_SOURCES as readonly string[]).includes(s)) throw fail("VALIDATION", `ที่มาของความยินยอม "${s.slice(0, 30)}" ยังไม่อยู่ในรายการของระบบ`);
  return s as ContactConsentSource;
}

/** ที่มาฝั่ง CRM → ที่มาที่ enum ของสมาชิกรับ (ค่าที่ตรงกันส่งตรง · ที่เหลือแปลงตามความหมาย) */
function memberSource(s: ContactConsentSource): string {
  switch (s) {
    case "WEB_FORM":
      return "SIGNUP_FORM";
    case "CHAT":
    case "PORTAL":
    case "UNSUBSCRIBE":
      return "CUSTOMER_SELF";
    default:
      return s;
  }
}

/**
 * AUDIT-CLASS X8: สถานะล่าสุดต่อช่องทางจากแถว CrmContactConsent (ใช้ใน tx ของการแปลงด้วย — R-E.11 คัดลอกครั้งเดียว)
 * ไม่รวมช่องทางเทียมของการขอไม่รับ (OPT_OUT_CHANNEL)
 */
export async function latestCrmStates(db: Db, tenantId: string, contactId: string): Promise<Map<string, { granted: boolean; source: string; at: Date }>> {
  const rows = await db.crmContactConsent.findMany({
    where: { tenantId, contactId, channel: { not: OPT_OUT_CHANNEL } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 500,
  });
  const out = new Map<string, { granted: boolean; source: string; at: Date }>();
  for (const r of rows) if (!out.has(r.channel)) out.set(r.channel, { granted: r.granted, source: r.source, at: r.createdAt });
  return out;
}

// ───────────────────────── set / current / history ─────────────────────────

/**
 * บันทึกความยินยอม 1 ช่องทาง
 * · ผู้ติดต่อที่ยังไม่เป็นสมาชิก ⇒ **เพิ่มแถวใหม่** ใน CrmContactConsent (append-only) + event `crm.contact.updated` ใน tx เดียวกัน
 * · ผู้ติดต่อที่ผูกสมาชิกแล้ว ⇒ เขียน MemberConsent ผ่าน facade สมาชิก (`setConsent`) และ **ไม่มี** แถวฝั่ง CRM
 * AUDIT-CLASS X3 (รีวิว C1.4 S3): ตัดสิน "CRM หรือสมาชิก" **หลังล็อกแถวผู้ติดต่อ** ใน tx — แปลงเป็นสมาชิกพร้อมกันไม่ทำให้เขียนผิดที่
 */
export async function set(
  ctx: ConsentsCtx,
  actor: MemberActor,
  contactId: string,
  input: { channel: string; granted: boolean; source?: string | null; note?: string | null },
): Promise<{ channel: string; granted: boolean; via: "CRM" | "MEMBER" }> {
  const channel = consentChannel(input?.channel);
  const source = consentSource(input?.source);
  const granted = input?.granted === true;
  const note = str(input?.note)?.slice(0, 500) ?? null;
  const contact = await loadContact(ctx, actor, contactId);
  if (contact.mergedIntoId) throw fail("VALIDATION", "ผู้ติดต่อนี้ถูกรวมเข้ากับอีกคนแล้ว — บันทึกความยินยอมที่ผู้ติดต่อที่เก็บไว้แทน");

  const decided = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "CrmContact" WHERE "id" = ${contact.id} AND "tenantId" = ${ctx.tenantId} FOR UPDATE`;
    const pre = await tx.crmContact.findFirst({ where: { id: contact.id, tenantId: ctx.tenantId, systemId: contact.systemId }, select: { memberCustomerId: true, mergedIntoId: true } });
    if (!pre) throw fail("NOT_FOUND", NOT_FOUND_MSG);
    if (pre.mergedIntoId) throw fail("VALIDATION", "ผู้ติดต่อนี้ถูกรวมเข้ากับอีกคนแล้ว — บันทึกความยินยอมที่ผู้ติดต่อที่เก็บไว้แทน");
    if (pre.memberCustomerId) return { member: pre.memberCustomerId };
    await tx.crmContactConsent.create({
      data: {
        tenantId: ctx.tenantId,
        systemId: contact.systemId,
        contactId: contact.id,
        channel,
        granted,
        source,
        note,
        createdById: ctx.actorUserId ?? null,
        // เวลาหลังได้ล็อกแถว (ไม่ใช้ now() ของ Postgres = เวลาเริ่ม tx) ⇒ ลำดับประวัติตรงลำดับที่บันทึกจริง
        createdAt: new Date(),
      },
    });
    // AUDIT-CLASS X4: event ใน tx ของการเขียน · key `crm.contact.updated#<id>#<seq>` (R-C.8) · payload id/คีย์ล้วน
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      systemId: contact.systemId,
      type: "crm.contact.updated",
      idempotencyKey: `crm.contact.updated#${contact.id}#${randomUUID().replace(/-/g, "")}`,
      payload: { contactId: contact.id, changedKeys: ["consent"], channel },
    });
    return { member: null as string | null };
  });

  if (decided.member) {
    const sys = await memberSystemOf(ctx.tenantId, decided.member);
    if (!sys) throw fail("CONFLICT", "ผู้ติดต่อนี้ผูกกับสมาชิกที่ไม่พบในระบบสมาชิกแล้ว — ตรวจการผูกสมาชิกก่อนบันทึกความยินยอม");
    try {
      await (await memberFacade()).setConsent(
        { tenantId: ctx.tenantId, systemId: sys.systemId, actorUserId: ctx.actorUserId ?? actor.userId ?? null },
        actor,
        decided.member,
        { channel, granted, source: memberSource(source) },
      );
    } catch (e) {
      throw memberError(e);
    }
    return { channel, granted, via: "MEMBER" };
  }
  await writeAudit({
    tenantId: ctx.tenantId,
    actorId: ctx.actorUserId ?? null,
    action: "crm.contact.consent",
    targetType: "CrmContact",
    targetId: contact.id,
    after: { channel, granted, source },
  });
  return { channel, granted, via: "CRM" };
}

/**
 * B1 (รีวิว C1.4 · C20 "เข้มสุดชนะ"): ช่องทางที่ผู้ติดต่อคนนี้ **ถอน/ไม่รับ** ฝั่ง CRM — แถวล่าสุดที่ granted=false ·
 * `marketingOptOut` ⇒ ทุกช่องทางที่เก็บความยินยอมได้ · `emailOptOut` ⇒ EMAIL
 * ใช้ตอนผู้ติดต่อกลายเป็น/ถูกรวมกับสมาชิก — ช่องทางเหล่านี้ต้องถูกถอนฝั่งสมาชิกด้วย (ไม่มีวัน "ให้" แทนลูกค้า)
 */
export async function crmRevocations(
  db: Db,
  tenantId: string,
  contact: { id: string; marketingOptOut: boolean; emailOptOut: boolean },
): Promise<string[]> {
  const out = new Set<string>();
  for (const [channel, s] of await latestCrmStates(db, tenantId, contact.id)) if (!s.granted) out.add(channel);
  if (contact.marketingOptOut) for (const d of consentChannels()) out.add(d.key);
  if (contact.emailOptOut) out.add("EMAIL");
  return [...out].sort();
}

/**
 * ถอนความยินยอมของสมาชิกผ่าน facade สมาชิก (`setConsent` granted=false · ที่มา STAFF) — **ถอนอย่างเดียว ไม่เคยให้**
 * ช่องทางที่สมาชิกถอนไว้แล้วไม่เขียนซ้ำ · idempotent
 * · `opts.tx` (มติผู้คุมงาน C1.4 — atomic): อ่าน/เขียนใน transaction ของผู้เรียก · ถอนช่องไหนไม่ได้ = **โยน** (ผู้เรียก rollback ทั้งก้อน) ·
 *   ผู้เรียกต้องส่ง `memberSystemId` มาเอง (หาไว้ก่อนเปิด tx — ไม่เปิด connection ที่สองระหว่างถือล็อก) · ลำดับล็อก: แถว CrmContact → แถว Customer
 * · ไม่ส่ง tx (setOptOut — ถอนก่อนบันทึกฝั่ง CRM): คืนช่องทางที่ถอนไม่สำเร็จให้ผู้เรียกตัดสิน · สมาชิกหาไม่พบ = ทุกช่องทางไม่สำเร็จ
 */
export async function revokeOnMember(
  ctx: ConsentsCtx,
  actor: MemberActor,
  customerId: string,
  channels: readonly string[],
  opts: { tx?: Tx; memberSystemId?: string | null } = {},
): Promise<{ revoked: string[]; failed: string[] }> {
  const want = [...new Set(channels)].filter((c) => getChannel(c)?.canConsent);
  if (want.length === 0) return { revoked: [], failed: [] };
  const systemId = opts.memberSystemId ?? (opts.tx ? null : (await memberSystemOf(ctx.tenantId, customerId))?.systemId ?? null);
  if (!systemId) {
    if (opts.tx) throw fail("CONFLICT", "ไม่พบสมาชิกที่ผูกไว้ในระบบสมาชิก จึงถอนความยินยอมไม่ได้ — ระบบยกเลิกรายการทั้งหมดให้แล้ว (ข้อมูลไม่เปลี่ยน)");
    return { revoked: [], failed: want };
  }
  const m = await memberFacade();
  const mctx = { tenantId: ctx.tenantId, systemId, actorUserId: ctx.actorUserId ?? actor.userId ?? null };
  const current = new Map((await m.getConsents(mctx, customerId, opts.tx)).map((r) => [r.channel, r.granted]));
  const revoked: string[] = [];
  const failed: string[] = [];
  for (const channel of want) {
    if (current.get(channel) === false) continue;
    if (opts.tx) {
      await m.setConsent(mctx, actor, customerId, { channel, granted: false, source: "STAFF" }, opts.tx);
      revoked.push(channel);
      continue;
    }
    try {
      await m.setConsent(mctx, actor, customerId, { channel, granted: false, source: "STAFF" });
      revoked.push(channel);
    } catch {
      failed.push(channel);
    }
  }
  return { revoked, failed };
}

async function channelsOf(tenantId: string, contact: ContactConsentSubject): Promise<{ memberLinked: boolean; channels: ConsentState[] }> {
  const defs = consentChannels();
  if (contact.memberCustomerId) {
    const sys = await memberSystemOf(tenantId, contact.memberCustomerId);
    if (!sys) return { memberLinked: true, channels: defs.map((d) => ({ channel: d.key, label: d.label, granted: null, source: null, at: null })) };
    const rows = await (await memberFacade()).getConsents({ tenantId, systemId: sys.systemId, actorUserId: null }, contact.memberCustomerId);
    const byKey = new Map(rows.map((r) => [r.channel, r]));
    return {
      memberLinked: true,
      channels: defs.map((d) => {
        const r = byKey.get(d.key);
        return { channel: d.key, label: d.label, granted: r?.granted ?? null, source: r?.source ?? null, at: r?.grantedAt ?? r?.revokedAt ?? null };
      }),
    };
  }
  const latest = await latestCrmStates(prisma, tenantId, contact.id);
  return {
    memberLinked: false,
    channels: defs.map((d) => {
      const r = latest.get(d.key);
      return { channel: d.key, label: d.label, granted: r ? r.granted : null, source: r?.source ?? null, at: r?.at ?? null };
    }),
  };
}

/** สถานะปัจจุบันต่อช่องทาง (+ ธงขอไม่รับ/อีเมลเด้ง) — ผู้ติดต่อที่ผูกสมาชิกอ่านจาก MemberConsent ที่เดียว */
export async function current(ctx: ConsentsCtx, actor: MemberActor, contactId: string): Promise<ConsentView> {
  const contact = await loadContact(ctx, actor, contactId);
  const { memberLinked, channels } = await channelsOf(ctx.tenantId, contact);
  return { memberLinked, optOut: contact.marketingOptOut, emailBounced: !!contact.emailBouncedAt, channels };
}

/** ประวัติ (ใหม่สุดก่อน) — แถว CrmContactConsent ของผู้ติดต่อนี้ (รวมแถวขอไม่รับเมื่อไม่ระบุช่องทาง) */
export async function history(ctx: ConsentsCtx, actor: MemberActor, contactId: string, channel?: string | null): Promise<ConsentHistoryRow[]> {
  const contact = await loadContact(ctx, actor, contactId);
  const ch = str(channel)?.toUpperCase() ?? null;
  const rows = await prisma.crmContactConsent.findMany({
    where: { tenantId: ctx.tenantId, contactId: contact.id, ...(ch ? { channel: ch } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  return rows.map((r) => ({ id: r.id, channel: r.channel, granted: r.granted, source: r.source, note: r.note, createdAt: r.createdAt, createdById: r.createdById }));
}

/**
 * ส่งหาผู้ติดต่อคนนี้ทางช่องทางนี้ได้ไหม — ผู้ส่งทุกตัวเรียก "ตอนส่งจริง" (ไม่ใช่ตอนตั้งคิว)
 *   1) EMAIL ที่เคยเด้ง ⇒ ไม่ได้เสมอ (รวม transactional)
 *   2) transactional (ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ · เชิญ/OTP พอร์ทัล · ตอบในเธรดที่ลูกค้าเริ่ม — R-E.11) ⇒ ได้
 *   3) marketing: ขอไม่รับ (marketingOptOut · emailOptOut สำหรับอีเมล) ⇒ ไม่ได้
 *   4) marketing: ต้องมีความยินยอมที่ "ให้ไว้" ของช่องทางนั้น (ผูกสมาชิก ⇒ MemberConsent · ไม่ผูก ⇒ แถวล่าสุดของ CrmContactConsent)
 */
export async function canContact(contact: ContactConsentSubject, channel: string, opts: { transactional?: boolean } = {}): Promise<boolean> {
  if (!contact || !contact.id || !contact.tenantId) return false;
  const ch = String(channel ?? "").trim().toUpperCase();
  const def = getChannel(ch);
  if (!def) return false;
  if (ch === "EMAIL" && contact.emailBouncedAt) return false;
  if (opts?.transactional === true) return true;
  if (contact.marketingOptOut) return false;
  if (ch === "EMAIL" && contact.emailOptOut) return false;
  if (!def.canConsent) return false;
  const { channels } = await channelsOf(contact.tenantId, contact);
  return channels.find((c) => c.channel === ch)?.granted === true;
}
