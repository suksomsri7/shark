// GiftCardSettingsForm.tsx — หน้า "ตั้งค่า Gift Card" (M2.6 · ภาพ 20)
//
// 6 ค่าตามสัญญา: เปิดใช้ · ผูกกับโมดูลบัญชี · อายุบัตร (เดือน) · มูลค่าที่ให้เลือก · โอนเจ้าของได้ · เติมเงินได้
// 🔴 อายุบัตรขั้นต่ำ 12 เดือนตามกฎหมาย — service เป็นคนบังคับ หน้าจอแค่บอกล่วงหน้าเพื่อไม่ให้เสียเวลากรอก
// 🔴 ไม่มีอีโมจิ/สีฮาร์ดโค้ด · error ภาษาไทยจาก server action (ไม่แต่งข้อความเองที่นี่)
"use client";

import { useState } from "react";
import { formatBaht } from "@/lib/ui/money";
import type { GiftCardSettingsDto } from "@/lib/modules/giftcard/service";
import { setGiftCardSettingsAction } from "@/lib/modules/giftcard/giftcard-actions";
import { MemberIcon } from "./MemberIcon";

function Row({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-3" style={{ borderTop: "1px solid var(--color-line)" }}>
      <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {desc}
        </span>
      </div>
      {children}
    </div>
  );
}

function Switch({
  on,
  label,
  onToggle,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className="rounded-full px-3 py-1 text-xs"
      style={{
        border: "1px solid var(--color-line)",
        background: on ? "var(--color-ink)" : "var(--color-surface-2)",
        color: on ? "var(--color-surface)" : "var(--color-muted)",
      }}
      onClick={onToggle}
    >
      {on ? "เปิดอยู่" : "ปิดอยู่"}
    </button>
  );
}

export function GiftCardSettingsForm({
  systemId,
  settings: initial,
}: {
  systemId: string;
  settings: GiftCardSettingsDto;
}) {
  const [settings, setSettings] = useState<GiftCardSettingsDto>(initial);
  const [months, setMonths] = useState(String(initial.expiryMonths));
  const [denoms, setDenoms] = useState(initial.denominations.map((d) => String(d / 100)).join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const save = async (patch: Partial<GiftCardSettingsDto>) => {
    setBusy(true);
    setError(null);
    setSaved(null);
    const res = await setGiftCardSettingsAction({ systemId, ...patch });
    setBusy(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    setSettings(res.data);
    setMonths(String(res.data.expiryMonths));
    setDenoms(res.data.denominations.map((d) => String(d / 100)).join(", "));
    setSaved("บันทึกแล้ว");
  };

  const saveNumbers = async () => {
    const parsedMonths = Number(months);
    const parsedDenoms = denoms
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => Math.round(Number(s) * 100));
    await save({ expiryMonths: parsedMonths, denominations: parsedDenoms });
  };

  return (
    <div data-testid="giftcards-settings" className="card p-4">
      <form
        data-testid="giftcards-settings-form"
        className="flex flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void saveNumbers();
        }}
      >
        <div className="flex items-center gap-2 pb-2">
          <MemberIcon name="gift" />
          <h2 className="text-sm font-semibold">ตั้งค่าบัตรกำนัล</h2>
        </div>

        <Row title="เปิดขายบัตรกำนัล" desc="ปิดอยู่ = ปุ่มขายจะไม่ทำงาน (บัตรที่ออกไปแล้วยังใช้ได้ตามปกติ)">
          <Switch
            on={settings.enabled}
            label="เปิดขายบัตรกำนัล"
            onToggle={() => void save({ enabled: !settings.enabled })}
          />
        </Row>

        <Row
          title="ผูกกับโมดูลบัญชี"
          desc="เปิด — ขาย = รับเงินล่วงหน้า (หนี้สิน 2110) · ใช้ = รับรู้รายได้ (4030) · หมดอายุ = รายได้อื่น (4900) · สลับกลางทางมีผลกับรายการหลังจากนี้เท่านั้น"
        >
          <Switch
            on={settings.accountingLink}
            label="ผูกกับโมดูลบัญชี"
            onToggle={() => void save({ accountingLink: !settings.accountingLink })}
          />
        </Row>

        <Row title="อายุบัตร (เดือน)" desc="หมดอายุขั้นต่ำตามกฎหมาย 12 เดือน — ตั้งสั้นกว่านี้ระบบจะไม่รับ">
          <input
            className="input"
            style={{ maxWidth: 120 }}
            inputMode="numeric"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
          />
        </Row>

        <Row title="มูลค่าที่ให้เลือก (บาท)" desc="คั่นด้วยจุลภาค เช่น 1000, 2000, 5000 — โชว์เป็นปุ่มบนหน้าขาย">
          <input className="input" style={{ maxWidth: 260 }} value={denoms} onChange={(e) => setDenoms(e.target.value)} />
        </Row>

        <Row title="โอนเจ้าของได้" desc="ลูกค้าโอนบัตรให้สมาชิกอีกคนได้ด้วยตัวเอง (ต้องใส่ PIN)">
          <Switch
            on={settings.transferable}
            label="โอนเจ้าของได้"
            onToggle={() => void save({ transferable: !settings.transferable })}
          />
        </Row>

        <Row title="เติมเงินได้" desc="เติมเงินเข้าบัตรใบเดิมผ่าน POS ได้ (บัตรที่ใช้หมดแล้วกลับมาใช้ได้อีก)">
          <Switch
            on={settings.reloadable}
            label="เติมเงินได้"
            onToggle={() => void save({ reloadable: !settings.reloadable })}
          />
        </Row>

        <div className="flex items-center gap-2 pt-3">
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "กำลังบันทึก..." : "บันทึกอายุบัตรและมูลค่า"}
          </button>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            ค่าที่ตั้งไว้ตอนนี้: {settings.expiryMonths} เดือน ·{" "}
            {settings.denominations.map((d) => formatBaht(d)).join(" / ")}
          </span>
        </div>

        {error && (
          <p data-testid="giftcards-settings-error" className="pt-2 text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="pt-2 text-sm" style={{ color: "var(--color-muted)" }}>
            {saved}
          </p>
        )}
      </form>
    </div>
  );
}

export default GiftCardSettingsForm;
