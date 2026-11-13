"use client";
// TRIPS T1.4 ▸ ผังพิมพ์ของใบรายชื่อ (ใบสั่ง T1.4 §5.4) — ซ่อนบนจอ แสดงเฉพาะตอนพิมพ์ · ราก data-print-root="trips-manifest"
//   กฎ @media print ซ่อนทุกอย่างนอกรากนี้ (เปลือกแอป · แถบทัวร์ · ปุ่ม · กล่องโต้ตอบ) โดยไม่แก้เปลือกแอป: พี่น้องของทุกบรรพบุรุษของราก = display none
//   (เบราว์เซอร์ที่ไม่มี :has ⇒ ซ่อนด้วย visibility แทน) · บรรพบุรุษถูกคลายความสูง/การเลื่อน ให้เนื้อหาไหลข้ามหน้ากระดาษได้
//   🔴 กระดาษไม่มี: เนื้อหาสุขภาพ (สถานะเท่านั้น) · เลขเอกสารเต็ม · เบอร์เต็ม · ยอดเงิน · จำนวนไฟล์ · ชื่อของผู้เดินทางที่ถูกลบ ("ลบตามนโยบายแล้ว")
//   🔴 แสดงผลเท่านั้น — ทุกตัวเลขมาจาก loadManifestVM · รายชื่อรายคนเปิดทั้งหมด · ตัวอักษรดำบนขาว ≥ 10pt · ไม่ตัดการจองคร่อมหน้า
import type { ManifestVM } from "@/lib/modules/trips";
import { PaxList, type MfText } from "./ManifestParts";
import { groupTitle } from "./ManifestTable";

const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  [data-print-root="trips-manifest"], [data-print-root="trips-manifest"] * { visibility: visible !important; }
  *:has([data-print-root="trips-manifest"]) { display: block !important; position: static !important; overflow: visible !important; height: auto !important; min-height: 0 !important; max-height: none !important; width: auto !important; max-width: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; transform: none !important; }
  *:has([data-print-root="trips-manifest"]) > *:not(:has([data-print-root="trips-manifest"])):not([data-print-root="trips-manifest"]) { display: none !important; }
  [data-print-root="trips-manifest"] { display: block !important; width: 100% !important; color: #000 !important; background: #fff !important; font-size: 10pt !important; line-height: 1.35 !important; }
  [data-print-root="trips-manifest"] * { color: #000 !important; background: transparent !important; font-size: inherit !important; }
  [data-print-root="trips-manifest"] h1 { font-size: 14pt !important; }
  [data-print-root="trips-manifest"] h2 { font-size: 11pt !important; }
  [data-print-booking] { break-inside: avoid; page-break-inside: avoid; }
  [data-print-group] > header { break-after: avoid; page-break-after: avoid; }
}
`;

export default function ManifestPrint({ vm, X, printedAt, printedBy }: { vm: ManifestVM; X: MfText; printedAt: string; printedBy: string }) {
  const { t, D, T } = X;
  const d = vm.departure;
  const tot = vm.totals;
  const [ymd, hm] = printedAt.split(" ");
  const stamp = hm ? `${D.full(ymd)} ${hm}` : printedAt;
  const names = (list: readonly { name: string }[]) => list.map((r) => r.name).join(", ");
  const summary = [
    t("manifest.print.summaryPeople", { people: tot.people, bookings: tot.bookings }),
    X.paxLine(tot.pax),
    t("manifest.print.summaryNames", { a: tot.named, b: tot.people }),
    tot.waiverRequired !== null && tot.waiverSigned !== null && tot.waiverRequired > 0 ? t("manifest.print.summaryWaiver", { a: tot.waiverSigned, b: tot.waiverRequired }) : null,
    t("manifest.kpi.assigned", { n: tot.pickup.assignedPeople }),
    t("manifest.kpi.vehicles", { n: tot.pickup.vehicles }),
    t("manifest.kpi.unassigned", { n: tot.pickup.unassignedPeople }),
    t("manifest.kpi.meals", { n: vm.prep.meals.travellers, g: vm.prep.meals.guides }),
    ...vm.prep.extras.map(X.extraText),
    ...vm.prep.finSizes.map((f) => t("manifest.kpi.fins", { size: f.size, n: f.n })),
    vm.prep.finMissing > 0 ? t("manifest.kpi.finMissing", { n: vm.prep.finMissing }) : null,
  ].filter((x): x is string => typeof x === "string" && x.length > 0);
  return (
    <div data-print-root="trips-manifest" className="hidden print:block">
      {/* ค่าคงที่ของไฟล์นี้ (ไม่มีค่าจากผู้ใช้) — ใส่ตรงเพื่อไม่ให้ตัวอักษร > ของ CSS ถูกแปลงตอนเรนเดอร์ฝั่งเซิร์ฟเวอร์ */}
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <header className="flex flex-col gap-1 border-b border-black pb-2">
        <p>
          {vm.unit.name} · {t("manifest.print.heading")}
        </p>
        <h1 className="font-bold">
          {t("manifest.title", { product: T(d.titleTh, d.titleEn) })}
          {d.optionTh ? ` · ${T(d.optionTh, d.optionEn)}` : ""}
        </h1>
        <p>
          {t("manifest.dateTime", { date: D.full(d.localDate), time: d.timeText })} · {X.depStatus(d.status)}
        </p>
        {d.boats.length || d.guides.length ? (
          <p>{[d.boats.length ? t("manifest.resources.boat", { names: names(d.boats) }) : null, d.guides.length ? t("manifest.resources.guide", { names: names(d.guides) }) : null].filter(Boolean).join(" · ")}</p>
        ) : null}
        <p>{t("manifest.print.printedAt", { time: stamp, name: printedBy })}</p>
      </header>
      <p className="py-2">{summary.join(" · ")}</p>
      {vm.truncated ? <p className="pb-2 font-bold">{t("manifest.note.truncated", { shown: vm.bookingsShown, total: vm.bookingsTotal })}</p> : null}
      {vm.paxTruncated ? <p className="pb-2 font-bold">{t("manifest.note.paxTruncated", { shown: vm.paxShown, total: vm.paxTotal })}</p> : null}
      {vm.groups.length === 0 ? <p className="py-2">{t("manifest.empty")}</p> : null}
      {vm.groups.map((grp) => (
        <section key={grp.key} data-print-group="" className="pt-3">
          <header className="border-b border-black pb-1">
            <h2 className="font-bold">
              {groupTitle(grp, X)} · {t("manifest.group.people", { n: grp.people })}
              {grp.run && grp.run.vehicleSeats !== null ? ` · ${t("manifest.group.seats", { used: grp.people, seats: grp.run.vehicleSeats })}` : ""}
            </h2>
            {grp.run && grp.run.route.length > 0 ? <p>{t("manifest.group.route", { route: grp.run.route.join(" → ") })}</p> : null}
          </header>
          {grp.rows.map((row) => (
            <div key={row.bookingId} data-print-booking="" className="flex flex-col gap-1 border-b border-black/40 py-2">
              <p>
                <b>{row.pickup.time ?? "—"}</b> · {row.pickup.place ?? (row.pickup.hint ? `${row.pickup.hint} ${t("manifest.pax.fromForm")}` : "—")}
                {row.pickup.note ? ` (${row.pickup.note})` : ""} · <b>{X.booker(row)}</b> · {row.code} · {X.channel(row.channel)} · {X.paxLine(row.pax)}
              </p>
              <p>
                {[
                  row.doc.state === "MISSING_NAMES" ? t("manifest.docState.MISSING_NAMES", { n: row.doc.missingNames }) : t(`manifest.docState.${row.doc.state}`),
                  row.doc.waiverRequired > 0 ? t("manifest.pax.signed", { a: row.doc.waiverSigned, b: row.doc.waiverRequired }) : null,
                  row.doc.healthProvided > 0 ? t("manifest.pax.healthProvided", { n: row.doc.healthProvided }) : null,
                  row.doc.healthMissing > 0 ? t("manifest.pax.healthMissing", { n: row.doc.healthMissing }) : null,
                  ...X.noteParts(row),
                  `${t("manifest.col.contact")}: ${X.contact(row)}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <PaxList row={row} X={X} print />
            </div>
          ))}
        </section>
      ))}
      <p className="pt-6">{t("manifest.print.signature")} ........................................</p>
      <p data-testid="trips-mf-print-footer" className="pt-3 font-bold">
        {t("manifest.print.footer")}
      </p>
    </div>
  );
}
