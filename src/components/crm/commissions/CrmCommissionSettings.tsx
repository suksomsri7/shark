"use client";

// CrmCommissionSettings.tsx — หน้าจอ "คอมมิชชัน" ของ CRM v2 (ใบ C3.3 · พิมพ์เขียว §5.9 · ภาพ 10 ขวา)
//   กฎคอมมิชชัน (ฐาน รับเงิน/ปิดการขาย · เปอร์เซ็นต์/คงที่/ขั้นบันได · pipeline · แบ่งผู้ร่วม · เลื่อนจ่าย · มูลค่าขั้นต่ำ) +
//   "คอมมิชชันรออนุมัติ" (เลือกหลายแถว → อนุมัติที่เลือก · ไม่อนุมัติพร้อมเหตุผล · ส่ง payroll)
// 🔴 'use client' + ด่าน F2.3: ไฟล์นี้ไม่ import โมดูล CRM เลย (แม้ไฟล์ `*-shared`) — ป้าย/เพดานมาจากหน้า server ทาง props ·
//    เขียนข้อมูลผ่าน server action ของหน้าเท่านั้น · เงินที่แสดงคำนวณแล้วจากบริการ (หน้าจอแค่จัดรูปแบบ)
// 🔴 ตรวจค่าแบบ inline (ไม่มี alert()) · ข้อความไทยที่ไม่โทษผู้ใช้ · testid ทุกตัวที่กด/กรอกได้มีแถวใน scripts/crm-ui-inventory.json
// 🔴 กว้าง 1440px และ 390px ไม่มีแถบเลื่อนแนวนอนของทั้งหน้า (ตารางมี overflow-x ของตัวเอง)

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  approveCrmCommissionsAction,
  createCrmCommissionRuleAction,
  rejectCrmCommissionAction,
  saveCrmCommissionSettingsAction,
  sendCrmCommissionsToPayrollAction,
  updateCrmCommissionRuleAction,
} from "@/app/app/sys/[id]/crm/settings/commissions/actions";
import type { CrmCommissionRuleDraft, CrmCommissionRuleView, CrmCommissionSettingsData, CrmCommissionSettingsDraft, CrmCommissionTierDraft } from "./types";

type Draft = {
  id: string | null;
  name: string;
  basis: string;
  kind: string;
  pct: string;
  fixedBaht: string;
  tiers: CrmCommissionTierDraft[];
  pipelineId: string;
  minBaht: string;
  splitPct: string;
  delayDays: string;
  active: boolean;
};

const baht = (satang: number) => `฿${(satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;
const pctText = (bp: number | null) => (bp === null ? "" : String(bp / 100));
const bahtText = (satang: number | null) => (satang === null ? "" : String(satang / 100));
/** "5" → 500 bp · ว่าง = null · ไม่ใช่ตัวเลข = NaN (ตัวตรวจของบริการตอบเป็นภาษาไทย) */
const toBp = (s: string): number | null => (s.trim() === "" ? null : Math.round(Number(s) * 100));
const toSatang = (s: string): number | null => (s.trim() === "" ? null : Math.round(Number(s.replace(/,/g, "")) * 100));

const STATUS_TONE: Record<string, string> = {
  PENDING: "border-[color:var(--color-warning,#d97706)] text-[color:var(--color-warning,#b45309)]",
  APPROVED: "border-[color:var(--color-accent)] text-[color:var(--color-accent)]",
  PAID: "border-[color:var(--color-success,#15803d)] text-[color:var(--color-success,#15803d)]",
  REVERSED: "border-[color:var(--color-danger)] text-[color:var(--color-danger)]",
  REJECTED: "text-[color:var(--color-muted)]",
};

function draftOf(r: CrmCommissionRuleView | null, basis: string): Draft {
  if (!r) return { id: null, name: "", basis, kind: "PCT", pct: "", fixedBaht: "", tiers: [{ uptoBaht: "", pct: "" }, { uptoBaht: "", pct: "" }], pipelineId: "", minBaht: "", splitPct: "0", delayDays: "0", active: true };
  return {
    id: r.id,
    name: r.name,
    basis: r.basis,
    kind: r.kind,
    pct: pctText(r.pctBp),
    fixedBaht: bahtText(r.fixedSatang),
    tiers: r.tiers.length ? r.tiers.map((t) => ({ uptoBaht: t.uptoSatang === null ? "" : String(t.uptoSatang / 100), pct: String(t.pctBp / 100) })) : [{ uptoBaht: "", pct: "" }, { uptoBaht: "", pct: "" }],
    pipelineId: r.pipelineId ?? "",
    minBaht: bahtText(r.minDealSatang),
    splitPct: String(r.splitCollaboratorsBp / 100),
    delayDays: String(r.payoutDelayDays),
    active: r.active,
  };
}

function toRuleDraft(d: Draft): CrmCommissionRuleDraft {
  const config: CrmCommissionRuleDraft["config"] =
    d.kind === "PCT"
      ? { pctBp: toBp(d.pct) ?? Number.NaN }
      : d.kind === "FIXED"
        ? { fixedSatang: toSatang(d.fixedBaht) ?? Number.NaN, ...(toBp(d.pct) !== null ? { pctBp: toBp(d.pct) as number } : {}) }
        : { tiers: d.tiers.map((t, i) => ({ uptoSatang: i === d.tiers.length - 1 ? null : toSatang(t.uptoBaht) ?? Number.NaN, pctBp: toBp(t.pct) ?? Number.NaN })) };
  return {
    name: d.name,
    basis: d.basis,
    kind: d.kind,
    config,
    pipelineId: d.pipelineId || null,
    minDealSatang: toSatang(d.minBaht),
    splitCollaboratorsBp: toBp(d.splitPct) ?? 0,
    payoutDelayDays: d.delayDays.trim() === "" ? 0 : Number(d.delayDays),
    active: d.active,
  };
}

export function CrmCommissionSettings({ data }: { data: CrmCommissionSettingsData }) {
  const router = useRouter();
  const { systemId } = data;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [shop, setShop] = useState<CrmCommissionSettingsDraft>(data.settings);

  const say = (ok: boolean, text: string) => setMsg({ ok, text });
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectable = data.pending.filter((r) => r.status === "PENDING");
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.has(r.id));

  async function saveRule() {
    if (!draft) return;
    if (!draft.name.trim()) return setFieldError("ตั้งชื่อกฎก่อนบันทึก เช่น \"ขายองค์กร B2B — มาตรฐาน\"");
    setBusy(true);
    setFieldError(null);
    try {
      const input = toRuleDraft(draft);
      const r = draft.id ? await updateCrmCommissionRuleAction(systemId, draft.id, input) : await createCrmCommissionRuleAction(systemId, input);
      if (!r.ok) return setFieldError(r.error);
      setDraft(null);
      say(true, draft.id ? "บันทึกการแก้ไขกฎแล้ว" : "เพิ่มกฎคอมมิชชันแล้ว — ใช้กับเงิน/ดีลที่เข้ามาหลังจากนี้");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function approveSelected() {
    const ids = [...selected];
    if (ids.length === 0) return say(false, "เลือกรายการที่จะอนุมัติก่อน (ติ๊กช่องหน้ารายการ)");
    setBusy(true);
    try {
      const r = await approveCrmCommissionsAction(systemId, ids);
      if (!r.ok) return say(false, r.error);
      setSelected(new Set());
      say(r.failed.length === 0, r.failed.length === 0 ? `อนุมัติแล้ว ${r.done} รายการ` : `อนุมัติแล้ว ${r.done} รายการ · อีก ${r.failed.length} รายการยังไม่ผ่าน: ${r.failed[0]!.message}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sendPayroll() {
    setBusy(true);
    try {
      const r = await sendCrmCommissionsToPayrollAction(systemId);
      if (!r.ok) return say(false, r.error);
      say(true, r.requested > 0 ? `ส่งเข้างวดเงินเดือนแล้ว ${r.requested} รายการ (ฝ่ายบุคคลอนุมัติต่อในหน้าเงินเดือน)` : `ไม่มีรายการที่พร้อมส่ง — รายการที่ "${data.waitingLabel}" จะถูกส่งเองเมื่อผูกพนักงานแล้ว`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmReject() {
    if (!rejecting) return;
    if (reason.trim().length < data.limits.reasonMin) return say(false, `ใส่เหตุผลที่ไม่อนุมัติอย่างน้อย ${data.limits.reasonMin} ตัวอักษร — พนักงานจะเห็นเหตุผลนี้`);
    setBusy(true);
    try {
      const r = await rejectCrmCommissionAction(systemId, rejecting, reason.trim());
      if (!r.ok) return say(false, r.error);
      setRejecting(null);
      setReason("");
      say(true, "บันทึกว่าไม่อนุมัติแล้ว");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveShopSettings() {
    setBusy(true);
    try {
      const r = await saveCrmCommissionSettingsAction(systemId, shop);
      if (!r.ok) return say(false, r.error);
      say(true, "บันทึกค่าตั้งคอมมิชชันแล้ว — มีผลกับรายการที่เกิดหลังจากนี้");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const setTier = (i: number, patch: Partial<CrmCommissionTierDraft>) =>
    draft && setDraft({ ...draft, tiers: draft.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {msg && (
        <p data-testid="crm-commission-msg" className={`rounded-md border px-3 py-2 text-sm lg:col-span-2 ${msg.ok ? "text-[color:var(--color-accent)]" : "text-[color:var(--color-danger)]"}`}>
          {msg.text}
        </p>
      )}

      {/* CRM C3.3 ▸ ค่าตั้งของร้าน (`settings.crm.commission` · คีย์ crm.settings.manage) ◂ */}
      {data.canManage && (
        <section data-testid="crm-commission-settings" className="flex min-w-0 flex-col gap-3 rounded-lg border p-3 lg:col-span-2">
          <h2 className="text-sm font-semibold">ค่าตั้งคอมมิชชันของร้าน</h2>
          <div className="flex min-w-0 flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-xs">
              <input data-testid="crm-commission-setting-approval" type="checkbox" checked={shop.approvalRequired} onChange={(e) => setShop({ ...shop, approvalRequired: e.target.checked })} />
              <span>ต้องอนุมัติก่อนจ่าย (ใช้สายอนุมัติ &ldquo;คอมมิชชัน&rdquo; ถ้าตั้งไว้ · ไม่มีสาย = อนุมัติทันที)</span>
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input data-testid="crm-commission-setting-payroll" type="checkbox" checked={shop.payrollLink} onChange={(e) => setShop({ ...shop, payrollLink: e.target.checked })} />
              <span>อนุมัติแล้วส่งเข้างวดเงินเดือนของพนักงานที่ผูกไว้</span>
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span>ฐานเริ่มต้นของกฎใหม่</span>
              <select data-testid="crm-commission-setting-basis" className="rounded-md border px-2 py-1 text-sm" value={shop.basis} onChange={(e) => setShop({ ...shop, basis: e.target.value })}>
                {data.bases.map((b) => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </label>
            <button data-testid="crm-commission-settings-save" type="button" disabled={busy} className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-50" onClick={() => void saveShopSettings()}>
              บันทึกค่าตั้ง
            </button>
          </div>
        </section>
      )}

      {/* ── กฎคอมมิชชัน ── */}
      <section data-testid="crm-commission-rules" className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">กฎคอมมิชชัน</h2>
          {data.canManage && (
            <button
              data-testid="crm-commission-rule-add"
              type="button"
              disabled={busy}
              className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
              onClick={() => {
                setFieldError(null);
                setDraft(draftOf(null, shop.basis));
              }}
            >
              + เพิ่มกฎ
            </button>
          )}
        </div>
        {data.rules.length === 0 && !draft && (
          <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีกฎ — เพิ่มกฎแรก เช่น &ldquo;5% ของยอดที่รับเงิน&rdquo; แล้วระบบจะคิดคอมมิชชันให้ทุกครั้งที่ลูกค้าจ่ายเงินหรือดีลปิดการขาย</p>
        )}
        <ul className="flex min-w-0 flex-col gap-2">
          {data.rules.map((r) => (
            <li key={r.id}>
              <button
                data-testid={`crm-commission-rule-row-${r.id}`}
                type="button"
                disabled={!data.canManage || busy}
                className={`flex w-full min-w-0 flex-col items-start gap-1 rounded-lg border px-3 py-2 text-left ${r.active ? "bg-[color:var(--color-accent-soft,transparent)]" : "opacity-60"}`}
                onClick={() => {
                  setFieldError(null);
                  setDraft(draftOf(r, r.basis));
                }}
              >
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-words text-sm font-semibold">{r.name}</span>
                  <span className="rounded-full border px-2 text-[11px] text-[color:var(--color-muted)]">ฐาน: {r.basisLabel}</span>
                  {!r.active && <span className="rounded-full border px-2 text-[11px] text-[color:var(--color-muted)]">ปิดอยู่</span>}
                </span>
                <span className="break-words text-xs text-[color:var(--color-muted)]">
                  {r.description}
                  {r.pipelineName ? ` · เฉพาะ pipeline ${r.pipelineName}` : ""}
                  {r.minDealSatang !== null ? ` · ดีลตั้งแต่ ${baht(r.minDealSatang)}` : ""}
                  {r.payoutDelayDays > 0 ? ` · เลื่อนจ่าย ${r.payoutDelayDays} วัน` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>

        {draft && (
          <div className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
            <h3 className="text-sm font-semibold">{draft.id ? "แก้ไขกฎ" : "กฎใหม่"}</h3>
            <label className="flex min-w-0 flex-col gap-1 text-xs">
              <span>ชื่อกฎ</span>
              <input
                data-testid="crm-commission-rule-name"
                className="w-full min-w-0 rounded-md border px-2 py-1 text-sm"
                maxLength={data.limits.nameMax}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span>คิดเมื่อ</span>
                <select data-testid="crm-commission-rule-basis" className="rounded-md border px-2 py-1 text-sm" value={draft.basis} onChange={(e) => setDraft({ ...draft, basis: e.target.value })}>
                  {data.bases.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span>แบบของอัตรา</span>
                <select data-testid="crm-commission-rule-kind" className="rounded-md border px-2 py-1 text-sm" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                  {data.kinds.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {draft.kind === "FIXED" && (
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span>จำนวนเงินคงที่ต่อดีล (บาท)</span>
                <input data-testid="crm-commission-rule-fixed" inputMode="decimal" className="w-40 max-w-full rounded-md border px-2 py-1 text-sm" value={draft.fixedBaht} onChange={(e) => setDraft({ ...draft, fixedBaht: e.target.value })} />
              </label>
            )}
            {draft.kind !== "TIERED" && (
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span>{draft.kind === "FIXED" ? "บวกเพิ่มเปอร์เซ็นต์ของมูลค่า (%) — เว้นว่างได้" : "เปอร์เซ็นต์ของมูลค่า (%)"}</span>
                <input data-testid="crm-commission-rule-pct" inputMode="decimal" className="w-40 max-w-full rounded-md border px-2 py-1 text-sm" value={draft.pct} onChange={(e) => setDraft({ ...draft, pct: e.target.value })} />
              </label>
            )}
            {draft.kind === "TIERED" && (
              <div className="flex min-w-0 flex-col gap-2 text-xs">
                <span>ขั้นบันได (คิดแบบส่วนเพิ่ม: แต่ละขั้นได้อัตราของขั้นนั้นเฉพาะส่วนที่อยู่ในช่วง)</span>
                {draft.tiers.map((t, i) => {
                  const last = i === draft.tiers.length - 1;
                  return (
                    <div key={i} className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="w-14">ขั้น {i + 1}</span>
                      {last ? (
                        <span className="w-40 text-[color:var(--color-muted)]">ส่วนที่เกิน</span>
                      ) : (
                        <input
                          data-testid={`crm-commission-tier-upto-${i}`}
                          inputMode="decimal"
                          placeholder="ถึง (บาท)"
                          className="w-40 max-w-full rounded-md border px-2 py-1 text-sm"
                          value={t.uptoBaht}
                          onChange={(e) => setTier(i, { uptoBaht: e.target.value })}
                        />
                      )}
                      <input
                        data-testid={`crm-commission-tier-pct-${i}`}
                        inputMode="decimal"
                        placeholder="%"
                        className="w-20 rounded-md border px-2 py-1 text-sm"
                        value={t.pct}
                        onChange={(e) => setTier(i, { pct: e.target.value })}
                      />
                      {draft.tiers.length > 1 && (
                        <button
                          data-testid={`crm-commission-tier-remove-${i}`}
                          type="button"
                          className="rounded-md border px-2 py-0.5"
                          onClick={() => setDraft({ ...draft, tiers: draft.tiers.filter((_, j) => j !== i) })}
                        >
                          ลบขั้น
                        </button>
                      )}
                    </div>
                  );
                })}
                {draft.tiers.length < data.limits.tiersMax && (
                  <button
                    data-testid="crm-commission-tier-add"
                    type="button"
                    className="self-start rounded-md border px-2 py-0.5"
                    onClick={() => setDraft({ ...draft, tiers: [...draft.tiers.slice(0, -1), { uptoBaht: "", pct: "" }, draft.tiers[draft.tiers.length - 1]!] })}
                  >
                    + เพิ่มขั้น
                  </button>
                )}
              </div>
            )}

            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span>ใช้กับ pipeline</span>
                <select data-testid="crm-commission-rule-pipeline" className="rounded-md border px-2 py-1 text-sm" value={draft.pipelineId} onChange={(e) => setDraft({ ...draft, pipelineId: e.target.value })}>
                  <option value="">ทุก pipeline</option>
                  {data.pipelines.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span>มูลค่าดีลขั้นต่ำ (บาท) — เว้นว่าง = ทุกดีล</span>
                <input data-testid="crm-commission-rule-min" inputMode="decimal" className="rounded-md border px-2 py-1 text-sm" value={draft.minBaht} onChange={(e) => setDraft({ ...draft, minBaht: e.target.value })} />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span>แบ่งให้ผู้ร่วมดูแล (%) — เฉลี่ยเท่ากัน เศษเป็นของเจ้าของดีล</span>
                <input data-testid="crm-commission-rule-split" inputMode="decimal" className="rounded-md border px-2 py-1 text-sm" value={draft.splitPct} onChange={(e) => setDraft({ ...draft, splitPct: e.target.value })} />
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span>เลื่อนเข้างวดเงินเดือน (วัน)</span>
                <input data-testid="crm-commission-rule-delay" inputMode="numeric" className="rounded-md border px-2 py-1 text-sm" value={draft.delayDays} onChange={(e) => setDraft({ ...draft, delayDays: e.target.value })} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input data-testid="crm-commission-rule-active" type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              <span>เปิดใช้กฎนี้</span>
            </label>
            {/* CRM C3.3 ▸ รีวิวรอบ 6 ข้อ 5: เปิดกฎกลับ/แก้ขอบเขตหรืออัตรา = createdAt ใหม่ ⇒ ไม่มีเครดิตย้อนหลัง ◂ CRM C3.3 */}
            <p className="text-xs text-[color:var(--color-muted)]">
              เปิดกฎที่เคยปิดกลับมา หรือเปลี่ยนขอบเขต/อัตราของกฎ จะคิดคอมมิชชันเฉพาะเงินที่รับเข้ามาหลังบันทึกเท่านั้น
            </p>
            {fieldError && (
              <p data-testid="crm-commission-rule-error" className="text-xs text-[color:var(--color-danger)]">
                {fieldError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button data-testid="crm-commission-rule-save" type="button" disabled={busy} className="rounded-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-50" onClick={() => void saveRule()}>
                บันทึกกฎ
              </button>
              <button data-testid="crm-commission-rule-cancel" type="button" disabled={busy} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50" onClick={() => setDraft(null)}>
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── คอมมิชชันรออนุมัติ ── */}
      {data.canApprove && (
        <section data-testid="crm-commission-pending" className="flex min-w-0 flex-col gap-3 rounded-lg border p-3">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">คอมมิชชันรออนุมัติ</h2>
            <span className="rounded-full bg-[color:var(--color-fg,#111)] px-2 text-xs font-semibold text-[color:var(--color-bg,#fff)]">{data.pending.length.toLocaleString("th-TH")}</span>
          </div>
          {data.pending.length === 0 ? (
            <p className="text-xs text-[color:var(--color-muted)]">ไม่มีรายการรออนุมัติ — รายการใหม่จะขึ้นที่นี่เมื่อลูกค้าจ่ายเงินหรือดีลปิดการขายตามกฎ</p>
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full text-left text-sm sm:min-w-[520px]">
                <thead className="text-xs text-[color:var(--color-muted)]">
                  <tr>
                    <th className="w-8 py-1 pr-2">
                      <input
                        data-testid="crm-commission-select-all"
                        type="checkbox"
                        aria-label="เลือกทั้งหมด"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.id)))}
                      />
                    </th>
                    <th className="py-1 pr-2">ดีล</th>
                    <th className="py-1 pr-2">พนักงาน</th>
                    <th className="py-1 pr-2 text-right">จำนวน</th>
                    <th className="py-1 pr-2 text-right">สถานะ</th>
                    <th className="py-1" />
                  </tr>
                </thead>
                <tbody>
                  {data.pending.map((r) => (
                    <tr key={r.id} data-testid={`crm-commission-pending-row-${r.id}`} className="border-t align-top">
                      <td className="py-1.5 pr-2">
                        <input data-testid={`crm-commission-select-${r.id}`} type="checkbox" aria-label={`เลือก ${r.dealTitle}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                      </td>
                      <td className="max-w-[16rem] break-words py-1.5 pr-2">
                        {r.dealTitle}
                        <span className="block text-[11px] text-[color:var(--color-muted)]">
                          {r.basisLabel} · งวด {r.periodKey}
                        </span>
                        {r.rewon && (
                          <span data-testid="crm-commission-rewon-badge" className="mt-0.5 inline-block rounded-full border px-1.5 text-[10px]">
                            {data.rewonLabel}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">{r.userName}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{baht(r.amountSatang)}</td>
                      <td className="py-1.5 pr-2 text-right">
                        <span className={`rounded border px-1.5 text-[11px] font-semibold ${STATUS_TONE[r.status] ?? ""}`}>{r.statusLabel}</span>
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          data-testid={`crm-commission-reject-${r.id}`}
                          type="button"
                          disabled={busy}
                          className="rounded-md border px-2 py-0.5 text-xs disabled:opacity-50"
                          onClick={() => {
                            setRejecting(r.id);
                            setReason("");
                          }}
                        >
                          ไม่อนุมัติ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rejecting && (
            <div className="flex min-w-0 flex-wrap items-end gap-2 rounded-md border p-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs">
                <span>เหตุผลที่ไม่อนุมัติ (อย่างน้อย {data.limits.reasonMin} ตัวอักษร)</span>
                <input data-testid="crm-commission-reject-reason" className="w-full min-w-0 rounded-md border px-2 py-1 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <button data-testid="crm-commission-reject-confirm" type="button" disabled={busy} className="rounded-md border px-3 py-1.5 text-sm text-[color:var(--color-danger)] disabled:opacity-50" onClick={() => void confirmReject()}>
                ยืนยันไม่อนุมัติ
              </button>
              <button data-testid="crm-commission-reject-cancel" type="button" disabled={busy} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50" onClick={() => setRejecting(null)}>
                ยกเลิก
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button data-testid="crm-commission-approve-selected" type="button" disabled={busy} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50" onClick={() => void approveSelected()}>
              อนุมัติที่เลือก
            </button>
            <button
              data-testid="crm-commission-send-payroll"
              type="button"
              disabled={busy}
              className="rounded-md bg-[color:var(--color-fg,#111)] px-3 py-1.5 text-sm font-semibold text-[color:var(--color-bg,#fff)] disabled:opacity-50"
              onClick={() => void sendPayroll()}
            >
              ส่ง payroll
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
