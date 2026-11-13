// filed-differences.ts — "ผลต่างหลังยื่น" ของเดือนที่ทำเครื่องหมายยื่นแล้ว (ACC T1.7 ข้อ 2) · อ่านอย่างเดียว
//
// ภ.พ.30: รายการ GL ที่ลงเดือนนั้น สร้างหลังเวลาทำเครื่องหมายยื่น และแตะบัญชีภาษีตาม mapping
//   (อ่านจาก GL — งานเบื้องหลังที่ไม่มีใครยืนยันก็ขึ้นด้วย) · ผลรวมภาษีขาย/ภาษีซื้อ = ผลต่างที่แบบเพิ่มเติม (T1.3) จะยื่น
// ภ.ง.ด.3/53: 50 ทวิ ที่เราหัก (direction IN) ลงวันที่ในเดือนนั้น ที่ออกหรือถูกยกเลิกหลังเวลาทำเครื่องหมาย
// ใคร: ผู้กดยืนยันคำเตือน (AuditLog legal.warning.ack) → ไม่มีก็ผู้ลงรายการ/ผู้สร้าง → ไม่มีก็ "ระบบ" (null)
// design note ledger/wo-notes/T1.7.md
import { tenantDb } from "@/lib/core/db";
import { LEGAL_ACK_ACTION } from "@/lib/core/legal-ack";
import { FILED_VAT_KEYS, type FiledKey } from "./filed-guard";

type Ctx = { tenantId: string; systemId: string };

export type VatDiffRow = {
  entryId: string;
  entryNo: string | null;
  date: Date;
  createdAt: Date;
  refType: string;
  refId: string;
  docNo: string | null;
  docType: string | null;
  memo: string | null;
  manual: boolean;
  /** สตางค์ · + = ภาษีขายเพิ่ม */
  outputDelta: number;
  /** สตางค์ · + = ภาษีซื้อเพิ่ม */
  inputDelta: number;
  parkedDelta: number;
  byId: string | null;
  byName: string | null;
  acknowledged: boolean;
  /** หลังแบบเพิ่มเติมครั้งล่าสุด (ยังไม่ได้ยื่นในแบบใดเลย) */
  afterLatestFiling: boolean;
};

export type VatDifferences = {
  periodKey: string;
  filed: boolean;
  filedAt: Date | null;
  latestFiledAt: Date | null;
  rows: VatDiffRow[];
  totals: { output: number; input: number; parked: number; net: number };
  /** ผลรวมเฉพาะที่ยังไม่อยู่ในแบบใด (หลังแบบล่าสุด) */
  pending: { output: number; input: number; net: number };
};

async function ledgerIds(ctx: Ctx): Promise<Partial<Record<FiledKey, string>>> {
  const db = tenantDb(ctx);
  const keys = Object.keys(FILED_VAT_KEYS) as FiledKey[];
  const maps = await db.accountMapping.findMany({ where: { key: { in: keys } }, select: { key: true, accountId: true } });
  const out: Partial<Record<FiledKey, string>> = {};
  for (const m of maps) out[m.key as FiledKey] = m.accountId;
  const missing = keys.filter((k) => !out[k]);
  if (missing.length) {
    const ls = await db.accountLedger.findMany({ where: { code: { in: missing.map((k) => FILED_VAT_KEYS[k]) } }, select: { id: true, code: true } });
    for (const k of missing) {
      const l = ls.find((x) => x.code === FILED_VAT_KEYS[k]);
      if (l) out[k] = l.id;
    }
  }
  return out;
}

/** ชื่อผู้ใช้ (กลุ่มเดียว · กัน N+1) */
export async function namesOf(ctx: Ctx, ids: (string | null)[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (uniq.length === 0) return new Map();
  const users = await tenantDb(ctx).user.findMany({ where: { id: { in: uniq.filter((x) => !x.startsWith("apikey:")) } }, select: { id: true, name: true } });
  const m = new Map(users.map((u) => [u.id, u.name ?? ""]));
  for (const x of uniq) if (x.startsWith("apikey:")) m.set(x, "คีย์ API");
  return m;
}

async function ackers(ctx: Ctx, targetType: string, ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const rows = await tenantDb(ctx).auditLog.findMany({
    where: { action: LEGAL_ACK_ACTION, targetType, targetId: { in: ids } },
    select: { targetId: true, actorId: true, actorType: true },
  });
  // คีย์ API/เลขา: actorId = id ของคีย์ (ไม่ใช่ผู้ใช้) ⇒ ใส่คำนำหน้าให้ตัวหาชื่อแยกได้
  return new Map(rows.map((r) => [r.targetId ?? "", r.actorType === "API_KEY" ? `apikey:${r.actorId ?? ""}` : r.actorId]));
}

export async function vatFiledDifferences(ctx: Ctx, periodKey: string): Promise<VatDifferences> {
  const db = tenantDb(ctx);
  const [filing, adds] = await Promise.all([
    db.accountVatFiling.findFirst({ where: { periodKey, unmarkedAt: null }, select: { filedAt: true } }),
    db.accountVatAdditionalFiling.findMany({ where: { periodKey }, select: { filedAt: true }, orderBy: { seq: "asc" } }),
  ]);
  const empty: VatDifferences = { periodKey, filed: false, filedAt: null, latestFiledAt: null, rows: [], totals: { output: 0, input: 0, parked: 0, net: 0 }, pending: { output: 0, input: 0, net: 0 } };
  if (!filing) return empty;
  const latestFiledAt = adds.at(-1)?.filedAt ?? filing.filedAt;
  const ids = await ledgerIds(ctx);
  const vatIds = [ids.VAT_OUTPUT, ids.VAT_INPUT, ids.VAT_OUTPUT_UNDUE, ids.VAT_OUTPUT_PENDING_INVOICE, ids.VAT_INPUT_UNDUE].filter((x): x is string => !!x);
  const lines = await db.accountJournalLine.findMany({
    where: { accountId: { in: vatIds }, entry: { periodKey, createdAt: { gt: filing.filedAt } } },
    select: {
      accountId: true,
      debit: true,
      credit: true,
      entry: { select: { id: true, docNo: true, date: true, createdAt: true, refType: true, refId: true, memo: true, source: true, postedById: true } },
    },
  });
  const byEntry = new Map<string, VatDiffRow>();
  for (const l of lines) {
    const e = l.entry;
    const r: VatDiffRow =
      byEntry.get(e.id) ??
      {
        entryId: e.id, entryNo: e.docNo, date: e.date, createdAt: e.createdAt, refType: e.refType ?? "", refId: e.refId ?? "", docNo: null, docType: null,
        memo: e.memo, manual: e.source === "MANUAL", outputDelta: 0, inputDelta: 0, parkedDelta: 0, byId: e.postedById, byName: null, acknowledged: false,
        afterLatestFiling: e.createdAt > latestFiledAt,
      };
    byEntry.set(e.id, r);
    if (l.accountId === ids.VAT_OUTPUT) r.outputDelta += l.credit - l.debit;
    else if (l.accountId === ids.VAT_INPUT) r.inputDelta += l.debit - l.credit;
    else if (l.accountId === ids.VAT_INPUT_UNDUE) r.parkedDelta += l.debit - l.credit;
    else r.parkedDelta += l.credit - l.debit;
  }
  const rows = [...byEntry.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  // เลขเอกสาร/ผู้สร้างของที่มา
  const docIds = rows.filter((r) => r.refType === "AccountDocument").map((r) => r.refId);
  const payIds = rows.filter((r) => r.refType === "AccountDocumentPayment").map((r) => r.refId);
  const [docs, pays, acks] = await Promise.all([
    docIds.length ? db.accountDocument.findMany({ where: { id: { in: docIds } }, select: { id: true, docNo: true, docType: true, createdById: true } }) : [],
    payIds.length ? db.accountDocumentPayment.findMany({ where: { id: { in: payIds } }, select: { id: true, document: { select: { docNo: true, docType: true } } } }) : [],
    ackers(ctx, "AccountJournalEntry", rows.map((r) => r.entryId)),
  ]);
  for (const r of rows) {
    const d = docs.find((x) => x.id === r.refId);
    if (d) {
      r.docNo = d.docNo;
      r.docType = d.docType;
      r.byId = r.byId ?? d.createdById ?? null;
    }
    const p = pays.find((x) => x.id === r.refId);
    if (p) {
      r.docNo = p.document?.docNo ?? null;
      r.docType = p.document?.docType ?? null;
    }
    if (acks.has(r.entryId)) {
      r.acknowledged = true;
      r.byId = acks.get(r.entryId) ?? r.byId;
    }
  }
  const names = await namesOf(ctx, rows.map((r) => r.byId));
  for (const r of rows) r.byName = r.byId ? (names.get(r.byId) ?? null) : null;
  const sum = (f: (r: VatDiffRow) => number, xs = rows) => xs.reduce((n, r) => n + f(r), 0);
  const pend = rows.filter((r) => r.afterLatestFiling);
  const totals = { output: sum((r) => r.outputDelta), input: sum((r) => r.inputDelta), parked: sum((r) => r.parkedDelta), net: 0 };
  totals.net = totals.output - totals.input;
  const pending = { output: sum((r) => r.outputDelta, pend), input: sum((r) => r.inputDelta, pend), net: 0 };
  pending.net = pending.output - pending.input;
  return { periodKey, filed: true, filedAt: filing.filedAt, latestFiledAt, rows, totals, pending };
}

export type PndDiffRow = {
  form: 3 | 53;
  certId: string;
  certNo: string | null;
  contactName: string;
  issueDate: Date;
  change: "ISSUED_AFTER" | "VOIDED_AFTER";
  at: Date;
  /** สตางค์ · + = ภาษีที่ต้องนำส่งเพิ่ม */
  whtDelta: number;
  byId: string | null;
  byName: string | null;
  acknowledged: boolean;
};

export type PndDifferences = { periodKey: string; forms: { form: 3 | 53; filedAt: Date }[]; rows: PndDiffRow[]; totals: Record<"3" | "53", number> };

export async function pndFiledDifferences(ctx: Ctx, periodKey: string): Promise<PndDifferences> {
  const db = tenantDb(ctx);
  const filings = await db.accountWhtFiling.findMany({ where: { periodKey, unmarkedAt: null }, select: { form: true, filedAt: true } });
  const forms = filings.map((f) => ({ form: (f.form === 3 ? 3 : 53) as 3 | 53, filedAt: f.filedAt }));
  const out: PndDifferences = { periodKey, forms, rows: [], totals: { "3": 0, "53": 0 } };
  if (forms.length === 0) return out;
  const [y, m] = periodKey.split("-").map(Number);
  const gte = new Date(Date.UTC(y, m - 1, 1) - 7 * 3_600_000);
  const lt = new Date(Date.UTC(y, m, 1) - 7 * 3_600_000);
  const earliest = new Date(Math.min(...forms.map((f) => f.filedAt.getTime())));
  const certs = await db.accountDocument.findMany({
    where: { docType: "WHT_CERT", direction: "IN", issueDate: { gte, lt }, OR: [{ createdAt: { gt: earliest } }, { voidedAt: { gt: earliest } }] },
    select: { id: true, docNo: true, issueDate: true, createdAt: true, voidedAt: true, status: true, whtAmount: true, createdById: true, sourcePaymentId: true, contactSnapshot: true, contact: { select: { name: true, legalType: true } } },
  });
  const acks = await ackers(ctx, "AccountDocument", certs.map((c) => c.id));
  // 50 ทวิ ที่ออกพร้อมการจ่าย: คำเตือนถูกยืนยันที่รายการบัญชีของงวดจ่าย (WHT ค้างนำส่งลงเดือนนั้น) ⇒ ตามไปหาผู้ยืนยันที่นั่น
  const payIds = certs.map((c) => c.sourcePaymentId).filter((x): x is string => !!x);
  if (payIds.length) {
    const ents = await db.accountJournalEntry.findMany({ where: { refType: "AccountDocumentPayment", refId: { in: payIds } }, select: { id: true, refId: true } });
    const entAcks = await ackers(ctx, "AccountJournalEntry", ents.map((e) => e.id));
    for (const c of certs) {
      if (acks.has(c.id) || !c.sourcePaymentId) continue;
      const hit = ents.find((e) => e.refId === c.sourcePaymentId && entAcks.has(e.id));
      if (hit) acks.set(c.id, entAcks.get(hit.id) ?? null);
    }
  }
  for (const c of certs) {
    const snap = (c.contactSnapshot ?? null) as { legalType?: string; name?: string } | null;
    const form: 3 | 53 = (snap?.legalType ?? c.contact?.legalType) === "PERSON" ? 3 : 53;
    const f = forms.find((x) => x.form === form);
    if (!f) continue;
    const base = { form, certId: c.id, certNo: c.docNo, contactName: snap?.name ?? c.contact?.name ?? "—", issueDate: c.issueDate, byId: acks.get(c.id) ?? c.createdById ?? null, byName: null as string | null, acknowledged: acks.has(c.id) };
    if (c.createdAt > f.filedAt && c.status === "ISSUED") out.rows.push({ ...base, change: "ISSUED_AFTER", at: c.createdAt, whtDelta: c.whtAmount });
    if (c.voidedAt && c.voidedAt > f.filedAt && c.createdAt <= f.filedAt) out.rows.push({ ...base, change: "VOIDED_AFTER", at: c.voidedAt, whtDelta: -c.whtAmount });
  }
  out.rows.sort((a, b) => a.at.getTime() - b.at.getTime());
  const names = await namesOf(ctx, out.rows.map((r) => r.byId));
  for (const r of out.rows) r.byName = r.byId ? (names.get(r.byId) ?? null) : null;
  for (const r of out.rows) out.totals[String(r.form) as "3" | "53"] += r.whtDelta;
  return out;
}

/** ACC T1.7 — แถวนำส่ง ภ.ง.ด. ที่ยังมีผลของงวด/แบบ (หน้า ภ.ง.ด.3/53 แสดงสถานะ + ยกเลิกเครื่องหมาย) */
export async function pndFilingOf(ctx: Ctx, form: 3 | 53, periodKey: string) {
  return tenantDb(ctx).accountWhtFiling.findFirst({
    where: { periodKey, form, unmarkedAt: null },
    select: { filedAt: true, filedById: true, certCount: true, totalTaxSatang: true },
  });
}

/** ACC T1.7/T1.9 — ข้อมูลให้ฟอร์มบนจอเตือนล่วงหน้า: บัญชีภาษี/WHT ของสมุด (mapping) + เดือนที่ยื่นแล้ว */
export async function filedMarksForUi(ctx: Ctx): Promise<{
  taxAccounts: { id: string; key: string; code: string; name: string }[];
  filedVatMonths: string[];
  filedPndMonths: string[];
}> {
  const db = tenantDb(ctx);
  const ids = await ledgerIds(ctx);
  const entries = Object.entries(ids) as [FiledKey, string][];
  const [ls, vat, pnd] = await Promise.all([
    db.accountLedger.findMany({ where: { id: { in: entries.map(([, id]) => id) } }, select: { id: true, code: true, name: true } }),
    db.accountVatFiling.findMany({ where: { unmarkedAt: null }, select: { periodKey: true } }),
    db.accountWhtFiling.findMany({ where: { unmarkedAt: null }, select: { periodKey: true } }),
  ]);
  return {
    taxAccounts: entries.flatMap(([key, id]) => {
      const l = ls.find((x) => x.id === id);
      return l ? [{ id, key, code: l.code, name: l.name }] : [];
    }),
    filedVatMonths: vat.map((v) => v.periodKey),
    filedPndMonths: [...new Set(pnd.map((p) => p.periodKey))],
  };
}
