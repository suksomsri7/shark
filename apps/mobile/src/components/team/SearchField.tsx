// ช่องค้นหาแก้วทรงเม็ดยา — ไอคอนแว่นขยาย + ช่องพิมพ์ (Text/TextInput จาก ui/text เท่านั้น)
import { View, type StyleProp, type ViewStyle } from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { TextInput } from "@/src/components/ui/text";
import { useTheme } from "@/src/theme";
import { useGlass } from "./glass";
import { teamInputFontFamily } from "./TeamText";

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  onSubmit?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function SearchField({ value, onChangeText, placeholder, onSubmit, style, testID }: Props) {
  const { colors, tokens } = useTheme();
  const glass = useGlass();
  return (
    <View
      style={[
        glass,
        { minHeight: tokens.size.search, height: tokens.size.search, borderRadius: tokens.radii.full, flexDirection: "row", alignItems: "center", gap: tokens.spacing.searchGap, paddingHorizontal: tokens.spacing.searchPadH },
        style,
      ]}
    >
      <Feather name="search" size={tokens.size.searchIcon} color={colors.placeholder} />
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={placeholder}
        style={[tokens.type.subtitle, { flex: 1, minWidth: 0, height: tokens.size.search, color: colors.text, padding: 0, fontFamily: teamInputFontFamily(tokens.type.subtitle.fontWeight) }]}
      />
    </View>
  );
}
