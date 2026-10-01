// C5.5 hunt — dump the CRM op registry (no DB writes)
/* eslint-disable @typescript-eslint/no-explicit-any */
const reg = (await import("@/lib/modules/crm/api/registry" as string)) as any;
const ops: any[] = reg.CRM_OPS ?? reg.crmOps ?? reg.OPS ?? Object.values(reg).find((v: any) => Array.isArray(v));
for (const o of ops) console.log([o.id, o.method, o.path, o.kind, o.action, o.danger ? "danger" : "", o.tool?.name ?? ""].join("\t"));
process.exit(0);
