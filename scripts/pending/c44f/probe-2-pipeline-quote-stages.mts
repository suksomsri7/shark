// C4.4-fix item 2 (US3): a shop sets "move the deal to stage X when its quotation is accepted / rejected" per pipeline
//   (CrmPipeline.stageOnQuoteAcceptedId / stageOnQuoteRejectedId) — service + DTO + permission + same-pipeline/tenant guard
// Run: bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/c44f/probe-2-pipeline-quote-stages.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const { fixture } = (await import("./_fx.mts" as string)) as Any;

const { P, chk, call, mkShop, mkUser, done } = await fixture("pl");
try {
  const PL = (await import("@/lib/modules/crm/pipelines" as string)) as Any;
  const a = await mkShop("a");
  const b = await mkShop("b");
  // a second pipeline in shop A
  const p2 = await P.crmPipeline.create({ data: { tenantId: a.tid, systemId: a.S, name: "สอง", stages: { create: [{ tenantId: a.tid, systemId: a.S, sortOrder: 0, name: "x", kind: "OPEN", probability: 10 }] } }, include: { stages: true } });
  const won = a.stages.find((s: Any) => s.kind === "WON");
  const lost = a.stages.find((s: Any) => s.kind === "LOST");
  const row = () => P.crmPipeline.findFirst({ where: { id: a.pipe.id }, select: { stageOnQuoteAcceptedId: true, stageOnQuoteRejectedId: true } });

  const r1 = await call(() => PL.updatePipeline(a.ctx, a.owner, a.pipe.id, { stageOnQuoteAcceptedId: won.id, stageOnQuoteRejectedId: lost.id }));
  const v1 = await row();
  chk("2.1", r1.ok && v1?.stageOnQuoteAcceptedId === won.id && v1?.stageOnQuoteRejectedId === lost.id, `owner sets accept→WON · reject→LOST — got ok=${r1.ok} ${r1.ok ? "" : r1.err?.message} ${JSON.stringify(v1)}`);

  const list = await PL.listPipelines(a.ctx, a.owner, { includeArchived: true });
  const dto = list.find((p: Any) => p.id === a.pipe.id);
  chk("2.2", dto?.stageOnQuoteAcceptedId === won.id && dto?.stageOnQuoteRejectedId === lost.id, `listPipelines DTO carries both ids (the settings page reads them) — got ${JSON.stringify({ a: dto?.stageOnQuoteAcceptedId, r: dto?.stageOnQuoteRejectedId })}`);

  const r3 = await call(() => PL.updatePipeline(a.ctx, a.owner, a.pipe.id, { stageOnQuoteAcceptedId: p2.stages[0].id }));
  const r3b = await call(() => PL.updatePipeline(a.ctx, a.owner, a.pipe.id, { stageOnQuoteRejectedId: b.stages[0].id }));
  const r3c = await call(() => PL.updatePipeline(a.ctx, a.owner, a.pipe.id, { stageOnQuoteAcceptedId: "nope" }));
  const v3 = await row();
  chk("2.3", !r3.ok && r3.err?.code === "VALIDATION" && !r3b.ok && r3b.err?.code === "VALIDATION" && !r3c.ok && /[ก-๙]/.test(String(r3.err?.message)) && v3?.stageOnQuoteAcceptedId === won.id && v3?.stageOnQuoteRejectedId === lost.id,
    `a stage of ANOTHER pipeline / ANOTHER shop / unknown id ⇒ VALIDATION (Thai) and nothing changes — got ${[r3, r3b, r3c].map((r) => (r.ok ? "ok" : `${r.err?.code}:${r.err?.message}`)).join(" | ")} row=${JSON.stringify(v3)}`);

  const r4 = await call(() => PL.updatePipeline(a.ctx, a.owner, a.pipe.id, { stageOnQuoteAcceptedId: null }));
  const v4 = await row();
  chk("2.4", r4.ok && v4?.stageOnQuoteAcceptedId === null && v4?.stageOnQuoteRejectedId === lost.id, `null = "ไม่ย้าย" clears only that one — got ${JSON.stringify(v4)}`);

  const r4b = await call(() => PL.updatePipeline(a.ctx, a.owner, a.pipe.id, { name: "ชื่อใหม่" }));
  const v4b = await row();
  chk("2.5", r4b.ok && v4b?.stageOnQuoteRejectedId === lost.id, `a rename (fields omitted) leaves both pointers alone — got ${JSON.stringify(v4b)}`);

  // permission: a MANAGER (no crm.settings.manage by default) cannot
  const mid = await mkUser("-mgr");
  await P.membership.create({ data: { userId: mid, tenantId: a.tid, role: "MANAGER", unitAccess: ["*"], permissions: {}, acceptedAt: new Date() } });
  const mgr = { userId: mid, role: "MANAGER", unitAccess: ["*"], permissions: {} };
  const r5 = await call(() => PL.updatePipeline({ ...a.ctx, actorUserId: mid }, mgr, a.pipe.id, { stageOnQuoteAcceptedId: won.id }));
  const v5 = await row();
  chk("2.6", !r5.ok && r5.err?.code === "FORBIDDEN" && v5?.stageOnQuoteAcceptedId === null, `MANAGER without crm.settings.manage ⇒ FORBIDDEN, nothing written — got ${r5.ok ? "ok" : `${r5.err?.code}`} row=${JSON.stringify(v5)}`);

  // cross-shop ctx cannot touch shop A's pipeline
  const r6 = await call(() => PL.updatePipeline(b.ctx, b.owner, a.pipe.id, { stageOnQuoteAcceptedId: won.id }));
  chk("2.7", !r6.ok && r6.err?.code === "NOT_FOUND", `shop B's owner on shop A's pipeline ⇒ NOT_FOUND — got ${r6.ok ? "ok" : r6.err?.code}`);

  // audit row carries before/after of the pointers
  const au = await P.auditLog.findFirst({ where: { tenantId: a.tid, action: "crm.pipeline.update", targetId: a.pipe.id }, orderBy: { createdAt: "asc" }, select: { after: true } });
  chk("2.8", JSON.stringify(au?.after ?? {}).includes(won.id), `audit crm.pipeline.update records the new accept stage — got ${JSON.stringify(au?.after)}`);

  // the stage delete path still clears the pointer (pre-existing behaviour, regression guard)
  await PL.updatePipeline(a.ctx, a.owner, a.pipe.id, { stageOnQuoteAcceptedId: a.stages[2].id });
  const del = await call(() => PL.deleteStage(a.ctx, a.owner, a.stages[2].id));
  const v7 = await row();
  chk("2.9", del.ok && v7?.stageOnQuoteAcceptedId === null, `deleting the pointed stage clears the pointer — got del=${del.ok ? "ok" : del.err?.message} ${JSON.stringify(v7)}`);
} catch (e) {
  chk("FATAL", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
} finally {
  await done("probe-2-pipeline-quote-stages");
}
