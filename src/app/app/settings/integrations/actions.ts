"use server";
// actions.ts — ทางเข้าจากหน้า /app/settings/integrations (SVC R0.5 · ใบสั่ง §6)
// ผู้กระทำ = membership ของ session (service เชื่อ actor จากที่นี่) · ผลคืนเป็นข้อความไทยสั้น ไม่มีค่าลับ
// 🔴 ไฟล์ "use server" ส่งออกได้เฉพาะฟังก์ชัน async (ไม่ export type)
import { revalidatePath } from "next/cache";
import { requireTenant } from "@/lib/core/context";
import { disableIntegration, saveIntegration, testIntegration } from "@/lib/core/integrations";
import type { IntegrationActor, SaveIntegrationInput } from "@/lib/core/integrations/types";

const PATH = "/app/settings/integrations";

async function session(): Promise<{ tenantId: string; actor: IntegrationActor }> {
  const auth = await requireTenant();
  const m = auth.active;
  return {
    tenantId: m.tenantId,
    actor: {
      userId: auth.user.id,
      role: m.role,
      unitAccess: Array.isArray(m.unitAccess) ? (m.unitAccess as unknown[]).filter((u): u is string => typeof u === "string") : [],
      permissions: m.permissions && typeof m.permissions === "object" && !Array.isArray(m.permissions) ? (m.permissions as Record<string, unknown>) : {},
    },
  };
}

export async function saveIntegrationAction(input: SaveIntegrationInput): Promise<{ ok: boolean; message: string; id: string | null }> {
  const s = await session();
  const r = await saveIntegration({ tenantId: s.tenantId }, s.actor, input);
  if (!r.ok) return { ok: false, message: r.message, id: null };
  revalidatePath(PATH);
  return { ok: true, message: "บันทึกแล้ว — กด “ทดสอบ” เพื่อเริ่มใช้งาน", id: r.integration.id };
}

export async function testIntegrationAction(id: string): Promise<{ ok: boolean; message: string; id: string | null }> {
  const s = await session();
  const r = await testIntegration({ tenantId: s.tenantId }, s.actor, { id });
  if (!r.ok) return { ok: false, message: r.message, id: null };
  revalidatePath(PATH);
  return { ok: r.passed, message: r.passed ? "ทดสอบผ่าน — เชื่อมต่อแล้ว" : (r.integration.lastError ?? "ทดสอบไม่ผ่าน"), id: r.integration.id };
}

export async function disableIntegrationAction(id: string): Promise<{ ok: boolean; message: string; id: string | null }> {
  const s = await session();
  const r = await disableIntegration({ tenantId: s.tenantId }, s.actor, { id });
  if (!r.ok) return { ok: false, message: r.message, id: null };
  revalidatePath(PATH);
  return { ok: true, message: "ถอดการเชื่อมต่อแล้ว — ลบคีย์ลับทิ้งเรียบร้อย", id: r.integration.id };
}
