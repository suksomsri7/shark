// QC Account REST — คำสั่งใหม่ของ T3.3 / T3.4 / T3.5 (เลน 2) ผ่าน route จริง /api/v1/account + เครื่องมือเลขา AI (ทะเบียนเดียวกัน)
//   GET /wht/pnd?type=1|2|3|53|54 (+CSV) · GET /wht/pnd1k (+CSV) · GET /wht/filings/{form}/{period} · POST /wht/filings (แบบ 1/2/54)
//   POST /wht/filings/{form}/{period}/additional · POST /wht/certs/{id}/replace · GET /wht/certs/{id} (เงื่อนไข/แบบ/ใบแทน)
//   GET /wht/credits/owed (+CSV) · POST|DELETE /wht/credits/{id}/received
// test id ของ op: wht.replace-cert = "T3.3-R1" · wht.pnd1k = "T3.4-R2" · wht.filing-state = "T3.4-R3" · wht.additional-filing = "T3.4-A1" · wht.mark-received = "T3.5-R1" · wht.unmark-received = "T3.5-R2" · wht.credits-owed = "T3.5-R3"
// ร้านทดสอบแยก "QC T3b REST" · รัน: bash scripts/iso.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-account-api-wht-t3.mts
// เฉลยมือ (สตางค์) · P = 2026-04: จ่ายนิติไทย 40(8) 1,000,000 / 30,000 (ใบ A) · จ่ายบุคคล 40(2) 200,000 / 10,000 (ภ.ง.ด.1) · จ่าย SG 40(2) 300,000 / 45,000 (ภ.ง.ด.54)
//   ลูกค้าหักเรา 500,000 / 15,000 (WTI)
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-account-api-wht-t3");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, exp: unknown, act: unknown, sev: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${JSON.stringify(exp)} | act ${JSON.stringify(act)?.slice(0, 900)}`}`);
};
const eq = (id: string, n: string, act: unknown, exp: unknown, sev: Sev = "CRITICAL") => chk(id, n, JSON.stringify(act) === JSON.stringify(exp), exp, act, sev);

const KEEP = process.env.KEEP === "1";
const F: Any = await import("./qc-acc-v2-wht-fixture.mts" as string);
const acc: Any = await import("@/lib/modules/account/service" as string);
const ak: Any = await import("@/lib/api-keys/service" as string);
const scopes: Any = await import("@/lib/api-keys/scopes" as string);
const route: Any = await import("@/app/api/v1/account/[...path]/route" as string);
const AO: Any = await import("@/lib/ai/account-ops" as string);
const P = "2026-04";

// ═══ A0 เครื่องมือเลขา (ทะเบียนเดียวกับ REST) ═══
console.log("\n── A0 เครื่องมือเลขา AI ──");
{
  const tools = AO.accountToolInfos();
  const want: Record<string, [string, boolean]> = {
    account_wht_pnd_report: ["wht.pnd", false],
    account_wht_additional_filing: ["wht.additional-filing", true],
    account_wht_replace_cert: ["wht.replace-cert", true],
    account_wht_credits_owed: ["wht.credits-owed", false],
    account_wht_mark_received: ["wht.mark-received", true],
    account_wht_unmark_received: ["wht.unmark-received", true],
  };
  const got = Object.keys(want).map((n) => {
    const t = tools.find((x: Any) => x.name === n);
    return t ? [t.opId, t.write] : null;
  });
  eq("A0.1", "เครื่องมือใหม่ 6 ตัวผูก op · อ่าน = ทำทันที · เขียน = ข้อเสนอ", got, Object.values(want));
  const kinds = AO.accountKindAccess();
  chk("A0.2", "ข้อเสนอของเครื่องมือเขียนใช้สิทธิ์ account.wht.manage (จาก op.action)", ["wht.additional-filing", "wht.replace-cert", "wht.mark-received"].every((id) => kinds[AO.accountKindOf(id)]?.action === "account.wht.manage"), "manage", kinds);
}

let tid = "";
let prisma: Any = null;
try {
  const S = await F.setupWhtShop("QC T3b REST", "qc-t3b-api");
  tid = S.tid;
  prisma = S.prisma;
  const { SYS, owner } = S;
  const a = await S.payVendor({ vendorId: S.vJur.id, ym: P, d: 2, base: 1_000_000, wht: 30_000, rateBp: 300, incomeType: "M40_8", key: "t3api-a" });
  await S.payVendor({ vendorId: S.vInd.id, ym: P, d: 3, base: 200_000, wht: 10_000, rateBp: 500, incomeType: "M40_2", key: "t3api-c" });
  await S.payVendor({ vendorId: S.vForeign.id, ym: P, d: 4, base: 300_000, wht: 45_000, rateBp: 1500, incomeType: "M40_2", key: "t3api-e" });
  const iv = await acc.createDocument({ tenantId: S.tid, systemId: SYS, docType: "INVOICE", contactId: S.cust.id, issueDate: S.day(P, 10), vatMode: "NONE", lines: [{ description: "บริการ", qty: 1, unitPrice: 500_000, vatRateBp: 0 }], createdById: owner.id });
  await acc.issueDocument(S.tid, SYS, iv.id);
  await acc.recordPayment(S.tid, SYS, iv.id, { paidAt: S.day(P, 10), channel: "TRANSFER", financeAccountId: S.bank.id, amount: 485_000, whtAmountSatang: 15_000, whtRateBp: 300, whtIncomeType: "M40_8", createdById: owner.id, idempotencyKey: `t3api-wti-${S.tid}` });
  const wti = await prisma.accountDocument.findFirstOrThrow({ where: { systemId: SYS, docType: "WHT_CERT", direction: "OUT" } });

  const kW = await ak.createApiKey({ tenantId: S.tid }, "T3b write", { scopes: scopes.expandBundles(["accountant"]), systemId: SYS });
  const kR = await ak.createApiKey({ tenantId: S.tid }, "T3b read", { scopes: ["account.tax.view"], systemId: SYS });
  const call = async (method: string, path: string, key: string, body?: unknown, accept?: string) => {
    const headers: Record<string, string> = { authorization: `Bearer ${key}`, ...(method === "GET" ? {} : { "idempotency-key": `t3b-${Date.now()}-${Math.random().toString(16).slice(2)}` }), ...(accept ? { accept } : {}) };
    let b: string | undefined;
    if (body !== undefined) {
      b = JSON.stringify(body);
      headers["content-type"] = "application/json";
    }
    const req = new Request(`http://x/api/v1/account${path}`, { method, headers, body: b });
    const segs = path.split("?")[0]!.split("/").filter(Boolean);
    const res = await route[method]!(req, { params: Promise.resolve({ path: segs }) });
    const text = await res.text();
    let parsed: Any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { _raw: text };
    }
    return { status: res.status, body: parsed, type: res.headers.get("content-type") ?? "" };
  };

  console.log("\n── A1 ภ.ง.ด. แยกแบบ ──");
  const r54 = await call("GET", `/wht/pnd?type=54&period=${P}`, kR.rawKey);
  eq("A1.1", "GET /wht/pnd?type=54 → 1 แถว 45,000 · form 54 · hasCert", [r54.status, r54.body?.data?.rows?.length, r54.body?.data?.grandWhtSatang, r54.body?.data?.rows?.[0]?.form, r54.body?.data?.rows?.[0]?.hasCert], [200, 1, 45_000, 54, true]);
  const r1 = await call("GET", `/wht/pnd?type=1&period=${P}`, kR.rawKey);
  const r3 = await call("GET", `/wht/pnd?type=3&period=${P}`, kR.rawKey);
  eq("A1.2", "type=1 มีค่านายหน้าบุคคล 10,000 · type=3 ว่าง (40(2) บุคคลไม่ไหลเข้า 3)", [r1.body?.data?.grandWhtSatang, r3.body?.data?.rows?.length], [10_000, 0]);
  const rBad = await call("GET", `/wht/pnd?type=7&period=${P}`, kR.rawKey);
  eq("A1.3", "type=7 → 422 validation", [rBad.status, rBad.body?.error?.code], [422, "validation"]);
  const rCsv = await call("GET", `/wht/pnd?type=53&period=${P}`, kR.rawKey, undefined, "text/csv");
  chk("A1.4", "CSV (Accept text/csv) = CSV ช่วยกรอกแบบ มีคอลัมน์ \"สถานะ 50 ทวิ\"", rCsv.status === 200 && /csv/.test(rCsv.type) && String(rCsv.body?._raw ?? "").includes("สถานะ 50 ทวิ"), "csv", { s: rCsv.status, t: rCsv.type });
  const r1k = await call("GET", `/wht/pnd1k?year=2026`, kR.rawKey);
  eq("A1.5", "GET /wht/pnd1k?year=2026 → นายสมศักดิ์ 200,000 / 10,000", [r1k.status, r1k.body?.data?.rows?.map((x: Any) => [x.recipientName, x.baseSatang, x.whtSatang])], [200, [["นายสมศักดิ์ รับจ้าง", 200_000, 10_000]]]);

  console.log("\n── A2 นำส่ง · สถานะ · แบบเพิ่มเติม ──");
  const mf = await call("POST", "/wht/filings", kW.rawKey, { form: 54, period: P });
  eq("A2.1", "POST /wht/filings form 54 → ok 45,000", [mf.status < 300, mf.body?.data?.totalTaxSatang], [true, 45_000]);
  const mf53 = await call("POST", "/wht/filings", kW.rawKey, { form: 53, period: P });
  eq("A2.2", "POST /wht/filings form 53 → 30,000", [mf53.status < 300, mf53.body?.data?.totalTaxSatang], [true, 30_000]);
  const st0 = await call("GET", `/wht/filings/53/${P}`, kR.rawKey);
  eq("A2.3", "GET /wht/filings/53/P → ยื่นแล้ว 30,000 · ไม่มีรายการปรับ", [st0.status, st0.body?.data?.filed?.totalTaxSatang, st0.body?.data?.changes?.length, st0.body?.data?.differenceSatang], [200, 30_000, 0, 0]);
  const noChange = await call("POST", `/wht/filings/53/${P}/additional`, kW.rawKey, { acknowledge: ["WHT_ADDITIONAL_FILING"] });
  eq("A2.4", "แบบเพิ่มเติมเมื่อไม่มีอะไรเปลี่ยน → 409 state", [noChange.status, noChange.body?.error?.code], [409, "state_conflict"]);
  await new Promise((r) => setTimeout(r, 30));

  console.log("\n── A3 ใบแทน ──");
  const rp0 = await call("POST", `/wht/certs/${a.certId}/replace`, kW.rawKey, { reason: "ชื่อผู้รับผิด", refreshPayee: true });
  eq("A3.1", "ไม่ส่ง acknowledge → 409 legal_ack_required + WHT_CERT_REPLACE + FILED_PERIOD_PND_CHANGE? (เดือนที่ยื่นแล้ว)", [rp0.status, rp0.body?.error?.code, (rp0.body?.error?.warnings ?? []).map((w: Any) => w.code).includes("WHT_CERT_REPLACE")], [409, "legal_ack_required", true]);
  const rp1 = await call("POST", `/wht/certs/${a.certId}/replace`, kW.rawKey, { reason: "ชื่อผู้รับผิด", refreshPayee: true, condition: 3, acknowledge: ["WHT_CERT_REPLACE", "FILED_PERIOD_PND_CHANGE"] });
  eq("A3.2", "ส่งครบ → ใบใหม่ + replacedCertId = ใบเดิม", [rp1.status < 300, rp1.body?.data?.replacedCertId === a.certId, !!rp1.body?.data?.docNo], [true, true, true]);
  const g1 = await call("GET", `/wht/certs/${rp1.body?.data?.certId}`, kR.rawKey);
  const g0 = await call("GET", `/wht/certs/${a.certId}`, kR.rawKey);
  eq("A3.3", "GET ใบใหม่: condition 3 · form 53 · ใบเดิม VOIDED + replacedById", [g1.body?.data?.condition, g1.body?.data?.form, g0.body?.data?.status, g0.body?.data?.replacedById === rp1.body?.data?.certId], [3, 53, "VOIDED", true]);
  const st1 = await call("GET", `/wht/filings/53/${P}`, kR.rawKey);
  eq("A3.4", "รายการปรับหลังยื่น: ยกเลิก −30,000 + ออก +30,000 · ส่วนต่าง 0", [st1.body?.data?.changes?.map((r: Any) => [r.change, r.whtSatang]).sort(), st1.body?.data?.differenceSatang], [[["ISSUED_AFTER", 30_000], ["VOIDED_AFTER", -30_000]], 0]);
  const ad0 = await call("POST", `/wht/filings/53/${P}/additional`, kW.rawKey, {});
  eq("A3.5", "แบบเพิ่มเติมไม่ยืนยัน → 409 legal_ack_required (WHT_ADDITIONAL_FILING)", [ad0.status, (ad0.body?.error?.warnings ?? []).map((w: Any) => w.code)], [409, ["WHT_ADDITIONAL_FILING"]]);
  const ad1 = await call("POST", `/wht/filings/53/${P}/additional`, kW.rawKey, { acknowledge: ["WHT_ADDITIONAL_FILING"], note: "REST" });
  eq("A3.6", "ยืนยัน → ครั้งที่ 1 ส่วนต่าง 0 ภาษีรวม 30,000", [ad1.status < 300, ad1.body?.data?.seq, ad1.body?.data?.deltaTaxSatang, ad1.body?.data?.totalTaxSatang], [true, 1, 0, 30_000]);
  const badForm = await call("POST", `/wht/filings/9/${P}/additional`, kW.rawKey, { acknowledge: ["WHT_ADDITIONAL_FILING"] });
  eq("A3.7", "แบบ 9 → 422", badForm.status, 422);

  console.log("\n── A4 ค้างรับ 50 ทวิ ──");
  const ow = await call("GET", "/wht/credits/owed", kR.rawKey);
  eq("A4.1", "GET /wht/credits/owed → 1 ใบ 15,000 + คำเตือน WHT_CREDIT_CERT_OWED", [ow.status, ow.body?.data?.rows?.length, ow.body?.data?.totalWhtSatang, ow.body?.data?.warnings?.[0]?.code], [200, 1, 15_000, "WHT_CREDIT_CERT_OWED"]);
  const deny = await call("POST", `/wht/credits/${wti.id}/received`, kR.rawKey, {});
  eq("A4.2", "คีย์อ่านอย่างเดียวทำเครื่องหมายไม่ได้ (403)", deny.status, 403);
  const mk = await call("POST", `/wht/credits/${wti.id}/received`, kW.rawKey, { note: "เล่ม 1 เลขที่ 9", receivedOn: "2026-04-20" });
  eq("A4.3", "POST received → changed · วันที่ 20 เม.ย.", [mk.status < 300, mk.body?.data?.changed, String(mk.body?.data?.receivedAt ?? "").slice(0, 10)], [true, true, "2026-04-20"]);
  const ow2 = await call("GET", "/wht/credits/owed", kR.rawKey);
  const lst = await call("GET", `/wht?direction=OUT`, kR.rawKey);
  eq("A4.4", "ค้างรับว่าง · รายการ WHT ฝั่งถูกหักมี certReceivedAt", [ow2.body?.data?.rows?.length, !!lst.body?.data?.[0]?.certReceivedAt], [0, true]);
  const cr = await call("GET", `/wht/credits?period=${P}`, kR.rawKey);
  eq("A4.5", "GET /wht/credits: certReceived = true (ธงจริง) · hasCertCopy คงความหมายไฟล์แนบ (false)", [cr.body?.data?.rows?.[0]?.certReceived ?? cr.body?.data?.items?.[0]?.certReceived, cr.body?.data?.rows?.[0]?.hasCertCopy ?? cr.body?.data?.items?.[0]?.hasCertCopy], [true, false]);
  const un = await call("DELETE", `/wht/credits/${wti.id}/received`, kW.rawKey, { reason: "ติ๊กผิด" });
  const ow3 = await call("GET", "/wht/credits/owed", kR.rawKey, undefined, "text/csv");
  eq("A4.6", "DELETE received → กลับมาค้าง · CSV มีแถวลูกค้า", [un.status < 300, String(ow3.body?._raw ?? "").includes("บริษัท ลูกค้าหักเรา จำกัด")], [true, true]);
  const wrong = await call("POST", `/wht/credits/${rp1.body?.data?.certId}/received`, kW.rawKey, {});
  eq("A4.7", "50 ทวิ ฝั่งที่ร้านหัก → 422", wrong.status, 422);
  const nf = await call("POST", `/wht/credits/nope/received`, kW.rawKey, {});
  eq("A4.8", "ไม่พบ → 404", nf.status, 404);
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? `${e.message}\n${e.stack?.split("\n").slice(0, 8).join("\n")}` : String(e));
} finally {
  if (prisma) await F.keepOrPurge(prisma, tid, KEEP);
  if (prisma) await prisma.$disconnect();
}

const fl = cks.filter((c) => !c.ok);
console.log(`\n===== QC Account REST — T3.3/T3.4/T3.5 =====\nผ่าน ${cks.length - fl.length}/${cks.length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fl.length, findings: fl.map((c) => c.id) })}`);
process.exit(fl.length > 0 ? 1 : 0);
