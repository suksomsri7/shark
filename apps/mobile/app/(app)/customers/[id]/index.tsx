// ห้องแชทลูกค้า (ใบ S2.18 · แบบ K2 sec-k.jpg หน้า 2 · sec-dark-k.jpg หน้า 2)
//   ข้อมูล (S1.21 · ชื่อเส้นในตาราง src/api/inbox.ts): GET inbox/conversations/[id]?systemId&before (cursor คู่) · POST …/read ตอนเปิด ·
//     POST …/assign (รับเรื่อง = มอบให้ตัวเอง · R-S1.21a) · GET inbox/systems (canReply) · GET inbox/quick-replies + POST quick-replies/[id]/apply ·
//     POST inbox/attachments (multipart ≤ 10 MB) · POST …/reply · POST …/ai-suggest (ยังไม่มี route ⇒ 404 = ซ่อนการ์ดร่าง)
//   🔴 3 แชทไม่ปน: ช่องพิมพ์ของจอนี้ส่งถึงลูกค้า (หรือบันทึกภายใน) ทาง …/reply เท่านั้น — ไม่มีเส้นห้องเลขาในไฟล์นี้ ·
//      ทุกการส่ง (พิมพ์เอง · การ์ดร่าง Shark · ส่งใหม่ฟองที่ล้ม) ผ่าน `Composer.post()` ที่เดียว (clientMessageId · 429 ลองใหม่อัตโนมัติ 1 ครั้งหลัง Retry-After)
//   ฟอง: ลูกค้า/เรา/บันทึกภายใน/ส่งโดย Shark (meta.ai → ป้ายผู้อนุมัติ · RESOLUTIONS §M)/ข้อความระบบ/สติกเกอร์/รูป/ไฟล์/เสียง/ส่งไม่สำเร็จ ✕
//   poll 5 วิ ขณะจออยู่และแอปอยู่หน้า (ออฟไลน์ถอยห่าง) · ไม่มี SSE · หน้าต่างตอบ 24 ชม. ของ Facebook/Instagram หมด ⇒ แถบเตือน + ตอบลูกค้าไม่ได้ (บันทึกภายในได้)
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AppState, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Glass, Icon, IconBtn, InputBar, Note } from "@/src/components/airy";
import { MessageBubble } from "@/src/components/customers/MessageBubble";
import { ChannelBadge, firstName, useChannelLabel } from "@/src/components/customers/parts";
import {
  InboxError,
  UPLOAD_MAX_BYTES,
  getCurrentSystem,
  inboxGet,
  inboxGetId,
  inboxNote,
  inboxPostId,
  inboxUpload,
  replyMessageId,
  replyWindowHours,
  statusOf,
  type MsgItem,
  type QuickReply,
  type ReplyAttachment,
  type Thread,
} from "@/src/api/inbox";
import { useAuth } from "@/src/lib/auth-context";
import { useT } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";

const POLL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;
/** 429: รอตาม Retry-After (สูงสุด 60 วิ) แล้วลองใหม่ 1 ครั้งด้วยรหัสเดิม (docs: 429 นับก่อนตรวจซ้ำ ⇒ ส่งซ้ำได้) */
const RETRY_CAP_SEC = 60;
const BUBBLE_IDS = { in: "cust-bubble-in", out: "cust-bubble-out", ai: "cust-bubble-ai", internal: "cust-bubble-internal", system: "cust-bubble-system" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Gone = "notFound" | "denied" | null;
type Draft = { id: string | null; body: string };

/** ผู้อนุมัติของข้อความที่ Shark ส่ง (meta.ai.approvedBy = userId ผู้อนุมัติ = ผู้ส่งของแถว) */
function approverOf(m: MsgItem): string | null {
  const ai = m.meta ? m.meta.ai : null;
  if (!ai) return null;
  return ai.approvedBy && ai.approvedBy === m.senderUserId ? firstName(m.senderName) || null : null;
}

export default function CustomerRoomScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const chLabel = useChannelLabel();
  const params = useLocalSearchParams<{ id?: string; s?: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const systemId = (typeof params.s === "string" && params.s) || getCurrentSystem() || undefined;
  const { activeTenantId, user } = useAuth();
  const myId = user?.id ?? null;

  const [thread, setThread] = useState<Thread | null>(null);
  const [older, setOlder] = useState<MsgItem[]>([]);
  const [olderNext, setOlderNext] = useState<string | null | undefined>(undefined);
  const [gone, setGone] = useState<Gone>(null);
  const [offline, setOffline] = useState(false);
  const [canReply, setCanReply] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(() => AppState.currentState !== "background");
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const tenantRef = useRef(activeTenantId);
  const inflight = useRef(false);
  const failCount = useRef(0);
  const readSent = useRef<string | null>(null);
  const draftAsked = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const atBottom = useRef(true);
  const composer = useRef<ComposerHandle>(null);

  useEffect(() => {
    tenantRef.current = activeTenantId;
    setThread(null);
    setOlder([]);
    setOlderNext(undefined);
    setGone(null);
    setDraft(null);
    readSent.current = null;
    draftAsked.current = false;
  }, [activeTenantId, id]);

  const load = useCallback(async () => {
    const tenant = activeTenantId;
    if (!tenant || !id || inflight.current) return;
    inflight.current = true;
    try {
      const th = await inboxGetId("inbox/conversations/[id]", id, { systemId });
      if (tenantRef.current !== tenant) return;
      failCount.current = 0;
      setThread(th);
      setOlderNext((v) => (v === undefined ? th.nextBefore : v));
      setGone(null);
      setOffline(false);
      setNowMs(Date.now());
      // อ่านแล้ว: ครั้งแรกที่เปิด + ทุกครั้งที่มีข้อความใหม่ (สิทธิ์ markRead ไม่มี = 403 เงียบ)
      const last = th.messages[th.messages.length - 1];
      if (last && readSent.current !== last.id) {
        readSent.current = last.id;
        void inboxPostId("inbox/conversations/[id]/read", id, { systemId, lastReadMessageId: last.id }).catch(() => {});
      }
      // การ์ดร่างของ Shark: ห้องมีร่างค้าง (aiDraft) ⇒ ขอครั้งเดียวต่อการเปิด · route ยังไม่มี/ล้ม = ไม่มีการ์ด
      if (th.conversation.aiDraft && !draftAsked.current) {
        draftAsked.current = true;
        inboxPostId("inbox/conversations/[id]/ai-suggest", id, { systemId })
          .then((r) => {
            const body = (r.options?.[0]?.body ?? r.body ?? "").trim();
            if (tenantRef.current === tenant && body) setDraft({ id: r.suggestionId ?? r.options?.[0]?.id ?? null, body });
          })
          .catch(() => {});
      }
    } catch (e) {
      if (tenantRef.current !== tenant) return;
      const s = statusOf(e);
      if (s === 404) setGone("notFound");
      else if (s === 403) setGone("denied");
      else {
        setOffline(true);
        failCount.current = Math.min(failCount.current + 1, 6);
      }
    } finally {
      inflight.current = false;
    }
  }, [activeTenantId, id, systemId]);

  const loadRef = useRef(load);
  loadRef.current = load;
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void loadRef.current();
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    if (!activeTenantId) return;
    inboxGet("inbox/systems")
      .then((r) => setCanReply(r.canReply !== false))
      .catch((e) => statusOf(e) === 403 && setCanReply(false));
  }, [activeTenantId]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      const on = s === "active";
      setActive(on);
      if (on) void loadRef.current();
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!focused || !active || gone) return;
    let h: ReturnType<typeof setTimeout> | null = null;
    let live = true;
    const tick = () => {
      const wait = failCount.current > 0 ? Math.min(POLL_MS * 2 ** failCount.current, MAX_BACKOFF_MS) : POLL_MS;
      h = setTimeout(() => void loadRef.current().finally(() => live && tick()), wait);
    };
    tick();
    return () => {
      live = false;
      if (h) clearTimeout(h);
    };
  }, [focused, active, gone]);

  const loadOlder = async () => {
    if (!olderNext || moreBusy) return;
    setMoreBusy(true);
    try {
      const th = await inboxGetId("inbox/conversations/[id]", id, { systemId, before: olderNext });
      setOlder((cur) => [...th.messages, ...cur]);
      setOlderNext(th.nextBefore);
    } catch {
      setOffline(true);
    } finally {
      setMoreBusy(false);
    }
  };

  // รับเรื่อง = มอบห้องที่ยังไม่มีผู้ดูแลให้ตัวเอง (สิทธิ์ตอบพอ · R-S1.21a) · 409 = มีคนรับตัดหน้า ⇒ แจ้ง + โหลดใหม่
  const claim = async () => {
    if (!myId || claiming) return;
    setClaiming(true);
    setNote(null);
    try {
      await inboxPostId("inbox/conversations/[id]/assign", id, { systemId, assigneeUserId: myId });
      setNote({ text: t("cust.room.claimed"), warn: false });
    } catch (e) {
      setNote({ text: inboxNote(e) ?? t(statusOf(e) === 409 ? "cust.room.claimTaken" : "cust.err"), warn: true });
    } finally {
      setClaiming(false);
      void load();
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.navigate("/customers"));
  const openInfo = (open?: string) => router.push(`/customers/${encodeURIComponent(id)}/info${systemId ? `?s=${encodeURIComponent(systemId)}` : ""}${open ? `${systemId ? "&" : "?"}open=${open}` : ""}`);

  const conv = thread?.conversation ?? null;
  const name = thread?.contact.displayName ?? t("cust.noName");
  const msgs = thread ? [...older.filter((o) => !thread.messages.some((m) => m.id === o.id)), ...thread.messages] : [];
  const windowH = conv ? replyWindowHours(conv.channel, msgs, nowMs) : null;
  const unassigned = !!conv && conv.status === "OPEN" && !conv.assigneeUserId;
  const subBits = conv
    ? [chLabel(conv.channel), conv.assigneeUserId ? t("cust.room.assignee", { name: firstName(conv.assigneeName) || t("cust.staff.noName") }) : t("cust.row.unassigned"), windowH != null && windowH > 0 ? t("cust.room.window", { n: windowH }) : null].filter(Boolean)
    : [];

  if (gone) {
    return (
      <AiryScreen testID="cust-room">
        <View style={styles.pad}>
          <View style={styles.bar}>
            <IconBtn testID="cust-room-back" icon="chevron-left" label={t("cust.back")} onPress={back} />
          </View>
          <Glass testID="cust-room-gone" style={styles.gone}>
            <Text style={[styles.goneT, { color: c.text }]}>{t(gone === "denied" ? "cust.denied.title" : "cust.room.notFound")}</Text>
          </Glass>
        </View>
      </AiryScreen>
    );
  }

  return (
    <AiryScreen testID="cust-room">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.pad}>
          <View style={styles.bar}>
            <IconBtn testID="cust-room-back" icon="chevron-left" label={t("cust.back")} onPress={back} />
            <View style={styles.center}>
              <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
                {name}
              </Text>
              {conv ? (
                <View style={styles.subRow}>
                  <ChannelBadge channel={conv.channel} size={14} />
                  <Text style={[styles.sub, { color: c.textMuted }]} numberOfLines={1}>
                    {subBits.join(" · ")}
                  </Text>
                </View>
              ) : null}
            </View>
            <IconBtn testID="cust-room-helper" icon="user-plus" label={t("cust.room.helper")} onPress={() => openInfo("helpers")} />
            <IconBtn testID="cust-room-info" icon="user" label={t("cust.room.info")} onPress={() => openInfo()} />
          </View>
          <View testID="cust-room-banner" style={[styles.banner, { backgroundColor: c.cust.bannerBg }]}>
            <Text style={[styles.bannerT, { color: c.cust.bannerFg }]} numberOfLines={2}>
              {t("cust.room.banner")}
            </Text>
          </View>
          {unassigned ? (
            <Glass pad={{ v: 8, h: 14 }} radius={radii.pill} style={styles.claimBar}>
              <Text style={[styles.claimT, { color: c.warn.fg }]} numberOfLines={1}>
                {conv?.waitingMin != null ? t("cust.row.unassignedWait", { n: conv.waitingMin }) : t("cust.row.unassigned")}
              </Text>
              {canReply ? (
                <Pressable testID="cust-room-claim" onPress={() => void claim()} disabled={claiming} accessibilityRole="button" style={[styles.claimBtn, { backgroundColor: c.zone.customers }]}>
                  <Text style={[styles.claimBtnT, { color: c.zone.onZone }]}>{claiming ? t("cust.busy") : t("cust.room.claim")}</Text>
                </Pressable>
              ) : null}
            </Glass>
          ) : null}
          {windowH === 0 ? (
            <Note warn testID="cust-room-window">
              {t("cust.room.windowClosed")}
            </Note>
          ) : null}
          {note ? (
            <Note warn={note.warn} testID="cust-room-note">
              {note.text}
            </Note>
          ) : null}
          {offline ? (
            <Note warn testID="cust-room-offline">
              {t("cust.offline")}
            </Note>
          ) : null}
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            const n = e.nativeEvent;
            atBottom.current = n.contentOffset.y + n.layoutMeasurement.height >= n.contentSize.height - 40;
          }}
          scrollEventThrottle={100}
          onContentSizeChange={() => atBottom.current && scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {olderNext ? (
            <Pressable testID="cust-room-more" onPress={() => void loadOlder()} disabled={moreBusy} accessibilityRole="button" style={styles.more}>
              <Text style={[styles.moreT, { color: c.textMuted }]}>{moreBusy ? t("cust.busy") : t("cust.room.older")}</Text>
            </Pressable>
          ) : null}
          {msgs.map((m) => (
            <MessageBubble
              key={m.id}
              msg={m}
              customerName={name}
              approverName={approverOf(m)}
              onImage={setViewer}
              onResend={canReply ? (x) => void composer.current?.resend(x) : undefined}
              ids={BUBBLE_IDS}
            />
          ))}
          {draft && canReply ? (
            <View testID="cust-draft-card" style={[glassStyle(c, radii.sugg), styles.draft, { borderLeftColor: c.cust.aiBorder }]}>
              <Text style={[styles.draftH, { color: c.text }]}>✨ {t("cust.draft.title")}</Text>
              <Text style={[styles.draftB, { color: c.textDim }]} selectable>
                {draft.body}
              </Text>
              <View style={styles.draftRow}>
                <Pressable
                  testID="cust-draft-edit"
                  onPress={() => {
                    composer.current?.fill(draft.body);
                    setDraft(null);
                  }}
                  accessibilityRole="button"
                  style={[styles.draftBtn, { backgroundColor: c.surface }]}
                >
                  <Text style={[styles.draftBtnT, { color: c.text }]}>{t("cust.draft.edit")}</Text>
                </Pressable>
                <Pressable
                  testID="cust-draft-send"
                  onPress={() => void composer.current?.sendText(draft.body).then((ok) => ok && setDraft(null))}
                  accessibilityRole="button"
                  style={[styles.draftBtn, styles.draftSend, { backgroundColor: c.accent }]}
                >
                  <Text style={[styles.draftBtnT, { color: c.onAccent }]}>{t("cust.draft.send")}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </ScrollView>

        <Composer
          ref={composer}
          convId={id}
          systemId={systemId}
          channel={conv?.channel ?? null}
          canReply={canReply && !!thread}
          windowClosed={windowH === 0}
          onSent={() => {
            atBottom.current = true;
            void load();
          }}
        />
      </KeyboardAvoidingView>

      {viewer ? (
        <View testID="cust-image-viewer" style={[StyleSheet.absoluteFill, styles.viewer, { backgroundColor: c.dim }]}>
          <Image source={{ uri: viewer }} style={styles.viewerImg} resizeMode="contain" />
          <Pressable testID="cust-image-close" onPress={() => setViewer(null)} accessibilityRole="button" accessibilityLabel={t("cust.close")} style={[styles.viewerClose, glassStyle(c, 22)]}>
            <Icon name="x" />
          </Pressable>
        </View>
      ) : null}
    </AiryScreen>
  );
}

// ───────── ช่องพิมพ์ (ทางส่งถึงลูกค้าทางเดียวของแอป) ─────────
type ComposerHandle = {
  /** ใส่ข้อความลงช่องพิมพ์ (การ์ดร่าง → แก้) */
  fill: (text: string) => void;
  /** ส่งข้อความถึงลูกค้าทันที (การ์ดร่าง → ส่ง) · true = สำเร็จ */
  sendText: (text: string) => Promise<boolean>;
  /** ส่งฟองที่ล้มอีกครั้ง (ข้อความใหม่ · รหัสผูกกับฟองเดิม กดซ้ำไม่ซ้ำ) */
  resend: (m: MsgItem) => Promise<boolean>;
};
type Payload = { body?: string; attachments?: ReplyAttachment[]; isInternal: boolean };

const Composer = forwardRef<ComposerHandle, { convId: string; systemId?: string; channel: string | null; canReply: boolean; windowClosed: boolean; onSent: () => void }>(function Composer(
  { convId, systemId, channel, canReply, windowClosed, onSent },
  ref,
) {
  const { c } = useTheme();
  const t = useT();
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [atts, setAtts] = useState<(ReplyAttachment & { name: string })[]>([]);
  const [quick, setQuick] = useState<QuickReply[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const busyRef = useRef(false);
  const cmid = useRef<string | null>(null);
  /** เนื้อหาที่ล้มด้วยรหัสปัจจุบัน — แก้แล้ว = รหัสใหม่ · เหมือนเดิม = รหัสเดิม (เซิร์ฟเวอร์กันซ้ำ) */
  const failedKey = useRef<string | null>(null);

  useEffect(() => {
    if (!canReply) return;
    let live = true;
    inboxGet("inbox/quick-replies", { systemId })
      .then((r) => live && setQuick((r.items ?? []).filter((q) => !channel || !q.channelTypes?.length || q.channelTypes.includes(channel))))
      .catch(() => live && setQuick([]));
    return () => {
      live = false;
    };
  }, [canReply, systemId, channel]);

  /** POST …/reply · 429 ⇒ รอ Retry-After แล้วลองใหม่ 1 ครั้ง (รหัสเดิม) */
  const post = async (p: Payload, id: string) => {
    const body = { systemId, ...p, clientMessageId: id };
    try {
      return await inboxPostId("inbox/conversations/[id]/reply", convId, body);
    } catch (e) {
      if (!(e instanceof InboxError) || e.status !== 429) throw e;
      const wait = Math.min(e.retryAfterSec ?? 5, RETRY_CAP_SEC);
      setNote({ text: t("cust.send.rateRetry", { n: wait }), warn: true });
      await sleep(wait * 1000);
      return await inboxPostId("inbox/conversations/[id]/reply", convId, body);
    }
  };

  /** ทางส่งทางเดียว: กันกดซ้ำ · รหัสข้อความ · ผล duplicate/deliveryFailed · ล้ม = เก็บรหัสไว้ส่งซ้ำ */
  const run = async (p: Payload, key: string, fixedId?: string): Promise<boolean> => {
    if (busyRef.current || !canReply) return false;
    if (!p.isInternal && windowClosed) {
      setNote({ text: t("cust.room.windowClosed"), warn: true });
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    if (failedKey.current !== null && failedKey.current !== key) cmid.current = null;
    const id = fixedId ?? (cmid.current = cmid.current ?? replyMessageId());
    try {
      const r = await post(p, id);
      cmid.current = null;
      failedKey.current = null;
      if (r.duplicate) setNote({ text: t("cust.send.dup"), warn: false });
      else if (r.deliveryFailed) setNote({ text: r.message ?? t("cust.send.deliveryFailed"), warn: true });
      onSent();
      return true;
    } catch (e) {
      failedKey.current = key;
      setNote({ text: inboxNote(e) ?? t("cust.send.fail"), warn: true });
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body && atts.length === 0) return;
    const attachments = atts.map(({ name, ...a }) => ({ ...a, fileName: a.fileName ?? name }));
    const ok = await run({ body: body || undefined, attachments: attachments.length ? attachments : undefined, isInternal: internal }, JSON.stringify([body, internal, atts.map((a) => a.url)]));
    if (ok) {
      setText("");
      setAtts([]);
    }
  };

  useImperativeHandle(ref, () => ({
    fill: (v) => {
      setInternal(false);
      setText(v);
    },
    sendText: (v) => run({ body: v, isInternal: false }, JSON.stringify([v, false, []])),
    resend: (m) =>
      run(
        { body: m.body ?? undefined, attachments: m.attachments.length ? m.attachments.map((a) => ({ url: a.url, mimeType: a.mimeType, fileName: a.name, ...(a.durationMs ? { durationMs: a.durationMs } : {}) })) : undefined, isInternal: false },
        `resend:${m.id}`,
        `resend:${m.id}`,
      ),
  }));

  // ตอบเร็ว: แทนตัวแปรที่เซิร์ฟเวอร์ (apply ไม่ส่งข้อความ) → ใส่ช่องพิมพ์
  const applyQuick = async (q: QuickReply) => {
    try {
      const r = await inboxPostId("inbox/quick-replies/[id]/apply", q.id, { systemId, conversationId: convId });
      setText(r.body);
    } catch (e) {
      setNote({ text: inboxNote(e) ?? t("cust.err"), warn: true });
    }
  };

  // แนบไฟล์: เลือกรูป/วิดีโอ → POST inbox/attachments (multipart) → ใส่ใน attachments ของการส่งครั้งถัดไป
  const attach = async () => {
    if (uploading || !canReply) return;
    setNote(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNote({ text: t("cust.attach.perm"), warn: true });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    if ((a.fileSize ?? 0) > UPLOAD_MAX_BYTES) {
      setNote({ text: t("cust.attach.tooBig"), warn: true });
      return;
    }
    const name = a.fileName ?? `upload-${Date.now()}.${(a.mimeType ?? "image/jpeg").split("/")[1] ?? "jpg"}`;
    const type = a.mimeType ?? (a.type === "video" ? "video/mp4" : "image/jpeg");
    setUploading(true);
    try {
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(a.uri)).blob();
        if (blob.size > UPLOAD_MAX_BYTES) throw new Error("too_big");
        form.append("file", blob, name);
      } else {
        form.append("file", { uri: a.uri, name, type } as unknown as Blob);
      }
      const up = await inboxUpload("inbox/attachments", form);
      setAtts((cur) => [...cur, { url: up.url, mimeType: up.mimeType, name: up.name ?? name, fileName: up.name ?? name, ...(up.size ? { sizeBytes: up.size } : {}), ...(up.width ? { width: up.width } : {}), ...(up.height ? { height: up.height } : {}) }]);
    } catch (e) {
      setNote({ text: e instanceof Error && e.message === "too_big" ? t("cust.attach.tooBig") : (inboxNote(e) ?? t("cust.attach.fail")), warn: true });
    } finally {
      setUploading(false);
    }
  };

  if (!canReply) {
    return (
      <View style={styles.composer}>
        <Note testID="cust-readonly">{t("cust.readOnly")}</Note>
      </View>
    );
  }

  return (
    <View style={styles.composer}>
      {note ? (
        <Note warn={note.warn} testID="cust-send-note" style={styles.sendNote}>
          {note.text}
        </Note>
      ) : null}
      {quick.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.quickRow}>
          {quick.map((q) => (
            <Pressable testID="cust-quick" key={q.id} onPress={() => void applyQuick(q)} accessibilityRole="button" style={[styles.quick, { backgroundColor: c.chip.bg }]}>
              <Text style={[styles.quickT, { color: c.textDim }]} numberOfLines={1}>
                {q.title}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {atts.length ? (
        <View style={styles.attRow}>
          {atts.map((a, i) => (
            <View testID="cust-attached" key={a.url} style={[styles.attChip, { backgroundColor: c.chip.bg }]}>
              <Icon name="paperclip" size={13} color={c.iconDim} />
              <Text style={[styles.attT, { color: c.textDim }]} numberOfLines={1}>
                {a.name}
              </Text>
              <Pressable testID="cust-attached-remove" onPress={() => setAtts((cur) => cur.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={t("cust.attach.remove")} hitSlop={6}>
                <Icon name="x" size={14} color={c.iconDim} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <InputBar
        testID="cust-input"
        sendTestID="cust-send"
        plusTestID="cust-attach"
        plusDisabled={uploading}
        onPlus={() => void attach()}
        left={
          <Pressable
            testID="cust-internal-toggle"
            onPress={() => setInternal((v) => !v)}
            accessibilityRole="switch"
            accessibilityLabel={t("cust.input.internal")}
            accessibilityState={{ checked: internal }}
            style={[styles.lock, internal && { backgroundColor: c.cust.noteBg, borderColor: c.cust.noteBorder }]}
          >
            <Icon name="lock" size={16} color={internal ? c.warn.fg : c.iconDim} />
          </Pressable>
        }
        placeholder={uploading ? t("cust.attach.uploading") : internal ? t("cust.input.internalPh") : t("cust.input.ph")}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={4000}
        sendDisabled={busy || uploading || (!text.trim() && atts.length === 0)}
        onSend={() => void send()}
        style={internal ? [styles.internalBar, { borderColor: c.cust.noteBorder }] : undefined}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: spacing.page },
  bar: { flexDirection: "row", alignItems: "center", gap: 8, height: 52 },
  center: { flex: 1, minWidth: 0, alignItems: "center" },
  name: { fontSize: T.body, fontWeight: "700" },
  subRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2, maxWidth: "100%" },
  sub: { fontSize: T.cap - 0.5, flexShrink: 1 },
  banner: { alignSelf: "center", borderRadius: radii.pill, paddingVertical: 6, paddingHorizontal: 14, marginTop: 8, maxWidth: "100%" },
  bannerT: { fontSize: T.cap - 0.5, fontWeight: "600", textAlign: "center" },
  claimBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 },
  claimT: { fontSize: T.cap + 0.5, fontWeight: "700", flexShrink: 1 },
  claimBtn: { borderRadius: radii.pill, paddingVertical: 7, paddingHorizontal: 16 },
  claimBtnT: { fontSize: T.cap + 0.5, fontWeight: "700" },
  gone: { marginTop: F.v(40), alignItems: "center" },
  goneT: { fontSize: T.body, fontWeight: "600", textAlign: "center" },
  list: { paddingHorizontal: spacing.page, paddingBottom: 16 },
  more: { alignSelf: "center", paddingVertical: 10, paddingHorizontal: 20 },
  moreT: { fontSize: T.cap + 0.5 },
  draft: { marginTop: F.v(26), paddingVertical: 14, paddingHorizontal: 16, borderLeftWidth: 3 },
  draftH: { fontSize: T.body - 1, fontWeight: "700" },
  draftB: { fontSize: T.sub, lineHeight: 21, marginTop: 6 },
  draftRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  draftBtn: { flex: 1, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  draftSend: { flex: 1.6 },
  draftBtnT: { fontSize: T.sub + 0.5, fontWeight: "700" },
  composer: { paddingHorizontal: spacing.page - 6, paddingBottom: 14, paddingTop: 6 },
  sendNote: { marginTop: 0, marginBottom: 8 },
  quickRow: { gap: 8, paddingBottom: 10, paddingHorizontal: 2 },
  quick: { borderRadius: radii.pill, paddingVertical: 8, paddingHorizontal: 14, maxWidth: 200 },
  quickT: { fontSize: 13.5 },
  attRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingBottom: 8 },
  attChip: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: radii.pill, paddingVertical: 6, paddingHorizontal: 10, maxWidth: 220 },
  attT: { fontSize: T.cap, flexShrink: 1 },
  lock: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "transparent" },
  internalBar: { borderStyle: "dashed", borderWidth: 1.5 },
  viewer: { alignItems: "center", justifyContent: "center" },
  viewerImg: { width: "92%", height: "72%" },
  viewerClose: { position: "absolute", top: 60, right: 20, width: size.iconBtn, height: size.iconBtn, alignItems: "center", justifyContent: "center" },
});
