// TRIPS T1.1 ▸ โครงการ์ดระหว่างโหลดจอทัวร์ (Suspense fallback ของ segment /trips) — ไม่มีข้อมูล ไม่มีสถานะที่ทำให้เข้าใจผิด
export default function TripsLoading() {
  return (
    <div data-testid="trips-loading" aria-busy="true" aria-live="polite" className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-surface)] p-5">
          <div className="h-5 w-1/2 animate-pulse rounded bg-[color:var(--color-surface-2)]" />
          <div className="h-4 w-full animate-pulse rounded bg-[color:var(--color-surface-2)]" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-[color:var(--color-surface-2)]" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-[color:var(--color-surface-2)]" />
        </div>
      ))}
      <span className="sr-only">กำลังโหลด…</span>
    </div>
  );
}
