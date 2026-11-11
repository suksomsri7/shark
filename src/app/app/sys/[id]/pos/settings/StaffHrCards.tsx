"use client";

// StaffHrCards.tsx — POS P3.5U แท็บ "พนักงานและสิทธิ์" (ภาพ 17C) ส่วน HR: การ์ด "ด่านตารางงาน" + การ์ด "ค่าคอมฯ พนักงาน" (มติ 6 · CD-P35U-3)
//   ด่านตารางงาน: เข้าก่อน/ใช้ต่อหลังเลิก/ผู้จัดการอนุญาตได้นาน (นาที · ช่วง POS_SCHEDULE_GATE_LIMITS) + ถามลงเวลาเมื่อเปิด/ปิดกะ (ASK/OFF) →
//     updatePosStaffSettingsAction (เจ้าของร้านเท่านั้น · คนอื่นอ่านอย่างเดียว) · สวิตช์เปิด/ปิดด่านอยู่ที่การ์ด "พนักงานและ PIN" (pos-settings-staff-hr-switch)
//   ค่าคอมฯ: แสดงเฉพาะเมื่อหน้าส่ง config มา (ผู้ดูเงินเดือน canViewPayroll) · เปิด/ปิด · อัตราปกติ % · บทบาทที่ได้ · อัตรารายหมวด/รายสินค้า (% + บาทต่อชิ้น) →
//     updatePosStaffCommissionAction (ก้อนเดียวทั้งการ์ด) · "ส่งเข้างวดเงินเดือนตอนนี้" → syncStaffCommissionNowAction · W9 = ข้อความช่วยเท่านั้น
//   CD-P35U-3 → POS P4.3 ▸ F-P3-18 (CD-P43-O4): ชื่อหมวด/สินค้ามาจาก posCommissionCatalogAction (เจ้าของ/ผู้ดูเงินเดือน · ไม่ต้องมีสิทธิ์ขาย ·
//     รวมตัวแปรและสินค้าเฉพาะสาขาอื่น · หน้าละ ≤ 500) · อ่านไม่ได้ = จำนวนอัตรารายสินค้าแบบอ่านอย่างเดียว (แก้ได้แค่เปิด/ปิด · อัตราปกติ · บทบาท —
//     แถวเดิมส่งกลับตามเดิม) ◂
// 🔴 คำปฏิเสธ → ข้อความตาม field (scheduleGate.* · defaultBp · byCategory.<id> · byProduct.<id>) หรือ settingsRefusalMessageKey · ไม่มีข้อความไทยนอกคอมเมนต์ ·
//    testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px · ไม่มีตัวเลขค่าคอมฯ ที่จ่ายจริงในการ์ดนี้ (อัตราเท่านั้น · ยอดอยู่รายงาน 08 ผู้ดูเงินเดือน)

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { posCommissionCatalogAction, updatePosStaffCommissionAction, updatePosStaffSettingsAction } from "@/lib/modules/pos/settings-actions"; // POS P4.3 ▸ F-P3-18 + posCommissionCatalogAction ◂
import { syncStaffCommissionNowAction } from "@/lib/modules/pos/hr-link-actions";
import {
  POS_SCHEDULE_GATE_LIMITS,
  POS_STAFF_COMMISSION_LIMITS,
  POS_STAFF_ROLES,
  settingsRefusalMessageKey,
  type PosClockOnShift,
  type PosScheduleGate,
  type PosStaffCommissionConfig,
  type PosStaffCommissionRate,
  type PosStaffRole,
} from "@/lib/modules/pos/settings-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { CardHead, InlineNote, SettingsCard, SwitchKnob } from "./settings-ui";

type GateField = "earlyMin" | "lateMin" | "overrideTtlMin";
const GATE_FIELDS: GateField[] = ["earlyMin", "lateMin", "overrideTtlMin"];

/** ข้อความในช่อง → จำนวนเต็มในช่วง · ผิดรูป = null */
const intIn = (s: string, lim: { min: number; max: number }): number | null => {
  const v = s.trim();
  if (!/^\d{1,4}$/.test(v)) return null;
  const n = Number(v);
  return n >= lim.min && n <= lim.max ? n : null;
};
/** "12.5" (%) → bp 0–5000 · ว่าง = undefined · ผิดรูป = null */
const bpOf = (s: string): number | null | undefined => {
  const v = s.trim();
  if (!v) return undefined;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(v)) return null;
  const n = Math.round(Number(v) * 100);
  return n >= POS_STAFF_COMMISSION_LIMITS.bp.min && n <= POS_STAFF_COMMISSION_LIMITS.bp.max ? n : null;
};
/** "5.50" (บาทต่อชิ้น) → สตางค์ 0–100000 · ว่าง = undefined · ผิดรูป = null */
const satangOf = (s: string): number | null | undefined => {
  const v = s.trim().replace(/,/g, "");
  if (!v) return undefined;
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(v)) return null;
  const n = Math.round(Number(v) * 100);
  return n >= POS_STAFF_COMMISSION_LIMITS.fixedSatang.min && n <= POS_STAFF_COMMISSION_LIMITS.fixedSatang.max ? n : null;
};
const pctText = (bp: number | undefined) => (bp === undefined ? "" : (bp / 100).toLocaleString("en-US", { maximumFractionDigits: 2, useGrouping: false }));
const bahtText = (satang: number | undefined) => (satang === undefined ? "" : (satang / 100).toLocaleString("en-US", { maximumFractionDigits: 2, useGrouping: false }));

// ═══════════ ด่านตารางงาน ═══════════
export function ScheduleGateCard({
  systemId,
  isOwner,
  hrLinked,
  gate,
  clockOnShift,
  onSaved,
}: {
  systemId: string;
  isOwner: boolean;
  hrLinked: boolean;
  gate: PosScheduleGate;
  clockOnShift: PosClockOnShift;
  onSaved: (gate: PosScheduleGate, clockOnShift: PosClockOnShift) => void;
}) {
  const t = useTranslations("pos.settings");
  const tg = useTranslations("pos.settings.staff.scheduleGate");
  const [vals, setVals] = useState<Record<GateField, string>>({ earlyMin: String(gate.earlyMin), lateMin: String(gate.lateMin), overrideTtlMin: String(gate.overrideTtlMin) });
  const [clock, setClock] = useState<PosClockOnShift>(clockOnShift);
  const [fieldErr, setFieldErr] = useState<Partial<Record<GateField | "clockOnShift", string>>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(id);
  }, [saved]);

  const save = async () => {
    if (!isOwner || saving) return;
    const fe: Partial<Record<GateField, string>> = {};
    const next: Partial<Record<GateField, number>> = {};
    for (const f of GATE_FIELDS) {
      const n = intIn(vals[f], POS_SCHEDULE_GATE_LIMITS[f]);
      if (n === null) fe[f] = tg("minutesInvalid", { min: POS_SCHEDULE_GATE_LIMITS[f].min, max: POS_SCHEDULE_GATE_LIMITS[f].max });
      else next[f] = n;
    }
    setFieldErr(fe);
    setErr(null);
    setSaved(false);
    if (Object.keys(fe).length) return;
    setSaving(true);
    try {
      const r = await updatePosStaffSettingsAction({ systemId, patch: { scheduleGate: next, clockOnShift: clock } });
      if (!r.ok) {
        const f = r.field?.startsWith("scheduleGate.") ? (r.field.slice("scheduleGate.".length) as GateField) : r.field === "clockOnShift" ? "clockOnShift" : null;
        if (r.code === "VALIDATION" && f && f !== "clockOnShift" && GATE_FIELDS.includes(f)) setFieldErr({ [f]: tg("minutesInvalid", { min: POS_SCHEDULE_GATE_LIMITS[f].min, max: POS_SCHEDULE_GATE_LIMITS[f].max }) });
        else if (r.code === "PERMISSION_DENIED") setErr(tg("ownerOnly"));
        else setErr(t(settingsRefusalMessageKey(r.code)));
        return;
      }
      setVals({ earlyMin: String(r.scheduleGate.earlyMin), lateMin: String(r.scheduleGate.lateMin), overrideTtlMin: String(r.scheduleGate.overrideTtlMin) });
      setClock(r.clockOnShift);
      onSaved(r.scheduleGate, r.clockOnShift);
      setSaved(true);
    } catch {
      setErr(t("errors.unknown"));
    } finally {
      setSaving(false);
    }
  };

  const input = (f: GateField, testid: string, hint?: string) => (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tg(f)}</span>
      {f === "earlyMin" ? (
        <input
          data-testid="pos-settings-staff-gate-early"
          className="input h-11 w-full max-w-[140px] rounded-[10px] px-3 text-right text-[15px] font-bold tabular-nums"
          inputMode="numeric"
          autoComplete="off"
          disabled={!isOwner}
          aria-invalid={!!fieldErr[f]}
          value={vals[f]}
          onChange={(e) => {
            setVals((v) => ({ ...v, [f]: e.target.value }));
            setFieldErr((x) => ({ ...x, [f]: undefined }));
            setSaved(false);
          }}
        />
      ) : f === "lateMin" ? (
        <input
          data-testid="pos-settings-staff-gate-late"
          className="input h-11 w-full max-w-[140px] rounded-[10px] px-3 text-right text-[15px] font-bold tabular-nums"
          inputMode="numeric"
          autoComplete="off"
          disabled={!isOwner}
          aria-invalid={!!fieldErr[f]}
          value={vals[f]}
          onChange={(e) => {
            setVals((v) => ({ ...v, [f]: e.target.value }));
            setFieldErr((x) => ({ ...x, [f]: undefined }));
            setSaved(false);
          }}
        />
      ) : (
        <input
          data-testid="pos-settings-staff-gate-ttl"
          className="input h-11 w-full max-w-[140px] rounded-[10px] px-3 text-right text-[15px] font-bold tabular-nums"
          inputMode="numeric"
          autoComplete="off"
          disabled={!isOwner}
          aria-invalid={!!fieldErr[f]}
          value={vals[f]}
          onChange={(e) => {
            setVals((v) => ({ ...v, [f]: e.target.value }));
            setFieldErr((x) => ({ ...x, [f]: undefined }));
            setSaved(false);
          }}
        />
      )}
      {hint && <small className="text-[12px] text-[color:var(--color-muted)]">{hint}</small>}
      {fieldErr[f] && (
        <span data-testid={testid} role="alert" className="text-[12px] text-[color:var(--color-danger)]">
          {fieldErr[f]}
        </span>
      )}
    </label>
  );

  return (
    <SettingsCard testid="pos-settings-staff-gate">
      <CardHead icon="clock" title={tg("title")} />
      <p className="-mt-3 mb-4 text-[12.5px] text-[color:var(--color-muted)]">{tg("hint")}</p>
      {!hrLinked && (
        <p data-testid="pos-settings-staff-gate-nohr" className="mb-4 rounded-[10px] border border-dashed px-3 py-2 text-[12.5px] text-[color:var(--color-muted)]">
          {tg("noHr")}
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {input("earlyMin", "pos-settings-staff-gate-early-error")}
        {input("lateMin", "pos-settings-staff-gate-late-error")}
        {input("overrideTtlMin", "pos-settings-staff-gate-ttl-error", tg("overrideOffHint"))}
      </div>
      <div className="mt-5 flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tg("clockOnShift")}</span>
        <div className="inline-flex w-fit rounded-[12px] border p-1" role="radiogroup" aria-label={tg("clockOnShift")}>
          {(["ASK", "OFF"] as const).map((v) => (
            <button
              key={v}
              data-testid={`pos-settings-staff-gate-clock-${v}`}
              type="button"
              role="radio"
              aria-checked={clock === v}
              disabled={!isOwner}
              className={`h-11 rounded-[9px] px-4 text-[14px] font-semibold disabled:opacity-60 ${clock === v ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-soft)]"}`}
              onClick={() => {
                setClock(v);
                setSaved(false);
              }}
            >
              {v === "ASK" ? tg("clockAsk") : tg("clockOff")}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {isOwner ? (
          <button data-testid="pos-settings-staff-gate-save" type="button" className="btn btn-primary h-11 rounded-[11px] px-5 text-[14px] font-semibold disabled:opacity-50" disabled={saving} onClick={() => void save()}>
            {saving ? t("saving") : t("save")}
          </button>
        ) : (
          <span data-testid="pos-settings-staff-gate-owner-only" className="text-[12.5px] text-[color:var(--color-muted)]">
            {tg("ownerOnly")}
          </span>
        )}
        {saved && (
          <span data-testid="pos-settings-staff-gate-saved" role="status" className="text-[13px] text-[color:var(--color-muted)]">
            {t("saved")}
          </span>
        )}
      </div>
      {err && (
        <div className="mt-3">
          <InlineNote tone="error" testid="pos-settings-staff-gate-error">
            {err}
          </InlineNote>
        </div>
      )}
    </SettingsCard>
  );
}

// ═══════════ ค่าคอมฯ พนักงานขาย ═══════════
type RateText = { bp: string; fixed: string };
type Named = { id: string; name: string };
const rateText = (r: PosStaffCommissionRate | undefined): RateText => ({ bp: pctText(r?.bp), fixed: bahtText(r?.fixedSatang) });

export function StaffCommissionCard({ systemId, unitId, initial }: { systemId: string; unitId: string; initial: PosStaffCommissionConfig }) {
  const t = useTranslations("pos.settings");
  const tc = useTranslations("pos.settings.staff.commission");
  const ts = useTranslations("pos.settings.staff");
  const [cfg, setCfg] = useState<PosStaffCommissionConfig>(initial);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [defBp, setDefBp] = useState(pctText(initial.defaultBp));
  const [roles, setRoles] = useState<PosStaffRole[]>(initial.sellerRoles);
  const [cat, setCat] = useState<Record<string, RateText>>({});
  const [prod, setProd] = useState<Record<string, RateText>>(() => Object.fromEntries(Object.entries(initial.byProduct).map(([id, r]) => [id, rateText(r)])));
  // POS P4.3 ▸ F-P3-18: ตัวอ่านแคตตาล็อกของการ์ดค่าคอมฯ (null = ยังโหลด · false = อ่านไม่ได้) ◂
  const [catalog, setCatalog] = useState<{ categories: Named[]; products: Named[]; more: boolean } | null | false>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Named[]>([]);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sync, setSync] = useState<{ busy: boolean; text: string | null; error: boolean }>({ busy: false, text: null, error: false });

  useEffect(() => {
    let live = true;
    void posCommissionCatalogAction({ systemId, unitId, limit: 500 })
      .then((r) => {
        if (!live) return;
        if (!r.ok) return setCatalog(false);
        setCatalog({ categories: r.categories.map((c) => ({ id: c.id, name: c.name })), products: r.products.map((p) => ({ id: p.id, name: p.name })), more: r.more });
      })
      .catch(() => live && setCatalog(false));
    return () => {
      live = false;
    };
  }, [systemId, unitId]);
  useEffect(() => {
    if (!catalog) return;
    setCat(Object.fromEntries(catalog.categories.map((c) => [c.id, rateText(cfg.byCategory[c.id])])));
  }, [catalog, cfg]);
  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(id);
  }, [saved]);
  // ค้นหาสินค้า: แคตตาล็อกที่โหลดแล้ว · เกิน 500 รายการ = ถามเซิร์ฟเวอร์ด้วยคำค้น (posCommissionCatalogAction · POS P4.3 ▸ F-P3-18 ◂)
  useEffect(() => {
    const term = q.trim().toLowerCase();
    if (!catalog || !term) return setFound([]);
    if (!catalog.more) return setFound(catalog.products.filter((p) => p.name.toLowerCase().includes(term) && !prod[p.id]).slice(0, 8));
    let live = true;
    const id = setTimeout(() => {
      void posCommissionCatalogAction({ systemId, unitId, q: q.trim(), limit: 20 })
        .then((r) => live && setFound(r.ok ? r.products.filter((p) => !prod[p.id]).slice(0, 8).map((p) => ({ id: p.id, name: p.name })) : []))
        .catch(() => live && setFound([]));
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [q, catalog, prod, systemId, unitId]);

  const names = useMemo(() => {
    const m = new Map<string, string>();
    if (catalog) for (const p of catalog.products) m.set(p.id, p.name);
    for (const p of found) m.set(p.id, p.name);
    return m;
  }, [catalog, found]);
  const [extraNames, setExtraNames] = useState<Record<string, string>>({});

  const touch = (key: string) => {
    setSaved(false);
    setFieldErr((x) => {
      if (!(key in x)) return x;
      const n = { ...x };
      delete n[key];
      return n;
    });
  };
  /** ข้อความ → แถวอัตรา · ว่างทั้งคู่ = ไม่มีแถว · ผิด = คีย์ข้อความ */
  const parseRate = (r: RateText): { ok: true; rate: PosStaffCommissionRate | null } | { ok: false; key: string } => {
    const bp = bpOf(r.bp);
    const fixed = satangOf(r.fixed);
    if (bp === null) return { ok: false, key: "bpInvalid" };
    if (fixed === null) return { ok: false, key: "fixedInvalid" };
    if (bp === undefined && fixed === undefined) return { ok: true, rate: null };
    return { ok: true, rate: { ...(bp !== undefined ? { bp } : {}), ...(fixed !== undefined ? { fixedSatang: fixed } : {}) } };
  };

  const save = async () => {
    if (saving) return;
    const fe: Record<string, string> = {};
    const d = bpOf(defBp);
    if (d === null) fe.defaultBp = tc("bpInvalid");
    const editable = !!catalog;
    const byCategory: Record<string, PosStaffCommissionRate> = {};
    const byProduct: Record<string, PosStaffCommissionRate> = {};
    if (editable) {
      for (const [id, r] of Object.entries(cat)) {
        const x = parseRate(r);
        if (!x.ok) fe[`byCategory.${id}`] = tc(x.key);
        else if (x.rate) byCategory[id] = x.rate;
      }
      // หมวดที่ไม่อยู่ในรายการของสาขานี้ = คงแถวเดิม
      for (const [id, r] of Object.entries(cfg.byCategory)) if (!(id in cat)) byCategory[id] = r;
      for (const [id, r] of Object.entries(prod)) {
        const x = parseRate(r);
        if (!x.ok) fe[`byProduct.${id}`] = tc(x.key);
        else if (x.rate) byProduct[id] = x.rate;
      }
    }
    setFieldErr(fe);
    setErr(null);
    setSaved(false);
    if (Object.keys(fe).length) return;
    setSaving(true);
    try {
      const patch = { enabled, defaultBp: d ?? 0, sellerRoles: roles, ...(editable ? { byCategory, byProduct } : {}) };
      const r = await updatePosStaffCommissionAction({ systemId, patch });
      if (!r.ok) {
        const f = r.field ?? "";
        if (r.code === "VALIDATION" && (f === "defaultBp" || f.startsWith("byCategory.") || f.startsWith("byProduct."))) setFieldErr({ [f]: f === "defaultBp" ? tc("bpInvalid") : t("errors.validation") });
        else if (r.code === "PERMISSION_DENIED") setErr(tc("payrollOnly"));
        else setErr(t(settingsRefusalMessageKey(r.code)));
        return;
      }
      const c = r.staffCommission;
      setCfg(c);
      setEnabled(c.enabled);
      setDefBp(pctText(c.defaultBp));
      setRoles(c.sellerRoles);
      setProd(Object.fromEntries(Object.entries(c.byProduct).map(([id, x]) => [id, rateText(x)])));
      setSaved(true);
    } catch {
      setErr(t("errors.unknown"));
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    if (sync.busy) return;
    setSync({ busy: true, text: null, error: false });
    try {
      const r = await syncStaffCommissionNowAction();
      if (!r.ok) return setSync({ busy: false, text: r.code === "PERMISSION_DENIED" ? tc("payrollOnly") : t("errors.unknown"), error: true });
      setSync({ busy: false, text: tc("syncDone", { sent: r.sent, adjustments: r.adjustments, noEmployee: r.noEmployee }), error: false });
    } catch {
      setSync({ busy: false, text: t("errors.unknown"), error: true });
    }
  };

  const errOf = (key: string) =>
    fieldErr[key] ? (
      <span data-testid="pos-settings-staff-commission-field-error" role="alert" className="text-[12px] text-[color:var(--color-danger)]">
        {fieldErr[key]}
      </span>
    ) : null;
  const INPUT = "input h-11 w-[88px] rounded-[10px] px-2 text-right text-[14px] font-bold tabular-nums";
  const prodIds = Object.keys(prod);

  return (
    <SettingsCard testid="pos-settings-staff-commission">
      {/* หัวการ์ด + สวิตช์ (ไม่ส่งปุ่มเป็น prop ของ CardHead — ตัวสแกน F15.3 อ่านแท็กเปิดทั้งก้อน) */}
      <div className="mb-5 flex items-center gap-3">
        <RegisterIcon name="pct" size={17} />
        <h2 className="text-[17px] font-bold tracking-[-0.01em]">{tc("title")}</h2>
        <span className="flex-1" />
        <button
          data-testid="pos-settings-staff-commission-switch"
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={tc("enabled")}
          className="grid min-h-11 min-w-11 place-items-center"
          onClick={() => {
            setEnabled((v) => !v);
            setSaved(false);
          }}
        >
          <SwitchKnob on={enabled} />
        </button>
      </div>
      <p className="-mt-3 text-[12.5px] text-[color:var(--color-muted)]">{tc("hint")}</p>
      <p data-testid="pos-settings-staff-commission-month-hint" className="mb-4 mt-1 text-[12.5px] text-[color:var(--color-muted)]">
        {tc("monthHint")}
      </p>

      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tc("defaultBp")}</span>
          <span className="inline-flex items-center gap-1">
            <input
              data-testid="pos-settings-staff-commission-default"
              className={INPUT}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={!!fieldErr.defaultBp}
              value={defBp}
              onChange={(e) => {
                setDefBp(e.target.value);
                touch("defaultBp");
              }}
            />
            <span className="text-[13px] font-bold">%</span>
          </span>
          {errOf("defaultBp")}
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold text-[color:var(--color-ink-soft)]">{tc("sellerRoles")}</span>
          <div className="flex flex-wrap gap-2">
            {POS_STAFF_ROLES.map((role) => {
              const on = roles.includes(role);
              return (
                <button
                  key={role}
                  data-testid={`pos-settings-staff-commission-role-${role}`}
                  type="button"
                  aria-pressed={on}
                  className={`h-11 rounded-[11px] border px-3.5 text-[13.5px] ${on ? "border-2 border-[color:var(--color-ink)] font-bold" : "text-[color:var(--color-ink-soft)]"}`}
                  onClick={() => {
                    setRoles((r) => (r.includes(role) ? r.filter((x) => x !== role) : POS_STAFF_ROLES.filter((x) => x === role || r.includes(x))));
                    setSaved(false);
                  }}
                >
                  {ts(`roles.${role}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {catalog === false ? (
        <div className="mt-5 flex flex-col gap-1 rounded-[12px] border border-dashed px-4 py-3">
          <span data-testid="pos-settings-staff-commission-product-count" className="text-[13.5px] font-semibold">
            {tc("productCount", { count: Object.keys(cfg.byProduct).length + Object.keys(cfg.byCategory).length })}
          </span>
          <span className="text-[12.5px] text-[color:var(--color-muted)]">{tc("catalogUnavailable")}</span>
        </div>
      ) : catalog === null ? (
        <p className="mt-5 text-[13px] text-[color:var(--color-muted)]">{t("loading")}</p>
      ) : (
        <>
          {/* อัตรารายหมวด */}
          <h3 className="mb-2 mt-6 text-[14px] font-bold">{tc("byCategory")}</h3>
          {catalog.categories.length === 0 ? (
            <p className="text-[13px] text-[color:var(--color-muted)]">{tc("noCategories")}</p>
          ) : (
            <div className="flex flex-col">
              {catalog.categories.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 first:border-t-0">
                  <span className="min-w-0 flex-1 truncate text-[14px]">{c.name}</span>
                  <span className="inline-flex items-center gap-1">
                    <input
                      data-testid={`pos-settings-staff-commission-cat-bp-${c.id}`}
                      className={INPUT}
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label={`${c.name} ${tc("defaultBp")}`}
                      value={cat[c.id]?.bp ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCat((x) => ({ ...x, [c.id]: { bp: v, fixed: x[c.id]?.fixed ?? "" } }));
                        touch(`byCategory.${c.id}`);
                      }}
                    />
                    <span className="text-[13px] font-bold">%</span>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <input
                      data-testid={`pos-settings-staff-commission-cat-fixed-${c.id}`}
                      className={INPUT}
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label={`${c.name} ${tc("fixed")}`}
                      value={cat[c.id]?.fixed ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setCat((x) => ({ ...x, [c.id]: { bp: x[c.id]?.bp ?? "", fixed: v } }));
                        touch(`byCategory.${c.id}`);
                      }}
                    />
                    <span className="text-[12px] text-[color:var(--color-muted)]">{tc("fixed")}</span>
                  </span>
                  {errOf(`byCategory.${c.id}`)}
                </div>
              ))}
            </div>
          )}

          {/* อัตรารายสินค้า */}
          <h3 className="mb-2 mt-6 text-[14px] font-bold">{tc("byProduct")}</h3>
          {prodIds.map((id) => {
            const name = names.get(id) ?? extraNames[id] ?? null;
            return (
              <div key={id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 first:border-t-0">
                <span className={`min-w-0 flex-1 truncate text-[14px] ${name ? "" : "text-[color:var(--color-muted)]"}`}>{name ?? tc("unknownProduct")}</span>
                <span className="inline-flex items-center gap-1">
                  <input
                    data-testid={`pos-settings-staff-commission-prod-bp-${id}`}
                    className={INPUT}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`${name ?? id} ${tc("defaultBp")}`}
                    value={prod[id]?.bp ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setProd((x) => ({ ...x, [id]: { bp: v, fixed: x[id]?.fixed ?? "" } }));
                      touch(`byProduct.${id}`);
                    }}
                  />
                  <span className="text-[13px] font-bold">%</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <input
                    data-testid={`pos-settings-staff-commission-prod-fixed-${id}`}
                    className={INPUT}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`${name ?? id} ${tc("fixed")}`}
                    value={prod[id]?.fixed ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setProd((x) => ({ ...x, [id]: { bp: x[id]?.bp ?? "", fixed: v } }));
                      touch(`byProduct.${id}`);
                    }}
                  />
                  <span className="text-[12px] text-[color:var(--color-muted)]">{tc("fixed")}</span>
                </span>
                <button
                  data-testid={`pos-settings-staff-commission-prod-remove-${id}`}
                  type="button"
                  className="btn btn-ghost h-11 rounded-[11px] px-3 text-[13px]"
                  onClick={() => {
                    setProd((x) => {
                      const n = { ...x };
                      delete n[id];
                      return n;
                    });
                    touch(`byProduct.${id}`);
                  }}
                >
                  {tc("remove")}
                </button>
                {errOf(`byProduct.${id}`)}
              </div>
            );
          })}
          <div className="mt-2 flex flex-col gap-2">
            <input
              data-testid="pos-settings-staff-commission-prod-search"
              className="input h-11 w-full max-w-[360px] rounded-[10px] px-3 text-[14px]"
              autoComplete="off"
              placeholder={tc("searchProduct")}
              aria-label={tc("searchProduct")}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q.trim() && found.length === 0 && <span className="text-[12.5px] text-[color:var(--color-muted)]">{tc("noMatch")}</span>}
            {found.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {found.map((p) => (
                  <button
                    key={p.id}
                    data-testid={`pos-settings-staff-commission-prod-add-${p.id}`}
                    type="button"
                    className="h-11 rounded-[11px] border px-3.5 text-[13.5px]"
                    onClick={() => {
                      setProd((x) => ({ ...x, [p.id]: { bp: "", fixed: "" } }));
                      setExtraNames((x) => ({ ...x, [p.id]: p.name }));
                      setQ("");
                      setSaved(false);
                    }}
                  >
                    {`+ ${p.name}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button data-testid="pos-settings-staff-commission-save" type="button" className="btn btn-primary h-11 rounded-[11px] px-5 text-[14px] font-semibold disabled:opacity-50" disabled={saving} onClick={() => void save()}>
          {saving ? t("saving") : t("save")}
        </button>
        <button data-testid="pos-settings-staff-commission-sync" type="button" className="btn btn-ghost h-11 rounded-[11px] px-4 text-[14px] disabled:opacity-50" disabled={sync.busy} onClick={() => void syncNow()}>
          {sync.busy ? tc("syncing") : tc("syncNow")}
        </button>
        {saved && (
          <span data-testid="pos-settings-staff-commission-saved" role="status" className="text-[13px] text-[color:var(--color-muted)]">
            {t("saved")}
          </span>
        )}
      </div>
      {sync.text && (
        <p data-testid="pos-settings-staff-commission-submit-result" role={sync.error ? "alert" : "status"} className={`mt-2 text-[13px] ${sync.error ? "text-[color:var(--color-danger)]" : "text-[color:var(--color-ink-soft)]"}`}>
          {sync.text}
        </p>
      )}
      {err && (
        <div className="mt-3">
          <InlineNote tone="error" testid="pos-settings-staff-commission-error">
            {err}
          </InlineNote>
        </div>
      )}
    </SettingsCard>
  );
}
