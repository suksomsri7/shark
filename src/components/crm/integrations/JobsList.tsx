// JobsList.tsx — "งานเบื้องหลังของระบบ" (ใบ C3.6): สุขภาพงานตามเวลาทุกตัวในทะเบียนเดียวของ C0.5 (`getMinuteJobStatus`)
// 🔴 server component · ไม่ import โมดูล CRM — ข้อมูลมาทาง props
// 🔴 มติผู้ตรวจ C3.6 S1: งานเหล่านี้เป็นของ **ทั้งแพลตฟอร์ม** (ไม่ใช่ของร้าน) และรายละเอียดข้อผิดพลาดของมัน (stack/ค่าดิบ) ห้ามถึงมือร้าน
//    ⇒ แสดงแค่สถานะ · เวลา · เหตุผลไทยกลาง ๆ (ทีมดูแลระบบเห็นรายละเอียดที่ ops)
// 🔴 390 px: การ์ดเรียงลง (ไม่ใช่ตาราง) · ข้อความยาวตัดบรรทัดได้
export type JobRow = { name: string; every: string; lastRun: string; lastOk: string; state: "ok" | "failed" | "never"; reason: string | null };

const muted = "text-[color:var(--color-muted)]";
const STATE: Record<JobRow["state"], string> = { ok: "ปกติ", failed: "รอบล่าสุดไม่สำเร็จ", never: "ยังไม่เคยรัน" };

export function JobsList({ jobs }: { jobs: JobRow[] }) {
  return (
    <section data-testid="crm-integrations-jobs" className="card flex min-w-0 flex-col gap-2 p-3 sm:p-4">
      <h2 className="text-sm font-semibold">
        งานเบื้องหลังของระบบ <span className={`text-xs font-normal ${muted}`}>งานตามเวลาที่ SHARK รันให้ทุกร้าน (สะพาน · ลำดับการติดตาม · อีเมล · รายงาน …) — ถ้าไม่ปกติ ทีมดูแลระบบได้รับแจ้งอัตโนมัติ</span>
      </h2>
      {jobs.length === 0 ? (
        <p className={`text-xs ${muted}`}>ยังไม่มีงานเบื้องหลังที่ลงทะเบียน</p>
      ) : (
        <ul className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {jobs.map((j) => (
            <li key={j.name} data-testid={`crm-integrations-job-row-${j.name}`} className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-[color:var(--color-line)] p-2">
              <span className="flex min-w-0 items-center justify-between gap-2">
                <code className="min-w-0 truncate text-xs">{j.name}</code>
                <span className={`shrink-0 text-[11px] ${j.state === "failed" ? "text-[color:var(--color-danger)]" : muted}`}>{STATE[j.state]}</span>
              </span>
              <span className={`text-[11px] ${muted}`}>
                {j.every} · รันล่าสุด {j.lastRun} · สำเร็จล่าสุด {j.lastOk}
              </span>
              {j.reason ? <span className="break-words text-[11px] text-[color:var(--color-danger)]">{j.reason}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
