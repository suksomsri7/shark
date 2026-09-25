"use client";

// ฟอร์มสาธารณะ `/f/<token>` ฝั่งเบราว์เซอร์ (ใบ C2.6 · มติ C24)
//
// 🔴 ช่องหลอกบอต (honeypot) ต้อง **มองไม่เห็นจริง** (ไม่ใช่แค่ `type=hidden` ซึ่งบอตข้ามง่าย): ออกจากสายตา (ซ้าย -9999px)
//    + ความสูง 0 + `tabindex="-1"` (คนกด Tab ไม่เจอ) + `autocomplete="off"` + `aria-hidden`
// 🔴 ตั๋ว "เริ่มกรอกเมื่อไหร่" เป็น hidden input ที่เซิร์ฟเวอร์ออกให้ (HMAC) — ส่งเร็วกว่าเวลาขั้นต่ำ = ถูกปฏิเสธ
// 🔴 กดปุ่มส่งรัว ๆ (หรือบอตกดสองครั้งในจังหวะเดียว) = ส่งครั้งเดียว (ธงกันซ้ำตั้งแบบ synchronous ก่อน await ตัวแรก)
// 🔴 ข้อความผลลัพธ์ทั้งหมดขึ้น **inline** บนหน้า ไม่มี alert() ไม่มีหน้าเปล่า และไม่โทษผู้ใช้

import { useRef, useState } from "react";
import type { PublicFormActionResult } from "./actions";

export type PublicFormField = { key: string; label: string; type: string; required: boolean; options?: string[] };

const inputCls = "rounded-lg border px-3 py-2.5 text-sm text-[color:var(--color-ink)] bg-[color:var(--color-surface)]";

/**
 * 🔴 (รีวิวรอบ 2 · S1) หน้านี้ **ไม่ส่งรหัสผู้เข้าชมขึ้นไปเลย** — เซิร์ฟเวอร์อ่านคุกกี้ first-party ของคำขอเอง
 *    (ดู `actions.ts`) · ของเดิมฝั่งเบราว์เซอร์เป็นคนส่งค่านั้นมา (และเคยรับค่าจาก query ด้วย) ⇒ ใครก็ตามที่รู้
 *    รหัสผู้เข้าชมของคนอื่น (คัดจากลิงก์ที่แชร์กัน) ส่งฟอร์มด้วยค่านั้นแล้วประวัติการเข้าชมย้อนหลัง 180 วันของคนอื่น
 *    จะถูกผูกเข้ากับ lead ใหม่ ⇒ ไทม์ไลน์ของลูกค้ารายหนึ่งมีการเข้าชมของคนอื่นปน โดยไม่มีใครรู้
 *    ค่าที่ไม่ได้ลงนามจากผู้เรียกใช้ระบุตัวตนไม่ได้ (ทางที่ "ลงนามแล้ว" คือตั๋วของอีเมล ซึ่งเซิร์ฟเวอร์เป็นคนตรวจ)
 */
function utmOf(): Record<string, string> | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const out: Record<string, string> = {};
    for (const k of ["source", "medium", "campaign", "term", "content"]) {
      const v = q.get(`utm_${k}`);
      if (v) out[k] = v;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function PublicForm({
  token,
  fields,
  startToken,
  startField,
  honeypotField,
  submitAction,
}: {
  token: string;
  fields: PublicFormField[];
  startToken: string;
  startField: string;
  honeypotField: string;
  submitAction: (
    token: string,
    input: {
      answers: Record<string, string>;
      hp?: string;
      st?: string;
      pageUrl?: string | null;
      referrer?: string | null;
      utm?: Record<string, string> | null;
    },
  ) => Promise<PublicFormActionResult>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending.current) return; // กดสองทีในจังหวะเดียว = ส่งครั้งเดียว
    sending.current = true;
    setBusy(true);
    setError(null);
    const form = e.currentTarget;
    const answers: Record<string, string> = {};
    let hp = "";
    let st = startToken;
    for (const el of Array.from(form.elements)) {
      const node = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const name = node.name ?? "";
      if (!name) continue;
      const val = String((node as HTMLInputElement).value ?? "");
      if (name === honeypotField) hp = val;
      else if (name === startField) st = val;
      else answers[name] = val;
    }
    try {
      const r = await submitAction(token, {
        answers,
        hp,
        st,
        pageUrl: typeof window === "undefined" ? null : window.location.href,
        referrer: typeof document === "undefined" ? null : document.referrer || null,
        utm: utmOf(),
      });
      if (r.ok) setDone(true);
      else setError(r.message);
    } catch {
      setError("ส่งข้อมูลไม่สำเร็จ ระบบยังไม่ได้บันทึกอะไร — ลองกดส่งอีกครั้งนะ");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border bg-[color:var(--color-surface)] p-6 text-center" data-testid="form-public-done">
        <div className="text-2xl">🎉</div>
        <div className="mt-2 text-lg font-semibold">ขอบคุณค่ะ</div>
        <div className="mt-1 text-sm text-[color:var(--color-muted)]">เราได้รับข้อมูลของคุณเรียบร้อยแล้ว</div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border bg-[color:var(--color-surface)] p-5" data-testid="form-public-form" noValidate>
      <input type="hidden" name={startField} value={startToken} data-testid="form-public-start" />
      {/* honeypot — คนมองไม่เห็นและกด Tab ไม่เจอ · บอตกรอกทุกช่องที่เจอใน DOM */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "auto", width: 1, height: 0, overflow: "hidden" }}>
        <label htmlFor={`hp-${honeypotField}`}>เว็บไซต์ของคุณ</label>
        <input id={`hp-${honeypotField}`} name={honeypotField} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      {error && (
        <p className="rounded-lg bg-[color:var(--color-surface-2)] p-2 text-sm text-[color:var(--color-danger)]" data-testid="form-public-error" role="alert">
          {error}
        </p>
      )}

      {fields.map((f) => (
        <label key={f.key} className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          <span>
            {f.label}
            {f.required && <span className="text-[color:var(--color-danger)]"> *</span>}
          </span>
          {f.type === "textarea" ? (
            <textarea name={f.key} rows={4} className={inputCls} data-testid={`form-public-field-${f.key}`} />
          ) : f.type === "select" ? (
            <select name={f.key} defaultValue="" className={inputCls} data-testid={`form-public-field-${f.key}`}>
              <option value="" disabled>
                — เลือก —
              </option>
              {(f.options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              name={f.key}
              type={f.type === "phone" ? "tel" : f.type === "email" ? "email" : "text"}
              inputMode={f.type === "phone" ? "tel" : undefined}
              className={inputCls}
              data-testid={`form-public-field-${f.key}`}
            />
          )}
        </label>
      ))}

      <button
        type="submit"
        disabled={busy}
        className="rounded-lg bg-[color:var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        data-testid="form-public-submit"
      >
        {busy ? "กำลังส่ง…" : "ส่งข้อมูล"}
      </button>
    </form>
  );
}
