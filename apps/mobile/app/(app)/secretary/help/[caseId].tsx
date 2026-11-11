// ห้องแจ้งปัญหา (ใบ S2.15 · แบบ H2 sec-h.jpg หน้า 2 + sec-dark-h.jpg หน้า 2) — R-K12 · S1.17 · S1.14 · R-S1.14c
//   ข้อมูล: GET secretary/support/cases/[id] (เรื่อง + ข้อความเก่า→ใหม่ · เปิดอ่าน = เซิร์ฟเวอร์ล้างตัวนับ) · ไม่เห็น/ไม่มี = 404 ⇒ จอ "ไม่พบเรื่องนี้"
//   ตอบ: POST secretary/support/cases/[id]/reply {body, attachments?} (เรื่องที่ปิดแล้ว = เปิดใหม่) · แนบรูป: ปุ่ม + → HelpAttach → POST secretary/support/upload (≤ 4 MB · บีบอัดก่อน)
//   การ์ด "ปัญหาแก้แล้วหรือยัง" เมื่อทีมตั้ง PENDING: แก้แล้ว = POST secretary/support/cases/[id]/resolve {} · ยังไม่แก้ = ตอบ (reply) ข้อความ "ยังไม่หาย" แล้วเปิดช่องพิมพ์
//   ลิงก์หน้าในแอปจากทีม (`sharkai://…` / path ภายใน) = ปุ่ม "เปิดหน้า" ใต้ฟอง → router.push ตามเส้นทาง (helpRouteOf — path นอกรายการปลอดภัยไม่เป็นปุ่ม)
//   ห้องงานที่แนบ (case.roomId) = การ์ดระบบใต้ข้อความแรก แตะ → /secretary/room/<roomId> · ชื่อห้องจาก GET secretary/rooms/[id]
//   polling 15 วิ ขณะจออยู่ (focus + แอปอยู่หน้า) · push "ทีมงานตอบกลับแล้ว" (S1.23) เปิดจอนี้ผ่าน deep link /secretary/help/<id> (push-register.ts)
// ข้อความผ่าน i18n (help.*) · สีจากธีม · สเกล R-UI1
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Dot, Glass, Icon, IconBtn, InputBar, LoadError, Loading, Sheet } from "@/src/components/airy";
import { CaseBubble, type CaseBubbleIds } from "@/src/components/secretary/CaseBubble";
import { caseStatusLine } from "@/src/components/secretary/CaseRow";
import { AttachedRow, useHelpAttach } from "@/src/components/secretary/HelpAttach";
import { hhmmBkk } from "@/src/components/secretary/bkk";
import { ApiError } from "@/src/api/client";
import {
  caseNoText,
  helpDot,
  normalizeHelpDetail,
  normalizeRoomDetail,
  scheduleZoneBadges,
  secGetId,
  secPostId,
  secUpload,
  serverNote,
  type HelpAttachment,
  type HelpCase,
  type HelpLink,
  type HelpMsg,
} from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { cardGap, radii, size, spacing, type as T } from "@/src/theme/tokens";

const POLL_MS = 15_000;
const INPUT_BOTTOM = 26;
const BUBBLE_IDS: CaseBubbleIds = { bubble: "help-bubble", link: "help-link", att: "help-bubble-att" };

export default function SecretaryHelpCaseScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const id = typeof caseId === "string" ? caseId : "";

  const [kase, setKase] = useState<HelpCase | null>(null);
  const [msgs, setMsgs] = useState<HelpMsg[]>([]);
  const [gone, setGone] = useState(false);
  const [offline, setOffline] = useState(false);
  // R-S2.14h: 403 = การ์ดล็อก (LoadError denied) แทนเธรด · ปิดช่องพิมพ์
  const [denied, setDenied] = useState(false);
  const [roomTitle, setRoomTitle] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<{ text: string; warn: boolean } | null>(null);
  const [menu, setMenu] = useState(false);
  const [focusKey, setFocusKey] = useState(0);
  const busy = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const upload = useCallback((form: FormData) => secUpload("secretary/support/upload", form), []);
  const att = useHelpAttach(upload);
  // R-S2.13f: badge ทีม (support unread) โหลดใหม่เฉพาะโหลดแรก หรือเมื่อข้อความ/สถานะเปลี่ยน — poll 15 วิ ไม่ลาก badge ตามทุกรอบ
  const seenSig = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = normalizeHelpDetail(await secGetId("secretary/support/cases/[id]", id));
      if (!r.case) throw new ApiError(404, "not_found");
      setKase(r.case);
      setMsgs(r.messages);
      setGone(false);
      setOffline(false);
      setDenied(false);
      const sig = `${r.case.id}|${r.case.status}|${r.messages.length}|${r.messages[r.messages.length - 1]?.id ?? ""}`;
      if (seenSig.current !== sig) {
        seenSig.current = sig;
        scheduleZoneBadges();
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setGone(true);
      else if (e instanceof ApiError && e.status === 403) {
        setDenied(true);
        setOffline(false);
      } else setOffline(true);
    }
  }, [id]);

  // โหลดตอนเข้าจอ + ทุก 15 วิ ขณะจออยู่และแอปอยู่หน้า (ทีมตอบ = เห็นเอง)
  useFocusEffect(
    useCallback(() => {
      void load();
      const timer = setInterval(() => {
        if (AppState.currentState === "active") void load();
      }, POLL_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  const roomId = kase?.roomId ?? null;
  useEffect(() => {
    setRoomTitle(null);
    if (!roomId) return;
    let alive = true;
    secGetId("secretary/rooms/[id]", roomId)
      .then((r) => alive && setRoomTitle(normalizeRoomDetail(r).title || null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [roomId]);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.navigate("/secretary/help");
  };

  /** ตอบในเรื่อง (ใช้ร่วม ช่องพิมพ์ · ปุ่ม "ยังไม่แก้") */
  const reply = async (text: string, attachments: HelpAttachment[]): Promise<boolean> => {
    if (busy.current || !kase) return false;
    busy.current = true;
    setSending(true);
    setFlash(null);
    try {
      await secPostId("secretary/support/cases/[id]/reply", kase.id, attachments.length ? { body: text, attachments } : { body: text });
      await load();
      return true;
    } catch (e) {
      setFlash({ text: e instanceof ApiError && e.status === 429 ? t("help.err.rate") : (serverNote(e) ?? t("help.err.reply")), warn: true });
      return false;
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  const send = async () => {
    const text = draft.trim().slice(0, 4000) || (att.atts.length ? t("help.attach.subject") : "");
    if (!text) return;
    if (await reply(text, att.atts)) {
      setDraft("");
      att.clear();
    }
  };

  const resolveYes = async () => {
    if (busy.current || !kase) return;
    busy.current = true;
    setSending(true);
    setFlash(null);
    try {
      await secPostId("secretary/support/cases/[id]/resolve", kase.id, {});
      setFlash({ text: t("help.resolve.done"), warn: false });
      await load();
    } catch (e) {
      setFlash({ text: serverNote(e) ?? t("help.err.resolve"), warn: true });
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  const resolveNo = async () => {
    if (await reply(t("help.resolve.noBody"), [])) {
      setFlash({ text: t("help.resolve.noNote"), warn: false });
      setFocusKey((k) => k + 1);
    }
  };

  /** ลิงก์หน้าในแอปจากทีม → เส้นทางที่ helpRouteOf อนุญาตเท่านั้น */
  const openLink = (l: HelpLink) => router.push(l.route.params?.t !== undefined ? { ...l.route, params: { ...l.route.params, t: String(Date.now()) } } : l.route);
  const openRoom = () => {
    if (roomId) router.push(`/secretary/room/${encodeURIComponent(roomId)}`);
  };

  const dot = kase ? helpDot(kase.status, 0) : "wait";
  const statusText = kase ? (kase.status === "RESOLVED" ? caseStatusLine(t, kase.status, 0, kase.updatedAt) : t(`help.head.${kase.status}` as I18nKey)) : "";
  const nonce = String(focusKey);
  const opened = kase ? t(roomId ? "help.opened.room" : "help.opened", { no: caseNoText(kase.caseNo), title: roomTitle ?? t("help.roomUnnamed"), time: hhmmBkk(kase.createdAt) }) : "";
  const attNote = att.note ? ("key" in att.note ? t(att.note.key) : att.note.text) : null;
  const note = flash ?? (attNote ? { text: attNote, warn: true } : null);

  return (
    <AiryScreen testID="help-room">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.bar}>
          <IconBtn testID="help-back" icon="chevron-left" label={t("help.back")} onPress={back} />
          <View style={styles.center}>
            <Text testID="help-room-title" style={[styles.title, { color: c.text }]} numberOfLines={1}>
              {kase?.subject ?? ""}
            </Text>
            {kase ? (
              <View style={styles.statusRow}>
                <Text style={[styles.status, { color: c.textMuted }]}>{`${caseNoText(kase.caseNo)} ·`}</Text>
                <Dot status={dot} testID={`help-room-dot-${dot}`} />
                <Text testID="help-room-status" style={[styles.status, styles.statusT, { color: c.textMuted }]} numberOfLines={1}>
                  {statusText}
                </Text>
              </View>
            ) : null}
          </View>
          {/* R-S2.14o: ไม่มีสิทธิ์ (403) = ไม่มีเมนู ⋯ (ไม่มีอะไรให้ทำกับเรื่องที่เปิดไม่ได้) */}
          {denied ? <View style={styles.barSpacer} /> : <IconBtn testID="help-menu" icon="more-horizontal" label={t("help.menu")} onPress={() => setMenu(true)} />}
        </View>

        {gone ? (
          <Glass testID="help-gone" style={styles.gone}>
            <Icon name="search" size={22} color={c.textMuted} />
            <Text style={[styles.goneT, { color: c.text }]}>{t("help.notFound")}</Text>
            <Pressable testID="help-gone-back" accessibilityRole="button" onPress={() => router.navigate("/secretary/help")} style={[styles.goneBtn, { backgroundColor: c.accent }]}>
              <Text style={[styles.goneBtnT, { color: c.onAccent }]}>{t("help.toList")}</Text>
            </Pressable>
          </Glass>
        ) : denied ? (
          <View style={[styles.flex, styles.page]}>
            <LoadError testID="help-case-denied" denied />
          </View>
        ) : (
          <ScrollView
            ref={scroll}
            testID="help-thread"
            style={styles.flex}
            contentContainerStyle={styles.page}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
          >
            {msgs.map((m, i) => (
              <View key={m.id}>
                <CaseBubble msg={m} ids={BUBBLE_IDS} nonce={nonce} onOpenLink={openLink} />
                {i === 0 && kase ? (
                  roomId ? (
                    <Pressable testID="help-room-card" accessibilityRole="button" accessibilityLabel={t("help.openRoom")} onPress={openRoom} style={styles.sysWrap}>
                      <Text style={[styles.sysT, { color: c.textMuted, backgroundColor: c.chip.bg }]}>{opened}</Text>
                    </Pressable>
                  ) : (
                    <View testID="help-opened" style={styles.sysWrap}>
                      <Text style={[styles.sysT, { color: c.textMuted, backgroundColor: c.chip.bg }]}>{opened}</Text>
                    </View>
                  )
                ) : null}
              </View>
            ))}

            {kase?.status === "PENDING" ? (
              <>
                <Glass testID="help-resolved-card" pad={{ v: 14, h: 16 }} radius={radii.sugg} style={styles.ask}>
                  <View style={[styles.askIcon, { backgroundColor: c.surface }]}>
                    <Icon name="check-circle" size={20} color={c.status.run} />
                  </View>
                  <View style={styles.askX}>
                    <Text style={[styles.askT, { color: c.text }]}>{t("help.resolve.title")}</Text>
                    <Text style={[styles.askS, { color: c.textMuted }]}>{t("help.resolve.sub")}</Text>
                  </View>
                </Glass>
                <View style={styles.acts}>
                  <Pressable
                    testID="help-resolve-no"
                    accessibilityRole="button"
                    disabled={sending}
                    onPress={() => void resolveNo()}
                    style={[styles.btn, styles.btnNo, { backgroundColor: c.surface, borderColor: c.divider }]}
                  >
                    <Text style={[styles.btnT, { color: c.text }]}>{t("help.resolve.no")}</Text>
                  </Pressable>
                  <Pressable
                    testID="help-resolve-yes"
                    accessibilityRole="button"
                    disabled={sending}
                    onPress={() => void resolveYes()}
                    style={[styles.btn, styles.btnYes, { backgroundColor: c.accent }]}
                  >
                    <Text style={[styles.btnT, { color: c.onAccent }]}>{t("help.resolve.yes")}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
            {kase?.status === "RESOLVED" ? (
              <Text testID="help-closed" style={[styles.closed, { color: c.textMuted }]}>
                {t("help.closedNote")}
              </Text>
            ) : null}
            {/* S2.14: ยังไม่ได้เรื่อง = Loading · ล้มก่อนได้เรื่อง = LoadError (poll ต่อเองด้วย) */}
            {kase ? null : offline ? <LoadError testID="help-case-error" onRetry={() => void load()} /> : <Loading testID="help-case-loading" />}
            {offline && kase ? <Text style={[styles.closed, { color: c.textMuted }]}>{t("help.offline")}</Text> : null}
          </ScrollView>
        )}

        {note ? (
          <Text testID="help-flash" style={[styles.flash, { color: note.warn ? c.warn.fg : c.text, backgroundColor: note.warn ? c.warn.bg : c.chip.bg }]}>
            {note.text}
          </Text>
        ) : null}
        {gone || denied ? null : (
          <>
            <AttachedRow testID="help-attached" atts={att.atts} uploading={att.uploading} onRemove={att.remove} />
            <InputBar
              key={focusKey}
              testID="help-input"
              sendTestID="help-send"
              plusTestID="help-attach"
              autoFocus={focusKey > 0}
              placeholder={t("help.replyInput")}
              value={draft}
              onChangeText={(v) => {
                setDraft(v);
                if (flash?.warn) setFlash(null);
              }}
              onSend={() => void send()}
              onPlus={() => void att.attach()}
              plusDisabled={att.uploading || sending || !kase}
              sendDisabled={(!draft.trim() && att.atts.length === 0) || sending || att.uploading || !kase}
              maxLength={4000}
              style={styles.input}
            />
          </>
        )}
      </KeyboardAvoidingView>

      <Sheet visible={menu} onClose={() => setMenu(false)} testID="help-menu-sheet" top={560}>
        <Text style={[styles.menuH, { color: c.text }]}>{kase ? caseNoText(kase.caseNo) : t("help.menu")}</Text>
        {roomId ? (
          <Pressable
            testID="help-menu-room"
            accessibilityRole="button"
            onPress={() => {
              setMenu(false);
              openRoom();
            }}
            style={[styles.menuRow, { borderBottomColor: c.divider }]}
          >
            <Icon name="message-circle" size={19} />
            <Text style={[styles.menuT, { color: c.text }]}>{t("help.openRoom")}</Text>
          </Pressable>
        ) : null}
        {kase && kase.status !== "RESOLVED" ? (
          <Pressable
            testID="help-menu-resolve"
            accessibilityRole="button"
            onPress={() => {
              setMenu(false);
              void resolveYes();
            }}
            style={[styles.menuRow, { borderBottomColor: c.divider }]}
          >
            <Icon name="check-circle" size={19} />
            <Text style={[styles.menuT, { color: c.text }]}>{t("help.menuResolve")}</Text>
          </Pressable>
        ) : null}
        <Pressable
          testID="help-menu-list"
          accessibilityRole="button"
          onPress={() => {
            setMenu(false);
            router.navigate("/secretary/help");
          }}
          style={[styles.menuRow, { borderBottomColor: c.divider }]}
        >
          <Icon name="list" size={19} />
          <Text style={[styles.menuT, { color: c.text }]}>{t("help.toList")}</Text>
        </Pressable>
      </Sheet>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  barSpacer: { width: size.iconBtn, height: size.iconBtn },
  flex: { flex: 1 },
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: 6 },
  center: { flex: 1, minWidth: 0, alignItems: "center" },
  title: { fontSize: T.h - 1, fontWeight: "700", lineHeight: 22 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3, maxWidth: "100%" },
  status: { fontSize: T.cap, lineHeight: 16 },
  statusT: { flexShrink: 1 },
  page: { paddingHorizontal: spacing.page, paddingBottom: cardGap * 2 },
  sysWrap: { alignItems: "center", marginTop: F.v(22) },
  sysT: { fontSize: T.cap - 0.5, lineHeight: 17, textAlign: "center", paddingVertical: 5, paddingHorizontal: 12, borderRadius: 12, overflow: "hidden", maxWidth: "100%" },
  ask: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: F.v(26) },
  askIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  askX: { flex: 1, minWidth: 0 },
  askT: { fontSize: T.sub + 1, fontWeight: "700", lineHeight: 21 },
  askS: { fontSize: T.cap - 0.5, lineHeight: 17, marginTop: 2 },
  acts: { flexDirection: "row", gap: 10, marginTop: 10 },
  btn: { height: size.iconBtn, borderRadius: size.iconBtn / 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  btnNo: { flex: 1, borderWidth: 1 },
  btnYes: { flex: 1.7 },
  btnT: { fontSize: T.sub + 0.5, fontWeight: "700" },
  closed: { fontSize: T.cap, lineHeight: 18, textAlign: "center", marginTop: F.v(30) },
  gone: { marginHorizontal: spacing.page, marginTop: F.v(60), alignItems: "center", gap: spacing.sm },
  goneT: { fontSize: T.body, fontWeight: "600", lineHeight: 23, textAlign: "center" },
  goneBtn: { marginTop: spacing.sm, height: size.iconBtn, borderRadius: size.iconBtn / 2, paddingHorizontal: spacing.xl, alignItems: "center", justifyContent: "center" },
  goneBtnT: { fontSize: T.sub, fontWeight: "600" },
  flash: { marginHorizontal: spacing.page, marginBottom: spacing.sm, fontSize: 13, lineHeight: 19, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, overflow: "hidden", textAlign: "center" },
  input: { marginHorizontal: spacing.page, marginBottom: INPUT_BOTTOM },
  menuH: { fontSize: T.h + 1, fontWeight: "700", lineHeight: 26, marginBottom: 4 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: size.iconBtn + 8, borderBottomWidth: StyleSheet.hairlineWidth },
  menuT: { fontSize: T.body - 1 },
});
