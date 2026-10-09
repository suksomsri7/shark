"use client";

// ChannelsPanel.tsx — แผง "ช่องทางขายภายนอก" แบบใช้งานจริง (POS P2.1U · ภาพ 10 ซ้ายล่าง · มติ 1) — ใช้สองที่:
//   แท็บการเชื่อมต่อระบบ SHARK (แบบกะทัดรัด) และ ?tab=channels (เต็มความกว้าง · ไม่มีแบนเนอร์ "เปิดใช้ในเฟสถัดไป" แล้ว)
//   แถว = listChannelsAction ตามลำดับของเซิร์ฟเวอร์ (builtin ก่อน แล้ว sortOrder) · ป้าย 32px อักษรย่อแพลตฟอร์ม/ไอคอน ·
//   ชื่อหนา + บรรทัดรองสรุปค่าคอมฯ (channel-text.ts) · ขวา = ป้ายสถานะ "ใช้งาน/ปิดอยู่" + สวิตช์ active (บันทึก {id, name, active})
//   แพลตฟอร์มสำเร็จรูปที่ยังไม่สร้าง = แถว "เชื่อมต่อ" (saveChannelAction รหัส + ชื่อแบรนด์ · ค่าตั้งต้นของเซิร์ฟเวอร์ · ไม่เปิดลิ้นชัก)
//   ท้ายแผง = "+ เพิ่มช่องทางอื่น" (ลิ้นชักโหมดสร้าง CUSTOM) · "แสดงที่เก็บแล้ว (n)" · ครบเพดาน = ปุ่มเพิ่ม/เชื่อมต่อปิด + หมายเหตุ
// 🔴 ไม่มีสิทธิ์ pos.channel.manage = สวิตช์ปิด · ไม่มีปุ่มเพิ่ม/เชื่อมต่อ · ลิ้นชักเปิดได้แบบอ่านอย่างเดียว (เซิร์ฟเวอร์ตรวจซ้ำทุกครั้ง)
// 🔴 สถานะการเชื่อมต่อ ("เชื่อมแล้ว"/"รอยืนยันบัญชี") = P2.8/P3 — ยังไม่แสดง
// 🔴 ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px · คำปฏิเสธแสดงผ่านคีย์ (ไม่แสดง message ไทยของเซิร์ฟเวอร์)

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { RegisterIcon, type RegisterIconName } from "@/components/pos/register/RegisterIcon";
import { CHANNEL_LIMIT_PER_UNIT, type ChannelItem } from "@/lib/modules/pos/channel-shared";
import { listChannelsAction, saveChannelAction } from "@/lib/modules/pos/channel-actions";
import { CHANNEL_CONNECT_PRESETS, CHANNEL_PRESET_BRAND, channelDisplayName, channelSummary, type ChannelT } from "@/components/pos/settings/channel-text";
// ชื่อเรียกในไฟล์นี้ลงท้าย View: ตัวสแกนทะเบียนปุ่ม (F15.3) นับคอมโพเนนต์ชื่อ *Drawer เป็นปุ่ม — ตัวลิ้นชักมี testid ของมันเองข้างใน
import { ChannelDrawer as ChannelDrawerView, channelErrorText, type ChannelDrawerMode } from "./ChannelDrawer";

export type Storefront = { name: string; path: string } | null;

const BUILTIN_ICON: Record<string, RegisterIconName> = { STORE: "shop", WEB: "link", QR_TABLE: "qr", CHAT: "mail" };

/** ป้าย 32px มุมมน (ภาพ 10 .lrow) — อักษรย่อแพลตฟอร์ม · ไอคอน builtin · อักษรแรกของช่องทางที่ร้านตั้งเอง */
export function ChannelBadge({ code, name, label }: { code: string; name: string; label: string }) {
  const icon = BUILTIN_ICON[code];
  const initials = CHANNEL_PRESET_BRAND[code]?.initials ?? (Array.from(name.trim())[0] ?? "?").toUpperCase();
  return (
    <span role="img" aria-label={label} className="grid size-8 shrink-0 place-items-center rounded-[9px] border bg-[color:var(--color-surface-2)] text-[11px] font-bold text-[color:var(--color-ink-soft)]">
      {icon ? <RegisterIcon name={icon} size={15} /> : initials}
    </span>
  );
}

/** สวิตช์ 34×19 (ภาพ 10 .sw) */
function Knob({ on, dim }: { on: boolean; dim?: boolean }) {
  return (
    <span aria-hidden className={`relative inline-block h-[19px] w-[34px] shrink-0 rounded-full ${on ? "bg-[color:var(--color-ink)]" : "bg-[color:var(--color-line)]"} ${dim ? "opacity-50" : ""}`}>
      <span className={`absolute top-[2.5px] size-[14px] rounded-full bg-[color:var(--color-surface)] shadow ${on ? "right-[2.5px]" : "left-[2.5px]"}`} />
    </span>
  );
}

type Props = { systemId: string; unitId: string; canManage: boolean; storefront: Storefront; wide?: boolean };

export function ChannelsPanel({ systemId, unitId, canManage, storefront, wide = false }: Props) {
  const t = useTranslations("pos.channel") as ChannelT;
  const tr = useTranslations("pos.register");
  const [items, setItems] = useState<ChannelItem[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [tick, setTick] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [rowErr, setRowErr] = useState<{ key: string; text: string } | null>(null);
  const [drawer, setDrawer] = useState<ChannelDrawerMode | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadErr(false);
    listChannelsAction({ systemId, unitId, includeArchived: true })
      .then((r) => {
        if (!alive) return;
        if (r.ok) setItems(r.items);
        else {
          setItems(null);
          setLoadErr(true);
        }
      })
      .catch(() => {
        if (alive) setLoadErr(true);
      });
    return () => {
      alive = false;
    };
  }, [systemId, unitId, tick]);

  useEffect(() => {
    if (!saved) return;
    const h = setTimeout(() => setSaved(null), 3000);
    return () => clearTimeout(h);
  }, [saved]);

  const live = useMemo(() => (items ?? []).filter((c) => !c.archived), [items]);
  const archived = useMemo(() => (items ?? []).filter((c) => c.archived), [items]);
  const codes = useMemo(() => new Set((items ?? []).map((c) => c.code)), [items]);
  const atLimit = (items?.length ?? 0) >= CHANNEL_LIMIT_PER_UNIT;
  const missingPresets = CHANNEL_CONNECT_PRESETS.filter((p) => !codes.has(p));

  const upsert = useCallback((c: ChannelItem) => {
    setItems((s) => {
      if (!s) return [c];
      const i = s.findIndex((x) => x.id === c.id);
      if (i < 0) return [...s, c];
      const next = [...s];
      next[i] = c;
      return next;
    });
  }, []);

  const toggle = async (c: ChannelItem) => {
    if (!canManage || busy || c.code === "STORE" || c.archived) return;
    setBusy(c.id);
    setRowErr(null);
    try {
      // มติ 1: สวิตช์ส่งแค่ id + active (name ต้องมีเสมอตามตัวแกะของเซิร์ฟเวอร์ — ส่งค่าเดิม ไม่เปลี่ยนอะไร)
      const r = await saveChannelAction({ systemId, unitId, input: { id: c.id, name: c.name, active: !c.active } });
      if (r.ok) {
        upsert(r.channel);
        setSaved(r.channel.id);
      } else setRowErr({ key: c.id, text: channelErrorText(r.code, t, tr) });
    } catch {
      setRowErr({ key: c.id, text: tr("errors.unknown") });
    } finally {
      setBusy(null);
    }
  };

  const connect = async (code: string) => {
    if (!canManage || busy || atLimit) return;
    setBusy(code);
    setRowErr(null);
    try {
      const r = await saveChannelAction({ systemId, unitId, input: { code, name: CHANNEL_PRESET_BRAND[code]?.name ?? code } });
      if (r.ok) {
        upsert(r.channel);
        setSaved(r.channel.id);
      } else setRowErr({ key: code, text: channelErrorText(r.code, t, tr) });
    } catch {
      setRowErr({ key: code, text: tr("errors.unknown") });
    } finally {
      setBusy(null);
    }
  };

  const sub = (c: ChannelItem) => {
    const s = channelSummary(c, t);
    return c.code === "WEB" && storefront ? `${s} · ${storefront.path}` : s;
  };

  const row = (c: ChannelItem) => {
    const name = channelDisplayName(c.code, c.name, t);
    const code = c.code.toLowerCase();
    const locked = c.code === "STORE";
    const switchOff = !canManage || locked || busy !== null;
    return (
      <li key={c.id} data-testid={`pos-channel-row-${code}`} className="border-t first:border-t-0">
        <div className={`flex min-w-0 items-center gap-3 px-[14px] py-1.5 md:gap-4 ${c.archived ? "opacity-70" : ""}`}>
          <button
            data-testid={`pos-channel-open-${code}`}
            type="button"
            className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left md:gap-4"
            aria-label={t("row.open", { name })}
            onClick={() => setDrawer({ kind: "edit", item: c })}
          >
            <ChannelBadge code={c.code} name={c.name} label={t("badge.label", { name })} />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13px] font-semibold">{name}</b>
              <span className="block truncate text-[11.5px] text-[color:var(--color-muted)]">{sub(c)}</span>
            </span>
          </button>
          <span className="flex shrink-0 items-center gap-2 md:gap-3">
            <span
              data-testid={`pos-channel-status-${code}`}
              className={`inline-flex h-7 items-center whitespace-nowrap rounded-[8px] border px-2.5 text-[12px] ${
                c.archived ? "text-[color:var(--color-muted)]" : c.active ? "border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-muted)]"
              }`}
            >
              {c.archived ? t("archived") : c.active ? t("status.active") : t("status.inactive")}
            </span>
            {locked ? (
              <span className="grid size-5 place-items-center text-[color:var(--color-muted)]" title={t("locked")} aria-label={t("locked")} role="img">
                <RegisterIcon name="lock" size={13} />
              </span>
            ) : null}
            {!c.archived && (
              <button
                data-testid={`pos-channel-toggle-${code}`}
                type="button"
                role="switch"
                aria-checked={c.active}
                aria-label={t("row.toggle", { name })}
                title={locked ? t("locked") : undefined}
                disabled={switchOff}
                className="grid min-h-11 min-w-11 place-items-center disabled:cursor-not-allowed"
                onClick={() => void toggle(c)}
              >
                <Knob on={c.active} dim={!canManage || locked} />
              </button>
            )}
          </span>
        </div>
        {rowErr?.key === c.id && (
          <p data-testid="pos-channel-row-error" role="alert" className="px-[14px] pb-2 text-[12.5px] text-[color:var(--color-danger)]">
            {rowErr.text}
          </p>
        )}
        {saved === c.id && (
          <p data-testid="pos-channel-row-saved" role="status" className="px-[14px] pb-2 text-[12.5px] text-[color:var(--color-ink-soft)]">
            {t("saved")}
          </p>
        )}
      </li>
    );
  };

  const presetRow = (code: string) => {
    const brand = CHANNEL_PRESET_BRAND[code]!;
    const lc = code.toLowerCase();
    return (
      <li key={`preset-${code}`} data-testid={`pos-channel-preset-${lc}`} className="border-t first:border-t-0">
        <div className="flex min-w-0 items-center gap-3 px-[14px] py-1.5 md:gap-4">
          <span className="flex min-h-11 min-w-0 flex-1 items-center gap-3 md:gap-4">
            <ChannelBadge code={code} name={brand.name} label={t("badge.label", { name: brand.name })} />
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13px] font-semibold">{brand.name}</b>
              <span className="block truncate text-[11.5px] text-[color:var(--color-muted)]">{t("row.notCreated")}</span>
            </span>
          </span>
          {canManage ? (
            <button
              data-testid={`pos-channel-connect-${lc}`}
              type="button"
              disabled={busy !== null || atLimit}
              className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-[11px] border bg-[color:var(--color-surface)] px-4 text-[13px] font-semibold disabled:opacity-50"
              onClick={() => void connect(code)}
            >
              {busy === code ? t("row.connecting") : t("connect")}
            </button>
          ) : (
            <span className="inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-[8px] border px-2.5 text-[12px] text-[color:var(--color-muted)]">{t("row.notCreated")}</span>
          )}
        </div>
        {rowErr?.key === code && (
          <p data-testid="pos-channel-row-error" role="alert" className="px-[14px] pb-2 text-[12.5px] text-[color:var(--color-danger)]">
            {rowErr.text}
          </p>
        )}
      </li>
    );
  };

  return (
    <div data-testid="pos-channels-panel" className={`flex min-w-0 flex-1 flex-col gap-2 ${wide ? "md:gap-3" : ""}`}>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] font-bold">
        <RegisterIcon name="truck" size={16} />
        {t("title")}
        <span className="min-w-0 text-[12.5px] font-normal text-[color:var(--color-muted)]">{t("subtitle")}</span>
      </div>
      {loadErr ? (
        <div data-testid="pos-channel-error" role="alert" className="flex flex-wrap items-center gap-3 rounded-[12px] border px-[14px] py-3 text-[13px] text-[color:var(--color-danger)]">
          <span className="min-w-0 flex-1">{t("error")}</span>
          <button data-testid="pos-channel-retry" type="button" className="btn btn-ghost min-h-11 text-[13px]" onClick={() => setTick((n) => n + 1)}>
            {t("row.retry")}
          </button>
        </div>
      ) : items === null ? (
        <p className="rounded-[12px] border px-[14px] py-4 text-[13px] text-[color:var(--color-muted)]">{t("row.loading")}</p>
      ) : (
        <>
          <ul data-testid="pos-channel-list" className="overflow-hidden rounded-[12px] border bg-[color:var(--color-surface)]">
            {live.map(row)}
            {missingPresets.map(presetRow)}
            {showArchived && archived.map(row)}
          </ul>
          {live.length === 0 && missingPresets.length === 0 ? (
            <p data-testid="pos-channel-empty" className="text-[12.5px] text-[color:var(--color-muted)]">
              {t("empty")}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {canManage && (
              <button
                data-testid="pos-channel-add"
                type="button"
                disabled={atLimit || busy !== null}
                className="inline-flex min-h-11 items-center text-[13px] font-bold text-[color:var(--color-accent)] disabled:text-[color:var(--color-muted)]"
                onClick={() => setDrawer({ kind: "create" })}
              >
                {t("add")}
              </button>
            )}
            {archived.length > 0 && (
              <button
                data-testid="pos-channel-show-archived"
                type="button"
                aria-expanded={showArchived}
                className="ml-auto inline-flex min-h-11 items-center text-[12.5px] text-[color:var(--color-ink-soft)] underline-offset-2 hover:underline"
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? t("row.hideArchived") : t("row.showArchived", { n: archived.length })}
              </button>
            )}
          </div>
          {canManage && atLimit && (
            <p data-testid="pos-channel-limit" className="text-[12px] text-[color:var(--color-muted)]">
              {t("row.limit", { max: CHANNEL_LIMIT_PER_UNIT })}
            </p>
          )}
          {!canManage && (
            <p data-testid="pos-channel-readonly" className="text-[12px] text-[color:var(--color-muted)]">
              {t("row.readOnly")}
            </p>
          )}
          <p className="text-[12px] text-[color:var(--color-muted)]">{t("perUnitNote")}</p>
        </>
      )}
      {drawer && (
        <ChannelDrawerView
          systemId={systemId}
          unitId={unitId}
          mode={drawer}
          canManage={canManage}
          takenCodes={codes}
          atLimit={atLimit}
          onClose={() => setDrawer(null)}
          onSaved={(c) => {
            upsert(c);
            setSaved(c.id);
            setDrawer(null);
          }}
        />
      )}
    </div>
  );
}
