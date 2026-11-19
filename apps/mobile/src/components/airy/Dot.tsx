// จุดสถานะ .dot — กำลังทำ (เขียว+วง) · รออนุมัติ (เหลือง+วง) · เสร็จ (เทา) · 17 พ.ย. ไม่สำเร็จ (แดง+วง)
import { View } from "react-native";
import { haloStyle, useTheme } from "@/src/theme/index";
import { size } from "@/src/theme/tokens";

export type DotStatus = "run" | "wait" | "done" | "fail";

export function Dot({ status, testID }: { status: DotStatus; testID?: string }) {
  const { c } = useTheme();
  const color = c.status[status];
  const halo = status === "run" ? c.status.runHalo : status === "wait" ? c.status.waitHalo : status === "fail" ? c.status.failHalo : c.status.doneHalo;
  return <View testID={testID} style={[{ width: size.dot, height: size.dot, borderRadius: size.dot / 2, backgroundColor: color }, haloStyle(halo)]} />;
}
