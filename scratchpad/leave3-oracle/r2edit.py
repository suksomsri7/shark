p='scripts/qc-hr-leave-3.mts'
s=open(p,encoding='utf8').read()
def rep(a,b):
    global s
    assert a in s, a[:80]
    s=s.replace(a,b)
rep('R2.5|R2|C|R|OWNER both steps ⇒ APPROVED · 1 owner_override audit · effect once','R2.5|R2|C|R|OWNER both steps (no step) ⇒ APPROVED · 1 audit approval.owner_override targetId=request after {step 2, previousDeciderStep 1} · effect once')
rep('R2.6|R2|C|R|stale expectedStep: direct lost · bulk step:<id> lost text · decideAction bad step text · nothing written',
 'R2.6|R2|C|R|stale step: direct lost · bulkDecide steps map lost · bulk action step:<id> lost text · decideAction field step bad ⇒ text · nothing written\nR2.15|R2|C|R|OWNER double click through the actions (decideAction step · bulkDecideAction step:<id>) ⇒ one step each')
rep('''R3.1|R3|C|R|steps edit with 1 pending ⇒ text "1" · name + steps byte-same · request still decidable
R3.2|R3|M|G|name edit, identical steps, with pending ⇒ allowed''','''R3.1|R3|C|R|step edit stranding a pending request (step 2 → steps [1]) ⇒ text "1" · policy byte-same · request still decidable
R3.2|R3|M|G|non-stranding edits with pending (rename · role change of current step · add a step) ⇒ allowed · decidable under new definition''')
rep('R3.6|R3|M|R|count = this policy only (2 here, 1 elsewhere ⇒ "2")','R3.6|R3|M|R|count = this policy only (2 stranded here, 1 elsewhere ⇒ "2")\nR3.7|R3|M|R|renumber [1,2]→[1,3] with a request at step 2 ⇒ refused "1" · unchanged')
i=s.index('const overrideRows = ')
j=s.index('\n',i)
s=s[:i]+'''const overrideRows = (id: string) => rows(`SELECT after, "targetId" AS t FROM "AuditLog" WHERE "tenantId" = $1 AND action = 'approval.owner_override' AND "targetId" = $2`, TT, id);'''+s[j:]
rep('''   const j = { ...(ov[0]?.before ?? {}), ...(ov[0]?.after ?? {}) } as Any;''','''   const j = (ov[0]?.after ?? {}) as Any;''')
rep('''audit: ov.length === 1 && (j.requestId ?? ov[0]?.t) === f.reqId && Number(j.stepOrder) === 2 && JSON.stringify(j.earlierSteps ?? null).includes("1"),''','''audit: ov.length === 1 && j.step === 2 && j.previousDeciderStep === 1,''')
rep('audN("approval.decide.owner_override"','audN("approval.owner_override"')
rep('''   const b = await callAct(U.mgr2, act("bulkDecideAction"), { requestIds: [g.reqId], decision: "APPROVED", [`step:${g.reqId}`]: "1" });
   const nbk = await nothing(g, 2, 1);''','''   const b = await callAct(U.mgr2, act("bulkDecideAction"), { requestIds: [g.reqId], decision: "APPROVED", [`step:${g.reqId}`]: "1" });
   const nbk = await nothing(g, 2, 1);
   const k = await file(w);
   await decide("mgr", k.reqId);
   const m = await safe(() => AP_.bulkDecide(V.mgr2, ctxA, [k.reqId], "APPROVED", null, { [k.reqId]: 1 }));
   const nm = m.done === 0 && (m.failed ?? [])[0]?.reason === T.lost && (await nothing(k, 2, 1));''')
rep('''{ requestId: h.reqId, decision: "APPROVED", step: "x", [`step:${h.reqId}`]: "x" }''','''{ requestId: h.reqId, decision: "APPROVED", step: "x" }''')
rep('''direct: res3(d) === LOST && nd, bulk:''','''direct: res3(d) === LOST && nd, map: nm, bulk:''')
rep('''  { // 2.7 under held row lock (GREEN)''','''  { // 2.15 OWNER double click through the web actions (step always sent)
   const w = await world("R2.15", MO);
   const f = await file(w), g = await file(w);
   const a1 = await callAct(U.owner, act("decideAction"), { requestId: f.reqId, decision: "APPROVED", step: "1" });
   const a2 = await callAct(U.owner, act("decideAction"), { requestId: f.reqId, decision: "APPROVED", step: "1" });
   const bf = { requestIds: [g.reqId], decision: "APPROVED", [`step:${g.reqId}`]: "1" };
   const b1 = await callAct(U.owner, act("bulkDecideAction"), bf), b2 = await callAct(U.owner, act("bulkDecideAction"), bf);
   ck("R2.15", { page: a1.value?.ok === true && a2.value?.ok === false && (await nothing(f, 2, 1)), bulk: b1.value?.done === 1 && b2.value?.done === 0 && (await nothing(g, 2, 1)) }, "one step each", `page=${a1.text.slice(0, 30)}/${a2.text.slice(0, 50)} bulk=${b1.value?.done}/${b2.value?.done}`);
  }
  { // 2.7 under held row lock (GREEN)''')
i=s.index('''  {
   const w = await world("R3.1", MO);''')
j=s.index('''  {
   const w = await world("R3.5", MO);''')
s=s[:i]+'''  {
   const w = await world("R3.1", MO);
   const f = await file(w);
   await decide("mgr", f.reqId);
   const before = await pol(w.apId);
   const r = await upd(w, { name: "สาย R3.1 แก้", steps: [{ order: 1, approverRole: "OWNER" }] });
   const after = await pol(w.apId);
   const d = await decide("owner", f.reqId);
   ck("R3.1", { text: r === T.edit(1), same: before === after, decidable: d.ok === true && d.status === "APPROVED" }, "text 1 · unchanged · decidable", `r=${r.slice(0, 80)} same=${before === after} d=${res3(d).slice(0, 60)}`);
  }
  {
   const w = await world("R3.2", MO);
   const f = await file(w), g = await file(w);
   await decide("mgr", f.reqId); // f at step 2 · g at step 1
   const r1 = await upd(w, { name: "สาย R3.2 ชื่อใหม่", steps: MO });
   const r2 = await upd(w, { name: "สาย R3.2 ชื่อใหม่", steps: MM }); // role change of f's current step
   const d = await decide("mgr2", f.reqId);
   const r3 = await upd(w, { name: "สาย R3.2 ชื่อใหม่", steps: [...MM, { order: 3, approverRole: "OWNER" }] }); // add a step
   const g1 = await decide("mgr", g.reqId);
   const p = await pol(w.apId);
   ck("R3.2", { rename: r1 === "ok", role: r2 === "ok" && d.ok === true && d.status === "APPROVED", add: r3 === "ok" && g1.ok === true && (await reqRow(g.reqId)).o === 2, steps: p.includes("สาย R3.2 ชื่อใหม่") && p.includes('[3,"OWNER",null]') }, "allowed · decidable", `${r1.slice(0, 40)}|${r2.slice(0, 40)}|${r3.slice(0, 40)} d=${res3(d).slice(0, 50)}`);
   const r4 = await upd(w, { name: "สาย R3.2 ชื่อใหม่", steps: [...MM, { order: 3, approverRole: "OWNER" }].reverse() });
   ck("R3.4", { ok: r4 === "ok", same: (await pol(w.apId)) === p }, "allowed", r4.slice(0, 80));
  }
  {
   const w = await world("R3.7", MO);
   const f = await file(w);
   await decide("mgr", f.reqId);
   const before = await pol(w.apId);
   const r = await upd(w, { name: "สาย R3.7", steps: [{ order: 1, approverRole: "MANAGER" }, { order: 3, approverRole: "OWNER" }] });
   ck("R3.7", { text: r === T.edit(1), same: (await pol(w.apId)) === before, pending: (await reqRow(f.reqId)).o === 2 }, "refused · unchanged", r.slice(0, 90));
  }
'''+s[j:]
rep('''   await file(w); await file(w); await file(x);
   const r = await upd(w, { name: "สาย R3.6", steps: MM });''','''   for (const v of [w, w, x]) await decide("mgr", (await file(v)).reqId); // all at step 2
   const r = await upd(w, { name: "สาย R3.6", steps: [{ order: 1, approverRole: "MANAGER" }] });''')
open(p,'w',encoding='utf8').write(s)
