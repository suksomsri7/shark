// QC — ระบบสมาชิก v2 · ชุดแก้ตามผลตรวจ S4 (PDPA · รายงาน · กันโกงแนะนำเพื่อน · webhooks · รีวิว/เครื่องแจ้งเตือน)
// Fable oracle (ข้อสอบ) · Builder ห้ามแตะไฟล์นี้ · ที่มาของโจทย์: ledger/AUDIT-2026-09-16-MEMBER.md + ledger/member-briefs/member-fix-s4.md
//
// 🔴 ทุกข้อเช็กเขียนตาม "พฤติกรรมหลังแก้" ⇒ บนโค้ดวันนี้ต้องแดง (ยกเว้นข้อที่กำกับว่า control = ต้องเขียวทั้งก่อนและหลัง)
// 🔴 ข้อมูล QC ต้องเหมือนเดิมหลังรัน: แถวชั่วคราวใช้ marker "fix-s4-" · ตั้งค่าโปรแกรมแนะนำเพื่อน/แถว delivery ของชุดอื่น snapshot แล้วคืนใน finally
// 🔴 ห้ามยิงปลายทางจริง: fetch ถูกฉีดทุกครั้ง · โฮสต์ที่ใช้ทดสอบเป็น 127.0.0.1 / IP ส่วนตัว / โดเมน .invalid เท่านั้น
//
// สัญญาที่ข้อสอบนี้ถือว่าเป็น "ผลลัพธ์ที่ถูก" (สรุปจาก member-fix-s4.md)
//   M5/M6  eraseMember ใน tx เดียว: รีวิว body/replyBody ว่าง · photoFileIds ว่าง + ลบ FileAsset ของรูป + avatar · Referral.refereeContact ของฝั่ง referee = null
//          · MemberNotification subject/body ว่าง (คงแถว + สถานะไว้เป็นหลักฐาน) · CustomerSession ทุกใบถูกเพิกถอน · CustomerOtp ของคน/เป้าหมายนี้ถูกลบ
//   L8     logAccess บันทึกการเปิดดูของ "คีย์ API ที่ไม่มี userId" ด้วย (เก็บ id คีย์ลงคอลัมน์ผู้กระทำที่มีอยู่ — ไม่มี migration)
//   M2     CSV รายงานผ่าน csvCell/neutralizeFormula ของ src/lib/core/csv.ts (cell ขึ้นต้น = + - @ tab CR ถูกเติม ') · BOM + ไทยยังอยู่ · ตัวเลขไม่ถูกแตะ
//   M13    รายงานไม่มี findMany ไร้ take · actor ที่ถูกจำกัดสาขาเห็นตัวเลขเฉพาะสาขาตน (กติกาเดียวกับ listMembers) · ตัวเลขของ OWNER เท่าเดิม
//   M14    fingerprint + ip (hash) ถูกตรวจข้ามผู้แนะนำทั้งร้าน · monthlyCap null = ค่าปริยายจำกัด (ไม่ใช่ไม่จำกัด)
//   M1     webhooks: บล็อกโฮสต์ภายใน/loopback/link-local ทั้งตอนสร้างและตอนส่ง (ยกเว้น WEBHOOK_ALLOW_PRIVATE=1 และ APP_ENV ≠ production)
//          · ส่งพร้อม X-Shark-Timestamp + X-Shark-Signature-V2 = hmac(secret, `${ts}.${body}`) · คงหัวเดิม X-Shark-Signature · retry มี backoff ต่อใบ
//   L2/L3  โทเคนรีวิวหมดอายุ 30 วัน (ไทย "ลิงก์หมดอายุ") · สาขา "done" ของ reviewLiffView ต้องตรวจ hash ของโทเคนด้วย
//   L6     เครื่องแจ้งเตือนที่ผูกกับลูกค้า A อยู่แล้ว ห้ามถูกลูกค้า B ยึดไปเฉย ๆ (ไม่มีคอลัมน์ installationId ⇒ กติกาสำรอง = คงเจ้าของเดิม/ปฏิเสธ)
//
// รัน: bash scripts/iso.sh pnpm exec tsx scripts/qc-member-fix-s4.mts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync } from "node:fs";
import { createHmac, createHash, randomBytes } from "node:crypto";

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
const fails = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e as Error;
  }
};
const thai = (e: Error | null) => !!e && /[ก-๙]/.test(e.message);
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
const P = prisma as Any;

const tag = Date.now().toString(36);
const MARK = `fix-s4-${tag}`;
const PROBE_EVENT = `fix-s4.probe.${tag}`;
const HOSTILE = '=HYPERLINK("http://evil.example","คลิก")';
const ENV_PRIVATE = "WEBHOOK_ALLOW_PRIVATE";
const envPrivate0 = process.env[ENV_PRIVATE];

let tid = "";
let SYS = "";
const made = {
  customers: [] as string[],
  files: [] as string[],
  reviews: [] as string[],
  referrals: [] as string[],
  endpoints: [] as string[],
  campaigns: [] as string[],
  otps: [] as string[],
  requests: [] as string[],
  keys: [] as string[],
  pushTokens: [] as string[],
};
const restore: (() => Promise<unknown>)[] = [];
/** ตัวถอด "สายลับ" ที่ครอบ prisma.<model>.findMany ระหว่างวัดข้อ M13 (ถอดทันทีหลังวัด + กันลืมใน finally) */
const undo: (() => void)[] = [];

try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed ชุดข้อมูลสมาชิก QC");
  tid = scope.tenantId;
  SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const members: Any[] = E.members;
  const m = (i: number) => members[i - 1];
  const units = E.units as Record<string, string>;
  const slug = mq.MQC.tenantSlug as string;

  const PV = (await import("@/lib/modules/member/privacy" as string)) as Record<string, (...a: Any[]) => Any>;
  const PR = (await import("@/lib/modules/member/profile" as string)) as Record<string, (...a: Any[]) => Any>;
  const RF = (await import("@/lib/modules/member/referrals" as string)) as Record<string, (...a: Any[]) => Any>;
  const RV = (await import("@/lib/modules/member/reviews" as string)) as Record<string, (...a: Any[]) => Any>;
  const RPT = (await import("@/lib/modules/member/reports" as string)) as Record<string, (...a: Any[]) => Any>;
  const LS = (await import("@/lib/modules/member/list" as string)) as Record<string, (...a: Any[]) => Any>;
  const CS = (await import("@/lib/modules/member/customer-session" as string)) as Record<string, (...a: Any[]) => Any>;
  const PD = (await import("@/lib/modules/member/push-devices" as string)) as Record<string, (...a: Any[]) => Any>;
  const ACT = (await import("@/lib/modules/member/api/actor" as string)) as Record<string, (...a: Any[]) => Any>;
  const WH = (await import("@/lib/webhooks/service" as string)) as Record<string, (...a: Any[]) => Any>;
  const CSV = (await import("@/lib/core/csv" as string)) as Record<string, (...a: Any[]) => Any>;
  const ak = (await import("@/lib/api-keys/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;
  const akScopes = (await import("@/lib/api-keys/scopes" as string)) as Any;
  const approval = (await import("@/lib/modules/approval/service" as string)) as Record<string, (...a: Any[]) => Promise<Any>>;

  const actorOf = async (userId: string) => {
    const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!;
    return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> };
  };
  const owner = await actorOf(E.users.owner.userId as string);
  const thana0 = await actorOf(E.users.staff.thana.userId as string);
  // ธนา = STAFF สาขาป่าตอง — เปิดคีย์ "ดูรายงาน" ให้เขาเฉพาะในข้อสอบนี้ (ทดสอบ "ขอบเขตสาขา" ไม่ใช่ "มีสิทธิ์ไหม")
  const thana = { ...thana0, permissions: { ...thana0.permissions, "member.report.view": true } };
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: E.users.owner.userId as string };
  const phoneN = () => `0899${String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0")}`;
  const mkCust = async (first: string, extra: Any = {}) => {
    const c = await PR.createMember(ctxO, owner, {
      phone: phoneN(),
      firstName: first,
      lastName: MARK,
      source: "WALK_IN",
      homeUnitId: units.patong,
      ...extra,
    });
    made.customers.push(c.customerId);
    return c.customerId as string;
  };
  const mkFile = async (label: string) => {
    const f = await P.fileAsset.create({
      data: {
        tenantId: tid,
        kind: "ATTACHMENT",
        path: `t/${tid}/ATTACHMENT/${MARK}-${label}.jpg`,
        cdnUrl: `https://cdn.invalid/${MARK}-${label}.jpg`,
        contentType: "image/jpeg",
        bytes: 1024,
      },
    });
    made.files.push(f.id);
    return f.id as string;
  };
  const healthSec = await P.memberSection.findFirst({ where: { systemId: SYS, key: "health" } });

  // ═══════════════ M5 + M6 — PDPA erase เก็บกวาดให้ครบ ═══════════════
  const X = await mkCust(`${HOSTILE} ลบ`);
  const xRow0 = (await prisma.customer.findUnique({ where: { id: X } })) as Any;
  const photo1 = await mkFile("photo1");
  const photo2 = await mkFile("photo2");
  const avatar = await mkFile("avatar");
  await prisma.customer.update({ where: { id: X }, data: { avatarFileId: avatar } as Any });
  const rvX = await P.memberReview.create({
    data: {
      tenantId: tid,
      systemId: SYS,
      customerId: X,
      unitId: units.patong,
      refType: "PosSale",
      refId: `${MARK}-sale`,
      rating: 5,
      body: `ประทับใจมากค่ะ ติดต่อกลับที่ 0891234567 (${MARK})`,
      photoFileIds: [photo1, photo2],
      status: "REPLIED",
      replyBody: `ขอบคุณคุณ${xRow0?.firstName ?? ""}ค่ะ (${MARK})`,
      repliedAt: new Date(),
      submittedAt: new Date(),
      requestSentAt: new Date(),
    },
  });
  made.reviews.push(rvX.id);
  const refX = await P.referral.create({
    data: {
      tenantId: tid,
      systemId: SYS,
      referrerCustomerId: m(1).id,
      refereeCustomerId: X,
      refereeContact: { phone: xRow0?.phone ?? "0891234567", fingerprint: `fp-${MARK}`, name: `${MARK}` },
      code: `FIXS4${tag}`.slice(0, 12).toUpperCase(),
      status: "PENDING",
    },
  });
  made.referrals.push(refX.id);
  const ntX = await P.memberNotification.create({
    data: {
      tenantId: tid,
      systemId: SYS,
      customerId: X,
      event: "WELCOME",
      channel: "LINE",
      status: "SENT",
      subject: `ยินดีต้อนรับคุณ${xRow0?.firstName ?? ""} (${MARK})`,
      body: `สวัสดีค่ะ เบอร์ที่ลงทะเบียนคือ ${xRow0?.phone ?? ""} (${MARK})`,
      sentAt: new Date(),
    },
  });
  const sessX = await CS.mintCustomerSession(X, { ip: "127.0.0.1", userAgent: `qc-${MARK}` });
  const otpX = await P.customerOtp.create({
    data: {
      id: `${MARK}-otp`,
      tenantId: tid,
      target: xRow0?.phone ?? phoneN(),
      channel: "PHONE",
      codeHash: sha(`${MARK}:000000`),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      customerId: X,
    },
  });
  made.otps.push(otpX.id);

  const sessBefore = await CS.getCustomerSession(sessX.token);
  const re = await PV.requestErase(ctxO, owner, X, "STAFF");
  if (re?.requestId) made.requests.push(re.requestId);
  let erasePath = re?.status ?? "?";
  if (re?.approvalRequestId) {
    await approval.decide(
      { userId: E.users.owner.userId, role: "OWNER", unitAccess: ["*"], permissions: {} } as Any,
      { tenantId: tid },
      re.approvalRequestId,
      { decision: "APPROVED", note: `QC ${MARK}` },
    );
    const { drainOutbox } = await import("@/lib/core/outbox");
    const { consumers: C } = (await import("@/lib/outbox-consumers" as string)) as Any;
    await drainOutbox(C, { limit: 300 });
    erasePath = "approval";
  }
  let cX = (await prisma.customer.findUnique({ where: { id: X } })) as Any;
  if (cX?.status !== "CLOSED") {
    // สายอนุมัติของร้าน QC อาจเปลี่ยนไป — ปิดท้ายด้วยตัวลบจริงเพื่อให้ข้อเช็กด้านล่างวัด "หลังลบ" เสมอ
    await PV.eraseMember(ctxO, X, { requestId: re?.requestId }).catch(() => null);
    cX = (await prisma.customer.findUnique({ where: { id: X } })) as Any;
    erasePath += "+direct";
  }
  chk(
    "S4-M5.0",
    "[control] เดินสายลบจริง (requestErase → อนุมัติ → eraseMember) แล้วสมาชิกถูก anonymize (name 'ลูกค้าที่ถูกลบ' · status CLOSED · ไม่มีเบอร์)",
    cX?.status === "CLOSED" && cX?.phone === null && cX?.name === "ลูกค้าที่ถูกลบ",
    "CLOSED",
    `path=${erasePath} st=${cX?.status} phone=${cX?.phone} name=${cX?.name}`,
  );

  const rvAfter = (await P.memberReview.findUnique({ where: { id: rvX.id } })) as Any;
  chk(
    "S4-M5.1",
    "หลังลบ: MemberReview ของคนนี้ถูกลบข้อความ (body และ replyBody ว่าง) แต่แถวยังอยู่เป็นหลักฐาน (rating/status/หน่วยคงเดิม)",
    !!rvAfter && blank(rvAfter.body) && blank(rvAfter.replyBody) && rvAfter.rating === 5 && String(rvAfter.status) === "REPLIED",
    "body/replyBody ว่าง · แถวคงอยู่",
    `row=${!!rvAfter} body=${JSON.stringify(rvAfter?.body)?.slice(0, 60)} reply=${JSON.stringify(rvAfter?.replyBody)?.slice(0, 60)} rating=${rvAfter?.rating} st=${rvAfter?.status}`,
  );
  const photosLeft = await P.fileAsset.count({ where: { id: { in: [photo1, photo2] } } });
  const avatarLeft = await P.fileAsset.count({ where: { id: avatar } });
  chk(
    "S4-M5.2",
    "หลังลบ: photoFileIds ของรีวิวถูกล้าง + FileAsset ของรูปรีวิวถูกลบจริง (2 แถว) · FileAsset รูปโปรไฟล์ถูกลบ · Customer.avatarFileId null",
    Array.isArray(rvAfter?.photoFileIds) && rvAfter.photoFileIds.length === 0 && photosLeft === 0 && avatarLeft === 0 && cX?.avatarFileId === null,
    "รูปหายทั้งหมด",
    `photoIds=${JSON.stringify(rvAfter?.photoFileIds)} photoAssets=${photosLeft} avatarAsset=${avatarLeft} avatarId=${cX?.avatarFileId}`,
  );
  const refAfter = (await P.referral.findUnique({ where: { id: refX.id } })) as Any;
  chk(
    "S4-M5.3",
    "หลังลบ: Referral ที่คนนี้เป็น 'เพื่อนที่ถูกแนะนำ' → refereeContact = null (ไม่เหลือเบอร์/ชื่อ/fingerprint) แต่แถว + สถานะยังอยู่",
    !!refAfter && (refAfter.refereeContact === null || JSON.stringify(refAfter.refereeContact) === "{}") && String(refAfter.status) === "PENDING",
    "refereeContact null",
    `row=${!!refAfter} contact=${JSON.stringify(refAfter?.refereeContact)?.slice(0, 120)} st=${refAfter?.status}`,
  );
  const ntAfter = (await P.memberNotification.findUnique({ where: { id: ntX.id } })) as Any;
  chk(
    "S4-M5.4",
    "หลังลบ: MemberNotification subject/body ว่าง (ไม่เหลือชื่อ/เบอร์) แต่แถว + status/channel/sentAt ยังอยู่เป็นหลักฐาน",
    !!ntAfter && blank(ntAfter.subject) && blank(ntAfter.body) && ntAfter.status === "SENT" && ntAfter.channel === "LINE",
    "subject/body ว่าง · แถวคงอยู่",
    `row=${!!ntAfter} subj=${JSON.stringify(ntAfter?.subject)?.slice(0, 60)} body=${JSON.stringify(ntAfter?.body)?.slice(0, 60)} st=${ntAfter?.status}`,
  );
  const otpLeft = await P.customerOtp.count({ where: { OR: [{ customerId: X }, { target: xRow0?.phone ?? "-" }] } });
  chk(
    "S4-M5.5",
    "หลังลบ: CustomerOtp ของลูกค้า/เบอร์เป้าหมายนี้ถูกลบหมด (0 แถว)",
    otpLeft === 0,
    "0 แถว",
    `otp=${otpLeft}`,
  );
  const sessRows = (await P.customerSession.findMany({ where: { customerId: X } })) as Any[];
  const sessAfter = await CS.getCustomerSession(sessX.token);
  chk(
    "S4-M6.1",
    "หลังลบ: CustomerSession ทุกใบของคนนี้ถูกเพิกถอน (revokedAt หรือแถวถูกลบ) และ getCustomerSession(token เดิม) = null (ก่อนลบใช้ได้)",
    !!sessBefore && sessAfter === null && sessRows.every((s) => !!s.revokedAt),
    "session ตายทั้งหมด",
    `before=${!!sessBefore} after=${JSON.stringify(sessAfter)?.slice(0, 80)} rows=${sessRows.length} live=${sessRows.filter((s) => !s.revokedAt).length}`,
  );
  const actLeft = await P.memberActivity.count({ where: { customerId: X, type: "PDPA_ERASED" } });
  chk(
    "S4-M5.6",
    "[control] หลักฐานที่ต้องเหลือ: MemberActivity PDPA_ERASED ถูกบันทึก + แถวรีวิว/แจ้งเตือน/แนะนำเพื่อนยังนับได้ (ลบ PII ไม่ใช่ลบแถว)",
    actLeft >= 1 && !!rvAfter && !!ntAfter && !!refAfter,
    "แถวคงอยู่ + audit",
    `act=${actLeft} rv=${!!rvAfter} nt=${!!ntAfter} ref=${!!refAfter}`,
  );

  // ═══════════════ L8 — logAccess ของคีย์ API (ไม่มี userId) ═══════════════
  const bundleScopes: string[] = akScopes.expandBundles(["member-admin"]);
  const apiKey = await ak.createApiKey({ tenantId: tid }, `QC ${MARK} admin`, { scopes: bundleScopes, systemId: SYS });
  made.keys.push(apiKey.id);
  const keyActor = ACT.memberActorForKey({ keyId: apiKey.id, scopes: bundleScopes, createdById: null });
  const pageKey = `qc.${MARK}.apikey`;
  const pageHuman = `qc.${MARK}.human`;
  await PV.logAccess(ctxO, keyActor, { customerId: m(2).id, targetType: "SECTION", targetId: healthSec?.id ?? "health", page: pageKey }).catch(() => null);
  await PV.logAccess(ctxO, owner, { customerId: m(2).id, targetType: "SECTION", targetId: healthSec?.id ?? "health", page: pageHuman }).catch(() => null);
  const logKey = (await P.memberAccessLog.findMany({ where: { tenantId: tid, page: pageKey } })) as Any[];
  const logHuman = (await P.memberAccessLog.findMany({ where: { tenantId: tid, page: pageHuman } })) as Any[];
  chk(
    "S4-L8.1",
    "logAccess ของ actor ที่เป็นคีย์ API (ไม่มี userId คนจริง) ต้องบันทึก MemberAccessLog 1 แถว และคอลัมน์ผู้กระทำอ้างถึง id ของคีย์ (เช่น 'apikey:<id>')",
    logKey.length === 1 && String(logKey[0]?.userId ?? "").includes(apiKey.id),
    "1 แถว · userId มี id คีย์",
    `rows=${logKey.length} userId=${JSON.stringify(logKey[0]?.userId)} keyId=${apiKey.id}`,
  );
  chk(
    "S4-L8.2",
    "[control] คนจริง (owner) ยังบันทึกการเปิดดูเหมือนเดิม 1 แถว (userId = ผู้ใช้)",
    logHuman.length === 1 && logHuman[0]?.userId === E.users.owner.userId,
    "1 แถว",
    `rows=${logHuman.length} userId=${logHuman[0]?.userId}`,
  );

  // ═══════════════ M2 — CSV รายงานต้องกันสูตร ═══════════════
  const nameEq = `${HOSTILE} ${MARK}`;
  const nameAt = `@cmd|'/c calc'!A1 ${MARK} ทดสอบไทย`;
  for (const nm of [nameEq, nameAt]) {
    const c = await P.mktCampaign.create({
      data: { tenantId: tid, systemId: SYS, memberSystemId: SYS, name: nm, channel: "LINE", status: "DRAFT", message: "", channels: ["LINE"], content: {} },
    });
    made.campaigns.push(c.id);
  }
  const nowCsv = new Date();
  const csvPromo = String((await RPT.exportCsv(ctxO, owner, "promotions", { now: nowCsv }))?.csv ?? "");
  const expEq = CSV.csvCell(nameEq);
  const expAt = CSV.csvCell(nameAt);
  chk(
    "S4-M2.1",
    "CSV รายงาน (แท็บ promotions) ต้องกันสูตร: ชื่อที่ขึ้นต้นด้วย '=' ออกมาเป็นค่าที่ csvCell ของ core/csv.ts ให้ (มี ' นำหน้า + ครอบ quote) · BOM ยังอยู่ · ข้อความไทยไม่เพี้ยน",
    csvPromo.startsWith("﻿") && csvPromo.includes(expEq) && csvPromo.includes("คลิก") && !csvPromo.includes(`,${nameEq}`),
    "cell = csvCell(ชื่อ)",
    `bom=${csvPromo.startsWith("﻿")} hasNeutral=${csvPromo.includes(expEq)} nameInCsv=${csvPromo.includes("HYPERLINK")} raw=${csvPromo.includes(`,${nameEq}`)} exp=${expEq.slice(0, 70)}`,
  );
  const numericQuirk = /,'\d/.test(csvPromo);
  chk(
    "S4-M2.2",
    "CSV: cell ขึ้นต้น '@' (และ tab/CR) ถูกกันสูตรแบบเดียวกัน · ตัวเลขไม่ถูกเติม ' (คอลัมน์เงินยัง SUM ได้)",
    csvPromo.includes(expAt) && !numericQuirk,
    "@ ถูกกัน · ตัวเลขไม่ถูกแตะ",
    `at=${csvPromo.includes(expAt)} numericPrefixed=${numericQuirk} exp=${expAt.slice(0, 60)}`,
  );

  // ═══════════════ M13 — รายงานต้องมีขอบเขต + กรองสาขา ═══════════════
  const seen: { model: string; take: boolean }[] = [];
  const dbMod = (await import("@/lib/core/db" as string)) as Any;
  const PC = dbMod.prisma as Any;
  const spy = (model: string): boolean => {
    try {
      const d = PC[model];
      if (!d || typeof d.findMany !== "function") return false;
      const orig = d.findMany.bind(d);
      Object.defineProperty(d, "findMany", {
        configurable: true,
        writable: true,
        value: (args: Any) => {
          seen.push({ model, take: !!args && Number.isFinite(Number(args.take)) });
          return orig(args);
        },
      });
      undo.push(() => {
        try {
          Object.defineProperty(d, "findMany", { configurable: true, writable: true, value: orig });
        } catch {
          /* ignore */
        }
      });
      return true;
    } catch {
      return false;
    }
  };
  const SPY_MODELS = ["customer", "voucher", "mktCampaign", "pointLedger", "memberTierDef", "automationRun", "acquisitionLink"];
  const spied = SPY_MODELS.filter((mm) => spy(mm));
  seen.length = 0;
  await PC.customer.findMany({ where: { id: "__fix-s4-selftest__" }, select: { id: true } }).catch(() => null);
  const spyWorks = spied.includes("customer") && seen.length === 1;
  seen.length = 0;
  let unbounded: string[] = [];
  let mode = "runtime";
  if (spyWorks) {
    await RPT.overview(ctxO, owner, { months: 12, now: nowCsv });
    await RPT.sources(ctxO, owner, { days: 90, now: nowCsv });
    await RPT.rfm(ctxO, owner, { days: 365, now: nowCsv });
    await RPT.cohort(ctxO, owner, { months: 6, now: nowCsv });
    unbounded = seen.filter((s) => !s.take).map((s) => s.model);
  } else {
    // สำรอง [static] — อ่านตัวไฟล์: ทุก findMany ใน reports.ts ต้องมี take:
    mode = "static";
    const src = read("src/lib/modules/member/reports.ts");
    let i = src.indexOf(".findMany(");
    while (i >= 0) {
      let depth = 0;
      let j = src.indexOf("(", i);
      const start = j;
      for (; j < src.length; j += 1) {
        if (src[j] === "(") depth += 1;
        else if (src[j] === ")") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      const call = src.slice(start, j + 1);
      if (!/\btake\s*:/.test(call)) unbounded.push(`reports.ts@${src.slice(0, i).split("\n").length}`);
      i = src.indexOf(".findMany(", j);
    }
  }
  for (const u of undo) u();
  undo.length = 0;
  chk(
    "S4-M13.1",
    `รายงานต้องไม่มี findMany ไร้ขอบเขต (overview/sources/rfm/cohort) — ใช้ groupBy/aggregate หรือใส่ take (โหมดวัด: ${mode})`,
    unbounded.length === 0,
    "0 คำสั่งไร้ take",
    `unbounded=${[...new Set(unbounded)].join(",") || "-"} calls=${seen.length} spy=${spyWorks}`,
  );
  const listOwner = await LS.listMembers(ctxO, owner, { take: 1 });
  const listThana = await LS.listMembers(ctxO, thana, { take: 1 });
  const ovOwner = await RPT.overview(ctxO, owner, { months: 12, now: nowCsv });
  const ovThana = await RPT.overview(ctxO, thana, { months: 12, now: nowCsv });
  chk(
    "S4-M13.2",
    "actor ที่ถูกจำกัดสาขา (ธนา · ป่าตอง) เห็นตัวเลขเฉพาะสมาชิกในขอบเขตตน = จำนวนเดียวกับ listMembers ของเขา · OWNER ยังได้ตัวเลขเดิม (ทั้งร้าน)",
    listThana?.total < listOwner?.total && ovThana?.members?.total === listThana?.total && ovOwner?.members?.total === listOwner?.total,
    "report total = list total ของ actor เดียวกัน",
    `owner rep=${ovOwner?.members?.total}/list=${listOwner?.total} thana rep=${ovThana?.members?.total}/list=${listThana?.total}`,
  );

  // ═══════════════ M14 — กันโกงแนะนำเพื่อน ═══════════════
  const prog0 = await P.referralProgram.findUnique({ where: { systemId: SYS } }).catch(() => null);
  restore.push(async () => {
    if (prog0) {
      const { id: _i, createdAt: _c, updatedAt: _u, systemId: _s, ...rest } = prog0 as Any;
      await P.referralProgram.update({ where: { systemId: SYS }, data: rest });
    } else await P.referralProgram.deleteMany({ where: { systemId: SYS } });
  });
  await RF.setProgram(ctxO, owner, { enabled: true, fraudPhoneDevice: true, monthlyCap: 10 });
  const refA = await mkCust("ผู้แนะนำหนึ่ง");
  const refB = await mkCust("ผู้แนะนำสอง");
  const codeA = (await RF.codeFor(ctxO, refA)).code as string;
  const codeB = (await RF.codeFor(ctxO, refB)).code as string;
  const fpShared = `fp-${MARK}`;
  const ipShared = "203.0.113.77";
  const dev = (fp: string, ip: string) => ({ fingerprint: fp, ip, ipHash: sha(ip) });
  const F1 = await mkCust("เพื่อนหนึ่ง");
  const F2 = await mkCust("เพื่อนสอง");
  const F3 = await mkCust("เพื่อนสาม");
  const F4 = await mkCust("เพื่อนสี่");
  const a1 = await RF.attach(ctxO, { refereeCustomerId: F1, code: codeA, device: dev(fpShared, ipShared), ip: ipShared });
  if (a1?.referralId) made.referrals.push(a1.referralId);
  const a2 = await RF.attach(ctxO, { refereeCustomerId: F2, code: codeB, device: dev(fpShared, ipShared), ip: ipShared });
  if (a2?.referralId) made.referrals.push(a2.referralId);
  chk(
    "S4-M14.1",
    "อุปกรณ์เดียวกัน (fingerprint ซ้ำ) สมัครด้วยโค้ดของผู้แนะนำ 'คนละคน' ในช่วงโปรแกรม → ใบที่สองถูกปฏิเสธว่าเป็นการโกง (ไม่ใช่แค่ซ้ำผู้แนะนำคนเดิม)",
    a1?.status === "PENDING" && a2?.status === "REJECTED" && /[ก-๙]/.test(a2?.rejectReason ?? ""),
    "ใบสอง REJECTED",
    `a1=${JSON.stringify(a1)} a2=${JSON.stringify(a2)}`,
  );
  const a3 = await RF.attach(ctxO, { refereeCustomerId: F3, code: codeB, device: dev(`fp-other-${tag}`, ipShared), ip: ipShared });
  if (a3?.referralId) made.referrals.push(a3.referralId);
  chk(
    "S4-M14.2",
    "ip (hash) เดียวกันข้ามผู้แนะนำในช่วงโปรแกรม → ถูกปฏิเสธเช่นกัน (สัญญาณจากฝั่ง server ไม่ใช่แค่ fingerprint ที่ client ส่งมา)",
    a3?.status === "REJECTED" && /[ก-๙]/.test(a3?.rejectReason ?? ""),
    "REJECTED",
    `a3=${JSON.stringify(a3)}`,
    "MAJOR",
  );
  const a4 = await RF.attach(ctxO, { refereeCustomerId: F4, code: codeA, device: dev(`fp-clean-${tag}`, "198.51.100.9"), ip: "198.51.100.9" });
  if (a4?.referralId) made.referrals.push(a4.referralId);
  chk(
    "S4-M14.3",
    "[control] อุปกรณ์/ไอพีคนละตัว → ยังผูกได้ตามปกติ (PENDING) — การกันโกงต้องไม่เหมารวมคนบริสุทธิ์",
    a4?.status === "PENDING",
    "PENDING",
    `a4=${JSON.stringify(a4)}`,
  );
  await RF.setProgram(ctxO, owner, { monthlyCap: null });
  const progNull = await RF.getProgram(ctxO);
  chk(
    "S4-M14.4",
    "monthlyCap = null ต้องถูกตีความเป็นเพดานปริยายที่มีขอบเขต (ตัวเลข > 0 และไม่เกิน 100) — ไม่ใช่ 'ไม่จำกัด'",
    typeof progNull?.monthlyCap === "number" && progNull.monthlyCap > 0 && progNull.monthlyCap <= 100,
    "ตัวเลขจำกัด",
    `monthlyCap=${JSON.stringify(progNull?.monthlyCap)}`,
  );
  const joinSrc = read("src/lib/modules/member/join.ts");
  chk(
    "S4-M14.5",
    "[static] join.ts ส่งสัญญาณจากฝั่ง server (ip / ip hash ของคำขอ) เข้าไปกับข้อมูลอุปกรณ์ตอนสมัคร — ไม่ใช่เชื่อ deviceId จาก client อย่างเดียว",
    /device:\s*\{[^}]*\bip/i.test(joinSrc) || /ipHash/i.test(joinSrc),
    "join.ts ส่ง ip/ipHash",
    `hasIpInDevice=${/device:\s*\{[^}]*\bip/i.test(joinSrc)} hasIpHash=${/ipHash/i.test(joinSrc)}`,
    "MAJOR",
  );

  // ═══════════════ M1 — webhooks: SSRF · ลายเซ็นมี timestamp · backoff ═══════════════
  const wctx = { tenantId: tid };
  const tryCreate = async (url: string, deps?: Any) => {
    try {
      const r = deps ? await WH.createEndpoint(wctx, { url, events: [PROBE_EVENT] }, deps) : await WH.createEndpoint(wctx, { url, events: [PROBE_EVENT] });
      if (r?.id) made.endpoints.push(r.id);
      return { created: true, id: r?.id as string, err: null as Error | null };
    } catch (e) {
      return { created: false, id: "", err: e as Error };
    }
  };
  delete process.env[ENV_PRIVATE];
  const BAD = [
    "https://127.0.0.1/hook",
    "https://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "https://localhost/hook",
    "http://10.1.2.3/hook",
    "http://192.168.1.5/hook",
    "http://172.16.9.9/hook",
    "https://[::1]/hook",
  ];
  const badRes: Any[] = [];
  for (const u of BAD) badRes.push({ u, ...(await tryCreate(u)) });
  chk(
    "S4-M1-ssrf.1",
    "createEndpoint ปฏิเสธปลายทางภายใน/loopback/link-local/metadata (127.0.0.1 · 169.254.169.254 · localhost · 10/8 · 192.168/16 · 172.16/12 · ::1) พร้อมข้อความไทย เมื่อไม่ได้เปิดช่องทดสอบ",
    badRes.every((r) => !r.created && thai(r.err)),
    "ปฏิเสธทั้ง 7",
    badRes.map((r) => `${r.u}=${r.created ? "CREATED" : (r.err?.message ?? "").slice(0, 30)}`).join(" | "),
  );
  const dnsBad = await tryCreate(`https://internal.${MARK}.invalid/hook`, { lookup: async () => "10.0.0.7" });
  chk(
    "S4-M1-ssrf.2",
    "createEndpoint แปลงชื่อโฮสต์ก่อน: ชื่อที่ชี้ไป IP ส่วนตัว (ฉีดตัวแปลงชื่อ) หรือแปลงไม่ได้ → ปฏิเสธด้วยข้อความไทย",
    !dnsBad.created && thai(dnsBad.err),
    "ปฏิเสธ",
    `created=${dnsBad.created} err=${(dnsBad.err?.message ?? "").slice(0, 80)}`,
  );
  // ปลายทางที่ "เคยถูกสร้างไว้ก่อน" แล้วชี้ไปโฮสต์ภายใน — ตอนส่งต้องตรวจซ้ำ
  const epMeta = await P.webhookEndpoint.create({
    data: { tenantId: tid, url: "https://169.254.169.254/latest/meta-data/", secret: randomBytes(24).toString("hex"), eventsJson: [PROBE_EVENT], active: true },
  });
  made.endpoints.push(epMeta.id);
  const calls: Any[] = [];
  const okFetch = (async (url: Any, init: Any) => {
    calls.push({ url: String(url), init });
    return new Response("ok", { status: 200 });
  }) as Any;
  const failFetch = (async (url: Any, init: Any) => {
    calls.push({ url: String(url), init });
    return new Response("boom", { status: 500 });
  }) as Any;
  calls.length = 0;
  await WH.dispatchWebhooks({ tenantId: tid, type: PROBE_EVENT, payload: { probe: MARK } }, { fetch: okFetch });
  const metaCalls = calls.filter((c) => /169\.254\.169\.254/.test(c.url));
  const metaDeliv = (await P.webhookDelivery.findMany({ where: { endpointId: epMeta.id } })) as Any[];
  const testMeta = await fails(() => WH.testEndpoint(wctx, epMeta.id, PROBE_EVENT, { fetch: okFetch }));
  const metaCalls2 = calls.filter((c) => /169\.254\.169\.254/.test(c.url));
  chk(
    "S4-M1-ssrf.3",
    "ตอนส่งจริงต้องตรวจซ้ำ: ปลายทางที่ชี้ไป 169.254.169.254 ไม่ถูกยิงเลย (ทั้ง dispatchWebhooks และปุ่มทดสอบ) · ถ้าบันทึกผลก็ต้องเป็น FAILED พร้อมเหตุผล",
    metaCalls2.length === 0 && metaDeliv.every((d) => String(d.status) === "FAILED"),
    "0 ครั้งที่ยิงออก",
    `calls=${metaCalls.length}/${metaCalls2.length} deliveries=${metaDeliv.map((d) => d.status).join(",") || "-"} test=${(testMeta?.message ?? "no-throw").slice(0, 40)}`,
  );
  // ช่องทดสอบที่เอกสารกำหนด: WEBHOOK_ALLOW_PRIVATE=1 + APP_ENV ≠ production → ปลายทาง 127.0.0.1 ใช้ได้ (ข้อสอบชุดเดิมพึ่งสิ่งนี้)
  process.env[ENV_PRIVATE] = "1";
  const local = await tryCreate("http://127.0.0.1:59999/hook");
  calls.length = 0;
  const nLocal = local.created ? await WH.dispatchWebhooks({ tenantId: tid, type: PROBE_EVENT, payload: { probe: MARK } }, { fetch: okFetch }) : 0;
  const localCall = calls.find((c) => /127\.0\.0\.1:59999/.test(c.url));
  chk(
    "S4-M1-ssrf.4",
    "[control] ช่องทดสอบที่กำหนดไว้ (WEBHOOK_ALLOW_PRIVATE=1 และ APP_ENV ≠ production) → ปลายทาง 127.0.0.1 ยังสร้างและส่งได้ (ข้อสอบ webhook ชุดเดิมต้องไม่แดง)",
    local.created && !!localCall && Number(nLocal) >= 1,
    "สร้าง + ส่งได้",
    `created=${local.created} err=${(local.err?.message ?? "").slice(0, 60)} sent=${nLocal} call=${!!localCall} appEnv=${process.env.APP_ENV}`,
  );
  const epLocal = (await P.webhookEndpoint.findUnique({ where: { id: local.id || epMeta.id } })) as Any;
  const hdrOf = (init: Any, name: string): string | null => {
    const h = init?.headers;
    if (!h) return null;
    if (typeof h.get === "function") return h.get(name);
    const key = Object.keys(h).find((k) => k.toLowerCase() === name.toLowerCase());
    return key ? String(h[key]) : null;
  };
  const body = localCall ? String(localCall.init?.body ?? "") : "";
  const ts = localCall ? hdrOf(localCall.init, "X-Shark-Timestamp") : null;
  const sigV2 = localCall ? hdrOf(localCall.init, "X-Shark-Signature-V2") : null;
  const sigV1 = localCall ? hdrOf(localCall.init, "X-Shark-Signature") : null;
  const secret = local.created ? epLocal?.secret : null;
  const expV2 = secret && ts ? createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex") : null;
  const expV1 = secret ? createHmac("sha256", secret).update(body).digest("hex") : null;
  const tsFresh = ts !== null && Math.abs(Date.now() / 1000 - Number(ts)) < 300;
  chk(
    "S4-M1-timestamp.1",
    "การส่งแต่ละใบมีหัว X-Shark-Timestamp (วินาที · สดใหม่) และ X-Shark-Signature-V2 = hex hmac-sha256(secret, `${timestamp}.${body}`) · หัวเดิม X-Shark-Signature ยังถูกต้องเพื่อความเข้ากันได้",
    !!localCall && tsFresh && !!sigV2 && sigV2 === expV2 && sigV1 === expV1,
    "ts + ลายเซ็น 2 ชั้น",
    `ts=${ts} fresh=${tsFresh} v2=${String(sigV2).slice(0, 16)}/${String(expV2).slice(0, 16)} v1ok=${sigV1 === expV1}`,
  );
  // ── backoff ──
  let backoffNote = "no-delivery";
  let immediateOk = false;
  let laterOk = false;
  if (local.created) {
    calls.length = 0;
    await WH.dispatchWebhooks({ tenantId: tid, type: PROBE_EVENT, payload: { probe: `${MARK}-fail` } }, { fetch: failFetch });
    const dFail = (await P.webhookDelivery.findFirst({ where: { endpointId: local.id, status: "FAILED" }, orderBy: { createdAt: "desc" } })) as Any;
    if (dFail) {
      const others = (await P.webhookDelivery.findMany({
        where: { status: "FAILED", NOT: { endpointId: { in: made.endpoints } } },
        select: { id: true, status: true, attempts: true, lastError: true },
      })) as Any[];
      const restoreOthers = async () => {
        for (const o of others) await P.webhookDelivery.update({ where: { id: o.id }, data: { status: o.status, attempts: o.attempts, lastError: o.lastError } }).catch(() => null);
      };
      calls.length = 0;
      await WH.retryFailedWebhooks({ fetch: okFetch });
      await restoreOthers();
      const after1 = (await P.webhookDelivery.findUnique({ where: { id: dFail.id } })) as Any;
      const hit1 = calls.filter((c) => /127\.0\.0\.1:59999/.test(c.url)).length;
      immediateOk = String(after1?.status) === "FAILED" && after1?.attempts === dFail.attempts && hit1 === 0;
      await prisma.$executeRawUnsafe(`UPDATE "WebhookDelivery" SET "updatedAt" = now() - interval '24 hours', "createdAt" = now() - interval '24 hours' WHERE id = $1`, dFail.id);
      calls.length = 0;
      await WH.retryFailedWebhooks({ fetch: okFetch });
      await restoreOthers();
      const after2 = (await P.webhookDelivery.findUnique({ where: { id: dFail.id } })) as Any;
      const hit2 = calls.filter((c) => /127\.0\.0\.1:59999/.test(c.url)).length;
      laterOk = String(after2?.status) === "OK" && after2?.attempts === dFail.attempts + 1 && hit2 >= 1;
      backoffNote = `attempts0=${dFail.attempts} imm={st:${after1?.status},at:${after1?.attempts},hit:${hit1}} later={st:${after2?.status},at:${after2?.attempts},hit:${hit2}}`;
    }
  }
  chk(
    "S4-M1-backoff.1",
    "retry มี backoff ต่อใบ: ใบที่เพิ่งล้มเมื่อครู่ ไม่ถูกยิงซ้ำทันที (attempts เท่าเดิม · ไม่มีการยิงออก) แต่เมื่อถึงเวลารอบถัดไปแล้ว (แถวเก่า 24 ชม.) ถึงจะยิงซ้ำและสำเร็จ",
    immediateOk && laterOk,
    "ข้ามรอบแรก · ยิงรอบหลัง",
    backoffNote,
  );

  // ═══════════════ L2 / L3 — โทเคนรีวิว ═══════════════
  const Y = await mkCust("เจ้าของรีวิว");
  // รูปโทเคนจริงของระบบ = `<reviewId>.<สุ่ม>` และ DB เก็บแค่ sha256 ⇒ สร้างแถวก่อน แล้วค่อยเขียน hash ของโทเคนรูปนั้น
  const mkReviewToken = async (row: Any) => {
    const t = `${row.id}.${randomBytes(20).toString("hex")}`;
    await P.memberReview.update({ where: { id: row.id }, data: { requestTokenHash: sha(t) } });
    return t;
  };
  const rvOld = await P.memberReview.create({
    data: {
      tenantId: tid,
      systemId: SYS,
      customerId: Y,
      unitId: units.patong,
      refType: "PosSale",
      refId: `${MARK}-old`,
      rating: 0,
      status: "REQUESTED",
      requestSentAt: new Date(Date.now() - 40 * 86_400_000),
      requestTokenHash: sha(`${MARK}-old-seed`),
    },
  });
  made.reviews.push(rvOld.id);
  const tokenOld = await mkReviewToken(rvOld);
  const viewOld = await RV.reviewLiffView(slug, tokenOld);
  const eOld = await fails(() => RV.submitReview({ token: tokenOld, rating: 5, body: `qc ${MARK}` }));
  chk(
    "S4-L2.1",
    "โทเคนรีวิวที่ขอไว้เกิน 30 วัน (requestSentAt 40 วันก่อน) → หน้า LIFF ตอบสถานะ 'หมดอายุ' ไม่ใช่ 'open' และส่งรีวิวไม่ได้ (ข้อความไทย 'ลิงก์หมดอายุ' ไม่โทษลูกค้า)",
    viewOld?.state === "expired" && !!eOld && /หมดอายุ/.test(eOld.message),
    "expired + ปฏิเสธ",
    `view=${JSON.stringify(viewOld)?.slice(0, 120)} submit=${(eOld?.message ?? "ส่งผ่าน!").slice(0, 60)}`,
  );
  const rvFresh = await P.memberReview.create({
    data: {
      tenantId: tid,
      systemId: SYS,
      customerId: Y,
      unitId: units.patong,
      refType: "PosSale",
      refId: `${MARK}-fresh`,
      rating: 0,
      status: "REQUESTED",
      requestSentAt: new Date(),
      requestTokenHash: sha(`${MARK}-fresh-seed`),
    },
  });
  made.reviews.push(rvFresh.id);
  const tokenFresh = await mkReviewToken(rvFresh);
  const viewFresh = await RV.reviewLiffView(slug, tokenFresh);
  chk(
    "S4-L2.2",
    "[control] โทเคนที่เพิ่งขอ (วันนี้) ยังเปิดหน้ารีวิวได้ตามปกติ (state 'open') — การใส่วันหมดอายุต้องไม่ทำให้ลิงก์ปกติเสีย",
    viewFresh?.state === "open",
    "open",
    `view=${JSON.stringify(viewFresh)?.slice(0, 120)}`,
  );
  const rvDone = await P.memberReview.create({
    data: {
      tenantId: tid,
      systemId: SYS,
      customerId: Y,
      unitId: units.patong,
      refType: "PosSale",
      refId: `${MARK}-done`,
      rating: 4,
      body: `รีวิวแล้ว ${MARK}`,
      status: "NEW",
      submittedAt: new Date(),
      requestSentAt: new Date(),
      requestTokenHash: sha(`${MARK}-done-seed`),
    },
  });
  made.reviews.push(rvDone.id);
  const tokenDone = await mkReviewToken(rvDone);
  const viewWrong = await RV.reviewLiffView(slug, `${rvDone.id}.${"z".repeat(32)}`);
  const viewRight = await RV.reviewLiffView(slug, tokenDone);
  chk(
    "S4-L3.1",
    "สาขา 'รีวิวแล้ว' ต้องตรวจ hash ของโทเคนด้วย: เดา id รีวิวแล้วใส่ส่วนลับผิด → ไม่เปิดเผยอะไรเลย (ไม่ใช่ state 'done' + คะแนน)",
    viewWrong?.state !== "done" && viewWrong?.rating === undefined,
    "ไม่เปิดเผย",
    `view=${JSON.stringify(viewWrong)?.slice(0, 120)}`,
  );
  chk(
    "S4-L3.2",
    "[control] โทเคนที่ถูกต้องของรีวิวที่ส่งแล้ว ยังเห็นหน้า 'รีวิวแล้ว' พร้อมคะแนนของตัวเอง (แก้ L3 ด้วยการตัดสาขา done ทิ้งไม่ได้)",
    viewRight?.state === "done" && viewRight?.rating === 4,
    "done + 4 ดาว",
    `view=${JSON.stringify(viewRight)?.slice(0, 120)}`,
    "MINOR",
  );

  // ═══════════════ L6 — ยึดเครื่องแจ้งเตือนด้วย Expo token ═══════════════
  const Z = await mkCust("คนยึดเครื่อง");
  const pushToken = `ExponentPushToken[${MARK}]`;
  made.pushTokens.push(pushToken);
  await PD.registerPushDevice(ctxO, CS.customerActor(Y), { expoToken: pushToken, platform: "ios" });
  const eSteal = await fails(() => PD.registerPushDevice(ctxO, CS.customerActor(Z), { expoToken: pushToken, platform: "ios" }));
  const devRow = (await P.memberPushDevice.findFirst({ where: { token: pushToken } })) as Any;
  chk(
    "S4-L6.1",
    "Expo token ที่ผูกกับลูกค้า A อยู่แล้ว ลูกค้า B ลงทะเบียนซ้ำไม่ได้ผูกให้ B (ไม่มีคอลัมน์ installationId ⇒ กติกาสำรอง: คงเจ้าของเดิม หรือปฏิเสธด้วยข้อความไทย)",
    devRow?.customerId === Y && (eSteal === null || thai(eSteal)),
    "เจ้าของเดิมคงอยู่",
    `owner=${devRow?.customerId === Y ? "A" : devRow?.customerId === Z ? "B(ถูกยึด)" : "?"} err=${(eSteal?.message ?? "ไม่ throw").slice(0, 60)}`,
  );
} catch (e) {
  console.error("💥", e);
  chk("S4-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 300));
} finally {
  const d = async (f: () => Promise<unknown>) => {
    try {
      await f();
    } catch {
      /* ignore */
    }
  };
  for (const u of undo) {
    try {
      u();
    } catch {
      /* ignore */
    }
  }
  for (const r of restore) await d(r);
  if (envPrivate0 === undefined) delete process.env[ENV_PRIVATE];
  else process.env[ENV_PRIVATE] = envPrivate0;
  await d(() => P.webhookDelivery.deleteMany({ where: { eventType: PROBE_EVENT } }));
  if (made.endpoints.length) {
    await d(() => P.webhookDelivery.deleteMany({ where: { endpointId: { in: made.endpoints } } }));
    await d(() => P.webhookEndpoint.deleteMany({ where: { id: { in: made.endpoints } } }));
  }
  if (made.campaigns.length) await d(() => P.mktCampaign.deleteMany({ where: { id: { in: made.campaigns } } }));
  if (made.keys.length) await d(() => P.apiKey.deleteMany({ where: { id: { in: made.keys } } }));
  await d(() => P.memberAccessLog.deleteMany({ where: { tenantId: tid, page: { contains: MARK } } }));
  if (made.pushTokens.length) await d(() => P.memberPushDevice.deleteMany({ where: { token: { in: made.pushTokens } } }));
  if (made.reviews.length) await d(() => P.memberReview.deleteMany({ where: { id: { in: made.reviews } } }));
  if (made.referrals.length) await d(() => P.referral.deleteMany({ where: { id: { in: made.referrals } } }));
  if (made.otps.length) await d(() => P.customerOtp.deleteMany({ where: { id: { in: made.otps } } }));
  if (made.requests.length) await d(() => P.memberPrivacyRequest.deleteMany({ where: { id: { in: made.requests } } }));
  if (made.files.length) await d(() => P.fileAsset.deleteMany({ where: { id: { in: made.files } } }));
  if (made.customers.length) {
    const parties = (await prisma.customer.findMany({ where: { id: { in: made.customers } }, select: { partyId: true } })).map((c) => c.partyId).filter(Boolean) as string[];
    await d(() => P.referral.deleteMany({ where: { OR: [{ referrerCustomerId: { in: made.customers } }, { refereeCustomerId: { in: made.customers } }] } }));
    for (const mdl of [
      "memberPushDevice",
      "customerSession",
      "customerOtp",
      "memberNotification",
      "memberReview",
      "memberPrivacyRequest",
      "memberConsent",
      "memberAttribution",
      "memberTierHistory",
      "memberFieldValue",
      "memberFieldValueHistory",
      "memberChannelIdentity",
      "memberAccessLog",
      "memberActivity",
      "memberAddress",
      "pointLot",
      "pointLedger",
      "pointBalance",
    ]) {
      await d(() => P[mdl]?.deleteMany?.({ where: { customerId: { in: made.customers } } }));
    }
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: made.customers } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: made.customers } } }));
    if (parties.length) {
      await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } }));
      await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } }));
    }
  }
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: "member." }, status: "DONE", createdAt: { gte: new Date(Date.now() - 3600_000) } } }));
  await prisma.$disconnect();
}
const total = cks.length;
const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} FIX-S4: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
