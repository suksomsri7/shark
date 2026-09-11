"use client";

// MLoginForm.tsx — หน้าเข้าสู่ระบบของลูกค้า `/m/<slug>/login` (M2.9)
//
// 2 ขั้น: กรอกเบอร์/อีเมล → กรอกรหัส 6 หลัก · หรือกดปุ่ม "เข้าสู่ระบบด้วย LINE" (LIFF)
// 🔴 ข้อความผิดพลาดขึ้นใต้ช่องกรอก (ไม่ใช่กล่องเด้ง) และไม่โทษผู้ใช้
// 🔴 LIFF SDK โหลดแบบ lazy ตอนกดปุ่มเท่านั้น — เปิดจากเบราว์เซอร์ธรรมดา (ไม่มี liff) ต้องยังใช้ OTP ได้ปกติ
//    เปิดในไลน์ = ได้ id_token ส่งให้ `/m/<slug>/auth/line` ตรวจกับ LINE แล้วออก session ให้
import { useState, useTransition } from "react";
import { requestOtpAction, verifyOtpAction } from "@/lib/modules/member/me-actions";
import { MemberIcon } from "./MemberIcon";
import { MMuted } from "./MShell";

// M3.11 — export ให้หน้าสมัคร (`JoinFlow.tsx`) ใช้ตัวโหลดเดียวกัน (ไม่ก๊อปตัวโหลด SDK ไว้สองที่)
export type LiffSdk = {
  init: (arg: { liffId: string }) => Promise<void>;
  isLoggedIn: () => boolean;
  login: (arg?: { redirectUri?: string }) => void;
  getIDToken: () => string | null;
};

const LIFF_SDK_URL = "https://static.line-scdn.net/liff/edge/2/sdk.js";

/**
 * โหลด LIFF SDK แบบ lazy จาก CDN ของ LINE (ไม่ผูกเป็น dependency ของโปรเจกต์)
 * โหลดไม่ได้ / ไม่ได้เปิดจากไลน์ = คืน null แล้วหน้าจอใช้ OTP ต่อได้ตามปกติ
 */
export async function loadLiff(): Promise<LiffSdk | null> {
  const w = window as unknown as { liff?: LiffSdk };
  if (w.liff) return w.liff;
  await new Promise<void>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${LIFF_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => resolve(), { once: true });
      return;
    }
    const el = document.createElement("script");
    el.src = LIFF_SDK_URL;
    el.async = true;
    el.addEventListener("load", () => resolve(), { once: true });
    el.addEventListener("error", () => resolve(), { once: true });
    document.head.appendChild(el);
  });
  return w.liff ?? null;
}

export function MLoginForm({ slug, shopName, liffId }: { slug: string; shopName: string; liffId: string }) {
  const [step, setStep] = useState<"target" | "code">("target");
  const [target, setTarget] = useState("");
  const [otpId, setOtpId] = useState("");
  const [maskedTo, setMaskedTo] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const isEmail = target.includes("@");

  function ask() {
    setError("");
    if (target.trim().length < 6) {
      setError("กรอกเบอร์โทรหรืออีเมลที่ให้ไว้กับร้านก่อน");
      return;
    }
    start(async () => {
      const r = await requestOtpAction({
        slug,
        ...(isEmail ? { email: target.trim() } : { phone: target.trim() }),
      });
      if (!r.ok) {
        setError(r.reason);
        return;
      }
      setOtpId(r.data.otpId);
      setMaskedTo(r.data.maskedTo);
      setDevOtp(r.data.devOtp ?? "");
      setStep("code");
    });
  }

  function confirm() {
    setError("");
    if (!/^\d{6}$/.test(code.trim())) {
      setError("รหัสยืนยันมี 6 หลัก — กรอกให้ครบแล้วกดยืนยันอีกครั้ง");
      return;
    }
    start(async () => {
      const r = await verifyOtpAction({ slug, otpId, code: code.trim() });
      if (!r.ok) {
        setError(r.reason);
        return;
      }
      window.location.href = r.data.next;
    });
  }

  function lineLogin() {
    setError("");
    start(async () => {
      try {
        const liff = liffId ? await loadLiff() : null;
        if (!liff) {
          setError("เข้าสู่ระบบด้วย LINE ยังใช้ได้เฉพาะเมื่อเปิดจากแอปไลน์ — ใช้เบอร์หรืออีเมลแทนได้เลย");
          return;
        }
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const idToken = liff.getIDToken();
        if (!idToken) {
          setError("ยังไม่ได้รับข้อมูลจากไลน์ — ลองกดอีกครั้ง หรือใช้เบอร์/อีเมลแทน");
          return;
        }
        const res = await fetch(`/m/${slug}/auth/line`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        const data = (await res.json()) as { ok?: boolean; next?: string; reason?: string };
        if (!data.ok || !data.next) {
          setError(data.reason ?? "เข้าสู่ระบบด้วยไลน์ไม่สำเร็จ — ใช้เบอร์หรืออีเมลแทนได้");
          return;
        }
        window.location.href = data.next;
      } catch {
        setError("เข้าสู่ระบบด้วยไลน์ไม่สำเร็จ — ใช้เบอร์หรืออีเมลแทนได้");
      }
    });
  }

  return (
    <div data-testid="m-login" className="flex min-h-dvh flex-col justify-center gap-4 px-5 py-8">
      <div className="flex flex-col items-center gap-1.5">
        <MemberIcon name="qr" size="lg" />
        <h1 className="text-center font-semibold" style={{ fontSize: 16 }}>
          บัตรสมาชิก {shopName}
        </h1>
        <MMuted size={12}>เข้าสู่ระบบเพื่อดูบัตร แต้ม และสิทธิ์ของคุณ</MMuted>
      </div>

      <div data-testid="m-login-form" className="flex flex-col gap-2">
        {step === "target" ? (
          <>
            <label htmlFor="m-login-target" style={{ fontSize: 12, color: "var(--color-muted)" }}>
              เบอร์โทรหรืออีเมลที่ให้ไว้กับร้าน
            </label>
            <input
              id="m-login-target"
              className="input"
              inputMode="email"
              autoComplete="username"
              placeholder="08x-xxx-xxxx หรือ you@email.com"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <button type="button" className="btn btn-primary w-full" disabled={pending} onClick={ask}>
              ขอรหัสยืนยัน
            </button>
          </>
        ) : (
          <>
            <label htmlFor="m-login-code" style={{ fontSize: 12, color: "var(--color-muted)" }}>
              กรอกรหัส 6 หลักที่ส่งไปที่ {maskedTo}
            </label>
            <input
              id="m-login-code"
              className="input text-center tracking-[0.4em]"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="______"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
            <button type="button" className="btn btn-primary w-full" disabled={pending} onClick={confirm}>
              ยืนยันรหัส
            </button>
            <button
              type="button"
              className="btn btn-ghost w-full"
              disabled={pending}
              onClick={() => {
                setStep("target");
                setCode("");
                setError("");
              }}
            >
              เปลี่ยนเบอร์/อีเมล
            </button>
            {devOtp ? <MMuted size={11.5}>รหัสสำหรับทดสอบ (ไม่แสดงบนระบบจริง): {devOtp}</MMuted> : null}
          </>
        )}
        {error ? <span style={{ fontSize: 12, color: "var(--color-danger)" }}>{error}</span> : null}
      </div>

      <div className="flex items-center gap-2">
        <span className="h-px flex-1" style={{ background: "var(--color-line)" }} />
        <MMuted size={11}>หรือ</MMuted>
        <span className="h-px flex-1" style={{ background: "var(--color-line)" }} />
      </div>

      <button
        type="button"
        data-testid="m-login-line"
        className="btn btn-ghost w-full"
        disabled={pending}
        onClick={lineLogin}
      >
        <MemberIcon name="chat" size="sm" />
        เข้าสู่ระบบด้วย LINE
      </button>

      {/* M3.11 — ทางไปหน้าสมัคร 3 ขั้น (คนที่ยังไม่เป็นสมาชิกขอรหัสที่หน้านี้ได้ แต่ยืนยันไม่ผ่านตลอดกาล) */}
      <a
        data-testid="m-login-join"
        href={`/m/${encodeURIComponent(slug)}/join`}
        className="text-center"
        style={{ fontSize: 12.5, color: "var(--color-accent)" }}
      >
        ยังไม่เป็นสมาชิก? สมัครสมาชิก
      </a>

      <MMuted size={11}>
        ข้อมูลของคุณใช้ตามนโยบายความเป็นส่วนตัวของร้าน — ขอสำเนาหรือขอลบได้ที่หน้าโปรไฟล์
      </MMuted>
    </div>
  );
}

export default MLoginForm;
