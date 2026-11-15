import Link from "next/link";
import { MoneyText } from "@/components/ui/MoneyText";
import { LegalWarnings } from "@/components/account-v2/LegalWarnings";
import { AddBackSelect } from "@/components/account-v2/TaxT5Forms";
import { taxAddBackReport } from "@/lib/modules/account/tax-add-back";
import { setTaxAddBackAction } from "@/lib/modules/account/tax-t5-actions";
import { ymdTh } from "@/lib/modules/account/tax-calendar";
import { loadReport, ReportHeader, TableWrap } from "../_shared";
import ReportToolbar from "../ReportToolbar";

// ACC T5.5 (เลน 2) — รายจ่ายที่อาจต้องบวกกลับทางภาษี + ตัวช่วยเพดานค่ารับรอง (ปิด C7 C8)
//   ตัวคิดเดียวกับ REST `GET /reports/tax-add-back` · ช่วง = รอบบัญชีที่ครอบ ณ วันที่ (asOf) · ทุนชำระแล้วกรอกเองได้ (?capital=บาท)
const isYmd = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

const toSatang = (v: string | undefined) => (v && /^-?\d+(\.\d{1,2})?$/.test(v) ? Math.round(Number(v) * 100) : null);
const toCount = (v: string | undefined) => (v && /^\d{1,5}$/.test(v) ? Number(v) : null);

export default async function TaxAddBackPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ asOf?: string; capital?: string; profit?: string; carMonths?: string; carDays?: string; carRent?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { tenantId, systemId } = await loadReport(id);
  const base = `/app/sys/${id}/account`;
  const cap = sp.capital && /^\d+(\.\d{1,2})?$/.test(sp.capital) ? Math.round(Number(sp.capital) * 100) : null;
  const r = await taxAddBackReport({ tenantId, systemId }, { asOf: isYmd(sp.asOf) ? sp.asOf : undefined, paidUpCapital: cap, netProfit: toSatang(sp.profit), carMonths: toCount(sp.carMonths), carDays: toCount(sp.carDays), carRent: toSatang(sp.carRent) });
  const d = r.donation;
  const car = r.carRent;
  const e = r.entertainment;
  const csv = {
    preamble: ["รายจ่ายที่อาจต้องบวกกลับทางภาษี (ไม่ใช่การคำนวณภาษี)", r.periodLabel],
    headers: ["รหัสบัญชี", "ชื่อบัญชี", "อนุมาตรา", "ลักษณะ", "ยอดในรอบ", "ส่วนที่อาจต้องบวกกลับ"],
    rows: r.rows.map((x) => [x.code, x.name, x.sectionTh, x.labelTh, x.amount / 100, x.addBack === null ? "ตรวจเพดาน" : x.addBack / 100]) as (string | number)[][],
  };
  return (
    <div className="flex max-w-5xl flex-col gap-5" data-testid="tax-add-back-page">
      <ReportHeader base={base} title="รายจ่ายที่อาจต้องบวกกลับทางภาษี" subtitle={`${r.periodLabel} · ${ymdTh(r.from)} – ${ymdTh(r.to)} · รายการให้ผู้ทำบัญชีตรวจ ไม่ใช่การคำนวณภาษีที่ต้องชำระ`} />
      <ReportToolbar filename={`บวกกลับทางภาษี-${r.from}-${r.to}`} csv={csv} mode="none" showCompare={false} />
      <form className="flex flex-wrap items-end gap-2 print:hidden" data-testid="addback-filter">
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          รอบบัญชีที่ครอบวันที่
          <input type="date" name="asOf" defaultValue={sp.asOf ?? r.to} className="input text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
          ทุนชำระแล้ว ณ สิ้นรอบ (บาท · ว่าง = ยอดบัญชีทุน 3000)
          <input name="capital" inputMode="decimal" defaultValue={sp.capital ?? ""} className="input w-56 text-sm" data-testid="addback-capital" />
        </label>
        {d && (
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            กำไรสุทธิก่อนหักเงินบริจาค (บาท · ว่าง = ประมาณจากบัญชี)
            <input name="profit" inputMode="decimal" defaultValue={sp.profit ?? ""} className="input w-56 text-sm" data-testid="addback-profit" />
          </label>
        )}
        {car && (
          <>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              ค่าเช่ารถยนต์นั่ง (บาท · ว่าง = ยอดบัญชี)
              <input name="carRent" inputMode="decimal" defaultValue={sp.carRent ?? ""} className="input w-40 text-sm" data-testid="addback-car-rent" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              คัน × เดือน
              <input name="carMonths" inputMode="numeric" defaultValue={sp.carMonths ?? ""} className="input w-24 text-sm" data-testid="addback-car-months" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
              คัน × วัน
              <input name="carDays" inputMode="numeric" defaultValue={sp.carDays ?? ""} className="input w-24 text-sm" data-testid="addback-car-days" />
            </label>
          </>
        )}
        <button className="btn btn-ghost btn-sm" data-testid="addback-apply">แสดง</button>
      </form>
      <LegalWarnings warnings={r.warnings} testId="addback-warnings" />

      <TableWrap>
        <thead>
          <tr className="text-left text-[color:var(--color-muted)]">
            <th className="px-3 py-2">บัญชี</th>
            <th className="px-3 py-2">อนุมาตรา</th>
            <th className="px-3 py-2 text-right">ยอดในรอบ</th>
            <th className="px-3 py-2 text-right">อาจต้องบวกกลับ</th>
            <th className="px-3 py-2 print:hidden">ธง</th>
          </tr>
        </thead>
        <tbody>
          {r.rows.map((x) => (
            <tr key={x.ledgerId} className="border-t align-top" data-testid={`addback-row-${x.code}`}>
              <td className="px-3 py-1.5">
                <Link href={`${base}/ledger?account=${x.ledgerId}&from=${r.from}&to=${r.to}`} className="underline">{x.code} {x.name}</Link>
                {x.origin === "DEFAULT" && <span className="ml-1 text-xs text-[color:var(--color-muted)]">(ค่าเริ่มต้นของระบบ)</span>}
              </td>
              <td className="px-3 py-1.5 text-xs">{x.sectionTh}<br /><span className="text-[color:var(--color-muted)]">{x.labelTh}</span></td>
              <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={x.amount} decimals /></td>
              <td className="px-3 py-1.5 text-right tabular-nums">{x.addBack === null ? <span className="text-xs text-[color:var(--color-muted)]">{x.section === "S65TRI_20" ? "กรอกจำนวนคันด้านบน" : "ส่วนเกินเพดาน — ผู้ทำบัญชีคำนวณ"}</span> : <MoneyText satang={x.addBack} decimals />}</td>
              <td className="px-3 py-1.5 print:hidden"><AddBackSelect systemId={systemId} ledgerId={x.ledgerId} value={x.section} sections={r.sections} save={setTaxAddBackAction} /></td>
            </tr>
          ))}
          <tr className="border-t font-semibold" data-testid="addback-total">
            <td className="px-3 py-1.5" colSpan={2}>รวม</td>
            <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totals.amount} decimals /></td>
            <td className="px-3 py-1.5 text-right tabular-nums"><MoneyText satang={r.totals.addBack} decimals /></td>
            <td className="print:hidden" />
          </tr>
        </tbody>
      </TableWrap>

      {e && (
        <section className="card flex flex-col gap-2 p-5 break-inside-avoid" data-testid="entertainment-cap">
          <h2 className="text-base font-semibold">ตัวช่วยเพดานค่ารับรอง</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <dt className="text-[color:var(--color-muted)]">ค่ารับรองในรอบ</dt>
            <dd className="tabular-nums" data-testid="ent-amount"><MoneyText satang={e.amount} decimals /></dd>
            <dt className="text-[color:var(--color-muted)]">รายได้ในรอบ × {(e.rateBp ?? 0) / 100}%</dt>
            <dd className="tabular-nums"><MoneyText satang={e.revenue} decimals /> → <MoneyText satang={Math.floor((Math.max(e.revenue, 0) * (e.rateBp ?? 0)) / 10000)} decimals /></dd>
            <dt className="text-[color:var(--color-muted)]">ทุนชำระแล้ว × {(e.rateBp ?? 0) / 100}% ({e.capitalSource === "INPUT" ? "กรอกเอง" : e.capitalSource === "LEDGER_3000" ? "ยอดบัญชีทุน 3000 — ตรวจว่าตรงทุนชำระแล้ว" : "ไม่มีข้อมูล"})</dt>
            <dd className="tabular-nums">{e.capital === null ? "-" : <><MoneyText satang={e.capital} decimals /> → <MoneyText satang={Math.floor((Math.max(e.capital, 0) * (e.rateBp ?? 0)) / 10000)} decimals /></>}</dd>
            <dt className="text-[color:var(--color-muted)]">เพดาน (ค่าที่มากกว่า · สูงสุด {e.maxCap === null ? "-" : <MoneyText satang={e.maxCap} decimals />})</dt>
            <dd className="font-medium tabular-nums" data-testid="ent-cap">{e.cap === null ? "-" : <MoneyText satang={e.cap} decimals />}</dd>
            <dt className="text-[color:var(--color-muted)]">ส่วนเกินเพดาน</dt>
            <dd className={`font-semibold tabular-nums ${e.excess > 0 ? "text-[color:var(--color-danger)]" : ""}`} data-testid="ent-excess"><MoneyText satang={e.excess} decimals /></dd>
          </dl>
          <p className="text-xs text-[color:var(--color-muted)]">ภาษีซื้อของค่ารับรองนับรวมในเพดานหรือไม่ยังไม่ได้ยืนยัน — ตัวช่วยนี้ไม่นับ</p>
          {e.giftDocs.length > 0 && (
            <div className="text-sm" data-testid="ent-gift-docs">
              <p className="font-medium">รายการค่ารับรองที่ยอดเกิน {e.giftLimit === null ? "-" : <MoneyText satang={e.giftLimit} decimals />} บาทต่อบรรทัด</p>
              <ul className="list-disc pl-5">
                {e.giftDocs.map((g) => (
                  <li key={`${g.documentId}-${g.amount}`}>{ymdTh(g.date)} · {g.docNo ?? "-"} · <MoneyText satang={g.amount} decimals /></li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      {d && (
        <section className="card flex flex-col gap-2 p-5 break-inside-avoid" data-testid="donation-cap">
          <h2 className="text-base font-semibold">ตัวช่วยเพดานเงินบริจาค (ค่าประมาณ)</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <dt className="text-[color:var(--color-muted)]">เงินบริจาคในรอบ</dt>
            <dd className="tabular-nums" data-testid="don-amount"><MoneyText satang={d.amount} decimals /></dd>
            <dt className="text-[color:var(--color-muted)]">กำไรก่อนหักเงินบริจาค ({d.profitSource === "INPUT" ? "กรอกเอง" : "ประมาณจากกำไรทางบัญชีของรอบ"})</dt>
            <dd className="tabular-nums" data-testid="don-profit"><MoneyText satang={d.profit} decimals /></dd>
            <dt className="text-[color:var(--color-muted)]">เพดาน {(d.rateBp ?? 0) / 100}% ของกำไร</dt>
            <dd className="font-medium tabular-nums" data-testid="don-cap">{d.cap === null ? "-" : <MoneyText satang={d.cap} decimals />}</dd>
            <dt className="text-[color:var(--color-muted)]">ส่วนที่อาจเกินเพดาน</dt>
            <dd className={`font-semibold tabular-nums ${d.excess > 0 ? "text-[color:var(--color-danger)]" : ""}`} data-testid="don-excess"><MoneyText satang={d.excess} decimals /></dd>
          </dl>
          <p className="text-xs text-[color:var(--color-muted)]">กำไรสุทธิทางภาษีต่างจากกำไรทางบัญชี · บริจาคเพื่อการศึกษา/กีฬามีเพดานแยกอีก {(d.rateBp ?? 0) / 100}% (ตัวช่วยนี้รวมเป็นก้อนเดียว) · ไม่บันทึกบัญชีให้</p>
        </section>
      )}
      {car && (
        <section className="card flex flex-col gap-2 p-5 break-inside-avoid" data-testid="car-rent-cap">
          <h2 className="text-base font-semibold">ตัวช่วยค่าเช่ารถยนต์นั่ง ≤10 ที่นั่ง</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <dt className="text-[color:var(--color-muted)]">ค่าเช่า ({car.rentSource === "INPUT" ? "กรอกเอง" : "ยอดบัญชีที่ติดธงทั้งหมด — ถ้ามีค่าน้ำมัน/ซ่อมปน ให้กรอกเฉพาะค่าเช่า"})</dt>
            <dd className="tabular-nums" data-testid="car-rent"><MoneyText satang={car.rent} decimals /></dd>
            <dt className="text-[color:var(--color-muted)]">เพดาน {car.monthlyCap === null ? "-" : <MoneyText satang={car.monthlyCap} decimals />} ต่อคันต่อเดือน · {car.dailyCap === null ? "-" : <MoneyText satang={car.dailyCap} decimals />} ต่อคันต่อวัน (รวม VAT)</dt>
            <dd className="tabular-nums" data-testid="car-units">{car.carMonths} คัน-เดือน · {car.carDays} คัน-วัน</dd>
            <dt className="text-[color:var(--color-muted)]">เพดานรวม</dt>
            <dd className="font-medium tabular-nums" data-testid="car-cap">{car.cap === null ? "กรอกจำนวนคัน × เดือน หรือ คัน × วัน" : <MoneyText satang={car.cap} decimals />}</dd>
            <dt className="text-[color:var(--color-muted)]">ส่วนที่อาจเกินเพดาน</dt>
            <dd className={`font-semibold tabular-nums ${car.excess > 0 ? "text-[color:var(--color-danger)]" : ""}`} data-testid="car-excess"><MoneyText satang={car.excess} decimals /></dd>
          </dl>
          <p className="text-xs text-[color:var(--color-muted)]">ต้นทุนรถยนต์นั่งเกิน 1 ล้านบาทเตือนในทะเบียนสินทรัพย์ · ไม่บันทึกบัญชีให้</p>
        </section>
      )}

      {r.unflagged.length > 0 && (
        <details className="card p-5 print:hidden" data-testid="addback-unflagged">
          <summary className="cursor-pointer text-sm font-medium">บัญชีค่าใช้จ่ายที่ยังไม่ติดธง ({r.unflagged.length}) — ติดธงได้ที่นี่</summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {r.unflagged.map((u) => (
              <li key={u.ledgerId} className="flex flex-wrap items-center justify-between gap-2 border-t pt-1" data-testid={`addback-unflagged-${u.code}`}>
                <span>{u.code} {u.name}</span>
                <AddBackSelect systemId={systemId} ledgerId={u.ledgerId} value={null} sections={r.sections} save={setTaxAddBackAction} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
