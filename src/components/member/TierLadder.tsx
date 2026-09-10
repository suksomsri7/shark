// TierLadder.tsx — บันไดระดับสมาชิก (M1.10 · ภาพ 04 หัวหน้า /tiers)
// การ์ด 1 ใบ/ระดับ: สี TagColor · จำนวนคน · สิทธิประโยชน์ 3 ข้อแรก · เลือกดูกฎของระดับนี้ (?tier=id)
// OWNER/MANAGER (canManage): ปุ่มเพิ่มระดับ (tiers-add) · ปุ่มเลื่อนลำดับซ้าย/ขวา (reorderTierDefsAction) ·
// เก็บเข้าคลัง (archiveTierDefAction + เลือก moveToTierId) — STAFF อ่านอย่างเดียว: ไม่เห็นปุ่มเหล่านี้เลย
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MemberIcon } from "./MemberIcon";
import { TierChip } from "./TierChip";
import { archiveTierDefAction, createTierDefAction, reorderTierDefsAction } from "@/lib/modules/member/tiers-actions";
import { MEMBER_LIMITS } from "@/lib/modules/member/limits";
import type { TierBenefitDto, TierDefDto } from "@/lib/modules/member/tiers";

const TAG_COLORS = ["SLATE", "BLUE", "GREEN", "AMBER", "RED", "PURPLE"] as const;

function shortBenefit(b: TierBenefitDto): string | null {
  const c = b.config as Record<string, unknown>;
  switch (b.type) {
    case "DISCOUNT_PCT":
      return `ส่วนลด ${Number(c.pct ?? 0)}%`;
    case "DISCOUNT_FIXED":
      return `ส่วนลด ฿${Math.round(Number(c.satang ?? 0) / 100).toLocaleString("th-TH")}`;
    case "POINT_MULTIPLIER":
      return `แต้ม ×${Number(c.x ?? 1)}`;
    case "WELCOME_VOUCHER":
      return "voucher ต้อนรับ";
    case "BIRTHDAY_GIFT":
      return "ของขวัญวันเกิด";
    case "FREE_SERVICE":
      return "บริการฟรี";
    case "PRIORITY_BOOKING":
      return "จองก่อนใคร";
    case "NO_POINT_EXPIRY":
      return "แต้มไม่หมดอายุ";
    case "CANCEL_FEE_DISCOUNT":
      return `ยกเลิกลด ${Number(c.pct ?? 0)}%`;
    case "EXCLUSIVE_ITEMS":
      return "สินค้าเฉพาะระดับ";
    default:
      return null;
  }
}

function AddTierForm({ systemId, onDone }: { systemId: string; onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState<(typeof TAG_COLORS)[number]>("BLUE");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const submit = () => {
    setErr(null);
    startTransition(async () => {
      const key = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+/, "")
        .replace(/^([0-9])/, "t$1");
      if (!key || !name.trim()) {
        setErr("กรอกชื่อระดับก่อน");
        return;
      }
      const res = await createTierDefAction(systemId, { key, name: name.trim(), color });
      if (!res.ok) {
        setErr(res.reason);
        return;
      }
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3" style={{ borderColor: "var(--color-line)", minWidth: 200 }}>
      <input
        placeholder="ชื่อระดับใหม่ เช่น Diamond"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-lg border px-2 py-1.5 text-sm"
        style={{ borderColor: "var(--color-line)" }}
      />
      <div className="flex gap-1.5">
        {TAG_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            onClick={() => setColor(c)}
            className="h-6 w-6 rounded-full border-2"
            style={{ background: `var(--color-tag-${c.toLowerCase()})`, borderColor: color === c ? "var(--color-ink)" : "transparent" }}
          />
        ))}
      </div>
      {err && <span className="text-xs" style={{ color: "var(--color-danger)" }}>{err}</span>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-ghost text-xs" onClick={onDone}>
          ยกเลิก
        </button>
        <button type="button" className="btn btn-primary text-xs" disabled={pending} onClick={submit}>
          {pending ? "กำลังเพิ่ม…" : "เพิ่มระดับ"}
        </button>
      </div>
    </div>
  );
}

function ArchiveDialog({ systemId, tier, others, onDone }: { systemId: string; tier: TierDefDto; others: TierDefDto[]; onDone: () => void }) {
  const router = useRouter();
  const [moveToTierId, setMoveToTierId] = useState(others[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onDone}>
      <div className="w-full max-w-sm rounded-2xl bg-[color:var(--color-surface)] p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">เก็บระดับ &quot;{tier.name}&quot; เข้าคลัง?</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
          สมาชิก {tier.memberCount} คนในระดับนี้จะถูกย้ายไปยังระดับที่เลือก
        </p>
        <label className="mt-3 flex flex-col gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
          ย้ายสมาชิกไปยังระดับ
          <select value={moveToTierId} onChange={(e) => setMoveToTierId(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm text-[color:var(--color-ink)]" style={{ borderColor: "var(--color-line)" }}>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {err && <p className="mt-2 text-xs" style={{ color: "var(--color-danger)" }}>{err}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn btn-ghost text-sm" onClick={onDone}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn btn-primary text-sm"
            style={{ background: "var(--color-danger)" }}
            disabled={pending || !moveToTierId}
            onClick={() =>
              startTransition(async () => {
                const res = await archiveTierDefAction(systemId, tier.id, moveToTierId);
                if (!res.ok) {
                  setErr(res.reason);
                  return;
                }
                onDone();
                router.refresh();
              })
            }
          >
            {pending ? "กำลังเก็บ…" : "ยืนยันเก็บเข้าคลัง"}
          </button>
        </div>
      </div>
    </div>
  );
}

export type TierLadderProps = {
  systemId: string;
  tiers: TierDefDto[];
  selectedTierId: string | null;
  canManage: boolean;
};

/** บันไดระดับสมาชิก — คลิกการ์ดเพื่อเลือกดูกฎของระดับนั้น (`tiers-ladder` · การ์ด `tiers-tier-{key}`) */
export function TierLadder({ systemId, tiers, selectedTierId, canManage }: TierLadderProps) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [archiving, setArchiving] = useState<TierDefDto | null>(null);
  const [pending, startTransition] = useTransition();
  const atLimit = tiers.length >= MEMBER_LIMITS.tiers;

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= tiers.length) return;
    const ids = tiers.map((t) => t.id);
    [ids[idx], ids[target]] = [ids[target]!, ids[idx]!];
    startTransition(async () => {
      await reorderTierDefsAction(systemId, ids);
      router.refresh();
    });
  };

  return (
    <div data-testid="tiers-ladder" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-stretch gap-3">
        {tiers.map((t, idx) => {
          const benefits = t.benefits.filter((b) => b.active).slice(0, 3).map(shortBenefit).filter(Boolean) as string[];
          const active = t.id === selectedTierId;
          return (
            <div
              key={t.id}
              data-testid={`tiers-tier-${t.key}`}
              className="relative flex min-w-[210px] flex-1 flex-col gap-2 rounded-2xl border p-4"
              style={{ borderColor: active ? "var(--color-accent)" : "var(--color-line)", boxShadow: active ? "0 0 0 1px var(--color-accent)" : undefined }}
            >
              <Link href={`?tier=${t.id}`} scroll={false} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <TierChip name={t.name} color={t.color} />
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {t.memberCount.toLocaleString("th-TH")} คน
                  </span>
                </div>
                <ul className="flex flex-col gap-0.5 text-xs" style={{ color: "var(--color-muted)" }}>
                  {benefits.length === 0 && <li>ไม่มีสิทธิพิเศษ</li>}
                  {benefits.map((b, i) => (
                    <li key={i}>· {b}</li>
                  ))}
                </ul>
              </Link>
              <Link href={`/app/sys/${systemId}/member/tiers/${t.id}`} className="text-xs" style={{ color: "var(--color-accent)" }}>
                แก้ไขสิทธิประโยชน์ ›
              </Link>
              {canManage && (
                <div className="flex items-center gap-1 border-t pt-2" style={{ borderColor: "var(--color-line)" }}>
                  <button type="button" aria-label="เลื่อนลำดับไปทางซ้าย" disabled={pending || idx === 0} onClick={() => move(idx, -1)} style={{ color: "var(--color-muted)" }}>
                    <MemberIcon name="back" size="xs" />
                  </button>
                  <button
                    type="button"
                    aria-label="เลื่อนลำดับไปทางขวา"
                    disabled={pending || idx === tiers.length - 1}
                    onClick={() => move(idx, 1)}
                    style={{ color: "var(--color-muted)", transform: "rotate(180deg)" }}
                  >
                    <MemberIcon name="back" size="xs" />
                  </button>
                  <span className="flex-1" />
                  {!t.isDefault && (
                    <button type="button" aria-label="เก็บระดับนี้เข้าคลัง" onClick={() => setArchiving(t)} style={{ color: "var(--color-muted)" }}>
                      <MemberIcon name="archive" size="xs" />
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {canManage && !adding && (
          <button
            type="button"
            data-testid="tiers-add"
            disabled={atLimit}
            title={atLimit ? `ครบเพดาน ${MEMBER_LIMITS.tiers} ระดับแล้ว` : "เพิ่มระดับใหม่"}
            onClick={() => setAdding(true)}
            className="flex min-w-[140px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed text-sm"
            style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}
          >
            <MemberIcon name="plus" />
            เพิ่มระดับ
          </button>
        )}
        {canManage && adding && <AddTierForm systemId={systemId} onDone={() => setAdding(false)} />}
      </div>

      {archiving && (
        <ArchiveDialog
          systemId={systemId}
          tier={archiving}
          others={tiers.filter((t) => t.id !== archiving.id)}
          onDone={() => setArchiving(null)}
        />
      )}
    </div>
  );
}

export default TierLadder;
