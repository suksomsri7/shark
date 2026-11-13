"use client";
// TRIPS T1.4 ▸ กลุ่มของใบรายชื่อ (ภาพ 12 :21–:35): หัวกลุ่มรถ/ยังไม่จัดรถ + ตาราง 7 คอลัมน์ (จอ ≥ md) + การ์ดต่อการจอง (มือถือ ไม่มีตาราง)
//   ความกว้างขั้นต่ำ: เวลารับ 72 + จุดรับ 176 + ผู้จอง·การจอง 200 + คน 104 + รายชื่อ·เอกสาร 176 + หมายเหตุ 168 + ติดต่อ 120 = 1,016 ("ช่องทาง" เป็นบรรทัดรองใต้ผู้จอง)
//   🔴 แสดงผลเท่านั้น — กลุ่ม/ลำดับ/ป้าย/จำนวน มาจาก loadManifestVM · รายชื่อรายคนขยายต่อการจอง (สถานะเปิด/ปิดใช้ร่วมกันระหว่างตารางและการ์ด)
import { useState } from "react";
import Link from "next/link";
import type { ManifestGroupVM, ManifestRowVM, ManifestVM } from "@/lib/modules/trips";
import { BTN, TD, TH } from "./ProductsScreenParts";
import { DocBadge, DocExtras, HealthCounts, PaxList, type MfText } from "./ManifestParts";

/** ชื่อกลุ่ม: ชื่อรถ (รถถูกลบ ⇒ ข้อความ) · ยังไม่จัดรถ / มาเอง · การจองทั้งหมด */
export function groupTitle(grp: ManifestGroupVM, X: MfText): string {
  if (grp.run) return grp.run.vehicleName ?? X.t("manifest.group.vehicleRemoved");
  return grp.key === "all" ? X.t("manifest.group.all") : X.t("manifest.group.unassigned");
}

export default function ManifestGroups({ vm, unitSlug, X }: { vm: ManifestVM; unitSlug: string; X: MfText }) {
  const { t } = X;
  const [open, setOpen] = useState<readonly string[]>([]);
  const toggle = (id: string) => setOpen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const bookingHref = (row: ManifestRowVM) => `/app/u/${unitSlug}/trips/bookings?when=all&b=${encodeURIComponent(row.bookingId)}`;
  const canLink = vm.flags.canSeeMoney;

  const code = (row: ManifestRowVM) =>
    canLink ? (
      <Link href={bookingHref(row)} aria-label={t("manifest.openBooking", { code: row.code })} className="whitespace-nowrap font-medium text-[color:var(--color-ink)] underline underline-offset-2">
        {row.code}
      </Link>
    ) : (
      <span className="whitespace-nowrap font-medium">{row.code}</span>
    );
  const place = (row: ManifestRowVM) => (
    <>
      {row.pickup.place ? (
        <div className="[overflow-wrap:anywhere]">{row.pickup.place}</div>
      ) : row.pickup.hint ? (
        <div className="text-[color:var(--color-muted)] [overflow-wrap:anywhere]">
          {row.pickup.hint} {t("manifest.pax.fromForm")}
        </div>
      ) : (
        <div className="text-[color:var(--color-muted)]">—</div>
      )}
      {row.pickup.note ? <div className="text-sm text-[color:var(--color-muted)] [overflow-wrap:anywhere]">{row.pickup.note}</div> : null}
    </>
  );
  const notes = (row: ManifestRowVM) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      {X.noteParts(row).map((line) => (
        <span key={line} className="[overflow-wrap:anywhere]">
          {line}
        </span>
      ))}
      <HealthCounts doc={row.doc} X={X} />
      {row.outstandingSatang !== null && row.outstandingSatang > 0 ? <span className="whitespace-nowrap text-sm font-medium tabular-nums">{t("manifest.pax.outstanding", { amount: X.money(row.outstandingSatang) })}</span> : null}
    </div>
  );
  const paxToggle = (row: ManifestRowVM) => {
    const on = open.includes(row.bookingId);
    return (
      <button type="button" data-testid={`trips-mf-pax-toggle-${row.bookingId}`} aria-expanded={on} onClick={() => toggle(row.bookingId)} className={`${BTN} print:hidden`}>
        <span aria-hidden="true">{on ? "▾" : "▸"}</span>
        {t("manifest.actions.expand", { n: row.doc.slots })}
      </button>
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {vm.groups.map((grp) => {
        const name = groupTitle(grp, X);
        const run = grp.run;
        const over = run !== null && run.vehicleSeats !== null && grp.people > run.vehicleSeats;
        return (
          <section key={grp.key} data-testid={`trips-mf-group-${grp.key}`} data-group-kind={grp.kind} className="flex min-w-0 flex-col gap-2 border-t-2 border-[color:var(--color-ink)] pt-3">
            <header className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="min-w-0 text-base font-bold text-[color:var(--color-ink)] [overflow-wrap:anywhere]">
                {name} · {t("manifest.group.people", { n: grp.people })}
              </h2>
              {run && run.route.length > 0 ? <span className="min-w-0 text-sm text-[color:var(--color-ink-soft)] [overflow-wrap:anywhere]">{t("manifest.group.route", { route: run.route.join(" → ") })}</span> : null}
              {run && run.vehicleSeats !== null ? (
                <span data-over={over ? "true" : undefined} className={`whitespace-nowrap text-sm tabular-nums ${over ? "font-bold text-[color:var(--color-danger)]" : "text-[color:var(--color-ink-soft)]"}`}>
                  {over ? <span aria-hidden="true">⚠ </span> : null}
                  {t("manifest.group.seats", { used: grp.people, seats: run.vehicleSeats })}
                  {over ? ` · ${t("manifest.group.over")}` : ""}
                </span>
              ) : null}
            </header>

            {/* ── จอกว้าง: ตาราง 7 คอลัมน์ 72 + 176 + 200 + 104 + 176 + 168 + 120 = 1,016 ── */}
            <div data-testid="trips-mf-table" className="relative min-w-0 overflow-x-auto rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] max-md:hidden">
              <table aria-label={t("manifest.group.tableAria", { name })} className="w-full min-w-[1016px] border-collapse">
                <thead>
                  <tr className="border-b border-[color:var(--color-line)]">
                    <th scope="col" className={`${TH} min-w-[72px] pl-4`}>
                      {t("manifest.col.time")}
                    </th>
                    <th scope="col" className={`${TH} min-w-[176px]`}>
                      {t("manifest.col.place")}
                    </th>
                    <th scope="col" className={`${TH} min-w-[200px]`}>
                      {t("manifest.col.booker")}
                    </th>
                    <th scope="col" className={`${TH} min-w-[104px] text-right`}>
                      {t("manifest.col.people")}
                    </th>
                    <th scope="col" className={`${TH} min-w-[176px]`}>
                      {t("manifest.col.docs")}
                    </th>
                    <th scope="col" className={`${TH} min-w-[168px]`}>
                      {t("manifest.col.notes")}
                    </th>
                    <th scope="col" className={`${TH} min-w-[120px] pr-4`}>
                      {t("manifest.col.contact")}
                    </th>
                  </tr>
                </thead>
                {grp.rows.map((row) => (
                  <tbody key={row.bookingId} className="border-b border-[color:var(--color-line)] last:border-b-0">
                    <tr data-testid={`trips-mf-row-${row.bookingId}`} data-doc-state={row.doc.state}>
                      <td className={`${TD} whitespace-nowrap pl-4 font-bold tabular-nums`}>{row.pickup.time ?? "—"}</td>
                      <td className={TD}>
                        {place(row)}
                      </td>
                      <td className={TD}>
                        <div className="font-bold [overflow-wrap:anywhere]">{X.booker(row)}</div>
                        <div className="text-sm text-[color:var(--color-muted)] [overflow-wrap:anywhere]">
                          {code(row)} · {X.channel(row.channel)}
                        </div>
                      </td>
                      <td className={`${TD} text-right [overflow-wrap:anywhere]`}>{X.paxLine(row.pax)}</td>
                      <td className={TD}>
                        <div className="flex min-w-0 flex-col items-start gap-1">
                          <DocBadge doc={row.doc} X={X} />
                          <DocExtras doc={row.doc} X={X} />
                          {paxToggle(row)}
                        </div>
                      </td>
                      <td className={TD}>
                        {notes(row)}
                      </td>
                      <td className={`${TD} pr-4 [overflow-wrap:anywhere]`}>{X.contact(row)}</td>
                    </tr>
                    {open.includes(row.bookingId) ? (
                      <tr>
                        <td colSpan={7} className="bg-[color:var(--color-surface-2)] px-4 py-3">
                          <PaxList row={row} X={X} testid={`trips-mf-pax-${row.bookingId}`} />
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                ))}
              </table>
            </div>

            {/* ── มือถือ: การ์ดต่อการจอง (ไม่มีตาราง) ── */}
            <ul data-testid="trips-mf-cards" className="flex min-w-0 flex-col gap-2 md:hidden">
              {grp.rows.map((row) => (
                <li key={row.bookingId} data-testid={`trips-mf-card-${row.bookingId}`} data-doc-state={row.doc.state} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-4 text-sm text-[color:var(--color-ink)]">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <b className="whitespace-nowrap tabular-nums">{row.pickup.time ?? "—"}</b>
                    <div className="min-w-0 flex-1">
                      {place(row)}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold [overflow-wrap:anywhere]">{X.booker(row)}</div>
                    <div className="text-[color:var(--color-muted)] [overflow-wrap:anywhere]">
                      {code(row)} · {X.channel(row.channel)}
                    </div>
                  </div>
                  <div className="[overflow-wrap:anywhere]">{X.paxLine(row.pax)}</div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <DocBadge doc={row.doc} X={X} />
                    <DocExtras doc={row.doc} X={X} />
                  </div>
                  {notes(row)}
                  <div className="[overflow-wrap:anywhere]">
                    {t("manifest.col.contact")}: {X.contact(row)}
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {paxToggle(row)}
                  </div>
                  {open.includes(row.bookingId) ? <PaxList row={row} X={X} testid={`trips-mf-pax-${row.bookingId}`} /> : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
