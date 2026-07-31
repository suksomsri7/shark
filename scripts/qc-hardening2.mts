// QC — Hardening รอบ 2 (ตรวจช่องโหว่ 31 ก.ค.) · Fable oracle, Builder ห้ามแตะ
// ⚠️ standalone-typesafe: dynamic import + wide cast เท่านั้น
//
// ปิด 4 ช่องที่เจอตอน audit:
//   H2-1 ไฟล์แนบเคส support: url ถูก render เป็น href/src ตรง ๆ → ต้องรับเฉพาะ http(s)/data:image
//        (เดิมรับทุก scheme → javascript: = stored XSS · ไม่จำกัดขนาด/จำนวน = ยัด DB ได้)
//   H2-2 รหัสที่ใช้ "ยืนยันสิทธิ์" ต้องมาจาก CSPRNG — ตั๋วเข้างาน · โค้ดแลกรางวัล · รหัสสมาชิก
//        (Math.random ของ V8 = xorshift128+ เดาค่าถัดไปได้จากผลลัพธ์ไม่กี่ค่า)
//   H2-3 endpoint สาธารณะที่เขียน DB ต้องมีด่านกันถล่ม (rate limit) ครบทุกตัว
//   H2-4 resolve หน้าร้านสาธารณะ: ประเภทสาขาไม่ตรง / ร้านไม่ ACTIVE → ต้องคืน null เสมอ
try { process.loadEnvFile(".env"); } catch {}
import { readFileSync, existsSync } from "node:fs";

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};
const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

const { prisma } = await import("@/lib/core/db");
const tids: string[] = [];
const ts = Date.now();

try {
  // ───────────────── H2-1 ไฟล์แนบ ─────────────────
  const t = await prisma.tenant.create({ data: { name: "QC HARDEN2", slug: `qc-h2-${ts}` } });
  tids.push(t.id);
  const user = await prisma.user.create({ data: { email: `qc-h2-${ts}@example.com` } });
  await prisma.membership.create({
    data: { tenantId: t.id, userId: user.id, role: "OWNER", acceptedAt: new Date() },
  });

  const support = (await import("@/lib/support/service")) as unknown as {
    createCase: (c: { tenantId: string }, i: Record<string, unknown>) => Promise<{ id: string }>;
    MAX_ATTACHMENTS: number;
  };
  const evil = [
    { name: "x", url: "javascript:alert(document.cookie)", kind: "file" },
    { name: "y", url: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==", kind: "file" },
    { name: "z", url: "vbscript:msgbox(1)", kind: "file" },
    { name: "ok", url: "https://example.com/a.pdf", kind: "file" },
    { name: "img", url: "data:image/png;base64,iVBORw0KGgo=", kind: "image" },
  ];
  const c1 = await support.createCase(
    { tenantId: t.id },
    { userId: user.id, subject: "qc", body: "qc", attachments: evil },
  );
  const msg = await prisma.supportMessage.findFirst({
    where: { caseId: c1.id },
    orderBy: { createdAt: "asc" },
  });
  const saved = (msg?.attachmentsJson ?? []) as { url: string }[];
  const urls = saved.map((a) => a.url);
  chk(
    "H2-1.1",
    "scheme อันตราย (javascript:/vbscript:/data:text/html) ถูกตัดทิ้งตอนบันทึก",
    !urls.some((u) => /^(javascript|vbscript|data:text)/i.test(u)),
    "ไม่มี",
    urls.join(" | ").slice(0, 120),
  );
  chk(
    "H2-1.2",
    "ของที่ปลอดภัย (https + data:image) ยังบันทึกได้ตามเดิม",
    urls.length === 2 && urls.some((u) => u.startsWith("https://")) && urls.some((u) => u.startsWith("data:image/")),
    "2 รายการ",
    String(urls.length),
  );

  const many = Array.from({ length: 12 }, (_, i) => ({
    name: `f${i}`,
    url: `https://example.com/${i}.png`,
    kind: "file" as const,
  }));
  const c2 = await support.createCase(
    { tenantId: t.id },
    { userId: user.id, subject: "qc2", body: "qc2", attachments: many },
  );
  const msg2 = await prisma.supportMessage.findFirst({ where: { caseId: c2.id }, orderBy: { createdAt: "asc" } });
  const n2 = ((msg2?.attachmentsJson ?? []) as unknown[]).length;
  chk("H2-1.3", `จำกัดจำนวนไฟล์แนบ ≤ ${support.MAX_ATTACHMENTS}`, n2 <= support.MAX_ATTACHMENTS, `≤${support.MAX_ATTACHMENTS}`, String(n2));

  const huge = [{ name: "big", url: `data:image/png;base64,${"A".repeat(3_200_000)}`, kind: "image" as const }];
  const c3 = await support.createCase(
    { tenantId: t.id },
    { userId: user.id, subject: "qc3", body: "qc3", attachments: huge },
  );
  const msg3 = await prisma.supportMessage.findFirst({ where: { caseId: c3.id }, orderBy: { createdAt: "asc" } });
  const n3 = ((msg3?.attachmentsJson ?? []) as unknown[]).length;
  chk("H2-1.4", "ไฟล์แนบใหญ่เกินเพดาน → ไม่บันทึก (กันยัด DB)", n3 === 0, "0", String(n3));

  // ───────────────── H2-2 รหัสต้องมาจาก crypto ─────────────────
  const srcs: [string, string][] = [
    ["ตั๋วเข้างาน", "src/lib/modules/ticket/service.ts"],
    ["โค้ดแลกรางวัล", "src/lib/modules/reward/service.ts"],
    ["รหัสสมาชิก", "src/lib/modules/member/service.ts"],
  ];
  for (const [i, [label, file]] of srcs.entries()) {
    const src = read(file);
    const usesMathRandom = /Math\.random\s*\(/.test(src);
    chk(`H2-2.${i + 1}`, `${label}: ไม่ใช้ Math.random ในการสุ่มรหัส`, !usesMathRandom && /randomCode\(/.test(src), "crypto", usesMathRandom ? "ยังใช้ Math.random" : "ไม่พบ randomCode()");
  }
  const { randomCode } = (await import("@/lib/core/hash")) as unknown as {
    randomCode: (n: number, a: string) => string;
  };
  const draws = new Set(Array.from({ length: 500 }, () => randomCode(6, "ACDEFGHJKLMNPQRSTUVWXY3456789")));
  chk("H2-2.4", "randomCode: สุ่ม 500 ครั้งไม่ซ้ำกันเอง + ยาวถูกต้อง", draws.size >= 498 && [...draws].every((c) => c.length === 6), "≥498 ค่าไม่ซ้ำ", String(draws.size));

  // ───────────────── H2-3 rate limit endpoint สาธารณะ ─────────────────
  const PUBLIC_WRITE_ROUTES = [
    "src/app/api/store/[tenantSlug]/[unitSlug]/book/route.ts",
    "src/app/api/store/[tenantSlug]/[unitSlug]/shop/order/route.ts",
    "src/app/api/store/[tenantSlug]/[unitSlug]/restaurant/order/route.ts",
    "src/app/api/store/[tenantSlug]/[unitSlug]/restaurant/service-request/route.ts",
    "src/app/api/store/[tenantSlug]/[unitSlug]/restaurant/session/route.ts",
    "src/app/api/store/[tenantSlug]/[unitSlug]/slots/route.ts",
  ];
  const noRl = PUBLIC_WRITE_ROUTES.filter((f) => !/checkRateLimit/.test(read(f)));
  chk("H2-3.1", `endpoint สาธารณะ ${PUBLIC_WRITE_ROUTES.length} ตัวมีด่านกันถล่มครบ`, noRl.length === 0, "0 ที่ขาด", noRl.map((f) => f.split("/").slice(-2)[0]).join(","));
  chk("H2-3.2", "OTP ฝั่งแอปส่ง IP เข้าด่านกันถล่ม (ไม่งั้นด่านต่อ IP ไม่ทำงาน)", /requestLogin\(email, ip\)/.test(read("src/app/api/mobile/auth/otp/route.ts")), "ส่ง ip", "ไม่ส่ง");

  // ───────────────── H2-4 resolve หน้าร้านสาธารณะ ─────────────────
  const { resolvePublicUnit } = (await import("@/lib/core/storefront")) as unknown as {
    resolvePublicUnit: (t: string, u: string, ty?: string) => Promise<unknown>;
  };
  const unit = await prisma.businessUnit.create({
    data: { tenantId: t.id, name: "สาขาทดสอบ", slug: `u-${ts}`, type: "BOOKING" },
  });
  const okSame = await resolvePublicUnit(`qc-h2-${ts}`, unit.slug, "BOOKING");
  const wrongType = await resolvePublicUnit(`qc-h2-${ts}`, unit.slug, "HOTEL");
  chk("H2-4.1", "ประเภทตรง → เจอ · ประเภทผิด → null (กันสวมประเภทร้าน)", !!okSame && wrongType === null, "เจอ/null", `${!!okSame}/${wrongType === null}`);

  await prisma.tenant.update({ where: { id: t.id }, data: { status: "SUSPENDED" } });
  const suspended = await resolvePublicUnit(`qc-h2-${ts}`, unit.slug, "BOOKING");
  chk("H2-4.2", "ร้านถูกระงับ → หน้าร้านสาธารณะเข้าไม่ได้", suspended === null, "null", String(suspended !== null));
  await prisma.tenant.update({ where: { id: t.id }, data: { status: "ACTIVE" } });

  await prisma.businessUnit.update({ where: { id: unit.id }, data: { status: "ARCHIVED" } });
  const archived = await resolvePublicUnit(`qc-h2-${ts}`, unit.slug, "BOOKING");
  chk("H2-4.3", "สาขาถูกเก็บถาวร → หน้าร้านสาธารณะเข้าไม่ได้", archived === null, "null", String(archived !== null));

  const blank = await resolvePublicUnit("", "", "BOOKING");
  chk("H2-4.4", "slug ว่าง → null (ไม่ยิง DB มั่ว)", blank === null, "null", String(blank !== null));
} catch (e) {
  chk("CRASH", "จบไม่ error", false, "จบ", e instanceof Error ? `${e.message}`.slice(0, 200) : String(e));
} finally {
  for (const tid of tids) {
    for (const m of [
      "supportMessage", "supportCase", "businessUnit", "membership", "aiUsageWindow", "aiUsage",
    ] as const) {
      await (prisma as unknown as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>)[m]
        ?.deleteMany({ where: { tenantId: tid } })
        .catch(() => {});
    }
    await prisma.tenant.deleteMany({ where: { id: tid } }).catch(() => {});
  }
  await prisma.user.deleteMany({ where: { email: { startsWith: `qc-h2-${ts}` } } }).catch(() => {});
  await prisma.$disconnect();
}

const fail = cks.filter((c) => !c.ok);
console.log(`\n===== QC Hardening 2 =====\nผ่าน ${cks.length - fail.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${fail.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${fail.filter((c) => c.sev === "MAJOR").length} · MINOR ${fail.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - fail.length, findings: fail.map((c) => c.id) })}`);
process.exit(fail.some((c) => c.sev === "CRITICAL") ? 1 : 0);
