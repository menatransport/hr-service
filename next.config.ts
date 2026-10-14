import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* หน้าหลักย้ายจาก `/desk` ไป `/home` — บุ๊กมาร์ก/ลิงก์เก่ายังใช้ได้ · query (`?m=` `?welcome=`)
     ติดไปด้วยเอง · redirect ทำงานก่อน `proxy.ts` ส่วน `/home` ถูกกั้นล็อกอินต่ออีกชั้น */
  async redirects() {
    return [{ source: "/desk", destination: "/home", permanent: false }];
  },
};

export default nextConfig;
