// QC — POS RUN ใบ P5.2 (ครึ่งแรก): ตารางสิทธิ์ + oracle แดงก่อน (สิทธิ์ · ข้ามร้าน/สาขา · หน้าสาธารณะ · คีย์ REST · ลายเซ็น/เล่นซ้ำ)
//   brief = ledger/pos-briefs/pos-brief-P5.md §4 P5.2 · §8 · §10 addendum (ruling 3 ตารางเดียว · 5 โทเคน/เพดาน · 6 เล่นซ้ำ) · โน้ต = ledger/wo-notes/pos-P5.2-oracle.md
//   ตาราง = scripts/pos-authz-matrix.json (สร้างด้วย scripts/pos-authz-matrix-gen.mts --write) — ทุกข้ออ้างแถวที่พิสูจน์ (ช่อง ref ในทะเบียน)
//
// รัน:  env -C <tree> ISO_MEM=3G bash scripts/iso.sh bash scripts/qc4.sh env QC_FORCE=1 GATE_LOCK_FILE=/tmp/shark-gate-pos.lock bash scripts/with-gate-lock.sh pnpm exec tsx scripts/qc-pos-p5.2.mts
//       --list  = พิมพ์ทุก id ไม่แตะ DB · --no-db = ข้อสถิต (M* · P*-static · S*-static · N*) ไม่โหลด prisma
//       P52_PIN = ฐานของข้อสอบ (ค่าเริ่มต้น 2fb1fe8e) · P52_LANE_PIN = หมุดเลน (ไม่มีข้อ diff — พิมพ์ไว้เท่านั้น)
// DB: QC4 เท่านั้น · ร้านชั่วคราว posqc-p52-<rand> (A: 2 สาขา) + posqc-p52-<rand>-b (B: ร้านอื่น) ลบทั้งร้านใน finally ·
//     ร้าน QC resto/coffee อ่านอย่างเดียว (T3 · P4 · P7) + ลายนิ้วมือก่อน/หลัง (Z2) · ไม่ reseed · ไม่มีเครือข่าย (fetch = ตัวกั้น 503)
// ไม่มีด่าน SKIP (ทุก surface มีอยู่แล้ว) ⇒ QC_FORCE ไม่มีผล · ข้อที่เขียวบนฐานเพราะโค้ดถูก = จดใน notes · N1–N4 = probe กลับค่า (ตัวตัดสินแดงได้จริง)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SUITE = "qc-pos-p5.2";
const ROOT = process.cwd();
const LIST = process.argv.includes("--list");
const NODB = process.argv.includes("--no-db");
const FORCE = process.env.QC_FORCE === "1";
/** ฐานของข้อสอบ (session/pos ตอนเขียน) — env override */
const PIN = process.env.P52_PIN || "2fb1fe8e";
/** หมุดเลน (ข้อสอบนี้ไม่มีข้อ diff เทียบหมุด — พิมพ์ไว้ให้ผู้คุม) */
const LANE_PIN = process.env.P52_LANE_PIN || PIN;

// ═════════════════════════ ทะเบียนข้อสอบ D(id · กลุ่ม · หัวข้อ · แถวตารางที่พิสูจน์) ═════════════════════════
type Def = readonly [string, string, string, string];
const D = (id: string, x: string, title: string, ref: string): Def => [`P5.2-${id}`, x, title, ref] as const;
const CHECKS: readonly Def[] = [
  D("M1", "S", "[ruling 3] ตาราง ⊇ ทุก surface ที่สแกนเจอ (page · action · route · REST op) และไม่มีแถวค้างที่หายจากโค้ด", "rows[*]"),
  D("M2", "S", "ทุกแถวมีหลักฐาน file:line ที่มีจริง · อยู่ในไฟล์/ตัวฟังก์ชันของ surface นั้น · บรรทัดมีเครื่องหมายด่าน (หรือแถวคงที่ที่ไม่มีข้อมูลร้าน)", "rows[*].evidence"),
  D("M3", "S", "coveredBy ทุก id มีไฟล์ scripts/<id>.mts และอยู่ใน pos-gates.json", "rows[*].coveredBy"),
  D("M4", "S", "รูปตาราง: เรียงตาม surface ไม่ซ้ำ · kind ถูก · ครบ 9 บทบาท ค่าในชุด · ไม่มี ? บนแถว action/page", "rows[*].roles"),
  D("M5", "S", "ตารางตรงกับตัวสร้าง (pos-authz-matrix-gen --check) — โค้ดเปลี่ยนแต่ไม่ regenerate = แดง", "$generator"),
  D("P1", "S", "[ruling 5 · static] โทเคนสาธารณะจาก crypto ≥ 60 บิต: ใบเสร็จ 12×5 · ออเดอร์ 12×5 · ลิงก์ 16×5 · จอ 32 ไบต์ · intent 12 ไบต์ · ตัวช่วยพิมพ์ 32 ไบต์ · ไม่มี Math.random", "(store)/r · /q/o · /q · /d · beam webhook · print-agent"),
  D("P2", "S", "[ruling 5 · static · ORACLE-EDIT CD-P52-F4] QR โต๊ะ (RestaurantTable.qrToken) ≥ 60 บิตตั้งแต่สร้าง: ทุกจุดสร้างตั้ง qrToken จากตัวสร้าง randomBytes ของ crypto (≥ 60 บิต) · rotateQr ใช้ตัวสร้างเดียวกัน (schema @default(cuid()) คงไว้ — ไม่ถูกใช้)", "src/app/(store)/q/t/[qrToken]/page.tsx"),
  D("P3", "S", "[static] โทเคนผิดรูป = ปฏิเสธก่อนแตะ DB (saleForToken · tableCtx · linkCtx · orderOfToken · rowOfToken · agentOf)", "public rows"),
  D("P4", "P", "[db] 404 ไม่ใช่ 403: โทเคนผิดรูป = โทเคนรูปถูกแต่ไม่มี (รหัสเดียวกัน) · QR โต๊ะจริงของ resto = สาขาของ resto เท่านั้น (ผูกโทเคน)", "(store)/r · /q/t · /q · /q/o"),
  D("P5", "S", "[ruling 5 · static] เพดานต่อ IP บนแขนงใบเสร็จ POS: หน้า /r/<token> แขนง POS + publicReceiptAction + แจ้งปัญหา/ขอใบกำกับ/รีวิว", "src/app/(store)/r/[token]/page.tsx · pos-receipt-actions.ts#*"),
  D("P6", "S", "[ruling 5 · static · ORACLE-EDIT CD-P52-F3b] กันไล่เดาโทเคนของ /q ที่ qrGuard: peek ถังพลาดต่อ IP ก่อน body · TOKEN_INVALID = นับพลาด · โทเคนจริง = ถังต่อ (IP, แฮชโทเคน) · 12 ประตูส่ง gate · ทุกจุดเรียกใต้ (store)/q ส่ง {ip}", "src/app/(store)/q/actions.ts#* · /q pages"),
  D("P9", "P", "[db · self-test CD-P52-F3b] linkDoor โทเคนจริง: IP เดียวอ่านครบงบ → ครั้งถัดไป RATE_LIMITED · IP ที่สองยังอ่านได้ · IP เดิมอ่านโทเคนที่สองได้ (ต่อโทเคน) · พลาดครบงบจาก IP หนึ่ง → โทเคนจริงจาก IP นั้น = TOKEN_INVALID · ไม่มี meta = ไม่นับ", "src/lib/modules/pos/qr-order.ts#qrGuard"),
  D("P7", "P", "[db · PDPA] ใบเสร็จสาธารณะไม่มีข้อมูลสมาชิก: ไม่มี id/ชื่อ/เบอร์/อีเมลของสมาชิก ไม่มี memberId/tenantId/unitId (บิลสมาชิกของ coffee · อ่านอย่างเดียว)", "src/app/(store)/r/[token]/pos-receipt-actions.ts#publicReceiptAction"),
  D("P8", "S", "[static] action สาธารณะรับแค่โทเคน + ข้อมูลที่ลูกค้ากรอก (ไม่มีพารามิเตอร์ tenantId/unitId/systemId/saleId)", "kind public · (store)/**/actions.ts"),
  D("R1", "R", "[db] CASHIER (pos.sale.create ที่สาขา A) × ทุกแถว action ที่ CASHIER=deny → ปฏิเสธ (ไม่ ok · ไม่ throw)", "rows[kind=action, CASHIER=deny]"),
  D("R2", "R", "[db] STAFF_NOPERM (ไม่มีคีย์ POS) × ทุกแถว action ที่ STAFF_NOPERM=deny → ปฏิเสธ", "rows[kind=action, STAFF_NOPERM=deny]"),
  D("R3", "R", "[db] คำปฏิเสธของ R1/R2 เป็นรหัสสิทธิ์/ไม่พบ (PERMISSION_DENIED · NO_PERMISSION · NOT_FOUND …) ไม่ใช่ VALIDATION/UNKNOWN ก่อนตรวจสิทธิ์", "rows[R1 ∪ R2]"),
  D("R4", "R", "[db] ANON (ไม่มี session) × ทุกแถว action → redirect /login หรือคำปฏิเสธ · ไม่มี ok:true", "rows[kind=action].ANON"),
  D("R5", "R", "[db] ตัวควบคุมบวก: OWNER/MANAGER/CASHIER ของสาขา A อ่านบิล A ได้ (ok + เห็นเลขบิล) — harness เห็นข้อมูลจริง ⇒ ผลลบมีความหมาย", "bills-actions.ts#billDetailAction · receipt-actions.ts#receiptPayloadAction"),
  D("T1", "X", "[db] OTHER_TENANT: OWNER ร้าน B × ทุกแถว action ด้วย id ระบบ/สาขา/บิลของร้าน A → ไม่เห็นข้อมูล A · แถวของ A ไม่เปลี่ยน · ไม่มีแถวของ B ที่อ้างระบบ/สาขาของ A", "rows[kind=action].OTHER_TENANT"),
  D("T2", "X", "[db] OTHER_UNIT (X2/IDOR): MANAGER สาขา A1 × แถว unitScoped ด้วย unitId/บิลของสาขา A2 → ไม่เห็นบิล A2 · แถวของ A2 ไม่เปลี่ยน", "rows[unitScoped, OTHER_UNIT=deny]"),
  D("T3", "X", "[db] ร้าน QC resto (อ่านอย่างเดียว): OWNER ร้าน A × แถวอ่าน ด้วย id ระบบ/สาขา/บิลของ resto → ไม่เห็นข้อมูล resto · ลายนิ้วมือ resto เท่าเดิม", "rows[read allowlist]"),
  D("K1", "K", "[db] REST {id} ข้ามร้าน: คีย์ pos-admin ของร้าน A × ทุก op ที่มี {id} ด้วยบิลของร้าน B → GET 404 · เขียนไม่ 2xx · ไม่เห็นข้อมูล B · บิล B ไม่เปลี่ยน", "rows[rest:* {id}]"),
  D("K2", "K", "[db] REST ตัวกรองสาขา: คีย์ pos-admin + pos.filter.unit:A1 × GET/POST {id} ของบิล A2 → 404/ไม่ 2xx · ตัวควบคุมบวก GET บิล A1 = 200", "rest:GET /sales/{id} · rest:POST /sales/{id}/void"),
  D("S1", "S", "[static] เทียบลายเซ็นแบบ timing-safe (Beam · x-shark-signature) · โทเคนเครื่อง/จอค้นด้วย hash · route ไม่ log เนื้อคำขอดิบ/ค่าลับ/หัว authorization", "beam webhook · platform · print-agent · /d"),
  D("S2", "S", "[ruling 6 · static] แพลตฟอร์มขาเข้า: ลายเซ็นถูก = 503 ADAPTER_PENDING ไม่มีการเขียน ⇒ เล่นซ้ำไม่มีผล (nonce/timestamp = adapter จริง · H6)", "src/app/api/pos/platform/[provider]/[channelId]/route.ts#POST"),
  D("S3", "S", "[ruling 6 · db] Beam webhook route: ลายเซ็นผิด = 401 ไม่เปลี่ยน · body เดิม ×2 = 200 ×2 · ใบขอรับเงิน PAID ครั้งเดียว · paidAt เดิม · outbox 1 แถว", "src/app/api/payment/beam/webhook/route.ts#POST"),
  D("S4", "S", "[ruling 6 · db] print-agent ack route: ack ok ×2 = 200 ×2 สถานะ DONE · doneAt เดิม · ack ด้วยโทเคนของร้านอื่น ≠ 200", "src/app/api/pos/print-agent/jobs/[id]/ack/route.ts#POST"),
  D("N1", "N", "[probe กลับค่า] ตัวตัดสิน M1 กับตารางที่ตัดแถว action ออก 1 แถว → ต้องรายงาน unlisted 1", "M1"),
  D("N2", "N", "[probe กลับค่า] ตัวตัดสิน R (denied) กับผล ok:true / data[] ไม่ว่าง → ต้องไม่ผ่าน · คำปฏิเสธ → ผ่าน", "R1 R2 R4"),
  D("N3", "N", "[probe กลับค่า] ตัวตัดสินเอนโทรปี: 11×5 บิต (55) → แดง · Math.random → แดง · 12×5 crypto → ผ่าน", "P1 P2"),
  D("N4", "N", "[probe กลับค่า] ตัวตัดสินรั่ว: ผลที่มีเลขบิลแฝง → รั่ว · ไม่มี → ไม่รั่ว", "T1 T2 T3 K1"),
  D("Z1", "Z", "QC4 คืนสภาพ: ร้านชั่วคราว A/B เหลือ 0 แถวทุกตารางที่มี tenantId · Tenant/User ของรอบถูกลบ · ถังเพดานของคีย์รอบนี้ 0", "-"),
  D("Z2", "Z", "ลายนิ้วมือร้าน QC coffee/resto + ตาราง POS นอกร้านชั่วคราวเท่าเดิม", "-"),
];
const STATIC_IDS = new Set(["P5.2-M1", "P5.2-M2", "P5.2-M3", "P5.2-M4", "P5.2-M5", "P5.2-P1", "P5.2-P2", "P5.2-P3", "P5.2-P5", "P5.2-P6", "P5.2-P8", "P5.2-S1", "P5.2-S2", "P5.2-N1", "P5.2-N2", "P5.2-N3", "P5.2-N4"]);
if (LIST) {
  for (const [id, x, title, ref] of CHECKS) console.log(`${id}\t${x}\t${STATIC_IDS.has(id) ? "static" : "db"}\t${title}\t← ${ref}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "list", total: CHECKS.length, passed: 0, static: STATIC_IDS.size, pin: PIN })}`);
  process.exit(0);
}

// ═════════════════════════ ผลตรวจ ═════════════════════════
const results = new Map<string, { ok: boolean; expected: string; actual: string }>();
function chk(id: string, ok: boolean, expected: string, actual: string): void {
  const full = id.startsWith("P5.2-") ? id : `P5.2-${id}`;
  results.set(full, { ok, expected, actual: actual.slice(0, 900) });
  const title = CHECKS.find(([i]) => i === full)?.[2] ?? "";
  console.log(`  ${ok ? "✅" : "❌"} [${full}] ${title.slice(0, 110)}${ok ? ` — ${actual.slice(0, 260)}` : `\n       expected: ${expected}\n       actual:   ${actual.slice(0, 900)}`}`);
}
const rd = (p: string): string => {
  try {
    return readFileSync(join(ROOT, p), "utf8");
  } catch {
    return "";
  }
};
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
/** ตัวฟังก์ชัน (จาก `function NAME`/`const NAME =` ถึงประกาศระดับบนถัดไป) */
function fnBody(text: string, name: string): string {
  const m = new RegExp(`^(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b|^(?:export\\s+)?const\\s+${name}\\s*=`, "m").exec(text);
  if (!m) return "";
  const rest = text.slice(m.index);
  const next = rest.slice(1).search(/^(?:export\s|async\s+function\s|function\s|const\s|type\s|\/\*\*|\/\/ ═)/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

// ═════════════════════════ ตัวตัดสินแบบ pure (ใช้ทั้งข้อจริงและ N1–N4) ═════════════════════════
type MRow = { surface: string; kind: string; roles: Record<string, string>; perm: string[]; tenantScope: string; unitScoped: boolean; call: string; evidence: string; coveredBy: string; notes: string };
function judgeM1(scanned: string[], rows: MRow[]): { unlisted: string[]; stale: string[] } {
  const have = new Set(rows.map((r) => r.surface));
  const sc = new Set(scanned);
  return { unlisted: scanned.filter((s) => !have.has(s)), stale: rows.map((r) => r.surface).filter((s) => !sc.has(s)) };
}
type Outcome = { kind: "ok" | "refused" | "redirect" | "throw" | "timeout" | "missing"; code: string; text: string };
const LEGACY = "src/lib/actions/pos.ts";
/** ปฏิเสธจริงไหม: ok:false · redirect · (ไฟล์เดิม) ForbiddenError · ผลว่าง (array/สตริงว่าง) */
function judgeDenied(o: Outcome, surface: string): boolean {
  if (o.kind === "refused" || o.kind === "redirect") return true;
  if (o.kind === "throw" && surface.startsWith(LEGACY) && /Forbidden|ไม่มีสิทธิ์|NEXT_NOT_FOUND/.test(o.code + o.text)) return true;
  return false;
}
const DENY_CODE = /PERMISSION|FORBIDDEN|DENIED|NO_PERMISSION|NOT_FOUND|UNAUTHORIZED|NOT_ALLOWED|redirect|Forbidden/;
type TokenSpec = { name: string; len: number; bitsPerUnit: number; csprng: boolean };
const entropyBits = (t: TokenSpec): number => (t.csprng ? t.len * t.bitsPerUnit : 0);
const judgeEntropy = (t: TokenSpec, min = 60): boolean => t.csprng && entropyBits(t) >= min;
function leaks(text: string, sentinels: string[]): string[] {
  return sentinels.filter((s) => s && text.includes(s));
}

// ═════════════════════════ 1. ข้อสถิต ═════════════════════════
const gen = (await import("./pos-authz-matrix-gen.mts" as string)) as Any;
const MATRIX_TEXT = rd("scripts/pos-authz-matrix.json");
let MATRIX: { rows: MRow[] } & Record<string, Any> = { rows: [] };
try {
  MATRIX = JSON.parse(MATRIX_TEXT);
} catch (e) {
  console.log(`💥 อ่าน scripts/pos-authz-matrix.json ไม่ได้: ${(e as Error).message}`);
}
const ROWS: MRow[] = Array.isArray(MATRIX.rows) ? MATRIX.rows : [];
const rowOf = (surface: string) => ROWS.find((r) => r.surface === surface);

function runStatic(): void {
  console.log(`\n── [static] ตาราง ${ROWS.length} แถว · ฐาน ${PIN} · หมุดเลน ${LANE_PIN} ──`);
  // M1
  const scanned: string[] = (gen.scanSurfaces(ROOT) as { surface: string }[]).map((s) => s.surface);
  const m1 = judgeM1(scanned, ROWS);
  chk("M1", scanned.length > 0 && m1.unlisted.length === 0 && m1.stale.length === 0, "unlisted 0 · stale 0", `สแกน ${scanned.length} · ตาราง ${ROWS.length} · unlisted ${m1.unlisted.length}${m1.unlisted.length ? ` [${m1.unlisted.slice(0, 8).join(" · ")}]` : ""} · stale ${m1.stale.length}${m1.stale.length ? ` [${m1.stale.slice(0, 8).join(" · ")}]` : ""}`);
  // M2
  {
    const bad: string[] = [];
    const MARK = /assert\w*Can|dispatch\(|evaluate\(|canAccessUnit|gate\(|[sS]cope\w*\(|session\w*\(|run\(|requireTenant|getAuth|View\(|posCanSetTenantPrice|is\w+Token\(|_RE\.test|[tT]oken|cookies\(\)|DISPLAY_COOKIE|authorization|verifyWebhook|isCronAuthorized|checkRateLimit|POS_SCOPES|handlePlatformInbound|ackPrintJob|legacyTableQrRedirect|status: 405|role|canViewPayroll|NEED|["'](?:pos|restaurant|inventory|api)\.[a-zA-Z]+\.[a-zA-Z]+["']/;
    for (const r of ROWS) {
      const m = /^(.*):(\d+)$/.exec(r.evidence ?? "");
      if (!m) {
        bad.push(`${r.surface}: ไม่มีหลักฐาน`);
        continue;
      }
      const [, file, ln] = m;
      const text = rd(file!);
      if (!text) {
        bad.push(`${r.surface}: ไม่มีไฟล์ ${file}`);
        continue;
      }
      const lines = text.split("\n");
      const n = Number(ln);
      const line = lines[n - 1] ?? "";
      if (!line.trim()) {
        bad.push(`${r.surface}: บรรทัด ${n} ว่าง/เกินไฟล์`);
        continue;
      }
      const surfFile = r.surface.startsWith("rest:") ? "" : r.surface.split("#")[0]!;
      if (surfFile && surfFile !== file) bad.push(`${r.surface}: หลักฐานอยู่คนละไฟล์ (${file})`);
      if (r.surface.includes("#") && !r.surface.startsWith("rest:") && !file!.endsWith("route.ts")) {
        const name = r.surface.split("#")[1]!;
        const at = lines.findIndex((l) => new RegExp(`^export\\s+async\\s+function\\s+${name}\\b`).test(l)) + 1;
        const nextExp = lines.findIndex((l, i) => i >= at && /^export\s/.test(l)) + 1 || lines.length + 1;
        if (!(n >= at && n < nextExp)) bad.push(`${r.surface}: บรรทัด ${n} อยู่นอกตัวฟังก์ชัน (${at}–${nextExp - 1})`);
      }
      if (r.surface.startsWith("rest:")) {
        const op = /op ([\w.]+)/.exec(r.notes ?? "")?.[1] ?? "";
        if (!op || !lines.slice(Math.max(0, n - 12), n).some((l) => l.includes(`"${op}"`))) bad.push(`${r.surface}: หลักฐานไม่อยู่ใน definePosOp ของ ${op || "?"}`);
      }
      const staticDoc = /ไม่มีข้อมูลร้าน/.test(r.tenantScope ?? "");
      // ตัวช่วยด่านในไฟล์เดียวกัน (ฟังก์ชัน/ค่าคงที่ที่มี assertCan/evaluate/canAccessUnit/ตรวจบทบาท) — บรรทัดที่เรียกมัน = หลักฐาน
      const helperCall = [...text.matchAll(/^(?:async\s+)?function\s+(\w+)|^const\s+(\w+)\s*=/gm)]
        .map((h) => h[1] ?? h[2]!)
        .some((h) => new RegExp(`\\b${h}\\s*\\(`).test(line) && /assertCan|evaluate\(|canAccessUnit|role\s*[!=]==|canViewPayroll/.test(fnBody(text, h)));
      if (!MARK.test(line) && !helperCall && !(staticDoc && /export/.test(line))) bad.push(`${r.surface}: บรรทัด ${n} ไม่มีเครื่องหมายด่าน (${line.trim().slice(0, 60)})`);
    }
    chk("M2", ROWS.length > 0 && bad.length === 0, "ทุกแถวมีหลักฐานที่ชี้ด่านจริง", bad.length ? `${bad.length} แถว: ${bad.slice(0, 6).join(" | ")}` : `${ROWS.length} แถว ผ่าน`);
  }
  // M3
  {
    let man: Any = { suites: [] };
    try {
      man = JSON.parse(rd("scripts/pos-gates.json"));
    } catch {
      /* ว่าง */
    }
    const inMan = new Set<string>((man.suites ?? []).map((s: Any) => s.suite));
    const ids = [...new Set(ROWS.flatMap((r) => (r.coveredBy ?? "").split(",").map((x) => x.trim()).filter(Boolean)))].sort();
    const bad = ids.filter((id) => !existsSync(join(ROOT, "scripts", `${id}.mts`)) || !inMan.has(id));
    const covered = ROWS.filter((r) => (r.coveredBy ?? "").trim()).length;
    chk("M3", ROWS.length > 0 && bad.length === 0, "ทุก coveredBy มีไฟล์ + อยู่ในแมนิเฟสต์", `${ids.length} ชุด · แถวที่มีชุดคุม ${covered}/${ROWS.length}${bad.length ? ` · ไม่มี/ไม่อยู่ในแมนิเฟสต์: ${bad.join(", ")}` : ""}`);
  }
  // M4
  {
    const bad: string[] = [];
    const KINDS = new Set(["page", "action", "api", "public"]);
    const VALS = /^(allow|deny|cond|token|n\/a|\?|scope|[a-z]+\.[a-zA-Z]+\.[a-zA-Z*]+)$/;
    const ROLE_KEYS = gen.ROLE_KEYS as string[];
    for (let i = 0; i < ROWS.length; i++) {
      const r = ROWS[i]!;
      if (i > 0 && !(ROWS[i - 1]!.surface < r.surface)) bad.push(`ลำดับ/ซ้ำที่ ${r.surface}`);
      if (!KINDS.has(r.kind)) bad.push(`${r.surface}: kind ${r.kind}`);
      for (const k of ROLE_KEYS) if (typeof r.roles?.[k] !== "string" || !VALS.test(r.roles[k]!)) bad.push(`${r.surface}: roles.${k}=${r.roles?.[k]}`);
      if ((r.kind === "action" || r.kind === "page") && Object.values(r.roles ?? {}).includes("?")) bad.push(`${r.surface}: มี ? (${Object.entries(r.roles).filter(([, v]) => v === "?").map(([k]) => k).join(",")})`);
      if (!Array.isArray(r.perm) || typeof r.tenantScope !== "string" || !r.tenantScope || typeof r.unitScoped !== "boolean" || typeof r.coveredBy !== "string" || typeof r.notes !== "string") bad.push(`${r.surface}: ช่องไม่ครบ`);
    }
    chk("M4", ROWS.length > 0 && bad.length === 0, "รูปตารางถูก · ไม่มี ? บน action/page", bad.length ? `${bad.length}: ${bad.slice(0, 6).join(" | ")}` : `${ROWS.length} แถว · ${ROLE_KEYS.length} บทบาท`);
  }
  // M5
  {
    let fresh = "";
    try {
      fresh = gen.renderMatrix(gen.buildMatrix(ROOT));
    } catch (e) {
      fresh = `ERR ${(e as Error).message}`;
    }
    chk("M5", fresh === MATRIX_TEXT && MATRIX_TEXT.length > 0, "ไฟล์ = ผลของตัวสร้าง", fresh === MATRIX_TEXT ? `ตรง (${MATRIX_TEXT.length} ไบต์ · $base ${MATRIX.$base})` : `ต่าง — รัน scripts/pos-authz-matrix-gen.mts --write (ไฟล์ ${MATRIX_TEXT.length} ไบต์ · ตัวสร้าง ${fresh.length} ไบต์)`);
  }
  // P1
  {
    const rt = stripComments(rd("src/lib/modules/pos/receipt-token.ts"));
    const ord = stripComments(rd("src/lib/modules/pos/order.ts"));
    const disp = stripComments(rd("src/lib/modules/pos/display.ts"));
    const pi = stripComments(rd("src/lib/modules/pos/payment-intent.ts"));
    const pr = stripComments(rd("src/lib/modules/pos/print-relay.ts"));
    const num = (t: string, name: string) => Number(new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(t)?.[1] ?? 0);
    const crock = (t: string) => /["']0123456789ABCDEFGHJKMNPQRSTVWXYZ["']/.test(t) && /&\s*31/.test(t);
    const specs: TokenSpec[] = [
      { name: "receipt (receipt-token.ts newReceiptToken)", len: num(rt, "RECEIPT_TOKEN_LENGTH"), bitsPerUnit: crock(rt) ? 5 : 0, csprng: /randomBytes\(RECEIPT_TOKEN_LENGTH\)/.test(rt) && !/Math\.random/.test(fnBody(rt, "newReceiptToken")) },
      { name: "order publicToken (order.ts → newReceiptToken)", len: num(rt, "RECEIPT_TOKEN_LENGTH"), bitsPerUnit: crock(rt) ? 5 : 0, csprng: /publicToken:\s*newReceiptToken\(\)/.test(ord) && !/publicToken:\s*(?!newReceiptToken)[^,}\n]*Math\.random/.test(ord) },
      { name: "order link (order.ts newLinkToken)", len: num(ord, "LINK_TOKEN_LEN"), bitsPerUnit: /LINK_CROCKFORD\s*=\s*["']0123456789ABCDEFGHJKMNPQRSTVWXYZ["']/.test(ord) && /&\s*31/.test(fnBody(ord, "newLinkToken")) ? 5 : 0, csprng: /randomBytes\(LINK_TOKEN_LEN\)/.test(ord) },
      { name: "display token (display.ts)", len: Number(/const token = randomBytes\((\d+)\)/.exec(disp)?.[1] ?? 0), bitsPerUnit: 8, csprng: /const token = randomBytes\(\d+\)/.test(disp) },
      { name: "payment intent id (payment-intent.ts)", len: Number(/newIntentId = \(\) => `pi_\$\{randomBytes\((\d+)\)/.exec(pi)?.[1] ?? 0), bitsPerUnit: 8, csprng: /newIntentId = \(\) => `pi_\$\{randomBytes\(/.test(pi) },
      { name: "print agent token (print-relay.ts)", len: Number(/`spa_\$\{randomBytes\((\d+)\)/.exec(pr)?.[1] ?? 0), bitsPerUnit: 8, csprng: /`spa_\$\{randomBytes\(/.test(pr) },
    ];
    const bad = specs.filter((s) => !judgeEntropy(s));
    chk("P1", bad.length === 0, "ทุกตัว ≥ 60 บิตจาก crypto", specs.map((s) => `${s.name.split(" (")[0]} ${entropyBits(s)}b`).join(" · ") + (bad.length ? ` · ต่ำกว่า: ${bad.map((s) => s.name).join(", ")}` : ""));
  }
  // P2 — ORACLE-EDIT (builder P5.2 fix1 · CD-P52-F4 controller B): schema @default(cuid()) คงไว้ตามมติ (ไม่แตะ prisma/คอลัมน์) ⇒ ตัดสินที่ "เส้นทางโค้ดที่สร้าง/หมุนโทเคน":
  //   ทุก restaurantTable.create* ใต้ src/lib ต้องตั้ง qrToken: <ตัวสร้าง>() · ตัวสร้างนั้น (ใน restaurant/table.ts) = randomBytes(N) ของ crypto ไม่มี Math.random · N×8 ≥ 60 บิต (ruling 5) ·
  //   rotateQr ใช้ตัวสร้างเดียวกัน — เดิม: ok = !cuidDefault || (ทุกจุดสร้างตั้ง qrToken && judgeEntropy(cuid 41 บิต)) ซึ่งแดงตลอดเมื่อ schema คง cuid()
  //   probe (จดใน wo-notes pos-P5.2.md): randomBytes(7) = 56 บิต → แดง · ลบ qrToken ออกจาก createTable → แดง · Math.random ในตัวสร้าง → แดง
  {
    const schema = [rd("prisma/schema/restaurant.prisma")].join("\n");
    const line = /^\s*qrToken\s+String[^\n]*/m.exec(schema)?.[0] ?? "";
    const libFiles = (function walkLib(dir: string): string[] {
      const out: string[] = [];
      for (const n of readdirSync(join(ROOT, dir)).sort()) {
        const rel = `${dir}/${n}`;
        if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walkLib(rel));
        else if (/\.tsx?$/.test(n)) out.push(rel);
      }
      return out;
    })("src/lib");
    const creators = libFiles.map((f) => [f, stripComments(rd(f))] as const).filter(([, t]) => /restaurantTable\.create(?:Many)?\(/.test(t));
    const createsWithoutToken = creators.filter(([, t]) => /restaurantTable\.create(?:Many)?\(\{\s*data:\s*\{(?![^}]*qrToken)/.test(t)).map(([f]) => f);
    const tbl = stripComments(rd("src/lib/modules/restaurant/table.ts"));
    const gens = [...new Set(creators.flatMap(([, t]) => [...t.matchAll(/qrToken:\s*(\w+)\(\)/g)].map((m) => m[1]!)))];
    const genName = gens.length === 1 ? gens[0]! : "";
    const genBody = genName ? fnBody(tbl, genName) : "";
    const lenRef = /randomBytes\((\w+)\)/.exec(genBody)?.[1] ?? "";
    const bytes = /^\d+$/.test(lenRef) ? Number(lenRef) : Number(new RegExp(`\\b${lenRef || "\\$none"}\\s*=\\s*(\\d+)`).exec(tbl)?.[1] ?? 0);
    const spec: TokenSpec = { name: `RestaurantTable.qrToken ${genName || "?"}()`, len: bytes, bitsPerUnit: 8, csprng: !!genBody && /randomBytes\(/.test(genBody) && /from\s+["'](?:node:)?crypto["']/.test(rd("src/lib/modules/restaurant/table.ts")) && !/Math\.random/.test(genBody) };
    const rotateUses = !!genName && new RegExp(`\\b${genName}\\s*\\(`).test(fnBody(tbl, "rotateQr"));
    const ok = creators.length > 0 && createsWithoutToken.length === 0 && !!genName && judgeEntropy(spec) && rotateUses;
    chk("P2", ok, "QR โต๊ะใหม่/หมุน ≥ 60 บิตจาก crypto (ไม่พึ่ง cuid())", `schema: ${line.trim().slice(0, 70)} · จุดสร้าง ${creators.map(([f]) => f.replace(/^src\/lib\/modules\//, "")).join(", ") || "ไม่พบ"} · ไม่ตั้ง qrToken: ${createsWithoutToken.join(", ") || "0"} · ตัวสร้าง ${genName || `ไม่พบ/หลายตัว (${gens.join(",")})`} randomBytes(${bytes}) = ${entropyBits(spec)} บิต · rotateQr ใช้ตัวสร้างเดียวกัน ${rotateUses}`);
  }
  // P3
  {
    const order = (text: string, fn: string, check: RegExp, db: RegExp): string => {
      const b = stripComments(fnBody(text, fn));
      if (!b) return `${fn}: ไม่พบ`;
      const i = b.search(check);
      const j = b.search(db);
      return i >= 0 && (j < 0 || i < j) ? "" : `${fn}: ตรวจรูป@${i} DB@${j}`;
    };
    const bad = [
      order(rd("src/lib/modules/pos/receipt-token.ts"), "saleForToken", /isReceiptToken\(token\)/, /db\.posSale|prisma\./),
      order(rd("src/lib/modules/pos/qr-order.ts"), "tableCtx", /isTableQrToken\(qrToken\)/, /guestTableViewForPos|prisma\./),
      order(rd("src/lib/modules/pos/qr-order.ts"), "linkCtx", /isLinkToken\(linkToken\)/, /prisma\./),
      order(rd("src/lib/modules/pos/qr-order.ts"), "orderOfToken", /isOrderToken\(orderToken\)/, /prisma\./),
      order(rd("src/lib/modules/pos/display.ts"), "rowOfToken", /typeof token !== "string" \|\| token\.length < \d+/, /db\./),
      order(rd("src/lib/modules/pos/print-relay.ts"), "agentOf", /\/\^Bearer/, /prisma\./),
    ].filter(Boolean);
    chk("P3", bad.length === 0, "ตรวจรูปก่อนแตะ DB ทุกประตู", bad.join(" · ") || "6 ประตู ผ่าน (saleForToken · tableCtx · linkCtx · orderOfToken · rowOfToken · agentOf)");
  }
  // P5
  {
    const RATE = /RateGuard|checkRateLimit(?:Db)?\(|rateLimit\(|submitGuard\(|rateGuard\(/;
    const page = rd("src/app/(store)/r/[token]/page.tsx");
    const posBranch = /if \(POS_RECEIPT_TOKEN_RE\.test\(posToken\)\) \{[\s\S]*?\n {2}\}/.exec(page)?.[0] ?? "";
    const act = rd("src/app/(store)/r/[token]/pos-receipt-actions.ts");
    const mods: [string, string][] = [
      ["page /r แขนง POS", posBranch],
      ["publicReceiptAction→publicReceipt", fnBody(act, "publicReceiptAction") + fnBody(rd("src/lib/modules/pos/public-receipt.ts"), "publicReceipt")],
      ["reportReceiptIssue", fnBody(act, "reportReceiptIssueAction") + fnBody(rd("src/lib/modules/pos/receipt-issue.ts"), "reportReceiptIssue")],
      ["requestFullTaxInvoice", fnBody(act, "requestFullTaxInvoiceAction") + fnBody(rd("src/lib/modules/pos/receipt-tax-request.ts"), "requestFullTaxInvoice")],
      ["submitReceiptReview", fnBody(act, "submitReceiptReviewAction") + fnBody(rd("src/lib/modules/pos/public-receipt.ts"), "submitReceiptReview")],
    ];
    const missing = mods.filter(([, t]) => !RATE.test(stripComments(t))).map(([n]) => n);
    chk("P5", !!posBranch && missing.length === 0, "ทุกทางเข้ามีเพดานต่อ IP", missing.length ? `ไม่มีเพดาน: ${missing.join(" · ")} (แขนงบัญชีมี accountRateGuard publicToken/publicSubmit)` : "ครบ 5 ทาง");
  }
  // P6 — ORACLE-EDIT (builder P5.2 fix2 · CD-P52-F3b controller B): เดิม = "ทุกประตูอ่านมีคำเรียกเพดาน (RATE regex) ในตัวฟังก์ชัน" (fix1 นับต่อ IP ทุกครั้งที่สำเร็จ) →
  //   ตัดสิน 3 ส่วน: (1) qrGuard: peek ถังพลาด (qrMissExhausted) ก่อน body · ผล TOKEN_INVALID ⇒ qrCountMiss · โทเคนจริง ⇒ qrHitGuard ·
  //   (2) ประตู /q ทั้ง 12 (อ่าน 5 + quote 2 + เขียน 5) ส่ง gate {meta, token} ให้ qrGuard · อ่าน/quote มี family · กุญแจ hit ใช้แฮชโทเคน (ไม่ใช่โทเคนดิบ) ·
  //   (3) ทุกจุดเรียกประตูเหล่านี้ใต้ src/app/(store)/q/** ส่ง meta ที่มี ip (grep + จับวงเล็บ) · พฤติกรรมจริง = P9 (DB)
  //   probe (จดใน wo-notes pos-P5.2.md §Fix round 2): โค้ด fix1 (fb82257c) → แดง · ลบ meta ที่จุดเรียกเดียวใน (store)/q → แดง
  {
    const qr = rd("src/lib/modules/pos/qr-order.ts");
    const pr = stripComments(rd("src/lib/modules/pos/public-rate.ts"));
    const bad: string[] = [];
    const g = stripComments(fnBody(qr, "qrGuard"));
    const iPeek = g.search(/qrMissExhausted\(/);
    const iBody = g.search(/await body\(\)/);
    if (!(iPeek >= 0 && iBody > iPeek)) bad.push("qrGuard ไม่ peek ถังพลาดก่อน body");
    if (!/TOKEN_INVALID[\s\S]{0,120}qrCountMiss\(/.test(g)) bad.push("qrGuard ไม่นับพลาดเมื่อผล TOKEN_INVALID");
    if (!/qrHitGuard\(/.test(g)) bad.push("qrGuard ไม่นับอ่านของโทเคนจริง");
    if (!/findUnique\(/.test(fnBody(pr, "qrMissExhausted"))) bad.push("qrMissExhausted ไม่ใช่การอ่านอย่างเดียว (findUnique)");
    if (!/createHash\("sha256"\)/.test(pr) || !/tokenHash\(token\)/.test(fnBody(pr, "qrHitGuard"))) bad.push("กุญแจ hit ไม่ใช้แฮชโทเคน");
    const READ = ["tableDoor", "tablePoll", "tableBill", "linkDoor", "orderStatus", "quoteTableCart", "quotePreorderCart"];
    const WRITE = ["placeTableRound", "tableServiceRequest", "tableNotifyPaid", "placePreorder", "claimPaid"];
    for (const d of [...READ, ...WRITE]) {
      const b = stripComments(fnBody(qr, d));
      if (!b) bad.push(`${d}: ไม่พบ`);
      else if (!/\}\s*,\s*\{\s*meta\b[^}]*\btoken:/.test(b)) bad.push(`${d}: ไม่ส่ง gate {meta, token} ให้ qrGuard`);
      else if (READ.includes(d) && !/\{\s*meta\b[^}]*\bfamily:\s*"qr\w+"/.test(b)) bad.push(`${d}: ไม่มี family`);
    }
    // (3) จุดเรียกใต้ (store)/q
    const walkQ = (dir: string): string[] => {
      const out: string[] = [];
      if (!existsSync(join(ROOT, dir))) return out;
      for (const n of readdirSync(join(ROOT, dir)).sort()) {
        const rel = `${dir}/${n}`;
        if (statSync(join(ROOT, rel)).isDirectory()) out.push(...walkQ(rel));
        else if (/\.tsx?$/.test(n)) out.push(rel);
      }
      return out;
    };
    let sites = 0;
    for (const f of walkQ("src/app/(store)/q")) {
      const t = stripComments(rd(f).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ""))); // คงบรรทัด (เลขบรรทัดในรายงานตรงไฟล์)
      for (const d of [...READ, ...WRITE]) {
        for (const m of t.matchAll(new RegExp(`\\b${d}\\s*\\(`, "g"))) {
          const before = t.slice(Math.max(0, m.index! - 20), m.index!);
          if (/function\s+$/.test(before)) continue;
          let depth = 0;
          let j = m.index! + m[0].length - 1;
          for (; j < t.length; j++) {
            if (t[j] === "(") depth++;
            else if (t[j] === ")" && --depth === 0) break;
          }
          const args = t.slice(m.index! + m[0].length, j);
          sites++;
          if (!/\bip\b/.test(args)) bad.push(`${f.replace("src/app/(store)/q/", "q/")}:${t.slice(0, m.index!).split("\n").length} ${d}(…) ไม่ส่ง meta {ip}`);
        }
      }
    }
    if (sites === 0) bad.push("ไม่พบจุดเรียกใต้ (store)/q");
    chk("P6", bad.length === 0, "qrGuard นับพลาดต่อ IP + อ่านต่อ (IP, แฮชโทเคน) · 12 ประตูส่ง gate · ทุกจุดเรียกใต้ (store)/q ส่ง {ip}", bad.length ? bad.slice(0, 8).join(" · ") + (bad.length > 8 ? ` …(+${bad.length - 8})` : "") : `qrGuard ครบ (a)(b)(c) · 12 ประตู · ${sites} จุดเรียกส่ง ip`);
  }
  // P8
  {
    const bad: string[] = [];
    for (const r of ROWS.filter((x) => x.kind === "public" && x.surface.includes("#") && !x.surface.includes("route.ts"))) {
      const [file, name] = r.surface.split("#") as [string, string];
      const sig = new RegExp(`export\\s+async\\s+function\\s+${name}\\s*\\(([^)]*)\\)`).exec(rd(file))?.[1] ?? "";
      if (/\b(tenantId|unitId|systemId|saleId|orderId|tableId|customerId|memberId)\b/.test(sig)) bad.push(`${name}(${sig.slice(0, 60)})`);
    }
    chk("P8", bad.length === 0, "ไม่มีพารามิเตอร์ id ร้าน/สาขา/บิล", bad.length ? bad.join(" · ") : `${ROWS.filter((x) => x.kind === "public" && x.surface.includes("#") && !x.surface.includes("route.ts")).length} action สาธารณะ ผ่าน`);
  }
  // S1
  {
    const beam = stripComments(rd("src/lib/payment/beam.ts"));
    const plat = stripComments(rd("src/lib/modules/pos/platform/types.ts"));
    const relay = stripComments(rd("src/lib/modules/pos/print-relay.ts"));
    const disp = stripComments(rd("src/lib/modules/pos/display.ts"));
    const bad: string[] = [];
    if (!/timingSafeEqual/.test(fnBody(beam, "verifyWebhook"))) bad.push("Beam verifyWebhook ไม่ timing-safe");
    if (!/timingSafeEqual/.test(fnBody(plat, "verifySharkSignature"))) bad.push("verifySharkSignature ไม่ timing-safe");
    if (!/findUnique\(\{\s*where:\s*\{\s*tokenHash:\s*sha\(/.test(fnBody(relay, "agentOf"))) bad.push("agentOf ไม่ค้นด้วย tokenHash");
    if (!/tokenHash:\s*sha256hex\(token\)/.test(fnBody(disp, "rowOfToken"))) bad.push("rowOfToken ไม่ค้นด้วย tokenHash");
    const LOGF = ["src/app/api/payment/beam/webhook/route.ts", "src/app/api/pos/platform/[provider]/[channelId]/route.ts", "src/lib/modules/pos/platform/dispatch.ts", "src/app/api/pos/print-agent/jobs/route.ts", "src/app/api/pos/print-agent/jobs/[id]/ack/route.ts", "src/lib/modules/pos/print-relay.ts", "src/lib/modules/pos/payment-webhook.ts"];
    for (const f of LOGF) {
      const t = stripComments(rd(f));
      if (!t) {
        bad.push(`${f}: ไม่มีไฟล์`);
        continue;
      }
      // คำสั่ง log ทั้งก้อน (ถึงวงเล็บปิดของบรรทัดสุดท้าย) — ตัด raw.length / sha256 ออกก่อนตรวจ
      for (const m of t.matchAll(/(?:console\.\w+|logOps)\(([\s\S]*?)\);/g)) {
        const s = m[1]!.replace(/\braw\.length\b/g, "").replace(/createHash\("sha256"\)\.update\([^)]*\)/g, "");
        if (/\b(raw|secret|webhookSecret|authorization|rawBody|creds)\b|req\.headers|input\.raw/.test(s)) bad.push(`${f}: log มีค่าดิบ (${s.trim().slice(0, 60)})`);
      }
    }
    chk("S1", bad.length === 0, "timing-safe · hash lookup · ไม่ log ค่าดิบ", bad.join(" · ") || `ผ่าน (Beam · x-shark-signature · agent · display · ${LOGF.length} ไฟล์ log)`);
  }
  // S2
  {
    const d = stripComments(rd("src/lib/modules/pos/platform/dispatch.ts"));
    const b = fnBody(d, "handlePlatformInbound");
    const afterVerify = b.slice(Math.max(0, b.indexOf("verifyInbound(")));
    const writes = /prisma\.\w+\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\(|\$executeRaw|enqueueOutbox|publishOutbox/.test(afterVerify.replace(/await logOps\([\s\S]*?\);/g, ""));
    const pending = /status:\s*503,\s*body:\s*\{\s*code:\s*"ADAPTER_PENDING"/.test(afterVerify);
    const nonce = /timestamp|nonce|x-shark-timestamp/i.test(stripComments(rd("src/lib/modules/pos/platform/types.ts")));
    chk("S2", !!b && pending && !writes, "หลังลายเซ็นถูก: 503 ADAPTER_PENDING · ไม่มีการเขียน", `ADAPTER_PENDING ${pending} · เขียนหลังตรวจ ${writes} · nonce/timestamp ${nonce ? "มี" : "ไม่มี (H6 · ruling 6 = adapter จริง)"}`);
  }
  // N1–N4
  {
    const scanned = (gen.scanSurfaces(ROOT) as { surface: string }[]).map((s) => s.surface);
    const drop = ROWS.find((r) => r.kind === "action");
    const j = judgeM1(scanned, ROWS.filter((r) => r !== drop));
    chk("N1", !!drop && j.unlisted.length === 1 && j.unlisted[0] === drop.surface, "unlisted = แถวที่ตัด", `ตัด ${drop?.surface ?? "-"} → unlisted ${j.unlisted.length} (${j.unlisted[0] ?? "-"})`);
    const okO: Outcome = { kind: "ok", code: "OK", text: '{"ok":true}' };
    const refO: Outcome = { kind: "refused", code: "PERMISSION_DENIED", text: "" };
    const thrO: Outcome = { kind: "throw", code: "Error", text: "boom" };
    const n2 = !judgeDenied(okO, "src/lib/modules/pos/x.ts#y") && judgeDenied(refO, "src/lib/modules/pos/x.ts#y") && !judgeDenied(thrO, "src/lib/modules/pos/x.ts#y") && judgeDenied({ kind: "redirect", code: "redirect", text: "/login" }, "x#y");
    chk("N2", n2, "ok/throw = ไม่ผ่าน · refused/redirect = ผ่าน", `ok→${judgeDenied(okO, "a#b")} refused→${judgeDenied(refO, "a#b")} throw→${judgeDenied(thrO, "a#b")}`);
    const e11 = judgeEntropy({ name: "11", len: 11, bitsPerUnit: 5, csprng: true });
    const eMr = judgeEntropy({ name: "mr", len: 32, bitsPerUnit: 8, csprng: false });
    const e12 = judgeEntropy({ name: "12", len: 12, bitsPerUnit: 5, csprng: true });
    chk("N3", !e11 && !eMr && e12, "55 บิต แดง · Math.random แดง · 60 บิต ผ่าน", `11×5→${e11} · Math.random→${eMr} · 12×5→${e12}`);
    const l1 = leaks('{"receiptNo":"P52A1-x"}', ["P52A1-x"]).length === 1;
    const l0 = leaks('{"ok":false,"code":"NOT_FOUND"}', ["P52A1-x"]).length === 0;
    chk("N4", l1 && l0, "มีเลขแฝง = รั่ว · ไม่มี = ไม่รั่ว", `มี→${l1} · ไม่มี→${l0}`);
  }
}

function finishStatic(): never {
  for (const id of STATIC_IDS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", "ไม่ถึง");
  const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
  console.log(`\n===== ${SUITE} (--no-db) ===== ผ่าน ${results.size - failed.length}/${results.size}`);
  console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, mode: "no-db", total: results.size, passed: results.size - failed.length, failed, registered: CHECKS.length, pin: PIN, lanePin: LANE_PIN, matrixRows: ROWS.length })}`);
  process.exit(failed.length ? 1 : 0);
}

if (NODB) {
  try {
    runStatic();
  } catch (e) {
    console.log(`💥 static: ${(e as Error)?.stack?.split("\n").slice(0, 3).join(" | ")}`);
  }
  finishStatic();
}

// ═════════════════════════ 2. env (QC4 เท่านั้น) ═════════════════════════
const envMod = (await import("./pos-qc-env.mts" as string)) as Any;
envMod.loadPosQcEnv(SUITE);
const PQC = envMod.PQC as Any;
const QC_TIDS = (envMod.PQC_TENANT_IDS as string[]) ?? [];
function assertQc4BeforeWrite(): void {
  const mark = envMod.POS_QC_HOST_MARK as string;
  const bad = [["DATABASE_URL", process.env.DATABASE_URL ?? ""], ["DIRECT_URL", process.env.DIRECT_URL ?? ""]].filter(([n, u]) => (n === "DATABASE_URL" || u) && !u!.includes(mark));
  if (bad.length) {
    console.error(`🔴 หยุด! ${SUITE}: เขียนได้เฉพาะ QC4 (${mark}) — ${bad.map(([n]) => n).join(", ")} ไม่ใช่ (ยังไม่ได้เขียนอะไร)`);
    process.exit(4);
  }
}
assertQc4BeforeWrite();
// งานเบื้องหลังของ action (drain/after) ที่ล้มนอก await ห้ามทำให้โปรเซสตาย — นับไว้แล้วรายงาน
let bgErrors = 0;
process.on("unhandledRejection", (e) => {
  bgErrors++;
  if (bgErrors <= 5) console.log(`  (unhandledRejection: ${String((e as Error)?.message ?? e).slice(0, 120)})`);
});
if (FORCE) console.log("ℹ️  QC_FORCE=1 — ชุดนี้ไม่มีด่าน SKIP (ไม่มีผล)");

// ── Next request scope (เทคนิคเดียวกับ qc-hf-o23 / qc-crm-v1) ──
const { AsyncLocalStorage } = await import("node:async_hooks");
(globalThis as Any).AsyncLocalStorage ??= AsyncLocalStorage;
const nextWork = (await import("next/dist/server/app-render/work-async-storage.external.js" as string).catch(() => null)) as Any;
const nextWorkUnit = (await import("next/dist/server/app-render/work-unit-async-storage.external.js" as string).catch(() => null)) as Any;
const nextCookies = (await import("next/dist/server/web/spec-extension/cookies.js" as string).catch(() => null)) as Any;
async function inScope<T>(cookie: string, pathname: string, fn: () => Promise<T>): Promise<T> {
  if (!nextWork?.workAsyncStorage || !nextWorkUnit?.workUnitAsyncStorage || !nextCookies?.RequestCookies) throw new Error("ไม่มี Next request scope");
  const req = new Request(`http://qc.local${pathname}`, { headers: { ...(cookie ? { cookie } : {}), "user-agent": SUITE, "x-forwarded-for": "203.0.113.52" } });
  const jar = new nextCookies.RequestCookies(req.headers);
  const workStore = { route: pathname, page: `${pathname}/page`, forceStatic: false, dynamicShouldError: false, isStaticGeneration: false, fallbackRouteParams: null, incrementalCache: {}, pendingRevalidatedTags: [] };
  const unit = { type: "request", phase: "action", implicitTags: [], cookies: jar, mutableCookies: jar, userspaceMutableCookies: jar, headers: req.headers, draftMode: undefined, rootParams: {}, url: { pathname, search: "" } };
  return nextWork.workAsyncStorage.run(workStore, () => nextWorkUnit.workUnitAsyncStorage.run(unit, fn));
}

const { prisma } = (await import("@/lib/core/db" as string)) as Any;
const P = prisma as Any;
const tryImport = async (p: string): Promise<Any> => {
  try {
    return await import(p as string);
  } catch (e) {
    console.log(`  (โหลด ${p} ไม่ได้: ${(e as Error).message.slice(0, 140)})`);
    return null;
  }
};
const sysSvc = await tryImport("@/lib/modules/system/service");
const posSvc = await tryImport("@/lib/modules/pos/service");
const coreHash = await tryImport("@/lib/core/hash");
const akSvc = await tryImport("@/lib/api-keys/service");
const scopesMod = await tryImport("@/lib/api-keys/scopes");
const pubReceipt = await tryImport("@/lib/modules/pos/public-receipt");
const orderMod = await tryImport("@/lib/modules/pos/order"); // P9 (ORACLE-EDIT fix2 · CD-P52-F3b)
const pubRate = await tryImport("@/lib/modules/pos/public-rate"); // P9 งบจริงของโค้ด (ไม่มี = ค่าตามมติ 30/30)
const qrOrder = await tryImport("@/lib/modules/pos/qr-order");
const relay = await tryImport("@/lib/modules/pos/print-relay");

// ── ตัวกั้นเครือข่าย ──
const realFetch = globalThis.fetch;
const guardHits: string[] = [];
function installFetchGuard() {
  globalThis.fetch = (async (input: Any) => {
    let host = "?";
    try {
      host = new URL(typeof input === "string" ? input : String(input?.url ?? input)).host;
    } catch {
      /* ไม่ใช่ URL */
    }
    guardHits.push(host);
    return new Response(JSON.stringify({ error: "qc-network-blocked" }), { status: 503, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
const removeFetchGuard = () => {
  globalThis.fetch = realFetch;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ═════════════════════════ 3. ลายนิ้วมือ ═════════════════════════
async function tenantTables(): Promise<string[]> {
  return ((await P.$queryRawUnsafe(
    `SELECT c.table_name AS t FROM information_schema.columns c JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
     WHERE c.table_schema = current_schema() AND c.column_name = 'tenantId' AND t.table_type = 'BASE TABLE' ORDER BY 1`,
  )) as Any[]).map((r: Any) => String(r.t));
}
async function colTables(col: string): Promise<Set<string>> {
  return new Set(((await P.$queryRawUnsafe(`SELECT table_name AS t FROM information_schema.columns WHERE table_schema = current_schema() AND column_name = $1`, col)) as Any[]).map((r: Any) => String(r.t)));
}
let TT: string[] = [];
let UNIT_TT = new Set<string>();
let SYS_TT = new Set<string>();
const FP_SKIP = new Set(["OpsEvent"]);
/** ทุกแถวของร้าน (ข้อความทั้งแถว) — ใช้กับร้านชั่วคราวเท่านั้น (เล็ก) · where เพิ่ม (unitId) ได้ */
async function fpRows(tid: string, unitId?: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const tb of TT) {
    if (FP_SKIP.has(tb)) continue;
    if (unitId && !UNIT_TT.has(tb)) continue;
    try {
      const r = (await P.$queryRawUnsafe(
        `SELECT count(*)::int AS n, coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') AS h FROM "${tb}" x WHERE x."tenantId" = $1${unitId ? ` AND x."unitId" = $2` : ""}`,
        ...(unitId ? [tid, unitId] : [tid]),
      )) as Any[];
      if (r[0]?.n) out[tb] = `${r[0].n}:${String(r[0].h).slice(0, 10)}`;
    } catch {
      /* ตารางแปลก */
    }
  }
  return out;
}
const fpDiff = (a: Record<string, string>, b: Record<string, string>) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]).map((k) => `${k}:${a[k] ?? "∅"}→${b[k] ?? "∅"}`);
/** ร้าน QC (ใหญ่): จำนวน + md5(id:updatedAt) ของตารางหลัก */
const QC_FP_TABLES: [string, string][] = [["PosSale", "updatedAt"], ["PosSaleLine", "id"], ["PosPayment", "id"], ["PosOrder", "updatedAt"], ["PosProduct", "updatedAt"], ["SalesChannel", "updatedAt"], ["PosDevice", "updatedAt"], ["AppSystem", "updatedAt"], ["RestaurantTable", "updatedAt"], ["PosShift", "updatedAt"], ["AuditLog", "id"], ["ApiKey", "id"]];
async function fpQc(tids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [tb, col] of QC_FP_TABLES) {
    try {
      const r = (await P.$queryRawUnsafe(`SELECT count(*)::int AS n, coalesce(md5(string_agg(x.id || ':' || coalesce(x."${col}"::text, ''), ',' ORDER BY x.id)), '-') AS h FROM "${tb}" x WHERE x."tenantId" = ANY($1::text[])`, tids)) as Any[];
      out[tb] = `${r[0]?.n ?? "?"}:${String(r[0]?.h ?? "-").slice(0, 10)}`;
    } catch (e) {
      out[tb] = `err:${(e as Error).message.slice(0, 24)}`;
    }
  }
  return out;
}

// ═════════════════════════ 4. ร้านชั่วคราว ═════════════════════════
const RAND = randomBytes(4).toString("hex");
const SLUG_A = `posqc-p52-${RAND}`;
const SLUG_B = `posqc-p52-${RAND}-b`;
let TA = "";
let TB = "";
const keyIds: string[] = [];
const F: Record<string, string> = {}; // ids
const SENT = { recA1: `P52A1R${RAND}`, recA2: `P52A2R${RAND}`, recB1: `P52B1R${RAND}`, lineA1: `P52LINEA1${RAND}`, lineA2: `P52LINEA2${RAND}`, lineB1: `P52LINEB1${RAND}`, unitA1: `P52 สาขา A1 ${RAND}`, unitA2: `P52 สาขา A2 ${RAND}`, unitB1: `P52 ร้านบี ${RAND}` };
type Persona = { key: string; userId: string; cookie: string; tenantId: string; role: string; unitAccess: string[]; perms: Record<string, boolean> };
const PER: Record<string, Persona> = {};
const DAY = 86_400_000;

async function mkUser(tid: string, slug: string, key: string, role: string, unitAccess: string[], perms: Record<string, boolean>): Promise<void> {
  const u = await P.user.create({ data: { email: `${slug}-${key.toLowerCase()}@qc.invalid`, name: `QC P5.2 ${key} ${RAND}` } });
  await P.membership.create({ data: { userId: u.id, tenantId: tid, role, unitAccess, permissions: perms, acceptedAt: new Date() } });
  const token = coreHash.randomToken(32) as string;
  await P.session.create({ data: { userId: u.id, tokenHash: coreHash.sha256(token), idleExpiresAt: new Date(Date.now() + 30 * DAY), expiresAt: new Date(Date.now() + 90 * DAY) } });
  PER[key] = { key, userId: u.id, cookie: `shark_session=${token}; __Host-shark_session=${token}; shark_tenant=${tid}`, tenantId: tid, role, unitAccess, perms };
}
async function mkSale(tid: string, unitId: string, sysId: string, line: string, receiptNo: string, satang: number): Promise<string> {
  const r = await posSvc.createSale({ tenantId: tid, unitId, systemId: sysId, idempotencyKey: `p52-${RAND}-${receiptNo}`, lines: [{ name: line, qty: 1, unitPriceSatang: satang }], payMethods: [{ type: "CASH", amountSatang: satang }] });
  const id = String(r?.saleId ?? r?.sale?.id ?? "");
  if (!id) throw new Error(`createSale ไม่คืน saleId: ${JSON.stringify(r).slice(0, 160)}`);
  await P.posSale.update({ where: { id }, data: { receiptNo } });
  return id;
}
async function setup(): Promise<void> {
  const a = await P.tenant.create({ data: { name: `QC P5.2 ร้าน A ${RAND}`, slug: SLUG_A } });
  TA = a.id;
  const b = await P.tenant.create({ data: { name: `QC P5.2 ร้าน B ${RAND}`, slug: SLUG_B } });
  TB = b.id;
  const uA1 = await P.businessUnit.create({ data: { tenantId: TA, type: "SHOP", name: SENT.unitA1, slug: `p52-a1-${RAND}` } });
  const uA2 = await P.businessUnit.create({ data: { tenantId: TA, type: "SHOP", name: SENT.unitA2, slug: `p52-a2-${RAND}` } });
  const uB1 = await P.businessUnit.create({ data: { tenantId: TB, type: "SHOP", name: SENT.unitB1, slug: `p52-b1-${RAND}` } });
  Object.assign(F, { A1: uA1.id, A2: uA2.id, B1: uB1.id });
  const posA = await sysSvc.createSystem(TA, "POS", `POS P5.2 A ${RAND}`);
  const posB = await sysSvc.createSystem(TB, "POS", `POS P5.2 B ${RAND}`);
  for (const s of [posA.id, posB.id]) await P.appSystem.update({ where: { id: s }, data: { settings: { pos: { registerV2: true } } } }).catch(() => {});
  await sysSvc.linkUnit(TA, posA.id, uA1.id);
  await sysSvc.linkUnit(TA, posA.id, uA2.id);
  await sysSvc.linkUnit(TB, posB.id, uB1.id);
  Object.assign(F, { POS_A: posA.id, POS_B: posB.id });
  F.SALE_A1 = await mkSale(TA, uA1.id, posA.id, SENT.lineA1, SENT.recA1, 11100);
  F.SALE_A2 = await mkSale(TA, uA2.id, posA.id, SENT.lineA2, SENT.recA2, 22200);
  F.SALE_B1 = await mkSale(TB, uB1.id, posB.id, SENT.lineB1, SENT.recB1, 33300);
  await mkUser(TA, SLUG_A, "OWNER", "OWNER", ["*"], {});
  await mkUser(TA, SLUG_A, "MANAGER", "MANAGER", [uA1.id], {});
  await mkUser(TA, SLUG_A, "CASHIER", "STAFF", [uA1.id], { ...(PQC.cashierPermissions as Record<string, boolean>) });
  await mkUser(TA, SLUG_A, "NOPERM", "STAFF", [uA1.id], {});
  await mkUser(TB, SLUG_B, "OWNER_B", "OWNER", ["*"], {});
  console.log(`  ร้าน A ${SLUG_A} (A1 ${F.A1} · A2 ${F.A2} · POS ${F.POS_A}) · ร้าน B ${SLUG_B} (B1 ${F.B1}) · บิล A1 ${F.SALE_A1} · A2 ${F.SALE_A2} · B1 ${F.SALE_B1}`);
}

// ═════════════════════════ 5. ตัวยิง action ═════════════════════════
const modCache = new Map<string, Any>();
async function modOf(file: string): Promise<Any> {
  if (!modCache.has(file)) modCache.set(file, await tryImport(file.replace(/^src\//, "@/").replace(/\.tsx?$/, "")));
  return modCache.get(file);
}
const bkkToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
function argsFor(t: { systemId: string; unitId: string; saleId: string }): Record<string, unknown> {
  const id = t.saleId;
  return {
    systemId: t.systemId, unitId: t.unitId, id, saleId: id, orderId: id, requestId: id, slipId: id, intentId: id, keyId: id, tableId: id, tableSessionId: id, reservationId: id, productId: id, itemId: id,
    memberId: id, splitId: id, stationId: id, customerPartyId: id, redemptionId: id, heldCartId: id, intoSessionId: id, fromSessionIds: [id], toTableId: id, userId: id, deviceId: undefined,
    productIds: [id], ids: [id], posOrderIds: [id], keys: [`pos-anomaly:x:${t.unitId}:${bkkToday()}:${id}`], choiceIds: [],
    q: "P52", query: "P52", barcode: "0000000000", number: "0000000000", taxId: "0000000000000", phoneLast4: "0000", deviceCode: "P52DEVICE01",
    kind: "daily", from: bkkToday(), to: bkkToday(), date: bkkToday(), businessDate: bkkToday(), limit: 5, cursor: null, status: undefined,
    input: {}, patch: {}, cart: { lines: [] }, sale: { lines: [], payMethods: [] }, refund: { lines: [], reason: "P52" }, split: {}, shift: {}, close: {}, movement: {}, recount: {}, row: {}, board: {}, teamRoom: {}, state: {}, buyer: {},
    reason: "P52", reasonCode: "OTHER", note: "P52", name: `P52 ${RAND}`, bundle: "pos-read", ttlDays: 1, unitIds: [t.unitId], enabled: false, on: false, confirm: false, maxOpen: null, prepMinutes: 10, rush: false, seq: 1,
    via: "EMAIL", email: "p52@qc.invalid", amountSatang: 100, oversellPolicy: "BLOCK", promptpayId: null, pin: "135792", staffToken: null, managerPin: null, managerUserId: null, label: null, guestCount: 1, expectedVersion: 0, copy: false, locale: "th", only: undefined,
  };
}
const REDIRECT = (e: Any) => typeof e?.digest === "string" && e.digest.startsWith("NEXT_REDIRECT");
async function invoke(row: MRow, persona: Persona | null, t: { systemId: string; unitId: string; saleId: string }, timeoutMs = 20_000): Promise<Outcome> {
  const [file, name] = row.surface.split("#") as [string, string];
  const mod = await modOf(file);
  const fn = mod?.[name];
  if (typeof fn !== "function") return { kind: "missing", code: "MISSING", text: "" };
  const a = argsFor(t);
  const build = (): unknown[] => {
    if (row.call === "none") return [];
    if (row.call === "pos") return [t.systemId, {}];
    if (row.call === "form") {
      const fd = new FormData();
      for (const [k, v] of Object.entries(a)) if (typeof v === "string") fd.set(k, v);
      fd.set("priceSatang", "100");
      return [fd];
    }
    return [a];
  };
  const run = () => inScope(persona?.cookie ?? "", `/app/sys/${t.systemId}/pos`, async () => fn(...build()));
  let timer: NodeJS.Timeout | undefined;
  try {
    const r = await Promise.race([run(), new Promise((_, rej) => (timer = setTimeout(() => rej(Object.assign(new Error("TIMEOUT"), { qcTimeout: true })), timeoutMs)))]);
    let text = "";
    try {
      text = typeof r === "string" ? r : JSON.stringify(r) ?? "";
    } catch {
      text = String(r);
    }
    const o = r as Any;
    if (o && typeof o === "object" && !Array.isArray(o) && o.ok === false) return { kind: "refused", code: String(o.code ?? "NO_CODE"), text };
    if (o && typeof o === "object" && !Array.isArray(o) && o.status === "error") return { kind: "refused", code: String(o.code ?? o.error ?? "STATUS_ERROR"), text };
    if ((Array.isArray(o) && o.length === 0) || o === "" || o === null || o === undefined) return { kind: "refused", code: "EMPTY", text };
    return { kind: "ok", code: "OK", text };
  } catch (e) {
    if (REDIRECT(e)) return { kind: "redirect", code: "redirect", text: String((e as Any).digest) };
    if ((e as Any)?.qcTimeout) return { kind: "timeout", code: "TIMEOUT", text: "" };
    const err = e as Any;
    return { kind: "throw", code: String(err?.name ?? "Error"), text: String(err?.digest ?? err?.message ?? e).slice(0, 200) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
const ACTIONS = () => ROWS.filter((r) => r.kind === "action" && r.surface.includes("#"));
const tag = (r: MRow) => r.surface.replace(/^src\/lib\/(modules\/)?/, "").replace(/\.ts#/, "#");

// ═════════════════════════ 6. ข้อ DB ═════════════════════════
async function runDb(): Promise<void> {
  installFetchGuard();
  TT = await tenantTables();
  UNIT_TT = await colTables("unitId");
  SYS_TT = await colTables("systemId");
  await setup();
  const tA1 = { systemId: F.POS_A!, unitId: F.A1!, saleId: F.SALE_A1! };

  // R5 ตัวควบคุมบวก (ก่อน — ถ้าแดง ผลลบทั้งหมดไม่มีความหมาย)
  {
    const bd = rowOf("src/lib/modules/pos/bills-actions.ts#billDetailAction")!;
    const rp = rowOf("src/lib/modules/pos/receipt-actions.ts#receiptPayloadAction")!;
    const out: string[] = [];
    let ok = !!bd && !!rp;
    for (const k of ["OWNER", "MANAGER", "CASHIER"]) {
      const o = bd ? await invoke(bd, PER[k]!, tA1) : null;
      const seen = !!o && o.kind === "ok" && o.text.includes(SENT.recA1);
      ok &&= seen;
      out.push(`${k} billDetail ${o?.kind}/${o?.code}${seen ? " เห็นเลขบิล" : ""}`);
    }
    const o2 = rp ? await invoke(rp, PER.OWNER!, tA1) : null;
    const seen2 = !!o2 && o2.kind === "ok" && o2.text.includes(SENT.lineA1);
    ok &&= seen2;
    out.push(`OWNER receiptPayload ${o2?.kind}/${o2?.code}${seen2 ? " เห็นรายการ" : ""}`);
    chk("R5", ok, "ok + เห็นข้อมูลบิล A1 ทั้ง 4 ครั้ง", out.join(" · "));
  }

  // R4 ANON
  {
    const bad: string[] = [];
    let n = 0;
    for (const r of ACTIONS()) {
      const o = await invoke(r, null, tA1);
      n++;
      if (!judgeDenied(o, r.surface) || o.text.includes(SENT.recA1)) bad.push(`${tag(r)}=${o.kind}/${o.code}`);
    }
    chk("R4", n > 0 && bad.length === 0, "ทุกแถว redirect/ปฏิเสธ", bad.length ? `${bad.length}/${n}: ${bad.slice(0, 12).join(" · ")}` : `${n} แถว ปฏิเสธทั้งหมด`);
  }

  // R2 STAFF_NOPERM · R1 CASHIER (+ R3 รหัส)
  const r3bad: string[] = [];
  let r3n = 0;
  for (const [cid, pk, role] of [["R2", "NOPERM", "STAFF_NOPERM"], ["R1", "CASHIER", "CASHIER"]] as const) {
    const rows = ACTIONS().filter((r) => r.roles[role] === "deny");
    const bad: string[] = [];
    for (const r of rows) {
      const o = await invoke(r, PER[pk]!, tA1);
      if (!judgeDenied(o, r.surface)) bad.push(`${tag(r)}=${o.kind}/${o.code}`);
      else {
        r3n++;
        if (!DENY_CODE.test(o.code)) r3bad.push(`${pk}:${tag(r)}=${o.code}`);
      }
    }
    chk(cid, rows.length > 0 && bad.length === 0, `${role}=deny ทุกแถวถูกปฏิเสธ`, bad.length ? `${bad.length}/${rows.length}: ${bad.slice(0, 14).join(" · ")}` : `${rows.length} แถว ปฏิเสธทั้งหมด`);
  }
  chk("R3", r3n > 0 && r3bad.length === 0, "รหัสสิทธิ์/ไม่พบ", r3bad.length ? `${r3bad.length}/${r3n}: ${r3bad.slice(0, 14).join(" · ")}` : `${r3n} คำปฏิเสธ รหัสถูกทั้งหมด`);

  // T2 OTHER_UNIT: MANAGER A1 → A2
  {
    const before = await fpRows(TA, F.A2);
    const rows = ACTIONS().filter((r) => r.unitScoped && r.roles.OTHER_UNIT === "deny");
    const bad: string[] = [];
    for (const r of rows) {
      const o = await invoke(r, PER.MANAGER!, { systemId: F.POS_A!, unitId: F.A2!, saleId: F.SALE_A2! });
      const lk = leaks(o.text, [SENT.recA2, SENT.lineA2]);
      if (lk.length || o.kind === "timeout") bad.push(`${tag(r)}=${o.kind}/${o.code}${lk.length ? " รั่ว" : ""}`);
    }
    const diff = fpDiff(before, await fpRows(TA, F.A2));
    chk("T2", rows.length > 0 && bad.length === 0 && diff.length === 0, "ไม่เห็นบิล A2 · แถว A2 ไม่เปลี่ยน", `${rows.length} แถว · รั่ว/ค้าง ${bad.length}${bad.length ? `: ${bad.slice(0, 10).join(" · ")}` : ""} · แถว A2 เปลี่ยน ${diff.length ? diff.slice(0, 6).join(", ") : "0"}`);
  }

  // T1 OTHER_TENANT: OWNER B → ร้าน A
  {
    const before = await fpRows(TA);
    const rows = ACTIONS();
    const bad: string[] = [];
    for (const r of rows) {
      const o = await invoke(r, PER.OWNER_B!, tA1);
      const lk = leaks(o.text, [SENT.recA1, SENT.recA2, SENT.lineA1, SENT.lineA2, SENT.unitA1, SENT.unitA2]);
      if (lk.length || o.kind === "timeout") bad.push(`${tag(r)}=${o.kind}/${o.code}${lk.length ? ` รั่ว ${lk.length}` : ""}`);
    }
    const diff = fpDiff(before, await fpRows(TA));
    // แถวของร้าน B ที่อ้างระบบ/สาขาของร้าน A
    const xref: string[] = [];
    for (const tb of TT) {
      const cond = [SYS_TT.has(tb) ? `x."systemId" = $2` : "", UNIT_TT.has(tb) ? `x."unitId" = ANY($3::text[])` : ""].filter(Boolean);
      if (!cond.length) continue;
      try {
        const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" x WHERE x."tenantId" = $1 AND (${cond.join(" OR ")})`, TB, F.POS_A, [F.A1, F.A2])) as Any[])[0]?.n ?? 0);
        if (n) xref.push(`${tb}:${n}`);
      } catch {
        /* ชนิดคอลัมน์ไม่ตรง */
      }
    }
    chk("T1", rows.length > 0 && bad.length === 0 && diff.length === 0 && xref.length === 0, "ไม่รั่ว · A ไม่เปลี่ยน · B ไม่อ้าง A", `${rows.length} แถว · รั่ว/ค้าง ${bad.length}${bad.length ? `: ${bad.slice(0, 10).join(" · ")}` : ""} · แถว A เปลี่ยน ${diff.length ? diff.slice(0, 6).join(", ") : "0"} · B อ้าง A ${xref.join(", ") || "0"}`);
  }

  // T3 resto (อ่านอย่างเดียว)
  {
    const R = PQC.resto;
    const restoSale = await P.posSale.findFirst({ where: { tenantId: R.tenantId, systemId: R.systems.POS.id }, orderBy: { createdAt: "desc" }, select: { id: true, receiptNo: true, unitId: true } });
    const sentinels = [R.units.main.name, ...((envMod.PQC_RESTO_ITEMS as Any[]) ?? []).map((i) => i.name), restoSale?.receiptNo ?? ""].filter((s: string) => s && s.length >= 4);
    const READ = /^(list\w*|get\w*|billDetail|billsPageData|receiptPayload|saleForRefund|refundTenderOptions|registerTables|registerTableMode|registerStatus|registerCatalog|posSettingsOverview|posStaffOverview|posReport|posReportOverview|kdsBoard|kdsStations|kdsKitchenState|qrTables|qrTableRounds|posStockMeta|posStockHistory|shiftsPageData|posPaymentSettings|posReceiptSettings|posTipLedgers|posIntegrationCards|unitPriceMatrix|ordersChannels)Action$/;
    const rows = ACTIONS().filter((r) => READ.test(r.surface.split("#")[1]!));
    const before = await fpQc([R.tenantId]);
    const bad: string[] = [];
    for (const r of rows) {
      const o = await invoke(r, PER.OWNER!, { systemId: R.systems.POS.id, unitId: R.units.main.id, saleId: restoSale?.id ?? "posqc-none" });
      const lk = leaks(o.text, sentinels);
      if (lk.length || o.kind === "timeout") bad.push(`${tag(r)}=${o.kind}/${o.code}${lk.length ? ` รั่ว ${lk.join("|").slice(0, 40)}` : ""}`);
    }
    const diff = fpDiff(before, await fpQc([R.tenantId]));
    chk("T3", rows.length >= 20 && bad.length === 0 && diff.length === 0, "ไม่เห็นข้อมูล resto · resto ไม่เปลี่ยน", `${rows.length} แถวอ่าน · sentinel ${sentinels.length} · รั่ว ${bad.length}${bad.length ? `: ${bad.slice(0, 8).join(" · ")}` : ""} · resto เปลี่ยน ${diff.join(", ") || "0"}`);
  }

  // K1/K2 REST
  {
    const route = await tryImport("@/app/api/v1/pos/[...path]/route");
    const api = async (method: string, path: string, raw: string, body?: unknown): Promise<{ status: number; text: string }> => {
      const fn = route?.[method];
      if (typeof fn !== "function") return { status: 0, text: "ROUTE_MISSING" };
      const headers: Record<string, string> = { authorization: `Bearer ${raw}` };
      if (method !== "GET") headers["idempotency-key"] = `p52-${RAND}-${randomBytes(4).toString("hex")}`;
      if (body !== undefined) headers["content-type"] = "application/json";
      try {
        const res: Response = await fn(new Request(`http://x/api/v1/pos${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), { params: Promise.resolve({ path: path.split("?")[0]!.split("/").filter(Boolean) }) });
        return { status: res.status, text: await res.text() };
      } catch (e) {
        return { status: -1, text: (e as Error).message.slice(0, 120) };
      }
    };
    const mk = async (label: string, scopes: string[]) => {
      const k = await akSvc.createApiKey({ tenantId: TA }, `QC P5.2 ${label} ${RAND}`, { scopes, systemId: F.POS_A });
      keyIds.push(k.id);
      return k.rawKey as string;
    };
    const admin = scopesMod.expandBundles(["pos-admin"]) as string[];
    const kAdmin = await mk("admin", admin);
    const kFilter = await mk("filter-A1", [...admin, `pos.filter.unit:${F.A1}`]);
    const idOps = ROWS.filter((r) => r.surface.startsWith("rest:") && r.surface.includes("{id}"));
    const saleB = async () => JSON.stringify(await P.posSale.findUnique({ where: { id: F.SALE_B1 }, select: { status: true, refundedSatang: true, updatedAt: true, taxInvoiceDocId: true } }));
    const bBefore = await saleB();
    const bad: string[] = [];
    for (const r of idOps) {
      const [, method, path] = /^rest:(\w+) (.+)$/.exec(r.surface)!;
      const res = await api(method!, path!.replace("{id}", F.SALE_B1!), kAdmin, method === "GET" ? undefined : { reason: "P52", lines: [], unitId: F.A1 });
      const lk = leaks(res.text, [SENT.recB1, SENT.lineB1, SENT.unitB1]);
      if ((method === "GET" ? res.status !== 404 : res.status >= 200 && res.status < 300) || lk.length || res.status <= 0) bad.push(`${method} ${path}=${res.status}${lk.length ? " รั่ว" : ""}`);
    }
    const bAfter = await saleB();
    chk("K1", idOps.length > 0 && bad.length === 0 && bBefore === bAfter, "GET 404 · เขียนไม่ 2xx · บิล B เดิม", `${idOps.length} op · ผิด ${bad.length}${bad.length ? `: ${bad.slice(0, 10).join(" · ")}` : ""} · บิล B ${bBefore === bAfter ? "เดิม" : "เปลี่ยน"}`);
    const a2Before = JSON.stringify(await P.posSale.findUnique({ where: { id: F.SALE_A2 }, select: { status: true, updatedAt: true } }));
    const g1 = await api("GET", `/sales/${F.SALE_A1}`, kFilter);
    const g2 = await api("GET", `/sales/${F.SALE_A2}`, kFilter);
    const r2 = await api("GET", `/sales/${F.SALE_A2}/receipt`, kFilter);
    const v2 = await api("POST", `/sales/${F.SALE_A2}/void`, kFilter, { reason: "P52" });
    const a2After = JSON.stringify(await P.posSale.findUnique({ where: { id: F.SALE_A2 }, select: { status: true, updatedAt: true } }));
    const okK2 = g1.status === 200 && g1.text.includes(SENT.recA1) && g2.status === 404 && r2.status === 404 && !(v2.status >= 200 && v2.status < 300) && !leaks(g2.text + r2.text + v2.text, [SENT.recA2, SENT.lineA2]).length && a2Before === a2After;
    chk("K2", okK2, "A1 = 200 · A2 GET 404 · void ไม่ 2xx · บิล A2 เดิม", `GET A1 ${g1.status}${g1.text.includes(SENT.recA1) ? " เห็น" : ""} · GET A2 ${g2.status} · receipt A2 ${r2.status} · void A2 ${v2.status} · บิล A2 ${a2Before === a2After ? "เดิม" : "เปลี่ยน"}`);
  }

  // P4 404/403 leakage + QR binding
  {
    const out: string[] = [];
    let ok = true;
    const c = async (f: () => Promise<Any>) => {
      try {
        const r = await f();
        return r?.ok === false ? String(r.code) : r?.ok === true ? "OK" : "?";
      } catch (e) {
        return `THROW:${(e as Error).message.slice(0, 30)}`;
      }
    };
    const pr = [await c(() => pubReceipt.publicReceipt("x")), await c(() => pubReceipt.publicReceipt("ZZZZZZZZZZZZ")), await c(() => pubReceipt.publicReceipt("abc' OR 1=1"))];
    ok &&= pr.every((x) => x === "TOKEN_NOT_FOUND");
    out.push(`receipt ผิดรูป/ไม่มี/ฉีด = ${pr.join("/")}`);
    const pairs: [string, (t: string) => Promise<Any>, string, string][] = [
      ["tableDoor", (t) => qrOrder.tableDoor(t), "!!", `qr_${"0".repeat(32)}`],
      ["linkDoor", (t) => qrOrder.linkDoor(t), "x", "ZZZZZZZZZZZZZZZZ"],
      ["orderStatus", (t) => qrOrder.orderStatus(t, {}), "x", "ZZZZZZZZZZZZ"],
    ];
    for (const [n, f, bad, unknown] of pairs) {
      const a = await c(() => f(bad));
      const b = await c(() => f(unknown));
      ok &&= a === b && a === "TOKEN_INVALID";
      out.push(`${n} ${a}/${b}`);
    }
    const tbl = await P.restaurantTable.findFirst({ where: { tenantId: PQC.resto.tenantId }, select: { qrToken: true, unitId: true } });
    if (tbl) {
      const r = await qrOrder.tableDoor(tbl.qrToken).catch(() => null);
      const txt = JSON.stringify(r ?? {});
      const bound = r?.ok === true && txt.includes(PQC.resto.units.main.name) && !txt.includes(PQC.coffee.units.silom.name);
      ok &&= bound;
      out.push(`QR โต๊ะ resto → ${r?.ok === true ? "ok" : r?.code} ${bound ? "ผูกสาขา resto" : "ไม่ผูก"}`);
    } else out.push("resto ไม่มีโต๊ะ (ข้ามส่วนผูกโทเคน)");
    chk("P4", ok, "รหัสเดียวกัน TOKEN_NOT_FOUND/TOKEN_INVALID · QR ผูกสาขา", out.join(" · "));
  }

  // P9 self-test กันไล่เดา /q (ORACLE-EDIT builder P5.2 fix2 · CD-P52-F3b) — ลิงก์สั่งล่วงหน้าจริง 2 ลิงก์ของร้านชั่วคราว A (สาขา A1 · A2) ·
  //   IP ของรอบ = qc-p52-<RAND>-ip* (ถังถูกลบใน finally · Z1 นับ) · ตัวควบคุมบวก = อ่านครั้งแรกต้อง ok
  {
    const out: string[] = [];
    let ok = !!orderMod && !!qrOrder;
    const owner = { userId: PER.OWNER!.userId, role: "OWNER", unitAccess: ["*"], permissions: {} };
    const l1 = ok ? await orderMod.createOrderLink({ tenantId: TA, systemId: F.POS_A, unitId: F.A1 }, owner, {}).catch(() => null) : null;
    const l2 = ok ? await orderMod.createOrderLink({ tenantId: TA, systemId: F.POS_A, unitId: F.A2 }, owner, {}).catch(() => null) : null;
    const L1 = String(l1?.link?.token ?? "");
    const L2 = String(l2?.link?.token ?? "");
    if (!L1 || !L2) {
      ok = false;
      out.push(`สร้างลิงก์ไม่ได้ (${l1?.code ?? "-"}/${l2?.code ?? "-"})`);
    } else {
      const N = Number(pubRate?.QR_HIT_RATE?.qrLink?.limit ?? 30);
      const MISS = Number(pubRate?.QR_MISS_PER_IP_PER_MIN ?? 30);
      const ip = (x: string) => `qc-p52-${RAND}-ip${x}`;
      const door = async (tok: string, who?: string): Promise<string> => {
        const r = await (who === undefined ? qrOrder.linkDoor(tok) : qrOrder.linkDoor(tok, undefined, { ip: ip(who) })).catch((e: Error) => ({ ok: false, code: `THROW:${e.message.slice(0, 30)}` }));
        return r?.ok === true ? "ok" : String(r?.code ?? "?");
      };
      const seqA: string[] = [];
      for (let i = 0; i < N + 1; i++) seqA.push(await door(L1, "A"));
      const firstN = seqA.slice(0, N).every((c) => c === "ok");
      const limited = seqA[N] === "RATE_LIMITED";
      const otherIp = await door(L1, "B");
      const otherTok = await door(L2, "A");
      const noMeta = await door(L1);
      ok &&= firstN && limited && otherIp === "ok" && otherTok === "ok" && noMeta === "ok";
      out.push(`IP A × ลิงก์ 1: ${N} ครั้งแรก ${firstN ? "ok" : seqA.slice(0, N).filter((c) => c !== "ok").slice(0, 3).join(",")} · ครั้งที่ ${N + 1} = ${seqA[N]} · IP B = ${otherIp} · IP A × ลิงก์ 2 = ${otherTok} · ไม่มี meta = ${noMeta}`);
      const misses: string[] = [];
      for (let i = 0; i < MISS; i++) misses.push(await door(`ZZZZZZZZZZZZ${String(i).padStart(4, "0")}`, "M"));
      const allMiss = misses.every((c) => c === "TOKEN_INVALID");
      const realFromM = await door(L2, "M");
      const realFromB = await door(L2, "B");
      ok &&= allMiss && realFromM === "TOKEN_INVALID" && realFromB === "ok";
      out.push(`IP M พลาด ${MISS} ครั้ง ${allMiss ? "TOKEN_INVALID ทั้งหมด" : misses.slice(0, 3).join(",")} → ลิงก์จริงจาก IP M = ${realFromM} · จาก IP B = ${realFromB}`);
    }
    chk("P9", ok, "งบต่อ (IP, โทเคน) · IP อื่น/โทเคนอื่นไม่โดน · พลาดครบ = โทเคนจริงก็ TOKEN_INVALID · ไม่มี meta ไม่นับ", out.join(" · "));
  }

  // P7 PII ใบเสร็จ (coffee อ่านอย่างเดียว)
  {
    const s = await P.posSale.findFirst({ where: { tenantId: PQC.coffee.tenantId, memberId: { not: null }, publicToken: { not: null }, docType: "SALE" }, orderBy: { createdAt: "desc" }, select: { id: true, publicToken: true, memberId: true, tenantId: true, unitId: true } });
    if (!s) chk("P7", false, "มีบิลสมาชิกของ coffee ที่มีโทเคน", "ไม่พบบิลสมาชิกใน coffee (seed ไม่มี) — ไม่ reseed");
    else {
      const cust = await P.customer.findFirst({ where: { id: s.memberId }, select: { id: true, name: true, phone: true, email: true, firstName: true, lastName: true, lineUserId: true } });
      const r = await pubReceipt.publicReceipt(s.publicToken);
      const txt = JSON.stringify(r ?? {});
      const pii = [cust?.id, cust?.phone, cust?.email, cust?.name, cust?.firstName, cust?.lastName, cust?.lineUserId, s.memberId, s.tenantId, s.unitId].filter((v): v is string => typeof v === "string" && v.length >= 4);
      const hit = pii.filter((v) => txt.includes(v));
      const digits = (cust?.phone ?? "").replace(/\D/g, "");
      const phoneHit = digits.length >= 8 && txt.replace(/\D/g, "").includes(digits);
      chk("P7", r?.ok === true && hit.length === 0 && !phoneHit, "ok · ไม่มีข้อมูลสมาชิก/ id ภายใน", `${r?.ok === true ? "ok" : r?.code} · ตรวจ ${pii.length} ค่า · พบ ${hit.length ? hit.map((h) => h.slice(0, 3) + "…").join(",") : "0"}${phoneHit ? " · เบอร์" : ""}`);
    }
  }

  // S3 Beam webhook replay
  {
    const env0 = { m: process.env.BEAM_MERCHANT_ID, k: process.env.BEAM_API_KEY, s: process.env.BEAM_WEBHOOK_SECRET };
    const secret = randomBytes(24).toString("hex");
    process.env.BEAM_MERCHANT_ID = "qc-p52";
    process.env.BEAM_API_KEY = "qc-p52";
    process.env.BEAM_WEBHOOK_SECRET = secret;
    try {
      const route = await tryImport("@/app/api/payment/beam/webhook/route");
      const intentId = `pi_${randomBytes(12).toString("base64url")}`;
      const chargeId = `ch_p52_${RAND}`;
      await P.posPaymentIntent.create({ data: { id: intentId, tenantId: TA, unitId: F.A1, systemId: F.POS_A, kind: "CARD_BEAM", amountSatang: 5000, status: "PENDING", beamChargeId: chargeId, expiresAt: new Date(Date.now() + 15 * 60_000), idempotencyKey: `p52-${RAND}-intent` } });
      const body = JSON.stringify({ chargeId, referenceId: `pos-${intentId}`, status: "SUCCEEDED", amount: 5000 });
      const sig = createHmac("sha256", secret).update(body, "utf8").digest("hex");
      const post = async (s: string) => {
        const res: Response = await route.POST(new Request("http://x/api/payment/beam/webhook", { method: "POST", headers: { "content-type": "application/json", "x-beam-signature": s }, body }));
        return res.status;
      };
      const t0 = new Date(Date.now() - 1000);
      const stBad = await post("0".repeat(64));
      const afterBad = await P.posPaymentIntent.findUnique({ where: { id: intentId }, select: { status: true, paidAt: true } });
      const st1 = await post(sig);
      const r1 = await P.posPaymentIntent.findUnique({ where: { id: intentId }, select: { status: true, paidAt: true } });
      const st2 = await post(sig);
      const r2 = await P.posPaymentIntent.findUnique({ where: { id: intentId }, select: { status: true, paidAt: true } });
      const ob = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "OutboxEvent" WHERE "tenantId" = $1 AND payload::text LIKE $2`, TA, `%${intentId}%`)) as Any[])[0]?.n ?? -1);
      const fp = createHash("sha256").update(body).digest("hex").slice(0, 16);
      await P.opsEvent.deleteMany({ where: { createdAt: { gte: t0 }, tenantId: null, detail: { contains: `sha256:${fp}` } } }).catch(() => {});
      const ok = stBad === 401 && afterBad?.status === "PENDING" && st1 === 200 && st2 === 200 && r1?.status === "PAID" && r2?.status === "PAID" && String(r1?.paidAt) === String(r2?.paidAt) && ob === 1;
      chk("S3", ok, "401 ไม่เปลี่ยน · 200×2 · PAID ครั้งเดียว · outbox 1", `ผิดลายเซ็น ${stBad} (${afterBad?.status}) · ครั้งที่ 1 ${st1} ${r1?.status} · ครั้งที่ 2 ${st2} ${r2?.status} paidAt ${String(r1?.paidAt) === String(r2?.paidAt) ? "เดิม" : "เปลี่ยน"} · outbox ${ob}`);
    } finally {
      for (const [k, v] of [["BEAM_MERCHANT_ID", env0.m], ["BEAM_API_KEY", env0.k], ["BEAM_WEBHOOK_SECRET", env0.s]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  // S4 print-agent ack replay
  {
    const route = await tryImport("@/app/api/pos/print-agent/jobs/[id]/ack/route");
    const own = PER.OWNER!;
    const actor = { userId: own.userId, role: "OWNER", unitAccess: ["*"], permissions: {} };
    const ownB = PER.OWNER_B!;
    const reg = await relay.registerPrintAgent({ tenantId: TA, systemId: F.POS_A, unitId: F.A1 }, actor, { name: `P52 ${RAND}`, printers: [{ name: "kitchen", host: "127.0.0.1", port: 9100, target: "kitchen" }] });
    const regB = await relay.registerPrintAgent({ tenantId: TB, systemId: F.POS_B, unitId: F.B1 }, { userId: ownB.userId, role: "OWNER", unitAccess: ["*"], permissions: {} }, { name: `P52 B ${RAND}`, printers: [{ name: "kitchen", host: "127.0.0.1", port: 9100, target: "kitchen" }] });
    const job = reg?.ok ? await relay.enqueuePrintJob({ tenantId: TA, systemId: F.POS_A, unitId: F.A1 }, actor, { idempotencyKey: `p52-${RAND}-job`, target: "kitchen", deviceCode: "P52DEVICE01", bytesB64: Buffer.from("P52 print").toString("base64"), agentId: reg.agent.id }) : null;
    const claim = reg?.ok ? await relay.claimPrintJobs(`Bearer ${reg.token}`) : null;
    const jobId = job?.ok ? job.job.id : "";
    const ack = async (tok: string) => {
      const res: Response = await route.POST(new Request(`http://x/api/pos/print-agent/jobs/${jobId}/ack`, { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ ok: true }) }), { params: Promise.resolve({ id: jobId }) });
      return res.status;
    };
    const sB = regB?.ok ? await ack(regB.token) : -1;
    const s1 = reg?.ok ? await ack(reg.token) : -1;
    const j1 = jobId ? await P.posPrintJob.findUnique({ where: { id: jobId }, select: { status: true, doneAt: true } }) : null;
    const s2 = reg?.ok ? await ack(reg.token) : -1;
    const j2 = jobId ? await P.posPrintJob.findUnique({ where: { id: jobId }, select: { status: true, doneAt: true } }) : null;
    const ok = !!jobId && claim?.ok === true && sB !== 200 && s1 === 200 && s2 === 200 && j1?.status === "DONE" && j2?.status === "DONE" && String(j1?.doneAt) === String(j2?.doneAt);
    chk("S4", ok, "ร้านอื่น ≠ 200 · 200×2 · DONE · doneAt เดิม", `agent ${reg?.ok ? "ok" : reg?.code} · job ${job?.ok ? "ok" : job?.code} · claim ${claim?.ok ? claim.jobs?.length : claim?.code} · ack ร้าน B ${sB} · ack ×2 ${s1}/${s2} · ${j1?.status}/${j2?.status} doneAt ${String(j1?.doneAt) === String(j2?.doneAt) ? "เดิม" : "เปลี่ยน"}`);
  }
}

// ═════════════════════════ 7. ลบร้านชั่วคราว ═════════════════════════
type WipeReport = { tables: number; left: Record<string, number>; tenantLeft: number; err: string };
async function wipeTenant(tid: string, slug: string): Promise<WipeReport> {
  const rep: WipeReport = { tables: 0, left: {}, tenantLeft: 0, err: "" };
  if (!tid) return rep;
  const t = (await P.$queryRawUnsafe(`SELECT slug FROM "Tenant" WHERE id = $1`, tid)) as Any[];
  if (t.length && t[0].slug !== slug) {
    rep.err = `slug ไม่ตรง (${t[0].slug}) — ไม่ลบ`;
    return rep;
  }
  const tables = TT.length ? TT : await tenantTables();
  rep.tables = tables.length;
  await P.$executeRawUnsafe(`UPDATE "AccountJournalEntry" SET "reversalOfId" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  await P.$executeRawUnsafe(`UPDATE "Customer" SET "mergedIntoId" = NULL, "referredById" = NULL WHERE "tenantId" = $1`, tid).catch(() => {});
  let pending = [...tables];
  for (let pass = 0; pass < 12 && pending.length; pass++) {
    const next: string[] = [];
    for (const tb of pending) {
      try {
        await P.$executeRawUnsafe(`DELETE FROM "${tb}" WHERE "tenantId" = $1`, tid);
      } catch {
        next.push(tb);
      }
    }
    pending = next;
  }
  const uids = ((await P.$queryRawUnsafe(`SELECT id FROM "User" WHERE email LIKE $1`, `${slug}-%@qc.invalid`)) as Any[]).map((r: Any) => String(r.id));
  for (const uid of uids) {
    await P.session.deleteMany({ where: { userId: uid } }).catch(() => {});
    await P.appNotification?.deleteMany({ where: { recipientUserId: uid } }).catch(() => {});
    await P.membership.deleteMany({ where: { userId: uid } }).catch(() => {});
  }
  await P.$executeRawUnsafe(`DELETE FROM "User" WHERE email LIKE $1`, `${slug}-%@qc.invalid`).catch(() => {});
  try {
    await P.$executeRawUnsafe(`DELETE FROM "Tenant" WHERE id = $1 AND slug = $2`, tid, slug);
  } catch (e) {
    rep.err = `ลบ Tenant ไม่ได้: ${(e as Error).message.slice(0, 80)}`;
  }
  for (const tb of tables) {
    try {
      const n = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tb}" WHERE "tenantId" = $1`, tid)) as Any[])[0]?.n ?? 0);
      if (n) rep.left[tb] = n;
    } catch {
      rep.left[tb] = -1;
    }
  }
  rep.tenantLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "Tenant" WHERE id = $1`, tid)) as Any[])[0]?.n ?? 0);
  return rep;
}

// ═════════════════════════ 8. รัน ═════════════════════════
let crashed = "";
const wipes: WipeReport[] = [];
let bucketsLeft = -1;
let usersLeft = -1;
const qcBefore = await fpQc(QC_TIDS);
try {
  runStatic();
  await runDb();
} catch (e) {
  crashed = (e as Error)?.stack?.split("\n").slice(0, 4).join(" | ") ?? String(e);
  console.log(`💥 harness: ${crashed}`);
} finally {
  try {
    await sleep(500);
    for (const [tid, slug] of [[TA, SLUG_A], [TB, SLUG_B]] as const) {
      const w = await wipeTenant(tid, slug);
      wipes.push(w);
      console.log(`  ลบร้านชั่วคราว ${slug}: ${w.tables} ตาราง · ค้าง ${JSON.stringify(w.left)} · Tenant ${w.tenantLeft}${w.err ? ` · ${w.err}` : ""}`);
    }
    for (const kid of keyIds) await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `%:api:%:${kid}`).catch(() => 0);
    await P.$executeRawUnsafe(`DELETE FROM "ChatRateBucket" WHERE key LIKE $1`, `pos:pub:%:qc-p52-${RAND}-%`).catch(() => 0); // P9 (fix2)
    bucketsLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, `pos:pub:%:qc-p52-${RAND}-%`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1); // P9 (fix2)
    for (const kid of keyIds) bucketsLeft += Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "ChatRateBucket" WHERE key LIKE $1`, `%:api:%:${kid}`).catch(() => [{ n: -1 }])) as Any[])[0]?.n ?? -1);
    usersLeft = Number(((await P.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "User" WHERE email LIKE $1`, `posqc-p52-${RAND}%`)) as Any[])[0]?.n ?? -1);
  } catch (e) {
    wipes.push({ tables: 0, left: {}, tenantLeft: 0, err: `cleanup: ${(e as Error).message.slice(0, 200)}` });
  } finally {
    removeFetchGuard();
  }
}
const tempLeft = wipes.flatMap((w) => Object.entries(w.left).map(([k, v]) => `${k}:${v}`));
const tenantLeft = wipes.reduce((a, w) => a + w.tenantLeft, 0);
const wipeErr = wipes.map((w) => w.err).filter(Boolean).join(" · ");
chk("Z1", tempLeft.length === 0 && tenantLeft === 0 && !wipeErr && bucketsLeft === 0 && usersLeft === 0, "0 แถว · Tenant/User ลบ · ถัง 0", [tempLeft.length ? `ค้าง ${tempLeft.join(", ")}` : `0 แถว (${wipes[0]?.tables ?? 0} ตาราง)`, tenantLeft ? "Tenant ค้าง" : "", wipeErr, `ถัง ${bucketsLeft}`, `User ${usersLeft}`].filter(Boolean).join(" · "));
const qcAfter = await fpQc(QC_TIDS);
const qcDrift = fpDiff(qcBefore, qcAfter);
chk("Z2", qcDrift.length === 0 && !Object.values(qcBefore).some((v) => v.startsWith("err")), "ลายนิ้วมือ coffee/resto เท่าเดิม", qcDrift.length ? `ต่าง ${qcDrift.join(", ")}` : `เท่าเดิม (${Object.entries(qcAfter).map(([k, v]) => `${k}=${v.split(":")[0]}`).join(" ")})`);
for (const [id] of CHECKS) if (!results.has(id)) chk(id, false, "ถูกตรวจ", crashed ? `ไม่ถึง (harness ล้ม: ${crashed.slice(0, 100)})` : "ไม่ถึง");
const failed = [...results.entries()].filter(([, r]) => !r.ok).map(([id]) => id);
if (bgErrors) console.log(`  ⚠️  unhandledRejection ${bgErrors} ครั้ง (งานเบื้องหลังของ action ที่ยิงด้วยอาร์กิวเมนต์ปลอม)`);
if (guardHits.length) console.log(`  ⚠️  ตัวกั้นเครือข่ายถูกเรียก ${guardHits.length} ครั้ง: ${[...new Set(guardHits)].join(", ")}`);
console.log(`\n===== ${SUITE} ===== ผ่าน ${results.size - failed.length}/${results.size} · ตาราง ${ROWS.length} แถว · ฐาน ${PIN}`);
console.log(`JSON_SUMMARY ${JSON.stringify({ suite: SUITE, total: results.size, passed: results.size - failed.length, failed, skipped: false, forced: FORCE, pin: PIN, lanePin: LANE_PIN, matrixRows: ROWS.length, guardHits: guardHits.length, residue: tempLeft.length + tenantLeft })}`);
await P.$disconnect?.().catch?.(() => {});
process.exit(failed.length ? 1 : 0);
