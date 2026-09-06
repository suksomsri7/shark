// เก็บ Bearer token + กิจการ active ใน SecureStore เท่านั้น (กติกา security: ห้ามเก็บ token ใน storage แบบ plain)
import * as SecureStore from "expo-secure-store";

const KEY_TOKEN = "shark_token";
const KEY_TENANT = "shark_tenant";
// แคชธีมกิจการ active ล่าสุด (JSON ของ Branding | null) — กันจอกะพริบน้ำเงิน→สีแบรนด์ตอนเปิดแอปก่อน /me กลับ
const KEY_BRAND = "shark_brand";

export const getToken = () => SecureStore.getItemAsync(KEY_TOKEN);
export const setToken = (t: string) => SecureStore.setItemAsync(KEY_TOKEN, t);
export const getTenantId = () => SecureStore.getItemAsync(KEY_TENANT);
export const setTenantId = (id: string) => SecureStore.setItemAsync(KEY_TENANT, id);
export const getCachedBrand = () => SecureStore.getItemAsync(KEY_BRAND);
export const setCachedBrand = (json: string) => SecureStore.setItemAsync(KEY_BRAND, json);

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_TOKEN);
  await SecureStore.deleteItemAsync(KEY_TENANT);
  await SecureStore.deleteItemAsync(KEY_BRAND);
}
