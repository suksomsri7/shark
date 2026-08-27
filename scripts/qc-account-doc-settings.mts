// QC — หน้าตั้งค่าเอกสารของระบบบัญชี (เจ้าของสั่ง 27 ส.ค. 2026: คำนำหน้าชื่อ · คำแนะนำ URL · อัปโหลดรูป+ลบพื้นหลัง)
// ⚠️ Oracle ภายใต้ change control
//
// สัญญาที่ต้องจริงเสมอ:
// [1] คำนำหน้าชื่อกิจการเก็บแยกจากชื่อ · บันทึกแล้วอ่านกลับได้ · ล้างค่าได้
// [2] 🔴 ชื่อบนเอกสาร = คำนำหน้า + ชื่อ ทุกหน้าที่พิมพ์ (ใบกำกับ · 50 ทวิ · ใบเสร็จสาธารณะ)
//     ห้ามมีหน้าไหนพิมพ์ orgName ดิบ ๆ เพราะชื่อจะไม่ตรงกับที่จดทะเบียน
// [3] เว็บไซต์: พิมพ์แค่โดเมนต้องถูกเติม https:// ให้ · ค่าว่าง = null (ไม่ใช่ "https://")
// [4] คำนำหน้าที่ไม่อยู่ในรายการต้องไม่ถูกบันทึก (กันยิงตรงเข้า action)
// [5] โลโก้/ตราประทับ/ลายเซ็น ใช้ช่องอัปโหลดตัวเดียวกันครบทั้ง 3 + มีปุ่มลบพื้นหลัง
//
// รัน: pnpm exec tsx scripts/qc-account-doc-settings.mts
try { process.loadEnvFile(".env"); } catch { /* CI ใช้ secrets */ }

const { prisma } = await import("@/lib/core/db");
const { readFileSync, existsSync } = await import("node:fs");
const acc = await import("@/lib/modules/account/service");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
type Check = { id: string; name: string; ok: boolean; expected: string; actual: string; sev: Sev };
const checks: Check[] = [];
function chk(id: string, name: string, ok: boolean, expected: string, actual: string, sev: Sev = "CRITICAL") {
  checks.push({ id, name, ok, expected, actual, sev });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : ` — expected ${expected} | actual ${actual}`}`);
}
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

let tid = "";
try {
  // ── [3] เว็บไซต์ (ฟังก์ชันบริสุทธิ์ — ไม่ต้องแตะ DB) ──
  console.log("── เว็บไซต์: เติม scheme ให้เอง ──");
  chk("DS-3.1", "พิมพ์แค่โดเมน → เติม https://",
    acc.normalizeWebsite("shark.in.th") === "https://shark.in.th", "https://shark.in.th",
    String(acc.normalizeWebsite("shark.in.th")));
  chk("DS-3.2", "มี scheme อยู่แล้ว → ไม่แตะ",
    acc.normalizeWebsite("http://a.co") === "http://a.co", "http://a.co",
    String(acc.normalizeWebsite("http://a.co")));
  chk("DS-3.3", "ค่าว่าง/ช่องว่าง → null (ไม่ใช่ 'https://')",
    acc.normalizeWebsite("") === null && acc.normalizeWebsite("   ") === null && acc.normalizeWebsite(null) === null,
    "null ทั้งหมด",
    `${acc.normalizeWebsite("")} / ${acc.normalizeWebsite("   ")} / ${acc.normalizeWebsite(null)}`);

  // ── [2] ชื่อบนเอกสาร ──
  console.log("\n── ชื่อกิจการบนเอกสาร ──");
  chk("DS-2.1", "คำนำหน้า + ชื่อ ต่อกันด้วยช่องว่างเดียว",
    acc.orgDisplayName({ orgPrefix: "บริษัท", orgName: "ฉลามน้อย จำกัด" }) === "บริษัท ฉลามน้อย จำกัด",
    "บริษัท ฉลามน้อย จำกัด", acc.orgDisplayName({ orgPrefix: "บริษัท", orgName: "ฉลามน้อย จำกัด" }));
  chk("DS-2.2", "ไม่มีคำนำหน้า → ได้ชื่อเปล่า ๆ ไม่มีช่องว่างนำหน้า",
    acc.orgDisplayName({ orgPrefix: null, orgName: "ร้านตัดผมพี่ตู่" }) === "ร้านตัดผมพี่ตู่",
    "ร้านตัดผมพี่ตู่", `"${acc.orgDisplayName({ orgPrefix: null, orgName: "ร้านตัดผมพี่ตู่" })}"`);
  chk("DS-2.3", "ไม่มีอะไรเลย → สตริงว่าง (ให้หน้าจอตัดสินใจแสดง fallback เอง)",
    acc.orgDisplayName({}) === "", "\"\"", `"${acc.orgDisplayName({})}"`);

  // 🔴 หน้าที่พิมพ์เอกสารต้องใช้ตัวประกอบชื่อ ไม่ใช่ orgName ดิบ
  const printPages: [string, string][] = [
    ["ใบกำกับ/เอกสารพิมพ์", "src/app/app/sys/[id]/account/print/[docId]/page.tsx"],
    ["หนังสือรับรองหัก ณ ที่จ่าย", "src/app/app/sys/[id]/account/wht/[certId]/print/page.tsx"],
  ];
  for (const [label, path] of printPages) {
    const src = read(path);
    chk(`DS-2.4/${label}`, `${label} ใช้ orgDisplayName (ไม่พิมพ์ orgName ดิบ)`,
      src.includes("orgDisplayName") && !/\bs\.orgName\b/.test(src), "ใช้ orgDisplayName", "ยังใช้ orgName ดิบ");
  }
  chk("DS-2.5", "ใบเสร็จสาธารณะ (ลูกค้าเปิดเอง) ส่งชื่อเต็มไปให้หน้าเว็บ",
    /orgName: orgDisplayName\(settings\)/.test(read("src/lib/modules/account/service.ts")),
    "orgDisplayName(settings)", "ยังส่ง settings.orgName ดิบ");

  // ── [5] ช่องรูป 3 ช่อง + ปุ่มลบพื้นหลัง (static) ──
  console.log("\n── โลโก้ / ตราประทับ / ลายเซ็น ──");
  const page = read("src/app/app/sys/[id]/account/settings/page.tsx");
  for (const field of ["logoUrl", "stampUrl", "signatureUrl"]) {
    chk(`DS-5/${field}`, `${field} ใช้ช่องอัปโหลดกลาง (ไม่ใช่ช่องพิมพ์ URL เปล่า ๆ)`,
      new RegExp(`<ImageAssetField[\\s\\S]{0,120}name="${field}"`).test(page), "ImageAssetField", "ยังเป็น input ธรรมดา");
  }
  const comp = read("src/components/image-asset-field.tsx");
  chk("DS-5.4", "มีปุ่มลบพื้นหลัง + ประมวลผลในเครื่องด้วย canvas (ไม่ส่งรูปออกนอก)",
    comp.includes("ลบพื้นหลัง") && /getImageData/.test(comp) && !/fetch\(/.test(comp),
    "มีปุ่ม + canvas ในเครื่อง", "ขาด");
  chk("DS-5.5", "ลบพื้นหลังแล้วอัปเป็น PNG (ไฟล์ JPEG เก็บความโปร่งใสไม่ได้)",
    /toBlob\([\s\S]{0,80}"image\/png"/.test(comp), "image/png", "ไม่ใช่ png");
  chk("DS-5.6", "หน้าตั้งค่ามีคำแนะนำวิธีใส่ URL เว็บไซต์",
    /https:\/\/shark\.in\.th/.test(page) && /ขึ้นต้นด้วย/.test(page), "มีคำแนะนำ", "ไม่มี", "MAJOR");

  // ── [4] คำนำหน้าที่ไม่อยู่ในรายการ (static — ด่านอยู่ใน action layer) ──
  chk("DS-4.1", "action รับคำนำหน้าเฉพาะที่อยู่ในรายการ",
    /ORG_PREFIXES as readonly string\[\]\)\.includes\(str\(formData, "orgPrefix"\)\)/.test(
      read("src/lib/modules/account/actions.ts")), "กรองด้วย ORG_PREFIXES", "รับค่าอะไรก็ได้");

  // ── [1] บันทึก/อ่านกลับจริงบน DB ──
  console.log("\n── บันทึกแล้วอ่านกลับ (DB จริง) ──");
  const t = await prisma.tenant.create({ data: { name: "QC ตั้งค่าเอกสาร", slug: `qc-docset-${Date.now()}` } });
  tid = t.id;
  const sysId = (await prisma.appSystem.create({
    data: { tenantId: tid, type: "ACCOUNT", name: "บัญชี QC" },
  })).id;

  await acc.saveSettings(tid, sysId, {
    orgPrefix: "ห้างหุ้นส่วนจำกัด", orgName: "ฉลามน้อย", website: "shark.in.th",
    stampUrl: "https://cdn.example/stamp.png",
  });
  let got = await acc.getSettings(tid, sysId);
  chk("DS-1.1", "คำนำหน้าถูกบันทึกและอ่านกลับได้", got.orgPrefix === "ห้างหุ้นส่วนจำกัด",
    "ห้างหุ้นส่วนจำกัด", String(got.orgPrefix));
  chk("DS-1.2", "ชื่อกิจการไม่ถูกกลืนคำนำหน้าเข้าไปด้วย (เก็บแยกกันจริง)", got.orgName === "ฉลามน้อย",
    "ฉลามน้อย", got.orgName);
  chk("DS-1.3", "ชื่อบนเอกสารประกอบออกมาถูก", acc.orgDisplayName(got) === "ห้างหุ้นส่วนจำกัด ฉลามน้อย",
    "ห้างหุ้นส่วนจำกัด ฉลามน้อย", acc.orgDisplayName(got));
  chk("DS-3.4", "เว็บไซต์ถูกเติม https:// ตอนบันทึกจริง", got.website === "https://shark.in.th",
    "https://shark.in.th", String(got.website));

  // เปลี่ยนกลับเป็น "ไม่มีคำนำหน้า" ต้องล้างค่าได้จริง (ไม่ใช่ค้างค่าเดิม)
  await acc.saveSettings(tid, sysId, { orgPrefix: "", orgName: "ฉลามน้อย", website: "" });
  got = await acc.getSettings(tid, sysId);
  chk("DS-1.4", "เลือก 'ไม่มี' แล้วคำนำหน้าหายจริง", got.orgPrefix === null, "null", String(got.orgPrefix));
  chk("DS-3.5", "ลบเว็บไซต์ทิ้งแล้วเป็น null ไม่ใช่ 'https://'", got.website === null, "null", String(got.website));
  chk("DS-1.5", "แก้คำนำหน้าไม่ไปล้างค่าอื่นใน docConfig (ตราประทับยังอยู่)",
    got.stampUrl === "https://cdn.example/stamp.png", "ตราประทับเดิม", String(got.stampUrl));
} finally {
  if (tid) {
    await prisma.accountSettings.deleteMany({ where: { tenantId: tid } }).catch(() => {});
    await prisma.appSystem.deleteMany({ where: { tenantId: tid } }).catch(() => {});
    await prisma.tenant.delete({ where: { id: tid } }).catch(() => {});
    console.log("\n[cleanup] ลบ test tenant เรียบร้อย");
  }
  await prisma.$disconnect();
}

const failed = checks.filter((c) => !c.ok);
const bySev = (s: Sev) => failed.filter((c) => c.sev === s).length;
console.log("\n===== QC: ตั้งค่าเอกสาร (คำนำหน้า/เว็บไซต์/รูป) =====");
console.log(`ผ่าน ${checks.length - failed.length}/${checks.length}`);
console.log(`FINDINGS: CRITICAL ${bySev("CRITICAL")} · MAJOR ${bySev("MAJOR")} · MINOR ${bySev("MINOR")}`);
console.log("\nJSON_SUMMARY " + JSON.stringify({ total: checks.length, passed: checks.length - failed.length, findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(bySev("CRITICAL") > 0 ? 1 : 0);
