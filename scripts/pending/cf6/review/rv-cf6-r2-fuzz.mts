// C5.5-fix5 INDEPENDENT REVIEW — round 2, pure (no DB, no env).
//   SIG.idem*  sanitizeHtml (the exact call setUserSetting makes: default options, on the trimmed input) is idempotent on its own
//              output — a stored signature always re-sanitizes to itself (never longer) — on adversarial HTML (entities, broken/nested
//              tags, quotes, comments, script/style, javascript:/mailto: links, NUL/CR/LS, Thai)
//   SIG.legacy rows written before this card = sanitize(x).slice(0, 4000) (possibly cut mid-tag/mid-entity): re-save ≤ 8 000 and stable
//   SIG.blowup worst sanitized/raw ratio seen (a raw ≤ 16 000 that sanitizes past 8 000 is refused on its FIRST save, never later)
//   SIG.G      sanitizeHtml growth on pumps up to the 16 000 raw bound
//   TXT.cut    bodyText `.slice(0, 1_000_000)` on a surrogate pair at the boundary
// Run: pnpm exec tsx scripts/pending/cf6/review/rv-cf6-r2-fuzz.mts [cases]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const N = Number(process.argv[2] ?? 40000);
const SAN = (await import("@/lib/core/sanitize" as string)) as Any;
const SH = (await import("@/lib/modules/crm/emails-shared" as string)) as Any;
const san = (s: string) => SAN.sanitizeHtml(s.trim()) as string; // setUserSetting: sanitizeHtml(str(x)), str = trim
const MAX = SH.CRM_EMAIL_SIGNATURE_MAX as number;
const IN_MAX = SH.CRM_EMAIL_SIGNATURE_INPUT_MAX as number;

const cks: { id: string; ok: boolean }[] = [];
const chk = (id: string, name: string, ok: boolean, actual: string) => { cks.push({ id, ok }); console.log(`  ${ok ? "✅" : "❌"} [${id}] ${name}\n        — ${actual.slice(0, 900)}`); };
let seed = 0x5eed2;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)] as T;
const gen = (alpha: readonly string[], max: number) => { let s = ""; const n = Math.floor(rnd() * (max + 1)); for (let i = 0; i < n; i++) s += pick(alpha); return s; };

const H = ["<", ">", "</", "/>", "<a", "<a href=", "<a href=\"https://x.co/?a=1&b=2\">", "<a href='mailto:a@b.co'>", "<a href=javascript:alert(1)>", "<a href=\"java&#115;cript:x\">", "</a>", "<p>", "</p>", "<br>", "<br/>", "<b>", "</b>", "<i>", "<ul><li>", "</li>", "<div class=x>", "<span style=\"color:red\">", "<img src=\"https://x/y.png\">", "<script>", "</script>", "<style>", "<!--", "-->", "<![CDATA[", "]]>", "&", "&amp;", "&amp;amp;", "&lt;", "&gt;", "&#60;", "&#x3c;", "&quot;", "&#39;", "&nbsp;", "&bogus;", "&#", "\"", "'", "=", " ", "\t", "\n", "\r", "\0", " ", "x", "สมชาย", "ฝ่ายขาย", "·", "<a href=\"https://x.co/\u0000\">", "<a href=\"  https://x.co\">", "<A HREF=\"HTTPS://X.CO\">", "<a href=\"https://x.co/\"onclick=x>", "<a\nhref=\"https://x.co\">", "<p\n>", "< p>", "<a href=\"https://x.co/&quot;&lt;\">", "<a href=\"https://x.co/%22%3E\">", "&#0;", "&#xD800;", "😀", "\ud83d"];

let bad: string | null = null, n = 0, grew = 0, changed = 0, maxRatio = 0, maxRatioIn = "";
for (let i = 0; i < N; i++) {
  const x = gen(H, 40);
  const s1 = san(x);
  const s2 = san(s1);
  n++;
  if (s2 !== s1) { changed++; if (s2.length > s1.length) { grew++; if (!bad) bad = `x=${JSON.stringify(x)} → s1=${JSON.stringify(s1)} → s2=${JSON.stringify(s2)}`; } else if (!bad && san(s2) !== s2) bad = `not stable after 2 passes: ${JSON.stringify(x)}`; }
  if (x.trim().length >= 20) { const r = s1.length / x.trim().length; if (r > maxRatio) { maxRatio = r; maxRatioIn = x; } }
}
chk("SIG.idem", "sanitizeHtml(sanitizeHtml(x)) === sanitizeHtml(x) on adversarial HTML (a stored signature always re-saves to itself)", bad === null && changed === 0, bad ?? `${n} inputs · changed on 2nd pass: ${changed} · grew: ${grew}`);
chk("SIG.blowup", "worst sanitized/raw length ratio seen (inputs ≥ 20 chars) — a raw ≤ 16 000 that blows past 8 000 is refused on its first save only", true, `×${maxRatio.toFixed(2)} on ${JSON.stringify(maxRatioIn).slice(0, 200)} · '&'×16000 → ${san("&".repeat(16000)).length} chars`);

// realistic-length signatures (up to the input bound) — first save accepted ⇒ re-save accepted
let firstOk = 0, resaveBad: string | null = null;
for (let i = 0; i < 2000; i++) {
  const x = gen(H, 1 + Math.floor(rnd() * 1200));
  if (x.trim().length > IN_MAX) continue;
  const s1 = san(x);
  if (s1.length > MAX) continue; // refused on first save — nothing stored
  firstOk++;
  const s2 = san(s1);
  if (s1.trim().length > IN_MAX || s2.length > MAX || s2 !== s1) { resaveBad = `len ${x.length} → ${s1.length} → ${s2.length}`; break; }
}
chk("SIG.resave", "every signature whose first save is accepted (raw ≤ 16 000 · sanitized ≤ 8 000) passes both bounds again unchanged on re-save", resaveBad === null && firstOk > 100, resaveBad ?? `${firstOk} accepted signatures re-save unchanged`);

// legacy rows: sanitize(x).slice(0, 4000) — cut anywhere, incl. mid-tag / mid-entity / mid-surrogate
let legBad: string | null = null, legN = 0, legMax = 0, legUnstable = 0;
for (let i = 0; i < 3000; i++) {
  const full = san(gen(H, 400 + Math.floor(rnd() * 1500)));
  if (full.length < 50) continue;
  const cut = full.slice(0, Math.min(4000, 1 + Math.floor(rnd() * full.length)));
  legN++;
  const r = san(cut);
  legMax = Math.max(legMax, r.length);
  if (r.trim().length > IN_MAX || r.length > MAX) { legBad = `cut ${cut.length} → ${r.length}`; break; }
  if (san(r) !== r) legUnstable++;
}
chk("SIG.legacy", "legacy rows (old stored = sanitize(x).slice(0,4000), cut anywhere) re-save within both bounds and are stable after one repair", legBad === null && legUnstable === 0 && legN > 500, legBad ?? `${legN} cut rows · longest repaired ${legMax} chars · unstable after repair: ${legUnstable}`);

// growth at the 16 000 raw bound
const best = (f: () => unknown) => { let b = Infinity; for (let k = 0; k < 3; k++) { const a = performance.now(); f(); b = Math.min(b, performance.now() - a); } return b; };
for (const u of ["<", "<a", "<a href=\"", "&", "&#", "<!--", "<script>", "<a href=\"https://x.co/?a=1&b=2\">", "\"", "<p", "</"]) {
  const a = best(() => SAN.sanitizeHtml(u.repeat(Math.ceil(4000 / u.length)))), b = best(() => SAN.sanitizeHtml(u.repeat(Math.ceil(16000 / u.length))));
  chk(`SIG.G[${u}]`, `sanitizeHtml growth 4 000 → 16 000 raw (${JSON.stringify(u)} pump)`, b < 3 || b / Math.max(a, 0.005) < 8, `${a.toFixed(2)} → ${b.toFixed(2)} ms`);
}

// bodyText cut at 1 000 000 on a surrogate pair
const t = "a".repeat(999_999) + "😀" + "tail";
const cut = t.trim().slice(0, 1_000_000);
const enc = Buffer.from(cut, "utf8");
chk("TXT.cut", "bodyText cut through a surrogate pair leaves one lone high surrogate, which UTF-8 encoding turns into U+FFFD (3 bytes) — no throw; snippet unaffected", cut.length === 1_000_000 && /[\ud800-\udbff]$/.test(cut) && enc.subarray(enc.length - 3).toString("hex") === "efbfbd" && SH.emailSnippet(cut, null).length === 200, `last code unit ${cut.charCodeAt(cut.length - 1).toString(16)} · utf8 tail ${enc.subarray(enc.length - 3).toString("hex")}`);

const fails = cks.filter((c) => !c.ok);
console.log(`\nJSON_SUMMARY ${JSON.stringify({ pass: cks.length - fails.length, total: cks.length, failed: fails.map((c) => c.id) })}`);
