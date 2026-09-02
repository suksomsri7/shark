// voice-transcode-worker — แปลงข้อความเสียง WAV บน CDN ให้เป็น M4A (AAC) แล้วชี้ DB ไปที่ไฟล์ใหม่
//
// ═══════════════════════════════════════════════════════════════
// ทำไมต้องมี (PLAN-CHAT-V2 §10 · D29/D30):
//   ตัวอัดฝั่งเบราว์เซอร์ผลิต **WAV 16kHz โมโน** เส้นทางเดียว เพราะเป็นชนิดเดียวที่เล่นได้ทุกเครื่องจริง
//   (m4a ที่ MediaRecorder ของ Chrome ทำออกมาเป็น fragmented MP4 ซึ่ง iOS เปิดไม่ได้)
//   แต่ WAV กินที่ ~32KB/วินาที และ **LINE ไม่รับ** (LINE รับเฉพาะ m4a)
//   ⇒ แปลงทีหลังบนเครื่องที่มี ffmpeg แทนที่จะแปลงตอนอัด (Vercel ไม่มี ffmpeg · VPS เครื่องนี้มี)
//
// WO-CV13 (2 ก.ย. 2026 · ปิดมติ D31 ทาง ข): สคริปต์นี้ไม่ได้แค่ "แปลงไฟล์" อีกต่อไป —
//   **หลังลูปแปลงเสร็จ มันเป็นคนส่งข้อความเสียงเข้า LINE เอง** ผ่าน `deliverPendingVoice()`
//   (ข้อความถูกบันทึกไว้ตั้งแต่ตอนพนักงานกดส่งเป็น PENDING + `meta.pendingReason="TRANSCODE"`)
//   ⇒ cron ต้องเป็น **ทุก 1 นาที** ไม่ใช่ทุก 5 นาที ไม่งั้นลูกค้ารอฟังเสียงนานถึง 5 นาที
//
// ลำดับที่ **ห้ามสลับ** (ข้อกำหนดของงาน — เหตุผลคือ "พังกลางคันแล้วต้องไม่มีจังหวะที่ DB ชี้ไฟล์ที่หายไป"):
//   ดาวน์โหลด wav → ffmpeg → **ตรวจผลก่อนเชื่อ** → PUT m4a ขึ้น Bunny → GET กลับมาเช็ค 200
//   → อัปเดตแถวใน DB → **แล้วค่อย** DELETE wav เก่า
//   ล้มตรงไหนก็หยุดตรงนั้น: wav เดิมยังอยู่ · DB ยังชี้ wav · รอบหน้าลองใหม่ได้ (idempotent)
//
// 🔴 "ตรวจผลก่อนเชื่อ" = ffmpeg exit 0 ไม่พอ (บทเรียน D30: **ชนิดไฟล์ถูก ≠ โครงไฟล์ถูก**)
//   1) ไบต์ที่ตำแหน่ง 4 ต้องเป็น `ftypM4A` — ไม่ใช่ `ftypiso5/hlsf/cmfc` ซึ่งคือ fragmented MP4 ที่ iOS เปิดไม่ได้
//   2) `ffprobe` ต้องอ่าน duration ได้ และต้องใกล้ `durationMs` เดิม ±10% (ไฟล์ที่ตัดกลางคันจะสั้นผิดปกติ)
//
// 🔴 ห้ามแตะแถวที่ retention กวาดไปแล้ว (`url` ว่าง) — นั่นคือข้อมูลที่ถูกลบตามอายุเก็บ
//    เอากลับมาแปลง = ปลุกเนื้อความที่ประกาศว่าลบแล้วขึ้นมาใหม่
//
// การใช้งาน (บน VPS · ห้ามรันบน Vercel — ไม่มี ffmpeg):
//   pnpm exec tsx scripts/voice-transcode-worker.mts [--limit=10] [--dry-run]
// exit code: 0 = รอบนี้จบดี (รวมกรณี "ไม่มีงาน") · 1 = ตั้งค่าไม่ครบ/ต่อ DB ไม่ได้/ล็อกซ้อน
//   ชิ้นที่แปลงไม่สำเร็จ **ไม่ทำให้ exit 1** (ของแบบนี้เกิดจากไฟล์เสียเฉพาะชิ้น cron ไม่ควรแดงทุกคืน)
//   แต่ลง OpsEvent source `voice.transcode` ไว้ให้ตามเก็บได้
// ═══════════════════════════════════════════════════════════════

process.loadEnvFile?.(".env");

const { spawnSync } = await import("node:child_process");
const { mkdtempSync, rmSync, writeFileSync, readFileSync, openSync, closeSync, writeSync, existsSync, unlinkSync } =
  await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");

const FFMPEG = "/usr/bin/ffmpeg";
const FFPROBE = "/usr/bin/ffprobe";
const BUNNY_HOST = "https://sg.storage.bunnycdn.com";
const LOCK_PATH = "/tmp/shark-voice-transcode.lock";
const LOCK_STALE_MS = 30 * 60_000; // ล็อกเก่ากว่านี้ = เจ้าของเดิมตายไปแล้ว (ยึดคืนได้)
const WAV_MIMES = ["audio/wav", "audio/x-wav"];

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const LIMIT = (() => {
  const a = argv.find((x) => x.startsWith("--limit="));
  const n = a ? Number(a.split("=")[1]) : 10;
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 10;
})();

const log = (s: string) => console.log(s);
const fail = (s: string) => { console.error(`❌ ${s}`); };

// ───────── ล็อกกันรันซ้อน ─────────
// cron ทุก 1 นาที (WO-CV13 — ถี่ขึ้นจาก 5 นาที เพื่อให้เสียงถึง LINE ไว) + ไฟล์ใหญ่
// = รอบก่อนยังไม่จบ รอบใหม่มาแล้ว → 2 ตัวแปลงไฟล์เดียวกัน
// แล้วตัวที่จบทีหลังจะลบ wav ที่อีกตัวกำลังใช้อยู่ (หรือลบ m4a ที่เพิ่งอัปทับ)
// 🔴 ใช้ O_EXCL (atomic บน POSIX) ไม่ใช่ existsSync แล้วค่อยเขียน — ระยะห่างสองคำสั่งนั้นคือช่องแข่ง
function takeLock(): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(LOCK_PATH, "wx");
      writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
      closeSync(fd);
      return true;
    } catch {
      // มีล็อกอยู่ — เก่าเกินไปไหม (เจ้าของเดิมอาจโดน kill ก่อนได้ลบ)
      try {
        const raw = readFileSync(LOCK_PATH, "utf8").trim();
        const [pidStr, iso] = raw.split(/\s+/);
        const age = Date.now() - new Date(iso ?? 0).getTime();
        let alive = false;
        try { process.kill(Number(pidStr), 0); alive = true; } catch { alive = false; }
        if (!alive || !Number.isFinite(age) || age > LOCK_STALE_MS) {
          unlinkSync(LOCK_PATH); // ยึดคืนแล้ววนไปขอใหม่รอบเดียว
          continue;
        }
      } catch { /* อ่านล็อกไม่ได้ = ถือว่ายังมีคนถืออยู่ ปลอดภัยกว่า */ }
      return false;
    }
  }
  return false;
}
function releaseLock() {
  try { if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH); } catch { /* ปล่อยไป — stale check เก็บให้ */ }
}

// ───────── env ─────────
const ZONE = process.env.SHARK_BUNNY_ZONE;
const KEY = process.env.SHARK_BUNNY_KEY;
const CDN = (process.env.SHARK_BUNNY_CDN ?? "").replace(/\/+$/, "");
if (!ZONE || !KEY || !CDN) {
  fail("ไม่มี SHARK_BUNNY_ZONE / SHARK_BUNNY_KEY / SHARK_BUNNY_CDN ครบ — แปลงไม่ได้");
  process.exit(1);
}
if (!existsSync(FFMPEG) || !existsSync(FFPROBE)) {
  fail(`ไม่พบ ${FFMPEG} / ${FFPROBE} — สคริปต์นี้ต้องรันบนเครื่องที่มี ffmpeg (VPS) ไม่ใช่ Vercel`);
  process.exit(1);
}

if (!takeLock()) {
  log("⏭️  มีรอบก่อนหน้ายังทำงานอยู่ (ล็อกไม่ว่าง) — ข้ามรอบนี้");
  process.exit(0);
}

type Row = {
  id: string; tenantId: string; systemId: string; url: string; storageKey: string;
  fileName: string; mimeType: string; sizeBytes: number; durationMs: number | null;
};

let ok = 0;
let sentToLine = 0;
let failedToLine = 0;
const failures: { id: string; why: string }[] = [];
let prisma: {
  chatAttachment: { findMany: (a: unknown) => Promise<Row[]>; updateMany: (a: unknown) => Promise<{ count: number }> };
  fileAsset: { updateMany: (a: unknown) => Promise<{ count: number }> };
  $transaction: (ops: unknown[]) => Promise<unknown[]>;
} | null = null;

try {
  ({ prisma } = (await import("@/lib/core/db" as string)) as never);
  const { logOps } = (await import("@/lib/core/ops" as string)) as { logOps: (l: string, s: string, m: string, o?: unknown) => Promise<void> };

  // ───────── หางาน ─────────
  // 🔴 `url: { startsWith: CDN }` ครอบคลุมของเดิม (`url: { not: "" }`) ด้วย = ตัดแถวที่ retention
  //    กวาดไปแล้ว (url ว่าง) ออกไปในตัว — ข้อมูลที่ประกาศว่าลบแล้ว ห้ามปลุกกลับมาแปลง
  //    เรียงเก่าก่อน — ของที่ค้างนานที่สุดคือของที่ผู้ใช้รอฟังนานที่สุด
  const rows = await prisma!.chatAttachment.findMany({
    // 🔒 S2 (WO-CV13) — `kind: "AUDIO"` + url ต้องอยู่ใต้ CDN ของเรา:
    //   (1) wav ที่ผู้ใช้แนบมาเป็น **ไฟล์เอกสาร** (kind FILE) ต้องไม่ถูกแปลง/เปลี่ยนชื่อเงียบ ๆ —
    //       ของที่ผู้ใช้อัปโหลดมาเป็นไฟล์ ต้องดาวน์โหลดกลับไปได้เหมือนเดิมทุกไบต์
    //   (2) กัน SSRF: สคริปต์นี้ `fetch(r.url)` จาก VPS ตรง ๆ — ไฟล์แนบเข้ามาทาง API v1 จากระบบ
    //       ภายนอกได้ (url อะไรก็ได้) แถวที่ยัด `http://169.254.169.254/...` / `localhost` เข้ามา
    //       จะกลายเป็นคำสั่งให้เครื่องเราไปดึงของภายในตัวเองแล้วอัปขึ้น CDN สาธารณะ
    where: { mimeType: { in: WAV_MIMES }, kind: "AUDIO", url: { startsWith: `${CDN}/` } },
    select: {
      id: true, tenantId: true, systemId: true, url: true, storageKey: true,
      fileName: true, mimeType: true, sizeBytes: true, durationMs: true,
    },
    orderBy: { createdAt: "asc" },
    take: LIMIT,
  });

  // 🔴 ไม่มี wav ค้าง **ไม่ได้แปลว่าไม่มีงาน** — ยังอาจมีข้อความเสียงที่แปลงไปแล้วแต่ยิงเข้า LINE
  //    ไม่ผ่านรอบก่อน (เน็ตสะดุด/โทเคนหลุด) ค้าง PENDING อยู่ ⇒ ต้องเดินต่อไปถึงขั้นส่งเสมอ
  if (rows.length === 0) log("✅ ไม่มีไฟล์ WAV ค้างให้แปลง");
  else log(`พบ ${rows.length} ชิ้นที่ต้องแปลง${DRY ? " (โหมดซ้อม — ไม่เขียนอะไรเลย)" : ""}`);

  for (const r of rows) {
    const tag = `${r.id} (${r.fileName})`;
    const tmp = mkdtempSync(join(tmpdir(), "shark-voice-"));
    const inPath = join(tmp, "in.wav");
    const outPath = join(tmp, "out.m4a");
    try {
      // ── 1) ดาวน์โหลด wav ──
      const got = await fetch(r.url);
      if (!got.ok) throw new Error(`โหลดไฟล์เดิมไม่ได้ (HTTP ${got.status})`);
      const wav = Buffer.from(await got.arrayBuffer());
      if (wav.length === 0) throw new Error("ไฟล์เดิมขนาด 0 ไบต์");
      writeFileSync(inPath, wav);

      // ── 2) ffmpeg (spawnSync + argv array — ห้าม shell string เด็ดขาด: ชื่อไฟล์มาจาก DB) ──
      const enc = spawnSync(
        FFMPEG,
        ["-hide_banner", "-loglevel", "error", "-y", "-i", inPath,
         "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", outPath],
        { encoding: "utf8", timeout: 120_000 },
      );
      if (enc.status !== 0) throw new Error(`ffmpeg ล้ม (${enc.status}) ${String(enc.stderr ?? "").slice(0, 200)}`);

      const m4a = readFileSync(outPath);
      if (m4a.length === 0) throw new Error("ffmpeg คืนไฟล์ขนาด 0 ไบต์");

      // ── 3) ตรวจผลก่อนเชื่อ (ก) โครงไฟล์ ──
      // 🔴 D30: iOS เปิด fragmented MP4 (`ftypiso5`) ไม่ได้ และ canPlayType ก็ตอบว่าเล่นได้ = จับไม่ได้
      //    ⇒ ต้องดูไบต์จริง brand ต้องเป็น M4A (muxer ipod ของ ffmpeg เขียนให้เมื่อ output เป็น .m4a)
      const brand = m4a.subarray(4, 11).toString("latin1");
      if (brand !== "ftypM4A") throw new Error(`โครงไฟล์ผิด: ขึ้นต้นด้วย "${brand}" ไม่ใช่ "ftypM4A"`);

      // ── 3) ตรวจผลก่อนเชื่อ (ข) ความยาวต้องใกล้ของเดิม ±10% ──
      const probe = spawnSync(
        FFPROBE,
        ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", outPath],
        { encoding: "utf8", timeout: 30_000 },
      );
      if (probe.status !== 0) throw new Error(`ffprobe อ่านไฟล์ผลลัพธ์ไม่ได้ (${probe.status})`);
      const outMs = Math.round(Number(String(probe.stdout ?? "").trim()) * 1000);
      if (!Number.isFinite(outMs) || outMs <= 0) throw new Error(`ffprobe คืนความยาวใช้ไม่ได้: "${String(probe.stdout).trim()}"`);
      if (r.durationMs != null && r.durationMs > 0) {
        const drift = Math.abs(outMs - r.durationMs) / r.durationMs;
        if (drift > 0.1) throw new Error(`ความยาวเพี้ยน ${(drift * 100).toFixed(1)}% (เดิม ${r.durationMs}ms → ใหม่ ${outMs}ms)`);
      }

      // ── path ใหม่: <เดิมไม่รวมนามสกุล>-aac.m4a (อยู่โฟลเดอร์เดียวกับของเดิม) ──
      const oldPath = r.storageKey?.trim() || (r.url.startsWith(`${CDN}/`) ? r.url.slice(CDN.length + 1) : "");
      if (!oldPath || oldPath.includes("..")) throw new Error(`หา path เดิมบน storage ไม่ได้ (storageKey="${r.storageKey}")`);
      const newPath = `${oldPath.replace(/\.[^./]+$/, "")}-aac.m4a`;
      const newUrl = `${CDN}/${newPath}`;
      const newName = r.fileName.replace(/\.[^./]+$/, "") + ".m4a";

      log(`  · ${tag}: ${(r.sizeBytes / 1024).toFixed(0)}KB wav → ${(m4a.length / 1024).toFixed(0)}KB m4a · ${outMs}ms`);
      if (DRY) { ok++; continue; }

      // ── 4) PUT ขึ้น Bunny ──
      const put = await fetch(`${BUNNY_HOST}/${ZONE}/${newPath}`, {
        method: "PUT",
        headers: { AccessKey: KEY, "Content-Type": "audio/mp4" },
        body: m4a.slice().buffer as ArrayBuffer,
      });
      if (!put.ok) throw new Error(`อัปโหลดไม่สำเร็จ (HTTP ${put.status})`);

      // ── 5) GET กลับมาเช็คก่อนเชื่อว่าขึ้นจริง (pull zone ต้องเห็นไฟล์ด้วย ไม่ใช่แค่ storage) ──
      let live = false;
      for (let i = 0; i < 3 && !live; i++) {
        if (i > 0) await new Promise((res) => setTimeout(res, 1500));
        const head = await fetch(newUrl, { method: "GET", headers: { Range: "bytes=0-15" } }).catch(() => null);
        live = Boolean(head && (head.status === 200 || head.status === 206));
      }
      if (!live) throw new Error(`อัปแล้วแต่ CDN ยังไม่เสิร์ฟ ${newUrl}`);

      // ── 6) อัปเดต DB (ChatAttachment + FileAsset ในทรานแซกชันเดียว) ──
      // 🔴 FileAsset คือแถวคู่ที่ uploadFile สร้างไว้ ชี้ path เดิม — ไม่อัปเดตด้วย = ทะเบียนไฟล์ของร้าน
      //    ชี้ไปที่ wav ที่กำลังจะถูกลบ (ของเดิมที่ซ่อมมือไว้ 2 ก.ย. เป็นแบบนั้นอยู่)
      // 🔴 คง `durationMs` เดิม — ความยาวไม่เปลี่ยนเพราะเปลี่ยนตัวบีบอัด และ UI วาดฟองจากค่านี้
      // 🔴 `storageKey` ต้องเปลี่ยนตาม ไม่งั้น retention จะไปตามลบไฟล์ที่ไม่มีอยู่แล้ว
      //    แล้ว m4a ตัวจริงกลายเป็นขยะกำพร้าที่ไม่มีใครลบได้ตลอดกาล
      await prisma!.$transaction([
        prisma!.chatAttachment.updateMany({
          where: { id: r.id, tenantId: r.tenantId, systemId: r.systemId, mimeType: { in: WAV_MIMES } },
          data: { url: newUrl, storageKey: newPath, mimeType: "audio/mp4", fileName: newName, sizeBytes: m4a.length },
        }),
        prisma!.fileAsset.updateMany({
          where: { tenantId: r.tenantId, path: oldPath },
          data: { path: newPath, cdnUrl: newUrl, contentType: "audio/mp4", bytes: m4a.length },
        }),
      ]);

      // ── 7) ลบ wav เก่า (ทำหลังสุดเสมอ) ──
      const del = await fetch(`${BUNNY_HOST}/${ZONE}/${oldPath}`, {
        method: "DELETE",
        headers: { AccessKey: KEY },
      }).catch(() => null);
      if (!del || !(del.ok || del.status === 404)) {
        // ไม่ถือว่าชิ้นนี้ล้มเหลว — DB ชี้ m4a เรียบร้อยแล้ว เหลือแค่ wav กำพร้าที่ต้องตามลบ
        await logOps("WARN", "voice.transcode", "แปลงสำเร็จแต่ลบ WAV เดิมไม่ได้", {
          tenantId: r.tenantId,
          detail: `${oldPath} · HTTP ${del?.status ?? "network"}`,
        }).catch(() => {});
        log(`    ⚠️ ลบ wav เดิมไม่สำเร็จ (${del?.status ?? "network"}) — DB ชี้ m4a แล้ว ค้างแค่ไฟล์กำพร้า`);
      }

      ok++;
      log(`    ✅ ${newUrl}`);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      failures.push({ id: r.id, why });
      fail(`  · ${tag}: ${why}`);
      // ทุกชิ้นอิสระ — ชิ้นนี้พังต้องไม่หยุดรอบ · wav เดิมยังอยู่ · DB ยังชี้ของเดิม ⇒ รอบหน้าลองใหม่ได้
      await logOps("WARN", "voice.transcode", "แปลงไฟล์เสียงไม่สำเร็จ", {
        tenantId: r.tenantId,
        detail: `${r.id} · ${why}`,
      }).catch(() => {});
    } finally {
      try { rmSync(tmp, { recursive: true, force: true }); } catch { /* tmp ค้างไม่เป็นไร */ }
    }
  }

  // ───────── ส่งข้อความเสียงที่ค้างรอไฟล์แปลงเข้า LINE (WO-CV13 · มติ D31 ทาง ข) ─────────
  // ทำ **หลัง** ลูปแปลงเสมอ: แถวที่เพิ่งกลายเป็น m4a ในรอบนี้ต้องได้ออกในรอบเดียวกัน
  //   (ไม่งั้นลูกค้ารออีก 1 นาทีฟรี ๆ ทั้งที่ไฟล์พร้อมแล้ว)
  // 🔴 ตัวส่งอยู่ใน service เดียวกับที่หน้าจอใช้ — ห้ามเขียนตรรกะส่ง LINE ซ้ำในสคริปต์นี้
  //    (dynamic import: ที่นี่อยู่นอก Next แต่ `deliverPendingVoice` ออกแบบให้เรียกได้)
  if (DRY) {
    log("(โหมดซ้อม — ข้ามขั้นส่งเข้า LINE)");
  } else {
    try {
      const { deliverPendingVoice } = (await import("@/lib/modules/chat/service" as string)) as {
        deliverPendingVoice: (a?: { limit?: number }) => Promise<{ sent: number; failed: number; skipped: number }>;
      };
      const d = await deliverPendingVoice({ limit: 50 });
      log(`ส่งเข้า LINE สำเร็จ ${d.sent} · ล้ม ${d.failed} · ยังรอแปลง ${d.skipped}`);
      sentToLine = d.sent;
      failedToLine = d.failed;
    } catch (e) {
      // ส่งไม่ได้ทั้งก้อน = ของยังค้าง PENDING รอรอบหน้า (ไม่ใช่ของหาย) ⇒ ไม่ทำให้รอบนี้ exit 1
      const why = e instanceof Error ? (e.stack ?? e.message) : String(e);
      fail(`ส่งข้อความเสียงที่ค้างเข้า LINE ไม่สำเร็จทั้งรอบ: ${why.slice(0, 300)}`);
      await logOps("WARN", "voice.transcode", "ส่งข้อความเสียงที่ค้างเข้าช่องทางไม่สำเร็จ", {
        detail: why.slice(0, 500),
      }).catch(() => {});
    }
  }
} catch (e) {
  fail(`รอบนี้ล้มก่อนเริ่ม: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  releaseLock();
  process.exit(1);
}

releaseLock();
log(`\n===== สรุป voice-transcode =====`);
log(`แปลงสำเร็จ ${ok} ชิ้น · ไม่สำเร็จ ${failures.length} ชิ้น`);
log(`ส่งเข้า LINE สำเร็จ ${sentToLine} · ล้ม ${failedToLine}`);
for (const f of failures) log(`  ❌ ${f.id} — ${f.why}`);
process.exit(0);
