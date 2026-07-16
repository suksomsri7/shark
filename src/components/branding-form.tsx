"use client";

import { useActionState, useState } from "react";
import { saveBrandingAction, type SaveBrandingState } from "@/app/app/settings/branding/actions";
import { FormField } from "@/components/ui/FormField";

const initial: SaveBrandingState = { status: "idle" };
const inputCls =
  "rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// ฟอร์มตั้งค่าแบรนด์ร้าน + พรีวิวสด (พิมพ์ปุ๊บเห็นปั๊บ)
export function BrandingForm({
  fallbackName,
  defaultDisplayName,
  defaultLogoUrl,
  defaultBrandColor,
}: {
  fallbackName: string;
  defaultDisplayName: string;
  defaultLogoUrl: string;
  defaultBrandColor: string;
}) {
  const [state, action, pending] = useActionState(saveBrandingAction, initial);
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [logoUrl, setLogoUrl] = useState(defaultLogoUrl);
  const [brandColor, setBrandColor] = useState(defaultBrandColor);

  const previewName = displayName.trim() || fallbackName;
  const validColor = HEX_RE.test(brandColor.trim());
  const accent = validColor ? brandColor.trim() : undefined;
  const previewLogo = /^https?:\/\//i.test(logoUrl.trim()) ? logoUrl.trim() : "";
  // input type=color ต้องเป็น #RRGGBB เสมอ — ค่าที่ยังไม่ valid ให้ fallback สีกลาง
  const colorPickerValue = validColor ? brandColor.trim() : "#1A2B3C";

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-4">
        <FormField label="ชื่อที่แสดง" hint="เว้นว่าง = ใช้ชื่อร้านตามระบบ">
          <input
            name="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={fallbackName}
            className={inputCls}
          />
        </FormField>

        <FormField label="ลิงก์โลโก้ (URL)" hint="ต้องขึ้นต้นด้วย http:// หรือ https:// · เว้นว่างได้">
          <input
            name="logoUrl"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            inputMode="url"
            placeholder="https://example.com/logo.png"
            className={inputCls}
          />
        </FormField>

        <FormField label="สีหลัก" hint="รูปแบบ #RRGGBB · เว้นว่างได้">
          <div className="flex items-center gap-2">
            <input
              type="color"
              aria-label="เลือกสีหลัก"
              value={colorPickerValue}
              onChange={(e) => setBrandColor(e.target.value.toUpperCase())}
              className="h-9 w-12 shrink-0 cursor-pointer rounded border"
            />
            <input
              name="brandColor"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              placeholder="#1A2B3C"
              className={`${inputCls} flex-1`}
            />
          </div>
        </FormField>

        {brandColor.trim() !== "" && !validColor && (
          <p className="text-xs text-[color:var(--color-danger)]">
            รหัสสีต้องเป็นรูปแบบ #RRGGBB เช่น #1A2B3C
          </p>
        )}
        {state.status === "error" && (
          <p className="text-sm text-[color:var(--color-danger)]">{state.message}</p>
        )}
        {state.status === "ok" && (
          <p className="text-sm font-medium">✅ บันทึกแบรนด์เรียบร้อย</p>
        )}

        <button type="submit" disabled={pending} className="btn btn-primary disabled:opacity-50">
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </form>

      <div className="card flex flex-col gap-3">
        <h2 className="text-sm font-medium">พรีวิวหน้าร้าน</h2>
        <div
          className="flex items-center gap-3 rounded-lg border p-4"
          style={accent ? ({ ["--color-accent"]: accent } as React.CSSProperties) : undefined}
        >
          {previewLogo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewLogo}
              alt={previewName}
              className="h-10 w-10 rounded object-contain"
            />
          ) : (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-sm font-bold text-white"
              style={{ backgroundColor: accent ?? "var(--color-muted)" }}
            >
              {previewName.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <div
              className="truncate text-base font-semibold"
              style={accent ? { color: accent } : undefined}
            >
              {previewName}
            </div>
            <div className="text-xs text-[color:var(--color-muted)]">ตัวอย่างหัวหน้าร้านค้า/ฟอร์ม</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BrandingForm;
