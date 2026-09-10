// QC — ระบบสมาชิก v2 WO M1.8: ช่องทางที่มา (D10) — AcquisitionLink/QR · hit counter · resolveSource ทุกทางเข้า (+MARKETPLACE/APP · sourceChannel) · attribution FIRST once / LAST update · รายงานตามช่องทาง · หน้า 13
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M1.8 · พิมพ์เขียว §4.3 (AcquisitionLink/MemberAttribution) §5.10 (sources) §7.2 §9.6 · ภาพ 13
// requires: member-seed
//
// สัญญาฟังก์ชัน (src/lib/modules/member/sources.ts)
//   listLinks(ctx) → [{ id code name source campaignId unitId target utm costSatang hits signups firstPurchases active url createdAt }]
//   createLink(ctx, actor, { code?, name, source, campaignId?, unitId?, target: "LIFF_JOIN"|"WEB_FORM"|"CHAT", utm?, costSatang? }) → { link, url, qrDataUrl } (settings.manage · code auto = A–Z0–9 6–10 ตัว unique ต่อร้าน · custom code [A-Za-z0-9_-]{3,32} · url = `${origin}/m/${tenantSlug}?src=${code}` · qr = data:image/png;base64 (qrFileId เก็บเมื่อ storage พร้อม — null ได้))
//   updateLink(ctx, actor, id, patch) · toggleLink(ctx, actor, id, active)
//   hit(tenantSlug, code) → { ok, linkId?, target? } (สาธารณะ · ไม่มี actor · hits+1 · ลิงก์ปิด/ไม่มี → ok false)
//   resolveSource(ctx, input: { via: "POS"|"LIFF"|"WEB_FORM"|"CHAT"|"BOOKING"|"IMPORT"|"CRM"|"API"|"REFERRAL"|"MARKETPLACE"|"APP", src?, staffUserId?, unitId?, formId?, contactChannel?, campaignId?, referrerCode?, apiKeyName?, fileName?, dealId?, marketplace? })
//     → { source: MemberSource, sourceChannel: string|null, sourceDetail: {...}, linkId: string|null, campaignId: string|null, staffUserId: string|null, referrerCustomerId: string|null, unitId: string|null }
//     กติกา: POS → POS {staffUserId, unitId} · LIFF+src (ลิงก์เปิดอยู่) → LIFF + linkId (+campaignId/unitId ของลิงก์ · source ของลิงก์ทับถ้าลิงก์ตั้ง source อื่น เช่น CAMPAIGN) · LIFF ไม่มี src → LIFF · WEB_FORM → WEB_FORM {formId} · CHAT contactChannel LINE → LINE_OA sourceChannel LINE · CHAT ช่องอื่น → CHAT sourceChannel key · BOOKING → BOOKING · IMPORT → IMPORT {fileName} · CRM → CRM {dealId} · API → API {apiKeyName} · REFERRAL referrerCode (Customer.referralCode) → REFERRAL referrerCustomerId · MARKETPLACE marketplace SHOPEE → MARKETPLACE sourceChannel SHOPEE · APP → APP sourceChannel APP · via/channel นอกทะเบียน → throw ไทย · ลิงก์ปิด → เหมือนไม่มี src
//   recordTouch(ctx, customerId, { source, sourceChannel?, linkId?, campaignId?, staffUserId?, unitId?, occurredAt? }) → { first, last } (FIRST เขียนครั้งเดียวถ้ายังไม่มี · LAST อัปเดตทุกครั้ง · link.signups ไม่เพิ่ม — เพิ่มเฉพาะตอน createMember)
//   createMember (M1.4) รับ sourceDetail.linkCode → เรียก resolveSource → attribution FIRST/LAST มี linkId · AcquisitionLink.signups+1 · recordFirstPurchase(ctx, customerId, saleId) → link.firstPurchases+1 ครั้งเดียว (ผู้เรียก = consumer pos.sale.paid ใน M2.8)
//   reportBySource(ctx, actor, { from, to, unitId? }) → { rows: [{ source, sourceChannel, signups, firstTouch, lastTouch, buyers, repeatBuyers, avgSpentSatang, costSatang, costPerSignupSatang }], links: [{ id, code, name, source, hits, signups, firstPurchases, costSatang, costPerSignupSatang }], total } (member.report.view · นับ FIRST เป็นหลัก · **signups = สมาชิกที่ Customer.createdAt ในช่วง** — ห้ามใช้วันที่ backfill/attribution.createdAt · ข้อสอบคำนวณค่าคาดหวังจาก DB ในช่วงเดียวกัน)
//   facade member/index.ts export resolveSource · recordTouch · recordFirstPurchase · UI: settings/sources/page.tsx (ภาพ 13: KPI · แท่งต่อช่องทาง · ตารางลิงก์/QR · โมดัลสร้าง · first vs last) testid sources-page sources-kpi sources-chart sources-links sources-link-new sources-link-qr
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/member/sources.ts")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (src/lib/modules/member/sources.ts)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const thai = (e: Error | null) => !!e && /[ก-๙]/.test(e.message);
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const P = prisma as Any;
let tid = ""; let SYS = "";
const tag = Date.now().toString(36);
const num = String(Date.now() % 1_000_000).padStart(6, "0");
const made = { customers: [] as string[], links: [] as string[] };
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const S = (await import("@/lib/modules/member/sources" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const M = (await import("@/lib/modules/member" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const U = { owner: E.users.owner.userId as string, thana: E.users.staff.thana.userId as string };
  const owner = await actorOf(U.owner); const thana = await actorOf(U.thana);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: U.owner }; const ctxT = { ...ctxO, actorUserId: U.thana };
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const units = E.units as Record<string, string>;
  const tenant = (await prisma.tenant.findUnique({ where: { id: tid } }))!;
  const mk = async (key: string, extra: Record<string, unknown>) => { const r = await PR.createMember(ctxO, owner, { phone: `0895${num}`.slice(0, 10).replace(/\d$/, key), firstName: `ที่มา${key}`, lastName: "ทดสอบ", source: "POS", homeUnitId: units.patong, ...extra }); made.customers.push(r.customerId); return r.customerId as string; };

  // ═══ S4 ลิงก์/QR (ทำก่อน เพราะ resolveSource ใช้) ═══
  const eLinkT = await fails(() => S.createLink(ctxT, thana, { name: "x", source: "LIFF", target: "LIFF_JOIN" }));
  const A = await S.createLink(ctxO, owner, { name: "QR หน้าร้านป่าตอง", source: "LIFF", target: "LIFF_JOIN", unitId: units.patong, costSatang: 200_000, utm: { utm_source: "qr", utm_medium: "poster" } });
  const B = await S.createLink(ctxO, owner, { code: `qc18-${tag}`, name: "แคมเปญเฟซบุ๊ก", source: "CAMPAIGN", target: "LIFF_JOIN", costSatang: 500_000 });
  for (const l of [A, B]) if (l?.link?.id) made.links.push(l.link.id);
  const eDup = await fails(() => S.createLink(ctxO, owner, { code: `qc18-${tag}`, name: "ซ้ำ", source: "LIFF", target: "LIFF_JOIN" }));
  const eBadCode = await fails(() => S.createLink(ctxO, owner, { code: "มี ช่องว่าง", name: "x", source: "LIFF", target: "LIFF_JOIN" }));
  const eBadTarget = await fails(() => S.createLink(ctxO, owner, { name: "x", source: "LIFF", target: "MOON" }));
  chk("M1.8-S4.1", "createLink: STAFF → throw · auto code A–Z0–9 6–10 ตัว · url = {origin}/m/{tenantSlug}?src={code} · qrDataUrl data:image/png · custom code ได้ · code ซ้ำ/ผิดรูป/target ผิด → throw ไทย · hits/signups/firstPurchases 0 · active true", thai(eLinkT) && /^[A-Z0-9]{6,10}$/.test(A?.link?.code ?? "") && A.url.endsWith(`/m/${tenant.slug}?src=${A.link.code}`) && /^data:image\/png;base64,/.test(A.qrDataUrl ?? "") && B?.link?.code === `qc18-${tag}` && thai(eDup) && thai(eBadCode) && thai(eBadTarget) && A.link.hits === 0 && A.link.signups === 0 && A.link.active === true && A.link.costSatang === 200_000, "ครบ", JSON.stringify({ t: !!eLinkT, code: A?.link?.code, url: A?.url, qr: (A?.qrDataUrl ?? "").slice(0, 22), dup: !!eDup, bad: [!!eBadCode, !!eBadTarget] }));
  const h1 = await S.hit(tenant.slug, A.link.code); const h2 = await S.hit(tenant.slug, A.link.code);
  await S.toggleLink(ctxO, owner, B.link.id, false);
  const hOff = await S.hit(tenant.slug, B.link.code); const hGhost = await S.hit(tenant.slug, "NOPE00");
  const hOther = await S.hit("ร้านอื่นไม่มี", A.link.code);
  const linkA = await P.acquisitionLink.findUnique({ where: { id: A.link.id } });
  chk("M1.8-S4.2", "hit(slug, code) สาธารณะ → {ok true, linkId, target} · hits +1 ต่อครั้ง (2) · ลิงก์ปิด/โค้ดไม่มี/ร้านผิด → {ok false} ไม่นับ · listLinks มี url + hits", h1?.ok === true && h1.linkId === A.link.id && h1.target === "LIFF_JOIN" && h2?.ok === true && linkA.hits === 2 && hOff?.ok === false && hGhost?.ok === false && hOther?.ok === false && ((await P.acquisitionLink.findUnique({ where: { id: B.link.id } })) as Any).hits === 0 && ((await S.listLinks(ctxO)) as Any[]).find((l) => l.id === A.link.id)?.url === A.url, "hits 2", JSON.stringify({ h1, h2: h2?.ok, hits: linkA?.hits, off: hOff, ghost: hGhost, other: hOther }));
  await S.toggleLink(ctxO, owner, B.link.id, true);

  // ═══ S1 resolveSource ทุกทางเข้า ═══
  const r = async (input: Record<string, unknown>) => S.resolveSource(ctxO, input);
  const rPos = await r({ via: "POS", staffUserId: U.thana, unitId: units.patong });
  const rLiff = await r({ via: "LIFF", src: A.link.code });
  const rLiffNo = await r({ via: "LIFF" });
  const rCamp = await r({ via: "LIFF", src: B.link.code });
  chk("M1.8-S1.1", "POS → {source POS, staffUserId, unitId} · LIFF+src ลิงก์ A → {source LIFF, linkId A, unitId ของลิงก์, sourceDetail.linkCode} · LIFF ไม่มี src → LIFF linkId null · LIFF+src ลิงก์ B (source CAMPAIGN) → source CAMPAIGN linkId B", rPos?.source === "POS" && rPos.staffUserId === U.thana && rPos.unitId === units.patong && rLiff?.source === "LIFF" && rLiff.linkId === A.link.id && rLiff.unitId === units.patong && rLiff.sourceDetail?.linkCode === A.link.code && rLiffNo?.source === "LIFF" && rLiffNo.linkId === null && rCamp?.source === "CAMPAIGN" && rCamp.linkId === B.link.id, "ครบ", JSON.stringify({ rPos, rLiff: [rLiff?.source, rLiff?.linkId === A?.link?.id], rLiffNo: rLiffNo?.linkId, rCamp: rCamp?.source }).slice(0, 220));
  const rForm = await r({ via: "WEB_FORM", formId: "form_qc" });
  const rLine = await r({ via: "CHAT", contactChannel: "LINE" });
  const rWa = await r({ via: "CHAT", contactChannel: "WHATSAPP" });
  const rBook = await r({ via: "BOOKING", unitId: units.kata });
  chk("M1.8-S1.2", "WEB_FORM → {WEB_FORM, sourceDetail.formId} · CHAT LINE → {LINE_OA, sourceChannel LINE} · CHAT WHATSAPP → {CHAT, sourceChannel WHATSAPP} · BOOKING → {BOOKING, unitId}", rForm?.source === "WEB_FORM" && rForm.sourceDetail?.formId === "form_qc" && rLine?.source === "LINE_OA" && rLine.sourceChannel === "LINE" && rWa?.source === "CHAT" && rWa.sourceChannel === "WHATSAPP" && rBook?.source === "BOOKING" && rBook.unitId === units.kata, "ครบ", JSON.stringify({ rForm: rForm?.source, rLine: [rLine?.source, rLine?.sourceChannel], rWa: [rWa?.source, rWa?.sourceChannel], rBook: rBook?.source }));
  const rImp = await r({ via: "IMPORT", fileName: "members.csv" });
  const rCrm = await r({ via: "CRM", dealId: "deal_1" });
  const rApi = await r({ via: "API", apiKeyName: "n8n" });
  const refCode = ((await prisma.customer.findUnique({ where: { id: m(1).id } })) as Any).referralCode as string;
  const rRef = await r({ via: "REFERRAL", referrerCode: refCode });
  chk("M1.8-S1.3", "IMPORT → {IMPORT, sourceDetail.fileName} · CRM → {CRM, sourceDetail.dealId} · API → {API, sourceDetail.apiKeyName} · REFERRAL referrerCode → {REFERRAL, referrerCustomerId = สมาชิก 1}", rImp?.source === "IMPORT" && rImp.sourceDetail?.fileName === "members.csv" && rCrm?.source === "CRM" && rCrm.sourceDetail?.dealId === "deal_1" && rApi?.source === "API" && rApi.sourceDetail?.apiKeyName === "n8n" && rRef?.source === "REFERRAL" && rRef.referrerCustomerId === m(1).id, "ครบ", JSON.stringify({ rImp: rImp?.source, rCrm: rCrm?.source, rApi: rApi?.source, rRef: [rRef?.source, rRef?.referrerCustomerId === m(1).id] }));
  const rShop = await r({ via: "MARKETPLACE", marketplace: "SHOPEE" });
  const rApp = await r({ via: "APP" });
  const eVia = await fails(() => r({ via: "MOON" }));
  const eChan = await fails(() => r({ via: "CHAT", contactChannel: "TELEGRAM" }));
  const eMkt = await fails(() => r({ via: "MARKETPLACE", marketplace: "LINE" }));
  const eRef = await fails(() => r({ via: "REFERRAL", referrerCode: "NOPE-1" }));
  chk("M1.8-S1.4", "MARKETPLACE SHOPEE → {MARKETPLACE, sourceChannel SHOPEE} (D19) · APP → {APP, sourceChannel APP} · via ไม่รู้จัก/ช่องทางนอกทะเบียน/marketplace ที่ไม่ใช่ kind MARKETPLACE/referrerCode ไม่มี → throw ไทย", rShop?.source === "MARKETPLACE" && rShop.sourceChannel === "SHOPEE" && rApp?.source === "APP" && rApp.sourceChannel === "APP" && thai(eVia) && thai(eChan) && thai(eMkt) && thai(eRef), "ครบ", JSON.stringify({ rShop: [rShop?.source, rShop?.sourceChannel], rApp: rApp?.source, e: [eVia, eChan, eMkt, eRef].map((x) => !!x) }));
  await S.toggleLink(ctxO, owner, B.link.id, false);
  const rOff = await r({ via: "LIFF", src: B.link.code });
  const rGhostSrc = await r({ via: "LIFF", src: "NOPE00" });
  await S.toggleLink(ctxO, owner, B.link.id, true);
  chk("M1.8-S1.5", "ลิงก์ปิด/โค้ดไม่มี → เหมือนไม่มี src (source LIFF · linkId null · sourceDetail.linkCode คงไว้เพื่อสืบ) ไม่ throw", rOff?.source === "LIFF" && rOff.linkId === null && rGhostSrc?.source === "LIFF" && rGhostSrc.linkId === null && rOff.sourceDetail?.linkCode === B.link.code, "ไม่ throw", JSON.stringify({ rOff, rGhostSrc }).slice(0, 160));

  // ═══ S2 first ไม่ทับ / last ทับ ═══
  const c1 = await mk("1", { source: "LIFF", sourceDetail: { linkCode: A.link.code } });
  const c2 = await mk("2", { source: "LIFF", sourceDetail: { linkCode: A.link.code } });
  const c3 = await mk("3", { source: "LIFF", referralCode: refCode });
  const att1: Any[] = await P.memberAttribution.findMany({ where: { customerId: c1 } });
  const linkA2 = await P.acquisitionLink.findUnique({ where: { id: A.link.id } });
  const cu1 = (await prisma.customer.findUnique({ where: { id: c1 } })) as Any;
  chk("M1.8-S2.1", "createMember(source LIFF · sourceDetail.linkCode A) → attribution FIRST+LAST {source LIFF, linkId A, unitId ป่าตอง} · Customer.source LIFF · sourceDetail มี linkId/linkCode · AcquisitionLink.signups +2 (c1,c2) · c3 ผ่าน referralCode → source REFERRAL (M1.4)", att1.length === 2 && att1.every((a) => a.source === "LIFF" && a.linkId === A.link.id && a.unitId === units.patong) && cu1.source === "LIFF" && (cu1.sourceDetail as Any)?.linkId === A.link.id && linkA2.signups === 2 && ((await prisma.customer.findUnique({ where: { id: c3 } })) as Any).source === "REFERRAL", "FIRST/LAST · signups 2", JSON.stringify({ att: att1.map((a) => [a.touch, a.source, a.linkId === A?.link?.id]), signups: linkA2?.signups }));
  const t1 = await S.recordTouch(ctxO, c1, { source: "CAMPAIGN", linkId: B.link.id, campaignId: "camp_qc" });
  const t2 = await S.recordTouch(ctxO, c1, { source: "POS", staffUserId: U.thana, unitId: units.kata });
  const attAfter: Any[] = await P.memberAttribution.findMany({ where: { customerId: c1 } });
  const first = attAfter.find((a) => a.touch === "FIRST"); const last = attAfter.find((a) => a.touch === "LAST");
  const nf = await M.recordFirstPurchase(ctxO, c1, "sale_qc_1"); const nf2 = await M.recordFirstPurchase(ctxO, c1, "sale_qc_2");
  chk("M1.8-S2.2", "recordTouch ×2 → FIRST ไม่เปลี่ยน (LIFF · linkId A) · LAST = ล่าสุด (POS · staffUserId · unitId กะตะ) · แถวยัง 2 · signups ของลิงก์ B ไม่เพิ่ม · recordFirstPurchase → link A.firstPurchases +1 ครั้งเดียว (ครั้งที่ 2 = false)", t1?.first && t2?.last && attAfter.length === 2 && first?.source === "LIFF" && first.linkId === A.link.id && last?.source === "POS" && last.staffUserId === U.thana && last.unitId === units.kata && ((await P.acquisitionLink.findUnique({ where: { id: B.link.id } })) as Any).signups === 0 && nf?.counted === true && nf2?.counted === false && ((await P.acquisitionLink.findUnique({ where: { id: A.link.id } })) as Any).firstPurchases === 1, "ครบ", JSON.stringify({ first: [first?.source, first?.linkId === A?.link?.id], last: [last?.source, last?.unitId === units.kata], n: attAfter.length, nf, nf2 }));

  // ═══ S3 รายงาน ═══
  const from = new Date(Date.now() - 365 * 86400_000); const to = new Date(Date.now() + 86400_000);
  // signups นับจาก Customer.createdAt ในช่วง (ไม่ใช่วันที่ backfill) — seed กระจายวันสมัคร 400 วัน ⇒ คำนวณค่าคาดหวังจาก DB ตามช่วงเดียวกัน
  const expWalk = await prisma.customer.count({ where: { memberSystemId: SYS, source: "WALK_IN" as Any, createdAt: { gte: from, lte: to } } as Any });
  const expKataWalk = await prisma.customer.count({ where: { memberSystemId: SYS, source: "WALK_IN" as Any, homeUnitId: units.kata, createdAt: { gte: from, lte: to } } as Any });
  const rep = await S.reportBySource(ctxO, owner, { from, to });
  const liff = rep?.rows?.find((x: Any) => x.source === "LIFF"); const walk = rep?.rows?.find((x: Any) => x.source === "WALK_IN"); const refRow = rep?.rows?.find((x: Any) => x.source === "REFERRAL");
  const lA = rep?.links?.find((l: Any) => l.id === A.link.id);
  chk("M1.8-S3.1", `reportBySource(1 ปี · นับ Customer.createdAt ในช่วง): rows LIFF {signups 2, firstTouch 2, lastTouch 1 (c2 — c1 ย้าย LAST ไป POS), costSatang 200000 (ลิงก์ A), costPerSignupSatang 100000} · WALK_IN signups ${expWalk} (ตรง DB) · REFERRAL 1 · links มี A {hits 2, signups 2, firstPurchases 1, costPerSignupSatang 100000} · total = Σ signups`, liff?.signups === 2 && liff.firstTouch === 2 && liff.lastTouch === 1 && liff.costSatang === 200_000 && liff.costPerSignupSatang === 100_000 && walk?.signups === expWalk && refRow?.signups === 1 && lA?.hits === 2 && lA.signups === 2 && lA.firstPurchases === 1 && lA.costPerSignupSatang === 100_000 && rep.total === rep.rows.reduce((s: number, x: Any) => s + x.signups, 0), "ตัวเลขตรง", JSON.stringify({ liff, walk: walk?.signups, ref: refRow?.signups, lA, total: rep?.total }).slice(0, 300));
  const repU = await S.reportBySource(ctxO, owner, { from, to, unitId: units.kata });
  const repOld = await S.reportBySource(ctxO, owner, { from: new Date("2020-01-01"), to: new Date("2020-12-31") });
  const eRepT = await fails(() => S.reportBySource(ctxT, thana, { from, to }));
  chk("M1.8-S3.2", `unitId=กะตะ → นับเฉพาะ FIRST.unitId กะตะ (WALK_IN ${expKataWalk} ตรง DB · LIFF 0) · ช่วงปี 2020 → total 0 · thana (ไม่มี member.report.view) → throw`, repU?.rows?.find((x: Any) => x.source === "WALK_IN")?.signups === expKataWalk && (repU.rows.find((x: Any) => x.source === "LIFF")?.signups ?? 0) === 0 && repOld?.total === 0 && thai(eRepT), `${expKataWalk} · 0 · throw`, JSON.stringify({ kata: repU?.rows?.map((x: Any) => [x.source, x.signups]), old: repOld?.total, t: !!eRepT }).slice(0, 200));
  const t0 = Date.now(); await S.reportBySource(ctxO, owner, { from, to }); const ms = Date.now() - t0;
  chk("M1.8-S3.3", "รายงานคิดจาก MemberAttribution + PosSale (buyers/repeatBuyers/avgSpent) ≤ 1,000 ms บน seed · rows มีคีย์ buyers/repeatBuyers/avgSpentSatang เป็นตัวเลข", ms <= 1000 && rep.rows.every((x: Any) => typeof x.buyers === "number" && typeof x.repeatBuyers === "number" && typeof x.avgSpentSatang === "number"), "≤ 1000 ms", `${ms} ms`, "MAJOR");

  // ═══ S5 UI (ภาพ 13) ═══
  const page = read("src/app/app/sys/[id]/member/settings/sources/page.tsx"); const act = read("src/lib/modules/member/sources-actions.ts");
  const uiAll = existsSync("src/components/member") ? readdirSync("src/components/member").filter((f) => f.endsWith(".tsx")).map((f) => read(`src/components/member/${f}`)).join("\n") : "";
  const TIDS = ["sources-page", "sources-kpi", "sources-chart", "sources-links", "sources-link-new", "sources-link-qr"];
  chk("M1.8-S5.1", "settings/sources/page.tsx: requireTenant · สิทธิ์ settings.manage (ไม่มี = notFound) · reportBySource + listLinks · testid 6 · โมดัลสร้างลิงก์ (ชื่อ/ที่มา/สาขา/แคมเปญ/ต้นทุน) + QR (img data:) + คัดลอกลิงก์ · แท่งต่อช่องทาง first vs last · sources-actions.ts 'use server' gate settings.manage · ป้ายช่องทางไทย (MemberSource label registry) · ไม่มีอีโมจิ", /requireTenant/.test(page) && /notFound/.test(page) && /reportBySource/.test(page) && /listLinks/.test(page) && TIDS.every((t) => (page + uiAll).includes(t)) && /^\s*"use server"/m.test(act) && /member\.settings\.manage/.test(act) && /qrDataUrl|data:image/.test(uiAll) && /first|last/i.test(uiAll) && !EMOJI.test(uiAll.replace(/\/\/.*$/gm, "")) && /MemberTabs/.test(page), "ครบ", `missing=${TIDS.filter((t) => !(page + uiAll).includes(t)).join(",")} act=${/member\.settings\.manage/.test(act)}`);
  const dir = `${mq.MQC.shotsDir}/1.8`;
  const shots = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  const sumO = existsSync(`${dir}/summary-owner.json`) ? JSON.parse(read(`${dir}/summary-owner.json`)) : null;
  const rO = sumO?.results?.find((x: Any) => x.name === "settings-sources-owner" && x.device === "desktop");
  chk("M1.8-S5.2", "ภาพ 13: settings-sources-owner desktop+mobile 200 ไม่มี console error · sources-link-new-modal (เปิดโมดัล) · PARITY: ผ่าน ใน wo-notes/member-M1.8.md", shots.includes("settings-sources-owner-desktop.png") && shots.includes("settings-sources-owner-mobile.png") && rO?.status === 200 && rO.missing.length === 0 && rO.errors.length === 0 && shots.includes("sources-link-new-modal-desktop.png") && /PARITY:\s*ผ่าน/.test(read("ledger/wo-notes/member-M1.8.md")), "200 · PARITY", `shots=${shots.join(",")} o=${rO?.status}`, "MAJOR");
  const facade = read("src/lib/modules/member/index.ts"); const src = read("src/lib/modules/member/sources.ts");
  chk("M1.8-S6.1", "facade export resolveSource · recordTouch · recordFirstPurchase · sources.ts ไม่ import โมดูลอื่นตรง · ไม่มี any · QR ใช้ไลบรารี qrcode ที่มีอยู่ · origin จาก @/lib/core/origin (ไม่ฮาร์ดโค้ดโดเมน)", ["resolveSource", "recordTouch", "recordFirstPurchase"].every((f) => new RegExp(`\\b${f}\\b`).test(facade)) && !/@\/lib\/modules\/(chat|pos|kanban|booking|account|crm)\//.test(src) && !/\bany\b/.test(src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")) && /from "qrcode"/.test(src) && /@\/lib\/core\/origin/.test(src) && !/shark\.in\.th/.test(src), "สะอาด", `facade=${["resolveSource", "recordTouch", "recordFirstPurchase"].map((f) => new RegExp(`\\b${f}\\b`).test(facade)).join("/")} origin=${/@\/lib\/core\/origin/.test(src)}`, "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M1.8-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of ["memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberFieldValueHistory", "memberChannelIdentity", "memberAccessLog", "memberActivity", "pointLedger", "pointBalance"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: made.customers } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } }));
  }
  for (const id of made.links) await d(() => P.acquisitionLink.delete({ where: { id } }));
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: "member." }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M1.8: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
