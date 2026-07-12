import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { pndCsv, whtCreditsCsv } from "@/lib/modules/account/wht";

// §10 CSV ภ.ง.ด. — ดาวน์โหลดจากหน้า /tax (UTF-8 BOM เปิด Excel ไทยได้)
//   ?kind=pnd&type=3|53&period=YYYY-MM  → ภ.ง.ด.3/53
//   ?kind=credits&period=YYYY-MM|year=YYYY → ภาษีถูกหัก (เครดิต 1160)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { auth, tenantId, systemId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.tax.view");

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") ?? "pnd";
  const period = url.searchParams.get("period") ?? "";
  const year = url.searchParams.get("year") ?? period.slice(0, 4);

  let csv: string;
  let filename: string;
  if (kind === "credits") {
    csv = await whtCreditsCsv(tenantId, systemId, { period: period || undefined, year: year || undefined });
    filename = `wht-credits-${year || period || "all"}.csv`;
  } else {
    const type = url.searchParams.get("type") === "3" ? 3 : 53;
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
