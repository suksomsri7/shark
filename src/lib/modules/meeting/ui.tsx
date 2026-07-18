import Link from "next/link";
import { requireTenant } from "@/lib/core/context";
import {
  ensureWorkspace,
  listVisibleChannels,
  listStaff,
  listChannelMembers,
  listMessages,
  listThread,
  type Staff,
} from "./service";
import {
  postMessageAction,
  joinChannelAction,
  leaveChannelAction,
  createChannelAction,
  addChannelMemberAction,
  editMessageAction,
  deleteMessageAction,
} from "./actions";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { StatusChip } from "@/components/ui/StatusChip";
import { CHANNEL_KIND_LABEL } from "@/lib/ui/status-labels";

const fmt = (d: Date) =>
  d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });

// ป้ายห้องส่วนตัว (สาธารณะไม่ต้องแสดง chip)
const PrivateTag = ({ kind }: { kind: string }) =>
  kind === "PRIVATE" ? <StatusChip value={kind} map={CHANNEL_KIND_LABEL} tone="muted" /> : null;

type Msg = {
  id: string;
  authorUserId: string;
  body: string;
  replyCount: number;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  threadParentId: string | null;
};

// ─────────────────────────────────────────────────────────────
// <MeetingContent systemId tenantId /> — แชทภายในองค์กรแบบ Slack
// channelId/threadParentId (optional) มาจาก sub-route ?c= & ?t=
// ─────────────────────────────────────────────────────────────
export async function MeetingContent({
  systemId,
  tenantId,
  channelId,
  threadParentId,
}: {
  systemId: string;
  tenantId: string;
  channelId?: string;
  threadParentId?: string;
}) {
  const auth = await requireTenant();
  const userId = auth.user.id;

  const general = await ensureWorkspace(tenantId, systemId, userId);
  const [channels, staff] = await Promise.all([
    listVisibleChannels(tenantId, systemId, userId),
    listStaff(tenantId),
  ]);
  const nameOf = (uid: string) => staff.find((s) => s.userId === uid)?.name ?? "ผู้ใช้";

  const active =
    channels.find((c) => c.id === channelId) ??
    channels.find((c) => c.id === general.id) ??
    channels[0];

  const base = `/app/sys/${systemId}/meeting`;

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">แชทภายในองค์กร</h2>
        <span className="text-xs text-[color:var(--color-muted)]">{channels.length} ห้อง</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        {/* ── รายการห้อง (sidebar) ── */}
        <aside className="flex flex-col gap-1">
          {channels.map((c) => {
            const on = active && c.id === active.id;
            return (
              <Link
                key={c.id}
                href={`${base}?c=${c.id}`}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm ${
                  on
                    ? "bg-[color:var(--color-surface-2)] font-medium"
                    : "hover:bg-[color:var(--color-surface-2)]"
                } ${c.isMember ? "" : "text-[color:var(--color-muted)]"}`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{c.name}</span>
                  <PrivateTag kind={c.kind} />
                </span>
                <span className="ml-1 shrink-0 text-xs text-[color:var(--color-muted)]">
                  {c.memberCount}
                </span>
              </Link>
            );
          })}

          {/* สร้างห้องใหม่ */}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-[color:var(--color-muted)]">
              + สร้างห้อง
            </summary>
            <form action={createChannelAction} className="mt-2 flex flex-col gap-1.5">
              <input type="hidden" name="systemId" value={systemId} />
              <input
                name="name"
                required
                placeholder="ชื่อห้อง"
                className="input"
              />
              <input
                name="topic"
                placeholder="หัวข้อ (ไม่บังคับ)"
                className="input"
              />
              <select name="kind" className="input">
                <option value="PUBLIC">สาธารณะ</option>
                <option value="PRIVATE">ส่วนตัว</option>
              </select>
              <button className="btn btn-ghost text-sm">สร้าง</button>
            </form>
          </details>
        </aside>

        {/* ── แผงขวา: ห้อง หรือ เธรด ── */}
        <div className="flex min-h-[320px] flex-col gap-2">
          {!active ? (
            <p className="text-sm text-[color:var(--color-muted)]">ยังไม่มีห้อง</p>
          ) : threadParentId ? (
            <ThreadPane
              systemId={systemId}
              channel={active}
              threadParentId={threadParentId}
              userId={userId}
              nameOf={nameOf}
              base={base}
            />
          ) : (
            <ChannelPane
              systemId={systemId}
              channel={active}
              userId={userId}
              nameOf={nameOf}
              staff={staff}
              base={base}
            />
          )}
        </div>
      </div>
    </section>
  );
}

type ChannelView = {
  id: string;
  name: string;
  kind: string;
  topic: string | null;
  isDefault: boolean;
  isMember: boolean;
  memberCount: number;
};

async function ChannelPane({
  systemId,
  channel,
  userId,
  nameOf,
  staff,
  base,
}: {
  systemId: string;
  channel: ChannelView;
  userId: string;
  nameOf: (uid: string) => string;
  staff: Staff[];
  base: string;
}) {
  return (
    <>
      <ChannelHeader systemId={systemId} channel={channel} />
      {channel.isMember && (
        <ChannelMembers systemId={systemId} channel={channel} staff={staff} />
      )}
      {!channel.isMember ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8">
          <p className="text-sm text-[color:var(--color-muted)]">
            คุณยังไม่ได้อยู่ในห้องนี้
          </p>
          <form action={joinChannelAction}>
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="channelId" value={channel.id} />
            <button className="btn btn-ghost text-sm">เข้าร่วมห้อง</button>
          </form>
        </div>
      ) : (
        <>
          <MessageList
            systemId={systemId}
            channelId={channel.id}
            userId={userId}
            nameOf={nameOf}
            base={base}
          />
          <Composer systemId={systemId} channelId={channel.id} />
        </>
      )}
    </>
  );
}

// รายชื่อสมาชิกห้อง + เชิญ staff ที่ยังไม่อยู่ในห้อง (เน้นห้อง PRIVATE ที่ browse/join เองไม่ได้)
async function ChannelMembers({
  systemId,
  channel,
  staff,
}: {
  systemId: string;
  channel: ChannelView;
  staff: Staff[];
}) {
  const members = await listChannelMembers(systemId, channel.id);
  const memberIds = new Set(members.map((m) => m.userId));
  const invitable = staff.filter((s) => !memberIds.has(s.userId));
  const nameOf = (uid: string) => staff.find((s) => s.userId === uid)?.name ?? "ผู้ใช้";

  return (
    <details className="border-b pb-2">
      <summary className="cursor-pointer text-xs text-[color:var(--color-muted)]">
        สมาชิก {members.length} คน
        {channel.kind === "PRIVATE" ? " · เชิญเข้าห้อง" : ""}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        <ul className="flex flex-wrap gap-1.5">
          {members.map((m) => (
            <li
              key={m.userId}
              className="rounded-full bg-[color:var(--color-surface-2)] px-2.5 py-1 text-xs"
            >
              {nameOf(m.userId)}
              {m.isAdmin ? " · แอดมิน" : ""}
            </li>
          ))}
        </ul>
        {invitable.length > 0 ? (
          <form action={addChannelMemberAction} className="flex items-end gap-2">
            <input type="hidden" name="systemId" value={systemId} />
            <input type="hidden" name="channelId" value={channel.id} />
            <select name="targetUserId" required className="input flex-1">
              {invitable.map((s) => (
                <option key={s.userId} value={s.userId}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost text-sm">เชิญสมาชิก</button>
          </form>
        ) : (
          <p className="text-xs text-[color:var(--color-muted)]">พนักงานทุกคนอยู่ในห้องนี้แล้ว</p>
        )}
      </div>
    </details>
  );
}

async function MessageList({
  systemId,
  channelId,
  userId,
  nameOf,
  base,
}: {
  systemId: string;
  channelId: string;
  userId: string;
  nameOf: (uid: string) => string;
  base: string;
}) {
  const messages = (await listMessages(systemId, channelId)) as Msg[];
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-8">
        <p className="text-sm text-[color:var(--color-muted)]">
          ยังไม่มีข้อความ — เริ่มบทสนทนาได้เลย
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
      {messages.map((m) => (
        <div key={m.id}>
          <MessageRow
            systemId={systemId}
            channelId={channelId}
            msg={m}
            userId={userId}
            nameOf={nameOf}
          />
          <Link
            href={`${base}?c=${channelId}&t=${m.id}`}
            className="ml-1 mt-0.5 inline-block text-xs text-[color:var(--color-muted)] underline"
          >
            {m.replyCount > 0 ? `${m.replyCount} ตอบกลับ` : "ตอบกลับในเธรด"}
          </Link>
        </div>
      ))}
    </div>
  );
}

function MessageRow({
  systemId,
  channelId,
  msg,
  userId,
  nameOf,
  threadParentId,
}: {
  systemId: string;
  channelId: string;
  msg: Msg;
  userId: string;
  nameOf: (uid: string) => string;
  threadParentId?: string;
}) {
  const mine = msg.authorUserId === userId;
  if (msg.deletedAt) {
    return (
      <div className="rounded-lg px-1 py-0.5 text-sm text-[color:var(--color-muted)] italic">
        ข้อความถูกลบ
      </div>
    );
  }
  return (
    <div className="rounded-lg px-1 py-0.5">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium">{nameOf(msg.authorUserId)}</span>
        <span className="text-xs text-[color:var(--color-muted)]">{fmt(msg.createdAt)}</span>
        {msg.editedAt && (
          <span className="text-xs text-[color:var(--color-muted)]">(แก้ไขแล้ว)</span>
        )}
      </div>
      <div className="whitespace-pre-wrap break-words text-sm">{msg.body}</div>
      {mine && (
        <div className="mt-0.5 flex items-center gap-2">
          <details className="inline">
            <summary className="cursor-pointer text-xs text-[color:var(--color-muted)]">
              แก้ไข
            </summary>
            <form action={editMessageAction} className="mt-1 flex flex-col gap-1">
              <input type="hidden" name="systemId" value={systemId} />
              <input type="hidden" name="channelId" value={channelId} />
              <input type="hidden" name="messageId" value={msg.id} />
              {threadParentId && (
                <input type="hidden" name="threadParentId" value={threadParentId} />
              )}
              <textarea
                name="body"
                defaultValue={msg.body}
                rows={2}
                className="input"
              />
              <button className="btn btn-ghost self-start text-xs">บันทึก</button>
            </form>
          </details>
          <ConfirmDialog
            triggerLabel="ลบ"
            triggerClassName="text-xs text-[color:var(--color-danger)] underline"
            title="ลบข้อความนี้?"
            detail="ข้อความจะถูกลบถาวร"
            confirmLabel="ยืนยันลบ"
            danger
            action={deleteMessageAction}
            fields={{
              systemId,
              channelId,
              messageId: msg.id,
              ...(threadParentId ? { threadParentId } : {}),
            }}
          />
        </div>
      )}
    </div>
  );
}

function Composer({
  systemId,
  channelId,
  threadParentId,
}: {
  systemId: string;
  channelId: string;
  threadParentId?: string;
}) {
  return (
    <form action={postMessageAction} className="mt-1 flex items-end gap-2">
      <input type="hidden" name="systemId" value={systemId} />
      <input type="hidden" name="channelId" value={channelId} />
      {threadParentId && <input type="hidden" name="threadParentId" value={threadParentId} />}
      <textarea
        name="body"
        required
        rows={1}
        placeholder={threadParentId ? "ตอบในเธรด…" : "พิมพ์ข้อความ…"}
        className="input flex-1"
      />
      <button className="btn btn-ghost text-sm">ส่ง</button>
    </form>
  );
}

function ChannelHeader({
  systemId,
  channel,
}: {
  systemId: string;
  channel: ChannelView;
}) {
  return (
    <div className="flex items-center justify-between border-b pb-2">
      <div>
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          {channel.name}
          <PrivateTag kind={channel.kind} />
        </div>
        {channel.topic && (
          <div className="text-xs text-[color:var(--color-muted)]">{channel.topic}</div>
        )}
      </div>
      {channel.isMember && !channel.isDefault && (
        <ConfirmDialog
          triggerLabel="ออกจากห้อง"
          triggerClassName="text-xs text-[color:var(--color-muted)] underline"
          title="ออกจากห้องนี้?"
          detail="คุณจะไม่เห็นข้อความในห้องนี้ จนกว่าจะเข้าร่วมใหม่"
          confirmLabel="ยืนยันออกจากห้อง"
          action={leaveChannelAction}
          fields={{ systemId, channelId: channel.id }}
        />
      )}
    </div>
  );
}

async function ThreadPane({
  systemId,
  channel,
  threadParentId,
  userId,
  nameOf,
  base,
}: {
  systemId: string;
  channel: ChannelView;
  threadParentId: string;
  userId: string;
  nameOf: (uid: string) => string;
  base: string;
}) {
  const { parent, replies } = await listThread(systemId, threadParentId);
  return (
    <>
      <div className="flex items-center justify-between border-b pb-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          เธรด · {channel.name}
          <PrivateTag kind={channel.kind} />
        </div>
        <Link
          href={`${base}?c=${channel.id}`}
          className="text-xs text-[color:var(--color-muted)] underline"
        >
          ← กลับห้อง
        </Link>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {!parent ? (
          <p className="text-sm text-[color:var(--color-muted)]">ไม่พบข้อความต้นเธรด</p>
        ) : (
          <>
            <MessageRow
              systemId={systemId}
              channelId={channel.id}
              msg={parent as Msg}
              userId={userId}
              nameOf={nameOf}
              threadParentId={threadParentId}
            />
            <div className="border-t pt-1 text-xs text-[color:var(--color-muted)]">
              {replies.length} ตอบกลับ
            </div>
            {(replies as Msg[]).map((r) => (
              <MessageRow
                key={r.id}
                systemId={systemId}
                channelId={channel.id}
                msg={r}
                userId={userId}
                nameOf={nameOf}
                threadParentId={threadParentId}
              />
            ))}
          </>
        )}
      </div>

      {channel.isMember && (
        <Composer systemId={systemId} channelId={channel.id} threadParentId={threadParentId} />
      )}
    </>
  );
}
