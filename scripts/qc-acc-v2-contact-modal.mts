// QC WO 3.3 — modal ผู้ติดต่อ พื้นฐาน/ขั้นสูง + DBD + เตือนซ้ำ + normalize เบอร์ + เชื่อมสมาชิก/CRM
// (src/lib/modules/account/service.ts · dbd.ts · contact-links.ts · actions.ts · components/account-v2/ContactModal.tsx)
//
// requires: acc-v2-seed
// ↑ marker (WO 0.7) — qc-all.mts เห็นบรรทัดนี้แล้ว seed ชุดข้อมูล QC ให้ก่อนรัน (ครั้งเดียวต่อ shard)
//
// รัน (บังคับ DB QC branch — .env = prod ห้ามแตะ):
//   pnpm exec tsx scripts/qc-acc-v2-contact-modal.mts
//
// ครอบคลุม (BLUEPRINT §3 แถว 3.3 · DESIGN-SPEC-V2 §7.2 · §9.3):
//   P1  สร้างผ่านช่องครบทุกช่องของ §7.2 → เก็บครบ · เลขที่ auto · Party ผูกให้ · `address` สตริงรวมตรงช่องแยก
//   P2  normalize เบอร์: "08-1234-5678" · "+66 81 234 5678" · "08-1234" (เกณฑ์ผ่านของ BLUEPRINT)
//   P3  เตือนซ้ำ: เลขภาษี+สาขาเดิม = blocking payload {id,code,name} · เบอร์ซ้ำ/ชื่อซ้ำ = warning ·
//       นโยบาย §9.3 "ห้าม" ทำให้ warning กลายเป็นห้าม
//   P4  DBD adapter (ฉีด fetch ปลอม — ไม่มีเน็ต): ไม่มีกุญแจ · สำเร็จ · timeout · 404 · เลขผิดรูปแบบ
//   P5  เชื่อมสมาชิก/CRM: suggestLinks เจอแถวสาธิตของ seed (ปิยธิดา=สมาชิก · สมชาย=CRM) →
//       linkContactTo ทำให้ partyId ทั้ง 2 ฝั่งเท่ากัน (เขียนผ่าน facade ของโมดูลนั้น)
//   P6  เลขที่ไม่ซ้ำเมื่อสร้างพร้อมกัน 5 ราย (Promise.all) → ได้ 5 เลขต่างกัน
//   P7  guard: action ใหม่ทุกตัวเรียก assertAccountCan · STAFF ไม่มีสิทธิ์ = ถูกปฏิเสธ · OWNER ผ่าน
//   P8  updateContact เติม partyId ให้แถวที่ยังไม่มี (ปิดหนี้ wo-notes/3.1.md)
//   P9  กลุ่มกำหนดเอง: setContactGroups ตั้งชุดใหม่/ถอดออก · idempotent
//   P10 UI: ContactModal มีองค์ประกอบครบตาม checklist g5 (ตรวจ testid/ป้ายไทยในไฟล์ — ภาพจริงถ่ายด้วย visual-acc-v2)
//
// 🔴 ทุกแถวที่สร้างที่นี่ต้องถูกลบใน finally — ตัวนับผู้ติดต่อ 63 ของ acc-v2-expected.json
//    เป็นเฉลยของ qc-acc-v2-contacts/seed-check ถ้าเหลือขยะไว้ ชุดอื่นแดงทันที

import { readFileSync } from "node:fs";

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { tenantName: string };
  resolveAccV2Scope: (p: unknown) => Promise<{ tenantId: string; systemId: string } | null>;
};
const { loadQcEnv, resolveAccV2Scope } = accEnv;
const { host } = loadQcEnv();

const { prisma } = await import("@/lib/core/db");
const svc = await import("@/lib/modules/account/service");
const dbd = await import("@/lib/modules/account/dbd");
const links = await import("@/lib/modules/account/contact-links");
const cl = await import("@/lib/modules/account/contacts-list");
const memberSvc = await import("@/lib/modules/member/service");
const crmSvc = await import("@/lib/modules/crm/service");
const { assertAccountCan } = await import("@/lib/modules/account/access");

let passed = 0;
const findings: string[] = [];
const ok = (name: string) => {
  passed++;
  console.log("  ✅ " + name);
};
const bad = (name: string, detail: string) => {
  findings.push(name + " — " + detail);
  console.log("  ❌ " + name + " — " + detail);
};
const eq = (name: string, got: unknown, want: unknown) =>
  JSON.stringify(got) === JSON.stringify(want) ? ok(name) : bad(name, `ได้ ${JSON.stringify(got)} ต้องการ ${JSON.stringify(want)}`);

const scope = await resolveAccV2Scope(prisma as never);
if (!scope) {
  console.error("❌ ยังไม่ได้ seed ชุดข้อมูล QC บัญชี V2 — รัน scripts/seed-acc-v2-qc.mts ก่อน");
  process.exit(2);
}
const { tenantId, systemId } = scope;
const ctx = { tenantId, systemId };
console.log(`QC WO 3.3 — modal ผู้ติดต่อ · host ${host} · system ${systemId}`);

// ทุกแถวที่สร้างในชุดนี้ติดป้ายไว้ที่ note เพื่อกวาดทิ้งได้แน่นอนแม้สคริปต์ตายกลางทาง
const TAG = "QC33";
const madeContactIds = new Set<string>();
const madePartyIds = new Set<string>();
let tempTenantId = "";

/** ล้างซากของรอบก่อน (สคริปต์ล้มกลางทาง) ก่อนเริ่ม — ไม่งั้นตัวนับ 63 เพี้ยนตั้งแต่ต้น */
async function sweepStale() {
  const stale = await prisma.accountContact.findMany({
    where: { systemId, note: { startsWith: TAG } },
    select: { id: true, partyId: true },
  });
  if (stale.length === 0) return;
  await prisma.accountContactGroupMember.deleteMany({ where: { contactId: { in: stale.map((s) => s.id) } } });
  await prisma.accountContact.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  const pids = stale.map((s) => s.partyId).filter((x): x is string => !!x);
  if (pids.length > 0) await prisma.party.deleteMany({ where: { id: { in: pids }, tenantId } });
  console.log(`  (กวาดซากรอบก่อน ${stale.length} แถว)`);
}
await sweepStale();

const track = <T extends { id: string; partyId: string | null }>(c: T): T => {
  madeContactIds.add(c.id);
  if (c.partyId) madePartyIds.add(c.partyId);
  return c;
};

try {
  // ═══════════ P1 สร้างครบทุกช่องของ §7.2 ═══════════
  console.log("\nP1 สร้างผู้ติดต่อผ่านช่องครบชุด §7.2:");
  const maxBefore = await svc.nextContactCode(systemId);
  const created = track(
    await svc.createContact({
      tenantId,
      systemId,
      kind: "BOTH",
      legalType: "COMPANY",
      name: `${TAG} บจก. ทดสอบโมดัล`,
      taxId: "0105591234567",
      taxIdCountry: "TH",
      branchCode: "00001",
      officeType: "BRANCH",
      legalEntityType: "บริษัทจำกัด",
      personTitle: null,
      contactPerson: "คุณทดสอบ",
      addressLine: "191 ถ.ราษฎร์อุทิศ",
      subdistrict: "รัษฎา",
      district: "เมือง",
      province: "ภูเก็ต",
      postcode: "83000",
      country: "TH",
      phone: "08-1234-5678",
      email: "qc33@example.com",
      website: "example.co.th",
      fax: "076-311-221",
      lineId: "@qc33",
      creditTermDays: 30,
      defaultPriceMode: "EXCL_VAT",
      defaultWhtType: "M40_8",
      defaultWhtRateBp: 300,
      bankAccountNote: "กสิกรไทย 123-4-56789-0",
      arAccountCode: "1101",
      apAccountCode: "2001",
      tags: ["ลูกค้าองค์กร", "ลูกค้าองค์กร", " ทดสอบ "],
      note: `${TAG} แถวทดสอบ`,
    }),
  );
  const row = await prisma.accountContact.findFirst({ where: { id: created.id } });
  eq("P1.1 เลขที่ออกอัตโนมัติต่อจากเลขสูงสุด", row?.code, maxBefore);
  eq("P1.2 ประเภท/รูปแบบ/สาขา", [row?.kind, row?.legalType, row?.officeType, row?.branchCode], ["BOTH", "COMPANY", "BRANCH", "00001"]);
  eq("P1.3 ที่อยู่แยกช่องเก็บครบ", [row?.subdistrict, row?.district, row?.province, row?.postcode], ["รัษฎา", "เมือง", "ภูเก็ต", "83000"]);
  eq("P1.4 `address` สตริงรวม (ของเดิมที่ใบกำกับพิมพ์) ถูกประกอบให้", row?.address, "191 ถ.ราษฎร์อุทิศ ต.รัษฎา อ.เมือง ภูเก็ต 83000");
  eq("P1.5 ช่องทางติดต่อครบ (เว็บ/แฟกซ์/LINE)", [row?.website, row?.fax, row?.lineId], ["example.co.th", "076-311-221", "@qc33"]);
  eq("P1.6 ขั้นสูงครบ (เครดิต/ราคา/WHT/บัญชีเฉพาะราย)", [row?.creditTermDays, row?.defaultPriceMode, row?.defaultWhtType, row?.defaultWhtRateBp, row?.arAccountCode, row?.apAccountCode], [30, "EXCL_VAT", "M40_8", 300, "1101", "2001"]);
  eq("P1.7 แท็กตัดช่องว่าง + ตัดตัวซ้ำ", row?.tags, ["ลูกค้าองค์กร", "ทดสอบ"]);
  row?.partyId ? ok("P1.8 ผูก Party ให้ตอนสร้าง (WO 3.1)") : bad("P1.8 ผูก Party ให้ตอนสร้าง", "partyId = null");

  // ═══════════ P2 normalize เบอร์ ═══════════
  console.log("\nP2 normalize เบอร์ (เกณฑ์ผ่าน BLUEPRINT แถว 3.3):");
  eq('P2.1 "08-1234" → "081234"', svc.normalizePhoneTh("08-1234"), "081234");
  eq('P2.2 "08-1234-5678" → "0812345678"', svc.normalizePhoneTh("08-1234-5678"), "0812345678");
  eq('P2.3 "+66 81 234 5678" → "0812345678"', svc.normalizePhoneTh("+66 81 234 5678"), "0812345678");
  eq("P2.4 เขียนลง phoneNorm จริงตอนสร้าง", row?.phoneNorm, "0812345678");
  const c2 = track(
    await svc.createContact({ tenantId, systemId, kind: "CUSTOMER", name: `${TAG} เบอร์ +66`, phone: "+66 81 234 5678", note: `${TAG} b` }),
  );
  const r2 = await prisma.accountContact.findFirst({ where: { id: c2.id }, select: { phoneNorm: true } });
  eq("P2.5 รูปแบบ +66 ให้ phoneNorm เดียวกับเลนดิบ", r2?.phoneNorm, "0812345678");

  // ═══════════ P3 เตือนซ้ำ + นโยบาย §9.3 ═══════════
  console.log("\nP3 เตือนซ้ำ (§7.2) + นโยบายชื่อซ้ำ (§9.3):");
  const dupTax = await svc.checkContactDuplicates(tenantId, systemId, { taxId: "0105591234567", branchCode: "00001", name: "ชื่ออื่นไปเลย" });
  eq("P3.1 เลขภาษี+สาขาซ้ำ = blocking 1 รายการ", dupTax.blocking.length, 1);
  eq("P3.2 payload มี {id, code, name} ให้ทำลิงก์ 'เปิด C000xx'", [dupTax.blocking[0]?.id === created.id, dupTax.blocking[0]?.code === row?.code, dupTax.blocking[0]?.name === row?.name], [true, true, true]);
  eq("P3.3 เหตุ = taxId", dupTax.blocking[0]?.reason, "taxId");
  const dupPhone = await svc.checkContactDuplicates(tenantId, systemId, { phone: "081-234-5678", name: `${TAG} คนละราย` });
  dupPhone.blocking.length === 0 && dupPhone.warnings.length >= 1 && dupPhone.warnings.some((w) => w.reason === "phone")
    ? ok("P3.4 เบอร์ซ้ำ = เตือน (ไม่ใช่ห้าม)")
    : bad("P3.4 เบอร์ซ้ำ = เตือน (ไม่ใช่ห้าม)", `blocking=${dupPhone.blocking.length} warnings=${JSON.stringify(dupPhone.warnings.map((w) => w.reason))}`);
  const dupName = await svc.checkContactDuplicates(tenantId, systemId, { name: `${TAG} บจก. ทดสอบโมดัล` });
  dupName.warnings.some((w) => w.reason === "name" || w.reason === "phone")
    ? ok("P3.5 ชื่อซ้ำเป๊ะ = เตือน")
    : bad("P3.5 ชื่อซ้ำเป๊ะ = เตือน", JSON.stringify(dupName));
  eq("P3.6 นโยบายเริ่มต้น = เตือน", dupName.policy, "warn");
  eq("P3.7 นโยบาย 'เตือน' → warning บันทึกต่อได้ (ต้องยืนยัน)", svc.contactDuplicateBlocks(dupPhone), null);
  // สลับนโยบายเป็น "ห้าม" แล้วต้องบล็อก
  // 🔴 WO 8.2: นโยบายนี้ย้ายจาก `docConfig.dupNamePolicy` ขึ้นคอลัมน์ `dupContactPolicy` แล้ว
  //    ⇒ ต้องสลับผ่าน API จริง (`policy.savePolicy`) ไม่ใช่เขียน JSON ตรง ๆ เหมือนเดิม
  //    (เขียน JSON แล้วเทสเขียวทั้งที่ของจริงไม่เปลี่ยน = เทสหลอกตา)
  const polMod = await import("@/lib/modules/account/policy");
  const savedBlock = await polMod.savePolicy(ctx, { dupContactPolicy: "BLOCK" });
  eq("P3.7b สลับนโยบายผ่านหน้าตั้งค่าได้", savedBlock.ok, true);
  const dupPhoneBlock = await svc.checkContactDuplicates(tenantId, systemId, { phone: "081-234-5678", name: `${TAG} คนละราย` });
  eq("P3.8 นโยบาย 'ห้าม' → เบอร์ซ้ำกลายเป็นห้ามบันทึก", svc.contactDuplicateBlocks(dupPhoneBlock)?.reason, "phone");
  eq("P3.9 policy ที่คืนมาบอกค่าจริง", dupPhoneBlock.policy, "block");
  // คืนค่าเดิมทันที (ชุดข้อมูล QC seed ไว้เป็น "เตือน" — ชุดอื่นอ่านค่าเดียวกัน)
  await polMod.savePolicy(ctx, { dupContactPolicy: "WARN" });
  eq("P3.10 คืนนโยบายเดิมแล้ว", await svc.getDupNamePolicy(systemId), "warn");
  // ทางถอย: ร้านเก่าที่ยังไม่เคยเปิดหน้านโยบาย (คอลัมน์ null) ต้องอ่านค่าเดิมจาก docConfig ได้อยู่
  {
    const row = await prisma.accountSettings.findFirstOrThrow({ where: { systemId }, select: { id: true, docConfig: true } });
    const prevCfg = (row.docConfig as Record<string, unknown> | null) ?? {};
    await prisma.accountSettings.update({
      where: { id: row.id },
      data: { dupContactPolicy: null, docConfig: { ...prevCfg, dupNamePolicy: "block" } as never },
    });
    eq("P3.10b คอลัมน์ว่าง → อ่านค่าเดิมจาก docConfig.dupNamePolicy (ร้านก่อน WO 8.2 ไม่หายค่า)", await svc.getDupNamePolicy(systemId), "block");
    await prisma.accountSettings.update({
      where: { id: row.id },
      data: { dupContactPolicy: "WARN", docConfig: prevCfg as never },
    });
    eq("P3.10c คืนค่าเดิมครบ", await svc.getDupNamePolicy(systemId), "warn");
  }
  const dupSelf = await svc.checkContactDuplicates(tenantId, systemId, { taxId: "0105591234567", branchCode: "00001", excludeId: created.id });
  eq("P3.11 แก้ไขตัวเอง = ไม่เตือนว่าซ้ำกับตัวเอง", dupSelf.blocking.length, 0);

  // ═══════════ P4 DBD adapter (fetch ปลอม — ไม่มีเน็ต) ═══════════
  console.log("\nP4 ตัวเชื่อมกรมพัฒน์ฯ (dbd.ts):");
  const okPayload = {
    status: { code: "1000" },
    data: [
      {
        "cd:OrganizationJuristicPerson": {
          "cd:OrganizationJuristicNameTH": "บริษัท อันดามัน ทราเวล จำกัด",
          "cd:OrganizationJuristicNameEN": "ANDAMAN TRAVEL CO., LTD.",
          "cd:OrganizationJuristicStatus": "ยังดำเนินกิจการอยู่",
          "cd:AddressType": {
            "cd:AddressNo": "191",
            "cd:Street": "ราษฎร์อุทิศ",
            "cd:CitySubDivisionText": "รัษฎา",
            "cd:CityText": "เมืองภูเก็ต",
            "cd:CountrySubDivisionText": "ภูเก็ต",
            "cd:PostCode": "83000",
          },
        },
      },
    ],
  };
  const fakeOk = async () => new Response(JSON.stringify(okPayload), { status: 200, headers: { "content-type": "application/json" } });
  const resOk = await dbd.lookupJuristic("0105591234567", { apiKey: "TEST", fetchImpl: fakeOk as never });
  resOk.ok && resOk.name === "บริษัท อันดามัน ทราเวล จำกัด"
    ? ok("P4.1 ยิงสำเร็จ → ได้ชื่อนิติบุคคลไทย")
    : bad("P4.1 ยิงสำเร็จ → ได้ชื่อนิติบุคคลไทย", JSON.stringify(resOk));
  eq(
    "P4.2 แกะที่อยู่แยกช่องได้ครบ (เอาไปเติมช่องของ modal ได้ตรง)",
    resOk.ok ? [resOk.address.addressLine, resOk.address.subdistrict, resOk.address.district, resOk.address.province, resOk.address.postcode] : null,
    ["191 ถ.ราษฎร์อุทิศ", "รัษฎา", "เมืองภูเก็ต", "ภูเก็ต", "83000"],
  );
  const resNoKey = await dbd.lookupJuristic("0105591234567", { apiKey: "", fetchImpl: fakeOk as never });
  eq("P4.3 ไม่มีกุญแจ = ok:false + เหตุผลภาษาคน (ปุ่มจาง)", !resNoKey.ok && resNoKey.reason === dbd.DBD_REASON.noKey, true);
  eq("P4.4 isDbdConfigured() ตรงกับ env จริง", dbd.isDbdConfigured(), !!(process.env.DBD_API_KEY ?? "").trim());
  const fakeTimeout = (_u: string, init?: RequestInit) =>
    new Promise<Response>((_res, rej) => {
      const sig = init?.signal;
      if (sig?.aborted) return rej(Object.assign(new Error("aborted"), { name: "AbortError" }));
      sig?.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
  const t0 = Date.now();
  const resTimeout = await dbd.lookupJuristic("0105591234567", { apiKey: "TEST", fetchImpl: fakeTimeout as never, timeoutMs: 300 });
  const elapsed = Date.now() - t0;
  eq("P4.5 ช้าเกินกำหนด = ok:false เหตุผล 'timeout' (ไม่แขวนคำขอผู้ใช้)", !resTimeout.ok && resTimeout.reason === dbd.DBD_REASON.timeout, true);
  elapsed < 2000 ? ok(`P4.6 ตัดจริงตาม timeout ที่ตั้ง (${elapsed} ms)`) : bad("P4.6 ตัดจริงตาม timeout", `${elapsed} ms`);
  const fake404 = async () => new Response("", { status: 404 });
  const res404 = await dbd.lookupJuristic("0105591234567", { apiKey: "TEST", fetchImpl: fake404 as never });
  eq("P4.7 ไม่พบนิติบุคคล = เหตุผล notFound", !res404.ok && res404.reason === dbd.DBD_REASON.notFound, true);
  const fake500 = async () => new Response("boom", { status: 500 });
  const res500 = await dbd.lookupJuristic("0105591234567", { apiKey: "TEST", fetchImpl: fake500 as never });
  eq("P4.8 API ล้ม = เหตุผล unavailable (ไม่ throw)", !res500.ok && res500.reason === dbd.DBD_REASON.unavailable, true);
  const resBad = await dbd.lookupJuristic("123", { apiKey: "TEST", fetchImpl: fakeOk as never });
  eq("P4.9 เลขไม่ครบ 13 หลัก = ไม่ยิง API เลย", !resBad.ok && resBad.reason === dbd.DBD_REASON.badTaxId, true);

  // ═══════════ P5 เชื่อมสมาชิก/CRM ═══════════
  console.log("\nP5 เชื่อมกับสมาชิก/CRM (§7.2 'ใช่ คนเดียวกัน'):");
  const piya = await prisma.accountContact.findFirst({ where: { systemId, name: "ปิยธิดา อินสุ่ม" }, select: { id: true, phone: true, partyId: true } });
  const somchai = await prisma.accountContact.findFirst({ where: { systemId, name: "คุณสมชาย ใจดี" }, select: { id: true, phone: true, partyId: true } });
  if (!piya || !somchai) {
    bad("P5.0 หาแถวสาธิตของ seed ไม่เจอ", "ต้อง seed ใหม่");
  } else {
    const sug = await links.suggestLinks(ctx, { phone: piya.phone, partyId: piya.partyId });
    sug.member.length >= 1 ? ok(`P5.1 เดาสมาชิกจากเบอร์ได้ (${sug.member.length} รายการ)`) : bad("P5.1 เดาสมาชิกจากเบอร์ได้", JSON.stringify(sug));
    eq("P5.2 ช่องแชทยังไม่ต่อสาย (ห้ามแตะ chat/**) → null ไม่ใช่ผลลวง", sug.chat, null);
    eq("P5.3 บอกได้ว่าร้านนี้เปิดระบบสมาชิก/CRM อยู่", [sug.available.member, sug.available.crm], [true, true]);
    const sugCrm = await links.suggestLinks(ctx, { phone: somchai.phone, partyId: somchai.partyId });
    sugCrm.crm.length >= 1 ? ok(`P5.4 เดาผู้ติดต่อ CRM จากเบอร์ได้ (${sugCrm.crm.length} รายการ)`) : bad("P5.4 เดาผู้ติดต่อ CRM จากเบอร์ได้", JSON.stringify(sugCrm));

    // สร้างผู้ติดต่อใหม่ที่ยังไม่ผูก Party แล้วสั่งเชื่อมกับสมาชิกของปิยธิดา
    const memberSystemId = (await svc.findLinkedSystemIds(tenantId)).memberSystemId!;
    const cand = (await memberSvc.findCustomersForLink(tenantId, memberSystemId, { phoneVariants: links.phoneVariants(piya.phone) }))[0];
    if (!cand) bad("P5.5 หาแถวสมาชิกปลายทางไม่เจอ", "seed ไม่มีสมาชิกเบอร์นี้");
    else {
      const linkRes = await links.linkContactTo(ctx, { contactId: piya.id, target: "member", targetId: cand.id });
      linkRes.ok ? ok("P5.5 กด 'ใช่ คนเดียวกัน' สำเร็จ") : bad("P5.5 กด 'ใช่ คนเดียวกัน' สำเร็จ", linkRes.reason);
      if (linkRes.ok) {
        const after = await prisma.accountContact.findFirst({ where: { id: piya.id }, select: { partyId: true } });
        const custAfter = (await memberSvc.findCustomersForLink(tenantId, memberSystemId, { phoneVariants: links.phoneVariants(piya.phone) }))[0];
        after?.partyId && after.partyId === custAfter?.partyId
          ? ok("P5.6 ทั้งสองฝั่งชี้ Party เดียวกันจริง")
          : bad("P5.6 ทั้งสองฝั่งชี้ Party เดียวกันจริง", `contact=${after?.partyId} customer=${custAfter?.partyId}`);
      }
      const bogus = await links.linkContactTo(ctx, { contactId: piya.id, target: "member", targetId: "id-ของร้านอื่น" });
      eq("P5.7 id ปลายทางที่ไม่ใช่ของร้านนี้ = ปฏิเสธ (กัน IDOR) ไม่ใช่ throw", bogus.ok, false);
      const crmSystemId = (await svc.findLinkedSystemIds(tenantId)).crmSystemId!;
      const crmCand = (await crmSvc.findContactsForLink({ tenantId, systemId: crmSystemId }, { phoneVariants: links.phoneVariants(somchai.phone) }))[0];
      if (crmCand) {
        const r = await links.linkContactTo(ctx, { contactId: somchai.id, target: "crm", targetId: crmCand.id });
        r.ok ? ok("P5.8 เชื่อม CRM ผ่าน facade ของ crm สำเร็จ") : bad("P5.8 เชื่อม CRM ผ่าน facade ของ crm สำเร็จ", r.reason);
      } else bad("P5.8 เชื่อม CRM", "หาแถว CRM ปลายทางไม่เจอ");
    }
  }

  // ═══════════ P6 เลขที่ไม่ซ้ำเมื่อสร้างพร้อมกัน ═══════════
  console.log("\nP6 เลขที่ผู้ติดต่อภายใต้การสร้างพร้อมกัน 5 ราย:");
  const racers = await Promise.all(
    [1, 2, 3, 4, 5].map((i) =>
      svc.createContact({ tenantId, systemId, kind: "CUSTOMER", name: `${TAG} แข่งกัน ${i}`, phone: `08999000${i}0`, note: `${TAG} race${i}` }),
    ),
  );
  racers.forEach((r) => track(r));
  const codes = racers.map((r) => r.code);
  eq("P6.1 ได้เลขครบ 5 ตัว (ไม่มี null)", codes.filter(Boolean).length, 5);
  eq("P6.2 เลขไม่ซ้ำกันเลย", new Set(codes).size, 5);
  codes.every((c) => /^C\d{5}$/.test(c ?? "")) ? ok("P6.3 รูปแบบเลขถูกต้อง C00xxx") : bad("P6.3 รูปแบบเลขถูกต้อง", codes.join(","));
  eq("P6.4 parseContactCodeSeq/formatContactCode ไปกลับตรงกัน", svc.formatContactCode(svc.parseContactCodeSeq("C00019")!), "C00019");
  eq("P6.5 รหัสที่ผู้ใช้ตั้งเอง (ไม่ใช่รูปแบบ C000xx) ไม่ถูกนับเป็นลำดับ", svc.parseContactCodeSeq("VIP-1"), null);

  // ═══════════ P7 guard ═══════════
  console.log("\nP7 ด่านสิทธิ์:");
  const src = readFileSync("src/lib/modules/account/actions.ts", "utf8");
  for (const fn of ["saveContactAction", "dbdLookupAction", "suggestContactLinksAction", "linkContactAction"]) {
    const body = src.slice(src.indexOf(`export async function ${fn}`));
    const block = body.slice(0, body.indexOf("\n}\n") + 3);
    block.includes('assertAccountCan(auth, "account.contact.manage")')
      ? ok(`P7.1 ${fn} เรียก assertAccountCan("account.contact.manage")`)
      : bad(`P7.1 ${fn} เรียก assertAccountCan`, "ไม่พบในตัวฟังก์ชัน");
  }
  const tag = "QC33GUARD-" + Date.now();
  const tt = await prisma.tenant.create({ data: { name: tag, slug: tag.toLowerCase() } });
  tempTenantId = tt.id;
  const ownerUser = await prisma.user.create({ data: { email: tag.toLowerCase() + "-owner@qc.local", name: "QC เจ้าของ" } });
  const staffUser = await prisma.user.create({ data: { email: tag.toLowerCase() + "-staff@qc.local", name: "QC พนักงาน" } });
  const mOwner = await prisma.membership.create({ data: { userId: ownerUser.id, tenantId: tt.id, role: "OWNER", unitAccess: ["*"] }, include: { tenant: true } });
  const mStaff = await prisma.membership.create({ data: { userId: staffUser.id, tenantId: tt.id, role: "STAFF", unitAccess: ["*"], permissions: {} }, include: { tenant: true } });
  try {
    assertAccountCan({ user: { id: ownerUser.id }, active: mOwner } as never, "account.contact.manage");
    ok("P7.2 OWNER ผ่าน account.contact.manage");
  } catch {
    bad("P7.2 OWNER ผ่าน account.contact.manage", "throw โดยไม่ควร");
  }
  try {
    assertAccountCan({ user: { id: staffUser.id }, active: mStaff } as never, "account.contact.manage");
    bad("P7.3 STAFF ไม่มีสิทธิ์ต้องถูกปฏิเสธ", "ผ่านได้ทั้งที่ไม่ควร");
  } catch {
    ok("P7.3 STAFF ไม่มีสิทธิ์ถูกปฏิเสธ");
  }

  // ═══════════ P8 updateContact เติม partyId ═══════════
  console.log("\nP8 updateContact เติม Party ให้แถวที่ยังไม่มี (หนี้จาก WO 3.1):");
  const orphan = track(await svc.createContact({ tenantId, systemId, kind: "CUSTOMER", name: `${TAG} ไม่มี Party`, phone: "0891112233", note: `${TAG} orphan`, partyId: null }));
  await prisma.accountContact.updateMany({ where: { id: orphan.id }, data: { partyId: null } });
  await svc.updateContact(tenantId, systemId, orphan.id, { name: `${TAG} ไม่มี Party (แก้ชื่อ)` });
  const orphanAfter = await prisma.accountContact.findFirst({ where: { id: orphan.id }, select: { partyId: true } });
  orphanAfter?.partyId ? ok("P8.1 แก้ชื่อแล้วได้ partyId มาเติมให้") : bad("P8.1 แก้ชื่อแล้วได้ partyId มาเติมให้", "ยังเป็น null");
  if (orphanAfter?.partyId) madePartyIds.add(orphanAfter.partyId);
  const beforeParty = orphanAfter?.partyId;
  await svc.updateContact(tenantId, systemId, orphan.id, { note: `${TAG} orphan แก้หมายเหตุ` });
  const orphanAfter2 = await prisma.accountContact.findFirst({ where: { id: orphan.id }, select: { partyId: true } });
  eq("P8.2 แก้ช่องที่ไม่ใช่ตัวตน = ไม่ย้าย Party", orphanAfter2?.partyId, beforeParty);
  await svc.updateContact(tenantId, systemId, orphan.id, { addressLine: "9/9 ถ.ทดสอบ", subdistrict: "ตลาดเหนือ", district: "เมือง", province: "ภูเก็ต", postcode: "83000" });
  const orphanAddr = await prisma.accountContact.findFirst({ where: { id: orphan.id }, select: { address: true } });
  eq("P8.3 แก้ที่อยู่แยกช่อง → `address` สตริงรวมอัปเดตตาม (ใบกำกับไม่พิมพ์ที่อยู่เก่า)", orphanAddr?.address, "9/9 ถ.ทดสอบ ต.ตลาดเหนือ อ.เมือง ภูเก็ต 83000");

  // ═══════════ P9 กลุ่มกำหนดเอง ═══════════
  console.log("\nP9 ช่อง 'กลุ่มกำหนดเอง' ใน modal:");
  const groups = await prisma.accountContactGroup.findMany({ where: { systemId }, select: { id: true }, orderBy: { sortOrder: "asc" }, take: 2 });
  if (groups.length < 2) bad("P9.0 กลุ่มกำหนดเองใน seed ไม่พอ (ต้อง ≥2)", `มี ${groups.length}`);
  else {
    await cl.setContactGroups(ctx, orphan.id, [groups[0]!.id, groups[1]!.id]);
    eq("P9.1 ตั้งกลุ่ม 2 กลุ่ม", (await cl.listGroupIdsOfContact(ctx, orphan.id)).sort().join(","), [groups[0]!.id, groups[1]!.id].sort().join(","));
    await cl.setContactGroups(ctx, orphan.id, [groups[0]!.id, groups[1]!.id]);
    eq("P9.2 ตั้งชุดเดิมซ้ำ = ไม่เกิดแถวซ้ำ (idempotent)", (await cl.listGroupIdsOfContact(ctx, orphan.id)).length, 2);
    await cl.setContactGroups(ctx, orphan.id, [groups[1]!.id]);
    eq("P9.3 ถอดกลุ่มที่ไม่ได้ติ๊กออก", await cl.listGroupIdsOfContact(ctx, orphan.id), [groups[1]!.id]);
    await cl.setContactGroups(ctx, orphan.id, []);
    eq("P9.4 ล้างกลุ่มทั้งหมดได้", (await cl.listGroupIdsOfContact(ctx, orphan.id)).length, 0);
  }

  // ═══════════ P10 องค์ประกอบ UI ตาม checklist g5 ═══════════
  console.log("\nP10 องค์ประกอบใน ContactModal.tsx เทียบ checklist g5:");
  const ui = readFileSync("src/components/account-v2/ContactModal.tsx", "utf8");
  const need: [string, string][] = [
    ["ประเภทผู้ติดต่อ 3 ตัวเลือก (ทั้งคู่ = BOTH)", "contact-kind-both"],
    ["ช่องรหัส + ปุ่มดินสอ", "contact-code-edit"],
    ["radio ไทย/ต่างประเทศ ของเลขทะเบียน", "contact-taxid-foreign"],
    ["ปุ่มค้นหากรมพัฒน์ฯ", "btn-dbd-lookup"],
    ["แถบผล DBD + ปุ่ม 'ใช้ข้อมูลนี้'", "dbd-apply"],
    ["ประเภทสำนักงาน สาขา + เลขสาขา", "contact-branch-code"],
    ["ประเภทนิติบุคคล / คำนำหน้าบุคคล", "contact-person-title"],
    ["ปุ่ม 'ค้นหาด้วยชื่อ'", "btn-dbd-name-search"],
    ["ที่อยู่: ผู้ติดต่อ/ที่อยู่/ตำบล/อำเภอ/จังหวัด/ไปรษณีย์/ประเทศ", "contact-postcode"],
    ["ช่องทางติดต่อ: อีเมล/เบอร์/เว็บ/แฟกซ์/LINE", "contact-line-id"],
    ["หัวข้อ 'ขั้นสูง'", "contact-advanced-heading"],
    ["เครดิตเทอม/ประเภทราคา", "contact-price-mode"],
    ["WHT ประเภทเงินได้ + อัตรา", "contact-wht-rate"],
    ["บัญชีลูกหนี้/เจ้าหนี้เฉพาะราย", "contact-ap-account"],
    ["กลุ่มกำหนดเอง + แท็ก", "contact-tags"],
    ["ผู้ดูแล + หมายเหตุ", "contact-owner"],
    ["บล็อก 'เชื่อมกับ' + ปุ่ม 'ใช่ คนเดียวกัน'", "contact-link-confirm"],
    ["ช่อง CRM / แชท", "contact-link-chat"],
    ["แถบเตือนซ้ำ + ลิงก์เปิดรายเดิม", "contact-dup-open-link"],
    ["toast รวมท้ายจอ", "contact-modal-toast"],
    ["ปุ่มท้าย ยกเลิก/บันทึก", "contact-modal-submit"],
  ];
  for (const [label, testid] of need)
    ui.includes(`"${testid}"`) ? ok(`P10 ${label}`) : bad(`P10 ${label}`, `ไม่พบ data-testid="${testid}"`);
  for (const [label, text] of [
    // แท็บสร้างจาก template literal (`contact-modal-tab-${k}`) — ตรวจตัว prefix + ป้ายไทยทั้งสองแท็บ
    ["แท็บ พื้นฐาน|ขั้นสูง (testid prefix)", "contact-modal-tab-$"],
    ['ป้ายแท็บ "พื้นฐาน"', '"พื้นฐาน"'],
    ['ป้ายแท็บ "ขั้นสูง"', '"ขั้นสูง"'],
    ["ป้ายไทย 'ใช่ คนเดียวกัน'", "ใช่ คนเดียวกัน"],
    ["ป้ายไทย 'โปรดกรอกช่องที่ไฮไลต์'", "โปรดกรอกช่องที่ไฮไลต์"],
    ["placeholder เบอร์ 099-999-9999", "099-999-9999"],
    ["ป้าย 'ยังไม่พบดีลที่ตรงกัน'", "ยังไม่พบดีลที่ตรงกัน"],
    ["ป้าย 'ยังไม่เชื่อม' ของช่องแชท", "ยังไม่เชื่อม"],
    ["ป้าย 'มีอยู่แล้ว:' ของแถบเตือนซ้ำ", "มีอยู่แล้ว:"],
  ] as [string, string][])
    ui.includes(text) ? ok(`P10 ${label}`) : bad(`P10 ${label}`, `ไม่พบข้อความ "${text}"`);
  ui.includes("sheetOnMobile") ? ok("P10 มือถือ 390 = แผ่นเต็มจอ (sheetOnMobile)") : bad("P10 มือถือ 390 = แผ่นเต็มจอ", "ไม่ได้ส่ง sheetOnMobile");
  const uiList = readFileSync("src/lib/modules/account/contacts-ui.tsx", "utf8");
  uiList.includes("?new=1") && uiList.includes("?edit=${r.id}")
    ? ok("P10 เปิดจาก '+ เพิ่มผู้ติดต่อ' (?new=1) และ 'แก้ไขข้อมูล' (?edit=<id>)")
    : bad("P10 เปิดจากปุ่ม/เมนูแถว", "ไม่พบ ?new=1 / ?edit=");
  const provinces = (await import("@/components/account-v2/thai-provinces")).THAI_PROVINCES;
  eq("P10 รายชื่อจังหวัดครบ 77", provinces.length, 77);
} finally {
  // ═══════════ cleanup — ต้องกลับเป็น 63 เป๊ะ ═══════════
  await prisma.accountContactGroupMember.deleteMany({ where: { contactId: { in: [...madeContactIds] } } });
  await prisma.accountContact.deleteMany({ where: { id: { in: [...madeContactIds] } } });
  await sweepStale();
  if (madePartyIds.size > 0) await prisma.party.deleteMany({ where: { id: { in: [...madePartyIds] }, tenantId } });
  if (tempTenantId) {
    await prisma.membership.deleteMany({ where: { tenantId: tempTenantId } });
    await prisma.user.deleteMany({ where: { email: { contains: "qc33guard-" } } });
    await prisma.tenant.deleteMany({ where: { id: tempTenantId } });
  }
  const left = await prisma.accountContact.count({ where: { systemId } });
  left === 63 ? ok("cleanup: ผู้ติดต่อกลับเป็น 63 เท่าเฉลย") : bad("cleanup: ผู้ติดต่อกลับเป็น 63 เท่าเฉลย", `เหลือ ${left}`);
}

console.log(`\nสรุป: ผ่าน ${passed} · ไม่ผ่าน ${findings.length}`);
if (findings.length > 0) {
  console.log("รายการที่ไม่ผ่าน:\n" + findings.map((f) => "  · " + f).join("\n"));
  await prisma.$disconnect();
  process.exit(1);
}
await prisma.$disconnect();
