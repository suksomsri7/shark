// QC lib — HR H3.6 government filings: independent readers (RD pipe file · SSO 135 · PDF text) + the pure-layer checks S2.*
// ⚠️ Oracle under change control (same as qc-hr-h3.6.mts) — builder: ask for an ORACLE-EDIT, never edit.
// 🔴 Nothing here imports the code under test: the module objects are passed in (null = absent ⇒ the checks fail, never crash).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { type Any, ROOT, errText, short, srt, failedKeys, canon, jsonOf, modState } from "./qc-hr-lib.mjs";

export const FIX = "scripts/fixtures/";
export const VEC = jsonOf(`${FIX}hr-h3.6-vectors.json`) as Any;
export const TX = jsonOf(`${FIX}hr-h3.6-texts.json`) as Any;
export const gold = (n: string): Buffer => readFileSync(join(ROOT, FIX, n));
export const T: Record<string, string> = TX?.th ?? {};

// ═════════════ independent readers ═════════════
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
/** RD Format 2.0 reader (oracle's own) — BOM flag · final CRLF flag · rows split on CRLF and "|" */
export function rdRead(b: Buffer): { bom: boolean; finalCrlf: boolean; rows: string[][]; crlfOnly: boolean } {
  const bom = b.subarray(0, 3).equals(BOM);
  const t = b.subarray(bom ? 3 : 0).toString("utf8");
  const finalCrlf = t.endsWith("\r\n");
  const body = finalCrlf ? t.slice(0, -2) : t;
  const crlfOnly = !/[^\r]\n|\r[^\n]/.test(body) && !/^\n/.test(body);
  return { bom, finalCrlf, rows: body.split("\r\n").map((l) => l.split("|")), crlfOnly };
}
export const bahtOf = (s: string) => {
  const m = /^(\d+)\.(\d{2})$/.exec(s);
  return m ? Number(m[1]) * 100 + Number(m[2]) : NaN;
};
/** RD file self-consistency: 22/26 fields · H/D markers · TOT_NUM · Σ PAID = TOT_AMT · Σ TAX = TOT_TAX = GTOT · SEQ 1..n */
export function rdConsistent(b: Buffer): { ok: boolean; why: string; perPin: Map<string, [number, number]> } {
  const r = rdRead(b);
  const [h, ...d] = r.rows;
  const perPin = new Map<string, [number, number]>();
  const bad: string[] = [];
  if (!r.bom) bad.push("bom");
  if (!r.crlfOnly) bad.push("eol");
  if (h?.length !== 22 || h[0] !== "H") bad.push("header");
  let amt = 0;
  let tax = 0;
  d.forEach((x, i) => {
    if (x.length !== 26 || x[0] !== "D" || x[1] !== String(i + 1)) bad.push(`D${i + 1}`);
    const a = bahtOf(x[10] ?? "");
    const t = bahtOf(x[11] ?? "");
    amt += a;
    tax += t;
    const p = perPin.get(x[3]) ?? [0, 0];
    perPin.set(x[3], [p[0] + a, p[1] + t]);
  });
  if (h && (Number(h[14]) !== d.length || bahtOf(h[15]) !== amt || bahtOf(h[16]) !== tax || bahtOf(h[18]) !== tax)) bad.push("totals");
  return { ok: bad.length === 0, why: bad.join(",") || "ok", perPin };
}
/** SSO 135 reader — TIS-620 (1 byte = 1 char) or UTF-8 · lines by CRLF or LF */
export function ssoRead(b: Buffer, enc: "TIS620" | "UTF8", eol: "\r\n" | "\n" = "\r\n"): string[] {
  const t = enc === "UTF8" ? b.toString("utf8") : Array.from(b, (c) => (c < 0x80 ? String.fromCharCode(c) : String.fromCharCode(c - 0xa0 + 0x0e00))).join("");
  const parts = t.split(eol);
  return parts[parts.length - 1] === "" ? parts.slice(0, -1) : parts;
}
export function ssoConsistent(lines: string[]): { ok: boolean; why: string } {
  const bad: string[] = [];
  const [h, ...d] = lines;
  if (lines.some((l) => [...l].length !== 135)) bad.push("width");
  if (h?.[0] !== "1" || d.some((x) => x[0] !== "2")) bad.push("types");
  const sum = (sl: (s: string) => string) => d.reduce((a, x) => a + Number(sl(x)), 0);
  const wages = sum((x) => x.slice(82, 96));
  const ee = sum((x) => x.slice(96, 108));
  if (h) {
    if (Number(h.slice(76, 82)) !== d.length) bad.push("count");
    if (Number(h.slice(82, 97)) !== wages) bad.push("wages");
    if (Number(h.slice(111, 123)) !== ee) bad.push("ee");
    if (Number(h.slice(97, 111)) !== Number(h.slice(111, 123)) + Number(h.slice(123, 135))) bad.push("total");
  }
  return { ok: bad.length === 0, why: bad.join(",") || "ok" };
}

/** PDF text per page — react-pdf/pdfkit output: Type0 fonts + ToUnicode CMaps, hex strings in TJ/Tj, "\n" per ET */
export function pdfPagesText(buf: Buffer): string[] {
  const s = buf.toString("latin1");
  const objs = new Map<number, { dict: string; stream: Buffer | null }>();
  const re = /(\d+) 0 obj\s*([\s\S]*?)endobj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const body = m[2];
    const si = body.indexOf("stream");
    let stream: Buffer | null = null;
    let dict = body;
    if (si >= 0) {
      dict = body.slice(0, si);
      let start = m.index + m[0].indexOf(body) + si + 6;
      if (s[start] === "\r") start++;
      if (s[start] === "\n") start++;
      const len = Number(/\/Length (\d+)/.exec(dict)?.[1] ?? 0);
      const raw = buf.subarray(start, start + len);
      try {
        stream = /FlateDecode/.test(dict) ? inflateSync(raw) : Buffer.from(raw);
      } catch {
        stream = Buffer.from(raw);
      }
    }
    objs.set(Number(m[1]), { dict, stream });
  }
  const ref = (d: string, key: string) => {
    const r = new RegExp(`/${key} (\\d+) 0 R`).exec(d);
    return r ? Number(r[1]) : null;
  };
  const u16 = (h: string) => {
    const b = Buffer.from(h, "hex");
    let r = "";
    for (let i = 0; i + 1 < b.length; i += 2) r += String.fromCharCode(b.readUInt16BE(i));
    return r;
  };
  const cmapOf = (no: number) => {
    const out = new Map<number, string>();
    const t = objs.get(no)?.stream?.toString("latin1") ?? "";
    for (const blk of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const x of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) out.set(parseInt(x[1], 16), u16(x[2]));
    for (const blk of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
      for (const x of blk[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(\[[^\]]*\]|<[0-9a-fA-F]+>)/g)) {
        const lo = parseInt(x[1], 16);
        const hi = parseInt(x[2], 16);
        if (x[3].startsWith("[")) {
          const arr = [...x[3].matchAll(/<([0-9a-fA-F]+)>/g)].map((y) => u16(y[1]));
          for (let c = lo; c <= hi; c++) out.set(c, arr[c - lo] ?? "");
        } else {
          const base = u16(x[3].slice(1, -1));
          for (let c = lo; c <= hi; c++) out.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - lo)));
        }
      }
    return out;
  };
  const pages: string[] = [];
  for (const [, o] of [...objs.entries()].sort((a, b) => a[0] - b[0])) {
    if (!/\/Type \/Page\b(?!s)/.test(o.dict)) continue;
    const resNo = ref(o.dict, "Resources");
    const resDict = resNo !== null ? (objs.get(resNo)?.dict ?? "") : o.dict;
    let fontsBlock = /\/Font\s*<<([\s\S]*?)>>/.exec(resDict)?.[1] ?? "";
    if (!fontsBlock) {
      const fr = ref(resDict, "Font");
      fontsBlock = fr !== null ? (objs.get(fr)?.dict ?? "") : "";
    }
    const fonts = new Map<string, Map<number, string>>();
    for (const f of fontsBlock.matchAll(/\/(\w+) (\d+) 0 R/g)) {
      const fd = objs.get(Number(f[2]))?.dict ?? "";
      const tu = ref(fd, "ToUnicode");
      fonts.set(f[1], tu !== null ? cmapOf(tu) : new Map());
    }
    const one = ref(o.dict, "Contents");
    const contents = one !== null ? [one] : [...(/\/Contents \[([^\]]*)\]/.exec(o.dict)?.[1] ?? "").matchAll(/(\d+) 0 R/g)].map((x) => Number(x[1]));
    let text = "";
    for (const c of contents) {
      const cs = objs.get(c)?.stream?.toString("latin1") ?? "";
      let cur = new Map<number, string>();
      for (const tok of cs.matchAll(/\/(\w+) [\d.]+ Tf|\[((?:[^\]\\]|\\.)*)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj|\bET\b/g)) {
        if (tok[1]) {
          cur = fonts.get(tok[1]) ?? new Map();
          continue;
        }
        if (tok[0] === "ET") {
          text += "\n";
          continue;
        }
        const hexes = tok[2] !== undefined ? [...tok[2].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => x[1]) : [tok[3] ?? ""];
        for (const hx of hexes) for (let i = 0; i + 4 <= hx.length; i += 4) text += cur.get(parseInt(hx.slice(i, i + 4), 16)) ?? "�";
      }
    }
    pages.push(text);
  }
  return pages;
}
/** Thai comparison form: drop whitespace + combining marks, fold the subsetter's "ำา" artefact */
export const thNorm = (s: string) => s.replace(/ำา/g, "ำ").replace(/[ัิ-ฺ็-๎\s]/g, "");
export const digitsOf = (s: string) => s.replace(/[^0-9A-Za-z.,\-]/g, "");

// ═════════════ helpers ═════════════
export const clone = <X,>(x: X): X => JSON.parse(JSON.stringify(x)) as X;
/** dotted-path patch on a deep copy ("employer.taxId" · "options.formType" · "items") */
export function patched(input: Any, patch: Record<string, unknown>): Any {
  const out = clone(input);
  for (const [path, v] of Object.entries(patch)) {
    const ks = path.split(".");
    let o = out;
    for (const k of ks.slice(0, -1)) o = o[k] ??= {};
    o[ks[ks.length - 1]] = v;
  }
  return out;
}
export const bufOf = (x: unknown): Buffer | null => (x instanceof Uint8Array ? Buffer.from(x) : null);
export const eqBytes = (x: unknown, g: Buffer) => {
  const b = bufOf(x);
  return !!b && b.equals(g);
};
export const firstDiff = (x: unknown, g: Buffer) => {
  const b = bufOf(x);
  if (!b) return "no bytes";
  const n = Math.min(b.length, g.length);
  for (let i = 0; i < n; i++) if (b[i] !== g[i]) return `@${i} len ${b.length}/${g.length}`;
  return b.length === g.length ? "same" : `len ${b.length}/${g.length}`;
};
export const niKey = (r: Any) => canon((r?.notIncluded ?? []) as Any[]);
export const wKey = (r: Any) => canon(((r?.warnings ?? []) as Any[]).map((w) => ({ employeeId: w.employeeId ?? null, code: w.code })));
export function fillText(key: string, fields: string[], lang: "th" | "en" = "th"): string {
  const L = TX?.fieldLabel?.[lang] ?? {};
  const label = (f: string) => {
    const m = /^(.*?)(:char|:long)?$/.exec(f)!;
    return m[2] ? `${L[m[1]]} ${L[m[2]]}` : String(L[m[1]]);
  };
  return String(TX?.[lang]?.[key] ?? "").replace("{fields}", fields.map(label).join(", "));
}
const REFUSE_KEY: Record<string, string> = { PROFILE: "profile", OPTIONS: "options", EMPTY: "empty", STATUS: "status", RUN_DATA: "runData" };
type Chk = (id: string, ok: unknown, exp: unknown, act: unknown) => boolean;
export function call(mod: Any, fn: string, ...a: unknown[]): Any {
  if (typeof mod?.[fn] !== "function") return { ok: false, code: `∅${fn}`, text: modState(mod, fn) };
  try {
    return mod[fn](...a);
  } catch (e) {
    return { ok: false, code: "THROW", text: errText(e) };
  }
}
async function callA(mod: Any, fn: string, ...a: unknown[]): Promise<Any> {
  if (typeof mod?.[fn] !== "function") return { ok: false, code: `∅${fn}` };
  try {
    return await mod[fn](...a);
  } catch (e) {
    return { ok: false, code: "THROW", text: errText(e) };
  }
}
function meta(r: Any, v: Any) {
  return {
    ok: r?.ok === true,
    name: v.fileName ? r?.fileName === v.fileName : true,
    ctype: v.contentType ? r?.contentType === v.contentType : true,
    lines: v.lineCount !== undefined ? r?.lineCount === v.lineCount : true,
    total: v.totalIncomeSatang !== undefined ? r?.totalSatang === v.totalIncomeSatang : v.totalWageSatang !== undefined ? r?.totalSatang === v.totalWageSatang : true,
    tax: v.totalTaxSatang !== undefined ? r?.taxSatang === v.totalTaxSatang : v.totalContributionSatang !== undefined ? r?.taxSatang === v.totalContributionSatang : true,
    ni: v.notIncluded ? niKey(r) === canon(v.notIncluded) : true,
    warn: v.warnings ? wKey(r) === canon(v.warnings) : true,
  };
}

// ═════════════ S2 pure checks ═════════════
/** B = hr/filings/build · PDFM = hr/filings/cert-pdf (null ⇒ fail) */
export async function runPure(chk: Chk, B: Any, PDFM: Any): Promise<void> {
  const ck = (id: string, r: Record<string, unknown>, exp: string, extra = "") => chk(id, Object.values(r).every(Boolean), exp, `${failedKeys(r)}${extra ? ` ${extra}` : ""}`);
  const P = VEC?.pnd ?? {};
  const S = VEC?.sso ?? {};
  // S2.0 control — the goldens agree with the layouts on their own
  {
    const rdFiles = ["hr-h3.6-g1-pnd1.txt", "hr-h3.6-g2-pnd1a.txt", "hr-h3.6-g2m10-pnd1.txt", "hr-h3.6-g2m12-pnd1.txt", "hr-h3.6-db1-pnd1.txt", "hr-h3.6-db2-pnd1a.txt"];
    const rdBad = rdFiles.filter((f) => !rdConsistent(gold(f)).ok);
    const sso: [string, "TIS620" | "UTF8", "\r\n" | "\n"][] = [["hr-h3.6-g3-sso.txt", "TIS620", "\r\n"], ["hr-h3.6-g3u-sso-utf8.txt", "UTF8", "\r\n"], ["hr-h3.6-g3l-sso-lf.txt", "TIS620", "\n"], ["hr-h3.6-g3a-sso-actual.txt", "TIS620", "\r\n"], ["hr-h3.6-g3b-sso-clamped.txt", "TIS620", "\r\n"], ["hr-h3.6-db3-sso.txt", "TIS620", "\r\n"], ["hr-h3.6-db3a-sso-actual.txt", "TIS620", "\r\n"]];
    const ssoBad = sso.filter(([f, e, l]) => !ssoConsistent(ssoRead(gold(f), e, l)).ok).map(([f]) => f);
    const g3 = ssoRead(gold("hr-h3.6-g3-sso.txt"), "TIS620");
    // research C3 V2 header, verbatim (· = space)
    const research = "112345678900000001512691169บริษัท·ตัวอย่าง·จำกัด························050000000200000000244300000000000244400000000122200000000122200".replace(/·/g, " ");
    const ann = rdConsistent(gold("hr-h3.6-g2-pnd1a.txt")).perPin;
    const mon = [gold("hr-h3.6-g2m10-pnd1.txt"), gold("hr-h3.6-g1-pnd1.txt"), gold("hr-h3.6-g2m12-pnd1.txt")].map((g) => rdConsistent(g).perPin);
    const sumMon = new Map<string, [number, number]>();
    for (const m of mon) for (const [k, [a, t]] of m) sumMon.set(k, [(sumMon.get(k)?.[0] ?? 0) + a, (sumMon.get(k)?.[1] ?? 0) + t]);
    const prop = ann.size === sumMon.size && [...ann].every(([k, v]) => canon(sumMon.get(k)) === canon(v));
    const dbAnn = rdConsistent(gold("hr-h3.6-db2-pnd1a.txt")).perPin;
    const rows = rdRead(gold("hr-h3.6-g2-pnd1a.txt")).rows;
    ck("S2.0", { rd: rdBad.length === 0, sso: ssoBad.length === 0, research: g3[0] === research, prop, db2: dbAnn.get("1102000123454")?.[0] === 9_500_000, dates: rows.slice(1).every((x) => x[8] === "31122569"), texts: !!T.no && !!TX?.en?.no }, "goldens consistent", `${rdBad.join(",")} ${ssoBad.join(",")}`);
  }
  // S2.1 texts
  {
    const th = B?.FILING_TEXT ?? null;
    const en = B?.FILING_TEXT_EN ?? null;
    const lab = B?.FIELD_LABEL ?? null;
    const fn = typeof B?.filingTextFor === "function" ? B.filingTextFor : null;
    ck("S2.1", { th: !!th && canon(th) === canon(TX.th), en: !!en && canon(en) === canon(TX.en), labels: !!lab && canon(lab) === canon(TX.fieldLabel), locale: !!fn && fn("en") === en && fn("th") === th && fn(null) === th }, "texts byte-exact", modState(B, "build"));
  }
  // S2.2 thaiIdOk
  {
    const bad = ((VEC?.thaiId ?? []) as [unknown, boolean][]).filter(([v, want]) => call(B, "thaiIdOk", v) !== want).map(([v]) => String(v));
    chk("S2.2", bad.length === 0 && typeof B?.thaiIdOk === "function", "12 vectors", bad.join(",") || modState(B, "build"));
  }
  // S2.3 itemFigures
  {
    const bad: string[] = [];
    for (const f of (VEC?.figures ?? []) as Any[]) {
      const r = call(B, "itemFigures", clone(f.row));
      const ok = f.out.ok ? canon(r) === canon(f.out) : r?.ok === false;
      if (!ok) bad.push(`${f.id}:${short(r, 70)}`);
    }
    chk("S2.3", bad.length === 0, "F1–F10 (v2 stored · v1 stored · refusals)", bad.join(" · ") || "ok");
  }
  const pnd = (inp: Any) => call(B, "buildPnd1", clone(inp));
  // S2.4 G1
  {
    const v = P.G1;
    const r = pnd(v.in);
    ck("S2.4", { bytes: eqBytes(r?.bytes, gold(v.file)), ...meta(r, v) }, "G1 byte-exact", firstDiff(r?.bytes, gold(v.file)));
  }
  // S2.5 G2 + G2W
  {
    const v = P.G2;
    const r = pnd(v.in);
    const w = P.G2W;
    const rw = pnd(w.in);
    ck("S2.5", { bytes: eqBytes(r?.bytes, gold(v.file)), ...meta(r, v), wBytes: eqBytes(rw?.bytes, gold(w.file)), wWarn: wKey(rw) === canon(w.warnings) }, "G2 1ก byte-exact · reports · G2W warnings", `${firstDiff(r?.bytes, gold(v.file))} ni=${short(r?.notIncluded, 90)} w=${short(rw?.warnings, 90)}`);
  }
  // S2.6 monthly of the same data
  {
    const bad = ["G2M10", "G2M11", "G2M12"].filter((k) => {
      const r = pnd(P[k].in);
      return !(eqBytes(r?.bytes, gold(P[k].file)) && Object.values(meta(r, P[k])).every(Boolean));
    });
    chk("S2.6", bad.length === 0, "3 monthly byte-exact + reports", bad.join(",") || "ok");
  }
  // S2.7 RD sample round trip
  {
    const out: Record<string, boolean> = {};
    for (const n of ["hr-h3.6-rd-sample-pnd1.txt", "hr-h3.6-rd-sample-pnd1a.txt"]) {
      const g = gold(n);
      const p = call(B, "parseRdFile", new Uint8Array(g));
      const mine = rdRead(g);
      out[`${n.slice(18, -4)}Parse`] = !!p && p.bom === true && p.finalCrlf === mine.finalCrlf && canon(p.rows) === canon(mine.rows);
      out[`${n.slice(18, -4)}Emit`] = eqBytes(call(B, "emitRdFile", p), g);
    }
    const s1 = rdRead(gold("hr-h3.6-rd-sample-pnd1.txt")).rows;
    out.codes = srt(s1.slice(1).map((x) => `${x[12]}/${x[13]}`)) === srt(["5/1", "4/1", "3/1", "2/2", "1/3"]);
    out.totals = rdConsistent(gold("hr-h3.6-rd-sample-pnd1.txt")).ok && /^(6500\.00)$/.test(s1[0][15]) && rdRead(gold("hr-h3.6-rd-sample-pnd1a.txt")).rows[0][15] === "27930.00";
    out.finalFlags = rdRead(gold("hr-h3.6-rd-sample-pnd1.txt")).finalCrlf && !rdRead(gold("hr-h3.6-rd-sample-pnd1a.txt")).finalCrlf;
    ck("S2.7", out, "RD samples parse → emit byte-identical");
  }
  // S2.8 options
  {
    const [o1, o2] = P.options as Any[];
    const r1 = pnd(patched(P.G1.in, { options: o1.options }));
    const r2 = pnd(patched(P.G1.in, { options: o2.options }));
    const h1 = bufOf(r1?.bytes) ? rdRead(bufOf(r1.bytes)!).rows[0] : [];
    const h2 = bufOf(r2?.bytes) ? rdRead(bufOf(r2.bytes)!).rows[0] : [];
    ck("S2.8", { o1name: r1?.fileName === o1.fileName, o1h: h1[13] === o1.header14, o2trans: h2[19] === o2.header20, o2flag: h2[21] === o2.header22 }, "formType/seqNo/formFlag");
  }
  // S2.9 PND refusals
  {
    const bad: string[] = [];
    for (const x of P.refuse as Any[]) {
      const r = pnd(patched(P.G1.in, x.patch));
      const text = fillText(REFUSE_KEY[x.code], x.fields);
      if (!(r?.ok === false && r.code === x.code && canon(r.fields ?? []) === canon(x.fields) && r.text === text)) bad.push(`${x.id}:${r?.code}/${short(r?.fields, 30)}`);
    }
    chk("S2.9", bad.length === 0, "R1–R10 code · fields · text", bad.join(" · ") || "ok");
  }
  const sso = (inp: Any) => call(B, "buildSso110", clone(inp));
  // S2.10 G3 + defaults
  {
    const v = S.G3;
    const r = sso(v.in);
    const rd = sso(patched(v.in, { options: {} }));
    ck("S2.10", { bytes: eqBytes(r?.bytes, gold(v.file)), ...meta(r, v), defaults: eqBytes(rd?.bytes, gold(v.file)) }, "G3 = research V2 · defaults", firstDiff(r?.bytes, gold(v.file)));
  }
  // S2.11 encodings / line ends
  {
    const ru = sso(patched(S.G3.in, { "options.encoding": "UTF8" }));
    const rl = sso(patched(S.G3.in, { "options.lineEnd": "LF" }));
    ck("S2.11", { utf8: eqBytes(ru?.bytes, gold(S.G3U.file)) && ru?.contentType === S.G3U.contentType, lf: eqBytes(rl?.bytes, gold(S.G3L.file)) }, "UTF8 · LF byte-exact", `${firstDiff(ru?.bytes, gold(S.G3U.file))} / ${firstDiff(rl?.bytes, gold(S.G3L.file))}`);
  }
  // S2.12 ACTUAL vs CLAMPED · NAME_CUT · prefix · not insured · TIS char
  {
    const ra = sso(S.G3A.in);
    const rb = sso(patched(S.G3A.in, { "options.wageMode": "CLAMPED" }));
    const tc = S.tisChar;
    const inp = clone(S.G3.in);
    inp.persons.find((p: Any) => p.employeeId === tc.employeeId).firstName = tc.firstName;
    const rt = sso(inp);
    const ru = sso(patched(inp, { "options.encoding": "UTF8" }));
    ck("S2.12", {
      actual: eqBytes(ra?.bytes, gold(S.G3A.file)), ...meta(ra, S.G3A), clamped: eqBytes(rb?.bytes, gold(S.G3B.file)) && rb?.totalSatang === S.G3B.totalWageSatang,
      tis: rt?.ok === true && canon((rt.notIncluded ?? []).map((x: Any) => [x.employeeId, x.cause, x.fields])) === canon([["p1", "INCOMPLETE", ["firstName:char"]]]),
      utf: ru?.ok === true && (ru.notIncluded ?? []).length === 0 && ru.lineCount === 2,
    }, "G3A/G3B · reports · TIS char", `${firstDiff(ra?.bytes, gold(S.G3A.file))} ni=${short(ra?.notIncluded, 80)}`);
  }
  // S2.13 SSO refusals
  {
    const bad: string[] = [];
    for (const x of S.refuse as Any[]) {
      const r = sso(patched(S.G3.in, x.patch));
      const text = fillText(REFUSE_KEY[x.code], x.fields);
      if (!(r?.ok === false && r.code === x.code && canon(r.fields ?? []) === canon(x.fields) && r.text === text)) bad.push(`${x.id}:${r?.code}/${short(r?.fields, 30)}`);
    }
    chk("S2.13", bad.length === 0, "S1–S10 code · fields · text", bad.join(" · ") || "ok");
  }
  // S2.14 properties
  {
    let seed = 36;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const ids = ["p1", "p2", "p6"];
    const bad: string[] = [];
    for (let k = 0; k < 40 && bad.length < 3; k++) {
      const items: Any[] = [];
      for (let m = 1; m <= 12; m++)
        for (const e of ids)
          if (rnd(3)) {
            const inc = rnd(5) === 0 ? 0 : rnd(10_000_000) + 1;
            items.push({ employeeId: e, runId: `r${m}`, engineVersion: 2, runStatus: "PAID", payDate: `2026-${String(m).padStart(2, "0")}-25`, incomeSatang: inc, taxSatang: inc ? rnd(Math.floor(inc / 5)) : 0, ssoWageActualSatang: 0, ssoWageClampedSatang: 0, ssoEmployeeSatang: 0, ssoEmployerSatang: 0 });
          }
      const base = { employer: VEC.employer, persons: ids.map((i) => VEC.persons[i]), items, certs: [], options: {} };
      const frozen = canon(base);
      const ann = pnd({ ...base, kind: "PND1A", taxYear: 2026, taxMonth: null });
      const ann2 = pnd({ ...base, kind: "PND1A", taxYear: 2026, taxMonth: null });
      if (!(ann?.ok === true || ann?.code === "EMPTY")) {
        bad.push(`#${k} annual ${ann?.code}`);
        continue;
      }
      const sum = new Map<string, [number, number]>();
      for (let m = 1; m <= 12; m++) {
        const r = pnd({ ...base, kind: "PND1", taxYear: 2026, taxMonth: m });
        if (r?.ok !== true) continue;
        const c = rdConsistent(bufOf(r.bytes)!);
        if (!c.ok) bad.push(`#${k} m${m} ${c.why}`);
        for (const [p, [a, t]] of c.perPin) sum.set(p, [(sum.get(p)?.[0] ?? 0) + a, (sum.get(p)?.[1] ?? 0) + t]);
      }
      if (ann?.ok === true) {
        const c = rdConsistent(bufOf(ann.bytes)!);
        if (!c.ok || canon([...c.perPin].sort()) !== canon([...sum].sort())) bad.push(`#${k} Σmonthly≠annual`);
        if (!eqBytes(ann2?.bytes, bufOf(ann.bytes)!)) bad.push(`#${k} nondeterministic`);
      }
      if (canon(base) !== frozen) bad.push(`#${k} input mutated`);
    }
    chk("S2.14", bad.length === 0 && typeof B?.buildPnd1 === "function", "40 sets: Σ monthly = annual per PIN · totals · deterministic · no mutation", bad.join(" · ") || modState(B, "build"));
  }
  // S2.15 certificate content + numbers
  {
    const bad: string[] = [];
    for (const c of (VEC?.cert ?? []) as Any[]) {
      const r = call(B, "taxCertContent", clone(c.in));
      if (c.out) {
        if (canon(r) !== canon(c.out)) bad.push(`${c.id}:${short(r, 60)}`);
      } else if (!(r?.payee?.address === c.outPayeeAddress && r?.totalTaxText === c.outTotalTaxText)) bad.push(`${c.id}:${short(r?.payee, 60)}`);
    }
    for (const d of (VEC?.docNo ?? []) as Any[]) if (call(B, "taxCertDocNo", d.prefix, d.taxYear, d.seq) !== d.out) bad.push(`docNo ${d.out}`);
    chk("S2.15", bad.length === 0, "C1–C4 content exact · docNo via formatDocNo", bad.join(" · ") || "ok");
  }
  // S2.16 PDF
  {
    const c = (VEC?.cert ?? [])[0] as Any;
    const r1 = await callA(PDFM, "renderTaxCertPdf", clone(c.out));
    const r2 = await callA(PDFM, "renderTaxCertPdf", clone(c.out));
    const b1 = bufOf(r1);
    const b2 = bufOf(r2);
    let pages: string[] = [];
    let pages2: string[] = [];
    try {
      pages = b1 ? pdfPagesText(b1) : [];
      pages2 = b2 ? pdfPagesText(b2) : [];
    } catch (e) {
      pages = [`ERR ${errText(e)}`];
    }
    const has = (p: string, s: string) => digitsOf(p).includes(digitsOf(s));
    const hasTh = (p: string, s: string) => thNorm(p).includes(thNorm(s));
    const r = {
      pdf: !!b1 && b1.subarray(0, 5).toString("latin1") === "%PDF-",
      pages: pages.length === 2,
      must: pages.length === 2 && pages.every((p) => (c.pdfMust as string[]).every((s) => has(p, s))),
      thai: pages.length === 2 && pages.every((p) => (c.pdfMustThai as string[]).every((s) => hasTh(p, s))),
      copies: pages.length === 2 && hasTh(pages[0], c.pdfPage[0]) && hasTh(pages[1], c.pdfPage[1]),
      not: pages.every((p) => (c.pdfNot as string[]).every((s) => !has(p, s))),
      sameText: pages.length === 2 && canon(pages) === canon(pages2),
    };
    const miss = pages.length ? [...(c.pdfMust as string[]).filter((s) => !has(pages[0], s)), ...(c.pdfMustThai as string[]).filter((s) => !hasTh(pages[0], s))] : [];
    ck("S2.16", r, "2 copies · content on both · same text twice", `${modState(PDFM, "cert-pdf")} missing: ${miss.join(" | ").slice(0, 160)}`);
  }
}
