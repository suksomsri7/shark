// GET /api/v1/chat/config — ข้อความต้อนรับ/นอกเวลา + เวลาทำการ + หน้าตา widget ตามภาษาที่ขอ (§3.2)
//
// auth: widget **หรือ** secret
// 🔴 §3.2 ฉบับแรกเขียนว่าเส้นนี้เป็น "widget เท่านั้น" — แก้แล้วเมื่อ WO-C16 เพราะผู้ใช้จริงรายแรก
//    (เว็บ SiamDive) เรียกจากเซิร์ฟเวอร์ด้วย secret key เพื่อเอา `businessHours` ไปแสดงบนแผ่นแชท
//    การบังคับให้ต้องมี widget key = บังคับให้ร้านออกกุญแจสาธารณะ + ตั้ง originAllowlist
//    ทั้งที่ไม่ได้ฝัง widget เลย (และกุญแจ widget ต้องโผล่ในเบราว์เซอร์ ซึ่งไม่จำเป็นที่นี่)
//
// 🔴 ไม่มีทางอ่านข้ามร้าน: ทั้งสองโหมดได้ `connection` จาก **กุญแจ** เท่านั้น
//    (widget → connection ที่ผูกกับ publicKeyHash · secret → connection ของ tenant ในคีย์)
//    เส้นนี้ไม่รับ systemId/connectionId จาก query/body เลย — กฎเหล็กข้อ 2 §2
// ⚠️ โหมด widget ยังไม่ต้องมี guest (เรียกก่อนผู้ใช้เริ่มคุย) แต่ยังต้องผ่าน origin allowlist ตามเดิม
import { authenticateChatRequest, chatJson, chatPreflight } from "@/lib/modules/chat/public-auth";
import { publicConfig } from "@/lib/modules/chat/service";

export async function OPTIONS(req: Request): Promise<Response> {
  return chatPreflight(req);
}

export async function GET(req: Request): Promise<Response> {
  const auth = await authenticateChatRequest(req, { guest: "optional" });
  if (!auth.ok) return auth.response;
  const lang = new URL(req.url).searchParams.get("lang");
  return chatJson(auth, await publicConfig(auth.connection, lang));
}
