// alias check (run only via the lane wrapper)
import { qc4Env } from "/root/projects/shark-hr-l5/scripts/qc-hr-lib.mjs";
await qc4Env("h52p-t0");
const m = (await import("@/lib/modules/hr/scope").catch((e) => ({ err: String(e).slice(0, 200) }))) as Record<string, unknown>;
console.log("alias:", Object.keys(m).slice(0, 4).join(","));
process.exit(0);
