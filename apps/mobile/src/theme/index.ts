// ธีมของแอป — ทางเข้าเดียว
//   · C R S = ธีมเดิมของจอ 1.0 (ค่าเท่าเดิม · อยู่ใน ./legacy)
//   · tokens / light / dark + useTheme() = Liquid Glass · Airy ของจอทีมพนักงาน AI (T0.3)
// โหมด = ค่าที่ผู้ใช้บังคับไว้ (override) ?? โหมดของเครื่อง · หน้าตั้งค่าที่เรียก setThemeOverride มาในใบ T5.4
// override เก็บในตัวแปรระดับโมดูล (แบบเดียวกับ src/lib/brand.tsx): อ่านครั้งเดียวตอน import — เว็บ = localStorage · เครื่องจริง = expo-secure-store
//   (อ่านแบบ sync ⇒ เฟรมแรกก็ได้โหมดที่ถูก ไม่กะพริบ) · อ่าน/เขียนพลาดทุกกรณี = กลืนเงียบแล้วตามโหมดเครื่อง
// 🔴 ที่เก็บนี้มีแค่คำว่า "light" / "dark" ใต้ key เดียว (shark_theme) — ห้ามอ่าน/เขียน key อื่นจากโฟลเดอร์นี้
import { useSyncExternalStore } from "react";
import { Platform, useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { C, R, S } from "./legacy";
import { tokens } from "./tokens";
import { light } from "./light";
import { dark } from "./dark";

export { C, R, S, tokens, light, dark };

export const THEME_STORAGE_KEY = "shark_theme";

export type ThemeMode = "light" | "dark";
export type Theme = { mode: ThemeMode; colors: typeof light; tokens: typeof tokens };

const asMode = (v: unknown): ThemeMode | null => (v === "light" || v === "dark" ? v : null);

function readStored(): ThemeMode | null {
  try {
    if (Platform.OS === "web") {
      return typeof localStorage === "undefined" ? null : asMode(localStorage.getItem(THEME_STORAGE_KEY));
    }
    return asMode(SecureStore.getItem(THEME_STORAGE_KEY));
  } catch {
    return null; // ไม่มีที่เก็บ / ค่าเพี้ยน → ตามโหมดเครื่อง
  }
}

let override: ThemeMode | null = readStored();
const listeners = new Set<() => void>();

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getThemeOverride(): ThemeMode | null {
  return override;
}

// null = เลิกบังคับ (ลบ key) แล้วกลับไปตามโหมดเครื่อง · จอที่ใช้ useTheme() เปลี่ยนทันที ไม่ต้องรอเขียนเสร็จ
export async function setThemeOverride(v: ThemeMode | null): Promise<void> {
  override = asMode(v);
  for (const fn of [...listeners]) fn();
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage === "undefined") return;
      if (override) localStorage.setItem(THEME_STORAGE_KEY, override);
      else localStorage.removeItem(THEME_STORAGE_KEY);
      return;
    }
    if (override) await SecureStore.setItemAsync(THEME_STORAGE_KEY, override);
    else await SecureStore.deleteItemAsync(THEME_STORAGE_KEY);
  } catch {
    /* เขียนไม่ได้ — โหมดยังเปลี่ยนในรอบนี้ แค่ไม่จำข้ามการเปิดแอป */
  }
}

const THEMES: Record<ThemeMode, Theme> = {
  light: { mode: "light", colors: light, tokens },
  dark: { mode: "dark", colors: dark, tokens },
};

export function useTheme(): Theme {
  const forced = useSyncExternalStore(subscribe, getThemeOverride, getThemeOverride);
  const scheme = useColorScheme();
  return THEMES[forced ?? (scheme === "dark" ? "dark" : "light")];
}
