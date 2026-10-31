"use client";
// SVC D.12 ▸ จอ "ย้ายออก · คืนเงินประกัน" — ภาพอ้างอิง ledger/design-dorm/07-moveout-deposit.png (ซ้ายตรวจห้อง · ขวาแผงสรุป · แถบนับถอยหลังบน)
//   สัญญา DOM ledger/svc-briefs/svc-brief-d.12.md §7.1 · ข้อมูลทั้งหมดจาก moveOutModel/leaseChangeModel ของ facade หอ (ไฟล์นี้ import จากโมดูลได้เฉพาะ type)
//   • action รับทาง prop (ไม่ลาก prisma/โมดูลฝั่ง server/actions/next) ⇒ render ด้วย renderToStaticMarkup ได้
//   • SVC D.12 (Y2) ▸ ใช้งานได้จริงครบเส้น: แจ้งย้ายออก/ต่อสัญญา/ย้ายห้อง (MoveOutStart) · ตรวจห้อง (สลับปกติ/เสียหาย · ยอด · แคตตาล็อก ·
//     แนบไฟล์ · จดมิเตอร์) · ส่งใบสรุป · เปิดใบสรุปใหม่ · ยกเลิกการแจ้ง · ปิดประกัน — ทุกปุ่มเรียก action จริง · ข้อความสำเร็จ/ผิดพลาดภาษาไทย ◂
//   • ค่าเสื่อมสภาพปกติ "หักไม่ได้" — แถวปกติไม่มีช่องยอด/ยอดเงิน · ทุกรายการที่หักต้องมีหลักฐานที่แนบใบนี้ (ตรวจซ้ำที่ server)
//   • เงินแสดงจากสตางค์จำนวนเต็มของ model (ไม่คำนวณเงินบนจอ — ยอดที่พิมพ์ในฟอร์มส่งให้ server คิด) · ไม่มีเบอร์โทร/เลขบัตร · ข้อความบริการล้วน (ประกาศ สคบ.)
//   • เดสก์ท็อป 1440 = 2 คอลัมน์ · มือถือ 390 = ซ้อนลง ไม่ล้นแนวนอน
import { useState } from "react";
import type { LeaseChangeModel, MoveOutModel, SummaryLine } from "@/lib/modules/dorm";

type ActionFn = (...a: never[]) => Promise<unknown>;
export type MoveOutScreenProps = { unitSlug: string; model: MoveOutModel; actions?: Record<string, ActionFn> };

const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const WEEKDAY_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const pad2 = (n: number) => String(n).padStart(2, "0");
/** สตางค์ ⇒ "7,759.28" */
function money(satang: number): string {
  const a = Math.abs(Math.trunc(satang));
  return `${Math.trunc(a / 100).toLocaleString("en-US")}.${pad2(a % 100)}`;
}
const num = (n: number) => n.toLocaleString("en-US");
const ymdParts = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
};
/** "2026-11-07" ⇒ "7 พ.ย. 2569" */
function thDate(ymd: string): string {
  const p = ymdParts(ymd);
  return p ? `${p.d} ${MONTHS_SHORT[p.m - 1] ?? ""} ${p.y + 543}` : ymd;
}
/** "2026-09-30" ⇒ "30 ก.ย." */
function thDayMonth(ymd: string): string {
  const p = ymdParts(ymd);
  return p ? `${p.d} ${MONTHS_SHORT[p.m - 1] ?? ""}` : ymd;
}
/** วันในสัปดาห์จากเลขวัน (1 ม.ค. 1970 = พฤหัส) — ไม่พึ่งเขตเวลาของเครื่อง */
function thWeekday(ymd: string): string {
  const p = ymdParts(ymd);
  if (!p) return "";
  const days = Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000);
  return WEEKDAY_SHORT[(((days + 4) % 7) + 7) % 7] ?? "";
}
/** "350" / "350.5" ⇒ 35050 สตางค์ · ว่าง/ผิด ⇒ null */
function satangOf(s: string): number | null {
  const t = s.replace(/,/g, "").trim();
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return null;
  const [a, b = ""] = t.split(".");
  return Number(a) * 100 + Number(b.padEnd(2, "0"));
}
const bahtInput = (satang: number) => (satang > 0 ? (satang % 100 ? (satang / 100).toFixed(2) : String(satang / 100)) : "");

type Res = { ok?: unknown; code?: unknown; reason?: unknown };
const reasonOf = (r: unknown): string | null => {
  if (!r || typeof r !== "object") return "ระบบไม่ตอบกลับ — ยังไม่มีอะไรเปลี่ยน ลองใหม่อีกครั้ง";
  const x = r as Res;
  if (x.ok === true) return null;
  return typeof x.reason === "string" && x.reason ? x.reason : "ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง";
};
const BLOCK_TH: Record<string, string> = {
  NEEDS_APPROVAL: "รออนุมัติหักเกินวงเงินจากเจ้าของ",
  DEDUCTION_REJECTED: "เจ้าของไม่อนุมัติการหัก — เปิดใบสรุปใหม่แล้วแก้รายการหัก",
  NOT_FROZEN: "ส่งใบสรุปให้ผู้เช่าดูก่อน",
  NOT_MOVED_OUT: "ยังไม่ถึงวันย้ายออก",
  BILL_PENDING: "มีบิลที่ยังไม่ส่ง — ส่งหรือลบบิลในรอบบิลก่อน",
  SETTLED: "ปิดเงินประกันแล้ว",
  NOT_EDITABLE: "ใบนี้ถูกยกเลิก",
  NOT_INSPECTED: "ยังไม่ได้ตรวจห้อง",
  REOPENING: "กำลังเปิดใบสรุปใหม่ — กดเปิดใบสรุปใหม่อีกครั้งให้เสร็จ",
  FROZEN: "ส่งใบสรุปแล้ว — เปิดใบสรุปใหม่ก่อนจึงแก้ได้",
  RATE_MISSING: "ยังไม่มีอัตราค่าน้ำ/ไฟของเดือนวันออก",
  BASE_READING_MISSING: "ไม่พบเลขมิเตอร์ฐาน",
  METER_BACKWARDS: "เลขมิเตอร์วันออกต่ำกว่าเลขฐาน",
  METHOD_UNSUPPORTED: "วิธีคิดค่าน้ำไฟนี้ยังคิดถึงวันออกอัตโนมัติไม่ได้",
};
const OK_TH: Record<string, string> = {
  save: "บันทึกผลตรวจห้องแล้ว",
  files: "แนบไฟล์แล้ว",
  send: "ส่งใบสรุปให้ผู้เช่าแล้ว (ตรึงยอด)",
  settle: "ปิดเงินประกันแล้ว — ห้องตั้งเป็นรอทำความสะอาด",
  reopen: "เปิดใบสรุปใหม่แล้ว — แก้ผลตรวจห้องแล้วส่งใหม่",
  cancel: "ยกเลิกการแจ้งย้ายออกแล้ว",
  notice: "บันทึกการแจ้งย้ายออกแล้ว",
  renew: "ต่อสัญญาแล้ว",
  transfer: "ย้ายห้องแล้ว",
};

/** SVC D.12 (Y24) ▸ คำเตือนจากระบบ ⇒ ภาษาไทย (ไม่แสดงรหัสดิบ) */
const KIND_TH = (k: string | undefined) => (k === "ELEC" ? "ไฟ" : k === "WATER" ? "น้ำ" : "น้ำ/ไฟ");
function warnTh(w: string): string {
  const [code, a, b] = w.split(":");
  const amt = (x: string | undefined) => (x && /^\d+$/.test(x) ? `฿${money(Number(x))}` : "");
  switch (code) {
    case "RATE_MISSING":
      return `ยังไม่มีอัตราค่า${KIND_TH(a)}ของเดือนวันออก — ใส่บิลการไฟฟ้า/ประปาหรืออัตราคงที่ก่อน`;
    case "RATE_FROM":
      return `ใช้อัตราค่าน้ำไฟของงวด ${a ?? ""} (เดือนวันออกยังไม่มีอัตรา)`;
    case "BASE_READING_MISSING":
      return `ไม่พบเลขมิเตอร์${KIND_TH(a)}ที่ออกบิลครั้งล่าสุดหรือเลขวันเข้า`;
    case "METER_BACKWARDS":
      return `เลขมิเตอร์${KIND_TH(a)}วันออกต่ำกว่าเลขที่ออกบิลแล้ว — ตรวจเลขอีกครั้ง`;
    case "METHOD_UNSUPPORTED":
      return `วิธีคิดค่า${KIND_TH(a)}ของหอนี้ยังคิดถึงวันย้ายออกอัตโนมัติไม่ได้`;
    case "ADVANCE_RENT_LEFT":
      return `ค่าเช่าล่วงหน้าเหลือ ${amt(a)} ที่หักในใบนี้ไม่หมด — ระบบยังคืนนอกเงินประกันไม่ได้ (คืนเองแล้วบันทึกในบัญชี)`;
    case "RENT_EXCESS_LEFT":
      return `ค่าห้องเดือนสุดท้ายที่จ่ายเกินไว้ ${amt(a)} ลดหนี้ในบิลไม่ได้ (จ่ายแล้ว) — ระบบยังคืนนอกเงินประกันไม่ได้`;
    default:
      void b;
      return "มีรายการที่ต้องตรวจสอบเพิ่มเติม";
  }
}

function lineLabel(l: SummaryLine): string {
  if ((l.code === "ELEC" || l.code === "WATER") && l.qty && typeof l.unitPriceSatang === "number")
    return `หัก ${l.code === "ELEC" ? "ค่าไฟ" : "ค่าน้ำ"} ${num(l.qty)} × ${money(l.unitPriceSatang)}`;
  if (l.code === "DAMAGE") return `หัก ${l.labelTh} (${(l.evidenceCount ?? 0) > 0 ? "มีหลักฐาน" : "ไม่มีหลักฐาน"})`;
  if (l.code === "ADVANCE_RENT") return l.labelTh;
  return `หัก ${l.labelTh}`;
}

/** ตัวเรียก action ร่วม — busy · ข้อความไทย · สำเร็จแล้วโหลดหน้าใหม่ (ข้อมูลจาก server เท่านั้น) */
function useRunner(actions: Record<string, ActionFn> | undefined) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (name: string, input: unknown, opts?: { reload?: boolean; after?: (r: unknown) => void }) => {
    const fn = actions?.[name] as ((i: unknown) => Promise<unknown>) | undefined;
    if (!fn) {
      setMsg({ ok: false, text: "ปุ่มนี้ยังใช้ไม่ได้ในหน้านี้" });
      return null;
    }
    setBusy(name);
    setMsg(null);
    try {
      const r = await fn(input);
      const why = reasonOf(r);
      setMsg(why ? { ok: false, text: why } : { ok: true, text: OK_TH[name] ?? "บันทึกแล้ว" });
      if (!why) {
        opts?.after?.(r);
        if (opts?.reload !== false && typeof window !== "undefined") window.location.reload();
      }
      return why ? null : r;
    } catch {
      setMsg({ ok: false, text: "เชื่อมต่อระบบไม่สำเร็จ — ยังไม่มีอะไรเปลี่ยน ลองใหม่อีกครั้ง" });
      return null;
    } finally {
      setBusy(null);
    }
  };
  return { busy, msg, run };
}
const Msg = ({ msg }: { msg: { ok: boolean; text: string } | null }) =>
  msg ? (
    <p role="status" className={`text-xs ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>
      {msg.text}
    </p>
  ) : null;
const askReason = (q: string): string | null => {
  if (typeof window === "undefined") return null;
  const r = window.prompt(q);
  return r && r.trim() ? r.trim() : null;
};

type ItemState = { key: string; labelTh: string; verdict: "NORMAL" | "DAMAGE" | null; amount: string; damageCode: string; evidence: string[]; note: string };
type StepState = "done" | "current" | "todo";
export default function MoveOutScreen({ unitSlug, model, actions }: MoveOutScreenProps) {
  const { busy, msg, run } = useRunner(actions);
  const closed = model.status === "SETTLED" || model.status === "REFUNDED";
  const frozen = !!model.frozen;
  const editable = model.canInspect?.ok === true;
  const steps: { key: "NOTICE" | "INSPECT" | "SUMMARY" | "REFUND"; label: string; state: StepState }[] = [
    { key: "NOTICE", label: `แจ้งล่วงหน้า ${thDayMonth(model.noticeDate)}`, state: "done" },
    { key: "INSPECT", label: "ตรวจห้อง", state: closed || frozen ? "done" : "current" },
    { key: "SUMMARY", label: "สรุปเงิน", state: closed ? "done" : frozen ? "current" : "todo" },
    { key: "REFUND", label: "คืนเงิน", state: closed ? "done" : "todo" },
  ];
  const evidenceOf = model.itemEvidence ?? {};
  const codeOf = model.itemDamageCode ?? {};
  const [items, setItems] = useState<ItemState[]>(() =>
    model.checklist.map((c) => ({ key: c.key, labelTh: c.labelTh, verdict: c.verdict, amount: bahtInput(c.amountSatang), damageCode: codeOf[c.key] ?? "", evidence: evidenceOf[c.key] ?? [], note: c.note ?? "" })),
  );
  const [meterIn, setMeterIn] = useState<Record<string, string>>(() => Object.fromEntries(model.meters.map((m) => [m.meterId, m.value === null ? "" : String(m.value)])));
  const [newLabel, setNewLabel] = useState("");
  const [channel, setChannel] = useState<"TRANSFER" | "CASH" | "PROMPTPAY">("TRANSFER");
  const setItem = (key: string, patch: Partial<ItemState>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const catalog = model.catalog ?? [];
  const files = model.files ?? [];

  const unpaid = model.lines.filter((l) => l.code === "UNPAID");
  const settleBlocked = !model.canSettle.ok;
  const sendBlocked = !model.canSend.ok || frozen;
  const overdueDays = -model.daysLeft;

  const saveInspection = () => {
    const payload = {
      moveOutId: model.moveOutId,
      items: items.map((x) => ({
        key: x.key,
        labelTh: x.labelTh,
        verdict: x.verdict,
        damageCode: x.verdict === "DAMAGE" && x.damageCode ? x.damageCode : null,
        amountSatang: x.verdict === "DAMAGE" ? (x.amount.trim() === "" && x.damageCode ? undefined : (satangOf(x.amount) ?? -1)) : 0,
        evidenceFileIds: x.verdict === "DAMAGE" ? x.evidence : [],
        note: x.note || null,
      })),
      meterReadings: model.meters.filter((m) => (meterIn[m.meterId] ?? "").trim() !== "").map((m) => ({ meterId: m.meterId, value: Number((meterIn[m.meterId] ?? "").replace(/,/g, "")) })),
    };
    return run("save", payload).then(() => undefined);
  };
  const upload = async (itemKey: string, list: FileList | null) => {
    if (!list || !list.length) return;
    const fd = new FormData();
    fd.set("moveOutId", model.moveOutId);
    for (const f of Array.from(list)) fd.append("files", f);
    const r = (await run("files", fd, { reload: false })) as { added?: { fileId: string }[] } | null;
    if (r && Array.isArray(r.added)) {
      const ids = r.added.map((a) => a.fileId);
      setItems((xs) => xs.map((x) => (x.key === itemKey ? { ...x, evidence: [...x.evidence, ...ids] } : x)));
    }
  };
  const allItemsJudged = items.every((x) => x.verdict !== null);

  return (
    <div data-dorm-moveout={model.moveOutId} className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      {/* หัว + ขั้น */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="text-xl font-bold md:text-2xl">{`ย้ายออก · ห้อง ${model.roomNumber} · ${model.tenantName}`}</h1>
        <ol className="flex flex-wrap items-center gap-2 text-sm">
          {steps.map((s, i) => (
            <li key={s.key} data-moveout-step={s.key} data-state={s.state} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-bold ${s.state === "current" ? "border-[color:var(--color-accent,#2563eb)] bg-[color:var(--color-accent,#2563eb)] text-white" : "border-[color:var(--color-line,#d4d4d4)]"}`}
              >
                {s.state === "done" ? "✓" : i + 1}
              </span>
              <span className={s.state === "current" ? "font-bold text-[color:var(--color-accent,#2563eb)]" : "text-[color:var(--color-ink-soft)]"}>{s.label}</span>
              {i < steps.length - 1 ? <span aria-hidden className="hidden h-px w-8 bg-[color:var(--color-line,#d4d4d4)] sm:inline-block" /> : null}
            </li>
          ))}
        </ol>
        <span className="flex-1" />
        <span className="flex flex-wrap gap-2">
          {model.canCancel?.ok ? (
            <button
              type="button"
              data-action="cancel-notice"
              disabled={busy !== null}
              onClick={() => {
                const reason = askReason("เหตุผลที่ยกเลิกการแจ้งย้ายออก (อย่างน้อย 3 ตัวอักษร)");
                if (reason) void run("cancel", { moveOutId: model.moveOutId, reason });
              }}
              className="min-h-10 rounded-lg border px-3 text-sm disabled:opacity-50"
            >
              ยกเลิกการแจ้งย้ายออก
            </button>
          ) : null}
          {model.canReopen?.ok ? (
            <button
              type="button"
              data-action="reopen"
              disabled={busy !== null}
              onClick={() => {
                const reason = askReason("เหตุผลที่เปิดใบสรุปใหม่ (อย่างน้อย 3 ตัวอักษร) — ระบบออกใบลดหนี้ใบเดิมให้");
                if (reason) void run("reopen", { moveOutId: model.moveOutId, reason });
              }}
              className="min-h-10 rounded-lg border px-3 text-sm disabled:opacity-50"
            >
              {model.reopening ? "เปิดใบสรุปใหม่ (ทำต่อให้เสร็จ)" : "เปิดใบสรุปใหม่"}
            </button>
          ) : null}
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-4 lg:flex-row">
        {/* ซ้าย: นับถอยหลัง + ตรวจห้อง */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {!closed && model.status !== "CANCELLED" ? (
            <div
              data-refund-countdown
              data-days-left={String(model.daysLeft)}
              data-overdue={model.refundOverdue ? "true" : "false"}
              className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-3 text-sm ${model.refundOverdue ? "border-red-300 bg-red-50" : "border-blue-300 bg-blue-50"}`}
            >
              {model.refundOverdue ? (
                <span className="font-bold">{`เลยกำหนดคืนเงินประกัน ${overdueDays} วัน`}</span>
              ) : (
                <span>
                  <b>{`ต้องคืนเงินประกันภายใน ${thWeekday(model.refundDueDate)} ${thDate(model.refundDueDate)}`}</b>
                  {` (${model.returnDays} วันหลังย้ายออก) · ระบบเตือนผู้ดูแลทุกวันจนกว่าจะโอน`}
                </span>
              )}
              <span className="flex-1" />
              {!model.refundOverdue ? <span className="rounded-md border border-blue-400 px-2 py-0.5 text-xs font-bold text-blue-700">{`เหลือ ${model.daysLeft} วัน`}</span> : null}
            </div>
          ) : null}
          {model.status === "CANCELLED" ? <p className="rounded-xl border px-4 py-3 text-sm">ยกเลิกการแจ้งย้ายออกนี้แล้ว — ผู้เช่าอยู่ต่อตามสัญญาเดิม</p> : null}

          <section className="min-w-0 rounded-2xl border border-[color:var(--color-line,#e5e5e5)] bg-white">
            <header className="flex flex-wrap items-baseline gap-2 px-5 pb-1 pt-4">
              <h2 className="text-sm font-bold">{`ตรวจห้อง — เทียบรูปวันเข้า (${thDate(model.moveInDate)}) กับวันนี้`}</h2>
              <span className="flex-1" />
              <span className="text-xs text-[color:var(--color-ink-soft)]">ทุกจุดที่หักต้องมีรูป/ใบเสร็จ · ค่าเสื่อมจากการใช้งานปกติหักไม่ได้</span>
            </header>
            <div className="flex flex-col">
              {items.map((it) => {
                const dmg = it.verdict === "DAMAGE";
                const saved = model.checklist.find((c) => c.key === it.key);
                const shownAmount = dmg ? (satangOf(it.amount) ?? (it.amount.trim() === "" ? (catalog.find((c) => c.code === it.damageCode)?.amountSatang ?? saved?.amountSatang ?? 0) : 0)) : 0;
                return (
                  <div
                    key={it.key}
                    data-inspect-item={it.key}
                    data-verdict={it.verdict ?? ""}
                    className={`flex flex-wrap items-center gap-3 border-t border-[color:var(--color-line,#eee)] px-5 py-3 first:border-t-0 ${dmg ? "bg-neutral-50" : ""}`}
                  >
                    <span className="w-44 flex-none">
                      <b className={`block text-sm ${dmg ? "border-l-4 border-red-600 pl-2" : ""}`}>{it.labelTh}</b>
                      {editable ? (
                        <input
                          aria-label={`หมายเหตุ ${it.labelTh}`}
                          value={it.note}
                          maxLength={200}
                          onChange={(e) => setItem(it.key, { note: e.target.value })}
                          placeholder="หมายเหตุ (ถ้ามี)"
                          className="mt-1 w-full rounded border px-2 py-1 text-xs"
                        />
                      ) : it.note ? (
                        <small className="text-xs text-[color:var(--color-ink-soft)]">{it.note}</small>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      {model.moveInPhotos.length ? (
                        <a href={model.moveInPhotos[0].url} target="_blank" rel="noreferrer" className="flex h-12 w-20 items-center justify-center rounded-lg border bg-neutral-50 text-xs text-[color:var(--color-ink-soft)]">
                          วันเข้า
                        </a>
                      ) : null}
                      {dmg ? (
                        <span className="flex flex-col gap-1 text-xs text-[color:var(--color-ink-soft)]">
                          <span className="flex h-12 min-w-20 items-center justify-center rounded-lg border bg-neutral-50 px-2">{`หลักฐาน ${it.evidence.length} ไฟล์`}</span>
                          {it.evidence.map((fid) => {
                            const f = files.find((x) => x.fileId === fid);
                            return f ? (
                              <a key={fid} href={f.url} target="_blank" rel="noreferrer" className="underline">
                                ดูไฟล์
                              </a>
                            ) : null;
                          })}
                          {editable ? (
                            <label className="cursor-pointer rounded border px-2 py-1 text-center">
                              แนบรูป/ใบเสร็จ
                              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf" multiple className="sr-only" disabled={busy !== null} onChange={(e) => void upload(it.key, e.target.files)} />
                            </label>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex-1" />
                    <span className="inline-flex overflow-hidden rounded-lg border text-xs" role="group" aria-label="ผลตรวจ">
                      <button
                        type="button"
                        data-verdict-toggle="NORMAL"
                        disabled={!editable || busy !== null}
                        aria-pressed={it.verdict === "NORMAL"}
                        onClick={() => setItem(it.key, { verdict: "NORMAL" })}
                        className={`px-3 py-1.5 ${it.verdict === "NORMAL" ? "bg-neutral-900 font-bold text-white" : "text-[color:var(--color-ink-soft)]"}`}
                      >
                        ใช้งานปกติ
                      </button>
                      <button
                        type="button"
                        data-verdict-toggle="DAMAGE"
                        disabled={!editable || busy !== null}
                        aria-pressed={dmg}
                        onClick={() => setItem(it.key, { verdict: "DAMAGE" })}
                        className={`px-3 py-1.5 ${dmg ? "bg-red-600 font-bold text-white" : "text-[color:var(--color-ink-soft)]"}`}
                      >
                        เสียหาย
                      </button>
                    </span>
                    <span className="flex w-36 flex-col items-end gap-1 text-right text-sm font-bold tabular-nums">
                      {dmg ? `฿${money(shownAmount)}` : it.verdict === "NORMAL" ? <span className="font-normal text-[color:var(--color-ink-soft)]">หักไม่ได้</span> : "—"}
                      {dmg && editable ? (
                        <>
                          {catalog.length ? (
                            <select
                              aria-label="รายการค่าเสียหายมาตรฐาน"
                              value={it.damageCode}
                              onChange={(e) => setItem(it.key, { damageCode: e.target.value, amount: "" })}
                              className="w-full rounded border px-1 py-1 text-xs font-normal"
                            >
                              <option value="">กำหนดยอดเอง</option>
                              {catalog.map((c) => (
                                <option key={c.code} value={c.code}>{`${c.labelTh} ${money(c.amountSatang)}`}</option>
                              ))}
                            </select>
                          ) : null}
                          <input
                            aria-label={`ยอดหัก ${it.labelTh} (บาท)`}
                            inputMode="decimal"
                            value={it.amount}
                            onChange={(e) => setItem(it.key, { amount: e.target.value })}
                            placeholder="ยอด (บาท)"
                            className="w-full rounded border px-2 py-1 text-right text-xs font-normal"
                          />
                        </>
                      ) : null}
                    </span>
                  </div>
                );
              })}
              {editable ? (
                <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--color-line,#eee)] px-5 py-3 text-sm">
                  <input aria-label="เพิ่มรายการตรวจ" value={newLabel} maxLength={60} onChange={(e) => setNewLabel(e.target.value)} placeholder="เพิ่มรายการตรวจ เช่น ประตูห้องน้ำ" className="min-w-0 flex-1 rounded border px-2 py-1" />
                  <button
                    type="button"
                    disabled={!newLabel.trim()}
                    onClick={() => {
                      const label = newLabel.trim();
                      let n = items.length + 1;
                      while (items.some((x) => x.key === `extra_${n}`)) n++;
                      setItems((xs) => [...xs, { key: `extra_${n}`, labelTh: label, verdict: null, amount: "", damageCode: "", evidence: [], note: "" }]);
                      setNewLabel("");
                    }}
                    className="rounded border px-3 py-1 disabled:opacity-50"
                  >
                    เพิ่ม
                  </button>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--color-line,#eee)] px-5 py-3">
                <span className="w-44 flex-none">
                  <b className="block text-sm">มิเตอร์วันออก</b>
                  {model.meterReadAt ? <small className="text-xs text-[color:var(--color-ink-soft)]">บันทึกแล้ว</small> : null}
                </span>
                <span className="flex flex-wrap gap-x-3 gap-y-2 text-sm text-[color:var(--color-ink-soft)]">
                  {model.meters.map((m) => {
                    const k = m.kind;
                    return (
                      <span key={m.meterId} className="flex flex-wrap items-center gap-2">
                        <span data-moveout-meter={k} data-meter-id={m.meterId}>
                          {`${k === "ELEC" ? "ไฟ" : "น้ำ"} ${num(m.baseValue)} → `}
                          <b className="text-neutral-900">{m.value === null ? "ยังไม่จด" : num(m.value)}</b>
                          {m.units === null ? "" : ` (${num(m.units)} หน่วย)`}
                        </span>
                        {editable ? (
                          <input
                            aria-label={`เลขมิเตอร์${k === "ELEC" ? "ไฟ" : "น้ำ"}วันออก`}
                            inputMode="numeric"
                            value={meterIn[m.meterId] ?? ""}
                            onChange={(e) => setMeterIn((x) => ({ ...x, [m.meterId]: e.target.value }))}
                            placeholder="เลขวันออก"
                            className="w-28 rounded border px-2 py-1 text-xs"
                          />
                        ) : null}
                      </span>
                    );
                  })}
                  {!model.meters.length ? <span>ห้องนี้ไม่มีมิเตอร์น้ำไฟ</span> : <span>นับจากเลขที่ออกบิลครั้งล่าสุด</span>}
                </span>
              </div>
              {editable ? (
                <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--color-line,#eee)] px-5 py-3">
                  <button
                    type="button"
                    data-action="save-inspection"
                    disabled={busy !== null || !allItemsJudged}
                    onClick={() => void saveInspection()}
                    className="min-h-10 rounded-lg bg-neutral-900 px-4 text-sm font-bold text-white disabled:opacity-50"
                  >
                    บันทึกผลตรวจห้อง
                  </button>
                  {!allItemsJudged ? <span className="text-xs text-[color:var(--color-ink-soft)]">เลือกผลตรวจให้ครบทุกรายการก่อนบันทึก</span> : null}
                </div>
              ) : !closed && model.status !== "CANCELLED" && frozen ? (
                <p className="border-t px-5 py-3 text-xs text-[color:var(--color-ink-soft)]">ส่งใบสรุปแล้ว — แก้ผลตรวจห้องได้หลังเปิดใบสรุปใหม่</p>
              ) : null}
            </div>
          </section>
        </div>

        {/* ขวา: แผงสรุป */}
        <aside data-moveout-summary className="flex w-full min-w-0 flex-col rounded-2xl border border-[color:var(--color-line,#e5e5e5)] bg-white lg:w-[400px] lg:flex-none">
          <div className="border-b px-5 py-4">
            <div className="text-xs text-[color:var(--color-ink-soft)]">{`สรุปเงินประกัน · ห้อง ${model.roomNumber}`}</div>
            <h2 className="text-xl font-bold">{model.tenantOwesSatang > 0 && model.refundSatang === 0 ? `ผู้เช่าต้องจ่ายเพิ่ม ฿${money(model.tenantOwesSatang)}` : `คืนผู้เช่า ฿${money(model.refundSatang)}`}</h2>
          </div>
          <div className="flex flex-col gap-1 px-5 py-4 text-sm">
            <div className="flex items-baseline gap-2">
              <span>เงินประกันที่ถือไว้</span>
              <span className="flex-1 border-b border-dotted" />
              <span className="font-bold tabular-nums">{money(model.heldSatang)}</span>
            </div>
            {model.lines.map((l, i) => (
              <div key={`${l.code}-${i}`} data-summary-line={l.code} className="flex items-baseline gap-2">
                <span>{lineLabel(l)}</span>
                <span className="flex-1 border-b border-dotted" />
                <span className={`tabular-nums ${l.amountSatang > 0 ? "text-red-700" : ""}`}>{l.amountSatang > 0 ? `−${money(l.amountSatang)}` : `+${money(-l.amountSatang)}`}</span>
              </div>
            ))}
            {!unpaid.length ? (
              <div className="flex items-baseline gap-2">
                <span>ค่าห้องค้าง</span>
                <span className="flex-1 border-b border-dotted" />
                <span className="tabular-nums">0.00</span>
              </div>
            ) : null}
            <div className="mt-2 flex items-baseline gap-2 border-t pt-2 text-base font-bold">
              {model.tenantOwesSatang > 0 ? (
                <>
                  <span>ผู้เช่าต้องจ่ายเพิ่ม</span>
                  <span className="flex-1" />
                  <span data-owes-amount className="tabular-nums">{`฿${money(model.tenantOwesSatang)}`}</span>
                </>
              ) : (
                <>
                  <span>คืนผู้เช่า</span>
                  <span className="flex-1" />
                  <span data-refund-amount className="tabular-nums">{`฿${money(model.refundSatang)}`}</span>
                </>
              )}
            </div>
            <ul className="mt-3 flex flex-col overflow-hidden rounded-xl border">
              <li className="flex gap-3 border-b px-4 py-3">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-neutral-900 text-xs text-white">✓</span>
                <span>
                  ไม่หักค่าทาสี/ทำความสะอาดทั่วไป
                  <small className="block text-xs text-[color:var(--color-ink-soft)]">ถือเป็นการใช้งานปกติ</small>
                </span>
              </li>
              <li className="flex gap-3 border-b px-4 py-3">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-neutral-900 text-xs text-white">✓</span>
                <span>
                  ทุกรายการที่หักมีรูป/ใบเสร็จแนบ
                  <small className="block text-xs text-[color:var(--color-ink-soft)]">ส่งให้ผู้เช่าดูในใบสรุป</small>
                </span>
              </li>
              <li className="flex gap-3 px-4 py-3">
                <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full border text-xs">{model.returnDays}</span>
                <span>
                  {`โอนคืนภายใน ${thDate(model.refundDueDate)}`}
                  <small className="block text-xs text-[color:var(--color-ink-soft)]">ตามประกาศ สคบ. เรื่องสัญญาเช่าที่อยู่อาศัย</small>
                </span>
              </li>
            </ul>
            <p className="mt-3 text-xs text-[color:var(--color-ink-soft)]">
              {`ลงบัญชีให้เอง: ล้างเงินประกันรับ ฿${money(model.heldSatang)} · ค่าใช้จ่ายวันออก ฿${money(model.chargesSatang)} · จ่ายคืน ฿${money(model.refundSatang)} · ห้อง ${model.roomNumber} → ทำความสะอาด`}
            </p>
            {model.warnings.length ? <p className="mt-2 text-xs text-amber-700">{`ตรวจสอบ: ${model.warnings.map(warnTh).join(" · ")}`}</p> : null}
            {model.settled ? <p className="mt-2 text-xs">{`ปิดเงินประกันแล้ว · คืน ฿${money(model.settled.refundSatang)}`}</p> : null}
            <div className="mt-2">
              <Msg msg={msg} />
            </div>
          </div>
          {!closed && model.status !== "CANCELLED" && model.refundSatang > 0 && model.canSettle.ok ? (
            <label className="flex items-center gap-2 border-t px-5 pt-3 text-xs">
              ช่องทางคืนเงิน
              <select aria-label="ช่องทางคืนเงิน" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className="rounded border px-2 py-1">
                <option value="TRANSFER">โอนเข้าบัญชี</option>
                <option value="PROMPTPAY">พร้อมเพย์</option>
                <option value="CASH">เงินสด</option>
              </select>
            </label>
          ) : null}
          <div className="mt-auto flex gap-2 border-t px-5 py-4">
            <button
              type="button"
              data-action="send-summary"
              disabled={sendBlocked || busy !== null}
              {...(sendBlocked && model.canSend.code ? { "data-blocked": model.canSend.code } : {})}
              onClick={() => void run("send", { moveOutId: model.moveOutId })}
              className="flex-1 rounded-lg border px-3 py-2 text-sm font-bold disabled:opacity-50"
            >
              {frozen ? "ส่งใบสรุปแล้ว" : "ส่งใบสรุปให้ดูก่อน"}
            </button>
            <button
              type="button"
              data-action="settle"
              disabled={settleBlocked || busy !== null}
              {...(settleBlocked && model.canSettle.code ? { "data-blocked": model.canSettle.code } : {})}
              onClick={() => {
                const tail = model.tenantOwesSatang > 0 ? `ผู้เช่าต้องจ่ายเพิ่ม ฿${money(model.tenantOwesSatang)}` : `คืนผู้เช่า ฿${money(model.refundSatang)}`;
                if (typeof window !== "undefined" && !window.confirm(`ยืนยันปิดเงินประกันห้อง ${model.roomNumber} · ${tail} — ระบบลงบัญชีให้ทันที`)) return;
                void run("settle", { moveOutId: model.moveOutId, channel });
              }}
              className="flex-[1.3] rounded-lg bg-neutral-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {model.canSettle.code === "NEEDS_APPROVAL" ? "รออนุมัติ" : "ยืนยัน · โอนคืน"}
            </button>
          </div>
          {frozen && model.canSend.ok && !closed ? (
            <button type="button" data-action="resend-summary" disabled={busy !== null} onClick={() => void run("send", { moveOutId: model.moveOutId })} className="mx-5 mb-3 text-xs underline disabled:opacity-50">
              ส่งใบสรุปเดิมให้ผู้เช่าอีกครั้ง
            </button>
          ) : null}
          {settleBlocked && model.canSettle.code && model.canSettle.code !== "SETTLED" ? (
            <p className="px-5 pb-2 text-xs text-[color:var(--color-ink-soft)]">{BLOCK_TH[model.canSettle.code] ?? "ยังปิดเงินประกันไม่ได้"}</p>
          ) : null}
          {sendBlocked && !frozen && model.canSend.code ? <p className="px-5 pb-4 text-xs text-[color:var(--color-ink-soft)]">{`ส่งใบสรุปไม่ได้: ${BLOCK_TH[model.canSend.code] ?? "ข้อมูลยังไม่ครบ"}`}</p> : null}
          <a href={`/app/u/${unitSlug}/dorm/tenants?tab=NOTICE`} className="px-5 pb-4 text-xs underline">
            กลับรายชื่อผู้เช่า
          </a>
        </aside>
      </div>
    </div>
  );
}

// ═════════════════════════ เริ่มจากหน้าสัญญา: แจ้งย้ายออก · ต่อสัญญา · ย้ายห้อง (Y2) ═════════════════════════
export type MoveOutStartProps = { unitSlug: string; lease: LeaseChangeModel; actions?: Record<string, ActionFn> };
export function MoveOutStart({ unitSlug, lease, actions }: MoveOutStartProps) {
  const { busy, msg, run } = useRunner(actions);
  const [moveOutDate, setMoveOutDate] = useState(lease.suggestMoveOutDate);
  const [shortReason, setShortReason] = useState("");
  const [months, setMonths] = useState("12");
  const [renewRent, setRenewRent] = useState(bahtInput(lease.rentSatang));
  const [toRoom, setToRoom] = useState(lease.selectedToRoomId ?? lease.rooms[0]?.id ?? "");
  const [effDate, setEffDate] = useState(lease.suggestTransferDate);
  const [transferRent, setTransferRent] = useState("");
  const [oldReads, setOldReads] = useState<Record<string, string>>({});
  const [meterReason, setMeterReason] = useState("");
  const [newReads, setNewReads] = useState<Record<string, string>>({});
  const newMeters = (lease.roomMeters ?? {})[toRoom] ?? [];
  const shortNotice = lease.noticeDays > 0 && ymdParts(moveOutDate) && ymdParts(lease.today) ? (Date.parse(`${moveOutDate}T00:00:00Z`) - Date.parse(`${lease.today}T00:00:00Z`)) / 86_400_000 < lease.noticeDays : false;
  const toMoveOut = (r: unknown) => {
    const id = r && typeof r === "object" && typeof (r as { moveOutId?: unknown }).moveOutId === "string" ? (r as { moveOutId: string }).moveOutId : null;
    if (id && typeof window !== "undefined") window.location.href = `/app/u/${unitSlug}/dorm/moveout?id=${encodeURIComponent(id)}`;
  };
  const toLease = (r: unknown) => {
    const id = r && typeof r === "object" && typeof (r as { leaseId?: unknown }).leaseId === "string" ? (r as { leaseId: string }).leaseId : null;
    if (id && typeof window !== "undefined") window.location.href = `/app/u/${unitSlug}/dorm/tenants?lease=${encodeURIComponent(id)}`;
  };
  const card = "flex min-w-0 flex-col gap-3 rounded-2xl border border-[color:var(--color-line,#e5e5e5)] bg-white p-5";
  const statusTh = lease.status === "ACTIVE" ? "มีผู้เช่า" : lease.status === "NOTICE" ? "แจ้งย้ายออก" : lease.status === "ENDED" ? "ย้ายออกแล้ว" : lease.status === "DRAFT" ? "จอง/รอเข้า" : lease.status;
  return (
    <div data-lease-change={lease.leaseId} className="flex min-w-0 flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-bold md:text-2xl">{`ห้อง ${lease.roomNumber} · ${lease.tenantName}`}</h1>
        <span className="rounded-lg border px-2 py-0.5 text-xs font-semibold">{statusTh}</span>
        <span className="text-sm text-[color:var(--color-ink-soft)]">{`สัญญา ${thDate(lease.startDate)} – ${lease.endDate ? thDate(lease.endDate) : "ไม่กำหนด"} · ค่าห้อง ฿${money(lease.rentSatang)}/เดือน`}</span>
      </div>
      <Msg msg={msg} />
      {lease.moveOutId ? <p className="rounded-xl border px-4 py-3 text-sm">สัญญานี้แจ้งย้ายออกแล้ว — ผู้มีสิทธิ์จัดการย้ายออกดูรายละเอียดได้ที่จอย้ายออก</p> : null}
      {lease.status !== "ACTIVE" ? <p className="rounded-xl border px-4 py-3 text-sm">สัญญานี้ไม่ได้อยู่ระหว่างเช่า — แจ้งย้ายออก/ต่อสัญญา/ย้ายห้องได้เฉพาะสัญญาที่ยังมีผล</p> : null}
      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        {lease.can.notice ? (
          <section data-start="notice" className={card}>
            <h2 className="text-sm font-bold">แจ้งย้ายออก</h2>
            <p className="text-xs text-[color:var(--color-ink-soft)]">{`สัญญานี้ตกลงแจ้งล่วงหน้า ${lease.noticeDays} วัน · ห้องว่างให้จองต่อได้ตั้งแต่วันถัดจากวันออก · ไม่มีการปรับหรือริบเงินประกันอัตโนมัติ`}</p>
            <label className="flex flex-col gap-1 text-xs">
              วันย้ายออก (วันสุดท้ายที่อยู่)
              <input type="date" value={moveOutDate} onChange={(e) => setMoveOutDate(e.target.value)} className="rounded border px-2 py-1 text-sm" />
            </label>
            {shortNotice ? (
              <label className="flex flex-col gap-1 text-xs">
                {`แจ้งสั้นกว่า ${lease.noticeDays} วัน — ระบุเหตุผล (อย่างน้อย 10 ตัวอักษร)`}
                <textarea value={shortReason} onChange={(e) => setShortReason(e.target.value)} rows={2} className="rounded border px-2 py-1 text-sm" />
              </label>
            ) : null}
            <button
              type="button"
              data-action="give-notice"
              disabled={busy !== null || lease.status !== "ACTIVE" || !ymdParts(moveOutDate)}
              onClick={() => void run("notice", { leaseId: lease.leaseId, moveOutDate, shortNoticeReason: shortNotice ? shortReason : null }, { reload: false, after: toMoveOut })}
              className="min-h-10 rounded-lg bg-neutral-900 px-3 text-sm font-bold text-white disabled:opacity-50"
            >
              บันทึกการแจ้งย้ายออก
            </button>
          </section>
        ) : null}
        {lease.can.lease ? (
          <section data-start="renew" className={card}>
            <h2 className="text-sm font-bold">ต่อสัญญา</h2>
            <p className="text-xs text-[color:var(--color-ink-soft)]">{`สัญญาใหม่เริ่มวันถัดจากวันจบเดิม${lease.endDate ? ` (${thDate(lease.endDate)})` : ""} · ปรับค่าห้องได้ตอนต่อสัญญาเท่านั้น · เงินประกันเดิมใช้ต่อ`}</p>
            <label className="flex flex-col gap-1 text-xs">
              ระยะเวลา (เดือน)
              <input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value)} className="rounded border px-2 py-1 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              ค่าห้องต่อเดือน (บาท)
              <input inputMode="decimal" value={renewRent} onChange={(e) => setRenewRent(e.target.value)} className="rounded border px-2 py-1 text-sm" />
            </label>
            <button
              type="button"
              data-action="renew"
              disabled={busy !== null || lease.status !== "ACTIVE" || !lease.endDate}
              onClick={() => {
                const m = Number(months);
                const rent = satangOf(renewRent);
                void run("renew", { leaseId: lease.leaseId, months: Number.isSafeInteger(m) ? m : 0, ...(rent ? { rentSatang: rent } : {}) }, { reload: false, after: toLease });
              }}
              className="min-h-10 rounded-lg border px-3 text-sm font-bold disabled:opacity-50"
            >
              ต่อสัญญา
            </button>
          </section>
        ) : null}
        {lease.can.lease ? (
          <section data-start="transfer" className={card}>
            <h2 className="text-sm font-bold">ย้ายห้อง</h2>
            <p className="text-xs text-[color:var(--color-ink-soft)]">ย้ายได้วันที่ 1 ของเดือนที่ยังไม่ออกบิลค่าห้อง (หรือก่อนเริ่มสัญญา) · เงินประกันเดิมใช้ต่อ ไม่ต้องโอนใหม่</p>
            {lease.rooms.length ? (
              <label className="flex flex-col gap-1 text-xs">
                ห้องปลายทาง
                <select
                  value={toRoom}
                  onChange={(e) => {
                    const v = e.target.value;
                    setToRoom(v);
                    // Y29 ▸ มิเตอร์ห้องปลายทางโหลดจาก server เฉพาะห้องที่เลือก ◂
                    if (typeof window !== "undefined") window.location.href = `/app/u/${unitSlug}/dorm/moveout?lease=${encodeURIComponent(lease.leaseId)}&to=${encodeURIComponent(v)}#transfer`;
                  }}
                  className="rounded border px-2 py-1 text-sm"
                >
                  {lease.rooms.map((r) => (
                    <option key={r.id} value={r.id}>{`ห้อง ${r.number}`}</option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="text-xs">ไม่มีห้องอื่นในหอนี้ที่ย้ายไปได้</p>
            )}
            <label className="flex flex-col gap-1 text-xs">
              วันที่ย้าย
              <input type="date" value={effDate} onChange={(e) => setEffDate(e.target.value)} className="rounded border px-2 py-1 text-sm" />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              ค่าห้องใหม่ต่อเดือน (บาท · เว้นว่าง = ราคาห้องปลายทาง)
              <input inputMode="decimal" value={transferRent} onChange={(e) => setTransferRent(e.target.value)} className="rounded border px-2 py-1 text-sm" />
            </label>
            {lease.oldMeters.map((m) => (
              <label key={m.meterId} className="flex flex-col gap-1 text-xs">
                {`เลขมิเตอร์${m.kind === "ELEC" ? "ไฟ" : "น้ำ"}ห้องเดิม ณ วันย้าย`}
                <input inputMode="numeric" value={oldReads[m.meterId] ?? ""} onChange={(e) => setOldReads((x) => ({ ...x, [m.meterId]: e.target.value }))} className="rounded border px-2 py-1 text-sm" />
              </label>
            ))}
            {newMeters.map((m) => (
              <label key={m.meterId} className="flex flex-col gap-1 text-xs">
                {`เลขมิเตอร์${m.kind === "ELEC" ? "ไฟ" : "น้ำ"}ห้องใหม่ ณ วันเข้า`}
                <input inputMode="numeric" value={newReads[m.meterId] ?? ""} onChange={(e) => setNewReads((x) => ({ ...x, [m.meterId]: e.target.value }))} className="rounded border px-2 py-1 text-sm" />
              </label>
            ))}
            {lease.oldMeters.length ? (
              <label className="flex flex-col gap-1 text-xs">
                จดเลขไม่ได้? ระบุเหตุผล (อย่างน้อย 10 ตัวอักษร)
                <input value={meterReason} onChange={(e) => setMeterReason(e.target.value)} className="rounded border px-2 py-1 text-sm" />
              </label>
            ) : null}
            <button
              type="button"
              data-action="transfer"
              disabled={busy !== null || lease.status !== "ACTIVE" || !toRoom}
              onClick={() => {
                const rent = satangOf(transferRent);
                const pick = (ms: { meterId: string }[], vals: Record<string, string>) => ms.filter((m) => (vals[m.meterId] ?? "").trim() !== "").map((m) => ({ meterId: m.meterId, value: Number((vals[m.meterId] ?? "").replace(/,/g, "")) }));
                const meterReadings = [...pick(lease.oldMeters, oldReads), ...pick(newMeters, newReads)];
                void run("transfer", { leaseId: lease.leaseId, toRoomId: toRoom, effectiveDate: effDate, ...(rent ? { rentSatang: rent } : {}), meterReadings, meterReason: meterReason.trim() || null }, { reload: false, after: toLease });
              }}
              className="min-h-10 rounded-lg border px-3 text-sm font-bold disabled:opacity-50"
            >
              ย้ายห้อง
            </button>
          </section>
        ) : null}
      </div>
      {!lease.can.notice && !lease.can.lease ? <p className="text-sm">บัญชีนี้ไม่มีสิทธิ์แจ้งย้ายออก/ต่อสัญญา/ย้ายห้อง</p> : null}
      <a href={`/app/u/${unitSlug}/dorm/tenants?lease=${encodeURIComponent(lease.leaseId)}`} className="text-xs underline">
        กลับหน้าสัญญา
      </a>
    </div>
  );
}
