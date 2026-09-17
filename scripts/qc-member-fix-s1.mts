// QC — Member v2 audit-fix S1 (ความปลอดภัย · การเข้าถึง) — ข้อสอบของ "หลังแก้" ตาม ledger/member-briefs/member-fix-s1.md
// Fable oracle · Builder ห้ามแตะ · findings: H1 H3 L10 H2 H4 M3 L1 L5 L7 M4 M6(ครึ่งระงับบัญชี) M15 L4 L9
// requires: member-seed  ·  รัน: bash scripts/iso.sh pnpm exec tsx scripts/qc-member-fix-s1.mts
//
// 🔴 ทุกข้อเช็กยืนยัน "พฤติกรรมหลังแก้" ⇒ บนโค้ดวันนี้ต้องแดง (ยกเว้นข้อที่ทำเครื่องหมาย [guard] = กันแก้เกิน)
// 🔴 ข้อมูล QC ต้องเหมือนเดิมหลังรัน: สมาชิกที่สร้างเองลบทิ้ง · ค่าที่แก้ (showInList · staffPin · env) คืนค่า
//    · แถว ChatRateBucket/CustomerOtp/AuditLog/MemberAccessLog ที่เกิดจากข้อสอบนี้ลบทิ้งใน finally
// 🔴 เครือข่ายภายนอกถูกครอบไว้ทั้งสคริปต์ (api.line.me / api.resend.com → ตัวปลอมในหน่วยความจำ) — ไม่มีคำขอออกเน็ตจริง
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
process.env.QC_OTP_PREVIEW = "1";
// 🔴 L1 วัด "เวลา" ของการขอรหัสทางอีเมล ⇒ ต้องอยู่ในสภาพเดียวกับ prod คือ **ต่อผู้ให้บริการอีเมลแล้ว**
//    (.env.qc ไม่มีคีย์ ⇒ sendEmail พิมพ์ลง console แล้วคืนทันที วัดอะไรไม่ได้)
//    ตั้งคีย์ปลอมก่อน import แอป (env.ts อ่าน process.env ตอน import) · คำขอจริงถูกครอบด้วยตัวปลอมข้างล่าง
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_fix_s1_stub";
import { existsSync, readFileSync } from "node:fs";
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as {
  MQC: Any;
  resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string; systems: Record<string, string> } | null>;
};
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>): Promise<Error | null> => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e as Error;
  }
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rnd = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
const P = prisma as Any;
const t0 = new Date();

// ───────────────── ครอบเครือข่ายภายนอก (ห้ามยิงออกเน็ตจริงจากข้อสอบ) ─────────────────
const realFetch = globalThis.fetch;
let lineVerify: { status: number; body: Any } = { status: 200, body: {} };
let emailDelayMs = 0;
const hits = { line: 0, email: 0, other: [] as string[] };
globalThis.fetch = (async (input: Any, init?: Any) => {
  const url = typeof input === "string" ? input : (input?.url ?? String(input));
  if (/^https?:\/\//i.test(url) && !/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/i.test(url)) {
    if (/api\.line\.me/i.test(url)) {
      hits.line++;
      return new Response(JSON.stringify(lineVerify.body), { status: lineVerify.status, headers: { "content-type": "application/json" } });
    }
    if (/api\.resend\.com/i.test(url)) {
      hits.email++;
      if (emailDelayMs > 0) await sleep(emailDelayMs);
      return new Response(JSON.stringify({ id: "fix-s1-stub" }), { status: 200, headers: { "content-type": "application/json" } });
    }
    hits.other.push(url);
    return new Response(JSON.stringify({ stub: "fix-s1" }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
}) as Any;

let tid = "";
let SYS = "";
const tag = Date.now().toString(36);
const MARK = `fix-s1-${tag}`;
const made = { customers: [] as string[], cards: [] as string[] };
const rlNew = new Set<string>();
const restore: (() => Promise<unknown>)[] = [];
let resetOtpLimit: (() => Promise<unknown>) | null = null;
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed ชุดข้อมูลสมาชิก (scripts/member-seed)");
  tid = scope.tenantId;
  SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const slug: string = mq.MQC.tenantSlug;
  const ctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const sctx = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };

  // โมดูลที่ข้อสอบเรียก (dynamic import — ของที่ยังไม่มีให้ตกเป็นข้อเช็กแดง ไม่ใช่สคริปต์ล้ม)
  const TOOLS = (await import("@/lib/modules/member/api/tools" as string)) as Any;
  const REG = (await import("@/lib/modules/member/api/registry" as string)) as Any;
  const OA = (await import("@/lib/modules/member/api/openapi" as string)) as Any;
  const ACC = (await import("@/lib/modules/member/access" as string)) as Any;
  const CS = (await import("@/lib/modules/member/customer-session" as string)) as Any;
  const LIST = (await import("@/lib/modules/member/list" as string)) as Any;
  const PROF = (await import("@/lib/modules/member/profile" as string)) as Any;
  const FLD = (await import("@/lib/modules/member/fields" as string)) as Any;
  const ME = (await import("@/lib/modules/member/me" as string)) as Any;
  const SAPP = (await import("@/lib/modules/member/staff-app" as string)) as Any;
  const STAMP = (await import("@/lib/modules/stamp" as string)) as Any;
  const HASH = (await import("@/lib/core/hash" as string)) as Any;
  const RUN = (await import("@/lib/api/run" as string)) as Any;
  const MACTOR = (await import("@/lib/modules/member/api/actor" as string)) as Any;
  const SCOPES = (await import("@/lib/api-keys/scopes" as string)) as Any;
  resetOtpLimit = typeof CS.__resetCustomerOtpLimit === "function" ? (CS.__resetCustomerOtpLimit as () => Promise<unknown>) : null;

  const actorOf = async (userId: string) => {
    const m = await P.membership.findFirst({ where: { tenantId: tid, userId } });
    if (!m) throw new Error(`ไม่พบ Membership ของ ${userId}`);
    return { userId, role: m.role as string, unitAccess: (m.unitAccess ?? []) as string[], permissions: (m.permissions ?? {}) as Record<string, unknown> };
  };
  const owner = await actorOf(E.users.owner.userId);
  const thana = await actorOf(E.users.staff.thana.userId);
  const kata = await actorOf(E.users.staff.kata.userId);
  const toolCtx = (a: Any) => ({ tenantId: tid, systemId: SYS, userId: a.userId, role: a.role, unitAccess: a.unitAccess, permissions: a.permissions });

  // ถัง rate limit บน DB (ChatRateBucket) — จำคีย์ที่ข้อสอบนี้ทำให้เกิด แล้วลบคืนใน finally
  const rlKeys = async (): Promise<Set<string>> =>
    new Set(((await P.chatRateBucket.findMany({ select: { key: true } })) as Any[]).map((r) => String(r.key)));
  const rlSince = async (before: Set<string>): Promise<string[]> => {
    const after = await rlKeys();
    const fresh = [...after].filter((k) => !before.has(k));
    for (const k of fresh) rlNew.add(k);
    return fresh;
  };
  const isRateErr = (e: Error | null): boolean =>
    !!e && (e.name === "CustomerRateLimitError" || (e as Any).code === "RATE_LIMITED" || (e as Any).status === 429);

  // ═══════════════════════════ H1 — tool ตระกูลสมาชิกกับคีย์ที่ไม่มี member scope ═══════════════════════════
  const legacyTools: string[] = [...(TOOLS.LEGACY_MEMBER_TOOLS ?? [])];
  const regTools: string[] = (TOOLS.memberToolOps() as Any[]).map((o) => o.tool?.name).filter((x: Any): x is string => typeof x === "string");
  const otherScopes = ["account.doc.read", "kanban.card.update"];
  const allowLegacyOther = legacyTools.filter((n) => TOOLS.memberToolAllowedForScopes(n, otherScopes));
  const allowRegOther = regTools.filter((n) => TOOLS.memberToolAllowedForScopes(n, otherScopes));
  const allowLegacyNone = legacyTools.filter((n) => TOOLS.memberToolAllowedForScopes(n, []));
  const allowRegNone = regTools.filter((n) => TOOLS.memberToolAllowedForScopes(n, []));
  const outsiderStillOk = TOOLS.memberToolAllowedForScopes("kanban_card_create", otherScopes) === true;
  chk(
    "S1-H1.1",
    `memberToolAllowedForScopes: คีย์ที่ไม่มี scope member.* (เช่น ${otherScopes.join(", ")}) และคีย์ที่ไม่มี scope เลย ต้องถูกปฏิเสธ tool ตระกูลสมาชิกทุกตัว — รวม 8 ตัวรุ่นเก่า (${legacyTools.slice(0, 3).join(", ")}…) และ ${regTools.length} ตัวในทะเบียน · tool ของสกิลอื่นไม่ถูกกระทบ`,
    legacyTools.length >= 8 && regTools.length >= 38 && allowLegacyOther.length === 0 && allowRegOther.length === 0 && allowLegacyNone.length === 0 && allowRegNone.length === 0 && outsiderStillOk,
    "ปฏิเสธทั้งหมด",
    `legacy(other)=${allowLegacyOther.join(",") || "-"} reg(other)=${allowRegOther.slice(0, 4).join(",") || "-"} legacy(none)=${allowLegacyNone.join(",") || "-"} reg(none)=${allowRegNone.slice(0, 4).join(",") || "-"} outsider=${outsiderStillOk}`,
  );
  const admScopes: string[] = SCOPES.expandBundles(["member-admin"]);
  const rdScopes: string[] = SCOPES.expandBundles(["member-read"]);
  chk(
    "S1-H1.2",
    "[guard] คีย์ที่ **มี** scope ของระบบสมาชิก พฤติกรรมเดิมทุกประการ: member-admin เรียก member_search/member_set_tags ได้ · member-read เรียก member_search ได้แต่ member_set_tags ไม่ได้ · ทั้งคู่ยังถูกปฏิเสธ tool รุ่นเก่า 8 ตัว (M3.10)",
    TOOLS.memberToolAllowedForScopes("member_search", admScopes) === true &&
      TOOLS.memberToolAllowedForScopes("member_set_tags", admScopes) === true &&
      TOOLS.memberToolAllowedForScopes("member_search", rdScopes) === true &&
      TOOLS.memberToolAllowedForScopes("member_set_tags", rdScopes) === false &&
      legacyTools.every((n) => TOOLS.memberToolAllowedForScopes(n, admScopes) === false),
    "เหมือนเดิม",
    `adm search=${TOOLS.memberToolAllowedForScopes("member_search", admScopes)} adm tags=${TOOLS.memberToolAllowedForScopes("member_set_tags", admScopes)} rd tags=${TOOLS.memberToolAllowedForScopes("member_set_tags", rdScopes)} adm legacy=${legacyTools.filter((n) => TOOLS.memberToolAllowedForScopes(n, admScopes)).join(",") || "-"}`,
  );

  // ═══════════════════════════ H3 — ผู้ช่วย AI ใช้สิทธิ์จริงของคนเปิดหน้า ═══════════════════════════
  const Q = "0810000";
  const ownerList = await LIST.listMembers(ctx, owner, { q: Q, take: 1 });
  const kataList = await LIST.listMembers(ctx, kata, { q: Q, take: 1 });
  const tOwnerSearch = await TOOLS.runMemberTool(toolCtx(owner), "member_search", { q: Q, take: 5 });
  const tKataSearch = await TOOLS.runMemberTool(toolCtx(kata), "member_search", { q: Q, take: 5 });
  const tThanaReport = await TOOLS.runMemberTool(toolCtx(thana), "report_overview", {});
  const tOwnerReport = await TOOLS.runMemberTool(toolCtx(owner), "report_overview", {});
  const thanaHasReport = ACC.hasMemberPerm(thana, "member.report.view") === true;
  chk(
    "S1-H3.1",
    "ผู้ช่วย AI: พนักงาน (thana — ไม่มี member.report.view · ตรวจแล้วว่าไม่มีจริง) เรียก tool report_overview ผ่านผู้ช่วย ⇒ ถูกปฏิเสธ (mode error ภาษาไทย) ไม่ใช่ได้รายงานทั้งร้าน",
    thanaHasReport === false && tThanaReport?.mode === "error" && /[ก-๙]/.test(String(tThanaReport?.error ?? "")),
    "error (ไม่มีสิทธิ์)",
    `thanaHasReportPerm=${thanaHasReport} mode=${tThanaReport?.mode} ${JSON.stringify(tThanaReport).slice(0, 160)}`,
  );
  chk(
    "S1-H3.2",
    `ผู้ช่วย AI ใช้ unitAccess ของคนเปิดหน้า: พนักงานสาขากะตะค้น "${Q}" ผ่าน member_search ได้ total = ${kataList?.total} (เท่าที่ listMembers ให้เขาเห็น) ไม่ใช่ ${ownerList?.total} ของทั้งร้าน`,
    typeof kataList?.total === "number" && kataList.total < ownerList.total && tKataSearch?.mode === "read" && Number((tKataSearch?.result as Any)?.total) === kataList.total,
    `total=${kataList?.total}`,
    `owner=${ownerList?.total} kata=${kataList?.total} tool=${tKataSearch?.mode}/${JSON.stringify((tKataSearch?.result as Any)?.total ?? tKataSearch?.error).slice(0, 120)}`,
  );
  chk(
    "S1-H3.3",
    "[guard] เจ้าของร้านเหมือนเดิม: report_overview ผ่านผู้ช่วยได้ผล · member_search เห็นทั้งร้าน (total เท่ากับ listMembers ของเจ้าของ)",
    tOwnerReport?.mode === "read" && tOwnerSearch?.mode === "read" && Number((tOwnerSearch?.result as Any)?.total) === ownerList.total,
    "อ่านได้ครบ",
    `report=${tOwnerReport?.mode} search=${tOwnerSearch?.mode}/${JSON.stringify((tOwnerSearch?.result as Any)?.total ?? tOwnerSearch?.error).slice(0, 120)}`,
  );

  // ═══════════════════════════ L10 — ยกเลิกข้อเสนอของผู้ช่วย (static) ═══════════════════════════
  const asrcPath = "src/lib/modules/member/assistant-actions.ts";
  const asrc = read(asrcPath);
  const asrcAll = asrc + read("src/lib/modules/member/assistant.ts") + read("src/lib/modules/member/assistant-guard.ts") + read("src/lib/modules/member/assistant-shared.ts");
  const cancelIdx = asrc.indexOf("export async function cancelMemberProposalAction");
  const afterCancel = cancelIdx >= 0 ? asrc.indexOf("\nexport ", cancelIdx + 10) : -1;
  const cancelBody = cancelIdx >= 0 ? asrc.slice(cancelIdx, afterCancel > 0 ? afterCancel : asrc.length) : "";
  // ตัดชื่อที่มีอยู่แล้ววันนี้ทิ้งก่อน (cancelMemberProposalAction · rejectProposal · proposalId) แล้วดูว่า
  // ยังเหลือ "ด่าน" อะไรในเส้นทางยกเลิกไหม — วันนี้เหลือแค่ gate()+rejectProposal จึงไม่มีอะไรเหลือ
  const cancelCore = cancelBody.replace(/cancelMemberProposalAction|rejectProposal|proposalId|MemberProposal/g, "");
  const cancelGuarded = /(proposal|conversation\s*[.:]|assert|guard|ensure|perm|access|สิทธิ)/i.test(cancelCore);
  chk(
    "S1-L10.1",
    "[static] cancelMemberProposalAction: ก่อนเรียก rejectProposal ต้องมีด่าน — อ่านข้อเสนอ/บทสนทนาแล้วเทียบว่าเป็นของระบบสมาชิกนี้ + ร้านนี้ และตรวจสิทธิ์แบบเดียวกับตอนยืนยัน (หรือเป็นเจ้าของบทสนทนา) · โมดูลต้องมีการค้น aiProposal/aiConversation ที่ผูก conversationId + systemId",
    cancelBody.length > 0 && cancelGuarded && /aiProposal/.test(asrcAll) && /conversationId/.test(asrcAll) && /systemId/.test(asrcAll),
    "มีด่านตรวจเจ้าของ+สิทธิ์ในเส้นทางยกเลิก",
    `guarded=${cancelGuarded} body=${cancelBody.replace(/\s+/g, " ").slice(0, 220)}`,
  );

  // ═══════════════════════════ H2 — ส่งออก/คอลัมน์รายการกับฟิลด์อ่อนไหว ═══════════════════════════
  const sensFields: Any[] = await P.memberField.findMany({ where: { tenantId: tid, systemId: SYS, sensitive: true, archivedAt: null } });
  let sens: { field: Any; customerId: string; memberCode: string; value: string } | null = null;
  for (const f of sensFields) {
    const rows: Any[] = await P.memberFieldValue.findMany({ where: { tenantId: tid, fieldId: f.id }, take: 20 });
    for (const r of rows) {
      const cust = await P.customer.findFirst({ where: { id: r.customerId, tenantId: tid, memberSystemId: SYS, homeUnitId: E.units.patong }, select: { id: true, memberCode: true } });
      if (!cust) continue;
      const bag = await FLD.getFieldValues({ tenantId: tid, systemId: SYS, actorUserId: null }, [cust.id]);
      const v = bag?.[cust.id]?.[f.key];
      if (typeof v === "string" && v.trim().length >= 3) {
        sens = { field: f, customerId: cust.id, memberCode: cust.memberCode ?? "", value: v.trim() };
        break;
      }
    }
    if (sens) break;
  }
  const exporter = { userId: thana.userId, role: "STAFF", unitAccess: thana.unitAccess, permissions: { "member.customer.read": true, "member.customer.export": true } };
  if (!sens) {
    chk("S1-H2.0", "เตรียมข้อมูล: ต้องมีฟิลด์ sensitive ที่มีค่าเป็นข้อความของสมาชิกสาขาป่าตอง (ชุด seed: ส่วนสุขภาพ index ≤ 12)", false, "เจอฟิลด์", `sensitiveFields=${sensFields.length}`);
  } else {
    const S = sens;
    const key = S.field.key as string;
    const logsBefore = await P.memberAccessLog.count({ where: { tenantId: tid, customerId: S.customerId } });
    const csvStaff = await LIST.exportMembers(ctx, exporter, { filters: { q: S.memberCode }, columns: ["memberCode", key] });
    const csvOwner = await LIST.exportMembers(ctx, owner, { filters: { q: S.memberCode }, columns: ["memberCode", key] });
    const logsAfter = await P.memberAccessLog.count({ where: { tenantId: tid, customerId: S.customerId } });
    chk(
      "S1-H2.1",
      `exportMembers: พนักงาน (STAFF มี member.customer.export แต่ไม่ผ่านนโยบายข้อมูลอ่อนไหว D8) ขอคอลัมน์ "${key}" ⇒ แถวยังออก (มีรหัสสมาชิก) แต่ **ไม่มีค่าอ่อนไหว** ในไฟล์ (ตัดคอลัมน์ทิ้งหรือปล่อยช่องว่าง)`,
      typeof csvStaff?.csv === "string" && csvStaff.csv.includes(S.memberCode) && !csvStaff.csv.includes(S.value),
      "ไม่มีค่าอ่อนไหว",
      `hasCode=${csvStaff?.csv?.includes(S.memberCode)} hasValue=${csvStaff?.csv?.includes(S.value)} csv=${String(csvStaff?.csv ?? "").replace(/\s+/g, " ").slice(0, 160)}`,
    );
    chk(
      "S1-H2.2",
      `exportMembers: เจ้าของร้าน (ผ่านนโยบาย) ได้ค่าอ่อนไหวจริง **และ** ทุกครั้งที่ส่งออกฟิลด์อ่อนไหวต้องลง MemberAccessLog (logAccess) ของสมาชิกคนนั้น`,
      typeof csvOwner?.csv === "string" && csvOwner.csv.includes(S.value) && logsAfter > logsBefore,
      "ได้ค่า + มีบันทึกการดู",
      `ownerHasValue=${csvOwner?.csv?.includes(S.value)} accessLog ${logsBefore}→${logsAfter}`,
    );
    const csvUnknown = await LIST.exportMembers(ctx, owner, { filters: { q: S.memberCode }, columns: ["memberCode", `zz-${MARK}-unknown`] });
    const head = String(csvUnknown?.csv ?? "").split("\r\n")[0] ?? "";
    chk(
      "S1-H2.3",
      "exportMembers: คอลัมน์ที่ไม่รู้จัก (ค่าที่ client ส่งมาเอง) ถูกมองข้าม — ห้ามสะท้อนสตริงดิบกลับไปในหัวตาราง",
      !head.includes(`zz-${MARK}-unknown`),
      "ไม่สะท้อนกลับ",
      `header=${head.slice(0, 160)}`,
    );
    const showBefore = S.field.showInList;
    await P.memberField.update({ where: { id: S.field.id }, data: { showInList: true } });
    restore.push(() => P.memberField.update({ where: { id: S.field.id }, data: { showInList: showBefore } }));
    const listStaff = await LIST.listMembers(ctx, exporter, { q: S.memberCode, take: 5 });
    const listOwner = await LIST.listMembers(ctx, owner, { q: S.memberCode, take: 5 });
    const rowStaff = (listStaff?.items ?? []).find((r: Any) => r.id === S.customerId);
    const rowOwner = (listOwner?.items ?? []).find((r: Any) => r.id === S.customerId);
    chk(
      "S1-H2.4",
      `คอลัมน์ของหน้ารวม (listFields): ฟิลด์อ่อนไหวที่เปิด showInList ต้องหายไปสำหรับคนที่ไม่ผ่านนโยบาย (STAFF) แต่ยังแสดงให้เจ้าของร้าน`,
      !!rowStaff && !!rowOwner && (rowStaff.listFields?.[key] ?? null) === null && typeof rowOwner.listFields?.[key] === "string",
      "STAFF ไม่เห็น · owner เห็น",
      `staff=${JSON.stringify(rowStaff?.listFields ?? null)} owner=${JSON.stringify(rowOwner?.listFields ?? null)}`,
    );
  }

  // ═══════════════════════════ H4 — เพดาน OTP ของลูกค้าอยู่บน DB ═══════════════════════════
  const otpPhone = `0899${rnd()}`;
  const otpIp = `10.99.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  const kb1 = await rlKeys();
  const first = await fails(() => CS.requestOtp(slug, { phone: otpPhone }, { ip: otpIp }));
  const fresh1 = await rlSince(kb1);
  await fails(() => CS.requestOtp(slug, { phone: otpPhone }, { ip: otpIp }));
  await fails(() => CS.requestOtp(slug, { phone: otpPhone }, { ip: otpIp }));
  const fourth = await fails(() => CS.requestOtp(slug, { phone: otpPhone }, { ip: otpIp }));
  await rlSince(kb1);
  chk(
    "S1-H4.1",
    "ขอรหัส OTP: ถังต่อเบอร์ (3 ครั้ง/10 นาที) และต่อ IP (10 ครั้ง/10 นาที) ย้ายไปนับบน DB (checkRateLimitDb ⇒ มีแถวถังเกิดใหม่ ≥ 2 คีย์ตอนขอครั้งแรก) · ครั้งที่ 4 ของเบอร์เดิม ⇒ CustomerRateLimitError",
    first === null && fresh1.length >= 2 && isRateErr(fourth),
    "มีถังใน DB + ครั้งที่ 4 ถูกปฏิเสธ",
    `first=${first?.message ?? "ok"} newKeys=${JSON.stringify(fresh1).slice(0, 200)} fourth=${fourth?.name ?? "ok"}`,
  );
  // ถังนับ "กรอกรหัสผิด" ต่อเบอร์/ต่อ IP ตอนยืนยัน
  const wrongTarget = `0899${rnd()}`;
  const wrongIp = `10.98.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  const otpIds: string[] = [];
  for (let i = 0; i < 14; i++) {
    const id = HASH.randomToken(18) as string;
    otpIds.push(id);
    await P.customerOtp.create({
      data: {
        id,
        tenantId: tid,
        target: wrongTarget,
        channel: "PHONE",
        codeHash: HASH.sha256(`${id}:135790`),
        expiresAt: new Date(Date.now() + 5 * 60_000),
        customerId: null,
        ip: wrongIp,
      },
    });
  }
  const kb2 = await rlKeys();
  const verifyErrs: (Error | null)[] = [];
  for (const id of otpIds) verifyErrs.push(await fails(() => CS.verifyOtp({ otpId: id, code: "000000" }, { ip: wrongIp })));
  const fresh2 = await rlSince(kb2);
  chk(
    "S1-H4.2",
    "ยืนยันรหัสผิด: มีถังบน DB นับ 'กรอกผิด' ต่อเบอร์และต่อ IP (เช่น 10 ครั้ง/15 นาที) — ยิงผิดติดกัน 14 ครั้งด้วย IP เดียว ต้องโดนปฏิเสธด้วยข้อผิดพลาดแบบเพดาน (429) ไม่ใช่ 'รหัสไม่ถูกต้อง' ไปเรื่อย ๆ",
    verifyErrs[0] !== null && verifyErrs.some((e) => isRateErr(e)) && fresh2.length >= 1,
    "โดนเพดานภายใน 14 ครั้ง + ถังอยู่ใน DB",
    `first=${verifyErrs[0]?.name} rateHit=${verifyErrs.findIndex((e) => isRateErr(e))} newKeys=${JSON.stringify(fresh2).slice(0, 200)}`,
  );
  const joinEmail = `${MARK}-join@example.com`;
  const joinIp = `10.97.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  const kb3 = await rlKeys();
  const jFirst = await fails(() => CS.requestOtp(slug, { email: joinEmail }, { ip: joinIp, forJoin: true }));
  const fresh3 = await rlSince(kb3);
  await fails(() => CS.requestOtp(slug, { email: joinEmail }, { ip: joinIp, forJoin: true }));
  await fails(() => CS.requestOtp(slug, { email: joinEmail }, { ip: joinIp, forJoin: true }));
  const jFourth = await fails(() => CS.requestOtp(slug, { email: joinEmail }, { ip: joinIp, forJoin: true }));
  await rlSince(kb3);
  chk(
    "S1-H4.3",
    "เลนสมัครสมาชิก (forJoin) ขอ OTP ทางอีเมล ⇒ ใช้เพดานบน DB ชุดเดียวกัน (มีถังเกิดใหม่ ≥ 2 คีย์ · ครั้งที่ 4 ของอีเมลเดิมถูกปฏิเสธ)",
    jFirst === null && fresh3.length >= 2 && isRateErr(jFourth),
    "ถัง DB + ปฏิเสธครั้งที่ 4",
    `first=${jFirst?.message ?? "ok"} newKeys=${JSON.stringify(fresh3).slice(0, 200)} fourth=${jFourth?.name ?? "ok"}`,
  );

  // ═══════════════════════════ M3 — otpPreviewOn() ต้องเช็ค production ก่อน ═══════════════════════════
  const env0 = { node: process.env.NODE_ENV, app: process.env.APP_ENV, qc: process.env.QC_OTP_PREVIEW };
  const previewOn = async (): Promise<{ on: boolean; err: string | null }> => {
    try {
      const r = await CS.requestOtp(slug, { phone: `0899${rnd()}` }, {});
      return { on: typeof r?.devOtp === "string" && r.devOtp.length > 0, err: null };
    } catch (e) {
      return { on: false, err: (e as Error).message };
    }
  };
  const kb4 = await rlKeys();
  // NODE_ENV เป็น readonly ในชนิดของ Node — เขียนผ่านมุมมอง record (ค่าจริงอ่านตอนเรียกฟังก์ชัน)
  const PENV = process.env as unknown as Record<string, string | undefined>;
  PENV.QC_OTP_PREVIEW = "1";
  PENV.NODE_ENV = "production";
  PENV.APP_ENV = "production";
  const prodPrev = await previewOn();
  PENV.APP_ENV = "development";
  const qcPrev = await previewOn();
  if (env0.node === undefined) delete PENV.NODE_ENV;
  else PENV.NODE_ENV = env0.node;
  PENV.APP_ENV = env0.app ?? "development";
  PENV.QC_OTP_PREVIEW = env0.qc ?? "1";
  await rlSince(kb4);
  chk(
    "S1-M3.1",
    "otpPreviewOn(): NODE_ENV=production **และ** APP_ENV=production (prod จริง) ⇒ ไม่คืนรหัสบนจอเด็ดขาด แม้ QC_OTP_PREVIEW=1 จะหลุดไปด้วย (ต้องเช็กเป็นเงื่อนไขแรก)",
    prodPrev.err === null && prodPrev.on === false,
    "ไม่มี devOtp",
    `devOtp=${prodPrev.on} err=${prodPrev.err ?? "-"}`,
  );
  chk(
    "S1-M3.2",
    "[guard] เซิร์ฟเวอร์ QC (next start ⇒ NODE_ENV=production · APP_ENV=development · QC_OTP_PREVIEW=1) ต้องยังเห็นรหัสบนจอเหมือนเดิม",
    qcPrev.err === null && qcPrev.on === true,
    "มี devOtp",
    `devOtp=${qcPrev.on} err=${qcPrev.err ?? "-"}`,
  );

  // ═══════════════════════════ L1 — ส่งอีเมล OTP นอกเส้นทางคำขอ (ไม่รั่วเวลา) ═══════════════════════════
  const memberWithEmail = (E.members as Any[]).find((m) => typeof m.email === "string" && m.email);
  const kb5 = await rlKeys();
  hits.email = 0;
  emailDelayMs = 1200;
  const tKnown0 = Date.now();
  const eKnown = await fails(() => CS.requestOtp(slug, { email: memberWithEmail?.email }, {}));
  const dtKnown = Date.now() - tKnown0;
  const tUnknown0 = Date.now();
  await fails(() => CS.requestOtp(slug, { email: `${MARK}-nobody@example.com` }, {}));
  const dtUnknown = Date.now() - tUnknown0;
  await sleep(1600);
  emailDelayMs = 0;
  await rlSince(kb5);
  chk(
    "S1-L1.1",
    `หน้าเข้าสู่ระบบไม่รั่วว่าใครเป็นสมาชิกผ่าน "เวลา": ผู้ให้บริการอีเมลถูกทำให้ช้า 1200ms — requestOtp ของอีเมลที่เป็นสมาชิกต้องคืนค่าภายใน 600ms (ส่งเมลนอกเส้นทางคำขอ) และห่างจากอีเมลคนแปลกหน้าไม่เกิน 400ms · เมลยังถูกส่งจริง`,
    eKnown === null && hits.email >= 1 && dtKnown < 600 && Math.abs(dtKnown - dtUnknown) < 400,
    "< 600ms และเวลาเท่ากันสองทาง",
    `known=${dtKnown}ms unknown=${dtUnknown}ms emailCalls=${hits.email} err=${eKnown?.message ?? "-"}`,
  );

  // ═══════════════════════════ L5 — cookie ลูกค้า Secure ตามโปรโตคอล/สภาพแวดล้อม (static) ═══════════════════════════
  const cookieSrcs: Record<string, string> = {
    "customer-session.ts": read("src/lib/modules/member/customer-session.ts"),
    "me-actions.ts": read("src/lib/modules/member/me-actions.ts"),
    "join-actions.ts": read("src/lib/modules/member/join-actions.ts"),
    "auth/line/route.ts": read("src/app/m/[slug]/auth/line/route.ts"),
    "customer-cookie.ts": read("src/lib/modules/member/customer-cookie.ts"),
  };
  const byName = Object.entries(cookieSrcs).filter(([, s]) => /secure\s*:\s*[^,\n]*startsWith\s*\(\s*["']__Host-/.test(s)).map(([n]) => n);
  const allCookieSrc = Object.values(cookieSrcs).join("\n");
  chk(
    "S1-L5.1",
    "[static] cookie ของลูกค้า: ค่า secure ต้องมาจาก 'คำขอเป็น https / APP_ENV production' ไม่ใช่จากชื่อ cookie (`…startsWith(\"__Host-\")`) — ที่ทุกจุดที่ตั้ง cookie (me-actions · join-actions · /m/<slug>/auth/line)",
    byName.length === 0 && /(x-forwarded-proto|https|APP_ENV|secureCookies|isSecureRequest|production)/i.test(allCookieSrc) && /secure/i.test(allCookieSrc),
    "secure ผูกกับ https/APP_ENV",
    `ผูกกับชื่อ cookie ที่: ${byName.join(", ") || "-"}`,
  );

  // ═══════════════════════════ L7 — /m/<slug>/auth/line มีเพดานบน DB ═══════════════════════════
  const lineEnv0 = process.env.LINE_CHANNEL_ID;
  process.env.LINE_CHANNEL_ID = lineEnv0 && lineEnv0.length > 0 ? lineEnv0 : `fix-s1-channel`;
  lineVerify = { status: 200, body: { sub: `U-${MARK}-noone`, name: "fix-s1", aud: process.env.LINE_CHANNEL_ID } };
  const lineIp = `10.96.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`;
  const kb6 = await rlKeys();
  let lineRoute: Any = null;
  const lineImportErr = await fails(async () => {
    lineRoute = await import("@/app/m/[slug]/auth/line/route" as string);
  });
  const lineStatuses: number[] = [];
  const lineBodies: string[] = [];
  if (lineRoute?.POST) {
    for (let i = 0; i < 35; i++) {
      try {
        const req = new Request("http://127.0.0.1/m/x/auth/line", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": lineIp, "user-agent": "fix-s1" },
          body: JSON.stringify({ idToken: `fix-s1-${i}` }),
        });
        const res: Response = await lineRoute.POST(req, { params: Promise.resolve({ slug }) });
        lineStatuses.push(res.status);
        if (res.status !== 200) lineBodies.push((await res.text()).slice(0, 120));
      } catch (e) {
        lineStatuses.push(-1);
        lineBodies.push(String((e as Error).message).slice(0, 120));
      }
    }
  }
  const fresh6 = await rlSince(kb6);
  process.env.LINE_CHANNEL_ID = lineEnv0;
  const lineLimited = lineStatuses.includes(429) || lineBodies.some((b) => /บ่อย|ถี่|รออีก/.test(b));
  chk(
    "S1-L7.1",
    "/m/<slug>/auth/line: มีด่านเพดานบน DB ชุดเดียวกับ join-actions.gate() และต้องนับ **ทุกคำขอ** (วางด่านก่อนทำงานอื่น) — ยิง 35 ครั้งจาก IP เดียวต้องโดน 429 อย่างน้อยหนึ่งครั้ง + มีถังใน DB",
    lineImportErr === null && lineStatuses.length === 35 && lineLimited && fresh6.length >= 1,
    "มี 429 + ถังใน DB",
    `import=${lineImportErr?.message ?? "ok"} statuses=${[...new Set(lineStatuses)].join(",")} newKeys=${JSON.stringify(fresh6).slice(0, 160)} body=${lineBodies[0] ?? "-"}`,
  );

  // ═══════════════════════════ M4 — PIN ของใบสแตมป์ ═══════════════════════════
  const PIN = "4931";
  // ใบสแตมป์ที่ตั้ง PIN: ใช้ใบเดิมถ้ามี (จำ ruleConfig ไว้คืน) · ไม่มีก็สร้างใบของข้อสอบแล้วลบทิ้งใน finally
  let card: Any = await P.stampCard.findFirst({ where: { tenantId: tid, systemId: SYS, active: true, tierDefIds: { equals: [] } } });
  if (card) {
    const cfg0 = card.ruleConfig;
    await P.stampCard.update({ where: { id: card.id }, data: { ruleConfig: { ...(cfg0 && typeof cfg0 === "object" ? cfg0 : {}), staffPin: PIN, allowStaffScan: true } } });
    restore.push(() => P.stampCard.update({ where: { id: card.id }, data: { ruleConfig: cfg0 ?? {} } }));
  } else {
    card = await STAMP.createCard(sctx, owner, {
      name: `ใบทดสอบ ${MARK}`,
      slots: 5,
      ruleKind: "MANUAL",
      ruleConfig: { staffPin: PIN, allowStaffScan: true, perDayMax: 20 },
      rewardKind: "POINTS",
      rewardConfig: { points: 10 },
      tierDefIds: [],
      unitIds: [],
    }).catch(() => null);
    if (card) made.cards.push(card.id);
  }
  const dtoList: Any[] = card ? await STAMP.listCards(sctx) : [];
  const dto = dtoList.find((c: Any) => c.id === card?.id) ?? null;
  const readKeyActor = MACTOR.memberApiKeyActor({ tenantId: tid, systemId: SYS, keyId: `fix-s1`, keyName: "fix-s1 read", scopes: rdScopes });
  const cardsListOp = (REG.MEMBER_OPS as Any[]).find((o) => o.id === "stamps.cards.list");
  let opJson = "";
  const opErr = await fails(async () => {
    const env = await RUN.runOpAsActor(cardsListOp, readKeyActor, { requestId: `fix-s1-${tag}` });
    opJson = JSON.stringify(env?.data ?? null);
  });
  chk(
    "S1-M4.1",
    "PIN ไม่ออกจากเซิร์ฟเวอร์: DTO ของใบสแตมป์ (stamp.listCards) และ op อ่านอย่างเดียว stamps.cards.list ต้องบอกแค่ pinRequired: boolean — ห้ามมีตัวเลข PIN จริงในผลลัพธ์",
    !!card && !!dto && dto.pinRequired === true && !JSON.stringify(dto).includes(PIN) && opErr === null && opJson.length > 0 && !opJson.includes(PIN),
    "pinRequired เท่านั้น",
    `card=${!!card} pinRequired=${dto?.pinRequired} dtoHasPin=${JSON.stringify(dto ?? {}).includes(PIN)} opErr=${opErr?.message ?? "ok"} opHasPin=${opJson.includes(PIN)}`,
  );
  // แอปพนักงานเดา PIN
  const meta = { userAgent: "fix-s1", ip: "127.0.0.1" };
  const myPhone = `0899${rnd()}`;
  const mine = await PROF.createMember(ctx, owner, {
    phone: myPhone,
    firstName: "ทดสอบตรวจแก้",
    lastName: MARK,
    source: "WALK_IN",
    homeUnitId: E.units.patong,
  });
  const cid: string = mine.customerId;
  made.customers.push(cid);
  await P.memberChannelIdentity.create({ data: { tenantId: tid, customerId: cid, channel: "LINE", externalId: `U-${MARK}`, linkedBy: "MANUAL" } }).catch(() => null);
  const kb7 = await rlKeys();
  const pinErrs: (Error | null)[] = [];
  for (let i = 0; i < 8; i++) {
    pinErrs.push(
      await fails(() =>
        SAPP.staffStamp(ctx, thana, { customerId: cid, cardId: card?.id ?? "-", pin: "0000", note: MARK, requestId: `fixs1pin${tag}${i}` }),
      ),
    );
  }
  const fresh7 = await rlSince(kb7);
  const pinLimited = pinErrs.slice(1).some((e) => !!e && e.message !== pinErrs[0]?.message && /(บ่อย|ถี่|รออีก|ชั่วคราว|เกินกำหนด|ลองใหม่อีกครั้งใน)/.test(e.message));
  chk(
    "S1-M4.2",
    "แอปพนักงาน: เดา PIN ของใบสแตมป์ได้ไม่เกิน 5 ครั้ง/15 นาที ต่อ (ผู้ใช้, ใบ) ด้วยถังบน DB — ยิงผิด 8 ครั้งต้องเจอข้อความแบบ 'ลองใหม่ภายหลัง' (คนละใบกับ 'PIN ไม่ถูกต้อง') + มีถังใน DB",
    !!card && !!pinErrs[0] && /PIN/i.test(pinErrs[0].message) && pinLimited && fresh7.length >= 1,
    "โดนเพดาน + ถังใน DB",
    `first=${pinErrs[0]?.message?.slice(0, 60)} last=${pinErrs[7]?.message?.slice(0, 60)} newKeys=${JSON.stringify(fresh7).slice(0, 160)}`,
  );
  const sappSrc = read("src/lib/modules/member/staff-app.ts") + read("src/lib/modules/member/staff-pin.ts") + read("src/lib/modules/stamp/service.ts");
  chk(
    "S1-M4.3",
    "[static] เทียบ PIN แบบ constant-time (crypto.timingSafeEqual) ไม่ใช่ `!==` ธรรมดา — ในเส้นทางประทับสแตมป์ของแอปพนักงาน",
    /timingSafeEqual/.test(sappSrc),
    "ใช้ timingSafeEqual",
    `staff-app+stamp มี timingSafeEqual = ${/timingSafeEqual/.test(sappSrc)}`,
  );
  let pinReadable = false;
  for (const n of ["getCard", "getCardFull", "getCardWithPin", "getCardForEdit", "cardPin", "getStaffPin", "revealStaffPin", "getCardSecret"]) {
    const f = (STAMP as Any)[n];
    if (typeof f !== "function" || !card) continue;
    try {
      const r = await f(sctx, card.id, owner);
      if (JSON.stringify(r ?? "").includes(PIN)) {
        pinReadable = true;
        break;
      }
    } catch {
      /* ฟังก์ชันนี้ไม่ใช่ทางอ่าน PIN — ลองตัวถัดไป */
    }
  }
  chk(
    "S1-M4.4",
    "[guard] คนที่มีสิทธิ์ member.loyalty.manage (หน้าตั้งค่าใบสแตมป์) ต้องยังอ่าน PIN จริงได้ผ่านโมดูล stamp (ห้ามลบความสามารถทิ้งเพื่อให้ข้อสอบเขียว)",
    pinReadable,
    "อ่าน PIN ได้ด้วยสิทธิ์จัดการ",
    `หาไม่เจอในชื่อที่รู้จัก (getCard/getCardFull/getCardWithPin/getCardForEdit/cardPin/getStaffPin/revealStaffPin/getCardSecret)`,
    "MAJOR",
  );

  // ═══════════════════════════ L4 — ความลับของ token บัตรสมาชิก ═══════════════════════════
  const cardOk = await fails(() => ME.meCard(ctx, CS.customerActor(cid), cid));
  const secret0 = process.env.SESSION_SECRET;
  delete (process.env as Any).SESSION_SECRET;
  const cardNoSecret = await fails(() => ME.meCard(ctx, CS.customerActor(cid), cid));
  if (secret0 !== undefined) process.env.SESSION_SECRET = secret0;
  chk(
    "S1-L4.1",
    "บัตรสมาชิก (me.ts): ไม่มีความลับสำรองฝังในโค้ด — ไม่มี SESSION_SECRET ⇒ โยนข้อผิดพลาดของเซิร์ฟเวอร์ที่บอกสาเหตุชัด (มี SESSION_SECRET แล้วออกบัตรได้ตามปกติ)",
    cardOk === null && cardNoSecret !== null && /SESSION_SECRET|ความลับ|ตั้งค่า/.test(cardNoSecret.message),
    "โยน error เมื่อไม่มีความลับ",
    `withSecret=${cardOk?.message ?? "ok"} withoutSecret=${cardNoSecret?.message ?? "ออกบัตรสำเร็จ (ใช้ค่าสำรองในโค้ด)"}`,
  );

  // ═══════════════════════════ M6 (ครึ่งระงับบัญชี) — ระงับแล้ว session ต้องตาย ═══════════════════════════
  const s1 = await CS.mintCustomerSession(cid, meta);
  const s2 = await CS.mintCustomerSession(cid, meta);
  await PROF.setStatus(ctx, owner, cid, "SUSPENDED", `${MARK} ตรวจการระงับบัญชี`);
  const sessRows: Any[] = await P.customerSession.findMany({ where: { tenantId: tid, customerId: cid } });
  const live = sessRows.filter((r) => !r.revokedAt);
  chk(
    "S1-M6.1",
    "ระงับบัญชีสมาชิก (setStatus SUSPENDED) ⇒ เพิกถอน CustomerSession ทุกใบของคนนั้นทันที (revokeAllCustomerSessions)",
    sessRows.length >= 2 && live.length === 0,
    "ทุกใบถูกเพิกถอน",
    `sessions=${sessRows.length} ยังใช้ได้=${live.length}`,
  );
  const afterSuspend = await CS.getCustomerSession(s1.token);
  const s3 = await CS.mintCustomerSession(cid, meta).catch(() => null);
  const freshSess = s3 ? await CS.getCustomerSession(s3.token) : null;
  const otpReq = await CS.requestOtp(slug, { phone: myPhone }, { ip: "10.95.1.1" }).catch(() => null);
  const otpLogin = otpReq?.devOtp ? await fails(() => CS.verifyOtp({ otpId: otpReq.otpId, code: otpReq.devOtp }, meta)) : new Error("ไม่ได้รหัสสำหรับทดสอบ");
  const lineLogin = await CS.loginWithLine(slug, { lineUserId: `U-${MARK}` }, meta).catch((e: Error) => ({ error: e.message }));
  chk(
    "S1-M6.2",
    "สมาชิกที่ถูกระงับเข้าระบบไม่ได้: getCustomerSession คืน null (แม้ใบที่เพิ่งออก) · ยืนยัน OTP ล้ม · เข้าด้วย LINE ได้ needsJoin (ไม่ออก session) — พิมพ์เขียว/บันทึก RUN ไม่ได้ระบุข้อยกเว้นให้คนถูกระงับล็อกอิน",
    afterSuspend === null && freshSess === null && otpLogin !== null && !!(lineLogin as Any)?.needsJoin,
    "ทุกทางปฏิเสธ",
    `old=${afterSuspend === null ? "null" : "ยังใช้ได้"} fresh=${freshSess === null ? "null" : "ยังใช้ได้"} otp=${(otpLogin as Error)?.message?.slice(0, 50) ?? "ออก session ได้"} line=${JSON.stringify(lineLogin).slice(0, 80)}`,
  );
  await PROF.setStatus(ctx, owner, cid, "ACTIVE", `${MARK} คืนสถานะ`).catch(() => null);

  // ═══════════════════════════ M15 — campaigns.send เป็นคำสั่งอันตราย ═══════════════════════════
  const sendOp = (REG.MEMBER_OPS as Any[]).find((o) => o.id === "campaigns.send");
  const spec = OA.buildOpenApi({ baseUrl: "https://shark.in.th" });
  const sendPath = spec?.paths?.["/campaigns/{id}/send"] ?? null;
  const otherDanger = (REG.MEMBER_OPS as Any[]).filter((o) => o.kind === "danger").map((o) => o.id);
  chk(
    "S1-M15.1",
    "campaigns.send เป็น kind 'danger' (ต้อง confirm + reason ≥ 5 เหมือนคำสั่งอันตรายอื่น) · ทะเบียน/OpenAPI หยิบไปเองโดยไม่ต้องแก้ไฟล์นอกชุดนี้ (ยังมีเส้นทาง POST /campaigns/{id}/send ในสเปก)",
    sendOp?.kind === "danger" && !!sendPath?.post && otherDanger.includes("campaigns.send"),
    "danger",
    `kind=${sendOp?.kind} openapi=${!!sendPath?.post} dangerOps=${otherDanger.slice(0, 6).join(",")}`,
  );

  // ═══════════════════════════ L9 — เพิกถอนคีย์ต้องเป็นคีย์ของระบบนี้ (static) ═══════════════════════════
  const apiActSrc = read("src/lib/modules/member/api-actions.ts");
  const hasLookup = /(prisma|db)\s*\.\s*apiKey\s*\.\s*(findFirst|findUnique|count)/.test(apiActSrc) || /apiKeyOfSystem|assertKeyInSystem/.test(apiActSrc);
  const lookupHasSystem = (() => {
    const i = apiActSrc.search(/(prisma|db)\s*\.\s*apiKey\s*\.\s*(findFirst|findUnique|count)/);
    if (i < 0) return /assertKeyInSystem|apiKeyOfSystem/.test(apiActSrc);
    const win = apiActSrc.slice(i, i + 400);
    return /systemId/.test(win) && /(keyId|id:)/.test(win);
  })();
  chk(
    "S1-L9.1",
    "[static] revokeMemberApiKeyAction: ก่อนเพิกถอน ต้องอ่านคีย์จากฐานแล้วยืนยันว่าเป็นคีย์ของ systemId (และร้าน) นี้จริง — ไม่งั้นหน้าตั้งค่าของระบบหนึ่งเพิกถอนคีย์ของอีกระบบได้",
    hasLookup && lookupHasSystem,
    "ตรวจ systemId ของคีย์",
    `lookup=${hasLookup} systemIdInLookup=${lookupHasSystem}`,
  );

  chk("S1-NET.1", "[guard] ข้อสอบนี้ไม่ยิงเน็ตจริงออกนอก 127.0.0.1 (LINE/Resend ถูกครอบด้วยตัวปลอม)", hits.other.length === 0, "ไม่มีปลายทางอื่น", `other=${hits.other.slice(0, 3).join(",") || "-"}`, "MINOR");
} catch (e) {
  console.error("💥", e);
  chk("S1-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 300));
} finally {
  globalThis.fetch = realFetch;
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* ignore */
    }
  };
  for (const r of restore.reverse()) await d(r);
  // ของที่ข้อสอบสร้างเอง
  if (rlNew.size > 0) await d(() => P.chatRateBucket.deleteMany({ where: { key: { in: [...rlNew] } } }));
  if (tid) {
    await d(() => P.customerOtp.deleteMany({ where: { tenantId: tid, target: { startsWith: "0899" } } }));
    await d(() => P.customerOtp.deleteMany({ where: { tenantId: tid, target: { contains: MARK } } }));
    await d(() => P.customerOtp.deleteMany({ where: { tenantId: tid, createdAt: { gte: t0 }, ip: { startsWith: "10.9" } } }));
    await d(() => P.memberAccessLog.deleteMany({ where: { tenantId: tid, createdAt: { gte: t0 } } }));
    await d(() => P.auditLog.deleteMany({ where: { tenantId: tid, createdAt: { gte: t0 }, action: { in: ["member.export"] } } }));
  }
  if (made.customers.length > 0) {
    const ids = made.customers;
    const parties = ((await P.customer.findMany({ where: { id: { in: ids } }, select: { partyId: true } })) as Any[]).map((c) => c.partyId).filter(Boolean) as string[];
    for (const mdl of [
      "memberPushDevice",
      "customerSession",
      "memberNotification",
      "referral",
      "stampEvent",
      "stampCardProgress",
      "pointLot",
      "pointLedger",
      "pointBalance",
      "memberConsent",
      "memberAttribution",
      "memberTierHistory",
      "memberFieldValue",
      "memberChannelIdentity",
      "memberAccessLog",
      "memberActivity",
    ]) {
      await d(() => P[mdl]?.deleteMany?.({ where: { customerId: { in: ids } } }));
    }
    await d(() => P.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: ids } } }));
    const outbox: Any[] = (await P.outboxEvent.findMany({ where: { tenantId: tid, createdAt: { gte: t0 } }, select: { id: true, payload: true } }).catch(() => [])) as Any[];
    const mineOutbox = outbox.filter((o) => ids.some((id) => JSON.stringify(o.payload ?? {}).includes(id))).map((o) => o.id);
    if (mineOutbox.length > 0) await d(() => P.outboxEvent.deleteMany({ where: { id: { in: mineOutbox } } }));
    await d(() => P.customer.deleteMany({ where: { id: { in: ids } } }));
    if (parties.length > 0) {
      await d(() => P.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } }));
      await d(() => P.party.deleteMany({ where: { id: { in: parties } } }));
    }
  }
  if (made.cards.length > 0) {
    await d(() => P.stampEvent.deleteMany({ where: { cardId: { in: made.cards } } }));
    await d(() => P.stampCardProgress.deleteMany({ where: { cardId: { in: made.cards } } }));
    await d(() => P.stampCard.deleteMany({ where: { id: { in: made.cards } } }));
  }
  if (resetOtpLimit) await d(() => resetOtpLimit!());
  await prisma.$disconnect();
}
const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} FIX-S1: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
