// asset-v2.ts — ทะเบียนสินทรัพย์ V2 + ตารางค่าเสื่อมรายงวด (WO 6.2 · DESIGN-SPEC-V2 §11.5)
//
// ของเดิมที่ห้ามเขียนใหม่: `asset.ts` (listAssets · registerAsset · nextDepreciationAmount · runDepreciation ·
//                        disposeAsset) · `gl.postDepreciation` (idempotent ต่อ assetId+periodKey)
// ที่เพิ่มในนี้: (1) **ตารางค่าเสื่อมรายงวดของสินทรัพย์ 1 ตัว** — ข้อมูลมีอยู่ใน AccountDepreciation
//                   มาตลอดแต่ไม่เคยแสดงบนหน้าจอเลย (§11.5 "มีข้อมูลแล้วแต่ไม่เคยแสดง")
//               (2) **พรีวิวก่อนกดคิดค่าเสื่อม** — บอกล่วงหน้าว่างวดนี้จะลงบัญชีให้ตัวไหน เท่าไร รวมเท่าไร
//
// 🔴 ใช้ `tenantDb(ctx)` (ไม่ใช่ prisma ตรง) — fitness F5.1

import { tenantDb } from "@/lib/core/db";
import { nextDepreciationAmount, currentPeriodKey } from "./asset";

export type AssetCtx = { tenantId: string; systemId: string };

export const ASSET_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ใช้งาน",
  FULLY_DEPRECIATED: "ค่าเสื่อมครบ",
  DISPOSED: "จำหน่ายแล้ว",
  WRITTEN_OFF: "ตัดบัญชี",
};

export const DISPOSAL_METHOD_LABEL: Record<string, string> = {
  SELL: "ขาย",
  WRITE_OFF: "ตัดบัญชี",
};

// ─────────────────── 1) ตารางค่าเสื่อมรายงวด (§11.5) ───────────────────

export type DepreciationRow = {
  id: string;
  periodKey: string;
  amount: number;
  /** ใบสำคัญที่ลงบัญชีค่าเสื่อมงวดนี้ (คลิกทะลุไปสมุดรายวันได้) */
  entryId: string | null;
  entryDocNo: string | null;
  /** ค่าเสื่อมสะสมถึงงวดนี้ */
  accumAfter: number;
  /** มูลค่าสุทธิหลังงวดนี้ = cost − accumAfter */
  netBookAfter: number;
};

export type AssetDetail = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  status: string;
  statusLabel: string;
  acquiredDate: Date;
  startDepDate: Date;
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  note: string | null;
  disposedAt: Date | null;
  disposalMethod: string | null;
  disposalMethodLabel: string | null;
  disposalAmount: number | null;
  accounts: { asset: LedgerRef | null; accum: LedgerRef | null; expense: LedgerRef | null };
  /** ค่าเสื่อมสะสมทั้งหมด */
  accumDepreciation: number;
  netBookValue: number;
  monthsDepreciated: number;
  /** ค่าเสื่อมที่จะคิดในงวดถัดไป (0 = ครบแล้ว / ยังไม่ถึงงวด) */
  nextAmount: number;
  rows: DepreciationRow[];
};

type LedgerRef = { id: string; code: string; name: string };

export async function assetDetail(ctx: AssetCtx, assetId: string): Promise<AssetDetail | null> {
  const db = tenantDb(ctx);
  const a = await db.accountFixedAsset.findFirst({
    where: { id: assetId },
    include: { depreciations: { orderBy: { periodKey: "asc" } } },
  });
  if (!a) return null;

  const ledgerIds = [a.assetAccountId, a.accumAccountId, a.expenseAccountId];
  const entryIds = a.depreciations.map((d) => d.entryId).filter((x): x is string => !!x);
  const [ledgers, entries] = await Promise.all([
    db.accountLedger.findMany({ where: { id: { in: ledgerIds } }, select: { id: true, code: true, name: true } }),
    entryIds.length
      ? db.accountJournalEntry.findMany({ where: { id: { in: entryIds } }, select: { id: true, docNo: true } })
      : Promise.resolve([]),
  ]);
  const ledgerById = new Map(ledgers.map((l) => [l.id, l]));
  const docNoById = new Map(entries.map((e) => [e.id, e.docNo]));

  let accum = 0;
  const rows: DepreciationRow[] = a.depreciations.map((d) => {
    accum += d.amount;
    return {
      id: d.id,
      periodKey: d.periodKey,
      amount: d.amount,
      entryId: d.entryId,
      entryDocNo: d.entryId ? (docNoById.get(d.entryId) ?? null) : null,
      accumAfter: accum,
      netBookAfter: a.cost - accum,
    };
  });

  return {
    id: a.id,
    code: a.code,
    name: a.name,
    category: a.category,
    status: a.status,
    statusLabel: ASSET_STATUS_LABEL[a.status] ?? a.status,
    acquiredDate: a.acquiredDate,
    startDepDate: a.startDepDate,
    cost: a.cost,
    salvageValue: a.salvageValue,
    usefulLifeMonths: a.usefulLifeMonths,
    note: a.note,
    disposedAt: a.disposedAt,
    disposalMethod: a.disposalMethod,
    disposalMethodLabel: a.disposalMethod ? (DISPOSAL_METHOD_LABEL[a.disposalMethod] ?? a.disposalMethod) : null,
    disposalAmount: a.disposalAmount,
    accounts: {
      asset: ledgerById.get(a.assetAccountId) ?? null,
      accum: ledgerById.get(a.accumAccountId) ?? null,
      expense: ledgerById.get(a.expenseAccountId) ?? null,
    },
    accumDepreciation: accum,
    netBookValue: a.cost - accum,
    monthsDepreciated: a.depreciations.length,
    nextAmount:
      a.status === "ACTIVE"
        ? nextDepreciationAmount({
            cost: a.cost,
            salvageValue: a.salvageValue,
            usefulLifeMonths: a.usefulLifeMonths,
            monthsDepreciated: a.depreciations.length,
            accumDepreciation: accum,
          })
        : 0,
    rows,
  };
}

// ─────────────────── 2) พรีวิว "คิดค่าเสื่อมงวดนี้" (§11.5) ───────────────────

export type DepreciationPreviewRow = {
  assetId: string;
  code: string;
  name: string;
  amount: number;
  /** เหตุผลที่ยังคิดไม่ได้ (null = คิดได้) */
  skipReason: string | null;
  /** งวดนี้ลงบัญชีไปแล้ว (กดซ้ำจะไม่เบิ้ล — idempotent ที่ unique assetId+periodKey) */
  alreadyPosted: boolean;
};

export type DepreciationPreview = {
  periodKey: string;
  rows: DepreciationPreviewRow[];
  /** ยอดรวมที่จะลงบัญชีจริงถ้ากดตอนนี้ */
  totalAmount: number;
  postableCount: number;
  alreadyPostedCount: number;
};

/** "YYYY-MM" ของ startDepDate เวลาไทย */
function startPeriodOf(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }).slice(0, 7);
}

/**
 * ดูล่วงหน้าว่ากด "คิดค่าเสื่อมงวดนี้" แล้วจะเกิดอะไร — **ไม่เขียน DB**
 * ใช้สูตรตัวเดียวกับ `asset.nextDepreciationAmount` ที่ runDepreciation ใช้จริง (ห้ามคำนวณคนละทาง)
 */
export async function previewDepreciation(
  ctx: AssetCtx,
  periodKey: string = currentPeriodKey(),
): Promise<DepreciationPreview> {
  const db = tenantDb(ctx);
  const assets = await db.accountFixedAsset.findMany({ where: { status: "ACTIVE" }, orderBy: { code: "asc" } });
  if (assets.length === 0)
    return { periodKey, rows: [], totalAmount: 0, postableCount: 0, alreadyPostedCount: 0 };

  const deps = await db.accountDepreciation.groupBy({
    by: ["assetId"],
    where: { assetId: { in: assets.map((a) => a.id) } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const byAsset = new Map(deps.map((d) => [d.assetId, d]));
  const posted = await db.accountDepreciation.findMany({
    where: { periodKey, assetId: { in: assets.map((a) => a.id) } },
    select: { assetId: true },
  });
  const postedSet = new Set(posted.map((p) => p.assetId));

  const rows: DepreciationPreviewRow[] = assets.map((a) => {
    const d = byAsset.get(a.id);
    const accum = d?._sum.amount ?? 0;
    const months = d?._count._all ?? 0;
    const alreadyPosted = postedSet.has(a.id);
    const notStarted = startPeriodOf(a.startDepDate) > periodKey;
    const amount = nextDepreciationAmount({
      cost: a.cost,
      salvageValue: a.salvageValue,
      usefulLifeMonths: a.usefulLifeMonths,
      monthsDepreciated: months,
      accumDepreciation: accum,
    });
    const skipReason = alreadyPosted
      ? "ลงบัญชีงวดนี้แล้ว"
      : notStarted
        ? "ยังไม่ถึงงวดเริ่มคิดค่าเสื่อม"
        : amount === 0
          ? "ค่าเสื่อมครบแล้ว"
          : null;
    return { assetId: a.id, code: a.code, name: a.name, amount: skipReason ? 0 : amount, skipReason, alreadyPosted };
  });

  return {
    periodKey,
    rows,
    totalAmount: rows.reduce((s, r) => s + r.amount, 0),
    postableCount: rows.filter((r) => !r.skipReason).length,
    alreadyPostedCount: rows.filter((r) => r.alreadyPosted).length,
  };
}
