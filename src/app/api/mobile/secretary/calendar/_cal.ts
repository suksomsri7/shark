// _cal.ts — ตัวช่วยร่วมของ route `/api/mobile/secretary/calendar/*` (CAL1.6 · สัญญา docs/modules/32-secretary-calendar.md §8)
//   ด่าน = สมาชิกร้าน `gate(req, null)` (ปฏิทินส่วนตัวของทุกคน ไม่ต้องมีคีย์) → actor มาจากโทเค็น+x-tenant-id เท่านั้น (M3)
//   CalError (ไทย · 400/404/409/410) → `{ error: code, message }` · อื่น ๆ → thrown() ของเลขา
import { z } from "zod";
import { CalError, type CalActor } from "@/lib/modules/calendar/items";
import { ymdToDayNo } from "@/lib/modules/calendar/next-fire";
import { fail, gate, thrown, withRateLimit, type SecCtx } from "../_shared";

export type CalGate = { ok: true; actor: CalActor; c: SecCtx } | { ok: false; res: Response };

/** ด่าน + เพดานอัตรา `cal-<route>` ต่อ Membership */
export async function calGate(req: Request, route: string, perMinute: number): Promise<CalGate> {
  const a = await gate(req, null);
  if (!a.ok) return a;
  const rl = await withRateLimit(`${a.c.tenantId}:${a.c.userId}`, `cal-${route}`, perMinute);
  if (rl) return { ok: false, res: rl };
  return { ok: true, c: a.c, actor: { userId: a.c.userId, tenantId: a.c.tenantId, membership: a.c.m } };
}

export async function calThrown(e: unknown, where: string): Promise<Response> {
  if (e instanceof CalError) return fail(e.status, e.code, e.message);
  return thrown(e, where);
}

/** "YYYY-MM-DD" ไทย → เลขวัน (null = รูปผิด) */
export const dayNo = (v: string | null) => (v ? ymdToDayNo(v) : null);

/** ISO เวลา (มี offset) → Date */
export const isoDate = z
  .string()
  .max(40)
  .refine((s) => /^\d{4}-\d{2}-\d{2}T/.test(s) && Number.isFinite(Date.parse(s)), "invalid date")
  .transform((s) => new Date(s));

const linkSchema = z.object({ type: z.enum(["CRM_CONTACT", "CRM_DEAL", "ACCOUNT_DOC", "KANBAN_CARD"]), id: z.string().min(1).max(80) }).strict();

// body ของ POST/PATCH items (strict: userId · ownerId · recipient · now · tenantId = 400)
export const itemFields = {
  kind: z.enum(["REMINDER", "EVENT"]),
  title: z.string().max(1000),
  note: z.string().max(10_000).nullable(),
  startAt: isoDate,
  endAt: isoDate.nullable(),
  allDay: z.boolean(),
  repeat: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]),
  repeatDays: z.array(z.number().int()).max(7),
  leadMinutes: z.number().int(),
  link: linkSchema.nullable(),
};
