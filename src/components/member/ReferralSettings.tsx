"use client";

// ReferralSettings.tsx — ซ้ายของหน้า "แนะนำเพื่อน" (M3.5 · ภาพ 24): รางวัล · กันโกง · ข้อความแชร์ LINE
// + สวิตช์ "เปิดใช้งาน" ที่หัวหน้าจอ (ReferralEnabledSwitch)
//
// 🔴 client component: import ได้เฉพาะ `referrals-shared.ts` (ไฟล์บริสุทธิ์) + server action — ห้าม `./referrals`
//    (ลากถึงฐานข้อมูล → next build พัง · บทเรียน M3.1)
// 🔴 ข้อความผิดพลาดขึ้นใต้ปุ่มบันทึก (ไม่ใช่กล่องเด้ง) · ไม่มีสิทธิ์ = เห็นค่าแต่แก้ไม่ได้
import { useState, useTransition } from "react";
import { saveReferralProgramAction, toggleReferralProgramAction } from "@/lib/modules/member/referrals-actions";
import type { ReferralProgramDto, ReferralRewardValue, SetReferralProgramInput } from "@/lib/modules/member/referrals-shared";
import { MemberIcon } from "./MemberIcon";

type RewardChoice = "POINTS" | "FIXED" | "PERCENT";

function choiceOf(kind: "POINTS" | "VOUCHER", value: ReferralRewardValue): RewardChoice {
  if (kind === "POINTS") return "POINTS";
  return "kind" in value && value.kind === "PERCENT" ? "PERCENT" : "FIXED";
}

function amountOf(value: ReferralRewardValue): string {
  return "points" in value ? String(value.points) : String(value.value);
}

function daysOf(value: ReferralRewardValue): string {
  return "validDays" in value ? String(value.validDays) : "30";
}

/** ช่องกรอกตัวเลข — ค่าว่างส่งเป็น undefined (ให้ service ใช้ค่าปริยาย/ตรวจเอง ไม่ใช่ Number("") = 0) */
const numOrUndef = (s: string): number | undefined => (s.trim() === "" ? undefined : Number(s));

function toInput(choice: RewardChoice, amount: string, days: string): { kind: "POINTS" | "VOUCHER"; value: Record<string, unknown> } {
  if (choice === "POINTS") return { kind: "POINTS", value: { points: numOrUndef(amount) } };
  return { kind: "VOUCHER", value: { kind: choice, value: numOrUndef(amount), validDays: numOrUndef(days) } };
}

const REWARD_OPTIONS: { value: RewardChoice; label: string }[] = [
  { value: "POINTS", label: "แต้ม" },
  { value: "FIXED", label: "voucher ฿" },
  { value: "PERCENT", label: "voucher %" },
];

function SetRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 border-t py-2.5 sm:flex-row sm:items-center sm:gap-3" style={{ borderColor: "var(--color-line)" }}>
      <span className="shrink-0 text-sm sm:w-[130px]" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function RewardEditor({
  prefix,
  choice,
  amount,
  days,
  disabled,
  onChoice,
  onAmount,
  onDays,
}: {
  prefix: string;
  choice: RewardChoice;
  amount: string;
  days: string;
  disabled: boolean;
  onChoice: (c: RewardChoice) => void;
  onAmount: (v: string) => void;
  onDays: (v: string) => void;
}) {
  const unit = choice === "POINTS" ? "แต้ม" : choice === "FIXED" ? "บาท" : "%";
  return (
    <>
      <select
        data-testid={`${prefix}-kind`}
        className="input text-sm"
        style={{ width: 160, minWidth: 0 }}
        value={choice}
        disabled={disabled}
        onChange={(e) => onChoice(e.target.value as RewardChoice)}
        aria-label={`ชนิดของ${prefix === "referrals-referrer" ? "รางวัลผู้แนะนำ" : "รางวัลเพื่อน"}`}
      >
        {REWARD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="flex items-center gap-1.5">
        <input
          data-testid={`${prefix}-value`}
          className="input text-sm"
          style={{ width: 84, minWidth: 64 }}
          inputMode="numeric"
          value={amount}
          disabled={disabled}
          onChange={(e) => onAmount(e.target.value)}
          aria-label="มูลค่ารางวัล"
        />
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {unit}
        </span>
      </span>
      {choice !== "POINTS" && (
        <span className="flex items-center gap-1.5">
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            อายุ
          </span>
          <input
            className="input text-sm"
            style={{ width: 64, minWidth: 56 }}
            inputMode="numeric"
            value={days}
            disabled={disabled}
            onChange={(e) => onDays(e.target.value)}
            aria-label="อายุ voucher (วัน)"
          />
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            วัน
          </span>
        </span>
      )}
    </>
  );
}

export function ReferralEnabledSwitch({ systemId, enabled, canManage }: { systemId: string; enabled: boolean; canManage: boolean }) {
  const [on, setOn] = useState(enabled);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="เปิดใช้งานโปรแกรมแนะนำเพื่อน"
          data-testid="referrals-enabled"
          disabled={!canManage || pending}
          onClick={() =>
            start(async () => {
              setErr("");
              const next = !on;
              const res = await toggleReferralProgramAction(systemId, next);
              if (res.ok) setOn(next);
              else setErr(res.reason);
            })
          }
          className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full"
          style={{ background: on ? "var(--color-ink)" : "var(--color-surface-2)", border: "1px solid var(--color-line)" }}
        >
          <span
            className="inline-block h-3.5 w-3.5 rounded-full transition-transform"
            style={{ background: "var(--color-surface)", transform: on ? "translateX(18px)" : "translateX(3px)" }}
          />
        </button>
        <span className="text-sm" style={{ color: "var(--color-muted)" }}>
          เปิดใช้งาน
        </span>
      </span>
      {err && (
        <span className="text-xs" style={{ color: "var(--color-danger)" }}>
          {err}
        </span>
      )}
    </span>
  );
}

export function ReferralSettings({
  systemId,
  program,
  canManage,
  linkPattern,
}: {
  systemId: string;
  program: ReferralProgramDto;
  canManage: boolean;
  /** "shark.in.th/ref/{โค้ด}" — โดเมนจากคำขอที่เปิดอยู่ */
  linkPattern: string;
}) {
  const [aChoice, setAChoice] = useState<RewardChoice>(choiceOf(program.referrerRewardKind, program.referrerRewardValue));
  const [aAmount, setAAmount] = useState(amountOf(program.referrerRewardValue));
  const [aDays, setADays] = useState(daysOf(program.referrerRewardValue));
  const [bChoice, setBChoice] = useState<RewardChoice>(choiceOf(program.refereeRewardKind, program.refereeRewardValue));
  const [bAmount, setBAmount] = useState(amountOf(program.refereeRewardValue));
  const [bDays, setBDays] = useState(daysOf(program.refereeRewardValue));
  const [convertOn, setConvertOn] = useState(program.convertOn);
  const [minBaht, setMinBaht] = useState(program.minFirstPurchaseSatang === null ? "" : String(Math.round(program.minFirstPurchaseSatang / 100)));
  const [cap, setCap] = useState(program.monthlyCap === null ? "" : String(program.monthlyCap));
  const [fraud, setFraud] = useState(program.fraudPhoneDevice);
  const [shareText, setShareText] = useState(program.shareText);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const disabled = !canManage || pending;

  // เปลี่ยนชนิดรางวัล → เริ่มจากค่าตั้งต้นของชนิดใหม่ (300 แต้ม · ฿100 · 10%) แทนการใช้ตัวเลขเดิมข้ามหน่วย
  const pick = (setChoice: (c: RewardChoice) => void, setAmount: (s: string) => void) => (c: RewardChoice) => {
    setChoice(c);
    setAmount(c === "POINTS" ? "300" : c === "FIXED" ? "100" : "10");
  };

  const save = () =>
    start(async () => {
      setMsg(null);
      const a = toInput(aChoice, aAmount, aDays);
      const b = toInput(bChoice, bAmount, bDays);
      const minSatang = numOrUndef(minBaht);
      const input: SetReferralProgramInput = {
        referrerRewardKind: a.kind,
        referrerRewardValue: a.value as ReferralRewardValue,
        refereeRewardKind: b.kind,
        refereeRewardValue: b.value as ReferralRewardValue,
        convertOn,
        minFirstPurchaseSatang: minSatang === undefined ? null : Math.round(minSatang * 100),
        monthlyCap: numOrUndef(cap) ?? null,
        fraudPhoneDevice: fraud,
        shareText,
      };
      const res = await saveReferralProgramAction(systemId, input);
      setMsg(res.ok ? { ok: true, text: "บันทึกการตั้งค่าแล้ว" } : { ok: false, text: res.reason });
    });

  return (
    <div data-testid="referrals-settings" className="flex min-w-0 flex-col gap-3">
      <section className="card flex flex-col px-4 pb-2 pt-3">
        <h2 className="pb-2.5 font-semibold">รางวัล</h2>
        <SetRow label="รางวัลผู้แนะนำ">
          <RewardEditor
            prefix="referrals-referrer"
            choice={aChoice}
            amount={aAmount}
            days={aDays}
            disabled={disabled}
            onChoice={pick(setAChoice, setAAmount)}
            onAmount={setAAmount}
            onDays={setADays}
          />
        </SetRow>
        <SetRow label="รางวัลเพื่อน">
          <RewardEditor
            prefix="referrals-referee"
            choice={bChoice}
            amount={bAmount}
            days={bDays}
            disabled={disabled}
            onChoice={pick(setBChoice, setBAmount)}
            onAmount={setBAmount}
            onDays={setBDays}
          />
        </SetRow>
        <SetRow label="ให้เมื่อ">
          <select
            data-testid="referrals-convert-on"
            className="input text-sm"
            style={{ minWidth: 0, width: 190 }}
            value={convertOn}
            disabled={disabled}
            onChange={(e) => setConvertOn(e.target.value === "SIGNUP" ? "SIGNUP" : "FIRST_PURCHASE")}
            aria-label="ให้รางวัลเมื่อ"
          >
            <option value="FIRST_PURCHASE">เพื่อนซื้อครั้งแรก ≥ ขั้นต่ำ</option>
            <option value="SIGNUP">เพื่อนสมัครสมาชิก</option>
          </select>
          {convertOn === "FIRST_PURCHASE" && (
            <span className="flex items-center gap-1.5">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                ฿
              </span>
              <input
                data-testid="referrals-min"
                className="input text-sm"
                style={{ width: 90, minWidth: 64 }}
                inputMode="numeric"
                value={minBaht}
                disabled={disabled}
                onChange={(e) => setMinBaht(e.target.value)}
                aria-label="ยอดซื้อครั้งแรกขั้นต่ำ (บาท)"
              />
            </span>
          )}
        </SetRow>
        <SetRow label="จำกัด">
          <input
            data-testid="referrals-cap"
            className="input text-sm"
            style={{ width: 70, minWidth: 56 }}
            inputMode="numeric"
            value={cap}
            placeholder="ไม่จำกัด"
            disabled={disabled}
            onChange={(e) => setCap(e.target.value)}
            aria-label="จำนวนครั้งต่อเดือนต่อคน"
          />
          <span className="text-sm" style={{ color: "var(--color-muted)" }}>
            ครั้ง/เดือน/คน
          </span>
        </SetRow>
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">กันโกง</h2>
          <button
            type="button"
            role="switch"
            aria-checked={fraud}
            aria-label="เปิดกันโกงเบอร์/อุปกรณ์ซ้ำ"
            data-testid="referrals-fraud"
            className="rounded-full px-3 py-1 text-xs"
            disabled={disabled}
            onClick={() => setFraud((v) => !v)}
            style={{
              border: "1px solid var(--color-line)",
              background: fraud ? "var(--color-ink)" : "var(--color-surface-2)",
              color: fraud ? "var(--color-surface)" : "var(--color-muted)",
            }}
          >
            {fraud ? "เปิดอยู่" : "ปิดอยู่"}
          </button>
        </div>
        {[
          "ตรวจเบอร์โทรซ้ำ",
          "ตรวจลายนิ้วมืออุปกรณ์ซ้ำ (device fingerprint)",
        ].map((t) => (
          <div key={t} className="flex items-center gap-2 text-sm" style={{ color: fraud ? "var(--color-ink)" : "var(--color-muted)" }}>
            <MemberIcon name={fraud ? "check" : "x"} size="sm" />
            <span className="min-w-0">{t}</span>
          </div>
        ))}
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          เบอร์ซ้ำหรืออุปกรณ์ซ้ำกับผู้แนะนำ = ปฏิเสธอัตโนมัติ · แนะนำตัวเอง/ไม่ใช่สมาชิกใหม่ ปฏิเสธเสมอ
        </span>
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">ข้อความแชร์ LINE</h2>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            แก้ได้
          </span>
        </div>
        <textarea
          data-testid="referrals-share-text"
          className="input min-h-[84px] text-sm"
          value={shareText}
          disabled={disabled}
          onChange={(e) => setShareText(e.target.value)}
          aria-label="ข้อความแชร์ LINE"
        />
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          ตัวแปร: {"{ร้าน}"} {"{รางวัลเพื่อน}"} {"{link}"}
        </span>
        <div className="flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-line)" }}>
          <span style={{ color: "var(--color-muted)" }}>รูปแบบลิงก์:</span>
          <b className="min-w-0 truncate" data-testid="referrals-link-pattern">
            {linkPattern}
          </b>
          <span className="ml-auto" style={{ color: "var(--color-muted)" }}>
            <MemberIcon name="lookup" size="sm" />
          </span>
        </div>
      </section>

      {canManage && (
        <div className="flex flex-col gap-1.5">
          <button type="button" data-testid="referrals-save" className="btn btn-primary text-sm" disabled={pending} onClick={save}>
            {pending ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
          </button>
          {msg && (
            <span data-testid="referrals-save-msg" className="text-xs" style={{ color: msg.ok ? "var(--color-muted)" : "var(--color-danger)" }}>
              {msg.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default ReferralSettings;
