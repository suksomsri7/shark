"use server";

// etax-actions.ts — server actions ของจอ ACC T5.4 (เลน 2): ค่าตั้ง e-Tax ประทับเวลา · ดูคำเตือนก่อนส่ง · ส่ง/ส่งซ้ำ · อัปโหลดไฟล์ประทับเวลา
//   ตัวคิดเดียวกับ REST (etax-ts.ts) · สิทธิ์ตรงกับ op ของ REST (ส่ง/บันทึกไฟล์ = account.doc.issue · ค่าตั้ง = account.settings.manage)
// 🔴 ไฟล์ "use server": export async function เท่านั้น
import { revalidatePath } from "next/cache";
import type { LegalWarning } from "@/lib/core/settings/legal/warnings";
import { ETAX_TS_ELIGIBILITY, ETAX_TS_SUBJECT_DATE_FORMATS, type EtaxTsEligibility, type EtaxTsSubjectDateFormat } from "@/lib/core/settings/legal/th-tax-2569";
import { loadAccountSystem } from "./guard";
import { assertAccountCan, mc } from "./access";
import { safeReason } from "./errors";
import { etaxSendWarnings, recordStampedFile, saveEtaxTsSettings, sendEtaxTs, type EtaxTsSettingsPatch } from "./etax-ts";

type Res = { ok: true; warnings?: LegalWarning[]; message?: string } | { ok: false; reason: string; warnings?: LegalWarning[] };
const sid = (v: unknown) => String(v ?? "").slice(0, 40);

export async function saveEtaxSettingsAction(systemId: string, patch: Record<string, unknown>): Promise<Res> {
  try {
    const { auth, tenantId, userId } = await loadAccountSystem(sid(systemId));
    assertAccountCan(auth, "account.settings.manage");
    const p: EtaxTsSettingsPatch = {
      ...(typeof patch?.enabled === "boolean" ? { enabled: patch.enabled } : {}),
      ...(typeof patch?.autoOnIssue === "boolean" ? { autoOnIssue: patch.autoOnIssue } : {}),
      ...(typeof patch?.senderEmail === "string" ? { senderEmail: patch.senderEmail.slice(0, 200) } : {}),
      ...(typeof patch?.ccAddress === "string" ? { ccAddress: patch.ccAddress.slice(0, 200) } : {}),
      ...(typeof patch?.subjectDateFormat === "string" && (ETAX_TS_SUBJECT_DATE_FORMATS as readonly string[]).includes(patch.subjectDateFormat) ? { subjectDateFormat: patch.subjectDateFormat as EtaxTsSubjectDateFormat } : {}),
      ...(typeof patch?.eligibility === "string" && (ETAX_TS_ELIGIBILITY as readonly string[]).includes(patch.eligibility) ? { eligibility: patch.eligibility as EtaxTsEligibility } : {}),
    };
    const r = await saveEtaxTsSettings({ ...mc(auth), userId }, { tenantId, systemId: sid(systemId) }, p);
    if (!r.ok) return r;
    revalidatePath(`/app/sys/${sid(systemId)}/account/settings/tax`);
    return { ok: true, warnings: r.settings.warnings };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกค่าตั้ง e-Tax ไม่สำเร็จ") };
  }
}

export async function previewEtaxSendAction(systemId: string, documentId: string): Promise<Res> {
  try {
    const { auth, tenantId } = await loadAccountSystem(sid(systemId));
    assertAccountCan(auth, "account.doc.issue");
    const r = await etaxSendWarnings({ tenantId, systemId: sid(systemId) }, sid(documentId));
    if ("reason" in r) return { ok: false, reason: r.reason };
    return { ok: true, warnings: r.warnings };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "อ่านคำเตือนไม่สำเร็จ") };
  }
}

export async function sendEtaxAction(systemId: string, input: { documentId: string; to: string; mode: "SEND" | "RESEND_STAMPED"; ack: string[] }): Promise<Res> {
  try {
    const { auth, tenantId, userId } = await loadAccountSystem(sid(systemId));
    assertAccountCan(auth, "account.doc.issue");
    const r = await sendEtaxTs(
      { tenantId, systemId: sid(systemId) },
      {
        documentId: sid(input.documentId),
        to: String(input.to ?? "").slice(0, 200) || null,
        mode: input.mode === "RESEND_STAMPED" ? "RESEND_STAMPED" : "SEND",
        actorId: userId,
        actorType: "USER",
        via: "screen",
        ack: { codes: Array.isArray(input.ack) ? input.ack.map(String).slice(0, 10) : [], actorId: userId, actorType: "USER", via: "screen" },
      },
    );
    if (!r.ok) return { ok: false, reason: r.reason, warnings: r.legal?.warnings ?? r.warnings };
    revalidatePath(`/app/sys/${sid(systemId)}/account`, "layout");
    return { ok: true, warnings: r.warnings, message: r.status === "SENT" ? `ส่งแล้ว (ครั้งที่ ${r.attemptNo}) ${r.subject} → ${r.to}${r.cc ? ` · สำเนา ${r.cc}` : ""}` : `ส่งไม่สำเร็จ (ครั้งที่ ${r.attemptNo}): ${r.error ?? ""}` };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "ส่ง e-Tax ไม่สำเร็จ") };
  }
}

export async function uploadStampedAction(systemId: string, input: { documentId: string; fileName: string; base64: string }): Promise<Res> {
  try {
    const { auth, tenantId, userId } = await loadAccountSystem(sid(systemId));
    assertAccountCan(auth, "account.doc.issue");
    const b64 = String(input?.base64 ?? "");
    if (!b64) return { ok: false, reason: "เลือกไฟล์ PDF ที่ระบบประทับเวลาส่งกลับ" };
    if (b64.length > 7_000_000) return { ok: false, reason: "ไฟล์ใหญ่เกิน 5 MB" };
    const bytes = new Uint8Array(Buffer.from(b64, "base64"));
    const r = await recordStampedFile({ tenantId, systemId: sid(systemId) }, { documentId: sid(input.documentId), fileName: String(input.fileName ?? "stamped.pdf").slice(0, 120), bytes, actorId: userId, actorType: "USER", via: "screen" });
    if (!r.ok) return r;
    revalidatePath(`/app/sys/${sid(systemId)}/account`, "layout");
    return { ok: true, message: `บันทึกไฟล์ประทับเวลาแล้ว · SHA-256 ${r.sha256.slice(0, 16)}…${r.sameAsSent ? " (เหมือนไฟล์ที่ส่งทุกไบต์ — ตรวจว่าเป็นไฟล์ที่ได้กลับมาจริง)" : ""}` };
  } catch (e) {
    return { ok: false, reason: safeReason(e, "บันทึกไฟล์ไม่สำเร็จ") };
  }
}
