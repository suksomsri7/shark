"use client";

// ฟอร์มสาธารณะ `/f/<token>` ฝั่งเบราว์เซอร์ (ใบ C2.6 · มติ C24)
//
// 🔴 ช่องหลอกบอต (honeypot) ต้อง **มองไม่เห็นจริง** (ไม่ใช่แค่ `type=hidden` ซึ่งบอตข้ามง่าย): ออกจากสายตา (ซ้าย -9999px)
//    + ความสูง 0 + `tabindex="-1"` (คนกด Tab ไม่เจอ) + `autocomplete="off"` + `aria-hidden`
// 🔴 ตั๋ว "เริ่มกรอกเมื่อไหร่" เป็น hidden input ที่เซิร์ฟเวอร์ออกให้ (HMAC) — ส่งเร็วกว่าเวลาขั้นต่ำ = ถูกปฏิเสธ
// 🔴 กดปุ่มส่งรัว ๆ (หรือบอตกดสองครั้งในจังหวะเดียว) = ส่งครั้งเดียว (ธงกันซ้ำตั้งแบบ synchronous ก่อน await ตัวแรก)
// 🔴 ข้อความผลลัพธ์ทั้งหมดขึ้น **inline** บนหน้า ไม่มี alert() ไม่มีหน้าเปล่า และไม่โทษผู้ใช้

import { useEffect, useRef, useState } from "react";
import type { PublicFormActionResult } from "./actions-shared"; // CRM C3.9 ▸ ชนิดอยู่นอกไฟล์ "use server" ◂
// CRM C4.4-fix3 r2 ▸ (review N6) กติกา "origin นี้อยู่ในโดเมนของร้านไหม" แบบเดียวกับ `/t/e` `/t/v` (ไฟล์บริสุทธิ์ของโมดูลฟอร์ม —
//   ด่าน F2.3 ห้ามล้วงไฟล์ภายใน CRM · ข้อสอบ J3-r4 เทียบผลกับ `originAllowed` ของ CRM ทีละกรณี) ◂
import { parentOriginAllowed } from "@/lib/modules/forms/handover-shared";

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

// CRM C4.4-fix3 ▸ (J3) รับ "ตั๋วผู้เข้าชม" จากสคริปต์ติดตามของเว็บที่ฝังฟอร์มนี้ด้วย iframe
//   🔴 หน้านี้ไม่รู้และไม่ขอรหัสผู้เข้าชม — ได้แค่ตั๋วทึบแสงที่เซิร์ฟเวอร์ผนึก (ตรวจ/เผาเองตอนส่ง) · เก็บในหน่วยความจำ (ref) เท่านั้น:
//      ไม่มีใน url · คุกกี้ · storage · DOM
//   🔴 รับคำตอบเฉพาะจาก `window.parent` (หน้าที่ฝังเราอยู่จริง) · ข้อความขอ (`sd:form-ready`) ไม่มีความลับ จึงส่งแบบไม่ระบุ origin ได้
//      (หน้านี้ไม่รู้ว่าร้านอยู่ origin ไหน) — ตัวตอบกลับฝั่งร้านตอบเฉพาะ iframe ของตัวเองที่มาจาก origin ของแอป
//   🔴 เปิดเฉพาะเมื่อหน้าเซิร์ฟเวอร์บอก (`visitorHandover` = โดเมนติดตามของระบบ CRM uiVersion 2 ที่เปิดติดตามเว็บ) และถูกฝังอยู่เท่านั้น
//   r2 (review N6): รับตั๋วเฉพาะเมื่อ origin ของหน้าที่ฝังอยู่ในโดเมนเหล่านั้น (เว็บอื่นที่ฝังฟอร์มของร้านยัดตั๋วไม่ได้)
//   r2 (review S2): ตอนกดส่ง ถ้ายังไม่เคยได้ตั๋วเลย ขออีกครั้งแล้วรอไม่เกิน 1.5 วิ (ผู้เข้าชมที่กดยอมรับหลังฟอร์มโหลดยังผูกได้) ·
//   ตั๋วอายุ 10–14 นาทีขอใบใหม่ แต่ถ้าใบใหม่ไม่มาทันยังใช้ใบเดิม (ยังไม่หมดอายุ) ◂
const HANDOVER_PINGS_MS = [0, 800, 2_000, 4_500, 9_000];
const TICKET_REFRESH_AFTER_MS = 10 * 60_000; // ตั๋วอายุ 15 นาที — กรอกนานเกิน 10 นาทีขอใบใหม่ตอนกดส่ง
const TICKET_FALLBACK_MAX_MS = 14 * 60_000; // ใบเดิมยังใช้ได้ (เผื่อนาฬิกา/เวลาเดินทาง 1 นาที)
const TICKET_REFRESH_WAIT_MS = 1_500;
const TICKET_RE = /^[A-Za-z0-9_-]{40,1024}$/;

function isFramed(): boolean {
  try {
    return typeof window !== "undefined" && window.parent !== window;
  } catch {
    return false;
  }
}

export function PublicForm({
  token,
  fields,
  startToken,
  startField,
  honeypotField,
  submitAction,
  visitorHandover,
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
      vt?: string | null;
    },
  ) => Promise<PublicFormActionResult>;
  /** CRM C4.4-fix3 ▸ โดเมนของเว็บร้านที่ส่งตั๋วผู้เข้าชมให้ฟอร์มนี้ได้ (หน้าเซิร์ฟเวอร์เป็นคนตัดสิน · ไม่มี/ว่าง = ปิด) ◂ */
  visitorHandover?: string[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const ticketRef = useRef<{ t: string; at: number } | null>(null);
  const ticketWaiter = useRef<(() => void) | null>(null);
  const hostsKey = (visitorHandover ?? []).join(",");
  const handoverOn = hostsKey !== "";

  useEffect(() => {
    const hosts = hostsKey ? hostsKey.split(",") : [];
    if (hosts.length === 0 || !isFramed()) return;
    const parent = window.parent;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent) return; // ต้องมาจากหน้าที่ฝังเราอยู่จริงเท่านั้น
      if (!parentOriginAllowed(e.origin, hosts)) return; // r2 (N6): และหน้านั้นต้องอยู่บนเว็บของร้านเจ้าของฟอร์ม (https · โดเมนติดตาม)
      const d = e.data as { type?: unknown; ticket?: unknown } | null;
      if (!d || typeof d !== "object" || d.type !== "sd:visitor-ticket") return;
      const t = typeof d.ticket === "string" ? d.ticket : "";
      if (!TICKET_RE.test(t)) return;
      ticketRef.current = { t, at: Date.now() };
      ticketWaiter.current?.();
    };
    window.addEventListener("message", onMessage);
    const ping = () => {
      if (ticketRef.current) return;
      try {
        parent.postMessage({ type: "sd:form-ready" }, "*");
      } catch {
        /* หน้าที่ฝังไม่รับข้อความ = ไม่มีตั๋ว (ฟอร์มยังส่งได้ตามปกติ) */
      }
    };
    const timers = HANDOVER_PINGS_MS.map((ms) => window.setTimeout(ping, ms));
    return () => {
      window.removeEventListener("message", onMessage);
      for (const id of timers) window.clearTimeout(id);
    };
  }, [hostsKey]);

  /** ขอตั๋วใบใหม่หนึ่งครั้งแล้วรอไม่เกิน 1.5 วินาที — ได้ใบที่มาถึง **หลัง** เริ่มขอ หรือ null */
  async function askForTicket(): Promise<string | null> {
    const since = Date.now();
    await new Promise<void>((resolve) => {
      const timer = window.setTimeout(resolve, TICKET_REFRESH_WAIT_MS);
      ticketWaiter.current = () => {
        window.clearTimeout(timer);
        resolve();
      };
      try {
        window.parent.postMessage({ type: "sd:form-ready" }, "*");
      } catch {
        window.clearTimeout(timer);
        resolve();
      }
    });
    ticketWaiter.current = null;
    const fresh = ticketRef.current as { t: string; at: number } | null; // ถูกตั้งใหม่โดยตัวฟังข้อความระหว่างรอ
    return fresh && fresh.at >= since ? fresh.t : null;
  }

  /** ตั๋วที่จะแนบกับการส่งครั้งนี้ (ไม่มี = ไม่แนบ) */
  async function currentTicket(): Promise<string | null> {
    if (!handoverOn || !isFramed()) return null;
    const cur = ticketRef.current;
    if (!cur) return askForTicket(); // ยังไม่เคยได้เลย (เช่น เพิ่งกดยอมรับคุกกี้หลังฟอร์มโหลด) ⇒ ขออีกครั้ง
    if (Date.now() - cur.at < TICKET_REFRESH_AFTER_MS) return cur.t;
    return (await askForTicket()) ?? (Date.now() - cur.at < TICKET_FALLBACK_MAX_MS ? cur.t : null);
  }

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
      const vt = await currentTicket();
      const r = await submitAction(token, {
        answers,
        hp,
        st,
        pageUrl: typeof window === "undefined" ? null : window.location.href,
        referrer: typeof document === "undefined" ? null : document.referrer || null,
        utm: utmOf(),
        ...(vt ? { vt } : {}),
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
