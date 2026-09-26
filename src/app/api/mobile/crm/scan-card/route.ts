// POST /api/mobile/crm/scan-card[?systemId=] — สแกนนามบัตร (ใบ C3.7 · ภาพ 13 ค "AI อ่านนามบัตรแล้ว")
// body JSON { contentType, dataBase64, filename? } → `calls.scanBusinessCard` (เครื่องอ่านของใบ C2.4 ตัวเดียว — ตรวจชนิด/ขนาด/เครดิต
// ก่อนเรียก AI · รูปไม่ถูกเก็บ) → { proposalId, draft{ name, phone, email, company, jobTitle } } — ร่างนี้เป็นของผู้สแกนเอง (ยังไม่สร้างใคร)
// การปฏิเสธของบริการ (ใหญ่เกิน · ไม่ใช่รูป · เครดิตหมด) = 400 พร้อมข้อความไทยของบริการเอง · เพดานถังที่สอง 10 ครั้ง/นาที/คน (vision เสียเครดิต)
import { requireMobile } from "@/lib/mobile/auth";
import { mobileCrmAuthError, mobileCrmBadRequest, runMobileCrm } from "@/lib/mobile/crm-routes";
import { calls } from "@/lib/modules/crm";

/** เพดานของสตริง base64 ก่อนถอด (~11 MB ของรูป) — กันหน่วยความจำ · รูปที่เกินเพดานของบริการแต่ต่ำกว่านี้ได้ข้อความของบริการเอง */
const MAX_BASE64_CHARS = 15_000_000;

export async function POST(req: Request): Promise<Response> {
  const g = await requireMobile(req);
  if (!g.ok) return mobileCrmAuthError(g);
  return runMobileCrm(req, g, async (s) => {
    const b = s.body;
    const raw = typeof b.dataBase64 === "string" ? b.dataBase64.replace(/^data:[^,]*,/, "") : "";
    if (!raw) return mobileCrmBadRequest("ยังไม่ได้เลือกรูปนามบัตร — ถ่ายรูปหรือเลือกรูปแล้วลองอีกครั้ง");
    if (raw.length > MAX_BASE64_CHARS) return mobileCrmBadRequest("รูปนามบัตรใหญ่เกินไป — ถ่ายใหม่ด้วยความละเอียดต่ำลงหรือย่อรูปก่อน");
    const data = new Uint8Array(Buffer.from(raw, "base64"));
    const filename = typeof b.filename === "string" ? b.filename.slice(0, 200) : null;
    return calls.scanBusinessCard(s.ctx, s.actor, { contentType: String(b.contentType ?? ""), data, filename });
  }, { readBody: true, bucket: "scan" });
}
