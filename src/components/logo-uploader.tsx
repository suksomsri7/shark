"use client";

import { useRef, useState, useTransition } from "react";
import { uploadLogoAction } from "@/lib/storage/actions";

const inputCls = "rounded-lg border px-2 py-1.5 text-sm";

// ช่องโลโก้ในหน้าตั้งค่า — วาง URL ได้เหมือนเดิม + ปุ่มอัปโหลด (เมื่อ storage เปิด)
// อัปโหลดสำเร็จ → เซ็ต URL ในช่องเป็น cdnUrl อัตโนมัติ (ยังต้องกด "บันทึก" เพื่อจัดเก็บ)
export function LogoUploader({
  defaultUrl,
  enabled,
}: {
  defaultUrl: string;
  enabled: boolean;
}) {
  const [url, setUrl] = useState(defaultUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      try {
        const res = await uploadLogoAction(fd);
        if (res.ok) {
          setUrl(res.cdnUrl);
        } else {
          setError(res.error);
        }
      } catch {
        setError("อัปโหลดไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  return (
    <div className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
      โลโก้ (URL)
      <input
        name="logoUrl"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://…"
        className={inputCls}
      />
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="ตัวอย่างโลโก้" className="mt-1 h-12 w-12 rounded object-contain" />
      )}
      {enabled && (
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="btn btn-ghost text-xs disabled:opacity-50"
          >
            {pending ? "กำลังอัปโหลด…" : "อัปโหลดโลโก้"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onPick}
            className="hidden"
          />
        </div>
      )}
      {error && <span className="text-[color:var(--color-danger)]">{error}</span>}
    </div>
  );
}

export default LogoUploader;
