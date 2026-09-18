"use client";

// Deal360Actions.tsx — ส่วนที่กด/กรอกได้ของหน้าดีล 360 (CRM v2 · ใบ C1.5 · พิมพ์เขียว §3.3 · ภาพ 03)
//   stepper ขั้น (คลิกย้ายได้ + หน้าต่างแพ้/เปิดใหม่/เงื่อนไข) · ปุ่มเอกสาร · ฟิลด์หัวดีล · รายการสินค้า (→ ขออนุมัติส่วนลด) · เมนู (ย้าย pipeline · ลบ)
// 🔴 ตรวจช่องแบบ inline (ไม่ใช้ alert) · ข้อความไทยจากบริการแสดงใต้ส่วนนั้น · การกระทำอันตราย = ยืนยัน + เหตุผล (X9)

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  changePipelineAction,
  deleteDealAction,
  issueInvoiceAction,
  issueQuotationAction,
  reassignDealAction,
  setForecastCategoryAction,
  setLinesAction,
  setNextStepAction,
  updateDealAction,
} from "@/lib/modules/crm/deals-actions";
import {
  DEAL_LINES_MAX,
  DEAL_REASON_MIN,
  FORECAST_CATEGORIES,
  FORECAST_CATEGORY_LABEL,
  bahtTextToSatang,
  checkDealLines,
  formatBaht,
  lineAmountSatang,
  type DealKind,
  type ForecastCategory,
} from "@/lib/modules/crm/deals-shared";
import { useDealMover } from "./DealMoveDialogs";

type Opt = { id: string; name: string };

function Msg({ m, testid }: { m: { ok: boolean; text: string } | null; testid: string }) {
  if (!m) return null;
  return (
    <p className="text-sm" style={{ color: m.ok ? "var(--color-accent)" : "var(--color-danger)" }} role="status" data-testid={testid}>
      {m.text}
    </p>
  );
}

/** stepper ขั้น (คลิกย้าย) + ปุ่ม "แพ้" + "เปิดดีลใหม่" */
export function DealStageStepper({
  systemId,
  dealId,
  kind,
  currentStageId,
  stages,
  lostReasons,
  fieldLabels,
  canReopen,
  daysInStage,
}: {
  systemId: string;
  dealId: string;
  kind: DealKind;
  currentStageId: string;
  stages: { id: string; name: string; kind: DealKind; probability: number }[];
  lostReasons: { id: string; label: string }[];
  fieldLabels: Record<string, string>;
  canReopen: boolean;
  daysInStage: number;
}) {
  const router = useRouter();
  const mover = useDealMover({ systemId, lostReasons, fieldLabels, canReopen, onMoved: () => router.refresh() });
  const lostStage = stages.find((s) => s.kind === "LOST");
  const firstOpen = stages.find((s) => s.kind === "OPEN");
  const go = (s: { id: string; name: string; kind: DealKind }) => {
    if (s.id === currentStageId) return;
    mover.requestMove({ dealId, fromKind: kind, to: s });
  };
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs" aria-label="ขั้นของดีล" data-testid="deal-stepper">
        {stages.map((s, i) => {
          const cur = s.id === currentStageId;
          return (
            <li key={s.id} className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => go(s)}
                aria-current={cur ? "step" : undefined}
                className="rounded-full border px-2.5 py-1"
                style={cur ? { borderColor: "var(--color-accent)", color: "var(--color-accent)", fontWeight: 700 } : { color: "var(--color-muted)" }}
                data-testid={`deal-stage-step-${s.id}`}
              >
                {cur ? "● " : ""}
                {s.name}
                {cur && s.kind === "OPEN" ? ` — ${s.probability}%` : ""}
              </button>
              {i < stages.length - 1 && <span className="text-[color:var(--color-muted)]" aria-hidden>›</span>}
            </li>
          );
        })}
        <li className="text-[color:var(--color-muted)]">อยู่ขั้นนี้มา {daysInStage.toLocaleString("th-TH")} วัน</li>
      </ol>
      <div className="flex flex-wrap gap-2">
        {kind === "OPEN" && lostStage && (
          <button type="button" className="btn btn-ghost text-sm" onClick={() => go(lostStage)} data-testid="deal-lost-btn">
            แพ้ (ระบุเหตุผล)
          </button>
        )}
        {kind !== "OPEN" && canReopen && firstOpen && (
          <button type="button" className="btn btn-ghost text-sm" onClick={() => go(firstOpen)} data-testid="deal-reopen-btn">
            เปิดดีลใหม่
          </button>
        )}
      </div>
      {mover.dialogs}
    </div>
  );
}

/** ปุ่มออกใบเสนอราคา / ใบแจ้งหนี้ */
export function DealDocButtons({ systemId, dealId, hasQuotation, hasInvoice }: { systemId: string; dealId: string; hasQuotation: boolean; hasInvoice: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const quote = async () => {
    setBusy(true);
    const r = await issueQuotationAction(systemId, dealId, { validDays: 30 });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: r.created ? "ออกใบเสนอราคา (ร่าง) ในระบบบัญชีแล้ว" : "ดีลนี้มีใบเสนอราคาอยู่แล้ว — เปิดดูได้ที่ส่วนเอกสารบัญชี" });
    router.refresh();
  };
  const invoice = async () => {
    setBusy(true);
    const r = await issueInvoiceAction(systemId, dealId);
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: r.created ? "ออกใบแจ้งหนี้ (ร่าง) ในระบบบัญชีแล้ว" : "ดีลนี้มีใบแจ้งหนี้อยู่แล้ว" });
    router.refresh();
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-primary text-sm" disabled={busy} onClick={() => void quote()} data-testid="deal-quote-btn">
          {hasQuotation ? "ดูใบเสนอราคา" : "ออกใบเสนอราคา"}
        </button>
        <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void invoice()} data-testid="deal-invoice-btn">
          {hasInvoice ? "ดูใบแจ้งหนี้" : "ออกใบแจ้งหนี้"}
        </button>
      </div>
      <Msg m={msg} testid="deal-doc-msg" />
    </div>
  );
}

/** ฟิลด์หัวดีล: ชื่อ · มูลค่า (เมื่อไม่มีรายการ) · วันปิด · ผู้ดูแล · หมวดพยากรณ์ · ขั้นถัดไป */
export function DealFieldsEditor({
  systemId,
  dealId,
  title,
  valueSatang,
  hasLines,
  open,
  expectedCloseAt,
  ownerUserId,
  owners,
  forecastCategory,
  nextStep,
}: {
  systemId: string;
  dealId: string;
  title: string;
  valueSatang: number;
  hasLines: boolean;
  open: boolean;
  expectedCloseAt: string | null;
  ownerUserId: string | null;
  owners: Opt[];
  forecastCategory: ForecastCategory;
  nextStep: string | null;
}) {
  const router = useRouter();
  const [t, setT] = useState(title);
  const [v, setV] = useState(String(valueSatang / 100));
  const [close, setClose] = useState(expectedCloseAt ?? "");
  const [owner, setOwner] = useState(ownerUserId ?? "");
  const [cat, setCat] = useState<string>(forecastCategory);
  const [next, setNext] = useState(nextStep ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusy(true);
    const r = await f();
    setBusy(false);
    setMsg(r.ok ? { ok: true, text: "บันทึกแล้ว" } : { ok: false, text: r.error });
    if (r.ok) router.refresh();
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="deal-fields">
      <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)] sm:col-span-2">
        <span>ชื่อดีล</span>
        <span className="flex gap-2">
          <input value={t} onChange={(e) => setT(e.target.value)} className="input min-w-0 flex-1 text-sm" data-testid="deal-title-input" />
          <button type="button" className="btn btn-ghost text-sm" disabled={busy || t === title} onClick={() => void run(() => updateDealAction(systemId, dealId, { title: t }))} data-testid="deal-title-save">
            บันทึก
          </button>
        </span>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        <span>มูลค่า (บาท · ก่อน VAT)</span>
        {hasLines ? (
          <span className="text-sm text-[color:var(--color-fg,inherit)]">{formatBaht(valueSatang)} — คิดจากรายการสินค้า</span>
        ) : (
          <span className="flex gap-2">
            <input value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" disabled={!open} className="input min-w-0 flex-1 text-sm" data-testid="deal-value-input" />
            <button
              type="button"
              className="btn btn-ghost text-sm"
              disabled={busy || !open}
              onClick={() => {
                const s = bahtTextToSatang(v);
                if (s === null) return setMsg({ ok: false, text: "มูลค่าต้องเป็นตัวเลข (บาท) ทศนิยมไม่เกิน 2 ตำแหน่ง" });
                void run(() => updateDealAction(systemId, dealId, { valueSatang: s }));
              }}
              data-testid="deal-value-save"
            >
              บันทึก
            </button>
          </span>
        )}
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        <span>วันที่คาดว่าจะปิด</span>
        <span className="flex gap-2">
          <input type="date" value={close} onChange={(e) => setClose(e.target.value)} className="input min-w-0 flex-1 text-sm" data-testid="deal-close-input" />
          <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void run(() => updateDealAction(systemId, dealId, { expectedCloseAt: close || null }))} data-testid="deal-close-save">
            บันทึก
          </button>
        </span>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        <span>ผู้ดูแล</span>
        <select
          value={owner}
          onChange={(e) => {
            setOwner(e.target.value);
            void run(() => reassignDealAction(systemId, dealId, e.target.value || null));
          }}
          className="input text-sm"
          data-testid="deal-owner-select"
        >
          <option value="">ยังไม่มีผู้ดูแล</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)]">
        <span>หมวดพยากรณ์</span>
        <select
          value={cat}
          onChange={(e) => {
            setCat(e.target.value);
            void run(() => setForecastCategoryAction(systemId, dealId, e.target.value));
          }}
          className="input text-sm"
          data-testid="deal-forecast-select"
        >
          {FORECAST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {FORECAST_CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-[color:var(--color-muted)] sm:col-span-2">
        <span>ขั้นถัดไป</span>
        <span className="flex gap-2">
          <input value={next} onChange={(e) => setNext(e.target.value)} className="input min-w-0 flex-1 text-sm" placeholder="เช่น นัดสาธิตวันพฤหัส" data-testid="deal-next-step-input" />
          <button type="button" className="btn btn-ghost text-sm" disabled={busy} onClick={() => void run(() => setNextStepAction(systemId, dealId, next))} data-testid="deal-next-step-save">
            บันทึก
          </button>
        </span>
      </label>
      <div className="sm:col-span-2">
        <Msg m={msg} testid="deal-fields-msg" />
      </div>
    </div>
  );
}

type LineDraft = { key: string; name: string; qty: string; price: string; disc: string; productId: string | null; vat: string; note: string };
/** อัตราภาษีต่อบรรทัด (รีวิว C1.5 S10) — "" = ตามการตั้งค่าบัญชี · 700 = 7 % · 0 = 0 % · -1 = ยกเว้น */
const VAT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "VAT ตามบัญชี" },
  { value: "700", label: "VAT 7%" },
  { value: "0", label: "VAT 0%" },
  { value: "-1", label: "ยกเว้น VAT" },
];
let draftSeq = 0;
const newKey = () => `n${(draftSeq += 1)}`;

/** รายการสินค้า — แก้ทั้งชุดแล้วบันทึกครั้งเดียว (มูลค่า = Σ บรรทัด − ส่วนลดท้ายดีล) · ส่วนลดเกินเพดาน → ขออนุมัติ */
export function DealLinesEditor({
  systemId,
  dealId,
  lines,
  discountBp,
  editable,
  pendingApproval,
}: {
  systemId: string;
  dealId: string;
  lines: { name: string; qty: number; unitPriceSatang: number; discountBp: number; productId: string | null; vatRateBp: number | null; note: string | null }[];
  discountBp: number;
  editable: boolean;
  pendingApproval: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<LineDraft[]>(() =>
    lines.map((l) => ({ key: newKey(), name: l.name, qty: String(l.qty), price: String(l.unitPriceSatang / 100), disc: String(l.discountBp / 100), productId: l.productId, vat: l.vatRateBp === null ? "" : String(l.vatRateBp), note: l.note ?? "" })),
  );
  const [dealDisc, setDealDisc] = useState(String(discountBp / 100));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => {
    const ls = rows.map((r) => ({
      name: r.name,
      qty: Number(r.qty),
      unitPriceSatang: bahtTextToSatang(r.price) ?? Number.NaN,
      discountBp: Math.round(Number(r.disc || "0") * 100),
      productId: r.productId,
      vatRateBp: r.vat === "" ? null : Number(r.vat),
      note: r.note.trim() || null,
    }));
    return checkDealLines(ls, Math.round(Number(dealDisc || "0") * 100));
  }, [rows, dealDisc]);

  const set = (key: string, patch: Partial<LineDraft>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!parsed.ok) return setMsg({ ok: false, text: parsed.error });
    setBusy(true);
    const r = await setLinesAction(systemId, dealId, { lines: parsed.lines, discountBp: parsed.dealDiscountBp });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg(r.status === "APPROVAL_REQUIRED" ? { ok: true, text: "ส่วนลดเกินเพดานของบัญชีนี้ — ส่งขออนุมัติแล้ว รายการใหม่จะใช้เมื่อผู้อนุมัติกดผ่าน" } : { ok: true, text: "บันทึกรายการแล้ว" });
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-2" data-testid="deal-lines-editor">
      {pendingApproval && (
        <p className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--color-accent)" }} data-testid="deal-lines-pending">
          มีรายการที่รออนุมัติส่วนลดอยู่ — ตัวเลขด้านล่างเป็นชุดที่ใช้อยู่ตอนนี้
        </p>
      )}
      <div className="hidden grid-cols-[minmax(0,1fr)_70px_100px_70px_100px_28px] gap-2 text-xs font-semibold text-[color:var(--color-muted)] md:grid">
        <span>สินค้า/บริการ</span>
        <span className="text-right">จำนวน</span>
        <span className="text-right">ราคา/หน่วย</span>
        <span className="text-right">ส่วนลด %</span>
        <span className="text-right">ยอดรวม</span>
        <span />
      </div>
      {rows.length === 0 && <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีรายการ — มูลค่าดีลกรอกเองได้จนกว่าจะเพิ่มรายการ</p>}
      {rows.map((r, i) => {
        const amt = lineAmountSatang({ qty: Number(r.qty) || 0, unitPriceSatang: bahtTextToSatang(r.price) ?? 0, discountBp: Math.round(Number(r.disc || "0") * 100) });
        return (
          <div key={r.key} className="grid grid-cols-2 gap-2 border-b pb-2 md:grid-cols-[minmax(0,1fr)_70px_100px_70px_100px_28px] md:items-center md:border-0 md:pb-0">
            <input value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} disabled={!editable} aria-label={`ชื่อสินค้า บรรทัด ${i + 1}`} className="input col-span-2 min-w-0 text-sm md:col-span-1" data-testid={`deal-line-name-${i}`} />
            <input value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value })} disabled={!editable} inputMode="decimal" aria-label={`จำนวน บรรทัด ${i + 1}`} className="input text-right text-sm" data-testid={`deal-line-qty-${i}`} />
            <input value={r.price} onChange={(e) => set(r.key, { price: e.target.value })} disabled={!editable} inputMode="decimal" aria-label={`ราคาต่อหน่วย บรรทัด ${i + 1}`} className="input text-right text-sm" data-testid={`deal-line-price-${i}`} />
            <input value={r.disc} onChange={(e) => set(r.key, { disc: e.target.value })} disabled={!editable} inputMode="decimal" aria-label={`ส่วนลด % บรรทัด ${i + 1}`} className="input text-right text-sm" data-testid={`deal-line-discount-${i}`} />
            <span className="self-center text-right text-sm">{formatBaht(amt)}</span>
            {editable ? (
              <button type="button" className="text-[color:var(--color-muted)]" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`ลบบรรทัด ${i + 1}`} data-testid={`deal-line-remove-${i}`}>
                ✕
              </button>
            ) : (
              <span />
            )}
            <span className="col-span-2 flex flex-wrap gap-2 md:col-span-6">
              <select value={r.vat} onChange={(e) => set(r.key, { vat: e.target.value })} disabled={!editable} aria-label={`ภาษี บรรทัด ${i + 1}`} className="input w-36 text-xs" data-testid={`deal-line-vat-${i}`}>
                {VAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input value={r.note} onChange={(e) => set(r.key, { note: e.target.value })} disabled={!editable} placeholder="หมายเหตุบรรทัด" aria-label={`หมายเหตุ บรรทัด ${i + 1}`} className="input min-w-0 flex-1 text-xs" data-testid={`deal-line-note-${i}`} />
            </span>
          </div>
        );
      })}
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="btn btn-ghost text-sm"
            disabled={rows.length >= DEAL_LINES_MAX}
            onClick={() => setRows((rs) => [...rs, { key: newKey(), name: "", qty: "1", price: "0", disc: "0", productId: null, vat: "", note: "" }])}
            data-testid="deal-line-add"
          >
            + เพิ่มรายการ
          </button>
          <label className="flex items-center gap-2 text-sm">
            ส่วนลดท้ายดีล %
            <input value={dealDisc} onChange={(e) => setDealDisc(e.target.value)} inputMode="decimal" className="input w-20 text-right text-sm" data-testid="deal-lines-discount" />
          </label>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm">
        {parsed.ok ? (
          <>
            <span className="text-[color:var(--color-muted)]">ยอดรวมรายการ {formatBaht(parsed.subtotalSatang)}</span>
            {parsed.discountSatang > 0 && <span className="text-[color:var(--color-muted)]">ส่วนลด {formatBaht(parsed.discountSatang)}</span>}
            <span className="font-semibold">มูลค่าดีล (ก่อน VAT) {formatBaht(parsed.valueSatang)}</span>
          </>
        ) : (
          <span className="text-[color:var(--color-danger)]">{parsed.error}</span>
        )}
      </div>
      {editable && (
        <div className="flex justify-end">
          <button type="button" className="btn btn-primary text-sm" disabled={busy} onClick={() => void save()} data-testid="deal-lines-save">
            {busy ? "กำลังบันทึก…" : "บันทึกรายการ"}
          </button>
        </div>
      )}
      <Msg m={msg} testid="deal-lines-msg" />
    </div>
  );
}

/** เมนู "…": ย้าย pipeline (ผู้จัดการ) · ลบดีล (ยืนยัน + เหตุผล) */
export function DealMenu({
  systemId,
  dealId,
  pipelines,
  currentPipelineId,
  canManage,
  deletable,
}: {
  systemId: string;
  dealId: string;
  pipelines: Opt[];
  currentPipelineId: string;
  canManage: boolean;
  deletable: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [del, setDel] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const others = pipelines.filter((p) => p.id !== currentPipelineId);
  return (
    <div className="relative">
      <button type="button" className="btn btn-ghost text-sm" aria-expanded={open} aria-label="เมนูของดีล" onClick={() => setOpen((o) => !o)} data-testid="deal-menu">
        ⋯
      </button>
      {open && (
        <div className="card absolute right-0 z-40 mt-1 flex w-[min(20rem,86vw)] flex-col gap-3 p-3 text-sm shadow-lg" data-testid="deal-menu-panel">
          {canManage && others.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-[color:var(--color-muted)]">ย้ายไป pipeline อื่น (ไปขั้นเปิดแรก)</span>
              <span className="flex gap-2">
                <select value={target} onChange={(e) => setTarget(e.target.value)} className="input min-w-0 flex-1 text-sm" data-testid="deal-change-pipeline">
                  <option value="">— เลือก pipeline —</option>
                  {others.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost text-sm"
                  disabled={busy || !target}
                  onClick={async () => {
                    setBusy(true);
                    const r = await changePipelineAction(systemId, dealId, target);
                    setBusy(false);
                    setMsg(r.ok ? { ok: true, text: "ย้าย pipeline แล้ว" } : { ok: false, text: r.error });
                    if (r.ok) router.refresh();
                  }}
                  data-testid="deal-change-pipeline-btn"
                >
                  ย้าย
                </button>
              </span>
            </div>
          )}
          {deletable ? (
            <button type="button" className="btn btn-ghost text-sm" style={{ color: "var(--color-danger)" }} onClick={() => setDel(true)} data-testid="deal-delete-btn">
              ลบดีลนี้
            </button>
          ) : (
            <p className="text-xs text-[color:var(--color-muted)]">ดีลที่ชนะแล้วหรือมีเอกสารบัญชีลบไม่ได้ — ย้ายเป็นแพ้พร้อมเหตุผลแทน</p>
          )}
          <Msg m={msg} testid="deal-menu-msg" />
        </div>
      )}
      {del && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="ลบดีล" data-testid="deal-delete-modal">
          <div className="card flex w-full max-w-md flex-col gap-3 p-4">
            <h2 className="font-semibold">ลบดีลนี้ถาวร</h2>
            <p className="text-sm text-[color:var(--color-muted)]">รายการสินค้าและประวัติขั้นของดีลจะหายไปด้วย · กิจกรรมยังอยู่ในไทม์ไลน์ของผู้ติดต่อ · เหตุผลถูกเก็บในประวัติการแก้ไข</p>
            <label className="flex flex-col gap-1 text-sm">
              <span>เหตุผล (อย่างน้อย {DEAL_REASON_MIN} ตัวอักษร)</span>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input text-sm" data-testid="deal-delete-reason" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="deal-delete-confirm" />
              ยืนยันลบดีลนี้
            </label>
            <Msg m={msg} testid="deal-delete-msg" />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost text-sm" onClick={() => setDel(false)} data-testid="deal-delete-cancel">
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={busy}
                onClick={async () => {
                  if (!confirm) return setMsg({ ok: false, text: "ติ๊กช่องยืนยันก่อน" });
                  if (reason.trim().length < DEAL_REASON_MIN) return setMsg({ ok: false, text: `ใส่เหตุผลอย่างน้อย ${DEAL_REASON_MIN} ตัวอักษร` });
                  setBusy(true);
                  const r = await deleteDealAction(systemId, dealId, confirm, reason.trim());
                  setBusy(false);
                  if (!r.ok) return setMsg({ ok: false, text: r.error });
                  router.push(`/app/sys/${systemId}/crm/deals`);
                }}
                data-testid="deal-delete-submit"
              >
                ลบดีล
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
