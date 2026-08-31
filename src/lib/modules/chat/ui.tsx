import { prisma } from "@/lib/core/db";
import { publicOrigin } from "@/lib/core/origin";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { StatusChip } from "@/components/ui/StatusChip";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { ChatMarkReadOnOpen } from "@/components/chat-mark-read-on-open";
import {
  ensureWebchatConnection,
  ensureMemberSystemLink,
  listConnections,
  getSetting,
  listStaff,
  maskedConnection,
} from "./service";
import { isSupported } from "./adapter";
import {
  connectLineAction,
  disableConnectionAction,
  setMemberSystemAction,
  setRetentionDaysAction,
  setBusinessHoursAction,
  archiveAnswerExampleAction,
} from "./actions";
import { loadInboxAction, loadThreadAction, setChatAiSettingsAction } from "./inbox-actions";
import { requireChatRead, canReadChat, membershipOf } from "./guard";
import { evaluate } from "@/lib/core/rbac";
import { listAnswerExamples } from "./learning";
import { ChatInboxClient } from "./inbox-client";
import { CHANNEL_ORDER, ChannelChip } from "./channel-icon";
import { ALLOWED_UPLOAD_TYPES, CHAT_ATTACHMENT_MAX_BYTES } from "@/lib/storage/service";
import { RETENTION_MIN_DAYS, RETENTION_MAX_DAYS } from "./retention";
import {
  DAY_LABELS,
  DEFAULT_TZ,
  MAX_NOTE_LEN,
  TIME_PATTERN,
  TZ_CHOICES,
  readBusinessHours,
} from "./business-hours";

// 🔴 ป้ายช่องทางไม่มีลิสต์อยู่ในไฟล์นี้แล้ว — ทะเบียนเดียวอยู่ที่ `channel-icon.tsx`
//    (หนี้ H4: เดิมมีลิสต์พิมพ์มือ 3 ที่ แล้ว `APP`/`TIKTOK` ได้ป้ายว่างโดยที่ typecheck ไม่แดง)

const fmt = (d: Date) =>
  d.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  });

// แท็บฟังก์ชันย่อยของระบบแชท
// ⚠️ ต้องตรงกับ childrenFor("CHAT") ใน src/app/app/layout.tsx (ตรวจโดย qc-nav-functions + qc-chat-inbox-ui)
export function chatTabs(systemId: string): { href: string; label: string }[] {
  const s = `/app/sys/${systemId}`;
  // 🔴 2 แท็บเท่านั้น (§6.1) — "ภาพรวม" **คือกล่องแชทเต็มจอ** ตั้งแต่ WO-CW4 แล้ว
  //    แท็บ "สนทนา" เดิมชี้ `/chat` ซึ่งตอนนี้ redirect กลับมาที่เดียวกัน = แท็บซ้ำที่พาไปที่เดิม
  //    (ไฟล์ `/chat/page.tsx` ยังต้องคงอยู่ — push ที่ส่งออกไปแล้วชี้มาที่ `?c=` ของ path นั้น)
  //    ⚠️ ต้องตรงกับ childrenFor("CHAT") ใน src/app/app/layout.tsx เสมอ (qc-nav-functions เฝ้าอยู่)
  return [
    { href: s, label: "ภาพรวม" },
    { href: `${s}/chat/channels`, label: "เชื่อมช่องทาง" },
  ];
}

// ─────────────────────────────────────────────────────────────
// <ChatInboxSection /> — กล่องแชทเต็มจอ (เดิมหน้าภาพรวมเป็นการ์ด 2 ใบ = G1)
//
// 🔴 `requireChatRead()` ต้องเป็นบรรทัดแรกสุด **ก่อน** แตะข้อมูลใด ๆ (ปิด G8 ขาอ่าน)
//    ช่องโหว่เดิม: STAFF ที่เข้าถึงสาขาได้ อ่านแชทลูกค้าทุกห้องได้ทั้งที่ไม่มีสิทธิ์แชทสักข้อ
//    ด่านต้องอยู่ก่อน query ไม่ใช่หลัง — query ที่วิ่งไปแล้วคือข้อมูลที่ถูกอ่านขึ้นมาแล้วจริง ๆ
// ─────────────────────────────────────────────────────────────
export async function ChatInboxSection({
  systemId,
  tenantId,
  conversationId,
  err,
}: {
  systemId: string;
  tenantId: string;
  conversationId?: string;
  err?: string;
}) {
  const auth = await requireChatRead();
  const ctx = membershipOf(auth);
  const can = (action: string) => evaluate(ctx, { module: "chat", action });

  await ensureWebchatConnection(tenantId, systemId);
  const [rows, thread, staff, setting] = await Promise.all([
    loadInboxAction(systemId),
    conversationId ? loadThreadAction(systemId, conversationId) : Promise.resolve(null),
    listStaff(tenantId),
    getSetting(tenantId, systemId),
  ]);

  // ปุ่มที่ "กินเงินของร้าน" ต้องเปิดใช้ **และ** มีสิทธิ์ทั้งคู่ ไม่งั้นไม่ต้องโชว์เลย
  const canSuggest = setting.aiSuggestEnabled && can("chat.ai.suggest");
  const canTranslate = setting.translateEnabled && can("chat.translate.use");

  return (
    <>
      {/* ⚠️ ตัวนี้ยิง markRead ตอนเปิดห้อง (ด่าน CP-3.5) — ซ้อนกับ heartbeat ใน loadThreadAction
          โดยตั้งใจ: heartbeat ทำงานฝั่ง poll ส่วนตัวนี้ทำงานตั้งแต่ก่อน JS ของกล่องแชทพร้อม */}
      {thread && (
        <ChatMarkReadOnOpen
          systemId={systemId}
          conversationId={thread.conversationId}
          unread={thread.staffUnreadCount}
        />
      )}
      <ChatInboxClient
        systemId={systemId}
        baseHref={`/app/sys/${systemId}`}
        meUserId={auth.user.id}
        staff={staff.map((s) => ({ userId: s.userId, name: s.name }))}
        initialRows={rows}
        initialThread={thread}
        activeId={conversationId ?? null}
        err={err ?? null}
        canSend={can("chat.message.send")}
        canAssign={can("chat.conversation.assign")}
        canSetStatus={can("chat.conversation.setStatus")}
        canLink={can("chat.customer.link")}
        canSuggest={canSuggest}
        canTranslate={canTranslate}
        memberLinked={!!setting.memberSystemId}
        maxAttachmentBytes={CHAT_ATTACHMENT_MAX_BYTES}
        acceptTypes={Object.keys(ALLOWED_UPLOAD_TYPES).join(",")}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// <ChatChannelsSection /> — เชื่อมช่องทาง + ตั้งค่า + คลังตัวอย่างคำตอบ
// ─────────────────────────────────────────────────────────────
export async function ChatChannelsSection({
  systemId,
  tenantId,
  err,
}: {
  systemId: string;
  tenantId: string;
  /** ข้อความผิดพลาดจาก `?err=` (แสดง inline ใต้หัวข้อที่เกี่ยว ไม่ใช่ Alert) */
  err?: string;
}) {
  const auth = await requireChatRead();
  await ensureWebchatConnection(tenantId, systemId);
  await ensureMemberSystemLink(tenantId, systemId);
  const [connections, setting, origin] = await Promise.all([
    listConnections(tenantId, systemId),
    getSetting(tenantId, systemId),
    publicOrigin(),
  ]);

  const memberSystems = await prisma.appSystem.findMany({
    where: { tenantId, type: "MEMBER" },
    orderBy: { createdAt: "asc" },
  });

  const lineConns = connections.filter((c) => c.type === "LINE");
  const webchat = connections.find((c) => c.type === "WEBCHAT");

  // 🔴 คลังตัวอย่างคำตอบเก็บ **ข้อความจริงของลูกค้า** ไว้ในช่อง question ⇒ ต้องใช้สิทธิ์ชุดเดียว
  //    กับการอ่านกล่องแชท · คนที่มีแค่สิทธิ์ตั้งค่าช่องทางต้องไม่เห็นเนื้อความลูกค้าผ่านทางนี้
  const mayReadChat = canReadChat(auth);
  const examples = mayReadChat
    ? await listAnswerExamples({ tenantId, systemId, includeArchived: true, take: 50 })
    : [];

  const hours = readBusinessHours(setting.businessHours);
  const noteTh =
    typeof hours?.note === "string"
      ? hours.note
      : typeof (hours?.note as Record<string, unknown> | undefined)?.th === "string"
        ? ((hours!.note as Record<string, string>).th ?? "")
        : "";
  const tzOptions = TZ_CHOICES.some((t) => t.value === (hours?.tz ?? DEFAULT_TZ))
    ? TZ_CHOICES
    : [{ value: hours!.tz, label: hours!.tz }, ...TZ_CHOICES];

  return (
    <section className="flex flex-col gap-4">
      {/* ── ช่องทางทั้งหมด + สถานะจริง ─────────────────────────────────────
          🔴 ป้าย "ยังไม่เปิด" มาจาก registry ของ adapter (`isSupported`) ไม่ใช่ลิสต์พิมพ์มือ
             ⇒ วันที่เขียน adapter เสร็จ ป้ายเปลี่ยนเอง ไม่มีทางค้างโกหกเจ้าของ
          ⚠️ มีไอคอน ≠ ใช้ได้ — คอขวดของ WhatsApp/Messenger/IG/TikTok คือการอนุมัติของแพลตฟอร์ม */}
      <div className="card">
        <h2 className="text-sm font-medium">ช่องทางที่ระบบรองรับ</h2>
        <p className="mt-1 text-xs text-[color:var(--color-muted)]">
          ช่องทางที่ขึ้นว่า “ยังไม่เปิด” คือยังรับ-ส่งข้อความจริงไม่ได้
          (รอการอนุมัติจากเจ้าของแพลตฟอร์มนั้น ไม่ใช่รอเราเขียนโค้ด) — ไอคอนที่เห็นในกล่องแชทมีไว้บอกที่มาของข้อความเท่านั้น
        </p>
        <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {CHANNEL_ORDER.map((type) => {
            const conn = connections.find((c) => c.type === type && c.status !== "DISABLED");
            const ready = isSupported(type);
            return (
              <li
                key={type}
                className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--color-line)] px-2.5 py-1.5"
              >
                <ChannelChip type={type} />
                <span className="text-xs text-[color:var(--color-muted)]">
                  {!ready
                    ? "ยังไม่เปิด"
                    : conn
                      ? "เชื่อมแล้ว"
                      : "พร้อมเชื่อม"}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── ตั้งค่าช่องทางและการเชื่อมต่อ ── */}
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
                        Webhook URL: {origin}/api/chat/webhook/{c.id}
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
                <a
                  href={`${origin}/chat/${webchat.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {origin}/chat/{webchat.id}
                </a>
              </div>
            )}
          </div>

          {/* เชื่อมระบบสมาชิก */}
          <div className="flex flex-col gap-2 border-t pt-4">
            <h3 className="text-sm font-medium">เชื่อมระบบสมาชิก</h3>
            <p className="text-xs text-[color:var(--color-muted)]">
              เชื่อมแล้วจะผูกลูกค้าในแชทเข้ากับโปรไฟล์สมาชิก เห็นเบอร์/ประวัติได้ ·
              {memberSystems.length === 1
                ? " ร้านมีระบบสมาชิกชุดเดียว ระบบจึงเชื่อมให้อัตโนมัติ (เปลี่ยนเป็นไม่เชื่อมได้)"
                : memberSystems.length > 1
                  ? " ร้านมีระบบสมาชิกหลายชุด ต้องเลือกเองว่าจะผูกกับชุดไหน"
                  : " ยังไม่มีระบบสมาชิกในร้าน — สร้างแล้วระบบจะเชื่อมให้เอง"}
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

          {/* เวลาทำการของทีมตอบแชท (WO-C16) */}
          <div className="flex flex-col gap-2 border-t pt-4">
            <h3 className="text-sm font-medium">เวลาทำการของทีมตอบแชท</h3>
            <p className="text-xs text-[color:var(--color-muted)]">
              ตั้งแล้วหน้าจอแชทของลูกค้าจะบอกว่าทีมงานตอบช่วงไหน (เช่น &quot;ทีมงานตอบ 9:00–18:00
              น.&quot;) — ไม่ตั้งไว้ = ไม่แสดงอะไรเลย ไม่ใช่ตอบ 24 ชม.
            </p>
            {err && (
              <p className="text-xs text-[color:var(--color-danger)]" role="alert">
                {err}
              </p>
            )}
            <form action={setBusinessHoursAction} className="flex flex-col gap-3">
              <input type="hidden" name="systemId" value={systemId} />
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={!!hours}
                  className="size-4 shrink-0"
                />
                แสดงเวลาทำการให้ลูกค้าเห็น
              </label>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                เขตเวลา
                <select name="tz" defaultValue={hours?.tz ?? DEFAULT_TZ} className="input">
                  {tzOptions.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-col gap-1.5">
                {DAY_LABELS.map((label, d) => {
                  const row = hours?.days.find((x) => x.d === d);
                  return (
                    <div key={d} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        name={`day-${d}`}
                        defaultChecked={!!row}
                        className="size-4 shrink-0"
                      />
                      <span className="w-12 shrink-0">{label}</span>
                      <input
                        name={`open-${d}`}
                        defaultValue={row?.open ?? "09:00"}
                        placeholder="09:00"
                        pattern={TIME_PATTERN}
                        inputMode="numeric"
                        maxLength={5}
                        aria-label={`เวลาเปิดวัน${label}`}
                        className="input w-[4.5rem] shrink-0 px-2 text-center"
                      />
                      <span className="shrink-0 text-[color:var(--color-muted)]">–</span>
                      <input
                        name={`close-${d}`}
                        defaultValue={row?.close ?? "18:00"}
                        placeholder="18:00"
                        pattern={TIME_PATTERN}
                        inputMode="numeric"
                        maxLength={5}
                        aria-label={`เวลาปิดวัน${label}`}
                        className="input w-[4.5rem] shrink-0 px-2 text-center"
                      />
                    </div>
                  );
                })}
                <p className="text-xs text-[color:var(--color-muted)]">
                  วันที่ไม่ติ๊ก = วันหยุดประจำสัปดาห์ · ใช้เวลาแบบ 24 ชม. เช่น 09:00 และ 18:00
                </p>
              </div>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                วันหยุดเฉพาะกิจ (ปปปป-ดด-วว คั่นด้วยลูกน้ำ)
                <input
                  name="holidays"
                  defaultValue={(hours?.holidays ?? []).join(", ")}
                  placeholder="ปปปป-ดด-วว, ปปปป-ดด-วว"
                  className="input"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
                ข้อความเสริม (ต่อท้ายบรรทัดเวลาทำการ)
                <input
                  name="note"
                  defaultValue={noteTh}
                  maxLength={MAX_NOTE_LEN}
                  placeholder="นอกเวลาจะตอบให้เช้าวันถัดไป"
                  className="input"
                />
              </label>

              <SubmitButton variant="ghost" pendingText="กำลังบันทึก…">
                บันทึกเวลาทำการ
              </SubmitButton>
            </form>
          </div>

          {/* อายุการเก็บข้อความ (PDPA · WO-C12) */}
          <div className="flex flex-col gap-2 border-t pt-4">
            <h3 className="text-sm font-medium">อายุการเก็บข้อความ</h3>
            <p className="text-xs text-[color:var(--color-muted)]">
              ทุกวันระบบจะลบเนื้อหาข้อความและไฟล์แนบที่เก่ากว่าจำนวนวันที่ตั้งไว้ทิ้งถาวร
              บทสนทนายังอยู่ในรายการ แต่เนื้อหาจะหายไปและกู้คืนไม่ได้
            </p>
            <form action={setRetentionDaysAction} className="flex items-center gap-2">
              <input type="hidden" name="systemId" value={systemId} />
              <input
                name="retentionDays"
                type="number"
                inputMode="numeric"
                min={RETENTION_MIN_DAYS}
                max={RETENTION_MAX_DAYS}
                step={1}
                required
                defaultValue={setting.retentionDays}
                className="input w-24"
              />
              <span className="text-xs text-[color:var(--color-muted)]">
                วัน (ตั้งได้ {RETENTION_MIN_DAYS}–{RETENTION_MAX_DAYS})
              </span>
              <SubmitButton variant="ghost" pendingText="กำลังบันทึก…">
                บันทึก
              </SubmitButton>
            </form>
          </div>
        </div>
      </div>

      {/* ── ผู้ช่วย AI + การแปล ────────────────────────────────────────────
          🔴 ทั้งคู่ปิดอยู่โดยค่าเริ่มต้นเพราะ **มีค่าใช้จ่ายจริงต่อครั้ง** — ของที่กินเงินของร้าน
             ต้องให้เจ้าของกดเปิดเอง · ไม่เปิด = ปุ่มในกล่องแชทไม่โผล่เลย (ไม่ใช่โผล่แล้วกดไม่ได้) */}
      <div className="card">
        <h2 className="text-sm font-medium">ผู้ช่วย AI และการแปลภาษา</h2>
        <p className="mt-1 text-xs text-[color:var(--color-muted)]">
          เปิดแล้วทีมจะเห็นปุ่ม “AI แนะนำคำตอบ” และ “แปลก่อนส่ง” ในกล่องพิมพ์ ·
          ทั้งสองอย่างคิดค่าใช้จ่ายตามจำนวนครั้งที่กดใช้ และต้องให้สิทธิ์รายคนที่หน้าผู้ใช้งานด้วย
        </p>
        <form action={setChatAiSettingsAction} className="mt-3 flex flex-col gap-2">
          <input type="hidden" name="systemId" value={systemId} />
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              name="aiSuggestEnabled"
              defaultChecked={setting.aiSuggestEnabled}
              className="size-4 shrink-0"
            />
            เปิด “AI แนะนำคำตอบ”
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              name="translateEnabled"
              defaultChecked={setting.translateEnabled}
              className="size-4 shrink-0"
            />
            เปิด “การแปลข้อความ”
          </label>
          <label className="flex flex-col gap-1 text-xs text-[color:var(--color-muted)]">
            ภาษาที่ทีมอ่าน (ปลายทางของการแปลข้อความลูกค้า)
            <select name="staffLang" defaultValue={setting.staffLang} className="input w-40">
              <option value="th">ไทย</option>
              <option value="en">อังกฤษ</option>
              <option value="cn">จีน</option>
              <option value="ja">ญี่ปุ่น</option>
              <option value="ko">เกาหลี</option>
              <option value="de">เยอรมัน</option>
              <option value="fr">ฝรั่งเศส</option>
              <option value="ru">รัสเซีย</option>
            </select>
          </label>
          <SubmitButton variant="ghost" pendingText="กำลังบันทึก…">
            บันทึกการตั้งค่า AI
          </SubmitButton>
        </form>
      </div>

      {/* ── คลังตัวอย่างคำตอบ (§5.4 · ข้อ 9 ของเจ้าของ) ────────────────────
          🔴 ของที่คนแก้ไม่ได้ = ของที่เน่าแล้วซ่อมไม่ได้ — ถอดตัวอย่างที่ไม่ดีออกได้จากที่นี่
             ถอด = ปัก archivedAt ไม่ลบแถว (ตรวจย้อนได้ว่าเคยแนะนำอะไรผิดไป) */}
      <div className="card">
        <h2 className="text-sm font-medium">คลังตัวอย่างคำตอบ</h2>
        <p className="mt-1 text-xs text-[color:var(--color-muted)]">
          คำตอบที่ทีมกด “บันทึกเป็นตัวอย่างคำตอบ” ในกล่องแชท จะถูกเก็บไว้ที่นี่และถูกใช้เป็นตัวอย่างให้ AI
          ตอบได้ตรงขึ้นในครั้งถัดไป · ตัวอย่างที่ไม่ดีให้กด “ถอดออก” — ไม่ถูกลบทิ้ง แค่เลิกนำไปใช้
        </p>
        {!mayReadChat ? (
          <p className="mt-3 text-xs text-[color:var(--color-muted)]">
            คลังนี้เก็บข้อความจริงของลูกค้าไว้ด้วย — ต้องมีสิทธิ์ “ดูกล่องแชทลูกค้า” จึงจะเปิดดูได้
          </p>
        ) : examples.length === 0 ? (
          <p className="mt-3 text-xs text-[color:var(--color-muted)]">
            ยังไม่มีตัวอย่างในคลัง — เปิดกล่องแชท แล้วกด “บันทึกเป็นตัวอย่างคำตอบ” ใต้คำตอบที่ตอบได้ดี
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {examples.map((ex) => (
              <li
                key={ex.id}
                className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-xs ${
                  ex.archivedAt ? "border-dashed opacity-60" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <ChannelChip type={ex.channel} />
                  <span className="text-[color:var(--color-muted)]">
                    {ex.archivedAt ? "ถอดออกแล้ว" : `ถูกใช้ ${ex.useCount} ครั้ง`} · {fmt(ex.createdAt)}
                  </span>
                </div>
                <div>
                  <span className="text-[color:var(--color-muted)]">ลูกค้าถาม: </span>
                  <span className="whitespace-pre-wrap break-words">{ex.question}</span>
                </div>
                <div>
                  <span className="text-[color:var(--color-muted)]">ทีมตอบ: </span>
                  <span className="whitespace-pre-wrap break-words">{ex.answer}</span>
                </div>
                {!ex.archivedAt && (
                  <ConfirmDialog
                    triggerLabel="ถอดออกจากคลัง"
                    triggerClassName="self-start text-xs text-[color:var(--color-danger)] underline"
                    title="ถอดตัวอย่างคำตอบนี้ออก?"
                    detail="AI จะเลิกใช้ตัวอย่างนี้เป็นแนวทาง · ข้อความเดิมยังอยู่ในประวัติแชทตามปกติ"
                    confirmLabel="ยืนยันถอด"
                    danger
                    action={archiveAnswerExampleAction}
                    fields={{ systemId, exampleId: ex.id }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
