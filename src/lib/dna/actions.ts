"use server";

// server actions ของ DNA Wizard — tenantId มาจาก session เสมอ (requireTenant)
// ห้ามรับ tenantId จาก client (กัน cross-tenant)

import { requireTenant } from "@/lib/core/context";
import { ZDnaFacts } from "./schema";
import type { BlueprintPlan, DnaFacts } from "./schema";
import { finalizeFacts } from "./questions";
import { saveDnaFacts, proposeBlueprint, applyBlueprint } from "./apply";
import { resolveProvider } from "@/lib/ai/provider";
import { aiEnabled } from "@/lib/ai/service";
import { nextInterviewTurn } from "@/lib/ai/interview";
import type { InterviewTurn } from "@/lib/ai/interview";

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

// โหมดพิมพ์อิสระ — LLM สัมภาษณ์จนได้ DnaFacts ครบ (M4 · WO-0016)
// ไม่มี provider (ยังไม่ใส่ key) → { enabled: false } ให้ UI ซ่อนโหมดนี้
// done → บันทึกข้อเท็จจริงแล้วบอก UI พาไปหน้าพิมพ์เขียว · ไม่ done → ส่งคำถามถัดไปกลับ
export type InterviewState =
  | { enabled: false }
  | { enabled: true; done: true }
  | { enabled: true; done: false; question: string };

// เช็คว่าชั้น AI เปิดใช้ไหม — เบา ๆ ไม่ยิง LLM (wizard ใช้ตัดสินใจโชว์ toggle)
export async function interviewEnabledAction(): Promise<boolean> {
  await requireTenant();
  return aiEnabled();
}

export async function interviewTurnAction(
  transcript: InterviewTurn[],
): Promise<InterviewState> {
  const auth = await requireTenant();
  const provider = resolveProvider();
  if (!provider) return { enabled: false };

  const result = await nextInterviewTurn(provider, auth.active.tenant.name, transcript);
  if (result.done) {
    await saveDnaFacts(auth.active.tenantId, result.facts);
    return { enabled: true, done: true };
  }
  return { enabled: true, done: false, question: result.question };
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
