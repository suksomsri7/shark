# SHARK UI Standard — Minimal Clean Black & White

> **สถานะ:** บังคับใช้ทุกหน้า/ทุก component ใหม่ และเป็นเป้าหมายของ refactor pass (ดู findings ใน `docs/qc/QC6-ui-audit.md`)
> **คอนเซ็ปต์:** พื้นขาว ตัวอักษรดำ เส้น hairline เทาอ่อน เว้นวรรคเยอะ ไม่มีสีสด ไม่มี jargon — เหมาะ SME ไทย, **mobile-first**
> **หน้า reference ที่ถือเป็นมาตรฐาน:** `src/app/app/page.tsx`, `src/components/public-booking.tsx`, `src/app/(marketing)/page.tsx`

---

## 0. กฎเหล็ก (อ่านก่อนเขียน UI ทุกครั้ง)

1. **สีมาจาก token เท่านั้น** — ห้าม `bg-blue-*`, `text-green-*`, `emerald`, `amber`, hex ดิบ ฯลฯ ใช้ได้แค่:
   `--color-ink`, `--color-ink-soft`, `--color-muted`, `--color-line`, `--color-surface`, `--color-surface-2`, `--color-danger`
   (`--color-danger` ใช้เฉพาะ ข้อความ error / สถานะเสีย / ปุ่มทำลายข้อมูล — ห้ามใช้ตกแต่ง)
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

### 2.9 `SubNav` (โมดูลเมนูเยอะ)

เมนูรองของโมดูลใหญ่ (account) — จัดกลุ่ม ไม่ใช่ปุ่มแบนยาว:

```tsx
type Group = { title: string; items: { href: string; label: string; badge?: string }[] };
type Props = { groups: Group[]; active?: string };

<SubNav groups={ACCOUNT_NAV} active={pathname} />
```

พฤติกรรม:
- **Desktop (md+):** sidebar รองกว้าง ~200px ชิดซ้ายของเนื้อหา account (ใน `account/layout.tsx` ใหม่) — หัวกลุ่ม `text-xs muted`, รายการ `px-2 py-1.5 rounded-lg`, active = `bg-surface-2 font-medium`
- **Mobile:** ยุบเป็น accordion ในหน้า hub ของโมดูล (แตะหัวกลุ่มเพื่อกาง) + แถบ back "← ระบบบัญชี" บนทุกหน้าลูก — **ไม่มี** hamburger ซ้อน hamburger

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

## 4. โครง nav ใหม่ของโมดูลบัญชี (account)

ปัจจุบัน: hub เดียวมีลิงก์ ~23 ตัว (แท็บเอกสาร 8 + ปุ่มรายจ่าย 4 + ปุ่มบัญชี/รายงาน 11) เรียงเป็นแถว ghost button ยาว (`src/lib/modules/account/ui.tsx` L88-138) → วุ่นวาย หาอะไรไม่เจอ

**ใหม่: จัด 8 หมวด (ตามเมนูที่เจ้าของกำหนด) ใช้ `SubNav` + hub แบบการ์ดหมวด**

```ts
// src/lib/modules/account/nav.ts
export const ACCOUNT_NAV = (base: string, vatRegistered: boolean): Group[] => [
  { title: "รายรับ", items: [
    { href: `${base}/docs/QUOTATION`, label: "ใบเสนอราคา" },
    { href: `${base}/docs/INVOICE`, label: "ใบแจ้งหนี้" },
    { href: `${base}/docs/RECEIPT`, label: "ใบเสร็จรับเงิน" },
    ...(vatRegistered ? [{ href: `${base}/docs/TAX_INVOICE`, label: "ใบกำกับภาษีขาย" }] : []),
    { href: `${base}/docs/BILLING_NOTE`, label: "ใบวางบิล" },
    { href: `${base}/docs/DEPOSIT_RECEIPT`, label: "รับเงินมัดจำ" },
    { href: `${base}/docs/CREDIT_NOTE`, label: "ใบลดหนี้" },
    { href: `${base}/docs/DEBIT_NOTE`, label: "ใบเพิ่มหนี้" },
  ]},
  { title: "รายจ่าย", items: [
    { href: `${base}/expense`, label: "บันทึกค่าใช้จ่าย" },
    { href: `${base}/purchase`, label: "บันทึกซื้อสินค้า" },
    { href: `${base}/po`, label: "ใบสั่งซื้อ" },
    { href: `${base}/asset-buy`, label: "ซื้อสินทรัพย์" },
  ]},
  { title: "ผู้ติดต่อ", items: [
    { href: `${base}/contacts`, label: "ลูกค้าและผู้ขาย" },
  ]},
  { title: "สินค้า", items: [
    { href: `${base}/products`, label: "สินค้า/บริการ" },
    { href: `${base}/goods-issue`, label: "เบิกสินค้า" },
    { href: `${base}/assets`, label: "ทะเบียนสินทรัพย์" },
  ]},
  { title: "การเงิน", items: [
    { href: `${base}/finance`, label: "บัญชีเงิน (เงินสด/ธนาคาร)" },
    { href: `${base}/wht`, label: "หัก ณ ที่จ่าย (50 ทวิ)" },
    { href: `${base}/tax`, label: "ภาษี (ภ.พ.30 / ภ.ง.ด.)" },
  ]},
  { title: "บัญชี", items: [
    { href: `${base}/journal`, label: "สมุดรายวัน" },
    { href: `${base}/ledger`, label: "บัญชีแยกประเภท" },
    { href: `${base}/accounts`, label: "ผังบัญชี" },
    { href: `${base}/periods`, label: "ปิดงวดบัญชี" },
  ]},
  { title: "เอกสาร", items: [
    { href: `${base}/reports`, label: "งบการเงิน" },        // งบกำไรขาดทุน/งบดุล/กระแสเงินสด/งบทดลอง อยู่ใต้หน้านี้ (มี hub แล้ว)
  ]},
  { title: "ตั้งค่า", items: [
    { href: `${base}/settings`, label: "ข้อมูลกิจการและเอกสาร" },
  ]},
];
```

พฤติกรรมหน้า hub (`AccountContent` ใหม่):
1. การ์ดสรุป 4 ใบ (ค้างรับ/พ้นกำหนด/เอกสาร/ผู้ติดต่อ) — คงเดิม
2. ปุ่มหลัก 1-2 ปุ่ม: "+ สร้างใบเสนอราคา" (primary) + "+ บันทึกค่าใช้จ่าย" (ghost)
3. **การ์ดหมวด 8 ใบ** (`grid gap-3 sm:grid-cols-2`): ชื่อหมวด + รายการลิงก์ภายใน (มือถือ = accordion แตะกาง) — แทนทะเลปุ่ม ghost
4. เอกสารล่าสุด (DataList 8 รายการ)

ทุกหน้าลูกของ account: เพิ่ม `account/layout.tsx` ที่ render `SubNav` (desktop sidebar / mobile back-bar) — หน้าไม่ต้องประกอบ nav เอง

---

## 5. Checklist ก่อน merge (agent ทุกตัวต้องไล่ตอบได้)

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
