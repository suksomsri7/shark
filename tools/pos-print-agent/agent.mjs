// tools/pos-print-agent/agent.mjs — ตัวช่วยพิมพ์ LAN ของ SHARK POS (P3-SKEL R13 · มติ §10-6) — Node ≥ 18 · ไม่มี dependency (node:* เท่านั้น)
//
// ทำงานบนเครื่องใดก็ได้ใน LAN ของร้าน (PC · Raspberry Pi · Android Termux) — ต่อ "ออก" หา SHARK เท่านั้น (ไม่เปิดพอร์ตรับ · ใช้กับ iPad ได้):
//   long-poll GET <base>/api/pos/print-agent/jobs (Bearer โทเคน) → เขียนไบต์ ESC/POS ไปเครื่องพิมพ์ host:port (TCP 9100) → POST …/jobs/<id>/ack {ok, error?}
// รัน:  SHARK_POS_URL=https://shark.in.th SHARK_PRINT_AGENT_TOKEN=spa_… node tools/pos-print-agent/agent.mjs
//   (โทเคนได้ครั้งเดียวตอนลงทะเบียนตัวช่วยพิมพ์ในตั้งค่าเครื่อง 17B · หายแล้วให้ลงทะเบียนใหม่ · ห้ามแชร์)
// 🔴 import แล้วไม่รันอะไรเอง (ข้อสอบโหลดไฟล์นี้) — main loop รันเฉพาะเมื่อสั่ง node ไฟล์นี้ตรง ๆ
// 🔴 ต่อเครื่องพิมพ์ได้เฉพาะที่อยู่ใน LAN (10/8 · 172.16/12 · 192.168/16 · 127/8 · 169.254/16 · ชื่อ *.local) เว้นตั้ง SHARK_PRINT_AGENT_ALLOW_ANY_HOST=1
import net from "node:net";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PRINT_TIMEOUT_MS = 10_000;

/** ที่อยู่นี้อยู่ใน LAN ไหม (กันเซิร์ฟเวอร์สั่งให้ต่อออกนอกร้าน) */
export function isLanHost(host) {
  if (process.env.SHARK_PRINT_AGENT_ALLOW_ANY_HOST === "1") return true;
  if (typeof host !== "string") return false;
  if (/\.local$/i.test(host)) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/** เขียนไบต์ไปเครื่องพิมพ์ TCP แล้วปิด — สำเร็จเมื่อปิดสายเรียบร้อย */
export function sendToPrinter(host, port, bytes, timeoutMs = PRINT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    if (!isLanHost(host)) return reject(new Error(`เครื่องพิมพ์ ${host} ไม่อยู่ใน LAN`));
    const sock = net.createConnection({ host, port });
    let settled = false;
    const done = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        sock.destroy();
        reject(err);
      } else resolve();
    };
    const timer = setTimeout(() => done(new Error(`ต่อเครื่องพิมพ์ ${host}:${port} ไม่ทันเวลา`)), timeoutMs);
    sock.once("error", (e) => done(e));
    sock.once("connect", () => sock.end(bytes));
    sock.once("close", (hadError) => done(hadError ? new Error("สายเครื่องพิมพ์ปิดผิดปกติ") : undefined));
  });
}

/**
 * รับงานหนึ่งรอบ → พิมพ์ทุกงาน → ack ทีละงาน
 * @param {{baseUrl: string, token: string, fetch?: typeof fetch, wait?: number}} opts  wait = วินาที long-poll (0 = ตอบทันที · ค่าปริยาย 0)
 * @returns {Promise<{ok: boolean, status?: number, jobs: {id: string, ok: boolean}[]}>}
 */
export async function pollOnce({ baseUrl, token, fetch: f = globalThis.fetch, wait = 0 } = {}) {
  const base = String(baseUrl ?? "").replace(/\/+$/, "");
  const auth = { authorization: `Bearer ${token ?? ""}` };
  const res = await f(`${base}/api/pos/print-agent/jobs?wait=${encodeURIComponent(String(wait))}`, { headers: auth });
  if (res.status !== 200) return { ok: false, status: res.status, jobs: [] };
  const data = await res.json().catch(() => null);
  const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const out = [];
  for (const job of jobs) {
    let ok = true;
    let error;
    try {
      if (!job?.printer?.host || !job?.printer?.port) throw new Error("ไม่มีเครื่องพิมพ์ของงานนี้");
      await sendToPrinter(job.printer.host, Number(job.printer.port), Buffer.from(String(job.bytesB64 ?? ""), "base64"));
    } catch (e) {
      ok = false;
      error = String(e?.message ?? e).slice(0, 200);
    }
    await f(`${base}/api/pos/print-agent/jobs/${encodeURIComponent(String(job.id))}/ack`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify(ok ? { ok: true } : { ok: false, error }),
    }).catch(() => undefined);
    out.push({ id: String(job.id), ok });
  }
  return { ok: true, status: 200, jobs: out };
}

async function main() {
  const baseUrl = process.env.SHARK_POS_URL ?? "https://shark.in.th";
  const token = process.env.SHARK_PRINT_AGENT_TOKEN ?? "";
  if (token.length < 32) {
    console.error("ตั้ง SHARK_PRINT_AGENT_TOKEN (โทเคนจากหน้าตั้งค่าเครื่อง) ก่อนรัน");
    process.exit(2);
  }
  let stop = false;
  process.on("SIGINT", () => (stop = true));
  process.on("SIGTERM", () => (stop = true));
  console.log(`ตัวช่วยพิมพ์ LAN เริ่มทำงาน · ${baseUrl}`);
  while (!stop) {
    try {
      const r = await pollOnce({ baseUrl, token, wait: 25 });
      if (r.status === 401) {
        console.error("โทเคนถูกเพิกถอนหรือไม่ถูกต้อง — หยุดทำงาน");
        process.exit(3);
      }
      for (const j of r.jobs) console.log(`${new Date().toISOString()} งาน ${j.id} ${j.ok ? "พิมพ์แล้ว" : "พิมพ์ไม่สำเร็จ"}`);
      if (!r.ok) await new Promise((res) => setTimeout(res, 5000));
    } catch (e) {
      console.error(`ต่อ SHARK ไม่ได้: ${String(e?.message ?? e).slice(0, 120)} — ลองใหม่ใน 5 วินาที`);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
