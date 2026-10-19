import type { NextConfig } from "next";

/* ฟอนต์ไทยของ pdfmake/og ของระบบรถร่วม — ไม่ได้ import เป็นโมดูล bundler จึงไม่เห็นเอง ต้องบอกให้รวมไฟล์ */
const PARTNER_FONTS = ["./partner-assets/fonts/**"];

const nextConfig: NextConfig = {
  /* หน้าหลักย้ายจาก `/desk` ไป `/home` — บุ๊กมาร์ก/ลิงก์เก่ายังใช้ได้ · query (`?m=` `?welcome=`)
     ติดไปด้วยเอง · redirect ทำงานก่อน `proxy.ts` ส่วน `/home` ถูกกั้นล็อกอินต่ออีกชั้น */
  async redirects() {
    return [{ source: "/desk", destination: "/home", permanent: false }];
  },

  /* ระบบรถร่วม (ย้ายมาจาก mena-partner-driver) — pdfmake มีไฟล์ data ภายใน ต้องรันจาก node_modules */
  serverExternalPackages: ["pdfmake", "sharp"],

  /* template .docx ของสัญญา + ฟอนต์ไทยของ pdfmake/og ต้องติดไปใน serverless bundle ของเส้นที่ใช้ */
  outputFileTracingIncludes: {
    "/api/partner/contracts/[id]/docx": ["./partner-assets/templates/**"],
    "/api/partner/contracts/[id]/pdf": PARTNER_FONTS,
    "/api/partner/quotations/[id]/pdf": PARTNER_FONTS,
    "/api/partner/catalog/[plate]/pdf": PARTNER_FONTS,
    "/api/partner/catalog/pdf": PARTNER_FONTS,
    "/api/partner/payroll/[month]/packet": PARTNER_FONTS,
    "/og/truck/[slug]": PARTNER_FONTS,
  },

  /* รูปเอกสาร/รูปรถของระบบรถร่วมอยู่บน DO Spaces — เสิร์ฟผ่าน next/image */
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "*.digitaloceanspaces.com" }],
  },
};

export default nextConfig;
