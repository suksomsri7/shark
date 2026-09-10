"use server";

import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { assertCan } from "@/lib/core/rbac";
import { parseCsv, type ImportSummary } from "@/lib/core/csv";
import { safeReason } from "@/lib/core/errors";
import { importCustomers } from "./service";
import { prisma } from "./db";
import { canReadMember, toMemberActor, type MemberActor } from "./access";
import type { MemberCtx } from "./profile";
import {
  autoMapping,
  importMembers,
  previewImport,
  type ImportOptions,
  type ImportPreviewResult,
  type ImportResult,
} from "./import";

// ── นำเข้าลูกค้าจาก CSV (WO Wave6-A) — ใช้กับ useActionState ในหน้าระบบสมาชิก ──
// STAFF ต้องมี permission "member.customer.import" (OWNER/MANAGER ผ่านตามปกติ)
// 🔴 v1 เดิม — หน้า `/member/import` (เดิม) เลิกเรียกแล้ว (เปลี่ยนเป็น redirect ไปตัวใหม่ M1.6)
//    คงฟังก์ชันนี้ไว้ไม่ลบ: `ui.tsx#MemberImportSection` ยังอ้างอยู่ (ลบพร้อมกันในใบที่เลิกใช้ ui.tsx จริง)
export async function importCustomersAction(
  systemId: string,
  _prev: ImportSummary | null,
  formData: FormData,
): Promise<ImportSummary | null> {
  const auth = await requireTenant();
  assertCan(
    {
      role: auth.active.role,
      unitAccess: auth.active.unitAccess as string[],
      permissions: auth.active.permissions as Record<string, unknown>,
    },
    { module: "member", action: "member.customer.import" },
  );
  const csv = String(formData.get("csv") ?? "");
  if (!systemId || !csv.trim()) return null;
  const table = parseCsv(csv);
  if (table.rows.length === 0) {
    return { created: 0, skipped: 0, errors: [{ row: 0, reason: "ไม่พบข้อมูล — ต้องมีบรรทัดหัวคอลัมน์ + อย่างน้อย 1 แถว" }] };
  }
  const summary = await importCustomers({ tenantId: auth.active.tenantId, systemId }, table);
  revalidatePath(`/app/sys/${systemId}`);
  return summary;
}

// ═══════════════════════════════════════════════════════════════════════════
// นำเข้าสมาชิก v2 3 ขั้น (WO M1.6 · MembersImportWizard.tsx เรียกตรง — ไม่ใช่ฟอร์ม <form action>)
// ═══════════════════════════════════════════════════════════════════════════

export type ImportV2ActionResult<T> = { ok: true; data: T } | { ok: false; reason: string };

const IMPORT_PATH = (systemId: string) => `/app/sys/${systemId}/member/members`;

// 🔴 ล้มเหลว → `assertCan` (ไม่ใช่ `throw new Error` เฉย ๆ) — แบบเดียวกับ `fields-actions.ts`/`members-actions.ts`
//    (F6 fitness ตามรอย `assertCan` จริงเท่านั้น ไม่นับ `if (!canReadMember(...)) throw ...` ว่าเป็นด่านสิทธิ์)
async function gateImport(systemId: string): Promise<{ ctx: MemberCtx; actor: MemberActor }> {
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const actor = toMemberActor(auth.user.id, auth.active);
  if (!canReadMember(actor)) {
    assertCan(
      { role: auth.active.role, unitAccess: actor.unitAccess, permissions: actor.permissions },
      { module: "member", action: "member.customer.read" },
    );
  }
  const system = await prisma.appSystem.findFirst({ where: { id: systemId, tenantId, type: "MEMBER" }, select: { id: true } });
  if (!system) throw new Error("ไม่พบระบบสมาชิกนี้ในร้านนี้ — รีเฟรชหน้าแล้วลองใหม่");
  return { ctx: { tenantId, systemId, actorUserId: auth.user.id }, actor };
}

/** จับคู่คอลัมน์อัตโนมัติ (ขั้น 2) — `MembersImportWizard.tsx` เรียกทันทีหลังอัปโหลดไฟล์ */
export async function autoMappingAction(input: { systemId: string; headers: string[] }): Promise<ImportV2ActionResult<Record<string, string | null>>> {
  try {
    const { ctx } = await gateImport(input.systemId);
    const map = await autoMapping(ctx, input.headers);
    return { ok: true, data: map };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "จับคู่คอลัมน์ไม่สำเร็จ — เลือกฟิลด์เองได้") };
  }
}

/** ตรวจแถว (ขั้น 3) — ไม่เขียนอะไรลง DB */
export async function previewImportAction(input: {
  systemId: string;
  rows: Record<string, string>[];
  mapping: Record<string, string>;
}): Promise<ImportV2ActionResult<ImportPreviewResult>> {
  try {
    const { ctx, actor } = await gateImport(input.systemId);
    const res = await previewImport(ctx, actor, { rows: input.rows, mapping: input.mapping });
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ตรวจไฟล์ไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}

/** นำเข้าจริง — กดปุ่ม "นำเข้า N คน" ที่ขั้น 3 */
export async function importMembersAction(input: {
  systemId: string;
  rows: Record<string, string>[];
  mapping: Record<string, string>;
  options: ImportOptions;
}): Promise<ImportV2ActionResult<ImportResult>> {
  try {
    const { ctx, actor } = await gateImport(input.systemId);
    const res = await importMembers(ctx, actor, { rows: input.rows, mapping: input.mapping, options: input.options });
    revalidatePath(IMPORT_PATH(input.systemId));
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "นำเข้าไม่สำเร็จ — ลองใหม่อีกครั้ง") };
  }
}
