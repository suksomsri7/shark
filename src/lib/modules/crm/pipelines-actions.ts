"use server";

// pipelines-actions.ts — server actions ของหน้าตั้งค่า pipeline/ขั้น (CRM v2 · ใบ C1.5)
// 🔴 "use server" = export ได้เฉพาะ async function · tenantId จาก session · systemId ถูก resolve ใหม่ในบริการ
// 🔴 F6: assertCan `crm.settings.manage` ก่อนลงมือทุกครั้ง · error เป็นข้อความไทยที่ไม่โทษผู้ใช้

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan, ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";
import {
  addStage,
  archivePipeline,
  createPipeline,
  deleteStage,
  reorderStages,
  restorePipeline,
  updatePipeline,
  updateStage,
  type PipelinesCtx,
  type StageInput,
  type StagePatch,
} from "./pipelines";
import { DealsError } from "./deals-shared";

type Fail = { ok: false; error: string; code?: string };

async function session(systemId: string) {
  const auth = await requireTenant();
  assertCan(
    { role: auth.active.role, unitAccess: auth.active.unitAccess as string[], permissions: auth.active.permissions as Record<string, unknown> },
    { module: "crm", action: "crm.settings.manage" },
  );
  const ctx: PipelinesCtx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  // CRM uiVersion gate ▸ action ของหน้า v2 ใช้ได้เฉพาะระบบที่เปิด CRM ใหม่ (settings.crm.uiVersion = 2) — action v1 (`actions.ts`) ไม่ผ่านที่นี่ ◂
  await assertCrmV2(ctx);
  return { ctx, actor: toMemberActor(auth.user.id, auth.active) };
}

function failOf(e: unknown): Fail {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof DealsError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: "บัญชีนี้ยังไม่ได้รับสิทธิ์ตั้งค่า CRM — ขอให้เจ้าของร้านเปิดสิทธิ์ให้ แล้วลองอีกครั้ง", code: "FORBIDDEN" };
  console.error(`[crm.pipelines] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "บันทึกไม่สำเร็จ ระบบยกเลิกรายการให้แล้ว (ข้อมูลไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const touch = (systemId: string) => {
  for (const p of ["settings/pipelines", "settings/stages", "pipelines", "deals"]) revalidatePath(`/app/sys/${systemId}/crm/${p}`);
};

export async function createPipelineAction(systemId: string, input: { name: string; stages: StageInput[] }): Promise<{ ok: true; id: string } | Fail> {
  try {
    const { ctx, actor } = await session(systemId);
    const p = await createPipeline(ctx, actor, input);
    touch(systemId);
    return { ok: true, id: p.id };
  } catch (e) {
    return failOf(e);
  }
}

export async function updatePipelineAction(systemId: string, pipelineId: string, patch: { name?: string | null; isDefault?: boolean | null }): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId);
    await updatePipeline(ctx, actor, pipelineId, patch);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function archivePipelineAction(systemId: string, pipelineId: string, confirm: boolean, reason: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId);
    await archivePipeline(ctx, actor, pipelineId, { confirm, reason });
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function restorePipelineAction(systemId: string, pipelineId: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId);
    await restorePipeline(ctx, actor, pipelineId);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function addStageAction(systemId: string, pipelineId: string, input: StageInput): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId);
    await addStage(ctx, actor, pipelineId, input);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function updateStageAction(systemId: string, stageId: string, patch: StagePatch): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId);
    await updateStage(ctx, actor, stageId, patch);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function reorderStagesAction(systemId: string, pipelineId: string, ids: string[]): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId);
    await reorderStages(ctx, actor, pipelineId, ids);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}

export async function deleteStageAction(systemId: string, stageId: string): Promise<{ ok: true } | Fail> {
  try {
    const { ctx, actor } = await session(systemId);
    await deleteStage(ctx, actor, stageId);
    touch(systemId);
    return { ok: true };
  } catch (e) {
    return failOf(e);
  }
}
