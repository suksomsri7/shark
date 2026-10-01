// linear-text.ts — ตัวตัด/ตัวแยกข้อความแบบ "เชิงเส้นพิสูจน์ได้" แทน regex ที่ย้อนรอยกำลังสอง (CRM C5.5-fix5 · รีวิว RV-1/RV-9)
//
// 🔴 ทำไมต้องมีไฟล์นี้: regex ตัดแท็กแบบ `/<[^>]*>/g` (และพวก `<li[^>]*>` · `[ \t]+\n` · `[ \t]+$`) ไม่ใช่เชิงเส้นใน V8 —
//    ข้อความที่มี `<` เยอะ ๆ แต่ไม่มี `>` ทำให้เครื่องยนต์ลองทุกจุดเริ่มแล้ววิ่งไปจนสุดสตริงทุกครั้ง = n² (`<` 40,000 ตัว = 1.5 วินาที ·
//    1 MB ≈ 16 นาที) ⇒ คำขอเดียวแช่ event loop ของทั้ง instance (RV-1: server action รับ body ได้ 12 MB)
// ✅ ทุกฟังก์ชันในไฟล์นี้ให้ผล **ตรงทุกไบต์** กับ regex ตัวเดิมที่ระบุไว้ในคอมเมนต์ของมัน (รวมอินพุตเพี้ยน ๆ — ไม่ใช่แค่อินพุตปกติ)
//    แต่เดินสตริงรอบเดียว (indexOf ไปข้างหน้าอย่างเดียว ไม่ย้อน) — ข้อสอบ `scripts/pending/cf6/probe-cf6-linear.mts` เทียบผลกับ regex เดิม
//    บนชุดข้อมูลจริง + สุ่ม และวัดอัตราโตของเวลา (n → 4n ต้องโตไม่เกิน ~4 เท่า)
// 🔴 fitness F16 ห้ามเขียน regex ตัดแท็ก/แกะวงเล็บมุม (`<[^>]*>` · `<[^>]+>` · `<ชื่อ[^>]*>` · `<.*?>` ฯลฯ) ใน src/ อีก — ใช้ตัวในไฟล์นี้
// 🔴 ไฟล์บริสุทธิ์: ไม่ import อะไรเลย (หน้า 'use client' · core · โมดูลใดก็ใช้ได้)

/** ASCII เท่านั้น: `A`–`Z` → `a`–`z` (ตรงกับ flag `i` ของ regex โหมดไม่ใช่ unicode ที่ไม่จับคู่อักขระนอก ASCII กับตัว ASCII) */
function lowerAsciiCode(c: number): number {
  return c >= 65 && c <= 90 ? c + 32 : c;
}

/** `s` ที่ตำแหน่ง `at` ขึ้นต้นด้วย `word` (ตัวพิมพ์เล็ก ASCII) แบบไม่สนตัวพิมพ์ ASCII ไหม */
function startsWithCi(s: string, at: number, word: string): boolean {
  if (at + word.length > s.length) return false;
  for (let k = 0; k < word.length; k++) if (lowerAsciiCode(s.charCodeAt(at + k)) !== word.charCodeAt(k)) return false;
  return true;
}

/**
 * ≡ `s.replace(/<[^>]*>/g, repl)` (ค่าปริยาย) หรือ ≡ `s.replace(/<[^>]+>/g, repl)` เมื่อ `nonEmpty: true` — `repl` ใช้ตามตัวอักษร (ไม่ตีความ `$`)
 * แท็ก = จาก `<` ไปถึง `>` ตัวแรกหลังมัน (ข้างในมี `<` ได้) · ไม่มี `>` เหลือแล้ว = จบ (ไม่มีจุดเริ่มไหนหลังจากนี้จับได้อีก)
 */
export function stripTags(s: string, repl = "", opts?: { nonEmpty?: boolean }): string {
  const nonEmpty = opts?.nonEmpty === true;
  let out = "";
  let pos = 0;
  let from = 0;
  for (;;) {
    const lt = s.indexOf("<", from);
    if (lt < 0) break;
    const gt = s.indexOf(">", lt + 1);
    if (gt < 0) break;
    if (nonEmpty && gt === lt + 1) {
      from = lt + 1; // `<>` ไม่ใช่แท็กของ `<[^>]+>` — ไปต่อจากตัวถัดไป
      continue;
    }
    out += s.slice(pos, lt) + repl;
    pos = gt + 1;
    from = pos;
  }
  return pos === 0 ? s : out + s.slice(pos);
}

/**
 * ≡ `s.replace(new RegExp(`<${name}[^>]*>`, "gi"), repl)` — `name` = ตัวอักษร ASCII ตัวเล็ก (เช่น `"li"`) · `repl` ตามตัวอักษร
 * (เหมือน regex เดิม: `<link …>` ก็ถูกจับด้วยเพราะขึ้นต้นด้วย `<li`)
 */
export function replaceOpenTagCi(s: string, name: string, repl: string): string {
  let out = "";
  let pos = 0;
  let from = 0;
  for (;;) {
    const lt = s.indexOf("<", from);
    if (lt < 0) break;
    if (!startsWithCi(s, lt + 1, name)) {
      from = lt + 1;
      continue;
    }
    const gt = s.indexOf(">", lt + 1 + name.length);
    if (gt < 0) break; // ไม่มี `>` หลังจุดนี้ ⇒ `<name` ตัวหลัง ๆ ก็ไม่มีเหมือนกัน
    out += s.slice(pos, lt) + repl;
    pos = gt + 1;
    from = pos;
  }
  return pos === 0 ? s : out + s.slice(pos);
}

const isBlank = (c: number) => c === 32 || c === 9; // ` ` หรือ `\t`

/** ≡ `line.replace(/[ \t]+$/g, "")` สำหรับข้อความ **ที่ไม่มี** `\n` อยู่ข้างใน (ตัดช่องว่าง/แท็บท้ายบรรทัด) */
export function trimEndBlanks(line: string): string {
  let e = line.length;
  while (e > 0 && isBlank(line.charCodeAt(e - 1))) e--;
  return e === line.length ? line : line.slice(0, e);
}

/** ≡ `s.replace(/[ \t]+\n/g, "\n")` — ตัดช่องว่าง/แท็บที่อยู่หน้าขึ้นบรรทัดทุกจุด */
export function trimBlanksBeforeNewlines(s: string): string {
  if (s.indexOf("\n") < 0) return s;
  const lines = s.split("\n");
  for (let i = 0; i < lines.length - 1; i++) lines[i] = trimEndBlanks(lines[i] as string);
  return lines.join("\n");
}

/**
 * global replace ของ regex ที่ **ขึ้นต้นด้วย `[ชุดอักขระ]+` ตามด้วยอักขระนอกชุด** (เช่น ส่วนหน้า `@` ของอีเมล) — ผลตรงกับ
 * `s.replace(<regex เดิม แบบ g>, fn)` ทุกไบต์ แต่ลองจับเฉพาะ "ต้นกลุ่มอักขระของชุด" และ "จุดที่การจับครั้งก่อนจบ"
 * (regex เดิมลองทุกตัวกลางกลุ่ม แล้ววิ่งไปถึงท้ายกลุ่มทุกครั้ง = n² บนกลุ่มยาวที่ไม่มี `@`) — จุดกลางกลุ่มจับได้ก็ต่อเมื่อต้นกลุ่ม
 * จับได้ (ส่วน `[ชุด]+` ต้องวิ่งไปจบที่ขอบกลุ่มเดียวกันเสมอ ส่วนที่เหลือของการจับจึงเหมือนกันทุกตัวอักษร)
 * `sticky` = regex เดิมที่ใส่ flag `y` (ไม่ใส่ `g`) · `inRun` = อักขระอยู่ในชุดตัวแรกของ regex ไหม
 */
export function replaceRunAnchored(s: string, sticky: RegExp, inRun: (code: number) => boolean, fn: (match: string) => string): string {
  let out = "";
  let last = 0;
  let i = 0;
  const n = s.length;
  while (i < n) {
    if (!inRun(s.charCodeAt(i))) {
      i++;
      continue;
    }
    sticky.lastIndex = i;
    const m = sticky.exec(s);
    if (m && m[0].length > 0) {
      out += s.slice(last, i) + fn(m[0]);
      i = last = i + m[0].length;
      continue;
    }
    while (i < n && inRun(s.charCodeAt(i))) i++; // จับจากต้นกลุ่มไม่ได้ ⇒ จุดใดในกลุ่มนี้ก็จับไม่ได้
  }
  return last === 0 ? s : out + s.slice(last);
}

const isAlnum = (c: number) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
const EMAIL_LOCAL = (c: number) => isAlnum(c) || c === 46 /* . */ || c === 95 /* _ */ || c === 37 /* % */ || c === 43 /* + */ || c === 45; /* - */
const EMAIL_LOCAL_APOS = (c: number) => EMAIL_LOCAL(c) || c === 39; /* ' */
const EMAIL_STICKY = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/y;
const EMAIL_APOS_STICKY = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/y;

/**
 * อีเมลที่โผล่ในข้อความอิสระ → `fn(อีเมล)` — ≡ `s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, fn)`
 * (`apostrophe: true` ≡ ชุดส่วนหน้า `[A-Za-z0-9._%+'-]`) · เชิงเส้น (ตัวปิดบัง PII ของ REST/ผู้ช่วย AI วิ่งบนเนื้อจดหมายขาเข้าที่คนนอกเขียน)
 */
export function replaceEmailsInText(s: string, fn: (email: string) => string, opts?: { apostrophe?: boolean }): string {
  return opts?.apostrophe === true ? replaceRunAnchored(s, EMAIL_APOS_STICKY, EMAIL_LOCAL_APOS, fn) : replaceRunAnchored(s, EMAIL_STICKY, EMAIL_LOCAL, fn);
}

/** ≡ `s.replace(/c+$/, "")` สำหรับอักขระเดียว `c` (เช่น `/` ท้าย origin · `.` ท้ายโดเมน) — เดิม regex ลองทุกตัวของกลุ่ม = n² บน `////…x` */
export function trimEndRun(s: string, c: string): string {
  const code = c.charCodeAt(0);
  let e = s.length;
  while (e > 0 && s.charCodeAt(e - 1) === code) e--;
  return e === s.length ? s : s.slice(0, e);
}
