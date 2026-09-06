# B4 — หน้าร้าน/ฟอร์มสาธารณะ/พิมพ์เอกสาร/อีเมล อ่านธีมจากที่เดียว (บันทึกผู้ทำ)

> WO: `ledger/BRANDING-RUN.md` §สัญญา B4 (T3)
> ข้อสอบ: `scripts/qc-branding-b4.mts` (7 ข้อ · Fable เขียน · builder ไม่แตะ)
> ผล: **7/7 · CRITICAL 0 · MAJOR 0 · MINOR 0**

## 1. ไฟล์ที่แตะ

**ใหม่**
- `src/lib/branding/public.ts` — `publicThemeStyle(branding: PublicBranding) → CSSProperties` ตัวช่วยเดียวของหน้าสาธารณะ (`--color-accent` / `--color-accent-fg` / `--color-accent-soft` เมื่อมี `brandColor` · `{}` เมื่อไม่มี — ห้ามใส่ค่า null/undefined เป็นค่า CSS var)

**แก้**
- `src/lib/branding/service.ts` — `PublicBranding` เพิ่มฟิลด์ `brandFg: string | null` · `getPublicBranding` คำนวณ/ส่งกลับ `brandFg` (ตาม `accentFg` ของ tokens เมื่อมีสี · `null` เมื่อไม่มีสีหรือ `applyStorefront=false`)
- `src/app/(store)/s/[tenantSlug]/[unitSlug]/shop/page.tsx` — เลิกประกอบ `{ ["--color-accent"]: branding.brandColor }` เอง → เรียก `publicThemeStyle(branding)` · หัวข้อชื่อสาขาใช้ `var(--color-accent)` แทนพิมพ์ hex ดิบ
- `src/app/(store)/f/[token]/page.tsx` — เหมือนกัน (`publicThemeStyle` + `var(--color-accent)` บนหัวฟอร์ม)
- `src/app/app/sys/[id]/account/print/[docId]/page.tsx` — โหลด `getPublicBranding(tenantId)` คู่กับ `getDocument`/`getSettings` · `tenantLogo = s.logoUrl ?? branding.logoUrl` (T3: โลโก้ของระบบบัญชีมาก่อน ไม่มี → ใช้โลโก้กิจการ) · หัวเอกสาร (`orgDisplayName(s)`) ไม่แตะ
- `src/lib/modules/kanban/notify.ts` — ในกิ่งส่งอีเมล (`notifyKanbanUser`) เพิ่ม lazy import `getBrandingTokens` (คู่กับ `emailEnabled`/`sendEmail` ที่ lazy อยู่แล้ว) → หัวเรื่องอีเมลเป็น `[${tokens.displayName}] ${input.title}` · ไม่แตะ `core/email.ts` (ยังส่ง text ล้วนเหมือนเดิม)
- `scripts/visual-branding.mts` — เพิ่ม spec `"b4"` (ดู §4) + ขยาย `Spec.branding`/`applyBranding()` ให้รับ `logoUrl`/`applyStorefront` เป็นออปชัน (ปริยายเหมือนเดิมทุกประการ — ไม่กระทบ spec b2/b3)

## 2. เส้นทางค่า (ใครอ่านอะไร)

```
TenantBranding (DB)
  └─ getBrandingTokens(tenantId)  ← ที่เดียวที่คำนวณสูตร BRAND/DARK/accent (B1)
       ├─ getPublicBranding(tenantId) → { displayName, logoUrl, brandColor, brandFg }
       │     (applyStorefront=false → logoUrl/brandColor/brandFg = null · displayName คงอยู่)
       │     ├─ shop/page.tsx  ─┐
       │     └─ f/[token]/page.tsx ┴─► publicThemeStyle(branding) → CSSProperties บน <main>/<header>
       └─ (ตรง) print/[docId]/page.tsx  → tenantLogo fallback
       └─ (ตรง, lazy) kanban/notify.ts  → หัวเรื่องอีเมล [displayName]
```

- `publicThemeStyle` ไม่รู้จัก `TenantBranding`/DB — รับแค่ `PublicBranding` (pure, ทดสอบง่าย) ตรงข้ามกับ `ThemeRoot` ของ B3 ที่ตั้ง var ที่ `document.documentElement` (ฝั่ง client เต็มแอป) → ฝั่งนี้ตั้งเป็น inline `style` บน element เดียว (หน้าร้าน/ฟอร์มไม่มี provider ของแอป)

## 3. ส่วนที่ตัดสินใจเอง / เผื่อ Fable อยากรู้เหตุผล

1. **หัวข้อชื่อสาขา/ชื่อฟอร์มเปลี่ยนจาก `style={{ color: branding.brandColor }}` เป็น `style={{ color: "var(--color-accent)" }}`** — ของเดิมพิมพ์ hex ดิบซ้ำ (คนละที่กับตัวแปร CSS ที่ `publicThemeStyle` เพิ่งตั้งไว้ข้างบน) ผลลัพธ์เหมือนกันทุกประการแต่ลดจุดที่ต้องรู้จักค่า hex จริงเหลือที่เดียว
2. **ปุ่มหลักของหน้าร้าน/ฟอร์ม (`ShopStorefront` "ยืนยันสั่งซื้อ" · `SubmitButton` "ส่งข้อมูล") ไม่ได้เปลี่ยนไปใช้ accent** — ทั้งคู่ใช้ `.btn-primary` (พื้น `--color-ink` ดำ) ซึ่งเป็นดีไซน์ตั้งใจของทั้งระบบ (`globals.css` หัวไฟล์: "ยึด grayscale ล้วน + accent เดียว — ไม่ใช่แทน ink") ปุ่มหลักทั้งแอปเป็นสีเข้มเสมอ ส่วน accent สงวนไว้กับลิงก์/หัวข้อ/ไฮไลต์เท่านั้น ไม่มี hard-code น้ำเงินอยู่แล้วในสองไฟล์นี้ตั้งแต่ต้น (ตรวจซ้ำด้วย `grep bg-blue|#2563eb|#1d4ed8` = ไม่เจอ) จึงไม่มีอะไรต้องไล่แก้ตามตัวหนังสือ WO ข้อนี้
3. **`getBrandingTokens` ในอีเมลใช้ lazy import** ตามที่ WO ระบุไว้ตรง ๆ แม้ตรวจแล้วว่า `@/lib/branding/service` ไม่ import `@/lib/env` (static import ก็ไม่พังอะไร) — เลือกทำตามรูปแบบเดิมของฟังก์ชันนี้ (env/email ก็ lazy อยู่แล้ว) เพื่อความสม่ำเสมอ ไม่ใช่เพราะจำเป็นทางเทคนิค
4. **หมายเหตุ B4-S1.2 ("ปุ่มหลัก/ลิงก์ใช้ accent")**: oracle เช็คเฉพาะว่าไม่มี hard-code น้ำเงินในสองไฟล์ page.tsx (ไม่ได้เช็คปุ่มแยก) — ตีความตรงตามข้อ 2 ข้างบน

## 4. Harness ภาพ (`scripts/visual-branding.mts b4`)

- ยืมร้าน QC เดียวกับ B2/B3 (`siam-dive-kanban-qc`) — ร้านนี้มี `BusinessUnit` type `SHOP` อยู่แล้ว 2 สาขา (`patong`/`kata` — คนละโมเดลกับ `AppSystem`/Kanban ไม่ต้องมีระบบ SHOP ผูกก็ยิงหน้าร้านได้ เพราะ `resolveUnit` เช็คแค่ `BusinessUnit.type=SHOP` + สถานะ ACTIVE)
- **ไม่มีโลโก้จริงของร้าน QC** ในฐานข้อมูล/Bunny CDN ที่หยิบมาใช้ได้ตรง ๆ (ค้นแล้ว: `TenantBranding.logoUrl` ทุกแถวเป็น null, ไม่มี URL รูปจริงในสคริปต์ QC อื่นนอกจาก `https://x.com/logo.png` ปลอมของ `qc-branding.mts`) → **ใช้ asset คงที่ของแอปเอง** `${BASE}/apple-touch-icon.png` (เสิร์ฟจากเซิร์ฟเวอร์ QC เดียวกัน) แทนโลโก้จริง — พิสูจน์ได้ว่า path โลโก้/`<img>` ทำงานจริง แต่ไม่ใช่โลโก้ตัวจริงของร้าน QC (ระบุไว้ในคอมเมนต์หัว spec แล้ว)
- 2 สเปก: `shop-teal-logo` (ตั้งเทียล+โลโก้ `applyStorefront:true`) → `shop-storefront-off` (สีเดิม + `applyStorefront:false`) — ระหว่าง 2 สเปกรอแคชโทเคน 60 วิของเซิร์ฟเวอร์หมดอายุ (แพตเทิร์นเดียวกับ B3) · `finally` คืน `brandColor=null · navTone=LIGHT` เหมือน B2/B3
- ผลถ่าย: **4/4 ใบ (desktop+mobile × 2 สเปก) failures 0** — ดูด้วยตาแล้ว: ใบแรกหัวข้อ "สาขาป่าตอง" เป็นสีเทียลจริง + โลโก้ไอคอนแอปแสดงข้างชื่อร้าน · ใบสอง (`applyStorefront=false`) หัวข้อกลับเป็นสีดำ (ink ปริยาย) และไม่มีโลโก้ — ตรงพฤติกรรมที่ต้องการ

## 5. ผลด่าน

```
pnpm exec tsx scripts/qc-branding-b4.mts
  ผ่าน 7/7 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  JSON_SUMMARY {"total":7,"passed":7,"findings":[]}

# regression (ทั้งหมดรันซ้ำหลัง build ใหม่ด้วย — ผลเดิม)
qc-branding-b1        21/21 · CRITICAL 0
qc-branding-b2        16/16 · CRITICAL 0
qc-branding-b3        20/20 · CRITICAL 0
qc-branding (เดิม)      5/5  · CRITICAL 0
qc-kanban-k1.8         18/18 · CRITICAL 0
qc-kanban-notify       12/12 ผ่าน
qc-acc-v2-security     298/298 ผ่าน (WO 9.2)
qc-mobile-app          38/38 · CRITICAL fail 0

pnpm typecheck                                     0 error
pnpm exec tsx scripts/fitness.mts (ไม่ export env)  23/23 · CRITICAL 0
grep "\bany\b" ในไฟล์ที่แตะใน src/                   0
```

**ภาพจริง** (`bash scripts/acc-v2-serve.sh build` → `visual-branding.mts b4` → `stop`) — 4 ใบใน `.qc-shots/branding/b4/` · failures 0
| ไฟล์ | สิ่งที่เห็น |
|---|---|
| `shop-teal-logo-desktop/mobile` | หน้าร้าน `/s/siam-dive-kanban-qc/patong/shop` โลโก้ (ไอคอนแอป) + "SIAM DIVE KANBAN QC" ด้านบน · หัวข้อ "สาขาป่าตอง" สีเทียล (`--color-accent`) |
| `shop-storefront-off-desktop/mobile` | ธีมยังเป็นเทียลใน DB แต่ `applyStorefront=false` → ไม่มีโลโก้ · หัวข้อ "สาขาป่าตอง" กลับเป็นสีดำปริยาย · ชื่อร้านยังแสดง |

**คืนสภาพร้าน QC หลังถ่าย**: `brandColor=null · navTone=LIGHT · applyStorefront=true` (ค่าเริ่มต้น) · session `qc-visual-branding` เหลือ 0

## 6. จุดที่อยากให้ Fable ลองแหย่

1. **โลโก้จริงยังไม่เคยเห็นบนหน้าร้าน** — เหมือนหนี้ที่ B3 ทิ้งไว้ (ข้อ 5 ของ `branding-B3.md`) ยังไม่มีร้านไหนอัปโลโก้จริงแล้วดูหน้าร้าน/ฟอร์มสาธารณะ — สัดส่วนแนวนอน/โปร่งใสแปลก ๆ อาจโผล่ตรง `h-8 w-8`/`h-12 w-12 object-contain` ของสองหน้านี้
2. **ฟอร์มสาธารณะ (`/f/[token]`) ยังไม่ได้ถ่ายภาพจริง** — WO ระบุ "หรือฟอร์มสาธารณะถ้าหน้าร้านติดขัด" แต่หน้าร้านใช้ได้เลยเพราะร้าน QC มี `BusinessUnit` type SHOP อยู่แล้ว จึงยังไม่ได้สร้าง public form + token ของร้าน QC มาถ่ายคู่ (โค้ดฝั่ง form ผ่าน oracle S1.1/S1.2 ด้วย regex เดียวกับ shop แล้ว แต่ยังไม่เคยเห็นด้วยตา)
3. **อีเมลแจ้งเตือนจริง**: `RESEND_API_KEY` ยังไม่ตั้งบน QC (`emailEnabled=false`) → ยังไม่เคยเห็นหัวเรื่อง `[displayName] ...` ในกล่องจดหมายจริง เห็นแค่ผ่าน oracle (เช็ค source code) — ถ้าอยากเห็นของจริงต้องตั้งค่า Resend ก่อน
4. **`getPublicBranding` เพิ่ม field `brandFg`** — เป็น breaking change เล็กน้อยของ shape `PublicBranding` (เดิมมี 3 ฟิลด์ ตอนนี้ 4) ยังไม่ได้ไล่ดูว่ามีที่อื่นนอกเหนือ B4 (เช่นโค้ดสคริปต์ QC เก่า) ที่ทำ exact object shape match กับ `PublicBranding` แล้วจะพังจาก field เกิน — `pnpm typecheck` ผ่าน 0 error แล้วแต่เป็นแค่หลักประกันเรื่อง type ไม่ใช่ runtime assertion
