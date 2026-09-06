"use client";

// หน้าตั้งค่า "ตราสินค้าและธีมกิจการ" (ledger/BRANDING-RUN.md §สัญญา B2 · แบบ ledger/DESIGN-BRANDING.md §4 ภาพ 01)
//
// โครง: การ์ดฟอร์มซ้าย (โลโก้/ชื่อ · สีหลัก+ความคมชัด · โทนแถบเมนู+สวิตช์) + ตัวอย่างสดขวา (sticky)
// ตัวอย่างสดคำนวณโทเคนธีม (navBg/navFg/…) เองในเบราว์เซอร์จาก state ปัจจุบัน — ยังไม่บันทึกจนกว่าจะกดปุ่ม
// 🔴 สูตรนี้ต้อง "หน้าตาเดียวกัน" กับ getBrandingTokens() ฝั่งเซิร์ฟเวอร์ (src/lib/branding/service.ts)
//    แต่คำนวณซ้ำที่นี่โดยตั้งใจ (ข้อมูลยังไม่ได้บันทึก เซิร์ฟเวอร์ไม่รู้จักค่าที่กำลังพรีวิวอยู่) —
//    ใช้ฟังก์ชันคณิตศาสตร์ล้วนจาก @/lib/branding/color ร่วมกัน ไม่คิดสูตรสีเองซ้ำ

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveBrandingAction,
  resetBrandingAction,
  uploadLogoAction,
} from "@/app/app/settings/branding/actions";
import { contrastRatio, fgAlpha, meetsAA, pickReadableFg, softOf, type ReadableFg } from "@/lib/branding/color";
import { BRANDING_PREVIEW_KEY } from "@/components/app-shell/ThemeRoot";
import type { NavToneValue } from "@/lib/branding/form";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
// ค่าปริยายของแพลตฟอร์มเมื่อยังไม่เลือกสี — ต้องตรงกับ DEFAULT_ACCENT ใน src/lib/branding/service.ts
const DEFAULT_ACCENT = "#1d4ed8";

const SWATCHES: { hex: string; label: string }[] = [
  { hex: "#0E7490", label: "เทียล" },
  { hex: "#1D4ED8", label: "น้ำเงิน" },
  { hex: "#7C3AED", label: "ม่วง" },
  { hex: "#DB2777", label: "ชมพู" },
  { hex: "#DC2626", label: "แดง" },
  { hex: "#EA580C", label: "ส้ม" },
  { hex: "#15803D", label: "เขียว" },
  { hex: "#0A0A0A", label: "ดำ" },
];

const NAV_TONE_OPTIONS: { value: NavToneValue; title: string; desc: string; testId: string }[] = [
  { value: "LIGHT", title: "สว่าง (ค่าเริ่มต้น)", desc: "เหมือนปัจจุบัน · สีหลักใช้เฉพาะจุดเน้น", testId: "branding-tone-LIGHT" },
  { value: "BRAND", title: "สีหลักของกิจการ", desc: "แถบเมนูเป็นสีแบรนด์ ตัวอักษรขาว/เข้มอัตโนมัติ", testId: "branding-tone-BRAND" },
  { value: "DARK", title: "เข้ม", desc: "แถบเมนูสีเทาเข้ม · โลโก้/จุดเน้นเป็นสีหลัก", testId: "branding-tone-DARK" },
];

/** โทเคนแถบเมนูของตัวอย่างสด — สูตรเดียวกับ tokensFrom() ใน service.ts (BRAND/DARK/LIGHT) */
function previewNavTokens(tone: NavToneValue, accent: string, accentFg: ReadableFg) {
  if (tone === "BRAND") {
    return { bg: accent, fg: accentFg, fg2: fgAlpha(accentFg, 0.72), on: fgAlpha(accentFg, 0.16) };
  }
  if (tone === "DARK") {
    return { bg: "#111827", fg: "#f9fafb", fg2: "#9ca3af", on: "rgba(255, 255, 255, 0.1)" };
  }
  return { bg: "#fafafa", fg: "#0a0a0a", fg2: "#737373", on: "#ffffff" };
}

type BrandingSettingsProps = {
  tenantName: string;
  canWrite: boolean;
  initial: {
    displayName: string;
    logoUrl: string;
    brandColor: string;
    navTone: NavToneValue;
    applyStorefront: boolean;
    applyMobile: boolean;
  };
};

export function BrandingSettings({ tenantName, canWrite, initial }: BrandingSettingsProps) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(initial.displayName);
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [brandColor, setBrandColor] = useState(initial.brandColor);
  const [navTone, setNavTone] = useState<NavToneValue>(initial.navTone);
  const [applyStorefront, setApplyStorefront] = useState(initial.applyStorefront);
  const [applyMobile, setApplyMobile] = useState(initial.applyMobile);
  const [rememberCollapse, setRememberCollapse] = useState(true);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [logoError, setLogoError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const [isSaving, startSave] = useTransition();
  const [isResetting, startReset] = useTransition();
  const [isUploading, startUpload] = useTransition();

  // กันกดยืนยัน "คืนค่าเริ่มต้น" ค้างไว้แล้วมากดทีหลังโดยไม่ตั้งใจ
  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);

  const trimmedColor = brandColor.trim();
  const validColor = trimmedColor === "" || HEX_RE.test(trimmedColor);
  const accent = HEX_RE.test(trimmedColor) ? trimmedColor : DEFAULT_ACCENT;
  const accentFg = pickReadableFg(accent);
  const ratio = contrastRatio(accentFg, accent);
  const passesAA = meetsAA(ratio);
  const nav = previewNavTokens(navTone, accent, accentFg);
  const previewName = displayName.trim() || tenantName;
  const initials = previewName.trim().slice(0, 2).toUpperCase() || "SH";
  const pending = isSaving || isResetting || isUploading;

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.set("displayName", displayName);
    fd.set("brandColor", brandColor);
    fd.set("navTone", navTone);
    fd.set("applyStorefront", applyStorefront ? "on" : "off");
    fd.set("applyMobile", applyMobile ? "on" : "off");
    fd.set("rememberCollapse", rememberCollapse ? "on" : "off");
    return fd;
  }

  /**
   * "ดูตัวอย่างเต็มจอ" (B3) — เขียนโทเคนที่ **ยังไม่บันทึก** ลง sessionStorage แล้วเปิดแอปจริงในแท็บใหม่
   * 🔴 ห้ามใส่ rel="noopener": เบราว์เซอร์ก๊อป sessionStorage ให้แท็บใหม่เฉพาะเมื่อยังอยู่ใน
   *    browsing context group เดียวกัน — ใส่ noopener แล้ว ThemeRoot จะอ่านไม่เจอและได้ธีมที่บันทึกไว้แทน
   *    (origin เดียวกันทั้งคู่ ⇒ ไม่ใช่ช่องโหว่ tabnabbing)
   * 🔴 ไม่แตะ DB เลย — คนอื่นในร้านไม่เห็นอะไรจนกว่าจะกด "บันทึกและใช้กับทั้งร้าน"
   */
  function openFullPreview() {
    try {
      window.sessionStorage.setItem(
        BRANDING_PREVIEW_KEY,
        JSON.stringify({
          accent,
          accentFg,
          accentSoft: softOf(accent),
          navBg: nav.bg,
          navFg: nav.fg,
          navFg2: nav.fg2,
          navOn: nav.on,
        }),
      );
    } catch {
      // เบราว์เซอร์ปิด storage (โหมดส่วนตัวบางตัว) — เปิดต่อได้ แค่จะเห็นธีมที่บันทึกไว้แทนของที่กำลังลอง
    }
    window.open("/app?theme=preview", "_blank");
  }

  function handleSave() {
    setErrors({});
    setSavedMsg(null);
    startSave(async () => {
      const res = await saveBrandingAction(buildFormData());
      if (res.ok) {
        setSavedMsg("บันทึกและใช้กับทั้งร้านเรียบร้อยแล้ว");
        router.refresh();
      } else {
        setErrors(res.errors);
      }
    });
  }

  function handleReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    setErrors({});
    setSavedMsg(null);
    startReset(async () => {
      const res = await resetBrandingAction();
      if (res.ok) {
        setDisplayName("");
        setLogoUrl("");
        setBrandColor(DEFAULT_ACCENT);
        setNavTone("LIGHT");
        setApplyStorefront(true);
        setApplyMobile(true);
        setSavedMsg("คืนค่าเริ่มต้นเรียบร้อยแล้ว");
        router.refresh();
      } else {
        setErrors(res.errors);
      }
    });
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    startUpload(async () => {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadLogoAction(fd);
      if (res.ok) {
        setLogoUrl(res.cdnUrl);
      } else {
        setLogoError(res.error);
      }
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  const previewStyle = {
    "--color-accent": accent,
    "--color-accent-fg": accentFg,
    "--nav-bg": nav.bg,
    "--nav-fg": nav.fg,
    "--nav-fg2": nav.fg2,
    "--nav-on": nav.on,
  } as React.CSSProperties;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* ── ฟอร์มซ้าย ── */}
      <fieldset disabled={!canWrite} className="flex min-w-0 flex-1 flex-col gap-4 disabled:opacity-90">
        {/* โลโก้ + ชื่อที่แสดง */}
        <div className="card flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold">โลโก้กิจการ</h3>
            <p className="text-xs text-[color:var(--color-muted)]">
              PNG/SVG/JPG/WEBP พื้นโปร่งแนะนำ · ไม่เกิน 2 MB
            </p>
          </div>
          <div
            data-testid="branding-logo-preview"
            className="flex items-center gap-4 rounded-lg border border-dashed p-4"
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={previewName} className="h-16 w-16 rounded-xl border object-contain" />
            ) : (
              <div
                className="grid h-16 w-16 shrink-0 place-items-center rounded-xl text-xl font-bold"
                style={{ backgroundColor: accent, color: accentFg }}
              >
                {initials}
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="truncate text-sm font-medium">{logoUrl ? "โลโก้ปัจจุบัน" : "ยังไม่มีโลโก้ — ใช้ตัวย่อแทน"}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn-sm"
                  data-testid="branding-logo-upload"
                  onClick={() => fileRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? "กำลังอัปโหลด…" : logoUrl ? "เปลี่ยนรูป" : "อัปโหลดโลโก้"}
                </button>
                {logoUrl && (
                  <button type="button" className="btn-sm" onClick={() => setLogoUrl("")}>
                    ลบโลโก้
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
              {logoError && <p className="text-xs text-[color:var(--color-danger)]">{logoError}</p>}
              <div className="flex items-center gap-4 text-[11px] text-[color:var(--color-muted)]">
                <span className="flex items-center gap-1">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="h-[34px] w-[34px] rounded-lg border object-contain" />
                  ) : (
                    <span
                      className="grid h-[34px] w-[34px] place-items-center rounded-lg text-xs font-bold"
                      style={{ backgroundColor: accent, color: accentFg }}
                    >
                      {initials}
                    </span>
                  )}
                  แถบบน
                </span>
                <span className="flex items-center gap-1">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="h-6 w-6 rounded border object-contain" />
                  ) : (
                    <span
                      className="grid h-6 w-6 place-items-center rounded text-[10px] font-bold"
                      style={{ backgroundColor: accent, color: accentFg }}
                    >
                      {initials}
                    </span>
                  )}
                  favicon
                </span>
              </div>
            </div>
          </div>

          <label className="flex flex-col gap-1 text-xs font-semibold text-[color:var(--color-ink-soft)]">
            ชื่อที่แสดง
            <input
              className="input font-normal"
              data-testid="branding-display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={tenantName}
              maxLength={200}
            />
            {errors.displayName ? (
              <span className="text-[color:var(--color-danger)]">{errors.displayName}</span>
            ) : (
              <span className="font-normal text-[color:var(--color-muted)]">
                ว่าง = ใช้ชื่อกิจการ · แสดงข้างโลโก้ที่แถบบนและในอีเมล
              </span>
            )}
          </label>
        </div>

        {/* สีหลักของกิจการ */}
        <div className="card flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold">สีหลักของกิจการ</h3>
            <p className="text-xs text-[color:var(--color-muted)]">
              ใช้กับปุ่มหลัก ลิงก์ รายการที่เลือก แถบเน้น และ (ถ้าเลือก) แถบเมนูซ้าย
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {SWATCHES.map((s) => (
              <button
                key={s.hex}
                type="button"
                title={s.label}
                aria-label={s.label}
                data-testid={`branding-swatch-${s.hex}`}
                onClick={() => setBrandColor(s.hex)}
                className="h-8 w-8 shrink-0 rounded-lg"
                style={{
                  backgroundColor: s.hex,
                  outline: accent.toUpperCase() === s.hex.toUpperCase() ? "2px solid var(--color-ink)" : "none",
                  outlineOffset: "2px",
                }}
              />
            ))}
            <label className="flex h-9 items-center gap-2 rounded-lg border px-2 text-sm">
              <input
                type="color"
                aria-label="เลือกสีเอง"
                value={HEX_RE.test(trimmedColor) ? trimmedColor : DEFAULT_ACCENT}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <input
                className="w-24 border-0 p-0 text-sm outline-none"
                data-testid="branding-hex"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                placeholder="#1A2B3C"
              />
            </label>
          </div>
          {!validColor && (
            <p className="text-xs text-[color:var(--color-danger)]">
              รหัสสีต้องเป็นรูปแบบ #RRGGBB เช่น #1A2B3C
            </p>
          )}
          {errors.brandColor && <p className="text-xs text-[color:var(--color-danger)]">{errors.brandColor}</p>}

          <div data-testid="branding-contrast" className="rounded-lg border bg-[color:var(--color-surface-2)] p-3 text-xs">
            ตัวอักษรบนสีนี้ใช้ <b>{accentFg === "#ffffff" ? "สีขาว" : "สีเข้ม"}</b> · อัตราส่วนความคมชัด{" "}
            <b>{ratio.toFixed(1)}:1</b> —{" "}
            {passesAA ? (
              <span className="font-semibold text-green-700">ผ่านเกณฑ์อ่านง่าย (WCAG AA)</span>
            ) : (
              <span className="font-semibold text-amber-700">ไม่ผ่าน WCAG AA — ระบบสลับตัวอักษรให้อัตโนมัติแล้ว</span>
            )}
          </div>
        </div>

        {/* แถบเมนูซ้าย + สวิตช์ */}
        <div className="card flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold">แถบเมนูซ้าย</h3>
            <p className="text-xs text-[color:var(--color-muted)]">
              เลือกโทนของแถบเมนู (เดสก์ท็อป/iPad · รางไอคอนตอนย่อใช้โทนเดียวกัน)
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {NAV_TONE_OPTIONS.map((opt) => {
              const tones = previewNavTokens(opt.value, accent, accentFg);
              const active = navTone === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={opt.testId}
                  onClick={() => setNavTone(opt.value)}
                  className="flex flex-col gap-2 rounded-xl border p-2.5 text-left"
                  style={active ? { borderColor: accent, boxShadow: `0 0 0 3px ${accent}22` } : undefined}
                >
                  <span className="flex h-12 overflow-hidden rounded-lg border">
                    <span className="w-1/3" style={{ backgroundColor: tones.bg }} />
                    <span className="flex-1 bg-white" />
                  </span>
                  <span className="text-xs font-semibold">
                    {opt.title}
                    {active ? " ✓" : ""}
                  </span>
                  <span className="text-[11px] text-[color:var(--color-muted)]">{opt.desc}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col">
            <ToggleRow
              testId="branding-toggle-collapse"
              title="จำสถานะย่อ/ขยายแถบเมนูของแต่ละคน"
              desc="ผู้ใช้กด ‹ ย่อเป็นรางไอคอน 56px — ระบบจำต่อบัญชีอยู่แล้วเสมอ (ค่านี้บอกให้ทราบ ไม่ได้ปิดการจำ)"
              checked={rememberCollapse}
              onChange={setRememberCollapse}
            />
            <ToggleRow
              testId="branding-toggle-storefront"
              title="ใช้ธีมนี้กับหน้าร้านออนไลน์ / ใบเสนอราคา / อีเมลถึงลูกค้า"
              desc="เดิมตั้งแยกที่ White label — รวมมาที่นี่ ตั้งครั้งเดียวใช้ทุกที่"
              checked={applyStorefront}
              onChange={setApplyStorefront}
            />
            <ToggleRow
              testId="branding-toggle-mobile"
              title="ใช้ธีมนี้กับแอปมือถือ SHARK HUB"
              desc="แอปดึงโลโก้+สีตอนล็อกอิน — จอแชท AI/รายการแชท/ปุ่มหลักเปลี่ยนตาม"
              checked={applyMobile}
              onChange={setApplyMobile}
            />
          </div>
        </div>

        {errors._ && <p className="text-sm font-medium text-[color:var(--color-danger)]">{errors._}</p>}
        {savedMsg && !Object.keys(errors).length && (
          <p className="text-sm font-medium text-green-700">✅ {savedMsg}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary disabled:opacity-50"
            data-testid="branding-save"
            onClick={handleSave}
            disabled={pending}
          >
            {isSaving ? "กำลังบันทึก…" : "บันทึกและใช้กับทั้งร้าน"}
          </button>
          <button
            type="button"
            className="btn btn-sm disabled:opacity-50"
            data-testid="branding-reset"
            onClick={handleReset}
            disabled={pending}
          >
            {isResetting ? "กำลังคืนค่า…" : confirmReset ? "ยืนยันคืนค่าเริ่มต้น?" : "คืนค่าเริ่มต้น"}
          </button>
        </div>
      </fieldset>

      {/* ── ตัวอย่างสด ── */}
      <div className="w-full lg:sticky lg:top-4 lg:w-[420px] lg:shrink-0">
        <div className="card flex flex-col gap-3 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">ตัวอย่างสด</h3>
            <button type="button" onClick={openFullPreview} className="btn-sm text-xs">
              ดูตัวอย่างเต็มจอ
            </button>
          </div>
          <div
            data-testid="branding-preview"
            style={previewStyle}
            className="overflow-hidden rounded-lg border text-xs"
          >
            <div
              className="flex h-10 items-center gap-2 border-b px-3"
              style={{ background: "var(--nav-bg)", color: "var(--nav-fg)" }}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-5 w-5 rounded object-contain" style={{ background: "#fff" }} />
              ) : (
                <span
                  className="grid h-5 w-5 place-items-center rounded text-[9px] font-bold"
                  style={{ backgroundColor: "var(--color-accent)", color: "var(--color-accent-fg)" }}
                >
                  {initials}
                </span>
              )}
              <span className="truncate font-semibold">{previewName}</span>
            </div>
            <div className="flex h-[220px]">
              <div
                className="flex w-[110px] shrink-0 flex-col gap-1 p-2"
                style={{ background: "var(--nav-bg)", color: "var(--nav-fg2)" }}
              >
                {["หน้าหลัก", "แชทลูกค้า", "บัญชี", "บอร์ดงาน"].map((label, i) => (
                  <div
                    key={label}
                    className="truncate rounded px-1.5 py-1"
                    style={
                      i === 3
                        ? { background: "var(--nav-on)", color: "var(--nav-fg)", fontWeight: 700 }
                        : undefined
                    }
                  >
                    {label}
                  </div>
                ))}
                <div
                  className="mt-auto rounded px-1.5 py-1 text-center font-semibold"
                  style={{ background: "var(--color-accent-fg)", color: "var(--color-accent)" }}
                >
                  + เพิ่มระบบ
                </div>
              </div>
              <div className="flex-1 bg-white p-2.5">
                <div className="font-semibold">บอร์ดงาน</div>
                <div className="mb-2 text-[11px] text-[color:var(--color-muted)]">3 บอร์ด · การ์ดค้าง 38 ใบ</div>
                <div
                  className="mb-2 inline-flex rounded px-2 py-1 text-[11px] font-semibold"
                  style={{ background: "var(--color-accent)", color: "var(--color-accent-fg)" }}
                >
                  + สร้างบอร์ด
                </div>
                <div className="rounded border p-2 text-[11px]" style={{ borderLeft: "3px solid var(--color-accent)" }}>
                  <b>งานร้าน — สาขาป่าตอง</b>
                  <div className="text-[color:var(--color-muted)]">24 การ์ด</div>
                </div>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-[color:var(--color-muted)]">
            ตัวอย่างอัปเดตทันทีเมื่อเปลี่ยนสี/โลโก้/โทนแถบ — ยังไม่บันทึกจนกว่าจะกดปุ่ม &quot;บันทึกและใช้กับทั้งร้าน&quot;
          </p>
        </div>
      </div>
    </div>
  );
}

function ToggleRow({
  testId,
  title,
  desc,
  checked,
  onChange,
}: {
  testId: string;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 border-t py-2.5 text-sm first:border-t-0">
      <div className="flex-1">
        <div className="font-medium">{title}</div>
        <div className="text-[11px] text-[color:var(--color-muted)]">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        className="relative h-[22px] w-10 shrink-0 rounded-full transition-colors"
        style={{ backgroundColor: checked ? "var(--color-accent)" : "#d4d4d4" }}
      >
        <span
          className="absolute top-[3px] h-4 w-4 rounded-full bg-white transition-all"
          style={{ left: checked ? "20px" : "3px" }}
        />
      </button>
    </div>
  );
}

export default BrandingSettings;
