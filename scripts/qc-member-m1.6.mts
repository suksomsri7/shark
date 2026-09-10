// QC — ระบบสมาชิก v2 WO M1.6: สมัคร (โมดัล/ลิงก์/QR) · นำเข้า 3 ขั้น (mapping รวมกำหนดเอง · ตรวจแถว · ตัวเลือกซ้ำ) · ตัวซ้ำ/เปรียบเทียบ/รวมคน 2 ขั้น — ภาพ 10 · 11 · 12
// Fable oracle · Builder ห้ามแตะ · สัญญา ledger/MEMBER-RUN.md §2 M1.6 · พิมพ์เขียว §3.11 §5.2 (importMembers) §6.2 §11.1 §11.9 (import 10,000 แถว)
// requires: member-seed
//
// สัญญาฟังก์ชัน (src/lib/modules/member/import.ts)
//   autoMapping(ctx, headers: string[]) → Record<header, fieldKey|null> (จับคู่ป้ายไทย/อังกฤษของฟิลด์ระบบ+กำหนดเอง เช่น "ชื่อ"→firstName "นามสกุล"→lastName "เบอร์โทร"/"phone"→phone "อีเมล"→email "วันเกิด"→birthDate "ระดับใบรับรอง"→certLevel · ไม่รู้จัก = null)
//   previewImport(ctx, actor, { rows: Record<string,string>[], mapping: Record<header, fieldKey|"skip"> }) → { ok, warn, err, sample: [{ row, status: "ok"|"warn"|"err", message?, duplicateOf?: MemberBrief }] } (ไม่เขียน · err = เบอร์ผิด/ค่านอก choices/บังคับว่าง/ไม่มีเบอร์และอีเมล · warn = ซ้ำสมาชิกเดิม)
//   importMembers(ctx, actor, { rows, mapping, options: { onDuplicate: "update"|"skip"|"candidate", source?: "IMPORT", fileName?, homeUnitId?, tags? } }) → { created, updated, skipped, candidates, failed, errors: [{ row, message }] }
//     แถว err ข้ามและรายงาน (แถวอื่นเดินต่อ) · created ผ่าน profile.createMember (source IMPORT · sourceDetail.fileName) · update = แก้เฉพาะคอลัมน์ที่ส่งมา (ไม่ล้างค่าเดิม) · candidate = สร้างใหม่ + PartyMergeCandidate · > MEMBER_LIMITS.importRows → throw · สิทธิ์ member.customer.import · homeUnitId ต้องอยู่ใน unitAccess · AuditLog member.import {created,updated,skipped} 1 แถว/ครั้ง
//   checkDuplicate(ctx, actor, { phone?, email? }) → MemberBrief|null (เบอร์ปิดบัง) · joinLinkFor(ctx, { src? }) → { url: `${origin}/m/${tenantSlug}/join?src=…`, qrDataUrl }
//   UI: members/new/page.tsx (ภาพ 10) · members/import/page.tsx (ภาพ 12 · 3 ขั้น) · members/duplicates/page.tsx (ภาพ 11) · actions: members-actions.ts (createMemberAction checkDuplicateAction) · import-actions.ts (previewImportAction importMembersAction) · duplicates-actions.ts (mergeMembersAction dismissDuplicateAction) — gate ตาม access.ts hasMemberPerm
//   testid: members-new-form members-new-phone members-new-dup members-new-consents members-new-source members-new-referral members-new-qr members-new-submit · members-import-step-1/2/3 members-import-upload members-import-mapping members-import-preview members-import-dup-option members-import-next (ปุ่มไปขั้นถัดไป) members-import-run members-import-result · members-dup-list members-dup-pair- members-dup-compare members-dup-choice- members-dup-merge members-dup-confirm members-dup-dismiss
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const accEnv = (await import("./acc-v2-env.mts" as string)) as { loadQcEnv: () => { host: string } };
accEnv.loadQcEnv();
import { existsSync, readFileSync, readdirSync } from "node:fs";
if (!existsSync("src/lib/modules/member/import.ts") || !existsSync("src/app/app/sys/[id]/member/members/import/page.tsx")) {
  console.log("⚠️  SKIPPED — WO ยังไม่สร้าง (member/import.ts · members/import/page.tsx)");
  console.log(`JSON_SUMMARY ${JSON.stringify({ total: 0, passed: 0, findings: [], skipped: true })}`);
  process.exit(0);
}
const { prisma } = await import("@/lib/core/db");
const mq = (await import("./member-qc-env.mts" as string)) as { MQC: Any; resolveMemberScope: (p: Any) => Promise<{ tenantId: string; systemId: string } | null> };
type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: unknown, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok: !!ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const fails = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as Error; } };
const thai = (e: Error | null) => !!e && /[ก-๙]/.test(e.message);
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const stripComments = (s: string) => s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const P = prisma as Any;
let tid = ""; let SYS = "";
const num = String(Date.now() % 100_000).padStart(5, "0");
const made = { phones: [] as string[] };
const restore: (() => Promise<unknown>)[] = [];
try {
  const scope = await mq.resolveMemberScope(prisma);
  if (!scope) throw new Error("ยังไม่ได้ seed");
  tid = scope.tenantId; SYS = scope.systemId;
  const E = JSON.parse(readFileSync(mq.MQC.expectedPath, "utf8"));
  const I = (await import("@/lib/modules/member/import" as string)) as Record<string, (...a: Any[]) => Any>;
  const actorOf = async (userId: string) => { const mm = (await prisma.membership.findFirst({ where: { tenantId: tid, userId } }))!; return { userId, role: mm.role as string, unitAccess: mm.unitAccess as string[], permissions: mm.permissions as Record<string, unknown> }; };
  const U = { owner: E.users.owner.userId as string, thana: E.users.staff.thana.userId as string, kata: E.users.staff.kata.userId as string };
  const owner = await actorOf(U.owner); const thana = await actorOf(U.thana); const kata = await actorOf(U.kata);
  const ctxO = { tenantId: tid, systemId: SYS, actorUserId: U.owner }; const ctxT = { ...ctxO, actorUserId: U.thana }; const ctxK = { ...ctxO, actorUserId: U.kata };
  const members: Any[] = E.members; const m = (i: number) => members[i - 1];
  const units = E.units as Record<string, string>;
  const ph = (i: number) => { const p = `089${num}${String(i).padStart(2, "0")}`; made.phones.push(p); return p; };

  // ═══ S1 import service ═══
  const headers = ["ชื่อ", "นามสกุล", "เบอร์โทร", "อีเมล", "วันเกิด", "ระดับใบรับรอง", "จำนวนไดฟ์สะสม", "คอลัมน์แปลก"];
  const map = await I.autoMapping(ctxO, headers);
  chk("M1.6-S1.1", "autoMapping: ชื่อ→firstName · นามสกุล→lastName · เบอร์โทร→phone · อีเมล→email · วันเกิด→birthDate · ระดับใบรับรอง→certLevel (ฟิลด์กำหนดเองจากป้าย) · จำนวนไดฟ์สะสม→diveCount · ไม่รู้จัก → null", map?.["ชื่อ"] === "firstName" && map["นามสกุล"] === "lastName" && map["เบอร์โทร"] === "phone" && map["อีเมล"] === "email" && map["วันเกิด"] === "birthDate" && map["ระดับใบรับรอง"] === "certLevel" && map["จำนวนไดฟ์สะสม"] === "diveCount" && map["คอลัมน์แปลก"] === null, "ครบ", JSON.stringify(map));
  const mapping = { "ชื่อ": "firstName", "นามสกุล": "lastName", "เบอร์โทร": "phone", "อีเมล": "email", "วันเกิด": "birthDate", "ระดับใบรับรอง": "certLevel", "จำนวนไดฟ์สะสม": "diveCount", "คอลัมน์แปลก": "skip" };
  const rows = [
    { "ชื่อ": "นำเข้า", "นามสกุล": "หนึ่ง", "เบอร์โทร": ph(1), "อีเมล": "", "วันเกิด": "1991-01-05", "ระดับใบรับรอง": "Open Water", "จำนวนไดฟ์สะสม": "12", "คอลัมน์แปลก": "x" },
    { "ชื่อ": "นำเข้า", "นามสกุล": "สอง", "เบอร์โทร": ph(2), "อีเมล": `imp2-${num}@example.com`, "วันเกิด": "", "ระดับใบรับรอง": "Advanced", "จำนวนไดฟ์สะสม": "", "คอลัมน์แปลก": "" },
    { "ชื่อ": "นำเข้า", "นามสกุล": "สาม", "เบอร์โทร": "12", "อีเมล": "", "วันเกิด": "", "ระดับใบรับรอง": "", "จำนวนไดฟ์สะสม": "", "คอลัมน์แปลก": "" },
    { "ชื่อ": "นำเข้า", "นามสกุล": "สี่", "เบอร์โทร": ph(4), "อีเมล": "", "วันเกิด": "", "ระดับใบรับรอง": "ไม่มีในตัวเลือก", "จำนวนไดฟ์สะสม": "", "คอลัมน์แปลก": "" },
    { "ชื่อ": "ซ้ำ", "นามสกุล": "สมาชิกเดิม", "เบอร์โทร": m(5).phone, "อีเมล": "", "วันเกิด": "", "ระดับใบรับรอง": "", "จำนวนไดฟ์สะสม": "", "คอลัมน์แปลก": "" },
    { "ชื่อ": "ไม่มีช่องทาง", "นามสกุล": "ห้า", "เบอร์โทร": "", "อีเมล": "", "วันเกิด": "", "ระดับใบรับรอง": "", "จำนวนไดฟ์สะสม": "", "คอลัมน์แปลก": "" },
  ];
  const pv = await I.previewImport(ctxO, owner, { rows, mapping });
  chk("M1.6-S1.2", "previewImport(6 แถว): ok 2 (แถว 1,2) · warn 1 (แถว 5 ซ้ำสมาชิก 5 · duplicateOf brief) · err 3 (เบอร์ '12' · ค่านอก choices · ไม่มีเบอร์/อีเมล) · ไม่เขียน (สมาชิกยัง 60) · ข้อความ err ไทย", pv?.ok === 2 && pv.warn === 1 && pv.err === 3 && pv.sample?.length === 6 && pv.sample[4].status === "warn" && pv.sample[4].duplicateOf?.id === m(5).id && [2, 3, 5].every((i) => pv.sample[i].status === "err" && /[ก-๙]/.test(pv.sample[i].message ?? "")) && (await prisma.customer.count({ where: { memberSystemId: SYS, phone: { in: made.phones } } })) === 0, "2/1/3", JSON.stringify({ ok: pv?.ok, warn: pv?.warn, err: pv?.err, s: pv?.sample?.map((x: Any) => x.status) }));
  const r1 = await I.importMembers(ctxO, owner, { rows, mapping, options: { onDuplicate: "skip", fileName: "qc16.csv", homeUnitId: units.patong, tags: ["import-qc"] } });
  const c1 = (await prisma.customer.findFirst({ where: { memberSystemId: SYS, phone: made.phones[0] } })) as Any;
  const F = (await import("@/lib/modules/member/fields" as string)) as Any;
  const fv = c1 ? await F.getFieldValues(ctxO, [c1.id]) : {};
  const att = c1 ? await P.memberAttribution.findFirst({ where: { customerId: c1.id, touch: "FIRST" } }) : null;
  chk("M1.6-S1.3", "importMembers(skip): {created 2, updated 0, skipped 1 (ซ้ำ), failed 3, errors[3]{row,message}} · สมาชิกใหม่ source IMPORT · sourceDetail.fileName · attribution FIRST IMPORT · homeUnit ป่าตอง · tags · certLevel/diveCount ผ่าน engine · birthDate · AuditLog member.import 1 แถว", r1?.created === 2 && r1.updated === 0 && r1.skipped === 1 && r1.failed === 3 && r1.errors?.length === 3 && r1.errors.every((e: Any) => typeof e.row === "number" && /[ก-๙]/.test(e.message)) && c1?.source === "IMPORT" && (c1.sourceDetail as Any)?.fileName === "qc16.csv" && att?.source === "IMPORT" && c1.homeUnitId === units.patong && JSON.stringify(c1.tags) === JSON.stringify(["import-qc"]) && fv[c1.id]?.certLevel === "Open Water" && fv[c1.id].diveCount === 12 && c1.birthDate && new Date(c1.birthDate).toISOString().startsWith("1991-01-05") && (await prisma.auditLog.count({ where: { tenantId: tid, action: { contains: "member.import" } } })) >= 1, "2/0/1/3", JSON.stringify({ r1, src: c1?.source, fv: fv?.[c1?.id] }).slice(0, 220));
  const c5before = (await prisma.customer.findUnique({ where: { id: m(5).id } })) as Any;
  restore.push(() => prisma.customer.update({ where: { id: m(5).id }, data: { nickname: c5before.nickname, firstName: c5before.firstName, lastName: c5before.lastName, name: c5before.name } }));
  const r2 = await I.importMembers(ctxO, owner, { rows: [{ "เบอร์โทร": m(5).phone, "ชื่อเล่น": "นิคนำเข้า" }], mapping: { "เบอร์โทร": "phone", "ชื่อเล่น": "nickname" }, options: { onDuplicate: "update" } });
  const c5 = (await prisma.customer.findUnique({ where: { id: m(5).id } })) as Any;
  chk("M1.6-S1.4", "onDuplicate update: แถวซ้ำ (เบอร์สมาชิก 5) → updated 1 · nickname เปลี่ยน · firstName/lastName/name เดิมคง (ไม่ล้าง) · event member.updated", r2?.updated === 1 && r2.created === 0 && c5.nickname === "นิคนำเข้า" && c5.firstName === c5before.firstName && c5.name === c5before.name && (await P.outboxEvent.count({ where: { tenantId: tid, type: "member.updated", payload: { path: ["customerId"], equals: m(5).id } } })) >= 1, "updated 1", JSON.stringify({ r2, nick: c5?.nickname, first: c5?.firstName === c5before.firstName }));
  const r3 = await I.importMembers(ctxO, owner, { rows: [{ "เบอร์โทร": ph(6), "ชื่อ": c5before.firstName ?? "สมาชิก", "นามสกุล": c5before.lastName ?? "ห้า" }], mapping: { "เบอร์โทร": "phone", "ชื่อ": "firstName", "นามสกุล": "lastName" }, options: { onDuplicate: "candidate" } });
  const c6 = (await prisma.customer.findFirst({ where: { memberSystemId: SYS, phone: made.phones[made.phones.length - 1] } })) as Any;
  const cand = c6 ? await prisma.partyMergeCandidate.findFirst({ where: { tenantId: tid, OR: [{ partyAId: c6.partyId }, { partyBId: c6.partyId }] } }) : null;
  chk("M1.6-S1.5", "onDuplicate candidate: ชื่อเหมือนสมาชิก 5 แต่เบอร์ใหม่ → created 1 + candidates 1 (PartyMergeCandidate ชื่อคล้าย OPEN) · โผล่ใน findDuplicates", r3?.created === 1 && r3.candidates === 1 && !!cand && cand.status === "OPEN", "candidate", JSON.stringify({ r3, cand: !!cand }));
  const big = Array.from({ length: 10_001 }, (_, i) => ({ "เบอร์โทร": `0800${String(i).padStart(6, "0")}` }));
  const eBig = await fails(() => I.previewImport(ctxO, owner, { rows: big, mapping: { "เบอร์โทร": "phone" } }));
  const eT = await fails(() => I.importMembers(ctxT, thana, { rows: [{ "เบอร์โทร": "0899999901" }], mapping: { "เบอร์โทร": "phone" }, options: { onDuplicate: "skip" } }));
  const eK = await fails(() => I.importMembers(ctxK, { ...kata, permissions: { ...kata.permissions, "member.customer.import": true } }, { rows: [{ "เบอร์โทร": "0899999902" }], mapping: { "เบอร์โทร": "phone" }, options: { onDuplicate: "skip", homeUnitId: units.patong } }));
  const eMap = await fails(() => I.importMembers(ctxO, owner, { rows: [{ a: "x" }], mapping: { a: "ghost_field" }, options: { onDuplicate: "skip" } }));
  chk("M1.6-S1.6", "เพดาน MEMBER_LIMITS.importRows 10,000 → 10,001 แถว throw ไทย LIMIT · thana (ไม่มี member.customer.import) → throw · STAFF กะตะ homeUnitId ป่าตอง → throw · mapping ไปฟิลด์ที่ไม่มี → throw · ไม่มีแถวค้าง", thai(eBig) && /LIMIT/.test(eBig?.message ?? "") && thai(eT) && thai(eK) && thai(eMap) && (await prisma.customer.count({ where: { memberSystemId: SYS, phone: { in: ["0899999901", "0899999902"] } } })) === 0, "throw ×4", `${[eBig, eT, eK, eMap].map((e) => !!e).join("/")}`);
  const r4 = await I.importMembers(ctxO, owner, { rows, mapping, options: { onDuplicate: "skip" } });
  chk("M1.6-S1.7", "นำเข้าซ้ำแถวเดิม (skip) → created 0 · skipped 3 (2 ที่เพิ่งสร้าง + สมาชิก 5) · failed 3 · ไม่มีสมาชิกเพิ่ม", r4?.created === 0 && r4.skipped === 3 && r4.failed === 3 && (await prisma.customer.count({ where: { memberSystemId: SYS, phone: { in: made.phones } } })) === 3, "0/3/3", JSON.stringify(r4));
  const dup = await I.checkDuplicate(ctxO, owner, { phone: m(9).phone });
  const dupE = await I.checkDuplicate(ctxO, owner, { email: m(8).email });
  const none = await I.checkDuplicate(ctxO, owner, { phone: "0800000000" });
  const link = await I.joinLinkFor(ctxO, {});
  const linkSrc = await I.joinLinkFor(ctxO, { src: "QR1" });
  const tenant = (await prisma.tenant.findUnique({ where: { id: tid } }))!;
  chk("M1.6-S1.8", "checkDuplicate(phone) → brief สมาชิก 9 (เบอร์ปิดบัง · ไม่มีเบอร์เต็ม) · (email) → สมาชิก 8 · ไม่พบ → null · joinLinkFor → url /m/{slug}/join (+?src=) + qrDataUrl data:image/png", dup?.id === m(9).id && /[x*]/.test(dup.phoneMasked ?? "") && !JSON.stringify(dup).includes(m(9).phone) && dupE?.id === m(8).id && none === null && link?.url?.endsWith(`/m/${tenant.slug}/join`) && linkSrc?.url?.endsWith(`/m/${tenant.slug}/join?src=QR1`) && /^data:image\/png/.test(link.qrDataUrl ?? ""), "ครบ", JSON.stringify({ dup: dup?.id === m(9).id, e: dupE?.id === m(8).id, none, url: link?.url, qr: (link?.qrDataUrl ?? "").slice(0, 20) }));

  // ═══ S2 static: หน้าสมัคร / นำเข้า / ตัวซ้ำ ═══
  const pNew = read("src/app/app/sys/[id]/member/members/new/page.tsx"); const pImp = read("src/app/app/sys/[id]/member/members/import/page.tsx"); const pDup = read("src/app/app/sys/[id]/member/members/duplicates/page.tsx");
  const aM = read("src/lib/modules/member/members-actions.ts"); const aI = read("src/lib/modules/member/import-actions.ts"); const aD = read("src/lib/modules/member/duplicates-actions.ts");
  const uiAll = readdirSync("src/components/member").filter((f) => f.endsWith(".tsx")).map((f) => read(`src/components/member/${f}`)).join("\n");
  const T1 = ["members-new-form", "members-new-phone", "members-new-dup", "members-new-consents", "members-new-source", "members-new-referral", "members-new-qr", "members-new-submit"];
  chk("M1.6-S2.1", "หน้าสมัคร (ภาพ 10): page requireTenant + hasMemberPerm(member.customer.create) (ไม่มี = notFound) · ฟอร์มจาก listLayout (ส่วน/ฟิลด์ตามเลย์เอาต์ · ส่วนอ่อนไหวตาม canViewSensitive) · testid 8 · ตรวจซ้ำสด (checkDuplicateAction เมื่อพิมพ์เบอร์ครบ) · ที่มา (MemberSource label ไทย) · ผู้แนะนำ (stub ป้าย M3.5) · consent จาก consentChannels() · QR/ลิงก์ให้ลูกค้ากรอกเอง (joinLinkFor) · members-actions.ts 'use server' gate member.customer.create", /requireTenant/.test(pNew) && /notFound/.test(pNew) && /member\.customer\.create/.test(pNew + aM) && /listLayout/.test(pNew) && T1.every((t) => (pNew + uiAll).includes(t)) && /checkDuplicate\w*Action/.test(uiAll) && /consentChannels/.test(pNew + uiAll) && /joinLinkFor/.test(pNew) && /^\s*"use server"/m.test(aM) && /createMember\w*Action/.test(aM), "ครบ", `missing=${T1.filter((t) => !(pNew + uiAll).includes(t)).join(",")}`);
  const T2 = ["members-import-step-1", "members-import-step-2", "members-import-step-3", "members-import-upload", "members-import-mapping", "members-import-preview", "members-import-dup-option", "members-import-next", "members-import-run", "members-import-result"];
  chk("M1.6-S2.2", "หน้านำเข้า (ภาพ 12): 3 ขั้น (อัปโหลด CSV → จับคู่คอลัมน์ (autoMapping + dropdown ฟิลด์ทั้งหมดรวมกำหนดเอง) → ตรวจแถว ok/warn/err + ตัวเลือกซ้ำ 3 โหมด → นำเข้า → ผล) · parse CSV ฝั่ง client (ไม่ส่งไฟล์ขึ้น server) · testid 9 · import-actions.ts gate member.customer.import · หน้าเก่า /member/import → redirect", /requireTenant/.test(pImp) && /member\.customer\.import/.test(pImp + aI) && T2.every((t) => (pImp + uiAll).includes(t)) && /autoMapping/.test(pImp + aI + uiAll) && /previewImport\w*Action/.test(uiAll) && /importMembers\w*Action/.test(uiAll) && /update|skip|candidate/.test(uiAll) && /redirect\(/.test(read("src/app/app/sys/[id]/member/import/page.tsx")), "ครบ", `missing=${T2.filter((t) => !(pImp + uiAll).includes(t)).join(",")} redirect=${/redirect\(/.test(read("src/app/app/sys/[id]/member/import/page.tsx"))}`);
  const T3 = ["members-dup-list", "members-dup-pair-", "members-dup-compare", "members-dup-choice-", "members-dup-merge", "members-dup-confirm", "members-dup-dismiss"];
  chk("M1.6-S2.3", "หน้าตัวซ้ำ (ภาพ 11): findDuplicates → รายการคู่ (เหตุผลไทย · คะแนน) → เปรียบเทียบข้างกัน (เลือกค่าต่อฟิลด์ A/B → fieldChoices) → รวม 2 ขั้น (พิมพ์ MERGE ยืนยัน · ConfirmDialog) → mergeMembersAction · ไม่ใช่คนเดียวกัน → dismissDuplicateAction · testid 7 · gate member.customer.merge · ผลลัพธ์ pending (MANAGER) แสดง 'รออนุมัติ'", /requireTenant/.test(pDup) && /member\.customer\.merge/.test(pDup + aD) && /findDuplicates/.test(pDup) && T3.every((t) => (pDup + uiAll).includes(t)) && /fieldChoices/.test(uiAll) && /MERGE/.test(uiAll) && /mergeMembers\w*Action/.test(aD) && /dismissDuplicate\w*Action/.test(aD) && /รออนุมัติ/.test(uiAll) && !EMOJI.test(stripComments(uiAll)), "ครบ", `missing=${T3.filter((t) => !(pDup + uiAll).includes(t)).join(",")}`);

  // ═══ S3 ภาพ ═══
  const dir = `${mq.MQC.shotsDir}/1.6`;
  const shots = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  const sumOf = (u: string) => (existsSync(`${dir}/summary-${u}.json`) ? JSON.parse(read(`${dir}/summary-${u}.json`)) : null);
  const r = (u: string, n: string, d: string) => sumOf(u)?.results?.find((x: Any) => x.name === n && x.device === d);
  const okShot = (u: string, n: string, d: string) => r(u, n, d)?.status === 200 && r(u, n, d)?.missing?.length === 0 && r(u, n, d)?.errors?.length === 0;
  chk("M1.6-S3.1", "ภาพ 10: members-new-owner desktop+mobile 200 · thana (มี create) 200", okShot("owner", "members-new-owner", "desktop") && okShot("owner", "members-new-owner", "mobile") && okShot("thana", "members-new-thana", "desktop"), "200 ×3", `${r("owner", "members-new-owner", "desktop")?.status}/${r("owner", "members-new-owner", "mobile")?.status}/${r("thana", "members-new-thana", "desktop")?.status}`, "MAJOR");
  chk("M1.6-S3.2", "ภาพ 12: members-import-owner (ขั้น 1) 200 · members-import-mapping-desktop (หลังอัปโหลด fixture.csv → ขั้น 2 มีตาราง mapping) · members-import-preview-desktop (ขั้น 3) · thana (ไม่มี import) → 404", okShot("owner", "members-import-owner", "desktop") && okShot("owner", "members-import-mapping", "desktop") && okShot("owner", "members-import-preview", "desktop") && r("thana", "members-import-thana", "desktop")?.status === 404, "200 ×3 · 404", `${r("owner", "members-import-owner", "desktop")?.status}/${r("owner", "members-import-mapping", "desktop")?.status}/${r("owner", "members-import-preview", "desktop")?.status}/${r("thana", "members-import-thana", "desktop")?.status}`, "MAJOR");
  chk("M1.6-S3.3", "ภาพ 11: members-duplicates-owner 200 (มีคู่จาก seed/harness) · members-dup-compare-desktop (คลิกคู่แรก → เปรียบเทียบ) · PARITY: ผ่าน ใน wo-notes/member-M1.6.md", okShot("owner", "members-duplicates-owner", "desktop") && okShot("owner", "members-dup-compare", "desktop") && /PARITY:\s*ผ่าน/.test(read("ledger/wo-notes/member-M1.6.md")), "200 ×2 · PARITY", `${r("owner", "members-duplicates-owner", "desktop")?.status}/${r("owner", "members-dup-compare", "desktop")?.status}`, "MAJOR");
} catch (e) {
  console.error("💥", e);
  chk("M1.6-ERR", "ข้อสอบรันจนจบ", false, "จบ", String((e as Error)?.message ?? e).slice(0, 200));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ignore */ } };
  for (const rr of restore) await d(rr);
  const custs = made.phones.length ? await prisma.customer.findMany({ where: { memberSystemId: SYS, phone: { in: made.phones } }, select: { id: true, partyId: true } }) : [];
  const ids = custs.map((c) => c.id); const parties = custs.map((c) => c.partyId).filter(Boolean) as string[];
  if (ids.length) {
    for (const mdl of ["memberConsent", "memberAttribution", "memberTierHistory", "memberFieldValue", "memberFieldValueHistory", "memberChannelIdentity", "memberAccessLog", "memberActivity", "pointLedger", "pointBalance"]) await d(() => P[mdl].deleteMany({ where: { customerId: { in: ids } } }));
    await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, targetId: { in: ids } } }));
    await d(() => prisma.customer.deleteMany({ where: { id: { in: ids } } }));
    if (parties.length) { await d(() => prisma.partyMergeCandidate.deleteMany({ where: { OR: [{ partyAId: { in: parties } }, { partyBId: { in: parties } }] } })); await d(() => prisma.party.deleteMany({ where: { id: { in: parties } } })); }
  }
  await d(() => prisma.auditLog.deleteMany({ where: { tenantId: tid, action: { contains: "member.import" } } }));
  await d(() => P.outboxEvent.deleteMany({ where: { tenantId: tid, type: { startsWith: "member." }, status: "DONE" } }));
  await prisma.$disconnect();
}
const total = cks.length; const passed = cks.filter((c) => c.ok).length;
const findings = cks.filter((c) => !c.ok).map((c) => ({ id: c.id, sev: c.sev }));
console.log(`\n${passed === total ? "🟢" : "🔴"} M1.6: ${passed}/${total}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total, passed, findings })}`);
process.exit(passed === total ? 0 : 1);
