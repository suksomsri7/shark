"use client";

// EtaxTsPanels — ACC T5.4 (เลน 2) ▸ ตัวควบคุมบนจอของ e-Tax Invoice by Time Stamp
//   EtaxSendControls: ดูคำเตือน → ติ๊กยืนยัน (ถ้ามี) → ส่ง / ส่งซ้ำ / ส่งไฟล์ประทับเวลาซ้ำให้ผู้ซื้อ · อัปโหลดไฟล์ที่ระบบประทับเวลาส่งกลับ
//   EtaxSettingsForm: ค่าตั้ง (เปิด/ปิด · อัตโนมัติ · อีเมลผู้ส่ง · สำเนาถึง · รูปวันที่ · ยืนยันสิทธิ)
// 🔴 client: import ได้เฉพาะไฟล์ pure — ห้ามลาก prisma
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LegalWarning } from "@/lib/core/settings/legal/warnings";
import { LegalWarnings } from "./LegalWarnings";

type Res = { ok: true; warnings?: LegalWarning[]; message?: string } | { ok: false; reason: string; warnings?: LegalWarning[] };

export function EtaxSendControls({
  systemId,
  documentId,
  defaultTo,
  hasAttempt,
  stamped,
  canSend,
  preview,
  send,
  upload,
}: {
  systemId: string;
  documentId: string;
  defaultTo: string;
  hasAttempt: boolean;
  stamped: boolean;
  canSend: boolean;
  preview: (systemId: string, documentId: string) => Promise<Res>;
  send: (systemId: string, input: { documentId: string; to: string; mode: "SEND" | "RESEND_STAMPED"; ack: string[] }) => Promise<Res>;
  upload: (systemId: string, input: { documentId: string; fileName: string; base64: string }) => Promise<Res>;
}) {
  const [open, setOpen] = useState<null | "SEND" | "RESEND_STAMPED">(null);
  const [to, setTo] = useState(defaultTo);
  const [warnings, setWarnings] = useState<LegalWarning[]>([]);
  const [ack, setAck] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const router = useRouter();
  const begin = (mode: "SEND" | "RESEND_STAMPED") => {
    setErr(null);
    setOk(null);
    setOpen(mode);
    setAck([]);
    start(async () => {
      const r = await preview(systemId, documentId);
      if (!r.ok) setErr(r.reason);
      setWarnings(mode === "SEND" ? (r.warnings ?? []) : []);
    });
  };
  const blocked = warnings.some((w) => w.ack && !ack.includes(w.code));
  return (
    <div className="flex flex-col gap-2 print:hidden" data-testid="etax-controls">
      {!open && (
        <div className="flex flex-wrap gap-2">
          {canSend && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => begin("SEND")} data-testid="etax-send-open">
              {hasAttempt ? "ส่งซ้ำ (เมื่อระบบตอบว่าประทับเวลาไม่ได้)" : "ส่ง e-Tax (ประทับเวลา)"}
            </button>
          )}
          {stamped && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => begin("RESEND_STAMPED")} data-testid="etax-resend-stamped-open">
              ส่งไฟล์ประทับเวลาซ้ำให้ผู้ซื้อ
            </button>
          )}
        </div>
      )}
      {open && (
        <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--color-line)" }} data-testid="etax-send-form">
          <p className="text-xs text-[color:var(--color-muted)]">
            {open === "SEND"
              ? "ระบบสร้างไฟล์ PDF 1 ไฟล์จากข้อมูลที่ออกเอกสาร แล้วส่งอีเมล 1 ฉบับถึงผู้ซื้อ 1 ที่อยู่ พร้อมสำเนาถึงระบบประทับเวลา"
              : "ส่งไฟล์ที่ได้รับการประทับเวลาแล้วฉบับเดิมให้ผู้ซื้ออีกครั้ง (ผู้ซื้อทำไฟล์หาย — ไม่ต้องออกใบแทน)"}
          </p>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            อีเมลผู้ซื้อ (1 ที่อยู่)
            <input className="input text-sm" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="buyer@example.com" data-testid="etax-to" />
          </label>
          <LegalWarnings warnings={warnings} onAckChange={setAck} testId="etax-send-warnings" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={pending || blocked || !to.trim()}
              data-testid="etax-send-confirm"
              onClick={() =>
                start(async () => {
                  const r = await send(systemId, { documentId, to, mode: open, ack });
                  if (!r.ok) {
                    setErr(r.reason);
                    if (r.warnings?.length) setWarnings(r.warnings);
                    return;
                  }
                  setOk(r.message ?? "ส่งแล้ว");
                  setOpen(null);
                  router.refresh();
                })
              }
            >
              {pending ? "กำลังส่ง…" : "ยืนยันส่ง"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(null)} data-testid="etax-send-cancel">
              ยกเลิก
            </button>
          </div>
        </div>
      )}
      {hasAttempt && (
        <form
          className="flex flex-wrap items-center gap-2"
          data-testid="etax-stamped-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) {
              setErr("เลือกไฟล์ PDF ที่ระบบประทับเวลาส่งกลับ");
              return;
            }
            start(async () => {
              // ส่งเป็นข้อความ base64 (ไม่ใช้ multipart) — ไฟล์ไม่เกิน 5 MB
              let buf: Uint8Array;
              try {
                buf = new Uint8Array(await file.arrayBuffer());
              } catch {
                setErr("อ่านไฟล์ที่เลือกไม่ได้ — เลือกไฟล์ใหม่อีกครั้ง");
                return;
              }
              let bin = "";
              for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
              const r = await upload(systemId, { documentId, fileName: file.name, base64: btoa(bin) });
              setErr(r.ok ? null : r.reason);
              setOk(r.ok ? (r.message ?? "บันทึกแล้ว") : null);
              if (r.ok) {
                setFile(null);
                router.refresh();
              }
            });
          }}
        >
          <span className="text-xs text-[color:var(--color-muted)]">ไฟล์ PDF ที่ระบบประทับเวลาส่งกลับ</span>
          <label className="btn btn-ghost btn-sm cursor-pointer">
            เลือกไฟล์
            <input type="file" name="file" accept="application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} data-testid="etax-stamped-file" />
          </label>
          <span className="text-xs" data-testid="etax-stamped-name">{file ? file.name : "ยังไม่ได้เลือกไฟล์"}</span>
          <button className="btn btn-ghost btn-sm" disabled={pending || !file} data-testid="etax-stamped-save">บันทึกไฟล์ประทับเวลา</button>
        </form>
      )}
      {err && <p className="text-xs text-[color:var(--color-danger)]" data-testid="etax-error">{err}</p>}
      {ok && <p className="text-xs text-[color:var(--color-muted)]" data-testid="etax-ok">{ok}</p>}
    </div>
  );
}

export function EtaxSettingsForm({
  systemId,
  initial,
  tableCc,
  labels,
  save,
}: {
  systemId: string;
  initial: { enabled: boolean; autoOnIssue: boolean; senderEmail: string; ccAddress: string; ccSource: "SHOP" | "TABLE"; subjectDateFormat: string; eligibility: string };
  tableCc: string;
  labels: { formats: Record<string, string>; eligibility: Record<string, string> };
  save: (systemId: string, patch: Record<string, unknown>) => Promise<Res>;
}) {
  const [v, setV] = useState({ ...initial, ccAddress: initial.ccSource === "SHOP" ? initial.ccAddress : "" });
  const [warnings, setWarnings] = useState<LegalWarning[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      className="flex flex-col gap-3"
      data-testid="etax-settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await save(systemId, v);
          setErr(r.ok ? null : r.reason);
          setOk(r.ok ? "บันทึกแล้ว" : null);
          setWarnings(r.warnings ?? []);
          if (r.ok) router.refresh();
        });
      }}
    >
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} data-testid="etax-enabled" />
        เปิดการส่ง e-Tax แบบประทับเวลา (ปุ่มส่งขึ้นบนใบกำกับภาษี ใบเพิ่มหนี้ ใบลดหนี้)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.autoOnIssue} onChange={(e) => setV({ ...v, autoOnIssue: e.target.checked })} data-testid="etax-auto" />
        ส่งอัตโนมัติเมื่อออกเอกสารที่มีอีเมลผู้ซื้อ (เฉพาะเมื่อยืนยันสิทธิด้านล่างแล้ว)
      </label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          อีเมลที่ร้านแจ้งกรมสรรพากรไว้สำหรับส่ง (ผู้ส่ง)
          <input className="input text-sm" type="email" value={v.senderEmail} onChange={(e) => setV({ ...v, senderEmail: e.target.value })} placeholder="tax@ร้าน.com" data-testid="etax-sender" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          อีเมลระบบประทับเวลา (สำเนาถึง) — ว่าง = {tableCc}
          <input className="input text-sm" type="email" value={v.ccAddress} onChange={(e) => setV({ ...v, ccAddress: e.target.value })} placeholder={tableCc} data-testid="etax-cc" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          รูปวันที่ในหัวเรื่องอีเมล
          <select className="input text-sm" value={v.subjectDateFormat} onChange={(e) => setV({ ...v, subjectDateFormat: e.target.value })} data-testid="etax-date-format">
            {Object.entries(labels.formats).map(([k, t]) => (
              <option key={k} value={k}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          สิทธิจัดทำใบกำกับภาษีโดยการประทับเวลา (ร้านยืนยันเอง)
          <select className="input text-sm" value={v.eligibility} onChange={(e) => setV({ ...v, eligibility: e.target.value })} data-testid="etax-eligibility">
            {Object.entries(labels.eligibility).map(([k, t]) => (
              <option key={k} value={k}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      <LegalWarnings warnings={warnings} testId="etax-settings-warnings" />
      <div className="flex items-center gap-2">
        <button className="btn btn-primary btn-sm" disabled={pending} data-testid="etax-settings-save">{pending ? "กำลังบันทึก…" : "บันทึก"}</button>
        {err && <span className="text-xs text-[color:var(--color-danger)]" data-testid="etax-settings-error">{err}</span>}
        {ok && <span className="text-xs text-[color:var(--color-muted)]" data-testid="etax-settings-ok">{ok}</span>}
      </div>
    </form>
  );
}
