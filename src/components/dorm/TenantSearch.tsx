"use client";
// SVC D.5 (ชุดแก้ K4) ▸ ค้นผู้เช่าเดิมด้วยเบอร์/เลขบัตร — ส่งแบบ POST ผ่าน server action (ไม่อยู่ใน URL/ประวัติเบราว์เซอร์/access log)
//   ผลแสดงในหน้าเดิม · เลือกผู้เช่าเดิม = radio `partyId` ที่ผูกกับฟอร์มทำสัญญาด้วยแอตทริบิวต์ form (ไม่ซ้อนฟอร์ม)
//   ไฟล์นี้ไม่ import โมดูลฝั่ง server — action ส่งมาจากหน้า (bind unitSlug แล้ว)
import { useActionState } from "react";

type Candidate = { partyId: string; name: string; phoneMasked: string | null; matchedBy: "ID_CARD" | "PHONE"; activeLeases: number };
type SearchState = { ok: true; searched: boolean; candidates: Candidate[] } | { ok: false; code: string; reason: string } | null;

const field = "min-h-11 w-full rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] px-3 text-sm";
const btn = "min-h-11 rounded-xl bg-[color:var(--color-ink)] px-4 text-sm font-semibold text-[color:var(--color-surface)]";

export default function TenantSearch({
  search,
  formId,
}: {
  search: (prev: SearchState, formData: FormData) => Promise<SearchState>;
  formId: string;
}) {
  const [state, action, pending] = useActionState(search, null);
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="grid gap-2 sm:grid-cols-3" autoComplete="off">
        <input name="findPhone" placeholder="เบอร์โทร" inputMode="tel" className={field} />
        <input name="findId" placeholder="เลขบัตรประชาชน 13 หลัก" inputMode="numeric" className={field} />
        <button type="submit" className={btn} disabled={pending}>
          {pending ? "กำลังค้น…" : "ค้นหา"}
        </button>
      </form>
      {state && !state.ok ? <p className="text-sm text-[color:var(--color-danger)]">{state.reason}</p> : null}
      {state && state.ok && state.searched && state.candidates.length === 0 ? (
        <p className="text-sm text-[color:var(--color-muted)]">ไม่พบผู้เช่าเดิม — กรอกเป็นผู้เช่าใหม่ด้านล่าง</p>
      ) : null}
      {state && state.ok && state.candidates.length ? (
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1 text-xs text-[color:var(--color-muted)]">เลือกผู้เช่าเดิม (ใช้กับฟอร์มทำสัญญาด้านล่าง)</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="partyId" value="" form={formId} defaultChecked /> ผู้เช่าใหม่
          </label>
          {state.candidates.map((c) => (
            <label key={c.partyId} className="flex items-center gap-2">
              <input type="radio" name="partyId" value={c.partyId} form={formId} />
              {`${c.name} · ${c.phoneMasked ?? "ไม่มีเบอร์"} · ${c.matchedBy === "ID_CARD" ? "ตรงเลขบัตร" : "ตรงเบอร์"} · สัญญาที่ยังมีผล ${c.activeLeases}`}
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
