// SVC H.4 ▸ AI อ่านบัตร/พาสปอร์ต — ระบบ "เสนอ" คนยืนยัน (ใบสั่ง h.4 §0 ข้อ AI · §3.3 · Q5 · แบบ dorm/meter-ai.ts)
//   • สวิตช์ rooms.hotel.guest.aiIdReader ปิดเป็นค่าเริ่ม ⇒ AI_DISABLED ไม่ยิงอะไรออก
//   • provider ของระบบเท่านั้น (resolveProvider("smart") vision) · ไม่มีคีย์ ⇒ NO_PROVIDER (พนักงานกรอกมือ ไม่บล็อก) · เครดิตหมด ⇒ NO_CREDIT ไม่ยิง
//   • เสนอ ≠ บันทึก: ไม่เขียนทะเบียน/ไฟล์/AuditLog/outbox ที่นี่ · ฟอร์มใส่ค่าเป็น aiProposed แล้วพนักงานยืนยันทุกช่อง (upsert/checkIn ปฏิเสธ aiProposed ที่ไม่ confirmed)
//   • PDPA (X8): รูปไม่ถูกเก็บโดยฟังก์ชันนี้ · prompt ไม่มีชื่อร้าน/ห้อง/ชื่อแขก · ไม่ log รูป/เลข · หักเครดิตด้วย ref กันซ้ำ (action hotel.guest.idReader)
import { randomUUID } from "node:crypto";
import { canSpend, chargeUsage } from "@/lib/ai/credit";
import { resolveProvider } from "@/lib/ai/provider";
import { IMAGE_KINDS, checkFile, gfail, guestGate, guestSettings, isGuestFail, isRec, type GuestFail } from "./guest";
import { isIso3 } from "./guest-shared";

export type IdProposal = {
  fullName: string | null;
  nationality: string | null;
  idNumber: string | null;
  dob: string | null;
  docType: "PASSPORT" | "THAI_ID" | "OTHER" | null;
  expiry: string | null;
  sex: "M" | "F" | "X" | null;
};
export type ReadIdOk = { ok: true; proposal: IdProposal; confidence: number; creditCharged: number; model: string };
const ACTION = "hotel.guest.idReader";
const SYSTEM = [
  "You read an identity document (passport or national ID card) in a photo for a hotel guest register.",
  "Reply with JSON only: {\"fullName\": \"SURNAME, GIVEN NAMES\" or null, \"nationality\": ISO 3166-1 alpha-3 or null, \"idNumber\": document number or null,",
  "\"dob\": \"YYYY-MM-DD\" or null, \"docType\": \"PASSPORT\" | \"THAI_ID\" | \"OTHER\", \"expiry\": \"YYYY-MM-DD\" or null, \"sex\": \"M\" | \"F\" | \"X\" or null, \"confidence\": 0..1}.",
  "Use null for anything unclear. Do not guess.",
].join(" ");

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
/** แกะ JSON ก้อนแรกในคำตอบ · ไม่ใช่ JSON/ไม่มีอะไรอ่านได้ ⇒ null */
function parseProposal(text: string): { proposal: IdProposal; confidence: number } | null {
  const a = text.indexOf("{");
  const z = text.lastIndexOf("}");
  if (a < 0 || z < a) return null;
  let o: unknown;
  try {
    o = JSON.parse(text.slice(a, z + 1));
  } catch {
    return null;
  }
  if (!isRec(o)) return null;
  const nat = str(o.nationality, 3)?.toUpperCase() ?? null;
  const idRaw = str(o.idNumber, 40);
  const doc = o.docType === "PASSPORT" || o.docType === "THAI_ID" || o.docType === "OTHER" ? o.docType : null;
  const sex = o.sex === "M" || o.sex === "F" || o.sex === "X" ? o.sex : null;
  const dob = str(o.dob, 10);
  const exp = str(o.expiry, 10);
  const proposal: IdProposal = {
    fullName: str(o.fullName, 200),
    nationality: nat && isIso3(nat) ? nat : null,
    idNumber: idRaw ? idRaw.replace(/[\s-]/g, "").toUpperCase() : null,
    dob: dob && YMD.test(dob) ? dob : null,
    docType: doc,
    expiry: exp && YMD.test(exp) ? exp : null,
    sex,
  };
  if (!proposal.fullName && !proposal.idNumber && !proposal.nationality) return null;
  const c = typeof o.confidence === "number" && Number.isFinite(o.confidence) ? Math.min(1, Math.max(0, o.confidence)) : 0;
  return { proposal, confidence: c };
}

/**
 * อ่านเอกสารจากรูป → ข้อเสนอสำหรับฟอร์ม (สิทธิ์ hotel.guest.register)
 * ลำดับด่าน: หน่วย/สิทธิ์ → รูป (PNG/JPEG/WebP ≤ 8 MB · ไบต์หัวตรง) → สวิตช์ → provider → เครดิต → ยิง 1 ครั้ง → หักเครดิต
 */
export async function readIdDocument(actorIn: unknown, ctx: unknown, input: unknown): Promise<ReadIdOk | GuestFail> {
  const g = await guestGate(actorIn, ctx, isRec(input) ? input.unitId : null, ["hotel.guest.register"]);
  if (isGuestFail(g)) return g;
  const img = checkFile(isRec(input) ? input.image : null, IMAGE_KINDS);
  if (isGuestFail(img)) return img;
  const st = await guestSettings(g.tenantId, g.unitId);
  if (!st.aiIdReader) return gfail("AI_DISABLED", "ยังไม่ได้เปิดการอ่านบัตร/พาสปอร์ตด้วย AI — กรอกข้อมูลเองได้เลย (เปิดได้ที่ ตั้งค่าโรงแรม)");
  const provider = resolveProvider("smart");
  if (!provider) return gfail("NO_PROVIDER", "ระบบอ่านเอกสารอัตโนมัติยังไม่พร้อม — กรอกข้อมูลเองได้เลย");
  if (!(await canSpend(g.tenantId))) return gfail("NO_CREDIT", "เครดิต AI ของร้านหมด — กรอกข้อมูลเองได้เลย หรือเติมเครดิตก่อน");
  const url = `data:${img.contentType};base64,${Buffer.from(img.data).toString("base64")}`;
  let reply: { text: string; model: string; tokensIn: number; tokensOut: number };
  try {
    reply = await provider.chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: "Read this document.", imageUrls: [url] },
      ],
      { maxTokens: 300 },
    );
  } catch {
    return gfail("AI_FAILED", "อ่านเอกสารอัตโนมัติไม่สำเร็จ — กรอกข้อมูลเองได้เลย");
  }
  let charged = 0;
  try {
    charged = await chargeUsage({ tenantId: g.tenantId }, { source: "CHAT", model: reply.model, tokensIn: reply.tokensIn, tokensOut: reply.tokensOut, userId: g.actor.userId, note: ACTION, ref: `${ACTION}:${randomUUID()}` });
  } catch {
    charged = 0;
  }
  const parsed = parseProposal(typeof reply.text === "string" ? reply.text : "");
  if (!parsed) return gfail("UNREADABLE", "อ่านข้อมูลจากรูปไม่ออก — ถ่ายรูปให้ชัดขึ้น หรือกรอกข้อมูลเอง");
  return { ok: true, proposal: parsed.proposal, confidence: parsed.confidence, creditCharged: charged, model: reply.model };
}
