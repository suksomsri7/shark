import Link from "next/link";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import {
  listAssets,
  listAssetAccounts,
  listAccumAccounts,
  listExpenseAccounts,
  listAssetSourceDocs,
  currentPeriodKey,
} from "@/lib/modules/account/asset";
import { previewDepreciation, ASSET_STATUS_LABEL } from "@/lib/modules/account/asset-v2";
import { registerAssetAction, runDepreciationAction } from "./actions";
import { formatBaht } from "@/lib/ui/money";
import { formatDateTh } from "@/lib/ui/date";
import FormField from "@/components/ui/FormField";
import EmptyState from "@/components/ui/EmptyState";
import MoneyText from "@/components/ui/MoneyText";
import StatusChip from "@/components/ui/StatusChip";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { AccountIcon } from "@/components/account-v2/AccountIcon";
import { RowActions } from "@/components/account-v2/RowActions";
import { DateInput } from "@/components/account-v2/DateInput";

// ทะเบียนสินทรัพย์ V2 — DESIGN-SPEC-V2 §11.5
// ตารางตามสเปค: รหัส · ชื่อ · หมวด · วันที่ได้มา · ต้นทุน · ค่าเสื่อมสะสม · มูลค่าสุทธิ · สถานะ · ทำรายการ ▾
// ปุ่ม "คิดค่าเสื่อมงวดนี้" เปิด **พรีวิว** ก่อนเสมอ (?dep=1) — ไม่ลงบัญชีทันทีจากการกดปุ่มเดียว

const assetTone = (v: string): "muted" | "strong" | "danger" =>
  v === "ACTIVE" ? "strong" : v === "WRITTEN_OFF" ? "danger" : "muted";

function isoDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
}

export default async function AssetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string; ok?: string; dep?: string; period?: string; add?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadAccountSystem(id, { can: "account.asset.manage" });
  const ctx = { tenantId, systemId };
  const base = `/app/sys/${id}/account`;
  const path = `${base}/assets`;

  const period = sp.period && /^\d{4}-\d{2}$/.test(sp.period) ? sp.period : currentPeriodKey();
  const showPreview = sp.dep === "1";

  const [assets, assetAccts, accumAccts, expenseAccts, sourceDocs, preview] = await Promise.all([
    listAssets(ctx),
    listAssetAccounts(ctx),
    listAccumAccounts(ctx),
    listExpenseAccounts(ctx),
    listAssetSourceDocs(ctx),
    previewDepreciation(ctx, period),
  ]);

  const today = isoDate(new Date());
  const live = assets.filter((a) => a.status !== "DISPOSED" && a.status !== "WRITTEN_OFF");
  const totalCost = live.reduce((s, a) => s + a.cost, 0);
  const totalAccum = live.reduce((s, a) => s + a.accumDepreciation, 0);
  const totalNBV = live.reduce((s, a) => s + a.netBookValue, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            ทะเบียนสินทรัพย์{" "}
            <span className="text-base font-normal text-[color:var(--color-muted)]" data-testid="asset-count">
              {assets.length} รายการ
            </span>
          </h1>
          <p className="text-sm text-[color:var(--color-muted)]">
            ค่าเสื่อมคิดแบบเส้นตรงรายเดือน · ระบบลงบัญชีให้อัตโนมัติ (Dr ค่าเสื่อม · Cr ค่าเสื่อมสะสม)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`${path}?add=1`} className="btn btn-ghost text-sm" data-testid="asset-add">
            <AccountIcon name="plus" className="h-4 w-4" /> ขึ้นทะเบียนสินทรัพย์
          </Link>
          <Link href={`${path}?dep=1&period=${period}`} className="btn btn-primary text-sm" data-testid="asset-dep-btn">
            <AccountIcon name="calendar" className="h-4 w-4" /> คิดค่าเสื่อมงวดนี้
          </Link>
        </div>
      </div>

      {sp.err && <p className="text-sm text-[color:var(--color-danger)]">{sp.err}</p>}
      {sp.ok && (
        <p className="text-sm font-medium" data-testid="asset-ok">
          {sp.ok}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="สินทรัพย์ใช้งาน" value={live.length} testId="asset-stat-active" />
        <Stat label="ต้นทุนรวม" value={<MoneyText satang={totalCost} decimals />} />
        <Stat label="ค่าเสื่อมสะสม" value={<MoneyText satang={totalAccum} decimals />} />
        <Stat label="มูลค่าสุทธิ (NBV)" value={<MoneyText satang={totalNBV} decimals />} testId="asset-stat-nbv" />
      </div>

      {/* ───── พรีวิวก่อนคิดค่าเสื่อม (§11.5 "preview ก่อน") ───── */}
      {showPreview && (
        <section className="rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }} data-testid="dep-preview">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">คิดค่าเสื่อมงวด {period} — ตรวจก่อนลงบัญชี</h2>
            <Link href={path} className="text-sm text-[color:var(--color-muted)] hover:underline">
              ปิด
            </Link>
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                <th className="py-2 pr-2 font-medium">รหัส</th>
                <th className="py-2 pr-2 font-medium">ชื่อ</th>
                <th className="py-2 pr-2 text-right font-medium">ค่าเสื่อมงวดนี้</th>
                <th className="py-2 font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((r) => (
                <tr key={r.assetId} className="border-b last:border-0" style={{ borderColor: "var(--color-line)" }}>
                  <td className="py-1.5 pr-2 font-mono text-xs">{r.code}</td>
                  <td className="py-1.5 pr-2">{r.name}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums" data-testid={`dep-preview-${r.code}`}>
                    {r.amount > 0 ? <MoneyText satang={r.amount} decimals /> : "—"}
                  </td>
                  <td className="py-1.5 text-xs text-[color:var(--color-muted)]">{r.skipReason ?? "พร้อมลงบัญชี"}</td>
                </tr>
              ))}
              {preview.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[color:var(--color-muted)]">
                    ไม่มีสินทรัพย์ที่ใช้งานอยู่
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold" style={{ borderColor: "var(--color-line)" }}>
                <td className="py-2" colSpan={2}>
                  รวม {preview.postableCount} รายการที่จะลงบัญชี
                </td>
                <td className="py-2 text-right tabular-nums" data-testid="dep-preview-total">
                  <MoneyText satang={preview.totalAmount} decimals />
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
          <form action={runDepreciationAction} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="periodKey" value={period} />
            <SubmitButton>ยืนยันลงบัญชีค่าเสื่อมงวด {period}</SubmitButton>
            <span className="text-xs text-[color:var(--color-muted)]">
              กดซ้ำได้ไม่คิดเบิ้ล (ระบบล็อกไว้ 1 งวด/สินทรัพย์)
              {preview.alreadyPostedCount > 0 && ` · งวดนี้ลงไปแล้ว ${preview.alreadyPostedCount} รายการ`}
            </span>
          </form>
        </section>
      )}

      {/* ───── ทะเบียน ───── */}
      {assets.length === 0 ? (
        <EmptyState text="ยังไม่มีสินทรัพย์ในทะเบียน — กด “ขึ้นทะเบียนสินทรัพย์” เพื่อเริ่ม" />
      ) : (
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--color-line)" }} data-testid="asset-table">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-[color:var(--color-muted)]" style={{ borderColor: "var(--color-line)" }}>
                <th className="px-3 py-3 font-medium">รหัส</th>
                <th className="px-3 py-3 font-medium">ชื่อ</th>
                <th className="px-3 py-3 font-medium">หมวด</th>
                <th className="px-3 py-3 font-medium">วันที่ได้มา</th>
                <th className="px-3 py-3 text-right font-medium">ต้นทุน</th>
                <th className="px-3 py-3 text-right font-medium">ค่าเสื่อมสะสม</th>
                <th className="px-3 py-3 text-right font-medium">มูลค่าสุทธิ</th>
                <th className="px-3 py-3 font-medium">สถานะ</th>
                <th className="px-3 py-3 text-right font-medium">ทำรายการ</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-b last:border-0" style={{ borderColor: "var(--color-line)" }} data-testid={`asset-row-${a.code}`}>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs">
                    <Link href={`${path}/${a.id}`} className="text-[color:var(--color-accent)] hover:underline">
                      {a.code}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`${path}/${a.id}`} className="hover:underline">
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">{a.category ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">{formatDateTh(a.acquiredDate)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <MoneyText satang={a.cost} decimals />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" data-testid={`asset-accum-${a.code}`}>
                    <MoneyText satang={a.accumDepreciation} decimals />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums" data-testid={`asset-nbv-${a.code}`}>
                    <MoneyText satang={a.netBookValue} decimals />
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusChip value={a.status} map={ASSET_STATUS_LABEL} toneOf={assetTone} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <RowActions
                      testId={`asset-actions-${a.code}`}
                      items={[
                        { label: "ดูตารางค่าเสื่อม", href: `${path}/${a.id}`, icon: "list" },
                        {
                          label: "ขาย / ตัดจำหน่าย",
                          href: `${path}/${a.id}?dispose=1`,
                          icon: "out",
                          disabled: a.status === "DISPOSED" || a.status === "WRITTEN_OFF",
                          hint: "สินทรัพย์นี้จำหน่าย/ตัดบัญชีไปแล้ว",
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ───── ขึ้นทะเบียนสินทรัพย์ใหม่ (เปิดจากปุ่มหัวหน้า ?add=1) ───── */}
      {sp.add === "1" && (
        <section className="rounded-xl border p-4" style={{ borderColor: "var(--color-line)" }} data-testid="asset-register-form">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">ขึ้นทะเบียนสินทรัพย์ใหม่</h2>
            <Link href={path} className="text-sm text-[color:var(--color-muted)] hover:underline">
              ปิด
            </Link>
          </div>
          <form action={registerAssetAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input type="hidden" name="systemId" value={systemId} />
            {sourceDocs.length > 0 && (
              <div className="sm:col-span-2">
                <FormField label="จากเอกสารซื้อสินทรัพย์ (ไม่บังคับ)">
                  <select name="sourceDocumentId" defaultValue="" className="input">
                    <option value="">— คีย์ยกมา (ไม่อ้างเอกสาร) —</option>
                    {sourceDocs.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.docNo ?? "(ร่าง)"} · {formatDateTh(d.issueDate)} · {formatBaht(d.base, { decimals: true })}
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
              <DateInput name="acquiredDate" defaultValue={today} required testId="asset-acquired-date" />
            </FormField>
            <FormField label="วันเริ่มคิดค่าเสื่อม" required>
              <DateInput name="startDepDate" defaultValue={today} required testId="asset-startdep-date" />
            </FormField>
            <FormField label="บัญชีสินทรัพย์ (16xx)" required>
              <select name="assetAccountId" required defaultValue="" className="input">
                <option value="" disabled>
                  เลือกบัญชี
                </option>
                {assetAccts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} · {l.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="ค่าเสื่อมสะสม (16x9)" required>
              <select name="accumAccountId" required defaultValue="" className="input">
                <option value="" disabled>
                  เลือกบัญชี
                </option>
                {accumAccts.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} · {l.name}
                  </option>
                ))}
              </select>
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="บัญชีค่าใช้จ่ายค่าเสื่อม (6800)" required>
                <select name="expenseAccountId" required defaultValue="" className="input">
                  <option value="" disabled>
                    เลือกบัญชี
                  </option>
                  {expenseAccts.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} · {l.name}
                    </option>
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
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return (
    <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
      <div className="text-xs text-[color:var(--color-muted)]">{label}</div>
      <div className="text-lg font-semibold" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}
