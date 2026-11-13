"use client";
// TRIPS T1.4 ▸ ใบรายชื่อรายวันของรอบ ฝั่งร้าน (ภาพ 12 ส่วนจอใหญ่): หัว · ตัวสลับมุมมอง · แถบปุ่ม · การ์ดสรุป 6 ใบ · แถบแจ้ง · กลุ่ม (ตาราง/การ์ด) · ผังพิมพ์ · กล่องข้อมูลสุขภาพ
//   ข้อมูลทั้งหมดจาก loadManifestVM · URL: ?view=pickup|booking (ลิงก์จริง) · ส่วนที่ยังไม่เปิดใช้ = ปุ่มกดไม่ได้ + ข้อความบอกตรง ๆ
//   🔴 แสดงผลเท่านั้น — ไม่บวกเลข ไม่ตัดสินสถานะ ไม่คิดวันเวลา (ทุกค่ามาจาก VM) · เงินผ่าน formatBaht เท่านั้น · ข้อมูลสุขภาพไม่อยู่ในไฟล์นี้
//   🔴 พิมพ์: บันทึกการพิมพ์ที่เซิร์ฟเวอร์สำเร็จก่อน แล้วจึงเปิดกล่องพิมพ์ของเบราว์เซอร์ · ส่งออก: เซิร์ฟเวอร์บันทึกแล้วคืนไฟล์ ⇒ ดาวน์โหลดจากหน่วยความจำ (ไม่มีลิงก์ใช้ซ้ำ)
import { useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import type { ManifestVM } from "@/lib/modules/trips";
import { exportManifestCsvAction, recordManifestPrintAction } from "@/lib/modules/trips/manifest-actions";
import { BTN, BTN_PRIMARY } from "./ProductsScreenParts";
import { SEG_OFF, SEG_ON, SEG_WRAP } from "./DepartureParts";
import { MfNotYet, useMfText } from "./ManifestParts";
import ManifestGroups from "./ManifestTable";
import ManifestPrint from "./ManifestPrint";
import { HealthDialog } from "./ManifestDialogs";

const NOTE = "rounded-lg border border-dashed border-[color:var(--color-line)] px-3 py-2 text-sm text-[color:var(--color-ink)] [overflow-wrap:anywhere]";
const ALERT = "rounded-lg border border-[color:var(--color-danger)] px-3 py-2 text-sm font-medium text-[color:var(--color-danger)] [overflow-wrap:anywhere]";

function Kpi({ "data-testid": testid, label, value, children }: { "data-testid": string; label: string; value: string; children?: ReactNode }) {
  return (
    <div data-testid={testid} className="flex min-w-0 flex-col gap-1 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4">
      <span className="text-sm text-[color:var(--color-muted)]">{label}</span>
      <b className="text-2xl tabular-nums text-[color:var(--color-ink)] [overflow-wrap:anywhere]">{value}</b>
      <div className="flex min-w-0 flex-col gap-0.5 text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}

export default function ManifestScreen({ unitSlug, vm, channels, printedBy }: { unitSlug: string; vm: ManifestVM; channels: readonly string[]; printedBy: string }) {
  const X = useMfText(channels);
  const { t, D, T } = X;
  const d = vm.departure;
  const tot = vm.totals;
  const base = `/app/u/${unitSlug}/trips/departures`;
  const self = `${base}/${encodeURIComponent(d.id)}/manifest`;
  const backHref = `${base}?view=week&start=${d.localDate}&dep=${encodeURIComponent(d.id)}`;
  const [working, setWorking] = useState<"print" | "export" | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [printedAt, setPrintedAt] = useState(vm.unit.nowLocal);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exported, setExported] = useState<{ rows: number; truncated: boolean } | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const codeText = (code: string | undefined, fallback: string) => (code === "FORBIDDEN" || code === "NOT_FOUND" ? t(`errors.${code}`) : fallback);

  const onPrint = async () => {
    if (working) return;
    setWorking("print");
    setPrintError(null);
    try {
      const r = await recordManifestPrintAction(unitSlug, { departureId: d.id });
      if (!r.ok) {
        setPrintError(codeText(r.code, t("manifest.print.error")));
        return;
      }
      // เวลาที่ขึ้นบนกระดาษ = เวลาที่เซิร์ฟเวอร์บันทึกการพิมพ์ (เวลาร้าน) — ให้ผังพิมพ์อัปเดตก่อนเปิดกล่องพิมพ์
      flushSync(() => setPrintedAt(r.value.printedLocal));
      window.print();
    } catch {
      setPrintError(t("manifest.print.error"));
    } finally {
      setWorking(null);
    }
  };
  const onExport = async () => {
    if (working) return;
    setWorking("export");
    setExportError(null);
    setExported(null);
    try {
      const r = await exportManifestCsvAction(unitSlug, { departureId: d.id });
      if (!r.ok) {
        setExportError(codeText(r.code, t("manifest.export.error")));
        return;
      }
      const url = URL.createObjectURL(new Blob([r.value.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.value.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExported({ rows: r.value.rows, truncated: r.value.truncated });
    } catch {
      setExportError(t("manifest.export.error"));
    } finally {
      setWorking(null);
    }
  };

  const ratio = (a: number | null, b: number | null) => (a === null || b === null ? "—" : t("manifest.kpi.ratio", { a, b }));
  const names = (list: readonly { name: string }[]) => list.map((r) => r.name).join(", ");
  const partial = vm.truncated || vm.paxTruncated;

  return (
    <div data-testid="trips-mf" className="flex min-w-0 flex-col gap-4">
      <div className="flex min-w-0 flex-col gap-4 print:hidden">
        {/* ── หัว: ทางเดินกลับ · ชื่อ · สถานะรอบ · เรือ/ไกด์ ── */}
        <div className="flex min-w-0 flex-col gap-2">
          <nav aria-label={t("manifest.aria")} className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-[color:var(--color-muted)]">
            <Link data-testid="trips-mf-back" href={backHref} className="inline-flex min-h-11 items-center underline underline-offset-2">
              {t("manifest.back")}
            </Link>
            <span aria-hidden="true">›</span>
            <span className="whitespace-nowrap">{D.full(d.localDate)}</span>
          </nav>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1 data-testid="trips-mf-title" className="min-w-0 text-xl font-bold text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
              {t("manifest.title", { product: T(d.titleTh, d.titleEn) })}
            </h1>
            <span data-testid="trips-mf-status" data-status={d.status} className="inline-flex items-center whitespace-nowrap rounded-md border border-[color:var(--color-ink)] px-2 py-0.5 text-sm text-[color:var(--color-ink)]">
              {X.depStatus(d.status)}
            </span>
          </div>
          <p className="text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">
            {t("manifest.dateTime", { date: D.short(d.localDate), time: d.timeText })}
            {d.optionTh ? ` · ${T(d.optionTh, d.optionEn)}` : ""}
          </p>
          <div data-testid="trips-mf-resources" className="flex min-w-0 flex-wrap gap-2 text-sm text-[color:var(--color-ink)]">
            {d.boats.length ? <span className="rounded-md bg-[color:var(--color-surface-2)] px-2 py-0.5 [overflow-wrap:anywhere]">{t("manifest.resources.boat", { names: names(d.boats) })}</span> : null}
            {d.guides.length ? <span className="rounded-md bg-[color:var(--color-surface-2)] px-2 py-0.5 [overflow-wrap:anywhere]">{t("manifest.resources.guide", { names: names(d.guides) })}</span> : null}
            {d.boats.length === 0 && d.guides.length === 0 ? <span className="text-[color:var(--color-muted)]">{t("manifest.resources.none")}</span> : null}
          </div>
        </div>

        {/* ── ตัวสลับมุมมอง + แถบปุ่ม (แถวเดียว ห่อบรรทัดได้ ไม่กองแนวตั้ง) ── */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
          <nav aria-label={t("manifest.view.aria")} className={SEG_WRAP}>
            <Link data-testid="trips-mf-view-pickup" href={self} scroll={false} aria-current={vm.view === "pickup" ? "page" : undefined} className={vm.view === "pickup" ? SEG_ON : SEG_OFF}>
              {t("manifest.view.pickup")}
            </Link>
            <Link data-testid="trips-mf-view-booking" href={`${self}?view=booking`} scroll={false} aria-current={vm.view === "booking" ? "page" : undefined} className={vm.view === "booking" ? SEG_ON : SEG_OFF}>
              {t("manifest.view.booking")}
            </Link>
            <MfNotYet data-testid="trips-mf-view-agency" label={t("manifest.view.agency")} hint={t("manifest.notYet.agency")} className={`${SEG_OFF} disabled:cursor-not-allowed`} />
          </nav>
          <div data-testid="trips-mf-actions" role="group" aria-label={t("manifest.actions.aria")} className="flex min-w-0 flex-wrap gap-2">
            <button type="button" data-testid="trips-mf-print" className={BTN_PRIMARY} disabled={working !== null} onClick={onPrint}>
              {working === "print" ? t("manifest.actions.working") : t("manifest.actions.print")}
            </button>
            <button type="button" data-testid="trips-mf-export" className={BTN} disabled={working !== null} onClick={onExport}>
              {working === "export" ? t("manifest.actions.working") : t("manifest.actions.export")}
            </button>
            {vm.flags.canSeeHealth ? (
              <button type="button" data-testid="trips-mf-health" className={BTN} onClick={() => setHealthOpen(true)}>
                {t("manifest.actions.health")}
              </button>
            ) : null}
            <MfNotYet data-testid="trips-mf-send" label={t("manifest.actions.send")} hint={t("manifest.notYet.send")} />
            <MfNotYet data-testid="trips-mf-runs-edit" label={t("manifest.actions.runs")} hint={t("manifest.notYet.runs")} />
          </div>
        </div>
        {printError ? (
          <p data-testid="trips-mf-print-error" role="alert" className={ALERT}>
            {printError}
          </p>
        ) : null}
        {exportError ? (
          <p data-testid="trips-mf-export-error" role="alert" className={ALERT}>
            {exportError}
          </p>
        ) : null}
        {exported ? (
          exported.truncated ? (
            <p data-testid="trips-mf-export-truncated" role="alert" className={ALERT}>
              {t("manifest.export.truncated", { rows: exported.rows })}
            </p>
          ) : (
            <p role="status" className={NOTE}>
              {t("manifest.export.done", { rows: exported.rows })}
            </p>
          )
        ) : null}

        {/* ── การ์ดสรุป 6 ใบ (ตัวเลขจากคิวรีรวมของตัวโหลด) ── */}
        <div data-testid="trips-mf-kpis" role="group" aria-label={t("manifest.kpi.aria")} className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi data-testid="trips-mf-kpi-people" label={t("manifest.kpi.people")} value={String(tot.people)}>
            <span>{X.paxLine(tot.pax)}</span>
            <span>{t("manifest.kpi.bookings", { n: tot.bookings })}</span>
          </Kpi>
          <Kpi data-testid="trips-mf-kpi-pickup" label={t("manifest.kpi.pickup")} value={String(tot.pickup.assignedPeople)}>
            <span>{t("manifest.kpi.assigned", { n: tot.pickup.assignedPeople })}</span>
            <span>{t("manifest.kpi.vehicles", { n: tot.pickup.vehicles })}</span>
            <span>{t("manifest.kpi.unassigned", { n: tot.pickup.unassignedPeople })}</span>
          </Kpi>
          <Kpi data-testid="trips-mf-kpi-names" label={t("manifest.kpi.names")} value={ratio(tot.named, tot.people)}>
            <span>{tot.missingNames > 0 ? t("manifest.kpi.missing", { n: tot.missingNames }) : t("manifest.kpi.namesDone")}</span>
          </Kpi>
          <Kpi data-testid="trips-mf-kpi-waiver" label={t("manifest.kpi.waiver")} value={tot.waiverRequired === 0 ? "—" : ratio(tot.waiverSigned, tot.waiverRequired)}>
            {tot.waiverRequired === 0 ? <span>{t("manifest.kpi.noWaiver")}</span> : null}
            {partial ? <span>{t("manifest.kpi.partial")}</span> : null}
          </Kpi>
          {vm.flags.canSeeMoney && tot.outstandingSatang !== null ? (
            <Kpi data-testid="trips-mf-kpi-money" label={t("manifest.kpi.money")} value={X.money(tot.outstandingSatang)}>
              {tot.agentCollectBookings ? <span>{t("manifest.kpi.agentCollect", { n: tot.agentCollectBookings })}</span> : null}
            </Kpi>
          ) : null}
          <Kpi data-testid="trips-mf-kpi-prep" label={t("manifest.kpi.prep")} value={String(vm.prep.meals.travellers)}>
            <span>{t("manifest.kpi.meals", { n: vm.prep.meals.travellers, g: vm.prep.meals.guides })}</span>
            {vm.prep.extras.length === 0 ? <span>{t("manifest.kpi.noPrep")}</span> : null}
            {vm.prep.extras.map((x) => (
              <span key={x.extraId}>{X.extraText(x)}</span>
            ))}
            {vm.prep.finSizes.map((f) => (
              <span key={f.size}>{t("manifest.kpi.fins", { size: f.size, n: f.n })}</span>
            ))}
            {vm.prep.finMissing > 0 ? <span>{t("manifest.kpi.finMissing", { n: vm.prep.finMissing })}</span> : null}
            <span>
              {tot.healthProvided === null ? "—" : t("manifest.kpi.healthProvided", { n: tot.healthProvided })}
              {tot.healthMissing === null ? "" : ` · ${t("manifest.kpi.healthMissing", { n: tot.healthMissing })}`}
            </span>
          </Kpi>
        </div>

        {/* ── แถบแจ้ง ── */}
        {tot.pendingBookings > 0 ? (
          <p data-testid="trips-mf-pending-note" role="note" className={NOTE}>
            {t("manifest.note.pending", { n: tot.pendingBookings })}
          </p>
        ) : null}
        {partial ? (
          <p data-testid="trips-mf-truncated" role="status" className={`${NOTE} font-medium`}>
            {vm.truncated ? t("manifest.note.truncated", { shown: vm.bookingsShown, total: vm.bookingsTotal }) : t("manifest.note.paxTruncated", { shown: vm.paxShown, total: vm.paxTotal })}
          </p>
        ) : null}
        {tot.pickup.staleStops > 0 ? (
          <p data-testid="trips-mf-stale-note" role="note" className={NOTE}>
            {t("manifest.note.stale", { n: tot.pickup.staleStops })}
          </p>
        ) : null}

        {/* ── กลุ่ม ── */}
        {vm.groups.length === 0 ? (
          <p data-testid="trips-mf-empty" role="status" className="rounded-2xl border border-dashed border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-5 py-8 text-center text-sm text-[color:var(--color-ink-soft)]">
            {t("manifest.empty")}
          </p>
        ) : (
          <ManifestGroups vm={vm} unitSlug={unitSlug} X={X} />
        )}
      </div>

      <ManifestPrint vm={vm} X={X} printedAt={printedAt} printedBy={printedBy} />
      {healthOpen ? <HealthDialog unitSlug={unitSlug} departureId={d.id} onClose={() => setHealthOpen(false)} /> : null}
    </div>
  );
}
