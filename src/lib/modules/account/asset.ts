// asset.ts — ทะเบียนสินทรัพย์ถาวร + ค่าเสื่อมราคา (เส้นตรง) + ขาย/ตัดจำหน่าย (P3)
// อ้างสเปค docs/modules/12-account.md §3.6 (สินทรัพย์) · §7.10 (ค่าเสื่อม Dr6800/Cr16x9) · F8 (cron รายเดือน)
// เจ้าของไฟล์ = Asset-P3 agent · ห้ามแตะ prisma/gl/coa/service/actions/ui
// เงิน Int สตางค์ล้วน · ค่าเสื่อม = $transaction คู่กับ gl.postDepreciation · idempotent ต่อ (assetId, periodKey)
// double-entry ยืนยันฝั่ง gl (Σdebit == Σcredit)

import { prisma } from "@/lib/core/db";
import type { Prisma, AccountAssetStatus } from "@prisma/client";
import { postDepreciation, postManualJV, resolveMapping, type GlCtx } from "./gl";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export type AssetCtx = GlCtx; // { tenantId, systemId }

// ─────────────────── ตัวช่วยเวลา/งวด (TZ ไทย) ───────────────────

/** periodKey ของเดือนปัจจุบันตามเวลาไทย เช่น "2026-07" */
export function currentPeriodKey(now: Date = new Date()): string {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return s.slice(0, 7);
}

/** วันสุดท้ายของงวด (ใช้เป็นวันที่ลงบัญชีค่าเสื่อม) — เที่ยงวัน UTC กันเหลื่อม TZ */
function periodEndDate(periodKey: string): Date {
  const [y, m] = periodKey.split("-").map(Number);
  // วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้
  return new Date(Date.UTC(y, m, 0, 12, 0, 0));
}

/** periodKey ต้องมาก่อนหรือเท่ากับ periodKey ของ startDepDate หรือไม่ (เริ่มคิดค่าเสื่อมได้) */
function periodStarted(startDepDate: Date, periodKey: string): boolean {
  const start = currentPeriodKey(startDepDate);
  return periodKey >= start;
}

// ─────────────────── ลิสต์บัญชีสำหรับฟอร์ม ───────────────────

export type LedgerOption = { id: string; code: string; name: string };

async function ledgersWhere(
  ctx: AssetCtx,
  filter: (code: string) => boolean,
  type: "ASSET" | "EXPENSE",
  db: Db = prisma,
): Promise<LedgerOption[]> {
  const rows = await db.accountLedger.findMany({
    where: { systemId: ctx.systemId, type, archivedAt: null },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  return rows.filter((r) => filter(r.code));
}

/** บัญชีสินทรัพย์ 16xx (ไม่ลงท้าย 9 = ตัวสินทรัพย์ ไม่ใช่ค่าเสื่อมสะสม) */
export function listAssetAccounts(ctx: AssetCtx, db?: Db) {
  return ledgersWhere(ctx, (c) => c.startsWith("16") && !c.endsWith("9"), "ASSET", db);
}

/** บัญชีค่าเสื่อมสะสม 16x9 */
export function listAccumAccounts(ctx: AssetCtx, db?: Db) {
  return ledgersWhere(ctx, (c) => c.startsWith("16") && c.endsWith("9"), "ASSET", db);
}

/** บัญชีค่าใช้จ่ายค่าเสื่อม 68xx (default 6800) */
export function listExpenseAccounts(ctx: AssetCtx, db?: Db) {
  return ledgersWhere(ctx, (c) => c.startsWith("68") || c.startsWith("6"), "EXPENSE", db);
}

/** บัญชีเงิน (สำหรับเงินรับจากการขายสินทรัพย์) */
export async function listFinanceAccounts(ctx: AssetCtx): Promise<
  { id: string; name: string; ledgerAccountId: string | null; type: string }[]
> {
  return prisma.accountFinance.findMany({
    where: { systemId: ctx.systemId, archivedAt: null },
    select: { id: true, name: true, ledgerAccountId: true, type: true },
    orderBy: { createdAt: "asc" },
  });
}

/** เอกสารซื้อสินทรัพย์ (ASSET_PURCHASE) ที่ยังไม่ได้ขึ้นทะเบียน — ใช้เป็น sourceDocumentId */
export async function listAssetSourceDocs(ctx: AssetCtx): Promise<
  { id: string; docNo: string | null; issueDate: Date; base: number; contactName: string | null }[]
> {
  const registered = await prisma.accountFixedAsset.findMany({
    where: { systemId: ctx.systemId, sourceDocumentId: { not: null } },
    select: { sourceDocumentId: true },
  });
  const used = new Set(registered.map((r) => r.sourceDocumentId!));
  const docs = await prisma.accountDocument.findMany({
    where: { systemId: ctx.systemId, docType: "ASSET_PURCHASE", voidedAt: null },
    select: {
      id: true,
      docNo: true,
      issueDate: true,
      subTotal: true,
      discountAmount: true,
      contact: { select: { name: true } },
    },
    orderBy: { issueDate: "desc" },
  });
  return docs
    .filter((d) => !used.has(d.id))
    .map((d) => ({
      id: d.id,
      docNo: d.docNo,
      issueDate: d.issueDate,
      base: d.subTotal - d.discountAmount, // ยอดที่ลง 16xx (ไม่รวม VAT ซื้อ)
      contactName: d.contact?.name ?? null,
    }));
}

// ─────────────────── ทะเบียน + net book value ───────────────────

export type AssetRow = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  acquiredDate: Date;
  startDepDate: Date;
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  status: AccountAssetStatus;
  monthsDepreciated: number;
  accumDepreciation: number; // ค่าเสื่อมสะสม (สตางค์)
  netBookValue: number; // cost − accum
  disposalAmount: number | null;
  disposedAt: Date | null;
};

export async function listAssets(ctx: AssetCtx): Promise<AssetRow[]> {
  const assets = await prisma.accountFixedAsset.findMany({
    where: { systemId: ctx.systemId },
    orderBy: { code: "asc" },
  });
  const sums = await prisma.accountDepreciation.groupBy({
    by: ["assetId"],
    where: { systemId: ctx.systemId },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const byAsset = new Map(sums.map((s) => [s.assetId, s]));
  return assets.map((a) => {
    const s = byAsset.get(a.id);
    const accum = s?._sum.amount ?? 0;
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      category: a.category,
      acquiredDate: a.acquiredDate,
      startDepDate: a.startDepDate,
      cost: a.cost,
      salvageValue: a.salvageValue,
      usefulLifeMonths: a.usefulLifeMonths,
      status: a.status,
      monthsDepreciated: s?._count._all ?? 0,
      accumDepreciation: accum,
      netBookValue: a.cost - accum,
      disposalAmount: a.disposalAmount,
      disposedAt: a.disposedAt,
    };
  });
}

export async function getAsset(ctx: AssetCtx, assetId: string) {
  return prisma.accountFixedAsset.findFirst({
    where: { id: assetId, systemId: ctx.systemId },
    include: { depreciations: { orderBy: { periodKey: "asc" } } },
  });
}

// ─────────────────── ขึ้นทะเบียนสินทรัพย์ ───────────────────

export type RegisterInput = {
  name: string;
  category?: string | null;
  acquiredDate: Date;
  startDepDate: Date;
  cost: number; // สตางค์
  salvageValue: number; // สตางค์ (≥ 100)
  usefulLifeMonths: number;
  assetAccountId: string; // 16xx
  accumAccountId: string; // 16x9
  expenseAccountId: string; // 6800
  sourceDocumentId?: string | null;
  note?: string | null;
};

export type RegisterResult = { ok: true; id: string; code: string } | { ok: false; reason: string };

export async function registerAsset(ctx: AssetCtx, input: RegisterInput): Promise<RegisterResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, reason: "กรุณากรอกชื่อสินทรัพย์" };
  if (!Number.isFinite(input.cost) || input.cost <= 0) return { ok: false, reason: "มูลค่าต้นทุนต้องมากกว่า 0" };
  if (!Number.isFinite(input.salvageValue) || input.salvageValue < 100)
    return { ok: false, reason: "มูลค่าซากต้องไม่น้อยกว่า 100 สตางค์ (1 บาท)" };
  if (input.salvageValue >= input.cost) return { ok: false, reason: "มูลค่าซากต้องน้อยกว่าต้นทุน" };
  if (!Number.isInteger(input.usefulLifeMonths) || input.usefulLifeMonths < 1)
    return { ok: false, reason: "อายุการใช้งานต้องเป็นจำนวนเดือน ≥ 1" };
  if (!input.assetAccountId || !input.accumAccountId || !input.expenseAccountId)
    return { ok: false, reason: "กรุณาเลือกบัญชีสินทรัพย์ / ค่าเสื่อมสะสม / ค่าใช้จ่าย" };
  if (isNaN(input.acquiredDate.getTime()) || isNaN(input.startDepDate.getTime()))
    return { ok: false, reason: "วันที่ไม่ถูกต้อง" };

  try {
    const res = await prisma.$transaction(async (tx) => {
      // ตรวจว่า 3 บัญชีเป็นของ system นี้จริง
      const ledgers = await tx.accountLedger.findMany({
        where: {
          systemId: ctx.systemId,
          id: { in: [input.assetAccountId, input.accumAccountId, input.expenseAccountId] },
        },
        select: { id: true },
      });
      if (new Set(ledgers.map((l) => l.id)).size < 3)
        throw new Error("บัญชีที่เลือกไม่อยู่ในผังบัญชีของระบบนี้");

      // ตรวจ source doc (ถ้ามี) เป็น ASSET_PURCHASE ของ system + ยังไม่ถูกใช้
      if (input.sourceDocumentId) {
        const doc = await tx.accountDocument.findFirst({
          where: { id: input.sourceDocumentId, systemId: ctx.systemId, docType: "ASSET_PURCHASE" },
          select: { id: true },
        });
        if (!doc) throw new Error("ไม่พบเอกสารซื้อสินทรัพย์ต้นทาง");
        const dup = await tx.accountFixedAsset.findFirst({
          where: { systemId: ctx.systemId, sourceDocumentId: input.sourceDocumentId },
          select: { id: true },
        });
        if (dup) throw new Error("เอกสารนี้ขึ้นทะเบียนสินทรัพย์ไปแล้ว");
      }

      const code = await nextAssetCode(ctx, tx);
      const asset = await tx.accountFixedAsset.create({
        data: {
          tenantId: ctx.tenantId,
          systemId: ctx.systemId,
          code,
          name,
          category: input.category?.trim() || null,
          acquiredDate: input.acquiredDate,
          startDepDate: input.startDepDate,
          cost: Math.round(input.cost),
          salvageValue: Math.round(input.salvageValue),
          usefulLifeMonths: input.usefulLifeMonths,
          assetAccountId: input.assetAccountId,
          accumAccountId: input.accumAccountId,
          expenseAccountId: input.expenseAccountId,
          sourceDocumentId: input.sourceDocumentId || null,
          note: input.note?.trim() || null,
        },
        select: { id: true, code: true },
      });

      // ผูกกลับบรรทัดเอกสารต้นทาง (assetId) เพื่อ audit trail
      if (input.sourceDocumentId) {
        await tx.accountDocumentLine.updateMany({
          where: { documentId: input.sourceDocumentId, systemId: ctx.systemId, assetId: null },
          data: { assetId: asset.id },
        });
      }
      return asset;
    });
    return { ok: true, id: res.id, code: res.code };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "ขึ้นทะเบียนไม่สำเร็จ" };
  }
}

async function nextAssetCode(ctx: AssetCtx, db: Db): Promise<string> {
  const count = await db.accountFixedAsset.count({ where: { systemId: ctx.systemId } });
  return `FA-${String(count + 1).padStart(4, "0")}`;
}

// ─────────────────── ค่าเสื่อมรายเดือน (เส้นตรง) ───────────────────

/** จำนวนค่าเสื่อมของงวดถัดไปสำหรับสินทรัพย์ 1 ตัว (0 = ไม่ต้องคิด/ครบแล้ว)
 *  amount = round((cost − salvage)/usefulLifeMonths) · เดือนสุดท้ายเก็บเศษให้ net book = salvage */
export function nextDepreciationAmount(a: {
  cost: number;
  salvageValue: number;
  usefulLifeMonths: number;
  monthsDepreciated: number;
  accumDepreciation: number;
}): number {
  const depreciableBase = a.cost - a.salvageValue;
  const remaining = depreciableBase - a.accumDepreciation;
  if (remaining <= 0 || a.monthsDepreciated >= a.usefulLifeMonths) return 0;
  const monthly = Math.round(depreciableBase / a.usefulLifeMonths);
  const isLast = a.monthsDepreciated + 1 >= a.usefulLifeMonths;
  const amount = isLast ? remaining : Math.min(monthly, remaining);
  return amount > 0 ? amount : 0;
}

export type DepreciationRunResult = {
  periodKey: string;
  posted: { assetId: string; code: string; amount: number; entryId: string }[];
  skipped: { assetId: string; code: string; reason: string }[];
  fullyDepreciated: string[]; // asset codes ที่ครบอายุในรอบนี้
};

/** รันค่าเสื่อมของงวดหนึ่ง (เรียกจาก cron สิ้นเดือน หรือกดปุ่มเอง)
 *  - ต่อสินทรัพย์ ACTIVE ที่เริ่มคิดค่าเสื่อมแล้ว + ยังไม่มีแถวงวดนี้
 *  - $transaction: สร้าง AccountDepreciation (idempotent unique assetId+periodKey) → gl.postDepreciation → เก็บ entryId
 *  - ครบอายุ/net book ถึง salvage → status FULLY_DEPRECIATED */
export async function runDepreciation(
  ctx: AssetCtx,
  periodKey: string = currentPeriodKey(),
): Promise<DepreciationRunResult> {
  const out: DepreciationRunResult = { periodKey, posted: [], skipped: [], fullyDepreciated: [] };
  const date = periodEndDate(periodKey);

  const assets = await prisma.accountFixedAsset.findMany({
    where: { systemId: ctx.systemId, status: "ACTIVE" },
    orderBy: { code: "asc" },
  });

  for (const a of assets) {
    // เริ่มคิดค่าเสื่อมเมื่อถึงงวด startDepDate
    if (!periodStarted(a.startDepDate, periodKey)) {
      out.skipped.push({ assetId: a.id, code: a.code, reason: "ยังไม่ถึงงวดเริ่มคิดค่าเสื่อม" });
      continue;
    }

    try {
      const r = await prisma.$transaction(async (tx) => {
        // idempotent: มีแถวงวดนี้แล้ว → ข้าม
        const existing = await tx.accountDepreciation.findUnique({
          where: { assetId_periodKey: { assetId: a.id, periodKey } },
          select: { id: true },
        });
        if (existing) return { status: "dup" as const };

        // นับงวดที่คิดไปแล้ว + สะสม ณ ปัจจุบัน (ใน tx)
        const agg = await tx.accountDepreciation.aggregate({
          where: { assetId: a.id },
          _sum: { amount: true },
          _count: { _all: true },
        });
        const monthsDepreciated = agg._count._all;
        const accumDepreciation = agg._sum.amount ?? 0;
        const amount = nextDepreciationAmount({
          cost: a.cost,
          salvageValue: a.salvageValue,
          usefulLifeMonths: a.usefulLifeMonths,
          monthsDepreciated,
          accumDepreciation,
        });
        if (amount <= 0) {
          // ไม่มีค่าเสื่อมเหลือ → mark FULLY_DEPRECIATED
          await tx.accountFixedAsset.update({
            where: { id: a.id },
            data: { status: "FULLY_DEPRECIATED" },
          });
          return { status: "full" as const };
        }

        // 1) สร้างแถวค่าเสื่อม (idempotent ต่อ assetId+periodKey)
        const dep = await tx.accountDepreciation.create({
          data: {
            tenantId: ctx.tenantId,
            systemId: ctx.systemId,
            assetId: a.id,
            periodKey,
            amount,
          },
          select: { id: true },
        });

        // 2) โพสต์ journal Dr 6800 / Cr 16x9 (double-entry ยืนยันฝั่ง gl)
        const { entryId } = await postDepreciation(
          ctx,
          {
            assetId: a.id,
            periodKey,
            amount,
            expenseAccountId: a.expenseAccountId,
            accumAccountId: a.accumAccountId,
          },
          tx,
        );

        // 3) เก็บ entryId กลับแถวค่าเสื่อม
        await tx.accountDepreciation.update({ where: { id: dep.id }, data: { entryId } });

        // 4) ครบอายุ → FULLY_DEPRECIATED
        const nowMonths = monthsDepreciated + 1;
        const nowAccum = accumDepreciation + amount;
        const fully = nowMonths >= a.usefulLifeMonths || a.cost - nowAccum <= a.salvageValue;
        if (fully) {
          await tx.accountFixedAsset.update({
            where: { id: a.id },
            data: { status: "FULLY_DEPRECIATED" },
          });
        }
        return { status: "posted" as const, amount, entryId, fully };
      });

      if (r.status === "dup") {
        out.skipped.push({ assetId: a.id, code: a.code, reason: "คิดค่าเสื่อมงวดนี้แล้ว" });
      } else if (r.status === "full") {
        out.skipped.push({ assetId: a.id, code: a.code, reason: "ค่าเสื่อมครบแล้ว" });
        out.fullyDepreciated.push(a.code);
      } else {
        out.posted.push({ assetId: a.id, code: a.code, amount: r.amount, entryId: r.entryId });
        if (r.fully) out.fullyDepreciated.push(a.code);
      }
    } catch (e) {
      out.skipped.push({
        assetId: a.id,
        code: a.code,
        reason: e instanceof Error ? e.message : "โพสต์ค่าเสื่อมไม่สำเร็จ",
      });
    }
  }
  return out;
}

// ─────────────────── ขาย / ตัดจำหน่าย ───────────────────

export type DisposeInput = {
  assetId: string;
  mode: "SELL" | "WRITE_OFF";
  date: Date;
  proceeds?: number; // สตางค์ (SELL: เงินที่ได้รับ; WRITE_OFF = 0)
  financeAccountId?: string | null; // บัญชีเงินที่รับเงินขาย (SELL)
  note?: string | null;
};

export type DisposeResult =
  | { ok: true; entryId: string; gainLoss: number }
  | { ok: false; reason: string };

/** ขาย/ตัดจำหน่ายสินทรัพย์ → JV มือ (gl.postManualJV)
 *  Dr เงิน(ขาย) · Dr 16x9 ค่าเสื่อมสะสม · Cr 16xx สินทรัพย์(ต้นทุน) · กำไร/ขาดทุน 4900
 *  gainLoss = proceeds − netBookValue (>0 กำไร Cr 4900 · <0 ขาดทุน Dr 4900) */
export async function disposeAsset(ctx: AssetCtx, input: DisposeInput): Promise<DisposeResult> {
  const asset = await prisma.accountFixedAsset.findFirst({
    where: { id: input.assetId, systemId: ctx.systemId },
  });
  if (!asset) return { ok: false, reason: "ไม่พบสินทรัพย์" };
  if (asset.status === "DISPOSED" || asset.status === "WRITTEN_OFF")
    return { ok: false, reason: "สินทรัพย์นี้จำหน่าย/ตัดบัญชีไปแล้ว" };
  if (isNaN(input.date.getTime())) return { ok: false, reason: "วันที่ไม่ถูกต้อง" };

  const proceeds = input.mode === "SELL" ? Math.round(input.proceeds ?? 0) : 0;
  if (input.mode === "SELL" && proceeds < 0) return { ok: false, reason: "จำนวนเงินขายต้องไม่ติดลบ" };
  if (input.mode === "SELL" && proceeds > 0 && !input.financeAccountId)
    return { ok: false, reason: "กรุณาเลือกบัญชีเงินที่รับเงินขาย" };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const agg = await tx.accountDepreciation.aggregate({
        where: { assetId: asset.id },
        _sum: { amount: true },
      });
      const accum = agg._sum.amount ?? 0;
      const netBook = asset.cost - accum;
      const gainLoss = proceeds - netBook; // >0 กำไร · <0 ขาดทุน

      // บัญชีเงินรับ (SELL) → ledger ของ finance account หรือ fallback CASH/BANK
      let cashLedgerId: string | null = null;
      if (proceeds > 0) {
        if (input.financeAccountId) {
          const fa = await tx.accountFinance.findFirst({
            where: { id: input.financeAccountId, systemId: ctx.systemId },
            select: { ledgerAccountId: true, type: true },
          });
          cashLedgerId =
            fa?.ledgerAccountId ??
            (await resolveMapping(ctx, fa?.type === "CASH" ? "CASH" : "BANK", undefined, tx));
        } else {
          cashLedgerId = await resolveMapping(ctx, "CASH", undefined, tx);
        }
      }

      const gainLedgerId = await resolveMapping(ctx, "ASSET_DISPOSAL_GAIN", undefined, tx);

      const lines: { accountId: string; debit: number; credit: number; note?: string }[] = [];
      // Dr เงินที่ได้รับ
      if (proceeds > 0 && cashLedgerId) lines.push({ accountId: cashLedgerId, debit: proceeds, credit: 0, note: "เงินรับจากการขายสินทรัพย์" });
      // Dr ค่าเสื่อมสะสม (ล้างออก)
      if (accum > 0) lines.push({ accountId: asset.accumAccountId, debit: accum, credit: 0, note: "ล้างค่าเสื่อมสะสม" });
      // Cr สินทรัพย์ (ต้นทุน)
      lines.push({ accountId: asset.assetAccountId, debit: 0, credit: asset.cost, note: "ตัดต้นทุนสินทรัพย์" });
      // กำไร/ขาดทุนจากการจำหน่าย (4900)
      if (gainLoss > 0) lines.push({ accountId: gainLedgerId, debit: 0, credit: gainLoss, note: "กำไรจากการจำหน่ายสินทรัพย์" });
      else if (gainLoss < 0) lines.push({ accountId: gainLedgerId, debit: -gainLoss, credit: 0, note: "ขาดทุนจากการจำหน่ายสินทรัพย์" });

      const memo =
        (input.mode === "SELL" ? "ขายสินทรัพย์ " : "ตัดจำหน่ายสินทรัพย์ ") +
        `${asset.code} ${asset.name}`;
      const { entryId } = await postManualJV(ctx, { date: input.date, memo, lines }, tx);

      await tx.accountFixedAsset.update({
        where: { id: asset.id },
        data: {
          status: input.mode === "SELL" ? "DISPOSED" : "WRITTEN_OFF",
          disposedAt: input.date,
          disposalAmount: proceeds,
          note: input.note?.trim() ? input.note.trim() : asset.note,
        },
      });

      return { entryId, gainLoss };
    });
    return { ok: true, entryId: result.entryId, gainLoss: result.gainLoss };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "จำหน่ายสินทรัพย์ไม่สำเร็จ" };
  }
}
