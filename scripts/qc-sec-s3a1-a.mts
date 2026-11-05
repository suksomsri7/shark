// QC — SECRETARY S3a.1-A · แอป: cmid ใน ref (R-Z28) · step-up ลบบัญชี (R-Z29) · กัน double-submit (R-Z30) — static + ไฟล์ผล
// สัญญา: ledger/secretary-briefs/sec-brief-S3a.1-A.md · RESOLUTIONS §Z.3
// รัน: bash scripts/iso.sh env QC_FORCE=1 pnpm exec tsx scripts/qc-sec-s3a1-a.mts
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = join(ROOT, "apps/mobile");
const LABEL = "qc-sec-s3a1-a";
type Sev = "CRITICAL" | "MAJOR" | "MINOR"; type Res = "PASS" | "FAIL" | "SKIP";
const cks: { id: string; res: Res; sev: Sev; why: string }[] = [];
const chk = (id: string, name: string, ok: boolean, detail = "", sev: Sev = "CRITICAL") => { cks.push({ id, res: ok ? "PASS" : "FAIL", sev, why: detail }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}${ok ? "" : " — " + detail}`); };
const rd = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d).flatMap((f) => { const q = join(d, f); return statSync(q).isDirectory() ? walk(q) : /\.tsx?$/.test(f) ? [q] : []; }) : []);

console.log("── Z28: clientMessageId ใน ref ──");
for (const [id, f] of [["Z28-1", "app/(app)/secretary/new.tsx"], ["Z28-2", "app/(app)/customers/[id]/info.tsx"]] as const) {
  const s = strip(rd(join(M, f)));
  const refs = /(cmidRef|clientMessageIdRef|cmRef)\s*=\s*useRef/.test(s) || /useRef<string\s*\|\s*null>\([^)]*\)[\s\S]{0,400}clientMessageId/.test(s);
  const inline = /clientMessageId:\s*clientMessageId\(\)/.test(s);
  chk(id, `${f}: cmid เก็บใน ref (ไม่สร้างใหม่ทุกครั้งที่กด) · ล้างเมื่อสำเร็จ`, refs && !inline, JSON.stringify({ refs, inline }));
}
{
  const s = strip(rd(join(M, "src/api/secretary.ts")) + rd(join(M, "app/(app)/secretary/new.tsx")) + rd(join(M, "app/(app)/secretary/room/[id].tsx")));
  chk("Z28-3", "409 pending ของ rooms/send ถูกจัดการ (รอแล้วลองใหม่ ไม่โชว์ error)", /pending/.test(s) && /409/.test(s), "grep 409/pending");
}
console.log("── Z29: step-up ลบบัญชี ──");
{
  const acc = strip(rd(join(M, "app/(app)/secretary/settings/account.tsx")) + rd(join(M, "app/(app)/secretary/settings/delete-account.tsx")) + walk(join(M, "app/(app)/secretary/settings")).map((f) => strip(rd(f))).join("\n"));
  const api = strip(rd(join(M, "src/api/secretary.ts")));
  chk("Z29-1", "ลบบัญชีส่ง {confirm, code} และมีขั้นขอรหัส (sms/request หรือ auth/otp) ก่อน", /code/.test(api.slice(api.indexOf("account/delete"))) && /(sms\/request|auth\/otp|requestCode|requestOtp)/.test(acc) && /code/.test(acc), JSON.stringify({ apiCode: /code/.test(api.slice(api.indexOf("account/delete"))), step: /(sms\/request|auth\/otp|requestCode|requestOtp)/.test(acc) }));
  const th = rd(join(M, "src/i18n/th.ts")), en = rd(join(M, "src/i18n/en.ts"));
  const keys = (s: string) => new Set([...s.matchAll(/^\s*"?([a-zA-Z0-9_.-]+)"?\s*:/gm)].map((m) => m[1]!));
  const kt = keys(th), ke = keys(en); const miss = [...kt].filter((k) => !ke.has(k)).concat([...ke].filter((k) => !kt.has(k)));
  chk("Z29-2", "i18n th/en คีย์เท่ากัน (รวมคีย์ขั้นขอรหัส)", miss.length === 0 && /รหัส/.test(th), miss.slice(0, 5).join(","));
}
console.log("── Z30: double-submit ──");
{
  const files = [...walk(join(M, "app/(app)/secretary")), ...walk(join(M, "app/(app)/customers")), ...walk(join(M, "app/(app)/business")), join(M, "app/login.tsx"), join(M, "app/signup.tsx"), join(M, "app/otp.tsx"), join(M, "app/phone.tsx")].filter((f) => existsSync(f) && !/_gallery/.test(f));
  const bad: string[] = [];
  for (const f of files) {
    const s = strip(rd(f));
    const submits = [...s.matchAll(/(approve|reject|send|submit|invite|accept|delete|resend|verify|save)[A-Za-z]*\s*=\s*(async\s*)?\(/g)].length;
    const guards = [...s.matchAll(/(busyRef|busy\b|inflight|submitting|pending|sendingRef|lock)/g)].length;
    if (submits > 0 && guards === 0) bad.push(f.replace(M + "/", ""));
  }
  chk("Z30-1", "ทุกจอที่มีฟังก์ชันส่งมีตัวกันกดซ้ำ (busy/inflight/ref)", bad.length === 0, bad.slice(0, 6).join(" · "));
}
console.log("── M: typecheck mobile ──");
{
  const r = spawnSync("pnpm", ["exec", "tsc", "--noEmit", "-p", join(M, "tsconfig.json")], { cwd: M, encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=5632" }, timeout: 900_000 });
  chk("M-1", "apps/mobile typecheck 0", r.status === 0, (r.stdout + r.stderr).split("\n").filter((l) => /error TS/.test(l)).slice(0, 3).join(" | "));
}
console.log("── D: fitness ──");
for (const i of [1, 2]) { const r = spawnSync("pnpm", ["fitness"], { cwd: ROOT, encoding: "utf8", env: process.env, timeout: 600_000 }); chk(`D-${i}`, `pnpm fitness ครั้งที่ ${i} = 0`, r.status === 0, (r.stdout ?? "").split("\n").filter((l) => /❌|CRITICAL/.test(l)).slice(0, 3).join(" | ")); }
const passed = cks.filter((c) => c.res === "PASS").length; const failed = cks.filter((c) => c.res === "FAIL"); const skipped = cks.filter((c) => c.res === "SKIP");
console.log(`\n${LABEL}: ${passed}/${cks.length} ผ่าน · ${failed.length} ไม่ผ่าน · ${skipped.length} ข้าม`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: cks.length, passed, failed: failed.map((c) => c.id), skipped: skipped.map((c) => c.id), findings: failed.map((c) => ({ id: c.id, sev: c.sev })) }));
process.exit(failed.length ? 1 : 0);
