"use client";

// StaffSettings.tsx — POS P1.18U แท็บ "พนักงานและสิทธิ์" (ภาพ 17C · มติ 3 · CD8)
//   หัว: ชื่อ + คำอธิบาย (PIN 4–6 หลัก) + ปุ่มดำ "บันทึก" (บันทึกเพดานส่วนลดเท่านั้น → updatePosDiscountCapsAction ส่งเฉพาะคีย์ที่เปลี่ยน) · ไม่มี "+ เพิ่มบทบาท" (CD8)
//   ซ้าย "สิทธิ์ตามบทบาท": ตำนาน ทำได้/ต้องอนุมัติ · คอลัมน์ เจ้าของ · ผู้จัดการ · พนักงาน (n คน จาก staff[]) · 12 แถวจาก roleMatrix ตามลำดับสัญญา
//     ช่อง = เช็กดำ (ได้) · เช็กฟ้าอ่อน (ได้ + ต้องอนุมัติ — คอลัมน์พนักงาน) · "—" · พนักงานบางคน = "n/m" · แถว planned = จาง + ชิป "เร็ว ๆ นี้ · <เฟส>"
//     แถวส่วนลด = "ไม่จำกัด" (เจ้าของ) + ช่อง % ของผู้จัดการ/พนักงาน (bp ↔ % · 0–100 · ผู้จัดการแก้ได้เฉพาะเจ้าของร้าน)
//   ขวา "นโยบายอนุมัติ" (อ่านอย่างเดียวจาก approvals[] · สวิตช์แสดงสถานะ) + กล่องหมายเหตุ + ลิงก์ "จัดการนโยบาย →" /app/settings/approval ·
//   "พนักงานและ PIN": อวตาร · ชื่อ · บทบาท · PIN ตั้งแล้ว / ยังไม่ตั้ง PIN (แดง) · ปุ่ม ตั้ง PIN / เปลี่ยน PIN (กล่อง PIN) ·
//   แถวดึงรายชื่อจาก HR = สวิตช์ปิด + ชิป "เร็ว ๆ นี้ · P3.5"
//   ไม่มีปุ่ม "ปลดล็อก": listStaffForDevice ไม่บอกสถานะล็อกของ PIN (ปลดล็อกทำที่จอล็อกด้วย PIN ผู้จัดการ — P1.15U) · ชิป "จาก HR ✓" ไม่แสดง (P3.5)
// 🔴 คำปฏิเสธ → settingsRefusalMessageKey · ไม่มีข้อความไทยนอกคอมเมนต์ · testid ตัวอักษรตรงบนแท็ก · ปุ่ม ≥ 44px

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { posSettingsOverviewAction, posStaffOverviewAction, updatePosDiscountCapsAction } from "@/lib/modules/pos/settings-actions";
import { settingsRefusalMessageKey } from "@/lib/modules/pos/settings-shared";
import type { PosStaffOverviewResult } from "@/lib/modules/pos/settings-overview";
import type { PosDiscountCaps, RegisterRole, StaffListItem } from "@/lib/modules/pos/register-shared";
import { RegisterIcon } from "@/components/pos/register/RegisterIcon";
import { InlineNote, SettingsCard, SwitchKnob, TabHead } from "./settings-ui";
import { StaffPinDialog } from "./StaffPinDialog";

type StaffOk = Extract<PosStaffOverviewResult, { ok: true }>;
type Props = { systemId: string; unitId: string; isOwner: boolean };
const ROLE_ORDER: RegisterRole[] = ["OWNER", "MANAGER", "STAFF"];
const SUB_LABEL = new Set(["discount", "priceOverride", "onlineOrders"]);

const pctText = (bp: number) => (bp / 100).toLocaleString("en-US", { maximumFractionDigits: 2 });
/** % (ทศนิยมไม่เกิน 2) → bp 0–10000 · ผิดรูป = null */
const bpOf = (s: string): number | null => {
  const v = s.trim();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(v)) return null;
  const n = Math.round(Number(v) * 100);
  return n >= 0 && n <= 10_000 ? n : null;
};

function Check({ tone }: { tone: "ink" | "approval" }) {
  return (
    <span
      className={`inline-grid size-7 place-items-center rounded-[8px] ${tone === "ink" ? "bg-[color:var(--color-ink)] text-[color:var(--color-surface)]" : "bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]"}`}
    >
      <RegisterIcon name="check" size={14} />
    </span>
  );
}

export function StaffSettings({ systemId, unitId, isOwner }: Props) {
  const t = useTranslations("pos.settings");
  const ts = useTranslations("pos.settings.staff");
  const [data, setData] = useState<StaffOk | null>(null);
  const [canCaps, setCanCaps] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [mgr, setMgr] = useState("");
  const [stf, setStf] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<{ MANAGER?: string; STAFF?: string }>({});
  const [pinFor, setPinFor] = useState<StaffListItem | null>(null);

  const fillCaps = (c: PosDiscountCaps) => {
    setMgr(pctText(c.MANAGER));
    setStf(pctText(c.STAFF));
  };
  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const [r, o] = await Promise.all([posStaffOverviewAction({ systemId, unitId }), posSettingsOverviewAction({ systemId, unitId })]);
      if (!r.ok) return setLoadErr(r.code === "PERMISSION_DENIED" ? "staff.refusal" : settingsRefusalMessageKey(r.code));
      setData(r);
      fillCaps(r.caps);
      setCanCaps(o.ok ? o.canEdit.caps : false);
    } catch {
      setLoadErr("loadFailed");
    }
  }, [systemId, unitId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(id);
  }, [saved]);

  const counts = useMemo(() => {
    const c: Record<RegisterRole, number> = { OWNER: 0, MANAGER: 0, STAFF: 0 };
    for (const s of data?.staff ?? []) c[s.role] += 1;
    return c;
  }, [data]);

  const save = async () => {
    if (!data || !canCaps || saving) return;
    const m = bpOf(mgr);
    const s = bpOf(stf);
    const fe: { MANAGER?: string; STAFF?: string } = {};
    if (isOwner && m === null) fe.MANAGER = "staff.capInvalid";
    if (s === null) fe.STAFF = "staff.capInvalid";
    setFieldErr(fe);
    setErr(null);
    setSaved(false);
    if (Object.keys(fe).length) return;
    const patch: { STAFF?: number; MANAGER?: number } = {};
    if (isOwner && m !== null && m !== data.caps.MANAGER) patch.MANAGER = m;
    if (s !== null && s !== data.caps.STAFF) patch.STAFF = s;
    if (!Object.keys(patch).length) return setSaved(true);
    setSaving(true);
    try {
      const r = await updatePosDiscountCapsAction({ systemId, patch });
      if (!r.ok) {
        if (r.code === "VALIDATION" && (r.field === "MANAGER" || r.field === "STAFF")) setFieldErr({ [r.field]: "staff.capInvalid" });
        else if (r.code === "PERMISSION_DENIED") setErr("staff.capDenied");
        else setErr(settingsRefusalMessageKey(r.code));
        return;
      }
      setData((d) => (d ? { ...d, caps: r.caps } : d));
      fillCaps(r.caps);
      setSaved(true);
    } catch {
      setErr("errors.unknown");
    } finally {
      setSaving(false);
    }
  };

  const head = (
    <TabHead title={ts("title")} desc={ts("subtitle")}>
      {canCaps && (
        <button data-testid="pos-settings-staff-save" type="button" className="btn btn-primary h-11 rounded-[11px] px-5 text-[14px] font-semibold disabled:opacity-50" disabled={saving || !data} onClick={() => void save()}>
          {saving ? t("saving") : t("save")}
        </button>
      )}
    </TabHead>
  );
  if (loadErr)
    return (
      <div data-testid="pos-settings-staff" className="flex min-w-0 flex-col gap-4">
        {head}
        <InlineNote tone="error" testid="pos-settings-load-error">
          {t(loadErr)}
        </InlineNote>
        <button data-testid="pos-settings-staff-retry" type="button" className="btn btn-ghost h-11 self-start rounded-[11px] px-5 text-[14px]" onClick={() => void load()}>
          {t("retry")}
        </button>
      </div>
    );
  if (!data)
    return (
      <div data-testid="pos-settings-staff" className="flex min-w-0 flex-col gap-4">
        {head}
        <p className="text-[14px] text-[color:var(--color-muted)]">{t("loading")}</p>
      </div>
    );

  const capInput = (role: "MANAGER" | "STAFF", value: string, set: (v: string) => void, editable: boolean) =>
    editable ? (
      <span className="inline-flex flex-col items-center gap-1">
        <span className="inline-flex items-center gap-1">
          <input
            data-testid={`pos-settings-staff-cap-${role.toLowerCase()}`}
            className="input h-11 w-[72px] rounded-[10px] px-2 text-right text-[15px] font-bold tabular-nums"
            inputMode="decimal"
            autoComplete="off"
            aria-label={ts("capLabel", { role: ts(`roles.${role}`) })}
            aria-invalid={!!fieldErr[role]}
            value={value}
            onChange={(e) => {
              set(e.target.value);
              setSaved(false);
              setFieldErr((f) => ({ ...f, [role]: undefined }));
            }}
          />
          <span className="text-[14px] font-bold">%</span>
        </span>
        {fieldErr[role] && (
          <span data-testid="pos-settings-staff-cap-error" role="alert" className="text-[11.5px] text-[color:var(--color-danger)]">
            {t(fieldErr[role]!)}
          </span>
        )}
      </span>
    ) : (
      <span className="font-bold tabular-nums">{`${pctText(role === "MANAGER" ? data.caps.MANAGER : data.caps.STAFF)}%`}</span>
    );

  const roleLabel = (r: RegisterRole) => ts(`roles.${r}`);
  const approverOf = (role: string | undefined) => (role && ts.has(`approver.${role}`) ? ts(`approver.${role}`) : ts("approver.other"));

  return (
    <div data-testid="pos-settings-staff" className="flex min-w-0 flex-col gap-6 md:gap-8">
      {head}
      {err && (
        <InlineNote tone="error" testid="pos-settings-staff-error">
          {t(err)}
        </InlineNote>
      )}
      {saved && (
        <span data-testid="pos-settings-staff-saved" role="status" className="text-[13.5px] text-[color:var(--color-muted)]">
          {t("saved")}
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-7 xl:flex-row xl:items-start xl:gap-8">
        {/* ── สิทธิ์ตามบทบาท ── */}
        <section data-testid="pos-settings-staff-matrix" className="min-w-0 overflow-hidden rounded-[18px] border bg-[color:var(--color-surface)] xl:flex-[1.25]">
          <div className="flex flex-wrap items-center gap-3 px-5 pb-4 pt-5 md:px-6 md:pt-[22px]">
            <RegisterIcon name="lock" size={17} />
            <h2 className="text-[17px] font-bold tracking-[-0.01em]">{ts("matrixTitle")}</h2>
            <span className="flex-1" />
            <span className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13.5px] text-[color:var(--color-ink-soft)]">
              <span className="inline-flex items-center gap-1.5">
                <Check tone="ink" />
                {ts("legendAllowed")}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check tone="approval" />
                {ts("legendApproval")}
              </span>
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] border-separate border-spacing-0 text-[14.5px] tabular-nums">
              <thead>
                <tr>
                  <th className="border-b bg-[color:var(--color-surface-2)] px-3 py-3.5 text-left text-[13px] font-bold text-[color:var(--color-ink-soft)] md:pl-5">{ts("task")}</th>
                  {ROLE_ORDER.map((r) => (
                    <th key={r} className="border-b bg-[color:var(--color-surface-2)] px-3 py-3.5 text-center text-[13px] font-bold text-[color:var(--color-ink-soft)]">
                      {roleLabel(r)}
                      <small className="block font-normal text-[color:var(--color-muted)]">{ts("people", { count: counts[r] })}</small>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.roleMatrix.map((row) => {
                  const planned = !!row.planned;
                  const muted = planned ? "text-[color:var(--color-muted)]" : "";
                  const staffCell = () => {
                    if (planned || !row.permission) return <span className="text-[17px] text-[color:var(--color-muted)]">—</span>;
                    const { holders, total } = row.staff;
                    if (holders === 0 || total === 0) return <span className="text-[17px] text-[color:var(--color-muted)]">—</span>;
                    if (holders < total) return <span className={`text-[13.5px] font-semibold ${row.needsApproval ? "text-[color:var(--color-accent)]" : ""}`}>{`${holders}/${total}`}</span>;
                    return <Check tone={row.needsApproval ? "approval" : "ink"} />;
                  };
                  return (
                    <tr key={row.task} data-testid={`pos-settings-staff-row-${row.task}`}>
                      <td className={`border-b px-3 py-3 text-left md:pl-5 ${muted}`}>
                        <b className="font-semibold">{ts(`tasks.${row.task}`)}</b>
                        {SUB_LABEL.has(row.task) && <small className="block text-[12.5px] text-[color:var(--color-muted)]">{ts(`taskSub.${row.task}`)}</small>}
                        {planned && (
                          <span className="mt-1 inline-flex h-6 items-center rounded-[7px] border px-2 text-[11.5px] text-[color:var(--color-muted)]">{ts("soonPhase", { phase: row.planned! })}</span>
                        )}
                      </td>
                      {row.task === "discount" ? (
                        <>
                          <td className="border-b bg-[color:var(--color-surface-2)] px-3 py-3 text-center font-bold">{ts("unlimited")}</td>
                          <td className="border-b px-3 py-3 text-center">{capInput("MANAGER", mgr, setMgr, canCaps && isOwner)}</td>
                          <td className="border-b px-3 py-3 text-center">{capInput("STAFF", stf, setStf, canCaps)}</td>
                        </>
                      ) : (
                        <>
                          <td className="border-b bg-[color:var(--color-surface-2)] px-3 py-3 text-center">{row.owner && !planned ? <Check tone="ink" /> : <span className="text-[17px] text-[color:var(--color-muted)]">—</span>}</td>
                          <td className="border-b px-3 py-3 text-center">{row.manager && !planned ? <Check tone="ink" /> : <span className="text-[17px] text-[color:var(--color-muted)]">—</span>}</td>
                          <td className="border-b px-3 py-3 text-center">{staffCell()}</td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[12.5px] text-[color:var(--color-muted)] md:px-6">
            {ts("grantsNote")}{" "}
            <Link data-testid="pos-settings-staff-grants-link" href="/app/settings/staff" className="inline-flex min-h-11 items-center font-semibold text-[color:var(--color-accent)]">
              {ts("grantsLink")}
            </Link>
          </p>
        </section>

        <div className="flex min-w-0 flex-col gap-7 xl:flex-1">
          {/* ── นโยบายอนุมัติ ── */}
          <SettingsCard testid="pos-settings-staff-policies">
            <div className="mb-2 flex items-center gap-3">
              <RegisterIcon name="flag" size={17} />
              <h2 className="text-[17px] font-bold tracking-[-0.01em]">{ts("policiesTitle")}</h2>
              <span className="flex-1" />
              <span className="text-[12.5px] text-[color:var(--color-muted)]">{ts("viaApproval")}</span>
            </div>
            {data.approvals.length === 0 ? (
              <p data-testid="pos-settings-staff-policies-empty" className="py-3 text-[14px] text-[color:var(--color-muted)]">
                {ts("policiesEmpty")}
              </p>
            ) : (
              data.approvals.map((p) => (
                <div key={p.id} className="flex items-center gap-4 border-t py-3.5 text-[15px] first-of-type:border-t-0">
                  <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5">
                    <b className="font-semibold">{p.name}</b>
                    <span aria-hidden className="text-[color:var(--color-muted)]">→</span>
                    {approverOf([...p.steps].sort((a, b) => a.order - b.order)[0]?.approverRole)}
                  </span>
                  <span data-testid={`pos-settings-staff-policy-switch-${p.id}`} role="switch" aria-checked="true" aria-disabled="true" aria-label={p.name} title={ts("policyReadOnly")} className="grid min-h-11 min-w-11 place-items-center">
                    <SwitchKnob on />
                  </span>
                </div>
              ))
            )}
            <p className="mt-3 rounded-[8px] border border-dashed px-3 py-2 text-[12.5px] text-[color:var(--color-muted)]">{ts("policiesNote")}</p>
            <Link data-testid="pos-settings-staff-policy-link" href="/app/settings/approval" className="mt-1 inline-flex min-h-11 items-center self-start text-[14px] font-semibold text-[color:var(--color-accent)]">
              {ts("policiesManage")}
            </Link>
          </SettingsCard>

          {/* ── พนักงานและ PIN ── */}
          <SettingsCard testid="pos-settings-staff-pins">
            <div className="mb-2 flex items-center gap-3">
              <RegisterIcon name="users" size={17} />
              <h2 className="text-[17px] font-bold tracking-[-0.01em]">{ts("pinsTitle")}</h2>
            </div>
            {data.staff.length === 0 ? (
              <p data-testid="pos-settings-staff-pins-empty" className="py-3 text-[14px] text-[color:var(--color-muted)]">
                {ts("pinsEmpty")}
              </p>
            ) : (
              data.staff.map((s) => (
                <div key={s.userId} data-testid={`pos-settings-staff-person-${s.userId}`} className="flex items-center gap-4 border-t py-3.5 first-of-type:border-t-0">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] border bg-[color:var(--color-surface-2)] text-[15px] font-bold text-[color:var(--color-ink-soft)]">
                    {(s.name ?? "?").trim().charAt(0).toUpperCase() || "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[15px] font-semibold">{s.name ?? "-"}</b>
                    <small className={`block text-[13px] ${s.hasPin ? "text-[color:var(--color-muted)]" : "text-[color:var(--color-danger)]"}`}>
                      {`${roleLabel(s.role)} · ${s.hasPin ? ts("pinSet") : ts("pinNotSet")}`}
                    </small>
                  </span>
                  <button
                    data-testid={`pos-settings-staff-pin-open-${s.userId}`}
                    type="button"
                    className="btn btn-ghost h-11 shrink-0 rounded-[11px] px-4 text-[14px]"
                    onClick={() => setPinFor(s)}
                  >
                    {s.hasPin ? ts("pinChange") : ts("pinSetButton")}
                  </button>
                </div>
              ))
            )}
            <div className="mt-2 flex items-center gap-4 rounded-[14px] border bg-[color:var(--color-surface-2)] px-4 py-3.5">
              <span className="min-w-0 flex-1">
                <b className="block text-[15px] font-semibold">{ts("hrSync")}</b>
                <small className="block text-[12.5px] text-[color:var(--color-muted)]">{ts("hrSyncHint")}</small>
                <span className="mt-1 inline-flex h-6 items-center rounded-[7px] border px-2 text-[11.5px] text-[color:var(--color-muted)]">{ts("soonPhase", { phase: "P3.5" })}</span>
              </span>
              <span data-testid="pos-settings-staff-hr-switch" role="switch" aria-checked="false" aria-disabled="true" aria-label={ts("hrSync")} className="grid min-h-11 min-w-11 place-items-center">
                <SwitchKnob on={false} disabled />
              </span>
            </div>
          </SettingsCard>
        </div>
      </div>
      {pinFor && (
        <StaffPinDialog
          systemId={systemId}
          unitId={unitId}
          userId={pinFor.userId}
          name={pinFor.name ?? "-"}
          change={pinFor.hasPin}
          onClose={() => setPinFor(null)}
          onDone={() => {
            setPinFor(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
