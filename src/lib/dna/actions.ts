"use server";

// server actions ของ DNA Wizard — tenantId มาจาก session เสมอ (requireTenant)
// ห้ามรับ tenantId จาก client (กัน cross-tenant)

import { requireTenant } from "@/lib/core/context";
import { ZDnaFacts } from "./schema";
import type { BlueprintPlan, DnaFacts } from "./schema";
import { finalizeFacts } from "./questions";
import { saveDnaFacts, proposeBlueprint, applyBlueprint } from "./apply";

export type FactsState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "saved" };

// รับคำตอบทั้งชุดจากบทสัมภาษณ์ → เติม default ข้อที่ถูกข้าม → validate → บันทึก
export async function answerQuestion(
  answers: Partial<DnaFacts>,
): Promise<FactsState> {
  const auth = await requireTenant();
  const filled = finalizeFacts(answers);
  const parsed = ZDnaFacts.safeParse(filled);
  if (!parsed.success) {
    return { status: "error", message: "ยังตอบไม่ครบทุกข้อ — กรุณาตอบให้ครบก่อน" };
  }
  await saveDnaFacts(auth.active.tenantId, parsed.data);
  return { status: "saved" };
}

// เสนอพิมพ์เขียวจากข้อเท็จจริงที่บันทึกไว้ (idempotent)
export async function proposeAction(): Promise<{ blueprintId: string; plan: BlueprintPlan }> {
  const auth = await requireTenant();
  return proposeBlueprint(auth.active.tenantId);
}

// ประกอบระบบจริงตามพิมพ์เขียว
export async function applyAction(
  blueprintId: string,
): Promise<{ ok: boolean; results: { step: number; ok: boolean; createdId?: string; error?: string }[] }> {
  const auth = await requireTenant();
  return applyBlueprint(auth.active.tenantId, blueprintId);
}
