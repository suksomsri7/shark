// probe-b6-b-child — ลูกโพรเซสของ probe-b6-b (reviewer B · B.6) · ห้ามรันเดี่ยว
// argv[2] = JSON { op, go, ... } · พิมพ์ READY → รอไฟล์ go → ทำงาน → พิมพ์ RESULT <json>
import { existsSync } from "node:fs";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

loadSvcQcEnv("probe-b6-b-child");
const a = JSON.parse(process.argv[2] ?? "{}") as Record<string, unknown>;
const pub = await import("@/lib/modules/booking/public-line");
const line = await import("@/lib/modules/booking/queue-line");
const now = new Date(String(a.now));
const errOf = (e: unknown) => (e instanceof Error ? `${(e as { code?: string }).code ?? ""} ${e.message}` : String(e)).replace(/\s+/g, " ").slice(0, 300);

console.log("READY");
while (!existsSync(String(a.go))) await new Promise((r) => setTimeout(r, 3));

const out: unknown[] = [];
const n = typeof a.n === "number" ? a.n : 1;
for (let i = 0; i < n; i++) {
  try {
    if (a.op === "walkin") {
      const r = await pub.kioskWalkIn(a.token, { serviceId: String(a.serviceId), staffId: null }, { now });
      out.push(r.ok ? { ok: true, n: r.ticket.ticketNumber } : r);
    } else if (a.op === "defer") out.push(await pub.deferTicket(a.token, { now }));
    else if (a.op === "cancel") out.push(await pub.cancelTicket(a.token, { now }));
    else if (a.op === "call") out.push(await line.callJob(a.ctx as { tenantId: string; unitId: string }, String(a.apptId), { now }));
    else if (a.op === "start") out.push(await line.startJob(a.ctx as { tenantId: string; unitId: string }, String(a.apptId), { now }));
    else out.push({ throw: `op? ${String(a.op)}` });
  } catch (e) {
    out.push({ throw: errOf(e) });
  }
}
console.log(`RESULT ${JSON.stringify(out)}`);
process.exit(0);
