// หน้ารวม Session สไตล์ Claude Code Remote Control — หลายห้องแชท ผูกกิจการ active
// header: ☰ + ชื่อกิจการ + ปุ่ม + สร้างห้อง · การ์ดต่อ session (unread สีต่าง+จุดน้ำเงิน)
// สไลด์ซ้าย = แก้ชื่อ (modal inline) / ลบ (2 จังหวะ) · pull-to-refresh + refresh เมื่อ focus
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DrawerActions } from "@react-navigation/native";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { api, apiErrorText } from "@/src/api/client";
import { useAuth } from "@/src/lib/auth-context";
import { Orb } from "@/src/components/chat/Orb";
import { C, R, S } from "@/src/theme";

type Conversation = { id: string; title: string | null; updatedAt: string; unread: boolean };

// เวลาไทยแบบสั้น (เมื่อกี้ / x นาที / x ชม. / วันที่) — เลี่ยง Intl (Hermes ไม่ครบ)
function thaiTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const min = Math.floor((Date.now() - t) / 60000);
  if (min < 1) return "เมื่อกี้";
  if (min < 60) return `${min} นาที`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.`;
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

export default function SessionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const { tenants, activeTenantId } = useAuth();
  const activeName = tenants.find((t) => t.tenantId === activeTenantId)?.name ?? "กิจการ";

  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // ห้องที่กด "ลบ" ครั้งแรก (รอกดซ้ำยืนยัน)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  // modal แก้ชื่อ
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const swipeRefs = useRef<Record<string, Swipeable | null>>({});

  const load = useCallback(async () => {
    try {
      const res = await api<{ conversations: Conversation[] }>("/api/mobile/conversations");
      setItems(res.conversations);
      setError(null);
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // refresh ทุกครั้งที่กลับมาหน้านี้ (กลับจากแชท → เห็นสถานะ unread ล่าสุด)
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function createRoom() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/api/mobile/conversations", { body: {} });
      router.push(`/(app)/chat/${id}`);
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setCreating(false);
    }
  }

  async function openRoom(c: Conversation) {
    // มาร์คว่าอ่านแล้วแบบ fire-and-forget (ไม่บล็อกการเปิดห้อง)
    api("/api/mobile/conversations/" + c.id + "/read", { body: {} }).catch(() => {});
    setItems((list) => list.map((r) => (r.id === c.id ? { ...r, unread: false } : r)));
    router.push(`/(app)/chat/${c.id}?title=${encodeURIComponent(c.title ?? "")}`);
  }

  function closeSwipe(id: string) {
    swipeRefs.current[id]?.close();
  }

  function startRename(c: Conversation) {
    closeSwipe(c.id);
    setRenameId(c.id);
    setRenameText(c.title ?? "");
  }

  async function saveRename() {
    const id = renameId;
    const title = renameText.trim();
    if (!id || !title || renameBusy) return;
    setRenameBusy(true);
    try {
      await api("/api/mobile/conversations/" + id, { method: "PATCH", body: { title } });
      setItems((list) => list.map((r) => (r.id === id ? { ...r, title } : r)));
      setRenameId(null);
      setRenameText("");
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setRenameBusy(false);
    }
  }

  async function onDelete(c: Conversation) {
    if (confirmDeleteId !== c.id) {
      setConfirmDeleteId(c.id); // จังหวะแรก — เปลี่ยนปุ่มเป็น "ยืนยันลบ?"
      return;
    }
    try {
      await api("/api/mobile/conversations/" + c.id, { method: "DELETE" });
      setItems((list) => list.filter((r) => r.id !== c.id));
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setConfirmDeleteId(null);
    }
  }

  function renderRightActions(c: Conversation) {
    const deleteArmed = confirmDeleteId === c.id;
    return (
      <View style={styles.swipeActions}>
        <Pressable style={[styles.swipeBtn, styles.renameBtn]} onPress={() => startRename(c)}>
          <Text style={styles.swipeText}>แก้ชื่อ</Text>
        </Pressable>
        <Pressable style={[styles.swipeBtn, styles.deleteBtn]} onPress={() => onDelete(c)}>
          <Text style={styles.swipeText}>{deleteArmed ? "ยืนยันลบ?" : "ลบ"}</Text>
        </Pressable>
      </View>
    );
  }

  function renderItem({ item }: { item: Conversation }) {
    const unread = item.unread;
    return (
      <Swipeable
        ref={(r) => {
          swipeRefs.current[item.id] = r;
        }}
        renderRightActions={() => renderRightActions(item)}
        onSwipeableWillOpen={() => setConfirmDeleteId(null)}
        overshootRight={false}
      >
        <Pressable
          onPress={() => openRoom(item)}
          style={[styles.card, unread && styles.cardUnread]}
        >
          <View style={styles.cardBody}>
            <Text style={[styles.cardTitle, unread && styles.cardTitleUnread]} numberOfLines={1}>
              {item.title && item.title.trim() ? item.title : "แชทใหม่"}
            </Text>
            <Text style={styles.cardTime}>{thaiTime(item.updatedAt)}</Text>
          </View>
          {unread && <View style={styles.unreadDot} />}
        </Pressable>
      </Swipeable>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          hitSlop={10}
          style={styles.iconBtn}
        >
          <Text style={styles.hamburger}>☰</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {activeName}
        </Text>
        <Pressable onPress={createRoom} disabled={creating} style={styles.addBtn} hitSlop={8}>
          {creating ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.addPlus}>＋</Text>}
        </Pressable>
      </View>

      {error && <Text style={styles.errorBar}>{error}</Text>}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={C.blue} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Orb size={80} />
          <Text style={styles.emptyText}>เริ่มคุยกับผู้ช่วย AI ของคุณ</Text>
          <Pressable onPress={createRoom} disabled={creating} style={styles.emptyBtn}>
            {creating ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.emptyBtnText}>เริ่มแชทแรก</Text>
            )}
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffffff" />
          }
        />
      )}

      <Modal visible={renameId !== null} transparent animationType="fade" onRequestClose={() => setRenameId(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRenameId(null)}>
          <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>แก้ชื่อห้อง</Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              placeholder="ชื่อห้อง"
              placeholderTextColor={C.textFaint}
              style={styles.modalInput}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={() => setRenameId(null)}>
                <Text style={styles.modalCancelText}>ยกเลิก</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, styles.modalSave, (!renameText.trim() || renameBusy) && styles.disabled]}
                onPress={saveRename}
                disabled={!renameText.trim() || renameBusy}
              >
                {renameBusy ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>บันทึก</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  iconBtn: { padding: S.xs },
  hamburger: { color: C.text, fontSize: 22 },
  headerTitle: { flex: 1, color: C.text, fontSize: 17, fontWeight: "600" },
  addBtn: {
    width: 34,
    height: 34,
    borderRadius: R.full,
    backgroundColor: C.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  addPlus: { color: "#ffffff", fontSize: 22, lineHeight: 26, fontWeight: "600" },
  errorBar: { color: C.danger, fontSize: 13, paddingHorizontal: S.md, paddingVertical: S.sm },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: S.md, padding: S.xl },
  emptyText: { color: C.textDim, fontSize: 15 },
  emptyBtn: { backgroundColor: C.blue, borderRadius: R.md, paddingHorizontal: S.xl, paddingVertical: S.md, minHeight: 44, justifyContent: "center" },
  emptyBtnText: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  listContent: { padding: S.md },
  sep: { height: S.sm },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: R.lg,
    paddingHorizontal: S.md,
    paddingVertical: S.md,
  },
  cardUnread: { backgroundColor: C.surfaceHi, borderLeftWidth: 3, borderLeftColor: C.blue },
  cardBody: { flex: 1 },
  cardTitle: { color: C.text, fontSize: 15, fontWeight: "500" },
  cardTitleUnread: { fontWeight: "700" },
  cardTime: { color: C.textFaint, fontSize: 12, marginTop: 2 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.blueHi, marginLeft: S.sm },
  swipeActions: { flexDirection: "row", alignItems: "center", gap: S.sm, paddingLeft: S.sm },
  swipeBtn: { minWidth: 76, height: "100%", borderRadius: R.lg, alignItems: "center", justifyContent: "center", paddingHorizontal: S.sm },
  renameBtn: { backgroundColor: C.blue },
  deleteBtn: { backgroundColor: C.danger },
  swipeText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: S.xl },
  modalCard: { width: "100%", backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.border, padding: S.lg, gap: S.md },
  modalTitle: { color: C.text, fontSize: 16, fontWeight: "600" },
  modalInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    color: C.text,
    fontSize: 15,
  },
  modalActions: { flexDirection: "row", gap: S.sm, justifyContent: "flex-end" },
  modalBtn: { minHeight: 44, borderRadius: R.md, alignItems: "center", justifyContent: "center", paddingHorizontal: S.lg },
  modalCancel: { backgroundColor: C.surfaceHi },
  modalCancelText: { color: C.text, fontSize: 15 },
  modalSave: { backgroundColor: C.blue },
  modalSaveText: { color: "#ffffff", fontSize: 15, fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
