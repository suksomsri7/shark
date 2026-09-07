"use server";

// task-from-chat-actions.ts — server action ของแผง "สร้างงานจากบทสนทนานี้" (K3.2)
//
// 🔴 ไฟล์นี้ export **เฉพาะ action** — ตรรกะจริงอยู่ `task-from-chat.ts` (กติกาข้อ 6 ของ RUN:
//    อะไรที่ re-export จากไฟล์ "use server" จะกลายเป็น endpoint ที่ยิงตรงจากอินเทอร์เน็ตได้)
// 🔴 ทุกตัวตั้งด่าน `requireChatRead()` เป็นบรรทัดแรก — ปุ่มบนจอไม่ใช่ด่าน (ปิดสวิตช์แล้วยังยิง action ได้)
// 🔴 `systemId` หาเอาจากบทสนทนา (กรอง tenantId ของ session) ไม่รับจากหน้าจอ — id ที่ client ส่งมาแล้ว
//    เชื่อทันที คือช่องที่ทำให้ยิงห้องของระบบอื่นในร้านเดียวกันได้

import { requireTenant } from "@/lib/core/context";
import { prisma } from "./db";
import { toActor } from "@/lib/modules/kanban/access";
import { chatTaskButtonConfig, listTaskTargetBoards, type IntegrationBoardOption } from "@/lib/modules/kanban/integrations";
import { channelLabel } from "./channel-icon";
import { requireChatRead, membershipOf } from "./guard";
import { listStaff } from "./service";
import { createTaskFromChat, draftTaskFromChat } from "./task-from-chat";

export type TaskFromChatDraftView = {
  draft: {
    title: string;
    summary: string;
    dueAtIso: string | null;
    dueGuessed: boolean;
    checklist: string[];
    readCount: number;
    aiUsed: boolean;
  };
  /** บริบทที่แผงต้องโชว์ตามภาพ 09 (ช่องทาง · ชื่อผู้ติดต่อ · จำนวนไฟล์แนบในห้อง) */
  meta: { channelLabel: string; contactName: string; attachmentCount: number };
  boards: IntegrationBoardOption[];
  staff: { userId: string; name: string }[];
  defaults: { boardId: string; columnId: string | null };
  /** "ตอนนี้" จาก server — ปฏิทินไทยห้ามใช้ Date.now() ของเครื่องผู้ใช้ (บทเรียน K1.5) */
  nowMs: number;
};

export type TaskFromChatDraftResult =
  | ({ ok: true } & TaskFromChatDraftView)
  | { ok: false; message: string };

/** ห้อง + ระบบแชทของห้องนั้น (กรองด้วย tenant ของ session เสมอ) */
async function resolveConversation(tenantId: string, conversationId: string) {
  return prisma.chatConversation.findFirst({
    where: { id: conversationId, tenantId },
    select: { id: true, systemId: true, channel: true, contact: { select: { displayName: true } } },
  });
}

/** ร่างการ์ดจากบทสนทนา + ตัวเลือกทั้งหมดที่แผงต้องใช้ (บอร์ด/คอลัมน์/ป้าย/ทีมงาน) */
export async function draftTaskFromChatAction(conversationId: string): Promise<TaskFromChatDraftResult> {
  const auth = await requireChatRead();
  const tenantId = auth.active.tenantId;
  const conv = await resolveConversation(tenantId, conversationId);
  if (!conv) return { ok: false as const, message: "ไม่พบบทสนทนานี้" };

  const cfg = await chatTaskButtonConfig(tenantId);
  if (!cfg) {
    return { ok: false as const, message: 'ยังไม่ได้เปิด "สร้างงานจากแชท" — เปิดได้ที่ บอร์ดงาน › ตั้งค่า › การเชื่อมต่อ' };
  }

  const ctx = { tenantId, systemId: conv.systemId, actorUserId: auth.user.id };
  try {
    const [draft, attachmentCount, staff, boards] = await Promise.all([
      draftTaskFromChat(ctx, conv.id),
      prisma.chatAttachment.count({ where: { tenantId, systemId: conv.systemId, message: { conversationId: conv.id } } }),
      listStaff(tenantId),
      listTaskTargetBoards(
        { tenantId, systemId: cfg.kanbanSystemId, actorUserId: auth.user.id },
        toActor(auth.user.id, {
          role: auth.active.role,
          unitAccess: auth.active.unitAccess,
          permissions: auth.active.permissions,
        }),
      ),
    ]);
    return {
      ok: true as const,
      draft: {
        title: draft.title,
        summary: draft.summary,
        dueAtIso: draft.dueAt ? draft.dueAt.toISOString() : null,
        dueGuessed: draft.dueGuessed,
        checklist: draft.checklist,
        readCount: draft.readCount,
        aiUsed: draft.aiUsed,
      },
      meta: {
        channelLabel: channelLabel(conv.channel),
        contactName: conv.contact?.displayName ?? "ลูกค้า",
        attachmentCount,
      },
      boards,
      staff: staff.map((s) => ({ userId: s.userId, name: s.name })),
      defaults: { boardId: cfg.boardId, columnId: cfg.columnId },
      nowMs: Date.now(),
    };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "เตรียมร่างการ์ดไม่สำเร็จ" };
  }
}

export type CreateTaskFromChatActionInput = {
  conversationId: string;
  title: string;
  description?: string | null;
  boardId: string;
  columnId?: string | null;
  assigneeUserIds?: string[];
  dueAtIso?: string | null;
  labelIds?: string[];
  checklist?: string[];
  linkConversation: boolean;
  linkParty: boolean;
  copyAttachments: boolean;
};

export type CreateTaskFromChatActionResult =
  | { ok: true; cardId: string; cardNo: number | null; created: boolean; cardHref: string }
  | { ok: false; message: string };

/** สร้างการ์ดจริง — ข้อความผิดพลาดทุกอันเป็นภาษาไทยและบอก "ทำอะไรต่อ" ไม่ใช่โทษคนกด */
export async function createTaskFromChatAction(
  input: CreateTaskFromChatActionInput,
): Promise<CreateTaskFromChatActionResult> {
  const auth = await requireChatRead();
  const tenantId = auth.active.tenantId;
  const conv = await resolveConversation(tenantId, input.conversationId);
  if (!conv) return { ok: false as const, message: "ไม่พบบทสนทนานี้" };
  const title = (input.title ?? "").trim();
  if (!title) return { ok: false as const, message: "ตั้งชื่องานก่อนจึงจะสร้างการ์ดได้" };
  if (!input.boardId) return { ok: false as const, message: "เลือกบอร์ดปลายทางก่อนจึงจะสร้างการ์ดได้" };

  const m = membershipOf(auth);
  try {
    const res = await createTaskFromChat(
      { tenantId, systemId: conv.systemId, actorUserId: auth.user.id },
      { userId: auth.user.id, role: m.role, unitAccess: m.unitAccess, permissions: m.permissions },
      {
        conversationId: conv.id,
        title,
        description: input.description ?? null,
        boardId: input.boardId,
        columnId: input.columnId ?? null,
        assigneeUserIds: input.assigneeUserIds ?? [],
        dueAt: input.dueAtIso ? new Date(input.dueAtIso) : null,
        labelIds: input.labelIds ?? [],
        checklist: input.checklist ?? [],
        link: {
          conversation: input.linkConversation,
          party: input.linkParty,
          copyAttachments: input.copyAttachments,
        },
      },
    );
    return { ok: true as const, cardId: res.cardId, cardNo: res.cardNo, created: res.created, cardHref: res.cardHref };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "สร้างการ์ดไม่สำเร็จ — ลองอีกครั้ง" };
  }
}
