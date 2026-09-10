// chat-bridge.ts — สะพาน "แชท ↔ สมาชิก" (WO M1.12 · พิมพ์เขียว docs/modules/06-member-v2.md §3.14 §5.11 §7.1 §9.3 · ภาพ 26 · 28)
//
// สิ่งที่ไฟล์นี้เป็นเจ้าของ
//   • `linkContact`   — ผูกห้องแชท (ChatContact.id) เข้ากับสมาชิก: อัตโนมัติ (เบอร์→อีเมล→id ช่องทางเดิม)
//                       หรือเลือกมือ (MANUAL — คนกดเลือกจาก candidates) · เขียน event `chat.contact.linked`
//   • `chatPanelFor`  — DTO ของแผงข้าง "สมาชิก" ในห้องแชท (ภาพ 26): การ์ดย่อ/ตัวเลข/ช่องทางที่ผูก/สิทธิ์/
//                       ประวัติ/ฟิลด์ที่ร้านตั้งโชว์บนการ์ด หรือถ้ายังไม่ผูก = candidates + คนคนเดียวกันที่ช่องอื่น
//   • `registerFromChat` — สมัครสมาชิกใหม่จากห้องแชทโดยตรง (ที่มา CHAT/LINE_OA) แล้วผูกมือให้ทันที
//
// กติกาประจำไฟล์
//   • F2: โมดูลสมาชิกห้าม import `@/lib/modules/chat/*` (ไม่มี edge "member→chat" ใน fitness.mts)
//     ⇒ ไฟล์นี้แตะได้แค่ตาราง Chat* ผ่าน prisma ดิบ (`./db`) เท่านั้น ห้ามเรียกฟังก์ชันของโมดูลแชท
//   • D18 (ตัวตนหลายช่องทาง): การจับคู่อัตโนมัติใช้ `profile.linkIdentity` เป็นแหล่งความจริงเดียว
//     (เบอร์ → อีเมล → id ช่องทาง) — ไฟล์นี้ไม่ก๊อปกติกาจับคู่มาเขียนซ้ำ (กฎเหล็ก "ห้าม fork logic")
//   • MANUAL (เลือกจาก candidates ด้วยมือ) ไม่ผ่าน `linkIdentity` (นั่นคือการจับคู่ "อัตโนมัติ" เท่านั้น)
//     — เขียนตรงในไฟล์นี้ ในทรานแซกชันเดียว
//   • ข้อความ error ทุกตัวเป็นภาษาไทยและไม่โทษผู้ใช้ (§6.4)

import type { MemberStatus } from "@prisma/client";
import { emitOutbox } from "@/lib/core/outbox";
import { chatChannelToKey, getChannel, type ChannelKey } from "@/lib/core/channels";
import { prisma } from "./db";
import { canReadMember, type MemberActor } from "./access";
import { MemberForbiddenError, MemberInputError, MemberNotFoundError } from "./errors";
import type { MemberCtx } from "./privacy";
import * as fields from "./fields";
import {
  briefFor,
  createMember,
  displayOf,
  linkIdentity,
  listIdentities,
  maskPhone,
  type CreateMemberResult,
  type MemberBrief,
  type MemberIdentityDto,
} from "./profile";
import { benefitsFor, type BenefitsDto } from "./tiers";

function trimOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type ChatContactRow = Awaited<ReturnType<typeof loadContact>>;

async function loadContact(ctx: MemberCtx, contactId: string) {
  const row = await prisma.chatContact.findFirst({ where: { id: contactId, tenantId: ctx.tenantId } });
  if (!row) throw new MemberNotFoundError("ไม่พบห้องแชทนี้ในร้าน (อาจถูกลบไปแล้ว)");
  return row;
}

// ───────────────────────── linkContact (§9.3 · D18) ─────────────────────────

export type LinkContactInput = {
  contactId: string;
  /** ระบุเมื่อผู้ใช้เลือกสมาชิกเอง (เช่น จาก candidates หรือ "ผูกรวม") — ไม่ระบุ = จับคู่อัตโนมัติ */
  customerId?: string | null;
  method?: "AUTO" | "MANUAL";
};

export type LinkContactResult = {
  customerId: string | null;
  matchedBy: "PHONE" | "EMAIL" | "CHANNEL_ID" | "MANUAL" | null;
  candidates: MemberBrief[];
};

/** เขียน event `chat.contact.linked` (ลง 3 ทะเบียน — ดู outbox-consumers.ts/automation/labels.ts) */
async function emitChatContactLinked(
  ctx: MemberCtx,
  input: { contactId: string; partyId: string | null; customerId: string; method: string },
): Promise<void> {
  await emitOutbox(prisma, {
    tenantId: ctx.tenantId,
    type: "chat.contact.linked",
    idempotencyKey: `chat.contact.linked#${input.contactId}#${Date.now()}#${Math.random().toString(36).slice(2, 8)}`,
    payload: { contactId: input.contactId, partyId: input.partyId, customerId: input.customerId, method: input.method },
    systemId: ctx.systemId,
  });
}

/** ผูก MANUAL: คนกดเลือกสมาชิกเอง (candidates / "ผูกรวม") — เขียนตรง ไม่ผ่าน `linkIdentity` (นั่นคือกติกาอัตโนมัติ) */
async function linkManual(
  ctx: MemberCtx,
  contact: ChatContactRow,
  customerId: string,
): Promise<LinkContactResult> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId: ctx.tenantId, memberSystemId: ctx.systemId, status: { not: "MERGED" as MemberStatus } },
    select: { id: true, partyId: true },
  });
  if (!customer) throw new MemberNotFoundError("ไม่พบสมาชิกที่จะผูก (อาจถูกลบหรือรวมไปแล้ว)");

  const channel = chatChannelToKey(contact.channel);
  const externalId = contact.externalUserId;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.memberChannelIdentity.findFirst({ where: { tenantId: ctx.tenantId, channel, externalId } });
    if (existing) {
      await tx.memberChannelIdentity.update({
        where: { id: existing.id },
        data: { customerId: customer.id, contactId: contact.id, linkedBy: "MANUAL", lastSeenAt: now },
      });
    } else {
      await tx.memberChannelIdentity.create({
        data: {
          tenantId: ctx.tenantId,
          customerId: customer.id,
          channel,
          externalId,
          displayName: contact.displayName,
          contactId: contact.id,
          verified: false,
          linkedBy: "MANUAL",
          linkedAt: now,
          lastSeenAt: now,
        },
      });
    }
    await tx.chatContact.update({
      where: { id: contact.id },
      data: { customerId: customer.id, partyId: customer.partyId, linkedBy: "MANUAL", linkedAt: now },
    });
    await emitOutbox(tx, {
      tenantId: ctx.tenantId,
      type: "chat.contact.linked",
      idempotencyKey: `chat.contact.linked#${contact.id}#${now.getTime()}`,
      payload: { contactId: contact.id, partyId: customer.partyId, customerId: customer.id, method: "MANUAL" },
      systemId: ctx.systemId,
    });
  });

  return { customerId: customer.id, matchedBy: "MANUAL", candidates: [] };
}

/**
 * ผูกห้องแชท (ChatContact) เข้ากับสมาชิก (§9.3 · D18)
 *
 * - มี `customerId`/`method: "MANUAL"` → ผูกตามที่เลือกตรง ๆ (ข้ามการจับคู่อัตโนมัติ)
 * - ไม่ระบุ → idempotent: ห้องนี้ผูกอยู่แล้ว (ChatContact.customerId) → คืนค่าเดิมทันที ไม่เขียนซ้ำ ไม่ยิง event ซ้ำ
 *   ยังไม่ผูก → จับคู่อัตโนมัติผ่าน `linkIdentity` (เบอร์ → อีเมล → id ช่องทางเดิม) แล้วยิง `chat.contact.linked` ต่อ
 */
export async function linkContact(ctx: MemberCtx, input: LinkContactInput): Promise<LinkContactResult> {
  const contact = await loadContact(ctx, input.contactId);
  const forcedCustomerId = trimOrNull(input.customerId);

  if (input.method === "MANUAL" || forcedCustomerId) {
    if (!forcedCustomerId) throw new MemberInputError("เลือกผูกด้วยมือต้องระบุสมาชิกที่จะผูกด้วย");
    return linkManual(ctx, contact, forcedCustomerId);
  }

  // idempotent — ห้องนี้ผูกอยู่แล้ว (เรียกซ้ำจากข้อความถัดไปในห้องเดิม) ไม่ต้องจับคู่ใหม่/ยิง event ซ้ำ
  if (contact.customerId) {
    return { customerId: contact.customerId, matchedBy: "CHANNEL_ID", candidates: [] };
  }

  const channel = chatChannelToKey(contact.channel);
  const r = await linkIdentity(ctx, {
    channel,
    externalId: contact.externalUserId,
    phone: contact.phone,
    email: contact.email,
    displayName: contact.displayName,
    contactId: contact.id,
  });
  if (!r.customerId || !r.matchedBy) {
    return { customerId: null, matchedBy: null, candidates: r.candidates };
  }
  const customer = await prisma.customer.findFirst({ where: { id: r.customerId }, select: { partyId: true } });
  await emitChatContactLinked(ctx, { contactId: contact.id, partyId: customer?.partyId ?? null, customerId: r.customerId, method: r.matchedBy });
  return { customerId: r.customerId, matchedBy: r.matchedBy, candidates: [] };
}

// ───────────────────────── chatPanelFor (แผงข้าง — ภาพ 26) ─────────────────────────

export type ChatMemberStatsDto = { points: number; vouchers: number; spent12mSatang: number; lastActivityAt: Date | null };
export type ChatMemberCardFieldDto = { key: string; label: string; display: string };
export type ChatMemberIdentityDto = { channel: string; label: string; current: boolean };
export type ChatMemberQuickActions = { voucher: boolean; points: boolean; stamp: boolean; task: boolean };
export type ChatMemberHistoryItem = { at: Date; type: string; summary: string };

export type ChatMemberInfo = {
  brief: MemberBrief;
  stats: ChatMemberStatsDto;
  identities: ChatMemberIdentityDto[];
  benefits: string[];
  history: ChatMemberHistoryItem[];
  cardFields: ChatMemberCardFieldDto[];
  quickActions: ChatMemberQuickActions;
};

export type ChatPanelResult = {
  linked: boolean;
  /** ระบบสมาชิกที่ผูกกับห้องแชทนี้ — ให้ UI ประกอบลิงก์ "เปิดโปรไฟล์ 360" (`/member/members/{id}`) */
  memberSystemId: string;
  contact: { id: string; channel: string; channelLabel: string; displayName: string | null; phoneMasked: string };
  member?: ChatMemberInfo;
  candidates: MemberBrief[];
  sameIdentityOtherChannel: { channel: string | null; customerId: string; name: string } | null;
};

/** สมาชิกที่ชื่อคล้ายชื่อในห้องแชท (ให้คนเลือกเองเมื่อระบบไม่กล้าเดา) — อ่านอย่างเดียว ไม่มีผลข้างเคียง */
async function nameCandidates(ctx: MemberCtx, actor: MemberActor, displayName: string | null): Promise<MemberBrief[]> {
  const q = (displayName ?? "").trim();
  if (q.length < 2) return [];
  const rows = await prisma.customer.findMany({
    where: {
      tenantId: ctx.tenantId,
      memberSystemId: ctx.systemId,
      status: { not: "MERGED" },
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { firstName: { contains: q, mode: "insensitive" } },
        { nickname: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { id: true },
  });
  return briefFor(ctx, actor, rows.map((r) => r.id));
}

/** สมาชิกอีกคนที่เบอร์/อีเมลตรงกับห้องนี้ แต่ยังไม่ผูกกับห้องนี้ (เสนอ "ผูกรวม") — อ่านอย่างเดียว */
async function sameIdentityMatch(
  ctx: MemberCtx,
  phone: string | null,
  email: string | null,
): Promise<{ id: string; name: string | null; firstName: string | null; lastName: string | null; memberCode: string | null } | null> {
  const base = { tenantId: ctx.tenantId, memberSystemId: ctx.systemId, status: { not: "MERGED" as MemberStatus } };
  if (phone) {
    const row = await prisma.customer.findFirst({ where: { ...base, phone }, select: { id: true, name: true, firstName: true, lastName: true, memberCode: true } });
    if (row) return row;
  }
  if (email) {
    const row = await prisma.customer.findFirst({ where: { ...base, email }, select: { id: true, name: true, firstName: true, lastName: true, memberCode: true } });
    if (row) return row;
  }
  return null;
}

/** DTO ของ "สิทธิประโยชน์ตามระดับ" เป็นข้อความไทยล้วน (จาก tiers.benefitsFor) */
function benefitLines(b: BenefitsDto): string[] {
  const out: string[] = [];
  if (b.discountPct > 0) {
    out.push(
      `ส่วนลด ${b.discountPct}%${b.discountMaxSatang > 0 ? ` (สูงสุด ฿${Math.round(b.discountMaxSatang / 100).toLocaleString("th-TH")})` : ""}`,
    );
  }
  if (b.discountFixedSatang > 0) out.push(`ส่วนลด ฿${Math.round(b.discountFixedSatang / 100).toLocaleString("th-TH")}`);
  if (b.pointMultiplier > 1) out.push(`ได้แต้ม ${b.pointMultiplier} เท่า`);
  if (b.priorityBookingDays > 0) out.push(`จองล่วงหน้าได้ก่อน ${b.priorityBookingDays} วัน`);
  if (b.freeServices.length > 0) out.push(`บริการฟรี ${b.freeServices.length} รายการ`);
  if (b.noPointExpiry) out.push("แต้มไม่มีวันหมดอายุ");
  if (b.cancelFeeDiscountPct > 0) out.push(`ลดค่าธรรมเนียมยกเลิก ${b.cancelFeeDiscountPct}%`);
  if (b.birthdayGift) out.push("ของขวัญวันเกิด");
  return out;
}

/** ฟิลด์ที่ร้านตั้งให้โชว์บนการ์ด (`showOnCard`) พร้อมค่าที่แสดงผล — ว่าง = ไม่เอาลง cardFields */
async function cardFieldsFor(ctx: MemberCtx, customerId: string): Promise<ChatMemberCardFieldDto[]> {
  const [layout, values] = await Promise.all([fields.listLayout(ctx), fields.getFieldValues(ctx, [customerId])]);
  const bag = values[customerId] ?? {};
  const out: ChatMemberCardFieldDto[] = [];
  for (const s of layout.sections) {
    for (const f of s.fields) {
      if (!f.showOnCard) continue;
      const display = displayOf(f, bag[f.key] ?? null);
      if (display) out.push({ key: f.key, label: f.label, display });
    }
  }
  return out;
}

function historyOf(rows: { createdAt: Date; type: string; summary: string }[]): ChatMemberHistoryItem[] {
  return rows.map((r) => ({ at: r.createdAt, type: r.type, summary: r.summary }));
}

function nameOf(row: { name: string | null; firstName: string | null; lastName: string | null; memberCode: string | null }): string {
  return row.name || [row.firstName, row.lastName].filter(Boolean).join(" ") || row.memberCode || "สมาชิก";
}

/**
 * DTO ของแผงข้าง "สมาชิก" ในห้องแชท (ภาพ 26)
 * - ห้องผูกแล้ว → `member` (การ์ดย่อ + ตัวเลข + ช่องทางที่ผูก + สิทธิ์ + ประวัติ 5 รายการล่าสุด + ฟิลด์ที่ตั้งโชว์บนการ์ด)
 * - ยังไม่ผูก → `candidates` (ชื่อคล้าย ≤ 5) + `sameIdentityOtherChannel` (เบอร์/อีเมลตรงกับสมาชิกคนอื่น → เสนอผูกรวม)
 */
export async function chatPanelFor(
  ctx: MemberCtx,
  actor: MemberActor,
  input: { conversationId: string },
): Promise<ChatPanelResult> {
  if (!canReadMember(actor)) throw new MemberForbiddenError("บัญชีของคุณยังไม่ได้รับสิทธิ์ดูข้อมูลสมาชิก — ขอสิทธิ์จากเจ้าของร้านก่อน");
  const conv = await prisma.chatConversation.findFirst({ where: { id: input.conversationId, tenantId: ctx.tenantId } });
  if (!conv) throw new MemberNotFoundError("ไม่พบห้องแชทนี้");
  const contact = await loadContact(ctx, conv.contactId);
  const channelKey: ChannelKey = chatChannelToKey(contact.channel);

  const contactDto = {
    id: contact.id,
    channel: channelKey,
    channelLabel: getChannel(channelKey)?.label ?? channelKey,
    displayName: contact.displayName,
    phoneMasked: maskPhone(contact.phone),
  };

  if (contact.customerId) {
    const [brief, identities, benefits, cardFields, history] = await Promise.all([
      briefFor(ctx, actor, [contact.customerId]),
      listIdentities(ctx, contact.customerId),
      benefitsFor(ctx, contact.customerId).catch(() => null),
      cardFieldsFor(ctx, contact.customerId).catch(() => []),
      prisma.memberActivity.findMany({
        where: { tenantId: ctx.tenantId, customerId: contact.customerId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { createdAt: true, type: true, summary: true },
      }),
    ]);
    const customer = await prisma.customer.findFirst({
      where: { id: contact.customerId },
      select: { spent12mSatang: true, lastActivityAt: true },
    });
    if (!brief[0] || !customer) throw new MemberNotFoundError("ไม่พบสมาชิกที่ผูกกับห้องนี้ (อาจถูกลบไปแล้ว)");

    const identityDtos: ChatMemberIdentityDto[] = (identities as MemberIdentityDto[]).map((i) => ({
      channel: i.channel,
      label: i.channelLabel,
      current: i.channel === channelKey && i.externalId === contact.externalUserId,
    }));

    const member: ChatMemberInfo = {
      brief: brief[0],
      stats: {
        points: brief[0].points,
        vouchers: 0, // M2.5 ยังไม่มีตาราง voucher — เหมือนกติกาเดียวกับ Member360.stats
        spent12mSatang: Number(customer.spent12mSatang),
        lastActivityAt: customer.lastActivityAt,
      },
      identities: identityDtos,
      benefits: benefits ? benefitLines(benefits) : [],
      history: historyOf(history),
      cardFields,
      quickActions: { voucher: false, points: false, stamp: false, task: true },
    };
    return { linked: true, memberSystemId: ctx.systemId, contact: contactDto, member, candidates: [], sameIdentityOtherChannel: null };
  }

  const [candidates, match] = await Promise.all([
    nameCandidates(ctx, actor, contact.displayName),
    sameIdentityMatch(ctx, contact.phone, contact.email),
  ]);
  let sameIdentityOtherChannel: ChatPanelResult["sameIdentityOtherChannel"] = null;
  if (match) {
    const otherIdentity = await prisma.memberChannelIdentity.findFirst({
      where: { tenantId: ctx.tenantId, customerId: match.id },
      orderBy: { linkedAt: "desc" },
      select: { channel: true },
    });
    sameIdentityOtherChannel = { channel: otherIdentity?.channel ?? null, customerId: match.id, name: nameOf(match) };
  }
  return { linked: false, memberSystemId: ctx.systemId, contact: contactDto, candidates, sameIdentityOtherChannel };
}

// ───────────────────────── registerFromChat (§9.3 "สมัครจากแชท") ─────────────────────────

export type RegisterFromChatInput = {
  contactId: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type RegisterFromChatResult = { customerId: string; memberCode: string };

/**
 * สมัครสมาชิกใหม่จากห้องแชทโดยตรง (พนักงานกด "สมัครใหม่จากแชท" ในแผงข้าง)
 * ที่มา = CHAT ปกติ · ช่องทาง LINE → source พิเศษ `LINE_OA` (ตรงกับที่มาที่ร้านคุ้นเคยอยู่แล้ว)
 * สมัครเสร็จ → ผูกห้องนี้ให้ทันที (MANUAL) ไม่ต้องกดผูกซ้ำ
 */
export async function registerFromChat(
  ctx: MemberCtx,
  actor: MemberActor,
  input: RegisterFromChatInput,
): Promise<RegisterFromChatResult> {
  const contact = await loadContact(ctx, input.contactId);
  const channelKey = chatChannelToKey(contact.channel);
  const source = channelKey === "LINE" ? "LINE_OA" : "CHAT";
  const phone = trimOrNull(input.phone) ?? contact.phone ?? null;
  const email = trimOrNull(input.email) ?? contact.email ?? null;
  const firstName = trimOrNull(input.firstName) ?? trimOrNull(contact.displayName);

  const created: CreateMemberResult = await createMember(ctx, actor, {
    firstName,
    lastName: trimOrNull(input.lastName),
    phone,
    email,
    source,
    sourceChannel: channelKey,
    sourceDetail: { contactId: contact.id },
  });

  await linkManual(ctx, contact, created.customerId);
  return { customerId: created.customerId, memberCode: created.memberCode };
}
