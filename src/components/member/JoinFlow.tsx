"use client";

// JoinFlow.tsx — หน้าสมัครสมาชิก `/m/<slug>/join` ขั้น (ก) ต้อนรับ + (ข) ฟอร์มที่ร้านตั้ง (M3.11 · ภาพ 29)
//
// (ก) ต้อนรับ: โลโก้/ชื่อร้าน · "รับ n แต้ม" (เฉพาะร้านที่ตั้งแต้มต้อนรับ) · "มาจาก: <ชื่อลิงก์> (src=…)" ·
//     ปุ่ม "สมัครด้วย LINE" (LIFF → server ตรวจ id_token) / "สมัครด้วยเบอร์โทร"
// (ข) ฟอร์ม: ชื่อ · เบอร์ + OTP 6 หลัก (ขอรหัส → ยืนยัน → "ยืนยันแล้ว") · ฟิลด์ที่ร้านเปิดให้กรอก/บังคับ ·
//     ผู้แนะนำ (prefill `?ref=` · ตรวจแล้วขึ้นกล่องรางวัล) · ยินยอม 4 สวิตช์ · ยอมรับนโยบาย · ปุ่มสมัครสมาชิก
// (ค) สำเร็จ = หน้าแยก `/join/done` (ต้องมี session) — ไฟล์ `JoinDone.tsx`
//
// 🔴 ไม่มีตรรกะสมัครในไฟล์นี้ — ทุกขั้นเรียก server action ใน `join-actions.ts` (→ `join.ts` ของ M3.10)
// 🔴 ไฟล์ 'use client' ⇒ import ได้แค่ action + ชนิดบริสุทธิ์ (`join-shared.ts`) — ห้ามลากถึง prisma
// 🔴 ความยินยอมเริ่มที่ "ปิด" ทุกช่อง: PDPA ถือว่าการติ๊กไว้ให้ก่อนไม่ใช่ความยินยอม (ลูกค้าต้องเปิดเอง)
// 🔴 ข้อความผิดพลาดขึ้นใต้จุดที่เกี่ยว (ไม่ใช่กล่องเด้ง) · ไม่โทษลูกค้า · ข้อความยาวขึ้นบรรทัดใหม่ (ไม่ตัด)
// 🔴 ไม่มีอีโมจิ/สัญลักษณ์พิเศษ/สีตายตัว — ไอคอนผ่าน MemberIcon · สีผ่านโทเคนเท่านั้น
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  checkReferralAction,
  completeJoinAction,
  lineJoinAction,
  startJoinAction,
  verifyJoinAction,
} from "@/lib/modules/member/join-actions";
import {
  JOIN_MAX_OTP_ATTEMPTS,
  isEmailTarget,
  type JoinFieldView,
  type JoinFormView,
  type JoinReferralData,
  type JoinSourceView,
} from "@/lib/modules/member/join-shared";
import { MemberIcon } from "./MemberIcon";
import { MCardBox } from "./MShell";
import { loadLiff } from "./MLoginForm";

type Step = "welcome" | "form" | "existing";
type ErrAt = "welcome" | "phone" | "otp" | "referral" | "policy" | "submit";
type FieldValue = string | boolean | string[];

const NAME_KEYS = ["firstName", "lastName"];
const CHANNEL_ICON: Record<string, string> = { LINE: "chat", EMAIL: "mail", SMS: "send", PUSH: "bell" };
const LINE_PENDING_KEY = "shark_join_line_pending";
const DEVICE_KEY = "shark_join_device";

/** ตัวย่อชื่อร้าน 1–2 ตัว (ร้านที่ยังไม่อัปโหลดโลโก้) — "SIAM DIVE CENTER" → "SD" */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const pick = words.slice(0, 2).map((w) => Array.from(w)[0] ?? "");
  return pick.join("").toUpperCase() || "M";
}

/** รหัสเครื่องแบบสุ่มของเบราว์เซอร์นี้ (กันแนะนำเพื่อนซ้ำจากเครื่องเดียว) — เก็บใน localStorage ไม่มีข้อมูลส่วนตัว */
function deviceId(): string | null {
  try {
    const got = window.localStorage.getItem(DEVICE_KEY);
    if (got) return got;
    const fresh = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    window.localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

/** ค่าในฟอร์ม → ค่าที่ส่งให้ server (ช่องว่าง = ไม่ส่ง · ตัวเลขว่างห้ามกลายเป็น 0) */
function toPayload(fields: JoinFieldView[], values: Record<string, FieldValue>): Record<string, string | number | boolean | string[] | null> {
  const out: Record<string, string | number | boolean | string[] | null> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (v === undefined) continue;
    if (f.type === "BOOLEAN") {
      if (v === true) out[f.key] = true;
      continue;
    }
    if (Array.isArray(v)) {
      if (v.length > 0) out[f.key] = v;
      continue;
    }
    const t = String(v).trim();
    if (!t) continue;
    if (f.type === "NUMBER" || f.type === "MONEY") {
      const n = Number(t);
      out[f.key] = Number.isFinite(n) ? n : t;
      continue;
    }
    out[f.key] = t;
  }
  return out;
}

function isBlank(v: FieldValue | undefined): boolean {
  if (v === undefined) return true;
  if (typeof v === "boolean") return false;
  if (Array.isArray(v)) return v.length === 0;
  return v.trim() === "";
}

/** ข้อความผิดพลาดใต้จุดที่เกี่ยว — ขึ้นบรรทัดใหม่ได้ (ไม่ตัดท้าย) */
function ErrorLine({ msg }: { msg: string }) {
  return (
    <p data-testid="m-join-error" className="pt-1" style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--color-danger)" }}>
      {msg}
    </p>
  );
}

function Muted({ children, size = 11.5, center = false }: { children: React.ReactNode; size?: number; center?: boolean }) {
  return (
    <p className={center ? "text-center" : ""} style={{ fontSize: size, lineHeight: 1.55, color: "var(--color-muted)" }}>
      {children}
    </p>
  );
}

/** แถวในการ์ดฟอร์ม (ป้ายซ้าย · ช่องกรอกขวา) — แบบเดียวกับหน้าโปรไฟล์ของลูกค้า */
function Row({ label, required, children, testid }: { label: string; required?: boolean; children: React.ReactNode; testid?: string }) {
  return (
    <div
      {...(testid ? { "data-testid": testid } : {})}
      className="flex items-start gap-2 border-b py-2 last:border-b-0"
      style={{ borderColor: "var(--color-line)" }}
    >
      <span className="w-[5.5rem] shrink-0 pt-2" style={{ fontSize: 12, lineHeight: 1.35, color: "var(--color-muted)" }}>
        {label}
        {required ? <span style={{ color: "var(--color-danger)" }}> *</span> : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

function Switch({ on, label, onToggle, disabled }: { on: boolean; label: string; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className="flex h-[17px] w-[30px] shrink-0 items-center rounded-full px-0.5"
      style={{ background: on ? "var(--color-ink)" : "var(--color-line)" }}
    >
      <span
        className="h-[13px] w-[13px] rounded-full transition-transform"
        style={{ background: "var(--color-surface)", transform: on ? "translateX(13px)" : "translateX(0)" }}
      />
    </button>
  );
}

/** ช่องกรอกตามชนิดฟิลด์ที่ร้านตั้ง */
function FieldInput({
  field,
  value,
  onChange,
}: {
  field: JoinFieldView;
  value: FieldValue | undefined;
  onChange: (v: FieldValue) => void;
}) {
  const id = `m-join-in-${field.key}`;
  const common = { id, "aria-label": field.label, className: "input min-w-0", style: { fontSize: 13 } };
  if (field.type === "SELECT" && field.choices.length > 0) {
    return (
      <select {...common} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">เลือก</option>
        {field.choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "MULTI_SELECT" && field.choices.length > 0) {
    const picked = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-wrap gap-1.5 pt-1">
        {field.choices.map((c) => {
          const on = picked.includes(c.value);
          return (
            <button
              key={c.value}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? picked.filter((x) => x !== c.value) : [...picked, c.value])}
              className="rounded-full border px-2.5 py-1"
              style={{
                fontSize: 12,
                borderColor: on ? "var(--color-ink)" : "var(--color-line)",
                background: on ? "var(--color-ink)" : "var(--color-surface)",
                color: on ? "var(--color-surface)" : "var(--color-ink)",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>
    );
  }
  if (field.type === "BOOLEAN") {
    return (
      <label className="flex items-center gap-2 pt-2" style={{ fontSize: 12.5 }}>
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          style={{ accentColor: "var(--color-ink)" }}
        />
        ใช่
      </label>
    );
  }
  if (field.type === "LONG_TEXT") {
    return (
      <textarea
        {...common}
        rows={2}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  const type =
    field.type === "DATE" ? "date" : field.type === "DATETIME" ? "datetime-local" : field.type === "NUMBER" || field.type === "MONEY" ? "number" : "text";
  return (
    <input
      {...common}
      type={type}
      inputMode={type === "number" ? "decimal" : undefined}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** ร้านยังไม่เปิดรับสมัครออนไลน์ — หน้าแจ้งสุภาพ (ไม่ใช่หน้าพัง) */
export function JoinUnavailable({ message }: { message: string }) {
  return (
    <div data-testid="m-join" className="flex min-h-dvh flex-col items-center justify-center gap-2 px-6 text-center">
      <MemberIcon name="users" size="lg" />
      <h1 className="font-semibold" style={{ fontSize: 15 }}>
        ยังสมัครสมาชิกออนไลน์ไม่ได้
      </h1>
      <Muted size={12.5} center>
        {message}
      </Muted>
    </div>
  );
}

export function JoinFlow({
  slug,
  form,
  logoUrl,
  displayName,
  source,
  srcCode,
  initialRef,
  liffId,
  alreadyMember,
  autoLine = false,
}: {
  slug: string;
  form: JoinFormView;
  logoUrl: string | null;
  displayName: string;
  source: JoinSourceView | null;
  srcCode: string | null;
  initialRef: string | null;
  liffId: string;
  alreadyMember: boolean;
  /** มาจากการเข้าสู่ระบบด้วย LINE ที่ยังไม่ผูกสมาชิก — เริ่มขั้นตรวจ LINE ให้อัตโนมัติ (ตรวจ id_token ใหม่เสมอ) */
  autoLine?: boolean;
}) {
  const [step, setStep] = useState<Step>(alreadyMember ? "existing" : "welcome");
  const [existingNext, setExistingNext] = useState(`/m/${encodeURIComponent(slug)}/card`);
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ at: ErrAt; msg: string } | null>(null);
  const [note, setNote] = useState("");
  const [policyOpen, setPolicyOpen] = useState(false);

  // LINE (ขั้น ก) — id_token ที่ server ตรวจแล้วรอบหนึ่ง (ส่งซ้ำตอนสมัครให้ server ตรวจอีกครั้งก่อนผูก)
  const [lineIdToken, setLineIdToken] = useState<string | null>(null);

  // เบอร์ + OTP
  const [target, setTarget] = useState("");
  const [otpId, setOtpId] = useState("");
  const [maskedTo, setMaskedTo] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [code, setCode] = useState("");
  const [wrong, setWrong] = useState(0);
  const [joinToken, setJoinToken] = useState("");

  // ฟอร์มที่ร้านตั้ง
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // ผู้แนะนำ
  const [refCode, setRefCode] = useState(initialRef ?? "");
  const [refOk, setRefOk] = useState<JoinReferralData | null>(null);

  // ความยินยอม + นโยบาย
  const [consents, setConsents] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(form.consents.map((c) => [c.channel, false])),
  );
  const [policyOk, setPolicyOk] = useState(false);

  const nameFields = useMemo(() => form.fields.filter((f) => NAME_KEYS.includes(f.key)), [form.fields]);
  const otherFields = useMemo(() => form.fields.filter((f) => !NAME_KEYS.includes(f.key)), [form.fields]);
  const showReferral = form.referralEnabled || !!initialRef;
  const verified = !!joinToken;

  const fail = (at: ErrAt, msg: string) => setError({ at, msg });
  const errAt = (at: ErrAt) => (error && error.at === at ? <ErrorLine msg={error.msg} /> : null);

  // ── ผู้แนะนำ ──
  const checkReferral = useCallback(
    (raw: string) => {
      const c = raw.trim().toUpperCase();
      setRefOk(null);
      if (!c) return;
      start(async () => {
        const r = await checkReferralAction({ slug, code: c });
        if (!r.ok) {
          setError({ at: "referral", msg: r.reason });
          return;
        }
        setError((e) => (e?.at === "referral" ? null : e));
        setRefCode(r.data.code);
        setRefOk(r.data);
      });
    },
    [slug],
  );

  // prefill `?ref=` → ตรวจให้ครั้งเดียวตอนเปิด (ลูกค้าไม่ต้องกดอะไร)
  useEffect(() => {
    if (initialRef && !alreadyMember) checkReferral(initialRef);
  }, [initialRef, alreadyMember, checkReferral]);

  // ── LINE ──
  const lineStart = useCallback(() => {
    setError(null);
    setNote("");
    if (!liffId) {
      setNote("ร้านนี้ยังไม่ได้เปิดสมัครผ่าน LINE — กรอกเบอร์โทรด้านล่างเพื่อสมัครได้เลย");
      setStep("form");
      return;
    }
    start(async () => {
      try {
        const liff = await loadLiff();
        if (!liff) {
          setNote("สมัครด้วย LINE ใช้ได้เมื่อเปิดจากแอปไลน์ — กรอกเบอร์โทรด้านล่างเพื่อสมัครได้เลย");
          setStep("form");
          return;
        }
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          // กลับมาหน้านี้แล้วทำต่อให้อัตโนมัติ (ไม่ต้องกดปุ่มซ้ำ)
          window.sessionStorage.setItem(LINE_PENDING_KEY, "1");
          liff.login({ redirectUri: window.location.href });
          return;
        }
        const idToken = liff.getIDToken();
        if (!idToken) {
          fail("welcome", "ยังไม่ได้รับข้อมูลจากไลน์ — ลองกดอีกครั้ง หรือสมัครด้วยเบอร์โทรแทน");
          return;
        }
        const r = await lineJoinAction({ slug, idToken });
        if (!r.ok) {
          fail("welcome", r.reason);
          return;
        }
        if (r.data.existing) {
          setExistingNext(r.data.next);
          setStep("existing");
          return;
        }
        setLineIdToken(idToken);
        setNote(
          r.data.displayName
            ? `เชื่อมไลน์ "${r.data.displayName}" แล้ว — ยืนยันเบอร์โทรอีกขั้นเพื่อสมัครให้เสร็จ`
            : "เชื่อมไลน์แล้ว — ยืนยันเบอร์โทรอีกขั้นเพื่อสมัครให้เสร็จ",
        );
        setStep("form");
      } catch {
        fail("welcome", "สมัครด้วยไลน์ไม่สำเร็จในตอนนี้ — สมัครด้วยเบอร์โทรแทนได้เลย");
      }
    });
  }, [liffId, slug]);

  useEffect(() => {
    if (!liffId || alreadyMember) return;
    let pending = false;
    try {
      pending = window.sessionStorage.getItem(LINE_PENDING_KEY) === "1";
      if (pending) window.sessionStorage.removeItem(LINE_PENDING_KEY);
    } catch {
      // sessionStorage ใช้ไม่ได้ (โหมดส่วนตัว) — ลูกค้ากดปุ่มเองได้ตามปกติ
    }
    if (pending || autoLine) lineStart();
    // เริ่มครั้งเดียวตอนเปิดหน้า
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── OTP ──
  function askCode() {
    setError(null);
    const t = target.trim();
    const looksOk = isEmailTarget(t) ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) : t.replace(/\D/g, "").length >= 9;
    if (!looksOk) {
      fail("phone", "กรอกเบอร์โทร 10 หลัก (หรืออีเมล) ก่อนกดขอรหัส");
      return;
    }
    start(async () => {
      const r = await startJoinAction({ slug, target: t, src: srcCode, referralCode: refOk?.code ?? null });
      if (!r.ok) {
        fail("phone", r.reason);
        return;
      }
      setOtpId(r.data.otpId);
      setMaskedTo(r.data.maskedTo);
      setDevOtp(r.data.devOtp ?? "");
      setCode("");
      setWrong(0);
    });
  }

  function confirmCode() {
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      fail("otp", "รหัสยืนยันมี 6 หลัก — กรอกให้ครบแล้วกดยืนยันอีกครั้ง");
      return;
    }
    start(async () => {
      const r = await verifyJoinAction({ slug, otpId, code: code.trim() });
      if (!r.ok) {
        const n = wrong + 1;
        setWrong(n);
        if (n >= JOIN_MAX_OTP_ATTEMPTS) {
          // ครบ 5 ครั้ง รหัสใบนี้ใช้ไม่ได้อีก (ฝั่ง server ล็อกแล้ว) — พากลับไปขอรหัสใหม่
          setOtpId("");
          setCode("");
          setDevOtp("");
          fail("phone", "กรอกรหัสไม่ตรงครบ 5 ครั้งแล้ว รหัสนี้จึงใช้ต่อไม่ได้ — กดขอรหัสใหม่อีกครั้ง");
          return;
        }
        fail("otp", r.reason);
        return;
      }
      if (r.data.existing) {
        setExistingNext(r.data.next);
        setStep("existing");
        return;
      }
      setJoinToken(r.data.joinToken);
      setOtpId("");
      setCode("");
      setDevOtp("");
    });
  }

  function changeTarget() {
    setJoinToken("");
    setOtpId("");
    setCode("");
    setDevOtp("");
    setError(null);
  }

  // ── สมัคร ──
  function submit() {
    setError(null);
    const missing: Record<string, string> = {};
    for (const f of form.fields) {
      if (f.required && isBlank(values[f.key])) missing[f.key] = `กรอก${f.label}ก่อนกดสมัคร`;
    }
    setFieldErrors(missing);
    if (!verified) {
      fail("phone", "ยืนยันเบอร์โทรด้วยรหัส 6 หลักก่อน แล้วค่อยกดสมัครสมาชิก");
      return;
    }
    if (Object.keys(missing).length > 0) {
      fail("submit", "ยังมีช่องที่ร้านขอให้กรอกอยู่ — ดูช่องที่มีเครื่องหมาย * ด้านบน");
      return;
    }
    if (!policyOk) {
      fail("policy", "กดยอมรับนโยบายของร้านก่อน แล้วค่อยกดสมัครสมาชิก");
      return;
    }
    start(async () => {
      const r = await completeJoinAction({
        slug,
        joinToken,
        fields: toPayload(form.fields, values),
        consents: form.consents.map((c) => ({ channel: c.channel, granted: consents[c.channel] === true })),
        policyVersion: form.policyVersion,
        referralCode: refOk?.code ?? (refCode.trim() ? refCode.trim().toUpperCase() : null),
        src: srcCode,
        lineIdToken,
        deviceId: deviceId(),
      });
      if (!r.ok) {
        fail("submit", r.reason);
        return;
      }
      window.location.href = r.data.next;
    });
  }

  const setValue = (key: string, v: FieldValue) => {
    setValues((s) => ({ ...s, [key]: v }));
    setFieldErrors((s) => {
      if (!s[key]) return s;
      const next = { ...s };
      delete next[key];
      return next;
    });
  };

  const renderField = (f: JoinFieldView) => (
    <Row key={f.key} label={f.label} required={f.required} testid={`m-join-field-${f.key}`}>
      <FieldInput field={f} value={values[f.key]} onChange={(v) => setValue(f.key, v)} />
      {fieldErrors[f.key] ? (
        <span className="pt-1" style={{ fontSize: 11.5, color: "var(--color-danger)" }}>
          {fieldErrors[f.key]}
        </span>
      ) : null}
      {f.description ? (
        <span className="pt-1" style={{ fontSize: 11, lineHeight: 1.45, color: "var(--color-muted)" }}>
          {f.description}
        </span>
      ) : null}
    </Row>
  );

  const policyLabel = form.policyVersion > 0 ? `นโยบาย v${form.policyVersion}` : "นโยบายการใช้ข้อมูลสมาชิก";
  const policyPanel = policyOpen ? (
    <MCardBox className="p-3">
      {form.policyHtml ? (
        <div
          className="max-h-60 overflow-y-auto break-words"
          style={{ fontSize: 12, lineHeight: 1.6 }}
          dangerouslySetInnerHTML={{ __html: form.policyHtml }}
        />
      ) : (
        <Muted size={12}>
          ร้านยังไม่ได้เผยแพร่นโยบายความเป็นส่วนตัวฉบับเต็ม — ข้อมูลที่กรอกใช้เพื่อบริการสมาชิกของร้านนี้เท่านั้น ·
          ขอสำเนาหรือขอลบข้อมูลได้ทุกเมื่อที่หน้าโปรไฟล์หลังสมัคร
        </Muted>
      )}
    </MCardBox>
  ) : null;

  return (
    <div data-testid="m-join" className="flex min-h-dvh flex-col">
      {/* ═══ (ก) ต้อนรับ ═══ */}
      {step === "welcome" ? (
        <section data-testid="m-join-welcome" className="flex flex-1 flex-col gap-3 px-5 pb-8 pt-14">
          <div className="flex flex-col items-center gap-2 text-center">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={displayName} width={64} height={64} className="h-16 w-16 rounded-2xl object-contain" />
            ) : (
              <span
                aria-hidden
                className="flex h-16 w-16 items-center justify-center rounded-2xl font-semibold"
                style={{ background: "var(--color-ink)", color: "var(--color-surface)", fontSize: 20 }}
              >
                {initialsOf(displayName)}
              </span>
            )}
            <h1 className="break-words pt-3 font-semibold" style={{ fontSize: 16, lineHeight: 1.45 }}>
              สมัครสมาชิก
              <br />
              {displayName}
            </h1>
            {form.welcomePoints > 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--color-muted)" }}>
                รับ{" "}
                <b style={{ color: "var(--color-ink)" }}>{form.welcomePoints.toLocaleString("th-TH")} แต้ม</b>{" "}
                ทันทีที่สมัคร
              </p>
            ) : (
              <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--color-muted)" }}>
                สะสมแต้มและรับสิทธิ์สมาชิกได้ตั้งแต่วันนี้
              </p>
            )}
            {source ? (
              <p data-testid="m-join-src" className="break-words" style={{ fontSize: 10.5, color: "var(--color-muted)", opacity: 0.8 }}>
                มาจาก: {source.name} (src={source.code})
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2.5 pt-5">
            <button
              type="button"
              data-testid="m-join-start-line"
              className="btn btn-primary w-full"
              style={{ minHeight: 46 }}
              disabled={pending}
              onClick={lineStart}
            >
              <MemberIcon name="chat" size="sm" />
              สมัครด้วย LINE
            </button>
            <button
              type="button"
              data-testid="m-join-start-phone"
              className="btn btn-ghost w-full"
              style={{ minHeight: 46 }}
              disabled={pending}
              onClick={() => {
                setError(null);
                setNote("");
                setStep("form");
              }}
            >
              สมัครด้วยเบอร์โทร
            </button>
            {errAt("welcome")}
          </div>

          <p className="pt-2 text-center" style={{ fontSize: 11, lineHeight: 1.5, color: "var(--color-muted)" }}>
            การสมัครต้องยอมรับ{" "}
            <button
              type="button"
              className="font-semibold underline-offset-2"
              style={{ color: "var(--color-accent)" }}
              onClick={() => setPolicyOpen((v) => !v)}
            >
              นโยบายความเป็นส่วนตัว
            </button>{" "}
            ของร้าน
          </p>
          {policyPanel}
        </section>
      ) : null}

      {/* ═══ (ข) ฟอร์มที่ร้านตั้ง ═══ */}
      {step === "form" ? (
        <section data-testid="m-join-form" className="flex flex-col gap-3 pb-8">
          <header className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
            <button
              type="button"
              aria-label="กลับหน้าต้อนรับ"
              className="-ml-1 rounded-md p-1"
              onClick={() => {
                setError(null);
                setStep("welcome");
              }}
            >
              <MemberIcon name="back" />
            </button>
            <h1 className="min-w-0 flex-1 truncate font-semibold" style={{ fontSize: 13.5 }}>
              กรอกข้อมูลสมาชิก
            </h1>
          </header>

          {note ? (
            <div className="px-4">
              <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--color-line)", background: "var(--color-surface-2)" }}>
                <Muted size={12}>{note}</Muted>
              </div>
            </div>
          ) : null}

          <div className="px-4">
            <MCardBox className="px-3">
              {nameFields.map(renderField)}

              {/* เบอร์ + OTP */}
              <Row label="เบอร์โทร" required>
                {verified ? (
                  <div className="flex items-center gap-2 pt-1.5">
                    <span className="min-w-0 flex-1 truncate" style={{ fontSize: 13, fontWeight: 600 }}>
                      {target.trim()}
                    </span>
                    <span
                      data-testid="m-join-otp-ok"
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5"
                      style={{ fontSize: 10.5, fontWeight: 600, borderColor: "var(--color-accent)", color: "var(--color-accent)" }}
                    >
                      <MemberIcon name="check" size="xs" />
                      ยืนยันแล้ว
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      data-testid="m-join-phone"
                      aria-label="เบอร์โทรหรืออีเมล"
                      className="input min-w-0 flex-1"
                      style={{ fontSize: 13 }}
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="08x-xxx-xxxx"
                      value={target}
                      onChange={(e) => {
                        setTarget(e.target.value);
                        if (otpId) changeTarget();
                      }}
                    />
                    <button
                      type="button"
                      data-testid="m-join-otp-request"
                      className="btn-sm shrink-0"
                      style={{ fontSize: 12 }}
                      disabled={pending}
                      onClick={askCode}
                    >
                      {otpId ? "ขอรหัสใหม่" : "ขอรหัส"}
                    </button>
                  </div>
                )}
                {verified ? (
                  <button
                    type="button"
                    className="self-start pt-1"
                    style={{ fontSize: 11, color: "var(--color-muted)" }}
                    onClick={changeTarget}
                  >
                    เปลี่ยนเบอร์
                  </button>
                ) : (
                  <span className="pt-1" style={{ fontSize: 10.5, lineHeight: 1.45, color: "var(--color-muted)" }}>
                    ยังไม่ได้รับ SMS? ใส่อีเมลในช่องนี้แทนได้
                  </span>
                )}
                {errAt("phone")}
              </Row>

              {otpId && !verified ? (
                <Row label="รหัส 6 หลัก">
                  <div className="flex items-center gap-1.5">
                    <input
                      data-testid="m-join-otp"
                      aria-label="รหัสยืนยัน 6 หลัก"
                      className="input min-w-0 flex-1 text-center tracking-[0.3em]"
                      style={{ fontSize: 13 }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="______"
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    />
                    <button
                      type="button"
                      data-testid="m-join-otp-verify"
                      className="btn btn-primary shrink-0 px-3 py-2"
                      style={{ fontSize: 12 }}
                      disabled={pending}
                      onClick={confirmCode}
                    >
                      ยืนยัน
                    </button>
                  </div>
                  <span className="pt-1" style={{ fontSize: 10.5, lineHeight: 1.45, color: "var(--color-muted)" }}>
                    ส่งรหัสไปที่ {maskedTo} แล้ว (ใช้ได้ 5 นาที)
                  </span>
                  {devOtp ? (
                    <span style={{ fontSize: 10.5, color: "var(--color-muted)" }}>รหัสสำหรับทดสอบ (ไม่แสดงบนระบบจริง): {devOtp}</span>
                  ) : null}
                  {errAt("otp")}
                </Row>
              ) : null}

              {otherFields.map(renderField)}
            </MCardBox>
            <p className="pt-1.5" style={{ fontSize: 11, lineHeight: 1.5, color: "var(--color-muted)" }}>
              ช่องทั้งหมดนี้ร้านเปิดให้กรอกเอง · ช่องที่มี * ร้านขอให้กรอก
            </p>
          </div>

          {/* ผู้แนะนำ */}
          {showReferral ? (
            <div data-testid="m-join-referral" className="flex flex-col gap-2 px-4">
              {refOk ? (
                <MCardBox className="flex items-center gap-2 px-3 py-2.5">
                  <MemberIcon name="check" size="sm" className="shrink-0" />
                  <span className="min-w-0 flex-1 break-words" style={{ fontSize: 12.5 }}>
                    ผู้แนะนำ: <b>{refOk.code}</b> <span style={{ color: "var(--color-muted)" }}>กรอกแล้ว</span>
                  </span>
                  <button
                    type="button"
                    className="shrink-0"
                    style={{ fontSize: 11, color: "var(--color-muted)" }}
                    onClick={() => {
                      setRefOk(null);
                      setRefCode("");
                    }}
                  >
                    เอาออก
                  </button>
                </MCardBox>
              ) : (
                <MCardBox className="flex flex-col px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-[5.5rem] shrink-0" style={{ fontSize: 12, color: "var(--color-muted)" }}>
                      ผู้แนะนำ
                    </span>
                    <input
                      aria-label="รหัสผู้แนะนำ"
                      className="input min-w-0 flex-1 uppercase"
                      style={{ fontSize: 13 }}
                      placeholder="รหัสจากเพื่อน (ถ้ามี)"
                      value={refCode}
                      onChange={(e) => setRefCode(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-sm shrink-0"
                      style={{ fontSize: 12 }}
                      disabled={pending || !refCode.trim()}
                      onClick={() => checkReferral(refCode)}
                    >
                      ตรวจ
                    </button>
                  </div>
                  {errAt("referral")}
                </MCardBox>
              )}
              {refOk ? (
                <div
                  data-testid="m-join-referral-reward"
                  className="rounded-xl border px-3 py-2.5"
                  style={{ borderColor: "var(--color-accent)", background: "var(--color-accent-soft)" }}
                >
                  <p style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--color-accent)" }}>
                    คุณและเพื่อนจะได้รางวัล{refOk.convertOn === "SIGNUP" ? "เมื่อสมัครสำเร็จ" : "เมื่อคุณซื้อครั้งแรก"}
                  </p>
                  <p style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--color-accent)", opacity: 0.85 }}>
                    ของคุณ: {refOk.refereeReward}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ความยินยอมรับข่าวสาร */}
          <div className="flex flex-col gap-2 px-4">
            <h2 className="font-semibold" style={{ fontSize: 12.5 }}>
              ความยินยอมรับข่าวสาร
            </h2>
            <MCardBox testid="m-join-consents" className="px-3">
              {form.consents.map((c) => (
                <div
                  key={c.channel}
                  className="flex items-center gap-2.5 border-b py-2.5 last:border-b-0"
                  style={{ borderColor: "var(--color-line)" }}
                >
                  <MemberIcon name={CHANNEL_ICON[c.channel] ?? "chat"} size="sm" className="opacity-60" />
                  <span className="min-w-0 flex-1 truncate" style={{ fontSize: 12.8 }}>
                    {c.label}
                  </span>
                  <Switch
                    on={consents[c.channel] === true}
                    label={`รับข่าวสารทาง ${c.label}`}
                    onToggle={() => setConsents((s) => ({ ...s, [c.channel]: !(s[c.channel] === true) }))}
                  />
                </div>
              ))}
            </MCardBox>
            <Muted size={11}>เลือกเปิดเฉพาะช่องที่อยากรับข่าวสาร — เปลี่ยนใจได้ทุกเมื่อที่หน้าโปรไฟล์</Muted>
          </div>

          {/* นโยบาย */}
          <div data-testid="m-join-policy" className="flex flex-col gap-2 px-4">
            <label className="flex items-start gap-2" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
              <input
                type="checkbox"
                aria-label={`ยอมรับนโยบาย${form.policyVersion > 0 ? ` v${form.policyVersion}` : ""} ของร้าน`}
                className="mt-0.5 shrink-0"
                checked={policyOk}
                onChange={(e) => {
                  setPolicyOk(e.target.checked);
                  if (e.target.checked) setError((x) => (x?.at === "policy" ? null : x));
                }}
                style={{ accentColor: "var(--color-ink)" }}
              />
              <span className="min-w-0">
                ยอมรับ
                <button
                  type="button"
                  className="font-semibold"
                  style={{ color: "var(--color-accent)" }}
                  onClick={(e) => {
                    e.preventDefault();
                    setPolicyOpen((v) => !v);
                  }}
                >
                  {policyLabel}
                </button>
                ของร้าน
              </span>
            </label>
            {policyPanel}
            {errAt("policy")}
          </div>

          <div className="flex flex-col gap-1.5 px-4 pt-1">
            <button
              type="button"
              data-testid="m-join-submit"
              className="btn btn-primary w-full"
              style={{ minHeight: 46 }}
              disabled={pending}
              onClick={submit}
            >
              สมัครสมาชิก
            </button>
            {errAt("submit")}
          </div>
        </section>
      ) : null}

      {/* ═══ เป็นสมาชิกอยู่แล้ว ═══ */}
      {step === "existing" ? (
        <section data-testid="m-join-existing" className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
          >
            <MemberIcon name="check" size="lg" />
          </span>
          <h1 className="font-semibold" style={{ fontSize: 16 }}>
            คุณเป็นสมาชิกอยู่แล้ว
          </h1>
          <Muted size={12.5} center>
            {displayName} มีบัตรสมาชิกของคุณอยู่แล้ว — เข้าสู่ระบบให้เรียบร้อย เปิดบัตรเพื่อดูแต้มและสิทธิ์ได้เลย
          </Muted>
          <a href={existingNext} data-testid="m-join-existing-open" className="btn btn-primary mt-2 w-full" style={{ minHeight: 46 }}>
            <MemberIcon name="card" size="sm" />
            เปิดบัตรสมาชิก
          </a>
        </section>
      ) : null}
    </div>
  );
}

export default JoinFlow;
