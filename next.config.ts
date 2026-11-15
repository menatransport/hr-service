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
};

export default nextConfig;
