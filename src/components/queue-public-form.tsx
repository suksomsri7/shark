"use client";

import { useState } from "react";

type PublicType = { id: string; name: string; prefix: string; requireContact: boolean };

// ฟอร์มรับบัตรคิว (public) — เลือกประเภท(ถ้ามีหลาย) + เบอร์(เฉพาะประเภทที่ต้องใช้)
// validation inline ฝั่ง client (เบอร์) · server ตรวจซ้ำเป็นตัวจริง
// action = server action ส่งเข้ามาจากหน้า (route colocated) — เลี่ยง import ข้าม bracket path
export function QueuePublicForm({
  action,
  tenantSlug,
  unitSlug,
  types,
  serverError,
  presetTypeId,
}: {
  action: (formData: FormData) => void | Promise<void>;
  tenantSlug: string;
  unitSlug: string;
  types: PublicType[];
  serverError?: string;
  presetTypeId?: string;
}) {
  const initial =
    types.find((t) => t.id === presetTypeId)?.id ?? types[0]?.id ?? "";
  const [typeId, setTypeId] = useState(initial);
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = types.find((t) => t.id === typeId);
  const needPhone = selected?.requireContact ?? false;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!typeId) {
      e.preventDefault();
      setErr("กรุณาเลือกประเภทคิว");
      return;
    }
    if (needPhone) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length < 9 || digits.length > 15) {
        e.preventDefault();
        setErr("กรุณากรอกเบอร์โทรให้ถูกต้อง");
        return;
      }
    }
    setErr(null);
    setSubmitting(true); // ปล่อยให้ submit ต่อ (server action redirect)
  }

  const shownErr = err ?? serverError ?? null;

  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <input type="hidden" name="unitSlug" value={unitSlug} />
      <input type="hidden" name="typeId" value={typeId} />

      {types.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium">เลือกประเภทคิว</div>
          <div className="flex flex-col gap-2">
            {types.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => setTypeId(t.id)}
                className={`flex min-h-[44px] items-center justify-between rounded-xl border px-4 py-2 text-left ${
                  typeId === t.id
                    ? "border-2 border-[color:var(--color-ink)] font-medium"
                    : "border"
                }`}
              >
                <span>{t.name}</span>
                <span className="text-xs text-[color:var(--color-muted)]">{t.prefix}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {needPhone && (
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">เบอร์โทร</span>
          <span className="text-xs text-[color:var(--color-muted)]">
            เพื่อแจ้งเตือนเมื่อใกล้ถึงคิวคุณ
          </span>
          <input
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08x-xxx-xxxx"
            className="min-h-[44px] w-full rounded-xl border px-4 py-2 text-base"
          />
        </label>
      )}

      {shownErr && (
        <div className="rounded-lg border border-[color:var(--color-danger)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-danger)]">
          {shownErr}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !typeId}
        className="btn btn-primary min-h-[52px] w-full text-base font-semibold disabled:opacity-60"
      >
        {submitting ? "กำลังรับบัตร…" : "รับบัตรคิว"}
      </button>
    </form>
  );
}

export default QueuePublicForm;
