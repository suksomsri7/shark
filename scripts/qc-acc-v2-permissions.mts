// QC WO 8.3 — สิทธิ์ผู้ใช้งาน (§9.4) + การเชื่อมต่อระบบ/API/webhook (§9.5)
//
// requires: acc-v2-seed (ร้าน SIAM DIVE QC ถูก seed บล็อก 8.15 ไว้แล้ว)
// รัน (บังคับ DB QC branch):
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/seed-acc-v2-qc.mts
//   QC_ENV_FILE=.env.qc pnpm tsx scripts/qc-acc-v2-permissions.mts
//
// 🔴 ร้าน QC จริง (SIAM DIVE QC) = **อ่านอย่างเดียว** — การเขียนทั้งหมดเกิดใน "ร้านทิ้ง" ที่สร้างเองแล้วลบใน finally
//
// ครอบคลุม
//   M  ตารางสิทธิ์: ครบทุกคีย์ · เจ้าของเซลล์เดียว · กฎ "ต้องมี ดู ก่อน" · แปลงไป-กลับ · สรุปภาษาไทย
//   R  ชุดข้อมูล QC: บทบาท/สิทธิ์/เพดานที่ seed ตั้ง = เฉลย (อ่านจาก Membership.permissions จริง)
//   S  บันทึกตาราง → Membership.permissions เปลี่ยนจริง · ไม่ล้างสิทธิ์โมดูลอื่น · OWNER อ่านอย่างเดียว
//   P  บังคับใช้: ปิด "รับ/จ่ายเงิน" → action ปฏิเสธ + ธงบนหน้าเอกสาร false · เปิดแล้วทำได้
//   C  เพดานอนุมัติ: 50,000 อนุมัติ PO 60,000 ไม่ได้ + เข้าสายอนุมัติ · 100,000 ได้ · อนุมัติงานตัวเองเกินเพดานไม่ได้
//   L  การเชื่อมต่อ: เชื่อม/ตัด ต่อ kind · ตัวเลือกคงอยู่ · ตัดแล้ว applyExternalSale = unlinked · inboxFromChat
//   A  คีย์ API: สร้าง (prefix+hash) · ใช้ได้ · เพิกถอนแล้วใช้ไม่ได้
//   W  webhook: อนุมัติเอกสาร → outbox → delivery เกิดจริง (transport จำลอง)
//   G  ด่านสิทธิ์ของ action + แยกร้าน (tenant isolation)

const accEnv = (await import("./acc-v2-env.mts" as string)) as {
  loadQcEnv: () => { databaseUrl: string; host: string };
  QC: { expectedPath: string; today: string };
};
const { loadQcEnv, QC } = accEnv;
const { host } = loadQcEnv();

const { readFileSync } = await import("node:fs");
const { prisma } = await import("@/lib/core/db");
const sysMod = await import("@/lib/modules/system/service");
const glMod = await import("@/lib/modules/account/gl");
const svc = await import("@/lib/modules/account/service");
const exp = await import("@/lib/modules/account/expense");
const facade = await import("@/lib/modules/account/index");
const matrix = await import("@/lib/modules/account/permissions-matrix");
const permSvc = await import("@/lib/modules/account/permissions-service");
const conn = await import("@/lib/modules/account/connections");
const cap = await import("@/lib/modules/account/approval-cap");
const approvalSvc = await import("@/lib/modules/approval/service");
const apiKeys = await import("@/lib/api-keys/service");
const webhooks = await import("@/lib/webhooks/service");
const staff = await import("@/lib/staff/service");
const perms = await import("@/lib/core/permissions");
const { evaluate } = await import("@/lib/core/rbac");
const { accountCan } = await import("@/lib/modules/account/access");

let passed = 0;
const findings: string[] = [];
const ok = (name: string) => {
  passed++;
  console.log("  ✅ " + name);
};
const bad = (name: string, detail: string) => {
  findings.push(`${name} — ${detail}`);
  console.log("  ❌ " + name + " — " + detail);
};
const assert = (name: string, cond: boolean, detail = "") => (cond ? ok(name) : bad(name, detail));
const eq = (name: string, actual: unknown, expected: unknown) => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  assert(name, a === b, `ได้ ${a} · ควรได้ ${b}`);
};
const rejected = async (
  name: string,
  fn: () => Promise<{ ok: boolean; reason?: string } | unknown>,
  contains?: string,
) => {
  try {
    const r = (await fn()) as { ok?: boolean; reason?: string };
    if (r && r.ok === false) {
      if (contains && !(r.reason ?? "").includes(contains))
        return bad(name, `เหตุผล "${r.reason}" ไม่มีคำว่า "${contains}"`);
      return ok(name);
    }
    return bad(name, "ผ่านทั้งที่ควรถูกปฏิเสธ");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (contains && !msg.includes(contains)) return bad(name, `error "${msg}" ไม่มีคำว่า "${contains}"`);
    return ok(name);
  }
};

console.log(`\n===== QC WO 8.3 · สิทธิ์ผู้ใช้งาน + การเชื่อมต่อ (§9.4–§9.5) =====`);
console.log(`🗄️  DB QC: ${host}\n`);

type PermOracle = {
  memberships: Record<string, string>;
  roles: { key: string; name: string; capSatang: number | null }[];
  salesKeys: string[];
  approverKeys: string[];
  approverCapSatang: number;
  accountActionKeys: number;
  noAccountEmail: string;
  visibleUsers: number;
  totalMemberships: number;
};
type ConnOracle = {
  linked: string[];
  unlinked: string[];
  posOptions: string[];
  memberOptions: string[];
  chatOptions: string[];
  apiKeyPrefix: string;
  webhookId: string;
  webhookUrl: string;
};
const E = JSON.parse(readFileSync(QC.expectedPath, "utf8")) as {
  tenantId: string;
  systemId: string;
  systems: Record<string, string>;
  permissions?: PermOracle;
  connections?: ConnOracle;
};
if (!E.permissions || !E.connections) {
  console.error("❌ เฉลยยังไม่มีคีย์ permissions/connections — รัน scripts/seed-acc-v2-qc.mts ใหม่ก่อน");
  process.exit(1);
}
const P = E.permissions;
const C = E.connections;
const QCTX = { tenantId: E.tenantId, systemId: E.systemId };

let sTenantId: string | null = null;

try {
  // ═════════════════ M — ตารางสิทธิ์ (ตรรกะบริสุทธิ์) ═════════════════
  console.log("M ตารางสิทธิ์ (permissions-matrix):");
  const accountKeys = matrix.ACCOUNT_PERMISSION_KEYS;
  eq("M1.1 จำนวนคีย์ account.* ในทะเบียนกลาง", accountKeys.length, P.accountActionKeys);

  const owned: string[] = [];
  const dupes: string[] = [];
  for (const g of matrix.MATRIX_GROUPS) {
    for (const c of matrix.MATRIX_COLUMNS) {
      for (const k of matrix.MATRIX[g.key][c.key]?.owns ?? []) {
        if (owned.includes(k)) dupes.push(k);
        owned.push(k);
      }
    }
  }
  assert("M1.2 ไม่มีคีย์ไหนเป็นเจ้าของ 2 เซลล์", dupes.length === 0, `ซ้ำ: ${dupes.join(", ")}`);
  const missing = accountKeys.filter((k) => !owned.includes(k));
  assert("M1.3 ทุกคีย์ account.* มีเซลล์เจ้าของครบ", missing.length === 0, `ขาด: ${missing.join(", ")}`);
  const extra = owned.filter((k) => !accountKeys.includes(k));
  assert("M1.4 ไม่มีคีย์ผีในตาราง (ทุกคีย์อยู่ในทะเบียนกลาง)", extra.length === 0, `เกิน: ${extra.join(", ")}`);
  assert(
    "M1.5 คีย์ที่ 'ยืม' ต้องเป็นคีย์ที่มีเจ้าของอยู่แล้ว",
    matrix.MATRIX_GROUPS.every((g) =>
      matrix.MATRIX_COLUMNS.every((c) => (matrix.MATRIX[g.key][c.key]?.shares ?? []).every((k) => owned.includes(k))),
    ),
  );
  eq("M1.6 หมวด 8 · คอลัมน์ 7 (ตรงเฟรม g13)", [matrix.MATRIX_GROUPS.length, matrix.MATRIX_COLUMNS.length], [8, 7]);
  eq(
    "M1.7 ป้ายคอลัมน์ตรงเฟรม g13",
    matrix.MATRIX_COLUMNS.map((c) => c.label),
    ["ดู", "สร้าง/แก้ไข", "อนุมัติ", "รับ/จ่ายเงิน", "ยกเลิก/กลับรายการ", "ปิดงวด", "ตั้งค่า"],
  );
  eq(
    "M1.8 ป้ายหมวดตรงเฟรม g13",
    matrix.MATRIX_GROUPS.map((g) => g.label),
    ["รายรับ", "รายจ่าย", "ผู้ติดต่อ", "สินค้า", "การเงิน", "บัญชี", "คลังเอกสาร", "ตั้งค่า"],
  );

  // กฎ "ต้องมี ดู ก่อน"
  eq(
    "M2.1 ไม่ติ๊ก 'ดู' → ทั้งแถวถูกล้าง",
    matrix.resolveCells({ finance: { create: true, pay: true } }),
    {},
  );
  eq(
    "M2.2 ติ๊ก 'ดู' แล้วช่องอื่นอยู่ครบ",
    matrix.resolveCells({ finance: { view: true, pay: true } }),
    { finance: { view: true, pay: true } },
  );
  eq(
    "M2.3 แถวรายจ่าย 'ยืม' ดู ของรายรับ (ติ๊กที่รายรับ แถวรายจ่ายใช้ได้)",
    matrix.resolveCells({ revenue: { view: true }, expense: { approve: true } }).expense,
    { view: true, approve: true },
  );
  eq(
    "M2.4 ช่องที่หมวดนั้นไม่มี ถูกตัดทิ้ง (สินค้า ไม่มี 'ปิดงวด')",
    matrix.resolveCells({ product: { view: true, close: true } }),
    { product: { view: true } },
  );

  // แปลงไป-กลับ
  const salesCells = { revenue: { view: true, create: true }, contact: { view: true }, product: { view: true } };
  eq("M3.1 ตาราง → คีย์สิทธิ์ (พนักงานขาย)", matrix.cellsToPermissionKeys(salesCells), P.salesKeys);
  const salesMap: Record<string, boolean> = {};
  for (const k of P.salesKeys) salesMap[k] = true;
  // แถว "รายจ่าย" ยืมคีย์ชุดเดียวกับ "รายรับ" ⇒ อ่านกลับมาแล้วต้องติ๊กทั้ง 2 แถว (พฤติกรรมที่ตั้งใจ)
  eq("M3.2 คีย์สิทธิ์ → ตาราง: แถวรายจ่ายติ๊กตามเพราะยืมคีย์เดียวกัน", matrix.permissionKeysToCells(salesMap).expense, {
    view: true,
    create: true,
  });
  eq(
    "M3.2b แปลงไป-กลับแล้วได้คีย์ชุดเดิมเป๊ะ (ไม่งอกไม่หาย)",
    matrix.cellsToPermissionKeys(matrix.permissionKeysToCells(salesMap)),
    P.salesKeys,
  );
  const approverCells = {
    revenue: { view: true, approve: true },
    expense: { view: true, approve: true },
    accounting: { view: true },
  };
  eq("M3.3 ตาราง → คีย์สิทธิ์ (ผู้อนุมัติ)", matrix.cellsToPermissionKeys(approverCells), P.approverKeys);
  assert(
    "M3.4 บทบาทเต็ม (fullCells) ให้คีย์ครบทั้ง 36",
    matrix.cellsToPermissionKeys(matrix.fullCells()).length === accountKeys.length,
    `ได้ ${matrix.cellsToPermissionKeys(matrix.fullCells()).length}`,
  );
  assert("M3.5 ตารางว่าง = ไม่มีสิทธิ์เลย", matrix.cellsToPermissionKeys({}).length === 0);
  assert(
    "M3.6 สรุปภาษาไทยอ่านออก (ไม่มีโค้ดดิบ)",
    matrix.summarizeCells(salesCells).includes("รายรับ") && !matrix.summarizeCells(salesCells).includes("account."),
    matrix.summarizeCells(salesCells),
  );
  eq("M3.7 ไม่มีสิทธิ์เลย → ข้อความไทย", matrix.summarizeCells({}), "ไม่มีสิทธิ์บัญชี");
  assert("M3.8 hasAnyAccountPermission: มีคีย์บัญชี = true", matrix.hasAnyAccountPermission(salesMap));
  assert("M3.9 hasAnyAccountPermission: มีแต่คีย์โมดูลอื่น = false", !matrix.hasAnyAccountPermission({ "pos.sale.void": true }));
  assert("M3.10 wildcard account.* = มีสิทธิ์บัญชี", matrix.hasAnyAccountPermission({ "account.*": true }));

  eq("M4.1 แปลงบาท → สตางค์", matrix.bahtFieldToSatang("50,000.00"), 5_000_000);
  eq("M4.2 มี ฿ นำหน้าก็อ่านได้", matrix.bahtFieldToSatang("฿1,234.56"), 123_456);
  eq("M4.3 ว่าง = ไม่จำกัด", matrix.bahtFieldToSatang(""), null);
  eq("M4.4 ค่าติดลบ = ไม่ถูกต้อง", matrix.bahtFieldToSatang("-5"), "invalid");
  eq("M4.5 ตัวหนังสือ = ไม่ถูกต้อง", matrix.bahtFieldToSatang("มาก"), "invalid");
  eq("M4.6 แม่แบบ 4 ชุดตาม §9.4", matrix.ROLE_PRESETS.map((x) => x.name), [
    "ผู้ดูแลบัญชี",
    "พนักงานขาย",
    "ผู้อนุมัติ",
    "ดูอย่างเดียว",
  ]);
  assert(
    "M4.7 แม่แบบทุกชุดไม่มีช่องกำพร้า (ทุกช่องที่ตั้งไว้รอดผ่านกฎ 'ต้องมี ดู ก่อน')",
    matrix.ROLE_PRESETS.every((x) => {
      const resolved = matrix.resolveCells(x.cells);
      return matrix.MATRIX_GROUPS.every((g) =>
        matrix.MATRIX_COLUMNS.every((c) => {
          const wanted = (x.cells as Record<string, Record<string, boolean> | undefined>)[g.key]?.[c.key] === true;
          return !wanted || resolved[g.key]?.[c.key] === true;
        }),
      );
    }),
  );
  assert(
    "M4.8 แม่แบบ 'ดูอย่างเดียว' ไม่มีสิทธิ์เขียนเงินเลย",
    !matrix.cellsToPermissionKeys(matrix.ROLE_PRESETS.find((x) => x.key === "readonly")!.cells).includes("account.payment.record"),
  );

  // ═════════════════ R — ชุดข้อมูล QC (อ่านอย่างเดียว) ═════════════════
  console.log("\nR ชุดข้อมูล QC (seed = เฉลย):");
  const settings = await permSvc.getPermissionSettings(QCTX);
  eq(
    "R1.1 บทบาทระบบ 2 ตัวมาก่อนเสมอ",
    settings.roles.slice(0, 2).map((r) => r.name),
    ["เจ้าของ", "ผู้จัดการ"],
  );
  eq(
    "R1.2 บทบาทของร้านตรงกับที่ seed ตั้ง",
    settings.roles.filter((r) => !r.system).map((r) => ({ key: r.key, name: r.name, capSatang: r.capSatang })),
    P.roles,
  );
  const salesM = await prisma.membership.findFirst({ where: { id: P.memberships["sales@siamdive-qc.test"] } });
  const approverM = await prisma.membership.findFirst({ where: { id: P.memberships["approver@siamdive-qc.test"] } });
  assert("R1.3 พบ membership ของพนักงานขาย/ผู้อนุมัติ", !!salesM && !!approverM);
  const salesPerm = (salesM?.permissions ?? {}) as Record<string, unknown>;
  const approverPerm = (approverM?.permissions ?? {}) as Record<string, unknown>;
  eq(
    "R1.4 สิทธิ์จริงบน Membership ของพนักงานขาย = คีย์ตามตาราง",
    Object.keys(salesPerm).filter((k) => k.startsWith("account.")).sort(),
    P.salesKeys,
  );
  eq(
    "R1.5 สิทธิ์จริงบน Membership ของผู้อนุมัติ = คีย์ตามตาราง",
    Object.keys(approverPerm).filter((k) => k.startsWith("account.")).sort(),
    P.approverKeys,
  );
  eq("R1.6 เพดานอนุมัติของผู้อนุมัติ = 50,000 บาท", approverPerm[matrix.APPROVE_CAP_KEY], P.approverCapSatang);
  eq("R1.7 พนักงานขายไม่มีเพดาน (ไม่ได้ตั้ง)", salesPerm[matrix.APPROVE_CAP_KEY] ?? null, null);
  eq("R1.8 ป้ายเพดานเป็นภาษาคน", permSvc.capLabel(P.approverCapSatang), "฿50,000.00");
  eq("R1.9 ไม่ตั้งเพดาน = 'ไม่จำกัด'", permSvc.capLabel(null), "ไม่จำกัด");

  const users = await permSvc.listAccountUsers(QCTX);
  // เจ้าของ + ผู้จัดการ + พนักงานขาย + ผู้อนุมัติ + ผู้อัปโหลดเอกสาร (มี account.document.manage จาก 7.1)
  assert(
    "R2.1 ตารางผู้ใช้งานกรองเฉพาะคนที่มีสิทธิ์บัญชี",
    users.length === P.visibleUsers,
    `ได้ ${users.length} คน: ${users.map((u) => u.name).join(", ")}`,
  );
  const uploaderRow = users.find((u) => u.name === "นภาพร ใจเย็น");
  eq("R2.1b ผู้อัปโหลดเอกสาร (สิทธิ์คลังเอกสารอย่างเดียว) สรุปถูก", uploaderRow?.summary, "คลังเอกสาร ดู");
  // ตัวคุมผลลบ: ร้านมี membership มากกว่าจำนวนแถวในตาราง และคนที่ถูกกรองออกคือคนที่ไม่มีสิทธิ์บัญชีจริง
  eq(
    "R2.1c ร้านมีสมาชิกมากกว่าที่ตารางแสดง (ตัวกรองทำงานจริง)",
    await prisma.membership.count({ where: { tenantId: QCTX.tenantId } }),
    P.totalMemberships,
  );
  assert(
    "R2.1d พนักงานหน้าร้าน (ไม่มีสิทธิ์บัญชีเลย) ไม่โผล่ในตารางนี้",
    !users.some((u) => u.email === P.noAccountEmail),
    users.map((u) => u.email).join(", "),
  );
  const salesRow = users.find((u) => u.membershipId === P.memberships["sales@siamdive-qc.test"]);
  eq("R2.2 แถวพนักงานขาย: บทบาทบัญชี", salesRow?.accountRoleName, "พนักงานขาย");
  assert("R2.3 แถวพนักงานขาย: สรุปสิทธิ์เป็นภาษาไทย", (salesRow?.summary ?? "").includes("รายรับ"), salesRow?.summary ?? "");
  const approverRow = users.find((u) => u.membershipId === P.memberships["approver@siamdive-qc.test"]);
  eq("R2.4 แถวผู้อนุมัติ: เพดาน", approverRow?.capSatang, P.approverCapSatang);
  const ownerRow = users.find((u) => u.role === "OWNER");
  eq("R2.5 เจ้าของ: สรุป = ทำได้ทุกอย่าง · ไม่มีเพดาน", [ownerRow?.summary, ownerRow?.capSatang], ["ทำได้ทุกอย่างในบัญชี", null]);

  // การเชื่อมต่อของร้าน QC
  const cards = await conn.buildConnectionCards(QCTX, new Date(`${QC.today}T12:00:00+07:00`));
  eq(
    "R3.1 การ์ดที่เชื่อมแล้วตรงกับ seed",
    cards.filter((c) => c.status === "linked").map((c) => c.kind).sort(),
    [...C.linked].sort(),
  );
  eq(
    "R3.2 การ์ดที่ยังไม่เชื่อม (มีระบบแต่ไม่ผูก)",
    cards.filter((c) => c.status === "unlinked").map((c) => c.kind),
    C.unlinked,
  );
  // การ์ด "จอง/ทริป" ผูกกับ `BusinessUnit` (สาขาชนิด BOOKING) ไม่ใช่ AppSystem ⇒ ร้าน QC มีสาขานี้ ⇒ "ยังไม่เชื่อม" + ปุ่มเชื่อม (ตรงเฟรม g14)
  assert(
    "R3.3 การ์ด 'จอง/ทริป' เชื่อมได้จริง (ผูกกับสาขาชนิด BOOKING) → ยังไม่เชื่อม + มีปุ่ม",
    cards.find((c) => c.kind === "BUSINESS")?.status === "unlinked" && !!cards.find((c) => c.kind === "BUSINESS")?.linkedId,
    JSON.stringify(cards.find((c) => c.kind === "BUSINESS")),
  );
  eq(
    "R3.4 ตัวเลือกที่เปิดของการ์ด POS",
    cards.find((c) => c.kind === "POS")?.toggles.filter((t) => t.on).map((t) => t.key),
    C.posOptions,
  );
  eq(
    "R3.5 ตัวเลือกที่เปิดของการ์ดสมาชิก (ลงบัญชีอัตโนมัติ = ปิด)",
    cards.find((c) => c.kind === "MEMBER")?.toggles.filter((t) => t.on).map((t) => t.key),
    C.memberOptions,
  );
  eq(
    "R3.6 ตัวเลือกของการ์ดแชท มี inboxFromChat (7.2)",
    cards.find((c) => c.kind === "CHAT")?.toggles.filter((t) => t.on).map((t) => t.key),
    C.chatOptions,
  );
  eq("R3.7 บัญชีที่ใช้ของ POS = 4000 / 1100", cards.find((c) => c.kind === "POS")?.accountCodes, ["4000", "1100"]);
  assert(
    "R3.8 การ์ด POS มีตัวเลขจริง 'ลงบัญชีล่าสุด' (seed มีบิล POS 2 ใบ)",
    (cards.find((c) => c.kind === "POS")?.lastPostedText ?? "") !== "",
    cards.find((c) => c.kind === "POS")?.lastPostedText ?? "(ว่าง)",
  );
  eq("R3.9 ชิปสถานะเป็นภาษาไทย", [...new Set(cards.map((c) => c.statusLabel))].sort(), ["ยังไม่เชื่อม", "เชื่อมแล้ว"].sort());
  eq("R3.10 การ์ด 'ยังไม่มีระบบ' (โรงแรม) มาจากรายการ CONNECTION_SOON ไม่ใช่แคตตาล็อกที่เชื่อมได้", conn.CONNECTION_SOON.length, 1);

  const seedKeys = await apiKeys.listApiKeys({ tenantId: QCTX.tenantId });
  assert("R4.1 มีคีย์ API 1 อันจาก seed", seedKeys.some((k) => k.prefix === C.apiKeyPrefix), `ได้ ${seedKeys.length} อัน`);
  const seedHooks = await webhooks.listEndpoints({ tenantId: QCTX.tenantId });
  assert("R4.2 มีปลายทาง webhook 1 อันจาก seed", seedHooks.some((h) => h.url === C.webhookUrl));
  eq(
    "R4.3 ทะเบียน event บัญชี 4 ตัวมีป้ายไทยครบ",
    (await import("@/lib/webhooks/labels")).WEBHOOK_EVENTS.filter((e) => e.value.startsWith("account.")).map((e) => e.value),
    ["account.document.approved", "account.payment.recorded", "account.invoice.paid", "account.period.closed"],
  );
  const consumers = (await import("@/lib/outbox-consumers")).consumers;
  for (const t of ["account.document.approved", "account.payment.recorded", "account.invoice.paid", "account.period.closed"])
    assert(`R4.4 event "${t}" มี consumer ลงทะเบียน (ไม่ค้าง PENDING)`, typeof consumers[t] === "function");

  // ═════════════════ ร้านทิ้ง — การเขียนทั้งหมด ═════════════════
  console.log("\n── สร้างร้านทดสอบ (เขียนจริง: สิทธิ์ · เพดาน · การเชื่อมต่อ · คีย์ · ฮุค) ──");
  const stamp = Date.now();
  const tag = `qc-perm-${stamp}`;
  const t = await prisma.tenant.create({ data: { name: tag, slug: tag } });
  sTenantId = t.id;
  const tid = sTenantId;
  const uOwner = await prisma.user.create({ data: { email: `${tag}-owner@qc.local`, name: "QC เจ้าของ" } });
  const uSales = await prisma.user.create({ data: { email: `${tag}-sales@qc.local`, name: "QC ขาย" } });
  const uApprover = await prisma.user.create({ data: { email: `${tag}-approver@qc.local`, name: "QC อนุมัติ" } });
  const uBoss = await prisma.user.create({ data: { email: `${tag}-boss@qc.local`, name: "QC หัวหน้า" } });
  const mOwner = await prisma.membership.create({
    data: { userId: uOwner.id, tenantId: tid, role: "OWNER", unitAccess: ["*"], acceptedAt: new Date() },
  });
  const mSales = await prisma.membership.create({
    data: {
      userId: uSales.id,
      tenantId: tid,
      role: "STAFF",
      unitAccess: ["*"],
      acceptedAt: new Date(),
      // สิทธิ์ของโมดูลอื่นที่ต้องไม่หายตอนบันทึกตารางบัญชี
      permissions: { "pos.sale.void": true },
    },
  });
  const mApprover = await prisma.membership.create({
    data: { userId: uApprover.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], acceptedAt: new Date(), permissions: {} },
  });
  const mBoss = await prisma.membership.create({
    data: { userId: uBoss.id, tenantId: tid, role: "STAFF", unitAccess: ["*"], acceptedAt: new Date(), permissions: {} },
  });
  const unit = await prisma.businessUnit.create({
    data: { tenantId: tid, type: "BOOKING", name: "สาขาทดสอบ", slug: `u-${stamp}`, status: "ACTIVE" },
  });
  const accSys = await sysMod.createSystem(tid, "ACCOUNT", "บัญชี " + tag);
  await sysMod.linkUnit(tid, accSys.id, unit.id);
  const posSys = await sysMod.createSystem(tid, "POS", "หน้าร้าน " + tag);
  const chatSys = await sysMod.createSystem(tid, "CHAT", "แชท " + tag);
  const sid = accSys.id;
  const S = { tenantId: tid, systemId: sid };
  await glMod.ensureAccounting(S);
  await svc.saveSettings(tid, sid, { orgName: "ร้านทดสอบสิทธิ์", vatRegistered: true, vatRateBp: 700, defaultDueDays: 30 });

  // ═════════════════ S — บันทึกตาราง → Membership.permissions ═════════════════
  console.log("\nS บันทึกตารางสิทธิ์:");
  const rAdd = await permSvc.addRole(S, "พนักงานขาย");
  assert("S1.1 เพิ่มบทบาทใหม่ได้", rAdd.ok);
  const salesKey = rAdd.ok ? rAdd.key : "";
  await rejected("S1.2 ชื่อบทบาทซ้ำ = ปฏิเสธ", () => permSvc.addRole(S, "พนักงานขาย"), "อยู่แล้ว");
  await rejected("S1.3 ชื่อบทบาทว่าง = ปฏิเสธ", () => permSvc.addRole(S, "   "), "ตั้งชื่อ");
  await rejected(
    "S1.4 บทบาทระบบ (OWNER) แก้ไม่ได้",
    () => permSvc.saveRole(S, uOwner.id, { key: "OWNER", name: "เจ้าของ", cells: {}, capSatang: null }),
    "แก้ไม่ได้",
  );

  const sSave = await permSvc.saveRole(S, uOwner.id, { key: salesKey, name: "พนักงานขาย", cells: salesCells, capSatang: null });
  assert("S2.1 บันทึกตารางบทบาทได้", sSave.ok, !sSave.ok ? sSave.reason : "");
  const aRole = await permSvc.addRole(S, "ผู้อนุมัติ");
  const approverKey = aRole.ok ? aRole.key : "";
  await permSvc.saveRole(S, uOwner.id, { key: approverKey, name: "ผู้อนุมัติ", cells: approverCells, capSatang: 5_000_000 });

  const asg = await permSvc.assignRole(S, uOwner.id, mSales.id, salesKey);
  assert("S2.2 กำหนดบทบาทให้พนักงานได้", asg.ok, !asg.ok ? asg.reason : "");
  const salesAfter = await prisma.membership.findFirst({ where: { id: mSales.id } });
  const salesAfterPerm = (salesAfter?.permissions ?? {}) as Record<string, unknown>;
  eq(
    "S2.3 Membership.permissions ได้คีย์ตามตารางจริง",
    Object.keys(salesAfterPerm).filter((k) => k.startsWith("account.")).sort(),
    P.salesKeys,
  );
  assert("S2.4 สิทธิ์โมดูลอื่นไม่หาย (pos.sale.void ยังอยู่)", salesAfterPerm["pos.sale.void"] === true);
  await permSvc.assignRole(S, uOwner.id, mApprover.id, approverKey);
  const approverAfter = await prisma.membership.findFirst({ where: { id: mApprover.id } });
  eq(
    "S2.5 เพดานของบทบาทถูกเขียนลง Membership",
    ((approverAfter?.permissions ?? {}) as Record<string, unknown>)[matrix.APPROVE_CAP_KEY],
    5_000_000,
  );
  await rejected(
    "S2.6 กำหนดบทบาทบัญชีให้ OWNER ไม่ได้ (มีสิทธิ์ทุกอย่างอยู่แล้ว)",
    () => permSvc.assignRole(S, uOwner.id, mOwner.id, salesKey),
    "ทุกอย่างอยู่แล้ว",
  );
  await rejected("S2.7 บทบาทที่ไม่มีจริง = ปฏิเสธ", () => permSvc.assignRole(S, uOwner.id, mSales.id, "ไม่มีจริง"), "ไม่พบบทบาท");

  // ปรับตารางแล้วคนในบทบาทนั้นเปลี่ยนตาม
  await permSvc.saveRole(S, uOwner.id, {
    key: salesKey,
    name: "พนักงานขาย",
    cells: { ...salesCells, revenue: { view: true, create: true, pay: true } },
    capSatang: null,
  });
  const salesWithPay = await prisma.membership.findFirst({ where: { id: mSales.id } });
  assert(
    "S3.1 แก้ตารางบทบาท → สิทธิ์ของทุกคนในบทบาทนั้นเปลี่ยนตามทันที",
    ((salesWithPay?.permissions ?? {}) as Record<string, unknown>)["account.payment.record"] === true,
  );

  // เพดานรายคน
  const capRes = await permSvc.setApprovalCap(S, uOwner.id, mSales.id, 1_000_00);
  assert("S3.2 ตั้งเพดานรายคนได้", capRes.ok, !capRes.ok ? capRes.reason : "");
  await rejected("S3.3 เพดานติดลบ = ปฏิเสธ", () => permSvc.setApprovalCap(S, uOwner.id, mSales.id, -1), "ไม่ติดลบ");
  const capCleared = await permSvc.setApprovalCap(S, uOwner.id, mSales.id, null);
  assert("S3.4 ล้างเพดาน (ไม่จำกัด) ได้", capCleared.ok);
  const salesNoCap = await prisma.membership.findFirst({ where: { id: mSales.id } });
  eq(
    "S3.5 ล้างเพดานแล้วคีย์หายจริง",
    ((salesNoCap?.permissions ?? {}) as Record<string, unknown>)[matrix.APPROVE_CAP_KEY] ?? null,
    null,
  );

  // buildPermissionMap (ตัวที่กัน mergePermissions ล้างของโมดูลอื่น)
  eq(
    "S4.1 buildPermissionMap เก็บคีย์โมดูลอื่น + แทนคีย์บัญชีทั้งชุด",
    permSvc.buildPermissionMap({ "pos.sale.void": true, "account.doc.void": true }, ["account.doc.view"], null),
    { "pos.sale.void": true, "account.doc.view": true },
  );
  eq(
    "S4.2 buildPermissionMap ใส่เพดานเมื่อมีค่า",
    permSvc.buildPermissionMap({}, [], 5_000_000)[matrix.APPROVE_CAP_KEY],
    5_000_000,
  );
  eq("S4.3 เพดาน null = ไม่เขียนคีย์", Object.keys(permSvc.buildPermissionMap({}, [], null)).length, 0);
  assert(
    "S4.4 wildcard account.* ถูกแทนที่ด้วยชุดใหม่ (ไม่ค้างสิทธิ์เหมาเข่ง)",
    permSvc.buildPermissionMap({ "account.*": true }, ["account.doc.view"], null)["account.*"] === undefined,
  );

  // ═════════════════ P — บังคับใช้จริง (ปุ่มหาย + action 403) ═════════════════
  console.log("\nP บังคับใช้สิทธิ์ 'รับ/จ่ายเงิน':");
  const mkAuth = (m: { role: string; unitAccess: unknown; permissions: unknown }) =>
    ({ user: { id: "u" }, active: { role: m.role, unitAccess: m.unitAccess, permissions: m.permissions } }) as never;
  const noPayCells = { revenue: { view: true, create: true } };
  await permSvc.saveRole(S, uOwner.id, { key: salesKey, name: "พนักงานขาย", cells: noPayCells, capSatang: null });
  const mNoPay = await prisma.membership.findFirst({ where: { id: mSales.id } });
  assert("P1.1 ปิดช่อง 'รับ/จ่ายเงิน' → คีย์หายจาก Membership", ((mNoPay?.permissions ?? {}) as Record<string, unknown>)["account.payment.record"] !== true);
  assert("P1.2 ธงบนหน้าเอกสาร (accountCan) = false ⇒ ปุ่ม 'รับชำระ' หาย", !accountCan(mkAuth(mNoPay!), "account.payment.record"));
  assert("P1.3 ยังดูเอกสารได้ตามเดิม", accountCan(mkAuth(mNoPay!), "account.doc.view"));
  assert(
    "P1.4 evaluate() ปฏิเสธ action รับชำระ (= ที่ assertAccountCan ใช้ตัดสิน → 403)",
    !evaluate(
      { role: "STAFF", unitAccess: ["*"], permissions: (mNoPay?.permissions ?? {}) as Record<string, unknown> },
      { module: "account", action: "account.payment.record" },
    ),
  );
  await permSvc.saveRole(S, uOwner.id, {
    key: salesKey,
    name: "พนักงานขาย",
    cells: { revenue: { view: true, create: true, pay: true } },
    capSatang: null,
  });
  const mPay = await prisma.membership.findFirst({ where: { id: mSales.id } });
  assert("P1.5 เปิดช่องกลับ → ทำได้อีกครั้ง (ปุ่มกลับมา)", accountCan(mkAuth(mPay!), "account.payment.record"));
  assert(
    "P1.6 คนที่ไม่มีสิทธิ์ 'ตั้งค่า' เข้าหน้าตั้งค่าสิทธิ์ไม่ได้",
    !accountCan(mkAuth(mPay!), "account.settings.manage"),
  );

  // ═════════════════ C — เพดานอนุมัติ ═════════════════
  console.log("\nC เพดานอนุมัติ (PO 60,000 · เพดาน 50,000):");
  const vendor = await svc.createContact({ tenantId: tid, systemId: sid, kind: "VENDOR", name: "ผู้ขายทดสอบเพดาน" });
  const mkPo = async (amount: number, createdById: string) => {
    const doc = await exp.createPurchaseOrder({
      tenantId: tid,
      systemId: sid,
      docType: "PURCHASE_ORDER",
      contactId: vendor.id,
      issueDate: new Date(`${QC.today}T12:00:00+07:00`),
      createdById,
      lines: [{ description: "อุปกรณ์ดำน้ำ", qty: 1, unitPrice: amount, vatRateBp: 0 }],
    });
    await exp.submitForApproval(tid, sid, doc.id);
    return doc.id;
  };
  const po60 = await mkPo(6_000_000, uOwner.id);
  const approverCtx = { role: "STAFF" as const, unitAccess: ["*"], permissions: { [matrix.APPROVE_CAP_KEY]: 5_000_000 } };
  const capRes1 = await cap.checkApprovalCap({
    m: approverCtx,
    ctx: { tenantId: tid },
    systemId: sid,
    docId: po60,
    docType: "PURCHASE_ORDER",
    amountSatang: 6_000_000,
    approverUserId: uApprover.id,
    createdById: uOwner.id,
  });
  assert("C1.1 เพดาน 50,000 อนุมัติ PO 60,000 ไม่ได้", !capRes1.ok);
  assert(
    "C1.2 ข้อความไทยบอกทั้งยอดและเพดาน",
    !capRes1.ok && capRes1.reason.includes("฿60,000.00") && capRes1.reason.includes("฿50,000.00"),
    !capRes1.ok ? capRes1.reason : "",
  );
  const req = await prisma.approvalRequest.findFirst({ where: { tenantId: tid, entityType: "AccountDocument", entityId: po60 } });
  assert("C1.3 ไม่มีสายอนุมัติในร้าน → ยังไม่มีคำขอ (แต่ยังปฏิเสธการกด)", !req && !capRes1.ok);

  // ตั้งสายอนุมัติแล้วลองใหม่ — ต้อง "ส่งต่อ" ให้คนอื่น
  await approvalSvc.createPolicy(
    { tenantId: tid },
    { name: "อนุมัติเกินเพดาน", entityType: cap.ACCOUNT_APPROVAL_ENTITY, systemId: sid, steps: [{ order: 1, approverRole: "OWNER" }] },
  );
  const po60b = await mkPo(6_000_000, uOwner.id);
  const capRes2 = await cap.checkApprovalCap({
    m: approverCtx,
    ctx: { tenantId: tid },
    systemId: sid,
    docId: po60b,
    docType: "PURCHASE_ORDER",
    amountSatang: 6_000_000,
    approverUserId: uApprover.id,
    createdById: uOwner.id,
  });
  assert("C2.1 เกินเพดาน → ยังปฏิเสธการกดของคนนี้", !capRes2.ok);
  assert("C2.2 แต่ถูกส่งเข้าสายอนุมัติแล้ว (routed)", !capRes2.ok && capRes2.routed, JSON.stringify(capRes2));
  const req2 = await prisma.approvalRequest.findFirst({
    where: { tenantId: tid, entityType: "AccountDocument", entityId: po60b },
  });
  assert("C2.3 มีคำขออนุมัติค้างให้คนอื่นกด", !!req2 && req2.status === "PENDING", JSON.stringify(req2?.status));
  eq("C2.4 ยอดในคำขอ = ยอดเอกสาร", req2?.amountSatang, 6_000_000);
  eq("C2.5 เอกสารยังเป็น 'รออนุมัติ' (ไม่ถูกดันสถานะเอง)", (await prisma.accountDocument.findFirst({ where: { id: po60b } }))?.status, "AWAITING_APPROVAL");

  // คนที่มีเพดานสูงกว่า → ผ่าน
  const bossCtx = { role: "STAFF" as const, unitAccess: ["*"], permissions: { [matrix.APPROVE_CAP_KEY]: 10_000_000 } };
  const capRes3 = await cap.checkApprovalCap({
    m: bossCtx,
    ctx: { tenantId: tid },
    systemId: sid,
    docId: po60b,
    docType: "PURCHASE_ORDER",
    amountSatang: 6_000_000,
    approverUserId: uBoss.id,
    createdById: uOwner.id,
  });
  assert("C3.1 เพดาน 100,000 อนุมัติ PO 60,000 ได้", capRes3.ok);
  const approved = await exp.approvePurchaseOrder(tid, sid, po60b, uBoss.id, { maxSatang: 10_000_000 });
  assert("C3.2 อนุมัติจริงผ่าน (สถานะเปลี่ยน)", approved.ok, !approved.ok ? approved.reason : "");
  eq("C3.3 เอกสารเป็น APPROVED", (await prisma.accountDocument.findFirst({ where: { id: po60b } }))?.status, "APPROVED");

  // อนุมัติงานของตัวเองเกินเพดาน
  const poSelf = await mkPo(6_000_000, uApprover.id);
  const capSelf = await cap.checkApprovalCap({
    m: approverCtx,
    ctx: { tenantId: tid },
    systemId: sid,
    docId: poSelf,
    docType: "PURCHASE_ORDER",
    amountSatang: 6_000_000,
    approverUserId: uApprover.id,
    createdById: uApprover.id,
  });
  assert("C4.1 อนุมัติเอกสารที่ตัวเองสร้างและเกินเพดาน = ไม่ได้", !capSelf.ok);
  assert(
    "C4.2 ข้อความบอกชัดว่าเป็นเอกสารของตัวเอง",
    !capSelf.ok && capSelf.reason.includes("คุณเป็นคนสร้างเอง"),
    !capSelf.ok ? capSelf.reason : "",
  );
  const poUnder = await mkPo(1_000_000, uApprover.id);
  const capUnder = await cap.checkApprovalCap({
    m: approverCtx,
    ctx: { tenantId: tid },
    systemId: sid,
    docId: poUnder,
    docType: "PURCHASE_ORDER",
    amountSatang: 1_000_000,
    approverUserId: uApprover.id,
    createdById: uApprover.id,
  });
  assert("C4.3 ยอดไม่เกินเพดาน อนุมัติได้ตามปกติ (แม้เป็นเอกสารตัวเอง)", capUnder.ok);
  assert("C4.4 ไม่ตั้งเพดาน = ไม่จำกัด (พฤติกรรมเดิมของ OWNER/MANAGER)", cap.capOf({ role: "OWNER", unitAccess: ["*"], permissions: {} }) === undefined);
  eq("C4.5 ชนิดเอกสารที่มีเพดาน (§9.4 ฝั่งซื้อ)", cap.CAPPED_DOC_TYPES.length, 5);
  assert("C4.6 PO อยู่ในชนิดที่มีเพดาน", cap.isCappedDocType("PURCHASE_ORDER"));
  assert("C4.7 ใบแจ้งหนี้ไม่อยู่ในชนิดที่มีเพดาน", !cap.isCappedDocType("INVOICE"));

  // ผลของสายอนุมัติกลับเข้าเอกสาร
  const poRoute = await mkPo(6_000_000, uOwner.id);
  await cap.checkApprovalCap({
    m: approverCtx,
    ctx: { tenantId: tid },
    systemId: sid,
    docId: poRoute,
    docType: "PURCHASE_ORDER",
    amountSatang: 6_000_000,
    approverUserId: uApprover.id,
    createdById: uOwner.id,
  });
  const effects = await import("@/lib/approval-effects");
  await effects.applyApprovalEffect({
    tenantId: tid,
    type: "approval.request.approved",
    payload: { entityType: "AccountDocument", entityId: poRoute },
  });
  eq(
    "C5.1 ผู้มีอำนาจสูงกว่าอนุมัติผ่านสาย → เอกสารเป็น APPROVED เอง",
    (await prisma.accountDocument.findFirst({ where: { id: poRoute } }))?.status,
    "APPROVED",
  );
  await effects.applyApprovalEffect({
    tenantId: tid,
    type: "approval.request.approved",
    payload: { entityType: "AccountDocument", entityId: poRoute },
  });
  eq("C5.2 ยิงซ้ำ (replay) ไม่เปลี่ยนอะไร", (await prisma.accountDocument.findFirst({ where: { id: poRoute } }))?.status, "APPROVED");
  const poReject = await mkPo(6_000_000, uOwner.id);
  await effects.applyApprovalEffect({
    tenantId: tid,
    type: "approval.request.rejected",
    payload: { entityType: "AccountDocument", entityId: poReject },
  });
  eq("C5.3 ปฏิเสธผ่านสาย → เอกสารเป็น REJECTED", (await prisma.accountDocument.findFirst({ where: { id: poReject } }))?.status, "REJECTED");

  // ═════════════════ L — การเชื่อมต่อ ═════════════════
  console.log("\nL การเชื่อมต่อระบบ (§9.5):");
  const cOk = await conn.connect(S, "POS", posSys.id, uOwner.id);
  assert("L1.1 เชื่อม POS ได้", cOk.ok);
  await rejected("L1.2 ไม่มีระบบให้เชื่อม = ปฏิเสธพร้อมเหตุผลไทย", () => conn.connect(S, "HR", "", uOwner.id), "เปิดระบบก่อน");
  const optRes = await conn.setLinkOptions(S, "POS", posSys.id, { autoCreateContact: true, autoPost: true }, uOwner.id);
  assert("L1.3 ตั้งตัวเลือกได้", optRes.ok);
  const linkRow = await prisma.accountSystemLink.findFirst({ where: { systemId: sid, linkedKind: "POS" } });
  eq("L1.4 ตัวเลือกถูกเก็บจริงใน config", conn.parseLinkConfig(linkRow?.config), { autoCreateContact: true, autoPost: true });
  assert("L1.5 แถวใหม่ enabled = true", linkRow?.enabled === true);
  await rejected(
    "L1.6 ยังไม่เชื่อมแล้วตั้งตัวเลือก = ปฏิเสธ",
    () => conn.setLinkOptions(S, "CRM", "x", { autoPost: true }, uOwner.id),
    "ต้องเชื่อมระบบนี้ก่อน",
  );

  // ผลจริง: เชื่อมอยู่ → applyExternalSale ลงบัญชีให้
  const saleOk = await facade.applyExternalSale({
    tenantId: tid,
    sourceSystemId: posSys.id,
    refId: `qc-sale-${stamp}-1`,
    occurredAt: new Date(`${QC.today}T12:00:00+07:00`),
    grossSatang: 10_700,
    payMethods: [{ channel: "CASH", amountSatang: 10_700 }],
  });
  assert("L2.1 เชื่อมอยู่ → บิล POS ลงบัญชีให้", saleOk.posted, JSON.stringify(saleOk));

  const dRes = await conn.disconnect(S, "POS", posSys.id, uOwner.id);
  assert("L2.2 ตัดการเชื่อมได้", dRes.ok);
  const linkAfter = await prisma.accountSystemLink.findFirst({ where: { systemId: sid, linkedKind: "POS" } });
  assert("L2.3 ตัดแล้วแถวยังอยู่ (ไม่ลบ) แต่ enabled=false", !!linkAfter && linkAfter.enabled === false);
  eq("L2.4 ตัวเลือกเดิมยังอยู่ครบ", conn.parseLinkConfig(linkAfter?.config), { autoCreateContact: true, autoPost: true });
  const saleBlocked = await facade.applyExternalSale({
    tenantId: tid,
    sourceSystemId: posSys.id,
    refId: `qc-sale-${stamp}-2`,
    occurredAt: new Date(`${QC.today}T12:00:00+07:00`),
    grossSatang: 10_700,
    payMethods: [{ channel: "CASH", amountSatang: 10_700 }],
  });
  eq("L2.5 🔴 ตัดการเชื่อมแล้ว POS หยุดลงบัญชีทันที (ไม่เชื่อม = ไม่ลงบัญชีให้)", [saleBlocked.posted, saleBlocked.reason], [false, "unlinked"]);
  const reconnect = await conn.connect(S, "POS", posSys.id, uOwner.id);
  assert("L2.6 เชื่อมกลับได้", reconnect.ok);
  const linkBack = await prisma.accountSystemLink.findFirst({ where: { systemId: sid, linkedKind: "POS" } });
  eq("L2.7 เชื่อมกลับแล้วตัวเลือกเดิมยังอยู่ (ไม่ต้องตั้งใหม่)", conn.parseLinkConfig(linkBack?.config), {
    autoCreateContact: true,
    autoPost: true,
  });

  // kind ใหม่ 4 ตัว
  for (const k of ["MEMBER", "INVENTORY", "CHAT", "HR"] as const) {
    const r = await conn.connect(S, k, `${k}-${stamp}`, uOwner.id);
    assert(`L3.1 เชื่อม kind ใหม่ ${k} ได้ (enum เพิ่มจริง)`, r.ok);
  }
  // inboxFromChat ที่ consumer ของ 7.2 อ่าน
  await conn.setLinkOptions(S, "CHAT", `CHAT-${stamp}`, { inboxFromChat: true }, uOwner.id);
  const chatLink = await prisma.accountSystemLink.findFirst({
    where: { tenantId: tid, linkedKind: "CHAT", archivedAt: null, enabled: true },
    select: { systemId: true, config: true },
  });
  assert(
    "L4.1 สวิตช์ 'รับบิลจากแชท' เขียนลง config ที่ consumer 7.2 อ่าน",
    ((chatLink?.config ?? {}) as { inboxFromChat?: unknown }).inboxFromChat === true,
  );
  await conn.disconnect(S, "CHAT", `CHAT-${stamp}`, uOwner.id);
  const chatOff = await prisma.accountSystemLink.findFirst({
    where: { tenantId: tid, linkedKind: "CHAT", archivedAt: null, enabled: true },
  });
  assert("L4.2 ตัดการเชื่อมแชท → consumer หาไม่เจอ (หยุดดูดบิล)", !chatOff);
  void chatSys;

  const cardsScratch = await conn.buildConnectionCards(S, new Date(`${QC.today}T12:00:00+07:00`));
  eq("L5.1 การ์ดครบ 7 ใบตามแคตตาล็อก", cardsScratch.length, conn.CONNECTION_CATALOG.length);
  assert("L5.2 การ์ด POS = เชื่อมแล้ว", cardsScratch.find((c) => c.kind === "POS")?.status === "linked");
  assert("L5.3 การ์ดที่ยังไม่มีรายการ = ข้อความว่าง (ไม่แต่งตัวเลข)", cardsScratch.every((c) => c.monthCount >= 0));

  // ═════════════════ A — คีย์ API ═════════════════
  console.log("\nA คีย์ API:");
  const created = await apiKeys.createApiKey({ tenantId: tid }, "ระบบทดสอบ");
  assert("A1.1 คีย์ดิบขึ้นต้น shark_ และยาวพอ", created.rawKey.startsWith("shark_") && created.rawKey.length > 40);
  const keyRow = await prisma.apiKey.findFirst({ where: { id: created.id } });
  assert("A1.2 DB เก็บเฉพาะ hash ไม่เก็บคีย์ดิบ", !!keyRow && keyRow.keyHash !== created.rawKey && keyRow.keyHash.length === 64);
  eq("A1.3 prefix ตรงกับ 12 ตัวแรกของคีย์", keyRow?.prefix, created.rawKey.slice(0, 12));
  const verified = await apiKeys.verifyApiKey(created.rawKey);
  eq("A1.4 คีย์ใหม่ใช้ได้ (ชี้ร้านถูก)", verified?.tenantId, tid);
  await apiKeys.revokeApiKey({ tenantId: tid }, created.id);
  eq("A1.5 เพิกถอนแล้วใช้ไม่ได้อีก", await apiKeys.verifyApiKey(created.rawKey), null);
  eq("A1.6 คีย์มั่ว = ใช้ไม่ได้", await apiKeys.verifyApiKey("shark_ไม่มีจริง"), null);

  // ═════════════════ W — webhook ═════════════════
  console.log("\nW webhook เหตุการณ์บัญชี:");
  const hook = await webhooks.createEndpoint(
    { tenantId: tid },
    { url: "https://qc.invalid/hook", events: ["account.document.approved"] },
  );
  let sentBody: string | null = null;
  const fakeFetch = (async (_url: string, init?: { body?: string }) => {
    sentBody = init?.body ?? null;
    return { ok: true, status: 200, text: async () => "ok" };
  }) as unknown as typeof fetch;
  const n = await webhooks.dispatchWebhooks(
    { tenantId: tid, type: "account.document.approved", payload: { documentId: po60b } },
    { fetchFn: fakeFetch },
  );
  eq("W1.1 ยิงไป 1 ปลายทางที่สมัครไว้", n, 1);
  assert("W1.2 payload มีเลขเอกสารจริง", (sentBody ?? "").includes(po60b), sentBody ?? "(ว่าง)");
  const delivery = await prisma.webhookDelivery.findFirst({ where: { tenantId: tid, endpointId: hook.id } });
  eq("W1.3 มีแถวประวัติการส่ง สถานะสำเร็จ", delivery?.status, "OK");
  eq("W1.4 ชนิด event ที่บันทึกไว้ถูกต้อง", delivery?.eventType, "account.document.approved");
  const n2 = await webhooks.dispatchWebhooks(
    { tenantId: tid, type: "account.period.closed", payload: {} },
    { fetchFn: fakeFetch },
  );
  eq("W1.5 ปลายทางที่ไม่ได้สมัคร event นี้ ไม่ถูกยิง", n2, 0);
  // emit จริงจากโมดูลบัญชี → outbox
  await svc.emitAccountEvent({
    tenantId: tid,
    systemId: sid,
    type: "account.document.approved",
    idempotencyKey: `account.document.approved#${po60b}`,
    payload: { documentId: po60b },
  });
  const evt = await prisma.outboxEvent.findFirst({ where: { tenantId: tid, type: "account.document.approved" } });
  assert("W2.1 emitAccountEvent เขียน outbox จริง", !!evt);
  await svc.emitAccountEvent({
    tenantId: tid,
    systemId: sid,
    type: "account.document.approved",
    idempotencyKey: `account.document.approved#${po60b}`,
    payload: { documentId: po60b },
  });
  eq(
    "W2.2 emit ซ้ำ key เดิม ไม่เพิ่มแถว (idempotent)",
    await prisma.outboxEvent.count({ where: { tenantId: tid, type: "account.document.approved" } }),
    1,
  );

  // ═════════════════ G — ด่าน + แยกร้าน ═════════════════
  console.log("\nG ด่านสิทธิ์ + แยกร้าน:");
  const pageMap = (await import("@/lib/modules/account/guard")).ACCOUNT_PAGE_PERMISSIONS;
  eq("G1.1 หน้าสิทธิ์ผู้ใช้งานลงทะเบียนด่านแล้ว", pageMap["settings/permissions/page.tsx"], "account.settings.manage");
  eq("G1.2 หน้าการเชื่อมต่อลงทะเบียนด่านแล้ว", pageMap["settings/connections/page.tsx"], "account.settings.manage");
  assert(
    "G1.3 STAFF ที่ไม่มีสิทธิ์ตั้งค่า เข้า 2 หน้านี้ไม่ได้",
    !evaluate({ role: "STAFF", unitAccess: ["*"], permissions: { "account.doc.view": true } }, {
      module: "account",
      action: "account.settings.manage",
    }),
  );
  assert(
    "G1.4 ต้องมี settings.staff.write ถึงจะแจกสิทธิ์ให้คนอื่นได้ (ด่านชั้น 2 ของ staff/service)",
    staff.STAFF_ADMIN_ACTION === "settings.staff.write",
  );
  await rejected(
    "G1.5 คนที่ไม่มีสิทธิ์จัดการผู้ใช้ ตั้งบทบาทให้คนอื่นไม่ได้",
    () => permSvc.assignRole(S, uSales.id, mBoss.id, salesKey),
    "จัดการผู้ใช้งาน",
  );
  await rejected(
    "G1.6 แก้สิทธิ์ตัวเองไม่ได้ (ยกเว้นเจ้าของ)",
    () => staff.updateStaffAccess({ tenantId: tid, actorUserId: uSales.id, membershipId: mSales.id, permissions: {} }),
    "",
  );
  assert(
    "G1.7 คีย์ที่ทะเบียนกลางไม่รู้จัก เขียนลง Membership ไม่ได้",
    !staff.validatePermissionInput({ "account.ไม่มีจริง": true }).ok,
  );
  assert("G1.8 ทุกคีย์ในตารางผ่าน isPermissionKey ของทะเบียนกลาง", owned.every((k) => perms.isPermissionKey(k)));

  // แยกร้าน
  const otherRoles = await permSvc.getPermissionSettings({ tenantId: tid, systemId: sid });
  assert(
    "G2.1 บทบาทของร้านทดสอบไม่ปนกับร้าน QC",
    otherRoles.roles.filter((r) => !r.system).every((r) => ["พนักงานขาย", "ผู้อนุมัติ"].includes(r.name)) &&
      otherRoles.roles.length === 4,
    JSON.stringify(otherRoles.roles.map((r) => r.name)),
  );
  const usersOther = await permSvc.listAccountUsers({ tenantId: tid, systemId: sid });
  assert(
    "G2.2 ตารางผู้ใช้งานเห็นเฉพาะคนในร้านตัวเอง",
    usersOther.every((u) => u.email.includes(tag)),
    usersOther.map((u) => u.email).join(", "),
  );
  const crossLink = await conn.listLinks({ tenantId: tid, systemId: E.systemId });
  eq("G2.3 อ่าน link ข้ามร้านไม่ได้ (tenantDb กรองให้)", crossLink.length, 0);
  const crossCap = await permSvc.setApprovalCap(
    { tenantId: tid, systemId: sid },
    uOwner.id,
    P.memberships["sales@siamdive-qc.test"],
    100,
  );
  assert("G2.4 ตั้งเพดานให้คนของร้านอื่นไม่ได้", !crossCap.ok, JSON.stringify(crossCap));
  const qcSalesStill = await prisma.membership.findFirst({ where: { id: P.memberships["sales@siamdive-qc.test"] } });
  eq(
    "G2.5 ยืนยันว่าข้อมูลร้าน QC ไม่ถูกแตะ",
    ((qcSalesStill?.permissions ?? {}) as Record<string, unknown>)[matrix.APPROVE_CAP_KEY] ?? null,
    null,
  );
} finally {
  if (sTenantId) {
    const tid = sTenantId;
    const del = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
      } catch {
        /* ลบไม่ได้ = มีของอ้างอิงอยู่ ไม่ต้องล้มทั้งชุด */
      }
    };
    await del(() => prisma.webhookDelivery.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.webhookEndpoint.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.apiKey.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.outboxEvent.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.approvalDecision.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.approvalRequest.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.approvalStep.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.approvalPolicy.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountSystemLink.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountJournalLine.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountJournalEntry.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocumentPayment.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocumentRelation.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocumentLine.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountDocument.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountContact.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountMapping.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountLedger.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountPeriod.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.accountSettings.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.auditLog.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.appSystemUnit.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.appSystem.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.membership.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.businessUnit.deleteMany({ where: { tenantId: tid } }));
    await del(() => prisma.tenant.delete({ where: { id: tid } }));
  }
  await prisma.$disconnect();
}

console.log(`\n${findings.length === 0 ? "✅" : "❌"} ผ่าน ${passed} ข้อ · พบปัญหา ${findings.length} ข้อ`);
if (findings.length) {
  for (const f of findings) console.log("   • " + f);
  process.exit(1);
}
