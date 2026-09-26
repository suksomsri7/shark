"use client";

// QuotaManager.tsx — ตาราง "โควตารายเดือน" (ใบ C3.2 · ภาพ 10 ขวา · พิมพ์เขียว §11.6): พนักงาน/ทีม · เป้ามูลค่า · เป้าดีล · ทำได้ (แถบ + %)
// 🔴 ไฟล์ client: ไม่ import โมดูล CRM/prisma — ข้อมูล (ผ่านด่าน crm.quota.manage แล้ว) + server action มาทาง props
// 🔴 เงินในช่องกรอกเป็น "บาท" (คนพิมพ์) → ส่งเป็นสตางค์จำนวนเต็ม · ตรวจในช่องก่อนส่ง (inline · ไม่ใช้ alert) · บริการตรวจซ้ำ
// 🔴 งวดที่จบแล้ว: พนักงานที่ไม่ใช่ผู้จัดการ/เจ้าของร้าน แก้ไม่ได้ (ช่องปิด + คำอธิบาย) — บริการปฏิเสธซ้ำอีกชั้น
// 🔴 ทีมที่ไม่ได้ตั้งเป้าเอง = แสดงผลรวมเป้าของสมาชิกแบบจาง (ตั้งเป้าของทีมเองได้ทันทีในช่องเดียวกัน)
// 🔴 390 px: ตารางซ่อนคอลัมน์ "เป้าดีล" และหดแถบความคืบหน้า · ช่องกรอกกว้างตามพื้นที่ (ไม่มีความกว้างตายตัวที่ดันจอ)

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

export type QuotaRowView = {
  ownerType: "USER" | "TEAM";
  ownerId: string;
  name: string;
  targetSatang: number | null;
  targetDeals: number | null;
  derived: boolean;
  achievedSatang: number;
  pct: number | null;
};

/** `targetDeals` ไม่ส่ง (undefined) = คงค่าเดิม (รีวิว S2/N7) */
export type QuotaSaveAction = (
  systemId: string,
  input: { ownerType: string; ownerId: string; periodKey: string; targetSatang: number; targetDeals?: number | null },
) => Promise<{ ok: true } | { ok: false; error: string; code?: string }>;

const muted = "text-[color:var(--color-muted)]";
const baht = (satang: number) => `฿${Math.round(satang / 100).toLocaleString("th-TH")}`;
const keyOf = (r: { ownerType: string; ownerId: string }) => `${r.ownerType}-${r.ownerId}`;
const bahtInput = (satang: number | null) => (satang === null ? "" : String(Math.round(satang / 100)));

type Draft = { target: string; deals: string };

function parseDraft(d: Draft): { targetSatang: number; targetDeals: number | null } | string {
  const t = d.target.replace(/[,\s฿]/g, "");
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(t)) return "ใส่เป้าเป็นจำนวนเงินบาท เช่น 350000";
  const satang = Math.round(Number(t) * 100);
  if (!Number.isSafeInteger(satang)) return "จำนวนเงินมากเกินไป";
  const dl = d.deals.trim();
  if (dl && !/^\d{1,7}$/.test(dl)) return "เป้าดีลเป็นจำนวนเต็ม เช่น 10";
  return { targetSatang: satang, targetDeals: dl ? Number(dl) : null };
}

export function QuotaManager({
  systemId,
  periodKey,
  locked,
  rows,
  save,
}: {
  systemId: string;
  periodKey: string;
  /** งวดจบแล้วและผู้ดูไม่ใช่ผู้จัดการ/เจ้าของร้าน */
  locked: boolean;
  rows: QuotaRowView[];
  save: QuotaSaveAction;
}) {
  const router = useRouter();
  const initial = useMemo(() => Object.fromEntries(rows.map((r) => [keyOf(r), { target: r.derived ? "" : bahtInput(r.targetSatang), deals: r.derived ? "" : r.targetDeals === null ? "" : String(r.targetDeals) }])) as Record<string, Draft>, [rows]);
  const [draft, setDraft] = useState<Record<string, Draft>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const dirty = rows.filter((r) => {
    const k = keyOf(r);
    return (draft[k]?.target ?? "") !== (initial[k]?.target ?? "") || (draft[k]?.deals ?? "") !== (initial[k]?.deals ?? "");
  });

  const onSave = () => {
    setMsg(null);
    const errs: Record<string, string> = {};
    const jobs: { r: QuotaRowView; v: { targetSatang: number; targetDeals?: number | null } }[] = [];
    for (const r of dirty) {
      const k = keyOf(r);
      const d = draft[k] ?? { target: "", deals: "" };
      if (!d.target.trim()) {
        errs[k] = "ใส่เป้ามูลค่าก่อนบันทึก (ใส่ 0 ถ้าไม่มีเป้า)";
        continue;
      }
      const v = parseDraft(d);
      if (typeof v === "string") {
        errs[k] = v;
        continue;
      }
      // รีวิว N7/S2: ช่องเป้ามูลค่าที่ไม่ได้แก้ = ส่งสตางค์เดิม (ไม่ปัดเศษสตางค์ทิ้ง) · ช่องเป้าดีลที่ไม่ได้แก้ = ไม่ส่ง (บริการคงค่าเดิม)
      const targetUnchanged = d.target === (initial[k]?.target ?? "") && !r.derived && r.targetSatang !== null;
      const dealsUnchanged = d.deals === (initial[k]?.deals ?? "");
      jobs.push({ r, v: { targetSatang: targetUnchanged ? r.targetSatang! : v.targetSatang, ...(dealsUnchanged ? {} : { targetDeals: v.targetDeals }) } });
    }
    setErrors(errs);
    if (Object.keys(errs).length) return setMsg({ ok: false, text: "มีบางแถวที่ยังบันทึกไม่ได้ — ดูข้อความใต้แถวนั้น" });
    if (jobs.length === 0) return setMsg({ ok: true, text: "ไม่มีอะไรเปลี่ยน" });
    start(async () => {
      const fails: Record<string, string> = {};
      let done = 0;
      for (const j of jobs) {
        const res = await save(systemId, { ownerType: j.r.ownerType, ownerId: j.r.ownerId, periodKey, targetSatang: j.v.targetSatang, targetDeals: j.v.targetDeals });
        if (res.ok) done += 1;
        else fails[keyOf(j.r)] = res.error;
      }
      setErrors(fails);
      setMsg(Object.keys(fails).length ? { ok: false, text: `บันทึกแล้ว ${done} แถว · ยังไม่สำเร็จ ${Object.keys(fails).length} แถว` } : { ok: true, text: `บันทึกเป้าแล้ว ${done} แถว` });
      router.refresh();
    });
  };

  return (
    <section className="card flex min-w-0 flex-col gap-0 p-0" data-testid="crm-quota-table">
      <table className="w-full table-fixed text-sm">
        <thead className={`bg-[color:var(--color-surface-2)] text-left text-xs ${muted}`}>
          <tr>
            <th className="px-3 py-2 font-medium">พนักงาน/ทีม</th>
            <th className="w-32 px-2 py-2 text-right font-medium sm:w-40">เป้ามูลค่า (บาท)</th>
            <th className="hidden w-24 px-2 py-2 text-right font-medium sm:table-cell">เป้าดีล</th>
            <th className="w-24 px-3 py-2 font-medium sm:w-44">ทำได้</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => {
            const k = keyOf(r);
            const d = draft[k] ?? { target: "", deals: "" };
            const err = errors[k];
            return (
              <tr key={k} data-testid={`crm-quota-row-${k}`} className={r.ownerType === "TEAM" ? "bg-[color:var(--color-surface-2)]" : ""}>
                <td className="px-3 py-2 align-top">
                  <span className={`block truncate ${r.ownerType === "TEAM" ? "font-semibold" : ""}`}>{r.name}</span>
                  {r.ownerType === "TEAM" && <span className={`block text-xs ${muted}`}>{r.derived ? "ทีม · รวมเป้าของสมาชิก" : "ทีม · เป้าที่ตั้งเอง"}</span>}
                  {err && (
                    <span className="block text-xs text-[color:var(--color-danger)]" role="alert">
                      {err}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 align-top">
                  <input
                    inputMode="decimal"
                    className="input text-right tabular-nums"
                    value={d.target}
                    placeholder={r.derived && r.targetSatang !== null ? bahtInput(r.targetSatang) : "0"}
                    disabled={locked || pending}
                    aria-label={`เป้ามูลค่าของ ${r.name} (บาท)`}
                    onChange={(e) => setDraft((x) => ({ ...x, [k]: { ...d, target: e.target.value } }))}
                    data-testid={`crm-quota-target-${k}`}
                  />
                </td>
                <td className="hidden px-2 py-2 align-top sm:table-cell">
                  <input
                    inputMode="numeric"
                    className="input text-right tabular-nums"
                    value={d.deals}
                    placeholder={r.derived && r.targetDeals !== null ? String(r.targetDeals) : "–"}
                    disabled={locked || pending}
                    aria-label={`เป้าจำนวนดีลของ ${r.name}`}
                    onChange={(e) => setDraft((x) => ({ ...x, [k]: { ...d, deals: e.target.value } }))}
                    data-testid={`crm-quota-deals-${k}`}
                  />
                </td>
                <td className="px-3 py-2 align-top">
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-line)]" aria-hidden="true">
                      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, r.pct ?? 0)}%`, background: (r.pct ?? 0) >= 80 ? "var(--color-ink)" : "var(--color-muted)" }} />
                    </span>
                    <span className={`truncate text-xs tabular-nums ${muted}`}>
                      {r.pct === null ? baht(r.achievedSatang) : `${r.pct}% · ${baht(r.achievedSatang)}`}
                    </span>
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex min-w-0 flex-wrap items-center gap-3 border-t px-3 py-3">
        <button type="button" className="btn btn-primary" onClick={onSave} disabled={locked || pending || dirty.length === 0} data-testid="crm-quota-save">
          {pending ? "กำลังบันทึก…" : dirty.length ? `บันทึก ${dirty.length} แถว` : "บันทึก"}
        </button>
        {locked && <span className={`text-xs ${muted}`}>งวดนี้จบแล้ว — การแก้โควตาย้อนหลังต้องให้ผู้จัดการหรือเจ้าของร้านทำ</span>}
        {msg && (
          <p role="status" className={`min-w-0 text-sm ${msg.ok ? "" : "text-[color:var(--color-danger)]"}`} data-testid="crm-quota-msg">
            {msg.text}
          </p>
        )}
      </div>
    </section>
  );
}
