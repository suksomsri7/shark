"use client";
// HR H2.11 ▸ การ์ดคำขอ + แถบเลือกหลายรายการของกล่องคำขอรวม (ภาพ 05 ซ้าย · ภาพ 01 "คำขออนุมัติ") — ข้อมูลทั้งหมดมาจากหน้า server (DTO ของ inbox.ts) ·
//   กดปุ่ม = decideInboxAction ตัวเดียว (การ์ด 1 รายการ = ชุด 1 รายการ · แถบล่าง = ชุดที่เลือก · R7) · รหัสชุดคงเดิมจนได้ผล ⇒ กดซ้ำ/ส่งซ้ำ = ผลเดิม ·
//   ไม่อนุมัติ = ต้องใส่เหตุผล · ผลต่อรายการ = ข้อความของชนิดนั้นทุกไบต์ · ไฟล์นี้ไม่ import อะไรที่ถึงฐานข้อมูล ◂
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatThaiDate, formatThaiTime } from "@/lib/ui/date";
import { decideInboxAction } from "./inbox-actions";
import { INBOX_BATCH_MAX, type InboxDecision, type InboxItem, type InboxResult } from "./inbox-shared";
import { INBOX_ADJ_KINDS, INBOX_ADJ_SOURCES, INBOX_CORR_ACTIONS, INBOX_CORR_KINDS, INBOX_LEAVE_CATEGORIES, INBOX_OT_DAYCLASS, INBOX_OT_TIMING, inboxCode, inboxInlineDecide, inboxSummary } from "./inbox-shared"; // HR H2.12 ▸ VIS-2 ป้ายแทนรหัสดิบ + สรุปร่วม ◂

type Any = Record<string, unknown>;
const btn = "btn btn-primary min-h-[44px] whitespace-nowrap text-sm";
const ghost = "btn btn-ghost min-h-[44px] whitespace-nowrap text-sm";
const muted = "text-[color:var(--color-muted)]";
const newKey = () => `ib-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const hm = (iso: string) => formatThaiTime(iso);
const minHm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const baht = (s: number) => `฿${(s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
// HR H2.12 ▸ VIS-2 งวด "2026-11" → "พ.ย. 2569" (ค่าที่อ่านไม่ออก = ค่าเดิม) ◂
const monthLabel = (p: string) => (/^\d{4}-\d{2}$/.test(p) ? new Date(`${p}-01T00:00:00Z`).toLocaleDateString("th-TH", { month: "short", year: "numeric", timeZone: "UTC" }) : p);

/** ค่าแบบมีป้ายกำกับ (VIS-1 A2) — ป้ายเสมอ ค่าว่าง = "—" */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className={`text-xs ${muted}`}>{label}</span>
      <span className="break-words text-sm">{children}</span>
    </div>
  );
}

function Detail({ it }: { it: InboxItem }) {
  const t = useTranslations("hr.inbox");
  const tc = useTranslations("hr.settings.categories"); // HR H2.12 ▸ VIS-2 ป้ายหมวดการลาของโมดูลตั้งค่า ◂
  const d = it.detail as Any;
  const none = t("f.none");
  if (it.type === "LEAVE") {
    const from = String(d.fromDate);
    const to = String(d.toDate);
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label={t("f.dates")}>{from === to ? formatThaiDate(from) : `${formatThaiDate(from)} – ${formatThaiDate(to)}`}</Field>
        <Field label={t("f.days")}>{d.days ? t("f.daysN", { n: String(d.days) }) : none}{d.halfDay ? ` · ${t("f.halfDay")}` : ""}{d.hours ? ` · ${String(d.hours)} ${t("f.hours")}` : ""}</Field>
        <Field label={t("f.policy")}>{d.policyName ? String(d.policyName) : inboxCode(INBOX_LEAVE_CATEGORIES, d.category) ? tc(inboxCode(INBOX_LEAVE_CATEGORIES, d.category)!) : none /* HR H2.12 ▸ VIS-2 ◂ */}</Field>
        {"reason" in d && <Field label={t("f.reason")}>{String(d.reason ?? none)}</Field>}
        {d.needsAttachment === true && <Field label={t("f.attachNeeded")}>✓</Field>}
      </div>
    );
  }
  if (it.type === "OT") {
    const bp = typeof d.multiplierBp === "number" ? d.multiplierBp : null;
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label={t("f.otDate")}>{formatThaiDate(String(d.date))}</Field>
        <Field label={t("f.otTime")}>{`${hm(String(d.startAt))}–${hm(String(d.endAt))}`}</Field>
        <Field label={t("f.otMin")}>{t("f.otMinN", { n: String(d.requestedMin) })}</Field>
        <Field label={t("f.otRate")}>{bp ? t("f.otRateN", { n: String(bp / 10000) }) : t("f.otRateNone")}</Field>
        <Field label={t("f.dayClass")}>{inboxCode(INBOX_OT_DAYCLASS, d.dayClass) ? t(`f.${inboxCode(INBOX_OT_DAYCLASS, d.dayClass)!}`) : none}</Field>
        <Field label={t("f.timing")}>{inboxCode(INBOX_OT_TIMING, d.timing) ? t(`f.${inboxCode(INBOX_OT_TIMING, d.timing)!}`) : none}</Field>
        <Field label={t("f.reason")}>{String(d.reason ?? none)}</Field>
      </div>
    );
  }
  if (it.type === "SWAP") {
    const side = (s: unknown) => {
      const x = s as Any | null;
      return x ? `${formatThaiDate(String(x.date))} · ${String(x.shiftName ?? "")} ${minHm(Number(x.startMin))}–${minHm(Number(x.endMin))}` : t("f.swapHidden");
    };
    return (
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Field label={t("f.swapWith")}>{String((d.target as Any)?.name ?? none)}</Field>
        <Field label={t("f.swapFrom")}>{side(d.from)}</Field>
        {d.shape === "SWAP" && <Field label={t("f.swapTo")}>{side(d.to)}</Field>}
        {"reason" in d && <Field label={t("f.reason")}>{String(d.reason ?? none)}</Field>}
      </div>
    );
  }
  if (it.type === "CORRECTION") {
    const ev = (d.evidence as Any | null)?.posShifts as Any[] | undefined;
    const kind = String(d.kind);
    const action = String(d.action);
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label={t("f.corrAction")}>{`${inboxCode(INBOX_CORR_ACTIONS, action) ? t(`f.${inboxCode(INBOX_CORR_ACTIONS, action)!}`) : none} · ${inboxCode(INBOX_CORR_KINDS, kind) ? t(`f.${inboxCode(INBOX_CORR_KINDS, kind)!}`) : none}`}</Field>
        <Field label={t("f.corrDay")}>{d.day ? formatThaiDate(String(d.day)) : none}</Field>
        <Field label={t("f.original")}>{d.originalAt ? hm(String(d.originalAt)) : none}</Field>
        <Field label={t("f.proposed")}>{d.proposedAt ? hm(String(d.proposedAt)) : none}</Field>
        <Field label={t("f.reason")}>{String(d.reason ?? none)}</Field>
        {d.filedOnBehalf === true && <Field label={t("f.onBehalf")}>✓</Field>}
        {typeof d.periodCount === "number" && d.repeat === true && <Field label={t("f.repeatN", { n: String(d.periodCount) })}>⚠</Field>}
        {!!ev?.length && <Field label={t("f.evidence")}>{ev.map((s) => `${t("f.evidenceShift", { n: String(s.shiftNo) })} ${s.openedAt ? hm(String(s.openedAt)) : ""}–${s.closedAt ? hm(String(s.closedAt)) : ""}`).join(" · ")}</Field>}
      </div>
    );
  }
  const consent = d.consent as Any | null;
  const src = String(d.source);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Field label={t("f.adjKind")}>{inboxCode(INBOX_ADJ_KINDS, d.kind) ? t(`adjKinds.${inboxCode(INBOX_ADJ_KINDS, d.kind)!}`) : none /* HR H2.12 ▸ VIS-2 ◂ */}</Field>
      <Field label={t("f.amount")}>{baht(Number(d.amountSatang))}</Field>
      <Field label={t("f.period")}>{monthLabel(String(d.periodKey))}</Field>
      <Field label={t("f.source")}>{inboxCode(INBOX_ADJ_SOURCES, src) ? t(`f.${inboxCode(INBOX_ADJ_SOURCES, src)!}`) : none}</Field>
      {consent && <Field label={t("f.consent")}>{`${String(consent.ref)} · ${formatThaiDate(String(consent.at))}`}</Field>}
      {consent?.employeeEnded === true && (
        <p role="note" className="col-span-full text-sm text-[color:var(--color-danger)]">
          {t("f.employeeEnded")}
        </p>
      )}
      {!!d.note && <Field label={t("f.note")}>{String(d.note)}</Field>}
    </div>
  );
}

// HR H2.12 ▸ VIS-2 สรุป 1 บรรทัด (ตัวสรุปร่วม inboxSummary) — ใคร = ชื่อบนการ์ด · ชนิด · วัน/ช่วง · ชม./วัน · ฿ เฉพาะเมื่อ DTO มียอด (ผู้ดูเงินเดือน) ◂
function Summary({ it }: { it: InboxItem }) {
  const t = useTranslations("hr.inbox");
  const tc = useTranslations("hr.settings.categories");
  const sm = inboxSummary(it);
  if (!sm) return <p data-testid={`hr-inbox-summary-${it.id}`} className={`text-sm ${muted}`}>{t("sum.none")}</p>;
  const range = (a: string, b: string) => (a === b ? formatThaiDate(a) : `${formatThaiDate(a)} – ${formatThaiDate(b)}`);
  const hrs = (m: number) => t("sum.hoursN", { n: String(Math.round((m / 60) * 100) / 100) });
  const parts: string[] = [];
  if (sm.type === "LEAVE") {
    parts.push(sm.policyName ?? (sm.category ? tc(sm.category) : t("type.LEAVE")), range(sm.fromDate, sm.toDate));
    if (sm.hours) parts.push(`${sm.hours} ${t("f.hours")}`);
    else if (sm.days) parts.push(t("f.daysN", { n: sm.days }) + (sm.halfDay ? ` · ${t("f.halfDay")}` : ""));
  } else if (sm.type === "OT") {
    parts.push(formatThaiDate(sm.date), `${hm(sm.startAt)}–${hm(sm.endAt)}`, hrs(sm.minutes));
  } else if (sm.type === "SWAP") {
    const side = (x: typeof sm.from) => (x ? `${formatThaiDate(x.date)} · ${x.shiftName} ${minHm(x.startMin)}–${minHm(x.endMin)}` : t("f.swapHidden"));
    parts.push(`${t("f.swapWith")} ${sm.withName}`, side(sm.from));
    if (sm.swap) parts.push(`⇄ ${side(sm.to)}`);
  } else if (sm.type === "CORRECTION") {
    parts.push(`${t(`f.${sm.action}`)} · ${t(`f.${sm.kind}`)}`);
    if (sm.day) parts.push(formatThaiDate(sm.day));
    if (sm.originalAt || sm.proposedAt) parts.push(`${sm.originalAt ? hm(sm.originalAt) : "—"} → ${sm.proposedAt ? hm(sm.proposedAt) : "—"}`);
  } else {
    parts.push(sm.kind ? t(`adjKinds.${sm.kind}`) : t("type.ADJUSTMENT"));
    if (sm.amountSatang !== null) parts.push(baht(sm.amountSatang));
    parts.push(`${t("f.period")} ${monthLabel(sm.periodKey)}`);
  }
  return (
    <p data-testid={`hr-inbox-summary-${it.id}`} className="break-words text-sm font-medium">
      {parts.join(" · ")}
    </p>
  );
}

function Impact({ it }: { it: InboxItem }) {
  const t = useTranslations("hr.inbox");
  const im = it.impact as Any | null;
  if (!im) return null;
  const rows: [string, string][] = [];
  if (it.type === "LEAVE") {
    const b = im.balance as Any | null;
    if (b) rows.push([t("impact.balance"), `${t("impact.available")} ${b.available === null ? t("impact.unlimited") : String(b.available)} · ${t("impact.pending")} ${String(b.pending)} · ${t("impact.used")} ${String(b.used)}`]);
    const duty = im.duty as Any | null;
    rows.push([t("impact.duty"), duty && duty.ok === true ? ((duty.items as unknown[]).length ? t("impact.dutyN", { n: String((duty.items as unknown[]).length) }) : t("impact.dutyNone")) : t("impact.dutyHidden")]);
    const off = (im.othersOff as Any[]) ?? [];
    rows.push([t("impact.othersOff"), off.length ? off.map((o) => `${String(o.name)} ${formatThaiDate(String(o.fromDate))}${o.toDate !== o.fromDate ? `–${formatThaiDate(String(o.toDate))}` : ""}`).join(" · ") : t("impact.othersNone")]);
  } else if (it.type === "OT") {
    rows.push([t("impact.measured"), typeof im.measuredMin === "number" ? t("impact.measuredN", { n: String(im.measuredMin) }) : t("impact.measuredNone")]);
    rows.push([t("impact.title"), im.weekWarn ? t("impact.weekWarn") : t("impact.weekOk")]);
  } else if (it.type === "CORRECTION") {
    if (typeof im.deltaMin === "number") rows.push([t("impact.delta"), t("impact.deltaN", { n: String(im.deltaMin) })]);
    if (typeof im.monthClosed === "boolean") rows.push([t("impact.title"), im.monthClosed ? t("impact.monthClosed") : t("impact.monthOpen")]); // ผู้ดูเงินเดือนเท่านั้น (r2)
  } else if (it.type === "ADJUSTMENT") {
    rows.push([t("impact.targetPeriod"), im.targetPeriod ? monthLabel(String(im.targetPeriod)) : t("f.none")]); // HR H2.12 ▸ VIS-2 ◂
  }
  return (
    <div data-testid={`hr-inbox-impact-${it.id}`} className="flex flex-col gap-1 rounded-lg bg-[color:var(--color-surface-2)] px-3 py-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col text-sm sm:flex-row sm:gap-2">
          <span className={`shrink-0 text-xs ${muted} sm:w-44 sm:text-sm`}>{k}</span>
          <span className={`break-words ${im.monthClosed === true && k === t("impact.title") ? "text-[color:var(--color-danger)]" : ""}`}>{v}</span>
        </div>
      ))}
    </div>
  );
}

export default function InboxBatch({ systemId, items, compact = false, focus = null }: { systemId: string; items: InboxItem[]; compact?: boolean; focus?: string | null }) {
  const t = useTranslations("hr.inbox");
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState<null | { ids: string[]; at?: string }>(null); // HR H2.12 ▸ at = การ์ดที่กด (ช่องเหตุผลอยู่ในการ์ดนั้น) · ไม่มี = แถบเลือก ◂
  const [reason, setReason] = useState("");
  const [out, setOut] = useState<null | { results: InboxResult[]; replayed: boolean } | { error: string }>(null);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const byId = new Map(items.map((i) => [i.id, i] as const));
  const batchable = items.filter((i) => i.batchable);
  const nameOf = (id: string) => byId.get(id)?.employeeName ?? id;

  const send = (ids: string[], decision: InboxDecision, why?: string) => {
    const list = ids.map((id) => byId.get(id)).filter((x): x is InboxItem => !!x).map((x) => ({ type: x.type, id: x.id }));
    if (!list.length) return;
    // รหัสชุดเดิมจนกว่าจะได้ผล — กดซ้ำ/ส่งซ้ำระหว่างรอ = ชุดเดียวกัน (R8)
    const sig = `${decision}|${list.map((x) => `${x.type}:${x.id}`).join(",")}`;
    if (!keyRef.current || keyRef.current.sig !== sig) keyRef.current = { sig, key: newKey() };
    const batchKey = keyRef.current.key;
    start(async () => {
      const r = await decideInboxAction(systemId, { batchKey, decision, items: list, ...(why !== undefined ? { reason: why } : {}) });
      keyRef.current = null;
      if (!r.ok) {
        setOut({ error: r.reason });
        return;
      }
      setOut({ results: r.results, replayed: r.replayed });
      setSel(new Set());
      setAsk(null);
      setReason("");
      router.refresh();
    });
  };
  const toggle = (id: string) =>
    setSel((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else if (n.size < INBOX_BATCH_MAX) n.add(id);
      return n;
    });
  const selIds = [...sel].filter((id) => byId.get(id)?.batchable);
  const reasonOk = Array.from(reason.trim()).length >= 3 && Array.from(reason.trim()).length <= 200;

  const askBox = ask && (
        <div className="card flex flex-col gap-2 p-4" role="dialog" aria-label={t("rejectReason")}>
          <label className="flex flex-col gap-1 text-sm">
            {t("rejectReason")}
            <span className={`text-xs ${muted}`}>{ask.ids.map(nameOf).join(" · ")}</span>
            <textarea data-testid="hr-inbox-reject-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} rows={2} className="input" />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={ghost} onClick={() => (setAsk(null), setReason(""))}>
              {t("cancel")}
            </button>
            <button type="button" className={btn} disabled={!reasonOk || pending} onClick={() => send(ask.ids, "REJECTED", reason.trim())}>
              {t("rejectConfirm")}
            </button>
          </div>
        </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {out && (
        <div data-testid="hr-inbox-result" role="status" className="card flex flex-col gap-2 p-3">
          {"error" in out ? (
            <span className="text-sm text-[color:var(--color-danger)]">{out.error}</span>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                <span>{t("result.title")}</span>
                <span>{t("result.ok", { n: String(out.results.filter((r) => r.ok).length) })}</span>
                <span className="text-[color:var(--color-danger)]">{t("result.fail", { n: String(out.results.filter((r) => !r.ok).length) })}</span>
                {out.replayed && <span className={`text-xs ${muted}`}>{t("result.replayed")}</span>}
              </div>
              <ul className="flex flex-col gap-1 text-sm">
                {out.results.map((r) => (
                  <li key={`${r.type}:${r.id}`} className="flex flex-col sm:flex-row sm:gap-2">
                    <span className="font-medium">{`${t(`type.${r.type}` as "type.LEAVE")} · ${nameOf(r.id)}`}</span>
                    <span className={r.ok ? "" : "text-[color:var(--color-danger)]"}>{r.ok ? t(`result.${r.status === "REJECTED" ? "REJECTED" : "APPROVED"}`) : r.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {!compact && batchable.length > 0 && (
        <div
          data-testid="hr-inbox-batch"
          className="sticky top-14 z-20 rounded-xl bg-[color:var(--color-surface)] shadow-sm"
        >
          {/* HR H2.12 ▸ VIS-2 แถบเลือกอยู่บนสุดของรายการ (ภาพ 05) · ติดใต้แถบบน (top-14 · z-20 < แถบบน z-40) · พื้นทึบ surface ก่อน
               แล้วค่อยทินท์ accent-soft (สีแบรนด์ของร้านเป็น rgba 8% — ทินท์อย่างเดียวโปร่ง การ์ดจึงทะลุ) ◂ */}
          <div className="flex flex-col gap-2 rounded-xl border border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] p-3 sm:flex-row sm:items-center">
          <label className="flex min-h-[44px] items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={selIds.length > 0 && selIds.length === Math.min(batchable.length, INBOX_BATCH_MAX)}
              onChange={(e) => setSel(e.target.checked ? new Set(batchable.slice(0, INBOX_BATCH_MAX).map((i) => i.id)) : new Set())}
            />
            {selIds.length ? t("batch.selected", { n: String(selIds.length) }) : t("batch.selectAll")}
          </label>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button type="button" data-testid="hr-inbox-batch-reject" disabled={!selIds.length || pending} onClick={() => setAsk({ ids: selIds })} className={ghost}>
              {t("batch.reject", { n: String(selIds.length) })}
            </button>
            <button type="button" data-testid="hr-inbox-batch-approve" disabled={!selIds.length || pending} onClick={() => send(selIds, "APPROVED")} className={btn}>
              {pending ? t("batch.busy") : t("batch.approve", { n: String(selIds.length) })}
            </button>
          </div>
          </div>
        </div>
      )}
      {ask && !ask.at && askBox}

      {items.map((it) => {
        const checked = sel.has(it.id);
        return (
          <article
            key={it.id}
            id={`req-${it.id}`}
            data-testid={`hr-inbox-item-${it.id}`}
            className={`card flex flex-col gap-3 p-4 ${checked || focus === it.id ? "border-[color:var(--color-accent)]" : ""}`}
          >
            <div className="flex items-start gap-3">
              {!compact && (
                <label className="flex h-11 w-11 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    data-testid={`hr-inbox-check-${it.id}`}
                    aria-label={`${t(`type.${it.type}` as "type.LEAVE")} ${it.employeeName}`}
                    disabled={!it.batchable || pending}
                    checked={checked}
                    onChange={() => toggle(it.id)}
                    className="h-5 w-5"
                  />
                </label>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border px-2 py-0.5 text-xs font-medium">{t(`type.${it.type}` as "type.LEAVE")}</span>
                  <span className="font-semibold">{it.employeeName}</span>
                </div>
                <div className={`flex flex-wrap gap-x-3 text-xs ${muted}`}>
                  <span>{`${t("f.filed")} ${formatThaiDate(it.createdAt)}`}</span>
                  <span>{`${t("f.waited")} ${it.ageDays > 0 ? t("f.waitedDays", { n: String(it.ageDays) }) : t("f.waitedToday")}`}</span>
                </div>
              </div>
            </div>
            {compact && <Summary it={it} /> /* HR H2.12 ▸ VIS-2 การ์ดย่อบอกว่ากำลังอนุมัติอะไร ◂ */}
            {!compact && <Detail it={it} />}
            {!compact && <Impact it={it} />}
            {it.blocker && (
              <p className={`text-sm ${muted}`}>
                {it.blocker === "NO_RIGHT" && it.type === "SWAP" && (it.detail as Any).shape === "SWAP" && (it.detail as Any).to === null ? t("blocker.NO_RIGHT_BRANCH") : t(`blocker.${it.blocker}` as "blocker.CHAIN")}
                {it.blocker === "CHAIN" && (
                  <>
                    {" · "}
                    <a href="/app/approvals" className="underline">
                      {t("openApprovals")}
                    </a>
                  </>
                )}
              </p>
            )}
            {compact && it.canDecide && !inboxInlineDecide(it) && (
              /* HR H2.12 ▸ VIS-2 สรุปไม่ได้/รายการเงิน ⇒ เปิดดูในกล่องคำขอ แทนปุ่มอนุมัติแบบไม่เห็นรายละเอียด ◂ */
              <div className="flex flex-wrap justify-end gap-2">
                <a href={`/app/sys/${systemId}/hr/requests?type=${it.type}&focus=${encodeURIComponent(it.id)}#req-${it.id}`} data-testid={`hr-inbox-open-${it.id}`} className={ghost}>
                  {t("sum.open")}
                </a>
              </div>
            )}
            {it.canDecide && (!compact || inboxInlineDecide(it)) && (
              <div className="flex flex-wrap justify-end gap-2">
                {it.type === "ADJUSTMENT" && <span className={`mr-auto self-center text-xs ${muted}`}>{t("oneByOne")}</span>}
                <button type="button" data-testid={`hr-inbox-reject-${it.id}`} disabled={pending} onClick={() => setAsk({ ids: [it.id], at: it.id })} className={ghost}>
                  {t("reject")}
                </button>
                <button type="button" data-testid={`hr-inbox-approve-${it.id}`} disabled={pending} onClick={() => send([it.id], "APPROVED")} className={btn}>
                  {t("approve")}
                </button>
              </div>
            )}
            {ask?.at === it.id && askBox}
          </article>
        );
      })}


    </div>
  );
}
// ◂ HR H2.11
