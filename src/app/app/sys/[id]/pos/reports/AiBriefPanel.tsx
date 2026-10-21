"use client";

// AiBriefPanel.tsx — POS P3.9U แผง "ผู้ช่วย AI" ของจอ 08 ภาพรวม (มติ 1 · CD-P39U-1 · CD-P39U-2)
//   สถานะ: brief (บรรทัดจาก composeBrief ตามตัวอักษร · "วิเคราะห์เมื่อ HH:MM" จาก generatedAt ของเซิร์ฟเวอร์ จัดรูปหลัง mount) · empty (ai.brief.empty) ·
//     refused (ไม่มี pos.report.view ที่สาขาใดเลย — การ์ดปฏิเสธ ไม่มีตัวเลข) · off (settings.pos.ai.enabled ปิด = การ์ดเส้นประ ai.brief.off · เจ้าของร้านเห็นลิงก์ไปตั้งค่า)
//   ปุ่ม "สร้างใบสั่งซื้อ (ร่าง)" · "ถามต่อ" = เปิดแผงแชท AI พร้อมข้อความตั้งต้น (CustomEvent app:ai-open detail.prompt) — การยืนยันยังเป็นการ์ดข้อเสนอเดิมในแชท ·
//   "สร้างงานในบอร์ด" ไม่มีในใบนี้ (CD-P39U-2 → P3.8U createAnomalyCardAction)
// 🔴 ไม่มีข้อความไทยนอก t() · ปุ่ม ≥ 44px · import เฉพาะ *-actions / *-shared (S5.17) · ข้อมูลทั้งหมดผ่าน posAiPanelAction (คำปฏิเสธเป็นข้อมูล)

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { posAiPanelAction } from "@/lib/modules/pos/ai-panel-actions";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { posSettingsHref } from "@/components/pos/settings/settings-tabs";

type Res = Awaited<ReturnType<typeof posAiPanelAction>>;
type Ok = Extract<Res, { ok: true }>;
type View = { s: "loading" } | { s: "ok"; v: Ok } | { s: "off"; canManage: boolean } | { s: "refused" } | { s: "err" };

const fmtTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale.startsWith("en") ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
/** ส่วนที่เป็นสัญญาณเตือน (จุดแดง) — เงินขาด/เกิน · จุดผิดปกติที่มีกฎถูกจับ */
const isAlert = (section: string, anomalyHits: boolean) => section === "overShort" || (section === "anomalies" && anomalyHits);
/** เปิดแผงแชท AI พร้อมข้อความตั้งต้น (AiDock อ่าน detail.prompt — ไม่มี detail = พฤติกรรมเดิม) */
function openDock(prompt: string) {
  window.dispatchEvent(new CustomEvent("app:ai-open", { detail: { prompt } }));
}

type Props = {
  systemId: string;
  /** วันธุรกิจของภาพรวม (วันสุดท้ายของช่วง) — เซิร์ฟเวอร์ตัดอนาคตเป็นวันนี้ */
  date?: string;
  locale: string;
  /** หน้ารู้แล้วว่าผู้ใช้ดูรายงานไม่ได้ที่สาขาใดเลย (การ์ดปฏิเสธของหน้า) — ไม่ยิง action */
  refused?: boolean;
};

export function AiBriefPanel({ systemId, date, locale, refused = false }: Props) {
  const t = useTranslations("pos.ai");
  const [view, setView] = useState<View>(refused ? { s: "refused" } : { s: "loading" });
  const [at, setAt] = useState<string | null>(null);

  const load = useCallback(() => {
    if (refused) return;
    setView({ s: "loading" });
    void posAiPanelAction({ systemId, ...(date ? { date } : {}), locale: locale.startsWith("en") ? "en" : "th" })
      .then((r) => {
        if (r.ok) setView({ s: "ok", v: r });
        else if (r.code === "AI_OFF") setView({ s: "off", canManage: r.canManage });
        else if (r.code === "PERMISSION_DENIED") setView({ s: "refused" });
        else setView({ s: "err" });
      })
      .catch(() => setView({ s: "err" }));
  }, [systemId, date, locale, refused]);
  useEffect(() => load(), [load]);
  // HF-418: เวลาไทยจัดรูปฝั่ง client หลัง mount เท่านั้น
  const generatedAt = view.s === "ok" ? view.v.generatedAt : null;
  useEffect(() => setAt(generatedAt ? fmtTime(generatedAt, locale) : null), [generatedAt, locale]);

  if (view.s === "off")
    return (
      <section data-testid="pos-reports-ai-off" className="flex min-w-0 flex-col gap-3 rounded-2xl border border-dashed p-6 text-sm text-[color:var(--color-muted)] xl:flex-1">
        <Head title={t("brief.title")} right={null} />
        <p>{t("brief.off")}</p>
        {view.canManage && (
          <Link data-testid="pos-reports-ai-settings" href={posSettingsHref(systemId, "shark")} className="inline-flex min-h-11 items-center self-start font-bold text-[color:var(--color-accent)]">
            {t("panel.openSettings")}
          </Link>
        )}
      </section>
    );
  if (view.s === "refused")
    return (
      <section data-testid="pos-reports-ai-refused" role="alert" className="card flex min-w-0 flex-col gap-3 rounded-2xl p-6 text-sm text-[color:var(--color-muted)] xl:flex-1">
        <Head title={t("brief.title")} right={null} />
        <p>{t("panel.refused")}</p>
      </section>
    );

  const ok = view.s === "ok" ? view.v : null;
  const empty = !!ok && ok.empty;
  // POS P3.9U ▸ fix1 F1: ข้อความตั้งต้น = หัวเรื่อง + วันธุรกิจ + เจตนาเท่านั้น (ไม่มีตัวเลขยอดขาย/เงินขาดเกิน/จุดผิดปกติ — AI อ่านข้อมูลผ่านเครื่องมือ POS ที่จำกัดสิทธิ์ของตัวเอง) ◂
  const askPrompt = ok ? t("panel.seedAsk", { title: ok.title, date: ok.businessDate }) : "";
  return (
    <section data-testid="pos-reports-ai-panel" aria-busy={view.s === "loading"} className="card min-w-0 rounded-2xl border-[color:var(--color-accent)] p-6 xl:flex-1">
      <Head title={t("brief.title")} right={ok && at ? <span data-testid="pos-reports-ai-at" className="text-[13px] text-[color:var(--color-muted)]">{t("panel.analyzedAt", { time: at })}</span> : null} />
      {view.s === "loading" ? (
        <p className="py-6 text-center text-sm text-[color:var(--color-muted)]">{t("panel.loading")}</p>
      ) : view.s === "err" ? (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-xl border border-[color:var(--color-danger)] p-3 text-sm text-[color:var(--color-danger)]" data-testid="pos-reports-ai-error">
          <span>{t("panel.failed")}</span>
          <button data-testid="pos-reports-ai-retry" type="button" className="btn btn-ghost min-h-[44px] text-sm" onClick={load}>
            {t("panel.retry")}
          </button>
        </div>
      ) : empty ? (
        <p data-testid="pos-reports-ai-empty" className="py-6 text-center text-sm text-[color:var(--color-muted)]">
          {t("brief.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ok!.lines.map((line, i) => {
            const alert = isAlert(ok!.sections[i] ?? "", ok!.anomalyHits);
            return (
              <li key={`${i}-${ok!.sections[i] ?? ""}`} data-testid={`pos-reports-ai-line-${i}`} data-section={ok!.sections[i]} className="flex min-w-0 gap-3 rounded-[9px] border px-3 py-2.5 text-[13px] leading-[1.5] text-[color:var(--color-ink-soft)]">
                <span aria-hidden className={`mt-[7px] size-1.5 shrink-0 rounded-full ${alert ? "bg-[color:var(--color-danger)]" : "bg-[color:var(--color-ink)]"}`} />
                <span className="min-w-0 break-words">{line}</span>
              </li>
            );
          })}
        </ul>
      )}
      {ok && (
        <div className="mt-4 flex flex-wrap gap-2">
          {!empty && (
            <button data-testid="pos-reports-ai-draft-po" type="button" className="btn btn-primary inline-flex min-h-[44px] items-center gap-2 text-sm" onClick={() => openDock(t("panel.seedDraftPo", { date: ok.businessDate }))}>
              <RegisterIcon name="doc" size={15} />
              {t("panel.draftPo")}
            </button>
          )}
          <button data-testid="pos-reports-ai-ask" type="button" className="btn btn-ghost inline-flex min-h-[44px] items-center gap-2 text-sm" onClick={() => openDock(askPrompt)}>
            <RegisterIcon name="spark" size={15} />
            {t("panel.ask")}
          </button>
        </div>
      )}
      <div className="mt-3 inline-block rounded-[8px] border border-dashed px-[9px] py-1.5 text-[12px] text-[color:var(--color-muted)]" data-testid="pos-reports-ai-propose-only">
        {t("brief.proposeOnly")}
      </div>
    </section>
  );
}

function Head({ title, right }: { title: string; right: React.ReactNode }) {
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <span aria-hidden className="grid size-[30px] shrink-0 place-items-center rounded-[8px] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]">
        <RegisterIcon name="spark" size={16} />
      </span>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      <span className="flex-1" />
      {right}
    </div>
  );
}
