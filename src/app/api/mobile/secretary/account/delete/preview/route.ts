// GET /api/mobile/secretary/account/delete/preview — ผลกระทบก่อนลบบัญชี (`previewAccountDeletion` · อ่านอย่างเดียว) · Bearer อย่างเดียว
import { previewAccountDeletion } from "@/lib/platform/account-deletion";
import { ok, userGate, withErrors } from "../../../_shared";

async function GET_(req: Request) {
  const a = await userGate(req);
  if (!a.ok) return a.res;
  return ok(await previewAccountDeletion(a.userId));
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/account/delete/preview GET", GET_);
