"use client";

// DealMoveDialogs.tsx — ตัวย้ายขั้นของดีล + หน้าต่าง 3 แบบที่การย้ายอาจต้องใช้ (CRM v2 · ใบ C1.5 · พิมพ์เขียว §3.2 §11.3)
//   • แพ้ → เลือกเหตุผลที่แพ้ (บังคับ) + รายละเอียด
//   • ออกจากขั้นปิด (ชนะ/แพ้) กลับไปขั้นเปิด → เปิดดีลใหม่: ยืนยัน + เหตุผล ≥ 5 ตัวอักษร (ผู้จัดการขึ้นไป)
//   • เงื่อนไขก่อนเข้าขั้นไม่ครบ (STAGE_REQUIREMENTS) → กรอกช่องที่ขาดแล้วย้ายต่อ · รายการสินค้า/ใบเสนอราคา = ไปทำที่หน้าดีล
// ใช้ร่วมกันทั้งกระดาน (ลากวาง) และดีล 360 (stepper) — ข้อความ error ภาษาไทยจากบริการ แสดงในหน้าต่าง ไม่ใช้ alert()

import Link from "next/link";
import { useCallback, useState } from "react";
import { moveDealAction, reopenDealAction } from "@/lib/modules/crm/deals-actions";
import { DEAL_REASON_MIN, STAGE_FILLABLE_SYSTEM_KEYS, STAGE_REQUIRABLE_LABEL, type DealKind } from "@/lib/modules/crm/deals-shared";

export type MoveTarget = { id: string; name: string; kind: DealKind };
export type MoveRequest = { dealId: string; fromKind: DealKind; to: MoveTarget; onDone?: (ok: boolean) => void };

const FILLABLE = new Set<string>(STAGE_FILLABLE_SYSTEM_KEYS);
const SYSTEM_LABEL = STAGE_REQUIRABLE_LABEL as Record<string, string>;

function Modal({ testid, title, children }: { testid: string; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title} data-testid={testid}>
      <div className="card flex max-h-[90dvh] w-full max-w-md flex-col gap-3 overflow-y-auto p-4 sm:rounded-xl">
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function useDealMover(opts: {
  systemId: string;
  lostReasons: { id: string; label: string }[];
  fieldLabels: Record<string, string>;
  canReopen: boolean;
  onMoved: () => void;
}) {
  const { systemId, lostReasons, fieldLabels, canReopen, onMoved } = opts;
  const [lost, setLost] = useState<MoveRequest | null>(null);
  const [reopen, setReopen] = useState<MoveRequest | null>(null);
  const [req, setReq] = useState<{ r: MoveRequest; missing: string[]; message: string } | null>(null);
  const [lostReasonId, setLostReasonId] = useState("");
  const [lostNote, setLostNote] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const finish = useCallback((r: MoveRequest, ok: boolean) => {
    r.onDone?.(ok);
    if (ok) onMoved();
  }, [onMoved]);

  const run = useCallback(
    async (r: MoveRequest, extra: { lostReasonId?: string; lostNote?: string; requireFieldsValues?: Record<string, unknown> }) => {
      setBusy(true);
      setError(null);
      // รีวิว C1.5 S12: action ล้มระดับเครือข่าย/เซิร์ฟเวอร์ (throw) = คืนการ์ดที่เดิม + ปลด busy + ข้อความไทย (ไม่ค้างหมุน)
      let res: Awaited<ReturnType<typeof moveDealAction>>;
      try {
        res = await moveDealAction(systemId, r.dealId, { stageId: r.to.id, ...extra });
      } catch {
        res = { ok: false, error: "ย้ายดีลไม่สำเร็จ (เชื่อมต่อเซิร์ฟเวอร์ไม่ได้) — ระบบคืนดีลไว้ที่เดิมแล้ว ลองใหม่อีกครั้ง" };
        setLost(null);
        setReq(null);
        setToast(res.error);
        finish(r, false);
        return;
      } finally {
        setBusy(false);
      }
      if (res.ok) {
        setLost(null);
        setReq(null);
        finish(r, true);
        return;
      }
      if (res.code === "STAGE_REQUIREMENTS") {
        setLost(null);
        setValues({});
        setReq({ r, missing: res.missing ?? [], message: res.error });
        return;
      }
      if (lost || req) {
        setError(res.error);
        return;
      }
      setToast(res.error);
      finish(r, false);
    },
    [finish, lost, req, systemId],
  );

  /** ขอย้าย — ตัดสินว่าต้องเปิดหน้าต่างไหนก่อน */
  const requestMove = useCallback(
    (r: MoveRequest) => {
      setError(null);
      setToast(null);
      if (r.to.kind === "LOST") {
        setLostReasonId("");
        setLostNote("");
        setLost(r);
        return;
      }
      if (r.fromKind !== "OPEN" && r.to.kind === "OPEN") {
        if (!canReopen) {
          setToast("ดีลที่ปิดแล้วเปิดใหม่ได้เฉพาะผู้จัดการหรือเจ้าของร้าน — ขอให้ผู้จัดการช่วยดำเนินการ");
          r.onDone?.(false);
          return;
        }
        setReason("");
        setConfirm(false);
        setReopen(r);
        return;
      }
      void run(r, {});
    },
    [canReopen, run],
  );

  const cancel = (r: MoveRequest | null | undefined) => {
    setLost(null);
    setReopen(null);
    setReq(null);
    setError(null);
    if (r) r.onDone?.(false);
  };

  const submitReopen = async () => {
    if (!reopen) return;
    if (!confirm) return setError("ติ๊กช่องยืนยันก่อน");
    if (reason.trim().length < DEAL_REASON_MIN) return setError(`ใส่เหตุผลอย่างน้อย ${DEAL_REASON_MIN} ตัวอักษร`);
    setBusy(true);
    setError(null);
    let res: Awaited<ReturnType<typeof reopenDealAction>>;
    try {
      res = await reopenDealAction(systemId, reopen.dealId, { stageId: reopen.to.id, confirm, reason: reason.trim() });
    } catch {
      res = { ok: false, error: "เปิดดีลใหม่ไม่สำเร็จ (เชื่อมต่อเซิร์ฟเวอร์ไม่ได้) — ลองใหม่อีกครั้ง" };
    } finally {
      setBusy(false);
    }
    if (!res.ok) return setError(res.error);
    const r = reopen;
    setReopen(null);
    finish(r, true);
  };

  const labelOf = (k: string) => (k === "LINES" ? "รายการสินค้า" : k === "QUOTATION" ? "ใบเสนอราคา" : (SYSTEM_LABEL[k] ?? fieldLabels[k] ?? k));
  const fillable = req ? req.missing.filter((k) => k !== "LINES" && k !== "QUOTATION" && (FILLABLE.has(k) || !(k in SYSTEM_LABEL))) : [];
  const elsewhere = req ? req.missing.filter((k) => !fillable.includes(k)) : [];

  const dialogs = (
    <>
      {lost && (
        <Modal testid="deal-lost-modal" title={`ปิดดีลเป็น "${lost.to.name}"`}>
          <label className="flex flex-col gap-1 text-sm">
            <span>เหตุผลที่แพ้ (ต้องเลือก)</span>
            <select value={lostReasonId} onChange={(e) => setLostReasonId(e.target.value)} className="input text-sm" data-testid="deal-lost-reason">
              <option value="">— เลือกเหตุผล —</option>
              {lostReasons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          {lostReasons.length === 0 && <p className="text-xs text-[color:var(--color-muted)]">ยังไม่มีเหตุผลที่แพ้ในระบบนี้ — ให้ผู้ดูแลเพิ่มที่หน้าตั้งค่า "เหตุผลที่แพ้" ก่อน</p>}
          <label className="flex flex-col gap-1 text-sm">
            <span>รายละเอียดเพิ่มเติม (ไม่บังคับ)</span>
            <textarea value={lostNote} onChange={(e) => setLostNote(e.target.value)} rows={3} className="input text-sm" data-testid="deal-lost-note" />
          </label>
          {error && <p className="text-sm text-[color:var(--color-danger)]" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => cancel(lost)} data-testid="deal-lost-cancel">
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn btn-primary text-sm"
              disabled={busy}
              onClick={() => (lostReasonId ? void run(lost, { lostReasonId, lostNote: lostNote.trim() || undefined }) : setError("เลือกเหตุผลที่แพ้ก่อน"))}
              data-testid="deal-lost-confirm"
            >
              {busy ? "กำลังบันทึก…" : "ยืนยันปิดเป็นแพ้"}
            </button>
          </div>
        </Modal>
      )}
      {reopen && (
        <Modal testid="deal-reopen-modal" title={`เปิดดีลใหม่ที่ขั้น "${reopen.to.name}"`}>
          <p className="text-sm text-[color:var(--color-muted)]">ดีลนี้ปิดไปแล้ว การเปิดใหม่จะถูกบันทึกพร้อมเหตุผลไว้ในประวัติ</p>
          <label className="flex flex-col gap-1 text-sm">
            <span>เหตุผล (อย่างน้อย {DEAL_REASON_MIN} ตัวอักษร)</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="input text-sm" data-testid="deal-reopen-reason" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} data-testid="deal-reopen-confirm" />
            ยืนยันเปิดดีลนี้ใหม่
          </label>
          {error && <p className="text-sm text-[color:var(--color-danger)]" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => cancel(reopen)} data-testid="deal-reopen-cancel">
              ยกเลิก
            </button>
            <button type="button" className="btn btn-primary text-sm" disabled={busy} onClick={() => void submitReopen()} data-testid="deal-reopen-submit">
              {busy ? "กำลังบันทึก…" : "เปิดดีลใหม่"}
            </button>
          </div>
        </Modal>
      )}
      {req && (
        <Modal testid="deal-req-modal" title={`ขั้น "${req.r.to.name}" ต้องมีข้อมูลก่อน`}>
          <p className="text-sm text-[color:var(--color-muted)]">กรอกช่องที่ขาดด้านล่าง แล้วระบบจะย้ายดีลต่อให้</p>
          {fillable.map((k) => (
            <label key={k} className="flex flex-col gap-1 text-sm">
              <span>{labelOf(k)}</span>
              <input
                type={k === "expectedCloseAt" ? "date" : k === "probabilityOverride" ? "number" : "text"}
                min={k === "probabilityOverride" ? 0 : undefined}
                max={k === "probabilityOverride" ? 100 : undefined}
                value={values[k] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                className="input text-sm"
                data-testid={`deal-req-field-${k}`}
              />
            </label>
          ))}
          {elsewhere.length > 0 && (
            <p className="text-sm">
              ยังขาด {elsewhere.map(labelOf).join(" · ")} — ทำที่หน้าดีลก่อน{" "}
              <Link href={`/app/sys/${systemId}/crm/deals/${req.r.dealId}`} className="underline" data-testid="deal-req-open-link">
                เปิดหน้าดีล
              </Link>
            </p>
          )}
          {error && <p className="text-sm text-[color:var(--color-danger)]" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost text-sm" onClick={() => cancel(req.r)} data-testid="deal-req-cancel">
              ยกเลิก
            </button>
            {fillable.length > 0 && elsewhere.length === 0 && (
              <button
                type="button"
                className="btn btn-primary text-sm"
                disabled={busy}
                onClick={() => {
                  const out: Record<string, unknown> = {};
                  for (const k of fillable) {
                    const v = (values[k] ?? "").trim();
                    if (!v) return setError(`กรอก "${labelOf(k)}" ก่อน`);
                    out[k] = k === "probabilityOverride" ? Number(v) : v;
                  }
                  void run(req.r, { requireFieldsValues: out });
                }}
                data-testid="deal-req-submit"
              >
                {busy ? "กำลังบันทึก…" : "บันทึกแล้วย้ายต่อ"}
              </button>
            )}
          </div>
        </Modal>
      )}
      {toast && (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-lg px-4 py-3 text-sm text-white shadow-lg" style={{ background: "var(--color-danger)" }} role="status" data-testid="deal-move-toast">
          <div className="flex items-start justify-between gap-3">
            <span>{toast}</span>
            <button type="button" className="shrink-0 text-white/90 underline" onClick={() => setToast(null)} data-testid="deal-move-toast-close">
              ปิด
            </button>
          </div>
        </div>
      )}
    </>
  );

  return { requestMove, dialogs };
}
