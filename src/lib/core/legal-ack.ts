// legal-ack.ts — บันทึก "ใครกดยืนยันผ่านคำเตือนกฎหมาย" (T0.4) · ของกลางแพลตฟอร์ม (บัญชี · บัตรกำนัล · โมดูลอื่นใช้ร่วม)
//
// 🔴 เก็บใน AuditLog เดิม (ไม่มี schema ใหม่): action `legal.warning.ack` · targetType/targetId = สิ่งที่ทำ · after = รหัส + มาตรา + ป้าย
// 🔴 เขียน **ในธุรกรรมเดียวกับการกระทำ** — การกระทำล้ม = ไม่มีแถวยืนยันค้าง · การกระทำสำเร็จ = มีแถวเสมอ (ต่างจาก writeAudit ที่กลืน error)
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { LegalAck, LegalWarning } from "./settings/legal/warnings";

export const LEGAL_ACK_ACTION = "legal.warning.ack";

export type LegalAckRecord = {
  tenantId: string;
  ack: LegalAck;
  /** การกระทำ เช่น "account.doc.issue" · "giftcard.settings.update" */
  op: string;
  targetType: string;
  targetId: string;
  /** คำเตือนที่ผู้ใช้ยืนยันผ่าน (เฉพาะที่ ack=true และอยู่ในรหัสที่ยืนยัน) */
  warnings: readonly LegalWarning[];
};

export async function recordLegalAckInTx(tx: Prisma.TransactionClient, r: LegalAckRecord): Promise<void> {
  if (r.warnings.length === 0) return;
  await tx.auditLog.create({
    data: {
      tenantId: r.tenantId,
      actorType: r.ack.actorType ?? "USER",
      actorId: r.ack.actorId ?? null,
      action: LEGAL_ACK_ACTION,
      targetType: r.targetType,
      targetId: r.targetId,
      after: {
        op: r.op,
        via: r.ack.via ?? null,
        codes: r.warnings.map((w) => w.code),
        warnings: r.warnings.map((w) => ({ code: w.code, citation: w.citation ?? null, tag: w.tag ?? null, checkedAt: w.checkedAt ?? null })),
      } as Prisma.InputJsonValue,
    },
  });
}

export type LegalAckRow = { id: string; actorType: string; actorId: string | null; at: Date; op: string | null; codes: string[] };

/** ประวัติการกดยืนยันของสิ่งหนึ่ง (เก่า → ใหม่) */
export async function listLegalAcks(tenantId: string, targetType: string, targetId: string): Promise<LegalAckRow[]> {
  const rows = await prisma.auditLog.findMany({
    where: { tenantId, action: LEGAL_ACK_ACTION, targetType, targetId },
    orderBy: { createdAt: "asc" },
    select: { id: true, actorType: true, actorId: true, createdAt: true, after: true },
  });
  return rows.map((r) => {
    const a = (r.after ?? {}) as { op?: unknown; codes?: unknown };
    return {
      id: r.id,
      actorType: r.actorType,
      actorId: r.actorId,
      at: r.createdAt,
      op: typeof a.op === "string" ? a.op : null,
      codes: Array.isArray(a.codes) ? a.codes.filter((c): c is string => typeof c === "string") : [],
    };
  });
}
