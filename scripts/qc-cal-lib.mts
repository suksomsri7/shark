// qc-cal-lib.mts — ตัวช่วยร่วมของข้อสอบ RUN ปฏิทินเลขา (qc-cal-*.mts · เลน a)
//   ด่านฐาน (ฐาน QC เลขาเท่านั้น · exit 4) · chk/สรุป JSON_SUMMARY แบบชุด qc-sec · ร้าน/ผู้ใช้ทดสอบชั่วคราว + ลบทิ้ง · transport push ปลอม
// รัน (ทุกไฟล์): bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-cal-<ใบ>.mts
import { loadSecQcEnv } from "./sec-qc-env.mjs";
import { loadLegacyQcEnv } from "./qc-env-guard.mjs";

export type AnyMod = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function guard(label: string): void {
  loadSecQcEnv(label);
  loadLegacyQcEnv(label); // ค่า env อื่นของ .env.qc-sec (SESSION_SECRET ฯลฯ — route ที่ import session ต้องใช้) แบบชุด qc-sec
}

type Res = "PASS" | "FAIL";
const cks: { id: string; res: Res; why: string }[] = [];
export const chk = (id: string, name: string, ok: boolean, detail = ""): boolean => {
  cks.push({ id, res: ok ? "PASS" : "FAIL", why: detail });
  console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${!ok && detail ? ` — ${String(detail).slice(0, 400)}` : ""}`);
  return ok;
};
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);
export const thai = (s: unknown) => typeof s === "string" && /[฀-๿]/.test(s);

export function finish(label: string, extra: Record<string, unknown> = {}): never {
  const passed = cks.filter((c) => c.res === "PASS").length;
  const failed = cks.filter((c) => c.res === "FAIL");
  console.log(`\n${label}: ${passed}/${cks.length} ผ่าน · ${failed.length} ไม่ผ่าน`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: [], ...extra }));
  process.exit(failed.length ? 1 : 0);
}

/** transport push ปลอม — จดทุก payload · ตอบ ok ทุกใบ (หรือโยนตาม `failNext`) */
export function fakePush() {
  const sent: AnyMod[] = [];
  const st = { failNext: 0 };
  const post = async (payloads: unknown[]) => {
    if (st.failNext > 0) {
      st.failNext -= 1;
      throw new Error("qc: transport down");
    }
    for (const p of payloads) sent.push(p as AnyMod);
    return payloads.map(() => ({ status: "ok" }));
  };
  return { sent, post, st, clear: () => sent.splice(0, sent.length) };
}

/** ร้าน + ผู้ใช้ทดสอบชั่วคราว (slug ขึ้นต้น prefix) — คืนตัวลบ */
export async function makeFixture(prisma: AnyMod, prefix: string, users: Record<string, { role: string; permissions?: Record<string, unknown> }>, tenants = 1) {
  const STAMP = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const tids: string[] = [];
  const U: Record<string, string> = {};
  for (const k of Object.keys(users)) U[k] = `${prefix}-${k}-${STAMP}`;
  for (let i = 0; i < tenants; i++) {
    const t = await prisma.tenant.create({ data: { name: `QC CAL ${prefix} ${i + 1}`, slug: `${prefix}-${STAMP}-${i}` } });
    tids.push(t.id);
  }
  for (const [k, v] of Object.entries(users)) {
    await prisma.user.create({ data: { id: U[k], email: `${U[k]}@example.com`, name: `ผู้ใช้ ${k}` } });
    for (const tid of tids) {
      await prisma.membership.create({ data: { tenantId: tid, userId: U[k], role: v.role, unitAccess: ["*"], permissions: v.permissions ?? {}, acceptedAt: new Date() } });
    }
  }
  const cleanup = async (): Promise<number> => {
    const ids = Object.values(U);
    for (const m of ["calItem", "calPref", "calLink", "pushDevice", "session", "aiNotifyPref"]) {
      try { await prisma[m].deleteMany({ where: { userId: { in: ids } } }); } catch { /* */ }
    }
    const tables = ((await prisma.$queryRawUnsafe(
      `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
       WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
    )) as AnyMod[]).map((r) => String(r.t));
    for (const tid of tids) {
      let pending = [...tables];
      for (let pass = 0; pass < 10 && pending.length; pass++) {
        const next: string[] = [];
        for (const tb of pending) { try { await prisma.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, tid); } catch { next.push(tb); } }
        pending = next;
      }
      try { await prisma.chatRateBucket.deleteMany({ where: { key: { contains: tid } } }); } catch { /* */ }
      try { await prisma.tenant.deleteMany({ where: { id: tid, slug: { startsWith: prefix } } }); } catch { /* */ }
    }
    try { await prisma.user.deleteMany({ where: { id: { in: ids } } }); } catch { /* */ }
    let left = await prisma.user.count({ where: { id: { in: ids } } });
    left += await prisma.tenant.count({ where: { id: { in: tids } } });
    left += await prisma.calItem.count({ where: { userId: { in: ids } } });
    return left;
  };
  return { STAMP, tids, U, cleanup };
}
