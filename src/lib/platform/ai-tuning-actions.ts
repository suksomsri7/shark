"use server";

// Server actions — แอดมิน backoffice ตัดสินคำปรับปรุง prompt (AI self-improving item 4)

import { revalidatePath } from "next/cache";
import { requireBackoffice } from "./actions";
import { decidePromptTweak } from "./ai-tuning";

// ตัดสินคำปรับปรุง (อนุมัติ/ปฏิเสธ) — guard backoffice + revalidate · try/catch ไม่ leak error
export async function decidePromptTweakAction(
  id: string,
  decision: "APPROVED" | "REJECTED",
): Promise<{ ok: boolean; message: string }> {
  const user = await requireBackoffice();
  try {
    await decidePromptTweak(id, decision, user.id);
    revalidatePath("/backoffice/ai-tuning");
    return { ok: true, message: decision === "APPROVED" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "ตัดสินไม่สำเร็จ กรุณาลองใหม่" };
  }
}

// wrapper สำหรับผูกกับ <form action> โดยตรง (ต้องคืน void) — bind(null, id, decision)
export async function decidePromptTweakFormAction(
  id: string,
  decision: "APPROVED" | "REJECTED",
): Promise<void> {
  await decidePromptTweakAction(id, decision);
}
