// TierBenefitsEditor.tsx — หน้า "แก้ระดับสมาชิก" (M1.10 · ภาพ 15): ตั้งค่าระดับ (ซ้าย) +
// สิทธิประโยชน์ 10 ชนิด (กลาง) + ตัวอย่างบัตร LINE สด (ขวา ผ่าน <TierCardPreview>)
//
// 🔴 ป้ายไทย/ไอคอนของสิทธิประโยชน์แต่ละชนิดมาจาก `BENEFIT_REGISTRY` (ไม่ฮาร์ดโค้ดสวิตช์ทีละชนิดใน JSX) —
//    ฟอร์ม config ต่อชนิดต่างกันจริง (pct/maxSatang · satang · x · daysAhead · itemIds ฯลฯ) จึงมี switch
//    เดียวสำหรับ "จะวาดช่องกรอกอะไร" แต่ป้าย/คำอธิบาย/ไอคอนอ่านจาก registry เสมอ
// 🔴 WELCOME_VOUCHER (templateId) เลือกไม่ได้ในใบนี้ตามสัญญา — ป้าย "มีในใบ M2.5" ปิดสวิตช์ไว้ก่อน
// 🔴 FREE_SERVICE/EXCLUSIVE_ITEMS ต้องมีรายการ ≥ 1 ก่อนเปิดใช้งาน (schema `itemIds.min(1)`) — ไม่งั้น
//    บันทึกไม่ผ่าน (ไม่ส่งแถวนั้นไปเลยถ้ายังว่าง แทนที่จะโยน error ทำลายชนิดอื่นทั้งชุด)
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TierBenefitType } from "@prisma/client";
import { MemberIcon } from "./MemberIcon";
import { TierCardPreview } from "./TierCardPreview";
import { setBenefitsAction, updateTierDefAction, reorderTierDefsAction } from "@/lib/modules/member/tiers-actions";
import type { TierBenefitDto, TierDefDto } from "@/lib/modules/member/tiers";

const TAG_COLORS = ["SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE"] as const;
const ICON_CHOICES = ["star", "crown", "gift", "tag", "megaphone", "doc", "gear", "chart"] as const;

type BenefitConfig = Record<string, unknown>;
type Row = { active: boolean; config: BenefitConfig };
type RowState = Record<TierBenefitType, Row>;

const BENEFIT_REGISTRY: { type: TierBenefitType; label: string; hint: string; icon: string; disabled?: string }[] = [
  { type: "DISCOUNT_PCT", label: "ส่วนลดเปอร์เซ็นต์ (POS/จอง)", hint: "ลดเป็น % ของยอดซื้อ ใช้ได้จริงที่ POS/จอง", icon: "tag" },
  { type: "DISCOUNT_FIXED", label: "ส่วนลดจำนวนคงที่ (POS/จอง)", hint: "ลดเป็นจำนวนเงินคงที่ต่อบิล", icon: "tag" },
  { type: "POINT_MULTIPLIER", label: "ตัวคูณแต้ม", hint: "คูณแต้มที่ได้รับจากยอดซื้อ", icon: "star" },
  { type: "WELCOME_VOUCHER", label: "voucher ต้อนรับตอนเลื่อนระดับ", hint: "ออก voucher อัตโนมัติเมื่อขึ้นระดับนี้", icon: "gift", disabled: "มีในใบ M2.5" },
  { type: "BIRTHDAY_GIFT", label: "ของขวัญวันเกิด", hint: "แจกของขวัญให้สมาชิกทุกวันเกิด", icon: "gift" },
  { type: "FREE_SERVICE", label: "บริการฟรีต่อรอบ", hint: "ให้บริการฟรีตามรายการที่ระบุ (นับผ่านสแตมป์การ์ด M2.3)", icon: "stamp" },
  { type: "PRIORITY_BOOKING", label: "จองก่อนใคร", hint: "เปิดจองล่วงหน้าก่อนสมาชิกทั่วไปกี่วัน", icon: "crown" },
  { type: "NO_POINT_EXPIRY", label: "แต้มไม่หมดอายุ", hint: "แต้มของสมาชิกระดับนี้ไม่มีวันหมดอายุ", icon: "star" },
  { type: "CANCEL_FEE_DISCOUNT", label: "ค่าธรรมเนียมยกเลิกลด", hint: "ลดเปอร์เซ็นต์ค่าธรรมเนียมยกเลิกการจอง", icon: "gear" },
  { type: "EXCLUSIVE_ITEMS", label: "เข้าถึงสินค้าเฉพาะระดับ", hint: "ซื้อ/จองสินค้าที่เปิดเฉพาะระดับนี้ได้", icon: "doc" },
];

function defaultConfig(type: TierBenefitType): BenefitConfig {
  switch (type) {
    case "DISCOUNT_PCT":
      return { pct: 0 };
    case "DISCOUNT_FIXED":
      return { satang: 0 };
    case "POINT_MULTIPLIER":
      return { x: 1 };
    case "WELCOME_VOUCHER":
      return { templateId: "" };
    case "BIRTHDAY_GIFT":
      return { note: "" };
    case "FREE_SERVICE":
      return { itemIds: [] };
    case "PRIORITY_BOOKING":
      return { daysAhead: 7 };
    case "NO_POINT_EXPIRY":
      return {};
    case "CANCEL_FEE_DISCOUNT":
      return { pct: 0 };
    case "EXCLUSIVE_ITEMS":
      return { itemIds: [] };
    default:
      return {};
  }
}

function initialRows(existing: TierBenefitDto[]): RowState {
  const out = {} as RowState;
  for (const r of BENEFIT_REGISTRY) {
    const found = existing.find((b) => b.type === r.type);
    out[r.type] = found ? { active: found.active, config: found.config } : { active: false, config: defaultConfig(r.type) };
  }
  return out;
}

function itemIdsOf(config: BenefitConfig): string {
  return Array.isArray(config.itemIds) ? (config.itemIds as string[]).join(", ") : "";
}

function inputBox(): React.CSSProperties {
  return { borderRadius: 8, border: "1px solid var(--color-line)", padding: "5px 8px", fontSize: 13 };
}

function BenefitRow({ def, row, onChange }: { def: (typeof BENEFIT_REGISTRY)[number]; row: Row; onChange: (r: Row) => void }) {
  const c = row.config;
  const set = (patch: BenefitConfig) => onChange({ ...row, config: { ...c, ...patch } });

  let control: React.ReactNode = null;
  switch (def.type) {
    case "DISCOUNT_PCT":
      control = (
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <input type="number" min={0} max={100} value={Number(c.pct ?? 0)} onChange={(e) => set({ pct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} style={{ ...inputBox(), width: 70 }} />
            <span style={{ color: "var(--color-muted)" }}>%</span>
          </span>
          <span className="flex items-center gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
            สูงสุด/ปี ฿
            <input
              type="number"
              min={0}
              placeholder="ไม่จำกัด"
              value={c.maxSatang ? Math.round(Number(c.maxSatang) / 100) : ""}
              onChange={(e) => set({ maxSatang: e.target.value ? Math.max(0, Math.round(Number(e.target.value))) * 100 : undefined })}
              style={{ ...inputBox(), width: 90 }}
            />
          </span>
        </span>
      );
      break;
    case "DISCOUNT_FIXED":
      control = (
        <span className="flex items-center gap-1">
          <span style={{ color: "var(--color-muted)" }}>฿</span>
          <input
            type="number"
            min={0}
            value={Math.round(Number(c.satang ?? 0) / 100)}
            onChange={(e) => set({ satang: Math.max(0, Math.round(Number(e.target.value) || 0)) * 100 })}
            style={{ ...inputBox(), width: 90 }}
          />
        </span>
      );
      break;
    case "POINT_MULTIPLIER":
      control = (
        <span className="flex items-center gap-1">
          ×
          <input type="number" min={0} max={20} step={0.1} value={Number(c.x ?? 1)} onChange={(e) => set({ x: Math.min(20, Math.max(0, Number(e.target.value) || 0)) })} style={{ ...inputBox(), width: 70 }} />
        </span>
      );
      break;
    case "WELCOME_VOUCHER":
      control = (
        <span className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
          เลือกเทมเพลต voucher — {def.disabled}
        </span>
      );
      break;
    case "BIRTHDAY_GIFT":
      control = (
        <input
          placeholder="รายละเอียดของขวัญ เช่น voucher ฿500"
          value={String(c.note ?? "")}
          onChange={(e) => set({ note: e.target.value })}
          style={{ ...inputBox(), width: 220 }}
        />
      );
      break;
    case "FREE_SERVICE":
      control = (
        <span className="flex items-center gap-2">
          <input
            placeholder="รหัสบริการ คั่นด้วยจุลภาค"
            value={itemIdsOf(c)}
            onChange={(e) => set({ itemIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            style={{ ...inputBox(), width: 180 }}
          />
          <input
            type="number"
            min={1}
            placeholder="ครั้ง/ปี"
            value={c.perYear ? Number(c.perYear) : ""}
            onChange={(e) => set({ perYear: e.target.value ? Math.max(1, Number(e.target.value)) : undefined })}
            style={{ ...inputBox(), width: 70 }}
          />
        </span>
      );
      break;
    case "PRIORITY_BOOKING":
      control = (
        <span className="flex items-center gap-1">
          <input
            type="number"
            min={1}
            max={365}
            value={Number(c.daysAhead ?? 7)}
            onChange={(e) => set({ daysAhead: Math.min(365, Math.max(1, Number(e.target.value) || 1)) })}
            style={{ ...inputBox(), width: 60 }}
          />
          <span style={{ color: "var(--color-muted)" }}>วันล่วงหน้า</span>
        </span>
      );
      break;
    case "CANCEL_FEE_DISCOUNT":
      control = (
        <span className="flex items-center gap-1">
          <input type="number" min={0} max={100} value={Number(c.pct ?? 0)} onChange={(e) => set({ pct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} style={{ ...inputBox(), width: 70 }} />
          <span style={{ color: "var(--color-muted)" }}>%</span>
        </span>
      );
      break;
    case "EXCLUSIVE_ITEMS":
      control = (
        <input
          placeholder="รหัสสินค้า คั่นด้วยจุลภาค"
          value={itemIdsOf(c)}
          onChange={(e) => set({ itemIds: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          style={{ ...inputBox(), width: 220 }}
        />
      );
      break;
    default:
      control = null;
  }

  const isEmptyList = (def.type === "FREE_SERVICE" || def.type === "EXCLUSIVE_ITEMS") && itemIdsOf(c).length === 0;

  return (
    <div data-testid={`tiers-benefit-${def.type}`} className="flex flex-col gap-1 rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--color-line)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="checkbox"
          aria-label={`เปิดใช้งาน ${def.label}`}
          disabled={!!def.disabled}
          checked={row.active}
          onChange={(e) => onChange({ ...row, active: e.target.checked })}
          style={{ width: 16, height: 16, accentColor: "var(--color-accent)" }}
        />
        <MemberIcon name={def.icon} size="sm" />
        <span className="flex-1 text-sm font-medium">{def.label}</span>
        {control}
      </div>
      <p className="pl-7 text-xs" style={{ color: "var(--color-muted)" }}>
        {def.hint}
      </p>
      {row.active && isEmptyList && (
        <p className="pl-7 text-xs" style={{ color: "var(--color-danger)" }}>
          กรอกรายการอย่างน้อย 1 รายการก่อนบันทึก ไม่งั้นจะถูกปิดใช้งานให้อัตโนมัติ
        </p>
      )}
    </div>
  );
}

export type TierBenefitsEditorProps = {
  systemId: string;
  shopName: string;
  tier: TierDefDto;
  allTiers: TierDefDto[];
  plans: { id: string; name: string }[];
  canManage: boolean;
};

/** ฟอร์มแก้ระดับสมาชิก 1 ระดับ — ตั้งค่า + สิทธิประโยชน์ 10 ชนิด (`tiers-benefits` · ภาพ 15) */
export function TierBenefitsEditor({ systemId, shopName, tier, allTiers, plans, canManage }: TierBenefitsEditorProps) {
  const router = useRouter();
  const [name, setName] = useState(tier.name);
  const [color, setColor] = useState<(typeof TAG_COLORS)[number]>((tier.color as (typeof TAG_COLORS)[number]) ?? "SLATE");
  const [icon, setIcon] = useState(tier.icon ?? "star");
  const [description, setDescription] = useState(tier.description ?? "");
  const [isPaid, setIsPaid] = useState(!!tier.paidPlanId);
  const [paidPlanId, setPaidPlanId] = useState(tier.paidPlanId ?? plans[0]?.id ?? "");
  const [rows, setRows] = useState<RowState>(() => initialRows(tier.benefits));
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const idx = allTiers.findIndex((t) => t.id === tier.id);

  const moveOrder = (dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= allTiers.length) return;
    const ids = allTiers.map((t) => t.id);
    [ids[idx], ids[target]] = [ids[target]!, ids[idx]!];
    startTransition(async () => {
      await reorderTierDefsAction(systemId, ids);
      router.refresh();
    });
  };

  const cancel = () => {
    setName(tier.name);
    setColor((tier.color as (typeof TAG_COLORS)[number]) ?? "SLATE");
    setIcon(tier.icon ?? "star");
    setDescription(tier.description ?? "");
    setIsPaid(!!tier.paidPlanId);
    setPaidPlanId(tier.paidPlanId ?? plans[0]?.id ?? "");
    setRows(initialRows(tier.benefits));
    setMsg(null);
  };

  const save = () => {
    setMsg(null);
    startTransition(async () => {
      const benefits = BENEFIT_REGISTRY.filter((d) => d.type !== "WELCOME_VOUCHER")
        .map((d) => ({ type: d.type, ...rows[d.type] }))
        .filter((r) => (r.type === "FREE_SERVICE" || r.type === "EXCLUSIVE_ITEMS" ? itemIdsOf(r.config).length > 0 : true));

      const [a, b] = await Promise.all([
        updateTierDefAction(systemId, tier.id, {
          name: name.trim() || tier.name,
          color,
          icon,
          description: description.trim() || null,
          paidPlanId: isPaid ? paidPlanId || null : null,
        }),
        setBenefitsAction(systemId, tier.id, benefits),
      ]);
      if (!a.ok) {
        setMsg({ ok: false, text: a.reason });
        return;
      }
      if (!b.ok) {
        setMsg({ ok: false, text: b.reason });
        return;
      }
      setMsg({ ok: true, text: "บันทึกแล้ว" });
      router.refresh();
    });
  };

  const previewBenefits: TierBenefitDto[] = BENEFIT_REGISTRY.filter((d) => d.type !== "WELCOME_VOUCHER").map((d) => ({
    id: d.type,
    type: d.type,
    config: rows[d.type]!.config,
    active: rows[d.type]!.active,
  }));

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex w-full flex-col gap-3 rounded-2xl border p-4 lg:w-72" style={{ borderColor: "var(--color-line)" }}>
        <h2 className="text-sm font-semibold">ระดับ</h2>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
          ชื่อ
          <input disabled={!canManage} value={name} onChange={(e) => setName(e.target.value)} style={inputBox()} className="text-[color:var(--color-ink)]" />
        </label>
        <div className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
          สี
          <div className="flex gap-1.5">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={!canManage}
                aria-label={c}
                onClick={() => setColor(c)}
                className="h-6 w-6 rounded-full border-2"
                style={{ background: `var(--color-tag-${c.toLowerCase()})`, borderColor: color === c ? "var(--color-ink)" : "transparent" }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
          ไอคอน
          <div className="flex flex-wrap gap-1.5">
            {ICON_CHOICES.map((i) => (
              <button
                key={i}
                type="button"
                disabled={!canManage}
                aria-label={`เปลี่ยนไอคอนเป็น ${i}`}
                onClick={() => setIcon(i)}
                className="flex h-7 w-7 items-center justify-center rounded-lg border"
                style={{ borderColor: icon === i ? "var(--color-accent)" : "var(--color-line)", color: icon === i ? "var(--color-accent)" : "var(--color-muted)" }}
              >
                <MemberIcon name={i} size="sm" />
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
          ลำดับ {idx + 1} จากทั้งหมด {allTiers.length} ระดับ
          <span className="flex items-center gap-2">
            <button type="button" className="btn btn-ghost text-xs" disabled={!canManage || idx <= 0} onClick={() => moveOrder(-1)}>
              −
            </button>
            <button type="button" className="btn btn-ghost text-xs" disabled={!canManage || idx >= allTiers.length - 1} onClick={() => moveOrder(1)}>
              +
            </button>
          </span>
        </label>
        <label className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
          คำอธิบายที่ลูกค้าเห็น
          <textarea disabled={!canManage} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={inputBox()} className="text-[color:var(--color-ink)]" />
        </label>
        <label className="flex items-start gap-2 text-xs" style={{ color: "var(--color-muted)" }}>
          <input type="checkbox" disabled={!canManage || plans.length === 0} checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} style={{ marginTop: 2, accentColor: "var(--color-accent)" }} />
          เป็นระดับแบบเสียเงิน (ผู้ที่สมัครแพ็กเกจสมาชิกจะได้ระดับนี้ทันที)
        </label>
        {isPaid && (
          <select disabled={!canManage} value={paidPlanId} onChange={(e) => setPaidPlanId(e.target.value)} style={inputBox()} className="text-[color:var(--color-ink)]">
            {plans.length === 0 && <option value="">ยังไม่มีแพ็กเกจในระบบนี้</option>}
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div data-testid="tiers-benefits" className="flex w-full flex-1 flex-col gap-2 rounded-2xl border p-4" style={{ borderColor: "var(--color-line)" }}>
        <h2 className="mb-1 text-sm font-semibold">สิทธิประโยชน์ — เปิด/ปิดและตั้งค่าแต่ละสิทธิ์ ใช้จริงที่ POS/จอง/LIFF</h2>
        {BENEFIT_REGISTRY.map((def) => (
          <BenefitRow key={def.type} def={def} row={rows[def.type]!} onChange={(r) => setRows((s) => ({ ...s, [def.type]: r }))} />
        ))}
      </div>

      <div className="flex w-full flex-col gap-3 lg:w-72">
        <TierCardPreview shopName={shopName} tierName={name} color={color} benefits={previewBenefits} memberCount={tier.memberCount} />
        {canManage && (
          <div className="flex items-center justify-end gap-2 rounded-2xl border p-3" style={{ borderColor: "var(--color-line)" }}>
            {msg && <span className="text-xs" style={{ color: msg.ok ? "var(--color-accent)" : "var(--color-danger)" }}>{msg.text}</span>}
            <button type="button" className="btn btn-ghost text-sm" disabled={pending} onClick={cancel}>
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary text-sm" disabled={pending} onClick={save}>
              {pending ? "กำลังบันทึก…" : "บันทึก"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default TierBenefitsEditor;
