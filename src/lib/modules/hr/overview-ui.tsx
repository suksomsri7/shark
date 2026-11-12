// HR H2.11 ▸ ส่วนหน้าจอฝั่ง server ของ "ภาพรวมทีม" (ภาพ 01) และ "คำขอรออนุมัติ" (ภาพ 05) — รับ DTO จาก inbox.ts เท่านั้น (ไม่อ่านฐานข้อมูลเอง) ·
//   ค่าทุกตัวมีป้ายกำกับ · วันที่ พ.ศ. ผ่าน helper กลาง · ปุ่ม/ลิงก์สูง ≥ 44 px · ตารางโควตาเลื่อนในกรอบของตัวเอง (ชื่อค้างซ้าย) ◂
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatThaiDate } from "@/lib/ui/date";
import InboxBatch from "./InboxBatch";
import { INBOX_CAP, INBOX_TYPES, type InboxList, type InboxType } from "./inbox-shared";
import type { TeamLeaveQuota, TeamOverview } from "./inbox";

const muted = "text-[color:var(--color-muted)]";
const chip = "inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm";
const chipOn = "border-[color:var(--color-ink)] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]";

function Tile({ testid, label, value, sub, href }: { testid: string; label: string; value: string; sub?: string; href?: string }) {
  const body = (
    <>
      <span className={`text-xs ${muted}`}>{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      {sub && <span className={`text-xs ${muted}`}>{sub}</span>}
    </>
  );
  return href ? (
    <Link href={href} data-testid={testid} className="card flex min-h-[44px] flex-col gap-1 p-3 transition-colors hover:bg-[color:var(--color-surface-2)]">
      {body}
    </Link>
  ) : (
    <div data-testid={testid} className="card flex flex-col gap-1 p-3">
      {body}
    </div>
  );
}

/** ภาพรวมทีม (ภาพ 01) — ตัวอ่านเดิมทั้งหมด (บอร์ดวันนี้ · ตัวนับคำขอ · วันที่ต้องคิดผลใหม่ · ใกล้ครบกำหนด) + ตัวอย่างคำขอ 5 รายการ */
export async function HrTeamOverviewSection({ systemId, overview, preview }: { systemId: string; overview: TeamOverview; preview: InboxList | null }) {
  const t = await getTranslations("hr.inbox");
  const ta = await getTranslations("hr.attendance");
  const s = `/app/sys/${systemId}`;
  const b = overview.board;
  const counts = b?.totals.counts ?? {};
  const shown = (["ON_TIME", "LATE", "PENDING", "ABSENT", "LEAVE"] as const).filter((k) => (counts[k] ?? 0) > 0);
  const cap = (n: number, trunc: boolean) => (trunc ? t("capPlus", { n: String(n) }) : String(n));
  const trunc = !!preview?.truncated.length;
  return (
    <section data-testid="hr-overview" className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{t("overview.title")}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {b && (
          <Tile
            testid="hr-overview-today"
            label={`${t("overview.today")} · ${formatThaiDate(b.day)}`}
            value={String(b.rows.length)}
            sub={shown.length ? shown.map((k) => `${ta(`count.${k}`)} ${counts[k]}`).join(" · ") : t("overview.noBoard")}
            href={`${s}/hr/attendance`}
          />
        )}
        {overview.inbox && (
          <Tile
            testid="hr-overview-inbox"
            label={t("overview.inbox")}
            value={cap(overview.inbox.decidable, trunc)}
            sub={`${t("overview.inboxDecidable", { n: cap(overview.inbox.decidable, trunc) })} · ${t("overview.inboxTotal", { n: cap(overview.inbox.total, trunc) })}`}
            href={`${s}/hr/requests`}
          />
        )}
        {overview.needsRecompute !== null && <Tile testid="hr-overview-recompute" label={t("overview.recompute")} value={String(overview.needsRecompute)} href={`${s}/hr/attendance`} />}
        {overview.lifecycleDue !== null && <Tile testid="hr-overview-due" label={t("overview.due")} value={String(overview.lifecycleDue)} href={`${s}/hr/employees`} />}
      </div>
      {preview && preview.items.length > 0 && (
        <div className="card flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium">{t("title")}</h2>
            <Link href={`${s}/hr/requests`} className="inline-flex min-h-[44px] items-center text-sm text-[color:var(--color-accent)] underline">
              {t("viewAll")}
            </Link>
          </div>
          <InboxBatch systemId={systemId} items={preview.items} compact />
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
