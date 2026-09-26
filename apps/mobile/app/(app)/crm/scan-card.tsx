// จอ "สแกนนามบัตร" ของแอปพนักงาน (ใบ C3.7 · ภาพ 13 ค ล่าง "AI อ่านนามบัตรแล้ว")
// ถ่ายรูป/เลือกรูปนามบัตร → POST /api/mobile/crm/scan-card (เครื่องอ่านนามบัตรตัวเดียวของระบบ — ใบ C2.4) → ร่าง ชื่อ · ตำแหน่ง ·
// บริษัท · เบอร์ → "สร้าง lead" = POST …/scan-card/<proposalId>/accept → ผู้ติดต่อใหม่ในระบบ CRM นี้ · "ทิ้งร่าง" = POST …/reject
// 🔴 รูปไม่ถูกเก็บที่ไหน (ส่งเป็น base64 ในคำขอเดียว · เซิร์ฟเวอร์ไม่เก็บไฟล์) · ข้อความผิดพลาดขึ้นในจอ (ห้าม Alert)
// 🔴 ย่อคุณภาพรูปตอนถ่าย (quality 0.3) — นามบัตรไม่ต้องละเอียด และคำขอเล็กพอผ่านเพดานขนาดของเซิร์ฟเวอร์
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import Feather from "@expo/vector-icons/Feather";
import { Text } from "@/src/components/ui/text";
import { PageColumn } from "@/src/components/ui/page";
import { ApiError, api, apiErrorText } from "@/src/api/client";
import { useBrand } from "@/src/lib/brand";
import { CrmHeader, CrmNotice, crmApiPath, crmStyles, paramOf, type CrmCardDraft } from "@/src/components/crm/ui";
import { C, R, S } from "@/src/theme";

/** เพดานฝั่งแอป (~3 MB ของรูป ≈ 4.2 MB base64) — ต่ำกว่าเพดาน body ของแพลตฟอร์ม (~4.5 MB) · ใหญ่กว่านี้ไม่ส่ง บอกให้ถ่ายใหม่ */
const MAX_B64 = 4_200_000;
const TOO_BIG = "รูปนามบัตรใหญ่เกินไป — ถ่ายใหม่ด้วยความละเอียดต่ำลง";

/** error ของคำขอสแกน → ข้อความ (413 ของแพลตฟอร์มไม่มี body ไทย ⇒ แปลเอง) */
function scanErrorText(e: unknown): string {
  return e instanceof ApiError && e.status === 413 ? TOO_BIG : apiErrorText(e);
}

export default function CrmScanCardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const brand = useBrand();
  const params = useLocalSearchParams<{ systemId?: string }>();
  const systemId = paramOf(params.systemId);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ proposalId: string; draft: CrmCardDraft } | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);

  async function pick(source: "camera" | "library") {
    setError(null);
    setDone(false);
    try {
      const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setError(source === "camera" ? "แอปยังไม่ได้รับอนุญาตให้ใช้กล้อง — เปิดสิทธิ์กล้องในการตั้งค่าเครื่อง หรือเลือกรูปจากคลังแทน" : "ต้องอนุญาตให้เข้าถึงรูปภาพก่อนถึงจะเลือกรูปนามบัตรได้");
        return;
      }
      const opts = { mediaTypes: ["images" as const], base64: true, quality: 0.3 };
      const res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (res.canceled) return;
      const asset = res.assets[0];
      if (!asset?.base64) {
        setError("อ่านรูปนี้ไม่ได้ — ถ่ายใหม่อีกครั้ง");
        return;
      }
      if (asset.base64.length > MAX_B64) {
        setError(TOO_BIG);
        return;
      }
      setBusy(true);
      setDraft(null);
      const out = await api<{ proposalId: string; draft: CrmCardDraft }>(crmApiPath("/api/mobile/crm/scan-card", systemId), {
        body: { contentType: asset.mimeType ?? "image/jpeg", dataBase64: asset.base64, filename: asset.fileName ?? "card.jpg" },
      });
      setDraft(out);
    } catch (e) {
      setError(scanErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!draft || accepting) return;
    setError(null);
    setAccepting(true);
    try {
      await api<{ contactId: string }>(crmApiPath(`/api/mobile/crm/scan-card/${encodeURIComponent(draft.proposalId)}/accept`, systemId), { method: "POST", body: {} });
      setDone(true);
      setDraft(null);
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setAccepting(false);
    }
  }

  // "ทิ้งร่าง" = ปิดใบข้อเสนอฝั่งเซิร์ฟเวอร์ + ล้างชื่อ/เบอร์ออกจากแถว (C2.4 F8) — ไม่ใช่แค่ลืมในจอ
  async function discard() {
    if (!draft || accepting) return;
    setError(null);
    setAccepting(true);
    try {
      await api<{ ok: true }>(crmApiPath(`/api/mobile/crm/scan-card/${encodeURIComponent(draft.proposalId)}/reject`, systemId), { method: "POST", body: {} });
      setDraft(null);
    } catch (e) {
      setError(apiErrorText(e));
    } finally {
      setAccepting(false);
    }
  }

  const rows: [string, string][] = draft
    ? ([
        ["ชื่อ", draft.draft.name],
        ["ตำแหน่ง", [draft.draft.jobTitle, draft.draft.company].filter(Boolean).join(" · ")],
        ["เบอร์", draft.draft.phone],
        ["อีเมล", draft.draft.email],
      ] as [string, string][]).filter(([, v]) => !!v)
    : [];

  return (
    <View style={[crmStyles.screen, { paddingTop: insets.top }]}>
      <PageColumn>
        <CrmHeader title="สแกนนามบัตร" left="back" onLeft={() => (router.canGoBack() ? router.back() : router.replace(crmApiPath("/crm/tasks", systemId)))} />
        <ScrollView testID="crm-scan-card" contentContainerStyle={[crmStyles.body, { paddingBottom: insets.bottom + S.xl }]}>
          <Pressable testID="crm-scan-pick" onPress={() => void pick("camera")} disabled={busy} style={({ pressed }) => [styles.scanBox, pressed && { backgroundColor: C.surface }, busy && crmStyles.off]}>
            {busy ? <ActivityIndicator color={brand.accent} /> : <Feather name="camera" size={24} color={C.textDim} />}
            <Text style={styles.scanTitle}>{busy ? "AI กำลังอ่านนามบัตร…" : "ถ่ายรูปนามบัตรลูกค้าใหม่"}</Text>
            <Text style={crmStyles.faint}>ถ่ายรูป → AI อ่าน → ตรวจแล้วกดสร้าง lead</Text>
          </Pressable>
          <Pressable onPress={() => void pick("library")} disabled={busy} style={styles.link}>
            <Text style={styles.linkText}>หรือเลือกรูปจากคลังรูป</Text>
          </Pressable>
          <CrmNotice text={error} tone="error" />
          {done ? <CrmNotice testID="crm-scan-done" text="เพิ่มผู้ติดต่อใหม่แล้ว — ดูและมอบหมายต่อได้ที่ CRM บนเว็บ" tone="ok" /> : null}

          {draft ? (
            <View testID="crm-scan-draft" style={styles.draft}>
              <View style={styles.draftHead}>
                <Feather name="star" size={13} color={C.blue} />
                <Text style={styles.draftTitle}>AI อ่านนามบัตรแล้ว</Text>
              </View>
              {rows.length ? (
                rows.map(([k, v]) => (
                  <View key={k} style={styles.draftRow}>
                    <Text style={crmStyles.dim}>{k}</Text>
                    <Text style={styles.draftVal} numberOfLines={2}>
                      {v}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={crmStyles.dim}>AI อ่านข้อความบนนามบัตรไม่ออก — ถ่ายใหม่ให้ชัดขึ้น หรือเพิ่มผู้ติดต่อเองบนเว็บ</Text>
              )}
              <View style={styles.draftActions}>
                <Pressable testID="crm-scan-accept" onPress={() => void accept()} disabled={accepting || rows.length === 0} style={[styles.accept, (accepting || rows.length === 0) && crmStyles.off]}>
                  {accepting ? <ActivityIndicator color={C.bg} /> : <Text style={styles.acceptText}>สร้าง lead</Text>}
                </Pressable>
                <Pressable testID="crm-scan-reject" onPress={() => void discard()} disabled={accepting} style={[styles.again, accepting && crmStyles.off]}>
                  <Text style={crmStyles.ghostText}>ทิ้งร่าง</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </PageColumn>
    </View>
  );
}

const styles = StyleSheet.create({
  scanBox: { borderWidth: 1.5, borderStyle: "dashed", borderColor: C.textFaint, borderRadius: R.lg, paddingVertical: S.xl, alignItems: "center", gap: S.xs },
  scanTitle: { color: C.text, fontSize: 14, fontFamily: "IBMPlexSansThai_700Bold", marginTop: S.xs },
  link: { alignSelf: "center", paddingVertical: S.xs },
  linkText: { color: C.blue, fontSize: 13 },
  draft: { borderWidth: 1, borderColor: C.blue, backgroundColor: "#eff6ff", borderRadius: R.lg, padding: S.md, gap: S.sm },
  draftHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  draftTitle: { color: C.blue, fontSize: 14, fontFamily: "IBMPlexSansThai_700Bold" },
  draftRow: { flexDirection: "row", justifyContent: "space-between", gap: S.md },
  draftVal: { color: C.text, fontSize: 13, flexShrink: 1, textAlign: "right" },
  draftActions: { flexDirection: "row", gap: S.sm, marginTop: S.xs },
  accept: { backgroundColor: C.text, borderRadius: R.md, paddingHorizontal: S.lg, height: 40, alignItems: "center", justifyContent: "center" },
  acceptText: { color: C.bg, fontSize: 14, fontFamily: "IBMPlexSansThai_700Bold" },
  again: { borderWidth: 1, borderColor: C.border, borderRadius: R.md, paddingHorizontal: S.lg, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: C.bg },
});
