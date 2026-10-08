// กองอวาตาร์มุมขวาบน — คน = วงกลมตัวอักษรย่อ · AI = ลูกแก้ว · เกิน max แสดงวง "+N" (ซ้อนกันด้วยขอบสีพื้น)
import { View, type StyleProp, type ViewStyle } from "react-native";
import { TeamText } from "./TeamText";
import { useTheme } from "@/src/theme";
import { Orb, type OrbDepartment } from "./Orb";

export type StackPerson = { name: string; initial: string };
export type StackAi = { department: OrbDepartment; name?: string; initial?: string };

type Props = {
  people: StackPerson[];
  ai: StackAi[];
  max?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function AvatarStack({ people, ai, max = 4, size, style, testID }: Props) {
  const { colors, tokens } = useTheme();
  const d = size ?? tokens.size.avatar;
  const humans = [colors.human.a, colors.human.b, colors.human.c];
  const all = [
    ...people.map((p, i) => ({ kind: "human" as const, key: `h${i}`, name: p.name, initial: p.initial, tone: humans[i % humans.length] })),
    ...ai.map((a, i) => ({ kind: "ai" as const, key: `a${i}`, name: a.name ?? "", initial: a.initial, department: a.department })),
  ];
  const shown = all.slice(0, max);
  const rest = all.length - shown.length;
  const ring: ViewStyle = {
    width: d,
    height: d,
    borderRadius: tokens.radii.full,
    borderWidth: tokens.border.ring,
    borderColor: colors.avatarRing,
    boxShadow: colors.avatarShadow,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  };
  return (
    <View testID={testID} style={[{ flexDirection: "row", alignItems: "center" }, style]}>
      {shown.map((x, i) => (
        <View key={x.key} accessibilityLabel={x.name} style={[ring, i > 0 && { marginLeft: -tokens.spacing.stackOverlap }, x.kind === "human" && { backgroundColor: x.tone }]}>
          {x.kind === "human" ? (
            <TeamText style={[tokens.type.avatar, { color: colors.avatarFg }]} numberOfLines={1}>
              {x.initial}
            </TeamText>
          ) : (
            <Orb department={x.department} size={d - tokens.border.ring * 2} initial={x.initial} />
          )}
        </View>
      ))}
      {rest > 0 ? (
        <View style={[ring, { marginLeft: -tokens.spacing.stackOverlap, backgroundColor: colors.more }]}>
          <TeamText style={[tokens.type.more, { color: colors.moreFg }]} numberOfLines={1}>{`+${rest}`}</TeamText>
        </View>
      ) : null}
    </View>
  );
}
