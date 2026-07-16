// QC — Automation v1 (WO-0026) · Fable oracle, Builder ห้ามแตะ
//
// สัญญา:
// src/lib/automation/engine.ts:
//   runForEvent(evt: { tenantId: string; type: string; payload: unknown },
//               deps?: { post?: (url: string, body: unknown) => Promise<void> }): Promise<number>  // จำนวน rule ที่ยิง
//   — match: enabled + event ตรง + (minAmountSatang == null หรือ payload.amountSatang >= min)
//   — NOTIFY → AppNotification (title จาก actionConfig.title หรือชื่อ rule · body สรุปไทย) + AutomationRun OK
//   — WEBHOOK → (deps.post ?? fetch POST JSON) {event, payload} ไป actionConfig.url · post พัง → AutomationRun FAILED **ห้าม throw**
//   — rule อื่นต้องยังยิงต่อแม้ตัวหนึ่งพัง
// src/lib/automation/service.ts: createRule/listRules/setRuleEnabled/deleteRule + listNotifications/markNotificationRead — tenant-scoped
// hook: src/lib/outbox-consumers.ts — drainAll เรียก engine ทุก event แบบ best-effort (engine พัง = ห้ามล้ม consumer หลัก)
try { process.loadEnvFile(".env"); } catch {}
const { prisma } = await import("@/lib/core/db");
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => { cks.push({ id, ok, exp: e, act: a, sev: s }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`); };

let tid = ""; let tid2 = "";
try {
  const eng = await import("@/lib/automation/engine" as string).catch(() => null);
  const svc = await import("@/lib/automation/service" as string).catch(() => null);
  if (!eng || !svc) { chk("AU-0", "มี automation/{engine,service}.ts", false, "มี", "ยังไม่สร้าง"); }
  else {
    const t = await prisma.tenant.create({ data: { name: "QC AUTO", slug: `qc-au-${Date.now()}` } }); tid = t.id;
    const t2 = await prisma.tenant.create({ data: { name: "QC AU2", slug: `qc-au2-${Date.now()}` } }); tid2 = t2.id;
    const ctx = { tenantId: tid };

    const r1 = await svc.createRule(ctx, { name: "ขายใหญ่แจ้งเตือน", event: "pos.sale.paid", minAmountSatang: 10000, actionType: "NOTIFY", actionConfig: { title: "มีบิลใหญ่" } });
    const r2 = await svc.createRule(ctx, { name: "ยิงเว็บฮุคทุกบิล", event: "pos.sale.paid", actionType: "WEBHOOK", actionConfig: { url: "https://example.com/hook" } });
    chk("AU-1.1", "createRule + listRules 2", (await svc.listRules(ctx)).length === 2, "2", "?");

    const posts: { url: string; body: unknown }[] = [];
    const post = async (url: string, body: unknown) => { posts.push({ url, body }); };

    // ยอด 150 บาท ≥ 100 → NOTIFY ยิง + WEBHOOK ยิง = 2
    const n1 = await eng.runForEvent({ tenantId: tid, type: "pos.sale.paid", payload: { saleId: "s1", amountSatang: 15000 } }, { post });
    chk("AU-2.1", "ยอดถึงเกณฑ์ → ยิง 2 rule", n1 === 2, "2", String(n1));
    const notif = await prisma.appNotification.findFirst({ where: { tenantId: tid } });
    chk("AU-2.2", "NOTIFY → AppNotification (title จาก config)", notif?.title === "มีบิลใหญ่" && (notif?.body ?? "").length > 0, "มีบิลใหญ่", String(notif?.title));
    chk("AU-2.3", "WEBHOOK → post {event,payload} ไป url", posts.length === 1 && posts[0].url === "https://example.com/hook" && JSON.stringify(posts[0].body).includes("pos.sale.paid"), "1 ครั้ง", String(posts.length));
    chk("AU-2.4", "AutomationRun OK 2 แถว", (await prisma.automationRun.count({ where: { tenantId: tid, status: "OK" } })) === 2, "2", "?");

    // ยอดไม่ถึง → NOTIFY เงียบ / WEBHOOK (ไม่มี min) ยังยิง
    const n2 = await eng.runForEvent({ tenantId: tid, type: "pos.sale.paid", payload: { amountSatang: 5000 } }, { post });
    chk("AU-3.1", "ยอดไม่ถึงเกณฑ์ → เฉพาะ rule ไม่มี min ยิง (1)", n2 === 1 && (await prisma.appNotification.count({ where: { tenantId: tid } })) === 1, "1", String(n2));
    chk("AU-3.2", "event ไม่มี rule → 0", (await eng.runForEvent({ tenantId: tid, type: "hotel.checkout", payload: {} }, { post })) === 0, "0", "?");

    // webhook พัง → FAILED ไม่ throw + rule อื่นยังยิง
    const bad = async () => { throw new Error("hook down"); };
    const n3 = await eng.runForEvent({ tenantId: tid, type: "pos.sale.paid", payload: { amountSatang: 20000 } }, { post: bad });
    chk("AU-4.1", "webhook พัง → ไม่ throw + NOTIFY ยังยิง", n3 >= 1 && (await prisma.appNotification.count({ where: { tenantId: tid } })) === 2, "notify ยิง", String(n3));
    chk("AU-4.2", "AutomationRun FAILED บันทึกเหตุ", (await prisma.automationRun.count({ where: { tenantId: tid, status: "FAILED" } })) === 1, "1", "?");

    // ปิด rule + ลบ + isolation
    await svc.setRuleEnabled(ctx, r1.id, false);
    const n4 = await eng.runForEvent({ tenantId: tid, type: "pos.sale.paid", payload: { amountSatang: 99999 } }, { post });
    chk("AU-5.1", "ปิด rule → ไม่ยิง NOTIFY (เหลือ webhook 1)", n4 === 1, "1", String(n4));
    chk("AU-5.2", "tenant อื่น: rule/notification เป็นศูนย์", (await svc.listRules({ tenantId: tid2 })).length === 0 && (await eng.runForEvent({ tenantId: tid2, type: "pos.sale.paid", payload: { amountSatang: 99999 } }, { post })) === 0, "0", "?");
    await svc.deleteRule(ctx, r2.id);
    chk("AU-5.3", "deleteRule → เหลือ 1", (await svc.listRules(ctx)).length === 1, "1", "?");

    // notification read
    const un = await svc.listNotifications(ctx);
    await svc.markNotificationRead(ctx, un[0].id);
    chk("AU-6.1", "markRead แล้ว readAt ไม่ null", (await prisma.appNotification.findUnique({ where: { id: un[0].id } }))?.readAt !== null, "อ่านแล้ว", "?");
  }
} catch (e) { chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 160) : String(e)); }
finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  for (const id of [tid, tid2].filter(Boolean)) {
    for (const m of ["automationRun", "automationRule", "appNotification"]) await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Automation v1 =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR 0`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
