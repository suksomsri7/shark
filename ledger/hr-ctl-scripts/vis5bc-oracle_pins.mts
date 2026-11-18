const R = "/root/projects/shark-hr";
const L: any = await import(`${R}/scripts/qc-hr-vis-5-lib.mts`);
const Q: any = await import(`${R}/scripts/qc-hr-lib.mts`);
const P2: any = await import(`${R}/scripts/qc-hr-priv-2-lib.mts`);
const H = "src/lib/modules/hr/";
const list: [string,string][] = [["decideInboxAction",`${H}inbox-actions.ts`],["decideInbox",`${H}inbox.ts`],["teamOverviewWithPreview",`${H}inbox.ts`],["loadAttendanceBoard",`${H}judge.ts`],["lifecycleDue",`${H}lifecycle.ts`],["loadReport",`${H}reports.ts`],["reportAccessOf",`${H}reports.ts`],["meetsPattern",`${H}ai-rules.ts`],["hrNavFilter",`${H}nav.ts`],["hrTabs",`${H}ui.tsx`],["HrLaborCard",`${H}labor-ui.tsx`],["canRunKiosk",`${H}clock-settings.ts`],
["loadEmployeeProfileForViewer",`${H}privacy.ts`],["employeeProfileInputFromForm",`${H}privacy.ts`],["hrAccessOf",`${H}privacy.ts`],["saveEmployeeProfileAction",`${H}actions.ts`],["createEmployeeAction",`${H}actions.ts`],["updateEmployeeAction",`${H}actions.ts`],["setWorkScheduleAction",`${H}actions.ts`],["removeEmployeeAction",`${H}actions.ts`],["leaveBalances",`${H}leave.ts`],["cardSubjectOf",`${H}lifecycle.ts`],["employeeLineStatus",`${H}line-link.ts`],["loadLifecycleForViewer",`${H}lifecycle.ts`],["employeesOnLeave",`${H}service.ts`],["listEmployees",`${H}service.ts`],["listRemovedEmployees",`${H}service.ts`]];
for (const [n,f] of list) { const b = P2.bodyOf(Q.stripComments(Q.rd(f)), n); console.log(n, L.sha16(b), b.length); }
