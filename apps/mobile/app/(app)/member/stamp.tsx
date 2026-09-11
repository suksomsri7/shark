// จอ ค "ประทับสแตมป์ด้วย PIN" ของแอปพนักงาน (M3.11 · ภาพ 28 ค)
// เลือกการ์ด (ดวงที่ได้แล้วทึบ · ที่เหลือเป็นเลขช่อง) · เหตุผล/บริการ · PIN 4–6 หลัก (เฉพาะใบที่ร้านตั้ง PIN) ·
// ปุ่ม "ประทับแล้ว" → แบนเนอร์สำเร็จ "ประทับสำเร็จ · n/m · อีก k ครั้งได้ <รางวัล>"
// API: GET/POST /api/mobile/member/stamp (ผ่าน src/api/client) — ประทับจริงที่ facade stamp.addStamp ฝั่ง server
// 🔴 รหัสกันซ้ำ (`requestId`) ออกใหม่หลังประทับสำเร็จเท่านั้น — กดซ้ำ/เน็ตหลุดแล้วกดใหม่ = ส่งรหัสเดิม = ได้ตราเดียว
// 🔴 PIN ผิด/ครบโควตาวันนี้ → ข้อความไทยใต้ปุ่ม (ห้าม Alert) · ไม่เก็บ PIN ไว้ที่ไหนหลังส่ง
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput as RNTextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { Text, TextInput } from "@/src/components/ui/text";
import { PageColumn } from "@/src/components/ui/page";
import { api, apiErrorText } from "@/src/api/client";
import { useBrand } from "@/src/lib/brand";
import { MemberHeader, Notice, memberStyles, type StampCardRow, type StampResult } from "@/src/components/member/ui";
import { C, R, S } from "@/src/theme";

function newRequestId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** ดวงสแตมป์ 5 ต่อแถว (ภาพ 28 ค) — ได้แล้ว = วงทึบ + ติ๊ก · ยังไม่ได้ = วงเส้น + เลขช่อง */
function Dots({ stamps, slots }: { stamps: number; slots: number }) {
  const n = Math.max(0, Math.min(slots, 30));
  return (
    <View style={styles.dots}>
      {Array.from({ length: n }, (_, i) => {
        const on = i < stamps;
        return (
          <View key={i} style={styles.dotCell}>
            <View style={[styles.dot, on ? styles.dotOn : styles.dotOff]}>
              {on ? <Feather name="check" size={13} color={C.bg} /> : <Text style={styles.dotNum}>{i + 1}</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export default function MemberStampScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const brand = useBrand();
  const params = useLocalSearchParams<{ customerId: string; name?: string }>();
  const customerId = String(params.customerId ?? "");
  const name = typeof params.name === "string" ? params.name : "";

  const [cards, setCards] = useState<StampCardRow[]>([]);
  const [cardId, setCardId] = useState("");
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const requestId = useRef(newRequestId());
  // ช่อง PIN ใช้ TextInput ของ RN ตรง ๆ (ต้องใช้ ref เพื่อ focus · ช่องนี้โปร่งใส ไม่มีตัวอักษรให้เห็น จึงไม่ต้องใช้ฟอนต์กลาง)
  const pinRef = useRef<RNTextInput | null>(null);

  const load = useCallback(async () => {
    if (!customerId) return;
    try {
      const res = (await api("/api/mobile/member/stamp?customerId=" + encodeURIComponent(customerId))) as { cards: StampCardRow[] };
      const list = res.cards ?? [];
      setCards(list);
      setCardId((cur) => (cur && list.some((c) => c.cardId === cur) ? cur : (list[0]?.cardId ?? "")));
      setError(null);
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const card = cards.find((c) => c.cardId === cardId) ?? null;

  async function submit() {
    if (!card || busy) return;
    setError(null);
    if (card.pinRequired && !/^\d{4,6}$/.test(pin)) {
      setError("ใส่ PIN ของใบนี้ 4–6 หลักก่อนกดประทับ");
      return;
    }
    setBusy(true);
    try {
      const res = (await api("/api/mobile/member/stamp", {
        body: { customerId, cardId: card.cardId, pin: card.pinRequired ? pin : null, note: note.trim() || null, requestId: requestId.current },
      })) as StampResult;
      setBanner(res.banner);
      setCards((list) => list.map((c) => (c.cardId === res.card.cardId ? { ...c, stamps: res.card.stamps } : c)));
      setPin("");
      requestId.current = newRequestId();
      // ครบใบแล้วใบถัดไปเริ่มใหม่ (autoRestart) — โหลดสถานะจริงจาก server อีกรอบ
      if (res.completed) void load();
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const dots = Math.max(4, pin.length);

  return (
    <View style={[memberStyles.screen, { paddingTop: insets.top }]}>
      <PageColumn>
        <MemberHeader title="ประทับสแตมป์" left="back" onLeft={() => (router.canGoBack() ? router.back() : router.replace("/member"))} />
        <ScrollView contentContainerStyle={[memberStyles.body, { paddingBottom: insets.bottom + S.xl }]} keyboardShouldPersistTaps="handled">
          {banner ? (
            <View testID="member-stamp-banner" style={[styles.banner, { borderColor: brand.accent, backgroundColor: brand.soft }]}>
              <Feather name="check" size={16} color={brand.accent} />
              <Text style={[styles.bannerText, { color: brand.accent }]}>{banner}</Text>
            </View>
          ) : null}

          {name ? <Text style={memberStyles.dim}>ให้ {name}</Text> : null}
          <Text style={memberStyles.faint}>เลือกการ์ด</Text>

          {loading ? (
            <View style={memberStyles.center}>
              <ActivityIndicator color={brand.accent} />
            </View>
          ) : cards.length === 0 ? (
            <Notice text={error ?? "สมาชิกคนนี้ยังไม่มีใบสแตมป์ที่พนักงานประทับให้ได้ — ร้านยังไม่เปิดใบ หรือจำกัดระดับ/สาขาไว้"} tone={error ? "error" : "info"} />
          ) : (
            <View testID="member-stamp-card" style={styles.cardList}>
              {cards.map((c) => {
                const on = c.cardId === cardId;
                return (
                  <Pressable
                    key={c.cardId}
                    onPress={() => {
                      setCardId(c.cardId);
                      setPin("");
                      setError(null);
                    }}
                    style={[memberStyles.card, styles.stampCard, on && { borderColor: C.text }]}
                  >
                    <View style={styles.stampHead}>
                      <Feather name="list" size={14} color={C.textDim} />
                      <Text style={styles.stampName} numberOfLines={2}>
                        {c.name}
                      </Text>
                      <Text style={styles.stampCount}>
                        {c.stamps}/{c.slots}
                      </Text>
                    </View>
                    <Dots stamps={c.stamps} slots={c.slots} />
                    <Text style={memberStyles.faint}>
                      ครบ {c.slots} ดวง {/^[\d฿]/.test(c.reward) ? `ได้ ${c.reward}` : `ได้${c.reward}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {card ? (
            <>
              <Text style={memberStyles.faint}>เหตุผล / บริการ</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="เช่น Fun Dive (ไม่บังคับ)"
                placeholderTextColor={C.textFaint}
                style={styles.input}
                maxLength={80}
              />

              {card.pinRequired ? (
                <View style={styles.pinWrap}>
                  <Text style={[memberStyles.faint, styles.pinLabel]}>PIN พนักงาน</Text>
                  <Pressable onPress={() => pinRef.current?.focus()} style={styles.pinDots} accessibilityLabel="ใส่ PIN">
                    {Array.from({ length: dots }, (_, i) => (
                      <View key={i} style={[styles.pinDot, i < pin.length ? styles.pinDotOn : styles.pinDotOff]} />
                    ))}
                    <RNTextInput
                      ref={pinRef}
                      testID="member-stamp-pin"
                      value={pin}
                      onChangeText={(t) => {
                        setPin(t.replace(/\D/g, "").slice(0, 6));
                        setError(null);
                      }}
                      keyboardType="number-pad"
                      secureTextEntry
                      maxLength={6}
                      style={styles.pinInput}
                      caretHidden
                      accessibilityLabel="PIN ของใบสแตมป์ 4–6 หลัก"
                    />
                  </Pressable>
                </View>
              ) : (
                <Text style={memberStyles.faint}>ใบนี้ร้านไม่ได้ตั้ง PIN — กดประทับได้เลย</Text>
              )}

              <Pressable
                testID="member-stamp-submit"
                onPress={() => void submit()}
                disabled={busy}
                style={({ pressed }) => [styles.submit, { backgroundColor: brand.accent }, (busy || pressed) && { opacity: 0.85 }]}
              >
                {busy ? <ActivityIndicator color={brand.accentFg} /> : <Text style={[styles.submitText, { color: brand.accentFg }]}>ประทับแล้ว</Text>}
              </Pressable>
              {cards.length > 0 ? <Notice text={error} tone="error" /> : null}
            </>
          ) : null}
        </ScrollView>
      </PageColumn>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { flexDirection: "row", alignItems: "center", gap: S.sm, borderWidth: 1, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: S.md },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20, fontFamily: "IBMPlexSansThai_600SemiBold" },
  cardList: { gap: S.sm },
  stampCard: { padding: S.md, gap: S.md },
  stampHead: { flexDirection: "row", alignItems: "center", gap: S.sm },
  stampName: { flex: 1, color: C.text, fontSize: 14, fontFamily: "IBMPlexSansThai_700Bold" },
  stampCount: { color: C.textDim, fontSize: 13, fontFamily: "IBMPlexSansThai_600SemiBold" },
  dots: { flexDirection: "row", flexWrap: "wrap", rowGap: S.sm },
  dotCell: { width: "20%", alignItems: "center" },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  dotOn: { backgroundColor: C.text },
  dotOff: { borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
  dotNum: { color: C.textFaint, fontSize: 12 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.md, height: 44, color: C.text, fontSize: 14 },
  pinWrap: { alignItems: "center", gap: S.sm, paddingTop: S.xs },
  pinLabel: { textAlign: "center" },
  pinDots: { flexDirection: "row", gap: S.md, paddingVertical: S.sm, paddingHorizontal: S.lg, position: "relative" },
  pinDot: { width: 14, height: 14, borderRadius: 7 },
  pinDotOn: { backgroundColor: C.text },
  pinDotOff: { borderWidth: 1.5, borderColor: C.textFaint },
  pinInput: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, opacity: 0.02, color: "transparent", fontSize: 16 },
  submit: { borderRadius: R.md, height: 50, alignItems: "center", justifyContent: "center", marginTop: S.xs },
  submitText: { fontSize: 16, fontFamily: "IBMPlexSansThai_700Bold" },
});
