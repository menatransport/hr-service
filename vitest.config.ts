import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * vitest — **เฉพาะเทสต์ของโค้ดรถร่วมที่ย้ายมาจาก mena-partner-driver** (`lib/partner/**`)
 *
 * เทสต์ของ hr-service ใช้ `node:test` ผ่าน tsx เหมือนเดิม (`npm run test:node`) ไม่ได้ย้ายมาที่นี่
 * เพราะสองชุดเขียนคนละ API (`node:test` vs `vitest` globals) — `npm test` รันทั้งสองต่อกัน
 * ห้ามขยาย `include` ไปจับ `lib/**` ทั้งหมด ไม่งั้นไฟล์ `node:test` จะถูกรันซ้ำด้วยตัวรันผิดชนิด
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: { "server-only": new URL("./test/server-only-stub.ts", import.meta.url).pathname },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["lib/partner/**/*.test.ts", "lib/partner/**/*.test.tsx"],
  },
});
