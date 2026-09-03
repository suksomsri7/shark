import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { buildTemplateCsv, templateFilename, IMPORT_FIELDS, type ImportKind } from "@/lib/modules/account/import-shared";

// WO 1.8 §8.5 — เทมเพลต CSV ดาวน์โหลด (หัวคอลัมน์ไทย + ตัวอย่าง 2 แถว + BOM ให้ Excel เปิดไทยไม่เพี้ยน)
//   ?kind=documents_revenue|documents_expense|contacts|products
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { auth } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.import");

  const url = new URL(req.url);
  const kindRaw = url.searchParams.get("kind") ?? "";
  const kind = (IMPORT_FIELDS[kindRaw as ImportKind] ? kindRaw : "documents_revenue") as ImportKind;

  const csv = buildTemplateCsv(kind);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${templateFilename(kind)}"`,
      "Cache-Control": "no-store",
    },
  });
}
