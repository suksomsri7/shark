// ห้องแชททีม (B27 · แบบ /root/mockups/team-invite/team2.png จอ 3 + team4.png จอ 4) — แชท 1:1 (และกลุ่ม · ใช้จอเดียวกัน)
//   หัว: ‹ กลับ · อวตาร + ชื่อชิดซ้าย + บทบาทใต้ชื่อ (กลุ่ม = "N คน") · ⚙ ขวาบน = กำหนดสิทธิ์ของคนนี้ (OWNER/MANAGER เท่านั้น → /secretary/staff/<membershipId>)
//     แตะชื่อ = แผ่นตัวเลือก (ปิด/เปิดเสียงแชทนี้)
//     TODO(b27-group): ⚙ ของกลุ่ม = ตั้งค่ากลุ่ม (team4.png จอ 5) — รอเจ้าของอนุมัติแบบ · ตอนนี้กลุ่มไม่มี ⚙
//   ข้อมูล: GET team/threads/[id] (หัว/สมาชิก) · GET …/messages (ล่าสุด 50 · เลื่อนขึ้น = before) · poll after= ทุก 5 วิ ขณะจออยู่+แอปอยู่หน้า
//     อ่าน = POST …/read ตอนเข้าจอ/มีข้อความใหม่จากคนอื่น (อีกฝ่ายเห็น "อ่านแล้ว" · badge ทีมลด)
//     "อ่านแล้ว" ของเรา = จาก reads ทุกรอบ poll (1:1 = อ่านแล้ว · กลุ่ม = อ่านแล้ว N)
//   ส่ง: ข้อความ/รูป/ไฟล์ (+ หน้าช่องพิมพ์ = AttachSheet · POST team/attachments · ส่วนตัว) · ฟองชั่วคราวระหว่างส่ง · clientMessageId กันซ้ำ
//   กดค้างข้อความของเรา = ลบ (soft) · ไม่ใช่สมาชิก/ไม่มีห้อง = 404 ⇒ จอ "ไม่พบห้องแชทนี้"
//   ปุ่ม Lekaa = โหมด inline-with-composer ของโฮสต์กลาง (เลน b27-fab) — ช่องพิมพ์สูง 52 เว้นขวา 82 จากขอบ (TEAM_COMPOSER · TODO(b27-fab))
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Glass, Icon, IconBtn, InputBar, LoadError, Loading, Sheet } from "@/src/components/airy";
import { Avatar } from "@/src/components/secretary/MemberBubble";
import { AttachSheet, AttachTray, localAttachments, useSecAttach, type PendingAttach } from "@/src/components/secretary/SecAttach";
import { GroupAvatar } from "@/src/components/team/TeamRow";
import { TeamBubble } from "@/src/components/team/TeamBubble";
import { TEAM_COMPOSER } from "@/src/components/team/layout";
import { ApiError } from "@/src/api/client";
import { clientMessageId, serverNote, useActiveRole } from "@/src/api/secretary";
import {
  cursorOfMsg,
  deleteTeamMessage,
  getMessages,
  getThread,
  markTeamRead,
  mergeMsgs,
  msgTimeOf,
  patchThread,
  readCountOf,
  sendTeamMessage,
  type TeamMsg,
  type TeamMsgPage,
  type TeamThreadDetail,
} from "@/src/api/team";
import { useAuth } from "@/src/lib/auth-context";
import { useLang, useT, type I18nKey } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { cardGap, radii, size, spacing, type as T } from "@/src/theme/tokens";

const POLL_MS = 5_000;
const HEAD_AV = 44;

export default function TeamRoomScreen() {
  const { c } = useTheme();
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === "string" ? rawId : "";
  const { user } = useAuth();
  const myRole = useActiveRole();
  const manager = myRole === "OWNER" || myRole === "MANAGER";

  const [thread, setThread] = useState<TeamThreadDetail | null>(null);
  const [msgs, setMsgs] = useState<TeamMsg[]>([]);
  const [reads, setReads] = useState<TeamMsgPage["reads"]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [gone, setGone] = useState(false);
  const [offline, setOffline] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [deleting, setDeleting] = useState<TeamMsg | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const att = useSecAttach("secretary/team/attachments");
  const msgsRef = useRef<TeamMsg[]>([]);
  msgsRef.current = msgs;
  const busy = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const atBottom = useRef(true);

  const markRead = useCallback(() => {
    if (id) void markTeamRead(id).catch(() => undefined);
  }, [id]);

  /** โหลดเต็ม (หัว + ล่าสุด) */
  const loadAll = useCallback(async () => {
    if (!id) return;
    try {
      const [h, m] = await Promise.all([getThread(id), getMessages(id, { take: 50 })]);
      setThread(h.thread);
      setMsgs((cur) => mergeMsgs(cur, m.items));
      setReads(m.reads);
      setHasMore(m.hasMore);
      setGone(false);
      setOffline(false);
      setLoaded(true);
      setNow(Date.now());
      markRead();
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setGone(true);
      else setOffline(true);
    }
  }, [id, markRead]);

  /** poll: ข้อความใหม่กว่าอันล่าสุดที่มี + เวลาอ่านของคนอื่น */
  const poll = useCallback(async () => {
    if (!id) return;
    const last = [...msgsRef.current].reverse().find((m) => !m.pending);
    if (!last) return loadAll();
    try {
      const m = await getMessages(id, { after: cursorOfMsg(last), take: 100 });
      setReads(m.reads);
      setOffline(false);
      setNow(Date.now());
      if (m.items.length) {
        setMsgs((cur) => mergeMsgs(cur, m.items));
        if (m.items.some((x) => !x.mine)) markRead();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setGone(true);
      else setOffline(true);
    }
  }, [id, loadAll, markRead]);

  useEffect(() => {
    setThread(null);
    setMsgs([]);
    setLoaded(false);
    setGone(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void loadAll();
      const timer = setInterval(() => {
        if (AppState.currentState === "active") void poll();
      }, POLL_MS);
      return () => clearInterval(timer);
    }, [loadAll, poll]),
  );

  const loadOlder = async () => {
    const first = msgsRef.current.find((m) => !m.pending);
    if (!first || !hasMore) return;
    try {
      const m = await getMessages(id, { before: cursorOfMsg(first), take: 50 });
      setMsgs((cur) => mergeMsgs(cur, m.items));
      setHasMore(m.hasMore);
    } catch {
      /* ลองใหม่ตอนเลื่อนอีกครั้ง */
    }
  };

  const back = () => (router.canGoBack() ? router.back() : router.navigate("/secretary/staff"));

  const send = async () => {
    if (!att.ready || busy.current || !thread) return;
    const text = draft.trim().slice(0, 4000);
    if (!text && att.items.length === 0) return;
    busy.current = true;
    setSending(true);
    setFlash(null);
    const taken: PendingAttach[] = att.take();
    const cmid = clientMessageId().replace(/[^A-Za-z0-9_-]/g, "");
    const temp: TeamMsg = {
      id: `tmp-${cmid}`,
      kind: "TEXT",
      body: text,
      attachments: localAttachments(taken),
      senderUserId: user?.id ?? "",
      senderName: "",
      mine: true,
      at: new Date().toISOString(),
      deleted: false,
      read: false,
      readBy: 0,
      pending: true,
    };
    setMsgs((cur) => [...cur, temp]);
    setDraft("");
    atBottom.current = true;
    try {
      const m = await sendTeamMessage(id, { ...(text ? { body: text } : {}), ...(taken.length ? { attachments: att.refs(taken) } : {}), clientMessageId: cmid });
      setMsgs((cur) => (m ? mergeMsgs(cur.filter((x) => x.id !== temp.id), [m]) : cur.filter((x) => x.id !== temp.id)));
      if (!m) void poll();
    } catch (e) {
      setMsgs((cur) => cur.filter((x) => x.id !== temp.id));
      setDraft(text);
      att.restore(taken);
      setFlash(serverNote(e) ?? t("team.room.sendErr"));
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  const toggleMute = async () => {
    setMenu(false);
    if (!thread) return;
    try {
      const r = await patchThread(id, { muted: !thread.muted });
      setThread(r.thread);
    } catch (e) {
      setFlash(serverNote(e) ?? t("team.room.sendErr"));
    }
  };

  const del = async () => {
    const m = deleting;
    setDeleting(null);
    if (!m) return;
    try {
      await deleteTeamMessage(id, m.id);
      setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, deleted: true, body: "", attachments: [] } : x)));
    } catch (e) {
      setFlash(serverNote(e) ?? t("team.room.sendErr"));
    }
  };

  const group = thread?.kind === "GROUP";
  const sub = thread ? (group ? t("team.room.members", { n: thread.members.length }) : thread.peer?.tag ? t(`team.tag.${thread.peer.tag}` as I18nKey) : "") : "";
  // ⚙ = กำหนดสิทธิ์ของอีกฝ่าย (1:1 · OWNER/MANAGER · มี membershipId = ยังอยู่ในร้าน)
  const gearTo = thread && !group && manager && thread.peer?.membershipId ? `/secretary/staff/${thread.peer.membershipId}` : null;
  const colorOf = (uid: string) => {
    const keys = Object.keys(c.sys) as (keyof typeof c.sys)[];
    let h = 0;
    for (const ch of uid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return c.sys[keys[h % keys.length]!];
  };
  const readText = (m: TeamMsg): string | null => {
    if (!m.mine || m.pending || m.deleted) return m.pending ? t("team.room.sending") : null;
    const n = readCountOf(m, reads);
    if (n === 0) return null;
    return group ? t("team.room.readBy", { n }) : t("team.room.read");
  };
  // "อ่านแล้ว" แสดงที่ข้อความล่าสุดของเราที่ถูกอ่าน (แบบ WhatsApp ไม่ซ้ำทุกฟอง) — 1:1 · กลุ่มแสดงทุกฟองของเราที่มีคนอ่าน
  const lastReadMine = !group ? [...msgs].reverse().find((m) => m.mine && !m.pending && readCountOf(m, reads) > 0)?.id : undefined;

  return (
    <AiryScreen testID="team-room">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.bar}>
          <IconBtn testID="team-room-back" icon="chevron-left" label={t("team.room.back")} onPress={back} />
          <Pressable testID="team-room-head" accessibilityRole="button" accessibilityLabel={t("team.room.menu")} onPress={() => thread && setMenu(true)} style={styles.head}>
            {group ? <GroupAvatar size={HEAD_AV} /> : <Avatar name={thread?.name ?? ""} seed={thread?.peer?.userId ?? id} size={HEAD_AV} />}
            <View style={styles.headX}>
              <Text testID="team-room-name" style={[styles.name, { color: c.text }]} numberOfLines={1}>
                {thread?.name ?? ""}
              </Text>
              <Text testID="team-room-sub" style={[styles.sub, { color: c.textMuted }]} numberOfLines={1}>
                {sub}
              </Text>
            </View>
            {thread?.muted ? <Icon name="bell-off" size={14} color={c.iconDim} /> : null}
          </Pressable>
          {gearTo ? <IconBtn testID="team-room-gear" icon="settings" label={t("team.room.settings")} onPress={() => router.push(gearTo)} /> : <View style={styles.barSpacer} />}
        </View>

        {gone ? (
          <Glass testID="team-room-gone" style={styles.gone}>
            <Icon name="search" size={22} color={c.textMuted} />
            <Text style={[styles.goneT, { color: c.text }]}>{t("team.room.gone")}</Text>
            <Pressable testID="team-room-gone-back" accessibilityRole="button" onPress={() => router.navigate("/secretary/staff")} style={[styles.goneBtn, { backgroundColor: c.accent }]}>
              <Text style={[styles.goneBtnT, { color: c.onAccent }]}>{t("team.room.toList")}</Text>
            </Pressable>
          </Glass>
        ) : (
          <ScrollView
            ref={scroll}
            testID="team-thread"
            style={styles.flex}
            contentContainerStyle={styles.page}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={64}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
              if (contentOffset.y < 40 && hasMore) void loadOlder();
            }}
            onContentSizeChange={() => {
              if (atBottom.current) scroll.current?.scrollToEnd({ animated: false });
            }}
          >
            {!loaded ? offline ? <LoadError testID="team-room-error" onRetry={() => void loadAll()} /> : <Loading testID="team-room-loading" /> : null}
            {loaded && msgs.length === 0 ? <Text style={[styles.empty, { color: c.textMuted }]}>{t("team.room.empty")}</Text> : null}
            {msgs.map((m) => (
              <TeamBubble
                key={m.id}
                testID="team-msg"
                msg={m}
                time={msgTimeOf(m.at, now, lang)}
                readText={group || m.pending ? readText(m) : m.id === lastReadMine ? readText(m) : null}
                senderName={group && !m.mine ? m.senderName : null}
                senderColor={colorOf(m.senderUserId)}
                deletedText={t("team.deleted")}
                onLongPress={m.mine && !m.pending && !m.deleted ? () => setDeleting(m) : undefined}
              />
            ))}
            {loaded && offline ? <Text style={[styles.empty, { color: c.textMuted }]}>{t("team.room.offline")}</Text> : null}
          </ScrollView>
        )}

        {flash ? (
          <Text testID="team-room-flash" style={[styles.flash, { color: c.warn.fg, backgroundColor: c.warn.bg }]}>
            {flash}
          </Text>
        ) : null}
        {gone ? null : (
          <>
            <AttachTray items={att.items} note={att.note} onRemove={att.remove} testID="team-room-attached" />
            {/* TODO(b27-fab): ปุ่ม Lekaa (โหมด inline-with-composer) วางขวาของช่องนี้ แถวเดียวกัน สูงเท่ากัน — TEAM_COMPOSER */}
            <InputBar
              testID="team-input"
              sendTestID="team-send"
              plusTestID="team-attach"
              placeholder={t("team.room.input")}
              value={draft}
              onChangeText={(v) => {
                setDraft(v);
                if (flash) setFlash(null);
              }}
              onSend={() => void send()}
              onPlus={() => setAttachOpen(true)}
              plusDisabled={sending || !thread}
              sendDisabled={(!draft.trim() && att.items.length === 0) || sending || !att.ready || !thread}
              maxLength={4000}
              style={styles.input}
            />
          </>
        )}
      </KeyboardAvoidingView>

      <AttachSheet visible={attachOpen} onClose={() => setAttachOpen(false)} onPick={(k) => void att.pick(k)} name={thread?.name || t("team.room.attachFor")} testID="team-attach-sheet" />
      <Sheet visible={menu} onClose={() => setMenu(false)} testID="team-room-menu" top={600}>
        <Text style={[styles.menuH, { color: c.text }]}>{thread?.name ?? ""}</Text>
        {thread?.muted ? <Text style={[styles.menuSub, { color: c.textMuted }]}>{t("team.room.mutedNote")}</Text> : null}
        <Pressable testID="team-room-mute" accessibilityRole="button" onPress={() => void toggleMute()} style={[styles.menuRow, { borderBottomColor: c.divider }]}>
          <Icon name={thread?.muted ? "bell" : "bell-off"} size={19} />
          <Text style={[styles.menuT, { color: c.text }]}>{thread?.muted ? t("team.room.unmute") : t("team.room.mute")}</Text>
        </Pressable>
      </Sheet>
      <Sheet visible={!!deleting} onClose={() => setDeleting(null)} testID="team-msg-menu" top={620}>
        <Pressable testID="team-msg-delete" accessibilityRole="button" onPress={() => void del()} style={[styles.menuRow, { borderBottomColor: c.divider }]}>
          <Icon name="trash-2" size={19} color={c.bad.fg} />
          <Text style={[styles.menuT, { color: c.bad.fg }]}>{t("team.room.delete")}</Text>
        </Pressable>
      </Sheet>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: 8 },
  head: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  headX: { flex: 1, minWidth: 0 },
  name: { fontSize: T.h, fontWeight: "700", lineHeight: 24 },
  sub: { fontSize: T.cap + 0.5, lineHeight: 17, marginTop: 1 },
  barSpacer: { width: size.iconBtn, height: size.iconBtn },
  page: { paddingHorizontal: spacing.page, paddingBottom: cardGap * 2 },
  empty: { fontSize: T.cap, lineHeight: 18, textAlign: "center", marginTop: F.v(30) },
  gone: { marginHorizontal: spacing.page, marginTop: F.v(60), alignItems: "center", gap: spacing.sm },
  goneT: { fontSize: T.body, fontWeight: "600", lineHeight: 23, textAlign: "center" },
  goneBtn: { marginTop: spacing.sm, height: size.iconBtn, borderRadius: size.iconBtn / 2, paddingHorizontal: spacing.xl, alignItems: "center", justifyContent: "center" },
  goneBtnT: { fontSize: T.sub, fontWeight: "600" },
  flash: { marginHorizontal: spacing.page, marginBottom: spacing.sm, fontSize: 13, lineHeight: 19, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, overflow: "hidden", textAlign: "center" },
  // ช่องพิมพ์สูง 52 · เว้นขวาให้ปุ่ม Lekaa (inline) — TEAM_COMPOSER
  input: { height: TEAM_COMPOSER.height, marginLeft: spacing.page, marginRight: TEAM_COMPOSER.rightInset, marginBottom: TEAM_COMPOSER.bottom },
  menuH: { fontSize: T.h + 1, fontWeight: "700", lineHeight: 26, marginBottom: 4 },
  menuSub: { fontSize: T.cap, lineHeight: 18, marginBottom: 6 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: size.iconBtn + 8, borderBottomWidth: StyleSheet.hairlineWidth },
  menuT: { fontSize: T.body - 1 },
});
