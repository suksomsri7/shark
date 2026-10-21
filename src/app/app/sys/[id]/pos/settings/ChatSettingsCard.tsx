"use client";

// ChatSettingsCard.tsx — POS P3.7U ส่วนของการ์ด "แชท" ในแท็บการเชื่อมต่อ SHARK (ภาพ 10 · CD-P37U-2/3 · มติ P3.7 §10.1/§10.4)
//   ใต้ bullets ของการ์ด: 4 แถวสวิตช์ (receiptAuto · refundNotice · orderStatus · autoReply — ป้าย cards.CHAT.switches.*) ·
//     เจ้าของร้าน = role=switch จริง (แตะ 1 ครั้ง = setPosChatSettingsAction {patch:{[k]: !v}} · ปิดปุ่มระหว่างรอ · ค่าใหม่มาจากผลของตัวเขียน) ·
//     คนอื่น = ตัวแสดงสถานะ (aria-disabled) + ข้อความ cards.CHAT.ownerOnly
//   ข้อความโควตา (cards.CHAT.quota) แสดงเสมอ · ปิดครบ 4 ตัว = กรอบประ cards.CHAT.allOff (W15: ไม่ติ๊กล่วงหน้า · ไม่เขียนตอนโหลด)
//   ปุ่มเจ้าของร้าน cards.CHAT.sheetOpen → แผ่น: ชนิดสถานะ 4 ช่อง (ป้าย orders.event.*) + ชั่วโมงพักบอท (จำนวนเต็ม 1–72) ·
//     บันทึก = ส่งเฉพาะคีย์ที่เปลี่ยน · ปฏิเสธ = ข้อความใต้ช่องตาม field
// 🔴 การ์ดไม่ LINKED (ยังไม่เชื่อม LINE) ⇒ เปิดสวิตช์ไม่ได้ (ปุ่มปิด + title cards.CHAT.off · ลิงก์จัดการอยู่ท้ายการ์ดเดิม) — สวิตช์ที่เปิดอยู่ยังปิดได้
// 🔴 ไม่มีชื่อ LINE / externalUserId / ห้องแชทใด ๆ ในจอนี้ (CD-P37U-8) · ไม่มีตัวอย่างข้อความบอท (CD-P37U-9) · ไม่มีข้อความไทยนอก t() · ปุ่ม ≥ 44px

import { useState } from "react";
import { useTranslations } from "next-intl";
import { setPosChatSettingsAction } from "@/lib/modules/pos/chat-link-actions";
import { POS_CHAT_PAUSE_HOURS, POS_CHAT_STATUS_KINDS, POS_CHAT_SWITCHES, type PosChatSettings, type PosChatStatusKind, type PosChatSwitch } from "@/lib/modules/pos/chat-link-shared";
import { settingsRefusalMessageKey } from "@/lib/modules/pos/settings-shared";
import { REG_DIALOG_PANEL, RegisterDialog, SheetGrab } from "@/components/pos/register/RegisterDialog";
import { MiniKnob } from "./shark-ui";

type Refusal = { code: string; field?: string };
/** คำปฏิเสธของตัวเขียน → คีย์ใต้ pos.settings (เจ้าของร้านเท่านั้น = ownerOnly) */
const refusalKey = (r: Refusal) => (r.code === "PERMISSION_DENIED" ? "cards.CHAT.ownerOnly" : settingsRefusalMessageKey(r.code));
const ROW = "flex min-h-11 items-center gap-3 border-t py-0.5 text-[12.5px] first:border-t-0";
const ROW_SWITCH = "grid min-h-11 min-w-11 shrink-0 place-items-center disabled:opacity-50";

export function ChatSettingsRows({ systemId, linked, isOwner, initial }: { systemId: string; linked: boolean; isOwner: boolean; initial: PosChatSettings }) {
  const t = useTranslations("pos.settings");
  const [chat, setChat] = useState<PosChatSettings>(initial);
  const [busy, setBusy] = useState<PosChatSwitch | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const allOff = POS_CHAT_SWITCHES.every((k) => !chat[k]);

  const flip = async (k: PosChatSwitch) => {
    if (busy) return;
    setBusy(k);
    setErr(null);
    try {
      const r = await setPosChatSettingsAction({ systemId, patch: { [k]: !chat[k] } });
      if (r.ok) setChat(r.chat);
      else setErr(refusalKey(r));
    } catch {
      setErr("cards.CHAT.saveFailed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div data-testid="pos-settings-chat-rows" className="flex flex-col gap-2">
      <div className="flex flex-col">
        {POS_CHAT_SWITCHES.map((k) => {
          const on = chat[k];
          const label = t(`cards.CHAT.switches.${k}`);
          const lockedOn = !linked && !on; // ยังไม่เชื่อม LINE = เปิดไม่ได้ (ปิดได้)
          return (
            <div key={k} className={ROW}>
              <span className="min-w-0 flex-1 text-[color:var(--color-ink-soft)]">{label}</span>
              {isOwner ? (
                <button
                  data-testid={`pos-settings-chat-row-${k}`}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={label}
                  disabled={busy !== null || lockedOn}
                  title={lockedOn ? t("cards.CHAT.off") : undefined}
                  className={ROW_SWITCH}
                  onClick={() => void flip(k)}
                >
                  <MiniKnob on={on} />
                </button>
              ) : (
                <span data-testid={`pos-settings-chat-row-${k}`} role="switch" aria-checked={on} aria-disabled="true" aria-label={label} title={t("cards.CHAT.ownerOnly")} className={ROW_SWITCH}>
                  <MiniKnob on={on} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <p data-testid="pos-settings-chat-quota" className="text-[11.5px] text-[color:var(--color-muted)]">
        {t("cards.CHAT.quota")}
      </p>
      {allOff && (
        <div data-testid="pos-settings-chat-all-off" className="inline-block self-start rounded-[8px] border border-dashed px-[9px] py-1.5 text-[11.5px] text-[color:var(--color-muted)]">
          {t("cards.CHAT.allOff")}
        </div>
      )}
      {isOwner ? (
        <button data-testid="pos-settings-chat-open" type="button" className="btn btn-ghost h-11 self-start rounded-[11px] px-4 text-[13px]" onClick={() => setSheet(true)}>
          {t("cards.CHAT.sheetOpen")}
        </button>
      ) : (
        <p data-testid="pos-settings-chat-owner-only" className="text-[11.5px] text-[color:var(--color-muted)]">
          {t("cards.CHAT.ownerOnly")}
        </p>
      )}
      {err && (
        <p data-testid="pos-settings-chat-error" role="alert" className="text-[11.5px] text-[color:var(--color-danger)]">
          {t(err)}
        </p>
      )}
      {sheet && isOwner && (
        <ChatMessageSettings
          systemId={systemId}
          initial={chat}
          onClose={() => setSheet(false)}
          onSaved={(next) => {
            setChat(next);
            setSheet(false);
          }}
        />
      )}
    </div>
  );
}

const sameKinds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

function ChatMessageSettings({ systemId, initial, onClose, onSaved }: { systemId: string; initial: PosChatSettings; onClose: () => void; onSaved: (chat: PosChatSettings) => void }) {
  const t = useTranslations("pos.settings");
  const te = useTranslations("pos.orders.event");
  const [kinds, setKinds] = useState<PosChatStatusKind[]>(initial.statusKinds);
  const [hours, setHours] = useState(String(initial.botPauseHours));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field: string | null; key: string } | null>(null);

  const save = async () => {
    if (busy) return;
    const patch: { statusKinds?: PosChatStatusKind[]; botPauseHours?: number } = {};
    if (!sameKinds(kinds, initial.statusKinds)) patch.statusKinds = POS_CHAT_STATUS_KINDS.filter((k) => kinds.includes(k));
    const h = hours.trim() === "" ? Number.NaN : Number(hours);
    if (h !== initial.botPauseHours) patch.botPauseHours = Number.isFinite(h) ? h : 0; // ค่าแปลก = ส่งให้ตัวเขียนตัดสิน (VALIDATION field)
    if (!Object.keys(patch).length) return onClose();
    setBusy(true);
    setErr(null);
    try {
      const r = await setPosChatSettingsAction({ systemId, patch });
      if (r.ok) return onSaved(r.chat);
      const field = typeof r.field === "string" ? r.field : null;
      setErr({ field, key: refusalKey(r) });
    } catch {
      setErr({ field: null, key: "cards.CHAT.saveFailed" });
    } finally {
      setBusy(false);
    }
  };
  const fieldErr = (f: string) =>
    err?.field === f ? (
      <p data-testid="pos-settings-chat-error" role="alert" className="text-[12.5px] text-[color:var(--color-danger)]">
        {t(err.key)}
      </p>
    ) : null;

  return (
    <RegisterDialog onDismiss={() => !busy && onClose()} locked={busy}>
      <div data-testid="pos-settings-chat-sheet" className={REG_DIALOG_PANEL} role="dialog" aria-modal="true" aria-label={t("cards.CHAT.sheetTitle")}>
        <SheetGrab />
        <h2 className="text-[20px] font-bold">{t("cards.CHAT.sheetTitle")}</h2>
        <p className="text-[13.5px] leading-[1.6] text-[color:var(--color-ink-soft)]">{t("cards.CHAT.quota")}</p>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-[14px] font-semibold">{t("cards.CHAT.switches.orderStatus")}</legend>
          {POS_CHAT_STATUS_KINDS.map((k) => {
            const on = kinds.includes(k);
            return (
              <label key={k} className="flex min-h-11 items-center gap-3 text-[14px]">
                <input
                  data-testid={`pos-settings-chat-kind-${k}`}
                  type="checkbox"
                  className="size-5 shrink-0"
                  checked={on}
                  disabled={busy}
                  onChange={() => setKinds((xs) => (on ? xs.filter((x) => x !== k) : [...xs, k]))}
                />
                <span className="min-w-0 flex-1">{te(k)}</span>
              </label>
            );
          })}
          {fieldErr("statusKinds")}
        </fieldset>
        <label className="flex min-h-11 flex-wrap items-center gap-3 border-t pt-3 text-[14px]">
          <span className="min-w-0 flex-1">{t("cards.CHAT.botPauseHours")}</span>
          <input
            data-testid="pos-settings-chat-pause"
            type="number"
            inputMode="numeric"
            min={POS_CHAT_PAUSE_HOURS.min}
            max={POS_CHAT_PAUSE_HOURS.max}
            step={1}
            className="h-11 w-24 rounded-[10px] border bg-[color:var(--color-surface)] px-3 text-right text-[14px] tabular-nums"
            value={hours}
            disabled={busy}
            onChange={(e) => setHours(e.target.value)}
          />
        </label>
        {fieldErr("botPauseHours")}
        {err && (err.field === null || (err.field !== "statusKinds" && err.field !== "botPauseHours")) && (
          <p data-testid="pos-settings-chat-error" role="alert" className="text-[13px] text-[color:var(--color-danger)]">
            {t(err.key)}
          </p>
        )}
        <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button data-testid="pos-settings-chat-cancel" type="button" className="btn btn-ghost h-12 rounded-[13px] px-5 text-[15px]" disabled={busy} onClick={onClose}>
            {t("shark.cancel")}
          </button>
          <button data-testid="pos-settings-chat-save" type="button" className="btn btn-primary h-12 rounded-[13px] px-5 text-[15px] font-semibold disabled:opacity-60" disabled={busy} onClick={() => void save()}>
            {busy ? t("saving") : t("cards.CHAT.save")}
          </button>
        </div>
      </div>
    </RegisterDialog>
  );
}
