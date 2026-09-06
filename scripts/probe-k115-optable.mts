const { KANBAN_OPS } = await import("@/lib/modules/kanban/api/registry");
for (const o of KANBAN_OPS) {
  console.log(`| \`${o.id}\` | ${o.method} | \`${o.path}\` | ${o.kind} | \`${o.action}\` | ${o.tool ? "`" + o.tool.name + "`" : "—"} |`);
}
