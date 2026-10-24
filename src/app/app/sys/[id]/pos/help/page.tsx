// POS P6.2 ▸ คู่มือในแอป /pos/help (มติ 6 · CD-P62-O5/O6/O7) — หน้าเซิร์ฟเวอร์อ่านอย่างเดียวสำหรับเจ้าของร้านและแคชเชียร์
//   ด่านหน้าเดียว: requireTenant + appSystem.findFirst({ id, tenantId, type: "POS" }) + notFound (ไม่มี query อื่น) · ไม่มี action/form/handler
//   ข้อความทุกคำผ่าน pos.help.* (src/messages/{th,en}/pos.json) · ลิงก์ = แท็บ POS 8 แท็บ (POS_NAV_PATH) + หน้าที่เปิดจากแท็บนั้น — ทุกหน้ามีจริง
//   ใครอ่านได้: เจ้าของ/ผู้จัดการ · พนักงานที่ถือคีย์ pos.* อย่างน้อย 1 คีย์ (แบบ canReadInventory) — พนักงานที่ไม่มีสิทธิ์ POS = การ์ดปฏิเสธ (หน้า 200)
//   หน้านี้ไม่มีข้อมูลร้าน/สาขา — สิทธิ์ของงานจริงตัดสินที่หน้าปลายทางทุกหน้าเหมือนเดิม · ทางเข้า = ลิงก์ "คู่มือ" บนหัวหน้าตั้งค่า (pos-settings-help-link)
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { systemDef } from "@/lib/systems";
import { posTabs } from "@/lib/modules/pos/tabs";
import { posMembership } from "@/lib/modules/pos/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { ModuleTabs } from "@/components/module-tabs";

/** แท็บของหน้าร้าน (ลำดับ = แถบแท็บ) · more = หน้าที่เปิดจากแท็บนั้น · href ต่อท้าย /app/sys/<id>/pos/ */
type HelpLink = { key: string; href: string };
const TABS: readonly (HelpLink & { more: readonly HelpLink[] })[] = [
  { key: "register", href: "register", more: [{ key: "tables", href: "tables" }, { key: "orders", href: "orders" }, { key: "kds", href: "kds" }] },
  { key: "products", href: "products", more: [{ key: "promos", href: "products/price-rules" }] },
  { key: "stock", href: "stock", more: [] },
  { key: "sales", href: "sales", more: [] },
  { key: "shifts", href: "shifts", more: [] },
  { key: "close", href: "close", more: [] },
  { key: "reports", href: "reports", more: [] },
  { key: "settings", href: "settings", more: [] },
];
/** ขั้นแรกของร้านใหม่ · วันทำงานของแคชเชียร์ · คำถามที่พบบ่อย (คีย์ใต้ pos.help.*) */
const START_STEPS = ["s1", "s2", "s3", "s4", "s5"] as const;
const DAY_STEPS = ["d1", "d2", "d3", "d4", "d5", "d6"] as const;
const POINTS = ["p1", "p2", "p3"] as const;
const FAQ = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"] as const;

const CARD = "flex min-w-0 flex-col gap-3 rounded-[18px] border bg-[color:var(--color-surface)] px-5 py-5 md:px-7 md:py-6";
const H2 = "text-[17px] font-bold tracking-[-0.01em]";
const MUTED = "text-sm text-[color:var(--color-muted)]";

export default async function PosHelpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireTenant();
  const tenantId = auth.active.tenantId;
  const sys = await prisma.appSystem.findFirst({ where: { id, tenantId, type: "POS" } });
  if (!sys) notFound();
  const m = posMembership(auth.active);
  const canRead = m.role !== "STAFF" || Object.entries(m.permissions).some(([k, v]) => v === true && k.startsWith("pos."));
  const def = systemDef(sys.type);
  const t = await getTranslations("pos.help");
  const tPos = await getTranslations("pos");
  const base = `/app/sys/${id}/pos`;

  return (
    <div className="flex w-full min-w-0 max-w-7xl flex-col gap-5" data-testid="pos-help-page">
      <PageHeader title={`${def?.icon ?? ""} ${sys.name}`.trim()} desc={t("desc")} />
      <ModuleTabs items={posTabs(id, tPos)} data-testid="pos-help-module-tabs" />
      {!canRead ? (
        <div role="alert" className="card flex max-w-2xl flex-col gap-1 text-sm" data-testid="pos-help-refusal">
          <span className="font-medium">{t("refusal.title")}</span>
          <span className="text-[color:var(--color-muted)]">{t("refusal.body")}</span>
        </div>
      ) : (
        <>
          <section className={CARD} data-testid="pos-help-start">
            <h2 className={H2}>{t("start.title")}</h2>
            <p className={MUTED}>{t("start.intro")}</p>
            <ol className="flex flex-col gap-2">
              {START_STEPS.map((s, i) => (
                <li key={s} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-surface-2)] text-xs font-semibold">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{t(`start.${s}.title`)}</span>
                    <span className="block text-[color:var(--color-muted)]">{t(`start.${s}.body`)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="flex min-w-0 flex-col gap-3" data-testid="pos-help-tabs">
            <div className="flex flex-col gap-1">
              <h2 className={H2}>{t("tabsTitle")}</h2>
              <p className={MUTED}>{t("tabsIntro")}</p>
            </div>
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {TABS.map((tab) => (
                <li key={tab.key} className={CARD} data-testid={`pos-help-tab-${tab.key}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="text-[15px] font-semibold">{t(`tabs.${tab.key}.title`)}</h3>
                    <span className="text-xs text-[color:var(--color-muted)]">{t(`tabs.${tab.key}.who`)}</span>
                  </div>
                  <p className="text-sm">{t(`tabs.${tab.key}.what`)}</p>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-[color:var(--color-ink-soft)]">
                    {POINTS.map((p) => (
                      <li key={p}>{t(`tabs.${tab.key}.${p}`)}</li>
                    ))}
                  </ul>
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-sm">
                    <Link href={`${base}/${tab.href}`} className="font-medium text-[color:var(--color-accent)] hover:underline" data-testid={`pos-help-link-${tab.key}`}>
                      {t(`open.${tab.key}`)}
                    </Link>
                    {tab.more.map((mo) => (
                      <Link key={mo.key} href={`${base}/${mo.href}`} className="text-[color:var(--color-muted)] hover:text-[color:var(--color-ink)] hover:underline" data-testid={`pos-help-more-${mo.key}`}>
                        {t(`more.${mo.key}`)}
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className={CARD} data-testid="pos-help-day">
            <h2 className={H2}>{t("day.title")}</h2>
            <p className={MUTED}>{t("day.intro")}</p>
            <ol className="flex flex-col gap-2">
              {DAY_STEPS.map((s, i) => (
                <li key={s} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--color-surface-2)] text-xs font-semibold">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{t(`day.${s}.title`)}</span>
                    <span className="block text-[color:var(--color-muted)]">{t(`day.${s}.body`)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className={CARD} data-testid="pos-help-faq">
            <h2 className={H2}>{t("faq.title")}</h2>
            <div className="flex flex-col gap-2">
              {FAQ.map((q) => (
                <details key={q} className="group rounded-lg border px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium" data-testid={`pos-help-faq-${q}`}>
                    {t(`faq.${q}.q`)}
                    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-[color:var(--color-muted)] transition-transform group-open:rotate-180">
                      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </summary>
                  <p className="mt-1.5 text-sm text-[color:var(--color-muted)]" data-testid={`pos-help-faq-answer-${q}`}>
                    {t(`faq.${q}.a`)}
                  </p>
                </details>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
