// TierRuleBuilder.tsx — ตัวสร้างกฎ "เลื่อน/คงระดับ" ของระบบสมาชิก v2 (M1.10 · ภาพ 04 · scope MEMBER_TIER)
//
// 🔴 พยายาม reuse `components/kanban/AutomationBuilder.tsx` แล้วไม่คุ้ม — ไฟล์นั้นผูกกับคำศัพท์ของบอร์ดงาน
//    ล้วน (คอลัมน์/ป้าย/ผู้ใช้/trigger เหตุการณ์บอร์ด) ไม่มี "scope" ให้สลับชุดฟิลด์ และแก้เพิ่ม prop
//    จะพา action ของบอร์ด (`createRuleAction` ฯลฯ) ผูกเข้ากับ schema `AutomationBuilder`/`conditions`
//    คนละรูปกับ `RuleInput` ของ `tiers.ts` (§5.4) จึงแยกไฟล์ใหม่ตามที่สัญญาเปิดทางไว้ — ใช้โทเคน/ปุ่ม
//    ("ครบทุกข้อ"/"ข้อใดข้อหนึ่ง" แทน "และ"/"หรือ") แนวเดียวกับ AutomationBuilder เพื่อความคุ้นชิน
//
// 🔴 หน่วยของ `spent12m`/`spent` ใน `TierEvidence` คือ **สตางค์** (ดูคอมเมนต์ tiers.ts) — ฟอร์มนี้แสดง/รับ
//    เป็น "บาท" แล้วคูณ/หาร 100 เองตอน submit/โหลด ไม่ให้ผู้ใช้กรอกสตางค์ (ยืนยันจากค่า seed: 30,000 บาท
//    เก็บเป็น RuleCondition.value = 3,000,000 — ดู ledger/wo-notes/member-M1.9.md §7)
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MemberIcon } from "./MemberIcon";
import { setTierRulesAction } from "@/lib/modules/member/tiers-actions";
import type { RuleCondition, RuleField, RuleInput, RuleOp, TierRulesDto } from "@/lib/modules/member/tiers";

const FIELD_LABELS: Record<RuleField, string> = {
  spent12m: "ยอดซื้อสะสม 12 เดือนย้อนหลัง (บาท)",
  spent: "ยอดซื้อสะสม — กำหนดช่วงเดือนเอง (บาท)",
  visits12m: "จำนวนครั้งซื้อ/จอง 12 เดือนย้อนหลัง",
  visits: "จำนวนครั้งซื้อ/จอง — กำหนดช่วงเดือนเอง",
  tierPoints: "แต้มสะสมระดับ",
  memberDays: "จำนวนวันที่เป็นสมาชิก",
  paidPlan: "สมัครแบบเสียเงินอยู่ตอนนี้",
  referrals: "จำนวนเพื่อนที่แนะนำสำเร็จ",
};
const FIELD_ORDER: RuleField[] = ["spent12m", "spent", "visits12m", "visits", "tierPoints", "memberDays", "paidPlan", "referrals"];
const OP_LABELS: Record<RuleOp, string> = { gte: "≥ มากกว่าหรือเท่ากับ", gt: "> มากกว่า", lte: "≤ น้อยกว่าหรือเท่ากับ", lt: "< น้อยกว่า", eq: "= เท่ากับ" };
const OP_ORDER: RuleOp[] = ["gte", "gt", "lte", "lt", "eq"];
const MONEY_FIELDS = new Set<RuleField>(["spent12m", "spent"]);
const WINDOW_FIELDS = new Set<RuleField>(["spent", "visits"]);

function emptyCondition(): RuleCondition {
  return { field: "spent12m", op: "gte", value: 0 };
}

function inputBox(): React.CSSProperties {
  return { borderRadius: 8, border: "1px solid var(--color-line)", padding: "5px 8px", fontSize: 13 };
}

function ConditionRow({
  cond,
  onChange,
  onRemove,
  disabled,
}: {
  cond: RuleCondition;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const isBoolean = cond.field === "paidPlan";
  const isMoney = MONEY_FIELDS.has(cond.field);
  const displayValue = typeof cond.value === "boolean" ? cond.value : isMoney ? Math.round((cond.value as number) / 100) : (cond.value as number);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--color-line)" }}>
      <select
        aria-label="ฟิลด์"
        disabled={disabled}
        value={cond.field}
        onChange={(e) => {
          const field = e.target.value as RuleField;
          onChange({ ...cond, field, value: field === "paidPlan" ? true : 0 });
        }}
        style={inputBox()}
      >
        {FIELD_ORDER.map((f) => (
          <option key={f} value={f}>
            {FIELD_LABELS[f]}
          </option>
        ))}
      </select>

      {!isBoolean && (
        <select aria-label="ตัวเปรียบเทียบ" disabled={disabled} value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value as RuleOp })} style={inputBox()}>
          {OP_ORDER.map((op) => (
            <option key={op} value={op}>
              {OP_LABELS[op]}
            </option>
          ))}
        </select>
      )}

      {isBoolean ? (
        <select
          aria-label="ค่า"
          disabled={disabled}
          value={cond.value === true ? "yes" : "no"}
          onChange={(e) => onChange({ ...cond, op: "eq", value: e.target.value === "yes" })}
          style={inputBox()}
        >
          <option value="yes">ใช่</option>
          <option value="no">ไม่ใช่</option>
        </select>
      ) : (
        <span className="flex items-center gap-1">
          {isMoney && <span style={{ color: "var(--color-muted)" }}>฿</span>}
          <input
            aria-label="ค่า"
            type="number"
            min={0}
            disabled={disabled}
            value={displayValue as number}
            onChange={(e) => {
              const raw = Math.max(0, Number(e.target.value) || 0);
              onChange({ ...cond, value: isMoney ? Math.round(raw * 100) : raw });
            }}
            style={{ ...inputBox(), width: 110 }}
          />
        </span>
      )}

      {WINDOW_FIELDS.has(cond.field) && (
        <span className="flex items-center gap-1 text-xs" style={{ color: "var(--color-muted)" }}>
          ย้อนหลัง
          <input
            aria-label="จำนวนเดือนย้อนหลัง (windowMonths)"
            type="number"
            min={1}
            max={60}
            disabled={disabled}
            value={cond.windowMonths ?? 12}
            onChange={(e) => onChange({ ...cond, windowMonths: Math.min(60, Math.max(1, Number(e.target.value) || 12)) })}
            style={{ ...inputBox(), width: 56 }}
          />
          เดือน
        </span>
      )}

      {!disabled && (
        <button type="button" onClick={onRemove} className="ml-auto" aria-label="ลบเงื่อนไขนี้" style={{ color: "var(--color-muted)" }}>
          <MemberIcon name="x" size="sm" />
        </button>
      )}
    </div>
  );
}

function ConditionGroup({
  testId,
  title,
  value,
  onChange,
  canManage,
  clearLabel,
}: {
  testId: string;
  title: string;
  value: RuleInput | null;
  onChange: (v: RuleInput | null) => void;
  canManage: boolean;
  clearLabel: string;
}) {
  const conditions = value?.conditions ?? [];
  const match = value?.match ?? "ALL";

  const set = (conds: RuleCondition[], m: "ALL" | "ANY" = match) => {
    onChange(conds.length === 0 ? null : { match: m, conditions: conds });
  };

  return (
    <div data-testid={testId} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg px-2 py-1 text-xs font-semibold" style={{ background: "var(--color-ink)", color: "var(--color-surface)" }}>
          {title}
        </span>
        {conditions.length >= 2 && (
          <div className="flex overflow-hidden rounded-lg border text-xs" style={{ borderColor: "var(--color-line)" }}>
            {(["ALL", "ANY"] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={!canManage}
                onClick={() => set(conditions, m)}
                className="px-2 py-1"
                style={m === match ? { background: "var(--color-accent-soft)", color: "var(--color-accent)", fontWeight: 600 } : { color: "var(--color-muted)" }}
              >
                {m === "ALL" ? "ครบทุกข้อ" : "ข้อใดข้อหนึ่ง"}
              </button>
            ))}
          </div>
        )}
        {conditions.length === 0 && <span className="text-xs" style={{ color: "var(--color-muted)" }}>{clearLabel}</span>}
      </div>

      {conditions.map((c, i) => (
        <ConditionRow
          key={i}
          cond={c}
          disabled={!canManage}
          onChange={(nc) => {
            const next = conditions.slice();
            next[i] = nc;
            set(next);
          }}
          onRemove={() => set(conditions.filter((_, j) => j !== i))}
        />
      ))}

      {canManage && (
        <button
          type="button"
          onClick={() => set([...conditions, emptyCondition()])}
          className="btn btn-ghost self-start text-xs"
        >
          <MemberIcon name="plus" size="xs" /> เพิ่มเงื่อนไข
        </button>
      )}
    </div>
  );
}

export type TierRuleBuilderProps = {
  systemId: string;
  tierDefId: string;
  tierName: string;
  lowerTierName: string | null;
  rules: TierRulesDto;
  canManage: boolean;
};

/** ตัวสร้างกฎเลื่อน/คงระดับของระดับที่เลือกอยู่ (`tiers-rule-builder` · ภาพ 04) */
export function TierRuleBuilder({ systemId, tierDefId, tierName, lowerTierName, rules, canManage }: TierRuleBuilderProps) {
  const router = useRouter();
  const [upgrade, setUpgrade] = useState<RuleInput | null>(rules.upgrade);
  const [keep, setKeep] = useState<RuleInput | null>(rules.keep);
  const [graceDays, setGraceDays] = useState(rules.graceDays);
  const [notifyBeforeDays, setNotifyBeforeDays] = useState(rules.notifyBeforeDays);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await setTierRulesAction(systemId, tierDefId, { upgrade, keep, reviewCron: rules.reviewCron ?? "0 3 1 * *", graceDays, notifyBeforeDays });
      if (!res.ok) {
        setMsg({ ok: false, text: res.reason });
        return;
      }
      setMsg({ ok: true, text: "บันทึกกฎแล้ว" });
      router.refresh();
    });
  };

  return (
    <div data-testid="tiers-rule-builder" className="flex flex-col gap-4 rounded-2xl border p-5" style={{ borderColor: "var(--color-line)" }}>
      <div className="flex items-center gap-2">
        <MemberIcon name="bolt" />
        <h2 className="text-sm font-semibold">กฎการเลื่อน / คงระดับ — {tierName}</h2>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>อ่านเป็นประโยคไทยได้ตรง ๆ</span>
      </div>

      <ConditionGroup
        testId="tiers-rule-upgrade"
        title={`เลื่อนเป็น ${tierName}`}
        value={upgrade}
        onChange={setUpgrade}
        canManage={canManage}
        clearLabel="ยังไม่ตั้งกฎเลื่อนเข้าระดับนี้ — ตั้งได้เฉพาะตอนสมัคร/ตั้งด้วยมือ"
      />

      <ConditionGroup
        testId="tiers-rule-keep"
        title={`คงระดับ ${tierName}`}
        value={keep}
        onChange={setKeep}
        canManage={canManage}
        clearLabel="ไม่ได้ตั้งกฎคงระดับ — จะใช้กฎเลื่อนเข้าระดับนี้เป็นเกณฑ์คงแทน"
      />

      {lowerTierName && (
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          ไม่ถึงเกณฑ์คง → ลดเป็น <strong>{lowerTierName}</strong> พร้อมแจ้งลูกค้าล่วงหน้า
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4 border-t pt-3 text-xs" style={{ borderColor: "var(--color-line)", color: "var(--color-muted)" }}>
        <span>ประเมิน: ทุกวันที่ 1 ของเดือน เวลา 03:00 (ตามเวลาไทย)</span>
        <label className="flex items-center gap-1">
          ผ่อนผัน
          <input
            type="number"
            min={0}
            max={365}
            disabled={!canManage}
            value={graceDays}
            onChange={(e) => setGraceDays(Math.min(365, Math.max(0, Number(e.target.value) || 0)))}
            style={{ ...inputBox(), width: 56 }}
          />
          วัน
        </label>
        <label className="flex items-center gap-1">
          แจ้งล่วงหน้า
          <input
            type="number"
            min={0}
            max={365}
            disabled={!canManage}
            value={notifyBeforeDays}
            onChange={(e) => setNotifyBeforeDays(Math.min(365, Math.max(0, Number(e.target.value) || 0)))}
            style={{ ...inputBox(), width: 56 }}
          />
          วัน
        </label>
      </div>

      {canManage && (
        <div className="flex items-center justify-end gap-2">
          {msg && <span className="text-xs" style={{ color: msg.ok ? "var(--color-accent)" : "var(--color-danger)" }}>{msg.text}</span>}
          <button type="button" className="btn btn-primary text-sm" disabled={pending} onClick={save}>
            {pending ? "กำลังบันทึก…" : "บันทึกกฎ"}
          </button>
        </div>
      )}
    </div>
  );
}

export default TierRuleBuilder;
