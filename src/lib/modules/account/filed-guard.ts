// filed-guard.ts — ด่าน "ลงรายการเข้าเดือนที่ยื่นแล้ว" (ACC T1.7 · ปิด E10/G5)
//
// ด่านเดียว เรียกจากชั้นลงบัญชี (gl.ts commitEntry — คอขวดของทุกการลงบัญชี) + จุดยกเลิก/ออก 50 ทวิ (ภ.ง.ด.)
//   · ไม่บล็อกด้วยเหตุผลกฎหมาย: คำเตือนในทะเบียนกลาง ack=true → ต้องยืนยัน → บันทึกผู้ยืนยัน (T0.4 AuditLog) ในธุรกรรมเดียวกัน
//   · บริบทการยืนยันอ่านจาก `legalAmbient()` (src/lib/core/legal-ambient.ts) — ผู้เรียกชั้นนอกเปิดไว้
//   · ไม่มีบริบท (งานเบื้องหลัง) = ไม่ถาม ไม่บล็อก — ยังขึ้นใน "ผลต่างหลังยื่น" (อ่านจาก GL)
//   · ต่างจากงวดปิด (assertPeriodOpen) ซึ่งเป็นความถูกต้องของข้อมูล — ยังปฏิเสธเหมือนเดิม
// design note ledger/wo-notes/T1.7.md
import type { Prisma } from "@prisma/client";
import { tenantDb } from "@/lib/core/db";
import { recordLegalAckInTx } from "@/lib/core/legal-ack";
import { legalAmbient, notePendingLegal } from "@/lib/core/legal-ambient";
import { LegalAckRequiredError, legalWarning, unacknowledged, type LegalWarning } from "@/lib/core/settings/legal/warnings";

type Tx = Prisma.TransactionClient;
type Ctx = { tenantId: string; systemId: string };

/** บัญชีภาษีที่ ภ.พ.30 อ่าน (mapping) + รหัสผังเริ่มต้นเมื่อสมุดไม่มีแถว mapping (ทางเดียวกับ pp30-return.vatLedgers) */
export const FILED_VAT_KEYS = {
  VAT_OUTPUT: "2200",
  VAT_INPUT: "1150",
  VAT_OUTPUT_UNDUE: "2210",
  VAT_OUTPUT_PENDING_INVOICE: "2205",
  VAT_INPUT_UNDUE: "1155",
  WHT_PAYABLE: "2130",
} as const;
export type FiledKey = keyof typeof FILED_VAT_KEYS;

/** บัญชีภาษี/WHT ของสมุดตาม mapping (fallback รหัสผังเริ่มต้น) — อ่านใน tx เดียวกับการลงบัญชี */
export async function filedLedgerIdsInTx(db: Tx, systemId: string): Promise<Partial<Record<FiledKey, string>>> {
  const keys = Object.keys(FILED_VAT_KEYS) as FiledKey[];
  const maps = await db.accountMapping.findMany({ where: { systemId, key: { in: keys } }, select: { key: true, accountId: true } });
  const out: Partial<Record<FiledKey, string>> = {};
  for (const m of maps) out[m.key as FiledKey] = m.accountId;
  const missing = keys.filter((k) => !out[k]);
  if (missing.length) {
    const ls = await db.accountLedger.findMany({ where: { systemId, code: { in: missing.map((k) => FILED_VAT_KEYS[k]) } }, select: { id: true, code: true } });
    for (const k of missing) {
      const l = ls.find((x) => x.code === FILED_VAT_KEYS[k]);
      if (l) out[k] = l.id;
    }
  }
  return out;
}

export type VatEffect = { output: number; input: number; parked: number; wht: number };

/** ผลของบรรทัดบัญชีต่อภาษี (สตางค์): ภาษีขาย = เครดิตสุทธิ · ภาษีซื้อ = เดบิตสุทธิ · พัก = สุทธิของบัญชีพัก · WHT ค้างนำส่ง = เครดิตสุทธิ */
export function vatEffectOf(lines: readonly { accountId: string; debit: number; credit: number }[], ids: Partial<Record<FiledKey, string>>): VatEffect {
  const net = (id: string | undefined, sign: 1 | -1) => (id ? lines.filter((l) => l.accountId === id).reduce((n, l) => n + sign * (l.credit - l.debit), 0) : 0);
  return {
    output: net(ids.VAT_OUTPUT, 1),
    input: net(ids.VAT_INPUT, -1),
    parked: net(ids.VAT_OUTPUT_UNDUE, 1) + net(ids.VAT_OUTPUT_PENDING_INVOICE, 1) + net(ids.VAT_INPUT_UNDUE, -1),
    wht: net(ids.WHT_PAYABLE, 1),
  };
}

const bahtSigned = (s: number) => `${s < 0 ? "−" : s > 0 ? "+" : ""}${(Math.abs(s) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** เดือนนี้ยื่น ภ.พ.30 แล้วไหม (แถวที่ยังไม่ถูกยกเลิกเครื่องหมาย) */
export async function vatFiledInTx(db: Tx, systemId: string, periodKey: string): Promise<boolean> {
  return (await db.accountVatFiling.count({ where: { systemId, periodKey, unmarkedAt: null } })) > 0;
}

/** แบบ ภ.ง.ด. ที่ทำเครื่องหมายนำส่งแล้วของเดือนนี้ (ยังมีผล) */
export async function pndFiledFormsInTx(db: Tx, systemId: string, periodKey: string): Promise<number[]> {
  const rows = await db.accountWhtFiling.findMany({ where: { systemId, periodKey, unmarkedAt: null }, select: { form: true } });
  return rows.map((r) => r.form).sort();
}

/**
 * ตัดสินจากคำเตือนที่ได้: ไม่มี → ผ่าน · มีบริบท+ยืนยันครบ → คืนตัวบันทึก (เรียกหลังเขียนได้ id) · มีบริบทแต่ยังไม่ยืนยัน → จด+โยน ·
 * ไม่มีบริบท (งานเบื้องหลัง) → ผ่าน ไม่บันทึกการยืนยัน
 */
export function decide(warnings: LegalWarning[]): ((db: Tx, ctx: Ctx, target: { op: string; targetType: string; targetId: string }) => Promise<void>) | null {
  if (warnings.length === 0) return null;
  const amb = legalAmbient();
  if (!amb) return null;
  const missing = unacknowledged(warnings, amb.ack.codes);
  if (missing.length > 0) {
    notePendingLegal(warnings);
    throw new LegalAckRequiredError(warnings);
  }
  return (db, ctx, target) => recordLegalAckInTx(db, { tenantId: ctx.tenantId, ack: amb.ack, op: target.op, targetType: target.targetType, targetId: target.targetId, warnings });
}

/**
 * ด่านของ gl.ts commitEntry — เรียก "ก่อน" สร้างรายการ (โยนได้โดยยังไม่ได้เขียนอะไร) · คืนตัวบันทึกการยืนยันให้เรียกหลังได้ id
 * ราคาถูกเมื่อไม่ได้ยื่น: 2 count ต่อการลงบัญชี
 */
export async function filedPeriodGuardInTx(
  db: Tx,
  ctx: Ctx,
  entry: { periodKey: string; refType: string; refId: string; memo?: string | null; lines: readonly { accountId: string; debit: number; credit: number }[] },
): Promise<((entryId: string) => Promise<void>) | null> {
  const [vatFiled, pndForms] = await Promise.all([vatFiledInTx(db, ctx.systemId, entry.periodKey), pndFiledFormsInTx(db, ctx.systemId, entry.periodKey)]);
  if (!vatFiled && pndForms.length === 0) return null;
  const ids = await filedLedgerIdsInTx(db, ctx.systemId);
  const eff = vatEffectOf(entry.lines, ids);
  const touchesVat = [ids.VAT_OUTPUT, ids.VAT_INPUT, ids.VAT_OUTPUT_UNDUE, ids.VAT_OUTPUT_PENDING_INVOICE, ids.VAT_INPUT_UNDUE].some((id) => id && entry.lines.some((l) => l.accountId === id));
  const touchesWht = !!ids.WHT_PAYABLE && entry.lines.some((l) => l.accountId === ids.WHT_PAYABLE);
  const ref = await refLabelInTx(db, ctx.systemId, entry.refType, entry.refId, entry.memo ?? null);
  const ws: LegalWarning[] = [];
  if (vatFiled && touchesVat)
    ws.push(legalWarning("FILED_PERIOD_VAT_CHANGE", { period: entry.periodKey, ref, output: bahtSigned(eff.output), input: bahtSigned(eff.input), ...(eff.parked ? { parked: bahtSigned(eff.parked) } : {}) }));
  if (pndForms.length > 0 && touchesWht)
    ws.push(legalWarning("FILED_PERIOD_PND_CHANGE", { period: entry.periodKey, forms: pndForms.map((f) => `ภ.ง.ด.${f}`).join("/"), ref, what: "ลงภาษีหัก ณ ที่จ่ายค้างนำส่งเข้าเดือนนั้น", amount: `${bahtSigned(eff.wht)} บาท` }));
  const rec = decide(ws);
  return rec ? (entryId) => rec(db, ctx, { op: "account.gl.post", targetType: "AccountJournalEntry", targetId: entryId }) : null;
}

/**
 * ด่านของ 50 ทวิ (ภ.ง.ด.) ระดับเอกสาร — ออก/ยกเลิก 50 ทวิ ที่เราหัก (direction IN) ของเดือนที่ทำเครื่องหมายนำส่งแล้ว
 * (การยกเลิกจ่ายกลับรายการ GL "วันนี้" ⇒ ด่าน GL ไม่เห็นเดือนเดิม แต่รายการ ภ.ง.ด. ของเดือนนั้นเปลี่ยน)
 */
export async function pndCertGuardInTx(
  db: Tx,
  ctx: Ctx,
  cert: { id: string; issueDate: Date; docNo: string | null; whtAmount: number },
  what: "ISSUE" | "VOID",
): Promise<void> {
  const periodKey = bkkPeriodKey(cert.issueDate);
  const forms = await pndFiledFormsInTx(db, ctx.systemId, periodKey);
  if (forms.length === 0) return;
  const w = legalWarning("FILED_PERIOD_PND_CHANGE", {
    period: periodKey,
    forms: forms.map((f) => `ภ.ง.ด.${f}`).join("/"),
    ref: `50 ทวิ ${cert.docNo ?? "(ยังไม่มีเลข)"}`,
    what: what === "VOID" ? "ยกเลิก 50 ทวิ ของเดือนนั้น" : "ออก 50 ทวิ ลงวันที่ในเดือนนั้น",
    amount: `ภาษี ${bahtSigned(what === "VOID" ? -cert.whtAmount : cert.whtAmount)} บาท`,
  });
  const rec = decide([w]);
  if (rec) await rec(db, ctx, { op: what === "VOID" ? "account.wht.cert.void" : "account.wht.cert.issue", targetType: "AccountDocument", targetId: cert.id });
}

export function bkkPeriodKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
}

async function refLabelInTx(db: Tx, systemId: string, refType: string, refId: string, memo: string | null): Promise<string> {
  if (refType === "AccountDocument") {
    const d = await db.accountDocument.findFirst({ where: { id: refId, systemId }, select: { docNo: true, docType: true } });
    if (d) return d.docNo ?? `${d.docType} (ยังไม่มีเลข)`;
  }
  if (refType === "AccountDocumentPayment") {
    const p = await db.accountDocumentPayment.findFirst({ where: { id: refId, systemId }, select: { document: { select: { docNo: true } } } });
    if (p) return `รับ/จ่ายชำระของ ${p.document?.docNo ?? "เอกสาร"}`;
  }
  return memo ? memo.slice(0, 80) : refType === "AccountManualJV" ? "รายการบัญชีที่บันทึกเอง" : refType;
}

/**
 * ตัวอย่างคำเตือนล่วงหน้าบนจอ (ไม่โยน · ไม่เขียน) — ฟอร์มที่จะลงรายการวันที่ `date` แสดงช่องติ๊กยืนยันก่อนกด
 * ด่านจริงอยู่ที่ชั้นลงบัญชีเสมอ (จอเป็นแค่การบอกล่วงหน้า) · effect โดยประมาณจากยอดของเอกสาร
 */
export async function filedPeriodPreview(
  ctx: Ctx,
  input: { date: Date; ref: string; output?: number; input?: number; wht?: number },
): Promise<LegalWarning[]> {
  const db = tenantDb(ctx);
  const periodKey = bkkPeriodKey(input.date);
  const [vatCount, pnd] = await Promise.all([
    db.accountVatFiling.count({ where: { periodKey, unmarkedAt: null } }),
    db.accountWhtFiling.findMany({ where: { periodKey, unmarkedAt: null }, select: { form: true } }),
  ]);
  const vatFiled = vatCount > 0;
  const forms = pnd.map((r) => r.form).sort();
  const out: LegalWarning[] = [];
  if (vatFiled && ((input.output ?? 0) !== 0 || (input.input ?? 0) !== 0))
    out.push(legalWarning("FILED_PERIOD_VAT_CHANGE", { period: periodKey, ref: input.ref, output: bahtSigned(input.output ?? 0), input: bahtSigned(input.input ?? 0) }));
  if (forms.length > 0 && (input.wht ?? 0) !== 0)
    out.push(legalWarning("FILED_PERIOD_PND_CHANGE", { period: periodKey, forms: forms.map((f) => `ภ.ง.ด.${f}`).join("/"), ref: input.ref, what: "ลงภาษีหัก ณ ที่จ่ายเข้าเดือนนั้น", amount: `${bahtSigned(input.wht ?? 0)} บาท` }));
  return out;
}

/**
 * ACC T1.9 — ด่านคำเตือนแบบ "ถามเฉพาะเมื่อมีคนให้ถาม" (บริบทการยืนยันของ T1.7) สำหรับคำเตือนที่ต้องยืนยัน
 * มีบริบท: ยืนยันครบ = บันทึกผู้ยืนยัน · ไม่ครบ = จด+โยน (ยังไม่ได้เขียน) · ไม่มีบริบท (งานเบื้องหลัง) = ผ่าน
 */
export async function ambientLegalGateInTx(db: Tx, ctx: Ctx, warnings: LegalWarning[], target: { op: string; targetType: string; targetId: string }): Promise<void> {
  const rec = decide(warnings.filter((w) => w.ack));
  if (rec) await rec(db, ctx, target);
}
