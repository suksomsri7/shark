// bubble ข้อความ — USER ขวา (พื้นน้ำเงิน) / ASSISTANT ซ้าย (พื้น surface) + รูปแนบ
import { Image, StyleSheet, Text, View } from "react-native";
import { C, R, S } from "@/src/theme";

export function ChatBubble({
  role,
  content,
  images,
}: {
  role: "USER" | "ASSISTANT";
  content: string;
  images?: string[];
}) {
  const mine = role === "USER";
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        {images && images.length > 0 && (
          <View style={styles.thumbs}>
            {images.map((src, i) => (
              <Image key={i} source={{ uri: src }} style={styles.thumb} />
            ))}
          </View>
        )}
        {content.length > 0 && (
          <Text style={[styles.text, mine ? styles.textMine : styles.textTheirs]}>{content}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  rowMine: { justifyContent: "flex-end", paddingLeft: 40 },
  rowTheirs: { justifyContent: "flex-start", paddingRight: 40 },
  bubble: { maxWidth: "100%", borderRadius: R.lg, paddingHorizontal: S.md, paddingVertical: S.sm },
  mine: { backgroundColor: C.blue, borderBottomRightRadius: R.sm },
  theirs: { backgroundColor: C.surface, borderBottomLeftRadius: R.sm },
  text: { fontSize: 15, lineHeight: 21 },
  textMine: { color: "#ffffff" },
  textTheirs: { color: C.text },
  thumbs: { flexDirection: "row", flexWrap: "wrap", gap: S.xs, marginBottom: S.xs },
  thumb: { width: 120, height: 120, borderRadius: R.md, backgroundColor: C.surfaceHi },
});
