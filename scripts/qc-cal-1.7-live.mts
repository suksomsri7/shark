// QC — CAL1.7 eval สดด้วยโมเดลจริง (สัญญา 32 §9 · เกณฑ์แผน: ≥ 20 ประโยคไทย ผ่าน ≥ 95%)
//   ยิง provider ของผลิตภัณฑ์ตรง (AnthropicProvider · routing `pickModel` เหมือน service) ด้วย system prompt ห้องเลขา (buildSystemPrompt + digest)
//   + เครื่องมือแกนกลาง + load_skill (เหมือนเทิร์นแรกของห้องจริง) — ไม่แตะฐาน ไม่รันเครื่องมือ (ตรวจ "การเลือก + อาร์กิวเมนต์")
//   load_skill รอบแรก = ป้อนผลแล้วถามต่ออีก 1 รอบ (เครื่องมือของสกิลโผล่ตามจริง) · เพดานเงิน CAL_LIVE_MAX_USD (ค่าเริ่ม 1.00)
// รัน: bash scripts/iso.sh bash scripts/qc-sec.sh bash scripts/with-gate-lock.sh env QC_FORCE=1 CAL_LIVE=1 pnpm exec tsx scripts/qc-cal-1.7-live.mts
//   ไม่ตั้ง CAL_LIVE=1 / ไม่มี SHARK_ANTHROPIC_KEY ⇒ SKIP exit 0
import { guard, type AnyMod } from "./qc-cal-lib.mjs";

const LABEL = "qc-cal-1.7-live";
guard(LABEL);
const KEY = (process.env.SHARK_ANTHROPIC_KEY ?? "").trim();
if (process.env.CAL_LIVE !== "1" || !KEY) {
  console.log(`⏭️  ${LABEL}: ${process.env.CAL_LIVE !== "1" ? "ไม่ได้ตั้ง CAL_LIVE=1" : "ไม่มี SHARK_ANTHROPIC_KEY"} — SKIP`);
  console.log("JSON_SUMMARY " + JSON.stringify({ total: 0, passed: 0, failed: [], skipped: ["live"] }));
  process.exit(0);
}
delete process.env.SHARK_AI_MODEL; // routing ของผลิตภัณฑ์เลือกเอง
const MAX_USD = Number(process.env.CAL_LIVE_MAX_USD ?? "1") || 1;

const provider = (await import("@/lib/ai/provider")) as AnyMod;
const persona = (await import("@/lib/ai/persona")) as AnyMod;
const skills = (await import("@/lib/ai/skills")) as AnyMod;
const tools = (await import("@/lib/ai/tools")) as AnyMod;
const pricing = (await import("@/lib/ai/pricing")) as AnyMod;
const evalM = (await import("@/lib/ai/eval")) as AnyMod;
const tc = (await import("@/lib/ai/tools-calendar")) as AnyMod;

const BKK = 7 * 3_600_000;
const now = new Date();
const local = (d: Date) => new Date(+d + BKK);
const todayLocal = local(now);
const dayNo = (d: Date) => Math.floor((+d + BKK) / 86_400_000);
const hm = (d: Date) => `${String(local(d).getUTCHours()).padStart(2, "0")}:${String(local(d).getUTCMinutes()).padStart(2, "0")}`;
const nextDow = (dow: number, allowToday: boolean) => {
  const add = (dow - todayLocal.getUTCDay() + 7) % 7;
  return dayNo(now) + (add === 0 && !allowToday ? 7 : add);
};

const systems = [
  { type: "CRM", name: "ลูกค้าสัมพันธ์" }, { type: "KANBAN", name: "บอร์ดงาน" }, { type: "ACCOUNT", name: "บัญชี" },
  { type: "HR", name: "พนักงาน" }, { type: "POS", name: "ขายหน้าร้าน" }, { type: "BOOKING", name: "จองคิว" },
];
const visible = skills.skillsForTenant(systems.map((s) => s.type));
const SYSTEM = [
  persona.buildSystemPrompt({ tenantName: "Siam Dive Center", systems, digest: `- ข้อมูล ณ ${hm(now)} น. (เวลาไทย)\n- นัดลูกค้าพรุ่งนี้ 3 นัด`, now }),
  skills.skillIndexPrompt(visible),
].join("\n\n");
const reg = tools.toolRegistry() as AnyMod[];
const defOf = (n: string) => reg.find((t) => t.def.name === n)?.def;
const coreDefs = [...skills.CORE_TOOLS].map(defOf).filter(Boolean);

let spentMicro = 0;
const rows: AnyMod[] = [];
const fmt = (n: number) => `$${(n / 1e6).toFixed(4)}`;

function checkAdd(args: AnyMod, want: AnyMod | undefined): string | null {
  if (!want) return null;
  const allDay = args.allDay === true;
  if (want.inMinutes !== undefined) {
    if (args.inMinutes === want.inMinutes) return null;
    const d = tc.parseWhenISO(args.whenISO, allDay);
    if (d && Math.abs(+d - (+now + want.inMinutes * 60_000)) <= 5 * 60_000) return null;
    return `inMinutes ${JSON.stringify(args.inMinutes)} whenISO ${args.whenISO}`;
  }
  const d = tc.startFromArgs(args, now);
  if (!d) return `whenISO รับไม่ได้: ${args.whenISO}`;
  if (want.kind && (args.kind ?? "REMINDER") !== want.kind) return `kind ${args.kind}`;
  const rep = args.repeat ?? "NONE";
  if (want.repeat && rep !== want.repeat) return `repeat ${rep}`;
  if (want.repeatDays) {
    const days = Array.isArray(args.repeatDays) && args.repeatDays.length ? args.repeatDays : [local(d).getUTCDay()];
    if (JSON.stringify([...days].sort()) !== JSON.stringify(want.repeatDays)) return `repeatDays ${JSON.stringify(args.repeatDays)}`;
  }
  if (want.monthDay && local(d).getUTCDate() !== want.monthDay) return `วันของเดือน ${local(d).getUTCDate()}`;
  if (want.day !== undefined) {
    const exp = want.day === "nextMonday" ? [nextDow(1, true), nextDow(1, false)] : want.day === "nextFriday" ? [nextDow(5, true)] : [dayNo(now) + want.day, ...(want.day === 0 ? [dayNo(now) + 1] : [])];
    if (!exp.includes(dayNo(d))) return `วัน ${local(d).toISOString().slice(0, 10)}`;
  }
  if (want.leadOrShift) {
    const ok = (hm(d) === want.time && args.leadMinutes === want.leadOrShift) || hm(new Date(+d + want.leadOrShift * 60_000)) === want.time;
    return ok ? null : `เวลา ${hm(d)} lead ${args.leadMinutes}`;
  }
  if (want.time && hm(d) !== want.time) return `เวลา ${hm(d)}`;
  if (want.endTime) {
    const e = tc.parseWhenISO(args.endISO, allDay);
    if (!e || hm(e) !== want.endTime) return `endISO ${args.endISO}`;
  }
  return null;
}

for (const c of evalM.CALENDAR_EVAL_CASES as AnyMod[]) {
  if (spentMicro > MAX_USD * 1e6) {
    rows.push({ prompt: c.prompt, ok: false, why: "เกินเพดานเงิน — ไม่ยิง" });
    continue;
  }
  const model = provider.pickModel(c.prompt, false);
  const p = new provider.AnthropicProvider(KEY, provider.toAnthropicModelId(model));
  const messages: AnyMod[] = [{ role: "system", content: SYSTEM }, { role: "user", content: c.prompt }];
  const loaded = new Set<string>();
  const calls: AnyMod[] = [];
  let text = "";
  const t0 = Date.now();
  try {
    for (let round = 0; round < 2; round++) {
      const offered = [...coreDefs, ...[...loaded].flatMap((id) => skills.toolNamesOfSkills([id]).map(defOf).filter(Boolean))];
      const remaining = visible.filter((s: AnyMod) => !loaded.has(s.id)).map((s: AnyMod) => s.id);
      const reply = await p.chat(messages, { tools: [...offered, skills.LOAD_SKILL_TOOL(remaining)], maxTokens: 700 });
      spentMicro += pricing.costMicroUsd(reply.model ?? model, reply.tokensIn, reply.tokensOut, { write: reply.cacheWrite ?? 0, read: reply.cacheRead ?? 0 });
      text += reply.text ?? "";
      const tcs = reply.toolCalls ?? [];
      calls.push(...tcs);
      const ls = tcs.find((x: AnyMod) => x.name === "load_skill");
      if (!ls || tcs.some((x: AnyMod) => x.name !== "load_skill")) break;
      const ids = (Array.isArray(ls.args?.skills) ? ls.args.skills : []).map(String).filter((id: string) => visible.some((s: AnyMod) => s.id === id));
      ids.forEach((id: string) => loaded.add(id));
      messages.push({ role: "assistant", content: reply.text ?? "", toolCalls: tcs });
      messages.push({ role: "tool", toolCallId: ls.id, content: `Loaded skills: ${ids.join(", ")}. These tools are available from now on: ${skills.toolNamesOfSkills(ids).join(", ")} — call them now.` });
    }
  } catch (e) {
    rows.push({ prompt: c.prompt, model, ok: false, why: `provider ล้ม: ${(e as Error).message.slice(0, 160)}` });
    continue;
  }
  const names = calls.map((x) => x.name);
  const add = calls.find((x) => x.name === "calendar_add");
  const verdict = (exp: string): string | null => {
    if (exp === "calendar_add") return add ? checkAdd(add.args ?? {}, c.want) : `ไม่เรียก calendar_add (${names.join(",") || "ไม่มีเครื่องมือ"}) ข้อความ: ${text.slice(0, 120)}`;
    if (exp === "none") {
      if (add) return "สร้างเตือนให้คนอื่น (ขัด M3)";
      return /การ์ด|บอร์ด/.test(text) || names.some((n) => n.startsWith("kanban_")) || calls.some((x) => x.name === "load_skill" && JSON.stringify(x.args).includes("tasks")) ? null : `ไม่เสนอการ์ดบอร์ด: ${text.slice(0, 80)}`;
    }
    if (exp === "clarify") return add ? "สร้างทั้งที่ข้อมูลไม่พอ" : names.includes("ask_clarify") || /\?|ไหม|กี่โมง|วันไหน|เวลาไหน|วันที่เท่าไหร่/.test(text) ? null : `ไม่ถามกลับ: ${text.slice(0, 80)}`;
    if (exp === "schedule_task") return names.includes("schedule_task") || calls.some((x) => x.name === "load_skill" && JSON.stringify(x.args).includes("automation")) ? (add ? "เรียก calendar_add ด้วย" : null) : `ได้ ${names.join(",") || "ไม่มีเครื่องมือ"}`;
    if (exp === "calendar_agenda") return names.includes("calendar_agenda") ? null : `ได้ ${names.join(",") || "ไม่มีเครื่องมือ"}`;
    return "ไม่รู้จัก";
  };
  let why = verdict(c.expect);
  if (why && c.alsoOk) for (const alt of c.alsoOk) if (!verdict(alt)) why = null;
  rows.push({ prompt: c.prompt, expect: c.expect, model, ms: Date.now() - t0, tools: names, args: add?.args, ok: !why, why });
  console.log(`  ${!why ? "✅" : "❌"} [${c.expect}] ${c.prompt} — ${model.replace("anthropic/", "")} · ${names.join(",") || "ข้อความ"}${add ? ` ${JSON.stringify(add.args)}` : ""}${why ? ` ⟶ ${why}` : ""}`);
}
const passed = rows.filter((r) => r.ok).length;
const rate = rows.length ? passed / rows.length : 0;
console.log(`\n${LABEL}: ${passed}/${rows.length} (${(rate * 100).toFixed(1)}%) · ใช้เงิน ${fmt(spentMicro)} · เวลาไทยตอนรัน ${todayLocal.toISOString().slice(0, 16)}`);
console.log("JSON_SUMMARY " + JSON.stringify({ total: rows.length, passed, rate, spentUsd: spentMicro / 1e6, failed: rows.filter((r) => !r.ok).map((r) => ({ p: r.prompt, why: r.why, model: r.model })) }));
process.exit(rate >= 0.95 ? 0 : 1);
