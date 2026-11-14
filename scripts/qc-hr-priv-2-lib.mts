// QC — HR PRIV-2 helpers (pure, no DB): bytes → text (CSV / XLSX / props), stable digests for the doubling test (R2), bad-character set (R5),
//      static helpers for "one pay-scope helper" + marked hunks. Used by scripts/qc-hr-priv-2.mts only.
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT (check id · exact hunk · reason), never edit.
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { type Any, ROOT, diffHunks, stripComments, rd } from "./qc-hr-lib.mjs";

// ═════════════ bytes → text ═════════════
/** every entry of a zip (XLSX) inflated, concatenated in central-directory order */
export function unzipText(buf: Buffer): string {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return "";
  const n = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  let out = "";
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) break;
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20), fnl = buf.readUInt16LE(off + 28), exl = buf.readUInt16LE(off + 30), cml = buf.readUInt16LE(off + 32), loc = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + fnl).toString("utf8");
    const lfn = buf.readUInt16LE(loc + 26), lex = buf.readUInt16LE(loc + 28);
    const data = buf.subarray(loc + 30 + lfn + lex, loc + 30 + lfn + lex + csize);
    try { out += `\n«${name}»` + (method === 8 ? inflateRawSync(data) : data).toString("utf8"); } catch { /* skip */ }
    off += 46 + fnl + exl + cml;
  }
  return out;
}

/** React element tree → every prop value as text (what a server component hands to client components, incl. props never printed) */
export function propsText(node: unknown): string {
  const out: string[] = [];
  const seen = new WeakSet<object>();
  const walk = (x: unknown, depth: number) => {
    if (depth > 400 || x === null || x === undefined || typeof x === "boolean") return;
    if (typeof x === "function") return;
    if (typeof x !== "object") return void out.push(String(x));
    if (seen.has(x as object)) return;
    seen.add(x as object);
    if (x instanceof Date) return void out.push(x.toISOString());
    if (Array.isArray(x)) return x.forEach((y) => walk(y, depth + 1));
    const o = x as Any;
    if (o.$$typeof && o.props) {
      for (const [k, v] of Object.entries(o.props as object)) { if (k !== "children") out.push(k); walk(v, depth + 1); }
      return;
    }
    for (const [k, v] of Object.entries(o)) { out.push(k); walk(v, depth + 1); }
  };
  walk(node, 0);
  return out.join("\u0001");
}

/** any value (DTO · Buffer · CSV · XLSX · string) → searchable text */
export function textOfAny(v: unknown): string {
  const seen = new WeakSet();
  const out: string[] = [];
  const walk = (x: unknown) => {
    if (x === null || x === undefined) return;
    if (x instanceof Uint8Array || Buffer.isBuffer(x)) {
      const b = Buffer.from(x as Uint8Array);
      out.push(b.subarray(0, 2).toString() === "PK" ? unzipText(b) : b.toString("utf8"));
      return;
    }
    if (x instanceof Date) return void out.push(x.toISOString());
    if (typeof x === "object") {
      if (seen.has(x as object)) return;
      seen.add(x as object);
      for (const [k, y] of Object.entries(x as object)) { out.push(k); walk(y); }
      return;
    }
    out.push(String(x));
  };
  walk(v);
  return out.join("\u0001");
}

/** digest for the R2 doubling test: bytes as text (zip unpacked), ISO timestamps and requestIds blanked; nothing else normalised */
export function stableText(v: unknown): string {
  const t = typeof v === "string" ? v : textOfAny(v);
  return t
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g, "‹ts›")
    .replace(/"requestId"\s*:\s*"[^"]*"/g, '"requestId":"‹id›"')
    .replace(/<dcterms:(created|modified)[^>]*>[^<]*<\/dcterms:\1>/g, "‹xlsxdate›");
}
export const digest = (v: unknown) => createHash("sha256").update(stableText(v)).digest("hex").slice(0, 16);

// ═════════════ R5 character set (= H4.8 key-name rule, hr/api/keys.ts NAME_BAD) ═════════════
/** one representative per class: C0 · DEL · C1 · ALM · LRM/RLM · ZW space/joiners · LRE..RLO · word joiner · isolates · LS/PS · BOM */
export const BAD_SAMPLES: [string, string][] = [
  ["C0-BEL", "\u0007"], ["C0-TAB", "\t"], ["C0-LF", "\n"], ["DEL", "\u007f"], ["C1-NEL", "\u0085"], ["ALM", "\u061c"], ["ZWSP", "\u200b"], ["ZWJ", "\u200d"], ["LRM", "\u200e"], ["RLM", "\u200f"],
  ["LRE", "\u202a"], ["RLO", "\u202e"], ["WJ", "\u2060"], ["LRI", "\u2066"], ["PDI", "\u2069"], ["LS", "\u2028"], ["PS", "\u2029"], ["BOM", "\ufeff"],
];
export const BAD_RE = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\u2028\u2029\ufeff]/;
/** names that must stay accepted (control): Thai with tone marks/sara am · Latin apostrophe · hyphen inside · emoji (ZWJ-free) · digits */
export const GOOD_NAMES = ["น้ำฝน ศรีสุข", "O'Brien Jr.", "ก-ข สมใจ", "Somchai 😀", "พนักงาน 2"];
/** a text cell a spreadsheet would read as a formula (numbers like -12.50 are not) */
export const formulaCell = (c: string) => /^"?[=+\-@\t\r]/.test(c) && !/^"?-?[\d,]+(\.\d+)?"?$/.test(c);

// ═════════════ statics ═════════════
const git = (args: string[]) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
export function changedFiles(base: string): string[] {
  try {
    const a = git(["diff", "--name-only", base, "--"]).split("\n").filter(Boolean);
    const u = git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean);
    return [...new Set([...a, ...u])];
  } catch {
    return ["∅git"];
  }
}
export function fileAt(base: string, path: string): string | null {
  try {
    return execFileSync("git", ["show", `${base}:${path}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 });
  } catch {
    return null;
  }
}
/** every hunk vs base carries "HR PRIV-2" and "◂" in its added lines · no hunk removes another ticket's marker */
export function unmarkedHunks(base: string, files: string[]): string[] {
  const bad: string[] = [];
  for (const f of files) {
    const hs = diffHunks(base, f);
    if (!hs) { bad.push(`${f}:git`); continue; }
    const n = f.split("/").slice(-2).join("/");
    if (hs.some((h) => h.added.length > 0 && !(h.added.some((l) => l.includes("HR PRIV-2")) && h.added.some((l) => l.includes("◂"))))) bad.push(`${n}:unmarked`);
    if (hs.some((h) => h.added.length === 0 && h.removed.length > 0)) bad.push(`${n}:bare-removal`);
    if (hs.some((h) => h.removed.some((l) => /HR H\d+\.\d+|HF-[A-Z]+-\d|HR-SET-\d|POS P\d|CRM C\d/.test(l)) && !h.added.some((l) => l.includes("HR PRIV-2")))) bad.push(`${n}:removes-other`);
  }
  return bad;
}
export const code = (p: string) => stripComments(rd(p));
/** body of a top-level function / const arrow by name ("" when absent) — skips braces in parameter and return types */
export function bodyOf(src: string, name: string): string {
  const re = new RegExp(`(?:function\\s+${name}\\s*[(<]|const\\s+${name}\\s*=)`);
  const m = re.exec(src);
  if (!m) return "";
  const p0 = src.indexOf("(", m.index);
  if (p0 < 0) return "";
  let d = 0, p = p0;
  for (; p < src.length; p++) {
    if (src[p] === "(") d++;
    else if (src[p] === ")" && --d === 0) break;
  }
  const eol = src.indexOf("\n", p);
  const seg = src.slice(p, eol < 0 ? undefined : eol);
  const arrowAt = seg.indexOf("=>");
  if (arrowAt >= 0 && !/^\s*\{/.test(seg.slice(arrowAt + 2))) {
    const end = src.indexOf(";\n", p);
    return src.slice(m.index, end < 0 ? undefined : end);
  }
  if (!seg.trimEnd().endsWith("{")) return src.slice(m.index, eol);
  const i = p + seg.lastIndexOf("{");
  d = 0;
  for (let k = i; k < src.length; k++) {
    if (src[k] === "{") d++;
    else if (src[k] === "}" && --d === 0) return src.slice(m.index, k + 1);
  }
  return src.slice(m.index);
}
