import { loadAccountSystem } from "@/lib/modules/account/guard";
import { assertAccountCan } from "@/lib/modules/account/access";
import { buildBooksArchive } from "@/lib/modules/account/books-export";
import { logTenantDeletion } from "@/lib/platform/pdpa";

// ACC T4.5 (K2 K6 G1) — ดาวน์โหลดสมุดบัญชีที่พิมพ์ได้ + ไฟล์แนบ (ZIP) ก่อนลบร้าน/ยกเลิกบริการ
//   สิทธิ์ = ดูรายงาน (account.report.view) · ทุกครั้งที่ส่งออกลง log การลบร้าน (EXPORTED · ใคร · สมุด · จำนวน) — หน้าขอลบร้านอ่าน "ส่งออกแล้วเมื่อ"
//   ?attachments=0 = ไม่รวมไฟล์แนบ (ไฟล์เล็ก)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { auth, tenantId, systemId, userId } = await loadAccountSystem(id);
  assertAccountCan(auth, "account.report.view");
  const url = new URL(req.url);
  const { zip, summary, filename } = await buildBooksArchive({ tenantId, systemId }, { includeAttachments: url.searchParams.get("attachments") !== "0" });
  await logTenantDeletion(tenantId, "EXPORTED", userId ?? null, { systemId, ...summary });
  return new Response(new Uint8Array(zip), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="books.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "no-store",
    },
  });
}
