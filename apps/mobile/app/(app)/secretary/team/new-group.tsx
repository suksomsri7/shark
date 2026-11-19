// สร้างกลุ่ม (B27 · แบบ /root/mockups/team-invite/team4.png จอ 3 · เจ้าของอนุมัติ 17 พ.ย. 2026)
//   หัว: ✕ ปิด · "สร้างกลุ่ม" + "เลือกแล้ว N คน" · แถวรูปกลุ่ม (📷 → useGroupPhoto · อัปทันที) + ช่องชื่อกลุ่ม (≤ 60)
//   "สมาชิก" = คนในทีมที่รับคำเชิญแล้ว (GET secretary/team · people ไม่รวมตัวเอง) ติ๊กเลือกได้ · คำเชิญที่ยังไม่รับ (pending) = จาง "รอยอมรับ · เลือกไม่ได้"
//   ปุ่มดำล่าง "สร้างกลุ่ม" ⇒ POST secretary/team/threads {name, userIds, photoFileId?} ⇒ เข้าห้องกลุ่ม (replace — ย้อนกลับไม่วนมาจอนี้)
//   ทุกคนในทีมสร้างกลุ่มได้ (ผู้สร้าง = ผู้ดูแลกลุ่ม · เซิร์ฟเวอร์ตรวจว่าทุกคนอยู่ในทีม) · ข้อความผ่าน i18n (team.group.*)
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "@/src/components/ui/text";
import { AiryScreen, IconBtn, LoadError, Loading, Note, PrimaryButton, TopBar } from "@/src/components/airy";
import { MemberRow } from "@/src/components/team/TeamRow";
import { GroupPhotoButton, useGroupPhoto } from "@/src/components/team/GroupPhoto";
import { serverNote } from "@/src/api/secretary";
import { createGroup, getTeam, type TeamList } from "@/src/api/team";
import { useT, type I18nKey } from "@/src/i18n";
import { F, useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

const NAME_MAX = 60;
const NAME_H = 48;

export default function TeamNewGroupScreen() {
  const { c } = useTheme();
  const t = useT();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const photo = useGroupPhoto();

  const [data, setData] = useState<TeamList | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getTeam());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const people = useMemo(() => (data?.people ?? []).filter((p) => !p.me), [data]);
  const toggle = (uid: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });

  const close = () => (router.canGoBack() ? router.back() : router.replace("/secretary/staff"));
  const clean = name.replace(/\s+/g, " ").trim();
  const canSave = !!clean && picked.size > 0 && !photo.uploading && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setNote(null);
    try {
      const r = await createGroup({ name: clean, userIds: [...picked], ...(photo.fileId ? { photoFileId: photo.fileId } : {}) });
      router.replace(`/secretary/team/${r.threadId}`);
    } catch (e) {
      setNote(serverNote(e) ?? t("team.group.err"));
      setSaving(false);
    }
  };

  const photoNote = photo.note ? ("key" in photo.note ? t(photo.note.key as I18nKey) : photo.note.text) : null;

  return (
    <AiryScreen testID="team-new-group">
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TopBar
            testID="team-new-group-top"
            left={<IconBtn testID="team-new-group-close" icon="x" label={t("team.add.close")} onPress={close} />}
            title={t("team.group.title")}
            subtitle={t("team.group.picked", { n: picked.size })}
            right={<View style={styles.spacer} />}
          />

          <View style={styles.head}>
            <GroupPhotoButton testID="team-new-group-photo" label={t("team.group.photo")} localUri={photo.uri} uploading={photo.uploading} onPress={() => void photo.pick()} />
            <View style={[styles.nameBox, { backgroundColor: c.surface, borderColor: c.divider }]}>
              <TextInput
                testID="team-new-group-name"
                value={name}
                onChangeText={setName}
                placeholder={t("team.group.namePh")}
                placeholderTextColor={c.placeholder}
                maxLength={NAME_MAX}
                returnKeyType="done"
                style={[styles.nameT, { color: c.text }]}
              />
            </View>
          </View>
          {photoNote ? (
            <Note testID="team-new-group-photo-note" warn style={styles.note}>
              {photoNote}
            </Note>
          ) : null}

          <Text style={[styles.label, { color: c.textMuted }]}>{t("team.group.members")}</Text>
          {data === null ? (
            failed ? (
              <LoadError testID="team-new-group-error" onRetry={() => void load()} />
            ) : (
              <Loading testID="team-new-group-loading" />
            )
          ) : (
            <>
              {people.map((p) => (
                <MemberRow
                  key={p.userId}
                  testID="team-new-group-person"
                  name={p.name || t("sec.room.someone")}
                  seed={p.userId}
                  sub={t(`team.tag.${p.tag}` as I18nKey)}
                  checked={picked.has(p.userId)}
                  onPress={() => toggle(p.userId)}
                />
              ))}
              {data.pending.map((inv) => (
                <MemberRow key={inv.inviteId} testID="team-new-group-pending" name={inv.name} seed={inv.inviteId} sub={t("team.group.pendingNo")} checked={false} dim />
              ))}
              {people.length === 0 ? <Text style={[styles.none, { color: c.textMuted }]}>{t("team.group.nobody")}</Text> : null}
            </>
          )}
          {note ? (
            <Note testID="team-new-group-note" warn style={styles.note}>
              {note}
            </Note>
          ) : null}
        </ScrollView>
        <View style={[styles.bottom, { paddingBottom: 18 + insets.bottom }]}>
          <PrimaryButton testID="team-new-group-submit" label={saving ? t("team.group.saving") : t("team.group.submit")} disabled={!canSave} onPress={() => void save()} />
        </View>
      </KeyboardAvoidingView>
    </AiryScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { paddingHorizontal: spacing.page, paddingTop: 14, paddingBottom: 24 },
  spacer: { width: 44 },
  head: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: F.v(18) },
  nameBox: { flex: 1, height: NAME_H, borderRadius: radii.k + 4, borderWidth: 1.5, justifyContent: "center", paddingHorizontal: 14 },
  nameT: { fontSize: T.body, fontWeight: "700", paddingVertical: 0, outlineWidth: 0 },
  label: { fontSize: T.cap + 0.5, marginTop: F.v(20), marginBottom: 2, marginLeft: 4 },
  none: { fontSize: T.sub, textAlign: "center", marginTop: F.v(24) },
  note: { marginTop: 12, textAlign: "left" },
  bottom: { paddingHorizontal: spacing.page, paddingTop: 8 },
});
