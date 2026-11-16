import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* หน้าหลักย้ายจาก `/desk` ไป `/home` — บุ๊กมาร์ก/ลิงก์เก่ายังใช้ได้ · query (`?m=` `?welcome=`)
     ติดไปด้วยเอง · redirect ทำงานก่อน `proxy.ts` ส่วน `/home` ถูกกั้นล็อกอินต่ออีกชั้น */
  experimental: {
    /* โครง `loading.tsx` ที่ `<Link>` prefetch ไว้ใช้ซ้ำได้ 30 นาที (ค่าเดิม 5) — เมนูข้างทุกลิงก์
       prefetch ทุกครั้งที่ cache หมด แต่ละครั้งเป็น function invocation บน Vercel · โครงนี้ไม่มีข้อมูล
       ข้อมูลจริงยัง render ใหม่ทุกครั้งที่เปิดหน้า (`force-dynamic`) */
    staleTimes: { static: 1800 },
  },
  async redirects() {
    return [{ source: "/desk", destination: "/home", permanent: false }];
  },
  /* ตั้ง `HR_API_URL` (เช่น URL ของ mena-backend-services) เมื่อไหร่ `/api/**` ทั้งหมดจะถูกส่งต่อไปที่
     `${HR_API_URL}/api/v1/hr/**` แทน route ใน `app/api` · ยกเว้นล็อกอิน Google (`/api/auth/**`),
     cron ของ Vercel (`/api/cron/**`) และ `/api/drivers/excel-sync` (ใช้ตอน dev) ที่ยังทำงานที่นี่
     · `proxy.ts` ยังทำงานก่อน (ลำดับ: proxy → beforeFiles) · ไม่ตั้ง = ทุกอย่างเหมือนเดิม
     ถอยกลับ = ลบ env นี้แล้ว redeploy */
  async rewrites() {
    const target = process.env.HR_API_URL?.trim().replace(/\/+$/, "");
    if (!target) return [];
    return {
      beforeFiles: [
        {
          source: "/api/:path((?!(?:auth|cron)(?:/|$)|drivers/excel-sync(?:/|$)).+)",
          destination: `${target}/api/v1/hr/:path`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
