import { notFound } from "next/navigation";
import { requireUnit } from "@/lib/core/context";
import { evaluate } from "@/lib/core/rbac";
import { bkkYmd } from "@/lib/core/quiet-hours";
import { addDaysYmd, hkLogs, isYmd } from "@/lib/modules/hotel";
import { statusTh, thShortDate, thTime } from "@/components/hotel/hk/hk-shared";

type SearchP = Promise<{ [k: string]: string | string[] | undefined }>;
const one = (v: string | string[] | undefined): string => (typeof v === "string" ? v : "");

/** สรุป note JSON ของ log เป็นข้อความไทยสั้น ๆ (ไม่แสดงคีย์กันส่งซ้ำ) */
function noteText(raw: string | null): string {
  if (!raw) return "";
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return raw.slice(0, 120);
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return "";
  const n = v as Record<string, unknown>;
  const out: string[] = [];
  if (Array.isArray(n.checklist)) {
    const all = n.checklist.length;
    const done = n.checklist.filter((x) => x && typeof x === "object" && (x as { done?: unknown }).done === true).length;
    out.push(`เช็กลิสต์ ${done}/${all}`);
  }
  if (typeof n.durationSec === "number") out.push(`ใช้เวลา ${Math.round(n.durationSec / 60)} นาที`);
  if (n.minibar && typeof n.minibar === "object") {
    const mb = n.minibar as { unbilled?: unknown; posted?: unknown };
    out.push(mb.unbilled === true || (typeof mb.unbilled === "number" && mb.unbilled > 0) ? "มินิบาร์ค้างเก็บ (แขกออกไปแล้ว)" : "มินิบาร์ลงบิลห้องแขก");
  }
  if (n.inspect === "PASS") out.push("ตรวจผ่าน");
  if (n.inspect === "FAIL") out.push("ตรวจไม่ผ่าน");
  if (n.defect === "REPAIR") out.push("แจ้งช่าง");
  if (n.defect === "BLOCK") out.push("ปิดห้องซ่อม");
  for (const k of ["text", "note"]) if (typeof n[k] === "string" && n[k]) out.push(String(n[k]).slice(0, 120));
  return out.join(" · ");
}

// SVC H.6 ▸ ประวัติแม่บ้าน /hotel/housekeeping/logs?from=&to=&roomId=&mine=1 (ใบสั่ง h.6 §1 · ภาพ h.6 "hotel-hk-logs")
//   หน่วย "HOTEL" · สิทธิ์ hotel.housekeeping (ไม่มี ⇒ notFound) · URL ใช้เลือกช่วงวัน/ห้องเท่านั้น (สิทธิ์จาก session) · ช่วงวันไทยรวมปลาย ≤ 92 วัน
export default async function HousekeepingLogsPage({ params, searchParams }: { params: Promise<{ unitSlug: string }>; searchParams: SearchP }) {
  const { unitSlug } = await params;
  const sp = await searchParams;
  const { auth, unit } = await requireUnit(unitSlug);
  if (unit.type !== "HOTEL") notFound();
  const m = {
    role: auth.active.role,
    unitAccess: Array.isArray(auth.active.unitAccess) ? (auth.active.unitAccess as string[]) : [],
    permissions: (auth.active.permissions ?? {}) as Record<string, unknown>,
  };
  if (!evaluate(m, { module: "hotel", action: "hotel.housekeeping", unitId: unit.id })) notFound();
  const today = bkkYmd(new Date());
  const from = isYmd(one(sp.from)) ? one(sp.from) : addDaysYmd(today, -6);
  const to = isYmd(one(sp.to)) ? one(sp.to) : today;
  const roomId = one(sp.roomId);
  const mine = one(sp.mine) === "1";
  const r = await hkLogs({ tenantId: auth.active.tenantId }, { unitId: unit.id, from, to, ...(roomId ? { roomId } : {}), ...(mine ? { userId: auth.user.id } : {}) });
  if (!r.ok && r.code === "NOT_FOUND") notFound();
  const rows = r.ok ? r.rows : [];
  const base = `/app/u/${unitSlug}/hotel/housekeeping`;
  return (
    <div data-hk-logs={rows.length} className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-4 pb-10 text-[#18181b]">
      <div className="flex items-center gap-2">
        <a href={base} aria-label="กลับงานห้องวันนี้" className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-2xl">
          ‹
        </a>
        <h1 className="text-xl font-bold">{mine ? "ประวัติงานของฉัน" : "ประวัติแม่บ้าน"}</h1>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span>ตั้งแต่</span>
          <input type="date" name="from" defaultValue={from} className="min-h-11 rounded-xl border border-[#e4e4e7] px-3" />
        </label>
        <label className="flex flex-col gap-1">
          <span>ถึง</span>
          <input type="date" name="to" defaultValue={to} className="min-h-11 rounded-xl border border-[#e4e4e7] px-3" />
        </label>
        {mine ? <input type="hidden" name="mine" value="1" /> : null}
        {roomId ? <input type="hidden" name="roomId" value={roomId} /> : null}
        <button type="submit" className="min-h-11 rounded-xl bg-[#0a0a0a] px-4 font-semibold text-white">
          ดูช่วงนี้
        </button>
      </form>
      {!r.ok ? <p className="text-sm text-[#b91c1c]">{r.reason}</p> : null}
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#d4d4d8] px-4 py-6 text-center text-sm text-[#71717a]">ไม่มีประวัติในช่วงนี้</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#f4f4f5] rounded-[14px] border border-[#e4e4e7] bg-white">
          {rows.map((x) => (
            <li key={x.id} data-hk-log={x.toStatus} className="flex flex-col gap-0.5 px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-bold">
                  {x.roomNumber} · {x.fromStatus === x.toStatus ? "บันทึก" : `${statusTh(x.fromStatus)} → ${statusTh(x.toStatus)}`}
                </span>
                <span className="shrink-0 text-[12px] text-[#71717a]">
                  {thShortDate(bkkYmd(new Date(x.createdAt)))} {thTime(x.createdAt)}
                </span>
              </div>
              <span className="text-[13px] text-[#52525b]">
                {x.byName ?? (x.byUserId ? "พนักงาน" : "ระบบ")}
                {noteText(x.note) ? ` · ${noteText(x.note)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
