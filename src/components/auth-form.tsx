"use client";

import { useActionState } from "react";
import {
  requestLoginAction,
  verifyOtpAction,
  type AuthFormState,
} from "@/lib/actions/auth";

const initial: AuthFormState = { status: "idle" };

export function AuthForm({ heading }: { heading: string }) {
  const [reqState, reqAction, reqPending] = useActionState(requestLoginAction, initial);
  const [otpState, otpAction, otpPending] = useActionState(verifyOtpAction, initial);
  const sent = reqState.status === "sent";
  const email = reqState.status === "sent" ? reqState.email : "";

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <h1 className="text-2xl font-semibold">{heading}</h1>

      {/* Google Login (web flow — GET /api/auth/google/start) */}
      {!sent && (
        <>
          <a
            href="/api/auth/google/start"
            className="flex items-center justify-center gap-2 rounded-lg border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-medium hover:bg-[color:var(--color-surface-2)]"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4"><path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2 3.7-5 3.7-8.6z"/><path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5.1L1.3 17.2C3.3 21.2 7.3 24 12 24z"/><path fill="#FBBC05" d="M5.1 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L1.3 6.8C.5 8.4 0 10.1 0 12s.5 3.6 1.3 5.2l3.8-2.9z"/><path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.3 2.8 1.3 6.8l3.8 2.9c1-3 3.7-5 6.9-5z"/></svg>
            เข้าสู่ระบบด้วย Google
          </a>
          <a
            href="/api/auth/line/start"
            className="flex items-center justify-center gap-2 rounded-lg border border-[color:var(--color-border)] px-4 py-2.5 text-sm font-medium hover:bg-[color:var(--color-surface-2)]"
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="#06C755"><path d="M12 2C6.48 2 2 5.64 2 10.13c0 4.03 3.6 7.4 8.47 8.04.33.07.78.22.89.5.1.26.07.66.03.92l-.14.87c-.04.26-.2 1.01.89.55 1.1-.46 5.91-3.48 8.07-5.96C21.72 13.5 22 11.87 22 10.13 22 5.64 17.52 2 12 2z"/></svg>
            เข้าสู่ระบบด้วย LINE
          </a>
          <div className="flex items-center gap-3 text-xs text-[color:var(--color-muted)]">
            <div className="h-px flex-1 bg-[color:var(--color-border)]" />
            หรือใช้อีเมล
            <div className="h-px flex-1 bg-[color:var(--color-border)]" />
          </div>
        </>
      )}

      {!sent ? (
        <form action={reqAction} className="flex flex-col gap-3">
          <label className="text-sm text-[color:var(--color-muted)]" htmlFor="email">
            อีเมล
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]"
          />
          {reqState.status === "error" && (
            <p className="text-sm text-[color:var(--color-danger)]">{reqState.message}</p>
          )}
          <button type="submit" disabled={reqPending} className="btn btn-primary">
            {reqPending ? "กำลังส่ง..." : "ส่งรหัสเข้าสู่ระบบ"}
          </button>
        </form>
      ) : (
        <form action={otpAction} className="flex flex-col gap-3">
          <p className="text-sm text-[color:var(--color-muted)]">
            เราส่งรหัส 6 หลักไปที่ <span className="font-medium text-[color:var(--color-ink)]">{email}</span>
          </p>
          {reqState.status === "sent" && reqState.preview && (
            <div className="rounded-lg border border-dashed p-3 text-sm">
              <div className="mb-1 text-xs font-medium text-[color:var(--color-muted)]">
                โหมดทดลอง (ยังไม่ได้ต่ออีเมลจริง) — รหัสของคุณ:
              </div>
              <div className="text-lg font-semibold tracking-widest">{reqState.preview.otp}</div>
            </div>
          )}
          <input type="hidden" name="email" value={email} />
          <input
            name="code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            placeholder="______"
            className="rounded-lg border px-3 py-2 text-center text-lg tracking-[0.5em] outline-none focus:border-[color:var(--color-ink)]"
          />
          {otpState.status === "error" && (
            <p className="text-sm text-[color:var(--color-danger)]">{otpState.message}</p>
          )}
          <button type="submit" disabled={otpPending} className="btn btn-primary">
            {otpPending ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
          </button>
          {/* resend: ปุ่มใน form เดียวกัน override action ไป reqAction (ใช้ email hidden ด้านบน) */}
          <button
            type="submit"
            formAction={reqAction}
            className="text-sm text-[color:var(--color-muted)] underline"
          >
            ส่งรหัสอีกครั้ง
          </button>
        </form>
      )}
    </div>
  );
}
