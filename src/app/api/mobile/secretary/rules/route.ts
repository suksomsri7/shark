// GET/PUT /api/mobile/secretary/rules — กฎอนุมัติ 3 ข้อ (B4 · S1.7) · PUT {key, enabled?, limitSatang?} OWNER เท่านั้น (`setRule` ผูกร้าน R-S1.7e)
//   R-K3b: รุ่นแรกกฎ = แสดง + ใช้ในข้อความ "ทำไมต้องอนุมัติ" เท่านั้น (ทุกข้อเสนอยังต้องอนุมัติ) · money/destructive/pii = ALWAYS_APPROVE ปิดไม่ได้
import { z } from "zod";
import { listRules, setRule } from "@/lib/ai/secretary/approval-gate";
import { ALWAYS_APPROVE, RULE_KEYS } from "@/lib/ai/secretary/kind-class";
import { gate, ok, readBody, thrown, withRateLimit } from "../_shared";

const Body = z.object({ key: z.string().trim().min(1).max(40), enabled: z.boolean().optional(), limitSatang: z.number().int().min(0).max(1e12).nullable().optional() }).strict();

export async function GET(req: Request) {
  const a = await gate(req);
  if (!a.ok) return a.res;
  return ok({ rules: await listRules(a.c.tenantId), keys: RULE_KEYS, alwaysApprove: ALWAYS_APPROVE });
}

export async function PUT(req: Request) {
  const a = await gate(req, null);
  if (!a.ok) return a.res;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, "rules");
  if (rl) return rl;
  const b = await readBody(req, Body);
  if (!b.ok) return b.res;
  try {
    const patch = { ...(b.v.enabled !== undefined ? { enabled: b.v.enabled } : {}), ...(b.v.limitSatang !== undefined ? { limitSatang: b.v.limitSatang } : {}) };
    const rules = await setRule(a.c.tenantId, { userId: a.c.userId, membership: a.c.m, tenantId: a.c.tenantId }, b.v.key, patch);
    return ok({ rules, keys: RULE_KEYS, alwaysApprove: ALWAYS_APPROVE });
  } catch (e) {
    return thrown(e, "rules.put");
  }
}
