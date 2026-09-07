// NotifyPrefs.tsx — บล็อก "การแจ้งเตือนของฉัน" ในหน้า ตั้งค่า › บอร์ดงาน (K2.11 · §7.4)
//
// ค่าที่ตั้งที่นี่เป็นของ **คน** ไม่ใช่ของร้าน (เก็บที่ `User.prefs` ผ่าน core/user-preferences)
// ⇒ ตั้งครั้งเดียวใช้ทุกร้านที่เขาเป็นพนักงาน · ผู้ดูแลตั้งแทนคนอื่นไม่ได้ (action ผูก session เสมอ)
//
// 🔴 สิ่งที่ปิดไม่ได้ (ตาราง §7.4): @กล่าวถึง · มอบหมายงาน · เชิญเข้าบอร์ด — สามอย่างนี้คือ "มีคนเรียกคุณ
//    โดยตรง" ถ้าปิดได้แล้วมีคนปิด งานจะเงียบหายทั้งเส้น (บอกไว้บนจอตรง ๆ ไม่ให้ผู้ใช้เดา)
"use client";

import { useState, useTransition } from "react";
import { KanbanIcon } from "./KanbanIcon";
import { setKanbanNotifyPrefsAction } from "@/lib/modules/kanban/actions";
import type { KanbanDigestMode, KanbanEmailMode } from "@/lib/core/user-preferences";

const EMAIL_OPTIONS: { value: KanbanEmailMode; label: string; hint: string }[] = [
  { value: "OFF", label: "ไม่ส่ง", hint: "ดูในแอปอย่างเดียว" },
  { value: "HOURLY", label: "สรุปรายชั่วโมง", hint: "รวมเป็นฉบับเดียว (แนะนำ)" },
  { value: "INSTANT", label: "ทันที", hint: "ทุกเรื่อง ทุกใบ" },
];

const DIGEST_OPTIONS: { value: KanbanDigestMode; label: string; hint: string }[] = [
  { value: "OFF", label: "ไม่ส่ง", hint: "ไม่ต้องสรุปให้" },
  { value: "DAILY", label: "ทุกวัน", hint: "เช้าวันละฉบับ" },
  { value: "WEEKLY", label: "ทุกสัปดาห์", hint: "เช้าวันจันทร์" },
];

export function NotifyPrefs({
  emailMode,
  digest,
}: {
  emailMode: KanbanEmailMode;
  digest: KanbanDigestMode;
}) {
  const [mode, setMode] = useState<KanbanEmailMode>(emailMode);
  const [dig, setDig] = useState<KanbanDigestMode>(digest);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (patch: { emailMode?: KanbanEmailMode; digest?: KanbanDigestMode }) => {
    const prev = { mode, dig };
    if (patch.emailMode) setMode(patch.emailMode);
    if (patch.digest) setDig(patch.digest);
    setError(null);
    startTransition(async () => {
      try {
        const res = await setKanbanNotifyPrefsAction(patch);
        setMode(res.kanbanEmailMode);
        setDig(res.kanbanDigest);
        setSaved("บันทึกแล้ว");
      } catch {
        // ผิดพลาด = คืนค่าเดิมบนจอ (ห้ามให้จอบอกว่าบันทึกแล้วทั้งที่ไม่ได้บันทึก)
        setMode(prev.mode);
        setDig(prev.dig);
        setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    });
  };

  return (
    <section data-testid="notify-prefs" className="card flex flex-col gap-4" style={{ padding: 18 }}>
      <div className="flex items-center gap-2">
        <KanbanIcon name="bell" size="sm" />
        <h2 style={{ fontSize: 14.5, fontWeight: 700 }}>การแจ้งเตือนของฉัน</h2>
        {saved && !error && (
          <span style={{ fontSize: 11.5, color: "var(--color-muted)" }}>{pending ? "กำลังบันทึก…" : saved}</span>
        )}
        {error && <span style={{ fontSize: 11.5, color: "var(--color-danger)" }}>{error}</span>}
      </div>

      <Group
        title="อีเมลแจ้งเตือน"
        desc="เมื่อมีความเห็นใหม่ · การ์ดที่ติดตามถูกย้าย/เก็บ · ใกล้ถึงกำหนดส่ง"
        options={EMAIL_OPTIONS}
        value={mode}
        disabled={pending}
        onPick={(v) => save({ emailMode: v as KanbanEmailMode })}
        name="kanban-email-mode"
      />

      <Group
        title="อีเมลสรุปงาน"
        desc="รวมงานเลยกำหนด · ถึงกำหนดวันนี้ · สัปดาห์นี้ · ที่เพิ่งได้รับมอบหมาย"
        options={DIGEST_OPTIONS}
        value={dig}
        disabled={pending}
        onPick={(v) => save({ digest: v as KanbanDigestMode })}
        name="kanban-digest"
      />

      <p style={{ fontSize: 11.5, color: "var(--color-muted)", lineHeight: 1.6 }}>
        การ @กล่าวถึง · มอบหมายงาน · เชิญเข้าบอร์ด แจ้งทันทีเสมอ ปิดไม่ได้
      </p>
    </section>
  );
}

function Group({
  title,
  desc,
  options,
  value,
  disabled,
  onPick,
  name,
}: {
  title: string;
  desc: string;
  options: { value: string; label: string; hint: string }[];
  value: string;
  disabled: boolean;
  onPick: (value: string) => void;
  name: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: "var(--color-muted)" }}>{desc}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              name={name}
              disabled={disabled}
              aria-pressed={active}
              onClick={() => !active && onPick(o.value)}
              className="flex flex-col items-start rounded-xl border px-3 py-2 text-left"
              style={{
                minWidth: 150,
                borderColor: active ? "var(--color-ink)" : "var(--color-line)",
                background: active ? "var(--color-surface-2)" : "var(--color-surface)",
              }}
            >
              <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 500 }}>{o.label}</span>
              <span style={{ fontSize: 11, color: "var(--color-muted)" }}>{o.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default NotifyPrefs;
