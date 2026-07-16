// QC — Webhooks ขาออก (WO-0062) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// สัญญา src/lib/webhooks/service.ts (นอก modules — kernel-adjacent เหมือน automation/):
//   createEndpoint(ctx: {tenantId}, { url, events?: string[] }) → { id, secret }
//     · url ต้อง https:// หรือ http:// (อื่น throw ไทย) · secret = crypto ≥24 ตัว สร้างให้เอง
//     · events ว่าง/ไม่ส่ง = รับทุก event
//   listEndpoints(ctx) · setEndpointActive(ctx, id, active) · deleteEndpoint(ctx, id)
//   dispatchWebhooks(evt: { tenantId, type, payload }, deps?: { fetchFn?: typeof fetch }) → number (จำนวนส่งสำเร็จ)
//     · หา endpoint active ของ tenant ที่ events มี type (หรือ events ว่าง) → POST JSON
//       body = JSON.stringify({ type, payload, sentAt }) · header "X-Shark-Signature" = hex(hmacSHA256(secret, body))
//       + header "X-Shark-Event" = type · timeout กันค้าง
//     · สำเร็จ (2xx) → WebhookDelivery OK · ล้ม/โยน → FAILED + lastError (ห้ามโยนออก — เก็บแล้วไปต่อ)
//   retryFailedWebhooks(deps?) → number — หยิบ FAILED ที่ attempts < 5 ยิงซ้ำ · สำเร็จ → OK · ล้ม → attempts+1
//   ผูกเข้า outbox: src/lib/outbox-consumers.ts — หลัง handler หลักของทุก event สำเร็จ → dispatchWebhooks
//     (pattern เดียวกับ withAutomation — ห่อเพิ่ม ห้ามทำ consumer เดิมพัง)
// UI /app/settings/webhooks: เพิ่ม/ปิด/ลบ endpoint + เลือก event (จาก AUTOMATION_EVENTS + approval/inventory) + โชว์ secret ครั้งเดียว + ตาราง delivery ล่าสุด (assertCan webhook.endpoint.*)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
const { createHmac } = await import("node:crypto");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

type Captured = { url: string; body: string; headers: Record<string, string> };
const mkFetch = (fail: boolean, captured: Captured[]) => (async (url: unknown, init?: { body?: unknown; headers?: Record<string, string> }) => {
  captured.push({ url: String(url), body: String(init?.body ?? ""), headers: (init?.headers ?? {}) as Record<string, string> });
  if (fail) throw new Error("connect ECONNREFUSED");
  return new Response("ok", { status: 200 });
}) as unknown as typeof fetch;

let tid = "";
try {
  const wh = (await import("@/lib/webhooks/service" as string).catch(() => null)) as { [k: string]: (...a: any[]) => Promise<any> } | null; // any จงใจ: oracle ล้ำหน้าโค้ด
  if (!wh) { chk("WB-0", "มี webhooks/service.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC WBH", slug: `qc-wbh-${Date.now()}` } }); tid = t.id;
    const ctx = { tenantId: tid };

    // 1) endpoint lifecycle
    let threw = false; try { await wh.createEndpoint(ctx, { url: "ftp://bad" }); } catch { threw = true; }
    chk("WB-1.1", "url ไม่ใช่ http(s) → throw", threw, "throw", "?");
    const ep = await wh.createEndpoint(ctx, { url: "https://example.com/hook", events: ["pos.sale.paid"] });
    chk("WB-1.2", "secret ≥24 ตัว + เก็บใน DB", typeof ep.secret === "string" && ep.secret.length >= 24 && (await prisma.webhookEndpoint.findUnique({ where: { id: ep.id as string } }))?.secret === ep.secret, "≥24", String(ep.secret).length + "");
    const epAll = await wh.createEndpoint(ctx, { url: "https://example.com/all" });

    // 2) dispatch + ลายเซ็น + filter
    const cap: Captured[] = [];
    const n1 = await wh.dispatchWebhooks({ tenantId: tid, type: "pos.sale.paid", payload: { saleId: "s1", grandTotalSatang: 5000 } }, { fetchFn: mkFetch(false, cap) });
    chk("WB-2.1", "event ตรง filter → ส่ง 2 endpoint (เจาะจง+รับทุก) → OK 2 แถว", n1 === 2 && cap.length === 2 && (await prisma.webhookDelivery.count({ where: { tenantId: tid, status: "OK" } })) === 2, "2", `${n1}/${cap.length}`);
    const hookCall = cap.find((c) => c.url.includes("/hook"));
    const headerOf = (c: Captured, name: string) => c.headers[name] ?? c.headers[name.toLowerCase()] ?? "";
    const expectSig = createHmac("sha256", ep.secret as string).update(hookCall?.body ?? "").digest("hex");
    chk("WB-2.2", "X-Shark-Signature = HMAC(secret, body) ตรงเป๊ะ + X-Shark-Event", !!hookCall && headerOf(hookCall, "X-Shark-Signature") === expectSig && headerOf(hookCall, "X-Shark-Event") === "pos.sale.paid", "ตรง", headerOf(hookCall ?? cap[0], "X-Shark-Signature").slice(0, 12));
    chk("WB-2.3", "body มี type+payload", !!hookCall && hookCall.body.includes("pos.sale.paid") && hookCall.body.includes("s1"), "มี", "?");
    const cap2: Captured[] = [];
    const n2 = await wh.dispatchWebhooks({ tenantId: tid, type: "approval.request.approved", payload: {} }, { fetchFn: mkFetch(false, cap2) });
    chk("WB-2.4", "event ไม่ตรง filter → ส่งเฉพาะตัวรับทุก (1)", n2 === 1 && cap2.length === 1 && cap2[0].url.includes("/all"), "1", `${n2}`);

    // 3) ล้มเหลว → FAILED → retry
    const capF: Captured[] = [];
    const n3 = await wh.dispatchWebhooks({ tenantId: tid, type: "pos.sale.paid", payload: { saleId: "s2" } }, { fetchFn: mkFetch(true, capF) });
    const failed = await prisma.webhookDelivery.count({ where: { tenantId: tid, status: "FAILED" } });
    chk("WB-3.1", "ยิงล้ม → คืน 0 + FAILED 2 แถว (attempts 1 + lastError) ไม่โยนออก", n3 === 0 && failed === 2 && (await prisma.webhookDelivery.findFirst({ where: { tenantId: tid, status: "FAILED" } }))?.attempts === 1, "0/2", `${n3}/${failed}`);
    const nR = await wh.retryFailedWebhooks({ fetchFn: mkFetch(false, []) });
    chk("WB-3.2", "retry สำเร็จ → FAILED→OK หมด", nR >= 2 && (await prisma.webhookDelivery.count({ where: { tenantId: tid, status: "FAILED" } })) === 0, "≥2/0", `${nR}`);

    // 4) ปิด endpoint + ผูก outbox
    await wh.setEndpointActive(ctx, ep.id, false);
    const cap4: Captured[] = [];
    await wh.dispatchWebhooks({ tenantId: tid, type: "pos.sale.paid", payload: {} }, { fetchFn: mkFetch(false, cap4) });
    chk("WB-4.1", "endpoint ปิด → ไม่ส่ง (เหลือตัว /all ตัวเดียว)", cap4.length === 1 && cap4[0].url.includes("/all"), "1", `${cap4.length}`);
    const src = (await import("node:fs")).readFileSync("src/lib/outbox-consumers.ts", "utf8");
    chk("WB-4.2", "outbox-consumers ผูก dispatchWebhooks (ทุก event)", src.includes("dispatchWebhooks"), "ผูก", "?");

    // 5) isolation
    chk("WB-5.1", "tenant อื่นไม่เห็น endpoint (guard)", await (async () => { const t2 = await prisma.tenant.create({ data: { name: "QC WBH2", slug: `qc-wbh2-${Date.now()}` } }); const l = (await wh.listEndpoints({ tenantId: t2.id })) as unknown[]; await prisma.tenant.delete({ where: { id: t2.id } }); return l.length === 0; })(), "0", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["webhookDelivery", "webhookEndpoint"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Webhooks =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
