import Link from "next/link";
import { requireBackoffice, logoutAction } from "@/lib/platform/actions";
import { listCasesForPlatform, caseTabCounts, CASE_TABS, type CaseTab } from "@/lib/platform/support";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatThaiDateTime } from "@/lib/ui/date";
import { STATUS_LABEL, SOURCE_LABEL, CATEGORY_LABEL, caseNoLabel, initialsOf } from "./labels";

// S2.16 (จอ H3) — รายการเรื่องแจ้งจากทุกร้าน: แท็บ ใหม่/รอร้าน/ของฉัน/ปิดแล้ว (+ทั้งหมด) · ตัวกรองช่องทาง + หมวด · ป้าย "!" เรื่องเงิน
const TAB_LABEL: Record<CaseTab | "all", string> = {
  new: "ใหม่",
  waiting_shop: "รอร้าน",
  mine: "ของฉัน",
  closed: "ปิดแล้ว",
  all: "ทั้งหมด",
};

const SOURCES = ["APP", "WEB", "AI"] as const;

type SP = { tab?: string; source?: string; category?: string };

function hrefOf(sp: { tab: string; source?: string; category?: string }): string {
  const q = new URLSearchParams();
  q.set("tab", sp.tab);
  if (sp.source) q.set("source", sp.source);
  if (sp.category) q.set("category", sp.category);
  return `/backoffice/cases?${q.toString()}`;
}

function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full border px-3 py-1 text-sm"
      style={
        active
          ? { background: "var(--color-ink)", color: "var(--color-surface)", borderColor: "var(--color-ink)" }
          : { color: "var(--color-muted)" }
      }
    >
      {children}
    </Link>
  );
}

export default async function CasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireBackoffice();
  const sp = await searchParams;
  const tab: CaseTab | "all" =
    sp.tab === "all" ? "all" : (CASE_TABS as readonly string[]).includes(String(sp.tab ?? "")) ? (sp.tab as CaseTab) : "new";
  const source = (SOURCES as readonly string[]).includes(String(sp.source ?? "")) ? sp.source : undefined;
  const category = String(sp.category ?? "") in CATEGORY_LABEL ? sp.category : undefined;

  const [cases, counts] = await Promise.all([
    listCasesForPlatform(me, { tab: tab === "all" ? undefined : tab, source, category }),
    caseTabCounts(me),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="เรื่องแจ้งจากผู้ใช้"
        back={{ href: "/backoffice", label: "ภาพรวมแพลตฟอร์ม" }}
        desc={`ทีม SHARK · ${cases.length.toLocaleString("th-TH")} เรื่องในมุมมองนี้`}
        actions={
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost text-sm">
              ออกจากระบบ
            </button>
          </form>
        }
      />

      <div className="flex flex-wrap gap-2" data-testid="case-tabs">
        {([...CASE_TABS, "all"] as const).map((t) => (
          <Pill key={t} href={hrefOf({ tab: t, source, category })} active={tab === t}>
            {TAB_LABEL[t]}
            {t !== "all" && counts[t] > 0 ? ` ${counts[t].toLocaleString("th-TH")}` : ""}
          </Pill>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" data-testid="case-source-filter">
        <Pill href={hrefOf({ tab, category })} active={!source}>
          ทุกช่องทาง
        </Pill>
        {SOURCES.map((s) => (
          <Pill key={s} href={hrefOf({ tab, source: s, category })} active={source === s}>
            {SOURCE_LABEL[s]}
          </Pill>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" data-testid="case-category-filter">
        <Pill href={hrefOf({ tab, source })} active={!category}>
          ทุกหมวด
        </Pill>
        {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
          <Pill key={k} href={hrefOf({ tab, source, category: k })} active={category === k}>
            {label}
          </Pill>
        ))}
      </div>

      {cases.length === 0 ? (
        <div className="card py-8 text-center text-sm text-[color:var(--color-muted)]">ไม่มีเรื่องในมุมมองนี้</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {cases.map((c) => {
            const meta = [
              c.tenantName,
              c.source ? (SOURCE_LABEL[c.source] ?? c.source) : null,
              c.category ? (CATEGORY_LABEL[c.category] ?? c.category) : null,
              c.roomId ? "มีห้องงานแนบ" : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={c.id}>
                <Link
                  href={`/backoffice/cases/${c.id}`}
                  className="card flex items-start gap-3 p-3 hover:bg-[color:var(--color-surface-2)]"
                  data-testid={`case-row-${c.id}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold">
                    {initialsOf(c.tenantName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{c.subject}</span>
                      <span className="text-xs text-[color:var(--color-muted)]">{caseNoLabel(c.caseNo)}</span>
                    </span>
                    <span className="block truncate text-xs text-[color:var(--color-muted)]">{meta}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-muted)]">
                      <StatusChip value={c.status} map={STATUS_LABEL} />
                      <span>{c.assigneeName ? `ผู้รับ: ${c.assigneeName}` : "ยังไม่มีผู้รับ"}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-xs text-[color:var(--color-muted)]">{formatThaiDateTime(c.updatedAt)}</span>
                    {c.urgent && (
                      <span
                        title="เรื่องเงิน — ตอบก่อน"
                        aria-label="ด่วน เรื่องเงิน"
                        className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
                        style={{ background: "var(--color-danger)", color: "var(--color-surface)" }}
                      >
                        !
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-center text-xs text-[color:var(--color-muted)]">
        ตัวเลขบนแท็บ = จำนวนเรื่อง · ป้าย ! = เรื่องเงินหรือบัญชี ตอบก่อน · กดเรื่องเพื่อเปิดห้องแชทกับผู้ใช้
      </p>
    </div>
  );
}
