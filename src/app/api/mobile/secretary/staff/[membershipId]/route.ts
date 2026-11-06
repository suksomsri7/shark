// PUT /api/mobile/secretary/staff/[membershipId] {role?, unitIds?, levels?, chat?, extraPermissions?} — ตั้งสิทธิ์แบบระดับ (S1.25 `setStaffLevels` → `updateStaffAccess` เดิม)
//   ตัวตรวจไม่ให้ยกสิทธิ์เกินตัว (checkNoEscalation · canAssignRole · คีย์อ่อนไหวไม่มีระดับใดให้) อยู่ใน lib ทั้งหมด
import { z } from "zod";
import { setStaffLevels, type ModuleLevel, type ChatLevel } from "@/lib/staff/levels";
import { fail, gate, ID_MAX, idParam, notFound, readBody, thrown, withRateLimit, type RouteCtx, withErrors } from "../../_shared";
import { staffResponse } from "../_staff";

const Body = z
  .object({
    role: z.enum(["OWNER", "MANAGER", "STAFF"]).optional(),
    unitIds: z.array(z.string().max(ID_MAX)).max(50).optional(),
    levels: z.record(z.string().max(40), z.enum(["OFF", "VIEW", "USE"])).optional(),
    chat: z.string().max(20).optional(),
    extraPermissions: z.record(z.string().max(120), z.unknown()).optional(),
  })
  .strict();

async function PUT_(req: Request, ctx: RouteCtx<"membershipId">) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "staff");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const id = await idParam(ctx, "membershipId");
  if (!id) return notFound("ไม่พบผู้ใช้งานคนนี้");
  // SEC S3a.1-S2 ▸ R-Z15: extraPermissions ห้าม wildcard (`*` · `<module>.*`) เหมือนเส้นเชิญ (R-S1.14b-f) — lib ปฏิเสธซ้ำอีกชั้น ◂
  const wild = Object.keys(b.v.extraPermissions ?? {}).filter((k) => k.trim() === "*" || k.trim().endsWith(".*"));
  if (wild.length) return fail(422, "sensitive_key", "ให้สิทธิ์แบบทั้งระบบ (*) ผ่านช่องนี้ไม่ได้ — เลือกระดับของระบบนั้น หรือติ๊กสิทธิ์ทีละข้อ", { keys: wild });
  try {
    const { levels, chat, ...rest } = b.v;
    return staffResponse(
      await setStaffLevels({ tenantId: a.c.tenantId, actorUserId: a.c.userId, membership: a.c.m }, id, {
        ...rest,
        ...(levels ? { levels: levels as Record<string, ModuleLevel> } : {}),
        ...(chat !== undefined ? { chat: chat as ChatLevel } : {}),
      }),
    );
  } catch (e) {
    return thrown(e, "staff.put");
  }
}

// SEC S3a.1-S2 ▸ R-Z20: exception ที่หลุด ⇒ {error, message} + logOps (ไม่มี 500 ดิบ) ◂
export const PUT = withErrors("secretary/staff/[membershipId] PUT", PUT_);
