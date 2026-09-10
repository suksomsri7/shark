// PointSettingsForm.tsx — หน้าตั้งค่าแต้ม (M2.2 · ภาพ ledger/design-member/16-point-settings.png)
//
// 5 การ์ด (ก)-(จ) ตามมอคอัป + การ์ด "ผลกระทบ" ด้านขวา — ปุ่ม "บันทึก" เดียวบันทึกทุกช่องของ (ก)-(จ)
// ยกเว้นตาราง "กฎเพิ่ม" ของ (ก) ที่เป็นคนละ entity (PointRule) — บันทึกทันทีต่อรายการ
//
// 🔴 ตีกลับรอบ 1 (Fable): ตาราง "กฎเพิ่ม" ต้องมี 5 แถวเสมอ (ตัวคูณระดับ/สินค้า-หมวด/ช่วงเวลา/เหตุการณ์/เพดานวัน)
//    แต่ละแถวแก้ผ่าน picker จริง (ชื่อระดับ/ชื่อสินค้า/ชื่อหมวด — ไม่ใช่ id ดิบ) · แถวที่ยังไม่ตั้งโชว์ "ยังไม่ได้ตั้ง"
//    สีจาง + สวิตช์ปิด · ปุ่มยกเลิก/บันทึกย้ายขึ้นมุมขวาบนของหน้าให้ตรงภาพ (คงปุ่มล่างไว้ด้วยเพื่อความสะดวก)
// 🔴 ไม่มีอีโมจิ/hex สี — ใช้ MemberIcon + โทเคนสี var(--color-*) ทั้งหมด
"use client";

import { useState, useTransition } from "react";
import { formatBaht } from "@/lib/ui/money";
import { MemberIcon } from "./MemberIcon";
import { saveExtrasAction, saveSettingsAction, togglePointRuleAction, upsertPointRuleAction, deletePointRuleAction } from "@/lib/modules/point/points-actions";
import type { PointExtras, PointImpactPreview } from "@/lib/modules/point";

type RuleRow = { id: string; kind: string; config: Record<string, unknown>; priority: number; active: boolean };
type RuleKind = "TIER_MULTIPLIER" | "CATEGORY_BONUS" | "ITEM_BONUS" | "TIME_MULTIPLIER" | "EVENT_BONUS";
type NamedOpt = { id: string; name: string };
type Settings = {
  satangPerPoint: number;
  earnBase: "NET" | "GROSS" | string;
  excludeGiftCard: boolean;
  excludeVoucher: boolean;
  expiryMode: "MONTHS" | "END_OF_YEAR" | "NEVER" | string;
  expiryMonths: number;
  remindDays: number[];
  burnRateSatang: number;
  burnMinPoints: number;
  burnMaxPct: number;
  transferEnabled: boolean;
  transferMonthlyCap: number | null;
  adjustApprovalOver: number | null;
  dailyCap: number | null;
};

const muted = "text-[color:var(--color-muted)]";
const DOW_LABEL = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const EVENT_DEFS: { key: string; label: string }[] = [
  { key: "SIGNUP", label: "สมัคร" },
  { key: "BIRTHDAY", label: "วันเกิด" },
  { key: "REVIEW", label: "รีวิว" },
  { key: "REFERRAL", label: "แนะนำ" },
  { key: "PROFILE_COMPLETE", label: "โปรไฟล์ครบ" },
  { key: "CHECKIN", label: "เช็คอิน" },
];

function nameOf(opts: NamedOpt[], id: string): string {
  return opts.find((o) => o.id === id)?.name ?? "(ลบไปแล้ว)";
}
function objectOf(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function numOf(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
function strsOf(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function Card({ icon, title, testId, children, actions }: { icon: string; title: string; testId: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div data-testid={testId} className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MemberIcon name={icon} />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

function Switch({ on, label, onToggle, disabled }: { on: boolean; label: string; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      disabled={disabled}
      className="rounded-full px-3 py-1 text-xs disabled:opacity-40"
      style={{ border: "1px solid var(--color-line)", background: on ? "var(--color-ink)" : "var(--color-surface-2)", color: on ? "var(--color-surface)" : "var(--color-muted)" }}
    >
      {on ? "เปิดอยู่" : "ปิดอยู่"}
    </button>
  );
}

// ───────────────────────── สรุปข้อความต่อชนิดกฎ (ไม่เห็น id ดิบ) ─────────────────────────

function tierMultiplierText(rows: RuleRow[], tiers: NamedOpt[]): { cond: string; result: string } {
  if (rows.length === 0) return { cond: "ยังไม่ได้ตั้ง", result: "—" };
  const cond = rows.map((r) => `${nameOf(tiers, String(objectOf(r.config).tierDefId ?? ""))} ×${numOf(objectOf(r.config).x)}`).join(" · ");
  return { cond, result: "ตามระดับ" };
}

function bonusText(rows: RuleRow[], categories: NamedOpt[], items: NamedOpt[]): { cond: string; result: string } {
  if (rows.length === 0) return { cond: "ยังไม่ได้ตั้ง", result: "—" };
  const parts = rows.map((r) => {
    const c = objectOf(r.config);
    if (r.kind === "ITEM_BONUS") {
      const names = strsOf(c.itemIds).map((id) => nameOf(items, id)).join(", ");
      return { cond: `${names || "(ไม่มีสินค้า)"} สำเร็จ`, result: `+${numOf(c.points)} แต้ม/ชิ้น` };
    }
    const names = strsOf(c.categoryIds).map((id) => nameOf(categories, id)).join(", ");
    const result = c.x !== undefined ? `×${numOf(c.x)}` : `+${numOf(c.points)} แต้ม`;
    return { cond: names || "(ไม่มีหมวด)", result };
  });
  return { cond: parts.map((p) => p.cond).join(" · "), result: parts.map((p) => p.result).join(" · ") };
}

function timeText(rows: RuleRow[]): { cond: string; result: string } {
  if (rows.length === 0) return { cond: "ยังไม่ได้ตั้ง", result: "—" };
  const parts = rows.map((r) => {
    const c = objectOf(r.config);
    const dow = strsOf((c.dow as unknown[])?.map(String)).length ? (c.dow as number[]) : [];
    const days = Array.isArray(c.dow) ? (c.dow as number[]).map((d) => DOW_LABEL[d] ?? "?").join("") : dow.join("");
    return { cond: `${days || "ทุกวัน"} ${c.from ?? "?"}–${c.to ?? "?"} น.`, result: `×${numOf(c.x)}` };
  });
  return { cond: parts.map((p) => p.cond).join(" · "), result: parts.map((p) => p.result).join(" · ") };
}

function eventText(rows: RuleRow[]): { cond: string; result: string } {
  const set = rows.filter((r) => r.active !== undefined);
  if (set.length === 0) return { cond: "ยังไม่ได้ตั้ง", result: "—" };
  const cond = EVENT_DEFS.map((e) => {
    const row = set.find((r) => objectOf(r.config).event === e.key);
    if (!row) return null;
    return `${e.label} ${numOf(objectOf(row.config).points)}`;
  })
    .filter(Boolean)
    .join(" · ");
  return { cond: cond || "ยังไม่ได้ตั้ง", result: "คงที่" };
}

// ───────────────────────── แถวกฎ (คลิก "แก้ไข" → แผงเล็กด้วย picker จริง) ─────────────────────────

function RuleGroupRow({
  label,
  cond,
  result,
  active,
  hasAny,
  onToggleAll,
  editing,
  onToggleEdit,
  children,
}: {
  label: string;
  cond: string;
  result: string;
  active: boolean;
  hasAny: boolean;
  onToggleAll: () => void;
  editing: boolean;
  onToggleEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr>
        <td className="border-b px-3 py-2">{label}</td>
        <td className={`border-b px-3 py-2 text-xs ${hasAny ? "" : muted}`}>{cond}</td>
        <td className="border-b px-3 py-2 tabular-nums">{result}</td>
        <td className="border-b px-3 py-2">
          <div className="flex items-center gap-2">
            <Switch on={active} label={`เปิด/ปิด ${label}`} onToggle={onToggleAll} disabled={!hasAny} />
            <button type="button" onClick={onToggleEdit} className="text-xs underline">
              {editing ? "ปิด" : "แก้ไข"}
            </button>
          </div>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={4} className="border-b bg-[color:var(--color-surface-2)] px-3 py-3">
            {children}
          </td>
        </tr>
      )}
    </>
  );
}

function RuleList({ rows, describe, onDelete, onToggle }: { rows: RuleRow[]; describe: (r: RuleRow) => string; onDelete: (id: string) => void; onToggle: (id: string, active: boolean) => void }) {
  if (rows.length === 0) return <p className={`text-xs ${muted}`}>ยังไม่มีรายการ</p>;
  return (
    <div className="flex flex-col gap-1">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs">
          <span>{describe(r)}</span>
          <div className="flex items-center gap-2">
            <Switch on={r.active} label="เปิด/ปิดรายการนี้" onToggle={() => onToggle(r.id, !r.active)} />
            <button type="button" onClick={() => onDelete(r.id)} className="text-[color:var(--color-danger)] underline">
              ลบ
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PointSettingsForm({
  systemId,
  settings: initialSettings,
  extras: initialExtras,
  rules: initialRules,
  tiers,
  tierChips,
  categories,
  items,
  impact,
}: {
  systemId: string;
  settings: Settings;
  extras: PointExtras;
  rules: RuleRow[];
  tiers: NamedOpt[];
  tierChips: NamedOpt[];
  categories: NamedOpt[];
  items: NamedOpt[];
  impact: PointImpactPreview;
}) {
  const [s, setS] = useState(initialSettings);
  const [ex, setEx] = useState(initialExtras);
  const [rules, setRules] = useState(initialRules);
  const [approvalOn, setApprovalOn] = useState(initialSettings.adjustApprovalOver !== null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<"" | "TIER" | "BONUS" | "TIME" | "EVENT">("");

  const save = () => {
    setErr(null);
    setMsg(null);
    startTransition(async () => {
      const r1 = await saveSettingsAction({
        systemId,
        satangPerPoint: s.satangPerPoint,
        earnBase: s.earnBase as "NET" | "GROSS",
        excludeGiftCard: s.excludeGiftCard,
        excludeVoucher: s.excludeVoucher,
        expiryMode: s.expiryMode as "MONTHS" | "END_OF_YEAR" | "NEVER",
        expiryMonths: s.expiryMonths,
        remindDays: s.remindDays,
        burnRateSatang: s.burnRateSatang,
        burnMinPoints: s.burnMinPoints,
        burnMaxPct: s.burnMaxPct,
        transferEnabled: s.transferEnabled,
        transferMonthlyCap: s.transferMonthlyCap,
        adjustApprovalOver: approvalOn ? s.adjustApprovalOver : null,
        dailyCap: s.dailyCap,
      });
      if (!r1.ok) {
        setErr(r1.reason);
        return;
      }
      const r2 = await saveExtrasAction({ systemId, ...ex });
      if (!r2.ok) {
        setErr(r2.reason);
        return;
      }
      setEx(r2.data);
      setMsg("บันทึกการตั้งค่าแต้มแล้ว");
    });
  };

  const upsert = (input: { id?: string; kind: RuleKind; config: Record<string, unknown>; active?: boolean }) => {
    startTransition(async () => {
      const r = await upsertPointRuleAction({ systemId, id: input.id, kind: input.kind, config: input.config, active: input.active ?? true });
      if (!r.ok) {
        setErr(r.reason);
        return;
      }
      setRules((prev) => {
        const row: RuleRow = { id: r.data.id, kind: r.data.kind, config: r.data.config, priority: r.data.priority, active: r.data.active };
        return prev.some((x) => x.id === row.id) ? prev.map((x) => (x.id === row.id ? row : x)) : [...prev, row];
      });
    });
  };
  const remove = (id: string) => {
    startTransition(async () => {
      const r = await deletePointRuleAction({ systemId, id });
      if (r.ok) setRules((prev) => prev.filter((x) => x.id !== id));
    });
  };
  const toggle = (id: string, active: boolean) => {
    startTransition(async () => {
      const r = await togglePointRuleAction({ systemId, id, active });
      if (r.ok) setRules((prev) => prev.map((x) => (x.id === id ? { ...x, active } : x)));
    });
  };
  const toggleAll = (rows: RuleRow[]) => {
    const nextActive = !rows.some((r) => r.active);
    for (const r of rows) if (r.active !== nextActive) toggle(r.id, nextActive);
  };

  const tierRules = rules.filter((r) => r.kind === "TIER_MULTIPLIER");
  const bonusRules = rules.filter((r) => r.kind === "CATEGORY_BONUS" || r.kind === "ITEM_BONUS");
  const timeRules = rules.filter((r) => r.kind === "TIME_MULTIPLIER");
  const eventRules = rules.filter((r) => r.kind === "EVENT_BONUS");

  const tierT = tierMultiplierText(tierRules, tiers);
  const bonusT = bonusText(bonusRules, categories, items);
  const timeT = timeText(timeRules);
  const eventT = eventText(eventRules);

  // ── (ก) แถวตัวคูณระดับ — เพิ่มทีละระดับ ──
  const [tierPick, setTierPick] = useState("");
  const [tierX, setTierX] = useState("");
  const addTierRule = () => {
    if (!tierPick || !tierX) return;
    const existing = tierRules.find((r) => objectOf(r.config).tierDefId === tierPick);
    upsert({ id: existing?.id, kind: "TIER_MULTIPLIER", config: { tierDefId: tierPick, x: Number(tierX) } });
    setTierPick("");
    setTierX("");
  };

  // ── (ก) แถวสินค้า/หมวด ──
  const [bonusType, setBonusType] = useState<"ITEM" | "CATEGORY">("CATEGORY");
  const [bonusPick, setBonusPick] = useState("");
  const [bonusMode, setBonusMode] = useState<"points" | "x">("points");
  const [bonusVal, setBonusVal] = useState("");
  const addBonusRule = () => {
    if (!bonusPick || !bonusVal) return;
    if (bonusType === "ITEM") {
      upsert({ kind: "ITEM_BONUS", config: { itemIds: [bonusPick], points: Number(bonusVal) } });
    } else {
      upsert({ kind: "CATEGORY_BONUS", config: { categoryIds: [bonusPick], [bonusMode]: Number(bonusVal) } });
    }
    setBonusPick("");
    setBonusVal("");
  };

  // ── (ก) แถวช่วงเวลา ──
  const [dow, setDow] = useState<number[]>([5]);
  const [tFrom, setTFrom] = useState("17:00");
  const [tTo, setTTo] = useState("19:00");
  const [tX, setTX] = useState("2");
  const addTimeRule = () => {
    if (dow.length === 0) return;
    upsert({ kind: "TIME_MULTIPLIER", config: { dow, from: tFrom, to: tTo, x: Number(tX) } });
  };

  // ── (ก) แถวเหตุการณ์ — เมทริกซ์ 6 ช่องเสมอ ──
  const [eventVals, setEventVals] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const e of EVENT_DEFS) {
      const row = eventRules.find((r) => objectOf(r.config).event === e.key);
      out[e.key] = row ? String(numOf(objectOf(row.config).points)) : "";
    }
    return out;
  });
  const saveEvents = () => {
    for (const e of EVENT_DEFS) {
      const existing = eventRules.find((r) => objectOf(r.config).event === e.key);
      const val = eventVals[e.key]?.trim();
      if (val) {
        upsert({ id: existing?.id, kind: "EVENT_BONUS", config: { event: e.key, points: Number(val) } });
      } else if (existing) {
        remove(existing.id);
      }
    }
  };

  const bahtPerPoint = s.satangPerPoint / 100;

  return (
    <div className="flex flex-col gap-4">
      {/* ปุ่มยกเลิก/บันทึกมุมขวาบนของหน้า (ตรงภาพ 16) — คงปุ่มล่างไว้ด้วยเพื่อความสะดวกหน้ายาว */}
      <div className="flex items-center justify-end gap-2">
        <button type="button" className="btn btn-ghost text-sm">
          ยกเลิก
        </button>
        <button type="button" data-testid="points-settings-save" onClick={save} disabled={pending} className="btn btn-primary text-sm disabled:opacity-50">
          {pending ? "กำลังบันทึก…" : "บันทึก"}
        </button>
      </div>

      {/* ตีกลับรอบ 2: มือถือ (< md) ยุบเป็นคอลัมน์เดียว — การ์ดผลกระทบเป็น item ที่ 2 ⇒ ไหลไปอยู่ล่างสุดเต็มความกว้าง
          โดยอัตโนมัติเมื่อ grid เหลือคอลัมน์เดียว (ไม่ต้องจัดลำดับใหม่) · md ขึ้นไปกลับเป็น 2 คอลัมน์เหมือนเดิม
          (แบบเดียวกับ tiers/page.tsx ที่ใช้ grid-cols-1 + breakpoint:grid-cols-[1fr_280px] อยู่แล้วในโมดูลนี้) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_280px]">
      <div data-testid="points-settings" className="flex flex-col gap-4">
        {/* (ก) กฎการได้แต้ม */}
        <Card icon="bolt" title="(ก) กฎการได้แต้ม" testId="points-settings-earn">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>ทุก</span>
            <input
              className="input w-20 min-h-[40px]"
              inputMode="decimal"
              value={bahtPerPoint}
              onChange={(e) => setS({ ...s, satangPerPoint: Math.max(1, Math.round(Number(e.target.value || 0) * 100)) })}
            />
            <span>บาท = 1 แต้ม · นับจาก</span>
            <select className="input min-h-[40px]" value={s.earnBase} onChange={(e) => setS({ ...s, earnBase: e.target.value })}>
              <option value="NET">ยอดหลังหักส่วนลด</option>
              <option value="GROSS">ยอดเต็มก่อนหักส่วนลด</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={s.excludeGiftCard} onChange={(e) => setS({ ...s, excludeGiftCard: e.target.checked })} />
            ไม่ให้แต้มกับส่วนที่จ่ายด้วย gift card
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked={s.excludeVoucher} onChange={(e) => setS({ ...s, excludeVoucher: e.target.checked })} />
            ไม่ให้แต้มกับส่วนที่จ่ายด้วย voucher
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5" checked disabled />
            ไม่ให้แต้มกับส่วนที่จ่ายด้วยแต้ม (บังคับเสมอ)
          </label>

          <div data-testid="points-settings-rules" className="flex flex-col gap-2">
            <div className={`text-xs font-medium ${muted}`}>กฎเพิ่ม</div>
            {/* ตีกลับรอบ 2: ห้ามบีบคอลัมน์บนมือถือ — ตั้ง minWidth แล้วให้กล่องนอกเลื่อนแนวนอนแทน */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-sm" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th className={`border-b px-3 py-2 text-left text-xs ${muted}`}>กฎเพิ่ม</th>
                    <th className={`border-b px-3 py-2 text-left text-xs ${muted}`}>เงื่อนไข</th>
                    <th className={`border-b px-3 py-2 text-left text-xs ${muted}`}>ผล</th>
                    <th className={`border-b px-3 py-2 text-left text-xs ${muted}`}>เปิด</th>
                  </tr>
                </thead>
                <tbody>
                  <RuleGroupRow
                    label="ตัวคูณระดับ"
                    cond={tierT.cond}
                    result={tierT.result}
                    active={tierRules.some((r) => r.active)}
                    hasAny={tierRules.length > 0}
                    onToggleAll={() => toggleAll(tierRules)}
                    editing={editingRow === "TIER"}
                    onToggleEdit={() => setEditingRow(editingRow === "TIER" ? "" : "TIER")}
                  >
                    <div className="flex flex-col gap-2">
                      <RuleList rows={tierRules} describe={(r) => `${nameOf(tiers, String(objectOf(r.config).tierDefId ?? ""))} ×${numOf(objectOf(r.config).x)}`} onDelete={remove} onToggle={toggle} />
                      <div className="flex flex-wrap items-end gap-2">
                        <select className="input min-h-[36px]" value={tierPick} onChange={(e) => setTierPick(e.target.value)}>
                          <option value="">เลือกระดับ</option>
                          {tiers.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                        <input className="input min-h-[36px] w-24" placeholder="ตัวคูณ เช่น 1.5" value={tierX} onChange={(e) => setTierX(e.target.value)} />
                        <button type="button" onClick={addTierRule} className="btn btn-ghost text-xs">+ เพิ่ม</button>
                      </div>
                    </div>
                  </RuleGroupRow>

                  <RuleGroupRow
                    label="สินค้า/หมวด"
                    cond={bonusT.cond}
                    result={bonusT.result}
                    active={bonusRules.some((r) => r.active)}
                    hasAny={bonusRules.length > 0}
                    onToggleAll={() => toggleAll(bonusRules)}
                    editing={editingRow === "BONUS"}
                    onToggleEdit={() => setEditingRow(editingRow === "BONUS" ? "" : "BONUS")}
                  >
                    <div className="flex flex-col gap-2">
                      <RuleList
                        rows={bonusRules}
                        describe={(r) => {
                          const c = objectOf(r.config);
                          if (r.kind === "ITEM_BONUS") return `${strsOf(c.itemIds).map((id) => nameOf(items, id)).join(", ")} · +${numOf(c.points)} แต้ม/ชิ้น`;
                          const names = strsOf(c.categoryIds).map((id) => nameOf(categories, id)).join(", ");
                          return `${names} · ${c.x !== undefined ? `×${numOf(c.x)}` : `+${numOf(c.points)} แต้ม`}`;
                        }}
                        onDelete={remove}
                        onToggle={toggle}
                      />
                      <div className="flex flex-wrap items-end gap-2">
                        <select className="input min-h-[36px]" value={bonusType} onChange={(e) => { setBonusType(e.target.value as "ITEM" | "CATEGORY"); setBonusPick(""); }}>
                          <option value="CATEGORY">หมวด</option>
                          <option value="ITEM">สินค้า</option>
                        </select>
                        <select className="input min-h-[36px]" value={bonusPick} onChange={(e) => setBonusPick(e.target.value)}>
                          <option value="">{bonusType === "ITEM" ? "เลือกสินค้า" : "เลือกหมวด"}</option>
                          {(bonusType === "ITEM" ? items : categories).map((o) => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                          ))}
                        </select>
                        {bonusType === "CATEGORY" && (
                          <select className="input min-h-[36px]" value={bonusMode} onChange={(e) => setBonusMode(e.target.value as "points" | "x")}>
                            <option value="points">แต้มคงที่</option>
                            <option value="x">ตัวคูณ</option>
                          </select>
                        )}
                        <input className="input min-h-[36px] w-24" placeholder={bonusMode === "x" && bonusType === "CATEGORY" ? "เช่น 2" : "เช่น 200"} value={bonusVal} onChange={(e) => setBonusVal(e.target.value)} />
                        <button type="button" onClick={addBonusRule} className="btn btn-ghost text-xs">+ เพิ่ม</button>
                      </div>
                      {(bonusType === "ITEM" ? items : categories).length === 0 && (
                        <p className={`text-xs ${muted}`}>ยังไม่มีแคตตาล็อกสินค้า/หมวดที่ผูกกับสาขานี้ — เพิ่มที่โมดูลคลังสินค้าก่อน</p>
                      )}
                    </div>
                  </RuleGroupRow>

                  <RuleGroupRow
                    label="ช่วงเวลา"
                    cond={timeT.cond}
                    result={timeT.result}
                    active={timeRules.some((r) => r.active)}
                    hasAny={timeRules.length > 0}
                    onToggleAll={() => toggleAll(timeRules)}
                    editing={editingRow === "TIME"}
                    onToggleEdit={() => setEditingRow(editingRow === "TIME" ? "" : "TIME")}
                  >
                    <div className="flex flex-col gap-2">
                      <RuleList rows={timeRules} describe={(r) => { const c = objectOf(r.config); const days = Array.isArray(c.dow) ? (c.dow as number[]).map((d) => DOW_LABEL[d] ?? "?").join("") : ""; return `${days} ${c.from}–${c.to} น. ×${numOf(c.x)}`; }} onDelete={remove} onToggle={toggle} />
                      <div className="flex flex-wrap items-center gap-1">
                        {DOW_LABEL.map((d, i) => (
                          <label key={i} className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={dow.includes(i)}
                              onChange={(e) => setDow(e.target.checked ? [...dow, i].sort() : dow.filter((x) => x !== i))}
                            />
                            {d}
                          </label>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <input type="time" className="input min-h-[36px]" value={tFrom} onChange={(e) => setTFrom(e.target.value)} />
                        <span className="text-xs">ถึง</span>
                        <input type="time" className="input min-h-[36px]" value={tTo} onChange={(e) => setTTo(e.target.value)} />
                        <input className="input min-h-[36px] w-20" placeholder="ตัวคูณ" value={tX} onChange={(e) => setTX(e.target.value)} />
                        <button type="button" onClick={addTimeRule} className="btn btn-ghost text-xs">+ เพิ่ม</button>
                      </div>
                    </div>
                  </RuleGroupRow>

                  <RuleGroupRow
                    label="เหตุการณ์"
                    cond={eventT.cond}
                    result={eventT.result}
                    active={eventRules.some((r) => r.active)}
                    hasAny={eventRules.length > 0}
                    onToggleAll={() => toggleAll(eventRules)}
                    editing={editingRow === "EVENT"}
                    onToggleEdit={() => setEditingRow(editingRow === "EVENT" ? "" : "EVENT")}
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        {EVENT_DEFS.map((e) => (
                          <label key={e.key} className="flex flex-col gap-1 text-xs">
                            {e.label}
                            <input
                              className="input min-h-[36px] w-24"
                              placeholder="0"
                              value={eventVals[e.key] ?? ""}
                              onChange={(ev) => setEventVals({ ...eventVals, [e.key]: ev.target.value })}
                            />
                          </label>
                        ))}
                      </div>
                      <div>
                        <button type="button" onClick={saveEvents} className="btn btn-ghost text-xs">บันทึกเหตุการณ์</button>
                      </div>
                    </div>
                  </RuleGroupRow>

                  <tr>
                    <td className="px-3 py-2">เพดาน/วัน</td>
                    <td className={`px-3 py-2 text-xs ${muted}`}>รวมทุกกฎต่อสมาชิก 1 คน</td>
                    <td className="px-3 py-2">
                      <input
                        className="input w-24 min-h-[36px]"
                        inputMode="numeric"
                        value={s.dailyCap ?? ""}
                        placeholder="ไม่จำกัด"
                        onChange={(e) => setS({ ...s, dailyCap: e.target.value ? Number(e.target.value) : null })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Switch on={s.dailyCap !== null} label="เปิด/ปิดเพดานต่อวัน" onToggle={() => setS({ ...s, dailyCap: s.dailyCap !== null ? null : 2000 })} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </Card>

        {/* (ข) แต้มหมดอายุ */}
        <Card icon="chart" title="(ข) แต้มหมดอายุ" testId="points-settings-expiry">
          <div className="flex flex-wrap gap-3 text-sm">
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              แบบ
              <select className="input min-h-[40px]" value={s.expiryMode} onChange={(e) => setS({ ...s, expiryMode: e.target.value })}>
                <option value="MONTHS">ล็อต FIFO — ตัดล็อตเก่าก่อน</option>
                <option value="END_OF_YEAR">สิ้นปีปฏิทินไทย</option>
                <option value="NEVER">ไม่หมดอายุ</option>
              </select>
            </label>
            {s.expiryMode === "MONTHS" && (
              <label className={`flex flex-col gap-1 text-xs ${muted}`}>
                อายุ (เดือน)
                <input className="input min-h-[40px] w-24" inputMode="numeric" value={s.expiryMonths} onChange={(e) => setS({ ...s, expiryMonths: Number(e.target.value || 1) })} />
              </label>
            )}
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              เตือนล่วงหน้า (วัน คั่นด้วยจุลภาค)
              <input
                className="input min-h-[40px] w-32"
                value={s.remindDays.join(",")}
                onChange={(e) => setS({ ...s, remindDays: e.target.value.split(",").map((v) => Number(v.trim())).filter((n) => Number.isFinite(n)) })}
              />
            </label>
          </div>
          {/* tierChips = ระดับที่มี TierBenefitType.NO_POINT_EXPIRY ใช้งานอยู่ (page.tsx กรองมาให้แล้ว)
              ตีกลับรอบ 1: ห้ามโชว์รหัส enum ดิบให้เจ้าของร้านเห็น — ใช้ชื่อระดับ/ประโยคไทยเท่านั้น */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={muted}>ระดับที่ไม่หมดอายุ:</span>
            {tierChips.length === 0 ? (
              <span className={`text-xs ${muted}`}>ยังไม่มี — ตั้งสิทธิ์ &quot;แต้มไม่หมดอายุ&quot; ได้ที่หน้าระดับสมาชิก</span>
            ) : (
              tierChips.map((t) => (
                <span key={t.id} className="rounded-full px-2 py-0.5 text-xs" style={{ border: "1px solid var(--color-accent)", color: "var(--color-accent)" }}>
                  {t.name}
                </span>
              ))
            )}
          </div>
        </Card>

        {/* (ค) การใช้แต้ม */}
        <Card icon="card" title="(ค) การใช้แต้ม" testId="points-settings-burn">
          <div className="flex flex-wrap gap-3 text-sm">
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              อัตรา (แต้ม = กี่บาท)
              <input
                className="input min-h-[40px] w-28"
                inputMode="decimal"
                value={s.burnRateSatang / 100}
                onChange={(e) => setS({ ...s, burnRateSatang: Math.max(1, Math.round(Number(e.target.value || 0) * 100)) })}
              />
            </label>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              ขั้นต่ำ (แต้ม)
              <input className="input min-h-[40px] w-24" inputMode="numeric" value={s.burnMinPoints} onChange={(e) => setS({ ...s, burnMinPoints: Number(e.target.value || 0) })} />
            </label>
            <label className={`flex flex-col gap-1 text-xs ${muted}`}>
              ใช้ได้สูงสุด (% ของบิล)
              <input className="input min-h-[40px] w-24" inputMode="numeric" value={s.burnMaxPct} onChange={(e) => setS({ ...s, burnMaxPct: Number(e.target.value || 0) })} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={muted}>ใช้ได้ที่</span>
            {(["POS", "BOOKING", "LIFF"] as const).map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={ex.burnAllowedAt.includes(k)}
                  onChange={(e) =>
                    setEx({
                      ...ex,
                      burnAllowedAt: e.target.checked ? [...ex.burnAllowedAt, k] : ex.burnAllowedAt.filter((v) => v !== k),
                    })
                  }
                />
                {k === "BOOKING" ? "จอง" : k}
              </label>
            ))}
          </div>
        </Card>

        {/* (ง) โอนแต้มระหว่างสมาชิก */}
        <Card icon="chat" title="(ง) โอนแต้มระหว่างสมาชิก" testId="points-settings-transfer">
          <div className="flex items-center justify-between text-sm">
            <span>เปิดใช้</span>
            <Switch on={s.transferEnabled} label="เปิดใช้โอนแต้ม" onToggle={() => setS({ ...s, transferEnabled: !s.transferEnabled })} />
          </div>
          <label className={`flex flex-col gap-1 text-xs ${muted}`}>
            ค่าธรรมเนียม (แต้ม)
            <input className="input min-h-[40px] w-full sm:w-28" inputMode="numeric" value={ex.transferFeePoints} onChange={(e) => setEx({ ...ex, transferFeePoints: Number(e.target.value || 0) })} />
          </label>
          <label className={`flex flex-col gap-1 text-xs ${muted}`}>
            จำกัด/เดือน (แต้ม/คน — ว่าง = ไม่จำกัด)
            <input
              className="input min-h-[40px] w-full sm:w-28"
              inputMode="numeric"
              value={s.transferMonthlyCap ?? ""}
              placeholder="ไม่จำกัด"
              onChange={(e) => setS({ ...s, transferMonthlyCap: e.target.value ? Number(e.target.value) : null })}
            />
          </label>
          <div className="flex items-center justify-between text-sm">
            <span>ต้องยืนยัน OTP</span>
            <Switch on={ex.requireOtp} label="ต้องยืนยัน OTP" onToggle={() => setEx({ ...ex, requireOtp: !ex.requireOtp })} />
          </div>
        </Card>

        {/* (จ) ปรับแต้มด้วยมือ */}
        <Card icon="lock" title="(จ) ปรับแต้มด้วยมือ" testId="points-settings-approval">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>เกิน</span>
            <input
              className="input w-full sm:w-28 min-h-[40px]"
              inputMode="numeric"
              value={s.adjustApprovalOver ?? ""}
              placeholder="ไม่จำกัด"
              onChange={(e) => setS({ ...s, adjustApprovalOver: e.target.value ? Number(e.target.value) : null })}
            />
            <span>แต้ม ต้องอนุมัติผ่านโมดูลอนุมัติ</span>
            <Switch on={approvalOn} label="ต้องอนุมัติเมื่อเกินเพดาน" onToggle={() => setApprovalOn((v) => !v)} />
          </div>
          <p className={`text-xs ${muted}`}>ปิดสวิตช์ = เจ้าของ/ผู้จัดการ/พนักงานปรับแต้มได้ทันทีไม่ว่าจำนวนเท่าไร</p>
        </Card>

        {err && <p className="text-sm text-[color:var(--color-danger)]">{err}</p>}
        {msg && <p className="text-sm">{msg}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost text-sm">
            ยกเลิก
          </button>
          <button type="button" onClick={save} disabled={pending} className="btn btn-primary text-sm disabled:opacity-50">
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </div>

      {/* การ์ดผลกระทบ */}
      <div data-testid="points-settings-impact" className="card flex h-fit flex-col gap-3 p-4">
        <div className="flex items-center gap-2">
          <MemberIcon name="chart" />
          <h2 className="text-sm font-semibold">ผลกระทบ</h2>
        </div>
        <p className={`text-xs ${muted}`}>ประมาณจากยอดจริงเดือนนี้</p>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between">
            <span className={muted}>แต้มออกเดือนละ</span>
            <span className="tabular-nums">~{impact.monthlyEarn.toLocaleString("th-TH")}</span>
          </div>
          <div className="flex justify-between">
            <span className={muted}>ต้นทุนโดยประมาณ</span>
            <span className="tabular-nums">~{formatBaht(impact.monthlyCostSatang)}</span>
          </div>
          <div className="flex justify-between">
            <span className={muted}>หนี้สินคงค้าง (บัญชี)</span>
            <span className="tabular-nums" style={{ color: "var(--color-danger)" }}>
              {formatBaht(impact.liabilitySatang)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className={muted}>จะหมดอายุใน 90 วันข้างหน้า</span>
            <span className="tabular-nums">{impact.expiringIn90d.toLocaleString("th-TH")} แต้ม</span>
          </div>
        </div>
        <p className={`text-xs ${muted}`}>คำนวณใหม่ทุกครั้งที่บันทึกการตั้งค่า — ใช้ตัดสินใจก่อนเปลี่ยนอัตรา</p>
      </div>
      </div>
    </div>
  );
}

export default PointSettingsForm;
