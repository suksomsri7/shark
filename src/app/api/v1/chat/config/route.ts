// GET /api/v1/chat/config — ข้อความต้อนรับ/นอกเวลา + หน้าตา widget ตามภาษาที่ขอ (§3.2)
//
// เฉพาะโหมด widget · ยังไม่ต้องมี guest (เรียกก่อนผู้ใช้เริ่มคุย)
import { authenticateChatRequest, chatJson, chatPreflight } from "@/lib/modules/chat/public-auth";
import { publicConfig } from "@/lib/modules/chat/service";

export async function OPTIONS(req: Request): Promise<Response> {
  return chatPreflight(req);
}

export async function GET(req: Request): Promise<Response> {
  const auth = await authenticateChatRequest(req, { guest: "optional" });
  if (!auth.ok) return auth.response;
  if (auth.mode !== "widget") {
    return chatJson(auth, { error: "เส้นนี้ใช้ได้เฉพาะกุญแจ widget" }, 403);
  }
  const lang = new URL(req.url).searchParams.get("lang");
  return chatJson(auth, await publicConfig(auth.connection, lang));
}
