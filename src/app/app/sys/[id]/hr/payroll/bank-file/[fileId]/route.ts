// HR H3.5 ▸ ดาวน์โหลดไฟล์โอนเงินเดือน (brief R14 · R11) — GET → downloadBankFile เท่านั้น
//   ไม่เก็บไบต์ไว้ที่ไหน: service สร้างใหม่ด้วยตัวเลือก + เวลาเดิมของใบกำกับแล้วเทียบ sha (ข้อมูลเปลี่ยน/หมดอายุ/รอบถูกกลับ = ข้อความคงที่ ไม่มีไบต์ไฟล์)
//   หัวตอบ: attachment · no-store · nosniff · ชื่อไฟล์จากใบกำกับ (ตัดอักขระนอก A-Z a-z 0-9 _ . -) ◂
import { requireTenant } from "@/lib/core/context";
import { hrViewerOf } from "@/lib/modules/hr/privacy";
import { BANK_TEXT } from "@/lib/modules/hr/bank-files/codes";
import { downloadBankFile } from "@/lib/modules/hr/bank-files/service";

const STATUS_OF: Record<string, number> = { NO: 404, STATUS: 409, CHANGED: 409, EXPIRED: 410 };
const refuse = (text: string, status: number) =>
  new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const auth = await requireTenant();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return refuse(BANK_TEXT.no, 404);
  // ระบบต้องเป็นระบบ HR ของร้านนี้ + ผู้ดูผ่านด่าน — service ตรวจทั้งคู่ (ไม่ผ่าน = ข้อความ "ไม่พบ" เดียวกัน)
  const r = await downloadBankFile({ tenantId: auth.active.tenantId, systemId: id }, hrViewerOf(auth), { fileId });
  if (!r.ok) return refuse(r.reason, STATUS_OF[r.code] ?? 409);
  const name = r.fileName.replace(/[^A-Za-z0-9_.-]/g, "_");
  return new Response(Buffer.from(r.bytes), {
    status: 200,
    headers: {
      "Content-Type": r.contentType,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(r.bytes.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
