// @ts-nocheck
// judge.mts — INDEPENDENT judge for the sanitizer hotfix review (ledger/wo-notes/hotfix-sanitize-2026-10-01-review.md)
//
// No HTML parser is installed in this repo (parse5/htmlparser2/jsdom/linkedom/cheerio/happy-dom absent; no installs allowed) ⇒
// this is a spec-faithful WHATWG HTML *tokenizer* (§13.2.5) for every state reachable from the data state:
//   data · tag open · end tag open · tag name · before/after attribute name · attribute name · before attribute value ·
//   attribute value (double/single/unquoted) · after attribute value (quoted) · self-closing start tag · bogus comment ·
//   markup declaration open · comment (start/start-dash/comment/end-dash/end/end-bang) · DOCTYPE (ends at the first `>` in
//   every DOCTYPE sub-state) · CDATA outside foreign content (= bogus comment) · character references with the FULL named
//   entity table (2 125 names + 106 legacy no-semicolon names, extracted at runtime from the `entities` tables bundled in
//   next/dist/compiled/node-html-parser) incl. the attribute-value historical rule and the numeric windows-1252 remap.
// Tokenizer state switches (RCDATA/RAWTEXT/script/PLAINTEXT/foreign content) are only entered by start tags of
// title/textarea/style/xmp/iframe/noembed/noframes/noscript/script/plaintext/svg/math — every one of them is itself a
// violation (not in any allowlist), so the judge stops at the first such tag instead of modelling those states.
//
// Verdict per output: XSS-class violations (element/attribute not allowlisted, URL whose browser-parsed scheme is not
// allowed) and POLICY-class (comment/doctype emitted, relative URL, missing rel, `&` left undecodable …).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ───────────── entity tables (from the copy of `entities` bundled in next's node-html-parser) ─────────────
function sliceObject(src: string, at: number): string {
  let d = 0;
  for (let i = at; i < src.length; i++) {
    const c = src[i];
    if (c === "{") d++;
    else if (c === "}") {
      d--;
      if (!d) return src.slice(at, i + 1);
    } else if (c === '"') {
      // skip string (values may contain braces)
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\\") i++;
        i++;
      }
    }
  }
  throw new Error("unterminated object");
}
function loadEntities(): { full: Record<string, string>; legacy: Record<string, string> } {
  const path = require.resolve("next/dist/compiled/node-html-parser/index.js");
  const src = readFileSync(path, "utf8");
  const objs: Record<string, string>[] = [];
  const re = /\{"Aacute":/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const q = src[m.index - 1];
    if (q === "'" || q === '"' || q === "`") {
      // the table is a JS string literal handed to JSON.parse — evaluate the literal (constant, from the repo's own node_modules)
      let e = m.index;
      while (e < src.length && src[e] !== q) e += src[e] === "\\" ? 2 : 1;
      objs.push(JSON.parse(new Function(`return ${src.slice(m.index - 1, e + 1)}`)()));
    } else objs.push(JSON.parse(sliceObject(src, m.index)));
  }
  objs.sort((a, b) => Object.keys(b).length - Object.keys(a).length);
  const full = objs[0]!;
  const legacy = objs[objs.length - 1]!;
  if (Object.keys(full).length < 2000 || Object.keys(legacy).length < 100 || full.colon !== ":" || full.Tab !== "\t" || full.NewLine !== "\n")
    throw new Error("entity tables not found / unexpected");
  return { full, legacy };
}
export const ENT = loadEntities();
const MAX_NAME = Math.max(...Object.keys(ENT.full).map((k) => k.length));

const W1252: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030,
  0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};
const isAsciiAlpha = (c: string) => /^[A-Za-z]$/.test(c);
const isAlnum = (c: string | undefined) => !!c && /^[A-Za-z0-9]$/.test(c);

/** character reference at s[i]==='&' → [decoded, consumedLen] (consumedLen 1 = not a reference, `&` literal) */
function charRef(s: string, i: number, inAttr: boolean): [string, number] {
  const c = s[i + 1];
  if (c === "#") {
    let k = i + 2;
    let hex = false;
    if (s[k] === "x" || s[k] === "X") { hex = true; k++; }
    const ds = k;
    while (k < s.length && (hex ? /[0-9a-fA-F]/.test(s[k]!) : /[0-9]/.test(s[k]!))) k++;
    if (k === ds) return ["&", 1]; // absence of digits — nothing consumed
    let code = parseInt(s.slice(ds, k), hex ? 16 : 10);
    if (s[k] === ";") k++;
    if (!Number.isFinite(code) || code > 0x10ffff) code = 0xfffd;
    else if (code === 0) code = 0xfffd;
    else if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    else if (W1252[code]) code = W1252[code]!;
    return [String.fromCodePoint(code), k - i];
  }
  if (!isAlnum(c)) return ["&", 1];
  let run = "";
  for (let k = i + 1; k < s.length && run.length < MAX_NAME + 1 && isAlnum(s[k]); k++) run += s[k];
  if (s[i + 1 + run.length] === ";" && ENT.full[run] !== undefined) return [ENT.full[run]!, run.length + 2];
  // longest legacy (no-semicolon) prefix; also a full-table name immediately followed by ';' inside the run is impossible (alnum run)
  for (let L = Math.min(run.length, 8); L >= 2; L--) {
    const name = run.slice(0, L);
    if (ENT.legacy[name] !== undefined) {
      const next = s[i + 1 + L];
      if (inAttr && (next === "=" || isAlnum(next))) return ["&", 1]; // historical: not decoded in attributes
      return [ENT.legacy[name]!, L + 1];
    }
  }
  return ["&", 1];
}
export function decodeText(s: string, inAttr: boolean): string {
  let out = "";
  for (let i = 0; i < s.length; ) {
    if (s[i] === "&") {
      const [d, n] = charRef(s, i, inAttr);
      out += d;
      i += n;
    } else out += s[i++];
  }
  return out;
}

export type Tok =
  | { t: "start"; name: string; attrs: { name: string; value: string }[]; selfClosing: boolean }
  | { t: "end"; name: string }
  | { t: "text"; data: string }
  | { t: "comment"; data: string }
  | { t: "doctype" };

const WS = (c: string | undefined) => c === "\t" || c === "\n" || c === "\f" || c === " ";

/** WHATWG tokenizer from the data state. Stops (returns `switched`) at a start tag that would change tokenizer state. */
export function tokenize(input: string): { toks: Tok[]; switched: string | null } {
  const s = input.replace(/\r\n?/g, "\n");
  const toks: Tok[] = [];
  let text = "";
  const pushText = () => {
    if (text) toks.push({ t: "text", data: decodeText(text, false) });
    text = "";
  };
  const n = s.length;
  let i = 0;
  const SWITCH = new Set(["title", "textarea", "style", "xmp", "iframe", "noembed", "noframes", "noscript", "script", "plaintext", "svg", "math"]);
  while (i < n) {
    const ch = s[i]!;
    if (ch !== "<") { text += ch; i++; continue; }
    // tag open
    const c1 = s[i + 1];
    if (c1 === "!") {
      // markup declaration open
      if (s.startsWith("--", i + 2)) {
        pushText();
        // comment start
        let k = i + 4;
        if (s[k] === ">") { toks.push({ t: "comment", data: "" }); i = k + 1; continue; }
        if (s[k] === "-" && s[k + 1] === ">") { toks.push({ t: "comment", data: "" }); i = k + 2; continue; }
        // comment / comment end dash / comment end / comment end bang: ends at `-->` or `--!>` (or EOF)
        let end = -1;
        for (let p = k; p < n; p++) {
          if (s[p] === "-" && s[p + 1] === "-") {
            let q = p + 2;
            while (s[q] === "-") q++; // comment end: extra '-' appended
            if (s[q] === ">") { end = q + 1; break; }
            if (s[q] === "!" && s[q + 1] === ">") { end = q + 2; break; }
          }
        }
        toks.push({ t: "comment", data: s.slice(k, end < 0 ? n : end) });
        i = end < 0 ? n : end;
        continue;
      }
      if (s.slice(i + 2, i + 9).toLowerCase() === "doctype") {
        pushText();
        const gt = s.indexOf(">", i + 9);
        toks.push({ t: "doctype" });
        i = gt < 0 ? n : gt + 1;
        continue;
      }
      // [CDATA[ outside foreign content and anything else → bogus comment
      pushText();
      const gt = s.indexOf(">", i + 2);
      toks.push({ t: "comment", data: s.slice(i + 2, gt < 0 ? n : gt) });
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    if (c1 === "?") {
      pushText();
      const gt = s.indexOf(">", i + 1);
      toks.push({ t: "comment", data: s.slice(i + 1, gt < 0 ? n : gt) });
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    let closing = false;
    let k = i + 1;
    if (c1 === "/") {
      const c2 = s[i + 2];
      if (c2 === undefined) { text += "</"; i = n; continue; }
      if (c2 === ">") { i += 3; continue; } // missing end tag name: nothing
      if (!isAsciiAlpha(c2)) {
        pushText();
        const gt = s.indexOf(">", i + 2);
        toks.push({ t: "comment", data: s.slice(i + 2, gt < 0 ? n : gt) });
        i = gt < 0 ? n : gt + 1;
        continue;
      }
      closing = true;
      k = i + 2;
    } else if (c1 === undefined || !isAsciiAlpha(c1)) {
      text += "<";
      i++;
      continue;
    }
    // tag name
    let name = "";
    let state: string = "name";
    const attrs: { name: string; value: string }[] = [];
    let cur: { name: string; value: string; raw: boolean } | null = null;
    let selfClosing = false;
    let emitted = false;
    const startAttr = () => {
      cur = { name: "", value: "", raw: false };
      attrs.push(cur as any);
    };
    let p = k;
    for (; p < n && !emitted; p++) {
      let c = s[p]!;
      if (c === "\0") c = "�";
      switch (state) {
        case "name":
          if (WS(c)) state = "beforeAttrName";
          else if (c === "/") state = "selfClosing";
          else if (c === ">") emitted = true;
          else name += /[A-Z]/.test(c) ? c.toLowerCase() : c;
          break;
        case "beforeAttrName":
          if (WS(c)) break;
          if (c === "/" || c === ">") { state = "afterAttrName"; p--; break; }
          startAttr();
          if (c === "=") { cur!.name = "="; state = "attrName"; break; }
          state = "attrName";
          p--;
          break;
        case "attrName":
          if (WS(c) || c === "/" || c === ">") { state = "afterAttrName"; p--; break; }
          if (c === "=") { state = "beforeAttrValue"; break; }
          cur!.name += /[A-Z]/.test(c) ? c.toLowerCase() : c;
          break;
        case "afterAttrName":
          if (WS(c)) break;
          if (c === "/") { state = "selfClosing"; break; }
          if (c === "=") { state = "beforeAttrValue"; break; }
          if (c === ">") { emitted = true; break; }
          startAttr();
          state = "attrName";
          p--;
          break;
        case "beforeAttrValue":
          if (WS(c)) break;
          if (c === '"') { state = "dq"; break; }
          if (c === "'") { state = "sq"; break; }
          if (c === ">") { emitted = true; break; }
          state = "unq";
          p--;
          break;
        case "dq":
        case "sq": {
          const q = state === "dq" ? '"' : "'";
          if (c === q) { state = "afterQuoted"; break; }
          if (c === "&") {
            const [d, len] = charRef(s, p, true);
            cur!.value += d;
            p += len - 1;
            break;
          }
          cur!.value += c;
          break;
        }
        case "unq":
          if (WS(c)) { state = "beforeAttrName"; break; }
          if (c === "&") {
            const [d, len] = charRef(s, p, true);
            cur!.value += d;
            p += len - 1;
            break;
          }
          if (c === ">") { emitted = true; break; }
          cur!.value += c;
          break;
        case "afterQuoted":
          if (WS(c)) { state = "beforeAttrName"; break; }
          if (c === "/") { state = "selfClosing"; break; }
          if (c === ">") { emitted = true; break; }
          state = "beforeAttrName";
          p--;
          break;
        case "selfClosing":
          if (c === ">") { selfClosing = true; emitted = true; break; }
          state = "beforeAttrName";
          p--;
          break;
      }
    }
    if (!emitted) {
      // EOF in tag: the token is dropped (eof-in-tag); preceding text kept
      i = n;
      break;
    }
    pushText();
    // duplicate attributes: first wins
    const seen = new Set<string>();
    const dedup = attrs.filter((a) => (seen.has(a.name) ? false : (seen.add(a.name), true)));
    if (closing) toks.push({ t: "end", name });
    else {
      toks.push({ t: "start", name, attrs: dedup, selfClosing });
      if (SWITCH.has(name)) {
        i = p;
        return { toks, switched: name };
      }
    }
    i = p;
  }
  pushText();
  return { toks, switched: null };
}

/** browser URL parser, scheme part only (WHATWG URL §4.4 basic URL parser: trim C0/space, strip tab/LF/CR, scheme state) */
export function browserScheme(url: string): string | null {
  let u = url.replace(/^[\u0000- ]+|[\u0000- ]+$/g, "").replace(/[\t\n\r]/g, "");
  const m = /^([A-Za-z][A-Za-z0-9+\-.]*):/.exec(u);
  return m ? m[1]!.toLowerCase() : null;
}

export type JudgeMode = {
  key: string;
  tags: ReadonlySet<string>;
  /** attributes allowed per tag (others = violation) */
  attrs: Record<string, ReadonlySet<string>>;
  schemes: ReadonlySet<string>;
  /** attributes holding a URL */
  urlAttrs: ReadonlySet<string>;
  /** required attribute values (policy) */
  required?: Record<string, Record<string, string>>;
};

export type Violation = { cls: "XSS" | "POLICY"; what: string };

export function judge(out: string, mode: JudgeMode): Violation[] {
  const v: Violation[] = [];
  const { toks, switched } = tokenize(out);
  if (switched) v.push({ cls: "XSS", what: `state-switching start tag <${switched}>` });
  for (const t of toks) {
    if (t.t === "comment") v.push({ cls: "POLICY", what: `comment/bogus comment emitted: ${JSON.stringify(t.data.slice(0, 40))}` });
    else if (t.t === "doctype") v.push({ cls: "POLICY", what: "doctype emitted" });
    else if (t.t === "end") {
      if (!mode.tags.has(t.name)) v.push({ cls: "POLICY", what: `end tag not allowlisted </${t.name}>` });
    } else if (t.t === "start") {
      if (!mode.tags.has(t.name)) { v.push({ cls: "XSS", what: `element not allowlisted <${t.name}>` }); continue; }
      const allowed = mode.attrs[t.name] ?? new Set<string>();
      for (const a of t.attrs) {
        if (!allowed.has(a.name)) { v.push({ cls: "XSS", what: `attribute not allowlisted <${t.name} ${a.name}>` }); continue; }
        if (mode.urlAttrs.has(a.name)) {
          const sc = browserScheme(a.value);
          if (sc === null) v.push({ cls: "POLICY", what: `relative URL ${t.name}[${a.name}]=${JSON.stringify(a.value.slice(0, 40))}` });
          else if (!mode.schemes.has(sc)) v.push({ cls: "XSS", what: `URL scheme ${sc}: in ${t.name}[${a.name}]=${JSON.stringify(a.value.slice(0, 60))}` });
        }
      }
      const req = mode.required?.[t.name];
      if (req) for (const [k, val] of Object.entries(req)) {
        const a = t.attrs.find((x) => x.name === k);
        if (!a || a.value !== val) v.push({ cls: "POLICY", what: `<${t.name}> missing ${k}="${val}"` });
      }
    }
  }
  return v;
}
