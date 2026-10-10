// CRM C4.2-fix r2 ▸ N-6 probe — parentLinks() must only link parents of the CURRENT CRM system (a parent that lives in
//   another CRM system of the same shop would link to a 404 under this system's path) ◂
//   `--head-rule` evaluates the 91c230fa implementation (visibility.visibleIdsAmong across all systems of the tenant) —
//   the file was already edited when this probe was written, so RED is shown by emulating the old rule on the same data.
// Writes: throwaway tenant `qc-cui-n6-*` on QC1 only (swept). Run: bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cui/probe-n6-parent-system.mts [--head-rule]
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { fixture } = (await import("./_fx.mts" as string)) as Any;
const { chk, call, mkShop, setCrm, done } = await fixture("n6");
const HEAD = process.argv.includes("--head-rule");
try {
  const CRM = (await import("@/lib/modules/crm" as string)) as Any;
  const SRV = (await import("@/components/crm/objects/server" as string)) as Any;
  const sysSvc = (await import("@/lib/modules/system/service" as string)) as Any;
  const shop = await mkShop("a");
  const B = (await sysSvc.createSystem(shop.tid, "CRM", `CRM B ${Date.now()}`)).id as string;
  await setCrm(B, { uiVersion: 2 });
  const ctxA = shop.ctx;
  const ctxB = { ...shop.ctx, systemId: B };
  const coA = await call(() => CRM.companies.createCompany(ctxA, shop.owner, { name: `บริษัท A ${Date.now()}` }));
  const coB = await call(() => CRM.companies.createCompany(ctxB, shop.owner, { name: `บริษัท B ${Date.now()}` }));
  const idA = coA.ok ? String(coA.v?.company?.id ?? coA.v?.id) : "";
  const idB = coB.ok ? String(coB.v?.company?.id ?? coB.v?.id) : "";
  chk("N6.0", !!idA && !!idB, `fixture: one company in CRM A and one in CRM B of the same shop — A=${!!idA} B=${!!idB} ${coA.ok ? "" : String(coA.err?.message)} ${coB.ok ? "" : String(coB.err?.message)}`);
  const refs = [{ parentType: "COMPANY", parentId: idA }, { parentType: "COMPANY", parentId: idB }];
  const links: Map<string, string> = HEAD
    ? new Map([...(await CRM.visibility.visibleIdsAmong(shop.tid, shop.owner, "COMPANY", [idA, idB]))].map((id: string) => [`COMPANY:${id}`, `/app/sys/${ctxA.systemId}/crm/companies/${id}`]))
    : await SRV.parentLinks(ctxA, shop.owner, refs);
  const opensUnderA = async (id: string) => (await call(() => CRM.companies.getCompany360(ctxA, shop.owner, id))).ok;
  chk("N6.1", links.has(`COMPANY:${idA}`) && (await opensUnderA(idA)), `rule=${HEAD ? "HEAD" : "fixed"}: the parent in THIS system keeps its link (and opens)`);
  chk("N6.2", !links.has(`COMPANY:${idB}`), `rule=${HEAD ? "HEAD" : "fixed"}: the parent in ANOTHER CRM system of the shop gets no link under this system — linked=${links.has(`COMPANY:${idB}`)} opensUnderA=${await opensUnderA(idB)}`);
} catch (e) {
  chk("N6.FATAL", false, String((e as Error)?.stack ?? e).slice(0, 500));
}
await done("N-6 parent-system probe");
