// QC seed of the RUN "AI TEAM" (SHARK HUB v2 · ทีมพนักงาน AI) — three permanent shops on the QC4 database.
//
// Run (always through the QC4 wrapper — the gate lock is shared with the POS and HR lanes):
//   bash scripts/iso.sh bash scripts/qc4.sh bash scripts/with-gate-lock.sh pnpm exec tsx scripts/seed-ai-team-qc.mts
// Oracles that need this data carry the header marker "requires: ai-team-seed" (scripts/qc-all.mts runs this file once per run for them).
//
// 🔴 Env comes ONLY from scripts/ai-team-qc-env.mts#loadAiTeamQcEnv() — it exits 4 on any host that is not QC4, before a connection opens.
// 🔴 FIND-OR-CREATE: every row is looked up by a stable key first; a second run adds no row and replaces no id. Nothing is ever deleted.
// 🔴 Writes ONLY under the tenant slug prefix of the contract (qc-ai-team-) and the e-mail domain @qc.shark. No other tenant is read for
//    writing, no outbox is drained here (drainOutbox is not tenant-scoped — draining would run other lanes' events).
// 🔴 Rows are created through the modules' real create paths where one exists (system · account · CRM · member · KB · approval), so the
//    data has the same shape as a real shop (Party links, document numbers, GL postings, audit rows). Chat threads are written with the
//    prisma shapes of `receiveWebchatInbound` because that service notifies staff and schedules a drain.
//
// What it leaves (contract = scripts/qc-ai-t0.2.mts header [2] · names in scripts/ai-team-qc-env.mts#AT):
//   AT-1  owner at-owner (OWNER) · approver at-nid (MANAGER: account.doc.approve + crm.commission.approve + approve cap 20,000 baht)
//         · staff at-staff (STAFF: ai.chat.send + ai.employee.use — the second key is registered by T1.2, stored as-is today)
//         systems ACCOUNT/CRM/CHAT/MEMBER/KANBAN · 24 CRM contacts · 6 open deals · 3 open invoices (one above 20,000 baht)
//         · 3 customer chat threads waiting for a reply + 1 answered thread · 6 members · 5 KB articles in 3 categories
//         · ApprovalPolicy AccountDocument ≥ 2,000,000 satang → OWNER
//   AT-2  same owner, systems only (second shop of one owner: shared FREE pack, cross-tenant inbox)
//   AT-X  another owner (ax-owner), systems only (isolation · no recommendation signal)
//
// ⏳ AGES DRIFT. Dates are stamped once, at creation, relative to that day (invoice due dates, deal stage / last-activity dates,
//    chat message times) and are never re-stamped by a later run. Oracles must NOT assert on lastActivityAt, stageEnteredAt,
//    dueDate, "overdue" or "quiet for N days" of seed rows — a check that needs a point in time creates its own rows or injects
//    the clock (scripts/ai-team-qc-env.mts#withInjectedNow).

/** printed instead of the real host: the branch label only, never the endpoint id / pooler suffix */
const HOST_LABEL = "ep-frosty-lab";
const PREFIX = "qc-ai-team-";
const DOMAIN = "@qc.shark";

type EnvModule = {
  loadAiTeamQcEnv: () => Promise<{ source: string }>;
  AT: {
    tenants: Record<"at1" | "at2" | "atx", { slug: string; name: string }>;
    users: Record<"owner" | "approver" | "staff" | "otherOwner", { email: string; name: string }>;
    systemTypes: readonly ("ACCOUNT" | "CRM" | "CHAT" | "MEMBER" | "KANBAN")[];
    approvalThresholdSatang: number;
  };
};
const envMod = (await import("./ai-team-qc-env.mts" as string)) as EnvModule;
const env = await envMod.loadAiTeamQcEnv();
const { AT } = envMod;

// the contract keys must stay inside the seed's own namespace — checked before the first query
for (const t of Object.values(AT.tenants)) if (!t.slug.startsWith(PREFIX)) throw new Error("seed-ai-team-qc: a tenant slug is outside the seed prefix");
for (const u of Object.values(AT.users)) if (!u.email.endsWith(DOMAIN)) throw new Error("seed-ai-team-qc: a user e-mail is outside the seed domain");

const { prisma } = await import("@/lib/core/db");
const sys = await import("@/lib/modules/system/service");
const accountSvc = await import("@/lib/modules/account/service");
const gl = await import("@/lib/modules/account/gl");
const crm = await import("@/lib/modules/crm/service");
const crmSettings = await import("@/lib/modules/crm/settings");
const member = await import("@/lib/modules/member/service");
const kb = await import("@/lib/modules/kb/service");
const approval = await import("@/lib/modules/approval/service");

// raw lookups / the few raw writes go through a structural view of the client (stable across schema growth; no `any`)
type Row = { id: string } & Record<string, unknown>;
type Where = Record<string, unknown>;
type Delegate = {
  findFirst: (a: { where: Where; orderBy?: Record<string, "asc" | "desc"> }) => Promise<Row | null>;
  findMany: (a: { where: Where; orderBy?: Record<string, "asc" | "desc"> }) => Promise<Row[]>;
  count: (a: { where: Where }) => Promise<number>;
  create: (a: { data: Record<string, unknown> }) => Promise<Row>;
  update: (a: { where: { id: string }; data: Record<string, unknown> }) => Promise<Row>;
};
const P = prisma as unknown as Record<string, Delegate>;

const t0 = Date.now();
let created = 0; // rows created
let repaired = 0; // writes that fixed an existing row (no new row)
const made: string[] = [];
const note = (what: string) => {
  created += 1;
  made.push(what);
};
const fixed = (what: string) => {
  repaired += 1;
  made.push(`${what} (repaired)`);
};
const DAY = 86_400_000;
const now = new Date();

/** never print a connection string or a database host, whatever a driver puts in its message */
const safe = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e))
    .replace(/postgres(?:ql)?:\/\/\S+/g, "<db-url>")
    .replace(/\bep-[a-z0-9-]+(?:\.[a-z0-9-]+)*/g, "<db-host>")
    .replace(/\s+/g, " ")
    .slice(0, 400);

type SystemType = EnvModule["AT"]["systemTypes"][number];
const SYSTEM_NAME: Record<SystemType, string> = { ACCOUNT: "บัญชี", CRM: "ลูกค้าสัมพันธ์ (CRM)", CHAT: "แชทลูกค้า", MEMBER: "สมาชิก", KANBAN: "บอร์ดงาน" };

// ═══════════════════ 1. users ═══════════════════
async function ensureUser(u: { email: string; name: string }): Promise<string> {
  const hit = await P.user.findFirst({ where: { email: u.email } });
  if (hit) return hit.id;
  const row = await P.user.create({ data: { email: u.email, name: u.name } });
  note(`user ${u.email}`);
  return row.id;
}

// ═══════════════════ 2. tenant + unit + members + systems ═══════════════════
type MemberSpec = { userId: string; role: "OWNER" | "MANAGER" | "STAFF"; permissions: Record<string, boolean | number>; allUnits: boolean };

async function ensureTenant(t: { slug: string; name: string }): Promise<string> {
  const hit = await P.tenant.findFirst({ where: { slug: t.slug } });
  if (hit) return hit.id;
  // same shape as src/lib/mobile/tenants.ts#createTenantForUser (the slug is fixed here — it is the stable key of the contract)
  const row = await P.tenant.create({ data: { name: t.name, slug: t.slug, status: "ACTIVE", limits: { maxUnits: 10 } } });
  note(`tenant ${t.slug}`);
  return row.id;
}

async function ensureUnit(tenantId: string): Promise<string> {
  const hit = await P.businessUnit.findFirst({ where: { tenantId, slug: "main" } });
  if (hit) return hit.id;
  const row = await P.businessUnit.create({ data: { tenantId, type: "SHOP", name: "สาขาหลัก", slug: "main", status: "ACTIVE" } });
  note("unit main");
  return row.id;
}

async function ensureMembership(tenantId: string, unitId: string, m: MemberSpec): Promise<void> {
  const hit = await P.membership.findFirst({ where: { tenantId, userId: m.userId } });
  if (!hit) {
    await P.membership.create({
      data: { tenantId, userId: m.userId, role: m.role, unitAccess: m.allUnits ? ["*"] : [unitId], permissions: m.permissions, acceptedAt: new Date() },
    });
    note(`membership ${m.role}`);
    return;
  }
  // found: only repair what the contract needs (a key that went missing, an unaccepted invite) — never replace the row
  const have = (hit.permissions ?? {}) as Record<string, unknown>;
  const missing = Object.entries(m.permissions).filter(([k, v]) => have[k] !== v);
  if (missing.length > 0 || !hit.acceptedAt || hit.role !== m.role) {
    await P.membership.update({
      where: { id: hit.id },
      data: { role: m.role, permissions: { ...have, ...m.permissions }, acceptedAt: hit.acceptedAt ?? new Date() },
    });
    fixed(`membership ${m.role}`);
  }
}

async function ensureSystems(tenantId: string, unitId: string): Promise<Record<SystemType, string>> {
  const out = {} as Record<SystemType, string>;
  for (const type of AT.systemTypes) {
    let row = await P.appSystem.findFirst({ where: { tenantId, type, active: true }, orderBy: { createdAt: "asc" } });
    if (!row) {
      const s = await sys.createSystem(tenantId, type, SYSTEM_NAME[type]);
      row = { id: s.id };
      note(`system ${type}`);
    }
    out[type] = row.id;
    // LINK_UNIT of the DNA onboarding — linkUnit deletes and re-creates the link, so it is called only when the link is absent
    const linked = await P.appSystemUnit.findFirst({ where: { tenantId, unitId, type } });
    if (!linked) {
      await sys.linkUnit(tenantId, row.id, unitId);
      note(`link ${type}`);
    }
  }
  // LINK_ACCOUNT_POS of the DNA onboarding: money from CRM (quotations of deals) lands in this accounting system
  const link = await P.accountSystemLink.findFirst({ where: { tenantId, systemId: out.ACCOUNT, linkedKind: "CRM", linkedId: out.CRM } });
  if (!link) {
    await P.accountSystemLink.create({ data: { tenantId, systemId: out.ACCOUNT, linkedKind: "CRM", linkedId: out.CRM } });
    note("link ACCOUNT↔CRM");
  }
  // the QC shops of this run use the CRM v2 screens/tools (same switch as the CRM QC shop; production shops stay on 1 until the owner flips it)
  const crmCtx = { tenantId, systemId: out.CRM };
  if ((await crmSettings.getCrmSettings(crmCtx)).uiVersion !== 2) {
    await crmSettings.setCrmSettingsKey(crmCtx, "uiVersion", 2);
    fixed("crm uiVersion 2");
  }
  return out;
}

// ═══════════════════ 3. AT-1 content ═══════════════════
const FIRST = ["สมชาย", "วรรณา", "กิตติ", "นภา", "ธีระ", "อรุณี", "ประเสริฐ", "ศิริพร", "มานพ", "จันทร์เพ็ญ", "วิชัย", "สุนิสา"];
const LAST = ["ดอยช้าง", "บ้านสวน", "แก้วมณี", "ทองดี", "สุขใจ", "รัตนโชติ"];
const SHOPS = ["ร้านดอยช้าง", "ร้านบ้านสวน", "คาเฟ่ริมน้ำ", "โฮมสเตย์ภูผา", "ร้านขนมแม่พลอย", "สตูดิโอโยคะใบไม้"];
const pad = (n: number) => String(n).padStart(2, "0");
/** fictitious numbers (089-555-01xx) — unique per contact */
const phoneOf = (n: number) => `08955501${pad(n)}`;

async function seedCrm(tenantId: string, systemId: string, owners: string[]): Promise<void> {
  const ctx = { tenantId, systemId };
  const pipeline = await crm.ensureCrm(ctx); // idempotent in the service itself (returns the default pipeline)
  const openStages = pipeline.stages.filter((s) => s.kind === "OPEN");
  if (openStages.length === 0) throw new Error("the default CRM pipeline has no OPEN stage");

  const contactIds: string[] = [];
  for (let i = 1; i <= 24; i += 1) {
    const email = `at-customer-${pad(i)}${DOMAIN}`;
    const hit = await P.crmContact.findFirst({ where: { tenantId, systemId, email } });
    if (hit) {
      contactIds.push(hit.id);
      continue;
    }
    const c = await crm.createContact(ctx, {
      name: `${FIRST[(i - 1) % FIRST.length]} ${LAST[(i - 1) % LAST.length]}`,
      phone: phoneOf(i),
      email,
      company: i <= 12 ? SHOPS[(i - 1) % SHOPS.length] : null,
      source: i % 3 === 0 ? "LINE" : i % 3 === 1 ? "REFERRAL" : "WEB_FORM",
      ownerUserId: owners[(i - 1) % owners.length],
    });
    contactIds.push(c.id);
    note(`crm contact ${pad(i)}`);
  }

  const DEALS: { title: string; baht: number; inDays: number }[] = [
    { title: "ดีล AT-01 — เครื่องชง Espresso 2 ชุด ร้านดอยช้าง", baht: 12_500, inDays: 7 },
    { title: "ดีล AT-02 — เมล็ดกาแฟรายเดือน ร้านบ้านสวน", baht: 8_400, inDays: 10 },
    { title: "ดีล AT-03 — ชุดอุปกรณ์บาร์ คาเฟ่ริมน้ำ", baht: 48_000, inDays: 21 },
    { title: "ดีล AT-04 — อบรมบาริสต้า โฮมสเตย์ภูผา", baht: 15_000, inDays: 14 },
    { title: "ดีล AT-05 — แก้วและบรรจุภัณฑ์ ร้านขนมแม่พลอย", baht: 6_200, inDays: 5 },
    { title: "ดีล AT-06 — สัญญาส่งนมรายปี สตูดิโอโยคะใบไม้", baht: 96_000, inDays: 30 },
  ];
  for (let i = 0; i < DEALS.length; i += 1) {
    const d = DEALS[i];
    // two steps (service create → state update): a run that stopped between them is finished here, not skipped —
    // "created but never given an owner" is the mark of the half-done deal
    const existing = await P.crmDeal.findFirst({ where: { tenantId, systemId, title: d.title } });
    if (existing && existing.ownerUserId) continue;
    let dealId = existing?.id ?? "";
    if (!existing) {
      const deal = await crm.createDeal(ctx, {
        contactId: contactIds[i],
        pipelineId: pipeline.id,
        stageId: openStages[0].id,
        title: d.title,
        valueSatang: d.baht * 100,
        expectedCloseAt: new Date(now.getTime() + d.inDays * DAY),
      });
      dealId = deal.id;
    }
    // state only — no business event is faked here (moveDeal would emit crm.deal.* for other modules' consumers):
    // an owner, and for every second deal a later OPEN stage. Deals 5 and 6 were quiet for 9 days on the day they were created.
    const stage = openStages[i % 2 === 1 ? Math.min(1, openStages.length - 1) : 0];
    const quiet = i >= 4 ? new Date(now.getTime() - 9 * DAY) : new Date(now.getTime() - DAY);
    await P.crmDeal.update({
      where: { id: dealId },
      data: { ownerUserId: owners[i % owners.length], stageId: stage.id, kind: "OPEN", stageEnteredAt: quiet, lastActivityAt: quiet },
    });
    if (existing) {
      fixed(`crm deal ${pad(i + 1)}`);
      continue;
    }
    note(`crm deal ${pad(i + 1)}`);
  }
}

async function seedAccount(tenantId: string, systemId: string, createdById: string): Promise<void> {
  if (!(await P.accountSettings.findFirst({ where: { tenantId, systemId } }))) {
    await accountSvc.saveSettings(tenantId, systemId, {
      orgPrefix: "บริษัท",
      orgName: "เดอะบีน คาเฟ่ (QC ทีม AI) จำกัด",
      taxId: "0105565099991",
      branchCode: "00000",
      branchName: "สำนักงานใหญ่",
      address: "99/9 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพฯ 10000",
      vatRegistered: true,
      vatRateBp: 700,
      taxPointBasis: "ON_ISSUE",
      defaultDueDays: 30,
      defaultValidDays: 30,
    });
    note("account settings");
  }
  // chart of accounts + the current period — only the first time (a later month would otherwise add a period row on a re-run)
  if ((await P.accountPeriod.count({ where: { tenantId, systemId } })) === 0) {
    await gl.ensureAccounting({ tenantId, systemId });
    note("chart of accounts");
  }

  const CUSTOMERS = ["ร้านดอยช้าง", "ร้านบ้านสวน", "คาเฟ่ริมน้ำ"];
  const contactIds: string[] = [];
  for (let i = 0; i < CUSTOMERS.length; i += 1) {
    const name = `${CUSTOMERS[i]} (ลูกค้า QC ทีม AI)`;
    const hit = await P.accountContact.findFirst({ where: { tenantId, systemId, name } });
    if (hit) {
      contactIds.push(hit.id);
      continue;
    }
    const c = await accountSvc.createContact({ tenantId, systemId, kind: "CUSTOMER", legalType: "COMPANY", name, phone: phoneOf(60 + i), creditTermDays: 30 });
    contactIds.push(c.id);
    note(`account contact ${i + 1}`);
  }

  // three issued, unpaid invoices (AWAITING_PAYMENT). Stable key = refType/refId (the same pair the CSV import uses against duplicates).
  const INVOICES: { key: string; line: string; qty: number; baht: number; dueInDays: number }[] = [
    { key: "inv-1", line: "เมล็ดกาแฟคั่วกลาง 1 กก.", qty: 8, baht: 600, dueInDays: 0 },
    { key: "inv-2", line: "เครื่องชง Espresso", qty: 2, baht: 6_250, dueInDays: 7 },
    { key: "inv-3", line: "ชุดอุปกรณ์บาร์ครบชุด", qty: 1, baht: 25_000, dueInDays: 30 },
  ];
  const REF_TYPE = "AiTeamQcSeed";
  for (let i = 0; i < INVOICES.length; i += 1) {
    const inv = INVOICES[i];
    let docId = "";
    const hit = await P.accountDocument.findFirst({ where: { tenantId, systemId, refType: REF_TYPE, refId: inv.key } });
    if (hit) {
      if (hit.status !== "DRAFT") continue;
      docId = hit.id; // an earlier run stopped between "create" and "issue" — finish it instead of creating a second one
    } else {
      const doc = await accountSvc.createDocument({
        tenantId,
        systemId,
        docType: "INVOICE",
        contactId: contactIds[i],
        dueDate: new Date(now.getTime() + inv.dueInDays * DAY),
        vatMode: "EXCLUDE",
        lines: [{ description: inv.line, qty: inv.qty, unitName: "ชิ้น", unitPrice: inv.baht * 100 }],
        createdById,
        refType: REF_TYPE,
        refId: inv.key,
      });
      docId = doc.id;
      note(`invoice ${inv.key}`);
    }
    const issued = await accountSvc.issueDocument(tenantId, systemId, docId);
    if (!issued.ok) throw new Error(`invoice ${inv.key} could not be issued: ${issued.reason}`);
    if (hit) fixed(`invoice ${inv.key} issued`);
  }
}

async function seedChat(tenantId: string, systemId: string, unitId: string, staffUserId: string): Promise<void> {
  // prisma shapes of chat/service.ts#receiveWebchatInbound: ChatContact (WEBCHAT · guest token) → ChatConversation → ChatMessage IN
  // + the denormalised inbox columns `announceInbound` maintains. Thread 4 has a staff reply (control: not "waiting").
  const THREADS: { n: number; name: string; ask: string; reply?: string }[] = [
    { n: 1, name: "คุณฝน", ask: "สวัสดีค่ะ เครื่องชง Espresso มีของพร้อมส่งไหมคะ" },
    { n: 2, name: "คุณต้น", ask: "ขอใบเสนอราคาเมล็ดกาแฟ 20 กก. หน่อยครับ" },
    { n: 3, name: "คุณมายด์", ask: "สั่งไปเมื่อวานยังไม่ได้เลขพัสดุเลยค่ะ" },
    { n: 4, name: "คุณเก่ง", ask: "ร้านเปิดกี่โมงครับ", reply: "เปิดทุกวัน 08:00–18:00 ครับ" },
  ];
  for (const t of THREADS) {
    const externalUserId = `${PREFIX}guest-${pad(t.n)}`;
    let contact = await P.chatContact.findFirst({ where: { tenantId, systemId, channel: "WEBCHAT", externalUserId } });
    if (!contact) {
      contact = await P.chatContact.create({ data: { tenantId, systemId, channel: "WEBCHAT", externalUserId, displayName: t.name, lang: "th" } });
      note(`chat contact ${t.n}`);
    }
    const askedAt = new Date(now.getTime() - (5 - t.n) * 3_600_000);
    let conv = await P.chatConversation.findFirst({ where: { tenantId, systemId, contactId: contact.id }, orderBy: { createdAt: "asc" } });
    if (!conv) {
      conv = await P.chatConversation.create({
        data: {
          tenantId,
          systemId,
          channel: "WEBCHAT",
          contactId: contact.id,
          unitId,
          status: "OPEN",
          lastMessageAt: askedAt,
          lastMessagePreview: t.ask,
          lastMessageDirection: "IN",
          staffUnreadCount: 1,
          firstCustomerMessageAt: askedAt,
        },
      });
      note(`chat thread ${t.n}`);
    }
    const askKey = `${PREFIX}msg-${pad(t.n)}-in`;
    if (!(await P.chatMessage.findFirst({ where: { tenantId, conversationId: conv.id, clientMessageId: askKey } }))) {
      await P.chatMessage.create({
        data: { tenantId, systemId, conversationId: conv.id, direction: "IN", type: "TEXT", body: t.ask, clientMessageId: askKey, deliveryStatus: "SENT", createdAt: askedAt },
      });
      note(`chat message ${t.n} in`);
    }
    if (t.reply) {
      const replyKey = `${PREFIX}msg-${pad(t.n)}-out`;
      if (!(await P.chatMessage.findFirst({ where: { tenantId, conversationId: conv.id, clientMessageId: replyKey } }))) {
        const repliedAt = new Date(askedAt.getTime() + 600_000);
        await P.chatMessage.create({
          data: {
            tenantId,
            systemId,
            conversationId: conv.id,
            direction: "OUT",
            type: "TEXT",
            body: t.reply,
            senderUserId: staffUserId,
            clientMessageId: replyKey,
            deliveryStatus: "SENT",
            createdAt: repliedAt,
          },
        });
        await P.chatConversation.update({
          where: { id: conv.id },
          data: { lastMessageAt: repliedAt, lastMessagePreview: t.reply, lastMessageDirection: "OUT", staffUnreadCount: 0, firstResponseAt: repliedAt, assigneeUserId: staffUserId },
        });
        note(`chat message ${t.n} out`);
      }
    }
  }
}

async function seedMembers(tenantId: string, memberSystemId: string): Promise<void> {
  for (let i = 1; i <= 6; i += 1) {
    const email = `at-member-${pad(i)}${DOMAIN}`;
    if (await P.customer.findFirst({ where: { tenantId, memberSystemId, email } })) continue;
    await member.findOrCreate({ tenantId, memberSystemId, phone: phoneOf(80 + i), email, name: `${FIRST[(i + 5) % FIRST.length]} ${LAST[i % LAST.length]}`, source: "STAFF" });
    note(`member ${pad(i)}`);
  }
}

async function seedKnowledge(tenantId: string): Promise<void> {
  const ARTICLES: { title: string; category: string; body: string }[] = [
    { title: "นโยบายส่วนลด (QC ทีม AI)", category: "นโยบาย", body: "ส่วนลดปกติไม่เกิน 10% ต่อใบเสนอราคา ลูกค้าประจำที่ซื้อเกิน 3 ครั้งต่อปีใช้ราคาส่ง ส่วนลดเกิน 10% ต้องให้เจ้าของอนุมัติก่อน" },
    { title: "เวลาเปิด-ปิดและการจัดส่ง (QC ทีม AI)", category: "นโยบาย", body: "ร้านเปิดทุกวัน 08:00–18:00 จัดส่งภายใน 2 วันทำการหลังยืนยันการชำระเงิน ส่งฟรีเมื่อยอดเกิน 3,000 บาท" },
    { title: "คู่มือเครื่องชง Espresso (QC ทีม AI)", category: "สินค้า", body: "เครื่องชงรุ่นมาตรฐานรับประกัน 1 ปี ล้างหัวชงทุกวันหลังปิดร้าน เปลี่ยนไส้กรองน้ำทุก 3 เดือน อะไหล่มีพร้อมส่ง" },
    { title: "คำถามที่พบบ่อย (QC ทีม AI)", category: "คำถามที่พบบ่อย", body: "ถาม: ออกใบกำกับภาษีได้ไหม ตอบ: ได้ แจ้งชื่อและเลขผู้เสียภาษีก่อนชำระเงิน ถาม: เปลี่ยนสินค้าได้ไหม ตอบ: ได้ภายใน 7 วันถ้ายังไม่แกะใช้" },
    { title: "ต้นทุนและกำไรต่อเมนู (QC ทีม AI)", category: "บัญชีเท่านั้น", body: "เอกสารภายในฝ่ายบัญชี ใช้ทดสอบการจำกัดความรู้รายพนักงาน (หมวดนี้ต้องไม่ไปถึงพนักงานตอบแชท)" },
  ];
  for (const a of ARTICLES) {
    if (await P.kbArticle.findFirst({ where: { tenantId, title: a.title } })) continue;
    await kb.createArticle({ tenantId }, a);
    note(`kb ${a.category}`);
  }
}

async function seedApprovalPolicy(tenantId: string): Promise<void> {
  const name = "เกิน 20,000 บาท ต้องให้เจ้าของอนุมัติ (QC ทีม AI)";
  if (await P.approvalPolicy.findFirst({ where: { tenantId, entityType: "AccountDocument", name } })) return;
  await approval.createPolicy({ tenantId }, { name, entityType: "AccountDocument", thresholdSatang: AT.approvalThresholdSatang, steps: [{ order: 1, approverRole: "OWNER" }] });
  note("approval policy");
}

// ═══════════════════ run ═══════════════════
let exitCode = 0;
try {
  const ownerId = await ensureUser(AT.users.owner);
  const approverId = await ensureUser(AT.users.approver);
  const staffId = await ensureUser(AT.users.staff);
  const otherOwnerId = await ensureUser(AT.users.otherOwner);

  const MEMBERS: Record<"at1" | "at2" | "atx", MemberSpec[]> = {
    at1: [
      { userId: ownerId, role: "OWNER", permissions: {}, allUnits: true },
      // account.doc.approve + crm.commission.approve exist today (core/permissions.ts) · _maxApproveSatang = the platform's approve cap
      { userId: approverId, role: "MANAGER", permissions: { "account.doc.approve": true, "crm.commission.approve": true, _maxApproveSatang: AT.approvalThresholdSatang }, allUnits: true },
      // ai.employee.use is registered by T1.2 (R-E C31); stored as-is today (controller ruling OQ-5)
      { userId: staffId, role: "STAFF", permissions: { "ai.chat.send": true, "ai.employee.use": true }, allUnits: false },
    ],
    at2: [{ userId: ownerId, role: "OWNER", permissions: {}, allUnits: true }],
    atx: [{ userId: otherOwnerId, role: "OWNER", permissions: {}, allUnits: true }],
  };

  const systems = {} as Record<"at1" | "at2" | "atx", Record<SystemType, string>>;
  const tenantIds = {} as Record<"at1" | "at2" | "atx", string>;
  const unitIds = {} as Record<"at1" | "at2" | "atx", string>;
  for (const key of ["at1", "at2", "atx"] as const) {
    const tenantId = await ensureTenant(AT.tenants[key]);
    const unitId = await ensureUnit(tenantId);
    for (const m of MEMBERS[key]) await ensureMembership(tenantId, unitId, m);
    systems[key] = await ensureSystems(tenantId, unitId);
    tenantIds[key] = tenantId;
    unitIds[key] = unitId;
  }

  const at1 = tenantIds.at1;
  await seedCrm(at1, systems.at1.CRM, [ownerId, approverId]);
  await seedAccount(at1, systems.at1.ACCOUNT, ownerId);
  await seedChat(at1, systems.at1.CHAT, unitIds.at1, staffId);
  await seedMembers(at1, systems.at1.MEMBER);
  await seedKnowledge(at1);
  await seedApprovalPolicy(at1);

  const n = async (model: string, where: Where) => P[model].count({ where });
  const summary = {
    contacts: await n("crmContact", { tenantId: at1, systemId: systems.at1.CRM, archivedAt: null }),
    deals: await n("crmDeal", { tenantId: at1, systemId: systems.at1.CRM }),
    openInvoices: await n("accountDocument", { tenantId: at1, systemId: systems.at1.ACCOUNT, docType: "INVOICE", status: { in: ["AWAITING_PAYMENT", "PARTIAL"] } }),
    waitingChats: await n("chatConversation", { tenantId: at1, systemId: systems.at1.CHAT, status: "OPEN", lastMessageDirection: "IN" }),
    members: await n("customer", { tenantId: at1, memberSystemId: systems.at1.MEMBER }),
    kbArticles: await n("kbArticle", { tenantId: at1, active: true }),
    policies: await n("approvalPolicy", { tenantId: at1, entityType: "AccountDocument", active: true }),
  };
  console.log(`🌱 AI-team QC seed on ${HOST_LABEL} (${env.source}) — tenants ${Object.values(AT.tenants).map((t) => t.slug).join(", ")}`);
  console.log(`   AT-1: ${Object.entries(summary).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  console.log(`   rows created this run: ${created} · repaired: ${repaired}${made.length ? ` (${made.slice(0, 12).join(", ")}${made.length > 12 ? ", …" : ""})` : ""} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  // unchanged = not a single write happened in this run
  console.log(`AI_TEAM_SEED=${created > 0 ? "created" : repaired > 0 ? "repaired" : "unchanged"}`);
} catch (e) {
  exitCode = 1;
  console.error(`❌ seed-ai-team-qc failed: ${safe(e)}`);
} finally {
  await prisma.$disconnect().catch(() => undefined);
}
process.exit(exitCode);
