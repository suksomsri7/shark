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
import { formatBaht } from "@/lib/ui/money";
import PageHeader from "@/components/ui/PageHeader";
import Section from "@/components/ui/Section";
import FormField from "@/components/ui/FormField";
import EmptyState from "@/components/ui/EmptyState";
import MoneyText from "@/components/ui/MoneyText";
import StatusChip from "@/components/ui/StatusChip";
import { SubmitButton } from "@/components/ui/SubmitButton";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "ใช้งาน",
  FULLY_DEPRECIATED: "ค่าเสื่อมครบ",
  DISPOSED: "จำหน่ายแล้ว",
  WRITTEN_OFF: "ตัดบัญชี",
};
const assetTone = (v: string): "muted" | "strong" | "danger" =>
  v === "ACTIVE" ? "strong" : v === "WRITTEN_OFF" ? "danger" : "muted";

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
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader title="ทะเบียนสินทรัพย์ & ค่าเสื่อมราคา" back={{ href: base, label: "ระบบบัญชี" }} />

      {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
      {ok && <p className="text-sm font-medium text-[color:var(--color-ink)]">{ok}</p>}

      {/* สรุป */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="สินทรัพย์ใช้งาน" value={activeCount} />
        <Stat label="ต้นทุนรวม" value={<MoneyText satang={totalCost} decimals />} />
        <Stat label="มูลค่าสุทธิ (NBV)" value={<MoneyText satang={totalNBV} decimals />} />
        <Stat label={`ค่าเสื่อมงวด ${period}`} value={<MoneyText satang={previewTotal} decimals />} />
      </div>

      {/* รันค่าเสื่อมงวด */}
      <Section title="คิดค่าเสื่อมราคา" card>
        <form action={runDepreciationAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="systemId" value={systemId} />
          <FormField label="งวดที่คิดค่าเสื่อม (ปี-เดือน)">
            <input name="periodKey" defaultValue={period} placeholder={period} className="input" />
          </FormField>
          <SubmitButton>คิดค่าเสื่อมงวดนี้</SubmitButton>
          <p className="w-full text-xs text-[color:var(--color-muted)]">
            รันซ้ำได้โดยไม่คิดซ้ำต่อสินทรัพย์ในงวดเดียวกัน · เดือนสุดท้ายปรับเศษให้มูลค่าสุทธิเท่ากับมูลค่าซากพอดี · ระบบบันทึกบัญชีค่าเสื่อมให้อัตโนมัติ เหมาะตั้งทำทุกสิ้นเดือน
          </p>
        </form>
      </Section>

      {/* ทะเบียน */}
      <Section title={`ทะเบียนสินทรัพย์ (${assets.length})`}>
        {assets.length === 0 ? (
          <EmptyState text="ยังไม่มีสินทรัพย์ในทะเบียน — ขึ้นทะเบียนสินทรัพย์ใหม่ด้านล่างเพื่อเริ่ม" />
        ) : (
          <div className="flex flex-col gap-2">
            {assets.map((a) => (
              <AssetCard key={a.id} a={a} systemId={systemId} financeAccts={financeAccts} today={today} />
            ))}
          </div>
        )}
      </Section>

      {/* ขึ้นทะเบียนสินทรัพย์ */}
      <Section title="ขึ้นทะเบียนสินทรัพย์ใหม่" card>
        <form action={registerAssetAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input type="hidden" name="systemId" value={systemId} />

          {sourceDocs.length > 0 && (
            <div className="sm:col-span-2">
              <FormField label="จากเอกสารซื้อสินทรัพย์ (ไม่บังคับ)">
                <select name="sourceDocumentId" defaultValue="" className="input">
                  <option value="">— คีย์ยกมา (ไม่อ้างเอกสาร) —</option>
                  {sourceDocs.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.docNo ?? "(ร่าง)"} · {fmtDate(d.issueDate)} · {formatBaht(d.base, { decimals: true })}
                      {d.contactName ? ` · ${d.contactName}` : ""}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          )}

          <div className="sm:col-span-2">
            <FormField label="ชื่อสินทรัพย์" required>
              <input name="name" required className="input" />
            </FormField>
          </div>
          <FormField label="หมวด" hint="เช่น อุปกรณ์สำนักงาน">
            <input name="category" className="input" />
          </FormField>
          <FormField label="ต้นทุน (บาท)" required>
            <input name="cost" type="number" step="0.01" min="0.01" required className="input" />
          </FormField>
          <FormField label="มูลค่าซาก (บาท ≥ 1)" required>
            <input name="salvageValue" type="number" step="0.01" min="1" defaultValue="1" required className="input" />
          </FormField>
          <FormField label="อายุการใช้งาน (เดือน)" required>
            <input name="usefulLifeMonths" type="number" min="1" required className="input" />
          </FormField>

          <FormField label="วันที่ได้มา" required>
            <input name="acquiredDate" type="date" defaultValue={today} required className="input" />
          </FormField>
          <FormField label="วันเริ่มคิดค่าเสื่อม" required>
            <input name="startDepDate" type="date" defaultValue={today} required className="input" />
          </FormField>

          <FormField label="บัญชีสินทรัพย์ (16xx)" required>
            <select name="assetAccountId" required defaultValue="" className="input">
              <option value="" disabled>เลือกบัญชี</option>
              {assetAccts.map((l) => (
                <option key={l.id} value={l.id}>{l.code} · {l.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="ค่าเสื่อมสะสม (16x9)" required>
            <select name="accumAccountId" required defaultValue="" className="input">
              <option value="" disabled>เลือกบัญชี</option>
              {accumAccts.map((l) => (
                <option key={l.id} value={l.id}>{l.code} · {l.name}</option>
              ))}
            </select>
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="บัญชีค่าใช้จ่ายค่าเสื่อม (6800)" required>
              <select name="expenseAccountId" required defaultValue="" className="input">
                <option value="" disabled>เลือกบัญชี</option>
                {expenseAccts.map((l) => (
                  <option key={l.id} value={l.id}>{l.code} · {l.name}</option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="sm:col-span-2">
            <FormField label="หมายเหตุ (ไม่บังคับ)">
              <input name="note" className="input" />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton className="sm:justify-self-start">+ ขึ้นทะเบียน</SubmitButton>
          </div>
        </form>
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
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
        <StatusChip value={a.status} map={STATUS_LABEL} toneOf={assetTone} />
      </div>

      <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
        <span>ต้นทุน <b><MoneyText satang={a.cost} decimals /></b></span>
        <span>ซาก <b><MoneyText satang={a.salvageValue} decimals /></b></span>
        <span>ค่าเสื่อมสะสม <b><MoneyText satang={a.accumDepreciation} decimals /></b></span>
        <span>มูลค่าสุทธิ <b><MoneyText satang={a.netBookValue} decimals /></b></span>
      </div>

      {a.status === "DISPOSED" || a.status === "WRITTEN_OFF" ? (
        a.disposedAt && (
          <div className="mt-1 text-xs text-[color:var(--color-muted)]">
            {a.status === "DISPOSED" ? "จำหน่าย" : "ตัดบัญชี"} {fmtDate(a.disposedAt)}
            {a.disposalAmount != null && a.disposalAmount > 0 && (
              <>
                {" · ได้รับ "}
                <MoneyText satang={a.disposalAmount} decimals />
              </>
            )}
          </div>
        )
      ) : (
        canDispose && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-[color:var(--color-ink)] underline">ขาย / ตัดจำหน่าย</summary>
            <form action={disposeAssetAction} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="assetId" value={a.id} />
              <FormField label="วิธีจำหน่าย">
                <select name="mode" defaultValue="SELL" className="input">
                  <option value="SELL">ขาย (มีเงินรับ)</option>
                  <option value="WRITE_OFF">ตัดจำหน่าย (ไม่มีเงินรับ)</option>
                </select>
              </FormField>
              <FormField label="วันที่" required>
                <input name="date" type="date" defaultValue={today} required className="input" />
              </FormField>
              <FormField label="เงินที่ได้รับ (บาท)" hint="สำหรับการขาย">
                <input name="proceeds" type="number" step="0.01" min="0" className="input" />
              </FormField>
              <FormField label="บัญชีเงินรับ" hint="สำหรับการขาย">
                <select name="financeAccountId" defaultValue="" className="input">
                  <option value="">ไม่ระบุ</option>
                  {financeAccts.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="หมายเหตุ">
                  <input name="note" className="input" />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <SubmitButton variant="ghost" className="sm:justify-self-start">ยืนยันจำหน่าย</SubmitButton>
              </div>
            </form>
          </details>
        )
      )}
    </div>
  );
}
