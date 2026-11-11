// SVC D.9 ▸ สัญญาและเอกสารของห้อง · /d/<token>/lease — สาธารณะ ด่านเดียวกับหน้าจ่าย (ล้ม ⇒ notFound() เนื้อเดียวกัน)
//   ข้อความสัญญาจาก snapshot · ไฟล์ = รูปห้อง + เอกสาร เท่านั้น (ไม่มีบัตรประชาชน/ลายเซ็น) ผ่าน route f/[fileId] ที่ตรวจด่านซ้ำ
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { loadPortalLease, portalClientKey } from "@/lib/platform/dorm-portal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "สัญญาเช่า", robots: { index: false, follow: false }, referrer: "no-referrer" };

const money = (satang: number) => `฿${Math.trunc(satang / 100).toLocaleString("en-US")}.${String(satang % 100).padStart(2, "0")}`;
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const thDate = (ymd: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${Number(m[3])} ${TH_MONTHS[Number(m[2]) - 1] ?? ""} ${Number(m[1]) + 543}` : ymd;
};

export default async function DormPortalLeasePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await loadPortalLease(token, { clientKey: portalClientKey(await headers()) });
  if (!v) notFound();
  return (
    <main className="min-h-dvh bg-[#fafafa]">
      <div data-portal-lease-page="" className="mx-auto flex w-full max-w-[480px] flex-col gap-4 px-4 py-5 text-[#0a0a0a]">
        <header className="flex items-baseline justify-between gap-3 border-b border-[#e5e5e5] pb-3">
          <h1 className="text-[18px] font-bold">{`สัญญาห้อง ${v.roomNumber}`}</h1>
          <span className="truncate text-[13px] text-[#737373]">{v.unitName}</span>
        </header>
        <section className="grid grid-cols-2 gap-2 rounded-2xl border border-[#e5e5e5] bg-white p-4 text-[14px]">
          <span className="text-[#737373]">เริ่มสัญญา</span>
          <span>{thDate(v.startDate)}</span>
          <span className="text-[#737373]">สิ้นสุด</span>
          <span>{v.endDate ? thDate(v.endDate) : "ไม่กำหนด"}</span>
          <span className="text-[#737373]">ค่าเช่า/เดือน</span>
          <span className="tabular-nums">{money(v.rentSatang)}</span>
          <span className="text-[#737373]">ค่าส่วนกลาง</span>
          <span className="tabular-nums">{money(v.commonFeeSatang)}</span>
          <span className="text-[#737373]">เงินประกัน</span>
          <span className="tabular-nums">{money(v.depositSatang)}</span>
        </section>
        {v.contract ? (
          <section className="flex flex-col gap-2 rounded-2xl border border-[#e5e5e5] bg-white p-4 text-[14px]">
            {v.contract.textTh ? <p className="whitespace-pre-wrap">{v.contract.textTh}</p> : null}
            {v.contract.clauses.map((c, i) => (
              <div key={i}>
                <p className="font-bold">{c.titleTh}</p>
                <p className="whitespace-pre-wrap text-[#404040]">{c.textTh}</p>
              </div>
            ))}
          </section>
        ) : null}
        {v.files.length ? (
          <section className="rounded-2xl border border-[#e5e5e5] bg-white p-4">
            <h2 className="mb-2 text-[14px] font-bold">เอกสารและรูปห้อง</h2>
            <ul className="flex flex-col divide-y divide-[#e5e5e5] text-[14px]">
              {v.files.map((f, i) => (
                <li key={f.fileId}>
                  <a href={f.path} className="flex min-h-[44px] items-center justify-between">
                    <span>{f.kind === "DOCUMENT" ? `เอกสาร ${i + 1}` : `รูปห้อง ${i + 1}`}</span>
                    <span className="text-[12px] text-[#737373]">เปิด</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <a href={`/d/${token}`} className="flex min-h-[44px] items-center justify-center rounded-xl border border-[#e5e5e5] bg-white text-[14px]">
          กลับหน้าบิล
        </a>
      </div>
    </main>
  );
}
