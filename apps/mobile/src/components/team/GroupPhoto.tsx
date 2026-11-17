// รูปกลุ่ม (B27 · team4.png จอ 3 ปุ่ม 📷 + จอ 5 วงรูปกลุ่ม) — เลือก 1 รูปจากคลังรูป → อัปทันที (POST secretary/team/attachments · ส่วนตัว)
//   เซิร์ฟเวอร์รับเป็น photoFileId ได้เฉพาะรูปที่ผู้เรียกอัปเองภายใน 24 ชม. (ownImage ใน team-chat/service.ts) — จอส่งแค่ fileId
//   ขออนุญาตคลังรูปตอนแตะเท่านั้น · ไม่อนุญาต = ข้อความ sec.attach.permPhoto (ไม่ throw)
//   GroupPhotoButton = วงกลม 64: ยังไม่มีรูป = ไอคอนกล้องบนพื้นเทา (จอ 3) · มีรูปในเครื่อง = รูปย่อ · มีรูปบนเซิร์ฟเวอร์ = GroupAvatar (จอ 5)
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Icon } from "@/src/components/airy";
import { GroupAvatar } from "@/src/components/team/TeamRow";
import { secUpload, serverNote } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";

export const GROUP_PHOTO = 64;

export type GroupPhotoState = { uri: string | null; fileId: string | null; uploading: boolean; note: { key: I18nKey } | { text: string } | null };

/** เลือก+อัปรูปกลุ่ม 1 รูป */
export function useGroupPhoto() {
  const [st, setSt] = useState<GroupPhotoState>({ uri: null, fileId: null, uploading: false, note: null });
  const pick = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setSt((s) => ({ ...s, note: { key: "sec.attach.permPhoto" } }));
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, allowsEditing: true, aspect: [1, 1], exif: false });
      if (res.canceled || !res.assets[0]) return;
      const a = res.assets[0];
      const name = a.fileName ?? `group-${Date.now()}.jpg`;
      const type = a.mimeType ?? "image/jpeg";
      setSt({ uri: a.uri, fileId: null, uploading: true, note: null });
      const form = new FormData();
      if (Platform.OS === "web") form.append("file", a.file ?? (await (await fetch(a.uri)).blob()), name);
      else form.append("file", { uri: a.uri, name, type } as unknown as Blob);
      const up = await secUpload("secretary/team/attachments", form);
      setSt({ uri: a.uri, fileId: up.id, uploading: false, note: null });
    } catch (e) {
      const s = serverNote(e);
      setSt({ uri: null, fileId: null, uploading: false, note: s ? { text: s } : { key: "sec.attach.fail" } });
    }
  }, []);
  const reset = useCallback(() => setSt({ uri: null, fileId: null, uploading: false, note: null }), []);
  return { ...st, pick, reset };
}

export function GroupPhotoButton({
  testID,
  label,
  localUri,
  uploading,
  threadId,
  photoFileId,
  onPress,
}: {
  testID: string;
  label: string;
  localUri: string | null;
  uploading: boolean;
  /** รูปบนเซิร์ฟเวอร์ (จอตั้งค่ากลุ่ม) */
  threadId?: string | null;
  photoFileId?: string | null;
  onPress?: () => void;
}) {
  const { c } = useTheme();
  const t = useT();
  const box = { width: GROUP_PHOTO, height: GROUP_PHOTO, borderRadius: GROUP_PHOTO / 2 };
  const inner = localUri ? (
    <Image source={{ uri: localUri }} style={[box, { backgroundColor: c.chip.bg }]} accessibilityLabel={t("team.group.photo")} />
  ) : threadId ? (
    <GroupAvatar size={GROUP_PHOTO} threadId={threadId} photoFileId={photoFileId} />
  ) : (
    <View style={[box, styles.empty, { backgroundColor: c.chip.bg }]}>
      <Icon name="camera" size={24} color={c.textMuted} />
    </View>
  );
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} disabled={!onPress || uploading} onPress={onPress} style={box}>
      {inner}
      {uploading ? (
        <View style={[StyleSheet.absoluteFill, styles.empty, box, { backgroundColor: c.dim }]}>
          <ActivityIndicator color={c.onSys} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: "center", justifyContent: "center" },
});
