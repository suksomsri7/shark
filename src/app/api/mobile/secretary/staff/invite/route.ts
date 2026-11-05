// POST /api/mobile/secretary/staff/invite {name, phone, role, unitIds?, levels?, chat?, extraPermissions?, permissions?} — เชิญพนักงานด้วยเบอร์
//   (S1.25 `inviteStaff` · R-K11 · ไม่สร้าง Membership จนกว่าจะรับ) · เพดานของ lib (ต่อร้าน+เบอร์ 5/วัน · ร้าน 50/วัน · ผู้เชิญ 30/วัน) + เพดานเส้นนี้ 10/นาที
//   S1.14b (ตั๋ว R-S2.21 · W-12): server แปลงระดับเอง — เริ่ม `{}` → `permissionsForLevel` ทุกโมดูลใน `levels` → `permissionsForChat(chat)` →
//     รวม `permissions` (เดิม · backward-compat) + `extraPermissions` → ส่งเข้า `inviteStaff` เป็น `permissions` (ตัวตรวจยกระดับ/RBAC เดิมทำงานต่อที่ lib)
//   ตรวจก่อนสร้างใบ (ไม่สร้างแถว): โมดูล chat ใน levels / โมดูลไม่รู้จัก ⇒ 422 bad_module · ระดับที่โมดูลไม่มี ⇒ 422 bad_level ·
//     คีย์ใน extraPermissions/permissions ที่ `isSensitiveKey` ⇒ 422 `{ error:"sensitive_key", keys }` (คีย์อ่อนไหวให้ทีหลังทีละคีย์ผ่านหน้าสิทธิ์)
import { z } from "zod";
import { PERMISSION_MODULES } from "@/lib/core/permissions";
import { inviteStaff } from "@/lib/staff/invite";
import { CHAT_LEVELS, isSensitiveKey, levelsAvailableFor, permissionsForChat, permissionsForLevel, type ChatLevel, type ModuleLevel } from "@/lib/staff/levels";
import { fail, gate, ID_MAX, readBody, thrown, withRateLimit } from "../../_shared";
import { inviteResponse } from "../_staff";

const PermMap = z.record(z.string().max(120), z.unknown());
const Body = z
  .object({
    name: z.string().trim().min(1).max(80),
    phone: z.string().trim().min(6).max(20),
    role: z.enum(["MANAGER", "STAFF"]),
    unitIds: z.array(z.string().max(ID_MAX)).max(50).optional(),
    // ค่าระดับตรวจเองด้านล่าง (ตอบ 422 bad_level · ไม่ใช่ 400 ของ zod)
    levels: z.record(z.string().max(60), z.string().max(20)).optional(),
    chat: z.string().max(20).optional(),
    extraPermissions: PermMap.optional(),
    permissions: PermMap.optional(),
  })
  .strict();

const CHAT_MODULE = "chat";
const MSG_CHAT_MODULE = "ตั้งสิทธิ์แชทด้วยช่อง “แชท” (ไม่เห็น / ดูได้ / ตอบได้) แทนระดับโมดูล";
const MSG_BAD_LEVEL = "ระดับนี้ไม่มีในระบบนี้ — เลือก ปิด / ดู / ใช้งาน ตามที่หน้าจอแสดง";
const MSG_BAD_CHAT = "ระดับแชทต้องเป็น ไม่เห็น / ดูได้ / ตอบได้";
const MSG_SENSITIVE = "สิทธิ์บางข้อเป็นสิทธิ์อ่อนไหว (เงิน/ลบ/แอดมิน) ให้ตอนเชิญไม่ได้ — เชิญก่อน แล้วให้ทีละข้อที่หน้าสิทธิ์ของพนักงาน";

type Built = { ok: true; permissions: Record<string, unknown> | undefined } | { ok: false; res: Response };

/** ระดับ/แชท/คีย์เพิ่ม → PermissionMap (ตรวจทุกข้อก่อนสร้างใบ) · ไม่ส่งอะไรเลย ⇒ undefined (พฤติกรรมเดิมของ inviteStaff) */
function buildPermissions(v: z.infer<typeof Body>): Built {
  const keys = [...Object.keys(v.permissions ?? {}), ...Object.keys(v.extraPermissions ?? {})];
  const sensitive = [...new Set(keys.filter((k) => isSensitiveKey(k)))];
  if (sensitive.length) return { ok: false, res: fail(422, "sensitive_key", MSG_SENSITIVE, { keys: sensitive }) };
  let acc: Record<string, unknown> = {};
  for (const [mod, lvl] of Object.entries(v.levels ?? {})) {
    if (mod === CHAT_MODULE) return { ok: false, res: fail(422, "bad_module", MSG_CHAT_MODULE) };
    if (!PERMISSION_MODULES.some((m) => m.module === mod)) return { ok: false, res: fail(422, "bad_module", `ระบบไม่รู้จักโมดูล “${mod.slice(0, 60)}”`) };
    if (!levelsAvailableFor(mod).includes(lvl as ModuleLevel)) return { ok: false, res: fail(422, "bad_level", MSG_BAD_LEVEL) };
    acc = permissionsForLevel(mod, lvl as ModuleLevel, acc);
  }
  if (v.chat !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(CHAT_LEVELS, v.chat)) return { ok: false, res: fail(422, "bad_level", MSG_BAD_CHAT) };
    acc = permissionsForChat(v.chat as ChatLevel, acc);
  }
  const any = v.levels !== undefined || v.chat !== undefined || v.permissions !== undefined || v.extraPermissions !== undefined;
  return { ok: true, permissions: any ? { ...acc, ...(v.permissions ?? {}), ...(v.extraPermissions ?? {}) } : undefined };
}

export async function POST(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "staff-invite", 10);
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  const built = buildPermissions(b.v);
  if (!built.ok) return built.res;
  const { name, phone, role, unitIds } = b.v;
  try {
    return inviteResponse(
      await inviteStaff(
        { tenantId: a.c.tenantId, actorUserId: a.c.userId, membership: a.c.m },
        { name, phone, role, ...(unitIds !== undefined ? { unitIds } : {}), ...(built.permissions !== undefined ? { permissions: built.permissions } : {}) },
      ),
    );
  } catch (e) {
    return thrown(e, "staff.invite");
  }
}
