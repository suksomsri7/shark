// Drawer ของโซนในกิจการ — สลับกิจการ/เพิ่มกิจการ/เมนู/ออกจากระบบ
// กติกาเจ้าของ: บนสุด=ชื่อกิจการ active + ▾ กางรายการ · ปุ่ม + เพิ่มกิจการ → /dna
//               ไม่มีปุ่ม X ปิด (ปิดด้วยแตะข้างนอก/สไลด์) · ล่างสุด=อีเมล + ออกจากระบบ (ยืนยัน 2 จังหวะ)
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, ScrollView } from "react-native";
import { Drawer } from "expo-router/drawer";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/lib/auth-context";
import { C, R, S } from "@/src/theme";

// type ของ props ระหว่าง expo-router/drawer กับ @react-navigation/drawer ชนกัน (identity ซ้ำสองแพ็กเกจ)
// → ประกาศเฉพาะ structural type ที่ใช้จริง (closeDrawer/navigate) พอ — ปลอด any และไม่ผูก identity ใคร
type DrawerNav = { closeDrawer: () => void; navigate: (name: string) => void };
function DrawerBody(props: { navigation: DrawerNav }) {
  const { navigation } = props;
  const { tenants, activeTenantId, user, switchTenant, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  const active = tenants.find((t) => t.tenantId === activeTenantId);

  async function pickTenant(id: string) {
    if (id !== activeTenantId) await switchTenant(id);
    setExpanded(false);
    navigation.closeDrawer();
  }

  function addBusiness() {
    setExpanded(false);
    navigation.closeDrawer();
    router.push("/dna");
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + S.md, paddingBottom: insets.bottom + S.md }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        style={styles.flex}
      >
        {/* ── กิจการ active + ▾ ── */}
        <Pressable onPress={() => setExpanded((e) => !e)} style={styles.tenantHead}>
          <View style={styles.flex}>
            <Text style={styles.tenantLabel}>กิจการ</Text>
            <Text style={styles.tenantName} numberOfLines={1}>
              {active?.name ?? "กิจการของฉัน"}
            </Text>
          </View>
          <Text style={styles.caret}>{expanded ? "▴" : "▾"}</Text>
        </Pressable>

        {expanded && (
          <View style={styles.tenantList}>
            {tenants.map((t) => {
              const on = t.tenantId === activeTenantId;
              return (
                <Pressable
                  key={t.tenantId}
                  onPress={() => void pickTenant(t.tenantId)}
                  style={({ pressed }) => [styles.tenantRow, pressed && styles.rowPressed]}
                >
                  <Text style={[styles.tenantRowText, on && styles.tenantRowOn]} numberOfLines={1}>
                    {t.name}
                  </Text>
                  {on && <Text style={styles.check}>✓</Text>}
                </Pressable>
              );
            })}
            <Pressable
              onPress={addBusiness}
              style={({ pressed }) => [styles.tenantRow, pressed && styles.rowPressed]}
            >
              <Text style={styles.addText}>+ เพิ่มกิจการ</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.divider} />

        {/* ── เมนู ── */}
        <Pressable
          onPress={() => navigation.navigate("index")}
          style={({ pressed }) => [styles.menuItem, pressed && styles.rowPressed]}
        >
          <Text style={styles.menuText}>ระบบงาน</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("sessions")}
          style={({ pressed }) => [styles.menuItem, pressed && styles.rowPressed]}
        >
          <Text style={styles.menuText}>ผู้ช่วย AI</Text>
        </Pressable>
      </ScrollView>

      {/* ── ล่างสุด: อีเมล + ออกจากระบบ ── */}
      <View style={styles.bottom}>
        <Text style={styles.email} numberOfLines={1}>
          {user?.email ?? ""}
        </Text>
        <Pressable
          onPress={() => {
            if (!confirmOut) {
              setConfirmOut(true);
              return;
            }
            void signOut(); // gate เด้งไป /login เอง
          }}
          style={({ pressed }) => [styles.logout, confirmOut && styles.logoutArmed, pressed && styles.rowPressed]}
        >
          <Text style={styles.logoutText}>
            {confirmOut ? "แน่ใจไหม? แตะอีกครั้งเพื่อออก" : "ออกจากระบบ"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function AppLayout() {
  return (
    <Drawer
      drawerContent={(props) => <DrawerBody {...props} />}
      screenOptions={{
        headerShown: false,
        drawerType: "front",
        drawerStyle: { backgroundColor: C.surface, width: 300 },
        overlayColor: "rgba(0,0,0,0.6)",
        swipeEdgeWidth: 60,
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.surface },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: S.md },

  tenantHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: S.md,
    paddingHorizontal: S.sm,
  },
  tenantLabel: { color: C.textFaint, fontSize: 12 },
  tenantName: { color: C.text, fontSize: 22, fontFamily: "IBMPlexSansThai_700Bold", marginTop: 2 },
  caret: { color: C.textDim, fontSize: 20, paddingHorizontal: S.sm },

  tenantList: {
    backgroundColor: C.bg,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingVertical: S.xs,
    marginBottom: S.sm,
  },
  tenantRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: S.md,
    paddingHorizontal: S.md,
  },
  rowPressed: { backgroundColor: C.surfaceHi },
  tenantRowText: { color: C.textDim, fontSize: 15, flex: 1 },
  tenantRowOn: { color: C.text, fontFamily: "IBMPlexSansThai_700Bold" },
  check: { color: C.blueHi, fontSize: 16, fontWeight: "800", paddingLeft: S.sm },
  addText: { color: C.blueHi, fontSize: 15, fontFamily: "IBMPlexSansThai_700Bold" },

  divider: { height: 1, backgroundColor: C.border, marginVertical: S.md },

  menuItem: { paddingVertical: S.md, paddingHorizontal: S.sm, borderRadius: R.sm },
  menuText: { color: C.text, fontSize: 16, fontWeight: "600" },

  bottom: { paddingHorizontal: S.lg, paddingTop: S.md, borderTopWidth: 1, borderTopColor: C.border },
  email: { color: C.textDim, fontSize: 13, marginBottom: S.sm },
  logout: {
    borderWidth: 1,
    borderColor: C.danger,
    borderRadius: R.md,
    paddingVertical: S.md,
    alignItems: "center",
  },
  logoutArmed: { backgroundColor: C.dangerDim },
  logoutText: { color: C.danger, fontSize: 15, fontFamily: "IBMPlexSansThai_700Bold" },
});
