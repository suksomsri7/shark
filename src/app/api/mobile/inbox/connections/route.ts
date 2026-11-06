// GET /api/mobile/inbox/connections?systemId — ช่องทางที่เชื่อมไว้ (ชนิด/ชื่อ/สถานะเท่านั้น · ไม่มีค่าลับใด ๆ · S1.21)
import { listConnections } from "@/lib/modules/chat/service";
import { connectionDto } from "@/lib/mobile/inbox-dto";
import { gate, notFound, READ, systemOf, withErrors } from "../_shared";

async function GET_(req: Request) {
  const a = await gate(req, [READ]);
  if (!a.ok) return a.res;
  const sid = await systemOf(a.c.tenantId, new URL(req.url).searchParams.get("systemId"));
  if (!sid) return notFound("ไม่พบระบบแชทนี้");
  return Response.json({ items: (await listConnections(a.c.tenantId, sid)).map(connectionDto) });
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("inbox/connections GET", GET_);
