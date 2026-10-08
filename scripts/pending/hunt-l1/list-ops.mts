// hunt-l1 probe (read-only): dump CRM REST op table
import { CRM_OPS } from "../../../src/lib/modules/crm/api/registry";
for (const o of CRM_OPS) console.log([o.id, o.method, o.path, o.kind, o.action].join("\t"));
process.exit(0);
