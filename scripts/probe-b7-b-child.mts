// probe-b7-b-child — ลูกโพรเซสของ probe-b7-b (reviewer B · B.7) · ห้ามรันเดี่ยว
// env PROBE_B7_CHILD = JSON { go, scenarios: [{ key, calls }] } · พิมพ์ READY <key> → รอไฟล์ go-<key> → ยิงพร้อมกัน → RES <key> <json>
import { existsSync } from "node:fs";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

loadSvcQcEnv("probe-b7-b-child");
type Ctx = { tenantId: string; unitId: string };
type Call = Record<string, unknown> & { fn: string };
type Out = { fn: string; tag: string; ok: boolean; code: string | null; reason: string | null; staffId: string | null; threw: string | null; ms: number };
const spec = JSON.parse(process.env.PROBE_B7_CHILD ?? "{}") as { go: string; scenarios: { key: string; calls: Call[] }[] };
const ON = (await import("@/lib/modules/booking/online")) as unknown as Record<string, (...a: unknown[]) => Promise<Record<string, unknown>>>;
const BK = (await import("@/lib/modules/booking/service")) as unknown as Record<string, (...a: unknown[]) => Promise<Record<string, unknown>>>;
const LN = (await import("@/lib/modules/booking/queue-line")) as unknown as Record<string, (...a: unknown[]) => Promise<Record<string, unknown>>>;
const OPS = (await import("@/lib/modules/booking/line-ops")) as unknown as Record<string, (...a: unknown[]) => Promise<Record<string, unknown>>>;
const dbm = (await import("@/lib/core/db")) as unknown as { prisma: { $queryRawUnsafe: (q: string) => Promise<unknown>; $disconnect: () => Promise<void> } };
const errOf = (e: unknown) => (e instanceof Error ? `${(e as { code?: string }).code ?? ""} ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 240);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function run(c: Call): Promise<Out> {
  const t0 = Date.now();
  const base: Out = { fn: c.fn, tag: String(c.tag ?? ""), ok: false, code: null, reason: null, staffId: null, threw: null, ms: 0 };
  const now = typeof c.now === "string" ? new Date(c.now) : undefined;
  try {
    let r: Record<string, unknown>;
    if (c.fn === "book") r = await ON.bookOnline(c.ref, c.input, { ip: c.ip });
    else if (c.fn === "resched") r = await ON.rescheduleOnline(c.token, c.to, { ip: c.ip, ...(now ? { now } : {}) });
    else if (c.fn === "cancel") r = await ON.cancelOnline(c.token, { ip: c.ip, ...(now ? { now } : {}) });
    else if (c.fn === "b3") r = await BK.bookAppointment(c.ctx as Ctx, { ...(c.input as object), channel: "STAFF" });
    else if (c.fn === "walkin") r = await LN.createWalkIn(c.ctx as Ctx, { serviceId: c.serviceId, staffId: null, channel: "STAFF" }, { now });
    else if (c.fn === "move") r = await OPS.moveJobStaff(c.ctx as Ctx, c.id, c.to, { now });
    else if (c.fn === "checkin") r = await LN.checkIn(c.ctx as Ctx, { appointmentId: c.id }, { via: "STAFF", now });
    else if (c.fn === "shopResched") r = await LN.rescheduleByShop(c.ctx as Ctx, c.id, c.to, { now });
    else if (c.fn === "shopCancel") {
      const x = await BK.setAppointmentStatus((c.ctx as Ctx).tenantId, (c.ctx as Ctx).unitId, c.id, "CANCELLED");
      r = x.ok ? { ok: true } : { ok: false, code: "SHOP_FAIL", reason: String(x.reason ?? "") };
    } else r = { ok: false, code: "OP?", reason: c.fn };
    const ok = r.ok === true;
    return { ...base, ok, code: ok ? null : String(r.code ?? "?"), reason: ok ? null : String(r.reason ?? ""), staffId: typeof r.staffId === "string" ? r.staffId : null, ms: Date.now() - t0 };
  } catch (e) {
    return { ...base, threw: errOf(e), ms: Date.now() - t0 };
  }
}

try {
  await dbm.prisma.$queryRawUnsafe("SELECT 1");
  for (const sc of spec.scenarios) {
    console.log(`READY ${sc.key}`);
    const t0 = Date.now();
    while (!existsSync(`${spec.go}-${sc.key}`)) { if (Date.now() - t0 > 300_000) { console.log("ABORT"); process.exit(5); } await sleep(5); }
    const outs = await Promise.all(sc.calls.map(run));
    console.log(`RES ${sc.key} ${JSON.stringify(outs)}`);
  }
  await dbm.prisma.$disconnect();
  process.exit(0);
} catch (e) {
  console.log(`CHILD_ERR ${errOf(e)}`);
  process.exit(3);
}
