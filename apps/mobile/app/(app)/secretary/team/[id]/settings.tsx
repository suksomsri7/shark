// ตั้งค่ากลุ่ม (B27 · แบบ /root/mockups/team-invite/team4.png จอ 5 · เจ้าของอนุมัติ 17 พ.ย. 2026) — เปิดจาก ⚙ หัวห้องกลุ่ม
//   หัว: ‹ กลับ · "ตั้งค่ากลุ่ม" + ชื่อกลุ่ม · แถวรูปกลุ่ม + ชื่อกลุ่ม ✎ (ผู้ดูแลแก้ได้ · PATCH team/threads/[id] {name|photoFileId})
//   "สมาชิก N คน": "+ เพิ่มสมาชิก" (ผู้ดูแล → แผ่นเลือกคนในทีมที่ยังไม่อยู่ · POST …/members) · แถวสมาชิก = บทบาท/ผู้สร้างกลุ่ม/แอดมินกลุ่ม
//     ⋯ ต่อคน (ผู้ดูแลเท่านั้น · ไม่ใช่ตัวเอง) = ตั้ง/ถอดแอดมินกลุ่ม (PUT …/members/[userId]) · เอาออกจากกลุ่ม (DELETE …/members/[userId])
//   "การแจ้งเตือน": ปิดเสียงกลุ่มนี้ (ของฉันเอง · PATCH {muted}) · "ออกจากกลุ่ม" สีแดง ⇒ แผ่นยืนยันในแอป ⇒ POST …/leave ⇒ กลับรายชื่อทีม
//   สิทธิ์ตัดสินที่เซิร์ฟเวอร์ (ผู้ดูแลกลุ่ม) — จอซ่อนปุ่มที่ทำไม่ได้ตาม thread.myRole · ห้อง 1:1/ไม่ใช่สมาชิก = 404 ⇒ "ไม่พบห้องแชทนี้"
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, Glass, Icon, IconBtn, LoadError, Loading, Note, PrimaryButton, Sheet, TopBar } from "@/src/components/airy";
import { Toggle } from "@/src/components/secretary/SettingRow";
import { MemberRow } from "@/src/components/team/TeamRow";
import { GroupPhotoButton, useGroupPhoto } from "@/src/components/team/GroupPhoto";
import { ApiError } from "@/src/api/client";
import { serverNote } from "@/src/api/secretary";
import { addGroupMembers, getTeam, getThread, leaveGroup, patchThread, removeGroupMember, setGroupAdmin, type TeamMember, type TeamPerson, type TeamThreadDetail } from "@/src/api/team";
import { useT, type I18nKey } from "@/src/i18n";
import { F, glassStyle, useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";

const NAME_MAX = 60;

export default function TeamGroupSettingsScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = typeof rawId === "string" ? rawId : "";
  const photo = useGroupPhoto();

  const [thread, setThread] = useState<TeamThreadDetail | null>(null);
  const [gone, setGone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; warn: boolean } | null>(null);
  const [actOn, setActOn] = useState<TeamMember | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [adding, setAdding] = useState<TeamPerson[] | null>(null);
  const [addPick, setAddPick] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await getThread(id);
      if (r.thread.kind !== "GROUP") {
        setGone(true);
        return;
      }
      setThread(r.thread);
      setFailed(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setGone(true);
      else setFailed(true);
    }
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const admin = thread?.myRole === "ADMIN";
  const back = () => (router.canGoBack() ? router.back() : router.navigate(`/secretary/team/${id}`));
  const fail = (e: unknown) => setNote({ text: serverNote(e) ?? t("team.add.err"), warn: true });

  /** ทำรายการแล้วโหลดหัวห้องใหม่ (คืน false = ล้ม · ข้อความขึ้นแล้ว) */
  const run = async (fn: () => Promise<unknown>): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setNote(null);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      fail(e);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    if (!thread || name === null) return;
    const n = name.replace(/\s+/g, " ").trim();
    if (!n || n === thread.name) {
      setName(null);
      return;
    }
    if (await run(() => patchThread(id, { name: n }))) setName(null);
  };

  // รูปใหม่อัปเสร็จ ⇒ ตั้งเป็นรูปกลุ่มทันที (ครั้งเดียวต่อไฟล์)
  const pickPhoto = () => void photo.pick();
  const appliedPhoto = useRef<string | null>(null);
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    const f = photo.fileId;
    if (!f || appliedPhoto.current === f) return;
    appliedPhoto.current = f;
    void runRef.current(() => patchThread(id, { photoFileId: f }));
  }, [photo.fileId, id]);

  const toggleMute = (v: boolean) => void run(() => patchThread(id, { muted: v }));

  const openAdd = async () => {
    setNote(null);
    try {
      const team = await getTeam();
      const inGroup = new Set(thread?.members.map((m) => m.userId) ?? []);
      setAddPick(new Set());
      setAdding(team.people.filter((p) => !p.me && !inGroup.has(p.userId)));
    } catch (e) {
      fail(e);
    }
  };
  const confirmAdd = async () => {
    const ids = [...addPick];
    setAdding(null);
    if (ids.length) await run(() => addGroupMembers(id, ids));
  };

  const doAdmin = async () => {
    const m = actOn;
    setActOn(null);
    if (m) await run(() => setGroupAdmin(id, m.userId, !m.admin));
  };
  const doRemove = async () => {
    const m = actOn;
    setActOn(null);
    if (m) await run(() => removeGroupMember(id, m.userId));
  };
  const doLeave = async () => {
    setLeaving(false);
    if (busy) return;
    setBusy(true);
    try {
      await leaveGroup(id);
      router.navigate("/secretary/staff");
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  };

  const tagOf = (m: TeamMember) => (m.tag ? t(`team.tag.${m.tag}` as I18nKey) : "");
  const subOf = (m: TeamMember) => {
    const creator = m.userId === thread?.createdById;
    return [creator ? t("team.gs.creator") : tagOf(m), m.admin && !creator ? t("team.gs.admin") : null].filter(Boolean).join(" · ");
  };
  const members = useMemo(() => (thread ? [...thread.members.filter((m) => m.me), ...thread.members.filter((m) => !m.me)] : []), [thread]);
  const shownName = name ?? thread?.name ?? "";

  return (
    <AiryScreen testID="team-group-settings">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TopBar
            testID="team-gs-top"
            left={<IconBtn testID="team-gs-back" icon="chevron-left" label={t("team.room.back")} onPress={back} />}
            title={t("team.gs.title")}
            subtitle={thread?.name ?? ""}
            right={<View style={styles.spacer} />}
          />

          {gone ? (
            <Glass testID="team-gs-gone" style={styles.gone}>
              <Text style={[styles.goneT, { color: c.text }]}>{t("team.room.gone")}</Text>
              <PrimaryButton testID="team-gs-gone-back" label={t("team.room.toList")} onPress={() => router.navigate("/secretary/staff")} />
            </Glass>
          ) : !thread ? (
            failed ? (
              <LoadError testID="team-gs-error" onRetry={() => void load()} />
            ) : (
              <Loading testID="team-gs-loading" />
            )
          ) : (
            <>
              <View style={styles.head}>
                <GroupPhotoButton
                  testID="team-gs-photo"
                  label={t("team.group.photo")}
                  localUri={photo.uri}
                  uploading={photo.uploading}
                  threadId={thread.id}
                  photoFileId={thread.photoFileId}
                  onPress={admin ? pickPhoto : undefined}
                />
                <View style={[styles.nameBox, { backgroundColor: c.surface, borderColor: c.divider }]}>
                  {admin ? (
                    <>
                      <TextInput
                        testID="team-gs-name"
                        value={shownName}
                        onChangeText={setName}
                        onBlur={() => void saveName()}
                        onSubmitEditing={() => void saveName()}
                        maxLength={NAME_MAX}
                        returnKeyType="done"
                        style={[styles.nameT, { color: c.text }]}
                      />
                      <Icon name="edit-2" size={15} color={c.textMuted} />
                    </>
                  ) : (
                    <Text testID="team-gs-name-ro" style={[styles.nameT, { color: c.text }]} numberOfLines={1}>
                      {thread.name}
                    </Text>
                  )}
                </View>
              </View>

              {note ? (
                <Note testID="team-gs-note" warn={note.warn} style={styles.note}>
                  {note.text}
                </Note>
              ) : null}

              <Text style={[styles.label, { color: c.textMuted }]}>{t("team.gs.members", { n: thread.members.length })}</Text>
              {admin ? (
                <Pressable testID="team-gs-add" accessibilityRole="button" disabled={busy} onPress={() => void openAdd()} style={[glassStyle(c, radii.sugg - 2), styles.addRow]}>
                  <Icon name="plus" size={17} color={c.team.unreadBg} />
                  <Text style={[styles.addT, { color: c.team.unreadBg }]}>{t("team.gs.add")}</Text>
                </Pressable>
              ) : null}
              {members.map((m) => (
                <MemberRow
                  key={m.userId}
                  testID="team-gs-member"
                  name={m.me ? t("team.gs.you", { tag: tagOf(m) || t("team.gs.member") }) : m.name}
                  seed={m.userId}
                  sub={subOf(m)}
                  right={
                    admin && !m.me ? (
                      <Pressable testID="team-gs-more" accessibilityRole="button" accessibilityLabel={t("team.gs.more", { name: m.name })} hitSlop={10} onPress={() => setActOn(m)} style={styles.more}>
                        <Icon name="more-horizontal" size={20} color={c.textMuted} />
                      </Pressable>
                    ) : undefined
                  }
                />
              ))}

              <Text style={[styles.label, { color: c.textMuted }]}>{t("team.gs.notify")}</Text>
              <View style={[glassStyle(c, radii.sugg - 2), styles.muteRow]}>
                <Text style={[styles.muteT, { color: c.text }]}>{t("team.gs.mute")}</Text>
                <Toggle testID="team-gs-mute" value={thread.muted} onChange={toggleMute} disabled={busy} label={t("team.gs.mute")} />
              </View>

              <Pressable testID="team-gs-leave" accessibilityRole="button" disabled={busy} onPress={() => setLeaving(true)} style={[glassStyle(c, radii.sugg - 2), styles.leaveRow]}>
                <Text style={[styles.leaveT, { color: c.danger.bg }]}>{t("team.gs.leave")}</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Sheet visible={!!actOn} onClose={() => setActOn(null)} testID="team-gs-member-menu" top={560}>
        <Text style={[styles.sh, { color: c.text }]} numberOfLines={1}>
          {actOn?.name ?? ""}
        </Text>
        <Pressable testID="team-gs-admin" accessibilityRole="button" onPress={() => void doAdmin()} style={[styles.menuRow, { borderBottomColor: c.divider }]}>
          <Icon name={actOn?.admin ? "user-minus" : "shield"} size={19} />
          <Text style={[styles.menuT, { color: c.text }]}>{actOn?.admin ? t("team.gs.unadmin") : t("team.gs.makeAdmin")}</Text>
        </Pressable>
        <Pressable testID="team-gs-remove" accessibilityRole="button" onPress={() => void doRemove()} style={[styles.menuRow, { borderBottomColor: c.divider }]}>
          <Icon name="user-x" size={19} color={c.danger.bg} />
          <Text style={[styles.menuT, { color: c.danger.bg }]}>{t("team.gs.remove")}</Text>
        </Pressable>
      </Sheet>

      <Sheet visible={leaving} onClose={() => setLeaving(false)} testID="team-gs-leave-sheet" top={520}>
        <Text style={[styles.sh, { color: c.text }]}>{t("team.gs.leaveTitle", { name: thread?.name ?? "" })}</Text>
        <Text style={[styles.shSub, { color: c.textMuted }]}>{t("team.gs.leaveNote")}</Text>
        <View style={styles.acts}>
          <Pressable testID="team-gs-leave-no" accessibilityRole="button" onPress={() => setLeaving(false)} style={[glassStyle(c, size.iconBtn / 2), styles.btn]}>
            <Text style={[styles.btnT, { color: c.text }]}>{t("team.gs.stay")}</Text>
          </Pressable>
          <Pressable testID="team-gs-leave-ok" accessibilityRole="button" disabled={busy} onPress={() => void doLeave()} style={[styles.btn, styles.main, { backgroundColor: c.danger.bg }]}>
            <Text style={[styles.btnT, { color: c.danger.fg }]}>{t("team.gs.leaveOk")}</Text>
          </Pressable>
        </View>
      </Sheet>

      <Sheet visible={adding !== null} onClose={() => setAdding(null)} testID="team-gs-add-sheet" top={180}>
        <Text style={[styles.sh, { color: c.text }]}>{t("team.gs.add")}</Text>
        <ScrollView style={styles.addList} showsVerticalScrollIndicator={false}>
          {(adding ?? []).map((p) => (
            <MemberRow
              key={p.userId}
              testID="team-gs-add-person"
              name={p.name || t("sec.room.someone")}
              seed={p.userId}
              sub={t(`team.tag.${p.tag}` as I18nKey)}
              checked={addPick.has(p.userId)}
              onPress={() =>
                setAddPick((cur) => {
                  const next = new Set(cur);
                  if (next.has(p.userId)) next.delete(p.userId);
                  else next.add(p.userId);
                  return next;
                })
              }
            />
          ))}
          {adding && adding.length === 0 ? <Text style={[styles.shSub, { color: c.textMuted }]}>{t("team.gs.addNone")}</Text> : null}
        </ScrollView>
        <PrimaryButton testID="team-gs-add-ok" label={t("team.gs.addOk", { n: addPick.size })} disabled={addPick.size === 0} onPress={() => void confirmAdd()} />
      </Sheet>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: F.v(40) },
  spacer: { width: 44 },
  head: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: F.v(18) },
  nameBox: { flex: 1, height: 48, borderRadius: radii.k + 4, borderWidth: 1.5, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14 },
  nameT: { flex: 1, minWidth: 0, fontSize: T.body, fontWeight: "700", paddingVertical: 0, outlineWidth: 0 },
  note: { marginTop: 12, textAlign: "left" },
  label: { fontSize: T.cap + 0.5, marginTop: F.v(20), marginBottom: 2, marginLeft: 4 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 14, paddingHorizontal: 16, marginTop: 8 },
  addT: { fontSize: T.sub + 0.5, fontWeight: "700" },
  muteRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 16, marginTop: 8 },
  muteT: { fontSize: T.sub + 1 },
  leaveRow: { paddingVertical: 15, paddingHorizontal: 16, marginTop: 14 },
  leaveT: { fontSize: T.sub + 1, fontWeight: "700" },
  gone: { marginTop: F.v(60), alignItems: "center", gap: spacing.sm },
  goneT: { fontSize: T.body, fontWeight: "600", lineHeight: 23, textAlign: "center" },
  sh: { fontSize: T.h + 1, fontWeight: "700", lineHeight: 26, marginBottom: 6 },
  shSub: { fontSize: T.cap + 0.5, lineHeight: 19, marginBottom: 6 },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: size.iconBtn + 8, borderBottomWidth: StyleSheet.hairlineWidth },
  menuT: { fontSize: T.body - 1 },
  acts: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  btn: { flex: 1, height: size.iconBtn, borderRadius: size.iconBtn / 2, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  main: { flex: 1.6 },
  btnT: { fontSize: T.sub + 1, fontWeight: "600" },
  addList: { maxHeight: 420, marginBottom: 12 },
  // ⋯ ต่อคน (team4 จอ 5): จุดสามจุดเทาเปล่า ไม่มีวงปุ่ม
  more: { marginLeft: "auto", paddingHorizontal: 4, paddingVertical: 6 },
});
