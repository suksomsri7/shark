// SVC D.5 ▸ จอ หอ 02 "ผู้เช่าและสัญญา" — ภาพ ledger/design-dorm/02-tenants.png (รายการซ้าย + แผงขวา + แท็บบน)
//   • ข้อมูลทั้งหมดมาจากผู้เรียก (listLeases · getLease ของ facade หอ) — ไฟล์นี้ import จากโมดูลได้เฉพาะ type
//     (ไม่ลาก prisma/โมดูลฝั่ง server/actions/next navigation) ⇒ render ด้วย renderToStaticMarkup ได้ · ไม่มี hook
//   • ไม่แสดงเบอร์เต็ม/เลขบัตร (X8) — เบอร์ที่มาจาก facade ปิดเหลือ 4 ตัวท้ายแล้ว
//   • ไม่มีปุ่ม/ถ้อยคำบังคับผู้เช่าใด ๆ (ข้อห้ามตามประกาศ สคบ.) · ต่อสัญญา/ย้ายห้อง/แจ้งย้ายออก = ใบ D.12 (ปุ่มปิดไว้)
//   • เดสก์ท็อป 1440 = รายการ + แผงขวา · มือถือ 390 = ซ้อนลง ไม่ล้นแนวนอน (ตารางเลื่อนในกรอบตัวเอง)
import type { LeaseDetail, LeaseList, LeaseRow, LeaseTab } from "@/lib/modules/dorm";

export type TenantsScreenProps = {
  unitSlug: string;
  tab: LeaseTab;
  q?: string | null;
  list: LeaseList;
  selected: LeaseDetail | null;
};

const TABS: { key: LeaseTab; label: string }[] = [
  { key: "CURRENT", label: "ผู้เช่าปัจจุบัน" },
  { key: "BOOKED", label: "จอง/รอเข้า" },
  { key: "EXPIRING", label: "สัญญาใกล้หมด" },
  { key: "NOTICE", label: "แจ้งย้ายออก" },
  { key: "ENDED", label: "ย้ายออกแล้ว" },
];
const STATUS_TH: Record<string, string> = { DRAFT: "จอง/รอเข้า", ACTIVE: "มีผู้เช่า", NOTICE: "แจ้งย้ายออก", ENDED: "ย้ายออกแล้ว", CANCELLED: "ยกเลิก" };
const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** "2026-05-01" ⇒ "1 พ.ค. 69" (พ.ศ. 2 หลัก · อ่านจากข้อความ ไม่ผ่าน Date) */
function thShort(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd || "—";
  return `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1] ?? ""} ${String((Number(m[1]) + 543) % 100).padStart(2, "0")}`;
}
/** สตางค์ ⇒ "฿4,500" (ทศนิยมเฉพาะเมื่อมีสตางค์) */
function baht(satang: number): string {
  const neg = satang < 0;
  const a = Math.abs(Math.trunc(satang));
  const st = a % 100;
  return `${neg ? "-" : ""}฿${Math.floor(a / 100).toLocaleString("en-US")}${st ? `.${String(st).padStart(2, "0")}` : ""}`;
}
const range = (s: string, e: string) => `${thShort(s)} – ${thShort(e)}`;
const snapValue = (snap: unknown, key: string): unknown => {
  if (!snap || typeof snap !== "object") return undefined;
  const v = (snap as { values?: unknown }).values;
  return v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined;
};

function rowNote(r: LeaseRow): string {
  if (r.status === "DRAFT") return `จอง · เข้า ${thShort(r.startDate)}`;
  return `พัก ${r.occupantCount} คน`;
}
function termNote(r: LeaseRow): string {
  if (r.status === "ACTIVE" && r.daysToEnd >= 0 && r.daysToEnd <= 60) return `ใกล้หมด ${r.daysToEnd} วัน`;
  return `${r.months} เดือน`;
}

export default function TenantsScreen({ unitSlug, tab, q, list, selected }: TenantsScreenProps) {
  const base = `/app/u/${unitSlug}/dorm/tenants`;
  const qs = (t: LeaseTab, extra?: Record<string, string>) => {
    const p = new URLSearchParams({ tab: t, ...(q ? { q } : {}), ...(extra ?? {}) });
    return `${base}?${p.toString()}`;
  };
  return (
    <div data-dorm-tenants className="flex w-full min-w-0 flex-col gap-4 lg:flex-row lg:items-start">
      {/* ── ซ้าย: หัว · ค้น · แท็บ · ตาราง ── */}
      <section className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">ผู้เช่าและสัญญา</h1>
          <div className="flex flex-wrap items-center gap-2">
            <form method="get" action={base} className="flex items-center gap-2" role="search">
              <input type="hidden" name="tab" value={tab} />
              <input
                type="search"
                name="q"
                defaultValue={q ?? ""}
                placeholder="ค้นชื่อ / ห้อง / เบอร์"
                aria-label="ค้นชื่อ / ห้อง / เบอร์"
                className="min-h-11 w-56 max-w-full rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 text-sm"
              />
            </form>
            <a href={`${base}/new`} className="inline-flex min-h-11 items-center rounded-xl bg-[color:var(--color-ink)] px-4 text-sm font-semibold text-[color:var(--color-surface)]">
              + ทำสัญญาใหม่
            </a>
          </div>
        </header>

        <nav aria-label="แท็บผู้เช่า" className="flex gap-1 overflow-x-auto border-b border-[color:var(--color-line)]">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <a
                key={t.key}
                data-lease-tab={t.key}
                href={qs(t.key)}
                aria-current={active ? "page" : undefined}
                className={`whitespace-nowrap px-3 py-3 text-sm ${active ? "border-b-2 border-[color:var(--color-ink)] font-semibold" : "text-[color:var(--color-muted)]"}`}
              >
                {t.label} <span className="text-xs text-[color:var(--color-muted)]">{list.counts[t.key]}</span>
              </a>
            );
          })}
        </nav>

        <div className="overflow-hidden rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-[color:var(--color-surface-2)] text-left text-xs text-[color:var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">ห้อง</th>
                  <th className="px-4 py-3 font-medium">ผู้เช่า</th>
                  <th className="px-4 py-3 font-medium">สัญญา</th>
                  <th className="px-4 py-3 text-right font-medium">ค่าห้อง</th>
                  <th className="px-4 py-3 text-right font-medium">เงินประกัน</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-[color:var(--color-muted)]">
                      {q ? "ไม่พบสัญญาที่ตรงกับคำค้น" : "ยังไม่มีสัญญาในแท็บนี้"}
                    </td>
                  </tr>
                ) : (
                  list.rows.map((r) => {
                    const sel = selected?.leaseId === r.leaseId;
                    return (
                      <tr
                        key={r.leaseId}
                        data-lease-row={r.leaseId}
                        data-room-number={r.roomNumber}
                        data-status={r.status}
                        data-selected={sel ? "true" : undefined}
                        className={`border-t border-[color:var(--color-line)] ${sel ? "bg-[color:var(--color-accent-soft)] shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}
                      >
                        <td className="px-4 py-3 align-top">
                          <a href={qs(tab, { lease: r.leaseId })} className="font-semibold">
                            {r.roomNumber}
                          </a>
                          {r.roomTypeName ? <div className="text-xs text-[color:var(--color-muted)]">{r.roomTypeName}</div> : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <a href={qs(tab, { lease: r.leaseId })} className="font-semibold">
                            {r.tenantName}
                          </a>
                          <div className="text-xs text-[color:var(--color-muted)]">{rowNote(r)}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div>{r.status === "DRAFT" ? `ร่าง · ${range(r.startDate, r.endDate)}` : range(r.startDate, r.endDate)}</div>
                          <div className="text-xs text-[color:var(--color-muted)]">{termNote(r)}</div>
                        </td>
                        <td className="px-4 py-3 text-right align-top">{baht(r.rentSatang)}</td>
                        <td className="px-4 py-3 text-right align-top">
                          <div>{baht(r.depositSatang)}</div>
                          {r.status === "DRAFT" && r.heldSatang > 0 ? <div className="text-xs text-[color:var(--color-muted)]">{`รับแล้ว ${baht(r.heldSatang)}`}</div> : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[color:var(--color-line)] px-4 py-3 text-xs text-[color:var(--color-muted)]">
            <span>{`${list.rows.length} สัญญาในแท็บนี้`}</span>
            <span>·</span>
            <span>เงินประกันที่ถือไว้ทั้งตึก</span>
            <strong className="text-sm text-[color:var(--color-ink)]">{baht(list.heldTotalSatang)}</strong>
          </footer>
        </div>
      </section>

      {/* ── ขวา: แผงสัญญาที่เลือก ── */}
      {selected ? <LeasePanel lease={selected} base={base} /> : null}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-[color:var(--color-muted)]">{label}</span>
      <span className={strong ? "text-right font-semibold" : "text-right"}>{value}</span>
    </div>
  );
}

function LeasePanel({ lease, base }: { lease: LeaseDetail; base: string }) {
  const dueDay = snapValue(lease.policySnapshot, "rooms.billing.dueDay");
  const latest = lease.receipts.length ? lease.receipts[lease.receipts.length - 1] : null;
  const legalBadge =
    lease.legal.level === "WARN"
      ? lease.legal.approvalStatus === "PENDING"
        ? "รออนุมัติ · ข้ามคำเตือนกฎหมาย"
        : lease.legal.approvalStatus === "REJECTED" || lease.legal.approvalStatus === "CANCELLED"
          ? "ไม่อนุมัติ · ข้ามคำเตือนกฎหมาย"
          : "ข้ามคำเตือนกฎหมาย"
      : null;
  return (
    <aside data-lease-panel={lease.leaseId} className="flex w-full min-w-0 flex-col gap-5 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5 lg:w-[400px] lg:shrink-0">
      <header className="flex flex-col gap-2">
        <p className="text-xs text-[color:var(--color-muted)]">{`ห้อง ${lease.roomNumber}${lease.roomTypeName ? ` · ${lease.roomTypeName}` : ""}`}</p>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold">{lease.tenantName}</h2>
          <span className="rounded-lg border border-[color:var(--color-ink)] px-2 py-0.5 text-xs font-semibold">{STATUS_TH[lease.status] ?? lease.status}</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {lease.phoneMasked ? <span className="rounded-lg border border-[color:var(--color-line)] px-2 py-1">{`โทร ${lease.phoneMasked}`}</span> : null}
          <span className="rounded-lg border border-[color:var(--color-line)] px-2 py-1">{`พัก ${1 + lease.occupants.length} คน`}</span>
          {legalBadge ? <span className="rounded-lg border border-[color:var(--color-note-line)] bg-[color:var(--color-note)] px-2 py-1 text-[color:var(--color-note-ink)]">{legalBadge}</span> : null}
        </div>
      </header>

      <section className="flex flex-col">
        <h3 className="mb-1 text-sm font-semibold">สัญญาเช่า</h3>
        <Line label="ระยะ" value={`${range(lease.startDate, lease.endDate)} (${lease.months} เดือน)`} strong />
        <Line label="ค่าห้อง / เดือน" value={baht(lease.rentSatang)} strong />
        <Line label="ส่วนกลาง" value={baht(lease.commonFeeSatang)} />
        {lease.advanceRentSatang > 0 ? <Line label="ค่าเช่าล่วงหน้า" value={baht(lease.advanceRentSatang)} /> : null}
        <Line label="ครบกำหนดจ่าย" value={typeof dueDay === "number" ? `ทุกวันที่ ${dueDay}` : "—"} strong />
      </section>

      <section className="flex flex-col">
        <h3 className="mb-1 text-sm font-semibold">เงินประกัน</h3>
        <Line label={`ถือไว้ (ตามสัญญา ${baht(lease.depositSatang)})`} value={baht(lease.heldSatang)} strong />
        {lease.bookingFeeSatang > 0 ? <Line label="เงินจอง (หักเข้าประกัน)" value={baht(lease.bookingFeeSatang)} /> : null}
        {latest ? <Line label="รับเมื่อ" value={`${thShort(latest.date)} · ใบรับเงินประกัน ${lease.receipts.map((r) => r.entryNo).join(", ")}`} strong /> : <Line label="รับเมื่อ" value="ยังไม่ได้รับ" />}
        <p className="mt-1 text-xs text-[color:var(--color-muted)]">บัญชี: หนี้สิน &quot;เงินประกันผู้เช่า&quot; — ไม่ใช่รายได้ จนกว่าจะหัก/คืนตอนย้ายออก</p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">เอกสาร · ตอนเข้า</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-lg border border-[color:var(--color-line)] px-2 py-1">{lease.signedAt ? "สัญญาลงชื่อแล้ว" : "สัญญายังไม่ลงชื่อ"}</span>
          <span className="rounded-lg border border-[color:var(--color-line)] px-2 py-1">{lease.files.ID_CARD > 0 ? "สำเนาบัตร" : "ยังไม่มีสำเนาบัตร"}</span>
          <span className="rounded-lg border border-[color:var(--color-line)] px-2 py-1">{`รูปห้องวันเข้า ${lease.files.ROOM_PHOTO} รูป`}</span>
          {lease.files.DOCUMENT > 0 ? <span className="rounded-lg border border-[color:var(--color-line)] px-2 py-1">{`เอกสารอื่น ${lease.files.DOCUMENT} ไฟล์`}</span> : null}
        </div>
        <a href={`${base}/${lease.leaseId}/print`} className="text-xs text-[color:var(--color-accent)] underline">
          เปิดสัญญาสำหรับพิมพ์
        </a>
      </section>

      {lease.legalBlocked ? (
        <div className="rounded-2xl border border-[color:var(--color-danger)] p-4 text-xs leading-relaxed text-[color:var(--color-danger)]">
          ข้อความสัญญานี้ไม่ผ่านการตรวจตามประกาศ สคบ. — ระบบไม่แสดง/ไม่ให้พิมพ์หรือลงชื่อ ยกเลิกแล้วทำสัญญาใหม่หลังแก้แม่แบบ
        </div>
      ) : (
      <div className="rounded-2xl border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] p-4 text-xs leading-relaxed">
        ✓ สัญญาสร้างจากแม่แบบตาม <strong>ประกาศ สคบ.</strong> ธุรกิจให้เช่าอาคารเพื่ออยู่อาศัยเป็นธุรกิจที่ควบคุมสัญญา — มีข้อบังคับครบ 7 ข้อ และไม่มีข้อความต้องห้ามในแม่แบบ
      </div>
      )}

      <footer className="flex flex-wrap gap-2">
        <button type="button" disabled className="min-h-11 flex-1 rounded-xl border border-[color:var(--color-line)] px-3 text-sm" title="เร็ว ๆ นี้">
          ต่อสัญญา
        </button>
        <button type="button" disabled className="min-h-11 flex-1 rounded-xl border border-[color:var(--color-line)] px-3 text-sm" title="เร็ว ๆ นี้">
          ย้ายห้อง
        </button>
        <button type="button" disabled className="min-h-11 flex-1 rounded-xl bg-[color:var(--color-ink)] px-3 text-sm font-semibold text-[color:var(--color-surface)] opacity-60" title="เร็ว ๆ นี้">
          แจ้งย้ายออก
        </button>
      </footer>
    </aside>
  );
}
