// QC — HR PRIV-2 helpers (pure): bytes → text · stable digests (R2) · bad-character set (R5) · statics. Used by qc-hr-priv-2.mts only.
// ⚠️ Oracle under change control — builder: ask for an ORACLE-EDIT, never edit.
import { inflateRawSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { type Any, ROOT, diffHunks, stripComments, rd } from "./qc-hr-lib.mjs";

/** every zip (XLSX) entry inflated, in central-directory order */
export function unzipText(buf: Buffer): string {
 let e = -1;
 for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { e = i; break; }
 if (e < 0) return "";
 let off = buf.readUInt32LE(e + 16), out = "";
 for (let k = 0, n = buf.readUInt16LE(e + 10); k < n && buf.readUInt32LE(off) === 0x02014b50; k++) {
  const m = buf.readUInt16LE(off + 10), cs = buf.readUInt32LE(off + 20), fl = buf.readUInt16LE(off + 28), xl = buf.readUInt16LE(off + 30), cl = buf.readUInt16LE(off + 32), lo = buf.readUInt32LE(off + 42);
  const st = lo + 30 + buf.readUInt16LE(lo + 26) + buf.readUInt16LE(lo + 28), d = buf.subarray(st, st + cs);
  try { out += `\n«${buf.subarray(off + 46, off + 46 + fl).toString("utf8")}»` + (m === 8 ? inflateRawSync(d) : d).toString("utf8"); } catch { /* skip */ }
  off += 46 + fl + xl + cl;
 }
 return out;
}
/** value → searchable text; `props` = React element tree mode (every prop handed to children, incl. never-printed ones) */
function walkText(v: unknown, props: boolean): string {
 const out: string[] = [], seen = new WeakSet<object>();
 const w = (x: unknown, d: number) => {
  if (d > 400 || x === null || x === undefined || typeof x === "function" || (props && typeof x === "boolean")) return;
  if (x instanceof Uint8Array) { const b = Buffer.from(x); return void out.push(b.subarray(0, 2).toString() === "PK" ? unzipText(b) : b.toString("utf8")); }
  if (x instanceof Date) return void out.push(x.toISOString());
  if (typeof x !== "object") return void out.push(String(x));
  if (seen.has(x)) return;
  seen.add(x);
  const o = x as Any;
  if (props && o.$$typeof && o.props) { for (const [k, y] of Object.entries(o.props as object)) { if (k !== "children") out.push(k); w(y, d + 1); } return; }
  if (Array.isArray(o)) return o.forEach((y) => w(y, d + 1));
  for (const [k, y] of Object.entries(o)) { out.push(k); w(y, d + 1); }
 };
 w(v, 0);
 return out.join("\u0001");
}
export const propsText = (n: unknown) => walkText(n, true);
export const textOfAny = (v: unknown) => walkText(v, false);
/** R2 digest input: zips unpacked · ISO timestamps / requestIds / xlsx dates blanked — nothing else normalised */
export const stableText = (v: unknown) => (typeof v === "string" ? v : textOfAny(v))
 .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})/g, "‹ts›").replace(/"requestId"\s*:\s*"[^"]*"/g, '"requestId":"‹id›"').replace(/<dcterms:(created|modified)[^>]*>[^<]*<\/dcterms:\1>/g, "‹d›");
export const digest = (v: unknown) => createHash("sha256").update(stableText(v)).digest("hex").slice(0, 16);

/** R5 set = H4.8 key-name rule (hr/api/keys.ts NAME_BAD) — one sample per class */
export const BAD_SAMPLES: [string, string][] = [
 ["C0-BEL", "\u0007"], ["C0-TAB", "\t"], ["C0-LF", "\n"], ["DEL", "\u007f"], ["C1-NEL", "\u0085"], ["ALM", "\u061c"], ["ZWSP", "\u200b"], ["ZWJ", "\u200d"], ["LRM", "\u200e"], ["RLM", "\u200f"],
 ["LRE", "\u202a"], ["RLO", "\u202e"], ["WJ", "\u2060"], ["LRI", "\u2066"], ["PDI", "\u2069"], ["LS", "\u2028"], ["PS", "\u2029"], ["BOM", "\ufeff"],
];
export const BAD_RE = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\u2028\u2029\ufeff]/;
export const GOOD_NAMES = ["น้ำฝน ศรีสุข", "O'Brien Jr.", "ก-ข สมใจ", "Somchai 😀", "พนักงาน 2"];
/** text cell a spreadsheet reads as a formula (plain numbers like -12.50 are not) */
export const formulaCell = (c: string) => /^"?[=+\-@\t\r]/.test(c) && !/^"?-?[\d,]+(\.\d+)?"?$/.test(c);

const git = (a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }).trim();
export function changedFiles(base: string): string[] {
 try { return [...new Set([...git(["diff", "--name-only", base, "--"]).split("\n"), ...git(["ls-files", "--others", "--exclude-standard"]).split("\n")].filter(Boolean))]; } catch { return ["∅git"]; }
}
export function fileAt(base: string, path: string): string | null {
 try { return execFileSync("git", ["show", `${base}:${path}`], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 }); } catch { return null; }
}
/** every hunk carries "HR PRIV-2" and "◂" on an added line · no bare removal · no other ticket's marker removed */
export function unmarkedHunks(base: string, files: string[]): string[] {
 const bad: string[] = [];
 for (const f of files) {
  const hs = diffHunks(base, f), n = f.split("/").slice(-2).join("/");
  if (!hs) { bad.push(`${n}:git`); continue; }
  const mk = (h: { added: string[] }) => h.added.some((l) => l.includes("HR PRIV-2"));
  if (hs.some((h) => h.added.length && !(mk(h) && h.added.some((l) => l.includes("◂"))))) bad.push(`${n}:unmarked`);
  if (hs.some((h) => !h.added.length && h.removed.length)) bad.push(`${n}:bare-removal`);
  if (hs.some((h) => h.removed.some((l) => /HR H\d+\.\d+|HF-[A-Z]+-\d|HR-SET-\d|POS P\d|CRM C\d/.test(l)) && !mk(h))) bad.push(`${n}:removes-other`);
 }
 return bad;
}
export const code = (p: string) => stripComments(rd(p));
/** body of a function / const arrow by name ("" when absent) — skips braces in parameter and return types */
export function bodyOf(src: string, name: string): string {
 const m = new RegExp(`(?:function\\s+${name}\\s*[(<]|const\\s+${name}\\s*=)`).exec(src);
 const p0 = m ? src.indexOf("(", m.index) : -1;
 if (!m || p0 < 0) return "";
 let d = 0, p = p0;
 for (; p < src.length; p++) if (src[p] === "(") d++; else if (src[p] === ")" && --d === 0) break;
 const eol = src.indexOf("\n", p), seg = src.slice(p, eol < 0 ? undefined : eol), ar = seg.indexOf("=>");
 if (ar >= 0 && !/^\s*\{/.test(seg.slice(ar + 2))) { const e = src.indexOf(";\n", p); return src.slice(m.index, e < 0 ? undefined : e); }
 if (!seg.trimEnd().endsWith("{")) return src.slice(m.index, eol);
 d = 0;
 for (let k = p + seg.lastIndexOf("{"); k < src.length; k++) if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(m.index, k + 1);
 return src.slice(m.index);
}
