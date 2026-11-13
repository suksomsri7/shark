"use server";

// print-actions.ts — ACC T2.7 · ปุ่ม "พิมพ์" บนหน้ารายละเอียดเอกสาร → บันทึกการพิมพ์ แล้วคืน URL หน้าพิมพ์ (?p=<printId>)
//   สิทธิ์ = ดูเอกสารได้ (account.doc.view) — การพิมพ์ไม่เปลี่ยนเอกสาร · ต้นฉบับพิมพ์ซ้ำ = คำเตือน [V] ต้องกดยืนยัน (ack)
import { loadAccountSystem } from "./guard";
import { recordDocPrint } from "./print-log";
import { isPrintChannel, isPrintRequest } from "./print-shared";
import type { LegalAckRequired } from "@/lib/core/settings/legal/warnings";

export type PrintActionResult = { ok: true; url: string } | { ok: false; reason: string; legal?: LegalAckRequired };

type PrintActionInput = {
  systemId: string;
  docId: string;
  request: string;
  channel: string;
  substituteReason?: string;
  substituteDate?: string;
  ack?: string[];
};

export async function printDocAction(input: PrintActionInput): Promise<PrintActionResult> {
  const { tenantId, systemId, userId } = await loadAccountSystem(String(input.systemId ?? ""), { can: "account.doc.view" });
  if (!isPrintRequest(input.request) || !isPrintChannel(input.channel)) return { ok: false, reason: "คำขอพิมพ์ไม่ถูกต้อง" };
  const date = typeof input.substituteDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.substituteDate) ? new Date(`${input.substituteDate}T12:00:00+07:00`) : null;
  const res = await recordDocPrint({ tenantId, systemId }, String(input.docId ?? "").slice(0, 40), {
    request: input.request,
    channel: input.channel,
    actorId: userId,
    substitute: input.request === "SUBSTITUTE" ? { reason: String(input.substituteReason ?? ""), date } : null,
    ack: { codes: (input.ack ?? []).filter((c) => typeof c === "string" && c.length <= 64), actorId: userId, actorType: "USER", via: "screen" },
  });
  if (!res.ok) return { ok: false, reason: res.reason, ...(res.legal ? { legal: res.legal } : {}) };
  return { ok: true, url: `/app/sys/${systemId}/account/print/${input.docId}?p=${res.printId}&auto=1` };
}
