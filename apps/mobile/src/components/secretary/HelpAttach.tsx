// รูปแนบของเรื่องช่วยเหลือ (ใบ S2.15 · H1 เปิดเรื่อง + H2 ตอบในเรื่อง) — R-S1.14c
//   เลือกรูปจากเครื่องด้วย expo-image-picker (มีในแอปแล้ว · ไม่ติดตั้งเพิ่ม) · ภาพเท่านั้น (jpeg/png/webp/heic/heif/gif)
//   บีบอัดก่อนส่ง: quality 0.6 (iOS/Android เข้ารหัส JPEG ใหม่ · HEIC → JPEG) · ไม่มี expo-image-manipulator ⇒ ย่อขนาดภาพไม่ได้ (หนี้ใน wo-notes)
//   เกิน 4 MB หลังบีบอัด ⇒ ไม่ส่ง + ข้อความไทย · ส่ง = multipart `file` ผ่านฟังก์ชัน upload ที่จอส่งมา (POST secretary/support/upload)
//   ผลการอัปโหลด = ไฟล์แนบรอส่ง (≤ 5 ชิ้น) → จอใส่ใน attachments ของ POST cases / …/reply
import { useCallback, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Text } from "@/src/components/ui/text";
import { Icon } from "@/src/components/airy";
import { HELP_MAX_ATTACHMENTS, HELP_UPLOAD_MAX_BYTES, HELP_UPLOAD_TYPES, serverNote, type HelpAttachment, type HelpUpload } from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { radii, spacing, type as T } from "@/src/theme/tokens";

/** คุณภาพ JPEG ที่ขอจากตัวเลือกรูป (0..1) — ภาพถ่ายจอ/กล้องทั่วไปเหลือ ≈ 0.3–1.5 MB */
export const HELP_PICK_QUALITY = 0.6;

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif", "image/gif": "gif" };
const MIME_OF_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", gif: "image/gif" };

/** ชนิดภาพของรูปที่เลือก (mimeType ของเครื่อง → นามสกุลไฟล์ → ปริยาย jpeg เพราะ quality < 1 = JPEG) */
function mimeOf(a: ImagePicker.ImagePickerAsset): string {
  const m = (a.mimeType ?? "").toLowerCase();
  if (m) return m;
  const ext = (a.fileName ?? a.uri).split("?")[0]!.split(".").pop()?.toLowerCase() ?? "";
  return MIME_OF_EXT[ext] ?? "image/jpeg";
}

export type AttachNote = { key: I18nKey } | { text: string };

class TooBig extends Error {}
class BadType extends Error {}

export function useHelpAttach(upload: (form: FormData) => Promise<HelpUpload>) {
  const [atts, setAtts] = useState<HelpAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState<AttachNote | null>(null);
  const busy = useRef(false);

  const attach = useCallback(async () => {
    if (busy.current) return;
    if (atts.length >= HELP_MAX_ATTACHMENTS) {
      setNote({ key: "help.attach.max" });
      return;
    }
    setNote(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNote({ key: "help.attach.perm" });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: HELP_PICK_QUALITY, allowsEditing: false, allowsMultipleSelection: false, exif: false });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    busy.current = true;
    setUploading(true);
    try {
      let type = mimeOf(a);
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(a.uri)).blob();
        if (blob.type) type = blob.type.toLowerCase();
        if (!HELP_UPLOAD_TYPES.includes(type)) throw new BadType();
        if (blob.size > HELP_UPLOAD_MAX_BYTES) throw new TooBig();
        form.append("file", blob, a.fileName ?? `help-${Date.now()}.${EXT[type] ?? "jpg"}`);
      } else {
        if (!HELP_UPLOAD_TYPES.includes(type)) throw new BadType();
        if ((a.fileSize ?? 0) > HELP_UPLOAD_MAX_BYTES) throw new TooBig();
        form.append("file", { uri: a.uri, name: a.fileName ?? `help-${Date.now()}.${EXT[type] ?? "jpg"}`, type } as unknown as Blob);
      }
      const up = await upload(form);
      setAtts((cur) => (cur.length >= HELP_MAX_ATTACHMENTS ? cur : [...cur, { name: up.name || "image", url: up.url, kind: "image" }]));
    } catch (e) {
      setNote(e instanceof TooBig ? { key: "help.attach.tooBig" } : e instanceof BadType ? { key: "help.attach.type" } : serverNote(e) ? { text: serverNote(e)! } : { key: "help.attach.fail" });
    } finally {
      busy.current = false;
      setUploading(false);
    }
  }, [atts.length, upload]);

  const remove = useCallback((i: number) => setAtts((cur) => cur.filter((_, k) => k !== i)), []);
  const clear = useCallback(() => {
    setAtts([]);
    setNote(null);
  }, []);
  return { atts, uploading, note, setNote, attach, remove, clear };
}

/** ชิปรูปที่แนบรอส่ง (ถอดได้) + สถานะกำลังอัปโหลด */
export function AttachedRow({ atts, uploading, onRemove, testID }: { atts: HelpAttachment[]; uploading: boolean; onRemove: (i: number) => void; testID: string }) {
  const { c } = useTheme();
  const t = useT();
  if (!atts.length && !uploading) return null;
  return (
    <View testID={testID} style={styles.row}>
      {atts.map((a, i) => (
        <View key={`${a.url}-${i}`} testID={`${testID}-item`} style={[styles.chip, { backgroundColor: c.chip.bg }]}>
          <Icon name="image" size={14} color={c.textDim} />
          <Text style={[styles.chipT, { color: c.textDim }]} numberOfLines={1}>
            {t("help.attach.item", { n: i + 1 })}
          </Text>
          <Pressable testID={`${testID}-remove`} onPress={() => onRemove(i)} accessibilityRole="button" accessibilityLabel={t("help.attach.remove")} hitSlop={8}>
            <Icon name="x" size={14} color={c.textMuted} />
          </Pressable>
        </View>
      ))}
      {uploading ? (
        <Text testID={`${testID}-uploading`} style={[styles.chipT, styles.up, { color: c.textMuted }]}>
          {t("help.attach.uploading")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginHorizontal: spacing.page, marginBottom: spacing.sm },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radii.pill, maxWidth: 200 },
  chipT: { fontSize: T.cap, lineHeight: 17 },
  up: { alignSelf: "center" },
});
