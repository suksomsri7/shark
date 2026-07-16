"use client";

import { useActionState } from "react";
import {
  loginRequestAction,
  loginVerifyAction,
  type BackofficeFormState,
} from "@/lib/platform/actions";

const initial: BackofficeFormState = { status: "idle" };

// ฟอร์มเข้าสู่ระบบหลังบ้าน 2 ขั้น (อีเมล → OTP) — minimal, ไม่มีสมัครสมาชิก
export default function BackofficeLoginPage() {
  const [reqState, reqAction, reqPending] = useActionState(loginRequestAction, initial);
  const [otpState, otpAction, otpPending] = useActionState(loginVerifyAction, initial);
  const sent = reqState.status === "sent";
  const email = reqState.status === "sent" ? reqState.email : "";

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">เข้าสู่ระบบหลังบ้าน</h1>
        <p className="text-sm text-[color:var(--color-muted)]">
          สำหรับผู้ดูแลแพลตฟอร์มเท่านั้น
        </p>
      </div>

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
            placeholder="admin@shark.in.th"
            className="input"
          />
          {reqState.status === "error" && (
            <p className="text-sm text-[color:var(--color-danger)]">{reqState.message}</p>
          )}
          <button type="submit" disabled={reqPending} className="btn btn-primary disabled:opacity-50">
            {reqPending ? "กำลังส่ง..." : "ส่งรหัสเข้าสู่ระบบ"}
          </button>
        </form>
      ) : (
        <form action={otpAction} className="flex flex-col gap-3">
          <p className="text-sm text-[color:var(--color-muted)]">
            หากอีเมลนี้เป็นผู้ดูแล เราได้ส่งรหัส 6 หลักไปที่{" "}
            <span className="font-medium text-[color:var(--color-ink)]">{email}</span>
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
          <button type="submit" disabled={otpPending} className="btn btn-primary disabled:opacity-50">
            {otpPending ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
          </button>
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
