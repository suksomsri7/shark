// ไฟล์แนบของคำสั่งเลขา (14 พ.ย. 2026 · แบบ Ⓒ /root/mockups/secretary-1114/newtask.png) — ใช้ทั้งจอเริ่มงานใหม่ (new.tsx) และห้องงาน (RoomView)
//   ปุ่ม + ของ InputBar ⇒ AttachSheet 3 ทาง: รูปภาพ (คลังรูป · เลือกหลายรูป) · ถ่ายรูป (กล้อง) · ไฟล์ (PDF · Excel .xlsx · CSV · expo-document-picker)
//   เลือกแล้วอัปทันทีทีละไฟล์ (POST secretary/attachments · multipart `file`) → AttachTray เหนือช่องพิมพ์ (รูปย่อ/ชิปไฟล์ · ✕ เอาออก · กำลังแนบ/ล้ม)
//   ส่งคำสั่ง = refs() ที่อัปเสร็จแล้ว ไปกับ POST rooms / rooms/[id]/send · กำลังอัป = จอปิดปุ่มส่ง (busy) · ส่งล้ม = restore() คืนไฟล์ชุดเดิม
//   เพดานเดียวกับเซิร์ฟเวอร์: ≤ 5 ไฟล์ · ≤ 4 MB ต่อไฟล์ · ชนิด SEC_ATTACH_TYPES (รูปบีบอัด JPEG quality 0.6 ก่อนส่ง · HEIC → JPEG โดยตัวเลือกรูป)
//   AttachList = ไฟล์แนบในฟองข้อความ (รูปย่อโหลดผ่านเส้นแอปด้วย Bearer · ไฟล์อื่น = ชิปชื่อ+ขนาด)
// 🔴 โมดูล native ใหม่ (expo-document-picker) + สิทธิ์กล้อง ⇒ ต้อง build แอปใหม่ก่อนใช้ปุ่ม "ไฟล์"/"ถ่ายรูป" บนเครื่องจริง
import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Text } from "@/src/components/ui/text";
import { Icon, Sheet, type IconName } from "@/src/components/airy";
import {
  SEC_ATTACH_MAX_BYTES,
  SEC_ATTACH_MAX_FILES,
  SEC_ATTACH_TYPES,
  SEC_ATTACH_XLSX,
  secFileSource,
  secUpload,
  serverNote,
  useSecAuthHeaders,
  type AttachKind,
  type AttachRef,
  type MsgAttachment,
} from "@/src/api/secretary";
import { useT, type I18nKey } from "@/src/i18n";
import { useTheme } from "@/src/theme/index";
import { radii, size, spacing, type as T } from "@/src/theme/tokens";

const PICK_QUALITY = 0.6;
const MIME_OF_EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf", xlsx: SEC_ATTACH_XLSX, csv: "text/csv" };
const EXT_OF_MIME: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** ชนิดของไฟล์ที่เลือก: mimeType ของเครื่อง → นามสกุล · CSV ของ Android/Windows (comma-separated-values / vnd.ms-excel + .csv) = text/csv */
function mimeOf(mime: string | null | undefined, name: string): string {
  const ext = (name.split("?")[0]!.split(".").pop() ?? "").toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (ext === "csv" && (!m || m === "text/comma-separated-values" || m === "application/vnd.ms-excel" || m === "text/plain")) return "text/csv";
  return m && m !== "application/octet-stream" ? m : (MIME_OF_EXT[ext] ?? m);
}
const kindOf = (mime: string): AttachKind => (mime.startsWith("image/") ? "image" : mime === "application/pdf" ? "pdf" : "sheet");

export type PendingAttach = {
  key: string;
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  kind: AttachKind;
  status: "uploading" | "done" | "error";
  id?: string;
};
export type AttachNote = { key: I18nKey } | { text: string };
type Picked = { uri: string; name: string; mimeType: string; size: number; file?: Blob };

let seq = 0;

/** สถานะไฟล์แนบรอส่งของจอหนึ่ง — เลือก/อัป/ถอด/คืน */
export function useSecAttach() {
  const [items, setItems] = useState<PendingAttach[]>([]);
  const [note, setNote] = useState<AttachNote | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const upload = useCallback(async (p: Picked, key: string) => {
    try {
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = p.file ?? (await (await fetch(p.uri)).blob());
        form.append("file", blob, p.name);
      } else {
        form.append("file", { uri: p.uri, name: p.name, type: p.mimeType } as unknown as Blob);
      }
      const up = await secUpload("secretary/attachments", form);
      setItems((cur) => cur.map((x) => (x.key === key ? { ...x, status: "done", id: up.id, name: up.name || x.name, mimeType: up.mimeType || x.mimeType, kind: up.kind ?? x.kind } : x)));
    } catch (e) {
      setItems((cur) => cur.map((x) => (x.key === key ? { ...x, status: "error" } : x)));
      const s = serverNote(e);
      setNote(s ? { text: s } : { key: "sec.attach.fail" });
    }
  }, []);

  /** รับไฟล์ที่เลือก → ตรวจเพดาน/ชนิดฝั่งแอป → ใส่ถาด + อัปทันที */
  const add = useCallback(
    (picked: Picked[]) => {
      const room = SEC_ATTACH_MAX_FILES - itemsRef.current.length;
      if (room <= 0) {
        setNote({ key: "sec.attach.max" });
        return;
      }
      let warn: AttachNote | null = picked.length > room ? { key: "sec.attach.max" } : null;
      const ok: PendingAttach[] = [];
      for (const p of picked.slice(0, room)) {
        if (!SEC_ATTACH_TYPES.includes(p.mimeType)) {
          warn = { key: "sec.attach.type" };
          continue;
        }
        if (p.size > SEC_ATTACH_MAX_BYTES) {
          warn = { key: "sec.attach.tooBig" };
          continue;
        }
        const key = `a${++seq}`;
        ok.push({ key, uri: p.uri, name: p.name, mimeType: p.mimeType, size: p.size, kind: kindOf(p.mimeType), status: "uploading" });
        void upload(p, key);
      }
      setNote(warn);
      if (ok.length) setItems((cur) => [...cur, ...ok]);
    },
    [upload],
  );

  const pick = useCallback(
    async (source: "library" | "camera" | "file") => {
      setNote(null);
      if (itemsRef.current.length >= SEC_ATTACH_MAX_FILES) {
        setNote({ key: "sec.attach.max" });
        return;
      }
      try {
        if (source === "file") {
          const res = await DocumentPicker.getDocumentAsync({
            type: ["application/pdf", SEC_ATTACH_XLSX, "text/csv", "text/comma-separated-values"],
            multiple: true,
            copyToCacheDirectory: true,
          });
          if (res.canceled) return;
          add(res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: mimeOf(a.mimeType, a.name), size: a.size ?? a.file?.size ?? 0, ...(a.file ? { file: a.file } : {}) })));
          return;
        }
        const camera = source === "camera";
        const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          setNote({ key: camera ? "sec.attach.permCamera" : "sec.attach.permPhoto" });
          return;
        }
        const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: PICK_QUALITY, allowsEditing: false, exif: false };
        const res = camera
          ? await ImagePicker.launchCameraAsync(opts)
          : await ImagePicker.launchImageLibraryAsync({ ...opts, allowsMultipleSelection: true, selectionLimit: SEC_ATTACH_MAX_FILES - itemsRef.current.length });
        if (res.canceled) return;
        add(
          res.assets.map((a) => {
            const mime = mimeOf(a.mimeType ?? (PICK_QUALITY < 1 ? "image/jpeg" : ""), a.fileName ?? a.uri);
            return { uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.${EXT_OF_MIME[mime] ?? "jpg"}`, mimeType: mime, size: a.fileSize ?? 0, ...(a.file ? { file: a.file } : {}) };
          }),
        );
      } catch {
        setNote({ key: "sec.attach.fail" });
      }
    },
    [add],
  );

  const remove = useCallback((key: string) => {
    setItems((cur) => cur.filter((x) => x.key !== key));
    setNote(null);
  }, []);
  /** ส่งแล้ว ⇒ ล้างถาด (คืนรายการเดิมไว้ restore เมื่อส่งล้ม) */
  const take = useCallback((): PendingAttach[] => {
    const cur = itemsRef.current;
    setItems([]);
    setNote(null);
    return cur;
  }, []);
  const restore = useCallback((list: PendingAttach[]) => setItems((cur) => [...list, ...cur].slice(0, SEC_ATTACH_MAX_FILES)), []);

  const uploading = items.some((x) => x.status === "uploading");
  const failed = items.some((x) => x.status === "error");
  const refs = (list: PendingAttach[] = items): AttachRef[] => list.filter((x) => x.status === "done" && x.id).map((x) => ({ id: x.id!, name: x.name }));
  return { items, note, setNote, pick, remove, take, restore, refs, uploading, failed, ready: !uploading && !failed };
}

/** ไฟล์ในถาด → ไฟล์แนบของฟองที่กำลังส่ง (รูปย่อจากเครื่อง) */
export function localAttachments(list: PendingAttach[]): MsgAttachment[] {
  return list.filter((x) => x.status === "done").map((x) => ({ id: x.id ?? x.key, name: x.name, mimeType: x.mimeType, size: x.size, kind: x.kind, url: x.uri, local: true }));
}

/** แผ่นล่าง 3 ทาง (Ⓒ) */
export function AttachSheet({ visible, onClose, onPick, name, testID }: { visible: boolean; onClose: () => void; onPick: (s: "library" | "camera" | "file") => void; name: string; testID: string }) {
  const { c } = useTheme();
  const t = useT();
  const row = (k: "library" | "camera" | "file", icon: IconName, tint: string, label: string, sub?: string) => (
    <Pressable
      key={k}
      testID={`${testID}-${k}`}
      accessibilityRole="button"
      onPress={() => {
        onClose();
        onPick(k);
      }}
      style={[styles.sheetRow, { borderBottomColor: c.divider }]}
    >
      <View style={[styles.sheetIcon, { backgroundColor: c.chip.bg }]}>
        <Icon name={icon} size={20} color={tint} />
      </View>
      <View style={styles.flex}>
        <Text style={[styles.sheetT, { color: c.text }]}>{label}</Text>
        {sub ? <Text style={[styles.sheetSub, { color: c.textMuted }]}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
  return (
    <Sheet visible={visible} onClose={onClose} testID={testID} top={470}>
      <Text accessibilityRole="header" style={[styles.sheetH, { color: c.textMuted }]}>
        {t("sec.attach.sheetTitle", { name })}
      </Text>
      {row("library", "image", c.accent, t("sec.attach.photo"), t("sec.attach.photoSub"))}
      {Platform.OS === "web" ? null : row("camera", "camera", c.accent, t("sec.attach.camera"))}
      {row("file", "file-text", c.accent, t("sec.attach.file"), t("sec.attach.fileSub"))}
    </Sheet>
  );
}

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fileIcon = (k: AttachKind): IconName => (k === "pdf" ? "file-text" : k === "sheet" ? "grid" : "image");

/** ถาดไฟล์รอส่งเหนือช่องพิมพ์ — รูปย่อ/ชิปไฟล์ · ✕ เอาออก · กำลังแนบ (หมุน) · ล้ม (ขอบเตือน) + ข้อความแจ้ง */
export function AttachTray({ items, note, onRemove, testID }: { items: PendingAttach[]; note: AttachNote | null; onRemove: (key: string) => void; testID: string }) {
  const { c } = useTheme();
  const t = useT();
  if (!items.length && !note) return null;
  return (
    <View testID={testID} style={styles.tray}>
      {items.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trayRow} keyboardShouldPersistTaps="handled">
          {items.map((a) => (
            <View
              key={a.key}
              testID={`${testID}-item`}
              style={[a.kind === "image" ? styles.thumb : styles.fileChip, { backgroundColor: c.chip.bg, borderColor: a.status === "error" ? c.warn.fg : "transparent" }]}
            >
              {a.kind === "image" ? (
                <Image source={{ uri: a.uri }} style={styles.thumbImg} accessibilityLabel={a.name} />
              ) : (
                <>
                  <Icon name={fileIcon(a.kind)} size={16} color={c.textDim} />
                  <View style={styles.flex}>
                    <Text style={[styles.fileName, { color: c.text }]} numberOfLines={1}>
                      {a.name}
                    </Text>
                    <Text style={[styles.fileSub, { color: c.textMuted }]}>{a.status === "uploading" ? t("sec.attach.uploading") : kb(a.size)}</Text>
                  </View>
                </>
              )}
              {a.status === "uploading" && a.kind === "image" ? (
                <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: c.dim }]}>
                  <ActivityIndicator size="small" color={c.onAccent} />
                </View>
              ) : null}
              <Pressable
                testID={`${testID}-remove`}
                accessibilityRole="button"
                accessibilityLabel={t("sec.attach.remove")}
                hitSlop={8}
                onPress={() => onRemove(a.key)}
                style={[styles.x, { backgroundColor: c.surface }]}
              >
                <Icon name="x" size={12} color={c.text} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      {note ? (
        <Text testID={`${testID}-note`} style={[styles.note, { color: c.warn.fg }]}>
          {"key" in note ? t(note.key) : note.text}
        </Text>
      ) : null}
    </View>
  );
}

/** ไฟล์แนบในฟองข้อความ — รูป = รูปย่อ (เส้นแอป + Bearer) · อื่น ๆ = ชิปชื่อ+ขนาด · `onDark` = บนฟองทึบของเรา */
export function AttachList({ items, onDark, testID }: { items: MsgAttachment[]; onDark?: boolean; testID: string }) {
  const { c } = useTheme();
  const t = useT();
  const headers = useSecAuthHeaders();
  // แหล่งรูปคงตัวระหว่าง poll (ข้อความถูก normalize ใหม่ทุกรอบ) — ไม่ให้ <Image> โหลดซ้ำ
  const sig = items.map((a) => a.url).join("|");
  const sources = useMemo(() => new Map(items.map((a) => [a.url, secFileSource(a, headers)])), [sig, headers]);
  if (!items.length) return null;
  const fg = onDark ? c.bubbleUser.fg : c.text;
  return (
    <View testID={testID} style={styles.list}>
      {items.map((a) =>
        a.kind === "image" ? (
          a.local || headers ? (
            <Image key={a.id} source={sources.get(a.url) ?? secFileSource(a, headers)} style={styles.msgImg} accessibilityLabel={a.name || t("sec.attach.image")} resizeMode="cover" />
          ) : (
            <View key={a.id} style={[styles.msgImg, { backgroundColor: c.chip.bg }]} />
          )
        ) : (
          <View key={a.id} style={[styles.msgFile, { borderColor: onDark ? "rgba(255,255,255,0.35)" : c.divider }]}>
            <Icon name={fileIcon(a.kind)} size={15} color={fg} />
            <Text style={[styles.fileName, { color: fg }]} numberOfLines={1}>
              {a.name}
            </Text>
            {a.size ? <Text style={[styles.fileSub, { color: fg, opacity: 0.7 }]}>{kb(a.size)}</Text> : null}
          </View>
        ),
      )}
    </View>
  );
}

const THUMB = 64;
const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { alignItems: "center", justifyContent: "center" },
  sheetH: { fontSize: T.cap, lineHeight: 18, marginBottom: 4 },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: size.iconBtn + 18, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  sheetIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  sheetT: { fontSize: T.body - 1, fontWeight: "600", lineHeight: 22 },
  sheetSub: { fontSize: T.cap, lineHeight: 17, marginTop: 1 },
  tray: { marginHorizontal: spacing.page, marginBottom: spacing.sm },
  trayRow: { gap: spacing.sm, paddingTop: 6, paddingRight: 6 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 14, borderWidth: 1.5, overflow: "visible" },
  thumbImg: { width: "100%", height: "100%", borderRadius: 13 },
  fileChip: { flexDirection: "row", alignItems: "center", gap: 8, height: THUMB, width: 176, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1.5 },
  fileName: { fontSize: T.cap, lineHeight: 17, fontWeight: "600", flexShrink: 1 },
  fileSub: { fontSize: 11.5, lineHeight: 15 },
  x: { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  note: { fontSize: T.cap, lineHeight: 17, marginTop: 6 },
  list: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  msgImg: { width: 132, height: 132, borderRadius: radii.k + 4 },
  msgFile: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radii.k + 2, paddingVertical: 6, paddingHorizontal: 10, maxWidth: 240 },
});
