"use client";

// OrdersRail.tsx — รางซ้ายของจอ 09 (POS P2.8U · มติ 2): ช่องทาง + ตัวนับ · รับอัตโนมัติ · เวลาเตรียมมาตรฐาน · ปิดรับชั่วคราว
//   เดสก์ท็อป/iPad (≥1024) = คอลัมน์ 220px · มือถือ = ตัวเลือกช่องทาง (ChannelChooser) บนกระดาน + ส่วนตั้งค่า (RailSettings) ท้ายจอ
//   แถว: "ทุกช่องทาง N" + 1 แถวต่อช่องทางจาก ordersChannelsAction (หน้าร้าน/QR โต๊ะซ่อน) · ตัวนับ = counts.byChannel ของเซิร์ฟเวอร์ ·
//   "หน้าร้าน QR" = ชิปเร็ว ๆ นี้ (มติ 6 · P2.7) · ช่องที่ปิดรับอยู่ = ชิป "ปิดรับถึง hh:mm"
//   ตั้งค่า (เฉพาะผู้มี pos.order.accept — คนอื่นไม่เห็นส่วนนี้): สวิตช์รับอัตโนมัติต่อช่องทางที่ไม่ใช่ MANUAL ·
//   "พักรับอัตโนมัติเมื่อครัวค้าง" = ชิปเร็ว ๆ นี้ (P2.6) · เวลาเตรียม 10/15/20/30/45/60 → prepMinutes · ปิดรับชั่วคราว → แผ่นเลือกเวลา (OrderSheets)
//   🔴 ไม่มีข้อความไทยนอก t() · เวลาวาดหลัง mount (now = null ก่อน mount)

import { useTranslations } from "next-intl";
import { RegisterIcon, type RegisterIconName } from "@/components/pos/register/RegisterIcon";
import { channelDisplayName } from "@/components/pos/settings/channel-text";
import { PlannedChip } from "./OrderCardView";
import { bkkClock, PREP_CHOICES, type OrdersChannel } from "./orders-ui";

/** ช่องทางที่โชว์ในราง/ตัวเลือก (ซ่อนหน้าร้าน + QR โต๊ะ — มติ 2/6) */
export const railChannels = (items: readonly OrdersChannel[]): OrdersChannel[] => items.filter((c) => c.code !== "STORE" && c.code !== "QR_TABLE" && !c.archived);
/** ช่องทางที่มีสวิตช์รับอัตโนมัติ (adapter ไม่ใช่ MANUAL · มติ 2) */
export const autoAcceptChannels = (items: readonly OrdersChannel[]): OrdersChannel[] => railChannels(items).filter((c) => c.adapter !== "MANUAL" && c.adapter !== "NONE");
/** ปิดรับอยู่ตอนนี้ไหม */
export const isPausedNow = (c: Pick<OrdersChannel, "pausedUntil">, now: number | null): boolean => !!c.pausedUntil && now !== null && Date.parse(c.pausedUntil) > now;

const ICON: Record<string, RegisterIconName> = { WEB: "shop", CHAT: "mail" };
const iconOf = (c: OrdersChannel): RegisterIconName => ICON[c.code] ?? (c.kind === "EXTERNAL" ? "truck" : "box");

export function OrdersRail(p: {
  channels: readonly OrdersChannel[];
  counts: Record<string, number> | null;
  total: number | null;
  filter: string;
  onFilter: (id: string) => void;
  now: number | null;
  settings: React.ReactNode;
}) {
  const t = useTranslations("pos.orders");
  const tch = useTranslations("pos.channel");
  const rows = railChannels(p.channels);
  const rowCls = (on: boolean) =>
    `flex min-h-11 w-full items-center gap-2.5 rounded-[12px] px-3 text-left text-[14px] ${on ? "border border-[color:var(--color-line)] bg-[color:var(--color-surface)] font-bold shadow-sm" : "text-[color:var(--color-ink-soft)] hover:bg-[color:var(--color-surface-2)]"}`;
  const rowBody = (icon: RegisterIconName, label: string, n: number | null, paused: string | null) => (
    <>
      <RegisterIcon name={icon} size={14} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{label}</span>
        {paused ? <span className="truncate text-[11px] font-normal text-[color:var(--color-danger)]">{paused}</span> : null}
      </span>
      <span className="shrink-0 text-[12.5px] tabular-nums text-[color:var(--color-muted)]">{n ?? ""}</span>
    </>
  );
  return (
    <aside data-testid="pos-ord-rail" aria-label={t("rail.label")} className="flex w-[220px] shrink-0 flex-col gap-1 overflow-y-auto border-r bg-[color:var(--color-surface-2)] p-3">
      <button type="button" data-testid="pos-ord-ch-all" aria-pressed={p.filter === "all"} className={rowCls(p.filter === "all")} onClick={() => p.onFilter("all")}>
        {rowBody("list", t("rail.all"), p.total, null)}
      </button>
      {rows.map((c) => (
        <button key={c.id} type="button" data-testid={`pos-ord-ch-${c.code}`} aria-pressed={p.filter === c.id} className={rowCls(p.filter === c.id)} onClick={() => p.onFilter(c.id)}>
          {rowBody(
            iconOf(c),
            channelDisplayName(c.code, c.name, tch),
            p.counts ? (p.counts[c.id] ?? 0) : null,
            isPausedNow(c, p.now) ? t("rail.pausedUntil", { time: bkkClock(c.pausedUntil) }) : null,
          )}
        </button>
      ))}
      <div className="flex min-h-11 items-center gap-2.5 px-3 text-[14px] text-[color:var(--color-muted)]">
        <RegisterIcon name="qr" size={14} />
        <span className="min-w-0 flex-1 truncate">{t("rail.qrTable")}</span>
        <span className="shrink-0 rounded-[6px] border px-1.5 text-[10.5px]">{t("planned")}</span>
      </div>
      {p.settings}
    </aside>
  );
}

/** มือถือ/จอแคบ: ตัวเลือกช่องทางแทนราง (มติ 2) */
export function ChannelChooser(p: { channels: readonly OrdersChannel[]; counts: Record<string, number> | null; total: number | null; filter: string; onFilter: (id: string) => void }) {
  const t = useTranslations("pos.orders");
  const tch = useTranslations("pos.channel");
  return (
    <label className="flex min-w-0 items-center gap-2 text-[13px] text-[color:var(--color-ink-soft)]">
      <span className="sr-only">{t("rail.label")}</span>
      <select data-testid="pos-ord-ch-select" value={p.filter} onChange={(e) => p.onFilter(e.target.value)} className="input h-11 min-w-0 flex-1 rounded-[12px] text-[14px]">
        <option value="all">{`${t("rail.all")}${p.total !== null ? ` ${p.total}` : ""}`}</option>
        {railChannels(p.channels).map((c) => (
          <option key={c.id} value={c.id}>
            {`${channelDisplayName(c.code, c.name, tch)}${p.counts ? ` ${p.counts[c.id] ?? 0}` : ""}`}
          </option>
        ))}
      </select>
    </label>
  );
}

/** ส่วนตั้งค่ารับออเดอร์ของราง (เฉพาะผู้มี pos.order.accept) — รางเดสก์ท็อปฝังไว้ใต้รายการช่องทาง · มือถืออยู่ท้ายจอ */
export function RailSettings(p: {
  channels: readonly OrdersChannel[];
  /** ช่องทางที่ค่าตั้ง (เวลาเตรียม/ปิดรับ) จะไปลง: ช่องที่เลือกในราง หรือทุกช่องทาง */
  targetLabel: string;
  prepValue: number | null;
  busy: boolean;
  onAuto: (c: OrdersChannel, on: boolean) => void;
  onPrep: (n: number) => void;
  onPause: () => void;
}) {
  const t = useTranslations("pos.orders");
  const tch = useTranslations("pos.channel");
  const autos = autoAcceptChannels(p.channels);
  return (
    <div data-testid="pos-ord-rail-settings" className="mt-3 flex flex-col gap-3 border-t pt-3 text-[13.5px]">
      <section className="flex flex-col gap-1.5">
        <h3 className="px-1 text-[12px] font-bold text-[color:var(--color-muted)]">{t("rail.autoAccept")}</h3>
        {autos.length === 0 ? <p className="px-1 text-[12px] text-[color:var(--color-muted)]">{t("rail.autoNone")}</p> : null}
        {autos.map((c) => (
          <div key={c.id} className="flex min-h-11 items-center justify-between gap-2 px-1">
            <span className="min-w-0 truncate">{channelDisplayName(c.code, c.name, tch)}</span>
            <button
              type="button"
              role="switch"
              aria-checked={c.autoAccept}
              aria-label={t("rail.autoAcceptFor", { channel: channelDisplayName(c.code, c.name, tch) })}
              data-testid={`pos-ord-auto-${c.code}`}
              disabled={p.busy}
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${c.autoAccept ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]"}`}
              onClick={() => p.onAuto(c, !c.autoAccept)}
            >
              <span className={`absolute top-1 size-5 rounded-full bg-[color:var(--color-surface)] shadow transition-[left] ${c.autoAccept ? "left-6" : "left-1"}`} />
            </button>
          </div>
        ))}
        <div className="px-1">
          <PlannedChip label={t("rail.autoPauseKitchen")} />
        </div>
      </section>
      <section className="flex flex-col gap-1.5 border-t pt-3">
        <h3 className="px-1 text-[12px] font-bold text-[color:var(--color-muted)]">{t("rail.prepDefault")}</h3>
        <select
          data-testid="pos-ord-prep-default"
          aria-label={t("rail.prepDefault")}
          disabled={p.busy}
          value={p.prepValue ?? ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n > 0) p.onPrep(n);
          }}
          className="input h-12 rounded-[14px] text-[15px] font-bold"
        >
          {p.prepValue === null ? <option value="">{t("rail.prepMixed")}</option> : null}
          {(PREP_CHOICES as readonly number[]).includes(p.prepValue ?? -1) || p.prepValue === null ? null : <option value={p.prepValue}>{t("rail.prepMinutes", { n: p.prepValue })}</option>}
          {PREP_CHOICES.map((n) => (
            <option key={n} value={n}>
              {t("rail.prepMinutes", { n })}
            </option>
          ))}
        </select>
        <p className="px-1 text-[11.5px] leading-[1.5] text-[color:var(--color-muted)]">{t("rail.prepToPlatform")}</p>
        <p className="px-1 text-[11.5px] text-[color:var(--color-muted)]">{t("rail.appliesTo", { target: p.targetLabel })}</p>
      </section>
      <button type="button" data-testid="pos-ord-pause" disabled={p.busy} className="btn btn-ghost h-12 rounded-[14px] text-[14px] disabled:opacity-50" onClick={p.onPause}>
        <RegisterIcon name="lock" size={14} />
        {t("rail.pause")}
      </button>
    </div>
  );
}
