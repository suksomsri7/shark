// ACC T5.4 (เลน 2) ▸ ดาวน์โหลดไฟล์ e-Tax ที่เก็บไว้ (PDF ที่ส่ง / ไฟล์ประทับเวลา) — สิทธิ์ account.doc.view · ไบต์ตรงตามที่เก็บ (hash ตรวจทุกครั้ง)
import { NextResponse } from "next/server";
import { loadAccountSystem } from "@/lib/modules/account/guard";
import { etaxFile } from "@/lib/modules/account/etax-ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const { tenantId, systemId } = await loadAccountSystem(String(id).slice(0, 40), { can: "account.doc.view" });
  const f = await etaxFile({ tenantId, systemId }, String(fileId).slice(0, 40));
  if (!f) return new NextResponse("not found", { status: 404 });
  return new NextResponse(Buffer.from(f.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
      "X-Content-SHA256": f.sha256,
      "X-Content-Intact": f.intact ? "1" : "0",
      "Cache-Control": "private, no-store",
    },
  });
}
