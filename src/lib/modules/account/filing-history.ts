// filing-history.ts — ประวัติการทำ/ยกเลิกเครื่องหมายยื่น ภ.พ.30 และ ภ.ง.ด.3/53 (ACC T1.7)
//
// แถวยื่นไม่ถูกลบอีกต่อไป (unmarkedAt/unmarkedById/unmarkReason) · ทุกครั้งที่ทำเครื่องหมาย / ยกเลิก / ทำเครื่องหมายใหม่
// เขียน AuditLog ในธุรกรรมเดียวกัน (ภาพตัวเลขก่อนเปลี่ยนอยู่ใน `before`) ⇒ อ่านย้อนได้ว่าใคร เมื่อไร เพราะอะไร ยื่นตัวเลขอะไรไป
// design note ledger/wo-notes/T1.7.md
import { tenantDb } from "@/lib/core/db";

type Ctx = { tenantId: string; systemId: string };

export const FILING_AUDIT = {
  vatMark: "account.vat-filing.mark",
  vatRefile: "account.vat-filing.refile",
  vatUnmark: "account.vat-filing.unmark",
  whtMark: "account.wht-filing.mark",
  whtRefile: "account.wht-filing.refile",
  whtUnmark: "account.wht-filing.unmark",
} as const;

/** ภาพของแถวยื่น (เก็บเฉพาะฟิลด์ตัวเลข/ผู้ยื่น ไม่เก็บ id ภายนอก) */
export function filingSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  const keep = [
    "periodKey", "form", "filedAt", "filedById", "salesVatSatang", "inputVatSatang", "payableSatang", "note", "lines",
    "creditBroughtForwardSatang", "excessChoice", "netSatang", "totalBaseSatang", "totalTaxSatang", "certCount", "certIds",
    "unmarkedAt", "unmarkedById", "unmarkReason",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (row[k] !== undefined) out[k] = row[k] instanceof Date ? (row[k] as Date).toISOString() : row[k];
  return out;
}

export type FilingHistoryRow = {
  action: "MARK" | "REFILE" | "UNMARK";
  at: Date;
  actorId: string | null;
  actorType: string;
  reason: string | null;
  /** ภาพก่อนเปลี่ยน (ยกเลิก/ทำใหม่) */
  before: Record<string, unknown> | null;
  /** ภาพหลังเปลี่ยน (ทำเครื่องหมาย) */
  after: Record<string, unknown> | null;
};

/** ประวัติของเดือนหนึ่ง (เก่า → ใหม่) · kind = "PP30" | 3 | 53 */
export async function filingHistory(ctx: Ctx, kind: "PP30" | 3 | 53, periodKey: string): Promise<FilingHistoryRow[]> {
  const db = tenantDb(ctx);
  const row =
    kind === "PP30"
      ? await db.accountVatFiling.findFirst({ where: { periodKey }, select: { id: true } })
      : await db.accountWhtFiling.findFirst({ where: { periodKey, form: kind }, select: { id: true } });
  if (!row) return [];
  const acts = kind === "PP30" ? [FILING_AUDIT.vatMark, FILING_AUDIT.vatRefile, FILING_AUDIT.vatUnmark] : [FILING_AUDIT.whtMark, FILING_AUDIT.whtRefile, FILING_AUDIT.whtUnmark];
  const logs = await db.auditLog.findMany({
    where: { action: { in: acts }, targetType: kind === "PP30" ? "AccountVatFiling" : "AccountWhtFiling", targetId: row.id },
    orderBy: { createdAt: "asc" },
    select: { action: true, createdAt: true, actorId: true, actorType: true, before: true, after: true },
  });
  return logs.map((l) => {
    const after = (l.after ?? null) as Record<string, unknown> | null;
    return {
      action: l.action.endsWith(".unmark") ? "UNMARK" : l.action.endsWith(".refile") ? "REFILE" : "MARK",
      at: l.createdAt,
      actorId: l.actorId,
      actorType: String(l.actorType),
      reason: typeof after?.reason === "string" ? after.reason : null,
      before: (l.before ?? null) as Record<string, unknown> | null,
      after,
    };
  });
}
