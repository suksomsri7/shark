// QC — help-cases (15 พ.ย. 2026) · ระบบช่วยเหลือ = เคส: ขั้นของเคส (stage) + ประวัติขั้น + push · ไฟล์แนบส่วนตัว (รูป/PDF/Excel/CSV) · สิทธิ์เดิม
//   แบบ: /root/mockups/secretary-help/help.png · migration 20261228000600_support_case_stage
// กลุ่มข้อ:
//   S  ขั้นของเคส: เปิดเคส = RECEIVED + ประวัติ · ทีมตั้งขั้น (status ตาม · ประวัติ · audit · push "เคส #SHARK-… · สถานะ → …") · FINANCE throw · ขั้นเดิม no-op
//      NEED_INFO → ร้านตอบ ⇒ CHECKING · AWAITING_CONFIRM → ร้านกดแก้แล้ว ⇒ CLOSED · ร้านตอบหลังปิด ⇒ RECEIVED · setCaseStatus เดิม sync ขั้น
//      GET list/detail: stage · stageStep · caseNoText · stageEvents (ไม่มีรหัสคน) · สิทธิ์เดิม (STAFF อื่นไม่เห็น · OWNER เห็น)
//   A  ไฟล์แนบ: support/attachments (PDF/CSV ผ่าน · svg/HTML ปลอม png 415) · files ใน reply/create · เส้นโหลดไฟล์ (เห็นเคสเท่านั้น) · เพดาน 5 · รหัสปลอม 400
//      ฝั่ง backoffice: caseFileResponse ดาวน์โหลดได้ · ไฟล์ของเคสอื่น 404 · แนบแบบเดิม (url) ยังรับ
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-help-cases.mts
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
void ROOT;
const LABEL = "qc-sec-help-cases";
const SEC_HOST = "ep-calm-flower-aosbmxhm";
{
  const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ""; } };
  for (const n of ["DATABASE_URL", "DIRECT_URL"] as const) { const u = process.env[n] ?? ""; if (!u || !hostOf(u).startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: ${n} ไม่ใช่ฐาน QC เลขา — รันผ่าน scripts/qc-sec.sh`); process.exit(4); } }
  if (process.env.SEC_QC_HOST !== SEC_HOST || process.env.APP_ENV === "production") { console.error(`🔴 ${LABEL}: SEC_QC_HOST/APP_ENV ไม่ถูก — หยุด`); process.exit(4); }
}
try { process.loadEnvFile(process.env.QC_ENV_FILE ?? ".env.qc-sec"); } catch { /* */ }
if (!new URL(process.env.DATABASE_URL ?? "").hostname.toLowerCase().startsWith(SEC_HOST)) { console.error(`🔴 ${LABEL}: env file เปลี่ยน DATABASE_URL — หยุด`); process.exit(4); }
process.env.SHARK_AI_MOCK = "1";

type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${detail}` : ""}`); };
const skip = (id: string, name: string, why: string, sev: Sev = "CRITICAL") => { cks.push({ id, res: "SKIP", sev, why }); console.log(`  ⏭️  [${id}] ${name} — SKIP: ${why}`); };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
async function throws(fn: () => Promise<unknown> | unknown): Promise<string | null> { try { await fn(); return null; } catch (e) { return errMsg(e); } }
type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Handler = (r: Request, c?: { params: Promise<Record<string, string>> }) => Promise<Response>;

const { prisma } = await import("@/lib/core/db");
const support = (await import("@/lib/support/service")) as AnyMod;
const platform = (await import("@/lib/platform/support")) as AnyMod;
const files = (await import("@/lib/support/files")) as AnyMod;
const storage = (await import("@/lib/storage/service")) as AnyMod;
const auth = (await import("@/lib/mobile/auth")) as AnyMod;
const route = async (p: string): Promise<Record<string, Handler>> => (await import(`@/app/api/mobile/${p}/route`)) as unknown as Record<string, Handler>;
const P = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const jsonOf = async (r: Response) => { try { return (await r.json()) as Record<string, unknown>; } catch { return {}; } };

const RUN = Date.now().toString(36);
const U = { owner: `qcshc-owner-${RUN}`, staff: `qcshc-staff-${RUN}`, s2: `qcshc-s2-${RUN}`, pu: `qcshc-pu-${RUN}`, fin: `qcshc-fin-${RUN}` };
let tid = "";
const assets: string[] = [];
const cleanup = async () => {
  if (tid) {
    for (const a of assets) { try { await storage.deleteFileAsset({ tenantId: tid }, a); } catch { /* */ } }
    for (const m of ["supportStageEvent", "supportMessage", "supportCase", "aiNotifyPref", "fileAsset", "membership"]) { try { await (prisma as AnyMod)[m]?.deleteMany({ where: { tenantId: tid } }); } catch { /* */ } }
    try { await prisma.tenant.delete({ where: { id: tid } }); } catch (e) { console.log(`  ⚠️ cleanup: ${errMsg(e)}`); }
  }
  try { await prisma.tenant.deleteMany({ where: { slug: { startsWith: "qc-sec-shc-" }, createdAt: { lt: new Date(Date.now() - 3_600_000) } } }); } catch { /* */ }
  try { await prisma.pushDevice.deleteMany({ where: { expoToken: { startsWith: "ExponentPushToken[qcshc-" } } }); } catch { /* */ }
  try { await prisma.platformUser.deleteMany({ where: { email: { startsWith: "qcshc-" } } }); } catch { /* */ }
  try { await prisma.user.deleteMany({ where: { id: { startsWith: "qcshc-" } } }); } catch { /* */ }
};

// ไบต์ตัวอย่าง
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const CSV = new TextEncoder().encode("name,qty\nกาแฟ,2\n");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const FAKE_PNG = new TextEncoder().encode("<html><script>alert(1)</script></html>");

try {
  await cleanup();
  const t = await prisma.tenant.create({ data: { name: "QC SEC help-cases", slug: `qc-sec-shc-${RUN}` } });
  tid = t.id;
  for (const id of [U.owner, U.staff, U.s2]) await prisma.user.create({ data: { id, email: `${id}@example.com`, name: id } });
  await prisma.membership.create({ data: { tenantId: tid, userId: U.owner, role: "OWNER", unitAccess: ["*"], permissions: {} as never, acceptedAt: new Date() } });
  for (const uid of [U.staff, U.s2]) await prisma.membership.create({ data: { tenantId: tid, userId: uid, role: "STAFF", unitAccess: ["*"], permissions: {} as never, acceptedAt: new Date() } });
  for (const uid of [U.owner, U.staff, U.s2]) await prisma.pushDevice.create({ data: { userId: uid, tenantId: tid, expoToken: `ExponentPushToken[qcshc-${uid}]`, platform: "ios" } });
  const pu = await prisma.platformUser.create({ data: { email: `${U.pu}@example.com`, name: "ทีม QC", role: "SUPPORT" } as never });
  const fin = await prisma.platformUser.create({ data: { email: `${U.fin}@example.com`, name: "การเงิน QC", role: "FINANCE" } as never });
  const hdr = async (uid: string) => ({ authorization: `Bearer ${(await auth.issueMobileToken(uid)).token}`, "x-tenant-id": tid });
  const HS = await hdr(U.staff), HO = await hdr(U.owner), H2 = await hdr(U.s2);
  const J = (u: string, method: string, body: unknown, headers: Record<string, string>) => new Request(`http://qc.local/api/mobile/${u}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const rCases = await route("secretary/support/cases");
  const rCase = await route("secretary/support/cases/[id]");
  const rReply = await route("secretary/support/cases/[id]/reply");
  const rResolve = await route("secretary/support/cases/[id]/resolve");
  const rAtt = await route("secretary/support/attachments");
  const rFile = await route("secretary/support/cases/[id]/files/[fileId]");
  const detail = async (id: string, h: Record<string, string>) => { const r = await rCase.GET!(J(`secretary/support/cases/${id}`, "GET", undefined, h), P({ id })); return { status: r.status, json: await jsonOf(r) }; };
  const reply = async (id: string, body: Record<string, unknown>, h = HS) => { const r = await rReply.POST!(J(`secretary/support/cases/${id}/reply`, "POST", body, h), P({ id })); return { status: r.status, json: await jsonOf(r) }; };
  const row = (id: string) => prisma.supportCase.findUnique({ where: { id } });
  const evs = (id: string) => prisma.supportStageEvent.findMany({ where: { caseId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const pushes: { to: string; msg: AnyMod }[] = [];
  const post = async (body: unknown) => { const arr = Array.isArray(body) ? body : [body]; for (const m of arr) pushes.push({ to: String((m as AnyMod).to ?? ""), msg: m as AnyMod }); return { tickets: arr.map(() => ({ status: "ok" })) } as never; };

  console.log("── S: ขั้นของเคส ──");
  const op = await rCases.POST!(J("secretary/support/cases", "POST", { subject: "บันทึกใบเสร็จแล้วยอดไม่ขึ้น", body: "บันทึกใบเสร็จแล้วยอดไม่ขึ้น\nRE-0045" }, HS));
  const opJ = await jsonOf(op);
  const cid = String(opJ.id ?? "");
  const c0 = cid ? await row(cid) : null;
  const e0 = cid ? await evs(cid) : [];
  chk("S-1", "เปิดเคส (POST cases) ⇒ stage RECEIVED · status OPEN · ประวัติแถวแรก null→RECEIVED (SHOP) · caseNoText SHARK-000001", op.status === 200 && c0?.stage === "RECEIVED" && c0?.status === "OPEN" && e0.length === 1 && e0[0]!.fromStage === null && e0[0]!.toStage === "RECEIVED" && e0[0]!.actorSide === "SHOP" && opJ.caseNoText === "SHARK-000001", JSON.stringify({ st: op.status, opJ, stage: c0?.stage, e0: e0.length }).slice(0, 200));

  const okFix = await platform.setCaseStage(pu, cid, "FIXING", { note: "ทีมพบสาเหตุแล้ว", post });
  const c1 = await row(cid);
  const e1 = await evs(cid);
  const audit = await prisma.platformAuditLog.findFirst({ where: { targetType: "SupportCase", targetId: cid, action: "support.stage" } });
  const p1 = pushes.find((p) => String(p.msg.title ?? "").includes("สถานะ"));
  chk("S-2", "ทีมตั้ง FIXING ⇒ status OPEN · ประวัติ RECEIVED→FIXING (PLATFORM · note) · audit support.stage · push ถึงผู้แจ้งเท่านั้น หัว 'เคส #SHARK-000001 · สถานะ → กำลังแก้ไข' link /help/<id>",
    okFix === true && c1?.stage === "FIXING" && c1?.status === "OPEN" && e1.length === 2 && e1[1]!.fromStage === "RECEIVED" && e1[1]!.toStage === "FIXING" && e1[1]!.actorSide === "PLATFORM" && e1[1]!.actorId === pu.id && e1[1]!.note === "ทีมพบสาเหตุแล้ว" && !!audit && !!p1 && p1.msg.title === "เคส #SHARK-000001 · สถานะ → กำลังแก้ไข" && p1.to.includes(U.staff) && p1.msg.data?.link === `/help/${cid}` && !pushes.some((p) => p.to.includes(U.s2) || p.to.includes(U.owner)),
    JSON.stringify({ okFix, stage: c1?.stage, e1: e1.length, audit: !!audit, pushes: pushes.map((p) => [p.to, p.msg.title]) }).slice(0, 300));

  const nPush = pushes.length;
  const eFin = await throws(() => platform.setCaseStage(fin, cid, "CHECKING"));
  const same = await platform.setCaseStage(pu, cid, "FIXING", { post });
  const bad = await platform.setCaseStage(pu, cid, "NOPE", { post });
  chk("S-3", "FINANCE ⇒ throw · ขั้นเดิม = true ไม่มีประวัติ/push เพิ่ม · ขั้นไม่รู้จัก = false", !!eFin && same === true && bad === false && (await evs(cid)).length === 2 && pushes.length === nPush && (await row(cid))?.stage === "FIXING", JSON.stringify({ eFin, same, bad }));

  await platform.setCaseStage(pu, cid, "NEED_INFO", { note: "ขอภาพหน้าจอ", post });
  const c3 = await row(cid);
  const list = await rCases.GET!(J("secretary/support/cases", "GET", undefined, HS));
  const lj = await jsonOf(list);
  const li = ((lj.items ?? []) as AnyMod[]).find((x) => x.id === cid);
  chk("S-4", "NEED_INFO ⇒ status PENDING · GET list: stage NEED_INFO · stageStep 3 (ขั้นก่อนหน้า = แก้ไข) · caseNoText", c3?.stage === "NEED_INFO" && c3?.status === "PENDING" && li?.stage === "NEED_INFO" && li?.stageStep === 3 && li?.caseNoText === "SHARK-000001", JSON.stringify({ stage: c3?.stage, li }).slice(0, 200));

  const rp = await reply(cid, { body: "แนบภาพแล้วครับ" });
  const c4 = await row(cid);
  const e4 = await evs(cid);
  const last4 = e4[e4.length - 1];
  chk("S-5", "ร้านตอบตอน NEED_INFO ⇒ CHECKING · status OPEN · ประวัติ NEED_INFO→CHECKING (SHOP · ผู้ตอบ)", rp.status === 200 && c4?.stage === "CHECKING" && c4?.status === "OPEN" && last4?.fromStage === "NEED_INFO" && last4?.toStage === "CHECKING" && last4?.actorSide === "SHOP" && last4?.actorId === U.staff, JSON.stringify({ rp, stage: c4?.stage, last4 }).slice(0, 200));

  await platform.setCaseStage(pu, cid, "AWAITING_CONFIRM", { post });
  const c5a = await row(cid);
  const rpNo = await reply(cid, { body: "ยังไม่หาย ปัญหายังอยู่" });
  const c5b = await row(cid);
  await platform.setCaseStage(pu, cid, "AWAITING_CONFIRM", { post });
  const rs = await rResolve.POST!(J(`secretary/support/cases/${cid}/resolve`, "POST", {}, HS), P({ id: cid }));
  const c5 = await row(cid);
  const e5 = await evs(cid);
  chk("S-6", "AWAITING_CONFIRM ⇒ PENDING · ร้านตอบ 'ยังไม่หาย' ⇒ FIXING · ร้านกดแก้แล้ว ⇒ CLOSED + RESOLVED + ประวัติ AWAITING_CONFIRM→CLOSED", c5a?.status === "PENDING" && rpNo.status === 200 && c5b?.stage === "FIXING" && rs.status === 200 && c5?.stage === "CLOSED" && c5?.status === "RESOLVED" && e5[e5.length - 1]?.toStage === "CLOSED" && e5[e5.length - 1]?.fromStage === "AWAITING_CONFIRM", JSON.stringify({ a: c5a?.status, b: c5b?.stage, rs: rs.status, c: c5?.stage }));

  const rp2 = await reply(cid, { body: "กลับมาเป็นอีกแล้ว" });
  const c6 = await row(cid);
  const e6 = await evs(cid);
  chk("S-7", "ร้านตอบหลังปิด ⇒ เปิดใหม่ RECEIVED · status OPEN · ประวัติ CLOSED→RECEIVED", rp2.status === 200 && c6?.stage === "RECEIVED" && c6?.status === "OPEN" && e6[e6.length - 1]?.fromStage === "CLOSED" && e6[e6.length - 1]?.toStage === "RECEIVED", JSON.stringify({ stage: c6?.stage }));

  await platform.setCaseStatus(pu, cid, "RESOLVED");
  const c7a = await row(cid);
  await platform.setCaseStatus(pu, cid, "OPEN");
  const c7b = await row(cid);
  const replyBo = await platform.addPlatformMessage(pu, cid, "ทีมตอบ", { post });
  const c7c = await row(cid);
  chk("S-8", "backoffice เดิม: setCaseStatus RESOLVED ⇒ CLOSED · OPEN ⇒ RECEIVED · addPlatformMessage ⇒ PENDING ขั้นไม่เปลี่ยน", c7a?.stage === "CLOSED" && c7a?.status === "RESOLVED" && c7b?.stage === "RECEIVED" && c7b?.status === "OPEN" && replyBo === true && c7c?.status === "PENDING" && c7c?.stage === "RECEIVED", JSON.stringify({ a: c7a?.stage, b: c7b?.stage, c: [c7c?.status, c7c?.stage] }));

  const d = await detail(cid, HS);
  const dc = (d.json.case ?? {}) as AnyMod;
  const de = (d.json.stageEvents ?? []) as AnyMod[];
  const leak = JSON.stringify(de).includes(pu.id) || JSON.stringify(de).includes(U.staff);
  chk("S-9", "GET detail: case.stage · stageStep · caseNoText · stageEvents ครบทุกแถว (from/to/side/note/at) ไม่มีรหัสคน", d.status === 200 && dc.stage === "RECEIVED" && dc.stageStep === 1 && dc.caseNoText === "SHARK-000001" && de.length === (await evs(cid)).length && de.some((e) => e.to === "FIXING" && e.note === "ทีมพบสาเหตุแล้ว" && e.side === "PLATFORM") && !leak, JSON.stringify({ st: d.status, dc, n: de.length, leak }).slice(0, 240));

  const dOther = await detail(cid, H2);
  const dOwner = await detail(cid, HO);
  const lOther = (((await jsonOf(await rCases.GET!(J("secretary/support/cases", "GET", undefined, H2)))).items ?? []) as AnyMod[]).some((x) => x.id === cid);
  const setOther = await support.setResolvedByShop({ tenantId: tid }, U.s2, "STAFF", cid);
  chk("S-10", "สิทธิ์เดิม: STAFF อื่นไม่เห็น (404 · ไม่อยู่ในรายการ · resolve ไม่ได้) · OWNER เห็น", dOther.status === 404 && !lOther && setOther === false && dOwner.status === 200, JSON.stringify({ o: dOther.status, w: dOwner.status, lOther, setOther }));

  console.log("── A: ไฟล์แนบ ──");
  const up = async (name: string, type: string, bytes: Uint8Array, h = HS) => {
    const fd = new FormData(); fd.append("file", new File([bytes as BlobPart], name, { type }));
    const body = new Response(fd); const buf = new Uint8Array(await body.arrayBuffer());
    const res = await rAtt.POST!(new Request("http://qc.local/api/mobile/secretary/support/attachments", { method: "POST", headers: { ...h, "content-type": body.headers.get("content-type") ?? "", "content-length": String(buf.length) }, body: buf }));
    const j = await jsonOf(res); if (typeof j.id === "string") assets.push(j.id); return { status: res.status, json: j };
  };
  const upPdf = await up("report.pdf", "application/pdf", PDF);
  if (upPdf.status !== 200 && /storage|ที่เก็บไฟล์/.test(String(upPdf.json.message ?? ""))) {
    for (const id of ["A-1", "A-2", "A-3", "A-4", "A-5"]) skip(id, "ไฟล์แนบ", `ที่เก็บไฟล์ใช้ไม่ได้: ${String(upPdf.json.message ?? "")}`);
  } else {
    const upCsv = await up("stock.csv", "text/csv", CSV);
    const upSvg = await up("x.svg", "image/svg+xml", SVG);
    const upFake = await up("x.png", "image/png", FAKE_PNG);
    const priv = upPdf.json.id ? await prisma.fileAsset.findUnique({ where: { id: String(upPdf.json.id) } }) : null;
    chk("A-1", "support/attachments: PDF ⇒ 200 kind pdf · CSV ⇒ sheet · เก็บส่วนตัว (t/<tid>/private/) · svg ⇒ 415 · HTML ปลอม png ⇒ 415", upPdf.status === 200 && upPdf.json.kind === "pdf" && upCsv.status === 200 && upCsv.json.kind === "sheet" && !!priv && storage.isPrivateStoragePath(priv.path) && upSvg.status === 415 && upFake.status === 415, JSON.stringify({ pdf: [upPdf.status, upPdf.json.kind], csv: [upCsv.status, upCsv.json.kind], svg: upSvg.status, fake: upFake.status }).slice(0, 200));

    const pdfId = String(upPdf.json.id), csvId = String(upCsv.json.id);
    const rpf = await reply(cid, { body: "แนบรายงาน", files: [{ id: pdfId, name: "report.pdf" }, { id: csvId }] });
    const d2 = await detail(cid, HS);
    const m2 = ((d2.json.messages ?? []) as AnyMod[]).find((m) => m.body === "แนบรายงาน");
    const atts = (m2?.attachments ?? []) as AnyMod[];
    const pdfUrl = `/api/mobile/secretary/support/cases/${cid}/files/${pdfId}`;
    chk("A-2", "reply + files ⇒ ข้อความมีไฟล์ 2 ชิ้น (private · url = เส้นแอป · kind pdf/sheet · ขนาด)", rpf.status === 200 && atts.length === 2 && atts[0]?.private === true && atts[0]?.url === pdfUrl && atts[0]?.kind === "pdf" && atts[1]?.kind === "sheet" && atts[0]?.size === PDF.length, JSON.stringify({ rpf, atts }).slice(0, 260));

    const get = async (id: string, fid: string, h: Record<string, string>) => { const r = await rFile.GET!(new Request(`http://qc.local/api/mobile/secretary/support/cases/${id}/files/${fid}`, { headers: h }), P({ id, fileId: fid })); return { status: r.status, bytes: new Uint8Array(await r.arrayBuffer()), ct: r.headers.get("content-type") ?? "", cc: r.headers.get("cache-control") ?? "" }; };
    const gS = await get(cid, pdfId, HS), gO = await get(cid, pdfId, HO), g2 = await get(cid, pdfId, H2);
    // เคสอื่นของร้านเดียวกัน (ของ s2) อ้างไฟล์ไม่ได้
    const other = await support.openCaseFromApp({ tenantId: tid }, { userId: U.s2, subject: "อีกเรื่อง", body: "x" });
    const gX = await get(other.id, pdfId, H2);
    const gBad = await get(cid, "clxxxxxxxxxxxxxxxxxxxxxxx", HS);
    chk("A-3", "เส้นโหลดไฟล์: ผู้แจ้ง 200 ไบต์ตรง · OWNER 200 · STAFF อื่น 404 · ไฟล์ไม่ได้อยู่ในเคสนั้น 404 · รหัสมั่ว 404 · no-store", gS.status === 200 && gS.bytes.length === PDF.length && gS.ct.startsWith("application/pdf") && /no-store/.test(gS.cc) && gO.status === 200 && g2.status === 404 && gX.status === 404 && gBad.status === 404, JSON.stringify({ s: gS.status, n: gS.bytes.length, ct: gS.ct, o: gO.status, x2: g2.status, gX: gX.status, bad: gBad.status }));

    const bo = await files.caseFileResponse(tid, cid, csvId, { download: true });
    const boX = await files.caseFileResponse(tid, other.id, csvId, { download: true });
    const boBody = new TextDecoder().decode(new Uint8Array(await bo.arrayBuffer()));
    chk("A-4", "backoffice (caseFileResponse): CSV ดาวน์โหลด (attachment · text/csv) เนื้อหาตรง · เคสอื่น 404", bo.status === 200 && /attachment/.test(bo.headers.get("content-disposition") ?? "") && (bo.headers.get("content-type") ?? "").startsWith("text/csv") && boBody.includes("กาแฟ") && boX.status === 404, JSON.stringify({ st: bo.status, cd: bo.headers.get("content-disposition"), boX: boX.status }));

    const six = await reply(cid, { body: "หกไฟล์", files: Array.from({ length: 6 }, (_, i) => ({ id: `${pdfId}${i}` })) });
    const fake = await reply(cid, { body: "รหัสปลอม", files: [{ id: "clnotarealfileidxxxxxxxxx" }] });
    const mix = await reply(cid, { body: "เกินรวม", files: [{ id: pdfId }, { id: csvId }], attachments: Array.from({ length: 4 }, () => ({ name: "a.jpg", url: "https://cdn.qc.invalid/a.jpg", kind: "image" })) });
    const legacy = await reply(cid, { body: "แบบเดิม", attachments: [{ name: "a.jpg", url: "https://cdn.qc.invalid/a.jpg", kind: "image" }] });
    const created = await rCases.POST!(J("secretary/support/cases", "POST", { subject: "เปิดพร้อมไฟล์", body: "เปิดพร้อมไฟล์", files: [{ id: csvId, name: "stock.csv" }] }, HS));
    const cj = await jsonOf(created);
    const firstMsg = cj.id ? await prisma.supportMessage.findFirst({ where: { caseId: String(cj.id) } }) : null;
    const d3 = await detail(cid, HS);
    const legacyAtt = (((d3.json.messages ?? []) as AnyMod[]).find((m) => m.body === "แบบเดิม")?.attachments ?? []) as AnyMod[];
    chk("A-5", "เพดาน: 6 ไฟล์ ⇒ 400 · รหัสที่ไม่ใช่ไฟล์ของร้าน ⇒ 400 · ไฟล์+แนบเดิมรวมเกิน 5 ⇒ 400 · แนบแบบเดิม (url) ยังรับ (private false) · เปิดเคสพร้อม files ⇒ ข้อความแรกมี fileId", six.status === 400 && fake.status === 400 && mix.status === 400 && legacy.status === 200 && legacyAtt[0]?.private === false && legacyAtt[0]?.url === "https://cdn.qc.invalid/a.jpg" && created.status === 200 && JSON.stringify(firstMsg?.attachmentsJson ?? []).includes(csvId), JSON.stringify({ six: six.status, fake: fake.status, mix: mix.status, legacy: legacy.status, created: created.status, legacyAtt }).slice(0, 260));
  }
} catch (e) {
  chk("X-0", "ไม่มี exception", false, errMsg(e));
  console.error(e);
} finally {
  await cleanup();
}
await prisma.$disconnect();
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · แดง ${failed.length} · ข้าม ${skipped.length}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id) }));
process.exit(failed.some((c) => c.sev === "CRITICAL") ? 1 : 0);
