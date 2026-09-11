// จอ ก "ค้นสมาชิก / สแกน QR" ของแอปพนักงาน (M3.11 · ภาพ 28 ก)
// ช่องค้น (ชื่อ/เบอร์/รหัสสมาชิก) · กล่องสแกน QR ใหญ่เส้นประ · ผลการค้นหา (ชื่อ · เบอร์ปิดบัง · ระดับ)
// API: GET /api/mobile/member/search?q= · POST /api/mobile/member/scan {token} — ผ่าน src/api/client (Bearer + กิจการ)
//
// 🔴 กล้อง (expo-camera) เป็น **ของเสริม**: แอปบิลด์ปัจจุบันยังไม่มี native module กล้อง และใบนี้ห้ามบิลด์/OTA
//    ⇒ โหลดแบบ optional (require ใน try/catch — Metro ของ Expo เปิด allowOptionalDependencies ไว้ bundle ไม่ล้ม
//    แม้ยังไม่ติดตั้งแพ็กเกจ) · มีกล้อง = เปิด CameraView สแกน `SHARK-MC:<token>` · ไม่มี = ช่องกรอก/วางรหัสจาก QR
//    (เครื่องสแกนบาร์โค้ดแบบบลูทูธพิมพ์ลงช่องนี้ได้ตรง ๆ) + ค้นด้วยชื่อ/เบอร์
// 🔴 ข้อความผิดพลาดขึ้นใต้จุดที่เกี่ยว (ห้าม Alert) · ไม่มีเบอร์เต็มบนจอ (API ส่งแต่เบอร์ปิดบัง)
import { useEffect, useRef, useState, type ComponentType } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRouter } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, TextInput } from "@/src/components/ui/text";
import { PageColumn } from "@/src/components/ui/page";
import { api, apiErrorText } from "@/src/api/client";
import { useBrand } from "@/src/lib/brand";
import { Avatar, MemberHeader, Notice, TierChip, memberStyles, type MemberRow } from "@/src/components/member/ui";
import { C, R, S } from "@/src/theme";

// ── กล้องสแกน QR (optional · expo-camera) ──
type CameraViewProps = {
  style?: object;
  facing?: "back" | "front";
  barcodeScannerSettings?: { barcodeTypes: string[] };
  onBarcodeScanned?: (e: { data: string }) => void;
};
type PermissionFn = () => Promise<{ granted: boolean }>;
type CameraModule = {
  CameraView?: ComponentType<CameraViewProps>;
  Camera?: { requestCameraPermissionsAsync?: PermissionFn };
  requestCameraPermissionsAsync?: PermissionFn;
};

function loadCamera(): { View: ComponentType<CameraViewProps>; ask: PermissionFn | null } | null {
  try {
    const mod = require("expo-camera") as CameraModule;
    if (!mod?.CameraView) return null;
    return { View: mod.CameraView, ask: mod.Camera?.requestCameraPermissionsAsync ?? mod.requestCameraPermissionsAsync ?? null };
  } catch {
    return null; // แพ็กเกจยังไม่ติดตั้ง / บิลด์นี้ไม่มี native module กล้อง → ใช้ช่องกรอกรหัสแทน
  }
}
const CAMERA = loadCamera();
const QR_PREFIX = "SHARK-MC:";

export default function MemberSearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const brand = useBrand();

  const [q, setQ] = useState("");
  const [items, setItems] = useState<MemberRow[]>([]);
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scanOpen, setScanOpen] = useState(false); // กล้อง
  const [manualOpen, setManualOpen] = useState(false); // ช่องกรอกรหัสจาก QR (ไม่มีกล้อง)
  const [manual, setManual] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const scanLock = useRef(false);
  const reqSeq = useRef(0);

  // ค้นแบบหน่วง 350ms (พิมพ์รัว ๆ ไม่ยิงทุกตัวอักษร) · ผลของคำค้นเก่าที่มาช้าถูกทิ้ง
  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setItems([]);
      setSearched("");
      setError(null);
      return;
    }
    const seq = ++reqSeq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = (await api("/api/mobile/member/search?q=" + encodeURIComponent(text))) as { items: MemberRow[] };
        if (seq !== reqSeq.current) return;
        setItems(res.items ?? []);
        setSearched(text);
        setError(null);
      } catch (e) {
        if (seq === reqSeq.current) setError(apiErrorText(e));
      } finally {
        if (seq === reqSeq.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  async function lookup(raw: string) {
    const token = raw.trim();
    if (!token) {
      setScanError("วางหรือพิมพ์รหัสจาก QR บัตรสมาชิกก่อน");
      return;
    }
    setScanBusy(true);
    setScanError(null);
    try {
      const res = (await api("/api/mobile/member/scan", {
        body: { token: token.startsWith(QR_PREFIX) ? token : `${QR_PREFIX}${token}` },
      })) as { member: MemberRow };
      setManualOpen(false);
      setManual("");
      router.push(`/member/${res.member.id}`);
    } catch (e) {
      setScanError(apiErrorText(e));
    } finally {
      setScanBusy(false);
      scanLock.current = false;
    }
  }

  async function openScanner() {
    setScanError(null);
    if (!CAMERA) {
      setManualOpen((v) => !v);
      return;
    }
    try {
      const perm = CAMERA.ask ? await CAMERA.ask() : { granted: true };
      if (!perm.granted) {
        setScanError("แอปยังไม่ได้รับอนุญาตให้ใช้กล้อง — เปิดสิทธิ์กล้องในการตั้งค่าเครื่อง หรือค้นด้วยชื่อ/เบอร์แทน");
        setManualOpen(true);
        return;
      }
      scanLock.current = false;
      setScanOpen(true);
    } catch {
      setManualOpen(true);
    }
  }

  // เปิด Drawer ของโซนกิจการ — ใช้ navigation ของ expo-router (SDK 56+ ห้าม import @react-navigation/* ตรง:
  // Metro ปฏิเสธทั้ง bundle) · helper ของ Drawer ถูกรวมเข้า navigation ของจอลูก หรือไล่ขึ้นหา parent ที่มี openDrawer
  function openDrawer() {
    let nav: unknown = navigation;
    for (let i = 0; i < 5 && nav; i += 1) {
      const n = nav as { openDrawer?: () => void; getParent?: () => unknown };
      if (typeof n.openDrawer === "function") {
        n.openDrawer();
        return;
      }
      nav = n.getParent?.();
    }
  }

  const CameraView = CAMERA?.View;

  return (
    <View style={[memberStyles.screen, { paddingTop: insets.top }]}>
      <PageColumn>
        <MemberHeader title="ค้นสมาชิก" left="menu" onLeft={openDrawer} />
        <ScrollView contentContainerStyle={[memberStyles.body, { paddingBottom: insets.bottom + S.xl }]} keyboardShouldPersistTaps="handled">
          <View style={styles.searchBox}>
            <Feather name="search" size={16} color={C.textFaint} />
            <TextInput
              testID="member-search"
              value={q}
              onChangeText={setQ}
              placeholder="ค้นหาชื่อ เบอร์ หรือรหัสสมาชิก"
              placeholderTextColor={C.textFaint}
              style={styles.searchInput}
              autoCorrect={false}
              returnKeyType="search"
            />
            {q ? (
              <Pressable onPress={() => setQ("")} hitSlop={8} accessibilityLabel="ล้างคำค้น">
                <Feather name="x" size={16} color={C.textFaint} />
              </Pressable>
            ) : null}
          </View>

          <Pressable testID="member-scan" onPress={openScanner} style={({ pressed }) => [styles.scanBox, pressed && { backgroundColor: C.surface }]}>
            <Ionicons name="qr-code-outline" size={34} color={C.text} />
            <Text style={styles.scanTitle}>สแกน QR บัตรสมาชิก</Text>
            <Text style={memberStyles.faint}>หรือค้นด้วยชื่อ/เบอร์ด้านบน</Text>
          </Pressable>

          {manualOpen ? (
            <View style={[memberStyles.card, styles.manual]}>
              <Text style={memberStyles.dim}>
                {CAMERA
                  ? "วางหรือพิมพ์รหัสจาก QR บัตรสมาชิก"
                  : "แอปรุ่นนี้ยังไม่มีกล้องสแกน — วางรหัสจาก QR (SHARK-MC:…) หรือใช้เครื่องสแกนบาร์โค้ดยิงลงช่องนี้"}
              </Text>
              <TextInput
                value={manual}
                onChangeText={setManual}
                placeholder="SHARK-MC:…"
                placeholderTextColor={C.textFaint}
                style={styles.manualInput}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => void lookup(manual)}
              />
              <Pressable
                onPress={() => void lookup(manual)}
                disabled={scanBusy}
                style={[styles.primary, { backgroundColor: brand.accent }, scanBusy && styles.off]}
              >
                {scanBusy ? <ActivityIndicator color={brand.accentFg} /> : <Text style={[styles.primaryText, { color: brand.accentFg }]}>เปิดการ์ดสมาชิก</Text>}
              </Pressable>
            </View>
          ) : null}
          <Notice text={scanError} tone="error" />

          {searched || loading ? (
            <Text style={memberStyles.sectionTitle}>
              ผลการค้นหา &quot;{searched || q.trim()}&quot;
            </Text>
          ) : null}
          <Notice text={error} tone="error" />

          {loading && items.length === 0 ? (
            <View style={memberStyles.center}>
              <ActivityIndicator color={brand.accent} />
            </View>
          ) : searched && items.length === 0 && !error ? (
            <Text style={memberStyles.dim}>ไม่พบสมาชิกที่ตรงกับ &quot;{searched}&quot; — ลองพิมพ์ชื่อเล่น เบอร์ 4 ตัวท้าย หรือรหัสสมาชิก</Text>
          ) : items.length > 0 ? (
            <View style={memberStyles.card}>
              {items.map((m, i) => (
                <Pressable
                  key={m.id}
                  testID={`member-result-${i}`}
                  onPress={() => router.push(`/member/${m.id}`)}
                  style={({ pressed }) => [styles.row, i > 0 && styles.rowLine, pressed && { backgroundColor: C.surface }]}
                >
                  <Avatar name={m.name} />
                  <View style={styles.rowBody}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {m.name}
                    </Text>
                    <Text style={memberStyles.faint} numberOfLines={1}>
                      {m.phoneMasked || m.memberCode}
                    </Text>
                  </View>
                  <TierChip tier={m.tier} />
                </Pressable>
              ))}
            </View>
          ) : !searched ? (
            <Text style={memberStyles.faint}>พิมพ์ชื่อ เบอร์ หรือรหัสสมาชิกอย่างน้อย 1 ตัวอักษร แล้วรายชื่อจะขึ้นเอง</Text>
          ) : null}
        </ScrollView>
      </PageColumn>

      {CameraView ? (
        <Modal visible={scanOpen} animationType="slide" onRequestClose={() => setScanOpen(false)}>
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={({ data }) => {
                if (scanLock.current) return; // กล้องยิงผลซ้ำหลายเฟรม — รับแค่ครั้งแรก
                scanLock.current = true;
                setScanOpen(false);
                void lookup(String(data ?? ""));
              }}
            />
            <View style={[styles.cameraBar, { paddingTop: insets.top + S.sm }]}>
              <Pressable onPress={() => setScanOpen(false)} hitSlop={10} style={styles.cameraClose} accessibilityLabel="ปิดกล้อง">
                <Feather name="x" size={22} color="#ffffff" />
              </Pressable>
              <Text style={styles.cameraHint}>ส่องกล้องไปที่ QR บนบัตรสมาชิกของลูกค้า</Text>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    height: 46,
    backgroundColor: C.bg,
  },
  searchInput: { flex: 1, color: C.text, fontSize: 15, paddingVertical: 0 },
  scanBox: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: C.textFaint,
    borderRadius: R.lg,
    paddingVertical: S.xl,
    alignItems: "center",
    gap: S.xs,
    backgroundColor: C.bg,
  },
  scanTitle: { color: C.text, fontSize: 15, fontFamily: "IBMPlexSansThai_700Bold", marginTop: S.xs },
  manual: { padding: S.md, gap: S.sm },
  manualInput: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    height: 44,
    color: C.text,
    fontSize: 14,
  },
  primary: { borderRadius: R.md, height: 46, alignItems: "center", justifyContent: "center" },
  primaryText: { fontSize: 15, fontFamily: "IBMPlexSansThai_700Bold" },
  off: { opacity: 0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, paddingHorizontal: S.md, paddingVertical: S.md },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { color: C.text, fontSize: 15, fontFamily: "IBMPlexSansThai_700Bold" },
  cameraWrap: { flex: 1, backgroundColor: "#000000" },
  cameraBar: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: S.lg, gap: S.sm },
  cameraClose: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.45)" },
  cameraHint: { color: "#ffffff", fontSize: 14 },
});
