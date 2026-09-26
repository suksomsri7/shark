"use client";

// PortalLoginForm.tsx — หน้าเข้าสู่ระบบพอร์ทัลลูกค้าองค์กร `/b/<slug>/login` (ใบ C3.5 · ภาพ 12 ก)
//
// 2 แท็บ: อีเมล + OTP (ขอรหัส → กรอก 6 หลัก) · LINE (LIFF → route auth/line ตรวจ id_token กับ LINE)
// 🔴 ไฟล์ client: ไม่ import โมดูล CRM/prisma — server action + ที่อยู่ปลายทางมาทาง props (หน้าเป็นคนประกอบจาก PORTAL_BASE_PATH)
// 🔴 ข้อความผิดพลาดขึ้นใต้ช่อง (ไม่ใช่กล่องเด้ง) และไม่โทษผู้ใช้ · อีเมลที่ร้านไม่รู้จักได้หน้าจอเดียวกับคนที่รู้จัก
import { useState, useTransition } from "react";
import { loadLiff } from "@/components/member/MLoginForm";

type R<T> = ({ ok: true } & T) | { ok: false; error: string };
export type PortalRequestOtp = (slug: string, email: string) => Promise<R<{ otpId: string; maskedTo: string; devOtp?: string }>>;
export type PortalVerifyOtp = (slug: string, otpId: string, code: string) => Promise<R<{ next: string }>>;
export type PortalLineNonce = (slug: string) => Promise<R<{ nonce: string }>>;

const muted = { fontSize: 12, color: "var(--color-muted)" } as const;

export function PortalLoginForm(props: {
  slug: string;
  shopName: string;
  liffId: string;
  lineAuthUrl: string;
  allowEmail: boolean;
  allowLine: boolean;
  requestOtp: PortalRequestOtp;
  verifyOtp: PortalVerifyOtp;
  lineNonce: PortalLineNonce;
}) {
  const [tab, setTab] = useState<"email" | "line">(props.allowEmail ? "email" : "line");
  const [email, setEmail] = useState("");
  const [otpId, setOtpId] = useState("");
  const [maskedTo, setMaskedTo] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, start] = useTransition();

  function ask() {
    setError("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("กรอกอีเมลที่ลงทะเบียนไว้กับร้านก่อน จึงจะขอรหัสได้");
      return;
    }
    start(async () => {
      const r = await props.requestOtp(props.slug, email.trim());
      if (!r.ok) return setError(r.error);
      setOtpId(r.otpId);
      setMaskedTo(r.maskedTo);
      setDevOtp(r.devOtp ?? "");
      setCode("");
    });
  }

  function confirm() {
    setError("");
    if (!/^\d{6}$/.test(code.trim())) {
      setError("รหัสยืนยันมี 6 หลัก — กรอกให้ครบแล้วกดยืนยันอีกครั้ง");
      return;
    }
    start(async () => {
      const r = await props.verifyOtp(props.slug, otpId, code.trim());
      if (!r.ok) return setError(r.error);
      window.location.href = r.next;
    });
  }

  function lineLogin() {
    setError("");
    setInfo("");
    start(async () => {
      try {
        const liff = props.liffId ? await loadLiff() : null;
        if (!liff) return setError("เข้าสู่ระบบด้วย LINE ใช้ได้เมื่อเปิดจากแอป LINE — ใช้อีเมลแทนได้เลย");
        await liff.init({ liffId: props.liffId });
        if (!liff.isLoggedIn()) return liff.login();
        const idToken = liff.getIDToken();
        if (!idToken) return setError("ยังไม่ได้รับข้อมูลจาก LINE — ลองกดอีกครั้ง หรือใช้อีเมลแทน");
        // nonce ใช้ครั้งเดียว (คุกกี้ httpOnly ที่ server action ตั้ง) — route รับเฉพาะคำขอที่ส่งค่าตรงกัน
        const n = await props.lineNonce(props.slug);
        if (!n.ok) return setError(n.error);
        const res = await fetch(props.lineAuthUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken, nonce: n.nonce }) });
        const data = (await res.json()) as { ok?: boolean; next?: string; reason?: string; message?: string; pendingApproval?: boolean };
        if (data.pendingApproval) return setInfo(data.message ?? "ส่งคำขอให้ร้านตรวจสอบแล้ว");
        if (!data.ok || !data.next) return setError(data.reason ?? "เข้าสู่ระบบด้วย LINE ไม่สำเร็จ — ใช้อีเมลแทนได้");
        window.location.href = data.next;
      } catch {
        setError("เข้าสู่ระบบด้วย LINE ไม่สำเร็จ — ใช้อีเมลแทนได้");
      }
    });
  }

  const tabStyle = (on: boolean) => ({ borderColor: "var(--color-line)", background: on ? "var(--color-surface-2)" : "var(--color-surface)", fontWeight: on ? 600 : 400 });

  return (
    <div data-testid="portal-login" className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center gap-4 px-5 py-10">
      <div className="text-center">
        <div className="text-[15px] font-semibold">{props.shopName}</div>
        <div className="mt-1.5" style={muted}>พอร์ทัลลูกค้าองค์กร</div>
      </div>

      <div className="flex gap-2">
        {props.allowEmail && (
          <button type="button" data-testid="portal-login-tab-email" className="flex-1 rounded-lg border px-3 py-2.5 text-sm" style={tabStyle(tab === "email")} onClick={() => setTab("email")}>
            อีเมล + OTP
          </button>
        )}
        {props.allowLine && (
          <button type="button" data-testid="portal-login-tab-line" className="flex-1 rounded-lg border px-3 py-2.5 text-sm" style={tabStyle(tab === "line")} onClick={() => setTab("line")}>
            LINE
          </button>
        )}
      </div>

      {tab === "email" ? (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span style={muted}>อีเมลที่ลงทะเบียน</span>
            <input data-testid="portal-login-email" className="input" type="email" inputMode="email" autoComplete="email" placeholder="you@company.co.th" value={email} onChange={(e) => setEmail(e.target.value)} disabled={pending} />
          </label>
          <button type="button" data-testid="portal-otp-request" className="btn btn-ghost w-full" disabled={pending} onClick={ask}>
            {otpId ? "ส่งรหัสอีกครั้ง" : "ขอรหัส OTP"}
          </button>
          {otpId && (
            <>
              <label className="flex flex-col gap-1.5">
                <span style={muted}>รหัส OTP ส่งไปที่ {maskedTo} แล้ว</span>
                <input data-testid="portal-otp-code" className="input text-center tracking-[0.5em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="______" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} disabled={pending} />
              </label>
              <button type="button" data-testid="portal-otp-submit" className="btn btn-primary h-11 w-full" disabled={pending} onClick={confirm}>
                ยืนยันรหัส
              </button>
              {devOtp ? <span style={{ ...muted, fontSize: 11.5 }}>รหัสสำหรับทดสอบ (ไม่แสดงบนระบบจริง): {devOtp}</span> : null}
            </>
          )}
        </div>
      ) : null}

      {props.allowLine && (
        <>
          {props.allowEmail && <div className="h-px" style={{ background: "var(--color-line)" }} />}
          <button type="button" data-testid="portal-line-login" className="btn btn-ghost h-11 w-full" disabled={pending} onClick={lineLogin}>
            เข้าสู่ระบบด้วย LINE
          </button>
        </>
      )}

      {error ? <p role="alert" data-testid="portal-login-error" style={{ fontSize: 12.5, color: "var(--color-danger)" }}>{error}</p> : null}
      {info ? <p role="status" style={{ fontSize: 12.5, color: "var(--color-accent)" }}>{info}</p> : null}

      <p className="text-center" style={{ ...muted, fontSize: 11.5 }}>
        สิทธิ์เข้าพอร์ทัลเปิดโดยพนักงานของ {props.shopName}
        <br />
        ยังไม่ได้รับคำเชิญ? ติดต่อผู้ดูแลลูกค้าของคุณที่ร้าน
      </p>
    </div>
  );
}
