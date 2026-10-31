'use client';
// SVC D.18 ▸ จอพัสดุของพนักงานหอ — สัญญา DOM ledger/svc-briefs/svc-brief-d.18.md §4.1 (ไม่มีภาพอนุมัติ — ใช้รูปแบบจอหอเดิม)
//   • ข้อมูลทั้งหมดจาก listParcels ของ facade หอ (ไฟล์นี้ import จาก lib ได้เฉพาะ type) · action รับทาง prop ⇒ render ด้วย renderToStaticMarkup ได้
//   • รับพัสดุ: ห้อง · ขนส่ง · เลขพัสดุ · รูป (กล้องหลัง) · คีย์กันบันทึกซ้ำสร้างครั้งเดียวต่อการเปิดฟอร์ม (กดซ้ำจากเน็ตช้า = แถวเดิม)
//   • รับของ: สแกน/วางลิงก์ QR ที่ผู้เช่าเปิดจาก LINE · หรือเซ็นชื่อผู้รับบนจอ · ตีกลับต้องมีเหตุผล
//   • ไม่มีเบอร์/นามสกุล/token/ที่อยู่ไฟล์ส่วนตัว — รูปผ่าน /api/files (ลิงก์ผูกผู้ดู · หมดอายุ) เท่านั้น · มือถือ 390 ไม่ล้นแนวนอน
import { useEffect, useRef, useState, useTransition, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import type { ParcelList, ParcelRow, ParcelStatus } from "@/lib/modules/dorm";

type ActionFn = (prev: unknown, formData: FormData) => Promise<unknown>;
export type DormParcelsActions = { receive: ActionFn; pickup: ActionFn; returnParcel: ActionFn };
export type DormParcelsProps = {
  model: ParcelList;
  canReceive: boolean;
  rooms: { roomId: string; roomNumber: string }[];
  actions: DormParcelsActions;
  status?: ParcelStatus | "ALL";
};

const MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** ISO ⇒ "5 พ.ย. 2569" (วันไทย · อ่านด้วย getUTC* หลังบวก 7 ชั่วโมง) */
function thDate(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(new Date(t + 7 * 3_600_000).toISOString());
  return m ? `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1] ?? ""} ${Number(m[1]) + 543}` : "";
}
const STATUS_TH: Record<ParcelStatus, string> = { WAITING: "รอรับ", PICKED_UP: "รับแล้ว", RETURNED: "ตีกลับ" };
const FILTERS: { key: ParcelStatus | "ALL"; label: string }[] = [
  { key: "WAITING", label: "รอรับ" },
  { key: "PICKED_UP", label: "รับแล้ว" },
  { key: "RETURNED", label: "ตีกลับ" },
  { key: "ALL", label: "ทั้งหมด" },
];
const newKey = (): string => {
  try {
    return `pk-${crypto.randomUUID()}`;
  } catch {
    return `pk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
};
type Result = { ok?: unknown; reason?: unknown };
const msgOf = (r: unknown, okText: string): { ok: boolean; text: string } => {
  const x = (r && typeof r === "object" ? r : {}) as Result;
  if (x.ok === true) return { ok: true, text: okText };
  return { ok: false, text: typeof x.reason === "string" ? x.reason : "ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง" };
};
const BTN = "inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-medium";
const INPUT = "min-h-11 w-full rounded-lg border border-[color:var(--color-line,#d4d4d8)] bg-white px-3 text-sm";

/** ช่องเซ็นชื่อบนจอ (canvas → PNG) */
function SignaturePad({ onDone, onCancel, busy }: { onDone: (b: Blob) => void; onCancel: () => void; busy: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);
  const pos = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = ref.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    ref.current?.setPointerCapture(e.pointerId);
    const p = pos(e);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setDirty(true);
  };
  const up = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = ref.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setDirty(false);
  };
  const save = () => {
    const c = ref.current;
    if (!c || !dirty) return;
    c.toBlob((b) => {
      if (b) onDone(b);
    }, "image/png");
  };
  return (
    <div className="mt-2 flex flex-col gap-2">
      <canvas
        ref={ref}
        width={600}
        height={200}
        aria-label="ช่องเซ็นชื่อผู้รับพัสดุ"
        className="h-32 w-full touch-none rounded-lg border border-dashed border-[color:var(--color-line,#d4d4d8)] bg-white"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${BTN} bg-[color:var(--color-ink,#111827)] text-white disabled:opacity-50`} disabled={!dirty || busy} onClick={save}>
          บันทึกลายเซ็นรับพัสดุ
        </button>
        <button type="button" className={`${BTN} border border-[color:var(--color-line,#d4d4d8)]`} onClick={clear}>
          ล้าง
        </button>
        <button type="button" className={`${BTN} border border-[color:var(--color-line,#d4d4d8)]`} onClick={onCancel}>
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

function Row({
  r,
  busy,
  openSign,
  setOpenSign,
  openReturn,
  setOpenReturn,
  onSign,
  onReturn,
}: {
  r: ParcelRow;
  busy: boolean;
  openSign: string | null;
  setOpenSign: (id: string | null) => void;
  openReturn: string | null;
  setOpenReturn: (id: string | null) => void;
  onSign: (parcelId: string, b: Blob) => void;
  onReturn: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const waiting = r.status === "WAITING";
  return (
    <li data-parcel-row={r.parcelId} data-parcel-status={r.status} className="flex flex-col gap-2 rounded-xl border border-[color:var(--color-line,#e4e4e7)] bg-white p-3">
      <div className="flex gap-3">
        {r.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img data-parcel-photo src={r.photoUrl} alt={`รูปพัสดุห้อง ${r.roomNumber}`} className="h-20 w-20 shrink-0 rounded-lg object-cover" loading="lazy" />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-[#f4f4f5] text-xs text-[color:var(--color-ink-soft,#71717a)]">ไม่มีรูป</div>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold">{`ห้อง ${r.roomNumber}`}</span>
            <span className="rounded-full bg-[#f4f4f5] px-2 py-0.5 text-xs">{STATUS_TH[r.status]}</span>
            {r.overdue ? (
              <span data-parcel-overdue className="rounded-full bg-[#fef3c7] px-2 py-0.5 text-xs text-[#92400e]">
                เกินกำหนด
              </span>
            ) : null}
          </div>
          <span className="truncate">{[r.carrier ?? "ไม่ระบุขนส่ง", r.trackingNo].filter(Boolean).join(" · ")}</span>
          {r.tenantFirstName ? <span className="text-[color:var(--color-ink-soft,#71717a)]">{`ผู้เช่า: คุณ${r.tenantFirstName}`}</span> : null}
          <span className="text-[color:var(--color-ink-soft,#71717a)]">
            {waiting ? `รับเข้า ${thDate(r.receivedAt)} · รอ ${r.daysWaiting} วัน` : r.status === "PICKED_UP" ? `รับแล้ว ${thDate(r.pickedUpAt)}` : `รับเข้า ${thDate(r.receivedAt)}`}
            {r.remindCount > 0 ? ` · เตือนแล้ว ${r.remindCount} ครั้ง` : ""}
          </span>
        </div>
      </div>
      {waiting ? (
        <div className="flex flex-col gap-2">
          <div data-parcel-sign={r.parcelId}>
            {openSign === r.parcelId ? (
              <SignaturePad busy={busy} onDone={(b) => onSign(r.parcelId, b)} onCancel={() => setOpenSign(null)} />
            ) : (
              <button type="button" className={`${BTN} border border-[color:var(--color-line,#d4d4d8)]`} onClick={() => setOpenSign(r.parcelId)}>
                เซ็นรับแทนการสแกน
              </button>
            )}
          </div>
          <form data-parcel-return={r.parcelId} onSubmit={onReturn} className="flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="parcelId" value={r.parcelId} />
            {openReturn === r.parcelId ? (
              <>
                <input name="reason" required minLength={3} maxLength={200} placeholder="เหตุผลที่ตีกลับ เช่น ไม่ใช่ผู้เช่าของหอ" className={INPUT} />
                <button type="submit" disabled={busy} className={`${BTN} border border-[#b91c1c] text-[#b91c1c] disabled:opacity-50`}>
                  ยืนยันตีกลับ
                </button>
              </>
            ) : (
              <button type="button" className={`${BTN} text-[color:var(--color-ink-soft,#71717a)]`} onClick={() => setOpenReturn(r.parcelId)}>
                ตีกลับพัสดุ
              </button>
            )}
          </form>
        </div>
      ) : null}
    </li>
  );
}

export default function DormParcels({ model, canReceive, rooms, actions, status }: DormParcelsProps) {
  const [key, setKey] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [openSign, setOpenSign] = useState<string | null>(null);
  const [openReturn, setOpenReturn] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    setKey(newKey());
  }, []);
  const run = (fn: () => Promise<unknown>, okText: string, after?: (ok: boolean) => void) =>
    start(async () => {
      const r = await fn();
      const m = msgOf(r, okText);
      setMsg(m);
      after?.(m.ok);
    });

  const onReceive = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (!String(fd.get("idempotencyKey") ?? "")) fd.set("idempotencyKey", key || newKey());
    run(() => actions.receive(null, fd), "บันทึกรับพัสดุแล้ว — ระบบแจ้งผู้เช่าทาง LINE", (ok) => {
      if (ok) {
        form.reset();
        setKey(newKey());
      }
    });
  };
  const onScan = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    run(() => actions.pickup(null, fd), "บันทึกรับของแล้ว", (ok) => {
      if (ok) form.reset();
    });
  };
  const onSign = (parcelId: string, b: Blob) => {
    const fd = new FormData();
    fd.set("parcelId", parcelId);
    fd.set("signature", new File([b], "signature.png", { type: "image/png" }));
    run(() => actions.pickup(null, fd), "บันทึกลายเซ็นรับพัสดุแล้ว", (ok) => {
      if (ok) setOpenSign(null);
    });
  };
  const onReturn = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() => actions.returnParcel(null, fd), "ตีกลับพัสดุแล้ว", (ok) => {
      if (ok) setOpenReturn(null);
    });
  };

  const c = model.counts;
  return (
    <div data-dorm-parcels data-enabled={model.enabled ? "true" : "false"} className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">พัสดุ</h1>
        <p className="text-sm text-[color:var(--color-ink-soft,#71717a)]">{`เก็บพัสดุได้ ${model.holdDays} วัน · เกินกำหนดระบบเตือนผู้เช่าทาง LINE วันละครั้ง`}</p>
      </header>

      {!model.enabled ? (
        <p className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 text-sm text-[#92400e]">
          ระบบพัสดุปิดอยู่ — ไม่รับพัสดุใหม่และไม่ส่งข้อความถึงผู้เช่า (พัสดุที่ค้างอยู่ยังกดรับของ/ตีกลับได้) · เปิดได้ที่หน้าตั้งค่าหอ
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["รอรับ", c.waiting],
          ["เกินกำหนด", c.overdue],
          ["รับแล้ว", c.pickedUp],
          ["ตีกลับ", c.returned],
        ].map(([label, n]) => (
          <div key={String(label)} className="rounded-xl border border-[color:var(--color-line,#e4e4e7)] bg-white p-3">
            <div className="text-xs text-[color:var(--color-ink-soft,#71717a)]">{label}</div>
            <div className="text-2xl font-semibold tabular-nums">{n}</div>
          </div>
        ))}
      </div>

      {msg ? (
        <p role="status" className={`rounded-lg p-3 text-sm ${msg.ok ? "bg-[#ecfdf5] text-[#065f46]" : "bg-[#fef2f2] text-[#991b1b]"}`}>
          {msg.text}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {model.enabled && canReceive ? (
          <form data-parcel-receive onSubmit={onReceive} className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-line,#e4e4e7)] bg-white p-4">
            <h2 className="font-semibold">รับพัสดุเข้า</h2>
            <label className="flex flex-col gap-1 text-sm">
              ห้อง
              <select name="roomId" required className={INPUT} defaultValue="">
                <option value="" disabled>
                  เลือกห้อง
                </option>
                {rooms.map((r) => (
                  <option key={r.roomId} value={r.roomId}>
                    {r.roomNumber}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              ขนส่ง
              <input name="carrier" maxLength={40} placeholder="เช่น Kerry Express" className={INPUT} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              เลขพัสดุ (ถ้ามี)
              <input name="trackingNo" maxLength={60} autoCapitalize="characters" className={INPUT} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              รูปพัสดุ
              <input type="file" name="photo" accept="image/*" capture="environment" required className="text-sm" />
            </label>
            <input type="hidden" name="idempotencyKey" value={key} />
            <button type="submit" disabled={pending} className={`${BTN} min-h-11 bg-[color:var(--color-ink,#111827)] text-white disabled:opacity-50`}>
              บันทึกรับพัสดุ
            </button>
          </form>
        ) : null}

        <form data-parcel-scan onSubmit={onScan} className="flex flex-col gap-3 rounded-xl border border-[color:var(--color-line,#e4e4e7)] bg-white p-4">
          <h2 className="font-semibold">ผู้เช่ามารับของ</h2>
          <p className="text-sm text-[color:var(--color-ink-soft,#71717a)]">สแกน QR ที่ผู้เช่าเปิดจากลิงก์ใน LINE หรือวางลิงก์ที่สแกนได้ลงช่องนี้</p>
          <input name="token" required autoComplete="off" placeholder="ลิงก์รับพัสดุ" className={INPUT} />
          <button type="submit" disabled={pending} className={`${BTN} bg-[color:var(--color-ink,#111827)] text-white disabled:opacity-50`}>
            สแกน/วางลิงก์รับพัสดุ
          </button>
        </form>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm" aria-label="กรองสถานะพัสดุ">
        {FILTERS.map((f) => (
          <a
            key={f.key}
            href={`?s=${f.key}`}
            className={`rounded-full px-3 py-1.5 ${(status ?? "WAITING") === f.key ? "bg-[color:var(--color-ink,#111827)] text-white" : "border border-[color:var(--color-line,#d4d4d8)]"}`}
          >
            {f.label}
          </a>
        ))}
      </nav>

      {model.rows.length ? (
        <ul className="flex flex-col gap-2">
          {model.rows.map((r) => (
            <Row
              key={r.parcelId}
              r={r}
              busy={pending}
              openSign={openSign}
              setOpenSign={setOpenSign}
              openReturn={openReturn}
              setOpenReturn={setOpenReturn}
              onSign={onSign}
              onReturn={onReturn}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[color:var(--color-ink-soft,#71717a)]">ไม่มีพัสดุในรายการนี้</p>
      )}
    </div>
  );
}
