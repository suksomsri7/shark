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
