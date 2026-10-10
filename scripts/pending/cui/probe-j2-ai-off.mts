// CRM C4.4-fix2 ▸ J2 probe — the "AI off" message of the call panel must not send staff to a settings section that does
//   not exist, must stay calm Thai and must not blame the user (pure: reads the constant + the CRM settings pages) ◂
// Run: pnpm exec tsx scripts/pending/cui/probe-j2-ai-off.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readdirSync, readFileSync, statSync } from "node:fs";
const S = (await import("@/lib/modules/crm/calls-shared" as string)) as any;
const msg = String(S.CRM_CALL_AI_OFF_MSG ?? "");
let pass = 0;
let fail = 0;
const chk = (id: string, ok: boolean, m: string) => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${id} ${m}`); };
// every settings page under /crm/settings — does any of them have an "ผู้ช่วย AI" section with the call-transcribe switch?
const root = "src/app/app/sys/[id]/crm/settings";
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = `${d}/${n}`; return statSync(p).isDirectory() ? walk(p) : [p]; });
const pages = walk(root).filter((p) => /\.(tsx|ts)$/.test(p));
const hasAiSection = pages.some((p) => /callTranscribe|setCrmAiKey/.test(readFileSync(p, "utf8")));
const pointsToSettings = /ตั้งค่า\s*CRM\s*→|ตั้งค่า.*ผู้ช่วย AI|เปิดได้ที่/.test(msg);
chk("J2.1", !pointsToSettings || hasAiSection, `message does not point to a settings section that does not exist — msg=${JSON.stringify(msg)} · AI section in ${pages.length} settings files=${hasAiSection}`);
chk("J2.2", msg.length > 0 && /[฀-๿]/.test(msg), "message is Thai and non-empty");
chk("J2.3", !/คุณ(ยัง)?(ไม่|ผิด|ลืม)|ผิดพลาดของคุณ/.test(msg), "message does not blame the user");
chk("J2.4", /บันทึกสาย|ฟังไฟล์เสียง|ไฟล์เสียง/.test(msg), "message tells staff what still works (log the call · keep the recording)");
console.log(`\nJ2 probe: ${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
