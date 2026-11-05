// ช่วยเหลือ (ใบ S2.15 · แบบ H1 sec-h.jpg หน้า 1 + sec-dark-h.jpg หน้า 1) — R-K12 · S1.17 · S1.14
//   ข้อมูล: GET secretary/support/cases (`listCasesForUser` — OWNER เห็นทุกเรื่องของร้าน · คนอื่นเห็นเรื่องของตัวเอง · unreadCount ต่อเรื่อง)
//   ชิป 5 หัวข้อ = หมวด (category) ของเรื่องใหม่: ใช้งานไม่ได้=bug · เลขาทำผิด=secretary_wrong · ข้อมูลไม่ตรง=question · บัญชี/การเงิน=billing · ข้อเสนอแนะ=feature
//   ช่องพิมพ์ล่าง = เปิดเรื่องใหม่: POST secretary/support/cases { subject = บรรทัดแรก, body = ทั้งข้อความ, category = ชิปที่เลือก, roomId?, attachments? }
//     roomId มาจาก query `?roomId=` (เมนู ⋯ "แจ้งปัญหาเรื่องงานนี้" ของห้องงาน S2.4) ⇒ การ์ด "แนบห้องงาน: <ชื่อห้อง>" ถอดได้ · มาจากห้อง = เลือกชิป "เลขาทำผิด" ไว้ก่อน
//     สำเร็จ ⇒ เปิดห้องแจ้งปัญหา /secretary/help/<id> · ปุ่ม + = แนบรูป (HelpAttach → POST secretary/support/upload)
//   จุดสถานะ 3 สี (CaseRow): ส้ม รอทีม · เขียว ทีมตอบแล้วรอคุณ · เทา ปิดแล้ว · โหลดใหม่ทุกครั้งที่กลับมาที่จอ (useFocusEffect)
// ข้อความผ่าน i18n (help.*) · สีจากธีม · สเกล R-UI1
import { useCallback, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Chip, Glass, Icon, InputBar, Loading, Note, SectionLabel } from "@/src/components/airy";
import { SecTopBar } from "@/src/components/secretary/SecTopBar";
import { CaseRow } from "@/src/components/secretary/CaseRow";
import { AttachedRow, useHelpAttach } from "@/src/components/secretary/HelpAttach";
import { ApiError } from "@/src/api/client";
import {
  helpSubjectBody,
  normalizeHelpCases,
  normalizeRoomDetail,
  secGet,
  secGetId,
  secPost,
  secUpload,
  serverNote,
  useActiveRole,
  type HelpCaseRow,
  type HelpCategory,
  type HelpOpenBody,
} from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { cardGap, radii, spacing, type as T } from "@/src/theme/tokens";

/** ชิปหัวข้อ (ลำดับตามแบบ H1) → category ของ POST support/cases */
const CHIPS: { category: HelpCategory; label: I18nKey }[] = [
  { category: "bug", label: "help.cat.bug" },
  { category: "secretary_wrong", label: "help.cat.secretary_wrong" },
  { category: "question", label: "help.cat.question" },
  { category: "billing", label: "help.cat.billing" },
  { category: "feature", label: "help.cat.feature" },
];
const ROOM_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const INPUT_BOTTOM = 26;

export default function SecretaryHelpScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const role = useActiveRole();
  const params = useLocalSearchParams<{ roomId?: string }>();
  const fromRoom = typeof params.roomId === "string" && ROOM_ID_RE.test(params.roomId) ? params.roomId : null;

  const [items, setItems] = useState<HelpCaseRow[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<HelpCategory | null>(fromRoom ? "secretary_wrong" : null);
  const [roomId, setRoomId] = useState<string | null>(fromRoom);
  const [roomTitle, setRoomTitle] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const busy = useRef(false);
  const upload = useCallback((form: FormData) => secUpload("secretary/support/upload", form), []);
  const att = useHelpAttach(upload);

  const load = useCallback(async () => {
    try {
      const r = await secGet("secretary/support/cases");
      setItems(normalizeHelpCases(r));
      setOffline(false);
    } catch {
      setOffline(true);
      setItems((cur) => cur ?? []);
    }
    setNowMs(Date.now());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // ค่าจาก query เปลี่ยน (เปิดจากห้องอื่น) ⇒ แนบห้องใหม่
  useEffect(() => {
    setRoomId(fromRoom);
    if (fromRoom) setCategory("secretary_wrong");
  }, [fromRoom]);

  // ชื่อห้องงานที่แนบ (GET secretary/rooms/[id]) · โหลดไม่ได้ = แสดงแบบไม่มีชื่อ (เซิร์ฟเวอร์ตรวจสิทธิ์ห้องเองตอนเปิดเรื่อง)
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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const send = async () => {
    if (busy.current) return;
    const parsed = helpSubjectBody(draft) ?? (att.atts.length ? { subject: t("help.attach.subject"), body: t("help.attach.subject") } : null);
    if (!parsed) return;
    busy.current = true;
    setSending(true);
    setErr(null);
    const body: HelpOpenBody = { subject: parsed.subject, body: parsed.body };
    if (category) body.category = category;
    if (roomId) body.roomId = roomId;
    if (att.atts.length) body.attachments = att.atts;
    try {
      const r = await secPost("secretary/support/cases", body);
      setDraft("");
      att.clear();
      router.push(`/secretary/help/${encodeURIComponent(r.id)}`);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 429 ? t("help.err.rate") : (serverNote(e) ?? t("help.err.open")));
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  const attNote = att.note ? ("key" in att.note ? t(att.note.key) : att.note.text) : null;
  const note = err ?? attNote;
  const list = items ?? [];

  return (
    <AiryScreen testID="help-home">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          testID="help-list"
          style={styles.flex}
          contentContainerStyle={styles.page}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.textMuted} />}
        >
          <SecTopBar zone="secretary" center="none" helpOn />
          <Text style={[styles.h, { color: c.text }]}>{t("help.title")}</Text>
          <Text style={[styles.sub, { color: c.textMuted }]}>{role === "OWNER" ? t("help.subOwner") : t("help.sub")}</Text>

          <SectionLabel style={styles.sec}>{t("help.newCase")}</SectionLabel>
          <View style={styles.chips}>
            {CHIPS.map((x) => (
              <Chip key={x.category} testID="help-chip" label={t(x.label)} active={category === x.category} onPress={() => setCategory((cur) => (cur === x.category ? null : x.category))} />
            ))}
          </View>

          {roomId ? (
            <Glass testID="help-room-attached" pad={{ v: 10, h: 14 }} radius={radii.sugg} style={styles.room}>
              <Icon name="paperclip" size={16} color={c.textDim} />
              <Text style={[styles.roomT, { color: c.text }]} numberOfLines={2}>
                {roomTitle ? t("help.roomAttached", { title: roomTitle }) : t("help.roomAttachedNoTitle")}
              </Text>
              <Pressable testID="help-room-detach" accessibilityRole="button" accessibilityLabel={t("help.roomDetach")} hitSlop={8} onPress={() => setRoomId(null)}>
                <Icon name="x" size={16} color={c.textMuted} />
              </Pressable>
            </Glass>
          ) : null}

          <SectionLabel style={styles.sec}>{t("help.myCases")}</SectionLabel>
          {items === null ? <Loading testID="help-loading" /> : null}
          {items && list.length === 0 ? (
            <Note testID="help-empty" style={styles.empty}>
              {offline ? t("help.offline") : t("help.empty")}
            </Note>
          ) : null}
          <View style={styles.rows}>
            {list.map((x) => (
              <CaseRow key={x.id} testID="help-case-row" item={x} nowMs={nowMs} onPress={() => router.push(`/secretary/help/${encodeURIComponent(x.id)}`)} />
            ))}
          </View>
          {offline && list.length > 0 ? <Note style={styles.foot}>{t("help.offline")}</Note> : null}
          <Text style={[styles.foot, { color: c.textMuted }]}>{t("help.sla")}</Text>
        </ScrollView>

        {note ? (
          <Text testID="help-flash" style={[styles.flash, { color: c.warn.fg, backgroundColor: c.warn.bg }]}>
            {note}
          </Text>
        ) : null}
        <AttachedRow testID="help-attached" atts={att.atts} uploading={att.uploading} onRemove={att.remove} />
        <InputBar
          testID="help-input"
          sendTestID="help-send"
          plusTestID="help-home-attach"
          placeholder={t("help.input")}
          value={draft}
          onChangeText={(v) => {
            setDraft(v);
            if (err) setErr(null);
          }}
          onSend={() => void send()}
          onPlus={() => void att.attach()}
          plusDisabled={att.uploading || sending}
          sendDisabled={(!draft.trim() && att.atts.length === 0) || sending || att.uploading}
          maxLength={4000}
          style={styles.input}
        />
      </KeyboardAvoidingView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: cardGap * 2 },
  h: { fontSize: F.title, fontWeight: "700", letterSpacing: -0.5, marginTop: F.v(32), lineHeight: 38 },
  sub: { fontSize: F.sub - 0.5, lineHeight: 20, marginTop: 6 },
  sec: { marginTop: F.v(40), marginLeft: 6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  room: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  roomT: { flex: 1, minWidth: 0, fontSize: T.sub, lineHeight: 20 },
  rows: { marginTop: 10, gap: cardGap },
  empty: { marginTop: 10 },
  foot: { fontSize: T.cap - 0.5, lineHeight: 18, textAlign: "center", marginTop: F.v(30) },
  flash: { marginHorizontal: spacing.page, marginBottom: spacing.sm, fontSize: 13, lineHeight: 19, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, overflow: "hidden", textAlign: "center" },
  input: { marginHorizontal: spacing.page, marginBottom: INPUT_BOTTOM },
});
