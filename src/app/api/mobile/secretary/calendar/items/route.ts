// GET/POST /api/mobile/secretary/calendar/items — แท็บ "เตือนฉัน" (จอ 3) · แผ่นเพิ่มเตือน/นัด (จอ 6) · "เตือนเลย" ของการ์ดนัดชน (จอ 10)
//   CAL1.6 · สัญญา §8 · M3: ไม่มีช่องผู้รับ/ผู้ใช้ — body strict (userId/ownerId/recipient/now/tenantId = 400)
import { z } from "zod";
import { createItem, listItems } from "@/lib/modules/calendar/items";
import { fail, ok, readBody, takeOf, withErrors } from "../../_shared";
import { calGate, calThrown, itemFields } from "../_cal";

const createBody = z
  .object({
    kind: itemFields.kind,
    title: itemFields.title,
    note: itemFields.note.optional(),
    startAt: itemFields.startAt,
    endAt: itemFields.endAt.optional(),
    allDay: itemFields.allDay.optional(),
    repeat: itemFields.repeat.optional(),
    repeatDays: itemFields.repeatDays.optional(),
    leadMinutes: itemFields.leadMinutes.optional(),
    link: itemFields.link.optional(),
    origin: z.literal("conflict").optional(),
  })
  .strict();

async function GET_(req: Request) {
  const g = await calGate(req, "items", 60);
  if (!g.ok) return g.res;
  const q = new URL(req.url).searchParams;
  const tab = q.get("tab") ?? "upcoming";
  if (tab !== "today" && tab !== "upcoming" && tab !== "done") return fail(400, "invalid", "แท็บไม่ถูกต้อง");
  const before = q.get("before");
  if (before && before.length > 120) return fail(400, "invalid", "ตำแหน่งหน้าถัดไปไม่ถูกต้อง");
  try {
    return ok(await listItems(g.actor, { tab, take: takeOf(q.get("take"), 50, 100), before }));
  } catch (e) {
    return calThrown(e, "calendar/items GET");
  }
}

async function POST_(req: Request) {
  const g = await calGate(req, "items-write", 30);
  if (!g.ok) return g.res;
  const b = await readBody(req, createBody);
  if (!b.ok) return b.res;
  const { origin, ...input } = b.v;
  try {
    const item = await createItem(g.actor, input, { source: origin === "conflict" ? "SUGGEST" : "APP" });
    return ok({ item });
  } catch (e) {
    return calThrown(e, "calendar/items POST");
  }
}

export const GET = withErrors("secretary/calendar/items GET", GET_);
export const POST = withErrors("secretary/calendar/items POST", POST_);
