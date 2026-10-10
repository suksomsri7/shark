"use client";

// SharkSettings.tsx — POS P1.18U แท็บ "การเชื่อมต่อระบบ SHARK" (ภาพ 10 · มติ 4 5 · CD2 CD3)
//   หัว: ชื่อ + คำอธิบาย (เปิด/ปิดได้ที่หน้าของแต่ละระบบ) · ป้าย "เชื่อมอยู่ N จาก 13 ระบบ" · ปุ่ม "ประวัติการเปลี่ยน" · ชิปแดง "มีงานค้าง N" (backlog.failed > 0)
//   กริด 3/2/1 คอลัมน์: 13 การ์ดตามลำดับสัญญา (posIntegrationCardsAction) + การ์ด "ใบเสร็จและภาษี" + "ออฟไลน์"
//     การ์ด: ไอคอน · ชื่อ · สวิตช์ขวาบน — บัญชี = สวิตช์จริง (ปิด = กล่องยืนยัน) · การ์ดอื่น = ตัวแสดงสถานะ (aria-disabled + "จัดการที่หน้า…") ·
//     bullets = facts ตามลำดับ (live = ปกติ · ยังไม่มี = จาง + เฟส) · OFF/NO_SYSTEM = จาง + ท้าย "ปิดอยู่ · …" / "ยังไม่มีระบบนี้ในร้าน" + "เปิดใช้" ·
//     PLANNED = จาง + ชิป "เร็ว ๆ นี้ · <เฟส>" · lastActivityAt = "ล่าสุด <เวลา>" · การ์ด AI = กรอบประ "เขียนได้เฉพาะแบบร่าง ต้องคนยืนยัน"
//   ใต้กริด: ช่องทางขายภายนอก + วิธีรับเงิน (shark-ui.tsx)
// 🔴 สวิตช์เดียวที่ POS สลับได้ = บัญชี (CD2) · คำปฏิเสธเป็นข้อมูล → settingsRefusalMessageKey · ไม่มีข้อความไทยนอกคอมเมนต์ · ปุ่ม ≥ 44px

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { posIntegrationCardsAction, setPosAccountLinkAction } from "@/lib/pos-integrations-actions";
import type { PosIntegrationCard, PosIntegrationCardsResult } from "@/lib/pos-integrations";
import { receiptSettingsPageDataAction } from "@/lib/modules/pos/receipt-settings-actions";
import { settingsRefusalMessageKey } from "@/lib/modules/pos/settings-shared";
import { formatShortDate, formatThaiTime } from "@/lib/ui/date";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { RegisterIcon, type RegisterIconName } from "@/components/pos/register/RegisterIcon";
import { posSettingsHref } from "@/components/pos/settings/settings-tabs";
import { useSettingsHistory } from "@/components/pos/settings/HistoryDrawer";
import { InlineNote, TabHead } from "./settings-ui";
import { CARD_HEAD, HEAD_SWITCH, HEAD_TITLE, MiniKnob, OfflineCard, PaymentsPanel, SOON_ROW, SoonChip, type PaySummary, type Storefront } from "./shark-ui";
import { ChannelsPanel } from "./ChannelsPanel"; // POS P2.1U ▸ แผงช่องทางขายจริง (มติ 1) ◂

type CardsOk = Extract<PosIntegrationCardsResult, { ok: true }>;
type ReceiptData = Extract<Awaited<ReturnType<typeof receiptSettingsPageDataAction>>, { ok: true }>;
const ICON: Record<PosIntegrationCard["code"], RegisterIconName> = {
  MEMBER: "users",
  POINT: "pig",
  COUPON: "tag",
  REWARD: "flag",
  ACCOUNT: "book",
  INVENTORY: "box",
  HR: "clock",
  CRM: "chart",
  CHAT: "mail",
  KANBAN: "grid",
  MARKETING: "pct",
  BOOKING: "cal",
  AI: "spark",
};
/** หน้าเพิ่มระบบของร้าน (การ์ดที่ร้านยังไม่มีระบบนั้น) */
const ADD_SYSTEM_HREF = "/app/settings/systems";
/** ชื่อการ์ดที่เป็นชื่อเฉพาะ (ไม่แปล) */
const PROPER_TITLE: Partial<Record<PosIntegrationCard["code"], string>> = { CRM: "CRM" };

type Props = { systemId: string; unitId: string; storefront: Storefront; pay: PaySummary; canAddSystem: boolean; /** POS P2.1U ▸ pos.channel.manage ที่สาขานี้ ◂ */ canManageChannels?: boolean };

function relTime(iso: string, locale: string): string {
  const at = new Date(iso);
  const diff = Math.round((Date.now() - at.getTime()) / 60_000);
  if (diff >= 0 && diff < 24 * 60) {
    const rtf = new Intl.RelativeTimeFormat(locale === "en" ? "en" : "th", { numeric: "auto" });
    return diff < 60 ? rtf.format(-diff, "minute") : rtf.format(-Math.floor(diff / 60), "hour");
  }
  return `${formatShortDate(at, locale)} ${formatThaiTime(at)}`;
}

function CardShell({ code, dim, children }: { code: string; dim: boolean; children: ReactNode }) {
  return (
    <div data-testid={`pos-settings-card-${code}`} data-dim={dim ? "1" : undefined} className="flex min-w-0 flex-col gap-3 rounded-[12px] border bg-[color:var(--color-surface)] px-[14px] py-3">
      {children}
    </div>
  );
}
function IconTile({ icon, accent }: { icon: RegisterIconName; accent?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-[26px] shrink-0 place-items-center rounded-[7px] border ${accent ? "border-[color:var(--color-accent-soft)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]" : "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-soft)]"}`}
    >
      <RegisterIcon name={icon} size={14} />
    </span>
  );
}

export function SharkSettings({ systemId, unitId, storefront, pay, canAddSystem, canManageChannels = false }: Props) {
  const t = useTranslations("pos.settings");
  const tk = useTranslations("pos.settings.shark");
  const tc = useTranslations("pos.settings.cards");
  const locale = useLocale();
  const openHistory = useSettingsHistory();
  const [data, setData] = useState<CardsOk | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [accBusy, setAccBusy] = useState(false);
  const [accDenied, setAccDenied] = useState(false);
  const [accMsg, setAccMsg] = useState<{ key: string; link: string | null } | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const r = await posIntegrationCardsAction({ systemId, unitId });
      if (!r.ok) return setLoadErr(settingsRefusalMessageKey(r.code));
      setData(r);
    } catch {
      setLoadErr("loadFailed");
    }
  }, [systemId, unitId]);
  useEffect(() => {
    void load();
    void receiptSettingsPageDataAction({ systemId, unitId })
      .then((r) => setReceipt(r.ok ? r : null))
      .catch(() => setReceipt(null));
  }, [load, systemId, unitId]);

  const account = data?.cards.find((c) => c.code === "ACCOUNT") ?? null;
  const setAccount = async (enabled: boolean) => {
    if (accBusy) return;
    setAccBusy(true);
    setAccMsg(null);
    try {
      const r = await setPosAccountLinkAction({ systemId, enabled, ...(enabled ? {} : { confirm: true }) });
      setConfirmOff(false);
      if (r.ok) return void (await load());
      if (r.code === "PERMISSION_DENIED") setAccDenied(true);
      else if (r.code === "NOT_FOUND") setAccMsg({ key: "shark.accountNotLinked", link: account?.manage?.href ?? ADD_SYSTEM_HREF });
      else setAccMsg({ key: settingsRefusalMessageKey(r.code), link: null });
    } catch {
      setConfirmOff(false);
      setAccMsg({ key: "errors.unknown", link: null });
    } finally {
      setAccBusy(false);
    }
  };

  const head = (
    <TabHead title={tk("title")} desc={tk("subtitle")} stackBelowXl>
      {data && (
        <span data-testid="pos-settings-shark-count" className="inline-flex h-8 items-center whitespace-nowrap rounded-[9px] border border-[color:var(--color-ink)] px-3 text-[13px] font-bold">
          {tk("count", { linked: data.header.linked, total: data.header.total })}
        </span>
      )}
      {data?.header.backlog && data.header.backlog.failed > 0 && (
        <span data-testid="pos-settings-shark-backlog" className="inline-flex h-8 items-center whitespace-nowrap rounded-[9px] border border-[color:var(--color-danger)] px-3 text-[13px] font-bold text-[color:var(--color-danger)]">
          {tk("backlog", { count: data.header.backlog.failed })}
        </span>
      )}
      {openHistory && (
        <button data-testid="pos-settings-history-open" type="button" className="btn btn-ghost h-11 gap-2 rounded-[11px] px-4 text-[14px]" onClick={openHistory}>
          <RegisterIcon name="clock" size={15} />
          {t("history.title")}
        </button>
      )}
    </TabHead>
  );

  if (loadErr)
    return (
      <div data-testid="pos-settings-shark" className="flex min-w-0 flex-col gap-4">
        {head}
        <InlineNote tone="error" testid="pos-settings-load-error">
          {t(loadErr)}
        </InlineNote>
        <button data-testid="pos-settings-shark-retry" type="button" className="btn btn-ghost h-11 self-start rounded-[11px] px-5 text-[14px]" onClick={() => void load()}>
          {t("retry")}
        </button>
      </div>
    );

  const card = (c: PosIntegrationCard) => {
    const code = c.code.toLowerCase();
    const dim = c.state !== "LINKED";
    const isAccount = c.code === "ACCOUNT";
    const accountLive = isAccount && (c.state === "LINKED" || c.state === "OFF");
    const accountLocked = accDenied || !c.manage?.canManage;
    const manageAt = tc(`${c.code}.manageAt`);
    const title = PROPER_TITLE[c.code] ?? tc(`${c.code}.title`);
    // POS P1.18U ▸ แก้รอบ 2 V3/V4: หัวการ์ด = ไอคอน · ชื่อ (min-w-0 ตัดบรรทัดได้ ไม่ถูกทับ) · สวิตช์ชิดขวาตรงบรรทัดแรก ·
    //   ชิป "เร็ว ๆ นี้ · <เฟส>" ของการ์ด PLANNED ย้ายไปบรรทัดของตัวเองใต้ชื่อ · สวิตช์ PLANNED = ตัวแสดงสถานะปิด (อ่านอย่างเดียว) ◂
    const plannedPhase = c.state === "PLANNED" ? (c.facts.find((f) => f.phase)?.phase ?? "") : null;
    const sw =
      plannedPhase !== null ? (
        <span data-testid={`pos-settings-card-state-${code}`} role="switch" aria-checked="false" aria-disabled="true" aria-label={title} title={tk("soon", { phase: plannedPhase })} className={HEAD_SWITCH}>
          <MiniKnob on={false} />
        </span>
      ) : accountLive ? (
        <button
          data-testid="pos-settings-account-switch"
          type="button"
          role="switch"
          aria-checked={c.state === "LINKED"}
          aria-label={tc("ACCOUNT.switch")}
          disabled={accBusy || accountLocked}
          title={accountLocked ? tk("accountDenied") : undefined}
          className={`${HEAD_SWITCH} disabled:opacity-50`}
          onClick={() => (c.state === "LINKED" ? setConfirmOff(true) : void setAccount(true))}
        >
          <MiniKnob on={c.state === "LINKED"} />
        </button>
      ) : (
        <span data-testid={`pos-settings-card-state-${code}`} role="switch" aria-checked={c.state === "LINKED"} aria-disabled="true" aria-label={title} title={manageAt} className={HEAD_SWITCH}>
          <MiniKnob on={c.state === "LINKED"} />
        </span>
      );
    return (
      <CardShell key={c.code} code={code} dim={dim}>
        <div className={`${CARD_HEAD} ${dim ? "text-[color:var(--color-muted)]" : ""}`}>
          <IconTile icon={ICON[c.code]} accent={c.code === "AI"} />
          <span className={HEAD_TITLE}>{title}</span>
          {sw}
        </div>
        {plannedPhase !== null && (
          <div data-testid={`pos-settings-card-soon-${code}`} className={SOON_ROW}>
            <SoonChip phase={plannedPhase} />
          </div>
        )}
        <ul className={`list-disc pl-4 text-[12px] leading-[1.55] ${dim ? "text-[color:var(--color-muted)]" : "text-[color:var(--color-ink-soft)]"}`}>
          {c.facts.map((f) => {
            const params: Record<string, string | number> = {};
            for (const [k, v] of Object.entries(f.params ?? {})) if (v !== null) params[k] = typeof v === "boolean" ? String(v) : v;
            if (f.key === "pointRate" && typeof f.params?.satangPerPoint === "number") params.baht = (f.params.satangPerPoint / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
            // POS P2.2U ▸ มติ 7 (Q8): happy hour live = ข้อความ "โปรราคา / Happy hour ตั้งใน สินค้า › โปรราคา" + ลิงก์ไปจอโปรราคา ◂
            const hhLive = c.code === "MARKETING" && f.key === "happyHourPricing" && f.live;
            const key = hhLive ? `${c.code}.facts.happyHourPricingLive` : f.key === "autoPost" && typeof f.params?.linkCount === "number" ? `${c.code}.facts.autoPostMulti` : `${c.code}.facts.${f.key}`;
            return (
              <li key={f.key} data-testid={`pos-settings-fact-${code}-${f.key}`} className={f.live ? "" : "text-[color:var(--color-muted)] opacity-80"}>
                {hhLive ? (
                  <Link data-testid="pos-settings-marketing-price-rules" href={`/app/sys/${systemId}/pos/products/price-rules`} className="text-[color:var(--color-accent)] underline-offset-2 hover:underline">
                    {tc(key)}
                  </Link>
                ) : tc.has(key) ? (
                  tc(key, params)
                ) : (
                  f.key
                )}
                {!f.live && f.phase && <span className="ml-1.5 text-[10.5px] text-[color:var(--color-muted)]">{f.phase}</span>}
              </li>
            );
          })}
        </ul>
        {c.code === "AI" && <div className="inline-block self-start rounded-[8px] border border-dashed px-[9px] py-1.5 text-[11.5px] text-[color:var(--color-muted)]">{tc("AI.note")}</div>}
        {/* POS P1.18U ▸ แก้รอบ 1 F3: สวิตช์บัญชีถูกล็อกเพราะไม่มีสิทธิ์ (ก่อนหรือหลังถูกปฏิเสธ) ⇒ บอกเหตุผลใต้การ์ดเสมอ ◂ */}
        {isAccount && (accDenied || (accountLive && accountLocked)) && (
          <p data-testid="pos-settings-account-denied" className="text-[11.5px] text-[color:var(--color-danger)]">
            {tk("accountDenied")}
          </p>
        )}
        {(c.state === "OFF" || c.state === "NO_SYSTEM") && (
          <div className="mt-auto flex items-center gap-3 text-[11.5px] text-[color:var(--color-muted)]">
            <span className="min-w-0 flex-1">{c.state === "OFF" ? `${tk("offPrefix")} · ${tc(`${c.code}.off`)}` : tk("noSystem")}</span>
            {/* POS P1.18U ▸ แก้รอบ 1 F4: OFF ⇒ ลิงก์ "เปิดใช้" เฉพาะผู้จัดการได้ (manage.canManage) ไปที่ manage.href ·
                แก้รอบ 3 N1: NO_SYSTEM (manage: null) ⇒ ลิงก์ไปหน้าเพิ่มระบบ เฉพาะผู้ที่เพิ่มระบบได้ (canAddSystem = systems.system.create) ·
                ไม่มีสิทธิ์ = ข้อความเทาอย่างเดียว ◂ */}
            {(c.state === "OFF" ? c.manage?.canManage === true : canAddSystem) && (
              <Link data-testid={`pos-settings-card-enable-${code}`} href={c.state === "OFF" && c.manage ? c.manage.href : ADD_SYSTEM_HREF} className="inline-flex min-h-11 shrink-0 items-center font-bold text-[color:var(--color-accent)]">
                {tk("enable")}
              </Link>
            )}
          </div>
        )}
        {c.state === "LINKED" && (c.lastActivityAt || c.manage?.canManage) && (
          <div className="mt-auto flex items-center gap-3 text-[11.5px] text-[color:var(--color-muted)]">
            <span className="min-w-0 flex-1">{c.lastActivityAt ? tk("lastActivity", { when: relTime(c.lastActivityAt, locale) }) : ""}</span>
            {c.manage?.canManage && (
              <Link data-testid={`pos-settings-card-manage-${code}`} href={c.manage.href} title={manageAt} className="inline-flex min-h-11 shrink-0 items-center font-bold text-[color:var(--color-accent)]">
                {tk("manage")}
              </Link>
            )}
          </div>
        )}
      </CardShell>
    );
  };

  // ── การ์ดใบเสร็จและภาษี (ข้อมูลเดียวกับแท็บใบเสร็จ) ──
  const book = receipt?.book ?? null;
  const regNo = receipt?.devices.find((d) => d.status === "ACTIVE" && d.posRegNo)?.posRegNo ?? null;
  const headerSet = !!receipt && (!!receipt.settings.header.name || !!receipt.settings.header.phone || !!receipt.settings.header.address || !!receipt.settings.footer.trim());
  // POS P1.18U ▸ แก้รอบ 2 V2: แถว = ป้ายซ้าย (จาง · shrink-0 · บรรทัดเดียว) + ค่าชิดขวาบรรทัดเดียว (ไอคอนอยู่หน้าข้อความ) ·
  //   flex-wrap + justify-between: ค่าที่ยาวกว่าที่เหลือข้างป้าย ⇒ ทั้งก้อนลงไปบรรทัดของตัวเองใต้ป้าย (กว้างเต็มการ์ด) — ไม่บีบเป็นคอลัมน์แคบ ·
  //   ไม่ตัดกลางคำ (ไม่ truncate) · ยาวเกินทั้งการ์ดจริง ๆ ⇒ ตัดบรรทัดตามคำเท่านั้น ◂
  const kv = (k: string, v: ReactNode, testid?: string) => (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-t py-[5px] text-[12px] first:border-t-0">
      <span className="shrink-0 whitespace-nowrap text-[color:var(--color-muted)]">{k}</span>
      <span data-testid={testid} className="inline-flex max-w-full items-center gap-1.5 text-right">
        {v}
      </span>
    </div>
  );
  const receiptCard = (
    <div data-testid="pos-settings-card-receipt" className="flex min-w-0 flex-col gap-3 rounded-[12px] border bg-[color:var(--color-surface)] px-[14px] py-3">
      <div className={CARD_HEAD}>
        <IconTile icon="doc" />
        <span className={HEAD_TITLE}>{tk("receiptTitle")}</span>
        <Link data-testid="pos-settings-card-receipt-edit" href={posSettingsHref(systemId, "receipt", unitId)} className="-my-[9px] inline-flex min-h-11 shrink-0 items-center text-[11.5px] font-bold text-[color:var(--color-accent)]">
          {tk("edit")}
        </Link>
      </div>
      <div>
        {kv(
          tk("vat"),
          book?.vatRegistered ? (
            <>
              <span aria-hidden className="inline-grid size-[14px] shrink-0 place-items-center rounded-[4px] bg-[color:var(--color-ink)] text-[color:var(--color-surface)]">
                <RegisterIcon name="check" size={10} />
              </span>
              <span>{tk("vatOn")}</span>
            </>
          ) : book ? (
            tk("vatOff")
          ) : (
            tk("noBook")
          ),
          "pos-settings-card-receipt-vat",
        )}
        {kv(tk("taxId"), book?.taxId ? tk("taxIdValue", { taxId: book.taxId, branch: book.branchCode ?? "00000" }) : tk("notSet"))}
        {kv(tk("posNo"), `${regNo ?? "—"} · ${headerSet ? tk("headerSet") : tk("headerNotSet")}`)}
        {/* POS P1.18U ▸ แก้รอบ 2 V2: แถว e-Tax = ป้าย + [ชิป + ปุ่มเล็ก] เป็นก้อนเดียวไม่ตัดบรรทัด · ที่ไม่พอ ⇒ ทั้งก้อนลงบรรทัดใต้ป้าย ◂ */}
        <div data-testid="pos-settings-card-etax" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-t py-[3px] text-[12px]">
          <span className="shrink-0 whitespace-nowrap text-[color:var(--color-muted)]">{tk("etax")}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <span className="inline-flex h-6 items-center rounded-[7px] border px-2 text-[11.5px] text-[color:var(--color-muted)]">{tk("etaxChip")}</span>
            <button data-testid="pos-settings-card-etax-apply" type="button" disabled title={tk("etaxSoon")} className="btn btn-ghost h-11 rounded-[9px] px-2.5 text-[12px] disabled:opacity-50">
              {tk("etaxApply")}
            </button>
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div data-testid="pos-settings-shark" className="flex min-w-0 flex-col gap-6 md:gap-7">
      {head}
      {accMsg && (
        <div data-testid="pos-settings-account-toast" role="alert" className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[color:var(--color-danger)] px-4 py-2.5 text-[14px] text-[color:var(--color-ink-soft)]">
          <RegisterIcon name="warn" size={16} className="shrink-0 text-[color:var(--color-danger)]" />
          <span className="min-w-0 flex-1">{t(accMsg.key)}</span>
          {accMsg.link && (
            <Link data-testid="pos-settings-account-toast-link" href={accMsg.link} className="inline-flex min-h-11 items-center font-bold text-[color:var(--color-accent)]">
              {tk("openAccount")}
            </Link>
          )}
          <button data-testid="pos-settings-account-toast-close" type="button" className="grid size-11 place-items-center rounded-[10px] text-[color:var(--color-muted)]" aria-label={t("history.close")} onClick={() => setAccMsg(null)}>
            <RegisterIcon name="x" size={14} />
          </button>
        </div>
      )}
      {!data ? (
        <p className="text-[14px] text-[color:var(--color-muted)]">{t("loading")}</p>
      ) : (
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3 xl:gap-[23px]">
          {data.cards.map(card)}
          {receiptCard}
          <OfflineCard />
        </div>
      )}
      {/* POS P1.18U ▸ แก้รอบ 2 V3: สองแผงวางคู่กันตั้งแต่ xl (เดิม lg) — ที่ 1024 แผงละ ~200px ชิป "เร็ว ๆ นี้" เบียดชื่อจนเหลือ ~8px · ใต้ xl = เรียงลงเต็มความกว้าง ◂ */}
      <div className="flex min-w-0 flex-col items-stretch gap-6 xl:flex-row xl:items-start xl:gap-3">
        <ChannelsPanel systemId={systemId} unitId={unitId} canManage={canManageChannels} storefront={storefront} />
        <PaymentsPanel systemId={systemId} unitId={unitId} pay={pay} />
      </div>
      {confirmOff && (
        <RegisterDialog onDismiss={() => !accBusy && setConfirmOff(false)} locked={accBusy}>
          <div data-testid="pos-settings-account-confirm" className={REG_DIALOG_PANEL} role="alertdialog" aria-modal="true" aria-label={tk("accountOffTitle")}>
            <SheetGrab />
            <h2 className="text-[20px] font-bold">{tk("accountOffTitle")}</h2>
            <p className="text-[14.5px] leading-[1.6] text-[color:var(--color-ink-soft)]">{tk("accountOffBody")}</p>
            <div className="mt-2 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button data-testid="pos-settings-account-confirm-cancel" type="button" className="btn btn-ghost h-12 rounded-[13px] px-5 text-[15px]" disabled={accBusy} onClick={() => setConfirmOff(false)}>
                {tk("cancel")}
              </button>
              <button
                data-testid="pos-settings-account-confirm-off"
                type="button"
                className="btn h-12 rounded-[13px] border-[color:var(--color-danger)] bg-[color:var(--color-danger)] px-5 text-[15px] font-semibold text-white disabled:opacity-60"
                disabled={accBusy}
                onClick={() => void setAccount(false)}
              >
                {accBusy ? t("saving") : tk("accountOffConfirm")}
              </button>
            </div>
          </div>
        </RegisterDialog>
      )}
    </div>
  );
}
