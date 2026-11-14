// QC — CAL1.1 migration calendar_a (docs/modules/32-secretary-calendar.md §2 · R-CAL-33)
//   M1 ตาราง/enum/index ตรงสัญญาบนฐาน QC · M2 ทะเบียน scope (CalItem/CalPref = tenant · CalLink/CalExternalEvent = global)
//   M3 R-CAL-33: export ร้านไม่มี CalItem/CalPref (แต่ยังเป็นแกน tenant → purge ลบ) · M4 deleteUserTraces ลบ 3 ตาราง (+cascade อีเวนต์)
//   M5 ค่าเริ่ม CalPref ตาม M2 · CalExternalEvent cascade เมื่อลบ CalLink · unique (linkId,calendarId,externalId)
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-cal-1.1.mts
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { guard, chk, errMsg, finish, makeFixture, type AnyMod } from "./qc-cal-lib.mjs";

const LABEL = "qc-cal-1.1";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
guard(LABEL);
const { prisma } = (await import("@/lib/core/db")) as AnyMod;
const { scopeOf } = (await import("@/lib/core/scope")) as AnyMod;
const pdpa = (await import("@/lib/platform/pdpa")) as AnyMod;

const fx = await makeFixture(prisma, "qccal11", { owner: { role: "OWNER" }, staff: { role: "STAFF" } });
let residue = -1;
try {
  console.log("── M1: ตาราง/enum/index ──");
  const tables = ((await prisma.$queryRawUnsafe(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = current_schema() AND table_name LIKE 'Cal%'`)) as AnyMod[]).map((r) => String(r.t)).sort();
  chk("M1-1", "มี 4 ตาราง CalExternalEvent/CalItem/CalLink/CalPref", JSON.stringify(tables) === JSON.stringify(["CalExternalEvent", "CalItem", "CalLink", "CalPref"]), JSON.stringify(tables));
  const enums = ((await prisma.$queryRawUnsafe(`SELECT t.typname AS n, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text AS v FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname LIKE 'Cal%' GROUP BY 1 ORDER BY 1`)) as AnyMod[]);
  const em = Object.fromEntries(enums.map((r) => [r.n, r.v]));
  chk("M1-2", "enum ตรงสัญญา (สถานะมี DRAFT · source APP/CHAT/SUGGEST)", em.CalItemStatus === "{DRAFT,OPEN,DONE,CANCELLED}" && em.CalItemSource === "{APP,CHAT,SUGGEST}" && em.CalRepeat === "{NONE,DAILY,WEEKLY,MONTHLY}" && em.CalLinkType === "{CRM_CONTACT,CRM_DEAL,ACCOUNT_DOC,KANBAN_CARD}" && em.CalLinkStatus === "{ACTIVE,NEEDS_RECONNECT}", JSON.stringify(em));
  const idx = ((await prisma.$queryRawUnsafe(`SELECT indexname AS n FROM pg_indexes WHERE schemaname = current_schema() AND tablename LIKE 'Cal%'`)) as AnyMod[]).map((r) => String(r.n));
  const need = ["CalItem_status_nextFireAt_idx", "CalItem_userId_tenantId_status_occursAt_idx", "CalItem_userId_roomId_idx", "CalItem_userId_syncDirty_idx", "CalItem_tenantId_idx", "CalPref_userId_tenantId_key", "CalLink_userId_provider_key", "CalExternalEvent_linkId_calendarId_externalId_key", "CalExternalEvent_userId_startAt_idx"];
  chk("M1-3", "index ที่ job/agenda ใช้มีครบ", need.every((n) => idx.includes(n)), need.filter((n) => !idx.includes(n)).join(","));
  const mig = ((await prisma.$queryRawUnsafe(`SELECT migration_name AS n, finished_at AS f FROM "_prisma_migrations" WHERE migration_name = '20261228000300_calendar_a'`)) as AnyMod[]);
  chk("M1-4", "migration 20261228000300_calendar_a บันทึกว่าลงแล้ว", mig.length === 1 && !!mig[0].f);
  const sql = readFileSync(join(ROOT, "prisma/migrations/20261228000300_calendar_a/migration.sql"), "utf8");
  chk("M1-5", "migration additive ล้วน (ไม่มี DROP/ALTER ตารางเดิม)", !/\bDROP\b/i.test(sql) && !/ALTER TABLE "(?!Cal)/.test(sql));

  console.log("── M2: scope ──");
  chk("M2-1", "CalItem/CalPref = tenant · CalLink/CalExternalEvent = global", scopeOf("CalItem").axis === "tenant" && scopeOf("CalPref").axis === "tenant" && scopeOf("CalLink").axis === "global" && scopeOf("CalExternalEvent").axis === "global");

  console.log("── M3: export ร้าน (R-CAL-33) ──");
  const [tid] = fx.tids;
  await prisma.calItem.create({ data: { userId: fx.U.staff, tenantId: tid, title: "ส่วนตัวของพนักงาน", startAt: new Date(Date.now() + 3_600_000), occursAt: new Date(Date.now() + 3_600_000) } });
  await prisma.calPref.create({ data: { userId: fx.U.staff, tenantId: tid } });
  await prisma.aiSystemAccess.create({ data: { tenantId: tid, module: "chat", level: "DRAFT", setById: fx.U.owner } }); // positive control (ตาราง tenant ปกติ)
  const exp = JSON.parse(await pdpa.exportTenantData(tid));
  chk("M3-1", "exportTenantData ไม่มี CalItem/CalPref · ตาราง tenant ปกติยังมา (AiSystemAccess)", !("CalItem" in exp.data) && !("CalPref" in exp.data) && "AiSystemAccess" in exp.data, Object.keys(exp.data).join(","));
  chk("M3-2", "PERSONAL_MODELS = [CalItem, CalPref] (ส่งออกไว้ให้ข้อสอบ/ผู้ตรวจ)", JSON.stringify(pdpa.PERSONAL_MODELS) === JSON.stringify(["CalItem", "CalPref"]));

  console.log("── M4: deleteUserTraces ──");
  const ad = readFileSync(join(ROOT, "src/lib/platform/account-deletion.ts"), "utf8");
  const body = ad.slice(ad.indexOf("async function deleteUserTraces"), ad.indexOf("export async function deleteAccount"));
  chk("M4-1", "deleteUserTraces ลบ calItem/calPref/calLink ตาม userId", /calItem\.deleteMany\(\{ where: \{ userId \} \}\)/.test(body) && /calPref\.deleteMany\(\{ where: \{ userId \} \}\)/.test(body) && /calLink\.deleteMany\(\{ where: \{ userId \} \}\)/.test(body));

  console.log("── M5: ค่าเริ่ม + cascade ──");
  const pref = await prisma.calPref.findFirst({ where: { userId: fx.U.staff, tenantId: tid } });
  chk("M5-1", "CalPref ค่าเริ่ม M2: เช้าเปิด 480 · เย็นปิด 1140 · travel 0 · sources {}", pref.morningOn === true && pref.morningMinute === 480 && pref.eveningOn === false && pref.eveningMinute === 1140 && pref.travelMinutes === 0 && JSON.stringify(pref.sources) === "{}");
  const item = await prisma.calItem.findFirst({ where: { userId: fx.U.staff, tenantId: tid } });
  chk("M5-2", "CalItem ค่าเริ่ม: REMINDER · OPEN · APP · NONE · version 0 · lead 0", item.kind === "REMINDER" && item.status === "OPEN" && item.source === "APP" && item.repeat === "NONE" && item.version === 0 && item.leadMinutes === 0 && Array.isArray(item.repeatDays));
  const link = await prisma.calLink.create({ data: { userId: fx.U.staff, email: "x@example.com", tokenBox: "sealed" } });
  await prisma.calExternalEvent.create({ data: { linkId: link.id, userId: fx.U.staff, calendarId: "primary", externalId: "e1", title: "t", startAt: new Date(), etag: "1" } });
  let dup = false;
  try { await prisma.calExternalEvent.create({ data: { linkId: link.id, userId: fx.U.staff, calendarId: "primary", externalId: "e1", title: "t", startAt: new Date(), etag: "1" } }); } catch { dup = true; }
  const other = await prisma.calExternalEvent.create({ data: { linkId: link.id, userId: fx.U.staff, calendarId: "shared", externalId: "e1", title: "t", startAt: new Date(), etag: "1" } }).then(() => true).catch(() => false);
  chk("M5-3", "unique (linkId,calendarId,externalId): ซ้ำปฏิทินเดียว = ชน · คนละปฏิทิน = ได้ (R-CAL-27)", dup && other);
  await prisma.calLink.delete({ where: { id: link.id } });
  chk("M5-4", "ลบ CalLink → cascade CalExternalEvent", (await prisma.calExternalEvent.count({ where: { userId: fx.U.staff } })) === 0);
  let dupLink = false;
  await prisma.calLink.create({ data: { userId: fx.U.staff, email: "a@example.com", tokenBox: "s" } });
  try { await prisma.calLink.create({ data: { userId: fx.U.staff, email: "b@example.com", tokenBox: "s" } }); } catch { dupLink = true; }
  chk("M5-5", "CalLink 1 แถว/user/provider", dupLink);
} catch (e) {
  chk("CRASH", "ข้อสอบรันจบ", false, errMsg(e));
} finally {
  residue = await fx.cleanup();
}
chk("Z-1", "residue 0", residue === 0, String(residue));
await prisma.$disconnect().catch(() => undefined);
finish(LABEL, { residue });
