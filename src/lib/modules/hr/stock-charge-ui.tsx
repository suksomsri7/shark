// HR H4.6 ▸ ส่วน "หักค่าของ / ค่าเสียหาย" บนหน้าเงินเดือน (server component — ไม่มี mockup: ตามฟอร์มรายการเพิ่ม/หักของหน้าเดียวกัน)
//   ฟอร์ม = ผู้ถือคีย์ hr.payadjust.request (พนักงาน = ชื่อเท่านั้น · สินค้า = ชื่อ + SKU ไม่มีต้นทุน) · รายการ = ผู้ดูเงินเดือนเท่านั้น
//   (ยอด · ต้นทุน · หนังสือยินยอม · ธงเพดานกฎหมาย = เตือนเท่านั้น) · ระบบไม่หักเอง ทุกแถวต้องผ่านการอนุมัติรายการเงินเดือนทีละแถว ·
//   ผลของ action = ?stock=<รหัส> → ข้อความจาก STOCK_MSG เท่านั้น · ปุ่มสูง ≥ 44 px · tokens ล้วน ◂
import { randomUUID } from "node:crypto";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { formatBaht } from "@/lib/ui/money";
import { thaiDateKey } from "@/lib/ui/date";
import { hrViewerOf } from "./privacy";
import { STOCK_MSG, canSeeStockCharges, canTakeStock, listStockCharges, myFiledStockCharges, stockAttention, stockFormOptions, stockPeriodCapFlags, type StockChargeItem } from "./stock-charge";
import { markStockRefundRepaidAction, requestStockChargeAction, withdrawStockChargeAction } from "./stock-charge-actions";

const muted = "text-[color:var(--color-muted)]";
const btn = "btn btn-primary min-h-[44px] text-sm";
const ghost = "btn btn-ghost min-h-[44px] text-sm";
const field = "flex flex-col gap-1 text-xs";
const WITHDRAWABLE = new Set(["PENDING", "APPROVED", "PAID", "CANCELLING"]);
const tone = (s: string) =>
  s === "REFUND_OWED" || s === "REJECTED" ? "text-[color:var(--color-danger)] border-[color:var(--color-danger)]" : s === "APPROVED" || s === "PAID" || s === "REPAID" ? "font-semibold border-[color:var(--color-ink)]" : `${muted} border-[color:var(--color-line)]`;

export async function StockChargeSection({ systemId, msg, q, inv }: { systemId: string; msg?: string; q?: string; inv?: string }) {
  const auth = await requireTenant();
  const viewer = hrViewerOf(auth);
  const ctx = { tenantId: auth.active.tenantId, systemId };
  const [opts, list, stuck] = await Promise.all([stockFormOptions(ctx, viewer, { q: q ?? "", inventorySystemId: inv ?? "" }), listStockCharges(ctx, viewer), stockAttention(ctx, viewer)]);
  if (!opts && !list) return null;
  const t = await getTranslations("hr.stock");
  const flags = list ? await stockPeriodCapFlags(ctx, viewer, list.items) : null;
  const note = msg && STOCK_MSG[msg] ? STOCK_MSG[msg] : null;
  const today = thaiDateKey(new Date());
  const take = canTakeStock(viewer);
  const payrollViewer = canSeeStockCharges(viewer);
  // ผู้ยื่นที่ไม่ใช่ผู้ดูเงินเดือน: เห็นเฉพาะคำขอที่ตัวเองยื่นซึ่งยังรออนุมัติ (ไม่มียอดเงิน) + ถอนได้
  const mine = !payrollViewer && opts ? await myFiledStockCharges(ctx, viewer) : null;

  return (
    <section id="hr-stock" data-testid="hr-stock" className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className={`text-xs ${muted}`}>{t("intro")}</p>
        <p className="rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs" role="note" data-testid="hr-stock-legal">
          {t("legal")}
        </p>
      </div>
      {note && (
        <p role="status" data-testid="hr-stock-msg" className="rounded-lg border border-[color:var(--color-line)] px-3 py-2 text-sm">
          {note}
        </p>
      )}

      {opts && (
        <>
          {opts.inventories.length > 0 ? (
            <form method="get" action={`/app/sys/${systemId}/hr/payroll#hr-stock`} className="flex flex-wrap items-end gap-2" data-testid="hr-stock-search">
              <label className={`${field} ${muted}`}>
                {t("inventoryLabel")}
                <select name="stockinv" defaultValue={opts.selected?.id ?? ""} className="input min-h-[44px]" data-testid="hr-stock-inventory">
                  {opts.inventories.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${field} ${muted}`}>
                {t("searchLabel")}
                <input name="stockq" defaultValue={q ?? ""} placeholder={t("searchHint")} className="input min-h-[44px] w-48" data-testid="hr-stock-search-q" />
              </label>
              <button type="submit" className={ghost}>
                {t("searchButton")}
              </button>
            </form>
          ) : (
            <p className={`text-xs ${muted}`}>{t("noInventoryRight")}</p>
          )}
          <form action={requestStockChargeAction} data-testid="hr-stock-form" className="flex flex-col gap-3">
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="requestKey" value={randomUUID()} />
            <div className="flex flex-wrap items-end gap-2">
              <label className={`${field} ${muted}`}>
                {t("kindLabel")}
                <select name="kind" defaultValue="ISSUE" className="input min-h-[44px]" data-testid="hr-stock-kind">
                  <option value="ISSUE">{t("kind.ISSUE")}</option>
                  <option value="DAMAGE">{t("kind.DAMAGE")}</option>
                </select>
              </label>
              <label className={`${field} ${muted}`}>
                {t("employeeLabel")}
                <select name="employeeId" required className="input min-h-[44px]" data-testid="hr-stock-employee">
                  {opts.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <input type="hidden" name="inventorySystemId" value={opts.selected?.id ?? ""} />
              <label className={`${field} ${muted}`}>
                {t("itemLabel")}
                <select name="itemId" defaultValue="" className="input min-h-[44px] max-w-[16rem]" data-testid="hr-stock-item">
                  <option value="">{t("itemNone")}</option>
                  {(opts.selected?.items ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.sku ? `${i.name} · ${i.sku}` : i.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={`${field} ${muted}`}>
                {t("qtyLabel")}
                <input name="qty" type="number" min={1} max={999} step={1} inputMode="numeric" className="input min-h-[44px] w-20" data-testid="hr-stock-qty" />
              </label>
              <label className={`flex min-h-[44px] items-center gap-2 text-xs ${muted}`}>
                <input type="checkbox" name="takeStock" defaultChecked={take && !!opts.selected} disabled={!take || !opts.selected} data-testid="hr-stock-take" />
                {take ? t("takeLabel") : t("takeNoRight")}
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className={`${field} ${muted}`}>
                {t("amountLabel")}
                <input name="amountBaht" inputMode="decimal" placeholder={t("amountHint")} className="input min-h-[44px] w-32" data-testid="hr-stock-amount" />
              </label>
              <label className={`${field} min-w-[12rem] flex-1 ${muted}`}>
                {t("descLabel")}
                <input name="description" maxLength={120} className="input min-h-[44px] min-w-0" data-testid="hr-stock-desc" />
              </label>
            </div>
            <fieldset className="flex flex-col gap-2 rounded-lg border border-[color:var(--color-line)] p-3">
              <legend className="px-1 text-xs font-medium">{t("consentTitle")}</legend>
              <label className="flex min-h-[44px] items-center gap-2 text-sm">
                <input type="checkbox" name="consent" required data-testid="hr-stock-consent" />
                {t("consentCheck")}
              </label>
              <div className="flex flex-wrap items-end gap-2">
                <label className={`${field} ${muted}`}>
                  {t("consentRefLabel")}
                  <input name="consentRef" required maxLength={80} className="input min-h-[44px] w-56" data-testid="hr-stock-consent-ref" />
                </label>
                <label className={`${field} ${muted}`}>
                  {t("consentAtLabel")}
                  <input name="consentAt" type="date" required max={today} className="input min-h-[44px]" data-testid="hr-stock-consent-at" />
                </label>
              </div>
            </fieldset>
            <div>
              <button type="submit" className={btn} data-testid="hr-stock-submit">
                {t("submit")}
              </button>
            </div>
          </form>
        </>
      )}

      {mine && (
        <div className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-3" data-testid="hr-stock-mine">
          <h3 className="text-sm font-semibold">{t("mineTitle")}</h3>
          {mine.length === 0 ? (
            <p className={`text-xs ${muted}`}>{t("mineEmpty")}</p>
          ) : (
            mine.map((c) => (
              <div key={c.id} data-testid={`hr-stock-mine-row-${c.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--color-line)] px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    {c.employeeName} · {t(`kind.${c.kind}`)} · {`${c.itemName ?? c.description ?? ""}${c.qty !== null ? ` ×${c.qty}` : ""}`}
                  </span>
                  <span className={`block text-xs ${muted}`}>
                    {t("period", { period: c.periodKey })} · {t("status.PENDING")}
                  </span>
                </span>
                <form action={withdrawStockChargeAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="systemId" value={systemId} />
                  <input type="hidden" name="chargeId" value={c.id} />
                  <button type="submit" className={ghost} data-testid={`hr-stock-withdraw-${c.id}`}>
                    {t("withdraw")}
                  </button>
                </form>
              </div>
            ))
          )}
        </div>
      )}

      {stuck && stuck.length > 0 && (
        <div role="note" data-testid="hr-stock-attention" className="flex flex-col gap-1 rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-xs">
          <div className="font-medium">{t("attentionTitle")}</div>
          {stuck.map((x) => (
            <div key={x.id} className={muted}>
              {x.employeeName} · {x.itemName ?? x.description ?? ""}
              {x.qty !== null ? ` ×${x.qty}` : ""} · {thaiDateKey(x.at)}
              {` · ${t(`attention.${x.reason}`)}`}
            </div>
          ))}
        </div>
      )}

      {list && (
        <div className="flex flex-col gap-2 border-t border-[color:var(--color-line)] pt-3" data-testid="hr-stock-list">
          <h3 className="text-sm font-semibold">{t("listTitle")}</h3>
          {list.items.length === 0 ? (
            <p className={`text-xs ${muted}`}>{t("listEmpty")}</p>
          ) : (
            list.items.map((c) => <StockRow key={c.id} c={c} t={t} systemId={systemId} overPeriod={!!flags?.has(c.id)} approverView={payrollViewer} />)
          )}
        </div>
      )}
    </section>
  );
}

type T = Awaited<ReturnType<typeof getTranslations>>;
function StockRow({ c, t, systemId, overPeriod, approverView }: { c: StockChargeItem; t: T; systemId: string; overPeriod: boolean; approverView: boolean }) {
  const what = `${c.itemName ?? c.description ?? ""}${c.qty !== null ? ` ×${c.qty}` : ""}`;
  return (
    <div data-testid={`hr-stock-row-${c.id}`} className="flex flex-col gap-2 rounded-lg border border-[color:var(--color-line)] px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-sm">
            {c.employeeName} · {t(`kind.${c.kind}`)} · {what} −{formatBaht(c.amountSatang)}
          </span>
          <span className={`block text-xs ${muted}`}>
            {c.periodKey ? t("period", { period: c.periodKey }) : t("noPeriod")}
            {c.unitCostSatang !== null && c.qty !== null ? ` · ${t("costLine", { unit: formatBaht(c.unitCostSatang), qty: c.qty, total: formatBaht(c.unitCostSatang * c.qty) })}` : ""}
            {c.requestedByName ? ` · ${t("requestedBy", { name: c.requestedByName })}` : ""}
          </span>
          <span className={`block text-xs ${muted}`}>
            {t("consentShown", { ref: c.consentRef, date: c.consentAt })}
            {c.movementId ? ` · ${t("movement", { id: c.movementId })}` : ""}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${tone(c.status)}`} data-testid={`hr-stock-status-${c.id}`}>
            {t(`status.${c.status}`)}
          </span>
          {(c.overCap === true || overPeriod) && (
            <span role="note" className="rounded-full border border-[color:var(--color-danger)] px-2 py-0.5 text-xs text-[color:var(--color-danger)]" data-testid={`hr-stock-cap-${c.id}`}>
              {c.overCap ? t("overCap") : t("overPeriod")}
            </span>
          )}
          {c.overCap === null && <span className={`rounded-full border border-[color:var(--color-line)] px-2 py-0.5 text-xs ${muted}`}>{t("noBase")}</span>}
        </span>
      </div>
      {c.refund && (
        <div role="note" data-testid={`hr-stock-refund-${c.id}`} className="rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-xs">
          <div className="font-medium">{t("refundOwed", { amount: formatBaht(c.refund.owedSatang) })}</div>
          <div className={muted}>
            {t("refundBy", { name: c.refund.decidedByName ?? "—", date: c.refund.decidedAt ? thaiDateKey(c.refund.decidedAt) : "—" })}
            {c.refund.reason ? ` · ${c.refund.reason}` : ""}
          </div>
          {c.refund.adjustment && (
            <div className={muted}>
              {c.refund.adjustment.bound ? t("adjBound", { period: c.refund.adjustment.runPeriodKey ?? "—", status: c.refund.adjustment.runStatus ?? "—" }) : t("adjUnbound")}
            </div>
          )}
          {c.refund.returnedAfterReversal && (
            <div className="font-medium text-[color:var(--color-danger)]" data-testid={`hr-stock-rerun-${c.id}`}>
              {t("returnedAfterReversal")}
            </div>
          )}
          {c.refund.repaidAt ? (
            <div>{t("repaidLine", { name: c.refund.repaidByName ?? "—", date: thaiDateKey(c.refund.repaidAt), ref: c.refund.repaidRef ?? "" })}</div>
          ) : (
            approverView && (
              <form action={markStockRefundRepaidAction} className="mt-2 flex flex-wrap items-end gap-2">
                <input type="hidden" name="systemId" value={systemId} />
                <input type="hidden" name="chargeId" value={c.id} />
                <label className={`${field} ${muted}`}>
                  {t("repaidRefLabel")}
                  <input name="repaidRef" required maxLength={80} className="input min-h-[44px] w-48" />
                </label>
                <button type="submit" className={ghost} data-testid={`hr-stock-repaid-${c.id}`}>
                  {t("markRepaid")}
                </button>
              </form>
            )
          )}
        </div>
      )}
      {WITHDRAWABLE.has(c.status) && (
        <form action={withdrawStockChargeAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="systemId" value={systemId} />
          <input type="hidden" name="chargeId" value={c.id} />
          <label className={`${field} ${muted}`}>
            {t("reasonLabel")}
            <input name="reason" maxLength={120} className="input min-h-[44px] w-56" />
          </label>
          <button type="submit" className={ghost} data-testid={`hr-stock-withdraw-${c.id}`}>
            {c.status === "PENDING" ? t("withdraw") : t("withdrawApproved")}
          </button>
        </form>
      )}
    </div>
  );
}
