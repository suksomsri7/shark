"use client";
// TRIPS T1.4 ▸ ผังพิมพ์ของใบรายชื่อ (ใบสั่ง T1.4 §5.4 + มติ M6) — ซ่อนบนจอ แสดงเฉพาะตอนพิมพ์ · ราก data-print-root="trips-manifest"
//   กฎ @media print ซ่อนทุกอย่างนอกรากนี้ (เปลือกแอป · แถบทัวร์ · ปุ่ม · กล่องโต้ตอบ) โดยไม่แก้เปลือกแอป: พี่น้องของทุกบรรพบุรุษของราก = display none
//   (เบราว์เซอร์ที่ไม่มี :has ⇒ ซ่อนด้วย visibility แทน) · บรรพบุรุษถูกคลายความสูง/การเลื่อน ให้เนื้อหาไหลข้ามหน้ากระดาษได้
//   ใช้หน้างาน: แถวผู้เดินทางเป็นตารางคอลัมน์ตรงกันทุกการจอง (ช่องเช็กชื่อ ☐ · ลำดับ · ชื่อ · ประเภท · เอกสารแบบปิดบัง · แบบฟอร์ม · ลงนาม · สุขภาพแบบธง · หมายเหตุ/ตีนกบ)
//   หัวการจองติดกับแถวผู้เดินทางแรกเสมอ (ห่อรวมกันแบบไม่ตัดคร่อมหน้า) · แถวถัดไปตัดข้ามหน้าได้ทีละแถว ⇒ ไม่มีแถบว่างท้ายหน้า
//   🔴 กระดาษไม่มี: เนื้อหาสุขภาพ (สถานะเท่านั้น) · เลขเอกสารเต็ม · เบอร์เต็ม · ยอดเงิน · จำนวนไฟล์ · ชื่อของผู้เดินทางที่ถูกลบ ("ลบตามนโยบายแล้ว")
//   🔴 แสดงผลเท่านั้น — ทุกตัวเลขมาจาก loadManifestVM · รายชื่อรายคนเปิดทั้งหมด · ตัวอักษรดำบนขาว ≥ 10pt
import type { CSSProperties, ReactNode } from "react";
import type { ManifestGroupVM, ManifestPaxVM, ManifestRowVM, ManifestVM } from "@/lib/modules/trips";
import type { MfText } from "./ManifestParts";
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
  [data-print-keep] { break-inside: avoid; page-break-inside: avoid; }
}
`;

/** คอลัมน์ของแถวผู้เดินทาง (เท่ากันทุกการจอง ⇒ คอลัมน์ตรงกันทั้งใบ) · A4 แนวตั้งขอบ 12 มม. เหลือกว้าง 186 มม. */
const GRID: CSSProperties = { display: "grid", gridTemplateColumns: "6mm 7mm minmax(0,1fr) 17mm 27mm 17mm 17mm 19mm 26mm", columnGap: "1.5mm", alignItems: "baseline" };
const CELL = "min-w-0 [overflow-wrap:anywhere]";

function PaxRow({ p, X }: { p: ManifestPaxVM; X: MfText }) {
  const { t } = X;
  if (p.purged) {
    return (
      <div style={GRID} data-print-pax="" className="border-b border-black/30 py-0.5">
        <span aria-hidden="true">☐</span>
        <span className="tabular-nums">{p.no}</span>
        <span className={`${CELL} italic`}>{X.paxName(p)}</span>
      </div>
    );
  }
  // สุขภาพแบบธง: มีข้อมูล ⇒ ⚑ (ผู้มีสิทธิ์เปิดดูในระบบ) · ไม่เก็บ ⇒ — · อื่น ๆ ⇒ ชื่อสถานะ (ไม่มีเนื้อหาสุขภาพบนกระดาษ)
  const health = p.health === "PROVIDED" ? `⚑ ${X.health(p.health)}` : p.health === "NOT_COLLECTED" ? "—" : X.health(p.health);
  const note = [p.finSize ? t("manifest.pax.fin", { size: p.finSize }) : null, p.isMinor ? t("manifest.pax.minor") : null].filter(Boolean).join(" · ");
  return (
    <div style={GRID} data-print-pax="" className="border-b border-black/30 py-0.5">
      <span aria-hidden="true">☐</span>
      <span className="tabular-nums">{p.no}</span>
      <span className={CELL}>
        <b className={p.fullName ? "" : "font-normal italic"}>{X.paxName(p)}</b>
        {p.nationality ? ` · ${p.nationality}` : ""}
      </span>
      <span className={CELL}>{X.paxType(p)}</span>
      <span className={`${CELL} tabular-nums`}>{X.docLine(p)}</span>
      <span className={CELL}>{X.formStatus(p.formStatus)}</span>
      <span className={CELL}>{X.waiver(p.waiver)}</span>
      <span className={CELL}>{health}</span>
      <span className={CELL}>{note}</span>
    </div>
  );
}

function ColHead({ X }: { X: MfText }) {
  const { t } = X;
  return (
    <div style={GRID} className="border-b border-black py-0.5 font-bold">
      <span>{t("manifest.pax.colCheck")}</span>
      <span>{t("manifest.pax.colNo")}</span>
      <span>{t("manifest.pax.colName")}</span>
      <span>{t("manifest.pax.colType")}</span>
      <span>{t("manifest.pax.colDoc")}</span>
      <span>{t("manifest.pax.colForm")}</span>
      <span>{t("manifest.pax.colWaiver")}</span>
      <span>{t("manifest.pax.colHealth")}</span>
      <span>{t("manifest.pax.colNote")}</span>
    </div>
  );
}

function BookingHead({ row, X }: { row: ManifestRowVM; X: MfText }) {
  const { t } = X;
  const status = [
    row.doc.state === "MISSING_NAMES" ? t("manifest.docState.MISSING_NAMES", { n: row.doc.missingNames }) : t(`manifest.docState.${row.doc.state}`),
    row.doc.paxCut ? t("manifest.pax.countsPartial") : null,
    row.doc.waiverRequired !== null && row.doc.waiverSigned !== null && row.doc.waiverRequired > 0 ? t("manifest.pax.signed", { a: row.doc.waiverSigned, b: row.doc.waiverRequired }) : null,
    row.doc.healthProvided !== null && row.doc.healthProvided > 0 ? t("manifest.pax.healthProvided", { n: row.doc.healthProvided }) : null,
    row.doc.healthMissing !== null && row.doc.healthMissing > 0 ? t("manifest.pax.healthMissing", { n: row.doc.healthMissing }) : null,
    ...row.extras.map(X.extraText),
    row.pickup.paid ? t("manifest.pax.pickupPaid") : null,
    `${t("manifest.col.contact")}: ${X.contact(row)}`,
  ].filter(Boolean);
  return (
    <div className="pt-2">
      <p>
        <b>{row.pickup.time ?? "—"}</b> · {row.pickup.place ?? (row.pickup.hint ? `${row.pickup.hint} ${t("manifest.pax.fromForm")}` : "—")}
        {row.pickup.note ? ` (${row.pickup.note})` : ""} · <b>{X.booker(row)}</b> · {row.code} · {X.channel(row.channel)} · {X.paxLine(row.pax)}
      </p>
      <p>{status.join(" · ")}</p>
    </div>
  );
}

/** บล็อกการจองหนึ่งรายการ: [หัวกลุ่ม (การจองแรกของกลุ่ม)] + หัวการจอง + แถวผู้เดินทางแรก ห่อรวม (ไม่ตัดคร่อมหน้า) · แถวที่เหลือตัดข้ามหน้าได้ทีละแถว */
function BookingBlock({ row, X, lead }: { row: ManifestRowVM; X: MfText; lead: ReactNode }) {
  const { t } = X;
  const [first, ...rest] = row.travellers;
  const cutLine = row.doc.paxCut ? <p className="font-bold">{first ? t("manifest.pax.partialList", { shown: row.travellers.length, slots: row.doc.slots }) : t("manifest.pax.notLoaded")}</p> : null;
  return (
    <div data-print-booking="" className="border-b border-black/60 pb-1">
      <div data-print-keep="">
        {lead}
        <BookingHead row={row} X={X} />
        {cutLine}
        {first ? <PaxRow p={first} X={X} /> : row.doc.paxCut ? null : <p className="italic">{t("manifest.pax.none")}</p>}
      </div>
      {rest.map((p) => (
        <div key={p.passengerId} data-print-keep="">
          <PaxRow p={p} X={X} />
        </div>
      ))}
    </div>
  );
}

function GroupHead({ grp, X }: { grp: ManifestGroupVM; X: MfText }) {
  const { t } = X;
  return (
    <header className="border-b-2 border-black pb-1 pt-3">
      <h2 className="font-bold">
        {groupTitle(grp, X)} · {t("manifest.group.people", { n: grp.people })}
        {grp.run && grp.run.vehicleSeats !== null ? ` · ${t("manifest.group.seats", { used: grp.people, seats: grp.run.vehicleSeats })}` : ""}
      </h2>
      {grp.run && grp.run.route.length > 0 ? <p>{t("manifest.group.route", { route: grp.run.route.join(" → ") })}</p> : null}
    </header>
  );
}

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
    vm.prep.finSizes === null ? t("manifest.kpi.finPartial") : null,
    ...(vm.prep.finSizes ?? []).map((f) => t("manifest.kpi.fins", { size: f.size, n: f.n })),
    vm.prep.finMissing !== null && vm.prep.finMissing > 0 ? t("manifest.kpi.finMissing", { n: vm.prep.finMissing }) : null,
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
        <section key={grp.key} data-print-group="">
          {grp.rows.map((row, i) => (
            <BookingBlock
              key={row.bookingId}
              row={row}
              X={X}
              lead={
                i === 0 ? (
                  <>
                    <GroupHead grp={grp} X={X} />
                    <ColHead X={X} />
                  </>
                ) : null
              }
            />
          ))}
        </section>
      ))}
      <div data-print-keep="" className="pt-6">
        <p>{t("manifest.print.signature")} ........................................</p>
        <p data-testid="trips-mf-print-footer" className="pt-3 font-bold">
          {t("manifest.print.footer")}
        </p>
      </div>
    </div>
  );
}
