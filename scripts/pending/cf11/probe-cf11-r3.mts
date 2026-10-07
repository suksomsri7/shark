// probe — CRM C5.5-fix8 round 3 (review round 2 · RV-6 + controller ruling: inbound buckets split by strength of evidence)
//   classes: V = DMARC proof AND thread proof · D = DMARC only · T = thread only · U = neither — every mail in exactly one class,
//   dropped only by its own class's buckets; per-sender key = lower-cased mailbox with `+tag` stripped (bucket key only)
//   A  reviewer R2A.1: one attacker mailbox on its own DMARC domain, 20 plus-variants × 100 ⇒ the customer's V reply AND a T reply are stored
//   B  reviewer R2B.1: plus-variants / case variants of one mailbox share one sender bucket
//   C  D per-domain bucket 300/h (non-free-mail domain) · free-mail domains have none
//   E  T per-referenced-Message-ID bucket 100/h shared by every From citing it · a V reply to the same id is stored
//   F  class exclusivity: one mail touches only its own class's keys · full D/T/U system buckets never drop V · full V never drops D/T/U
//   G  H3-1 still fixed (forged unproven flood in the customer's name) · unproven flood still limited (U unchanged)
//   H  owner notices ≤ 1 per hour per system per class (and the U system notice unchanged)
//   I  P14 unset (CRM_INBOUND_AUTHSERV_ID absent) ⇒ only T and U exist
// QC3 ONLY · throwaway tenant `qc-cf11-r3-*` · network blocked · rate buckets of the throwaway system removed
// Run: bash scripts/iso.sh env CRM_V2_SWITCH=all NODE_OPTIONS=--max-old-space-size=3584 bash scripts/pending/cd2/with-qc3-secret.sh \
//        bash scripts/qc3.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/pending/cf11/probe-cf11-r3.mts
/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
import { createHash, randomBytes } from "node:crypto";
const { ctx } = (await import("./_ctx.mts" as string)) as { ctx: (l: string) => Promise<Any> };
const X = await ctx("r3");
const { P, TAG, chk, j, sysSvc, setCrm, mkUser, member, mkTenant, sub, done } = X;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const rand = TAG.slice(-8);
const AUTHSERV = "mx.qc-cf11r3.test";
const OLD_AUTHSERV = process.env.CRM_INBOUND_AUTHSERV_ID;

const tid = await mkTenant("a");
const uid = await mkUser("-owner");
await member(uid, tid, "OWNER");
const S = (await sysSvc.createSystem(tid, "CRM", `CRM ${TAG}`)).id as string;
const KEY = Array.from(randomBytes(8)).map((b) => "abcdefghijklmnopqrstuvwxyz234567"[b % 32]).join("");
await setCrm(S, { uiVersion: 2, email: { inboundEnabled: true, inboundKey: KEY, strangerToLead: false, bccCaptureEnabled: true, copyMode: "NONE", copyToAddr: null } });
const cDom = `bigclient-${rand}.test`;
const vParty = await P.party.create({ data: { tenantId: tid, name: `ลูกค้า ${TAG}`, kind: "PERSON" } });
const V = await P.crmContact.create({ data: { tenantId: tid, systemId: S, name: `ลูกค้า ${TAG}`, firstName: "ลูกค้า", partyId: vParty.id, ownerUserId: uid, email: `buyer@${cDom}` } });
const outRow = (rfc: string, to: string[], cc: string[] = []) =>
  P.crmEmailMessage.create({
    data: { tenantId: tid, systemId: S, direction: "OUT", messageId: `${S}:${rfc}`, threadKey: randomBytes(16).toString("hex"), fromAddr: `sales@${rand}.test`, toAddrs: to, ccAddrs: cc, subject: `ใบเสนอราคา ${TAG}`, status: "SENT", sentAt: new Date(Date.now() - 3_600_000), trackTokenHash: randomBytes(16).toString("hex") },
  });
const pv = `${TAG}-parent@shark.test`;
await outRow(pv, [V.email]);
const EM = (await import("@/lib/modules/crm/emails" as string)) as Any;
const deps = { transport: async () => ({ ok: true, id: "copy" }) };
let n = 0;
const ingest = async (from: string, subject: string, o: { dmarc?: boolean; authserv?: boolean; replyTo?: string } = {}) => {
  const d = from.replace(/^.*@/, "").toLowerCase();
  const headers: Record<string, string> = {
    ...(o.dmarc ? { "authentication-results": `${AUTHSERV}; spf=pass smtp.mailfrom=${d}; dkim=pass header.d=${d}; dmarc=pass header.from=${d}` } : {}),
    ...(o.replyTo ? { "in-reply-to": `<${o.replyTo}>` } : {}),
  };
  if (o.authserv ?? true) process.env.CRM_INBOUND_AUTHSERV_ID = AUTHSERV;
  else delete process.env.CRM_INBOUND_AUTHSERV_ID;
  try {
    return await EM.ingestInbound({ messageId: `<${TAG}-${++n}@probe.test>`, from, to: [`crm+${KEY}@shark.in.th`], cc: [], subject, text: "สวัสดีค่ะ", html: "<p>x</p>", headers, attachments: [] }, deps);
  } finally {
    if (OLD_AUTHSERV === undefined) delete process.env.CRM_INBOUND_AUTHSERV_ID;
    else process.env.CRM_INBOUND_AUTHSERV_ID = OLD_AUTHSERV;
  }
};
const norm = (a: string) => { const x = a.toLowerCase(); const [l, d] = [x.slice(0, x.lastIndexOf("@")), x.slice(x.lastIndexOf("@"))]; return `${l.split("+")[0]}${d}`; };
const K = {
  uSender: (a: string) => `crm.email.in.from.${S}.${sha(`from:${norm(a)}`).slice(0, 32)}`,
  sender: (c: string, a: string) => `crm.email.in.from.${c}.${S}.${sha(`from:${norm(a)}`).slice(0, 32)}`,
  dom: (d: string) => `crm.email.in.dom.d.${S}.${sha(`dom:${d}`).slice(0, 32)}`,
  msg: (rfc: string) => `crm.email.in.msg.t.${S}.${sha(`msg:${S}:${rfc}`).slice(0, 32)}`,
  uSys: `crm.email.in.sys.${S}`,
  sys: (c: string) => `crm.email.in.sys.${c}.${S}`,
};
const setBucket = (key: string, count: number) =>
  P.$executeRawUnsafe(`INSERT INTO "ChatRateBucket" ("id","key","count","windowStart","createdAt","updatedAt") VALUES (gen_random_uuid()::text,$1,$2,NOW(),NOW(),NOW()) ON CONFLICT ("key") DO UPDATE SET "count"=$2,"windowStart"=NOW()`, key, count);
const bucket = async (key: string) => Number(((await P.$queryRawUnsafe(`SELECT "count" FROM "ChatRateBucket" WHERE "key" = $1`, key)) as Any[])[0]?.count ?? 0);
const snapshot = async () => Object.fromEntries(((await P.chatRateBucket.findMany({ where: { key: { contains: S } }, select: { key: true, count: true } })) as Any[]).map((r) => [r.key, r.count]));
const changed = (a: Record<string, number>, b: Record<string, number>) => Object.keys(b).filter((k) => b[k] !== a[k]).map((k) => k.replace(`.${S}`, "").replace(/\.[0-9a-f]{32}$/, ".<h>")).sort();
const clear = () => P.chatRateBucket.deleteMany({ where: { key: { contains: S } } });
const capNotices = () => P.appNotification.findMany({ where: { tenantId: tid, recipientUserId: uid, title: { startsWith: "กล่องอีเมล CRM รับจดหมายเกินเพดาน" } }, select: { body: true } });
const vReply = (i: number | string) => ingest(V.email, `Re: ใบเสนอราคา ${TAG} V${i}`, { dmarc: true, replyTo: pv });
const tReply = (i: number | string) => ingest(V.email, `Re: ใบเสนอราคา ${TAG} T${i}`, { replyTo: pv });

await sub("A reviewer R2A.1 — attacker DMARC domain, 20 plus-variants × 100", async () => {
  await clear();
  const eDom = `evil-${rand}.test`;
  let stored = 0;
  const t0 = Date.now();
  for (let v = 0; v < 20; v += 1) for (let i = 0; i < 100; i += 1) if ((await ingest(`x+${v}@${eDom}`, `spam ${v}.${i}`, { dmarc: true })).handled) stored += 1;
  const ms = Date.now() - t0;
  const g = await vReply("A");
  const t = await tReply("A");
  chk("A.1", stored === 100 && g.handled === true && t.handled === true,
    `attacker 20 plus-variants × 100 (class D) → ${stored}/2000 stored in ${Math.round(ms / 1000)} s (one normalised sender bucket) · then the customer's V reply → ${g.handled ? "stored" : g.reason} · thread-only reply → ${t.handled ? "stored" : t.reason}`);
});

await sub("B reviewer R2B.1 — one sender bucket per mailbox", async () => {
  await clear();
  const eDom = `evil2-${rand}.test`;
  await setBucket(K.sender("d", `x@${eDom}`), 100);
  const r = [await ingest(`x+0@${eDom}`, "b0", { dmarc: true }), await ingest(`x+1@${eDom}`, "b1", { dmarc: true }), await ingest(`X+Promo@${eDom.toUpperCase()}`, "b2", { dmarc: true })];
  const y = await ingest(`y@${eDom}`, "b3", { dmarc: true });
  await setBucket(K.uSender(`z@${eDom}`), 100);
  const u = await ingest(`z+9@${eDom}`, "b4", {});
  chk("B.1", r.every((x) => x.reason === "rate_limited") && y.handled === true && u.reason === "rate_limited",
    `D sender bucket of x@ full ⇒ x+0 → ${r[0].reason ?? "stored"} · x+1 → ${r[1].reason ?? "stored"} · X+Promo@UPPER → ${r[2].reason ?? "stored"} · control y@ → ${y.handled ? "stored" : y.reason} · U class: z+9 with z@'s bucket full → ${u.reason ?? "stored"}`);
});

await sub("C D per-domain bucket 300/h · free-mail exempt", async () => {
  await clear();
  const eDom = `evil3-${rand}.test`;
  let stored = 0;
  for (let m = 0; m < 4; m += 1) for (let i = 0; i < 80; i += 1) if ((await ingest(`m${m}@${eDom}`, `c ${m}.${i}`, { dmarc: true })).handled) stored += 1;
  chk("C.1", stored === 300 && (await bucket(K.dom(eDom))) === 320, `4 mailboxes × 80 on one DMARC domain → ${stored}/320 stored (want 300) · domain bucket ${await bucket(K.dom(eDom))}`);
  await setBucket(K.dom("gmail.com"), 5000);
  const gm = await ingest(`someone-${rand}@gmail.com`, "gmail", { dmarc: true });
  const snap = await snapshot();
  chk("C.2", gm.handled === true && !Object.keys(snap).some((k) => k === K.dom("gmail.com") && snap[k] !== 5000),
    `free-mail domain (gmail.com) has no per-domain bucket: a DMARC-passing gmail sender → ${gm.handled ? "stored" : gm.reason} (preset gmail domain bucket untouched)`);
});

await sub("E T per-Message-ID bucket shared by every From citing it", async () => {
  await clear();
  const pvT = `${TAG}-group@shark.test`;
  const recips = Array.from({ length: 30 }, (_, i) => `r${i}-${rand}@third${i}.test`);
  await outRow(pvT, [V.email, ...recips.slice(0, 15)], recips.slice(15));
  let stored = 0;
  for (let i = 0; i < 120; i += 1) if ((await ingest(recips[i % 30]!, `Re: grp ${i}`, { replyTo: pvT })).handled) stored += 1;
  const g = await ingest(V.email, `Re: grp V`, { dmarc: true, replyTo: pvT });
  const other = await tReply("E");
  chk("E.1", stored === 100 && (await bucket(K.msg(pvT))) === 120 && g.handled === true && other.handled === true,
    `30 visible recipients × 4 thread-only replies citing one OUT mail → ${stored}/120 stored (want 100) · msg bucket ${await bucket(K.msg(pvT))} · then a V reply to the same id → ${g.handled ? "stored" : g.reason} · a T reply citing another OUT mail → ${other.handled ? "stored" : other.reason}`);
});

await sub("F class exclusivity", async () => {
  await clear();
  const touched: Record<string, string[]> = {};
  for (const [cls, f] of [
    ["V", () => vReply("F")],
    ["D", () => ingest(`f-${rand}@dmarc-${rand}.test`, "f d", { dmarc: true })],
    ["T", () => tReply("F")],
    ["U", () => ingest(`f-${rand}@nobody-${rand}.test`, "f u", {})],
  ] as [string, () => Promise<Any>][]) {
    const a = await snapshot();
    await f();
    touched[cls] = changed(a, await snapshot()).filter((k) => !k.includes(".notice."));
  }
  const want = {
    V: ["crm.email.in.dom.v.<h>", "crm.email.in.from.v.<h>", "crm.email.in.sys.v"], // r4: + V per-domain bucket
    D: ["crm.email.in.dom.d.<h>", "crm.email.in.from.d.<h>", "crm.email.in.sys.d"],
    T: ["crm.email.in.from.t.<h>", "crm.email.in.msg.t.<h>", "crm.email.in.sys.t"],
    U: ["crm.email.in.from.<h>", "crm.email.in.sys"],
  } as Record<string, string[]>;
  chk("F.1", Object.keys(want).every((c) => j(touched[c]) === j(want[c])), `keys counted per class: ${j(touched)}`);
  await setBucket(K.sys("d"), 1000);
  await setBucket(K.sys("t"), 1000);
  await setBucket(K.uSys, 1000);
  const v = await vReply("F2");
  await clear();
  await setBucket(K.sys("v"), 2000);
  const d = await ingest(`f2-${rand}@dmarc2-${rand}.test`, "f d2", { dmarc: true });
  const t = await tReply("F3");
  const u = await ingest(`f2-${rand}@nobody2-${rand}.test`, "f u2", {});
  await setBucket(K.sender("v", V.email), 10); // r4 light lane: only a sender above 10/h can be dropped by the class system bucket
  const v2 = await vReply("F4");
  chk("F.2", v.handled === true && d.handled === true && t.handled === true && u.handled === true && v2.reason === "rate_limited",
    `D/T/U system buckets full ⇒ V → ${v.handled ? "stored" : v.reason} · V system bucket full ⇒ D ${d.handled ? "stored" : d.reason} · T ${t.handled ? "stored" : t.reason} · U ${u.handled ? "stored" : u.reason} · and V itself → ${v2.reason ?? "stored"}`);
});

await sub("G H3-1 + unproven flood", async () => {
  await clear();
  await setBucket(K.uSender(V.email), 100);
  await setBucket(K.uSys, 1000);
  const f = await ingest(V.email, "ปลอม", {});
  const t = await tReply("G");
  const v = await vReply("G");
  chk("G.1", f.reason === "rate_limited" && t.handled === true && v.handled === true,
    `forged unproven flood in the customer's name (U buckets full): forged → ${f.reason ?? "stored"} · customer's T reply → ${t.handled ? "stored" : t.reason} · V reply → ${v.handled ? "stored" : v.reason}`);
  await clear();
  let s = 0;
  const fl = `flood@spam-${rand}.test`;
  for (let i = 0; i < 102; i += 1) if ((await ingest(i % 2 ? `Flood+${i}@SPAM-${rand}.test` : fl, `u ${i}`, {})).handled) s += 1;
  chk("G.2", s === 100, `unproven flood from one mailbox (plus/case variants) → ${s}/102 stored (want 100)`);
});

await sub("H owner notices", async () => {
  await clear();
  await P.appNotification.deleteMany({ where: { tenantId: tid } });
  const eDom = `evil4-${rand}.test`;
  await setBucket(K.sender("d", `a@${eDom}`), 100);
  await ingest(`a@${eDom}`, "h1", { dmarc: true });
  await setBucket(K.dom(eDom), 300);
  await ingest(`b@${eDom}`, "h2", { dmarc: true });
  await setBucket(K.sys("d"), 1000);
  await ingest(`c@other-${rand}.test`, "h3", { dmarc: true });
  const nD = (await capNotices()).length;
  await setBucket(K.sys("v"), 2000);
  await setBucket(K.sender("v", V.email), 10); // r4 light lane (see F.2)
  await vReply("H");
  const after = await capNotices();
  await setBucket(K.uSys, 1000);
  await ingest(`h-${rand}@nobody3-${rand}.test`, "h4", {});
  const all = await capNotices();
  const aud = (await P.auditLog.findMany({ where: { tenantId: tid, action: "crm.email.inbound.rate_limited" }, select: { after: true } })).map((a: Any) => a.after?.bucket);
  chk("H.1", nD === 1 && after.length === 2 && after.some((x: Any) => String(x.body).includes("คำตอบของลูกค้าที่ยืนยันได้")) && all.length === 3 && all.some((x: Any) => String(x.body).startsWith("มีจดหมายที่ยืนยันผู้ส่งไม่ได้เข้ามาเกิน 1000 ฉบับ")) && ["sender-d", "domain-d", "system-d", "system-v", "system"].every((b) => aud.includes(b)) && !all.some((x: Any) => String(x.body).includes("@")),
    `D sender + D domain + D system trips → notices ${nD} (want 1) · V system trip → ${after.length} (want 2, V text) · U system trip → ${all.length} (want 3, unchanged text) · audits ${j(aud)} · no address in any notice`);
});

await sub("I P14 unset ⇒ only T and U", async () => {
  await clear();
  const a = await snapshot();
  const g = await ingest(V.email, "p14 V-shaped", { dmarc: true, replyTo: pv, authserv: false });
  const b1 = await snapshot();
  const d = await ingest(`p14-${rand}@dmarc-${rand}.test`, "p14 D-shaped", { dmarc: true, authserv: false });
  const b2 = await snapshot();
  chk("I.1", g.handled === true && d.handled === true && j(changed(a, b1)) === j(["crm.email.in.from.t.<h>", "crm.email.in.msg.t.<h>", "crm.email.in.sys.t"]) && j(changed(b1, b2)) === j(["crm.email.in.from.<h>", "crm.email.in.sys"]),
    `CRM_INBOUND_AUTHSERV_ID unset: perfect A-R + thread → class ${j(changed(a, b1))} (want T) · perfect A-R, no thread → ${j(changed(b1, b2))} (want U)`);
});

await clear().catch(() => undefined);
chk("CLEAN-buckets", (await P.chatRateBucket.count({ where: { key: { contains: S } } })) === 0, "rate buckets of the throwaway system removed");
await done("probe-cf11-r3");
