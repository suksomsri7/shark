// HR H2.11 ▸ ส่วนหน้าจอฝั่ง server ของ "ภาพรวมทีม" (ภาพ 01) และ "คำขอรออนุมัติ" (ภาพ 05) — รับ DTO จาก inbox.ts เท่านั้น (ไม่อ่านฐานข้อมูลเอง) ·
//   ค่าทุกตัวมีป้ายกำกับ · วันที่ พ.ศ. ผ่าน helper กลาง · ปุ่ม/ลิงก์สูง ≥ 44 px · ตารางโควตาเลื่อนในกรอบของตัวเอง (ชื่อค้างซ้าย) ◂
import Link from "next/link";
import type { ReactNode } from "react"; // HR H4.2 ◂
import { getLocale, getTranslations } from "next-intl/server"; // HR VIS-5b ▸ + getLocale ◂
import { formatShortDate, formatThaiTime } from "@/lib/ui/date"; // HR VIS-5b ▸ formatThaiDate → formatShortDate (วันตามภาษา) · + formatThaiTime ◂
import InboxBatch from "./InboxBatch";
import { INBOX_CAP, INBOX_TYPES, type InboxList, type InboxType } from "./inbox-shared";
import type { TeamLeaveQuota, TeamOverview } from "./inbox";
import type { HubBoardFacts, HubKpis } from "./hub-rules"; // HR VIS-5b ◂

const muted = "text-[color:var(--color-muted)]";
const chip = "inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm";
const chipOn = "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]";

// HR VIS-5b ▸ ช่องตัวเลขแบบภาพ 01 (ตัวเลขใหญ่เป็นโหนดของตัวเอง · สีอันตรายเมื่อมีสาย/ยังไม่มา) ◂
function Tile({ testId, label, value, sub, href, danger, wide }: { testId: string; label: string; value: string; sub?: string; href?: string; danger?: boolean; wide?: boolean }) { // HR VIS-5b ▸ + danger · wide ◂
  const body = (
    <>
      <span className={`text-xs ${muted}`}>{label}</span>
      {/* HR VIS-5b ▸ ตัวเลขใหญ่ขึ้น · สีอันตรายเมื่อมีสาย/ยังไม่มา · บรรทัดรองไม่เกิน 2 บรรทัด ◂ */}
      <span className={`text-3xl font-semibold tabular-nums ${danger ? "text-[color:var(--color-danger)]" : ""}`}>{value}</span>
      {sub && <span className={`line-clamp-2 text-xs ${muted}`}>{sub}</span>}
    </>
  );
  const cls = `card flex min-h-[44px] min-w-0 flex-col gap-1 p-4 ${wide ? "col-span-2 md:col-span-1" : ""}`; // HR VIS-5b ◂
  return href ? (
    <Link href={href} data-testid={testId} className={`${cls} transition-colors hover:bg-[color:var(--color-surface-2)]` /* HR VIS-5b ◂ */}>
      {body}
    </Link>
  ) : (
    <div data-testid={testId} className={cls /* HR VIS-5b ◂ */}>
      {body}
    </div>
  );
}
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; // HR VIS-5b ◂
// HR VIS-5b r2 (F2) ▸ สองคอลัมน์ไหลอิสระ (≥ xl): ซ้าย = บอร์ด → ค่าแรง → ใกล้ครบกำหนด · ขวา = คำขอ → เดือน ·
//   จอแคบ (คอลัมน์เป็น display:contents) เรียงตาม order: บอร์ด → คำขอ → ค่าแรง → เดือน → ใกล้ครบกำหนด ◂
const ORDER = ["order-1", "order-2", "order-3", "order-4", "order-5"] as const;

/** ภาพรวมทีม (ภาพ 01) — ตัวอ่านเดิมทั้งหมด (บอร์ดวันนี้ · ตัวนับคำขอ · วันที่ต้องคิดผลใหม่ · ใกล้ครบกำหนด) + ตัวอย่างคำขอ 5 รายการ */
// HR H3.9 ▸ reports = ลิงก์ "รายงาน" ของการ์ดเดือน (ภาพ 01) — ส่งมาเฉพาะผู้ดูที่เปิดรายงานได้ (ui.tsx ตัดสินด้วย reportAccessOf) ◂
// HR H4.2 ▸ labor = การ์ดค่าแรงต่อยอดขาย (labor-ui HrLaborCard) ที่ผู้เรียกส่งมาเป็น slot — ไฟล์นี้ไม่ import โมดูลค่าแรงเอง (facade-only ของ H2.11) ◂
// HR VIS-5b ▸ โครงสองคอลัมน์ของภาพ 01: kpis (hub-rules · คิดใน HrHub) · facts (บรรทัดรองของช่อง) · header/board/month/due = slot จาก hub-ui ·
//   ไฟล์นี้วาดกรอบ + หัวการ์ด (testid เดิม hr-overview-*) เท่านั้น — ไม่โหลดข้อมูลเอง ◂
export async function HrTeamOverviewSection({ systemId, overview, preview, reports, labor, kpis, facts, header, board, month, due }: { systemId: string; overview: TeamOverview; preview: InboxList | null; reports?: { label: string; desc: string } | null; labor?: ReactNode; kpis?: HubKpis | null; facts?: HubBoardFacts | null; header?: ReactNode; board?: ReactNode; month?: ReactNode; due?: ReactNode }) { // HR H4.2 ▸ + labor ◂ · HR VIS-5b ▸ + kpis · facts · header · board · month · due ◂
  const t = await getTranslations("hr.inbox");
  const th = await getTranslations("hr.hub"); // HR VIS-5b ◂ (บรรทัดนับ counts/shown ของช่องเดิมถูกแทนด้วย kpis) ◂
  const ta = await getTranslations("hr.attendance"); // HR VIS-5b ▸ ป้ายสถานะเดิม (สาย · ยังไม่มา · ลา · หยุด) ◂
  const locale = await getLocale(); // HR VIS-5b ◂
  const s = `/app/sys/${systemId}`;
  const b = overview.board;
  // HR VIS-5b ▸ ตัวนับสถานะแบบช่อง (counts) ไม่ใช้แล้ว — ช่องตัวเลขนับเป็นคนจาก kpisOf (ส่งมาจาก HrHub) ◂
  const cap = (n: number, trunc: boolean) => (trunc ? t("capPlus", { n: String(n) }) : String(n));
  const trunc = !!preview?.truncated.length;
  const isToday = !!b && b.day === b.todayKey;
  const head = "flex flex-wrap items-center gap-x-3 gap-y-1"; // HR VIS-5b ◂
  const link = "inline-flex min-h-[44px] items-center text-sm font-medium text-[color:var(--color-accent)]";
  const boardCard = b && board && (
    <section data-testid="hr-hub-board" className="card flex min-w-0 flex-col gap-3 p-4 md:p-5">
      <div className={head}>
        <h2 className="text-base font-semibold">{isToday ? th("board.title") : th("board.titleOn", { date: formatShortDate(new Date(`${b.day}T00:00:00+07:00`), locale) })}</h2>
        <span className={`text-xs ${muted}`}>{th("board.sub")}</span>
        {overview.needsRecompute !== null && overview.needsRecompute > 0 && (
          <Link href={`${s}/hr/attendance`} data-testid="hr-overview-recompute" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-[color:var(--color-danger)] px-3 text-xs font-medium text-[color:var(--color-danger)]">
            {t("overview.recompute")} <span className="tabular-nums">{overview.needsRecompute}</span>
          </Link>
        )}
        <Link href={`${s}/hr/attendance`} className={`${link} ml-auto`}>
          {t("overview.openAttendance")}
        </Link>
      </div>
      {board}
    </section>
  );
  const inboxCard = overview.inbox && (
    <section className="card flex min-w-0 flex-col gap-3 p-4 md:p-5">
      <div className={head}>
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <span className="rounded-full bg-[color:var(--color-ink)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[color:var(--color-surface)]">{cap(overview.inbox.total, trunc)}</span>
        {overview.inbox.decidable < overview.inbox.total && <span className={`text-xs ${muted}`}>{t("overview.inboxDecidable", { n: cap(overview.inbox.decidable, trunc) })}</span>}
        <Link href={`${s}/hr/requests`} data-testid="hr-overview-inbox" className={`${link} ml-auto`}>
          {t("viewAll")}
        </Link>
      </div>
      {preview && preview.items.length > 0 ? <InboxBatch systemId={systemId} items={preview.items} selectable /> : <p className={`text-sm ${muted}`}>{t("empty")}</p>}
    </section>
  );
  const monthCard = month && (
    <section data-testid="hr-hub-month" className="card flex min-w-0 flex-col gap-3 p-4 md:p-5">
      <div className={head}>
        <h2 className="text-base font-semibold">{th("month.title")}</h2>
        {reports && (
          <Link href={`${s}/hr/reports`} data-testid="hr-overview-reports-link" className={`${link} ml-auto`}>
            {reports.label}
          </Link>
        )}
      </div>
      {month}
    </section>
  );
  const dueCard = due && overview.lifecycleDue !== null && (
    <section data-testid="hr-hub-due" className="card flex min-w-0 flex-col gap-3 p-4 md:p-5">
      <div className={head}>
        <h2 className="text-base font-semibold">{t("overview.due")}</h2>
        <span className={`text-xs ${muted}`}>{th("due.sub")}</span>
        <Link href={`${s}/hr/employees`} data-testid="hr-overview-due" className={`${link} ml-auto`}>
          {t("overview.openEmployees")} <span className="ml-1 tabular-nums">({overview.lifecycleDue})</span>
        </Link>
      </div>
      {due /* HR VIS-5b ◂ */}
    </section>
  );
  const pick = (xs: [ReactNode, number][]) => xs.filter(([n]) => !!n);
  const left = pick([[boardCard, 0], [labor, 2], [dueCard, 4]]);
  const right = pick([[inboxCard, 1], [monthCard, 3]]);
  const two = left.length > 0 && right.length > 0;
  const col = (xs: [ReactNode, number][]) => xs.map(([n, o]) => (
    <div key={o} className={`flex min-w-0 flex-col ${ORDER[o]}`}>
      {n}
    </div>
  ));
  const kpiSub = (xs: string[]) => xs.filter(Boolean).join(" · ");
  return (
    <section data-testid="hr-overview" className="flex flex-col gap-4">
      {header /* HR VIS-5b ▸ หัว: ชื่อ · สาขา · วัน · จัดกะ · + พนักงาน ◂ */}
      {b && kpis && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile
            testId="hr-overview-today"
            label={t("overview.onShift") /* HR VIS-5b ▸ อยู่กะ = คน (ไม่ใช่จำนวนแถวของบอร์ด) ◂ */}
            value={String(kpis.onShift)}
            sub={kpis.onShift === 0 ? th("noShift") : kpiSub([th("kpi.ofPeople", { n: kpis.people }), kpis.leave ? `${ta("count.LEAVE")} ${kpis.leave}` : "", kpis.dayOff ? `${ta("count.DAY_OFF")} ${kpis.dayOff}` : ""])}
            href={`${s}/hr/attendance`}
          />
          {/* HR VIS-5b ▸ อีก 4 ช่องของภาพ 01 ◂ */}
          <Tile testId="hr-hub-kpi-arrived" label={th("arrived")} value={String(kpis.arrived)} sub={kpiSub((facts?.arrivedByShift ?? []).map((x) => `${x.name} ${x.n}`))} />
          <Tile testId="hr-hub-kpi-late" label={ta("count.LATE")} value={String(kpis.late)} danger={kpis.late > 0} sub={kpiSub((facts?.lateWho ?? []).map((x) => th("kpi.lateWho", { name: x.name, n: x.lateMin, time: x.inAt ? formatThaiTime(x.inAt) : "—" })))} />
          <Tile testId="hr-hub-kpi-notin" label={ta("count.PENDING")} value={String(kpis.notIn)} danger={kpis.notIn > 0} sub={kpiSub((facts?.notInWho ?? []).map((x) => (x.startMin === null ? x.name : th("kpi.notInWho", { name: x.name, start: hhmm(x.startMin) }))))} />
          <Tile testId="hr-hub-kpi-leave" label={ta("count.LEAVE")} value={String(kpis.leave)} wide sub={kpiSub((facts?.leaveWho ?? []).map((x) => (x.label ? `${x.name} ${x.label}` : x.name)))} />
        </div>
      )}
      {left.length + right.length > 0 && (
        <div className={two ? "flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start" : "flex flex-col gap-4"}>
          <div className={two ? "contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4" : "contents"}>{col(left)}</div>
          <div className={two ? "contents xl:flex xl:min-w-0 xl:flex-col xl:gap-4" : "contents"}>{col(right)}</div>
        </div>
      )}
    </section>
  );
}

export type RequestsFilter = { type: InboxType | null; unitId: string | null; minAgeDays: number; cursor: string | null };
/** หน้าคำขอรออนุมัติ (ภาพ 05) — ตัวกรอง · ตัวนับ · การ์ด + แถบเลือก (InboxBatch) · ตารางโควตาของทีม */
export async function HrRequestsView({
  systemId,
  list,
  quota,
  units,
  filter,
  focus,
}: {
  systemId: string;
  list: InboxList;
  quota: TeamLeaveQuota | null;
  units: { id: string; name: string }[];
  filter: RequestsFilter;
  focus: string | null;
}) {
  const t = await getTranslations("hr.inbox");
  const base = `/app/sys/${systemId}/hr/requests`;
  const href = (p: Partial<RequestsFilter>) => {
    const f = { ...filter, cursor: null, ...p };
    const q = [f.type ? `type=${f.type}` : "", f.unitId ? `unit=${encodeURIComponent(f.unitId)}` : "", f.minAgeDays ? `age=${f.minAgeDays}` : "", f.cursor ? `cursor=${encodeURIComponent(f.cursor)}` : ""].filter(Boolean).join("&");
    return q ? `${base}?${q}` : base;
  };
  const truncated = new Set(list.truncated);
  const n = (k: InboxType) => (truncated.has(k) ? t("capPlus", { n: String(INBOX_CAP) }) : String(list.counts[k]));
  const filtered = !!(filter.type || filter.unitId || filter.minAgeDays);
  return (
    <div data-testid="hr-inbox" className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <nav data-testid="hr-inbox-filter-type" aria-label={t("filter.type")} className="flex gap-2 overflow-x-auto pb-1">
          <Link href={href({ type: null })} data-testid="hr-inbox-count-all" className={`${chip} ${filter.type ? "" : chipOn}`}>
            {t("type.all")} <span className="tabular-nums">{truncated.size ? t("capPlus", { n: String(list.counts.total) }) : list.counts.total}</span>
          </Link>
          {INBOX_TYPES.map((k) => (
            <Link key={k} href={href({ type: k })} data-testid={`hr-inbox-count-${k}`} className={`${chip} ${filter.type === k ? chipOn : ""}`}>
              {t(`type.${k}`)} <span className="tabular-nums">{n(k)}</span>
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap gap-4">
          {units.length > 1 && (
            <nav data-testid="hr-inbox-filter-unit" aria-label={t("filter.unit")} className="flex max-w-full flex-col gap-1">
              <span className={`text-xs ${muted}`}>{t("filter.unit")}</span>
              <div className="flex gap-2 overflow-x-auto pb-1">
                <Link href={href({ unitId: null })} className={`${chip} ${filter.unitId ? "" : chipOn}`}>
                  {t("filter.unitAll")}
                </Link>
                {units.map((u) => (
                  <Link key={u.id} href={href({ unitId: u.id })} className={`${chip} ${filter.unitId === u.id ? chipOn : ""}`}>
                    {u.name}
                  </Link>
                ))}
              </div>
            </nav>
          )}
          <nav data-testid="hr-inbox-filter-age" aria-label={t("filter.age")} className="flex max-w-full flex-col gap-1">
            <span className={`text-xs ${muted}`}>{t("filter.age")}</span>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {([0, 3, 7] as const).map((a) => (
                <Link key={a} href={href({ minAgeDays: a })} className={`${chip} ${filter.minAgeDays === a ? chipOn : ""}`}>
                  {a === 0 ? t("filter.ageAll") : a === 3 ? t("filter.age3") : t("filter.age7")}
                </Link>
              ))}
            </div>
          </nav>
        </div>
        {truncated.size > 0 && (
          <p role="status" className="rounded-lg border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] px-3 py-2 text-sm">
            {t("truncated")}
          </p>
        )}
        {list.items.length === 0 ? (
          <p className={`card p-6 text-center text-sm ${muted}`}>{filtered ? t("emptyFiltered") : t("empty")}</p>
        ) : (
          <InboxBatch systemId={systemId} items={list.items} focus={focus} />
        )}
        <div className="flex flex-wrap gap-2">
          {filter.cursor && (
            <Link href={href({ cursor: null })} className="btn btn-ghost min-h-[44px] text-sm">
              {t("first")}
            </Link>
          )}
          {list.nextCursor && (
            <Link href={href({ cursor: list.nextCursor })} data-testid="hr-inbox-more" className="btn btn-ghost min-h-[44px] text-sm">
              {t("more")}
            </Link>
          )}
        </div>
      </div>
      {quota && (
        <aside data-testid="hr-inbox-quota" className="card flex min-w-0 flex-col gap-3 self-start p-4">
          <h2 className="text-sm font-medium">{t("quota.title", { year: String(quota.year + 543) })}</h2>
          {quota.policies.length === 0 || quota.rows.length === 0 ? (
            <p className={`text-sm ${muted}`}>{t("quota.empty")}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[320px] border-collapse text-sm">
                  <thead>
                    <tr className={`text-xs ${muted}`}>
                      <th scope="col" className="sticky left-0 bg-[color:var(--color-surface)] px-2 py-2 text-left font-medium">
                        {t("quota.name")}
                      </th>
                      {quota.policies.map((p) => (
                        <th key={p.id} scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">
                          {p.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quota.rows.map((r) => (
                      <tr key={r.employeeId} className="border-t">
                        <th scope="row" className="sticky left-0 bg-[color:var(--color-surface)] px-2 py-2 text-left font-medium">
                          {r.name}
                        </th>
                        {quota.policies.map((p) => {
                          const c = r.cells.find((x) => x.policyId === p.id);
                          return (
                            <td key={p.id} className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                              {c ? (
                                <span className="flex flex-col items-end">
                                  <span>{t("quota.usedOf", { used: c.used })}</span>
                                  <span className={`text-xs ${muted}`}>
                                    {c.available === null ? t("impact.unlimited") : t("quota.left", { n: c.available })}
                                    {Number(c.pending) > 0 ? ` · ${t("quota.pendingN", { n: c.pending })}` : ""}
                                  </span>
                                </span>
                              ) : (
                                <span className={muted}>{t("f.none")}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {quota.policies.length > 2 && <p className={`text-xs ${muted}`}>{t("quota.scrollHint")}</p>}
            </>
          )}
        </aside>
      )}
    </div>
  );
}
// ◂ HR H2.11
