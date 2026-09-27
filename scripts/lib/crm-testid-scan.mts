// ═══════════════════════════════════════════════════════════════
// crm-testid-scan — the ONE definition of "interactive data-testid" for the CRM UI registry
//   (scripts/crm-ui-inventory.json · CRM-MASTER-PLAN §7 · gate D8)
//
//   Owner of the rule = fitness F14.1 (scripts/fitness.mts). These pieces were lifted out of F14 verbatim
//   (sweep 27 Sep, after C4.1 made the registry "pressable controls only") so that the older work-order
//   oracles (scripts/qc-crm-c*.mts) judge "does this testid need a registry row?" exactly the way F14 does,
//   instead of each carrying its own guess.
//
//   🔴 PURE: no env · no prisma · no "@/…" import · no fs — fitness imports this in pre-commit without any env.
// ═══════════════════════════════════════════════════════════════

// ── ค่า data-testid ที่ "กดได้/กรอกได้" เท่านั้นที่ต้องลงทะเบียน (กล่องโครง/ป้ายไม่ต้อง) ──
export const INTERACTIVE_TAGS = new Set(["button", "a", "input", "select", "textarea", "form", "summary", "option", "dialog"]);
// ชื่อคอมโพเนนต์ที่ "โดยธรรมชาติแล้วกดได้" — ตรวจทั้งชื่อเต็มและชื่อท้ายจุด (`Dialog.Trigger` → `Trigger`)
export const INTERACTIVE_COMPONENT = /(Button|Btn|Link|Input|Textarea|Select|Form|Toggle|Switch|Checkbox|Radio|Tab|Tabs|Menu|Dropdown|Upload|Picker|Slider|Search|Combobox|Modal|Sheet|Drawer|Trigger|Item|Option|Action|Close|Cancel|Submit|Save)$/;
// prop ที่แปลว่า "มีคนกด/พิมพ์ใส่ได้" — รวมสไตล์ headless UI (onSelect/onValueChange/onOpenChange/onPress)
export const INTERACTIVE_ATTR = /\bon(Click|Change|Input|Submit|KeyDown|KeyUp|KeyPress|Drag\w*|Drop|Toggle|Select|ValueChange|CheckedChange|OpenChange|Press|PointerDown|MouseDown)\s*=|\bhref\s*=|\baction\s*=|\brole\s*=\s*\{?["']?(button|tab|link|menuitem|switch|checkbox|option)\b|\btabIndex\s*=|\bdraggable\s*=|\bcontentEditable\s*=/;
// ค่าที่ "อ่านออก": "…" · '…' · {`…`} · {"…"} · {'…'}
export const TESTID_RE = /data-testid\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*`([^`]*)`\s*\}|\{\s*"([^"]*)"\s*\}|\{\s*'([^']*)'\s*\})/g;
// ทุกจุดที่เขียน data-testid (ใช้หาตัวที่ TESTID_RE อ่านไม่ออก เช่น `data-testid={someVar}` — ห้ามเงียบ)
export const ANY_TESTID_RE = /data-testid\s*=/g;

/** ชื่อที่สร้างจากตัวแปร (`deal-card-${id}`) → แพตเทิร์น `deal-card-*` (ทะเบียนลงแถวเดียวคลุมทั้งชุดได้) */
export const normId = (v: string) => v.replace(/\$\{[^}]*\}/g, "*").replace(/\*+/g, "*").trim();
export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** `foo-*` → /^foo-.*$/ (ใช้จับคู่ "แพตเทิร์น ↔ ชื่อจริง" ทั้งสองทาง) */
export const globRe = (g: string) => new RegExp("^" + g.split("*").map(escapeRe).join(".*") + "$");

/** แท็กที่ห่อ data-testid ตัวนี้ + ข้อความ attribute ทั้งก้อน (ข้ามวงเล็บปีกกา/สตริงถูกต้อง) */
export function tagAround(src: string, at: number): { tag: string; attrs: string } {
  let open = -1;
  for (let i = at; i >= 0; i--) if (src[i] === "<" && /[A-Za-z]/.test(src[i + 1] ?? "")) { open = i; break; }
  if (open < 0) return { tag: "", attrs: "" };
  const tag = (/^<([A-Za-z][\w.]*)/.exec(src.slice(open, open + 80)) ?? [, ""])[1] as string;
  let depth = 0, quote = "", end = src.length;
  for (let i = open; i < src.length; i++) {
    const c = src[i]!;
    if (quote) { if (c === quote && src[i - 1] !== "\\") quote = ""; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth <= 0) { end = i; break; }
  }
  return { tag, attrs: src.slice(open, end) };
}
export const isInteractive = (tag: string, attrs: string) =>
  INTERACTIVE_TAGS.has(tag) ||
  INTERACTIVE_TAGS.has(tag.split(".").pop() ?? "") ||          // `Dialog.Trigger` → ดูชื่อท้ายจุดด้วย
  INTERACTIVE_COMPONENT.test(tag) ||
  INTERACTIVE_COMPONENT.test(tag.split(".").pop() ?? "") ||
  INTERACTIVE_ATTR.test(attrs);
export const lineOf = (src: string, at: number) => src.slice(0, at).split("\n").length;

// ── helpers for the work-order oracles (not used by fitness itself) ──

export type TestidHit = { id: string; raw: string; at: number; tag: string; interactive: boolean };

/** Every READABLE data-testid in `src` (F14's TESTID_RE), normalised like F14 (`x-${id}` → `x-*`), with F14's verdict. */
export function scanTestids(src: string): TestidHit[] {
  const out: TestidHit[] = [];
  for (const m of src.matchAll(TESTID_RE)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5] ?? "";
    const { tag, attrs } = tagAround(src, m.index ?? 0);
    out.push({ id: normId(raw), raw, at: m.index ?? 0, tag, interactive: isInteractive(tag, attrs) });
  }
  return out;
}

/** Normalised testids of `src` that sit on at least one interactive element (= what F14.1 demands a registry row for). */
export function interactiveTestidsIn(src: string): Set<string> {
  return new Set(scanTestids(src).filter((h) => h.interactive).map((h) => h.id));
}

/**
 * How the registry policy treats testid `id` in `src`. Occurrences whose normalised id EQUALS `id` decide; only when there are
 * none is `id` used as a glob (`crm-link-row-*`, or a prefix form like `x-*` for `x-${a}-y`) — otherwise the `<li>` wrapper
 * `crm-seq-step-${key}` (= `crm-seq-step-*`) would be judged by its buttons `crm-seq-step-up-${key}` …:
 *   "interactive" — at least one occurrence is on an interactive element ⇒ needs a registry row (F14.1)
 *   "static"      — it occurs, but only on non-interactive elements (wrapper · message · table · audio …) ⇒ no row; it EXISTS
 *   "absent"      — no readable data-testid occurrence at all ⇒ callers must stay strict (treat as needing a row)
 */
export function testidKind(id: string, src: string): "interactive" | "static" | "absent" {
  const all = scanTestids(src);
  const exact = all.filter((h) => h.id === id);
  const re = globRe(id);
  const hits = exact.length ? exact : all.filter((h) => re.test(h.id));
  if (!hits.length) return "absent";
  return hits.some((h) => h.interactive) ? "interactive" : "static";
}

/** true unless the testid is present in `src` and provably NOT interactive (absent ⇒ true = strict). */
export const needsRegistryRow = (id: string, src: string) => testidKind(id, src) !== "static";
