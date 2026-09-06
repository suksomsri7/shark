# B2 — หน้าตั้งค่า "ตราสินค้าและธีมกิจการ" (บันทึกผู้ทำ)

> WO: `ledger/BRANDING-RUN.md` §สัญญา B2 · แบบ: `ledger/DESIGN-BRANDING.md` §4 · มockup `ledger/design-branding/01-settings.png/html`
> ข้อสอบ: `scripts/qc-branding-b2.mts` (16 ข้อ · Fable เขียน · builder ไม่แตะ)
> ผล: **16/16 · CRITICAL 0 · MAJOR 0**

## 1. ไฟล์ที่แตะ

**ใหม่**
- `src/lib/branding/form.ts` — `parseBrandingForm(fd)` (pure)
- `src/lib/branding/logo.ts` — `validateLogoFile(file)` (pure, สนิฟ magic bytes)
- `src/components/branding/BrandingSettings.tsx` — client component ทั้งหน้า (15 testid ตามข้อสอบ)
- `scripts/visual-branding.mts` — harness ภาพ spec `"b2"`

**แก้**
- `src/app/app/settings/branding/page.tsx` — เขียนใหม่ทั้งไฟล์: หัวข้อ "ตราสินค้าและธีมกิจการ" · โหลด `getBrandingTokens` · gate OWNER/MANAGER-ที่ได้สิทธิ์ ผ่าน `evaluate(...branding.setting.update)` (คนอื่นเห็น note อ่านอย่างเดียว)
- `src/app/app/settings/branding/actions.ts` — เขียนใหม่ทั้งไฟล์: `saveBrandingAction(formData)` · `resetBrandingAction()` · `uploadLogoAction(formData)` (เฉพาะของหน้านี้ — ดู §3) — ทุกตัวคืน `{ok}|{ok:false,errors}` ไม่ throw
- `src/lib/storage/service.ts` — เพิ่ม `"image/svg+xml": "svg"` ใน `ALLOWED_TYPES` (ดู §3)
- `src/components/app-shell/NavDrawer.tsx` — เพิ่มรายการเมนู `/app/settings/branding` "ตราสินค้าและธีม" (เดิมเป็นหน้ากำพร้า ไม่มีลิงก์ในเมนูเลย — เจอระหว่างอ่านโค้ด ไม่ใช่แค่เปลี่ยนชื่อ)

**ลบ**
- `src/components/branding-form.tsx` — ฟอร์มเดิม (White label v1) ถูกแทนที่ทั้งหมดด้วย `BrandingSettings.tsx`

## 2. แผนที่ฟังก์ชัน

`form.ts` — `parseBrandingForm(fd: FormData)`:
- `displayName` trim · ว่าง = `null` · ยาวเกิน 80 = error ไทย
- `brandColor` trim · ว่าง = `null` · ไม่ตรง `#RRGGBB` (รับเล็ก/ใหญ่) = error ไทย
- `navTone` ว่าง = `"LIGHT"` (ปริยาย) · ไม่ตรง LIGHT/BRAND/DARK = error ไทย
- `applyStorefront` / `applyMobile` / `rememberCollapse` — ค่า `"on"` เท่านั้น = `true` (อื่น/ไม่มี field = `false`)
- error ≥ 1 ฟิลด์ → `{ok:false, errors}` ทันที (ไม่คืน `input` บางส่วน)

`logo.ts` — `validateLogoFile({name,type,bytes})`:
- **ไม่เชื่อ `name`/`type`** — ดูแต่ `bytes` จริง (กัน `.exe` เปลี่ยนนามสกุลเป็น `.png`)
- เช็คขนาด (≤ 2MB) **ก่อน** สนิฟฟอร์แมตเสมอ (ไฟล์ใหญ่ไม่ต้องเสียเวลาอ่าน magic bytes)
- PNG/JPG/WEBP: magic bytes ตรงเป๊ะ · SVG: decode เป็น text แล้วต้องขึ้นต้น `<?xml`/`<svg` + ไม่มี `<script`/`on[a-z]+=`/`javascript:`
- ข้อความปฏิเสธทุกเคสเป็นไทย · ข้อความไฟล์ใหญ่มีคำว่า "2 MB" ตรงตัว

`actions.ts`:
- `saveBrandingAction(fd)` = assertCan (จับ ForbiddenError → error ไทย) → `parseBrandingForm` → `setBranding(ctx,{...input,updatedById})` (จับ throw ของ service → error ไทย) → `revalidatePath`
- `resetBrandingAction()` = assertCan → `setBranding` ด้วยค่าว่าง/LIGHT/true/true (เท่ากับดีฟอลต์ของแพลตฟอร์ม)
- `uploadLogoAction(fd)` = assertCan → `validateLogoFile` → `uploadFile({tenantId},{kind:"LOGO",...})`

`BrandingSettings.tsx`:
- state ควบคุมทุกฟิลด์ในหน้าเดียว (`useState`) — ปุ่ม/สวอตช์/hex/color-picker/toggle ทั้งหมดแก้ state เดียวกัน
- ตัวอย่างสด: `previewNavTokens(navTone, accent, accentFg)` คำนวณ `navBg/navFg/navFg2/navOn` ด้วยสูตรเดียวกับ `tokensFrom()` ของ `service.ts` แต่เรียกฟังก์ชันจริงจาก `@/lib/branding/color` (`fgAlpha`) ไม่คิดเลขเอง — ตั้งเป็น CSS custom property (`--color-accent`,`--nav-bg`,…) ที่ div ของกล่องตัวอย่างเท่านั้น (ไม่แตะ `:root` — ไม่งั้นทั้งหน้าจะเปลี่ยนสีก่อนกดบันทึก)
- กล่องความคมชัดใช้ `contrastRatio` + `pickReadableFg` + `meetsAA` จาก `@/lib/branding/color` ตรง ๆ
- ปุ่ม "คืนค่าเริ่มต้น" กันกดพลาดด้วย 2 คลิก (ข้อความเปลี่ยนเป็น "ยืนยันคืนค่าเริ่มต้น?" แล้ว auto-ยกเลิกใน 4 วิ) — ไม่ใช้ `confirm()` (ข้อสอบ S1.4 ห้าม)
- สิทธิ์: ทั้งหน้าห่อด้วย `<fieldset disabled={!canWrite}>` ปิดทุกช่องกรอก/ปุ่มพร้อมกันตัวเดียว ยกเว้นลิงก์ "ดูตัวอย่างเต็มจอ" ที่อยู่นอก fieldset (ดูได้ไม่ต้องมีสิทธิ์แก้)

## 3. ส่วนที่ตัดสินใจเอง / ต่างจากตัวหนังสือใน WO

1. **`uploadLogoAction` ของหน้านี้แยกจาก `src/lib/storage/actions.ts:uploadLogoAction` เดิม** (คนละไฟล์ คนละชื่อฟังก์ชันที่ import คนละที่ — ชื่อ export เหมือนกันแต่คนละโมดูล) — ระหว่างอ่านโค้ดพบว่า `uploadLogoAction` เดิมถูก `ImageAssetField` (`src/components/image-asset-field.tsx`) ใช้ร่วมกับหน้าตั้งค่าเอกสาร (โลโก้/**ตราประทับ/ลายเซ็น** ที่ `sys/[id]/account/settings`) ซึ่งยังต้องรับ GIF/HEIC/HEIF ผ่าน `uploadFile` เดิม (ไม่ผ่าน `validateLogoFile`) — ถ้าไปรัดกฎ "PNG/JPG/WEBP/SVG ≤2MB" ที่ฟังก์ชันกลางตัวนั้น จะทำให้อัปตราประทับ/ลายเซ็นที่เคยผ่านมาก่อนพังทันที โดยไม่มีใครสั่งให้แก้จุดนั้น จึงเพิ่มฟังก์ชันใหม่เฉพาะของหน้าธีมแทนการแก้ของเดิม (สัญญา B2 อนุญาตให้เลือกที่ใดที่หนึ่งอยู่แล้ว: "ใน storage/actions หรือที่นี่")
2. **เพิ่ม `"image/svg+xml": "svg"` ใน `ALLOWED_TYPES` ของ `storage/service.ts`** — ไม่มีในสัญญา B2 แต่จำเป็น: `validateLogoFile` ยอมรับ SVG (ตามแบบ) แต่ `uploadFile` เดิมมีด่านตรวจชนิดไฟล์อีกชั้นที่ไม่รู้จัก `image/svg+xml` มาก่อน ⇒ ถ้าไม่เพิ่ม การอัป SVG จะผ่าน `validateLogoFile` แต่ไปตายที่ `uploadFile` แทน (โลโก้ SVG อัปไม่ได้จริงทั้งที่ UI/ข้อความบอกว่ารองรับ) — เพิ่มแบบ additive ล้วน ไม่กระทบ `ALLOWED_UPLOAD_TYPES` ตัวอื่น (เช็คแล้วกับ `qc-chat-api-v1.mts` CA-7.1–7.4 ยังผ่าน)
3. **`rememberCollapse` ไม่ถูกส่งต่อไปเก็บจริง** — `parseBrandingForm` คืนค่านี้ตามสัญญา (pure parser) แต่ `TenantBranding`/`setBranding` ของ B1 ไม่มีคอลัมน์รับ (มันคือ `UserPreference.navCollapsed` ที่เป็นของ "คน" ไม่ใช่ของ "ร้าน" ตาม §6 ของแบบ — ยังไม่ถูกสร้างใน B1 ตั้งใจ รอ B3/K1.14) — ในโค้ดปัจจุบัน state ของสวิตช์นี้เป็น UI เฉย ๆ (default เปิดเสมอ, ไม่ persist) พร้อมให้ B3 ต่อเข้ากับ store จริงภายหลังโดยไม่ต้องแก้ฟอร์ม/พาร์เซอร์
4. **เมนูตั้งค่าไม่เคยมีลิงก์ไปหน้านี้เลย** (ไม่ใช่แค่ใช้ชื่อเก่า) — ตรวจ `NavDrawer.tsx` พบว่ารายการเมนูย่อยของ "ตั้งค่า" ไม่มี `/app/settings/branding` อยู่เลยตั้งแต่แรก (หน้ากำพร้าแบบเดียวกับที่ webhooks/staff เคยเป็นมาก่อน ตามคอมเมนต์ในไฟล์เดียวกัน) — เพิ่มรายการใหม่แทนที่จะ "แก้ป้ายชื่อ" เฉย ๆ
5. **`initial.brandColor`/`initial.navTone` ที่ส่งให้คอมโพเนนต์มาจาก `getBrandingTokens` (ค่าที่ resolve แล้ว)** ไม่ใช่ `getBranding` ดิบ — ตามภาพ 01 ที่ช่องสีและชื่อโชว์ค่าที่ "กำลังใช้จริง" อยู่แล้ว (ไม่ใช่ว่างเปล่า) แม้ร้านยังไม่เคยตั้งอะไรเลย
6. **ปุ่ม "ดูตัวอย่างเต็มจอ" ย้ายไปอยู่หัวการ์ด "ตัวอย่างสด"** (ในมockup อยู่แถวปุ่มล่างซ้าย) — ตำแหน่งต่างจากภาพ แต่ href/พฤติกรรมตรงสัญญา (`/app?theme=preview` แท็บใหม่) ข้อสอบไม่ผูกตำแหน่ง จึงเลือกที่ที่สื่อความหมายกว่า (อยู่ติดกับสิ่งที่มันเปิดดู)

## 4. ผลด่าน

```
pnpm exec tsx scripts/qc-branding-b2.mts
  ผ่าน 16/16 · FINDINGS: CRITICAL 0 · MAJOR 0 · MINOR 0
  JSON_SUMMARY {"total":16,"passed":16,"findings":[]}

# regression
scripts/qc-branding-b1.mts       21/21 ผ่าน · CRITICAL 0
scripts/qc-branding.mts (เดิม)    5/5 ผ่าน · CRITICAL 0
scripts/qc-mobile-app.mts        38/38 ผ่าน · CRITICAL 0

pnpm typecheck                   0 error
pnpm exec tsx scripts/fitness.mts (ไม่ export env)   23/23 ผ่าน · CRITICAL 0

# ภาพจริง
bash scripts/acc-v2-serve.sh → build+start :3215
pnpm exec tsx scripts/visual-branding.mts b2
  10 ภาพใน .qc-shots/branding/b2/ (5 สเปค × desktop/mobile) · failures 0
  เปิดดูทุกใบเทียบ ledger/design-branding/01-settings.png ด้วยตา:
    - settings-default: ค่าปริยาย (สีน้ำเงิน #1d4ed8 ไฮไลต์, โทนสว่าง) ตรงตามที่ getBrandingTokens คืน
    - preview-teal-brand: เลือกสวอตช์เทียล + โทน BRAND → กล่องตัวอย่างสด (ขวา/ล่างในมือถือ) เปลี่ยนเป็นเทียลทันที
      ยังไม่บันทึก (การ์ดฟอร์มไม่มีข้อความยืนยัน) · กล่องคมชัดโชว์ "5.4:1 ผ่านเกณฑ์อ่านง่าย (WCAG AA)"
      ตรงกับเลขที่แก้ในภาพแบบ (Fable แก้จาก 5.9→5.4 ตอน B1)
    - preview-dark: สลับ DARK ต่อ (สียังเทียล) → ตัวอย่างสดเปลี่ยนเป็นเข้ม (#111827) ทันที
    - after-save: กด "บันทึกและใช้กับทั้งร้าน" → ข้อความเขียว "บันทึกและใช้กับทั้งร้านเรียบร้อยแล้ว"
    - after-reload: โหลดหน้าใหม่ (ไม่มี step ใด ๆ) → เทียล+DARK เป็นค่าเริ่มต้นที่เห็นทันที (พิสูจน์ persist จริงผ่าน getBrandingTokens ไม่ใช่ client state ค้าง)
  มือถือ (390×844): สวอตช์/การ์ดโทน/สวิตช์/ตัวอย่างสดวางซ้อนแนวตั้งเรียบร้อย ไม่ล้น ไม่ทับกัน
bash scripts/acc-v2-serve.sh stop
ตรวจ DB ตรง: TenantBranding ของ tenant QC บอร์ดงาน หลัง harness จบ = { displayName:null, logoUrl:null,
  brandColor:null, navTone:"LIGHT", applyStorefront:true, applyMobile:true } — คืนสภาพครบ

no `any` ใน src/ (grep 8 ไฟล์ที่แตะ/สร้าง — ไม่พบ)
ไม่ commit — tree ยังเป็น dirty (M×4, D×1, ?? ×4) ตามกติกา
```

## 5. จุดที่อยากให้ Fable ลองแหย่

1. **`uploadLogoAction` มี 2 ตัวในระบบตอนนี้** (`src/lib/storage/actions.ts` ของเดิม กับของใหม่ใน `src/app/app/settings/branding/actions.ts`) ชื่อเดียวกันคนละไฟล์ — จงใจ (ดู §3.1) แต่ทำให้ "หน้าตั้งค่าเอกสาร" (ตราประทับ/ลายเซ็น) กับ "หน้าตราสินค้า" ใช้กฎไฟล์คนละชุด (2MB/PNG-JPG-WEBP-SVG vs 5MB/PNG-JPG-WEBP-GIF-HEIC-HEIF) — ถ้าเจ้าของอยากให้กฎเดียวกันทั้งระบบต้องคุยเพิ่มว่าจะรัดของเดิมหรือคลายของใหม่
2. **`rememberCollapse` เป็น UI ล้วนที่ยังไม่ persist** (§3.3) — สวิตช์ในหน้ากดได้ ดูเหมือนใช้งานได้ แต่ปิด/เปิดแล้วรีเฟรชจะกลับเป็นค่าเริ่มต้นเสมอ (ไม่มีที่เก็บ) — ต้องรอ B3 ผูกกับ `UserPreference.navCollapsed` จริง ไม่งั้นผู้ใช้จะงงว่าทำไมตั้งค่าแล้วไม่จำ
3. **สวอตช์ที่เลือกตัดสินจาก string compare แบบ case-insensitive** (`accent.toUpperCase() === s.hex.toUpperCase()`) — ถ้าผู้ใช้พิมพ์ hex เองเป็นตัวเล็ก/ใหญ่ปนกันแล้วตรงกับสวอตช์เป๊ะ จะไฮไลต์ให้ถูก แต่ถ้าเผลอพิมพ์ผิด 1 ตัวจะไม่มีสวอตช์ไหนไฮไลต์เลย (ไม่ error แค่ไม่ highlight) — เป็นพฤติกรรมที่ตั้งใจ ไม่ใช่บั๊ก แต่ยังไม่ได้ทดสอบกับผู้ใช้จริง
4. **`validateLogoFile` ไม่ตรวจว่า PNG/JPG เป็นไฟล์ที่ decode ได้จริงทั้งไฟล์** (เช็คแค่ magic bytes หัวไฟล์) — ไฟล์ PNG หัวถูกแต่ตัวไฟล์เสีย/ถูกตัดกลางทางจะผ่านด่านนี้ไปอัปขึ้น CDN แล้วไปพังตอนเบราว์เซอร์ render จริง (เคสหายากแต่มีโอกาสเกิดกับไฟล์อัปโหลดจากมือถือที่เน็ตหลุดกลางทาง)
5. **โลโก้ยังไม่ได้ทดสอบอัปโหลดจริงในภาพ QC** (harness ข้ามการอัปไฟล์ เพราะ `.env.qc` อาจไม่มี `SHARK_BUNNY_*` ครบ) — ฝั่ง unit test (`validateLogoFile`) ผ่านครบ แต่ path เต็ม `ui → uploadLogoAction → uploadFile → Bunny` ยังไม่เคยเห็นภาพจริงบนหน้าจอ ถ้าอยากมั่นใจ 100% ต้องตั้ง Bunny env บน QC แล้วรัน harness อีกรอบพร้อม step upload
