// QC — HF-INV-1 R3.7: รายงาน (report builder) ต้องไม่เปิดข้อมูลของโมดูลที่ผู้รันอ่านไม่ได้ · oracle-first
// ⚠️ standalone-typesafe: dynamic import + `as string` + wide cast (oracle ล้ำหน้าโค้ด)
//
// สัญญาที่คุม (แดงบน 2a759a8e · เขียวหลังแก้):
//   ชุดข้อมูลรันได้เฉพาะคนที่ "อ่านข้อมูลของโมดูลเจ้าของ" ได้ — ทั้งจอ (runReportAction) · CSV (exportReportCsvAction) · groupBy
//     customers (ชื่อ/เบอร์สมาชิก) → กฎเดียวกับหน้าสมาชิก: OWNER/MANAGER · STAFF ที่มีคีย์ member.* ใดก็ได้ (member.customer.read …)
//     inventory → กฎอ่านคลัง (มีอยู่แล้ว · กันถอยหลัง)
//     sales → กฎหน้าประวัติบิล POS (hotfix/pos-page-authz · pos.sale.create) + กรองตามสาขาที่ผู้รันเข้าถึง (OWNER / "*" เห็นทุกสาขา)
//       ตัวกรองของผู้ใช้ (unitId eq สาขาอื่น) ต้องหลุดขอบเขตไม่ได้
//   ตารางเดียวประกาศสิทธิ์ต่อชุดข้อมูล — ชุดที่ไม่ได้ประกาศถูกปฏิเสธ (ทดสอบด้วยการเพิ่มชุดข้อมูลชั่วคราวในหน่วยความจำ)
//   ชื่อชุดข้อมูลแปลก (constructor / __proto__ / toString / hasOwnProperty) → ปฏิเสธเป็นข้อความไทย ก่อนแตะฐานข้อมูล
//   ตัวกรอง eq ต้องเป็นค่าเดี่ยว (ไม่รับ object ตัวดำเนินการ เช่น { not: … } / { in: [...] } / array)
//   ทางจัดกลุ่ม (groupBy) มีเพดานแถวเดียวกับทางแถวดิบ (take) + บอก truncated
//
// รอบ 3b (แดงบน 13ac174c · เขียวหลังแก้) — customers ต้องไม่เห็นเกินที่โมดูลสมาชิกให้ actor คนเดียวกันเห็น:
//   RP-5 บทบาท × ทาง (จอ / CSV / groupBy): แถว = แถวของ listMembers ของ actor นั้น (ขอบเขตสาขา homeUnitId หรือเคยมาใช้บริการ
//     ที่สาขาตน · ไม่นับ MERGED · รวมทุกระบบสมาชิกของร้าน) · เบอร์ปิดบังด้วย maskPhone ของโมดูลสมาชิก เว้นแต่ผ่านด่าน exportMembers
//     (member.customer.export · OWNER/MANAGER ผ่าน) · เบอร์ที่ถูกปิดบังใช้กรอง/จัดกลุ่ม/รวมค่า/เรียงไม่ได้ (ไทย)
//     · ผู้ถูกจำกัดสาขาเอื้อมถึงสมาชิกสาขาอื่นด้วยตัวกรองใด ๆ ไม่ได้ · เทียบผลกับ listMembers/exportMembers ตรง ๆ (กันสองที่ลอยห่างกัน)
//   RP-6 (B4) filters ที่ไม่ใช่รายการ/สมาชิกไม่ใช่ object ⇒ ข้อความไทย ไม่ใช่ TypeError
//
// DB: ฐาน QC ผ่าน qc-env-guard (กัน prod) · ร้านชั่วคราว slug qc-hfrpt-* · ลบใน finally
// session: ยัด fake `src/lib/core/context.ts` (requireTenant) ลง require.cache ก่อน import action
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";
loadLegacyQcEnv("qc-hf-reports-authz");

const { createRequire } = await import("node:module");
const { resolve } = await import("node:path");

type Sev = "CRITICAL" | "MAJOR" | "MINOR";
const cks: { id: string; ok: boolean; sev: Sev }[] = [];
const chk = (id: string, n: string, ok: boolean, e: string, a: string, s: Sev = "CRITICAL") => {
  cks.push({ id, ok, sev: s });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${n}${ok ? "" : ` — exp ${e} | act ${a}`}`);
};

type Sess = { tenantId: string; role: "OWNER" | "MANAGER" | "STAFF"; unitAccess: string[]; permissions: Record<string, unknown> };
let SESSION: Sess = { tenantId: "", role: "OWNER", unitAccess: ["*"], permissions: {} };
const req = createRequire(import.meta.url);
const putModule = (absPath: string, exports: Record<string, unknown>) => {
  req.cache[absPath] = { id: absPath, filename: absPath, path: resolve(absPath, ".."), loaded: true, exports, children: [], paths: [] } as never;
};
const ROOT = resolve(import.meta.dirname, "..");
putModule(resolve(ROOT, "src/lib/core/context.ts"), {
  requireTenant: async () => ({
    user: { id: "U-QC-HFRPT", email: "qc-hfrpt@example.com", name: "QC" },
    memberships: [],
    active: {
      tenantId: SESSION.tenantId,
      tenant: { id: SESSION.tenantId, name: "QC HFRPT", status: "ACTIVE" },
      role: SESSION.role,
      unitAccess: SESSION.unitAccess,
      permissions: SESSION.permissions,
    },
  }),
  requireAuth: async () => ({ user: { id: "U-QC-HFRPT" }, memberships: [], active: null }),
  requireMembership: async () => ({}),
  getAuth: async () => null,
});
putModule(req.resolve("next/cache"), { revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: <T,>(f: T) => f });

const { prisma } = await import("@/lib/core/db");
const sysSvc = await import("@/lib/modules/system/service");
type AnyFn = (...a: any[]) => Promise<any>; // any จงใจ: oracle ล้ำหน้าโค้ด (standalone-typesafe)
const rAct = (await import("@/lib/modules/reports/actions" as string)) as { [k: string]: AnyFn };
const rSvc = (await import("@/lib/modules/reports/service" as string)) as { [k: string]: unknown } & { DATASETS: Record<string, unknown>; runReport: AnyFn };

const run = async (f: () => unknown): Promise<{ threw: boolean; value: unknown; msg: string }> => {
  try { const v = await f(); return { threw: false, value: v, msg: "ไม่ throw" }; }
  catch (e) { return { threw: true, value: undefined, msg: e instanceof Error ? `${e.name}: ${e.message.slice(0, 120)}` : String(e) }; }
};
const thai = (m: string) => /[ก-๙]/.test(m);
const rowsOf = (v: unknown) => ((v as { rows?: Record<string, unknown>[] } | undefined)?.rows ?? []);
const csvLines = (v: unknown) => (typeof v === "string" ? v.split("\n").length - 1 : -1); // ไม่นับหัวตาราง

const tenants: string[] = [];
const stamp = Date.now();
try {
  // ═════════ fixtures ═════════
  const t = await prisma.tenant.create({ data: { name: "QC HFRPT", slug: `qc-hfrpt-${stamp}` } });
  tenants.push(t.id);
  const tid = t.id;
  const mem = await sysSvc.createSystem(tid, "MEMBER", "สมาชิก");
  const pos = await sysSvc.createSystem(tid, "POS", "ขาย");
  const invSys = await sysSvc.createSystem(tid, "INVENTORY", "คลัง");
  const u1 = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "สาขา 1", slug: `hfrpt-1-${stamp}` } });
  const u2 = await prisma.businessUnit.create({ data: { tenantId: tid, type: "SHOP", name: "สาขา 2", slug: `hfrpt-2-${stamp}` } });
  await prisma.customer.create({ data: { tenantId: tid, memberSystemId: mem.id, name: "ลูกค้า ก", phone: "0811111111", tier: "GOLD" } as never });
  await prisma.customer.create({ data: { tenantId: tid, memberSystemId: mem.id, name: "ลูกค้า ข", phone: "0822222222", tier: "GOLD" } as never });
  await prisma.posSale.createMany({ data: [
    { tenantId: tid, unitId: u1.id, systemId: pos.id, idempotencyKey: `hfrpt-1-${stamp}`, status: "PAID", subtotalSatang: 100, grandTotalSatang: 100 },
    { tenantId: tid, unitId: u1.id, systemId: pos.id, idempotencyKey: `hfrpt-2-${stamp}`, status: "PAID", subtotalSatang: 200, grandTotalSatang: 200 },
    { tenantId: tid, unitId: u2.id, systemId: pos.id, idempotencyKey: `hfrpt-3-${stamp}`, status: "PAID", subtotalSatang: 400, grandTotalSatang: 400 },
  ] });
  await prisma.invItem.create({ data: { tenantId: tid, systemId: invSys.id, sku: `HFRPT-${stamp}`, name: "ของ", costSatang: 100 } });

  const as = (s: Partial<Sess>) => { SESSION = { tenantId: tid, role: "OWNER", unitAccess: ["*"], permissions: {}, ...s }; };
  const STAFF = (permissions: Record<string, unknown>, unitAccess = ["*"]): Partial<Sess> => ({ role: "STAFF", permissions, unitAccess });
  const RUN = { "reports.report.run": true };

  // ═════════ RP-1: STAFF มีแค่ reports.report.run → ข้อมูลสมาชิก/ขายต้องไม่ออก ═════════
  as(STAFF(RUN));
  const c1 = await run(() => rAct.runReportAction({ dataset: "customers" }));
  chk("RP-1.1", "STAFF มีแค่ reports.report.run → customers (ชื่อ/เบอร์สมาชิก) บนจอถูกปฏิเสธ · ข้อความไทย", c1.threw && thai(c1.msg), "throw ไทย", c1.threw ? c1.msg : `${rowsOf(c1.value).length} แถว`);
  const c2 = await run(() => rAct.exportReportCsvAction({ dataset: "customers" }));
  chk("RP-1.2", "STAFF มีแค่ reports.report.run → customers CSV ถูกปฏิเสธ", c2.threw && thai(c2.msg), "throw ไทย", c2.threw ? c2.msg : `CSV ${csvLines(c2.value)} แถว`);
  const c3 = await run(() => rAct.runReportAction({ dataset: "customers", groupBy: "phone" }));
  chk("RP-1.3", "STAFF มีแค่ reports.report.run → customers groupBy phone (เบอร์ทุกคน) ถูกปฏิเสธ", c3.threw && thai(c3.msg), "throw ไทย", c3.threw ? c3.msg : JSON.stringify(rowsOf(c3.value)).slice(0, 80));
  const c4 = await run(() => rAct.runReportAction({ dataset: "sales" }));
  chk("RP-1.4", "STAFF มีแค่ reports.report.run (ไม่มีสิทธิ์ขาย POS) → sales ถูกปฏิเสธ", c4.threw && thai(c4.msg), "throw ไทย", c4.threw ? c4.msg : `${rowsOf(c4.value).length} แถว`);
  const c5 = await run(() => rAct.exportReportCsvAction({ dataset: "inventory" }));
  chk("RP-1.5", "กันถอยหลัง: STAFF มีแค่ reports.report.run → inventory CSV ถูกปฏิเสธ", c5.threw && thai(c5.msg), "throw ไทย", c5.msg);

  // ═════════ RP-2: คู่บวกของ customers (กฎเดียวกับหน้าสมาชิก) ═════════
  const okCases: [string, string, Partial<Sess>][] = [
    ["RP-2.1", "STAFF + member.customer.read", STAFF({ ...RUN, "member.customer.read": true })],
    ["RP-2.2", "STAFF + member.loyalty.stamp (คีย์สมาชิกใดก็ได้ = อ่านได้ เหมือนหน้าสมาชิก)", STAFF({ ...RUN, "member.loyalty.stamp": true })],
    // รอบ 3b: เดิม MANAGER [u1] — สมาชิก 2 คนนี้ไม่มีสาขาหลัก ⇒ MANAGER ที่ถูกจำกัดสาขาไม่เห็นแล้ว (กติกาหน้าสมาชิก) · กรณีจำกัดสาขาอยู่ RP-5.3
    ["RP-2.3", "MANAGER ทุกสาขา", { role: "MANAGER", unitAccess: ["*"], permissions: {} }],
    ["RP-2.4", "OWNER", {}],
  ];
  for (const [id, label, s] of okCases) {
    as(s);
    const x = await run(() => rAct.runReportAction({ dataset: "customers" }));
    const csv = await run(() => rAct.exportReportCsvAction({ dataset: "customers" }));
    chk(id, `คู่บวก: ${label} → customers จอ 2 แถว + CSV 2 แถว`, !x.threw && rowsOf(x.value).length === 2 && !csv.threw && csvLines(csv.value) === 2, "2/2", `${x.msg} ${rowsOf(x.value).length} · ${csv.msg} ${csvLines(csv.value)}`, "MAJOR");
  }
  as(STAFF({ ...RUN, "member.customer.read": false, "pos.sale.create": true }));
  const c6 = await run(() => rAct.runReportAction({ dataset: "customers" }));
  chk("RP-2.5", "STAFF member.customer.read=false (มีแต่คีย์ POS) → customers ถูกปฏิเสธ", c6.threw && thai(c6.msg), "throw ไทย", c6.threw ? c6.msg : `${rowsOf(c6.value).length} แถว`);

  // ═════════ RP-3: sales กรองตามสาขาที่เข้าถึง ═════════
  const SALES = { ...RUN, "pos.sale.create": true };
  as(STAFF(SALES, [u1.id]));
  const s1 = await run(() => rAct.runReportAction({ dataset: "sales" }));
  const s1u = rowsOf(s1.value).map((r) => r.unitId);
  chk("RP-3.1", "STAFF pos.sale.create เฉพาะสาขา 1 → sales เห็น 2 แถว ของสาขา 1 เท่านั้น", !s1.threw && s1u.length === 2 && s1u.every((u) => u === u1.id), "2 แถว u1", `${s1.msg} · ${JSON.stringify(s1u)}`);
  const s2 = await run(() => rAct.exportReportCsvAction({ dataset: "sales" }));
  chk("RP-3.2", "เดียวกัน → CSV 2 แถว (ไม่มีสาขา 2)", !s2.threw && csvLines(s2.value) === 2 && !String(s2.value).includes(u2.id), "2", `${s2.msg} · ${csvLines(s2.value)}`);
  const s3 = await run(() => rAct.runReportAction({ dataset: "sales", groupBy: "unitId", metric: "sum:grandTotalSatang" }));
  const s3g = rowsOf(s3.value);
  chk("RP-3.3", "เดียวกัน → groupBy unitId มีกลุ่มเดียว (สาขา 1 = 300)", !s3.threw && s3g.length === 1 && s3g[0]?.group === u1.id && s3g[0]?.value === 300, "[u1:300]", `${s3.msg} · ${JSON.stringify(s3g)}`);
  const s4 = await run(() => rAct.runReportAction({ dataset: "sales", filters: [{ field: "unitId", op: "eq", value: u2.id }] }));
  chk("RP-3.4", "เดียวกัน + ตัวกรอง unitId = สาขา 2 → 0 แถว (ตัวกรองผู้ใช้หลุดขอบเขตไม่ได้)", !s4.threw && rowsOf(s4.value).length === 0, "0", `${s4.msg} · ${rowsOf(s4.value).length}`);
  as({ role: "MANAGER", unitAccess: [u2.id], permissions: {} });
  const s5 = await run(() => rAct.runReportAction({ dataset: "sales" }));
  const s5u = rowsOf(s5.value).map((r) => r.unitId);
  chk("RP-3.5", "MANAGER ดูแลสาขา 2 → sales 1 แถวของสาขา 2", !s5.threw && s5u.length === 1 && s5u[0] === u2.id, "1 u2", `${s5.msg} · ${JSON.stringify(s5u)}`);
  as({});
  const s6 = await run(() => rAct.runReportAction({ dataset: "sales" }));
  as(STAFF(SALES, ["*"]));
  const s7 = await run(() => rAct.runReportAction({ dataset: "sales" }));
  chk("RP-3.6", "คู่บวก: OWNER → 3 แถว · STAFF pos.sale.create ทุกสาขา (\"*\") → 3 แถว", !s6.threw && rowsOf(s6.value).length === 3 && !s7.threw && rowsOf(s7.value).length === 3, "3/3", `${s6.msg} ${rowsOf(s6.value).length} · ${s7.msg} ${rowsOf(s7.value).length}`, "MAJOR");
  as(STAFF(SALES, []));
  const s8 = await run(() => rAct.runReportAction({ dataset: "sales" }));
  chk("RP-3.7", "STAFF pos.sale.create แต่ไม่มีสาขาใดเลย → ปฏิเสธ", s8.threw && thai(s8.msg), "throw ไทย", s8.threw ? s8.msg : `${rowsOf(s8.value).length} แถว`);

  // ═════════ RP-4: ด่านข้อมูลนำเข้า ═════════
  as({});
  const bad: [string, unknown][] = [["{ not }", { not: "x" }], ["{ in: [...] }", { in: ["ลูกค้า ก", "ลูกค้า ข"] }], ["array", ["ลูกค้า ก"]]];
  const badRes = await Promise.all(bad.map(([, v]) => run(() => rAct.runReportAction({ dataset: "customers", filters: [{ field: "name", op: "eq", value: v }] }))));
  chk("RP-4.1", "ตัวกรอง eq ค่าที่เป็น object ตัวดำเนินการ / array → ปฏิเสธ (ไทย) ทุกแบบ", badRes.every((r) => r.threw && thai(r.msg)), "throw ×3", badRes.map((r, i) => `${bad[i][0]}: ${r.threw ? r.msg.slice(0, 40) : `${rowsOf(r.value).length} แถว`}`).join(" | "));
  const okEq = await run(() => rAct.runReportAction({ dataset: "customers", filters: [{ field: "name", op: "eq", value: "ลูกค้า ก" }] }));
  chk("RP-4.2", "คู่บวก: eq ค่าข้อความเดี่ยว → 1 แถว", !okEq.threw && rowsOf(okEq.value).length === 1, "1", `${okEq.msg} ${rowsOf(okEq.value).length}`, "MAJOR");
  const weird = ["constructor", "__proto__", "toString", "hasOwnProperty"];
  const wa = await Promise.all(weird.map((d) => run(() => rAct.runReportAction({ dataset: d }))));
  const ws = await Promise.all(weird.map((d) => run(() => rSvc.runReport({ tenantId: tid }, { dataset: d }))));
  chk("RP-4.3", "ชื่อชุดข้อมูล constructor/__proto__/toString/hasOwnProperty → ปฏิเสธเป็นข้อความไทย (ทั้ง action และ service)", [...wa, ...ws].every((r) => r.threw && thai(r.msg)), "throw ไทย ×8", [...wa, ...ws].map((r, i) => `${weird[i % 4]}:${r.threw ? r.msg.slice(0, 30) : "ไม่ throw"}`).join(" | "));
  const cap = await run(() => rSvc.runReport({ tenantId: tid }, { dataset: "customers", groupBy: "tier", take: 1 }));
  const capRows = rowsOf(cap.value);
  const capSum = capRows.reduce((s, r) => s + Number(r.value ?? 0), 0);
  chk("RP-4.4", "groupBy มีเพดานแถวเหมือนทางแถวดิบ: take 1 → นับได้ 1 + truncated", !cap.threw && capSum === 1 && (cap.value as { truncated?: boolean })?.truncated === true, "1/truncated", `${cap.msg} · Σ ${capSum} · truncated ${(cap.value as { truncated?: boolean })?.truncated}`);
  const full = await run(() => rSvc.runReport({ tenantId: tid }, { dataset: "customers", groupBy: "tier" }));
  chk("RP-4.5", "คู่บวก: groupBy ไม่ส่ง take → นับครบ 2 · ไม่ truncated", !full.threw && rowsOf(full.value).reduce((s, r) => s + Number(r.value ?? 0), 0) === 2 && !(full.value as { truncated?: boolean })?.truncated, "2", `${full.msg} ${JSON.stringify(rowsOf(full.value))}`, "MAJOR");
  // ชุดข้อมูลที่ไม่ได้ประกาศสิทธิ์ (เพิ่มในหน่วยความจำ ชั่วคราว) → action ต้องปฏิเสธ แม้เป็น OWNER
  rSvc.DATASETS.qcUndeclared = rSvc.DATASETS.sales;
  try {
    const u = await run(() => rAct.runReportAction({ dataset: "qcUndeclared" }));
    chk("RP-4.6", "ชุดข้อมูลที่ไม่อยู่ในตารางสิทธิ์ → ปฏิเสธ (OWNER ก็ไม่ได้)", u.threw && thai(u.msg), "throw ไทย", u.threw ? u.msg : `${rowsOf(u.value).length} แถว`);
  } finally {
    delete rSvc.DATASETS.qcUndeclared;
  }

  // ═════════ RP-5 (รอบ 3b · B1): customers ไม่เห็นเกินที่โมดูลสมาชิกให้ actor คนเดียวกันเห็น ═════════
  //   ร้าน B: 2 ระบบสมาชิก · สาขา b1/b2 · 1 home b1 · 2 home b2 · 3 home b2 + เคยซื้อ (pos) ที่ b1 · 4 home b2 + แถวแต้ม (point) ที่ b1
  //   (ไม่ใช่การมาใช้บริการ) · 5 home b1 แต่ MERGED · 6 ไม่มีสาขาหลัก ไม่มีเบอร์ · 7 (ระบบสมาชิกที่ 2) home b1
  const L = (await import("@/lib/modules/member/list" as string)) as { listMembers: AnyFn; exportMembers: AnyFn };
  const MA = (await import("@/lib/modules/member/access" as string)) as { toMemberActor: (u: string, m: unknown) => unknown };
  const MP = (await import("@/lib/modules/member/profile" as string)) as { maskPhone: (p: string | null) => string };
  const { parseCsv } = (await import("@/lib/core/csv" as string)) as { parseCsv: (t: string) => { headers: string[]; rows: string[][] } };
  const tB = await prisma.tenant.create({ data: { name: "QC HFRPT B", slug: `qc-hfrpt-b-${stamp}` } });
  tenants.push(tB.id);
  const tidB = tB.id;
  const m1 = await sysSvc.createSystem(tidB, "MEMBER", "สมาชิก 1");
  const m2 = await sysSvc.createSystem(tidB, "MEMBER", "สมาชิก 2");
  const b1 = await prisma.businessUnit.create({ data: { tenantId: tidB, type: "SHOP", name: "สาขา B1", slug: `hfrpt-b1-${stamp}` } });
  const b2 = await prisma.businessUnit.create({ data: { tenantId: tidB, type: "SHOP", name: "สาขา B2", slug: `hfrpt-b2-${stamp}` } });
  const code = (n: number) => `HFRPT${stamp}-${n}`;
  const PHONE: Record<string, string | null> = {};
  const mk = async (n: number, sysId: string, home: string | null, phone: string | null, extra: Record<string, unknown> = {}) => {
    PHONE[code(n)] = phone;
    return prisma.customer.create({ data: { tenantId: tidB, memberSystemId: sysId, memberCode: code(n), name: `สมาชิก B${n}`, phone, homeUnitId: home, ...extra } as never });
  };
  await mk(1, m1.id, b1.id, "0811111111");
  await mk(2, m1.id, b2.id, "0822222222");
  const k3 = await mk(3, m1.id, b2.id, "0833333333");
  const k4 = await mk(4, m1.id, b2.id, "0844444444");
  await mk(5, m1.id, b1.id, "0855555555", { status: "MERGED" });
  await mk(6, m1.id, null, null);
  await mk(7, m2.id, b1.id, "0877777777");
  await prisma.memberActivity.create({ data: { tenantId: tidB, customerId: (k3 as { id: string }).id, unitId: b1.id, module: "pos", type: "VISIT", summary: "QC ซื้อที่สาขา B1" } });
  await prisma.memberActivity.create({ data: { tenantId: tidB, customerId: (k4 as { id: string }).id, unitId: b1.id, module: "point", type: "EARN", summary: "QC แต้ม (ไม่ใช่การมาใช้บริการ)" } });
  const ALL = [1, 2, 3, 4, 6, 7].map(code).sort();
  const U1 = [1, 3, 7].map(code).sort();
  const rawPhones = Object.values(PHONE).filter((p): p is string => !!p);
  const asB = (s: Partial<Sess>) => { SESSION = { tenantId: tidB, role: "OWNER", unitAccess: ["*"], permissions: {}, ...s }; };
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
  const codesOf = (v: unknown) => rowsOf(v).map((r) => String(r.memberCode)).sort();
  const UID = "U-QC-HFRPT";
  // มุมมองของโมดูลสมาชิกเอง (ตัวอ้างอิง): listMembers ทุกระบบสมาชิก (memberCode → phoneMasked) + exportMembers (memberCode → เบอร์) ถ้าผ่านด่าน
  const memberView = async (s: Partial<Sess>) => {
    const actor = MA.toMemberActor(UID, { role: s.role ?? "OWNER", unitAccess: s.unitAccess ?? ["*"], permissions: s.permissions ?? {} });
    const list = new Map<string, string>();
    let exported: Map<string, string> | null = new Map();
    for (const sysId of [m1.id, m2.id]) {
      const mctx = { tenantId: tidB, systemId: sysId, actorUserId: UID };
      const l = (await L.listMembers(mctx, actor, { take: 100 })) as { items: { memberCode: string; phoneMasked: string }[] };
      for (const it of l.items) list.set(it.memberCode, it.phoneMasked);
      if (exported) {
        try {
          const ex = (await L.exportMembers(mctx, actor, { columns: ["memberCode", "phone"] })) as { csv: string };
          for (const r of parseCsv(ex.csv).rows) exported.set(r[0], r[1] ?? "");
        } catch { exported = null; }
      }
    }
    return { list, exported };
  };
  const RUNK = { "reports.report.run": true };
  type Actor = { n: number; label: string; s: Partial<Sess>; rows: string[]; masked: boolean; limited: boolean };
  const actors: Actor[] = [
    { n: 1, label: "OWNER", s: { role: "OWNER", unitAccess: ["*"], permissions: {} }, rows: ALL, masked: false, limited: false },
    { n: 2, label: "MANAGER ทุกสาขา", s: { role: "MANAGER", unitAccess: ["*"], permissions: {} }, rows: ALL, masked: false, limited: false },
    { n: 3, label: "MANAGER เฉพาะสาขา B1", s: { role: "MANAGER", unitAccess: [b1.id], permissions: {} }, rows: U1, masked: false, limited: true },
    { n: 4, label: "STAFF สาขา B1 + member.customer.read", s: { role: "STAFF", unitAccess: [b1.id], permissions: { ...RUNK, "member.customer.read": true } }, rows: U1, masked: true, limited: true },
    { n: 5, label: "STAFF สาขา B1 + member.loyalty.stamp อย่างเดียว", s: { role: "STAFF", unitAccess: [b1.id], permissions: { ...RUNK, "member.loyalty.stamp": true } }, rows: U1, masked: true, limited: true },
    { n: 6, label: "STAFF สาขา B1 + member.customer.export", s: { role: "STAFF", unitAccess: [b1.id], permissions: { ...RUNK, "member.customer.export": true } }, rows: U1, masked: false, limited: true },
  ];
  for (const a of actors) {
    const id = `RP-5.${a.n}`;
    const mv = await memberView(a.s);
    asB(a.s);
    // .1 แถว
    const scr = await run(() => rAct.runReportAction({ dataset: "customers" }));
    const got = codesOf(scr.value);
    chk(`${id}.1`, `${a.label} · จอ: แถว = ${a.rows.length} คน (${a.limited ? "สาขา B1 หรือเคยมาใช้บริการที่ B1" : "ทั้งร้าน"} · ไม่มี MERGED) = แถวของ listMembers ของ actor เดียวกัน`, !scr.threw && same(got, a.rows) && same(got, [...mv.list.keys()]), `${a.rows.length} = list ${mv.list.size}`, `${scr.msg} · report ${got.length} [${got.map((c) => c.split("-")[1]).join(",")}] · list ${mv.list.size}`);
    // .2 เบอร์
    const phoneProbs: string[] = [];
    for (const r of rowsOf(scr.value)) {
      const c = String(r.memberCode);
      const raw = PHONE[c] ?? null;
      if (a.masked) {
        if (r.phone !== MP.maskPhone(raw)) phoneProbs.push(`${c.split("-")[1]}: ${String(r.phone)} ≠ mask ${MP.maskPhone(raw)}`);
        if (r.phone !== mv.list.get(c)) phoneProbs.push(`${c.split("-")[1]}: ≠ list ${mv.list.get(c)}`);
      } else {
        if ((r.phone ?? null) !== raw) phoneProbs.push(`${c.split("-")[1]}: ${String(r.phone)} ≠ raw ${raw}`);
        if (!mv.exported || (r.phone ?? "") !== mv.exported.get(c)) phoneProbs.push(`${c.split("-")[1]}: ≠ export ${mv.exported ? mv.exported.get(c) : "refused"}`);
      }
    }
    chk(`${id}.2`, `${a.label} · จอ: เบอร์${a.masked ? "ปิดบัง = phoneMasked ของ listMembers (ไม่ผ่านด่านส่งออก)" : "เต็ม = เบอร์ใน exportMembers (ผ่านด่านส่งออก)"}`, !scr.threw && rowsOf(scr.value).length > 0 && phoneProbs.length === 0 && (a.masked ? mv.exported === null : mv.exported !== null), a.masked ? "masked · export refused" : "raw · export ok", `${phoneProbs.slice(0, 3).join(" | ")} · member export ${mv.exported ? "ok" : "refused"}`);
    // .3 CSV
    const csv = await run(() => rAct.exportReportCsvAction({ dataset: "customers" }));
    const text = typeof csv.value === "string" ? csv.value : "";
    const visibleRaw = a.rows.map((c) => PHONE[c]).filter((p): p is string => !!p);
    const leaked = rawPhones.filter((p) => text.includes(p) && (a.masked || !visibleRaw.includes(p)));
    const shown = a.masked ? a.rows.every((c) => text.includes(MP.maskPhone(PHONE[c] ?? null))) : visibleRaw.every((p) => text.includes(p));
    chk(`${id}.3`, `${a.label} · CSV: ${a.rows.length} แถว · เบอร์${a.masked ? "ปิดบังเหมือนจอ (ไม่มีเลขเต็มของใครเลย)" : "เต็มเฉพาะคนที่เห็น"}`, !csv.threw && csvLines(csv.value) === a.rows.length && leaked.length === 0 && shown, `${a.rows.length} · leak 0`, `${csv.msg} · ${csvLines(csv.value)} แถว · leak [${leaked.join(",")}] · shown ${shown}`);
    // .4 groupBy
    const gTier = await run(() => rAct.runReportAction({ dataset: "customers", groupBy: "tier" }));
    const tierSum = rowsOf(gTier.value).reduce((s, r) => s + Number(r.value ?? 0), 0);
    const gPhone = await run(() => rAct.runReportAction({ dataset: "customers", groupBy: "phone" }));
    const groups = rowsOf(gPhone.value).map((r) => String(r.group));
    const phoneOk = a.masked ? gPhone.threw && thai(gPhone.msg) : !gPhone.threw && same(groups, a.rows.map((c) => PHONE[c] ?? ""));
    chk(`${id}.4`, `${a.label} · groupBy: tier นับได้ ${a.rows.length} · groupBy phone ${a.masked ? "ถูกปฏิเสธ (ไทย)" : "= เบอร์ของคนที่เห็นเท่านั้น"}`, !gTier.threw && tierSum === a.rows.length && phoneOk, `${a.rows.length} · ${a.masked ? "refused" : "groups"}`, `tier ${gTier.msg} Σ${tierSum} · phone ${gPhone.threw ? gPhone.msg : `[${groups.join(",")}]`}`);
    // .5 ทางอ้อม: เบอร์ที่ถูกปิดบังใช้กรอง/รวมค่า/ส่งออกพร้อมตัวกรองไม่ได้
    if (a.masked) {
      const probes: [string, () => unknown][] = [
        ["contains 0811", () => rAct.runReportAction({ dataset: "customers", filters: [{ field: "phone", op: "contains", value: "0811" }] })],
        ["eq", () => rAct.runReportAction({ dataset: "customers", filters: [{ field: "phone", op: "eq", value: "0811111111" }] })],
        ["gte", () => rAct.runReportAction({ dataset: "customers", filters: [{ field: "phone", op: "gte", value: "08" }] })],
        ["lte", () => rAct.runReportAction({ dataset: "customers", filters: [{ field: "phone", op: "lte", value: "09" }] })],
        ["sum:phone", () => rAct.runReportAction({ dataset: "customers", groupBy: "tier", metric: "sum:phone" })],
        ["CSV + contains", () => rAct.exportReportCsvAction({ dataset: "customers", filters: [{ field: "phone", op: "contains", value: "0811" }] })],
      ];
      const pr = await Promise.all(probes.map(([, f]) => run(f)));
      chk(`${id}.5`, `${a.label} · ทางอ้อม: กรองด้วยเบอร์ (contains/eq/gte/lte) · รวมค่า sum:phone · CSV + ตัวกรองเบอร์ ⇒ ปฏิเสธเป็นไทยทุกทาง (นับแถวอ่านเลขกลับไม่ได้)`, pr.every((r) => r.threw && thai(r.msg)), "throw ไทย ×6", pr.map((r, i) => `${probes[i][0]}:${r.threw ? "throw" : `${rowsOf(r.value).length || csvLines(r.value)} แถว`}`).join(" | "));
    }
    // .6 ผู้ถูกจำกัดสาขาเอื้อมถึงสมาชิกสาขาอื่นด้วยตัวกรองใด ๆ ไม่ได้
    if (a.limited) {
      const probes: Record<string, unknown>[] = [
        { field: "memberCode", op: "eq", value: code(2) },
        { field: "memberCode", op: "contains", value: "-4" },
        { field: "name", op: "contains", value: "สมาชิก" },
        { field: "name", op: "gte", value: "" },
        { field: "name", op: "lte", value: "￿" },
        { field: "tier", op: "eq", value: "MEMBER" },
        { field: "visitCount", op: "gte", value: 0 },
        { field: "totalSpentSatang", op: "lte", value: 2_000_000_000 },
        { field: "createdAt", op: "gte", value: new Date(0) },
        ...(a.masked ? [] : [{ field: "phone", op: "eq", value: "0822222222" }, { field: "phone", op: "contains", value: "08" }]),
      ];
      const pr = await Promise.all(probes.map((f) => run(() => rAct.runReportAction({ dataset: "customers", filters: [f] }))));
      const escaped = pr.flatMap((r, i) => codesOf(r.value).filter((c) => !a.rows.includes(c)).map((c) => `${String(probes[i].field)} ${String(probes[i].op)}→${c.split("-")[1]}`));
      const errs = pr.filter((r) => r.threw).map((r) => r.msg);
      const wide = pr.filter((r) => !r.threw && same(codesOf(r.value), a.rows)).length;
      chk(`${id}.6`, `${a.label} · ตัวกรอง ${probes.length} แบบ (eq/contains/gte/lte · ทุกคอลัมน์) ไม่ได้สมาชิกนอกขอบเขตแม้แต่คนเดียว · ตัวกรองกว้างยังได้ครบ ${a.rows.length}`, escaped.length === 0 && errs.length === 0 && wide >= 5, "0 นอกขอบเขต", `escaped [${escaped.join(", ")}] · errors ${errs.slice(0, 2).join(" | ")} · wide ${wide}`);
    }
  }
  // STAFF ที่ไม่มีคีย์สมาชิกเลย → ปฏิเสธทุกทาง (เหมือนเดิม)
  asB({ role: "STAFF", unitAccess: [b1.id], permissions: { ...RUNK, "pos.sale.create": true } });
  {
    const pr = await Promise.all([
      run(() => rAct.runReportAction({ dataset: "customers" })),
      run(() => rAct.exportReportCsvAction({ dataset: "customers" })),
      run(() => rAct.runReportAction({ dataset: "customers", groupBy: "tier" })),
    ]);
    chk("RP-5.7", "STAFF สาขา B1 ไม่มีคีย์สมาชิก → customers จอ / CSV / groupBy ถูกปฏิเสธ (ไทย)", pr.every((r) => r.threw && thai(r.msg)), "throw ×3", pr.map((r) => (r.threw ? r.msg.slice(0, 40) : `${rowsOf(r.value).length} แถว`)).join(" | "));
  }
  // เรียงตามเบอร์ไม่ได้: ReportInput ไม่มีช่องเรียง — คีย์เรียงที่แนบมาต้องไม่มีผล (ลำดับ = ค่าปริยาย createdAt ใหม่→เก่า) หรือถูกปฏิเสธ
  asB(actors[3].s);
  {
    const base = await run(() => rAct.runReportAction({ dataset: "customers" }));
    const sorted = await run(() => rAct.runReportAction({ dataset: "customers", sort: "phone", orderBy: { phone: "asc" }, sortBy: "phone" }));
    const order = (v: unknown) => rowsOf(v).map((r) => String(r.memberCode)).join(",");
    chk("RP-5.8", "STAFF เบอร์ปิดบัง + คีย์เรียงตามเบอร์ (sort/orderBy/sortBy) → ไม่มีผล (ลำดับเท่าค่าปริยาย · เบอร์ยังปิดบัง) หรือถูกปฏิเสธ", (sorted.threw && thai(sorted.msg)) || (!base.threw && !sorted.threw && order(base.value) === order(sorted.value) && rowsOf(sorted.value).every((r) => /x/.test(String(r.phone)))), "เท่าเดิม/ปฏิเสธ", `${sorted.msg} · ${order(sorted.value).replace(new RegExp(`HFRPT${stamp}-`, "g"), "")}`, "MINOR");
  }

  // ═════════ RP-6 (รอบ 3b · B4): filters ผิดรูป → ข้อความไทย ไม่ใช่ TypeError ═════════
  {
    as({});
    const bads: [string, unknown][] = [["{}", {}], ["5", 5], ['"phone"', "phone"], ["[null]", [null]], ["[5]", [5]], ["{field}", { field: "name", op: "eq", value: "x" }]];
    const okMsg = (r: { threw: boolean; msg: string }) => r.threw && thai(r.msg) && !/^TypeError/.test(r.msg) && /ตัวกรอง/.test(r.msg) && !/undefined/.test(r.msg);
    const sv = await Promise.all(bads.map(([, v]) => run(() => rSvc.runReport({ tenantId: tid }, { dataset: "customers", filters: v }))));
    chk("RP-6.1", "runReport: filters ไม่ใช่รายการ / สมาชิกไม่ใช่ object ({} · 5 · \"phone\" · [null] · [5] · object เดี่ยว) → ข้อความไทยเรื่องตัวกรอง (ไม่ใช่ TypeError / ฟิลด์ \"undefined\")", sv.every(okMsg), "ไทย ×6", sv.map((r, i) => `${bads[i][0]}:${r.threw ? r.msg.slice(0, 45) : "ไม่ throw"}`).join(" | "), "MAJOR");
    const ac = await Promise.all([run(() => rAct.runReportAction({ dataset: "customers", filters: {} })), run(() => rAct.exportReportCsvAction({ dataset: "customers", filters: [null] }))]);
    chk("RP-6.2", "action (จอ {} · CSV [null]) → ข้อความไทยเรื่องตัวกรองเหมือนกัน", ac.every(okMsg), "ไทย ×2", ac.map((r) => (r.threw ? r.msg.slice(0, 50) : "ไม่ throw")).join(" | "), "MAJOR");
  }
} catch (e) {
  chk("CRASH", "จบ", false, "จบ", e instanceof Error ? e.message.slice(0, 200) : String(e));
} finally {
  const d = async (f: () => Promise<unknown>) => { try { await f(); } catch { /* ลบต่อ */ } };
  const P = prisma as never as Record<string, { deleteMany: (a: unknown) => Promise<unknown> }>;
  for (const id of tenants) {
    for (const m of ["posSale", "memberActivity", "customer", "invItem", "reportDef", "outboxEvent", "auditLog", "appSystemUnit", "appSystem", "businessUnit"]) await d(() => P[m].deleteMany({ where: { tenantId: id } }));
    await d(() => prisma.tenant.delete({ where: { id } }));
  }
  const left = await prisma.tenant.count({ where: { slug: { startsWith: "qc-hfrpt-" } } }).catch(() => -1);
  if (left !== 0) console.log(`  ⚠️ เหลือร้านทดสอบ ${left} ร้าน (slug qc-hfrpt-*)`);
  await prisma.$disconnect();
}
const f = cks.filter((c) => !c.ok);
console.log(`\n===== QC HF-INV-1 R3.7 reports authz =====\nผ่าน ${cks.length - f.length}/${cks.length}`);
console.log(`FINDINGS: CRITICAL ${f.filter((c) => c.sev === "CRITICAL").length} · MAJOR ${f.filter((c) => c.sev === "MAJOR").length} · MINOR ${f.filter((c) => c.sev === "MINOR").length}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ total: cks.length, passed: cks.length - f.length, findings: f.map((c) => c.id) })}`);
process.exit(f.filter((c) => c.sev === "CRITICAL").length > 0 ? 1 : 0);
