// QC — API บัญชี WO C4: webhook events ชุดแรก — document.issued/voided · quotation.responded · payment.voided · payment_request.paid/expired · contact.created/updated/merged · product.created/updated
// Fable oracle · Builder ห้ามแตะ · สัญญาอยู่ที่ ledger/ACCOUNT-API-RUN.md §C4
// 🔴 tenant ใหม่ของตัวเอง · ลบทิ้งใน finally · ทดสอบผ่าน service ตรง (event ต้องยิงไม่ว่าเข้าทาง UI/REST/AI)
// ⚠️ standalone-typesafe: dynamic import + wide cast
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-webhooks");
const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const { createHmac } = await import("node:crypto");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; exp: string; act: string; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, exp: e, act: a, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const NEW_EVENTS = [
  "account.document.issued",
  "account.document.voided",
  "account.quotation.responded",
  "account.payment.voided",
  "account.payment_request.paid",
  "account.payment_request.expired",
  "account.contact.created",
  "account.contact.updated",
  "account.contact.merged",
  "account.product.created",
  "account.product.updated",
];

let tid = "";
const realFetch = globalThis.fetch;
try {
  const acc = (await import("@/lib/modules/account/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const gl = (await import("@/lib/modules/account/gl" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const fin = (await import("@/lib/modules/account/finance" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const pay = (await import("@/lib/modules/account/payment" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const payReq = (await import("@/lib/modules/account/payment-request" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const prod = (await import("@/lib/modules/account/product" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const merge = (await import("@/lib/modules/account/contact-merge" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const labels = (await import("@/lib/webhooks/labels" as string)) as Record<string, Any>;
  const consumersMod = (await import("@/lib/outbox-consumers" as string)) as Record<string, Any>;
  const wh = (await import("@/lib/webhooks/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;

  // ═══ E1 ทะเบียน ═══
  const labelValues = (labels.WEBHOOK_EVENTS as { value: string; label: string }[]).map((e) => e.value);
  const missingLabel = NEW_EVENTS.filter((e) => !labelValues.includes(e));
  chk("C4-E1.1", "WEBHOOK_EVENTS ประกาศ event ใหม่ครบ 11 ตัว (ป้ายไทย)", missingLabel.length === 0 && (labels.WEBHOOK_EVENTS as Any[]).filter((e) => NEW_EVENTS.includes(e.value)).every((e) => /[ก-๙]/.test(e.label)), "ครบ", missingLabel.join(","));
  const consumers = consumersMod.consumers as Record<string, unknown>;
  const missingConsumer = NEW_EVENTS.filter((e) => typeof consumers[e] !== "function");
  chk("C4-E1.2", "outbox-consumers ลงทะเบียน consumer ครบทุก event ใหม่ (ไม่งั้นค้าง PENDING)", missingConsumer.length === 0, "ครบ", missingConsumer.join(","));

  // ═══ setup ═══
  const t = await prisma.tenant.create({ data: { name: "QC API C4", slug: `qc-api-c4-${Date.now()}` } });
  tid = t.id;
  const s = await sys.createSystem(tid, "ACCOUNT", "บัญชี C4");
  const SYS = s.id;
  const ctx = { tenantId: tid, systemId: SYS };
  await acc.saveSettings(tid, SYS, { orgName: "ร้าน C4", taxId: "0105561000007", vatRegistered: true, vatRateBp: 700, taxPointBasis: "ON_ISSUE" });
  await gl.ensureAccounting(ctx);
  const bank = await fin.createFinanceAccount({ tenantId: tid, systemId: SYS, type: "BANK", name: "กสิกร", promptpayId: "0105561000007", useForReceive: true });
  const events = async (type?: string) => prisma.outboxEvent.findMany({ where: { tenantId: tid, ...(type ? { type } : {}) }, orderBy: { createdAt: "asc" } });

  // ═══ E2 ผู้ติดต่อ/สินค้า ═══
  const c = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", name: "ลูกค้า ซีโฟร์", phone: "0811111112" });
  const evC = await events("account.contact.created");
  chk("C4-E2.1", "createContact → event account.contact.created payload{contactId,code,name,kind}", evC.length === 1 && (evC[0]!.payload as Any)?.contactId === c.id && typeof (evC[0]!.payload as Any)?.name === "string" && evC[0]!.systemId === SYS, "1 event", `${evC.length} ${JSON.stringify(evC[0]?.payload).slice(0, 160)}`);
  await acc.updateContact(tid, SYS, c.id, { email: "c4@test.local" });
  chk("C4-E2.2", "updateContact → account.contact.updated 1 event", (await events("account.contact.updated")).length === 1, "1", `${(await events("account.contact.updated")).length}`);
  const p = await prod.createProduct(tid, SYS, { name: "สินค้า ซีโฟร์", type: "GOODS", salePrice: 10000 });
  await prod.updateProduct(tid, SYS, p.id, { name: "สินค้า ซีโฟร์ (แก้)", type: "GOODS", salePrice: 12000 });
  chk("C4-E2.3", "createProduct/updateProduct → product.created 1 + product.updated 1 payload{productId,name,sku}", (await events("account.product.created")).length === 1 && (await events("account.product.updated")).length === 1 && ((await events("account.product.created"))[0]!.payload as Any)?.productId === p.id, "1+1", `${(await events("account.product.created")).length}/${(await events("account.product.updated")).length}`);
  const c2 = await acc.createContact({ tenantId: tid, systemId: SYS, kind: "CUSTOMER", name: "ลูกค้า ซีโฟร์ ซ้ำ", phone: "0811111112" });
  const m = await merge.mergeContacts(ctx, { primaryId: c.id, secondaryId: c2.id, actorId: null });
  const evM = await events("account.contact.merged");
  chk("C4-E2.4", "mergeContacts → account.contact.merged payload{keepId,mergedId}", m?.ok === true && evM.length === 1 && (evM[0]!.payload as Any)?.keepId === c.id && (evM[0]!.payload as Any)?.mergedId === c2.id, "1", `${evM.length} ${JSON.stringify(evM[0]?.payload)}`);

  // ═══ E3 เอกสาร ═══
  const qt = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "QUOTATION", contactId: c.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "x", qty: 1, unitPrice: 100000, vatRateBp: 700 }] });
  await acc.issueDocument(tid, SYS, qt.id);
  await acc.issueDocument(tid, SYS, qt.id); // ซ้ำ → ไม่ควรมี event เพิ่ม
  const evI = await events("account.document.issued");
  chk("C4-E3.1", "issueDocument → account.document.issued 1 event (ซ้ำไม่เพิ่ม) payload{documentId,type,docNo,contactId,grandTotalSatang,issueDate}", evI.length === 1 && (evI[0]!.payload as Any)?.documentId === qt.id && (evI[0]!.payload as Any)?.type === "QUOTATION" && /^QT/.test((evI[0]!.payload as Any)?.docNo ?? "") && (evI[0]!.payload as Any)?.grandTotalSatang === 107000 && /^\d{4}-\d{2}-\d{2}$/.test((evI[0]!.payload as Any)?.issueDate ?? ""), "1 event", `${evI.length} ${JSON.stringify(evI[0]?.payload).slice(0, 200)}`);
  chk("C4-E3.2", "idempotencyKey ของ issued = account.document.issued#<docId>", evI[0]?.idempotencyKey === `account.document.issued#${qt.id}`, "ตามแบบ", `${evI[0]?.idempotencyKey}`, "MAJOR");
  await acc.setQuotationResponse(tid, SYS, qt.id, true);
  const evQ = await events("account.quotation.responded");
  chk("C4-E3.3", "setQuotationResponse → account.quotation.responded payload{documentId,accepted:true}", evQ.length === 1 && (evQ[0]!.payload as Any)?.accepted === true, "1", `${evQ.length} ${JSON.stringify(evQ[0]?.payload)}`);
  const conv = await acc.convertDocument(tid, SYS, qt.id, "INVOICE");
  await acc.issueDocument(tid, SYS, conv.newId);
  chk("C4-E3.4", "issue ใบแจ้งหนี้ที่แปลงมา → issued รวมเป็น 2 event", (await events("account.document.issued")).length === 2, "2", `${(await events("account.document.issued")).length}`);
  const payRes = await pay.recordPayments(tid, SYS, conv.newId, [{ paidAt: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()), financeAccountId: bank.id, amountSatang: 107000, note: "", whtIncomeType: null, whtRateBp: null, whtAmountSatang: 0, feeSatang: 0, cheque: null }], { userId: null, keyBase: "qc-c4" });
  chk("C4-E3.5", "recordPayments → payment.recorded + invoice.paid (ของเดิมยังยิง)", payRes?.ok === true && (await events("account.payment.recorded")).length === 1 && (await events("account.invoice.paid")).length === 1, "1+1", `${(await events("account.payment.recorded")).length}/${(await events("account.invoice.paid")).length}`);
  const payment = await prisma.accountDocumentPayment.findFirst({ where: { documentId: conv.newId } });
  const v = await pay.voidPaymentAny(tid, SYS, conv.newId, payment!.id, "ทดสอบ void");
  const evPV = await events("account.payment.voided");
  chk("C4-E3.6", "voidPaymentAny → account.payment.voided payload{paymentId,documentId,reason,amountSatang}", v?.ok === true && evPV.length === 1 && (evPV[0]!.payload as Any)?.paymentId === payment!.id && (evPV[0]!.payload as Any)?.reason === "ทดสอบ void", "1", `${evPV.length} ${JSON.stringify(evPV[0]?.payload).slice(0, 160)}`);
  const vd = await acc.voidDocument(tid, SYS, conv.newId, "ยกเลิกใบแจ้งหนี้");
  const evV = await events("account.document.voided");
  chk("C4-E3.7", "voidDocument → account.document.voided payload{documentId,type,docNo,reason}", vd?.ok === true && evV.length === 1 && (evV[0]!.payload as Any)?.documentId === conv.newId && (evV[0]!.payload as Any)?.reason === "ยกเลิกใบแจ้งหนี้", "1", `${evV.length} ${JSON.stringify(evV[0]?.payload).slice(0, 160)}`);

  // ═══ E4 ลิงก์ชำระเงิน ═══
  const iv2 = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "INVOICE", contactId: c.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "y", qty: 1, unitPrice: 50000, vatRateBp: 700 }] });
  await acc.issueDocument(tid, SYS, iv2.id);
  const pr = await payReq.createPaymentRequest(ctx, iv2.id, { financeId: bank.id, expiresInDays: 1 });
  const cf = await payReq.confirmStaticPaymentRequest(ctx, pr.id ?? pr.request?.id, { userId: null });
  const evPR = await events("account.payment_request.paid");
  chk("C4-E4.1", "confirmStaticPaymentRequest → account.payment_request.paid payload{requestId,documentId,amountSatang,provider}", cf?.ok === true && evPR.length === 1 && (evPR[0]!.payload as Any)?.documentId === iv2.id && Number.isInteger((evPR[0]!.payload as Any)?.amountSatang), "1", `${JSON.stringify(cf).slice(0, 80)} ${evPR.length} ${JSON.stringify(evPR[0]?.payload).slice(0, 160)}`);
  const iv3 = await acc.createDocument({ tenantId: tid, systemId: SYS, docType: "INVOICE", contactId: c.id, issueDate: new Date(), vatMode: "EXCLUDE", lines: [{ description: "z", qty: 1, unitPrice: 50000, vatRateBp: 700 }] });
  await acc.issueDocument(tid, SYS, iv3.id);
  const pr3 = await payReq.createPaymentRequest(ctx, iv3.id, { financeId: bank.id, expiresInDays: 1 });
  await prisma.accountPaymentRequest.updateMany({ where: { id: pr3.id ?? pr3.request?.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await payReq.expireRequests(new Date());
  const evPE = await events("account.payment_request.expired");
  chk("C4-E4.2", "expireRequests → account.payment_request.expired payload{requestId,documentId}", evPE.length === 1 && (evPE[0]!.payload as Any)?.documentId === iv3.id, "1", `${evPE.length} ${JSON.stringify(evPE[0]?.payload)}`);

  // ═══ E5 drain + webhook dispatch จริง (จับ fetch) ═══
  const captured: { url: string; body: string; headers: Record<string, string> }[] = [];
  const ep = await wh.createEndpoint({ tenantId: tid }, { url: "https://hook.test/issued", events: ["account.document.issued"] });
  const epAll = await wh.createEndpoint({ tenantId: tid }, { url: "https://hook.test/contacts", events: ["account.contact.created"] });
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown; headers?: Record<string, string> }) => {
    const u = String(url);
    if (u.startsWith("https://hook.test/")) {
      captured.push({ url: u, body: String(init?.body ?? ""), headers: (init?.headers ?? {}) as Record<string, string> });
      return new Response("ok", { status: 200 });
    }
    return realFetch(url as Any, init as Any);
  }) as typeof fetch;
  const drained = await consumersMod.drainAll();
  globalThis.fetch = realFetch;
  const pending = await prisma.outboxEvent.count({ where: { tenantId: tid, status: { not: "DONE" } as Any } });
  chk("C4-E5.1", "drainAll → event ทุกตัวของร้าน DONE (PENDING/FAILED = 0) · ไม่มี lastError 'ไม่มี consumer'", pending === 0 && (drained?.failed ?? 0) === 0, "0 ค้าง", `pending=${pending} failed=${drained?.failed} processed=${drained?.processed}`);
  const issuedHooks = captured.filter((x) => x.url === "https://hook.test/issued");
  chk("C4-E5.2", "ปลายทางที่สมัคร document.issued ได้รับ 2 ครั้ง (QT+IV) ไม่ได้รับ event อื่น · body.type ถูก", issuedHooks.length === 2 && issuedHooks.every((x) => JSON.parse(x.body).type === "account.document.issued"), "2", `${issuedHooks.length}`);
  const contactHooks = captured.filter((x) => x.url === "https://hook.test/contacts");
  chk("C4-E5.3", "ปลายทางที่สมัคร contact.created ได้รับ 2 (c + c2) เท่านั้น", contactHooks.length === 2, "2", `${contactHooks.length}`);
  const one = issuedHooks[0];
  const sig = one ? createHmac("sha256", ep.secret).update(one.body).digest("hex") : "";
  chk("C4-E5.4", "X-Shark-Signature = HMAC-SHA256(secret, body) + X-Shark-Event", !!one && one.headers["X-Shark-Signature"] === sig && one.headers["X-Shark-Event"] === "account.document.issued", "ลายเซ็นตรง", JSON.stringify(one?.headers).slice(0, 160));
  const bodyObj = one ? JSON.parse(one.body) : {};
  chk("C4-E5.5", "body webhook = { type, payload{documentId,docNo,…}, sentAt } · payload ไม่มี tenantId/systemId", !!bodyObj.payload?.documentId && typeof bodyObj.sentAt === "string" && !("tenantId" in bodyObj.payload) && !("systemId" in bodyObj.payload), "สะอาด", JSON.stringify(bodyObj).slice(0, 200), "MAJOR");
  const deliveries = await prisma.webhookDelivery.count({ where: { tenantId: tid, status: "OK" } });
  chk("C4-E5.6", "WebhookDelivery OK = 4 แถว", deliveries === 4, "4", `${deliveries}`, "MAJOR");
  void epAll;

  // ═══ E6 เอกสาร (generator) ═══
  const md = (await import("node:fs")).readFileSync("docs/api/ACCOUNT-API.md", "utf8");
  chk("C4-E6.1", "คู่มือ ACCOUNT-API.md มีหัวข้อ Webhooks + รายชื่อ event ใหม่ครบ + วิธีตรวจลายเซ็น", /## Webhooks/.test(md) && NEW_EVENTS.every((e) => md.includes(e)) && /X-Shark-Signature/.test(md), "ครบ", NEW_EVENTS.filter((e) => !md.includes(e)).join(","), "MAJOR");
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 260) : String(e));
} finally {
  globalThis.fetch = realFetch;
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch {} };
  if (tid) {
    for (const m of ["webhookDelivery", "webhookEndpoint", "accountJournalLine", "accountJournalEntry", "accountPaymentRequest", "accountDocumentPayment", "accountDocumentRelation", "accountDocumentLine", "accountDocument", "accountDocSequence", "accountProduct", "accountFinanceOpening", "accountFinance", "accountContact", "accountMapping", "accountLedger", "accountPeriod", "accountSettings", "outboxEvent", "auditLog", "party", "appSystemUnit", "appSystem"]) {
      await d(() => (prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m].deleteMany({ where: { tenantId: tid } }));
    }
    await d(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await d(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account API webhooks (C4) =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
