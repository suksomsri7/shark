"use client";
// SVC D.17 ▸ จอ "ประกาศถึงผู้เช่า" — สัญญา DOM ledger/svc-briefs/svc-brief-d.17.md §4.1 (ไม่มีภาพแบบ · renderToStaticMarkup ได้)
//   ไม่มีชื่อ/เบอร์ผู้เช่า · ปุ่ม ≥ 44px · 390px ไม่ล้น · ตัวเลือกกลุ่มมาจาก model.options เท่านั้น (ผู้ดูแลอาคารไม่มี "ทั้งหอ")
import { useActionState, useState } from "react";
import type { AnnounceAudience, DormAnnounceModel, DormAnnouncementRow } from "@/lib/modules/dorm";

type Act = (prev: unknown, fd: FormData) => Promise<unknown>;
type Props = { model: DormAnnounceModel; createAction: Act; publishAction: Act; resendAction: Act };
type Kind = AnnounceAudience["kind"];
type Out = { ok?: boolean; reason?: string; warning?: string; sent?: number; recipients?: number } | null;
const outOf = (v: unknown): Out => (v && typeof v === "object" ? (v as Out) : null);

const KIND_TH: Record<Kind, string> = { ALL: "ทั้งหอ", BUILDING: "อาคาร", FLOOR: "ชั้น", ROOM: "ห้อง" };
const BTN = "min-h-[44px] rounded-xl px-4 text-[14px] font-semibold";
const fmtDate = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" }) : "";
};

function Row({ r, publishAction, resendAction }: { r: DormAnnouncementRow; publishAction: Act; resendAction: Act }) {
  const [pubState, pub, pubPending] = useActionState(publishAction, null);
  const [resState, res, resPending] = useActionState(resendAction, null);
  const po = outOf(pubState);
  const ro = outOf(resState);
  return (
    <li data-announce-row={r.id} data-status={r.status} className="flex min-w-0 flex-col gap-2 rounded-2xl border border-[#e5e5e5] bg-white p-4">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <p className="min-w-0 break-words text-[15px] font-semibold">{r.title}</p>
        <span className="text-[12px] text-[#737373]">{r.status === "DRAFT" ? "ร่าง" : `ส่งแล้ว ${fmtDate(r.publishedAt)}`}</span>
      </div>
      <p className="break-words text-[13px] text-[#525252]">{`ถึง: ${r.audienceLabelTh}`}</p>
      {r.status === "DRAFT" ? (
        <form data-announce-publish="" action={pub} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="announcementId" value={r.id} />
          <span data-announce-recipients={r.stats.recipients} className="text-[13px] text-[#404040]">{`ผู้รับตอนนี้ ${r.stats.recipients} คน`}</span>
          <button type="submit" disabled={pubPending} className={`${BTN} bg-[#0a0a0a] text-white disabled:opacity-50`}>
            ส่งประกาศ
          </button>
          {po && po.ok === false && po.reason ? <span className="text-[13px] text-[#b91c1c]">{po.reason}</span> : null}
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <p data-announce-reads="" data-reads={r.stats.reads} data-recipients={r.stats.recipients} className="text-[14px] text-[#0a0a0a]">
            {`อ่านแล้ว ${r.stats.reads} จาก ${r.stats.recipients} คน`}
          </p>
          <p className="text-[12px] text-[#737373]">{`ส่ง LINE แล้ว ${r.stats.sent} · รอส่ง ${r.stats.waiting} · ไม่มี LINE ${r.stats.noLine}`}</p>
          <form data-announce-resend="" action={res} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="announcementId" value={r.id} />
            <button type="submit" disabled={resPending} className={`${BTN} border border-[#d4d4d4] bg-white text-[#0a0a0a] disabled:opacity-50`}>
              ส่งซ้ำให้คนที่ยังไม่ได้รับ
            </button>
            {ro && ro.ok === true ? <span className="text-[13px] text-[#15803d]">{`ส่งเพิ่ม ${ro.sent ?? 0} คน`}</span> : null}
            {ro && ro.ok === false && ro.reason ? <span className="text-[13px] text-[#b91c1c]">{ro.reason}</span> : null}
          </form>
        </div>
      )}
      {po && po.ok === true && po.warning ? (
        <p data-announce-warning="" role="alert" className="break-words text-[13px] text-[#b45309]">
          {po.warning}
        </p>
      ) : null}
    </li>
  );
}

export default function DormAnnounce({ model, createAction, publishAction, resendAction }: Props) {
  const kinds: Kind[] = model.canAll ? ["ALL", "BUILDING", "FLOOR", "ROOM"] : ["BUILDING", "FLOOR", "ROOM"];
  const [kind, setKind] = useState<Kind>(kinds[0]!);
  const [state, formAction, pending] = useActionState(createAction, null);
  const out = outOf(state);
  const o = model.options;
  const opt = (k: Kind, value: string, label: string) => (
    <label key={`${k}-${value}`} className="flex min-h-[44px] min-w-0 items-center gap-2 rounded-lg border border-[#e5e5e5] px-3 text-[14px]">
      <input type="checkbox" name="target" data-audience-option={k} value={value} disabled={kind !== k} className="h-5 w-5 shrink-0" />
      <span className="min-w-0 break-words">{label}</span>
    </label>
  );
  return (
    <div data-dorm-announce="" data-unit={model.unitId} className="mx-auto flex w-full min-w-0 max-w-[880px] flex-col gap-5 text-[#0a0a0a]">
      <header className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-[20px] font-bold">ประกาศถึงผู้เช่า</h1>
        <a href={model.basePath} className="text-[14px] text-[#525252] underline">{`กลับหน้าหอ ${model.unitName}`}</a>
      </header>

      <form data-announce-form="" action={formAction} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-4">
        <label className="flex flex-col gap-1 text-[13px] text-[#404040]">
          หัวเรื่อง
          <input name="title" maxLength={120} required className="min-h-[44px] w-full min-w-0 rounded-lg border border-[#d4d4d4] px-3 text-[15px]" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-[#404040]">
          เนื้อหา
          <textarea name="body" maxLength={2000} required rows={5} className="w-full min-w-0 rounded-lg border border-[#d4d4d4] px-3 py-2 text-[15px]" />
        </label>
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-[13px] text-[#404040]">ส่งถึง</legend>
          <div className="flex flex-wrap gap-2">
            {kinds.map((k) => (
              <label key={k} className="flex min-h-[44px] items-center gap-2 rounded-lg border border-[#e5e5e5] px-3 text-[14px]">
                <input type="radio" name="audienceKind" value={k} checked={kind === k} onChange={() => setKind(k)} className="h-5 w-5" />
                {KIND_TH[k]}
              </label>
            ))}
          </div>
          <div hidden={kind !== "BUILDING"} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {o.buildings.map((b) => opt("BUILDING", b.id, b.name))}
          </div>
          <div hidden={kind !== "FLOOR"} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {o.floors.map((f) => opt("FLOOR", `${f.buildingId}:${f.floorNo}`, `${f.buildingName} ชั้น ${f.floorNo}`))}
          </div>
          <div hidden={kind !== "ROOM"} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {o.rooms.map((r) => opt("ROOM", r.id, `ห้อง ${r.number}`))}
          </div>
        </fieldset>
        <p className="text-[12px] text-[#737373]">ข้อความบริการถึงผู้เช่าที่สัญญายังมีผล ส่งตามเวลาเงียบของหอ · งานซ่อมบำรุงใช้คำว่า &quot;ไฟฟ้าดับชั่วคราว&quot; หรือ &quot;น้ำไม่ไหลชั่วคราว&quot;</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={`${BTN} bg-[#0a0a0a] text-white disabled:opacity-50`}>
            บันทึกร่าง
          </button>
          {out && out.ok === true ? <span className="text-[13px] text-[#15803d]">บันทึกร่างแล้ว — ตรวจผู้รับแล้วกด &quot;ส่งประกาศ&quot;</span> : null}
          {out && out.ok === false && out.reason ? <span className="text-[13px] text-[#b91c1c]">{out.reason}</span> : null}
        </div>
      </form>

      {model.items.length ? (
        <ul data-announce-list="" className="flex min-w-0 flex-col gap-3">
          {model.items.map((r) => (
            <Row key={r.id} r={r} publishAction={publishAction} resendAction={resendAction} />
          ))}
        </ul>
      ) : (
        <p data-announce-empty="" className="rounded-2xl border border-[#e5e5e5] bg-white p-5 text-center text-[15px] text-[#525252]">
          ยังไม่มีประกาศ
        </p>
      )}
    </div>
  );
}
