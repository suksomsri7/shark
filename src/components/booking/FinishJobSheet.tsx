// SVC B.10 — แผ่น "เสร็จงาน" มือถือช่าง (ภาพ จอง 07 ก · 390 px) · สัญญา DOM: ใบสั่ง svc-brief-b.10 §4 ก
//   บรรทัดจากนัด + ของที่ทำเพิ่ม (ราคา server ล้วน) − มัดจำ = ต้องจ่าย · ปุ่ม "ส่งไปจ่ายที่เคาน์เตอร์" ≥ 44px · การ์ดชวนนัดครั้งหน้า · ไม่มีเบอร์
//   ไม่มี state ฝั่ง client: เพิ่มของ = ฟอร์ม GET กลับหน้าเดิม (?add=) · ส่ง = server action (actions.finish / actions.amend เมื่อมีบิลแล้ว)
import type { BillLine, ServiceBillPreview } from "@/lib/modules/booking/finish";

type Catalog = { services: { id: string; name: string }[]; products: { id: string; name: string }[] };
type Props = {
  view: ServiceBillPreview;
  unitSlug: string;
  actions: {
    finish: (fd: FormData) => Promise<void>;
    amend: (fd: FormData) => Promise<void>;
    /** ยกเลิกบิล HELD (ต้องมีเหตุผล) — ไม่ส่ง = ไม่แสดง */
    cancel?: (fd: FormData) => Promise<void>;
    /** ยกเลิกบิลที่รับเงินแล้ว (ต้องมีเหตุผล) — ไม่ส่ง = ไม่แสดง */
    voidPaid?: (fd: FormData) => Promise<void>;
  };
  at?: string;
  /** ตัวเลือกของ "เพิ่มบริการ/สินค้า" (ไม่ส่ง = แสดงเฉพาะปุ่ม) */
  catalog?: Catalog;
  /** ค่า ?finish= เดิม (เลขบัตร/รหัสนัด) — ฟอร์มเพิ่มของส่งกลับหน้าเดิม */
  finishKey?: string;
};

/** ฿1,290 · ฿134.50 — สตางค์จำนวนเต็ม (ไม่พึ่ง locale ของเครื่อง) */
export function baht(satang: number): string {
  const neg = satang < 0;
  const v = Math.abs(Math.trunc(satang));
  const int = Math.floor(v / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const dec = v % 100;
  return `${neg ? "−" : ""}฿${int}${dec ? `.${String(dec).padStart(2, "0")}` : ""}`;
}
const TH_DOW = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
function dateTh(ds: string): string {
  const [y, m, d] = ds.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${TH_DOW[dow]} ${d} ${TH_MON[m - 1]}`;
}
const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function subOf(l: BillLine, depositSatang: number): string {
  if (l.source === "BOOKED") return depositSatang > 0 ? `จากนัด · มัดจำ ${baht(depositSatang)} จ่ายแล้ว` : "จากนัด";
  return l.kind === "PRODUCT" ? `สินค้า${l.qty > 1 ? ` ×${l.qty}` : ""} · ตัดสต็อก` : "ทำเพิ่มหน้างาน";
}
/** ของที่ทำเพิ่มของแผ่นนี้ในรูปที่ action รับ (id + จำนวน + ผู้ทำ — ไม่มีราคา) */
function extrasJson(view: ServiceBillPreview): string {
  return JSON.stringify(
    view.lines
      .filter((l) => l.source === "EXTRA")
      .map((l) => (l.kind === "SERVICE" ? { kind: "SERVICE", serviceId: l.serviceId, staffId: l.performerStaffId } : { kind: "PRODUCT", productId: l.productId, qty: l.qty, staffId: l.performerStaffId })),
  );
}

export default function FinishJobSheet({ view, unitSlug, actions, at, catalog, finishKey }: Props) {
  const title = view.ticketNumber ?? "งานนี้";
  const paid = view.billStatus === "PAID";
  const held = view.billStatus === "HELD";
  const submit = held ? actions.amend : actions.finish;
  const sendText = paid
    ? "รับเงินแล้ว"
    : held
      ? `บันทึกของที่แก้ · ต้องจ่าย ${baht(view.dueSatang)}`
      : view.pos
        ? `ส่งไปจ่ายที่เคาน์เตอร์ · ${baht(view.dueSatang)}`
        : `เสร็จงาน · ${baht(view.dueSatang)}`;
  const extraIds = view.lines.filter((l) => l.source === "EXTRA").map((l) => l.serviceId ?? l.productId).filter((x): x is string => !!x);
  return (
    <div data-testid="finish-sheet" data-appointment={view.appointmentId} className="mx-auto flex w-full max-w-[430px] flex-col gap-4 pb-28">
      <div className="flex items-center gap-3">
        <a href={`/app/u/${unitSlug}/booking/mine${at ? `?at=${encodeURIComponent(at)}` : ""}`} aria-label="กลับ" className="flex h-11 w-11 items-center justify-center rounded-xl border border-[color:var(--color-border)]">
          <span aria-hidden>‹</span>
        </a>
        <h1 className="text-xl font-bold tracking-tight">เสร็จงาน {title}</h1>
      </div>

      <section className="rounded-2xl bg-[color:var(--color-ink)] px-4 py-4 text-[color:var(--color-surface)]">
        <b className="block text-lg">{[view.customerLabel, view.lines[0]?.name].filter(Boolean).join(" · ")}</b>
        <small className="mt-0.5 block text-[13px] opacity-75">
          {view.staffName}
          {held ? " · บิลรอที่เคาน์เตอร์" : paid ? " · จ่ายแล้ว" : ""}
        </small>
      </section>

      <section className="flex flex-col">
        {view.lines.map((l, i) => (
          <div
            key={`${l.source}-${l.serviceId ?? l.productId}-${i}`}
            data-testid="finish-line"
            data-kind={l.kind}
            data-source={l.source}
            data-amount={l.amountSatang}
            className={`flex items-center gap-3 py-3 text-[14.5px] ${i ? "border-t border-[color:var(--color-border)]" : ""}`}
          >
            <div className="min-w-0 flex-1">
              {l.name}
              <small className="block text-[12.5px] text-[color:var(--color-muted)]">{subOf(l, view.depositSatang)}</small>
            </div>
            <b className="tabular-nums">{baht(l.amountSatang)}</b>
          </div>
        ))}
        {view.depositSatang > 0 ? (
          <div data-testid="finish-deposit" className="flex items-center gap-3 border-t border-[color:var(--color-border)] py-3 text-[14.5px] text-[color:var(--color-accent)]">
            <div className="flex-1">หักมัดจำ<small className="block text-[12.5px] text-[color:var(--color-muted)]">มัดจำที่จ่ายไว้ {baht(view.depositSatang)}</small></div>
            <b className="tabular-nums">{baht(-view.depositSatang)}</b>
          </div>
        ) : null}
        <div data-testid="finish-due" className="flex items-center justify-between border-t-[1.5px] border-[color:var(--color-ink)] pt-3 text-lg font-bold tabular-nums">
          <span>ต้องจ่าย</span>
          <span>{baht(view.dueSatang)}</span>
        </div>
      </section>

      {!paid ? (
        <details data-testid="finish-add" className="rounded-[14px] border-[1.5px] border-dashed border-[color:var(--color-border)]">
          <summary className="flex h-[46px] cursor-pointer list-none items-center justify-center gap-2 text-sm">＋ เพิ่มบริการ/สินค้า</summary>
          {catalog && (catalog.services.length || catalog.products.length) ? (
            <form method="get" action={`/app/u/${unitSlug}/booking/mine`} className="flex flex-col gap-2 px-4 pb-4">
              <input type="hidden" name="finish" value={finishKey ?? view.appointmentId} />
              {at ? <input type="hidden" name="at" value={at} /> : null}
              {extraIds.map((id, i) => (
                <input key={`${id}-${i}`} type="hidden" name="add" value={id} />
              ))}
              {catalog.services.length ? <p className="text-xs font-semibold text-[color:var(--color-muted)]">บริการ</p> : null}
              {catalog.services.map((s) => (
                <label key={s.id} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" name="add" value={s.id} /> {s.name}
                </label>
              ))}
              {catalog.products.length ? <p className="text-xs font-semibold text-[color:var(--color-muted)]">สินค้า</p> : null}
              {catalog.products.map((p) => (
                <label key={p.id} className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" name="add" value={p.id} /> {p.name}
                </label>
              ))}
              <button type="submit" className="btn min-h-11">เพิ่มลงบิล</button>
            </form>
          ) : null}
        </details>
      ) : null}

      {view.rebook ? (
        <div data-testid="finish-rebook" className="flex items-center gap-3 rounded-2xl border border-[color:var(--color-border)] px-4 py-3">
          <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 flex-none" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
          <div className="flex-1">
            <b className="block text-[14.5px]">ชวนนัดครั้งหน้า</b>
            <small className="block text-[12.5px] text-[color:var(--color-muted)]">
              {dateTh(view.rebook.dateStr)} {hm(view.rebook.startMin)} · {view.staffName}
            </small>
          </div>
        </div>
      ) : null}

      {(held && actions.cancel) || (paid && actions.voidPaid) ? (
        <details data-testid="finish-cancel" className="rounded-2xl border border-[color:var(--color-border)] px-4 py-3 text-sm">
          <summary className="cursor-pointer list-none text-[color:var(--color-danger)]">{paid ? "ยกเลิกบิลที่รับเงินแล้ว" : "ยกเลิกบิลจากคิว"}</summary>
          <form action={(paid ? actions.voidPaid : actions.cancel)!} className="mt-3 flex flex-col gap-2">
            <input type="hidden" name="appointmentId" value={view.appointmentId} />
            <input type="hidden" name="from" value="mine" />
            {at ? <input type="hidden" name="at" value={at} /> : null}
            <input name="reason" required maxLength={200} placeholder="เหตุผล (จำเป็น)" className="input min-h-11" />
            <button type="submit" className="btn min-h-11">{paid ? "ยืนยันยกเลิกบิล (คืนเงินลูกค้าตามจริง)" : "ยืนยันยกเลิกบิล"}</button>
          </form>
        </details>
      ) : null}

      <form action={submit} className="fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-5 py-4">
        <input type="hidden" name="appointmentId" value={view.appointmentId} />
        <input type="hidden" name="extras" value={extrasJson(view)} />
        <input type="hidden" name="from" value="mine" />
        {at ? <input type="hidden" name="at" value={at} /> : null}
        <button
          type="submit"
          data-testid="finish-send"
          disabled={paid}
          className="min-h-[56px] w-full rounded-2xl bg-[color:var(--color-ink)] text-base font-bold text-[color:var(--color-surface)] disabled:opacity-50"
        >
          {sendText}
        </button>
      </form>
    </div>
  );
}
