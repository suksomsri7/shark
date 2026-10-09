"use client";

// shark-ui.tsx — ชิ้นส่วนร่วมของแท็บ "การเชื่อมต่อระบบ SHARK" · "ช่องทางขายภายนอก" · "ออฟไลน์และการซิงก์" (POS P1.18U · ภาพ 10 · มติ 4 7)
//   ChannelsPanel (5 แถว: LINE MAN · Grab · Shopee · foodpanda = PLANNED · เว็บร้าน SHARK Shop = อ่านจากร้านจริง R11) ·
//   PaymentsPanel (สรุป settings.pos.payment + พร้อมเพย์แบบปิดบัง · ว่อชเชอร์/เครดิตร้าน PLANNED P2.9 · ไม่มี MDR % / ตรวจสลิป — ไม่มีข้อมูล) ·
//   OfflineCard (สวิตช์ปิด · 3 บรรทัด P3.4 · รายการรอซิงก์ 0) · ChannelsTab / OfflineTab = แบนเนอร์ "เปิดใช้ในเฟสถัดไป" + เนื้อหาเดียวกันเต็มความกว้าง
//   สวิตช์ทุกตัวในไฟล์นี้ = ตัวแสดงสถานะอ่านอย่างเดียว (aria-disabled) — ไม่มีอะไรสลับได้จากไฟล์นี้
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ลิงก์ ≥ 44px

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { RegisterIcon, type RegisterIconName } from "@/components/pos/register/RegisterIcon";
import { posSettingsHref } from "@/components/pos/settings/settings-tabs";
import { TabHead } from "./settings-ui";

export type Storefront = { name: string; path: string } | null;
export type PaySummary = { promptpayMasked: string | null; beamOn: boolean };

/** ชิป "เร็ว ๆ นี้ · <เฟส>" */
export function SoonChip({ phase }: { phase: string }) {
  const t = useTranslations("pos.settings.shark");
  return <span className="inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-[7px] border px-2 text-[11.5px] text-[color:var(--color-muted)]">{t("soon", { phase })}</span>;
}

/** สวิตช์แสดงสถานะ 34×19 (ภาพ 10 .sw) — ห่อด้วย span role=switch aria-disabled ที่ผู้เรียก */
export function MiniKnob({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={`relative inline-block h-[19px] w-[34px] shrink-0 rounded-full ${on ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]"}`}>
      <span className={`absolute top-[2.5px] size-[14px] rounded-full bg-[color:var(--color-surface)] shadow ${on ? "right-[2.5px]" : "left-[2.5px]"}`} />
    </span>
  );
}

function Tile({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-[30px] shrink-0 place-items-center rounded-[8px] border text-[11px] font-bold ${accent ? "border-transparent bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]" : "bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-soft)]"}`}
    >
      {children}
    </span>
  );
}

function PanelHead({ icon, title, sub, children }: { icon: RegisterIconName; title: string; sub: string; children?: ReactNode }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] font-bold">
      <RegisterIcon name={icon} size={16} />
      {title}
      <span className="min-w-0 text-[12.5px] font-normal text-[color:var(--color-muted)]">{sub}</span>
      {children && <span className="ml-auto">{children}</span>}
    </div>
  );
}

/** แถวรายการ (ภาพ 10 .lrow) — ส่วนขวา (ชิป/สวิตช์) ส่งเป็น children */
function LRow({ tile, title, sub, testid, children }: { tile: ReactNode; title: string; sub: string; testid: string; children: ReactNode }) {
  return (
    <div data-testid={testid} className="flex min-w-0 items-center gap-4 border-t px-[14px] py-2 text-[13px] first:border-t-0 md:gap-[22px]">
      {tile}
      <span className="min-w-0 flex-1">
        <b className="block font-semibold">{title}</b>
        <span className="block truncate text-[11.5px] text-[color:var(--color-muted)]">{sub}</span>
      </span>
      {children}
    </div>
  );
}

/** ช่องทางขายภายนอก (ภาพ 10 ซ้ายล่าง) — มติ 4: ทุกแถว PLANNED ยกเว้นเว็บร้าน (UI ช่องทาง = P2.1U) */
export function ChannelsPanel({ storefront }: { storefront: Storefront }) {
  const t = useTranslations("pos.settings.channels");
  // ชื่อแบรนด์ = ชื่อเฉพาะ (ไม่แปล) · คำอธิบายผ่าน t
  const planned: { key: "lineman" | "grab" | "shopee" | "foodpanda"; name: string; tile: string; phase: string }[] = [
    { key: "lineman", name: "LINE MAN", tile: "LM", phase: "P2.1" },
    { key: "grab", name: "Grab", tile: "G", phase: "P2.1" },
    { key: "shopee", name: "Shopee", tile: "S", phase: "P3" },
    { key: "foodpanda", name: "foodpanda", tile: "fp", phase: "P3" },
  ];
  return (
    <div data-testid="pos-settings-channels-panel" className="flex min-w-0 flex-1 flex-col gap-2">
      <PanelHead icon="truck" title={t("title")} sub={t("sub")} />
      <div className="overflow-hidden rounded-[12px] border bg-[color:var(--color-surface)]">
        {planned.map((c) => (
          <LRow key={c.key} testid={`pos-settings-channel-${c.key}`} tile={<Tile>{c.tile}</Tile>} title={c.name} sub={t(`${c.key}.sub`)}>
            <SoonChip phase={c.phase} />
          </LRow>
        ))}
        <LRow
          testid="pos-settings-channel-storefront"
          tile={
            <Tile>
              <RegisterIcon name="shop" size={14} />
            </Tile>
          }
          title={t("storefront.name")}
          sub={storefront ? `${storefront.name} · ${storefront.path}` : t("storefront.none")}
        >
          <span className="inline-flex shrink-0 items-center gap-3">
            <span className={`inline-flex h-7 items-center whitespace-nowrap rounded-[8px] border px-2.5 text-[12px] ${storefront ? "border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-muted)]"}`}>
              {storefront ? t("storefront.on") : t("storefront.off")}
            </span>
            <span data-testid="pos-settings-channel-storefront-state" role="switch" aria-checked={!!storefront} aria-disabled="true" aria-label={t("storefront.name")} title={t("storefront.manageAt")} className="grid min-h-11 place-items-center">
              <MiniKnob on={!!storefront} />
            </span>
          </span>
        </LRow>
      </div>
      <p className="text-[12px] text-[color:var(--color-muted)]">{t("note")}</p>
    </div>
  );
}

/** วิธีรับเงิน (ภาพ 10 ขวาล่าง) — สรุปอ่านอย่างเดียว · แก้ที่แท็บวิธีรับเงิน */
export function PaymentsPanel({ systemId, unitId, pay }: { systemId: string; unitId: string; pay: PaySummary }) {
  const t = useTranslations("pos.settings.payPanel");
  const rows: { key: string; icon: RegisterIconName; title: string; sub: string; on: boolean; phase: string | null }[] = [
    { key: "promptpay", icon: "qr", title: pay.promptpayMasked ? t("promptpay", { id: pay.promptpayMasked }) : t("promptpayNone"), sub: pay.beamOn ? t("promptpayBeam") : t("promptpayManual"), on: !!pay.promptpayMasked, phase: null },
    { key: "card", icon: "card", title: t("card"), sub: pay.beamOn ? t("cardBeam") : t("cardEdc"), on: true, phase: null },
    { key: "transfer", icon: "bank", title: t("transfer"), sub: t("transferSub"), on: true, phase: null },
    { key: "voucher", icon: "tag", title: t("voucher"), sub: t("voucherSub"), on: false, phase: "P2.9" },
    { key: "credit", icon: "cheque", title: t("credit"), sub: t("creditSub"), on: false, phase: "P2.9" },
  ];
  return (
    <div data-testid="pos-settings-pay-panel" className="flex min-w-0 flex-1 flex-col gap-2">
      <PanelHead icon="wallet" title={t("title")} sub={t("sub")}>
        <Link data-testid="pos-settings-pay-panel-edit" href={posSettingsHref(systemId, "payments", unitId)} className="inline-flex min-h-11 items-center text-[12.5px] font-bold text-[color:var(--color-accent)]">
          {t("edit")}
        </Link>
      </PanelHead>
      <div className="overflow-hidden rounded-[12px] border bg-[color:var(--color-surface)]">
        {rows.map((r) => (
          <LRow
            key={r.key}
            testid={`pos-settings-pay-row-${r.key}`}
            tile={
              <Tile>
                <RegisterIcon name={r.icon} size={14} />
              </Tile>
            }
            title={r.title}
            sub={r.sub}
          >
            {r.phase ? (
              <SoonChip phase={r.phase} />
            ) : (
              <span data-testid={`pos-settings-pay-row-state-${r.key}`} role="switch" aria-checked={r.on} aria-disabled="true" aria-label={r.title} title={t("readOnly")} className="grid min-h-11 place-items-center">
                <MiniKnob on={r.on} />
              </span>
            )}
          </LRow>
        ))}
      </div>
    </div>
  );
}

/** การ์ดออฟไลน์ (ภาพ 10 แถวสุดท้าย) — ทั้งหมด P3.4 · ยังไม่มีคิวออฟไลน์ ⇒ รอซิงก์ 0 */
export function OfflineCard({ wide = false }: { wide?: boolean }) {
  const t = useTranslations("pos.settings.offline");
  return (
    <div data-testid="pos-settings-card-offline" className={`flex min-w-0 flex-col gap-3 rounded-[12px] border bg-[color:var(--color-surface)] px-[14px] py-3 ${wide ? "md:px-6 md:py-5" : ""}`}>
      <div className="flex items-center gap-[13px] text-[13.5px] font-bold text-[color:var(--color-muted)]">
        <Tile>
          <RegisterIcon name="swap" size={14} />
        </Tile>
        <span className="min-w-0 flex-1">{t("cardTitle")}</span>
        <SoonChip phase="P3.4" />
        <span data-testid="pos-settings-card-state-offline" role="switch" aria-checked="false" aria-disabled="true" aria-label={t("cardTitle")} title={t("planned")} className="grid min-h-11 place-items-center">
          <MiniKnob on={false} />
        </span>
      </div>
      <ul className="list-disc pl-4 text-[12px] leading-[1.6] text-[color:var(--color-muted)]">
        <li>{t("factSell")}</li>
        <li>{t.rich("factTempNo", { b: (c) => <b className="text-[color:var(--color-ink-soft)]">{c}</b>, no: "OFF-C1-0007" })}</li>
        <li>{t("factSync")}</li>
      </ul>
      <div className="mt-auto flex items-center gap-3 border-t pt-[7px] text-[11.5px] text-[color:var(--color-muted)]">
        {t("pending")}
        <span data-testid="pos-settings-offline-pending" className="ml-auto text-[17px] font-bold tabular-nums text-[color:var(--color-ink)]">
          0
        </span>
      </div>
    </div>
  );
}

function PhaseBanner({ text }: { text: string }) {
  return (
    <div data-testid="pos-settings-phase-banner" role="status" className="flex items-start gap-3 rounded-[14px] border bg-[color:var(--color-surface-2)] px-4 py-3 text-[14px] text-[color:var(--color-ink-soft)]">
      <RegisterIcon name="clock" size={16} className="mt-[3px] shrink-0" />
      <span>{text}</span>
    </div>
  );
}

/** ?tab=channels — มติ 7 */
export function ChannelsPane({ storefront }: { storefront: Storefront }) {
  const t = useTranslations("pos.settings.channels");
  return (
    <div data-testid="pos-settings-channels" className="flex min-w-0 flex-col gap-6 md:gap-8">
      <TabHead title={t("tabTitle")} desc={t("tabSub")} />
      <PhaseBanner text={t("banner")} />
      <ChannelsPanel storefront={storefront} />
    </div>
  );
}

/** ?tab=offline — มติ 7 */
export function OfflinePane() {
  const t = useTranslations("pos.settings.offline");
  return (
    <div data-testid="pos-settings-offline" className="flex min-w-0 flex-col gap-6 md:gap-8">
      <TabHead title={t("tabTitle")} desc={t("tabSub")} />
      <PhaseBanner text={t("banner")} />
      <OfflineCard wide />
    </div>
  );
}

