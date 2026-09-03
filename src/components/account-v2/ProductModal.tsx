"use client";

// ProductModal — modal เพิ่ม/แก้ไขสินค้า พื้นฐาน|ขั้นสูง (WO 4.3 · DESIGN-SPEC-V2 §8.2)
// เฟรมอ้างอิง: docs/design/account-v2/g8-product-modal.png (วาดสถานะแท็บ "ขั้นสูง › การเชื่อมต่อ")
//
// กติกาเดียวกับ ContactModal (WO 3.3):
//   1) validation แสดง inline ใต้ช่อง (ไม่ใช่ alert) + toast รวมท้ายจอ
//   2) บันทึกผ่าน server action ที่ **คืนค่า** ไม่ใช่ form redirect ⇒ พลาดแล้วสิ่งที่พิมพ์ไม่หาย
//   3) มือถือ 390 = แผ่นเต็มจอ (Modal sheetOnMobile)
//   4) โหมดง่ายซ่อนช่องบัญชี/WHT (§0.3 ข้อ 1) — โหมดนักบัญชีเห็นครบตามภาพ
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { AccountIcon } from "./AccountIcon";
import { FormField } from "@/components/ui/FormField";
import { useAccMode } from "./EasyModeToggle";
import type { AccMode } from "./mode-shared";
import { saveProductAction, addOpeningLotAction, type ProductFormPayload } from "@/lib/modules/account/product-actions";

export type ProductModalUnit = { id: string; name: string; kind: string | null };
export type ProductModalAccount = { id: string; code: string; name: string };
export type ProductModalWarehouse = { id: string; name: string; isDefault: boolean };
export type ProductModalPickable = { id: string; code: string | null; name: string; type: string; salePrice: number | null };
export type ProductModalOpeningLot = { id: string; seq: number; lotDate: string; qty: string; unitCost: number; warehouseName: string | null };

export type ProductModalProduct = {
  id: string;
  code: string | null;
  type: string;
  name: string;
  nameEn: string | null;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  description: string | null;
  unitId: string | null;
  salePrice: number | null;
  buyPrice: number | null;
  vatRateBp: number;
  purchaseVatRateBp: number | null;
  incomeAccountId: string | null;
  expenseAccountId: string | null;
  cogsAccountCode: string | null;
  inventoryAccountCode: string | null;
  costMethod: string;
  defaultWhtType: string | null;
  defaultWhtRateBp: number | null;
  posEnabled: boolean;
  posCategory: string | null;
  posPrice: number | null;
  bookingEnabled: boolean;
  bookingDurationMin: number | null;
  bookingDepositSatang: number | null;
  imageUrls: string[];
  invItemId: string | null;
  warehouseId: string | null;
  /** ข้อมูลฝั่งคลังที่ผูกอยู่ (g8 แถบ "เชื่อมอยู่กับ") */
  item: { id: string; sku: string; reorderPoint: number; costSatang: number; onHand: number; locationName: string | null } | null;
  bundleItems: { componentProductId: string; qty: number; name: string; code: string | null }[];
  openingLots: ProductModalOpeningLot[];
};

type AdvTab = "info" | "price" | "accounting" | "opening" | "links";
const ADV_TABS: { key: AdvTab; label: string; icon: string }[] = [
  { key: "info", label: "ข้อมูลสินค้า", icon: "box" },
  { key: "price", label: "ราคามาตรฐาน", icon: "tag" },
  { key: "accounting", label: "การบันทึกบัญชี", icon: "book" },
  { key: "opening", label: "ยอดยกมา", icon: "in" },
  { key: "links", label: "การเชื่อมต่อ", icon: "link" },
];

const TYPE_OPTIONS: { value: string; label: string; hint: string }[] = [
  { value: "GOODS", label: "สินค้า", hint: "มีสต็อก · ตัดคลังได้" },
  { value: "SERVICE", label: "บริการ", hint: "ไม่มีสต็อก · หัก ณ ที่จ่ายได้" },
  { value: "BUNDLE", label: "รายการจัดชุด", hint: "ขาย 1 ชุด = ตัดสต็อกส่วนประกอบ" },
];

const VAT_OPTIONS: { value: number; label: string }[] = [
  { value: 700, label: "VAT 7%" },
  { value: 0, label: "VAT 0%" },
  { value: -1, label: "ยกเว้น VAT" },
];

const bahtOf = (satang: number | null | undefined) => (satang == null ? "" : String(satang / 100));
const money = (satang: number | null | undefined) =>
  satang == null ? "—" : `฿${(satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type FormState = {
  code: string;
  type: string;
  name: string;
  nameEn: string;
  sku: string;
  barcode: string;
  category: string;
  description: string;
  unitId: string;
  salePriceBaht: string;
  buyPriceBaht: string;
  vatRateBp: string;
  purchaseVatRateBp: string;
  incomeAccountId: string;
  expenseAccountId: string;
  cogsAccountCode: string;
  inventoryAccountCode: string;
  costMethod: string;
  defaultWhtType: string;
  defaultWhtRateBp: string;
  posEnabled: boolean;
  posCategory: string;
  posPriceBaht: string;
  bookingEnabled: boolean;
  bookingDurationMin: string;
  bookingDepositBaht: string;
  trackStock: boolean;
  warehouseId: string;
  reorderPoint: string;
  imageUrls: string;
};

function formOf(p: ProductModalProduct | null, nextCode: string): FormState {
  return {
    code: p?.code ?? nextCode,
    type: p?.type ?? "GOODS",
    name: p?.name ?? "",
    nameEn: p?.nameEn ?? "",
    sku: p?.sku ?? "",
    barcode: p?.barcode ?? "",
    category: p?.category ?? "",
    description: p?.description ?? "",
    unitId: p?.unitId ?? "",
    salePriceBaht: bahtOf(p?.salePrice),
    buyPriceBaht: bahtOf(p?.buyPrice),
    vatRateBp: String(p?.vatRateBp ?? 700),
    purchaseVatRateBp: p?.purchaseVatRateBp == null ? "" : String(p.purchaseVatRateBp),
    incomeAccountId: p?.incomeAccountId ?? "",
    expenseAccountId: p?.expenseAccountId ?? "",
    cogsAccountCode: p?.cogsAccountCode ?? "",
    inventoryAccountCode: p?.inventoryAccountCode ?? "",
    costMethod: p?.costMethod ?? "AVG",
    defaultWhtType: p?.defaultWhtType ?? "",
    defaultWhtRateBp: p?.defaultWhtRateBp == null ? "" : String(p.defaultWhtRateBp),
    posEnabled: p?.posEnabled ?? false,
    posCategory: p?.posCategory ?? "",
    posPriceBaht: bahtOf(p?.posPrice),
    bookingEnabled: p?.bookingEnabled ?? false,
    bookingDurationMin: p?.bookingDurationMin == null ? "" : String(p.bookingDurationMin),
    bookingDepositBaht: bahtOf(p?.bookingDepositSatang),
    trackStock: !!p?.invItemId,
    warehouseId: p?.warehouseId ?? "",
    reorderPoint: p?.item ? String(p.item.reorderPoint) : "",
    imageUrls: (p?.imageUrls ?? []).join("\n"),
  };
}

function validate(f: FormState): Record<string, string> {
  const e: Record<string, string> = {};
  if (!f.name.trim()) e.name = "กรุณากรอกชื่อสินค้า/บริการ";
  else if (f.name.trim().length > 100) e.name = "ชื่อยาวเกิน 100 ตัวอักษร";
  if (f.barcode.trim().length > 48) e.barcode = "บาร์โค้ดยาวเกิน 48 ตัวอักษร";
  if (f.description.trim().length > 500) e.description = "คำอธิบายยาวเกิน 500 ตัวอักษร";
  for (const [k, label] of [["salePriceBaht", "ราคาขาย"], ["buyPriceBaht", "ราคาซื้อ"], ["posPriceBaht", "ราคา POS"]] as const) {
    const raw = f[k].trim();
    if (!raw) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) e[k] = `${label}ต้องเป็นตัวเลข`;
    else if (n < 0) e[k] = `${label}ติดลบไม่ได้`;
  }
  if (f.type !== "GOODS" && f.trackStock) e.trackStock = f.type === "BUNDLE" ? "รายการจัดชุดติดตามสต็อกเองไม่ได้ (ตัดที่ส่วนประกอบ)" : "บริการไม่มีสต็อกให้ติดตาม";
  return e;
}

function Fieldset({ title, right, children, testId }: { title: string; right?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }} data-testid={testId}>
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold">{title}</h3>
        <span className="flex-1" />
        {right}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

/** การ์ด toggle ของแท็บ "การเชื่อมต่อ" (g8) */
function LinkCard({
  on,
  disabled,
  icon,
  title,
  onToggle,
  children,
  testId,
}: {
  on: boolean;
  disabled?: boolean;
  icon: string;
  title: string;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section
      className="flex gap-3 rounded-xl border p-3"
      style={{ borderColor: "var(--color-line)", opacity: disabled ? 0.55 : 1 }}
      data-testid={testId}
    >
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={title}
        disabled={disabled}
        onClick={() => !disabled && onToggle(!on)}
        className="mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors"
        style={{ background: on ? "var(--color-ink)" : "var(--color-line)" }}
      >
        <span
          className="block h-5 w-5 rounded-full bg-white transition-transform"
          style={{ transform: on ? "translateX(20px)" : "translateX(0)" }}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <AccountIcon name={icon} className="h-4 w-4 text-[color:var(--color-muted)]" />
          {title}
        </div>
        <div className="mt-1 flex flex-col gap-1.5 text-xs text-[color:var(--color-muted)]">{children}</div>
      </div>
    </section>
  );
}

export function ProductModal({
  systemId,
  productsPath,
  product,
  nextCode,
  units,
  incomeAccounts,
  expenseAccounts,
  warehouses,
  pickable,
  categories,
  defaultTab,
  defaultAdvTab,
  ssrMode,
  hasInventorySystem,
}: {
  systemId: string;
  productsPath: string;
  product: ProductModalProduct | null;
  nextCode: string;
  units: ProductModalUnit[];
  incomeAccounts: ProductModalAccount[];
  expenseAccounts: ProductModalAccount[];
  warehouses: ProductModalWarehouse[];
  pickable: ProductModalPickable[];
  categories: string[];
  defaultTab: "basic" | "advanced";
  defaultAdvTab: AdvTab;
  ssrMode: AccMode;
  hasInventorySystem: boolean;
}) {
  const router = useRouter();
  const isEdit = !!product;
  const [mode] = useAccMode(ssrMode);
  const easy = mode === "easy";
  const [tab, setTab] = useState<"basic" | "advanced">(defaultTab);
  const [advTab, setAdvTab] = useState<AdvTab>(defaultAdvTab);
  const [f, setF] = useState<FormState>(() => formOf(product, nextCode));
  const [codeEditable, setCodeEditable] = useState(false);
  const [bundleItems, setBundleItems] = useState(product?.bundleItems ?? []);
  const [showErrors, setShowErrors] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [toast, setToast] = useState<{ text: string; tone: "error" | "success" } | null>(null);
  const [pending, start] = useTransition();
  // ยอดยกมา (เพิ่มได้เฉพาะตอนแก้ไข — ต้องมีสินค้าจริงก่อนจึงรับเข้าคลังได้)
  const [lots, setLots] = useState<ProductModalOpeningLot[]>(product?.openingLots ?? []);
  const [lotForm, setLotForm] = useState({ lotDate: new Date().toISOString().slice(0, 10), qty: "", unitCostBaht: "", warehouseId: "" });
  const [lotMsg, setLotMsg] = useState("");

  const errors = useMemo(() => ({ ...validate(f), ...serverErrors }), [f, serverErrors]);
  const errOf = (k: string) => (showErrors ? errors[k] : undefined);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setServerErrors((prev) => (Object.keys(prev).length ? {} : prev));
  };

  const close = useCallback(() => router.push(productsPath), [router, productsPath]);

  const submit = () => {
    setShowErrors(true);
    const errs = validate(f);
    if (Object.keys(errs).length > 0) {
      setToast({ text: "กรอกข้อมูลไม่ครบ — ดูช่องที่มีข้อความสีแดง", tone: "error" });
      return;
    }
    const payload: ProductFormPayload = {
      id: product?.id ?? null,
      code: f.code.trim() || null,
      type: f.type,
      name: f.name,
      nameEn: f.nameEn,
      sku: f.sku,
      barcode: f.barcode,
      category: f.category,
      description: f.description,
      unitId: f.unitId || null,
      salePriceBaht: f.salePriceBaht,
      buyPriceBaht: f.buyPriceBaht,
      vatRateBp: Number(f.vatRateBp),
      purchaseVatRateBp: f.purchaseVatRateBp === "" ? null : Number(f.purchaseVatRateBp),
      incomeAccountId: f.incomeAccountId || null,
      expenseAccountId: f.expenseAccountId || null,
      cogsAccountCode: f.cogsAccountCode || null,
      inventoryAccountCode: f.inventoryAccountCode || null,
      costMethod: f.costMethod,
      defaultWhtType: f.defaultWhtType || null,
      defaultWhtRateBp: f.defaultWhtRateBp === "" ? null : Number(f.defaultWhtRateBp),
      imageUrls: f.imageUrls.split("\n").map((s) => s.trim()).filter(Boolean),
      trackStock: f.trackStock,
      warehouseId: f.warehouseId || null,
      reorderPoint: f.reorderPoint === "" ? null : Number(f.reorderPoint),
      posEnabled: f.posEnabled,
      posCategory: f.posCategory,
      posPriceBaht: f.posPriceBaht,
      bookingEnabled: f.bookingEnabled,
      bookingDurationMin: f.bookingDurationMin === "" ? null : Number(f.bookingDurationMin),
      bookingDepositBaht: f.bookingDepositBaht,
      bundleItems: f.type === "BUNDLE" ? bundleItems.map((b) => ({ componentProductId: b.componentProductId, qty: b.qty })) : undefined,
    };
    start(async () => {
      const res = await saveProductAction(systemId, payload);
      if (res.ok) {
        router.push(productsPath);
        router.refresh();
        return;
      }
      if (res.error === "validation" && res.fields) {
        setServerErrors(res.fields);
        setToast({ text: "กรอกข้อมูลไม่ครบ — ดูช่องที่มีข้อความสีแดง", tone: "error" });
        return;
      }
      setSaveError(res.error);
      setToast({ text: res.error, tone: "error" });
    });
  };

  const addLot = () => {
    if (!product) return;
    const qty = Number(lotForm.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setLotMsg("จำนวนต้องมากกว่า 0");
      return;
    }
    start(async () => {
      const res = await addOpeningLotAction(systemId, {
        productId: product.id,
        lotDate: lotForm.lotDate,
        qty,
        unitCostBaht: lotForm.unitCostBaht || "0",
        warehouseId: lotForm.warehouseId || null,
      });
      if (!res.ok) {
        setLotMsg(res.error);
        return;
      }
      setLots((prev) => [
        ...prev,
        {
          id: `new-${res.seq}`,
          seq: res.seq,
          lotDate: lotForm.lotDate,
          qty: String(qty),
          unitCost: Math.round(Number(lotForm.unitCostBaht || 0) * 100),
          warehouseName: warehouses.find((w) => w.id === lotForm.warehouseId)?.name ?? null,
        },
      ]);
      setLotForm({ ...lotForm, qty: "", unitCostBaht: "" });
      setLotMsg(`บันทึกยอดยกมาแล้ว (lot ${res.seq})`);
      router.refresh();
    });
  };

  const unitName = units.find((u) => u.id === f.unitId)?.name ?? "—";
  const typeLabel = TYPE_OPTIONS.find((t) => t.value === f.type)?.label ?? "สินค้า";
  const incomeCode = incomeAccounts.find((a) => a.id === f.incomeAccountId)?.code ?? (f.type === "SERVICE" ? "4030" : "4000");

  return (
    <Modal
      open
      onClose={close}
      size="xl"
      sheetOnMobile
      testId="product-modal"
      title={isEdit ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={close} data-testid="product-modal-cancel">
            ยกเลิก
          </button>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={submit} data-testid="product-modal-submit">
            {pending ? "กำลังบันทึก…" : "✓ บันทึก"}
          </button>
        </>
      }
    >
      {/* แท็บ พื้นฐาน | ขั้นสูง (g8) */}
      <div className="mb-4 flex gap-4 border-b" style={{ borderColor: "var(--color-line)" }} data-testid="product-modal-tabs">
        {([["basic", "พื้นฐาน"], ["advanced", "ขั้นสูง"]] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            data-testid={`product-modal-tab-${k}`}
            className="-mb-px border-b-2 px-1 pb-2 text-sm"
            style={tab === k ? { borderColor: "var(--color-ink)", fontWeight: 600 } : { borderColor: "transparent", color: "var(--color-muted)" }}
          >
            {label}
          </button>
        ))}
      </div>

      {saveError && (
        <p className="mb-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-danger)", color: "var(--color-danger)" }} data-testid="product-save-error">
          {saveError}
        </p>
      )}

      {tab === "basic" ? (
        <div className="flex flex-col gap-4" data-testid="product-basic">
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="รหัส" hint={codeEditable ? "แก้ได้ · ห้ามซ้ำกับรายการที่ใช้งานอยู่" : undefined}>
              <div className="flex items-center gap-2">
                <input
                  value={f.code}
                  readOnly={!codeEditable}
                  onChange={(e) => set("code", e.target.value)}
                  className="input flex-1"
                  data-testid="product-code"
                />
                {!codeEditable && (
                  <button type="button" className="text-xs font-medium" style={{ color: "var(--color-accent)" }} onClick={() => setCodeEditable(true)}>
                    แก้ไข
                  </button>
                )}
              </div>
            </FormField>
            <FormField label="หน่วย">
              <select value={f.unitId} onChange={(e) => set("unitId", e.target.value)} className="input" data-testid="product-unit">
                <option value="">ไม่ระบุ</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="ประเภท" required>
            <div className="flex flex-wrap gap-2" data-testid="product-type">
              {TYPE_OPTIONS.map((t) => (
                <label
                  key={t.value}
                  title={t.hint}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={f.type === t.value ? { borderColor: "var(--color-ink)", fontWeight: 600 } : { borderColor: "var(--color-line)" }}
                >
                  <input
                    type="radio"
                    name="product-type"
                    value={t.value}
                    checked={f.type === t.value}
                    onChange={() => set("type", t.value)}
                    data-testid={`product-type-${t.value}`}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </FormField>

          <FormField label="ชื่อสินค้า/บริการ" required hint="ชื่อที่ปรากฏบนเอกสาร (≤100 ตัวอักษร)" error={errOf("name")}>
            <input value={f.name} onChange={(e) => set("name", e.target.value)} className="input" data-testid="product-name" />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="ชื่อภาษาอังกฤษ">
              <input value={f.nameEn} onChange={(e) => set("nameEn", e.target.value)} className="input" data-testid="product-name-en" />
            </FormField>
            <FormField label="รหัสสินค้า (SKU)">
              <input value={f.sku} onChange={(e) => set("sku", e.target.value)} className="input" data-testid="product-sku" />
            </FormField>
            <FormField label="ราคาขาย/หน่วย (บาท)" error={errOf("salePriceBaht")}>
              <input inputMode="decimal" value={f.salePriceBaht} onChange={(e) => set("salePriceBaht", e.target.value)} className="input text-right" data-testid="product-sale-price" />
            </FormField>
            <FormField label="ราคาซื้อ/หน่วย (บาท)" error={errOf("buyPriceBaht")}>
              <input inputMode="decimal" value={f.buyPriceBaht} onChange={(e) => set("buyPriceBaht", e.target.value)} className="input text-right" data-testid="product-buy-price" />
            </FormField>
          </div>

          {!easy && (
            <FormField label="บัญชีรายได้" hint={`ค่าเริ่มต้น ${f.type === "SERVICE" ? "4030 รายได้ค่าบริการ" : "4000 รายได้จากการขายสินค้า"}`}>
              <select value={f.incomeAccountId} onChange={(e) => set("incomeAccountId", e.target.value)} className="input" data-testid="product-income-account">
                <option value="">ค่าเริ่มต้น</option>
                {incomeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} {a.name}
                  </option>
                ))}
              </select>
            </FormField>
          )}

          <FormField label="รูปสินค้า (ลิงก์ · บรรทัดละ 1 รูป ≤5 รูป)">
            <textarea value={f.imageUrls} onChange={(e) => set("imageUrls", e.target.value)} className="input min-h-[3rem]" data-testid="product-images" />
          </FormField>
        </div>
      ) : (
        // ══════════ ขั้นสูง — แท็บซ้าย 5 อัน (g8) ══════════
        <div className="flex flex-col gap-4 md:flex-row" data-testid="product-advanced">
          <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-[190px] md:flex-col" data-testid="product-adv-tabs">
            {ADV_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setAdvTab(t.key)}
                data-testid={`product-adv-${t.key}`}
                className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg border-l-[3px] px-3 py-2 text-left text-sm"
                style={
                  advTab === t.key
                    ? { borderColor: "var(--color-accent)", background: "var(--color-surface-2)", fontWeight: 600 }
                    : { borderColor: "transparent", color: "var(--color-muted)" }
                }
              >
                {/* g8: ไอคอนโชว์เฉพาะแท็บที่เลือกอยู่ */}
                {advTab === t.key && <AccountIcon name={t.icon} className="h-4 w-4" />}
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {/* การ์ดสรุป "ข้อมูลสินค้า (ย่อ)" (g8) */}
            <section className="rounded-xl border p-3" style={{ borderColor: "var(--color-line)" }} data-testid="product-summary">
              <div className="mb-2 flex items-center gap-2">
                <AccountIcon name="box" className="h-4 w-4 text-[color:var(--color-muted)]" />
                <h3 className="text-sm font-semibold">ข้อมูลสินค้า (ย่อ)</h3>
                <span className="flex-1" />
                <button type="button" className="text-xs font-semibold" style={{ color: "var(--color-accent)" }} onClick={() => setTab("basic")}>
                  แก้ไข
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                {[
                  ["รหัส", f.code || "—"],
                  ["ประเภท", typeLabel],
                  ["ชื่อ", f.name || "—"],
                  ["หน่วย", unitName],
                  ["ราคาขาย", f.salePriceBaht ? money(Math.round(Number(f.salePriceBaht) * 100)) : "—"],
                  ["ราคาซื้อ", f.buyPriceBaht ? money(Math.round(Number(f.buyPriceBaht) * 100)) : "—"],
                  ["VAT ขาย", VAT_OPTIONS.find((v) => String(v.value) === f.vatRateBp)?.label ?? "—"],
                  ["บัญชีรายได้", incomeCode],
                  ["บัญชีสินค้า", f.inventoryAccountCode || "1200"],
                  ["ต้นทุนขาย", f.cogsAccountCode || "5000"],
                  ["วิธีคิดต้นทุน", f.costMethod === "FIFO" ? "FIFO" : "ถัวเฉลี่ย"],
                  ["ยอดยกมา", `${lots.length} lot`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-[color:var(--color-muted)]">{k}</dt>
                    <dd className="truncate font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {advTab === "info" && (
              <>
                <Fieldset title="ข้อมูลสินค้า" testId="product-info-section">
                  <FormField label="คำอธิบาย (≤500)" error={errOf("description")}>
                    <textarea value={f.description} onChange={(e) => set("description", e.target.value)} className="input min-h-[4rem]" data-testid="product-description" />
                  </FormField>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="บาร์โค้ด (≤48)" error={errOf("barcode")}>
                      <input value={f.barcode} onChange={(e) => set("barcode", e.target.value)} className="input" data-testid="product-barcode" />
                    </FormField>
                    <FormField label="หมวดหมู่">
                      <input list="product-category-list" value={f.category} onChange={(e) => set("category", e.target.value)} className="input" data-testid="product-category" />
                      <datalist id="product-category-list">
                        {categories.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </FormField>
                  </div>
                </Fieldset>

                {f.type === "BUNDLE" && (
                  <Fieldset
                    title="รายการจัดชุด — ส่วนประกอบ"
                    testId="product-bundle-section"
                    right={<span className="text-xs text-[color:var(--color-muted)]">ขาย 1 ชุด = ตัดสต็อกตามจำนวนนี้</span>}
                  >
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          <th className="border-b pb-2 text-left text-xs font-medium text-[color:var(--color-muted)]">สินค้า</th>
                          <th className="border-b pb-2 text-right text-xs font-medium text-[color:var(--color-muted)]">จำนวน</th>
                          <th className="border-b pb-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {bundleItems.map((b, i) => (
                          <tr key={b.componentProductId} data-testid={`bundle-row-${i}`}>
                            <td className="border-b py-2">
                              {b.code ? <span className="mr-1 text-xs text-[color:var(--color-muted)]">{b.code}</span> : null}
                              {b.name}
                            </td>
                            <td className="border-b py-2 text-right">
                              <input
                                inputMode="decimal"
                                value={String(b.qty)}
                                onChange={(e) =>
                                  setBundleItems((prev) => prev.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) || 0 } : x)))
                                }
                                className="input w-24 text-right"
                                data-testid={`bundle-qty-${i}`}
                              />
                            </td>
                            <td className="border-b py-2 text-right">
                              <button
                                type="button"
                                className="text-xs"
                                style={{ color: "var(--color-danger)" }}
                                onClick={() => setBundleItems((prev) => prev.filter((_, j) => j !== i))}
                              >
                                ลบ
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <select
                      value=""
                      className="input"
                      data-testid="bundle-add"
                      onChange={(e) => {
                        const pick = pickable.find((p) => p.id === e.target.value);
                        if (!pick) return;
                        setBundleItems((prev) =>
                          prev.some((x) => x.componentProductId === pick.id)
                            ? prev
                            : [...prev, { componentProductId: pick.id, qty: 1, name: pick.name, code: pick.code }],
                        );
                      }}
                    >
                      <option value="">+ เพิ่มส่วนประกอบ…</option>
                      {pickable.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code ? `${p.code} · ` : ""}
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <FormField label="ราคาชุด/หน่วย (บาท)" error={errOf("salePriceBaht")}>
                      <input inputMode="decimal" value={f.salePriceBaht} onChange={(e) => set("salePriceBaht", e.target.value)} className="input text-right" data-testid="bundle-price" />
                    </FormField>
                  </Fieldset>
                )}
              </>
            )}

            {advTab === "price" && (
              <Fieldset title="ราคามาตรฐาน" testId="product-price-section">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="ราคาขาย/หน่วย (บาท)" error={errOf("salePriceBaht")}>
                    <input inputMode="decimal" value={f.salePriceBaht} onChange={(e) => set("salePriceBaht", e.target.value)} className="input text-right" />
                  </FormField>
                  <FormField label="ราคาซื้อ/หน่วย (บาท)" error={errOf("buyPriceBaht")}>
                    <input inputMode="decimal" value={f.buyPriceBaht} onChange={(e) => set("buyPriceBaht", e.target.value)} className="input text-right" />
                  </FormField>
                  <FormField label="VAT ขาย">
                    <select value={f.vatRateBp} onChange={(e) => set("vatRateBp", e.target.value)} className="input" data-testid="product-vat">
                      {VAT_OPTIONS.map((v) => (
                        <option key={v.value} value={String(v.value)}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField label="VAT ซื้อ" hint="ไม่เลือก = ใช้อัตราเดียวกับ VAT ขาย">
                    <select value={f.purchaseVatRateBp} onChange={(e) => set("purchaseVatRateBp", e.target.value)} className="input" data-testid="product-purchase-vat">
                      <option value="">ตามอัตราขาย</option>
                      {VAT_OPTIONS.map((v) => (
                        <option key={v.value} value={String(v.value)}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>
                {f.type === "SERVICE" && !easy && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="หัก ณ ที่จ่ายเริ่มต้น (ประเภทเงินได้)">
                      <input value={f.defaultWhtType} onChange={(e) => set("defaultWhtType", e.target.value)} placeholder="เช่น ม.40(2) ค่าจ้างทำของ" className="input" data-testid="product-wht-type" />
                    </FormField>
                    <FormField label="อัตราหัก ณ ที่จ่าย (basis point · 300 = 3%)">
                      <input inputMode="numeric" value={f.defaultWhtRateBp} onChange={(e) => set("defaultWhtRateBp", e.target.value)} className="input text-right" data-testid="product-wht-rate" />
                    </FormField>
                  </div>
                )}
              </Fieldset>
            )}

            {advTab === "accounting" && (
              <Fieldset title="การบันทึกบัญชี" testId="product-accounting-section">
                {easy ? (
                  <p className="text-sm text-[color:var(--color-muted)]">
                    โหมดง่ายซ่อนช่องบัญชีไว้ — ระบบใช้ผังบัญชีมาตรฐานให้อัตโนมัติ (รายได้ 4000/4030 · สินค้าคงเหลือ 1200 · ต้นทุนขาย 5000)
                  </p>
                ) : (
                  <>
                    <FormField label="บัญชีรายได้">
                      <select value={f.incomeAccountId} onChange={(e) => set("incomeAccountId", e.target.value)} className="input">
                        <option value="">ค่าเริ่มต้น ({f.type === "SERVICE" ? "4030" : "4000"})</option>
                        {incomeAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} {a.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <FormField label="บัญชีซื้อ/ค่าใช้จ่าย">
                      <select value={f.expenseAccountId} onChange={(e) => set("expenseAccountId", e.target.value)} className="input">
                        <option value="">ค่าเริ่มต้น (5000)</option>
                        {expenseAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} {a.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField label="บัญชีสินค้าคงเหลือ" hint="ค่าเริ่มต้น 1200">
                        <input value={f.inventoryAccountCode} onChange={(e) => set("inventoryAccountCode", e.target.value)} placeholder="1200" className="input" data-testid="product-inventory-account" />
                      </FormField>
                      <FormField label="บัญชีต้นทุนขาย" hint="ค่าเริ่มต้น 5000">
                        <input value={f.cogsAccountCode} onChange={(e) => set("cogsAccountCode", e.target.value)} placeholder="5000" className="input" data-testid="product-cogs-account" />
                      </FormField>
                    </div>
                    <FormField label="วิธีคิดต้นทุน" error={errOf("costMethod")}>
                      <select value={f.costMethod} onChange={(e) => set("costMethod", e.target.value)} className="input" data-testid="product-cost-method">
                        <option value="AVG">ถัวเฉลี่ย (ค่าเริ่มต้นของคลัง SHARK)</option>
                        <option value="FIFO" disabled>
                          FIFO 🕓 เร็ว ๆ นี้
                        </option>
                      </select>
                    </FormField>
                  </>
                )}
              </Fieldset>
            )}

            {advTab === "opening" && (
              <Fieldset title="ยอดยกมา" testId="product-opening-section" right={<span className="text-xs text-[color:var(--color-muted)]">รับเข้าคลัง + ลงบัญชี Dr 1200 / Cr 3999 ทันที</span>}>
                {!isEdit ? (
                  <p className="text-sm text-[color:var(--color-muted)]">บันทึกสินค้าก่อน แล้วเปิดกลับมาใส่ยอดยกมาได้</p>
                ) : (
                  <>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr>
                          {["วันที่", "จำนวน", "ราคาต่อหน่วย", "คลัง"].map((h) => (
                            <th key={h} className="border-b pb-2 text-left text-xs font-medium text-[color:var(--color-muted)]">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lots.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-3 text-xs text-[color:var(--color-muted)]">
                              ยังไม่มียอดยกมา
                            </td>
                          </tr>
                        ) : (
                          lots.map((l) => (
                            <tr key={l.id} data-testid={`opening-lot-${l.seq}`}>
                              <td className="border-b py-2">{l.lotDate.slice(0, 10)}</td>
                              <td className="border-b py-2">{l.qty}</td>
                              <td className="border-b py-2">{money(l.unitCost)}</td>
                              <td className="border-b py-2">{l.warehouseName ?? "คลังหลัก"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <input type="date" value={lotForm.lotDate} onChange={(e) => setLotForm({ ...lotForm, lotDate: e.target.value })} className="input" data-testid="opening-date" />
                      <input inputMode="decimal" placeholder="จำนวน" value={lotForm.qty} onChange={(e) => setLotForm({ ...lotForm, qty: e.target.value })} className="input text-right" data-testid="opening-qty" />
                      <input inputMode="decimal" placeholder="ราคา/หน่วย" value={lotForm.unitCostBaht} onChange={(e) => setLotForm({ ...lotForm, unitCostBaht: e.target.value })} className="input text-right" data-testid="opening-cost" />
                      <select value={lotForm.warehouseId} onChange={(e) => setLotForm({ ...lotForm, warehouseId: e.target.value })} className="input" data-testid="opening-warehouse">
                        <option value="">คลังหลัก</option>
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button type="button" className="btn-sm self-start" onClick={addLot} disabled={pending} data-testid="opening-add">
                      + เพิ่มยอดยกมา
                    </button>
                    {lotMsg && <p className="text-xs text-[color:var(--color-muted)]">{lotMsg}</p>}
                  </>
                )}
              </Fieldset>
            )}

            {advTab === "links" && (
              <div className="flex flex-col gap-3" data-testid="product-links-section">
                <h3 className="text-sm font-semibold">การเชื่อมต่อกับระบบอื่น</h3>

                <LinkCard
                  on={f.trackStock}
                  disabled={f.type !== "GOODS" || !hasInventorySystem}
                  icon="box"
                  title="ติดตามสต็อกในคลังสินค้า"
                  onToggle={(v) => set("trackStock", v)}
                  testId="link-track-stock"
                >
                  {f.type !== "GOODS" ? (
                    <span>{f.type === "BUNDLE" ? "รายการจัดชุดไม่มีสต็อกของตัวเอง — ตัดที่ส่วนประกอบ" : "บริการไม่มีสต็อก"}</span>
                  ) : !hasInventorySystem ? (
                    <span>กิจการนี้ยังไม่ได้เปิดระบบคลังสินค้า</span>
                  ) : (
                    <>
                      <span>
                        รหัสในคลังสินค้า (SKU): <b>{product?.item?.sku ?? (f.sku || "— (ออกให้อัตโนมัติ)")}</b>
                      </span>
                      <label className="flex items-center gap-2">
                        คลัง:
                        <select value={f.warehouseId} onChange={(e) => set("warehouseId", e.target.value)} className="input h-8 py-0 text-xs" data-testid="link-warehouse">
                          <option value="">คลังหลัก</option>
                          {warehouses.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-2">
                        จุดสั่งซื้อ:
                        <input inputMode="numeric" value={f.reorderPoint} onChange={(e) => set("reorderPoint", e.target.value)} className="input h-8 w-24 py-0 text-right text-xs" data-testid="link-reorder" />
                      </label>
                      {errOf("trackStock") && <span style={{ color: "var(--color-danger)" }}>{errOf("trackStock")}</span>}
                    </>
                  )}
                </LinkCard>

                <LinkCard on={f.posEnabled} icon="shop" title="ขายผ่าน POS" onToggle={(v) => set("posEnabled", v)} testId="link-pos">
                  <label className="flex items-center gap-2">
                    หมวด:
                    <input value={f.posCategory} onChange={(e) => set("posCategory", e.target.value)} className="input h-8 py-0 text-xs" data-testid="link-pos-category" />
                  </label>
                  <label className="flex items-center gap-2">
                    ราคา POS:
                    <input
                      inputMode="decimal"
                      value={f.posPriceBaht}
                      onChange={(e) => set("posPriceBaht", e.target.value)}
                      placeholder={`เท่าราคาขาย (${f.salePriceBaht ? money(Math.round(Number(f.salePriceBaht) * 100)) : "—"})`}
                      className="input h-8 py-0 text-right text-xs"
                      data-testid="link-pos-price"
                    />
                  </label>
                </LinkCard>

                <LinkCard
                  on={f.bookingEnabled}
                  disabled={f.type !== "SERVICE"}
                  icon="calendar"
                  title="จองผ่านระบบจอง"
                  onToggle={(v) => set("bookingEnabled", v)}
                  testId="link-booking"
                >
                  {f.type !== "SERVICE" ? (
                    <span>ปิดอยู่ — ใช้กับบริการเท่านั้น</span>
                  ) : (
                    <>
                      <label className="flex items-center gap-2">
                        ระยะเวลา (นาที):
                        <input inputMode="numeric" value={f.bookingDurationMin} onChange={(e) => set("bookingDurationMin", e.target.value)} className="input h-8 w-24 py-0 text-right text-xs" />
                      </label>
                      <label className="flex items-center gap-2">
                        มัดจำ (บาท):
                        <input inputMode="decimal" value={f.bookingDepositBaht} onChange={(e) => set("bookingDepositBaht", e.target.value)} className="input h-8 w-28 py-0 text-right text-xs" />
                      </label>
                    </>
                  )}
                </LinkCard>

                {/* แถบ "เชื่อมอยู่กับ" (g8 ท้ายการ์ด) */}
                <div className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--color-line)" }} data-testid="product-linked-ids">
                  <AccountIcon name="link" className="h-4 w-4 text-[color:var(--color-muted)]" />
                  <span className="text-[color:var(--color-muted)]">เชื่อมอยู่กับ:</span>
                  <b>{product?.item ? `คลังสินค้า ${product.item.sku}` : "— ยังไม่ผูกคลัง"}</b>
                  <span className="flex-1" />
                  <span className="text-[color:var(--color-muted)]">เมนู POS {f.posEnabled ? (f.posCategory || "ทั่วไป") : "—"}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg px-4 py-2 text-sm shadow-[0_8px_24px_rgba(10,10,10,.24)]"
          style={{ background: toast.tone === "error" ? "var(--color-danger)" : "var(--color-ink)", color: "var(--color-surface)" }}
          data-testid="product-toast"
          onClick={() => setToast(null)}
        >
          {toast.text}
        </div>
      )}
    </Modal>
  );
}

export default ProductModal;
