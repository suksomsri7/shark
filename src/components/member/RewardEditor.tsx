// RewardEditor.tsx — ฟอร์มเพิ่ม/แก้ของรางวัล (M2.4 · ภาพ ledger/design-member/18-reward-editor-fulfil.png ซ้าย)
//
// แถวตามภาพ: อัปโหลดรูป + ชื่อ · ชนิด · ราคา (แต้ม และ/หรือ สแตมป์ +เลือกการ์ด) · สต็อก · จำกัดระดับ ·
//   จำกัด ชิ้น/คน/เดือน · ช่วงเวลา · สาขาที่รับได้ · รับของภายใน n วัน · แสดงบน LINE
// กติกาของหน้าสมาชิก: ไม่มีอีโมจิ/สัญลักษณ์ (ใช้ MemberIcon) · ไม่มีสีฮาร์ดโค้ด (โทเคน var(--color-*))
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RewardDto } from "@/lib/modules/reward";
import { createRewardAction, updateRewardAction } from "@/lib/modules/reward/reward-actions";
import { MemberIcon } from "./MemberIcon";

export const KIND_LABEL: Record<string, string> = {
  ITEM: "ของจริง",
  SERVICE: "บริการ",
  VOUCHER: "คูปอง",
  DISCOUNT: "ส่วนลด",
};
const KIND_ORDER = ["ITEM", "SERVICE", "VOUCHER", "DISCOUNT"] as const;

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderTop: "1px solid var(--color-line)" }}>
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

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
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

function dateInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export type RewardEditorProps = {
  systemId: string;
  /** null = หน้าเพิ่มใหม่ */
  reward: RewardDto | null;
  tiers: { id: string; name: string }[];
  units: { id: string; name: string }[];
  stampCards: { id: string; name: string }[];
  canManage: boolean;
};

export function RewardEditor(props: RewardEditorProps) {
  const { systemId, reward, tiers, units, stampCards, canManage } = props;
  const router = useRouter();

  const [name, setName] = useState(reward?.name ?? "");
  const [description, setDescription] = useState(reward?.description ?? "");
  const [kind, setKind] = useState<string>(reward?.kind ?? "ITEM");
  const [pointsCost, setPointsCost] = useState(reward?.pointsCost ?? 0);
  const [useStampCost, setUseStampCost] = useState(!!reward?.stampCardId);
  const [stampCardId, setStampCardId] = useState(reward?.stampCardId ?? (stampCards[0]?.id ?? ""));
  const [stampsCost, setStampsCost] = useState(reward?.stampsCost ?? 1);
  const [stockLimited, setStockLimited] = useState(reward ? reward.stock !== null : true);
  const [stock, setStock] = useState(reward?.stock ?? 10);
  const [tierDefIds, setTierDefIds] = useState<string[]>(reward?.tierDefIds ?? []);
  const [monthlyLimited, setMonthlyLimited] = useState(!!reward?.perMemberMonthly);
  const [perMemberMonthly, setPerMemberMonthly] = useState(reward?.perMemberMonthly ?? 1);
  const [startAt, setStartAt] = useState(dateInputValue(reward?.startAt));
  const [endAt, setEndAt] = useState(dateInputValue(reward?.endAt));
  const [unitIds, setUnitIds] = useState<string[]>(reward?.unitIds ?? []);
  const [pickupDays, setPickupDays] = useState(reward?.pickupDays ?? 14);
  const [showToCustomer, setShowToCustomer] = useState(reward?.showToCustomer ?? true);
  const [imageFileId] = useState(reward?.imageFileId ?? null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = reward?.stats ?? { pending: 0, fulfilled: 0 };
  const toggleIn = (list: string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      systemId,
      name,
      description,
      kind,
      pointsCost,
      stampCardId: useStampCost ? stampCardId || null : null,
      stampsCost: useStampCost ? stampsCost : null,
      stock: stockLimited ? stock : null,
      tierDefIds,
      perMemberMonthly: monthlyLimited ? perMemberMonthly : null,
      startAt: startAt || null,
      endAt: endAt || null,
      unitIds,
      pickupDays,
      showToCustomer,
      imageFileId,
    };
    const res = reward ? await updateRewardAction({ ...payload, rewardId: reward.id }) : await createRewardAction(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    if (reward) router.refresh();
    else router.push(`/app/sys/${systemId}/member/rewards/${res.data.id}`);
  };

  const stampCardName = useMemo(() => stampCards.find((c) => c.id === stampCardId)?.name, [stampCards, stampCardId]);

  return (
    <div data-testid="rewards-editor" className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* ซ้าย — ฟอร์มเพิ่มของรางวัล */}
      <form
        data-testid="rewards-editor-form"
        className="card w-full p-0 lg:w-[26rem]"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center gap-2 p-4 pb-3">
          <MemberIcon name="gift" size="sm" />
          <h2 className="text-sm font-semibold">เพิ่มของรางวัล</h2>
        </div>

        <Row label="อัปโหลดรูป">
          <div
            className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg text-xs"
            style={{ border: "1px dashed var(--color-line)", color: "var(--color-muted)" }}
          >
            <MemberIcon name="cam" size="sm" />
            อัปโหลดรูป
          </div>
          <input
            className="input flex-1"
            data-testid="rewards-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เสื้อยืด SHARK"
            disabled={!canManage}
          />
        </Row>

        <Row label="คำอธิบาย">
          <input
            className="input w-full"
            value={description ?? ""}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="ไซซ์ M"
            disabled={!canManage}
          />
        </Row>

        <Row label="ชนิด">
          <select className="input" data-testid="rewards-kind" value={kind} onChange={(e) => setKind(e.target.value)} disabled={!canManage}>
            {KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </Row>

        <Row label="ราคา">
          <input
            type="number"
            min={0}
            className="input w-24"
            data-testid="rewards-cost"
            value={pointsCost}
            onChange={(e) => setPointsCost(Number(e.target.value))}
            disabled={!canManage}
          />
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            แต้ม
          </span>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            และ/หรือ
          </span>
          <input
            type="number"
            min={1}
            className="input w-20"
            value={stampsCost}
            onChange={(e) => setStampsCost(Number(e.target.value))}
            disabled={!canManage || !useStampCost}
          />
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            สแตมป์
          </span>
          <label className="flex w-full items-center gap-2 text-xs" style={{ color: "var(--color-muted)" }}>
            <input type="checkbox" checked={useStampCost} onChange={(e) => setUseStampCost(e.target.checked)} disabled={!canManage} />
            ใช้สแตมป์ร่วมด้วย — เลือกการ์ด
          </label>
          {useStampCost && (
            <select className="input flex-1" value={stampCardId} onChange={(e) => setStampCardId(e.target.value)} disabled={!canManage}>
              <option value="">— เลือกสแตมป์การ์ด —</option>
              {stampCards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {useStampCost && stampCardName && (
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              การ์ด: {stampCardName}
            </span>
          )}
        </Row>

        <Row label="สต็อก">
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--color-muted)" }}>
            <input type="checkbox" checked={!stockLimited} onChange={(e) => setStockLimited(!e.target.checked)} disabled={!canManage} />
            ไม่จำกัด
          </label>
          {stockLimited && (
            <>
              <input
                type="number"
                min={0}
                className="input w-24"
                value={stock}
                onChange={(e) => setStock(Number(e.target.value))}
                disabled={!canManage}
              />
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                ชิ้น
              </span>
            </>
          )}
        </Row>

        <Row label="จำกัดระดับ">
          <Chip active={tierDefIds.length === 0} label="ทุกระดับ" onClick={() => canManage && setTierDefIds([])} />
          {tiers.map((t) => (
            <Chip key={t.id} active={tierDefIds.includes(t.id)} label={t.name} onClick={() => canManage && setTierDefIds(toggleIn(tierDefIds, t.id))} />
          ))}
        </Row>

        <Row label="จำกัด">
          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--color-muted)" }}>
            <input type="checkbox" checked={monthlyLimited} onChange={(e) => setMonthlyLimited(e.target.checked)} disabled={!canManage} />
            จำกัดจำนวน
          </label>
          {monthlyLimited && (
            <input
              type="number"
              min={1}
              className="input w-20"
              value={perMemberMonthly}
              onChange={(e) => setPerMemberMonthly(Number(e.target.value))}
              disabled={!canManage}
            />
          )}
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            ชิ้น / คน / เดือน
          </span>
        </Row>

        <Row label="ช่วงเวลา">
          <input type="date" className="input" value={startAt} onChange={(e) => setStartAt(e.target.value)} disabled={!canManage} />
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            ถึง
          </span>
          <input type="date" className="input" value={endAt} onChange={(e) => setEndAt(e.target.value)} disabled={!canManage} />
        </Row>

        <Row label="สาขาที่รับได้">
          <Chip active={unitIds.length === 0} label="ทั้งร้าน" onClick={() => canManage && setUnitIds([])} />
          {units.map((u) => (
            <label key={u.id} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={unitIds.includes(u.id)}
                onChange={() => canManage && setUnitIds(toggleIn(unitIds, u.id))}
                disabled={!canManage}
              />
              {u.name}
            </label>
          ))}
        </Row>

        <Row label="รับของภายใน" hint="วัน หลังแลก">
          <input
            type="number"
            min={1}
            max={365}
            className="input w-20"
            value={pickupDays}
            onChange={(e) => setPickupDays(Number(e.target.value))}
            disabled={!canManage}
          />
        </Row>

        <Row label="แสดงบน LINE">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showToCustomer} onChange={(e) => setShowToCustomer(e.target.checked)} disabled={!canManage} />
            แสดงในแคตตาล็อกลูกค้า
          </label>
        </Row>

        {error && (
          <p data-testid="rewards-error" className="px-4 py-3 text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 p-4" style={{ borderTop: "1px solid var(--color-line)" }}>
          <Link href={`/app/sys/${systemId}/member/rewards`} className="btn">
            ยกเลิก
          </Link>
          <button type="submit" data-testid="rewards-save" className="btn btn-primary" disabled={!canManage || saving}>
            {saving ? "กำลังบันทึก" : "บันทึก"}
          </button>
        </div>
      </form>

      {/* ขวา — สถิติของรายการนี้ (เฉพาะหน้าแก้ไข) */}
      {reward && (
        <div data-testid="rewards-stats" className="card flex w-full flex-col gap-4 p-4 lg:w-auto lg:flex-1">
          <div className="flex items-center gap-2">
            <MemberIcon name="chart" size="sm" />
            <h2 className="text-sm font-semibold">สรุป</h2>
          </div>
          <div className="flex flex-wrap gap-8">
            <div className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                รอรับ
              </span>
              <span className="text-xl font-semibold">{stats.pending.toLocaleString("th-TH")}</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                รับแล้ว
              </span>
              <span className="text-xl font-semibold">{stats.fulfilled.toLocaleString("th-TH")}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
