// ที่เก็บโหมดธีมที่ผู้ใช้เลือก: "system" (ตามเครื่อง) | "light" | "dark"
// เว็บ = localStorage (อ่านทันทีตอนโหลด) · มือถือ = expo-secure-store (มีในแอปอยู่แล้ว · ไม่เพิ่ม dependency ใหม่)
// คีย์ "shark_theme" — เครื่องมือ QC (qc/shoot-sec.mjs --dark) ตั้งคีย์นี้ก่อนโหลดจอ
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export type ThemeMode = "system" | "light" | "dark";
export const THEME_MODES: readonly ThemeMode[] = ["system", "light", "dark"];
const KEY = "shark_theme";

const isMode = (v: unknown): v is ThemeMode => v === "system" || v === "light" || v === "dark";

function readWebSync(): ThemeMode {
  try {
    const v = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    return isMode(v) ? v : "system";
  } catch {
    return "system";
  }
}

let mode: ThemeMode = Platform.OS === "web" ? readWebSync() : "system";
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// มือถือ: อ่านค่าที่เก็บไว้แบบ async ครั้งเดียว (ระหว่างนั้นใช้ "system")
if (Platform.OS !== "web") {
  SecureStore.getItemAsync(KEY)
    .then((v) => {
      if (isMode(v) && v !== mode) {
        mode = v;
        emit();
      }
    })
    .catch(() => {});
}

export function getThemeMode(): ThemeMode {
  return mode;
}

export async function setThemeMode(next: ThemeMode): Promise<void> {
  if (!isMode(next) || next === mode) return;
  mode = next;
  emit();
  try {
    if (Platform.OS === "web") {
      if (typeof localStorage !== "undefined") localStorage.setItem(KEY, next);
    } else {
      await SecureStore.setItemAsync(KEY, next);
    }
  } catch {
    // เก็บไม่ได้ก็ยังใช้ค่าในหน่วยความจำต่อได้
  }
}

export function subscribeThemeMode(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** hook: โหมดที่เลือกปัจจุบัน (เปลี่ยนแล้วจอวาดใหม่) */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeThemeMode, getThemeMode, getThemeMode);
}
