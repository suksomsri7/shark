// GET /api/mobile/secretary/account/delete/preview — ผลกระทบก่อนลบบัญชี (`previewAccountDeletion` · อ่านอย่างเดียว) · Bearer อย่างเดียว
import { previewAccountDeletion } from "@/lib/platform/account-deletion";
import { ok, userGate } from "../../../_shared";

export async function GET(req: Request) {
  const a = await userGate(req);
  if (!a.ok) return a.res;
  return ok(await previewAccountDeletion(a.userId));
}
