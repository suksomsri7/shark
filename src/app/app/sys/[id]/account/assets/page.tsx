import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  listAssets,
  listAssetAccounts,
  listAccumAccounts,
  listExpenseAccounts,
  listFinanceAccounts,
  listAssetSourceDocs,
  currentPeriodKey,
  nextDepreciationAmount,
  type AssetRow,
} from "@/lib/modules/account/asset";
import { registerAssetAction, runDepreciationAction, disposeAssetAction } from "./actions";
import { SubmitButton } from "@/components/ui/SubmitButton";

const inputCls = "rounded-lg border px-2 py-1.5 text-sm";
const baht = (satang: number) =>
  (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ใช้งาน",
  FULLY_DEPRECIATED: "ค่าเสื่อมครบ",
  DISPOSED: "จำหน่ายแล้ว",
  WRITTEN_OFF: "ตัดบัญชี",
};
const STATUS_CLS: Record<string, string> = {
  ACTIVE: "text-[color:var(--color-ink,green)]",
  FULLY_DEPRECIATED: "text-[color:var(--color-muted)]",
  DISPOSED: "text-[color:var(--color-muted)]",
  WRITTEN_OFF: "text-[color:var(--color-danger)]",
};

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium" }).format(d);
}
function isoDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
}

export default async function AssetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { err, ok } = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id);
  const ctx = { tenantId, systemId };

  const [assets, assetAccts, accumAccts, expenseAccts, financeAccts, sourceDocs] = await Promise.all([
    listAssets(ctx),
    listAssetAccounts(ctx),
    listAccumAccounts(ctx),
    listExpenseAccounts(ctx),
    listFinanceAccounts(ctx),
    listAssetSourceDocs(ctx),
  ]);

  const base = `/app/sys/${id}/account`;
  const period = currentPeriodKey();
  const today = isoDate(new Date());

  const activeCount = assets.filter((a) => a.status === "ACTIVE").length;
  const totalCost = assets.reduce((s, a) => s + (a.status === "DISPOSED" || a.status === "WRITTEN_OFF" ? 0 : a.cost), 0);
  const totalNBV = assets.reduce((s, a) => s + (a.status === "DISPOSED" || a.status === "WRITTEN_OFF" ? 0 : a.netBookValue), 0);

  // ค่าเสื่อมที่คาดว่าจะคิดในงวดปัจจุบัน (preview)
  const dueThisPeriod = assets.filter(
    (a) => a.status === "ACTIVE" && isoDate(a.startDepDate).slice(0, 7) <= period,
  );
  const previewTotal = dueThisPeriod.reduce(
    (s, a) =>
      s +
      nextDepreciationAmount({
        cost: a.cost,
        salvageValue: a.salvageValue,
        usefulLifeMonths: a.usefulLifeMonths,
        monthsDepreciated: a.monthsDepreciated,
        accumDepreciation: a.accumDepreciation,
      }),
    0,
  );

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <Link href={base} className="text-sm text-[color:var(--color-muted)]">← ระบบบัญชี</Link>
        <h1 className="mt-1 text-2xl font-semibold">ทะเบียนสินทรัพย์ &amp; ค่าเสื่อมราคา</h1>
      </div>

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
      {ok && <p className="text-sm text-[color:var(--color-ink,green)]">{ok}</p>}

      {/* สรุป */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="สินทรัพย์ใช้งาน" value={String(activeCount)} />
        <Stat label="ต้นทุนรวม" value={`${baht(totalCost)} ฿`} />
        <Stat label="มูลค่าสุทธิ (NBV)" value={`${baht(totalNBV)} ฿`} />
        <Stat label={`ค่าเสื่อมงวด ${period}`} value={`${baht(previewTotal)} ฿`} />
      </div>

      {/* รันค่าเสื่อมงวด */}
      <form action={runDepreciationAction} className="card flex flex-wrap items-end gap-3">
        <input type="hidden" name="systemId" value={systemId} />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-[color:var(--color-muted)]">งวดที่คิดค่าเสื่อม (YYYY-MM)</label>
          <input name="periodKey" defaultValue={period} placeholder={period} className={inputCls} />
        </div>
        <SubmitButton>คิดค่าเสื่อมงวดนี้</SubmitButton>
        <p className="w-full text-xs text-[color:var(--color-muted)]">
          รันซ้ำได้ (idempotent ต่อสินทรัพย์+งวด) · เดือนสุดท้ายเก็บเศษให้มูลค่าสุทธิ = มูลค่าซาก · โพสต์ Dr ค่าเสื่อม (6800) / Cr ค่าเสื่อมสะสม (16x9) — เหมาะทำ cron สิ้นเดือน
        </p>
      </form>

      {/* ทะเบียน */}
      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">ทะเบียนสินทรัพย์ ({assets.length})</h2>
        {assets.length === 0 ? (
          <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีสินทรัพย์ในทะเบียน</p>
        ) : (
          assets.map((a) => (
            <AssetCard key={a.id} a={a} systemId={systemId} financeAccts={financeAccts} today={today} />
          ))
        )}
      </div>

      {/* ขึ้นทะเบียนสินทรัพย์ */}
      <form action={registerAssetAction} className="card grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input type="hidden" name="systemId" value={systemId} />
        <h2 className="text-sm font-medium sm:col-span-2">ขึ้นทะเบียนสินทรัพย์ใหม่</h2>

        {sourceDocs.length > 0 && (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-[color:var(--color-muted)]">จากเอกสารซื้อสินทรัพย์ (ไม่บังคับ)</span>
            <select name="sourceDocumentId" defaultValue="" className={inputCls}>
              <option value="">— คีย์ยกมา (ไม่อ้างเอกสาร) —</option>
              {sourceDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.docNo ?? "(ร่าง)"} · {fmtDate(d.issueDate)} · {baht(d.base)} ฿{d.contactName ? ` · ${d.contactName}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        <input name="name" required placeholder="ชื่อสินทรัพย์" className={`${inputCls} sm:col-span-2`} />
        <input name="category" placeholder="หมวด (เช่น อุปกรณ์สำนักงาน)" className={inputCls} />
        <input name="cost" type="number" step="0.01" min="0.01" required placeholder="ต้นทุน (บาท)" className={inputCls} />
        <input name="salvageValue" type="number" step="0.01" min="1" defaultValue="1" required placeholder="มูลค่าซาก (บาท ≥ 1)" className={inputCls} />
        <input name="usefulLifeMonths" type="number" min="1" required placeholder="อายุการใช้งาน (เดือน)" className={inputCls} />

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">วันที่ได้มา</span>
          <input name="acquiredDate" type="date" defaultValue={today} required className={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">วันเริ่มคิดค่าเสื่อม</span>
          <input name="startDepDate" type="date" defaultValue={today} required className={inputCls} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">บัญชีสินทรัพย์ (16xx)</span>
          <select name="assetAccountId" required defaultValue="" className={inputCls}>
            <option value="" disabled>เลือกบัญชี</option>
            {assetAccts.map((l) => (
              <option key={l.id} value={l.id}>{l.code} · {l.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-[color:var(--color-muted)]">ค่าเสื่อมสะสม (16x9)</span>
          <select name="accumAccountId" required defaultValue="" className={inputCls}>
            <option value="" disabled>เลือกบัญชี</option>
            {accumAccts.map((l) => (
              <option key={l.id} value={l.id}>{l.code} · {l.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs text-[color:var(--color-muted)]">บัญชีค่าใช้จ่ายค่าเสื่อม (6800)</span>
          <select name="expenseAccountId" required defaultValue="" className={inputCls}>
            <option value="" disabled>เลือกบัญชี</option>
            {expenseAccts.map((l) => (
              <option key={l.id} value={l.id}>{l.code} · {l.name}</option>
            ))}
          </select>
        </label>

        <input name="note" placeholder="หมายเหตุ (ไม่บังคับ)" className={`${inputCls} sm:col-span-2`} />
        <SubmitButton className="sm:col-span-2 sm:justify-self-start">+ ขึ้นทะเบียน</SubmitButton>
      </form>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-xs text-[color:var(--color-muted)]">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function AssetCard({
  a,
  systemId,
  financeAccts,
  today,
}: {
  a: AssetRow;
  systemId: string;
  financeAccts: { id: string; name: string }[];
  today: string;
}) {
  const canDispose = a.status === "ACTIVE" || a.status === "FULLY_DEPRECIATED";
  return (
    <div className="rounded-lg border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">
            {a.code} · {a.name}
            {a.category && <span className="text-xs text-[color:var(--color-muted)]"> · {a.category}</span>}
          </div>
          <div className="text-xs text-[color:var(--color-muted)]">
            ได้มา {fmtDate(a.acquiredDate)} · เริ่มคิดค่าเสื่อม {fmtDate(a.startDepDate)} · อายุ {a.usefulLifeMonths} เดือน (คิดแล้ว {a.monthsDepreciated})
          </div>
        </div>
        <div className={`text-xs font-medium ${STATUS_CLS[a.status] ?? ""}`}>{STATUS_LABEL[a.status] ?? a.status}</div>
      </div>

      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
        <span>ต้นทุน <b>{baht(a.cost)}</b></span>
        <span>ซาก <b>{baht(a.salvageValue)}</b></span>
        <span>ค่าเสื่อมสะสม <b>{baht(a.accumDepreciation)}</b></span>
        <span>มูลค่าสุทธิ <b>{baht(a.netBookValue)}</b></span>
      </div>

      {a.status === "DISPOSED" || a.status === "WRITTEN_OFF" ? (
        a.disposedAt && (
          <div className="mt-1 text-xs text-[color:var(--color-muted)]">
            {a.status === "DISPOSED" ? "จำหน่าย" : "ตัดบัญชี"} {fmtDate(a.disposedAt)}
            {a.disposalAmount != null && a.disposalAmount > 0 && ` · ได้รับ ${baht(a.disposalAmount)} ฿`}
          </div>
        )
      ) : (
        canDispose && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-[color:var(--color-ink,#0a58ca)] underline">ขาย / ตัดจำหน่าย</summary>
            <form action={disposeAssetAction} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="assetId" value={a.id} />
              <select name="mode" defaultValue="SELL" className={inputCls}>
                <option value="SELL">ขาย (มีเงินรับ)</option>
                <option value="WRITE_OFF">ตัดจำหน่าย (ไม่มีเงินรับ)</option>
              </select>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-[color:var(--color-muted)]">วันที่</span>
                <input name="date" type="date" defaultValue={today} required className={inputCls} />
              </label>
              <input name="proceeds" type="number" step="0.01" min="0" placeholder="เงินที่ได้รับ (บาท) — สำหรับการขาย" className={inputCls} />
              <select name="financeAccountId" defaultValue="" className={inputCls}>
                <option value="">บัญชีเงินรับ (สำหรับการขาย)</option>
                {financeAccts.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
              <input name="note" placeholder="หมายเหตุ" className={`${inputCls} sm:col-span-2`} />
              <SubmitButton variant="ghost" className="sm:col-span-2 sm:justify-self-start">ยืนยันจำหน่าย</SubmitButton>
            </form>
          </details>
        )
      )}
    </div>
  );
}
