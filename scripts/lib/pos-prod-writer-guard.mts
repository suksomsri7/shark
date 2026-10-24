// pos-prod-writer-guard.mts — ด่านเดียวของสคริปต์ "เขียนฐานข้อมูล" ของ POS ที่ runbook สั่งรันบน production (P6.1 CD-P61-R3 · R1 F3)
//
// ใช้โดย: scripts/pos-backfill-catalog.mts · scripts/pos-backfill-web-prices.mts · scripts/pos-shift-required-off.mts
// กติกา (เหมือนกันทุกสคริปต์ — runbook §8 อ้างไฟล์นี้):
//   1) URL มาจาก shell ของผู้รันเท่านั้น: `DATABASE_URL` ที่ส่งมาเอง (ไม่มี = หยุด exit 2)
//      🔴 ทางเขียน prod (ALLOW_PROD_BACKFILL=1) ห้ามโหลดไฟล์ env ใด ๆ — เดิม pos-backfill-catalog โหลด `.env` ของทรีที่รันแบบเงียบ (F3)
//   2) host ต้องอยู่ใน allowlist (label แรกของ hostname = mark หรือ mark + "-…") · ไม่อยู่ = หยุด exit 4 ก่อนต่อฐาน
//      ห้าม PGHOST/PGHOSTADDR · ห้าม ?host=/?hostaddr= · DIRECT_URL ที่ตั้งมาด้วยต้องเป็น host บทบาทเดียวกัน
//   3) บทบาท prod / rehearsal (branch ที่คัดลอกจาก prod — กติกาเดียวกับ prod · W31) ต้องตั้ง ALLOW_PROD_BACKFILL=1 เอง
//      + ต้องเลือกร้านชัด ๆ `--tenant=<id|slug>` (ซ้ำได้) หรือ `--all` ที่พิมพ์เอง (C13) · ใช้คู่กันไม่ได้
//      + รันจริงได้เมื่อมี dry-run ของ host + ชุดร้านเดียวกันภายใน 24 ชม. (ไฟล์บันทึกในเครื่อง `.qc-shots/pos/` ไม่ลง git)
//   4) บทบาท qc4 (ฐานข้อสอบ POS) = ไม่ต้อง ALLOW · ไม่ต้องเลือกร้าน (ไม่ระบุ = ทุกร้านในฐานนั้น)
//   5) พิมพ์แค่ป้าย host (`<mark>…`) + บทบาท — ห้ามพิมพ์ URL/รหัสผ่าน
// ทำไมไม่มี --url: ค่าใน argv ไปโผล่ใน `ps`/คำสั่งของ unit systemd ทุกคนในเครื่องเห็น — runbook ส่ง URL ผ่าน `env DATABASE_URL="$PROD_DIRECT_URL"`
//   หลัง iso.sh (iso.sh ไม่ส่ง env ของผู้เรียก) และตัวแปรนั้นตั้งด้วย `read -rs` (ไม่ลงประวัติ shell)
//
// เพิ่ม host ซ้อม (W31 · CD-P61-P3 · R1 F16): ผู้คุมเพิ่ม `{ mark: "<endpoint ของ branch ซ้อม>", role: "rehearsal" }` ใน commit วันเดียวกัน
//   แล้วลบออกหลังลบ branch — **ต้องเป็น role ใหม่ ห้ามใช้ role prod** (กติกา prod ทุกข้อใช้กับ rehearsal ด้วยอยู่แล้ว)
//
// ทดสอบตัวเอง (ไม่แตะ DB · ไม่ต้องมี env):  bash scripts/iso.sh pnpm exec tsx scripts/lib/pos-prod-writer-guard.mts --self-test
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { PROD_HOST_MARK } from "../qc-env-guard.mjs";

export type WriterRole = "prod" | "qc4" | "rehearsal";
export type WriterHost = { mark: string; role: WriterRole; note: string };

/** allowlist ของสคริปต์เขียน (ข้อมูล — ไม่มี URL/รหัสผ่าน) · prod = PROD_HOST_MARK ของ qc-env-guard (host เดียวกับที่ qc4.sh ปฏิเสธ) */
export const WRITER_HOST_ALLOWLIST: readonly WriterHost[] = [
  { mark: PROD_HOST_MARK, role: "prod", note: "Neon branch production — ต้อง ALLOW_PROD_BACKFILL=1 + --tenant/--all + dry-run ก่อน" },
  { mark: "ep-frosty-lab", role: "qc4", note: "QC4 wo-pos-qc4 (scripts/qc4.sh) — ฐานข้อสอบของ POS" },
];

export type WriterArgs = { dryRun: boolean; verify: boolean; all: boolean; tenants: string[]; unknown: string[]; emptyTenant: boolean };
/** อ่าน argv มาตรฐานของสคริปต์เขียน · `extra` = ธงเพิ่มของสคริปต์นั้น (ไม่นับเป็น unknown) */
export function parseWriterArgv(argv: readonly string[], extra: readonly string[] = []): WriterArgs {
  const out: WriterArgs = { dryRun: false, verify: false, all: false, tenants: [], unknown: [], emptyTenant: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "--dry-run" || a === "--dryrun") out.dryRun = true;
    else if (a === "--verify") out.verify = true;
    else if (a === "--all") out.all = true;
    else if (a.startsWith("--tenant=")) {
      const t = a.slice("--tenant=".length).trim();
      if (t) out.tenants.push(t);
      else out.emptyTenant = true;
    } else if (a === "--tenant") {
      const t = (argv[++i] ?? "").trim();
      if (t && !t.startsWith("--")) out.tenants.push(t);
      else out.emptyTenant = true;
    } else if (!extra.includes(a)) out.unknown.push(a);
  }
  return out;
}

export type WriterDecision =
  | { ok: true; role: WriterRole; label: string; prodLike: boolean }
  | { ok: false; code: string; reason: string; exit: 2 | 4 };

const normUrl = (v: string): string => {
  let x = v;
  for (let i = 0; i < 5; i++) {
    let d = x;
    try {
      d = decodeURIComponent(x);
    } catch {
      /* คงเดิม */
    }
    if (d === x) break;
    x = d;
  }
  return x.trim();
};
const labelOf = (raw: string): string | null => {
  try {
    const u = new URL(normUrl(raw));
    if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") return null;
    if (u.searchParams.has("host") || u.searchParams.has("hostaddr")) return null;
    return u.hostname.toLowerCase().split(".")[0] ?? "";
  } catch {
    return null;
  }
};
const hostOf = (label: string, allow: readonly WriterHost[]) => allow.find((h) => label === h.mark || label.startsWith(`${h.mark}-`));

/** ตัวตัดสิน (บริสุทธิ์ — --self-test เรียกด้วยชุดทดสอบปลอม) */
export function decideWriterTarget(env: Record<string, string | undefined>, args: WriterArgs, allow: readonly WriterHost[] = WRITER_HOST_ALLOWLIST): WriterDecision {
  if (args.unknown.length) return { ok: false, code: "BAD_ARG", reason: `ไม่รู้จัก ${args.unknown.join(" ")}`, exit: 2 };
  if (args.emptyTenant) return { ok: false, code: "BAD_ARG", reason: "--tenant ว่าง — ใส่ id หรือ slug ของร้าน", exit: 2 };
  if (args.all && args.tenants.length) return { ok: false, code: "BAD_ARG", reason: "ใช้ --tenant กับ --all พร้อมกันไม่ได้", exit: 2 };
  const raw = env.DATABASE_URL ?? "";
  if (!raw) return { ok: false, code: "NO_URL", reason: "ไม่มี DATABASE_URL — ส่งมาเองหลัง iso.sh: env DATABASE_URL=\"$PROD_DIRECT_URL\" … (QC4: ผ่าน scripts/qc4.sh)", exit: 2 };
  if (env.PGHOST || env.PGHOSTADDR) return { ok: false, code: "PGHOST", reason: "ตั้ง PGHOST/PGHOSTADDR อยู่ — ไดรเวอร์อาจไปคนละ host กับ URL", exit: 4 };
  const label = labelOf(raw);
  if (label === null) return { ok: false, code: "BAD_URL", reason: "DATABASE_URL อ่านไม่ได้ / ไม่ใช่ postgres / มี ?host= ซ้อน", exit: 4 };
  const hit = hostOf(label, allow);
  if (!hit) return { ok: false, code: "NOT_ALLOWLISTED", reason: `host ${label || "(ว่าง)"} ไม่อยู่ใน allowlist ของสคริปต์เขียน (scripts/lib/pos-prod-writer-guard.mts)`, exit: 4 };
  if (env.DIRECT_URL) {
    const dl = labelOf(env.DIRECT_URL);
    const dh = dl === null ? undefined : hostOf(dl, allow);
    if (!dh || dh.role !== hit.role || dh.mark !== hit.mark) return { ok: false, code: "MIXED", reason: "DIRECT_URL ไม่ใช่ host เดียวกับ DATABASE_URL (กันสภาพอ่านที่หนึ่ง เขียนอีกที่)", exit: 4 };
  }
  const prodLike = hit.role === "prod" || hit.role === "rehearsal";
  if (prodLike) {
    if (env.ALLOW_PROD_BACKFILL !== "1") return { ok: false, code: "NO_ALLOW", reason: `host = ${hit.role} — ต้องตั้ง ALLOW_PROD_BACKFILL=1 เอง และรัน --dry-run ก่อน`, exit: 4 };
    if (!args.tenants.length && !args.all) return { ok: false, code: "NO_TENANT", reason: `${hit.role} ต้องระบุ --tenant=<id> หรือ --all เอง (C13)`, exit: 4 };
  }
  return { ok: true, role: hit.role, label: `${hit.mark}…`, prodLike };
}

/** เรียกบรรทัดแรกของสคริปต์เขียน: ปฏิเสธ = พิมพ์เหตุ + exit · ผ่าน = พิมพ์ป้าย (เจ้าของต้องเห็น role=prod ก่อนตอบ "ทำ") */
export function guardWriterOrExit(script: string, args: WriterArgs): Extract<WriterDecision, { ok: true }> {
  const d = decideWriterTarget(process.env, args);
  if (!d.ok) {
    console.error(`🔴 หยุด! ${script}: ${d.code} — ${d.reason}`);
    console.log(`JSON_SUMMARY ${JSON.stringify({ suite: script, refused: d.code, exit: d.exit })}`);
    process.exit(d.exit);
  }
  if (d.prodLike) console.warn(`⚠️  ALLOW_PROD_BACKFILL=1 — กำลังรันบนฐาน ${d.role} (${d.label})${args.dryRun || args.verify ? " · dry-run/verify (ไม่เขียน)" : " · เขียนจริง"}`);
  console.log(`[target] ${script} · role=${d.role} · host=${d.label}${args.dryRun || args.verify ? " · DRY-RUN" : ""}`);
  return d;
}

// ── ด่าน "dry-run ก่อนเสมอ" (prod/rehearsal) — บันทึกในเครื่อง ไม่ลง git ──
const MARKER_DIR = ".qc-shots/pos";
export function dryRunMarkerPath(script: string, hostLabel: string, args: Pick<WriterArgs, "all" | "tenants">): string {
  const key = createHash("sha256").update(`${script}|${hostLabel}|${args.all ? "--all" : [...args.tenants].sort().join(",")}`).digest("hex").slice(0, 16);
  return `${MARKER_DIR}/${script}-dryrun-${key}.json`;
}
export function hasRecentDryRun(path: string, now = Date.now()): boolean {
  if (!existsSync(path)) return false;
  try {
    const m = JSON.parse(readFileSync(path, "utf8")) as { at?: string };
    return !!m.at && now - Date.parse(m.at) < 24 * 3600_000;
  } catch {
    return false;
  }
}
export function writeDryRunMarker(path: string, body: Record<string, unknown>): void {
  mkdirSync(MARKER_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify({ at: new Date().toISOString(), ...body }, null, 2));
}

// ═════════ --self-test (บริสุทธิ์ · ไม่แตะ DB/ไฟล์) ═════════
function selfTest(): number {
  const fake = (mark: string) => `postgresql://u:x@${mark}-000000.example.invalid/db`;
  const reh: WriterHost[] = [...WRITER_HOST_ALLOWLIST, { mark: "ep-rehearsal-test", role: "rehearsal", note: "ชุดทดสอบ" }];
  const A = (s: string) => parseWriterArgv(s ? s.split(" ") : []);
  const P = PROD_HOST_MARK;
  const cases: [string, Record<string, string | undefined>, WriterArgs, string, (readonly WriterHost[])?][] = [
    ["ไม่มี URL", {}, A("--dry-run"), "NO_URL"],
    ["host อื่น (QC1)", { DATABASE_URL: fake("ep-plain-art") }, A("--dry-run"), "NOT_ALLOWLISTED"],
    ["host ปลอมคำนำหน้า", { DATABASE_URL: fake(`${P}x`), ALLOW_PROD_BACKFILL: "1" }, A("--tenant=t1 --dry-run"), "NOT_ALLOWLISTED"],
    ["prod ไม่มี ALLOW", { DATABASE_URL: fake(P) }, A("--tenant=t1 --dry-run"), "NO_ALLOW"],
    ["prod + ALLOW ไม่เลือกร้าน", { DATABASE_URL: fake(P), ALLOW_PROD_BACKFILL: "1" }, A("--dry-run"), "NO_TENANT"],
    ["prod + ALLOW + --tenant", { DATABASE_URL: fake(P), ALLOW_PROD_BACKFILL: "1" }, A("--tenant=t1 --dry-run"), "prod"],
    ["prod + ALLOW + --all", { DATABASE_URL: fake(P), ALLOW_PROD_BACKFILL: "1" }, A("--all"), "prod"],
    ["prod percent-encoded ไม่มี ALLOW", { DATABASE_URL: `postgresql://u:x@%65p-royal-night-0.example.invalid/db` }, A("--all"), "NO_ALLOW"],
    ["--tenant + --all", { DATABASE_URL: fake("ep-frosty-lab") }, A("--tenant=t1 --all"), "BAD_ARG"],
    ["--tenant ว่าง", { DATABASE_URL: fake("ep-frosty-lab") }, A("--tenant="), "BAD_ARG"],
    ["ธงแปลก", { DATABASE_URL: fake("ep-frosty-lab") }, A("--yes"), "BAD_ARG"],
    ["?host= ซ้อน", { DATABASE_URL: `${fake("ep-frosty-lab")}?host=${P}-0.example.invalid` }, A("--dry-run"), "BAD_URL"],
    ["PGHOST ตั้งอยู่", { DATABASE_URL: fake("ep-frosty-lab"), PGHOST: "x" }, A("--dry-run"), "PGHOST"],
    ["DIRECT_URL ชี้ prod", { DATABASE_URL: fake("ep-frosty-lab"), DIRECT_URL: fake(P) }, A("--dry-run"), "MIXED"],
    ["QC4 ไม่ระบุร้าน", { DATABASE_URL: fake("ep-frosty-lab"), DIRECT_URL: fake("ep-frosty-lab") }, A("--dry-run"), "qc4"],
    ["rehearsal ไม่มี ALLOW", { DATABASE_URL: fake("ep-rehearsal-test") }, A("--tenant=t1 --dry-run"), "NO_ALLOW", reh],
    ["rehearsal + ALLOW + --tenant", { DATABASE_URL: fake("ep-rehearsal-test"), ALLOW_PROD_BACKFILL: "1" }, A("--tenant=t1"), "rehearsal", reh],
    ["rehearsal ไม่อยู่ใน allowlist จริงวันนี้", { DATABASE_URL: fake("ep-rehearsal-test"), ALLOW_PROD_BACKFILL: "1" }, A("--tenant=t1"), "NOT_ALLOWLISTED"],
  ];
  const bad: string[] = [];
  for (const [label, env, args, want, allow] of cases) {
    const r = decideWriterTarget(env, args, allow);
    const got = r.ok ? r.role : r.code;
    if (got !== want) bad.push(`${label}: ได้ ${got} คาด ${want}`);
  }
  // ด่าน marker: ไม่มีไฟล์ = ไม่ผ่าน · ชุดร้านต่างกัน = คนละไฟล์
  const p1 = dryRunMarkerPath("x", "h…", { all: false, tenants: ["b", "a"] });
  const p2 = dryRunMarkerPath("x", "h…", { all: false, tenants: ["a", "b"] });
  const p3 = dryRunMarkerPath("x", "h…", { all: true, tenants: [] });
  if (p1 !== p2) bad.push("marker: ลำดับ --tenant เปลี่ยนชื่อไฟล์");
  if (p1 === p3) bad.push("marker: --all ชนกับชุดร้าน");
  if (hasRecentDryRun("/nonexistent/pos-guard-selftest.json")) bad.push("marker: ไม่มีไฟล์แต่ผ่าน");
  const total = cases.length + 3;
  console.log(bad.length ? `🔴 pos-prod-writer-guard self-test: ${bad.join(" · ")}` : `🟢 pos-prod-writer-guard self-test: ${total}/${total} กรณีตรง`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: "pos-prod-writer-guard", mode: "self-test", total, passed: total - bad.length, failed: bad })}`);
  return bad.length ? 1 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--self-test")) process.exit(selfTest());
  console.error("ใช้: pnpm exec tsx scripts/lib/pos-prod-writer-guard.mts --self-test (ไฟล์นี้เป็นไลบรารีของสคริปต์เขียน)");
  process.exit(2);
}
