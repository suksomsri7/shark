// StampCardEditor.tsx — ตัวออกแบบสแตมป์การ์ด (M2.3 · ภาพ ledger/design-member/17-stamp-card-editor.png)
//
// 3 ส่วนตามภาพ:
//   (ก) ซ้าย  "ตั้งค่าการ์ด" — ชื่อ · จำนวนช่อง · ได้ตราเมื่อ (+เงื่อนไข) · สูงสุด ตรา/วัน · ใครประทับได้
//              · รางวัลเมื่อครบ · เริ่มใบใหม่ · อายุใบ · จำกัดระดับ · สาขา
//   (ข) ขวาบน "ตัวอย่างการ์ดจริง" — วงกลมเท่าจำนวนช่อง (ที่ประทับแล้วเป็นวงทึบ) + บรรทัดสรุป
//   (ค) ขวาล่าง สถิติ 3 ตัว: ใบที่ใช้อยู่ · ครบแล้ว · รางวัลที่จ่าย
//
// กติกาของหน้าสมาชิก: ไม่มีอีโมจิ/สัญลักษณ์ (ใช้ MemberIcon) · ไม่มีสีฮาร์ดโค้ด (โทเคน var(--color-*))
// ป้ายภาษาไทยของ "ได้ตราเมื่อ"/"รางวัลเมื่อครบ" อยู่ในทะเบียนเดียวที่ไฟล์นี้ แล้วตารางรายการ import ไปใช้ต่อ
// (ทะเบียนเดียว = วันหนึ่งเปลี่ยนคำแล้วไม่มีที่ไหนค้างคำเก่า)
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { StampCardDto } from "@/lib/modules/stamp/service";
import { createStampCardAction, updateStampCardAction } from "@/lib/modules/stamp/stamp-actions";
import { MemberIcon } from "./MemberIcon";

/** ทะเบียนป้ายไทยของกฎ 5 ชนิด — ตาราง/ตัวออกแบบ/รายงาน ใช้ชุดเดียวกัน */
export const RULE_LABEL: Record<string, string> = {
  PER_VISIT: "จองที่มาจริง",
  PER_ITEM: "ต่อชิ้นของสินค้า/บริการที่เลือก",
  PER_SALE_MIN: "ยอดบิลถึงเกณฑ์",
  PER_DAY: "มาใช้บริการ (1 ตราต่อวัน)",
  MANUAL: "ประทับเอง (พนักงานกด)",
};

/** ทะเบียนป้ายไทยของรางวัล 4 ชนิด */
export const REWARD_LABEL: Record<string, string> = {
  VOUCHER: "voucher: คูปองส่วนลด/ของแถม",
  REWARD: "ของรางวัลในแคตตาล็อก",
  POINTS: "แต้มสะสม",
  DISCOUNT_NEXT: "ส่วนลดบิลถัดไป",
};

const RULE_ORDER = ["PER_VISIT", "PER_ITEM", "PER_SALE_MIN", "PER_DAY", "MANUAL"] as const;
const REWARD_ORDER = ["VOUCHER", "REWARD", "POINTS", "DISCOUNT_NEXT"] as const;

export type StampCardEditorProps = {
  systemId: string;
  /** null = หน้าสร้างใบใหม่ */
  card: StampCardDto | null;
  /** ตราที่ประทับแล้วของใบตัวอย่าง (ใบจริงของลูกค้าที่คืบหน้ามากที่สุด) */
  sampleStamps: number;
  tiers: { id: string; name: string }[];
  units: { id: string; name: string }[];
  services: { id: string; name: string }[];
  canManage: boolean;
};

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div
      className="flex flex-wrap items-center gap-3 px-4 py-3"
      style={{ borderTop: "1px solid var(--color-line)" }}
    >
      <span className="w-28 shrink-0 text-sm" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>
      {hint && (
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-3 py-1 text-xs"
      style={{
        border: "1px solid var(--color-line)",
        background: active ? "var(--color-surface-2)" : "transparent",
        color: active ? "var(--color-ink)" : "var(--color-muted)",
      }}
    >
      {label}
    </button>
  );
}

export function StampCardEditor(props: StampCardEditorProps) {
  const { systemId, card, tiers, units, services, canManage } = props;
  const router = useRouter();
  const cfg = card?.ruleConfig;
  const reward = (card?.rewardConfig ?? {}) as Record<string, unknown>;

  const [name, setName] = useState(card?.name ?? "");
  const [description, setDescription] = useState(card?.description ?? "");
  const [slots, setSlots] = useState(card?.slots ?? 10);
  const [ruleKind, setRuleKind] = useState<string>(card?.ruleKind ?? "MANUAL");
  const [minBaht, setMinBaht] = useState(cfg?.minSatang ? Math.round(cfg.minSatang / 100) : 0);
  const [serviceIds, setServiceIds] = useState<string[]>(cfg?.serviceIds ?? []);
  const [perDayMax, setPerDayMax] = useState(cfg?.perDayMax ?? 1);
  const [allowStaffScan, setAllowStaffScan] = useState(cfg?.allowStaffScan ?? true);
  const [allowAutoFromSale, setAllowAutoFromSale] = useState(cfg?.allowAutoFromSale ?? true);
  const [usePin, setUsePin] = useState(!!cfg?.staffPin);
  const [staffPin, setStaffPin] = useState(cfg?.staffPin ?? "");
  const [rewardKind, setRewardKind] = useState<string>(card?.rewardKind ?? "POINTS");
  const [rewardPoints, setRewardPoints] = useState(Number(reward.points) > 0 ? Number(reward.points) : 50);
  const [rewardNote, setRewardNote] = useState(typeof reward.note === "string" ? reward.note : "");
  const [rewardPct, setRewardPct] = useState(Number(reward.pct) > 0 ? Number(reward.pct) : 10);
  const [autoRestart, setAutoRestart] = useState(card?.autoRestart ?? true);
  const [validMonths, setValidMonths] = useState(card?.validMonths ?? 12);
  const [noExpiry, setNoExpiry] = useState(card ? card.validMonths === null : false);
  const [tierDefIds, setTierDefIds] = useState<string[]>(card?.tierDefIds ?? []);
  const [unitIds, setUnitIds] = useState<string[]>(card?.unitIds ?? []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = card?.stats ?? { active: 0, completed: 0, rewardsPaid: 0 };
  const stamped = Math.min(props.sampleStamps, slots);
  const circles = useMemo(() => Array.from({ length: Math.max(1, slots) }, (_, i) => i), [slots]);

  const toggleIn = (list: string[], id: string): string[] =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const rewardConfig = (): Record<string, unknown> => {
    if (rewardKind === "POINTS") return { points: rewardPoints };
    if (rewardKind === "VOUCHER") return { templateId: null, note: rewardNote };
    if (rewardKind === "REWARD") return { rewardId: null, note: rewardNote };
    return { pct: rewardPct };
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      systemId,
      name,
      description,
      slots,
      ruleKind,
      ruleConfig: {
        minSatang: ruleKind === "PER_SALE_MIN" ? Math.max(0, Math.round(minBaht)) * 100 : null,
        itemIds: [],
        serviceIds: ruleKind === "PER_ITEM" || ruleKind === "PER_VISIT" ? serviceIds : [],
        perDayMax,
        allowStaffScan,
        allowAutoFromSale,
        staffPin: usePin && staffPin.trim() ? staffPin.trim() : null,
      },
      rewardKind,
      rewardConfig: rewardConfig(),
      autoRestart,
      validMonths: noExpiry ? null : validMonths,
      tierDefIds,
      unitIds,
    };
    const res = card
      ? await updateStampCardAction({ ...payload, cardId: card.id })
      : await createStampCardAction(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    if (card) router.refresh();
    else router.push(`/app/sys/${systemId}/member/stamps/${res.data.id}`);
  };

  return (
    <div data-testid="stamps-editor" className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* (ก) ฟอร์มตั้งค่าการ์ด */}
      <form
        data-testid="stamps-editor-form"
        className="card w-full p-0 lg:w-[26rem]"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center gap-2 p-4 pb-3">
          <MemberIcon name="stamp" size="sm" />
          <h2 className="text-sm font-semibold">ตั้งค่าการ์ด</h2>
        </div>

        <Row label="ชื่อ">
          <input
            className="input w-full"
            data-testid="stamps-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ดำน้ำครบ 10 ไดฟ์ ฟรี 1"
            disabled={!canManage}
          />
        </Row>

        <Row label="คำอธิบาย">
          <input
            className="input w-full"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="ได้ตราเมื่อจองที่มาจริง"
            disabled={!canManage}
          />
        </Row>

        <Row label="จำนวนช่อง" hint="ตั้งได้ 3–30 ช่อง">
          <input
            type="number"
            min={3}
            max={30}
            className="input w-20"
            data-testid="stamps-slots"
            value={slots}
            onChange={(e) => setSlots(Number(e.target.value))}
            disabled={!canManage}
          />
        </Row>

        <Row label="ได้ตราเมื่อ">
          <select
            className="input"
            data-testid="stamps-rule-kind"
            value={ruleKind}
            onChange={(e) => setRuleKind(e.target.value)}
            disabled={!canManage}
          >
            {RULE_ORDER.map((k) => (
              <option key={k} value={k}>
                {RULE_LABEL[k]}
              </option>
            ))}
          </select>
        </Row>

        {(ruleKind === "PER_VISIT" || ruleKind === "PER_ITEM") && (
          <Row label="และ">
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              บริการ =
            </span>
            {services.length === 0 && (
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                ทุกบริการ
              </span>
            )}
            {services.slice(0, 12).map((s) => (
              <Chip
                key={s.id}
                active={serviceIds.includes(s.id)}
                label={s.name}
                onClick={() => canManage && setServiceIds(toggleIn(serviceIds, s.id))}
              />
            ))}
          </Row>
        )}

        {ruleKind === "PER_SALE_MIN" && (
          <Row label="และ" hint="บาทขึ้นไป">
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              ยอดบิล =
            </span>
            <input
              type="number"
              min={0}
              className="input w-28"
              value={minBaht}
              onChange={(e) => setMinBaht(Number(e.target.value))}
              disabled={!canManage}
            />
          </Row>
        )}

        <Row label="สูงสุด" hint="ตรา/วัน">
          <input
            type="number"
            min={1}
            className="input w-20"
            data-testid="stamps-per-day"
            value={perDayMax}
            onChange={(e) => setPerDayMax(Number(e.target.value))}
            disabled={!canManage || ruleKind === "PER_DAY"}
          />
        </Row>

        <Row label="ใครประทับได้">
          <label className="flex w-full items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowStaffScan}
              onChange={(e) => setAllowStaffScan(e.target.checked)}
              disabled={!canManage}
            />
            พนักงานสแกน QR ลูกค้า
          </label>
          <label className="flex w-full items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowAutoFromSale}
              onChange={(e) => setAllowAutoFromSale(e.target.checked)}
              disabled={!canManage}
            />
            อัตโนมัติจากบิล
          </label>
          <label className="flex w-full items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={usePin}
              onChange={(e) => setUsePin(e.target.checked)}
              disabled={!canManage}
            />
            ใส่ PIN พนักงาน
          </label>
          {usePin && (
            <input
              className="input w-28"
              value={staffPin}
              onChange={(e) => setStaffPin(e.target.value)}
              placeholder="1234"
              disabled={!canManage}
            />
          )}
        </Row>

        <Row label="รางวัลเมื่อครบ">
          <select
            className="input"
            data-testid="stamps-reward-kind"
            value={rewardKind}
            onChange={(e) => setRewardKind(e.target.value)}
            disabled={!canManage}
          >
            {REWARD_ORDER.map((k) => (
              <option key={k} value={k}>
                {REWARD_LABEL[k]}
              </option>
            ))}
          </select>
          {rewardKind === "POINTS" && (
            <input
              type="number"
              min={1}
              className="input w-24"
              value={rewardPoints}
              onChange={(e) => setRewardPoints(Number(e.target.value))}
              disabled={!canManage}
            />
          )}
          {(rewardKind === "VOUCHER" || rewardKind === "REWARD") && (
            <input
              className="input flex-1"
              value={rewardNote}
              onChange={(e) => setRewardNote(e.target.value)}
              placeholder="ดำน้ำฟรี 1 ไดฟ์"
              disabled={!canManage}
            />
          )}
          {rewardKind === "DISCOUNT_NEXT" && (
            <input
              type="number"
              min={1}
              max={100}
              className="input w-20"
              value={rewardPct}
              onChange={(e) => setRewardPct(Number(e.target.value))}
              disabled={!canManage}
            />
          )}
        </Row>

        <Row label="เริ่มใบใหม่">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRestart}
              onChange={(e) => setAutoRestart(e.target.checked)}
              disabled={!canManage}
            />
            อัตโนมัติเมื่อครบ
          </label>
        </Row>

        <Row label="อายุใบ" hint="เดือน หลังเริ่มใบ">
          <input
            type="number"
            min={1}
            max={60}
            className="input w-20"
            value={validMonths}
            onChange={(e) => setValidMonths(Number(e.target.value))}
            disabled={!canManage || noExpiry}
          />
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--color-muted)" }}>
            <input
              type="checkbox"
              checked={noExpiry}
              onChange={(e) => setNoExpiry(e.target.checked)}
              disabled={!canManage}
            />
            ไม่หมดอายุ
          </label>
        </Row>

        <Row label="จำกัดระดับ">
          <Chip active={tierDefIds.length === 0} label="ทุกระดับ" onClick={() => canManage && setTierDefIds([])} />
          {tiers.map((t) => (
            <Chip
              key={t.id}
              active={tierDefIds.includes(t.id)}
              label={t.name}
              onClick={() => canManage && setTierDefIds(toggleIn(tierDefIds, t.id))}
            />
          ))}
        </Row>

        <Row label="สาขา">
          <Chip active={unitIds.length === 0} label="ทั้งร้าน" onClick={() => canManage && setUnitIds([])} />
          {units.map((u) => (
            <Chip
              key={u.id}
              active={unitIds.includes(u.id)}
              label={u.name}
              onClick={() => canManage && setUnitIds(toggleIn(unitIds, u.id))}
            />
          ))}
        </Row>

        {error && (
          <p data-testid="stamps-error" className="px-4 py-3 text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 p-4" style={{ borderTop: "1px solid var(--color-line)" }}>
          <Link href={`/app/sys/${systemId}/member/stamps`} className="btn">
            ยกเลิก
          </Link>
          <button type="submit" data-testid="stamps-save" className="btn btn-primary" disabled={!canManage || saving}>
            {saving ? "กำลังบันทึก" : "บันทึก"}
          </button>
        </div>
      </form>

      <div className="flex w-full flex-1 flex-col gap-4">
        {/* (ข) ตัวอย่างการ์ดจริง — แบบที่ลูกค้าเห็นบน LINE */}
        <div data-testid="stamps-preview" className="card flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <MemberIcon name="chat" size="sm" />
            <h2 className="text-sm font-semibold">ตัวอย่างการ์ดจริง</h2>
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              แบบที่ลูกค้าเห็นบน LINE
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {circles.map((i) => (
              <span
                key={i}
                data-testid={i < stamped ? "stamps-dot-on" : "stamps-dot-off"}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-sm"
                style={{
                  border: "1px solid var(--color-line)",
                  background: i < stamped ? "var(--color-ink)" : "transparent",
                  color: i < stamped ? "var(--color-surface)" : "var(--color-muted)",
                }}
              >
                {i < stamped ? <MemberIcon name="check" size="sm" /> : i + 1}
              </span>
            ))}
          </div>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            {stamped}/{slots} ประทับแล้ว
            {autoRestart ? " — ใบตัดไปเริ่มอัตโนมัติเมื่อครบ" : " — ครบแล้วหยุด รอรับรางวัล"}
          </p>
        </div>

        {/* (ค) สถิติการใช้งาน */}
        <div data-testid="stamps-stats" className="card flex flex-wrap gap-8 p-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              ใบที่ใช้อยู่
            </span>
            <span className="text-xl font-semibold">{stats.active.toLocaleString("th-TH")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              ครบแล้ว
            </span>
            <span className="text-xl font-semibold">{stats.completed.toLocaleString("th-TH")}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              รางวัลที่จ่าย
            </span>
            <span className="text-xl font-semibold">
              {stats.rewardsPaid.toLocaleString("th-TH")} ครั้ง
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
