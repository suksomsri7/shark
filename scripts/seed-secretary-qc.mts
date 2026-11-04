// seed-secretary-qc.mts — ร้านตัวอย่างของ RUN "เลขา AI" (ใบ S0.3) บนฐาน QC ของเลขา (wo-sec-qc)
//
// ใช้ (ผู้เรียกครอบล็อกคิวของ RUN เอง — seed ไม่ถือล็อก):
//   bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/seed-secretary-qc.mts
//
// สร้างอะไร (สัญญาทั้งหมดอยู่ที่ `scripts/sec-qc-data.mts` · SEC — แก้ที่นั่นที่เดียว):
//   • ร้าน A `secqc-tenant` (slug sec-qc) + ระบบ POS CRM MEMBER ACCOUNT KANBAN CHAT (แถว AppSystem ล้วน)
//   • ผู้ใช้ 5 คนของร้าน A (เจ้าของ · ผู้จัดการ · พนักงาน 3) + ร้าน B `secqc-tenant-b` เจ้าของคนละคน
//   • ห้องงาน AI 6 ห้อง (id ออกด้วย newConversationId · จับคู่ห้องเดิมด้วย ผู้สร้าง+ชื่อห้อง) + ข้อความ + ข้อเสนอ PENDING/EXECUTED
//   • แชทลูกค้า 2 ห้อง (LINE + WEBCHAT · ห้องละ 4 ข้อความ · บันทึกภายใน 1) + ตอบเร็ว 2 + เคสช่วยเหลือ 1
//
// กติกา (แบบเดียวกับ seed-svc-qc):
//   🔴 รันซ้ำ = ไม่มีแถวเพิ่ม และ "ไม่มีการเขียนเลย" — ทุกแถวอ่านมาเทียบกับ SEC ก่อน ต่างเท่านั้นถึงเขียน
//   🔴 ค่าเพี้ยน (ชื่อ/role/สิทธิ์/สถานะ/ข้อความ) ⇒ รันแล้วกลับเป็นค่าตาม SEC · ข้อเสนอ PENDING ใกล้หมดอายุ (< 1 ชม.) ⇒ ต่ออายุ 24 ชม.
//   🔴 ไม่แตะแถวของร้านอื่น — ทุก where ที่ลบผูก tenantId ของร้าน secqc · ลบได้เฉพาะ "แถวเกิน" ของตารางที่ seed นี้เป็นเจ้าของ:
//      ร้าน A: AiConversation(+AiMessage) · AiProposal · ChatConversation(+ลูก) · ChatContact · ChatQuickReply · SupportCase(+ข้อความ)
//      ร้าน A/B: Membership ของผู้ใช้นอกสัญญา · AppSystem เกิน = แจ้งเฉย ๆ ไม่ลบ (ลบระบบ = cascade ข้อมูลระบบ)
//   🔴 ตารางของ S1.1 (AiRoom …) ยังไม่มี ⇒ ตรวจจาก client ตอนรัน แล้วพิมพ์ TODO(S1.1) — ไม่มีการอ้างถึงตอน compile
//   🔴 ไม่เรียก provider โมเดล · ไม่ระบายคิว outbox · ไม่ส่ง push/SMS
import { loadSecQcEnv } from "./sec-qc-env.mjs";
import { SEC, type SecChat, type SecUser } from "./sec-qc-data.mjs";
import type { Prisma } from "@prisma/client"; // ชนิดล้วน (ลบทิ้งตอนรัน) — ตัวต่อฐานโหลดหลังด่าน host เท่านั้น

// ด่านฐาน: ไม่ใช่ฐาน QC ของเลขา (prod / QC ของ RUN อื่น / host อื่น / ไม่มี env) ⇒ exit 4 ก่อนแตะฐาน
loadSecQcEnv("seed-secretary-qc");

const { prisma } = await import("@/lib/core/db");
const { Prisma: PrismaNs } = await import("@prisma/client");
const { newConversationId } = await import("@/lib/ai/conversation-owner");
const { aiMemberActor } = await import("@/lib/ai/actor");

const t0 = Date.now();
const now = new Date();
const created: Record<string, number> = {};
const updated: Record<string, number> = {};
const removed: Record<string, number> = {};
const bump = (m: Record<string, number>, k: string, n = 1) => {
  if (n > 0) m[k] = (m[k] ?? 0) + n;
};

/** เทียบค่าแบบเรียงคีย์ (JSON) — Date เทียบเป็น ISO */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === "object" && !Array.isArray(x) && !(x instanceof Date)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
/** คืนเฉพาะฟิลด์ที่ต่างจากที่ต้องการ (ว่าง = ไม่ต้องเขียน) */
function diff<W extends Record<string, unknown>>(cur: Record<string, unknown>, want: W): Partial<W> {
  const out: Partial<W> = {};
  for (const k of Object.keys(want) as (keyof W & string)[]) if (canon(cur[k]) !== canon(want[k])) out[k] = want[k];
  return out;
}
const has = (o: object) => Object.keys(o).length > 0;
const at = (iso: string) => new Date(iso);

const A = SEC.tenant.id;
const B = SEC.tenantB.id;

// ═══════════════ ร้าน · ระบบ ═══════════════
async function ensureTenant(t: { id: string; slug: string; name: string }) {
  const bySlug = await prisma.tenant.findUnique({ where: { slug: t.slug } });
  if (bySlug && bySlug.id !== t.id) throw new Error(`slug ${t.slug} ถูกร้านอื่นใช้อยู่ (id ${bySlug.id}) — ไม่แตะ หยุด`);
  const row = bySlug ?? (await prisma.tenant.findUnique({ where: { id: t.id } }));
  if (!row) {
    bump(created, "tenant");
    await prisma.tenant.create({ data: { id: t.id, slug: t.slug, name: t.name } });
    return;
  }
  const d = diff(row, { slug: t.slug, name: t.name, status: "ACTIVE" as const, deleteRequestedAt: null });
  if (has(d)) {
    bump(updated, "tenant");
    await prisma.tenant.update({ where: { id: t.id }, data: d });
  }
}

async function ensureSystems() {
  for (const s of Object.values(SEC.systems)) {
    const row = await prisma.appSystem.findUnique({ where: { id: s.id } });
    if (row && row.tenantId !== A) throw new Error(`ระบบ ${s.id} เป็นของร้านอื่น — หยุด`);
    if (!row) {
      bump(created, "appSystem");
      // createSystem ของจริง = appSystem.create ล้วน — สร้างตรงเพื่อกำหนด id ตายตัว
      await prisma.appSystem.create({ data: { id: s.id, tenantId: A, type: s.type, name: s.name } });
      continue;
    }
    const d = diff(row, { type: s.type, name: s.name, active: true });
    if (has(d)) {
      bump(updated, "appSystem");
      await prisma.appSystem.update({ where: { id: s.id }, data: d });
    }
  }
  const extra = await prisma.appSystem.count({ where: { tenantId: A, id: { notIn: Object.values(SEC.systems).map((s) => s.id) } } });
  if (extra) console.log(`⚠️ ร้าน ${A} มีระบบนอกสัญญา ${extra} ระบบ (ไม่ลบ — ตรวจเอง)`);
}

// ═══════════════ ผู้ใช้ · สมาชิกภาพ ═══════════════
async function ensureUser(u: SecUser) {
  const byEmail = await prisma.user.findUnique({ where: { email: u.email } });
  if (byEmail && byEmail.id !== u.userId) throw new Error(`อีเมล ${u.email} เป็นของผู้ใช้อื่น (id ${byEmail.id}) — ไม่แตะ หยุด`);
  const row = byEmail ?? (await prisma.user.findUnique({ where: { id: u.userId } }));
  if (!row) {
    bump(created, "user");
    await prisma.user.create({ data: { id: u.userId, email: u.email, name: u.name } });
  } else {
    const d = diff(row, { email: u.email, name: u.name });
    if (has(d)) {
      bump(updated, "user");
      await prisma.user.update({ where: { id: u.userId }, data: d });
    }
  }
  const acceptedAt = at(SEC.acceptedAt);
  const unitAccess: string[] = [...u.unitAccess];
  const permissions: Record<string, boolean> = { ...u.permissions };
  const m = await prisma.membership.findUnique({ where: { userId_tenantId: { userId: u.userId, tenantId: u.tenantId } } });
  if (!m) {
    bump(created, "membership");
    await prisma.membership.create({ data: { id: u.membershipId, userId: u.userId, tenantId: u.tenantId, role: u.role, unitAccess, permissions, invitedAt: acceptedAt, acceptedAt } });
  } else {
    const d = diff(m, { role: u.role, unitAccess, permissions, acceptedAt });
    if (has(d)) {
      bump(updated, "membership");
      await prisma.membership.update({ where: { id: m.id }, data: d });
    }
  }
  // 1 สมาชิกภาพต่อคน — สมาชิกภาพของผู้ใช้ QC ในร้านอื่น = ผิดสัญญา (ไม่ลบแถวร้านอื่น · หยุดให้คนตรวจ)
  const stray = await prisma.membership.count({ where: { userId: u.userId, tenantId: { not: u.tenantId } } });
  if (stray) throw new Error(`ผู้ใช้ ${u.email} มีสมาชิกภาพในร้านอื่น ${stray} แถว — ผิดสัญญา SEC หยุด`);
}

async function removeExtraMemberships() {
  for (const tenantId of SEC.tenantIds) {
    const keep = SEC.users.filter((u) => u.tenantId === tenantId).map((u) => u.userId);
    const r = await prisma.membership.deleteMany({ where: { tenantId, userId: { notIn: keep } } });
    bump(removed, "membership", r.count);
  }
}

// ═══════════════ ห้องงาน AI ═══════════════
const userById = new Map(SEC.users.map((u) => [u.userId, u]));
/** ห้องที่ seed ถือ: key → id จริงในฐาน */
const roomIdByKey = new Map<string, string>();

async function ensureRooms() {
  const existing = await prisma.aiConversation.findMany({ where: { tenantId: A }, orderBy: { createdAt: "asc" } });
  const used = new Set<string>();
  for (const spec of SEC.rooms) {
    const prefix = `u~${spec.ownerUserId}~`;
    const match = existing.find((c) => !used.has(c.id) && c.id.startsWith(prefix) && c.title === spec.title);
    if (match) {
      used.add(match.id);
      roomIdByKey.set(spec.key, match.id);
    }
  }
  // ห้องเกินของร้าน A (ไม่อยู่ในสัญญา) — ลบ (ข้อความ cascade) · ข้อเสนอที่อ้างห้องนั้นถูกลบในขั้นข้อเสนอ
  const extra = existing.filter((c) => !used.has(c.id)).map((c) => c.id);
  if (extra.length) {
    const r = await prisma.aiConversation.deleteMany({ where: { tenantId: A, id: { in: extra } } });
    bump(removed, "aiConversation", r.count);
  }
  for (const spec of SEC.rooms) {
    const owner = userById.get(spec.ownerUserId);
    if (!owner) throw new Error(`ห้อง ${spec.key}: ไม่รู้จักผู้สร้าง ${spec.ownerUserId}`);
    const want = { title: spec.title, deletedAt: null, lastReadAt: null };
    const id = roomIdByKey.get(spec.key);
    if (!id) {
      // รหัสห้องฝังผู้สร้าง (u~<userId>~<สุ่ม>) — ออกด้วยฟังก์ชันจริงของ conversation-owner เท่านั้น
      const newId = newConversationId({ tenantId: A, actor: aiMemberActor(A, owner.userId, { role: owner.role, unitAccess: owner.unitAccess, permissions: owner.permissions }) });
      bump(created, "aiConversation");
      await prisma.aiConversation.create({ data: { id: newId, tenantId: A, ...want } });
      roomIdByKey.set(spec.key, newId);
      continue;
    }
    const row = existing.find((c) => c.id === id)!;
    const d = diff(row, want);
    if (has(d)) {
      bump(updated, "aiConversation");
      await prisma.aiConversation.update({ where: { id }, data: d });
    }
  }
}

async function ensureRoomMessages() {
  for (const spec of SEC.rooms) {
    const conversationId = roomIdByKey.get(spec.key)!;
    const ids: string[] = [];
    for (const [i, m] of spec.messages.entries()) {
      const id = `secqc-aimsg-${spec.key}-${i + 1}`;
      ids.push(id);
      const want = { tenantId: A, conversationId, role: m.role, content: m.content, createdAt: at(m.at) };
      const row = await prisma.aiMessage.findUnique({ where: { id } });
      if (row && row.tenantId !== A) throw new Error(`ข้อความ ${id} เป็นของร้านอื่น — หยุด`);
      if (!row) {
        bump(created, "aiMessage");
        await prisma.aiMessage.create({ data: { id, ...want } });
        continue;
      }
      const d = diff(row, want);
      if (has(d)) {
        bump(updated, "aiMessage");
        await prisma.aiMessage.update({ where: { id }, data: d });
      }
    }
    const r = await prisma.aiMessage.deleteMany({ where: { tenantId: A, conversationId, id: { notIn: ids } } });
    bump(removed, "aiMessage", r.count);
  }
}

async function ensureProposals() {
  const keep = SEC.proposals.map((p) => p.id);
  const r = await prisma.aiProposal.deleteMany({ where: { tenantId: A, id: { notIn: keep } } });
  bump(removed, "aiProposal", r.count);
  for (const p of SEC.proposals) {
    const conversationId = roomIdByKey.get(p.roomKey)!;
    const row = await prisma.aiProposal.findUnique({ where: { id: p.id } });
    if (row && row.tenantId !== A) throw new Error(`ข้อเสนอ ${p.id} เป็นของร้านอื่น — หยุด`);
    const base = { tenantId: A, conversationId, kind: p.kind, risk: "NORMAL", summary: p.summary, payload: p.payload as Record<string, unknown>, status: p.status, createdAt: at(p.createdAt) };
    let want: Record<string, unknown>;
    if (p.status === "PENDING") {
      // TTL: คงค่าเดิมถ้ายังเหลือ ≥ 1 ชม. (รันซ้ำไม่เขียน) · หมด/ใกล้หมด ⇒ ต่ออายุ 24 ชม. จากตอนรัน
      const fresh = row && row.expiresAt.getTime() - now.getTime() >= SEC.proposalMinLeftMs ? row.expiresAt : new Date(now.getTime() + SEC.proposalTtlMs);
      want = { ...base, expiresAt: fresh, executedAt: null, resultNote: null };
    } else {
      want = { ...base, expiresAt: at(p.expiresAt), executedAt: at(p.executedAt), resultNote: p.resultNote };
    }
    if (!row) {
      bump(created, "aiProposal");
      await prisma.aiProposal.create({ data: { id: p.id, ...(want as Prisma.AiProposalUncheckedCreateInput) } });
      continue;
    }
    const d = diff(row, want);
    if (has(d)) {
      bump(updated, "aiProposal");
      await prisma.aiProposal.update({ where: { id: p.id }, data: d as Prisma.AiProposalUncheckedUpdateInput });
    }
  }
}

// ═══════════════ แชทลูกค้า ═══════════════
const CHAT_SYS = SEC.systems.CHAT.id;

/** ลบห้องแชทเกินของร้าน A พร้อมแถวลูก (FK ทุกตัวเป็น RESTRICT — ลูกก่อนแม่) */
async function removeExtraChats() {
  const keepConv = SEC.chats.map((c) => c.id);
  const extra = (await prisma.chatConversation.findMany({ where: { tenantId: A, id: { notIn: keepConv } }, select: { id: true } })).map((c) => c.id);
  if (extra.length) {
    const msgIds = (await prisma.chatMessage.findMany({ where: { tenantId: A, conversationId: { in: extra } }, select: { id: true } })).map((m) => m.id);
    if (msgIds.length) bump(removed, "chatAttachment", (await prisma.chatAttachment.deleteMany({ where: { messageId: { in: msgIds } } })).count);
    bump(removed, "chatMessage", (await prisma.chatMessage.deleteMany({ where: { tenantId: A, conversationId: { in: extra } } })).count);
    bump(removed, "chatConversationEvent", (await prisma.chatConversationEvent.deleteMany({ where: { conversationId: { in: extra } } })).count);
    bump(removed, "chatReadState", (await prisma.chatReadState.deleteMany({ where: { conversationId: { in: extra } } })).count);
    bump(removed, "chatConversationPref", (await prisma.chatConversationPref.deleteMany({ where: { conversationId: { in: extra } } })).count);
    bump(removed, "chatConversation", (await prisma.chatConversation.deleteMany({ where: { tenantId: A, id: { in: extra } } })).count);
  }
  const keepContact = SEC.chats.map((c) => c.contact.id);
  const loose = await prisma.chatContact.findMany({ where: { tenantId: A, id: { notIn: keepContact } }, select: { id: true, _count: { select: { conversations: true } } } });
  const free = loose.filter((c) => c._count.conversations === 0).map((c) => c.id);
  if (free.length) bump(removed, "chatContact", (await prisma.chatContact.deleteMany({ where: { tenantId: A, id: { in: free } } })).count);
}

async function ensureChat(c: SecChat) {
  // ผู้ติดต่อ
  const contactWant = { tenantId: A, systemId: CHAT_SYS, channel: c.channel, channelConnectionId: null, externalUserId: c.contact.externalUserId, displayName: c.contact.displayName, blockedAt: null };
  const contact = await prisma.chatContact.findUnique({ where: { id: c.contact.id } });
  if (contact && contact.tenantId !== A) throw new Error(`ผู้ติดต่อ ${c.contact.id} เป็นของร้านอื่น — หยุด`);
  if (!contact) {
    bump(created, "chatContact");
    await prisma.chatContact.create({ data: { id: c.contact.id, ...contactWant, lastSeenAt: at(c.messages[0].at) } });
  } else {
    const d = diff(contact, contactWant);
    if (has(d)) {
      bump(updated, "chatContact");
      await prisma.chatContact.update({ where: { id: c.contact.id }, data: d });
    }
  }
  // ห้อง (ค่าสรุปของรายการคำนวณจากข้อความในสัญญา — ตรงกับที่ sendReply/receiveInbound จะเขียน)
  const visible = c.messages.filter((m) => !m.isInternal);
  const last = visible[visible.length - 1];
  const firstIn = c.messages.find((m) => m.direction === "IN");
  const firstOut = c.messages.find((m) => m.direction === "OUT" && !m.isInternal);
  const lastOutIdx = c.messages.map((m) => m.direction === "OUT" && !m.isInternal).lastIndexOf(true);
  const unread = c.messages.slice(lastOutIdx + 1).filter((m) => m.direction === "IN").length;
  const convWant = {
    tenantId: A,
    systemId: CHAT_SYS,
    channel: c.channel,
    channelConnectionId: null,
    contactId: c.contact.id,
    unitId: null,
    status: "OPEN" as const,
    assigneeUserId: c.assigneeUserId,
    lastMessageAt: at(last.at),
    lastMessagePreview: last.body.slice(0, 120),
    lastMessageDirection: last.direction,
    staffUnreadCount: unread,
    firstCustomerMessageAt: firstIn ? at(firstIn.at) : null,
    firstResponseAt: firstOut ? at(firstOut.at) : null,
    resolvedAt: null,
    pinnedAt: null,
    pinnedByUserId: null,
  };
  const conv = await prisma.chatConversation.findUnique({ where: { id: c.id } });
  if (conv && conv.tenantId !== A) throw new Error(`ห้องแชท ${c.id} เป็นของร้านอื่น — หยุด`);
  if (!conv) {
    bump(created, "chatConversation");
    await prisma.chatConversation.create({ data: { id: c.id, ...convWant, createdAt: at(c.messages[0].at) } });
  } else {
    const d = diff(conv, convWant);
    if (has(d)) {
      bump(updated, "chatConversation");
      await prisma.chatConversation.update({ where: { id: c.id }, data: d });
    }
  }
  // ข้อความ
  for (const m of c.messages) {
    const want = {
      tenantId: A,
      systemId: CHAT_SYS,
      conversationId: c.id,
      direction: m.direction,
      type: "TEXT" as const,
      senderUserId: m.senderUserId,
      senderName: null,
      body: m.body,
      isInternal: m.isInternal,
      deliveryStatus: "SENT" as const,
      deliveryError: null,
      purgedAt: null,
      createdAt: at(m.at),
    };
    const row = await prisma.chatMessage.findUnique({ where: { id: m.id } });
    if (row && row.tenantId !== A) throw new Error(`ข้อความแชท ${m.id} เป็นของร้านอื่น — หยุด`);
    if (!row) {
      bump(created, "chatMessage");
      await prisma.chatMessage.create({ data: { id: m.id, ...want } });
      continue;
    }
    const d = diff(row, want);
    if (has(d)) {
      bump(updated, "chatMessage");
      await prisma.chatMessage.update({ where: { id: m.id }, data: d });
    }
  }
  const keep = c.messages.map((m) => m.id);
  const extraMsg = (await prisma.chatMessage.findMany({ where: { tenantId: A, conversationId: c.id, id: { notIn: keep } }, select: { id: true } })).map((m) => m.id);
  if (extraMsg.length) {
    bump(removed, "chatAttachment", (await prisma.chatAttachment.deleteMany({ where: { messageId: { in: extraMsg } } })).count);
    bump(removed, "chatMessage", (await prisma.chatMessage.deleteMany({ where: { tenantId: A, id: { in: extraMsg } } })).count);
  }
}

async function ensureQuickReplies() {
  const keep = SEC.quickReplies.map((q) => q.id);
  bump(removed, "chatQuickReply", (await prisma.chatQuickReply.deleteMany({ where: { tenantId: A, id: { notIn: keep } } })).count);
  for (const q of SEC.quickReplies) {
    const want = { tenantId: A, systemId: CHAT_SYS, shortcut: q.shortcut, title: q.title, body: q.body, channelTypes: [] as string[], usageCount: 0, createdByUserId: "secqc-owner", archivedAt: null };
    const row = await prisma.chatQuickReply.findUnique({ where: { id: q.id } });
    if (row && row.tenantId !== A) throw new Error(`ตอบเร็ว ${q.id} เป็นของร้านอื่น — หยุด`);
    if (!row) {
      bump(created, "chatQuickReply");
      await prisma.chatQuickReply.create({ data: { id: q.id, ...want } });
      continue;
    }
    const d = diff(row, want);
    if (has(d)) {
      bump(updated, "chatQuickReply");
      await prisma.chatQuickReply.update({ where: { id: q.id }, data: d });
    }
  }
}

// ═══════════════ ช่วยเหลือ ═══════════════
async function ensureSupportCase() {
  const sc = SEC.supportCase;
  bump(removed, "supportCase", (await prisma.supportCase.deleteMany({ where: { tenantId: A, id: { not: sc.id } } })).count);
  const want = { tenantId: A, caseNo: sc.caseNo, openedByUserId: sc.openedByUserId, subject: sc.subject, status: sc.status, assigneePlatformUserId: null, shopLastReadAt: null, conversationId: null };
  const row = await prisma.supportCase.findUnique({ where: { id: sc.id } });
  if (row && row.tenantId !== A) throw new Error(`เคส ${sc.id} เป็นของร้านอื่น — หยุด`);
  if (!row) {
    bump(created, "supportCase");
    await prisma.supportCase.create({ data: { id: sc.id, ...want, createdAt: at(sc.message.at) } });
  } else {
    const d = diff(row, want);
    if (has(d)) {
      bump(updated, "supportCase");
      await prisma.supportCase.update({ where: { id: sc.id }, data: d });
    }
  }
  const mWant = { tenantId: A, caseId: sc.id, authorSide: "SHOP" as const, authorId: sc.openedByUserId, body: sc.message.body, attachmentsJson: [] as Prisma.InputJsonArray, createdAt: at(sc.message.at) };
  const m = await prisma.supportMessage.findUnique({ where: { id: sc.message.id } });
  if (m && m.tenantId !== A) throw new Error(`ข้อความเคส ${sc.message.id} เป็นของร้านอื่น — หยุด`);
  if (!m) {
    bump(created, "supportMessage");
    await prisma.supportMessage.create({ data: { id: sc.message.id, ...mWant } });
  } else {
    const d = diff(m, mWant);
    if (has(d)) {
      bump(updated, "supportMessage");
      await prisma.supportMessage.update({ where: { id: sc.message.id }, data: d });
    }
  }
  bump(removed, "supportMessage", (await prisma.supportMessage.deleteMany({ where: { tenantId: A, caseId: sc.id, id: { not: sc.message.id } } })).count);
}

// ═══════════════ ตรวจของ S1.1 (ตอนรัน · ไม่อ้างตอน compile) ═══════════════
const S1_1_MODELS = ["AiSecretary", "AiRoom", "AiRoomMember", "AiRoomJob", "AiSystemAccess", "AiApprovalRule", "AiActionLog", "AiJobCounter", "AiLesson", "StaffInvite", "ChatRoutingRule", "ChatShift", "ChatConversationHelper", "UserPhone", "PhoneOtp", "AiNotifyPref"] as const;
const S1_1_COLUMNS: [string, string][] = [
  ["AiMessage", "authorUserId"],
  ["AiMemory", "status"],
  ["AiScheduledTask", "ownerUserId"],
  ["AiScheduledTask", "frequency"],
  ["AiScheduledTask", "days"],
  ["AiScheduledTask", "channels"],
  ["AiTrainingSample", "outcome"],
  ["AiTrainingSample", "editedReply"],
  ["AiTrainingSample", "stepsJson"],
  ["AiTrainingSample", "roomId"],
  ["AiTrainingSample", "proposalId"],
  ["SupportCase", "source"],
  ["SupportCase", "category"],
  ["SupportCase", "roomId"],
];
function s11Missing(): { models: string[]; columns: string[] } {
  const delegate = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);
  const models = S1_1_MODELS.filter((m) => !(delegate(m) in prisma));
  const dm = new Map(PrismaNs.dmmf.datamodel.models.map((m) => [m.name, new Set(m.fields.map((f) => f.name))]));
  const columns = S1_1_COLUMNS.filter(([m, f]) => !dm.get(m)?.has(f)).map(([m, f]) => `${m}.${f}`);
  return { models, columns };
}

// ═══════════════════════════ ลงมือ ═══════════════════════════
await ensureTenant(SEC.tenant);
await ensureTenant(SEC.tenantB);
await ensureSystems();
for (const u of SEC.users) await ensureUser(u);
await removeExtraMemberships();
await ensureRooms();
await ensureRoomMessages();
await ensureProposals();
await removeExtraChats();
for (const c of SEC.chats) await ensureChat(c);
await ensureQuickReplies();
await ensureSupportCase();

// ═══════════════ สรุป (ต้องเหมือนเดิมทุกตัวอักษรเมื่อรันซ้ำ — ไม่มีเวลา/จำนวนที่เพิ่งสร้าง) ═══════════════
async function countsOf(tenantId: string) {
  const w = { tenantId };
  return {
    systems: await prisma.appSystem.count({ where: w }),
    memberships: await prisma.membership.count({ where: w }),
    aiConversations: await prisma.aiConversation.count({ where: w }),
    aiMessages: await prisma.aiMessage.count({ where: w }),
    aiProposalsPending: await prisma.aiProposal.count({ where: { ...w, status: "PENDING" } }),
    chatConversations: await prisma.chatConversation.count({ where: w }),
    chatMessages: await prisma.chatMessage.count({ where: w }),
    chatQuickReplies: await prisma.chatQuickReply.count({ where: w }),
    supportCases: await prisma.supportCase.count({ where: w }),
  };
}
const summary = {
  A: await countsOf(A),
  B: await countsOf(B),
  users: await prisma.user.count({ where: { email: { in: [...SEC.emails] } } }),
};
const miss = s11Missing();
if (miss.models.length || miss.columns.length) {
  // ตาราง/คอลัมน์ของ migration secretary_a ยังไม่มี — ค่าใน SEC.pending ยังไม่ลงฐาน (ใบ S1.1 + ใบที่ใช้ตารางนั้นเติม seed)
  console.log(`TODO(S1.1): ${[...miss.models, ...miss.columns].join(", ")}`);
} else {
  console.log("NOTE(S1.1+): ตารางของ secretary_a มีแล้ว — ค่าใน SEC.pending (เบอร์ · เลขา · ห้อง/สมาชิกห้อง/คิว · ระดับสิทธิ์ · ตัวนับงาน · คำเชิญ) ยังไม่ถูก seed ใบนี้เขียน · ใบ S1.x ที่ใช้ตารางเติมเอง");
}
const wrote = has(created) || has(updated) || has(removed);
console.log(`ร้าน A: ${JSON.stringify(summary.A)}`);
console.log(`ร้าน B: ${JSON.stringify(summary.B)} · ผู้ใช้ secqc ${summary.users}`);
console.log(
  wrote
    ? `เขียนรอบนี้: สร้าง ${JSON.stringify(created)} · แก้ ${JSON.stringify(updated)} · ลบ ${JSON.stringify(removed)} · ${Math.round((Date.now() - t0) / 1000)} วิ`
    : `ไม่มีการเขียน (ตรงสัญญาแล้ว) · ${Math.round((Date.now() - t0) / 1000)} วิ`,
);
console.log(`SEED_SUMMARY ${JSON.stringify(summary)}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "seed-secretary-qc", ok: true, created, updated, removed })}`);
await prisma.$disconnect();
