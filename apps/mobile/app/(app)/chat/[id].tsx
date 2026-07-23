// จอแชท (id = conversationId) — bubble USER/ASSISTANT + การ์ด proposal + แนบรูป + SSE
// ส่งผ่าน sendChat() (SSE) · ระหว่างรอโชว์ "กำลังคิด…" · error = bubble แดง + ปุ่มส่งใหม่
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "@/src/components/ui/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api, apiErrorText, sendChat } from "@/src/api/client";
import { ChatBubble } from "@/src/components/chat/ChatBubble";
import { ProposalCard, type ProposalView } from "@/src/components/chat/ProposalCard";
import { TypingIndicator } from "@/src/components/chat/TypingIndicator";
import { C, R, S } from "@/src/theme";

type Message = { key: string; role: "USER" | "ASSISTANT"; content: string; images?: string[] };
type ServerMessage = { id?: string; role: "USER" | "ASSISTANT"; content: string; images?: string[] };

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// รวมทุกอย่างเป็น item เดียวเพื่อ render ใน FlatList inverted (ล่าสุดล่าง)
type Item =
  | { kind: "msg"; key: string; msg: Message }
  | { kind: "typing"; key: string; label: string }
  | { kind: "proposal"; key: string; p: ProposalView }
  | { kind: "error"; key: string; text: string };

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; title?: string }>();
  const conversationId = params.id;
  const headerTitle = params.title && params.title.trim() ? params.title : "แชท";

  const [messages, setMessages] = useState<Message[]>([]);
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [statusLabel, setStatusLabel] = useState("กำลังคิด…");
  const [error, setError] = useState<string | null>(null);
  // proposal actions
  const [busyId, setBusyId] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  // ข้อความล่าสุดที่ส่งไม่สำเร็จ (สำหรับปุ่ม "ส่งใหม่")
  const [failed, setFailed] = useState<{ text: string; images: string[] } | null>(null);

  const loadProposals = useCallback(async () => {
    try {
      const res = await api<{ proposals: { id: string; summary: string; risk: "NORMAL" | "DESTRUCTIVE" }[] }>(
        "/api/mobile/proposals?conversationId=" + conversationId,
      );
      setProposals((prev) => {
        // คงสถานะ resolved/note ของการ์ดเดิมไว้ (server ส่งเฉพาะ PENDING)
        const done = prev.filter((p) => p.resolved);
        const fresh = res.proposals.map((p) => ({ id: p.id, summary: p.summary, risk: p.risk }));
        return [...done, ...fresh];
      });
    } catch {
      /* โหลด proposal พลาด — ไม่ขวางแชท */
    }
  }, [conversationId]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api<{ messages: ServerMessage[] }>(
          "/api/mobile/conversations/" + conversationId + "/messages",
        );
        setMessages(
          res.messages.map((m, i) => ({
            key: m.id ?? "s-" + i,
            role: m.role,
            content: m.content,
            images: m.images,
          })),
        );
      } catch (e) {
        setError(apiErrorText(e));
      } finally {
        setLoading(false);
      }
      await loadProposals();
    })();
  }, [conversationId, loadProposals]);

  async function pickImage() {
    setError(null);
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setError("ต้องอนุญาตให้เข้าถึงรูปภาพก่อนถึงจะแนบได้");
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.5,
    });
    if (res.canceled) return;
    const asset = res.assets[0];
    if (!asset?.base64) return;
    // base64 → bytes โดยประมาณ (len * 3/4) เพื่อคุมไม่เกิน 2MB
    if (asset.base64.length * 0.75 > MAX_IMAGE_BYTES) {
      setError("รูปใหญ่เกิน 2MB ลองเลือกรูปที่เล็กลง");
      return;
    }
    const mime = asset.mimeType ?? "image/jpeg";
    setImages((imgs) => [...imgs, `data:${mime};base64,${asset.base64}`]);
  }

  function removeImage(idx: number) {
    setImages((imgs) => imgs.filter((_, i) => i !== idx));
  }

  async function doSend(sendText: string, imgs: string[]) {
    setError(null);
    setSending(true);
    setStatusLabel("กำลังคิด…");
    try {
      const result = await sendChat(
        {
          conversationId,
          text: sendText,
          ...(imgs.length ? { imageUrls: imgs } : {}),
        },
        (ev) => {
          if (ev.type === "status") setStatusLabel(ev.label);
        },
      );
      const reply = result?.reply;
      if (reply) {
        setMessages((m) => [...m, { key: "a-" + Date.now(), role: "ASSISTANT", content: reply }]);
      }
      await loadProposals();
    } catch (e) {
      // ผิดพลาด — โชว์ bubble แดง + ปุ่มส่งใหม่ (เก็บข้อความไว้ retry)
      setError(apiErrorText(e));
      setFailed({ text: sendText, images: imgs });
    } finally {
      setSending(false);
    }
  }

  function send() {
    const t = text.trim();
    const imgs = images;
    if ((!t && imgs.length === 0) || sending) return;
    const sendText = t || "ช่วยอ่านรูป/ใบเสร็จนี้ให้หน่อย";
    setText("");
    setImages([]);
    setFailed(null);
    setMessages((m) => [
      ...m,
      { key: "u-" + Date.now(), role: "USER", content: sendText, images: imgs.length ? imgs : undefined },
    ]);
    void doSend(sendText, imgs);
  }

  function retry() {
    if (!failed || sending) return;
    const f = failed;
    setError(null);
    setFailed(null);
    void doSend(f.text, f.images);
  }

  // ── proposal confirm/reject ──
  function onConfirm(p: ProposalView) {
    if (busyId) return;
    if (p.risk === "DESTRUCTIVE" && armedId !== p.id) {
      setArmedId(p.id); // จังหวะแรก — arm ไว้ ยังไม่ยิง
      return;
    }
    void doConfirm(p.id, p.risk === "DESTRUCTIVE");
  }

  async function doConfirm(id: string, confirm2x: boolean) {
    setBusyId(id);
    try {
      const res = await api<{ ok?: boolean; needsSecondConfirm?: boolean; note?: string; resultNote?: string }>(
        "/api/mobile/proposals/confirm",
        { body: confirm2x ? { id, confirm2x: true } : { id } },
      );
      // server บังคับยืนยันชั้นสองเสมอสำหรับ DESTRUCTIVE → คงสถานะรอ arm
      if (res.needsSecondConfirm) {
        setArmedId(id);
        setBusyId(null);
        return;
      }
      const note = res.resultNote ?? res.note ?? "ทำรายการเรียบร้อยแล้ว";
      setProposals((ps) => ps.map((p) => (p.id === id ? { ...p, resolved: true, note } : p)));
      setArmedId((a) => (a === id ? null : a));
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await api("/api/mobile/proposals/reject", { body: { id } });
      setProposals((ps) => ps.filter((p) => p.id !== id));
      setArmedId((a) => (a === id ? null : a));
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setBusyId(null);
    }
  }

  // ประกอบ item ตามลำดับเวลา แล้วกลับด้านให้ FlatList inverted
  const items: Item[] = [
    ...messages.map<Item>((m) => ({ kind: "msg", key: m.key, msg: m })),
    ...(sending ? [{ kind: "typing", key: "typing", label: statusLabel } as Item] : []),
    ...proposals.map<Item>((p) => ({ kind: "proposal", key: "p-" + p.id, p })),
    ...(error && failed && !sending ? [{ kind: "error", key: "err", text: error } as Item] : []),
  ];
  const reversed = items.slice().reverse();

  function renderItem({ item }: { item: Item }) {
    if (item.kind === "msg") {
      return <ChatBubble role={item.msg.role} content={item.msg.content} images={item.msg.images} />;
    }
    if (item.kind === "typing") return <TypingIndicator label={item.label} />;
    if (item.kind === "proposal") {
      return (
        <ProposalCard
          proposal={item.p}
          busy={busyId === item.p.id}
          armed={armedId === item.p.id}
          onConfirm={() => onConfirm(item.p)}
          onReject={() => onReject(item.p.id)}
        />
      );
    }
    return (
      <View style={styles.errorBubble}>
        <Text style={styles.errorText}>{item.text}</Text>
        <Pressable onPress={retry} style={styles.retryBtn}>
          <Text style={styles.retryText}>ส่งใหม่</Text>
        </Pressable>
      </View>
    );
  }

  const canSend = (text.trim().length > 0 || images.length > 0) && !sending;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {headerTitle}
        </Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + 44}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={C.blue} />
          </View>
        ) : (
          <FlatList
            data={reversed}
            keyExtractor={(it) => it.key}
            renderItem={renderItem}
            inverted
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            keyboardShouldPersistTaps="handled"
          />
        )}

        {error && !failed && <Text style={styles.errorBar}>{error}</Text>}

        {images.length > 0 && (
          <View style={styles.attachRow}>
            {images.map((src, i) => (
              <View key={i} style={styles.attachThumbWrap}>
                <Image source={{ uri: src }} style={styles.attachThumb} />
                <Pressable style={styles.attachRemove} onPress={() => removeImage(i)} hitSlop={6}>
                  <Text style={styles.attachRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.inputBar, { paddingBottom: insets.bottom + S.sm }]}>
          <Pressable onPress={pickImage} style={styles.clipBtn} hitSlop={6}>
            <Text style={styles.clip}>📎</Text>
          </Pressable>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="พิมพ์ข้อความ…"
            placeholderTextColor={C.textFaint}
            style={styles.input}
            multiline
          />
          <Pressable onPress={send} disabled={!canSend} style={[styles.sendBtn, !canSend && styles.disabled]}>
            {sending ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.sendArrow}>↑</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.sm,
    paddingVertical: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  backBtn: { width: 40, height: 32, alignItems: "center", justifyContent: "center" },
  backText: { color: C.text, fontSize: 30, lineHeight: 32 },
  headerTitle: { flex: 1, color: C.text, fontSize: 17, fontFamily: "IBMPlexSansThai_700Bold", textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { padding: S.md, gap: 0 },
  sep: { height: S.sm },
  errorBubble: {
    alignSelf: "flex-start",
    backgroundColor: C.dangerDim,
    borderRadius: R.lg,
    borderBottomLeftRadius: R.sm,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    marginRight: 40,
    gap: S.xs,
  },
  errorBar: { color: C.danger, fontSize: 13, paddingHorizontal: S.md, paddingBottom: S.sm },
  errorText: { color: C.text, fontSize: 14 },
  retryBtn: { alignSelf: "flex-start", backgroundColor: C.danger, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 6 },
  retryText: { color: "#ffffff", fontSize: 13, fontWeight: "600" },
  attachRow: { flexDirection: "row", flexWrap: "wrap", gap: S.sm, paddingHorizontal: S.md, paddingBottom: S.sm },
  attachThumbWrap: { position: "relative" },
  attachThumb: { width: 64, height: 64, borderRadius: R.md, backgroundColor: C.surfaceHi },
  attachRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.surfaceHi,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },
  attachRemoveText: { color: C.text, fontSize: 13, lineHeight: 15 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: S.sm,
    paddingHorizontal: S.md,
    paddingTop: S.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  clipBtn: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  clip: { fontSize: 20 },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    paddingHorizontal: S.md,
    paddingTop: S.sm,
    paddingBottom: S.sm,
    color: C.text,
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: R.full,
    backgroundColor: C.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  sendArrow: { color: "#ffffff", fontSize: 22, fontWeight: "700", lineHeight: 24 },
  disabled: { opacity: 0.4 },
});
