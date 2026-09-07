"use server";

// automation-actions.ts — server actions ของ "ตัวสร้างกฎอัตโนมัติ" (K2.9)
//
// 🔴 ไฟล์ `"use server"` ⇒ **export ได้เฉพาะ async function ที่เป็น action เท่านั้น**
//    (ค่าคงที่/ชนิด/ตัวช่วย ต้องอยู่ไฟล์อื่น — ที่นี่จึง import ชนิดมาใช้แบบ `import type`)
// 🔴 `tenantId` มาจาก session เสมอ ห้ามรับจาก client · `systemId` รับจากฟอร์มแล้วถูกกรองซ้ำใน service
//    (ทุกตัวลงท้ายที่ `automation.ts` ซึ่งตรวจ tenant + system + ADMIN ของบอร์ด + คีย์ automation เอง)
// 🔴 ทุกตัวคืน `{ ok }` แทนการโยน — แผงตัวสร้างกฎเป็นฟอร์มเดียวยาว ๆ ผู้ใช้ต้องเห็นเหตุผลตรงจุด
//    ไม่ใช่จอแดงทั้งหน้าแล้วพิมพ์ใหม่หมด

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { toActor } from "./access";
import {
  createRule,
  deleteRule,
  dryRun,
  runButton,
  toggleRule,
  updateRule,
  type KanbanDryRunResult,
} from "./automation";
import type { KanbanActor, KanbanCtx } from "./types";

type Fail = { ok: false; message: string };

/**
 * ด่านชั้นที่ 1 (RBAC ของร้าน) ก่อนเข้า service — ชั้นที่ 2 (ADMIN/EDITOR ของบอร์ดใบนั้น) อยู่ใน `automation.ts`
 * 🔴 ต้องมีทั้งสองชั้น: คีย์บอกว่า "คนนี้ยุ่งกับกฎอัตโนมัติได้" · บทบาทบอร์ดบอกว่า "ยุ่งกับบอร์ดใบไหนได้"
 */
async function scope(systemId: string, action: string): Promise<{ ctx: KanbanCtx; actor: KanbanActor }> {
  const auth = await requireTenant();
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "kanban", action },
  );
  return {
    ctx: { tenantId: auth.active.tenantId, systemId, actorUserId: auth.user.id },
    actor: toActor(auth.user.id, auth.active),
  };
}

const MANAGE = "kanban.automation.manage";

const why = (e: unknown, fallback: string): string => (e instanceof Error && e.message ? e.message : fallback);

function refresh(systemId: string, boardId?: string): void {
  revalidatePath(`/app/sys/${systemId}/kanban/automation`);
  if (boardId) revalidatePath(`/app/sys/${systemId}/kanban/b/${boardId}`);
}

export async function createRuleAction(input: {
  systemId: string;
  rule: unknown;
}): Promise<{ ok: true; id: string } | Fail> {
  try {
    const { ctx, actor } = await scope(input.systemId, MANAGE);
    const row = await createRule(ctx, actor, input.rule);
    refresh(input.systemId, row.boardId ?? undefined);
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, message: why(e, "บันทึกกฎไม่สำเร็จ") };
  }
}

export async function updateRuleAction(input: {
  systemId: string;
  ruleId: string;
  patch: unknown;
}): Promise<{ ok: true; id: string } | Fail> {
  try {
    const { ctx, actor } = await scope(input.systemId, MANAGE);
    const row = await updateRule(ctx, actor, input.ruleId, input.patch);
    refresh(input.systemId, row.boardId ?? undefined);
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, message: why(e, "แก้กฎไม่สำเร็จ") };
  }
}

export async function toggleRuleAction(input: {
  systemId: string;
  ruleId: string;
  enabled: boolean;
}): Promise<{ ok: true; enabled: boolean } | Fail> {
  try {
    const { ctx, actor } = await scope(input.systemId, MANAGE);
    const row = await toggleRule(ctx, actor, input.ruleId, input.enabled);
    refresh(input.systemId, row.boardId ?? undefined);
    return { ok: true, enabled: row.enabled };
  } catch (e) {
    return { ok: false, message: why(e, "เปิด/ปิดกฎไม่สำเร็จ") };
  }
}

export async function deleteRuleAction(input: { systemId: string; ruleId: string }): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await scope(input.systemId, MANAGE);
    await deleteRule(ctx, actor, input.ruleId);
    refresh(input.systemId);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: why(e, "ลบกฎไม่สำเร็จ") };
  }
}

/** ทดลองรันย้อนหลัง — **ไม่เขียนอะไรลง DB เลย** (จึงไม่ต้อง revalidate อะไรทั้งนั้น) */
export async function dryRunAction(input: {
  systemId: string;
  rule: unknown;
  days?: number;
}): Promise<{ ok: true; result: KanbanDryRunResult } | Fail> {
  try {
    const { ctx, actor } = await scope(input.systemId, MANAGE);
    const result = await dryRun(ctx, actor, input.rule, { days: input.days ?? 30 });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, message: why(e, "ทดลองรันไม่สำเร็จ") };
  }
}

export async function runButtonAction(input: {
  systemId: string;
  boardId: string;
  ruleId: string;
  cardId?: string;
}): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await scope(input.systemId, "kanban.card.update");
    await runButton(ctx, actor, input.ruleId, input.cardId ? { cardId: input.cardId } : {});
    refresh(input.systemId, input.boardId);
    return { ok: true };
  } catch (e) {
    return { ok: false, message: why(e, "กดปุ่มอัตโนมัติไม่สำเร็จ") };
  }
}
