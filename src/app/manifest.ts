import type { MetadataRoute } from "next";

// PWA manifest (Next 16 metadata route) — ติดตั้งลงมือถือได้ ไอคอน Fable วาดใน public/
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SHARK — AI จัดการธุรกิจ",
    short_name: "SHARK",
    description: "จัดการโรงแรม ร้านอาหาร จองคิว สมาชิก แต้ม ครบในที่เดียว ด้วย AI",
    start_url: "/app",
    display: "standalone",
    background_color: "#0B132B",
    theme_color: "#0B132B",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
