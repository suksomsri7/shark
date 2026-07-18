import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import { prisma } from "@/lib/core/db";
import { env } from "@/lib/env";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { StatusChip } from "@/components/ui/StatusChip";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModuleTabs } from "@/components/module-tabs";
import {
  ensureWebchatConnection,
  listConnections,
  listConversations,
  getThread,
  getSetting,
  getLinkedMember,
  listStaff,
  maskedConnection,
} from "./service";
import {
  sendReplyAction,
  setStatusAction,
  assignAction,
  markReadAction,
  linkCustomerAction,
  connectLineAction,
  disableConnectionAction,
  setMemberSystemAction,
} from "./actions";

// ป้ายสถานะ/ช่องทาง ภาษาไทย (B&W)
const CONV_STATUS_LABEL: Record<string, string> = {
  OPEN: "กำลังคุย",
  PENDING: "พักไว้",
  RESOLVED: "ปิดแล้ว",
};
const CHANNEL_LABEL: Record<string, string> = {
  LINE: "LINE",
  WEBCHAT: "เว็บ",
  FACEBOOK: "Facebook",
  INSTAGRAM: "IG",
  SHOPEE: "Shopee",
  LAZADA: "Lazada",
  WHATSAPP: "WhatsApp",
};

const fmt = (d: Date) =>
  d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });

const origin = () => env.APP_URL.replace(/\/$/, "");

// แท็บฟังก์ชันย่อยของระบบแชท (Chat) — สนทนา (inbox) + เชื่อมช่องทาง (channels)
// ⚠️ ต้องตรงกับ childrenFor("CHAT") ใน src/app/app/layout.tsx (ตรวจโดย qc-nav-functions.mts)
export function chatTabs(systemId: string): { href: string; label: string }[] {
  const s = `/app/sys/${systemId}`;
  return [
    { href: s, label: "ภาพรวม" },
    { href: `${s}/chat`, label: "สนทนา" },
    { href: `${s}/chat/channels`, label: "เชื่อมช่องทาง" },
  ];
}

// ───────────── ChatHub (หน้าภาพรวม ฝังใน /app/sys/[id]) ─────────────
// การ์ดสรุปสั้น + ลิงก์เข้าแต่ละฟังก์ชัน (แตกเป็นหน้าย่อยจริง: สนทนา + เชื่อมช่องทาง)
export async function ChatHub({ systemId, tenantId }: { systemId: string; tenantId: string }) {
  const auth = await requireTenant();
  const unitAccess = auth.active.unitAccess as string[];

  await ensureWebchatConnection(tenantId, systemId);
  const [connections, conversations] = await Promise.all([
    listConnections(tenantId, systemId),
    listConversations({ tenantId, systemId, unitAccess }),
  ]);
  const unread = conversations.reduce((n, c) => n + (c.staffUnreadCount > 0 ? 1 : 0), 0);
  const lineCount = connections.filter((c) => c.type === "LINE").length;

  const cards = [
    {
      href: `/app/sys/${systemId}/chat`,
      label: "สนทนา",
      value: unread > 0 ? `${unread} ยังไม่อ่าน` : `${conversations.length} บทสนทนา`,
      desc: "กล่องข้อความรวมลูกค้าจากทุกช่องทาง",
    },
    {
      href: `/app/sys/${systemId}/chat/channels`,
      label: "เชื่อมช่องทาง",
      value: lineCount > 0 ? `LINE ${lineCount}` : "เว็บ",
      desc: "เชื่อม LINE OA · แชทหน้าเว็บ · ระบบสมาชิก",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ModuleTabs items={chatTabs(systemId)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card flex min-h-[76px] flex-col gap-1 p-4 transition-colors hover:bg-[color:var(--color-surface-2)]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{c.label}</span>
              <span className="text-sm tabular-nums text-[color:var(--color-accent)]">{c.value}</span>
            </div>
            <span className="text-xs text-[color:var(--color-muted)]">{c.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// <ChatInboxSection systemId tenantId conversationId? /> — inbox รวมแชทลูกค้า (P1: LINE + เว็บ)
// การเลือกบทสนทนาใช้ ?c= (หน้าเต็มที่ /app/sys/[id]/chat)
// ─────────────────────────────────────────────────────────────
export async function ChatInboxSection({
  systemId,
  tenantId,
  conversationId,
}: {
  systemId: string;
  tenantId: string;
  conversationId?: string;
}) {
  const auth = await requireTenant();
  const userId = auth.user.id;
  const unitAccess = auth.active.unitAccess as string[];

  // built-in WEBCHAT connection (lazy) + ช่องทางอื่น
  await ensureWebchatConnection(tenantId, systemId);
  const [connections, conversations, setting, staff] = await Promise.all([
    listConnections(tenantId, systemId),
    listConversations({ tenantId, systemId, unitAccess }),
    getSetting(tenantId, systemId),
    listStaff(tenantId),
  ]);
  const nameOf = (uid?: string | null) =>
    uid ? staff.find((s) => s.userId === uid)?.name ?? "พนักงาน" : "—";

  const base = `/app/sys/${systemId}/chat`;
  const active = conversationId ? conversations.find((c) => c.id === conversationId) : undefined;

  return (
    <section className="flex flex-col gap-4">
      {/* ── กล่องข้อความ (2 คอลัมน์) ── */}
      <div className="card flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">กล่องข้อความ</h2>
          <span className="text-xs text-[color:var(--color-muted)]">
            {conversations.length} บทสนทนา
          </span>
        </div>

        {connections.filter((c) => c.type === "LINE").length === 0 && conversations.length === 0 ? (
          <EmptyState text="ยังไม่มีแชท — เชื่อม LINE OA หรือเปิดแชทหน้าเว็บด้านล่างเพื่อเริ่มรับข้อความลูกค้า" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-[minmax(0,280px)_1fr]">
            {/* รายการบทสนทนา */}
            <aside className="flex flex-col gap-1">
              {conversations.length === 0 ? (
                <p className="px-1 py-2 text-sm text-[color:var(--color-muted)]">
                  ยังไม่มีบทสนทนา
                </p>
              ) : (
                conversations.map((c) => {
                  const on = active?.id === c.id;
                  return (
                    <Link
                      key={c.id}
                      href={`${base}?c=${c.id}`}
                      className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-sm ${
                        on
                          ? "bg-[color:var(--color-surface-2)] font-medium"
                          : "hover:bg-[color:var(--color-surface-2)]"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 rounded border px-1 text-[10px] text-[color:var(--color-muted)]">
                            {CHANNEL_LABEL[c.channel] ?? c.channel}
                          </span>
                          <span className="truncate">
                            {c.contact.displayName ?? c.contact.phone ?? "ลูกค้า"}
                          </span>
                        </span>
                        {c.staffUnreadCount > 0 && (
                          <span className="shrink-0 rounded-full border px-1.5 text-[10px] font-medium">
                            {c.staffUnreadCount}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-[color:var(--color-muted)]">
                          {c.lastMessagePreview ?? "—"}
                        </span>
                        <StatusChip
                          value={c.status}
                          map={CONV_STATUS_LABEL}
                          tone={c.status === "OPEN" ? "strong" : "muted"}
                        />
                      </span>
                    </Link>
                  );
                })
              )}
            </aside>

            {/* ห้องแชท */}
            <div className="flex min-h-[360px] flex-col">
              {!active ? (
                <div className="flex flex-1 items-center justify-center py-10">
                  <p className="text-sm text-[color:var(--color-muted)]">
                    เลือกบทสนทนาทางซ้ายเพื่อดูและตอบกลับ
                  </p>
                </div>
              ) : (
                <ThreadPane
                  systemId={systemId}
                  tenantId={tenantId}
                  conversationId={active.id}
                  userId={userId}
                  nameOf={nameOf}
                  staff={staff}
                  memberLinked={!!setting.memberSystemId}
                  unitAccess={unitAccess}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// <ChatChannelsSection systemId tenantId /> — เชื่อมช่องทาง: LINE OA · แชทหน้าเว็บ · ระบบสมาชิก
// ─────────────────────────────────────────────────────────────
export async function ChatChannelsSection({
  systemId,
  tenantId,
}: {
  systemId: string;
  tenantId: string;
}) {
  // built-in WEBCHAT connection (lazy) + ช่องทางอื่น
  await ensureWebchatConnection(tenantId, systemId);
  const [connections, setting] = await Promise.all([
    listConnections(tenantId, systemId),
    getSetting(tenantId, systemId),
  ]);

  // ระบบสมาชิกในร้าน (สำหรับ dropdown เชื่อม)
  const memberSystems = await prisma.appSystem.findMany({
    where: { tenantId, type: "MEMBER" },
    orderBy: { createdAt: "asc" },
  });

  const lineConns = connections.filter((c) => c.type === "LINE");
  const webchat = connections.find((c) => c.type === "WEBCHAT");

  return (
    <section className="flex flex-col gap-4">
      {/* ── ตั้งค่าช่องทาง (setup) ── */}
      <div className="card">
        <h2 className="text-sm font-medium">ตั้งค่าช่องทางและการเชื่อมต่อ</h2>
        <div className="mt-3 flex flex-col gap-5">
          {/* LINE */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">LINE OA</h3>
            {lineConns.length > 0 ? (
              <div className="flex flex-col gap-2">
                {lineConns.map((c) => {
                  const m = maskedConnection(c);
                  return (
                    <div
                      key={c.id}
                      className="flex flex-col gap-1 rounded-lg border px-3 py-2 text-sm"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{m.displayName}</span>
                        <StatusChip
                          value={c.status}
                          map={{ CONNECTED: "เชื่อมแล้ว", DISABLED: "ปิดอยู่", ERROR: "มีปัญหา", EXPIRED: "หลุดการเชื่อม" }}
                          tone={c.status === "CONNECTED" ? "strong" : "danger"}
                        />
                      </div>
                      <div className="text-xs text-[color:var(--color-muted)]">
                        Token: {m.tokenPreview || "—"}
                        {c.lastInboundAt ? ` · รับล่าสุด ${fmt(c.lastInboundAt)}` : ""}
                      </div>
                      <div className="break-all rounded bg-[color:var(--color-surface-2)] px-2 py-1 text-xs">
                        Webhook URL: {origin()}/api/chat/webhook/{c.id}
                      </div>
                      <div className="text-xs text-[color:var(--color-muted)]">
                        วาง URL นี้ในช่อง Webhook ที่ LINE Developers Console แล้วเปิด &quot;Use
                        webhook&quot;
                      </div>
                      {c.status !== "DISABLED" && (
                        <ConfirmDialog
                          triggerLabel="ถอดการเชื่อม"
                          triggerClassName="self-start text-xs text-[color:var(--color-danger)] underline"
                          title="ถอดการเชื่อม LINE นี้?"
                          detail="บทสนทนาเก่ายังอ่านได้ แต่จะตอบกลับผ่าน LINE ไม่ได้จนกว่าจะเชื่อมใหม่"
                          confirmLabel="ยืนยันถอด"
                          danger
                          action={disableConnectionAction}
                          fields={{ systemId, connectionId: c.id }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[color:var(--color-muted)]">
                ยังไม่ได้เชื่อม LINE — สร้าง Messaging API channel ใน LINE Developers Console
                แล้วนำ Channel access token กับ Channel secret มาวางด้านล่าง
              </p>
            )}

            <form action={connectLineAction} className="flex flex-col gap-2">
              <input type="hidden" name="systemId" value={systemId} />
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                ชื่อเรียก
                <input name="displayName" placeholder="LINE OA ร้านของฉัน" className="input" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                Channel access token
                <input name="channelAccessToken" required className="input" />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                Channel secret
                <input name="channelSecret" required className="input" />
              </label>
              <SubmitButton variant="ghost" pendingText="กำลังเชื่อม…">
                เชื่อม LINE
              </SubmitButton>
            </form>
          </div>

          {/* WEBCHAT */}
          <div className="flex flex-col gap-2 border-t pt-4">
            <h3 className="text-sm font-medium">แชทหน้าเว็บ</h3>
            <p className="text-xs text-[color:var(--color-muted)]">
              เปิดใช้อัตโนมัติ — ฝังลิงก์นี้บนหน้าเว็บ/สื่อของคุณเพื่อให้ลูกค้าทักเข้ามา
            </p>
            {webchat && (
              <div className="break-all rounded bg-[color:var(--color-surface-2)] px-2 py-1 text-xs">
                {origin()}/chat/{webchat.id}
              </div>
            )}
          </div>

          {/* เชื่อมระบบสมาชิก */}
          <div className="flex flex-col gap-2 border-t pt-4">
            <h3 className="text-sm font-medium">เชื่อมระบบสมาชิก</h3>
            <p className="text-xs text-[color:var(--color-muted)]">
              เชื่อมแล้วจะผูกลูกค้าในแชทเข้ากับโปรไฟล์สมาชิก เห็นเบอร์/ประวัติได้
            </p>
            <form action={setMemberSystemAction} className="flex gap-2">
              <input type="hidden" name="systemId" value={systemId} />
              <select name="memberSystemId" defaultValue={setting.memberSystemId ?? ""} className="input flex-1">
                <option value="">ไม่เชื่อม</option>
                {memberSystems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <SubmitButton variant="ghost" pendingText="กำลังบันทึก…">
                บันทึก
              </SubmitButton>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────── Thread pane ─────────────────────────

async function ThreadPane({
  systemId,
  tenantId,
  conversationId,
  userId,
  nameOf,
  staff,
  memberLinked,
  unitAccess,
}: {
  systemId: string;
  tenantId: string;
  conversationId: string;
  userId: string;
  nameOf: (uid?: string | null) => string;
  staff: { userId: string; name: string }[];
  memberLinked: boolean;
  unitAccess: string[];
}) {
  const thread = await getThread({ tenantId, systemId, conversationId, unitAccess });
  if (!thread) {
    return <p className="text-sm text-[color:var(--color-muted)]">ไม่พบบทสนทนา</p>;
  }
  const { conversation: c, messages } = thread;
  const contact = c.contact;
  const linkedMember = contact.customerId ? await getLinkedMember(tenantId, contact.customerId) : null;
  const disabled = c.status === "RESOLVED";

  return (
    <div className="flex flex-1 flex-col gap-2">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="rounded border px-1 text-[10px] text-[color:var(--color-muted)]">
              {CHANNEL_LABEL[c.channel] ?? c.channel}
            </span>
            <span className="truncate">{contact.displayName ?? contact.phone ?? "ลูกค้า"}</span>
          </div>
          <div className="text-xs text-[color:var(--color-muted)]">
            ผู้รับผิดชอบ: {nameOf(c.assigneeUserId)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip
            value={c.status}
            map={CONV_STATUS_LABEL}
            tone={c.status === "OPEN" ? "strong" : "muted"}
          />
        </div>
      </div>

      {/* action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <form action={assignAction}>
          <input type="hidden" name="systemId" value={systemId} />
          <input type="hidden" name="conversationId" value={c.id} />
          <input type="hidden" name="assigneeUserId" value="me" />
          <button className="btn btn-ghost text-xs">รับเรื่องเอง</button>
        </form>
        <form action={assignAction} className="flex items-center gap-1">
          <input type="hidden" name="systemId" value={systemId} />
          <input type="hidden" name="conversationId" value={c.id} />
          <select name="assigneeUserId" defaultValue={c.assigneeUserId ?? "none"} className="input text-xs">
            <option value="none">ยังไม่มอบหมาย</option>
            {staff.map((s) => (
              <option key={s.userId} value={s.userId}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost text-xs">มอบหมาย</button>
        </form>
        {c.status !== "RESOLVED" ? (
          <>
            <form action={setStatusAction}>
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="conversationId" value={c.id} />
              <input type="hidden" name="status" value="PENDING" />
              <button className="btn btn-ghost text-xs">พักไว้</button>
            </form>
            <ConfirmDialog
              triggerLabel="ปิดบทสนทนา"
              triggerClassName="btn btn-ghost text-xs"
              title="ปิดบทสนทนานี้?"
              detail="ปิดแล้วยังอ่านได้ ถ้าลูกค้าทักกลับภายใน 24 ชม. จะเปิดต่อเธรดเดิม"
              confirmLabel="ยืนยันปิด"
              action={setStatusAction}
              fields={{ systemId, conversationId: c.id, status: "RESOLVED" }}
            />
          </>
        ) : (
          <form action={setStatusAction}>
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="conversationId" value={c.id} />
            <input type="hidden" name="status" value="OPEN" />
            <button className="btn btn-ghost text-xs">เปิดใหม่</button>
          </form>
        )}
        {c.staffUnreadCount > 0 && (
          <form action={markReadAction}>
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="conversationId" value={c.id} />
            <button className="btn btn-ghost text-xs">ทำเป็นอ่านแล้ว</button>
          </form>
        )}
      </div>

      {/* customer panel (ย่อ) */}
      <div className="rounded-lg border px-3 py-2 text-xs">
        <div className="font-medium">ข้อมูลลูกค้า</div>
        <div className="text-[color:var(--color-muted)]">
          {contact.phone ? `เบอร์ ${contact.phone}` : "ยังไม่มีเบอร์"}
          {linkedMember ? ` · สมาชิก ${linkedMember.name ?? linkedMember.memberCode}` : ""}
        </div>
        {memberLinked ? (
          contact.customerId ? (
            <form action={linkCustomerAction} className="mt-1">
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="conversationId" value={c.id} />
              <input type="hidden" name="contactId" value={contact.id} />
              <input type="hidden" name="unlink" value="1" />
              <button className="text-xs text-[color:var(--color-danger)] underline">
                ถอดการผูกสมาชิก
              </button>
            </form>
          ) : (
            <form action={linkCustomerAction} className="mt-1 flex items-center gap-1">
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="conversationId" value={c.id} />
              <input type="hidden" name="contactId" value={contact.id} />
              <input
                name="phone"
                inputMode="tel"
                placeholder="เบอร์โทรลูกค้า"
                defaultValue={contact.phone ?? ""}
                className="input text-xs"
              />
              <button className="btn btn-ghost text-xs">ผูกสมาชิก</button>
            </form>
          )
        ) : (
          <div className="mt-1 text-[color:var(--color-muted)]">
            เชื่อมระบบสมาชิกในตั้งค่าเพื่อผูกโปรไฟล์ลูกค้า
          </div>
        )}
      </div>

      {/* messages */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto py-1">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-[color:var(--color-muted)]">
            ยังไม่มีข้อความ
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} msg={m} nameOf={nameOf} />)
        )}
      </div>

      {/* composer */}
      {disabled ? (
        <p className="rounded-lg border px-3 py-2 text-xs text-[color:var(--color-muted)]">
          บทสนทนาปิดแล้ว — กด &quot;เปิดใหม่&quot; เพื่อตอบต่อ
        </p>
      ) : (
        <form action={sendReplyAction} className="flex flex-col gap-1">
          <input type="hidden" name="systemId" value={systemId} />
          <input type="hidden" name="conversationId" value={c.id} />
          <textarea
            name="body"
            required
            rows={2}
            placeholder="พิมพ์ข้อความตอบลูกค้า…"
            className="input"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs text-[color:var(--color-muted)]">
              <input type="checkbox" name="isInternal" /> โน้ตภายใน (ลูกค้าไม่เห็น)
            </label>
            <SubmitButton pendingText="กำลังส่ง…">ส่ง</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}

function MessageBubble({
  msg,
  nameOf,
}: {
  msg: {
    id: string;
    direction: string;
    type: string;
    body: string | null;
    isInternal: boolean;
    senderUserId: string | null;
    deliveryStatus: string;
    deliveryError: string | null;
    createdAt: Date;
  };
  nameOf: (uid?: string | null) => string;
}) {
  if (msg.type === "SYSTEM") {
    return (
      <div className="my-1 text-center text-xs text-[color:var(--color-muted)]">{msg.body}</div>
    );
  }
  const out = msg.direction === "OUT";
  const failed = msg.deliveryStatus === "FAILED";
  const bodyText =
    msg.body ?? (msg.type === "IMAGE" ? "[รูปภาพ]" : msg.type === "STICKER" ? "[สติกเกอร์]" : "");
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg border px-3 py-1.5 text-sm ${
          out ? "bg-[color:var(--color-surface-2)]" : ""
        } ${msg.isInternal ? "border-dashed" : ""} ${failed ? "border-[color:var(--color-danger)]" : ""}`}
      >
        {msg.isInternal && (
          <div className="text-[10px] text-[color:var(--color-muted)]">โน้ตภายใน</div>
        )}
        <div className="whitespace-pre-wrap break-words">{bodyText}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[color:var(--color-muted)]">
          <span>{out ? nameOf(msg.senderUserId) : "ลูกค้า"}</span>
          <span>{fmt(msg.createdAt)}</span>
          {failed && (
            <span className="text-[color:var(--color-danger)]">
              ส่งไม่สำเร็จ ({failReasonLabel(msg.deliveryError)})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function failReasonLabel(reason: string | null): string {
  switch (reason) {
    case "TOKEN_EXPIRED":
      return "การเชื่อมต่อหลุด";
    case "RATE_LIMITED":
      return "ส่งถี่เกินไป";
    case "CHANNEL_DISCONNECTED":
      return "ช่องทางถูกถอด";
    case "NETWORK_ERROR":
      return "เครือข่ายขัดข้อง";
    default:
      return "ลองใหม่อีกครั้ง";
  }
}
