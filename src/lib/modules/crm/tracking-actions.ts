"use server";

// tracking-actions.ts — server actions ของหน้าติดตามเว็บ/ลิงก์ + ฟอร์ม → CRM (ใบ C2.6 · ภาพ 16 + ภาพ 11)
//   หน้า `/crm/settings/tracking` · `/crm/settings/forms` เรียกผ่านที่นี่ที่เดียว
//
// 🔴 "use server" = ส่งออกได้เฉพาะ **async function** — ชนิด/ค่าคงที่ส่งออกจากที่นี่ไม่ได้ (หน้า 500 ทั้งที่ build ผ่าน ·
//    reference_next_use_server_no_type_export) ⇒ ชนิดทั้งหมดอยู่ที่ `src/components/crm/tracking/types.ts`
// 🔴 tenantId มาจาก session เสมอ · systemId ถูก re-resolve ในบริการ (`tracking.ts`) — ไม่เชื่อ id จากหน้าจอ
// 🔴 ลำดับด่านเดียวกับบริการ: ระบบ CRM ของร้าน (NOT_FOUND) → uiVersion 2 (`assertCrmV2`) → คีย์ `crm.tracking.manage`
//    (`crmCan`/`assertCanCrm`) — บริการตรวจซ้ำเองทุกครั้ง (ไม่มีทางที่ทางเข้าที่สองจะหลุดประตู)
// 🔴 ข้อความ error เป็นภาษาไทยที่ไม่โทษผู้ใช้ · error ที่ไม่รู้จัก = ข้อความกลาง (รายละเอียดไม่หลุดออกหน้าจอ)
// 🔴 AUDIT-CLASS X8: ไม่ log url ของลูกค้า/ข้อความ consent — บันทึกเฉพาะชนิดของ error

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { ForbiddenError } from "@/lib/core/rbac";
import { toMemberActor } from "@/lib/modules/member";
import type { MemberActor } from "@/lib/modules/member";
import { assertCanCrm } from "./access";
import { assertCrmV2, CrmV2DisabledError } from "./ui-version";
import * as tracking from "./tracking";
import { TrackingError } from "./tracking";
import type { CrmTrackingResult, CrmTrackFormTargetRow, CrmTrackLinkRow, CrmTrackWebSettings } from "@/components/crm/tracking/types";

type Ctx = { tenantId: string; systemId: string; actorUserId: string };

async function session(systemId: string): Promise<{ ctx: Ctx; actor: MemberActor }> {
  const auth = await requireTenant();
  const actor = toMemberActor(auth.user.id, auth.active);
  const ctx: Ctx = { tenantId: auth.active.tenantId, systemId: String(systemId ?? ""), actorUserId: auth.user.id };
  await assertCrmV2(ctx);
  // AUDIT-CLASS X2: ด่านคีย์สิทธิ์ตัวเดียวของ CRM (`access.ts`) — บริการตรวจซ้ำอีกชั้นเสมอ
  assertCanCrm(actor, "crm.tracking.manage");
  return { ctx, actor };
}

function failOf(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof CrmV2DisabledError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof TrackingError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof ForbiddenError) return { ok: false, error: e.message, code: "FORBIDDEN" };
  console.error(`[crm.tracking] action ล้มเหลว — ${e instanceof Error ? e.name : "unknown"}`);
  return { ok: false, error: "ทำรายการไม่สำเร็จ ระบบยกเลิกให้แล้ว (ข้อมูลการติดตามไม่เปลี่ยน) — ลองใหม่อีกครั้ง" };
}

const touch = (systemId: string) => {
  revalidatePath(`/app/sys/${systemId}/crm/settings/tracking`);
  revalidatePath(`/app/sys/${systemId}/crm/settings/forms`);
};

const linkRow = (l: Awaited<ReturnType<typeof tracking.createLink>>): CrmTrackLinkRow => ({
  id: l.id,
  code: l.code,
  url: l.url,
  name: l.name,
  channel: l.channel,
  active: l.active,
  clicks: l.clicks,
  uniqueClicks: l.uniqueClicks,
  shortUrl: l.shortUrl,
  createdAtLabel: new Date(l.createdAt).toISOString().slice(0, 10),
});

export async function saveCrmTrackingWebAction(
  systemId: string,
  patch: { enabled?: boolean; domains?: string[]; consentText?: string; retentionDays?: number; bumpConsentVersion?: boolean },
): Promise<CrmTrackingResult<CrmTrackWebSettings>> {
  try {
    const { ctx, actor } = await session(systemId);
    const next = await tracking.saveWebSettings(ctx, actor, patch ?? {});
    touch(ctx.systemId);
    return { ok: true, data: next };
  } catch (e) {
    return failOf(e);
  }
}

export async function createCrmTrackedLinkAction(
  systemId: string,
  input: { url: string; name?: string | null; channel?: string | null; code?: string | null },
): Promise<CrmTrackingResult<CrmTrackLinkRow>> {
  try {
    const { ctx, actor } = await session(systemId);
    const link = await tracking.createLink(ctx, actor, input ?? { url: "" });
    touch(ctx.systemId);
    return { ok: true, data: linkRow(link) };
  } catch (e) {
    return failOf(e);
  }
}

export async function updateCrmTrackedLinkAction(
  systemId: string,
  id: string,
  patch: { name?: string | null; url?: string; active?: boolean; channel?: string | null },
): Promise<CrmTrackingResult<CrmTrackLinkRow>> {
  try {
    const { ctx, actor } = await session(systemId);
    const link = await tracking.updateLink(ctx, actor, String(id ?? ""), patch ?? {});
    touch(ctx.systemId);
    return { ok: true, data: linkRow(link) };
  } catch (e) {
    return failOf(e);
  }
}

export async function deleteCrmTrackedLinkAction(systemId: string, id: string, opts: { confirm?: boolean; reason?: string }): Promise<CrmTrackingResult<{ deleted: true }>> {
  try {
    const { ctx, actor } = await session(systemId);
    await tracking.deleteLink(ctx, actor, String(id ?? ""), opts ?? {});
    touch(ctx.systemId);
    return { ok: true, data: { deleted: true } };
  } catch (e) {
    return failOf(e);
  }
}

export async function crmTrackedLinkQrAction(systemId: string, id: string): Promise<CrmTrackingResult<{ svg: string }>> {
  try {
    const { ctx, actor } = await session(systemId);
    const svg = await tracking.linkQrSvg(ctx, actor, String(id ?? ""));
    return { ok: true, data: { svg } };
  } catch (e) {
    return failOf(e);
  }
}

export async function saveCrmFormTargetAction(
  systemId: string,
  formId: string,
  patch: {
    crmSystemId?: string | null;
    assignRuleId?: string | null;
    scoreOnSubmit?: number | null;
    utmCapture?: boolean;
    createCompanyFromField?: string | null;
    spamGuard?: Record<string, unknown> | null;
    crmEnabled?: boolean;
  },
): Promise<CrmTrackingResult<CrmTrackFormTargetRow>> {
  try {
    const { ctx, actor } = await session(systemId);
    const saved = await tracking.saveFormTarget(ctx, actor, String(formId ?? ""), patch ?? {});
    touch(ctx.systemId);
    return {
      ok: true,
      data: {
        formId: saved.formId,
        name: saved.name,
        active: saved.active,
        crmEnabled: saved.crmEnabled,
        crmSystemId: saved.crmSystemId,
        assignRuleId: saved.assignRuleId,
        scoreOnSubmit: saved.scoreOnSubmit,
        utmCapture: saved.utmCapture,
        createCompanyFromField: saved.createCompanyFromField,
        spamGuard: saved.spamGuard,
        fieldKeys: saved.fieldKeys,
        // (รีวิวรอบ 2 · B1) ชื่อช่องที่ชนกับด่านกันสแปม — หน้าตั้งค่าต้องยังเห็นคำเตือนหลังกดบันทึก
        reservedKeys: saved.reservedKeys,
        embedCode: saved.embedCode,
        publicUrl: saved.publicUrl,
      },
    };
  } catch (e) {
    return failOf(e);
  }
}
