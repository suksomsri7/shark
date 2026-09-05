# SHARK UI Standard — Minimal Clean Black & White

> **สถานะ:** บังคับใช้ทุกหน้า/ทุก component ใหม่ และเป็นเป้าหมายของ refactor pass (ดู findings ใน `docs/qc/QC6-ui-audit.md`)
> **คอนเซ็ปต์:** พื้นขาว ตัวอักษรดำ เส้น hairline เทาอ่อน เว้นวรรคเยอะ ไม่มีสีสด ไม่มี jargon — เหมาะ SME ไทย, **mobile-first**
> **หน้า reference ที่ถือเป็นมาตรฐาน:** `src/app/app/page.tsx`, `src/components/public-booking.tsx`, `src/app/(marketing)/page.tsx`

---

## 0. กฎเหล็ก (อ่านก่อนเขียน UI ทุกครั้ง)

1. **สีมาจาก token เท่านั้น** — ห้าม `bg-blue-*`, `text-green-*`, `emerald`, `amber`, hex ดิบ ฯลฯ ใช้ได้แค่:
   `--color-ink`, `--color-ink-soft`, `--color-muted`, `--color-line`, `--color-surface`, `--color-surface-2`, `--color-danger`, `--color-accent`, `--color-accent-soft`
   (`--color-danger` ใช้เฉพาะ ข้อความ error / สถานะเสีย / ปุ่มทำลายข้อมูล — ห้ามใช้ตกแต่ง)
   (`--color-accent` = น้ำเงิน `#1d4ed8` สำหรับ **จุดเน้น** เท่านั้น: ลิงก์/เมนู active, ไอคอนช่วยเหลือ, แถบเน้นจุดสำคัญ — **ปุ่ม primary ยังเป็น ink** (ดำ) ห้ามเอา accent ไปแทน ink หรือใช้ถมพื้นปุ่มหลัก · ยังใช้ผ่าน arbitrary value `text-[color:var(--color-accent)]` เท่านั้น ห้าม `bg-blue-*` ดิบ)
   (`--color-accent-soft` = `color-mix(in srgb, var(--color-accent) 8%, white)` — พื้นทินท์อ่อนของ accent **เท่านั้น** ใช้จุดเดียว: แถบ bulk-action bar ตอนมีแถวถูกเลือกใน `DocTable` (WO 5.4) — ห้ามพิมพ์ hex ดิบ `#f0f5ff` ฯลฯ แทน)
   **ห้าม token ผี:** `--color-fg`, `--color-bg`, `--color-success`, `--color-primary`, `--color-hover` **ไม่มีจริง** ใน globals.css — ที่ผ่านมาทำปุ่ม/แท็บล่องหนและเขียว/น้ำเงินหลุดมาแล้ว (QC6 §2.1) · "สำเร็จ" = ink ตัวหนา ไม่ใช่สีเขียว · ก่อน merge: `grep -rn 'color-(fg|bg|success|primary|hover)' src` ต้องว่าง
2. **ปุ่ม = `.btn .btn-primary` / `.btn .btn-ghost` / `.btn-sm` เท่านั้น** — ห้ามประกอบปุ่มเอง และห้าม `.btn` เดี่ยวๆ (ไม่มีพื้น/ขอบ ดูไม่ออกว่าเป็นปุ่ม — เกิดแล้วใน ReportToolbar)
   เพิ่มใน globals.css: `.btn-sm` = `inline-flex items-center rounded-lg border px-3 py-2 text-sm hover:bg-surface-2` (สูง ≥40px) สำหรับปุ่ม action ในแถวรายการ/หน้า operation — ใช้แทน `px-2.5 py-1 text-xs` ที่เล็กกว่า touch target ทั้งแอป
   ข้อยกเว้นเดียว: ลิงก์ข้อความ (`underline text-sm`) สำหรับ action รองมากๆ ที่ไม่ใช่ปุ่มและไม่ทำลายข้อมูล
3. **ข้อความที่ user เห็น = ภาษาไทยเสมอ** — ห้ามโชว์ enum/ค่าดิบภาษาอังกฤษ (`DRAFT`, `PAID`, `TRANSFER`, `WAITING`, `bp`) ต้องผ่าน label map → ใช้ `<StatusChip>` (ข้อ 2.4)
4. **เงิน = `฿x,xxx` (หรือ `฿x,xxx.xx` ในเอกสารบัญชี)** ผ่าน `<MoneyText>` / `formatBaht()` กลาง — ห้ามประกาศ `const baht = ...` ซ้ำในไฟล์ (ตอนนี้ซ้ำ 17 ไฟล์)
5. **Mobile-first:** ทุก grid ต้องยุบบนมือถือ, ตารางกว้างต้องมี `overflow-x-auto`, touch target หลัก ≥ 44px, input ห้าม font < 16px บนจอเล็ก (global CSS จัดการแล้ว แต่ห้าม override เป็น `text-xs` ใน input)
6. **หน้าเดียว = งานเดียว** — หน้า list ไม่ยัดฟอร์มสร้าง+ตาราง+รายงานพร้อมกัน ถ้าเกิน 3 section ใหญ่ ให้แตกหน้า/ใช้ hub
7. **ทุก action ทำลายข้อมูล (ลบ/ยกเลิก/void/ปิดงวด/check-out) ต้องยืนยันก่อน** → `<ConfirmDialog>` (ข้อ 2.7)
8. **Emoji:** ใช้ได้เฉพาะ icon ประจำระบบ (จาก `systemDef().icon`) ใน nav/header และ ✅ ในหน้า "สำเร็จ" — ห้ามโปรยใน body/ปุ่ม/label

---

## 1. Layout & Hierarchy

### 1.1 max-width ต่อชนิดหน้า

| ชนิดหน้า | wrapper | ตัวอย่าง |
|---|---|---|
| Hub / รายการการ์ด | ไม่จำกัด (ใช้ grid) | `/app` |
| List + filter | `max-w-3xl` | รายการเอกสาร, สมาชิก |
| Detail / เอกสาร 1 ใบ | `max-w-3xl` | ExpenseDetail |
| ฟอร์ม / ตั้งค่า | `max-w-2xl` | setup, settings |
| หน้า public (ลูกค้า) | `max-w-md mx-auto` | จองคิว, ร้านค้า |
| รายงาน/ตาราง | `max-w-4xl` + `overflow-x-auto` | งบการเงิน |

### 1.2 Spacing scale (เลือกจากชุดนี้เท่านั้น)

- ระหว่าง section ใหญ่: `gap-6` (root ของหน้า = `flex flex-col gap-6`)
- ภายใน section/card: `gap-3` หรือ `gap-4`
- ระหว่างแถวรายการ: `gap-2`
- ระหว่าง chip/ปุ่มในแถวเดียว: `gap-2` (chip เล็ก `gap-1.5`)
- padding card: `.card` (p-5) — การ์ดสถิติเล็กใช้ `p-3`
- แถวรายการ: `px-3 py-2` (ขั้นต่ำ ห้ามต่ำกว่านี้เพราะ touch target)

### 1.3 Heading hierarchy — บังคับ

- **1 หน้า = 1 `<h1>`** (`text-2xl font-semibold`) ผ่าน `<PageHeader>` เสมอ
- หัวข้อ section = `<h2 className="text-sm font-medium">` (ผ่าน `<Section>`)
- ห้ามใช้ `<div className="font-bold text-lg">` แทน heading
- ทุกหน้าลึกกว่า hub ต้องมี back-link `← ชื่อหน้าแม่` (อยู่ใน `<PageHeader>`)

### 1.4 Mobile rules

- Grid: เริ่ม `grid-cols-1` หรือ `grid-cols-2` แล้วค่อยขยาย `sm:grid-cols-3/4` — **ห้าม `grid-cols-4` เปล่าๆ** ยกเว้น cell แคบจริง (ปุ่มเวลา, ตัวเลขสถิติ) และต้องพิสูจน์ว่าไม่ล้นที่ 360px
- `<table>` ทุกตัวต้องห่อ `<div className="overflow-x-auto">` + `min-w-[…]` ที่เนื้อตาราง — หรือดีกว่า: ใช้ `<DataList>` (การ์ดแถว) บนมือถือแทนตาราง
- ห้าม fixed width เกิน ~320px (`w-[600px]` ฯลฯ)
- ปุ่ม action ในแถวรายการ: ขั้นต่ำ `px-3 py-2` — ห้าม `py-0.5 text-xs` สำหรับปุ่มที่กดบ่อย
- แถวปุ่มยาว: ใช้ `flex flex-wrap gap-2` หรือเลื่อนแนวนอน `overflow-x-auto` แบบแถววันที่ใน public-booking

---

## 2. Shared components (สร้างที่ `src/components/ui/`)

> ทั้งหมดเป็น server-component ได้ ยกเว้น `ConfirmDialog` ที่เป็น client
> Refactor pass: สร้าง 9 ตัวนี้ก่อน แล้วค่อยไล่แทนที่ markup เดิมทีละหน้า

### 2.1 `PageHeader`

หัวหน้าเพจมาตรฐาน: back-link + h1 + คำอธิบาย + action ขวา

```tsx
type Props = {
  title: string;            // h1 text-2xl font-semibold
  back?: { href: string; label: string }; // "← label" muted
  desc?: string;            // บรรทัดรอง text-sm muted
  actions?: React.ReactNode; // ปุ่ม .btn ขวามือ (มือถือ: ตกลงมาใต้ title)
};

<PageHeader
  title="ใบแจ้งหนี้"
  back={{ href: base, label: "ระบบบัญชี" }}
  actions={<Link href={`${base}/docs/INVOICE/new`} className="btn btn-primary text-sm">+ สร้างใบแจ้งหนี้</Link>}
/>
```

โครงภายใน: `<div className="flex flex-col gap-1">` + `sm:flex-row sm:items-end sm:justify-between` สำหรับ actions

### 2.2 `Section`

section มาตรฐาน = h2 + เนื้อหา (แทน `<div className="card flex flex-col gap-3"><h2 …>` ที่ก๊อปกันไปทั่ว)

```tsx
type Props = {
  title?: string;                 // h2 text-sm font-medium
  card?: boolean;                 // true = ห่อ .card, false = โปร่ง (default false)
  actions?: React.ReactNode;      // ลิงก์/ปุ่มเล็กขวาหัว section
  children: React.ReactNode;
};

<Section title="เอกสารล่าสุด" actions={<Link href="…" className="text-xs underline">ดูทั้งหมด</Link>}>
  <DataList items={…} />
</Section>
```

### 2.3 `DataList` / `DataTable` (responsive)

**`DataList`** — รูปแบบหลักของ "รายการ" ทั้งแอป (แถว rounded border แบบ reference):

```tsx
type Item = {
  key: string;
  href?: string;               // มี = ทั้งแถวเป็น Link + hover surface-2
  primary: React.ReactNode;    // บรรทัดบน text-sm
  secondary?: React.ReactNode; // บรรทัดล่าง text-xs muted
  trailing?: React.ReactNode;  // ขวา: MoneyText / StatusChip / เวลา
};

<DataList
  items={docs.map((d) => ({
    key: d.id,
    href: `${base}/docs/${d.docType}/${d.id}`,
    primary: `${d.docNo ?? "(ร่าง)"} · ${DOC_LABEL[d.docType]}`,
    secondary: d.contact?.name ?? "ไม่ระบุผู้ติดต่อ",
    trailing: (<><MoneyText satang={d.grandTotal} /><StatusChip value={d.status} map={STATUS_LABEL} /></>),
  }))}
  empty="ยังไม่มีเอกสาร — เริ่มด้วยการสร้างใบเสนอราคา"
/>
```

แถว = `flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-[color:var(--color-surface-2)]` (ตรงกับ reference ทุกหน้า)

**`DataTable`** — ใช้เฉพาะข้อมูลบัญชี/รายงานที่ต้องเป็นคอลัมน์จริง (ledger, trial balance, ภ.พ.30):

```tsx
type Col<T> = { key: string; header: string; align?: "left" | "right"; render: (row: T) => React.ReactNode };
<DataTable cols={cols} rows={rows} minWidth={560} empty="ยังไม่มีรายการ" />
```

ภายใน: ห่อ `overflow-x-auto` เสมอ, `<th>` = `text-xs text-muted font-medium text-left/right pb-2 border-b`, `<td>` = `py-2 border-b border-[color:var(--color-line)] text-sm`, ตัวเลขชิดขวา ทุกตาราง **ห้าม** เขียน `<table>` เองนอก component นี้ (ยกเว้นหน้า print)

### 2.4 `StatusChip`

ป้ายสถานะโทนเทา (ยกแบบจาก `StatusBadge` ของ account ให้เป็นของกลาง):

```tsx
type Tone = "muted" | "strong" | "danger"; // เทา=อยู่ระหว่างทาง, ดำ=สำเร็จ/มีผล, แดงเข้ม=เสีย/เกินกำหนด
type Props = { value: string; map?: Record<string, string>; tone?: Tone; toneOf?: (v: string) => Tone };

<StatusChip value={doc.status} map={STATUS_LABEL} toneOf={accountTone} />
// render: <span className="rounded-full border px-2 py-0.5 text-xs" style={{color/borderColor ตาม tone}}>ชำระเงินแล้ว</span>
```

- ถ้า `map[value]` ไม่มี → โชว์ "ไม่ทราบสถานะ" + log warning ตอน dev — **ห้าม fallback เป็น enum ดิบ**
- label map รวมไว้ที่ `src/lib/ui/status-labels.ts` ต่อโดเมน: `BOOKING_STATUS_LABEL` (จองแล้ว/ยืนยันแล้ว/เช็คอินแล้ว/ยกเลิก), `QUEUE_STATUS_LABEL` (รอเรียก/กำลังเรียก/เสร็จแล้ว/ข้าม), `PAY_CHANNEL_LABEL` (เงินสด/โอน/พร้อมเพย์/บัตร), `KANBAN_COL_LABEL` ฯลฯ — account มี `STATUS_LABEL`/`DOC_LABEL` อยู่แล้ว ใช้ต่อ

### 2.5 `FormField`

label ชัดทุก input (เลิก placeholder-only):

```tsx
type Props = { label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode };

<FormField label="เบอร์โทร" hint="ใช้ติดต่อยืนยันคิว" error={errors.phone}>
  <input name="phone" inputMode="tel" className="input" />
</FormField>
```

- โครง: `<label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">` + children
- เพิ่ม class กลาง `.input` ใน globals.css = `rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--color-ink)]` แล้วเลิกก๊อป `inputCls` ต่อไฟล์
- error = `text-xs text-[color:var(--color-danger)]` ใต้ input (inline — ห้าม `alert()`)
- ฟอร์มยาว: จัดกลุ่มด้วย `<Section>` ทีละหมวด ไม่เกิน ~6 field ต่อกลุ่ม

### 2.6 `EmptyState`

```tsx
type Props = { text: string; action?: { href: string; label: string } };

<EmptyState text="ยังไม่มีสมาชิก — จะถูกสร้างอัตโนมัติเมื่อลูกค้าจองในระบบที่เชื่อมไว้"
  action={{ href: "…", label: "+ เชื่อมระบบ" }} />
```

render: `.card text-center py-8` + ข้อความ muted 1 ประโยค (บอก "ทำไมว่าง + ก้าวถัดไป") + ปุ่ม ghost ถ้ามี — ทุก list ต้องส่ง empty เสมอ

### 2.7 `ConfirmDialog` (client)

การยืนยัน action อันตรายแบบไม่พึ่ง `window.confirm`:

```tsx
"use client";
type Props = {
  trigger: React.ReactNode;      // ปุ่มเดิม
  title: string;                 // "ยกเลิกเอกสารนี้?"
  detail?: string;               // ผลที่ตามมา ("เอกสารจะถูก void และแก้ไขไม่ได้")
  confirmLabel: string;          // "ยืนยันยกเลิก"
  danger?: boolean;              // ปุ่มยืนยันเป็น danger
  action: (formData: FormData) => void; // server action เดิม
  fields?: Record<string, string>;      // hidden fields
  reasonField?: { name: string; label: string }; // ช่องกรอกเหตุผล (void/reject)
};
```

- render เป็น bottom-sheet บนมือถือ / dialog กลางจอบน desktop, พื้นขาว เส้น hairline, ปุ่มยืนยัน `.btn-primary` (หรือพื้น `--color-danger` เมื่อ `danger`)
- **บังคับใช้กับ:** ลบรางวัล, ยกเลิกการจ่าย, void เอกสาร, ยกเลิกจอง/คิว, ปิดงวดบัญชี, ยกเลิกการเชื่อมระบบ, ลบบรรทัดที่มีข้อมูล

### 2.8 `MoneyText` + `formatBaht()`

```tsx
// src/lib/ui/money.ts
export const formatBaht = (satang: number, opts?: { decimals?: boolean }) =>
  "฿" + (satang / 100).toLocaleString("th-TH",
    opts?.decimals ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : undefined);

<MoneyText satang={d.grandTotal} />          // ฿1,250  (ทั่วไป)
<MoneyText satang={d.grandTotal} decimals /> // ฿1,250.00 (เอกสารบัญชี/รายงาน)
<MoneyText satang={-refund} />               // −฿300 (ติดลบใช้ minus sign, สี ink ปกติ)
```

ลบ `const baht = …` ที่ประกาศซ้ำใน 17 ไฟล์ทิ้งให้หมด

### 2.9 `AccountTabBar` + `AccountBreadcrumb` (Shell V2 — โมดูลเมนูเยอะ)

WO 0.4 แทน `SubNav` sidebar เดิมด้วยแถบเมนูบน (ตาม DESIGN-SPEC-V2.md §1) — ดู `src/components/account-v2/{AccountTabBar,AccountBreadcrumb}.tsx` + แหล่งเมนูเดียว `src/lib/modules/account/nav.ts` (`ACCOUNT_NAV`/`AccountNavGroup`/`AccountNavItem`):

- **แถบเมนู 9 หมวด** ใต้ Topbar (หน้าหลัก·รายรับ·รายจ่าย·ผู้ติดต่อ·สินค้า·การเงิน·บัญชี·คลังเอกสาร·ตั้งค่า) — หมวด active = ตัวหนา + ขีดล่าง `--color-accent` 2px · `data-testid="acc-menu-<groupKey>"` ต่อหมวด (ต้องมี 9)
- **Dropdown 2 ระดับ (เดสก์ท็อป ≥lg):** hover/click เปิดระดับ 1 (การ์ด 264px) · รายการที่มี `flyout` โชว์ `›` แล้ว hover/focus/ลูกศร→ เปิดระดับ 2 (240px ทางขวา: "+ สร้าง…" ปุ่มดำ, ทางลัดสถานะพร้อมตัวนับ, ดูทั้งหมด, ล่าสุด) · คีย์บอร์ด ↑↓ เลื่อน · → เปิด flyout · ← ปิด flyout · Esc ปิดชั้นที่เปิดอยู่ก่อน (ปิดทั้งหมดถ้าไม่มี flyout เปิด) · ปิดเมื่อคลิกนอกแถบหรือเปลี่ยนหน้า
- **มือถือ (<lg):** แถบเดียวกันเลื่อนแนวนอนได้ (ไอคอน+ป้ายสั้น) — แตะหมวด = bottom sheet ระดับ 1 (แถวสูง 48px) · แตะรายการที่มี flyout = sheet ระดับ 2 (ปุ่มย้อนกลับ `‹` ในหัว) — เรนเดอร์ในตัว component เอง (fixed overlay ไม่พึ่ง app-shell)
- **สถานะ `soon`:** เมนูจาง (`opacity-60`) + ชิป "เร็ว ๆ นี้" ต่อท้าย · ไม่ใช่ `<a href="#">` (ไม่ใช่ลิงก์เลย กันคลิกพาไปหน้าเปล่า)
- **`AccountBreadcrumb`:** "บัญชี › รายรับ › ใบแจ้งหนี้" ใต้แถบเมนู ไล่จาก `pathname` ผ่าน `findActiveNav()` (nav.ts) — ลิงก์ทุกระดับยกเว้นตัวสุดท้าย · `data-testid="acc-breadcrumb"`
- เนื้อหาเต็มความกว้าง (ไม่มี sidebar แบ่งซ้ายอีกแล้ว) — `account/layout.tsx` render แค่ tab bar + breadcrumb + `{children}`

### 2.10 เสริม: `TabPills` + `SubmitButton` (จำเป็นเท่า 9 ตัวหลัก)

**`TabPills`** — ตอนนี้แท็บ pill ถูก implement 5 แบบ (docs list, journal, products, wht, expense-ui) และ 2 ใน 5 พัง/หลุดโทน:

```tsx
type Props = { tabs: { key: string; label: string; href: string }[]; active: string };
// render: rounded-full border px-3 py-1.5 text-sm
// active = bg-[--color-ink] text-[--color-surface] · ปกติ = hover:bg-surface-2
<TabPills active={tab} tabs={tabs.map((t) => ({ ...t, href: `?tab=${t.key}` }))} />
```

**`SubmitButton`** (client, ใช้ใน server-action form ทุกใบ — ตอนนี้ form ~30 ใบไม่มี pending state, เสี่ยงกดซ้ำ = บันทึกเงินซ้ำ):

```tsx
"use client";
import { useFormStatus } from "react-dom";
export function SubmitButton({ children, pendingText = "กำลังบันทึก…", variant = "primary" }: Props) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`btn btn-${variant} text-sm disabled:opacity-50`}>
      {pending ? pendingText : children}
    </button>
  );
}
```

### 2.11 🆕 `DocTable` + `RowActions` + `PortalMenu` (V2 บัญชี — `src/components/account-v2/`)

หน้ารายการเอกสาร/ผู้ติดต่อ/สินค้า/WHT/journal ทั้งหมดใช้ pattern เดียวกัน (ตามเฟรม f3-invoice-list.png และเวอร์ชันตีกลับที่ Fable ตรวจภาพจริง):

- **`DocTable`** (server component, ส่วน select/bulk เป็น client ย่อย `DocTableInteractive`): ตารางแท็บ+ตัวนับ+ค้นหา+ตัวกรองช่วงวันที่/ผู้ติดต่อ ด้านบน · **footer อยู่ในกรอบการ์ดเดียวกับตาราง** (ผลรวม/ยอด + pagination ชิดกัน ไม่ลอยแยก — บั๊กที่เคยตีกลับ) ผ่าน prop `footerLeft`/`footerRight` (additive, WO 5.4) · คอลัมน์ระบุ `help` (คีย์ของ `HELP_TEXTS`) แสดงไอคอน "?" ท้ายหัวคอลัมน์เอง (ดู 2.12) · มือถือ: props ชุดเดียวกัน (`mobileTitle/mobileSubtitle/mobileTrailing/mobileStatus/mobileDateLine`) เรนเดอร์เป็นการ์ดแถวอัตโนมัติ ไม่ใช่ตารางเลื่อน
- **ขนาดหน้า (page size)**: ค่ามาตรฐานหน้ารายการเอกสาร = **8 แถว/หน้า** ตามเฟรม f3 (ปรับจาก 20 เดิมที่ไม่ตรงแบบ — ตีกลับรอบ 10.1) — ใช้ `clampPageSize()` กลาง (`service.ts`) เปลี่ยนเฉพาะค่า default ที่เรียก ห้าม hardcode ต่อไฟล์
- **Bulk-action bar**: แถบที่โผล่เมื่อเลือก ≥1 แถว ใช้พื้น `--color-accent-soft` (ทินท์อ่อนของ accent) — ห้ามใช้ `--color-surface-2` เทาธรรมดา (แยกไม่ออกจาก hover) และห้าม hex ดิบ
- **`RowActions`** (client): ปุ่ม trigger **ต้องมีป้ายข้อความ** (เช่น "ทำรายการ ▾") ไม่ใช่ไอคอนสามจุดเดี่ยว ๆ ไร้ label (เข้าถึงยากบนมือถือ + เทสอ่านไม่ออก) เปิด dropdown ผ่าน `PortalMenu` · แต่ละ item รับ `icon` (คีย์ `AccountIcon`) + `sepBefore` (คั่นกลุ่มย่อย) + `disabled/hint` (ปิดพร้อมเหตุผลไทยที่มองเห็น ห้ามซ่อนปุ่มเงียบ ๆ) · รายการทำลาย/ยกเลิกใช้ `RowActionsDangerItem` (บังคับ `ConfirmDialog` เป็นขั้นสุดท้ายเสมอ)
- **`PortalMenu`**: โครงกลางของทุก dropdown ในตาราง — `createPortal` ไป `document.body` เสมอ (หนีทุก `overflow-x-auto` ของบรรพบุรุษที่ตัดเมนูจนหาย — บั๊กข้ามหน้าที่เคยเจอ) จัดตำแหน่งแบบ absolute สัมพัทธ์เอกสาร (ไม่ใช่ fixed) — component ใหม่ที่ต้องมี dropdown/popover ในตาราง **ต้องใช้ตัวนี้** ห้ามประกอบ `position:absolute` เองใน cell

### 2.12 🆕 `HelpTip` + `DateInput` + `UndoToast` + `AccountIcon` + โหมดง่าย/นักบัญชี

- **`HelpTip`**: ปุ่ม "?" เส้นบาง เปิด popover อธิบายศัพท์บัญชี (≥40 คำ, ภาษาคน ไม่ใช่นิยามพจนานุกรม) — ข้อความมาจาก `HELP_TEXTS` กลาง (`src/lib/modules/account/help-texts.ts`) ผ่าน `helpKey` (แนะนำ) หรือ `text` ตรง ๆ — ไม่พบคีย์ = **ไม่เรนเดอร์อะไรเลย** (กันคำอธิบายว่างโผล่เงียบ ๆ) เปิดได้ทั้ง hover/focus/แตะ (รองรับคีย์บอร์ด+มือถือ) ใช้ `PortalMenu` เป็นฐาน
- **`DateInput`**: ทุกช่องวันที่ในโมดูลบัญชีต้องใช้ตัวนี้ — ไม่โฟกัส แสดงวันที่ไทย พ.ศ. ("18 ก.ย. 2569") ผ่าน `formatDateTh`, โฟกัส/คลิกสลับเป็น native `type="date"` (`showPicker()`) เพื่อเปิดปฏิทินเครื่อง · ค่าที่ส่งฟอร์มจริงอยู่ใน `<input type="hidden">` เสมอเป็น ISO (`yyyy-mm-dd`) — **ห้ามใช้ `<input type="date">` ดิบ** (โชว์รูปแบบเบราว์เซอร์ `09/30/2026` อ่านไม่รู้เรื่อง — บทเรียนจาก WO 8.2)
- **`UndoToast`** (provider mount ที่ `account/layout.tsx`): toast "เลิกทำ" หลัง action ที่ไม่กระทบเลขรัน (ลบร่าง/เก็บถาวร/ยกเลิกบางชนิด) — เรียกได้ 2 ทาง: `useUndoToast().show(...)` ทันทีจาก client component (ไม่มีการนำทาง) หรือ query `?undo=<token>` ต่อท้าย redirect ของ server action เดิม · แสดงจนกดหรือครบ 8 วินาที (ต่างจากอายุ token จริงฝั่ง DB ที่ 5 นาที — กดเลิกทำได้จริงแค่ตอน toast ยังอยู่) · action ที่โพสต์ journal แล้ว/กระทบเลขรัน **ไม่มี undo** ต้อง void ทางการเท่านั้น
- **`AccountIcon`**: ไอคอนเส้นบาง (stroke 1.7, currentColor) คีย์เดียวกันทั้งเมนู/RowActions/filter row — **ห้าม emoji** ในโมดูลนี้แม้แต่ในแถวเมนู/หัว section (ต่างจากกฎทั่วไปข้อ 8 ของ SHARK ที่ยอมให้ emoji ใน nav — บัญชีเข้มกว่าเพราะเคยถูกตีกลับ WO 0.4 รอบ 2)
- **แถวตัวกรอง (filter row)**: มาตรฐาน 1 บรรทัดเดียว (`AttachmentFilterBar`/`InboxFilterBar` เป็นต้นแบบ) — ทุกช่องกรอง **auto-submit ทันทีที่เลือก** (ไม่มีปุ่ม "แสดง"/"ค้นหา" แยก) นำหน้าด้วย `AccountIcon` ที่สื่อความหมายของตัวกรองนั้น ไม่ล้นบรรทัดที่ 1440px และพับได้บนมือถือ
- **โหมดง่าย/นักบัญชี** (`EasyModeToggle` + `mode.ts`, cookie `ACC_MODE_COOKIE`): สวิตช์เดียวมีผลทั้งโมดูล — **ค่าเริ่มต้น = โหมดนักบัญชี** (ตรงกับภาพที่เจ้าของอนุมัติ g1/g17 ซึ่งวาดฟอร์มเต็ม) โหมดง่ายซ่อนช่องบัญชี/WHT/ประเภทราคา/สมุดให้ใช้ค่าเริ่มต้นแทน — ฟอร์มใหม่ที่มีช่องขั้นสูงต้องเช็คโหมดนี้ ไม่ใช่เพิ่ม toggle ของตัวเอง

---

## 3. กติกาภาษา

1. **สถานะ/ปุ่ม/label ทุกตัวเป็นไทย** — enum อังกฤษห้ามหลุดถึงตา user (ผ่าน `StatusChip` + label maps ข้อ 2.4)
2. **ห้าม jargon:** "bp", "satang", "void", "webhook", "slug", "token" ฯลฯ ห้ามอยู่ใน UI text
   - อัตราภาษี: รับเป็น **%** ("3") ไม่ใช่ basis points ("300")
   - void → "ยกเลิกเอกสาร", check-in → "เช็คอิน" (ทับศัพท์ที่คนไทยใช้จริง ok)
3. **เงิน:** `฿x,xxx` ทั่วไป / `฿x,xxx.xx` ในเอกสารบัญชี+รายงาน (ผ่าน MoneyText เท่านั้น) — สกุลอยู่หน้าเสมอ ไม่ใช้ "บาท" ต่อท้ายในตัวเลข (ใช้ในประโยคได้)
4. **วันเวลา:** `toLocaleDateString("th-TH", …)` โซน `Asia/Bangkok` ผ่าน helper กลาง `formatThaiDate` / `formatThaiDateTime` (`src/lib/ui/date.ts`) — รูปแบบสั้น "5 ก.พ. 69" ในรายการ, เต็ม "5 กุมภาพันธ์ 2569" ในเอกสาร
5. **น้ำเสียง:** ประโยคสั้น สุภาพ ไม่ formal จ๋า — ปุ่ม = กริยา ("บันทึก", "สร้างใบเสนอราคา", "ยืนยันจอง 10:00 น.") ไม่ใช้ "Submit/OK"
6. **Empty state ต้องชี้ทางต่อ** เสมอ: "ยังไม่มี X — ทำ Y เพื่อเริ่ม"

---

## 4. โครง nav ของโมดูลบัญชี (account) — Shell V2 (WO 0.4)

เดิม (ก่อน WO 0.4): hub เดียวมีลิงก์ ~23 ตัวเรียงเป็นแถว ghost button ยาว + sidebar `SubNav` 8 หมวดข้างซ้าย → วุ่นวาย หาอะไรไม่เจอ · `/account` (root) ไม่มี `page.tsx` → 404

**ตอนนี้: `src/lib/modules/account/nav.ts` เป็นแหล่งเดียว (single source) ของเมนูทั้งหมด — 9 หมวดตาม DESIGN-SPEC-V2.md §2**, เรนเดอร์เป็นแถบเมนูบน (`AccountTabBar`, ดู §2.9) แทน sidebar เดิม:

```ts
// src/lib/modules/account/nav.ts (รูปทรงจริง — ดูโค้ดเต็มในไฟล์)
type AccountNavStatus = "ready" | "soon";
type AccountNavItem = {
  label: string; href: string; kind: "doc" | "page"; status: AccountNavStatus;
  flyout?: { label: string; href: string; countKey?: string }[]; // ระดับ 2: ทางลัดสถานะของเอกสารชนิดนี้
  sep?: boolean; // เส้นคั่นเหนือรายการ (จัดกลุ่มย่อยใน dropdown)
};
type AccountNavGroup = { key: string; label: string; icon: string; href: string; items: AccountNavItem[] };

export function ACCOUNT_NAV(base: string, vatRegistered: boolean): AccountNavGroup[]; // 9 หมวด: หน้าหลัก·รายรับ·รายจ่าย·ผู้ติดต่อ·สินค้า·การเงิน·บัญชี·คลังเอกสาร·ตั้งค่า
export function accountNavChildren(base: string, vatRegistered: boolean): { href: string; label: string; group?: string }[]; // ลิสต์แบน (เฉพาะ ready) — ใช้ใน app drawer ☰
export function findActiveNav(pathname: string, base: string, groups: AccountNavGroup[]): { group; item? } | null; // ใช้ทั้ง AccountTabBar (active tab) และ AccountBreadcrumb
```

กติกาเนื้อหา:
- **`status: "ready"`** = มีหน้าไฟล์จริงรองรับวันนี้ (นับ route ที่สลับ `docType`/`tab` ผ่าน query เดิม เช่น `po?docType=ASSET_PURCHASE_ORDER`) — เมนูกดได้ตรง ๆ
- **`status: "soon"`** = ยังไม่มีหน้า (SPEC มีแผนแต่ยังไม่ทำ) → `href:"#"` **แต่ AccountTabBar ไม่เรนเดอร์เป็นลิงก์เลย** (กันคลิกพาไปหน้าเปล่า) เรนเดอร์เป็นแถวจาง + ชิป "เร็ว ๆ นี้" แทน
- **`flyout`** = ทางลัดสถานะของเอกสารชนิดนั้น ("+ สร้าง…" ปุ่มดำ · สถานะหลัก 2–4 รายการพร้อมตัวนับ `countKey` → คำนวณครั้งเดียวใน `account/layout.tsx` ผ่าน `accountFlyoutCounts()` (service.ts) ไม่ใช่ต่อหน้าเมนู เพื่อกันงบ query บวม · ดูทั้งหมด · ล่าสุด)
- ใบกำกับภาษีขายซ่อนเมื่อ `!vatRegistered` (ของเดิม — ยังทำงานเหมือนกัน)

พฤติกรรมหน้า hub (`AccountContent`, `/app/sys/<id>/account` — แก้บั๊ก 404 เดิมแล้ว มี `page.tsx` จริง):
1. การ์ดสรุป 4 ใบ (ค้างรับ/พ้นกำหนด/เอกสาร/ผู้ติดต่อ) — คงเดิม
2. ปุ่มหลัก: "+ สร้างใบเสนอราคา" (primary) + "+ บันทึกค่าใช้จ่าย" (ghost)
3. "ใช้บ่อย" (ทางลัด 4 ปุ่มที่ใช้บ่อยจริง) + เอกสารล่าสุด (DataList) — เมนูเต็มทั้ง 9 หมวดอยู่ใน `AccountTabBar` เหนือหน้าแล้ว ไม่ต้องมีการ์ดหมวดซ้ำในหน้านี้อีก

ทุกหน้าลูกของ account: `account/layout.tsx` render `<AccountTabBar>` + `<AccountBreadcrumb>` เหนือ `{children}` — หน้าไม่ต้องประกอบ nav เอง (เนื้อหาเต็มความกว้าง ไม่มี sidebar แบ่งซ้ายแล้ว)

---

## 6. 🆕 มือถือ — บัญชี V2 (อ้างอิง `DESIGN-SPEC-V2.md §13` · เฟรม f11–f14 รอบ 1 + g17–g20 รอบ 2 · WO 9.1)

> กฎทั่วไปข้อ 1.4/1.5 (mobile-first) ยังใช้ ส่วนนี้เพิ่มกติกาเฉพาะโมดูลบัญชีที่มีตาราง/ฟอร์มซับซ้อนกว่าโมดูลอื่น — "ดูได้" ไม่พอ ต้อง **ทำงานจบบนมือถือได้จริง** (สร้างเอกสาร/รับชำระ/ถ่ายบิล/อนุมัติ)

- **ตาราง → การ์ด/accordion เสมอ**: หน้ารายการ (`DocTable`) ไม่เรนเดอร์ `<table>` เลื่อนแนวนอนบนจอ <lg — สลับเป็นการ์ดแถว (แถวหัวข้อมูลสำคัญ + `⋯`/chevron เปิด **bottom sheet** ดูรายละเอียด/ทำรายการที่เหลือ) — อ้างอิง g18/g19
- **ฟอร์มยาว → accordion**: `DocEditorV2` บนมือถือ (g17) ยุบส่วน B/C/E/F/I (มัดจำ/WHT/แนบไฟล์ ฯลฯ) เป็น accordion เปิดทีละส่วน · บรรทัดรายการสินค้าเป็นการ์ด (ชื่อ · จำนวน×ราคา · ยอด · `⋯`) ไม่ใช่แถวตารางบีบอัด
- **สรุปยอด sticky**: ฟอร์มเอกสาร/หน้ารายละเอียดที่มียอดรวม — แถบสรุปยอด + ปุ่มหลัก (บันทึกร่าง/ออกเอกสาร/รับชำระ) **sticky ติดล่างจอเสมอ** ไม่ต้องเลื่อนหาปุ่ม
- **ปุ่มหลัก ≥44px**: ทุกปุ่มที่กดบ่อยบนมือถือ (แถบ sticky, action ในการ์ด, bottom sheet) ความสูงขั้นต่ำ 44px (เข้มกว่ากฎทั่วไปข้อ 5 ที่ตั้ง 44px เป็น baseline — บัญชีห้ามต่ำกว่านี้แม้แถวจะแน่น)
- **Sticky คอลัมน์แรก**: ตารางบัญชี/รายงานที่ยังต้องเป็นตารางจริงบนมือถือ (งบทดลอง, ภ.พ.30, สมุดรายวัน — คอลัมน์ตัวเลขเยอะ ทำเป็นการ์ดไม่ได้) ให้ sticky คอลัมน์แรก (ชื่อบัญชี/รายการ) ขณะเลื่อนแนวนอน ส่วนที่เหลือ (เช่น `GroupChildrenTable` ของใบวางบิล/ใบรวมจ่าย) ยังเป็นตารางเลื่อนธรรมดา — ทำ sticky เพิ่มเป็นงานถัดไป
- **bottom sheet ระดับ 2** (dropdown เมนู, ทำรายการแถว): เปิดจากปุ่ม `‹` ย้อนกลับที่หัว ไม่ใช่ปิดสนิทแล้วเปิดใหม่ (g18)
- **โปรไฟล์ผู้ติดต่อ/สินค้า 360°**: บนมือถือพับเป็นแท็บเลื่อนแนวนอนแทนคอลัมน์คู่ขนาน (g19)

---

## 7. Checklist ก่อน merge (agent ทุกตัวต้องไล่ตอบได้)

- [ ] ไม่มี class สีนอก token / ไม่มี hex ดิบ (ยกเว้นหน้า print)
- [ ] ปุ่มทั้งหมดเป็น `.btn` variant / ลิงก์ข้อความ underline
- [ ] 1 h1 ต่อหน้า + back-link + section เป็น h2
- [ ] list ใช้ `DataList`, ตารางใช้ `DataTable` (มี overflow), ไม่มี `<table>` เปล่า
- [ ] status ทุกตัวผ่าน `StatusChip` + map ไทย — grep `\{[a-z]+\.status\}` ต้องไม่เจอ render ดิบ
- [ ] เงินผ่าน `MoneyText` — grep `const baht` ต้องเจอแค่ helper กลาง
- [ ] input ทุกตัวมี `FormField` label / ฟอร์ม > 6 field ถูกแบ่งกลุ่ม
- [ ] ทุก list มี `EmptyState` / ทุกปุ่ม submit มี pending state (`useFormStatus` → "กำลังบันทึก…")
- [ ] action ทำลายข้อมูลผ่าน `ConfirmDialog`
- [ ] เปิดจอ 360px แล้ว: ไม่มี scroll แนวนอนทั้งหน้า, ปุ่มหลักกดถนัด, grid ยุบถูก
- [ ] (บัญชี V2) หน้ารายการใช้ `DocTable` + `RowActions`/`PortalMenu` — ไม่ประกอบ dropdown เอง, page size เอกสาร = 8, bulk bar ใช้ `--color-accent-soft`
- [ ] (บัญชี V2) ช่องวันที่ใช้ `DateInput` (ห้าม `<input type="date">` ดิบ) · ศัพท์บัญชีมี `HelpTip` · แถวตัวกรอง auto-submit บรรทัดเดียวมี `AccountIcon`
- [ ] (บัญชี V2) มือถือ: ตารางเป็นการ์ด/accordion + sticky สรุปยอด/ปุ่มหลัก (§6) — ไม่ใช่แค่ตาราง overflow-x
