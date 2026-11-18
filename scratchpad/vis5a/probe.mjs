import Module from "node:module";
const orig = Module._load;
let hits = 0;
Module._load = function (req, parent, isMain) { if (req === "next-intl/server") { hits++; return { getTranslations: async (ns) => (k) => `${ns}.${k}`, getLocale: async () => "th" }; } return orig.apply(this, arguments); };
const m = await import("@/lib/modules/hr/payroll-run-ui");
console.log("loaded", Object.keys(m), "hits", hits);
const r = await import("@/lib/modules/hr/reports-ui");
console.log("reports", Object.keys(r), "hits", hits);
