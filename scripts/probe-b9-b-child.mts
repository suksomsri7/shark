// probe-b9-b-child — ลูกโพรเซสของ probe-b9-b (reviewer B · B.9) · ห้ามรันเดี่ยว · ไม่สร้าง/ไม่ล้างข้อมูลเอง
// argv[2] = JSON { op, go, n, ... } · พิมพ์ READY → รอไฟล์ go → ทำงาน → พิมพ์ RESULT <json>
// 🔴 ไม่ยิง LINE จริง: LINE_API_BASE มาจากแม่ (ตัวจำลอง 127.0.0.1) + ครอบ fetch บล็อกนอกเครื่อง
import { existsSync } from "node:fs";
import { loadSvcQcEnv } from "./svc-qc-env.mjs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

loadSvcQcEnv("probe-b9-b-child");
if (process.env.CI) { console.error("ห้าม CI"); process.exit(4); }
const base = process.env.LINE_API_BASE ?? "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) { console.log(`RESULT ${JSON.stringify([{ throw: "LINE_API_BASE ไม่ใช่ตัวจำลอง" }])}`); process.exit(0); }
const REAL_FETCH = globalThis.fetch;
globalThis.fetch = (async (input: Any, init?: Any): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input?.url ?? "");
  let host = "";
  try { host = new URL(url).hostname; } catch { /* ไม่ใช่ URL */ }
  if (host === "127.0.0.1" || host === "localhost" || host.endsWith(".neon.tech")) return REAL_FETCH(input, init);
  return new Response(JSON.stringify({ message: "blocked by probe" }), { status: 503, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const a = JSON.parse(process.argv[2] ?? "{}") as Record<string, Any>;
const LINK: Any = await import("@/lib/platform/booking-line-link");
const NOTIFY: Any = await import("@/lib/platform/booking-notify");
const REMOTE: Any = await import("@/lib/platform/booking-remote");
const PB: Any = await import("@/lib/platform/postback-routes");
const CONS: Any = a.op === "event" ? await import("@/lib/outbox-consumers") : null;
const now = new Date(String(a.now ?? new Date().toISOString()));
const errOf = (e: unknown) => (e instanceof Error ? `${(e as { code?: string }).code ?? ""} ${e.name}` : "error").slice(0, 120);

console.log("READY");
while (!existsSync(String(a.go))) await new Promise((r) => setTimeout(r, 3));

const out: unknown[] = [];
const n = typeof a.n === "number" ? a.n : 1;
for (let i = 0; i < n; i++) {
  try {
    if (a.op === "postback") out.push(await LINK.onBookingPostback(a.ctx, PB.parsePostbackData(String(a.data)), { now }));
    else if (a.op === "consume") out.push(await PB.handleLinkCodeText(a.ctx, String(a.code)));
    else if (a.op === "event") { await CONS.consumers[String(a.evt.type)](a.evt); out.push({ ok: true }); }
    else if (a.op === "tick") out.push(await NOTIFY.runBookingNotifyTick(now, { tenantIds: a.tenantIds }));
    else if (a.op === "remote") {
      const r = await REMOTE.takeRemoteTicket(String(a.t), String(a.u), { serviceId: String(a.serviceId), staffId: null, phone: String(a.phone), clientKey: String(a.clientKey) }, { now });
      out.push(r?.ok ? { ok: true, n: r.ticketNumber } : { ok: false, code: r?.code });
    } else out.push({ throw: `op? ${String(a.op)}` });
  } catch (e) {
    out.push({ throw: errOf(e) });
  }
}
console.log(`RESULT ${JSON.stringify(out)}`);
process.exit(0);
