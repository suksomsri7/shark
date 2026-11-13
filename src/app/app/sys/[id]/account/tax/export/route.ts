import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { pnd1kCsv, pndCsv, whtCreditsCsv } from "@/lib/modules/account/wht";
import { isPndFormNumber } from "@/lib/modules/account/wht-forms";
import { pp30Csv } from "@/lib/modules/account/reports";

// §10 CSV ภ.ง.ด. — ดาวน์โหลดจากหน้า /tax (UTF-8 BOM เปิด Excel ไทยได้)
//   ?kind=pnd&type=1|2|3|53|54&period=YYYY-MM  → CSV ช่วยกรอกแบบ ภ.ง.ด. (ACC T3.4)
//   ?kind=pnd1k&year=YYYY → CSV ช่วยกรอกแบบ ภ.ง.ด.1ก (รายปี)
//   ?kind=credits&period=YYYY-MM|year=YYYY → ภาษีถูกหัก (เครดิต 1160)
//   ?kind=pp30&period=YYYY-MM (&carry=สตางค์ = ลองดูชั่วคราว · ไม่ส่ง = เครดิตยกมาที่จำไว้) → ภ.พ.30 รายเดือน (WO-0035)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.tax.view");

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "pnd";
  // 🔴 WO 9.2 ข้อ 7: `period`/`year` ถูกเอาไปต่อเป็นชื่อไฟล์ใน header `Content-Disposition`
  //    ของเดิมรับค่าดิบจาก query string ⇒ ยัด `"` เข้าไปแล้วแก้ชื่อไฟล์ที่ลูกค้าดาวน์โหลดได้
  //    (เช่น `?period=x";filename="งบการเงิน.exe`) · งวดของจริงมีแค่ตัวเลขกับ `-`
  const safe = (v: string) => v.replace(/[^0-9-]/g, "").slice(0, 10);
  const period = safe(url.searchParams.get("period") ?? "");
  const year = safe(url.searchParams.get("year") ?? period.slice(0, 4));

  let csv: string;
  let filename: string;
  if (kind === "pp30") {
    // ACC T1.3 ▸ ไม่ส่ง carry = ใช้เครดิตยกมาที่จำไว้ (ส่ง = ค่าลองดูชั่วคราว ไม่บันทึก) ◂
    const rawCarry = url.searchParams.get("carry");
    const carry = rawCarry === null || rawCarry === "" ? null : Number(rawCarry);
    csv = await pp30Csv({ tenantId, systemId }, period, { carryForward: carry !== null && Number.isFinite(carry) ? carry : null });
    filename = `pp30-${period || "all"}.csv`;
  } else if (kind === "credits") {
    csv = await whtCreditsCsv(tenantId, systemId, { period: period || undefined, year: year || undefined });
    filename = `wht-credits-${year || period || "all"}.csv`;
  } else if (kind === "pnd1k") {
    csv = await pnd1kCsv(tenantId, systemId, { year: Number(year) || new Date().getFullYear() });
    filename = `pnd1k-${year || "all"}.csv`;
  } else {
    const raw = Number(url.searchParams.get("type"));
    const type = isPndFormNumber(raw) ? raw : 53;
    csv = await pndCsv(tenantId, systemId, { type, period });
    filename = `pnd${type}-${period || "all"}.csv`;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
