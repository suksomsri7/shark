// GET/PUT /api/mobile/secretary/notify — ค่าตั้งแจ้งเตือนต่อชนิด (S1.23 · R-K20) · GET = ค่าที่มีผลในกิจการนี้
//   PUT {kind, mode, tenantId?}: ไม่ส่ง tenantId = กิจการของ x-tenant-id · `null` = ทุกกิจการ · ส่งรหัสร้านอื่น = 403 (ตั้งได้เฉพาะร้านที่ด่านตรวจแล้ว)
import { z } from "zod";
import { getNotifyPrefs, NOTIFY_KINDS, NOTIFY_MODES, setNotifyPref } from "@/lib/ai/secretary/notify";
import { forbidden, gate, ID_MAX, ok, readBody, thrown, withRateLimit, withErrors } from "../_shared";

const Body = z.object({ kind: z.string().trim().min(1).max(20), mode: z.string().trim().min(1).max(20), tenantId: z.string().trim().min(1).max(ID_MAX).nullable().optional() }).strict();

async function GET_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  return ok({ prefs: await getNotifyPrefs(a.c.userId, a.c.tenantId), kinds: NOTIFY_KINDS, modes: NOTIFY_MODES });
}

async function PUT_(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "notify");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const scope = b.v.tenantId === undefined ? a.c.tenantId : b.v.tenantId;
  if (scope !== null && scope !== a.c.tenantId) return forbidden("ตั้งค่าแจ้งเตือนได้เฉพาะกิจการที่เลือกอยู่ หรือทุกกิจการ");
  try {
    const prefs = await setNotifyPref(a.c.userId, { tenantId: scope, kind: b.v.kind, mode: b.v.mode });
    return ok({ prefs, scope: scope === null ? "all" : "tenant" });
  } catch (e) {
    return thrown(e, "notify.put");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const GET = withErrors("secretary/notify GET", GET_);
export const PUT = withErrors("secretary/notify PUT", PUT_);
