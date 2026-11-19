// ช่วยเหลือ = รายการเคส (help-cases · 15 พ.ย. 2026 · จอ 1+2 ของแบบ /root/mockups/secretary-help/help.png ที่เจ้าของอนุมัติ)
//   จอ 1: แถบบน (ปุ่ม ? ทึบ) · ค้นหาเลขเคส/หัวเรื่อง · ชิปกรอง ทั้งหมด / กำลังดำเนินการ / รอคุณ (จำนวน) / ปิดแล้ว · การ์ดเคส (CaseRow)
//     เจ้าของตัด: หัวข้อใหญ่/คำอธิบาย · ชิปหัวข้อ · ข้อความว่าง · บรรทัด SLA · ช่องพิมพ์ล่าง ⇒ รายการว่าง = ไม่มีข้อความ
//     ข้อมูล: GET secretary/support/cases (`listCasesForUser` — OWNER เห็นทุกเรื่องของร้าน · คนอื่นเห็นเรื่องของตัวเอง · stage/stageStep/unreadCount)
//   ปุ่ม + บนแถบ (โซนช่วยเหลือ) = แผ่น "แจ้งปัญหาใหม่" (จอ 2 · เจ้าของ: ไม่มีชิปหัวข้อ): เล่าปัญหา (หลายบรรทัด) · แนบ รูปภาพ/ถ่ายรูป/ไฟล์ (SecAttach →
//     POST secretary/support/attachments · ส่วนตัว) · ส่งเรื่อง · บรรทัด SLA ใต้ปุ่ม
//     POST secretary/support/cases { subject = บรรทัดแรก, body = ทั้งข้อความ, files?, roomId?, category? } ⇒ ได้เลขเคส ⇒ เปิดห้องของเคส
//     `?roomId=` (เมนู ⋯ "แจ้งปัญหาเรื่องงานนี้" ของห้องงาน) ⇒ เปิดแผ่นเอง + การ์ด "แนบห้องงาน" (ถอดได้) + หมวด secretary_wrong · `?new=1` ⇒ เปิดแผ่นเอง
// ข้อความผ่าน i18n (help.*) · สีจากธีม
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "@/src/components/ui/text";
import { AiryScreen, Glass, Icon, LoadError, Loading, Note, PrimaryButton, Sheet } from "@/src/components/airy";
import { SecTopBar } from "@/src/components/secretary/SecTopBar";
import { CaseRow } from "@/src/components/secretary/CaseRow";
import { AttachSheet, AttachTray, useSecAttach } from "@/src/components/secretary/SecAttach";
import { ApiError } from "@/src/api/client";
import {
  helpFilterOf,
  helpMatches,
  helpSubjectBody,
  isDenied,
  normalizeHelpCases,
  normalizeRoomDetail,
  secGet,
  secGetId,
  secPost,
  serverNote,
  type HelpCaseRow,
  type HelpFilter,
  type HelpOpenBody,
} from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { cardGap, radii, spacing, type as T } from "@/src/theme/tokens";

const ROOM_ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const FILTERS: { key: HelpFilter; label: I18nKey }[] = [
  { key: "all", label: "help.f.all" },
  { key: "active", label: "help.f.active" },
  { key: "you", label: "help.f.you" },
  { key: "closed", label: "help.f.closed" },
];

export default function SecretaryHelpScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ roomId?: string; new?: string }>();
  const fromRoom = typeof params.roomId === "string" && ROOM_ID_RE.test(params.roomId) ? params.roomId : null;

  const [items, setItems] = useState<HelpCaseRow[] | null>(null);
  const [offline, setOffline] = useState(false);
  // R-S2.14h: 403 ⇒ การ์ดล็อก (รายการเรื่อง) · แผ่นแจ้งปัญหาใหม่ยังใช้ได้ตามสิทธิ์ของ POST
  const [denied, setDenied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<HelpFilter>("all");
  const [nowMs, setNowMs] = useState(() => Date.now());

  // แผ่นแจ้งปัญหาใหม่
  const [sheet, setSheet] = useState(!!fromRoom || params.new === "1");
  const [roomId, setRoomId] = useState<string | null>(fromRoom);
  const [roomTitle, setRoomTitle] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const busy = useRef(false);
  const attach = useSecAttach("secretary/support/attachments");

  const load = useCallback(async () => {
    try {
      const r = await secGet("secretary/support/cases");
      setItems(normalizeHelpCases(r));
      setOffline(false);
      setDenied(false);
    } catch (e) {
      if (isDenied(e)) setDenied(true);
      else setOffline(true);
      setItems((cur) => cur ?? []);
    }
    setNowMs(Date.now());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // ค่าจาก query เปลี่ยน (เปิดจากห้องอื่น / ?new=1) ⇒ แนบห้องใหม่ + เปิดแผ่น
  useEffect(() => {
    setRoomId(fromRoom);
    if (fromRoom || params.new === "1") setSheet(true);
  }, [fromRoom, params.new]);

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

  const list = items ?? [];
  const youCount = useMemo(() => list.filter((x) => helpFilterOf(x.stage) === "you").length, [list]);
  const shown = useMemo(() => list.filter((x) => (filter === "all" || helpFilterOf(x.stage) === filter) && helpMatches(x, q)), [list, filter, q]);

  const send = async () => {
    if (busy.current || !attach.ready) return;
    const parsed = helpSubjectBody(draft) ?? (attach.items.length ? { subject: t("help.attach.subject"), body: t("help.attach.subject") } : null);
    if (!parsed) return;
    busy.current = true;
    setSending(true);
    setErr(null);
    const body: HelpOpenBody = { subject: parsed.subject, body: parsed.body };
    if (roomId) {
      body.roomId = roomId;
      body.category = "secretary_wrong";
    }
    const refs = attach.refs();
    if (refs.length) body.files = refs;
    try {
      const r = await secPost("secretary/support/cases", body);
      setDraft("");
      attach.take();
      setSheet(false);
      setRoomId(null);
      router.push(`/secretary/help/${encodeURIComponent(r.id)}`);
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 429 ? t("help.err.rate") : (serverNote(e) ?? t("help.err.open")));
    } finally {
      busy.current = false;
      setSending(false);
    }
  };

  const canSend = (!!draft.trim() || attach.items.length > 0) && attach.ready && !sending;

  return (
    <AiryScreen testID="help-home">
      <ScrollView
        testID="help-list"
        style={styles.flex}
        contentContainerStyle={styles.page}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={c.textMuted} />}
      >
        <SecTopBar zone="secretary" center="none" helpOn onPlus={() => setSheet(true)} plusLabel="help.top.new" />

        <View style={[styles.search, { backgroundColor: c.surface }]}>
          <Icon name="search" size={16} color={c.textMuted} />
          <TextInput
            testID="help-search"
            value={q}
            onChangeText={setQ}
            placeholder={t("help.search")}
            placeholderTextColor={c.placeholder}
            style={[styles.searchIn, { color: c.text }]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {q ? (
            <Pressable testID="help-search-clear" accessibilityRole="button" accessibilityLabel={t("sec.attach.remove")} hitSlop={8} onPress={() => setQ("")}>
              <Icon name="x" size={15} color={c.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <Pressable
                key={f.key}
                testID={`help-filter-${f.key}`}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setFilter(f.key)}
                style={[styles.chip, { backgroundColor: on ? c.accent : c.surface }]}
              >
                <Text style={[styles.chipT, { color: on ? c.onAccent : c.textDim }, on && styles.chipOn]}>
                  {t(f.label)}
                  {f.key === "you" && youCount > 0 ? <Text style={[styles.chipN, { color: on ? c.onAccent : c.helpStage.NEED_INFO }]}>{` ${youCount}`}</Text> : null}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {items === null ? <Loading testID="help-loading" /> : null}
        {denied ? <LoadError testID="help-denied" denied /> : null}
        {offline && list.length === 0 && !denied ? <LoadError testID="help-error" message={t("help.offline")} onRetry={() => void load()} /> : null}
        <View style={styles.rows}>
          {shown.map((x) => (
            <CaseRow key={x.id} testID="help-case-row" item={x} nowMs={nowMs} onPress={() => router.push(`/secretary/help/${encodeURIComponent(x.id)}`)} />
          ))}
        </View>
        {offline && list.length > 0 ? <Note style={styles.foot}>{t("help.offline")}</Note> : null}
      </ScrollView>

      <Sheet visible={sheet} onClose={() => setSheet(false)} testID="help-new" top={Platform.OS === "web" ? 110 : 90}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetPage}>
          <Text accessibilityRole="header" style={[styles.sh, { color: c.text }]}>
            {t("help.new.title")}
          </Text>
          <Text style={[styles.shSub, { color: c.textMuted }]}>{t("help.new.sub")}</Text>

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

          <Text style={[styles.lb, { color: c.textMuted }]}>{t("help.new.label")}</Text>
          <TextInput
            testID="help-new-body"
            value={draft}
            onChangeText={(v) => {
              setDraft(v);
              if (err) setErr(null);
            }}
            placeholder={t("help.new.ph")}
            placeholderTextColor={c.placeholder}
            multiline
            maxLength={4000}
            textAlignVertical="top"
            style={[styles.ta, { color: c.text, backgroundColor: c.surface, borderColor: c.divider }]}
          />

          <View style={styles.attRow}>
            {Platform.OS === "web" ? null : (
              <Pressable
                testID="help-new-camera"
                accessibilityRole="button"
                accessibilityLabel={t("sec.attach.camera")}
                onPress={() => void attach.pick("camera")}
                style={[styles.tile, { backgroundColor: c.chip.bg }]}
              >
                <Icon name="camera" size={22} color={c.textDim} />
              </Pressable>
            )}
            <Pressable
              testID="help-new-attach"
              accessibilityRole="button"
              accessibilityLabel={t("help.new.attach")}
              onPress={() => setAttachOpen(true)}
              style={[styles.tile, { backgroundColor: c.chip.bg }]}
            >
              <Icon name="plus" size={22} color={c.textDim} />
            </Pressable>
          </View>
          <AttachTray items={attach.items} note={attach.note} onRemove={attach.remove} testID="help-new-tray" />

          {err ? (
            <Text testID="help-flash" style={[styles.flash, { color: c.warn.fg, backgroundColor: c.warn.bg }]}>
              {err}
            </Text>
          ) : null}
          <View style={styles.go}>
            <PrimaryButton testID="help-new-send" label={t("help.new.send")} disabled={!canSend} onPress={() => void send()} />
          </View>
          <Text style={[styles.sla, { color: c.textMuted }]}>{t("help.sla")}</Text>
        </ScrollView>
      </Sheet>
      <AttachSheet visible={attachOpen} onClose={() => setAttachOpen(false)} onPick={(k) => void attach.pick(k)} name={t("help.attachFor")} testID="help-attach-sheet" />
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: cardGap * 2 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, height: 44, borderRadius: 22, paddingHorizontal: 16, marginTop: 18 },
  searchIn: { flex: 1, minWidth: 0, fontSize: T.sub, paddingVertical: 0, outlineWidth: 0 },
  chips: { gap: 8, paddingTop: 14, paddingRight: 4 },
  chip: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 18 },
  chipT: { fontSize: 13.5, lineHeight: 19 },
  chipOn: { fontWeight: "700" },
  chipN: { fontWeight: "700" },
  rows: { marginTop: 14, gap: cardGap },
  foot: { marginTop: 18 },
  sheetPage: { paddingBottom: 30 },
  sh: { fontSize: 21, fontWeight: "800", lineHeight: 28 },
  shSub: { fontSize: T.cap, lineHeight: 18, marginTop: 2 },
  room: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  roomT: { flex: 1, minWidth: 0, fontSize: T.sub, lineHeight: 20 },
  lb: { fontSize: T.cap, marginTop: 16, marginBottom: 8, marginLeft: 2 },
  ta: { minHeight: 130, borderWidth: 1.5, borderRadius: 16, padding: 12, fontSize: T.sub, lineHeight: 21, outlineWidth: 0 },
  attRow: { flexDirection: "row", gap: 8, marginTop: 10, marginBottom: 6 },
  tile: { width: 64, height: 64, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  flash: { marginTop: 8, fontSize: 13, lineHeight: 19, borderRadius: radii.k + 2, paddingVertical: 8, paddingHorizontal: 12, overflow: "hidden", textAlign: "center" },
  go: { marginTop: 16 },
  sla: { fontSize: 11.5, lineHeight: 17, textAlign: "center", marginTop: 10 },
});
