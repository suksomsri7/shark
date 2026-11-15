"use client";

// TaxT5Forms — ตัวควบคุมบนจอของใบงาน ACC T5 (เลน 2): รหัสอากรแสตมป์ · ธงบวกกลับ · ตัดหนี้สูญ · ค่าเผื่อหนี้สงสัยจะสูญ
//   เรียก server action (tax-t5-actions.ts) · คำเตือนจากทะเบียนกลาง ผ่าน LegalWarnings (กดยืนยันได้ ไม่บล็อก)
// 🔴 client: import ได้เฉพาะไฟล์ pure — ห้ามลาก prisma
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LegalWarning } from "@/lib/core/settings/legal/warnings";
import { LegalWarnings } from "./LegalWarnings";

type ActionRes = { ok: true; warnings?: LegalWarning[] } | { ok: false; reason: string; warnings?: LegalWarning[] };
const toSatang = (v: string) => {
  const n = Number.parseFloat(v.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const bahtTxt = (s: number) => (s / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Msg({ err, ok, testId }: { err: string | null; ok: string | null; testId: string }) {
  if (err) return <p className="text-xs text-[color:var(--color-danger)]" data-testid={`${testId}-error`}>{err}</p>;
  if (ok) return <p className="text-xs text-[color:var(--color-muted)]" data-testid={`${testId}-ok`}>{ok}</p>;
  return null;
}

/** T5.6 ▸ ช่องรหัสรับรองการเสียอากรแสตมป์ของเอกสาร */
export function StampDutyRefForm({ systemId, documentId, initial, save }: { systemId: string; documentId: string; initial: string | null; save: (systemId: string, documentId: string, ref: string | null) => Promise<ActionRes> }) {
  const [v, setV] = useState(initial ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await save(systemId, documentId, v.trim() || null);
          setErr(r.ok ? null : r.reason);
          setOk(r.ok ? "บันทึกแล้ว" : null);
          if (r.ok) router.refresh();
        });
      }}
      data-testid={`stamp-ref-form-${documentId}`}
    >
      <input className="input w-56 text-sm" value={v} onChange={(e) => setV(e.target.value)} maxLength={60} placeholder="รหัสรับรองการเสียอากร (อ.ส.9)" aria-label="รหัสรับรองการเสียอากร" data-testid="stamp-ref-input" />
      <button className="btn btn-ghost btn-sm" disabled={pending} data-testid="stamp-ref-save">{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
      <Msg err={err} ok={ok} testId="stamp-ref" />
    </form>
  );
}

/** T5.5 ▸ เลือกอนุมาตรา (หรือปลดธง/คืนค่าเริ่มต้น) ของบัญชี */
export function AddBackSelect({
  systemId,
  ledgerId,
  value,
  sections,
  save,
}: {
  systemId: string;
  ledgerId: string;
  /** รหัสที่มีผลตอนนี้ · null = ไม่ติดธง */
  value: string | null;
  sections: readonly { code: string; sectionTh: string; labelTh: string }[];
  save: (systemId: string, ledgerId: string, section: string | null) => Promise<ActionRes>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span className="inline-flex flex-col gap-1">
      <select
        className="input text-sm"
        value={value ?? "NONE"}
        disabled={pending}
        aria-label="ธงอาจต้องบวกกลับ"
        data-testid={`addback-select-${ledgerId}`}
        onChange={(e) => {
          const next = e.target.value === "DEFAULT" ? null : e.target.value;
          start(async () => {
            const r = await save(systemId, ledgerId, next);
            setErr(r.ok ? null : r.reason);
            if (r.ok) router.refresh();
          });
        }}
      >
        <option value="NONE">ไม่ติดธง</option>
        {sections.map((s) => (
          <option key={s.code} value={s.code}>
            {s.sectionTh} — {s.labelTh}
          </option>
        ))}
        <option value="DEFAULT">คืนค่าเริ่มต้นของระบบ</option>
      </select>
      {err && <span className="text-xs text-[color:var(--color-danger)]">{err}</span>}
    </span>
  );
}

/** T5.7 ▸ ตัดหนี้สูญของเอกสารหนึ่งใบ: กรอกยอด/วันที่ → ดูคำเตือนเงื่อนไขทางภาษี → ติ๊กยืนยัน → บันทึก */
export function WriteOffForm({
  systemId,
  documentId,
  docNo,
  outstanding,
  today,
  preview,
  save,
}: {
  systemId: string;
  documentId: string;
  docNo: string | null;
  outstanding: number;
  today: string;
  preview: (systemId: string, documentId: string, amountSatang: number | null, ymd: string) => Promise<ActionRes & { amount?: number; outstanding?: number }>;
  save: (systemId: string, input: { documentId: string; amountSatang: number | null; date: string; note: string; ack: string[] }) => Promise<ActionRes>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((outstanding / 100).toFixed(2));
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [warnings, setWarnings] = useState<LegalWarning[]>([]);
  const [ack, setAck] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const load = () =>
    start(async () => {
      const r = await preview(systemId, documentId, toSatang(amount), date);
      setErr(r.ok ? null : r.reason);
      setWarnings(r.warnings ?? []);
      setAck([]);
    });
  if (!open)
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        data-testid={`writeoff-open-${documentId}`}
        onClick={() => {
          setOpen(true);
          load();
        }}
      >
        ตัดหนี้สูญ…
      </button>
    );
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }} data-testid={`writeoff-form-${documentId}`}>
      <p className="text-sm font-medium">ตัดหนี้สูญ {docNo ?? ""} · ยอดค้าง {bahtTxt(outstanding)} บาท</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ยอดที่ตัด (บาท)
          <input className="input w-36 text-sm" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onBlur={load} data-testid="writeoff-amount" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          วันที่
          <input type="date" className="input text-sm" value={date} onChange={(e) => setDate(e.target.value)} onBlur={load} data-testid="writeoff-date" />
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          หมายเหตุ (หลักฐานการทวงถาม/เหตุผล)
          <input className="input text-sm" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} data-testid="writeoff-note" />
        </label>
      </div>
      <LegalWarnings warnings={warnings} onAckChange={setAck} testId="writeoff-warnings" />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending || warnings.some((w) => w.ack && !ack.includes(w.code))}
          data-testid="writeoff-save"
          onClick={() =>
            start(async () => {
              const r = await save(systemId, { documentId, amountSatang: toSatang(amount), date, note, ack });
              if (r.ok) {
                setOk("บันทึกตัดหนี้สูญแล้ว");
                setErr(null);
                setOpen(false);
                router.refresh();
              } else {
                setErr(r.reason);
                if (r.warnings) setWarnings(r.warnings);
              }
            })
          }
        >
          {pending ? "กำลังบันทึก…" : "บันทึกตัดหนี้สูญ"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} data-testid="writeoff-cancel">
          ยกเลิก
        </button>
        <Msg err={err} ok={ok} testId="writeoff" />
      </div>
    </div>
  );
}

/** T5.7 ▸ ตั้งยอดค่าเผื่อหนี้สงสัยจะสูญ */
export function AllowanceForm({ systemId, current, today, save }: { systemId: string; current: number; today: string; save: (systemId: string, input: { targetSatang: number; date: string; note: string }) => Promise<ActionRes> }) {
  const [target, setTarget] = useState((current / 100).toFixed(2));
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [warnings, setWarnings] = useState<LegalWarning[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex flex-col gap-2"
      data-testid="allowance-form"
      onSubmit={(e) => {
        e.preventDefault();
        const t = toSatang(target);
        if (t === null || t < 0) {
          setErr("กรอกยอดค่าเผื่อเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
          return;
        }
        start(async () => {
          const r = await save(systemId, { targetSatang: t, date, note });
          setErr(r.ok ? null : r.reason);
          setOk(r.ok ? "บันทึกแล้ว" : null);
          setWarnings(r.warnings ?? []);
          if (r.ok) router.refresh();
        });
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ยอดค่าเผื่อที่ต้องการ (บาท)
          <input className="input w-40 text-sm" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} data-testid="allowance-target" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ณ วันที่
          <input type="date" className="input text-sm" value={date} onChange={(e) => setDate(e.target.value)} data-testid="allowance-date" />
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          วิธีคำนวณ/หมายเหตุ
          <input className="input text-sm" value={note} maxLength={300} placeholder="เช่น ตามอายุหนี้เกิน 90 วัน" onChange={(e) => setNote(e.target.value)} data-testid="allowance-note" />
        </label>
        <button className="btn btn-primary btn-sm" disabled={pending} data-testid="allowance-save">{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
      </div>
      <LegalWarnings warnings={warnings} testId="allowance-warnings" />
      <Msg err={err} ok={ok} testId="allowance" />
    </form>
  );
}

// ═══ ACC T5c (เลน 2) ▸ หนี้สูญได้รับคืน · ยกเลิกรายการรับคืน · วันประชุมใหญ่อนุมัติงบ ═══
const RECOVERY_CHANNEL_TH: Record<string, string> = { CASH: "เงินสด", TRANSFER: "โอนเงิน", PROMPTPAY: "พร้อมเพย์", CARD: "บัตร", E_WALLET: "e-Wallet", CHEQUE: "เช็ค", OTHER: "อื่น ๆ" };

export function RecoveryForm({
  systemId,
  documentId,
  docNo,
  recoverable,
  today,
  save,
}: {
  systemId: string;
  documentId: string;
  docNo: string | null;
  recoverable: number;
  today: string;
  save: (systemId: string, input: { documentId: string; amountSatang: number | null; date: string; channel: string; note: string }) => Promise<ActionRes>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState((recoverable / 100).toFixed(2));
  const [date, setDate] = useState(today);
  const [channel, setChannel] = useState("TRANSFER");
  const [note, setNote] = useState("");
  const [warnings, setWarnings] = useState<LegalWarning[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const tid = `recover-${documentId}`;
  if (!open)
    return (
      <div className="flex flex-col gap-1">
        <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => setOpen(true)} data-testid={`${tid}-open`}>
          รับเงินคืน (หนี้สูญได้รับคืน)
        </button>
        <LegalWarnings warnings={warnings} testId={`${tid}-warnings`} />
        <Msg err={null} ok={ok} testId={tid} />
      </div>
    );
  return (
    <form
      className="flex flex-col gap-2 rounded-lg border p-3"
      style={{ borderColor: "var(--color-line)" }}
      data-testid={`${tid}-form`}
      onSubmit={(e) => {
        e.preventDefault();
        const a = toSatang(amount);
        if (a === null || a <= 0) {
          setErr("กรอกยอดที่ได้รับเป็นตัวเลขมากกว่า 0");
          return;
        }
        start(async () => {
          const r = await save(systemId, { documentId, amountSatang: a, date, channel, note });
          setErr(r.ok ? null : r.reason);
          setWarnings(r.warnings ?? []);
          if (r.ok) {
            setOk(`บันทึกรายได้หนี้สูญได้รับคืน ${bahtTxt(a)} บาทแล้ว`);
            setOpen(false);
            router.refresh();
          }
        });
      }}
    >
      <p className="text-xs text-[color:var(--color-muted)]">{docNo ?? "-"} · ยังรับคืนได้อีก {bahtTxt(recoverable)} บาท · ลงเป็นรายได้ "หนี้สูญได้รับคืน" ไม่เปิดลูกหนี้ใบเดิมกลับมา</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ยอดที่ได้รับ (บาท)
          <input className="input w-36 text-sm" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid={`${tid}-amount`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          วันที่ได้รับ
          <input type="date" className="input text-sm" value={date} onChange={(e) => setDate(e.target.value)} data-testid={`${tid}-date`} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ช่องทาง
          <select className="input text-sm" value={channel} onChange={(e) => setChannel(e.target.value)} data-testid={`${tid}-channel`}>
            {Object.entries(RECOVERY_CHANNEL_TH).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          หมายเหตุ
          <input className="input text-sm" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} data-testid={`${tid}-note`} />
        </label>
        <button className="btn btn-primary btn-sm" disabled={pending} data-testid={`${tid}-save`}>{pending ? "กำลังบันทึก…" : "บันทึกรับคืน"}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} data-testid={`${tid}-cancel`}>ปิด</button>
      </div>
      <Msg err={err} ok={null} testId={tid} />
    </form>
  );
}

export function RecoveryVoidButton({ systemId, recoveryId, save }: { systemId: string; recoveryId: string; save: (systemId: string, recoveryId: string, reason: string) => Promise<ActionRes> }) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const tid = `recovery-void-${recoveryId}`;
  if (!open)
    return (
      <button type="button" className="text-xs underline print:hidden" onClick={() => setOpen(true)} data-testid={`${tid}-open`}>
        ยกเลิก
      </button>
    );
  return (
    <span className="inline-flex flex-wrap items-center gap-1 print:hidden">
      <input className="input w-44 text-xs" placeholder="เหตุผล (อย่างน้อย 5 ตัวอักษร)" value={reason} onChange={(e) => setReason(e.target.value)} data-testid={`${tid}-reason`} />
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        data-testid={`${tid}-confirm`}
        onClick={() =>
          start(async () => {
            const r = await save(systemId, recoveryId, reason);
            setErr(r.ok ? null : r.reason);
            if (r.ok) router.refresh();
          })
        }
      >
        ยืนยันยกเลิก (กลับรายการ)
      </button>
      {err && <span className="text-xs text-[color:var(--color-danger)]" data-testid={`${tid}-error`}>{err}</span>}
    </span>
  );
}

export function StatementMeetingForm({ systemId, fyEnd, initial, save }: { systemId: string; fyEnd: string; initial: string | null; save: (systemId: string, fyEnd: string, meetingDate: string | null) => Promise<ActionRes> }) {
  const [v, setV] = useState(initial ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex flex-wrap items-end gap-2 print:hidden"
      data-testid="meeting-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await save(systemId, fyEnd, v || null);
          setErr(r.ok ? null : r.reason);
          setOk(r.ok ? (v ? "บันทึกแล้ว — ปฏิทินคำนวณวันยื่นงบให้" : "ล้างวันประชุมแล้ว") : null);
          if (r.ok) router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        วันประชุมใหญ่ที่อนุมัติงบรอบนี้
        <input type="date" className="input text-sm" value={v} onChange={(e) => setV(e.target.value)} data-testid="meeting-date" />
      </label>
      <button className="btn btn-ghost btn-sm" disabled={pending} data-testid="meeting-save">{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
      <Msg err={err} ok={ok} testId="meeting" />
    </form>
  );
}
