// audit-trail.ts — รายงานการแก้ไขของบัญชี (ACC T4.4 · E12 G2 G7) · อ่านอย่างเดียว
//
// กฎ: คำสั่ง ป.121/2545 ข้อ 6 "ต้องมีรายงานการแก้ไขรายการ" + บันทึกการใช้ระบบ [V] · ประกาศ VAT ฉ.89 ข้อ 12(ข)
//   รายงานการแก้ไข = เอกสารอ้างอิง · วันที่ เวลา · รหัสผู้ทำ · จำนวนเงิน [V] (skill: domain-accounting-books §ง3 · common-vat-invoice §18)
// แหล่ง (ไม่มีตารางใหม่):
//   ① AuditLog ของร้าน action `account.*` + `legal.warning.ack` (ใครกดยืนยันคำเตือน)
//   ② การกลับรายการในสมุดรายวัน (AccountJournalEntry.reversalOfId) — จำนวนเงิน + ใบเดิม
//   ③ การเข้าระบบของสมาชิกร้าน (AuditLog `auth.*` ระดับผู้ใช้ — core/signin-log.ts)
// 🔴 ทุก query กรอง tenantId · แถวที่ระบุสมุดได้ต้องเป็นสมุดนี้ (ctx.systemId)
import type { ActorType, Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { likeStartsWith } from "@/lib/core/ci-equals";
import { auditActionLabelTh, listSignInLogs } from "./access";

export type AuditTrailKind = "all" | "cancel" | "legal" | "signin";
export const AUDIT_TRAIL_KINDS: readonly AuditTrailKind[] = ["all", "cancel", "legal", "signin"];

export type AuditTrailRow = {
  /** id ของแถวต้นทาง (AuditLog.id หรือ "jv:<entryId>") */
  id: string;
  at: Date;
  source: "audit" | "journal" | "signin";
  action: string;
  actionLabel: string;
  actorType: ActorType | "SYSTEM";
  actorId: string | null;
  actorName: string;
  targetType: string | null;
  targetId: string | null;
  /** เลขที่เอกสาร/ใบสำคัญที่อ้าง (ถ้าหาได้) */
  ref: string | null;
  /** จำนวนเงิน (สตางค์) ที่เกี่ยว — กลับรายการ = Σ เดบิต · ยกเลิกเอกสาร = ยอดสุทธิ · ยกเลิกรับชำระ = ยอดรับ */
  amountSatang: number | null;
  /** เหตุผล (การยกเลิก/กลับรายการ/ยกเลิกเครื่องหมาย ฯลฯ) */
  reason: string | null;
  /** cancel = ยกเลิก/กลับรายการ · legal = กดยืนยันคำเตือน · signin = เข้า/ออกระบบ · change = อื่น */
  category: "cancel" | "legal" | "signin" | "change";
  detail: string | null;
};

export type AuditTrailPage = { rows: AuditTrailRow[]; nextCursor: string | null; total: number };

const CANCEL_RE = /\.(void|cancel|reverse|unmark|bounce|forfeit|replace|reopen|dispose|writeoff|unmatch)\b|\.voided$|\.reopened$/;

/** ป้ายไทยของ action ที่ใช้บ่อยในรายงาน (ที่เหลือ → auditActionLabelTh) */
const LABELS: Record<string, string> = {
  "account.doc.void": "ยกเลิกเอกสาร",
  "account.payment.void": "ยกเลิกรายการรับ/จ่ายเงิน",
  "account.journal.reverse": "กลับรายการสมุดรายวัน",
  "account.journal.adjust": "บันทึกรายการปรับปรุง (JV)",
  "account.doc.issue": "ออกเอกสาร",
  "account.doc.create": "สร้าง/แก้ไขเอกสาร",
  "account.doc.approve": "อนุมัติเอกสาร",
  "account.payment.record": "บันทึกรับ/จ่ายเงิน",
  "account.period.close": "ปิดงวด",
  "account.period.reopen": "เปิดงวดใหม่",
  "account.vat-filing.mark": "ทำเครื่องหมายยื่น ภ.พ.30",
  "account.vat-filing.unmark": "ยกเลิกเครื่องหมายยื่น ภ.พ.30",
  "account.wht-filing.mark": "ทำเครื่องหมายนำส่ง ภ.ง.ด.",
  "account.wht-filing.unmark": "ยกเลิกเครื่องหมายนำส่ง ภ.ง.ด.",
  "account.cheque.void": "ยกเลิกเช็ค",
  "account.cheque.bounce": "เช็คคืน",
  "account.taxinvoice.replace": "ยกเลิกและออกใบกำกับภาษีแทน",
  "account.wht.cert.replace": "ออก 50 ทวิ แทนฉบับเดิม",
  "account.deposit.forfeit": "ริบเงินมัดจำ",
  "account.payment_request.cancel": "ยกเลิกคำขอชำระเงิน",
  "account.settings.manage": "แก้ค่าตั้งของสมุด",
  "legal.warning.ack": "กดยืนยันคำเตือนกฎหมาย",
  "auth.signin": "เข้าระบบ",
  "auth.signout": "ออกจากระบบ",
  "auth.signin.failed": "เข้าระบบไม่สำเร็จ",
};
export const labelOfAuditAction = (a: string): string => LABELS[a] ?? auditActionLabelTh(a);

const METHOD_TH: Record<string, string> = {
  otp: "รหัส OTP ทางอีเมล",
  "magic-link": "ลิงก์ทางอีเมล",
  google: "Google",
  line: "LINE",
  facebook: "Facebook",
  "page-pin": "PIN หน้าร้าน",
  "app-webview": "แอปมือถือ",
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function actorTypeLabel(t: string): string {
  if (t === "SYSTEM") return "ระบบอัตโนมัติ";
  if (t === "PLATFORM_USER") return "ผู้ดูแลแพลตฟอร์ม";
  if (t === "API_KEY") return "แอปภายนอก (API key)";
  return "ผู้ใช้ที่ไม่ได้อยู่ในร้านแล้ว";
}

export type AuditTrailQuery = {
  from?: Date;
  to?: Date;
  kind?: AuditTrailKind;
  actorId?: string;
  /** จำนวนต่อหน้า (ปริยาย 100 · เพดาน 500) */
  take?: number;
  /** ตำแหน่งเริ่ม (offset) จาก nextCursor */
  cursor?: string;
};

/**
 * รายงานการแก้ไขของสมุดนี้ เรียงใหม่สุดก่อน · รวม 3 แหล่ง แล้วตัดหน้า
 * (ช่วงวันปริยาย = 90 วันล่าสุด เพื่อจำกัดปริมาณอ่าน — จอ/REST ระบุช่วงเองได้)
 */
export async function listAccountChanges(ctx: { tenantId: string; systemId: string }, q: AuditTrailQuery = {}): Promise<AuditTrailPage> {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 90 * 86_400_000);
  const kind = q.kind ?? "all";
  const take = Math.min(Math.max(Math.trunc(q.take ?? 100), 1), 500);
  const offset = Math.max(0, Number.parseInt(q.cursor ?? "0", 10) || 0);
  const createdAt = { gte: from, lte: to };

  const tdb = tenantDb({ tenantId: ctx.tenantId });
  const bdb = tenantDb({ tenantId: ctx.tenantId, systemId: ctx.systemId });
  const members = await tdb.membership.findMany({ where: { tenantId: ctx.tenantId }, select: { userId: true, user: { select: { name: true, email: true } } } });
  const nameOf = new Map(members.map((m) => [m.userId, m.user.name ?? m.user.email]));
  const bookCount = await tdb.appSystem.count({ where: { tenantId: ctx.tenantId, type: "ACCOUNT" } });

  const rows: AuditTrailRow[] = [];
  /** audit "กลับรายการ" ของจอ/REST (targetId = ใบเดิม) → ใครกด — รวมเข้าแถวกลับรายการของสมุดรายวัน ไม่แสดงซ้ำ */
  const reverseBy = new Map<string, { actorType: ActorType; actorId: string | null; reason: string | null; auditId: string }>();

  // ① AuditLog ของร้าน
  if (kind !== "signin") {
    const where: Prisma.AuditLogWhereInput = {
      tenantId: ctx.tenantId,
      createdAt,
      ...(q.actorId ? { actorId: q.actorId } : {}),
      OR: kind === "legal" ? [{ action: "legal.warning.ack" }] : [{ action: likeStartsWith("account.") }, { action: "legal.warning.ack" }],
    };
    const logs = await tdb.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5000 });
    // เป้าหมายที่ระบุสมุดได้
    const ids = (t: string) => [...new Set(logs.filter((l) => l.targetType === t && l.targetId).map((l) => l.targetId as string))];
    const [docs, pays, jvs, cheques] = await Promise.all([
      bdb.accountDocument.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids("AccountDocument") } }, select: { id: true, systemId: true, docNo: true, docType: true, grandTotal: true, voidReason: true } }),
      bdb.accountDocumentPayment.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids("AccountDocumentPayment") } }, select: { id: true, systemId: true, amount: true, voidReason: true, document: { select: { docNo: true } } } }),
      bdb.accountJournalEntry.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids("AccountJournalEntry") } }, select: { id: true, systemId: true, docNo: true } }),
      bdb.accountCheque.findMany({ where: { tenantId: ctx.tenantId, id: { in: ids("AccountCheque") } }, select: { id: true, systemId: true, chequeNo: true, amount: true } }),
    ]);
    type T = { systemId: string; ref: string | null; amount: number | null; voidReason: string | null };
    const target = new Map<string, T>();
    for (const d of docs) target.set(`AccountDocument:${d.id}`, { systemId: d.systemId, ref: d.docNo, amount: d.grandTotal, voidReason: d.voidReason });
    for (const p of pays) target.set(`AccountDocumentPayment:${p.id}`, { systemId: p.systemId, ref: p.document?.docNo ?? null, amount: p.amount, voidReason: p.voidReason });
    for (const j of jvs) target.set(`AccountJournalEntry:${j.id}`, { systemId: j.systemId, ref: j.docNo, amount: null, voidReason: null });
    for (const c of cheques) target.set(`AccountCheque:${c.id}`, { systemId: c.systemId, ref: c.chequeNo, amount: c.amount, voidReason: null });

    for (const l of logs) {
      if (l.action === "account.journal.reverse" && l.targetId) {
        const a = obj(l.after);
        if (!reverseBy.has(l.targetId)) reverseBy.set(l.targetId, { actorType: l.actorType, actorId: l.actorId, reason: str(a.reason), auditId: l.id });
        if (kind === "all" || kind === "cancel") continue; // แสดงรวมกับแถวกลับรายการของสมุดรายวัน
      }
      const t = l.targetType && l.targetId ? target.get(`${l.targetType}:${l.targetId}`) : undefined;
      const after = obj(l.after);
      const before = obj(l.before);
      // กรองสมุด: เป้าหมายรู้สมุด → ต้องเป็นสมุดนี้ · ไม่รู้ → ใช้ after.systemId / targetId = สมุด / ร้านที่มีสมุดเดียว
      const sysOf = t?.systemId ?? str(after.systemId) ?? (l.targetType === "AppSystem" ? l.targetId : null);
      if (sysOf ? sysOf !== ctx.systemId : bookCount > 1) continue;
      const cancel = CANCEL_RE.test(l.action);
      const category: AuditTrailRow["category"] = l.action === "legal.warning.ack" ? "legal" : cancel ? "cancel" : "change";
      if (kind === "cancel" && category !== "cancel") continue;
      const reason = str(after.reason) ?? str(before.reason) ?? str(after.unmarkReason) ?? (cancel ? t?.voidReason ?? null : null);
      const codes = Array.isArray(after.codes) ? (after.codes as unknown[]).filter((x): x is string => typeof x === "string") : [];
      const err = str(after.error);
      rows.push({
        id: l.id,
        at: l.createdAt,
        source: "audit",
        action: l.action,
        actionLabel: labelOfAuditAction(l.action),
        actorType: l.actorType,
        actorId: l.actorId,
        actorName: l.actorType === "USER" && l.actorId ? nameOf.get(l.actorId) ?? actorTypeLabel("USER") : actorTypeLabel(l.actorType),
        targetType: l.targetType,
        targetId: l.targetId,
        ref: t?.ref ?? str(after.docNo) ?? null,
        amountSatang: cancel || l.action === "account.payment.record" ? t?.amount ?? null : null,
        reason,
        category,
        detail: category === "legal" ? (codes.length ? `รหัส ${codes.join(", ")}${str(after.op) ? ` · ${str(after.op)}` : ""}` : null) : err ? `ไม่สำเร็จ: ${err}` : null,
      });
    }
  }

  // ② กลับรายการในสมุดรายวัน (ทุกทาง — จอ · REST · ยกเลิกเอกสาร · POS/หอ ยกเลิกบิล)
  if (kind === "all" || kind === "cancel") {
    const revs = await bdb.accountJournalEntry.findMany({
      where: { tenantId: ctx.tenantId, systemId: ctx.systemId, reversalOfId: { not: null }, createdAt, ...(q.actorId ? { postedById: q.actorId } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 5000,
      select: { id: true, docNo: true, createdAt: true, memo: true, postedById: true, source: true, reversalOfId: true, reversalOf: { select: { docNo: true, memo: true } }, lines: { select: { debit: true } } },
    });
    for (const r of revs) {
      const by = r.reversalOfId ? reverseBy.get(r.reversalOfId) : undefined;
      const actorId = r.postedById ?? by?.actorId ?? null;
      const actorType: ActorType = r.postedById ? "USER" : by?.actorType ?? "SYSTEM";
      rows.push({
        id: `jv:${r.id}`,
        at: r.createdAt,
        source: "journal",
        action: "journal.reversal",
        actionLabel: "กลับรายการสมุดรายวัน",
        actorType,
        actorId,
        actorName: actorType === "USER" && actorId ? nameOf.get(actorId) ?? actorTypeLabel("USER") : actorTypeLabel(actorType),
        targetType: "AccountJournalEntry",
        targetId: r.id,
        ref: `${r.docNo} ← ${r.reversalOf?.docNo ?? "-"}`,
        amountSatang: r.lines.reduce((n, l) => n + l.debit, 0),
        reason: by?.reason ?? (r.memo ? r.memo.replace(/^กลับรายการ:\s*/, "") : null),
        category: "cancel",
        detail: r.reversalOf?.memo ? `ใบเดิม: ${r.reversalOf.memo}` : null,
      });
    }
  }

  // ③ เข้า/ออกระบบของสมาชิกร้าน
  if (kind === "all" || kind === "signin") {
    const userIds = q.actorId ? [q.actorId].filter((u) => nameOf.has(u)) : [...nameOf.keys()];
    if (userIds.length) {
      const sign = await listSignInLogs(userIds, createdAt);
      for (const l of sign) {
        const after = obj(l.after);
        const m = str(after.method);
        rows.push({
          id: l.id,
          at: l.createdAt,
          source: "signin",
          action: l.action,
          actionLabel: labelOfAuditAction(l.action),
          actorType: l.actorType,
          actorId: l.actorId,
          actorName: l.actorId ? nameOf.get(l.actorId) ?? actorTypeLabel("USER") : actorTypeLabel(l.actorType),
          targetType: null,
          targetId: null,
          ref: null,
          amountSatang: null,
          reason: str(after.reason),
          category: "signin",
          detail: [m ? `ทาง ${METHOD_TH[m] ?? m}` : null, l.ip ? `IP ${l.ip}` : null].filter(Boolean).join(" · ") || null,
        });
      }
    }
  }

  rows.sort((a, b) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : -1));
  const page = rows.slice(offset, offset + take);
  return { rows: page, nextCursor: offset + take < rows.length ? String(offset + take) : null, total: rows.length };
}

/** CSV (UTF-8 BOM) ของรายงาน — คอลัมน์ตามรายงานการแก้ไข (ฉ.89 ข้อ 12): วันเวลา · ผู้ทำ · รายการ · เอกสาร · จำนวนเงิน · เหตุผล */
export function auditTrailCsv(rows: readonly AuditTrailRow[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const bkk = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d);
  const head = ["วันเวลา (เวลาไทย)", "ผู้ทำ", "รายการ", "เอกสาร/ใบสำคัญ", "จำนวนเงิน (บาท)", "เหตุผล", "รายละเอียด"];
  const body = rows.map((r) => [bkk(r.at), r.actorName, r.actionLabel, r.ref ?? "", r.amountSatang === null ? "" : (r.amountSatang / 100).toFixed(2), r.reason ?? "", r.detail ?? ""].map(esc).join(","));
  return `﻿${[head.join(","), ...body].join("\n")}\n`;
}
