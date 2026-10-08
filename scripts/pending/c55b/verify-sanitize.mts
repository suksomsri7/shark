// controller: verify C5.5 hunt-2a findings 2a-3 / 2a-9 / 2a-4 (pure functions, no DB)
import { sanitizeHtml } from "../../../src/lib/core/sanitize";
import * as ks from "../../../src/lib/modules/kanban/sanitize";
const cases = ['<details/open/ontoggle=alert(1)>x</details>', '<svg/onload=alert(1)>', '<img/src=x/onerror=alert(1)>', '<img src=x onerror=alert(1)>', '<a/href="javascript:alert(1)">x</a>'];
for (const c of cases) console.log("core  ", JSON.stringify(c), "=>", JSON.stringify(sanitizeHtml(c)));
const kfn = Object.entries(ks).filter(([, v]) => typeof v === "function");
for (const [n, f] of kfn) for (const c of cases) { try { console.log("kanban", n, JSON.stringify(c), "=>", JSON.stringify((f as (s: string) => unknown)(c))); } catch (e) { console.log("kanban", n, "threw", String(e).slice(0, 60)); } }
for (const n of [200, 400, 800, 1600]) { const s = "<a" + " ".repeat(n) + "x"; const t = Date.now(); sanitizeHtml(s); console.log("redos spaces", n, Date.now() - t, "ms"); }
for (const n of [200, 400, 800]) { const s = "<style>".repeat(n); const t = Date.now(); sanitizeHtml(s); console.log("redos style-openers", n, Date.now() - t, "ms"); }
