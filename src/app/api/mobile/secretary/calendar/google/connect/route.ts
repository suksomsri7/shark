// POST /api/mobile/secretary/calendar/google/connect — แลก serverAuthCode (@react-native-google-signin · R-CAL-17) · CAL1.8 · สัญญา §8 · §10.1
//   503 not_configured · 400 scope_missing · 400 bad_code · ซิงก์แรกใน after() (ไม่ให้แอปรอ)
import { after } from "next/server";
import { z } from "zod";
import { connectGoogle, syncGoogle } from "@/lib/modules/calendar/google";
import { ok, readBody, withErrors } from "../../../_shared";
import { gGate, gThrown } from "../_g";

const body = z.object({ serverAuthCode: z.string().min(1).max(512) }).strict();

async function POST_(req: Request) {
  const g = await gGate(req, "connect", 5);
  if (!g.ok) return g.res;
  const b = await readBody(req, body);
  if (!b.ok) return b.res;
  try {
    const dto = await connectGoogle(g.userId, b.v.serverAuthCode);
    after(() => syncGoogle(g.userId, { reason: "open" }).catch(() => undefined));
    return ok(dto);
  } catch (e) {
    return gThrown(e, "calendar/google/connect POST");
  }
}

export const POST = withErrors("secretary/calendar/google/connect POST", POST_);
