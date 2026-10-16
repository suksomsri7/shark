"use client";

// QrChannelBlock.tsx — ส่วน QR ในลิ้นชักช่องทาง (POS P2.7U · บรีฟ P2.7 §5 · มติ 2 3 11) — ลิ้นชักของช่องทางพื้นฐาน QR_TABLE / QR_ORDER เท่านั้น
//   เปิด/ปิดรับ (saveChannelAction {id, name, active} · pos.channel.manage) · รับอัตโนมัติ + เวลาเตรียม (QR_ORDER) · พักรับ 15/30/60 นาที / เปิดรับอีกครั้ง
//   (setChannelOrderSettingsAction · pos.order.accept — ค่าตั้งเดียวกับรางจอ 09 ของ P2.8) · ลิงก์สั่งล่วงหน้า (QR_ORDER: ลิงก์ + QR + คัดลอก + สร้าง/เปลี่ยนลิงก์พร้อมยืนยัน ·
//   pos.channel.manage) · QR โต๊ะ = ลิงก์ไปจอโต๊ะ (พิมพ์ QR ทุกโต๊ะ) · เมนูที่ขายต่อช่องทาง = แถวราคาช่องทางของ P2.2 ("ไม่ขายในช่องทางนี้") → ลิงก์หน้าสินค้า
//   🔴 ไม่มีข้อความไทยนอก t() · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px · ค่าเวลาวาดหลัง mount

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { saveChannelAction } from "@/lib/modules/pos/channel-actions";
import type { ChannelItem } from "@/lib/modules/pos/channel-shared";
import { setChannelOrderSettingsAction } from "@/lib/modules/pos/order-actions";
import { ordersChannelsAction } from "@/lib/modules/pos/order-ui-actions";
import { createOrderLinkAction, getOrderLinkAction, rotateOrderLinkAction } from "@/lib/modules/pos/qr-staff-actions";
import { qrLinkPath, type QrOrderLinkView } from "@/lib/modules/pos/qr-staff-shared";
import { refusalMessageKey } from "@/lib/modules/pos/register-shared";
import { QrCodeImage } from "@/components/pos/qr/QrCodeImage";

const PREPS = [5, 10, 15, 20, 30, 45, 60] as const;
const PAUSES = [15, 30, 60] as const;
const hm = (iso: string | null) => {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return "";
  const d = new Date(at + 7 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};

type OrderSet = { autoAccept: boolean; prepMinutes: number | null; pausedUntil: string | null };

export function QrChannelBlock(p: { systemId: string; unitId: string; item: ChannelItem; canManage: boolean; /** POS P2.7U fix1 ▸ F6: pos.order.accept ◂ */ canAccept?: boolean; onSaved: (c: ChannelItem) => void }) {
  const t = useTranslations("pos.channel");
  const to = useTranslations("pos.orders"); // POS P2.7U fix1 ▸ F6: tooltip เดียวกับปุ่มรับออเดอร์ของจอ 09 (orders.perm.accept) ◂
  const noAccept = p.canAccept ? undefined : to("perm.accept");
  const tr = useTranslations("pos.register");
  const isOrder = p.item.code === "QR_ORDER";
  const target = useCallback(() => ({ systemId: p.systemId, unitId: p.unitId }), [p.systemId, p.unitId]);
  const [active, setActive] = useState(p.item.active);
  const [set, setSet] = useState<OrderSet | null>(null);
  const [link, setLink] = useState<QrOrderLinkView | null | undefined>(undefined);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const errText = useCallback((r: { code: string; messageKey?: string }) => (r.code === "PERMISSION_DENIED" ? t("drawer.denied") : tr(refusalMessageKey(r.code))), [t, tr]);

  useEffect(() => {
    setOrigin(window.location.origin);
    setNow(Date.now());
    let alive = true;
    void ordersChannelsAction(target())
      .then((r) => {
        if (!alive || !r.ok) return;
        const c = r.items.find((x) => x.id === p.item.id);
        if (c) setSet({ autoAccept: c.autoAccept, prepMinutes: c.prepMinutes, pausedUntil: c.pausedUntil });
      })
      .catch(() => undefined);
    if (isOrder)
      void getOrderLinkAction(target())
        .then((r) => {
          if (!alive) return;
          if (r.ok) setLink(r.link);
          else {
            setLink(null);
            setLinkErr(errText(r));
          }
        })
        .catch(() => alive && setLink(null));
    return () => {
      alive = false;
    };
  }, [errText, isOrder, p.item.id, target]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch {
      setErr(tr("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };
  const toggleActive = () =>
    run(async () => {
      const r = await saveChannelAction({ ...target(), input: { id: p.item.id, name: p.item.name, active: !active } });
      if (r.ok) {
        setActive(r.channel.active);
        p.onSaved(r.channel);
      } else setErr(errText(r));
    });
  const saveOrder = (patch: Partial<OrderSet>) =>
    run(async () => {
      const r = await setChannelOrderSettingsAction({ ...target(), input: { channelId: p.item.id, ...patch } });
      if (r.ok) setSet({ autoAccept: r.channel.autoAccept, prepMinutes: r.channel.prepMinutes, pausedUntil: r.channel.pausedUntil });
      else setErr(errText(r));
    });
  const linkOp = (op: "create" | "rotate") =>
    run(async () => {
      const r = await (op === "create" ? createOrderLinkAction(target()) : rotateOrderLinkAction(target()));
      if (r.ok) {
        setLink(r.link);
        setLinkErr(null);
        setConfirmRotate(false);
      } else setLinkErr(errText(r));
    });
  const paused = !!set?.pausedUntil && now !== null && Date.parse(set.pausedUntil) > now;
  const linkUrl = link && origin ? `${origin}${qrLinkPath(link.token)}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const sw = (on: boolean) => `relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]"}`;
  const knob = (on: boolean) => <span className={`absolute top-1 size-5 rounded-full bg-[color:var(--color-surface)] shadow transition-[left] ${on ? "left-6" : "left-1"}`} />;
  const base = `/app/sys/${p.systemId}/pos`;

  return (
    <section data-testid="pos-channel-qr" data-code={p.item.code} className="flex flex-col gap-4 rounded-[14px] border px-4 py-4">
      <h3 className="flex items-center gap-2 text-[14px] font-bold">
        <RegisterIcon name="qr" size={15} />
        {isOrder ? t("qr.orderTitle") : t("qr.tableTitle")}
      </h3>
      <p className="text-[12.5px] leading-[1.5] text-[color:var(--color-ink-soft)]">{isOrder ? t("qr.orderIntro") : t("qr.tableIntro")}</p>
      {err ? (
        <p role="alert" data-testid="pos-channel-qr-error" className="rounded-[10px] border border-[color:var(--color-danger)] px-3 py-2 text-[13px] text-[color:var(--color-danger)]">
          {err}
        </p>
      ) : null}

      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-[14px] font-semibold">{t("qr.active")}</span>
          <span className="text-[12px] text-[color:var(--color-muted)]">{active ? t("qr.activeOn") : t("qr.activeOff")}</span>
        </span>
        <button type="button" role="switch" aria-checked={active} aria-label={t("qr.active")} data-testid="pos-channel-qr-active" disabled={busy || !p.canManage} className={sw(active)} onClick={() => void toggleActive()}>
          {knob(active)}
        </button>
      </div>

      {isOrder ? (
        <>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className="flex min-w-0 flex-col">
              <span className="text-[14px] font-semibold">{t("qr.autoAccept")}</span>
              <span className="text-[12px] text-[color:var(--color-muted)]">{t("qr.autoAcceptHint")}</span>
            </span>
            <button type="button" role="switch" aria-checked={!!set?.autoAccept} aria-label={t("qr.autoAccept")} data-testid="pos-channel-qr-auto" title={noAccept} disabled={busy || !set || !p.canAccept /* POS P2.7U fix1 ▸ F6 ◂ */} className={sw(!!set?.autoAccept)} onClick={() => set && void saveOrder({ autoAccept: !set.autoAccept })}>
              {knob(!!set?.autoAccept)}
            </button>
          </div>
          <label className="flex flex-col gap-1.5 text-[13px] font-semibold">
            {t("qr.prep")}
            <select
              data-testid="pos-channel-qr-prep"
              title={noAccept}
              disabled={busy || !set || !p.canAccept /* POS P2.7U fix1 ▸ F6 ◂ */}
              value={set?.prepMinutes ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n > 0) void saveOrder({ prepMinutes: n });
              }}
              className="input h-11 w-full text-[15px] font-normal"
            >
              {set?.prepMinutes === null || set?.prepMinutes === undefined ? <option value="">{t("qr.prepDefault")}</option> : null}
              {set?.prepMinutes && !(PREPS as readonly number[]).includes(set.prepMinutes) ? <option value={set.prepMinutes}>{t("qr.minutes", { n: set.prepMinutes })}</option> : null}
              {PREPS.map((n) => (
                <option key={n} value={n}>
                  {t("qr.minutes", { n })}
                </option>
              ))}
            </select>
            <span className="text-[12px] font-normal text-[color:var(--color-muted)]">{t("qr.prepHint")}</span>
          </label>
        </>
      ) : null}

      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold">{t("qr.pause")}</span>
        {paused ? (
          <div data-testid="pos-channel-qr-paused" className="flex flex-wrap items-center gap-2 rounded-[12px] bg-[color:var(--color-surface-2)] px-3 py-2 text-[13px]">
            <RegisterIcon name="lock" size={13} />
            <span className="min-w-0 flex-1">{t("qr.pausedUntil", { time: hm(set?.pausedUntil ?? null) })}</span>
            <button type="button" data-testid="pos-channel-qr-reopen" title={noAccept} disabled={busy || !p.canAccept /* POS P2.7U fix1 ▸ F6 ◂ */} className="btn btn-ghost h-11 rounded-[11px] px-3 text-[13px] font-bold" onClick={() => void saveOrder({ pausedUntil: null })}>
              {t("qr.reopen")}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {PAUSES.map((m) => (
              <button
                key={m}
                type="button"
                data-testid={`pos-channel-qr-pause-${m}`}
                title={noAccept}
                disabled={busy || !set || now === null || !p.canAccept /* POS P2.7U fix1 ▸ F6 ◂ */}
                className="btn btn-ghost h-11 rounded-[11px] px-3 text-[13px]"
                onClick={() => void saveOrder({ pausedUntil: new Date(Date.now() + m * 60_000).toISOString() })}
              >
                {t("qr.pauseFor", { n: m })}
              </button>
            ))}
          </div>
        )}
        <span className="text-[12px] text-[color:var(--color-muted)]">{isOrder ? t("qr.pauseHintOrder") : t("qr.pauseHintTable")}</span>
      </div>

      {isOrder ? (
        <div data-testid="pos-channel-qr-link" className="flex flex-col gap-2 border-t pt-4">
          <span className="text-[14px] font-semibold">{t("qr.link")}</span>
          {link === undefined ? (
            <p className="text-[13px] text-[color:var(--color-muted)]">{t("qr.loading")}</p>
          ) : link ? (
            <>
              <div className="flex flex-col items-center gap-2 rounded-[12px] border px-3 py-3">
                <QrCodeImage value={linkUrl || null} size={176} alt={t("qr.link")} fallback={t("qr.loading")} testid="pos-channel-qr-link-image" />
                <p data-testid="pos-channel-qr-link-url" className="w-full break-all text-center text-[12px] text-[color:var(--color-ink-soft)]">
                  {linkUrl}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" data-testid="pos-channel-qr-link-copy" disabled={!linkUrl} className="btn btn-ghost h-11 rounded-[11px] text-[13.5px]" onClick={() => void copy()}>
                  {copied ? t("qr.copied") : t("qr.copy")}
                </button>
                <button type="button" data-testid="pos-channel-qr-link-rotate" disabled={busy || !p.canManage || confirmRotate} className="btn btn-ghost h-11 rounded-[11px] text-[13.5px] text-[color:var(--color-danger)]" onClick={() => setConfirmRotate(true)}>
                  {t("qr.rotate")}
                </button>
              </div>
              {confirmRotate ? (
                <div data-testid="pos-channel-qr-link-rotate-box" role="alertdialog" className="flex flex-col gap-2 rounded-[12px] border border-[color:var(--color-danger)] px-3 py-3">
                  <p className="text-[13px] text-[color:var(--color-ink-soft)]">{t("qr.rotateBody")}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" data-testid="pos-channel-qr-link-rotate-cancel" disabled={busy} className="btn btn-ghost h-11 rounded-[11px] px-4 text-[13.5px]" onClick={() => setConfirmRotate(false)}>
                      {t("drawer.cancel")}
                    </button>
                    <button type="button" data-testid="pos-channel-qr-link-rotate-confirm" disabled={busy} className="btn h-11 rounded-[11px] bg-[color:var(--color-danger)] px-4 text-[13.5px] font-semibold text-[color:var(--color-surface)]" onClick={() => void linkOp("rotate")}>
                      {t("qr.rotateConfirm")}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <button type="button" data-testid="pos-channel-qr-link-create" disabled={busy || !p.canManage} className="btn btn-primary h-11 w-fit rounded-[11px] px-4 text-[13.5px] font-bold" onClick={() => void linkOp("create")}>
              {t("qr.create")}
            </button>
          )}
          {linkErr ? (
            <p role="alert" data-testid="pos-channel-qr-link-error" className="text-[12.5px] text-[color:var(--color-danger)]">
              {linkErr}
            </p>
          ) : null}
          <span className="text-[12px] text-[color:var(--color-muted)]">{t("qr.linkHint")}</span>
        </div>
      ) : (
        <Link data-testid="pos-channel-qr-tables" href={`${base}/tables?unit=${encodeURIComponent(p.unitId)}`} className="inline-flex min-h-11 w-fit items-center gap-2 text-[13.5px] font-semibold underline">
          <RegisterIcon name="print" size={14} />
          {t("qr.tablesLink")}
        </Link>
      )}

      <Link data-testid="pos-channel-qr-products" href={`${base}/products?unit=${encodeURIComponent(p.unitId)}`} className="inline-flex min-h-11 w-fit items-center gap-2 text-[13px] text-[color:var(--color-ink-soft)] underline">
        {t("qr.menuVisibility")}
      </Link>
    </section>
  );
}
