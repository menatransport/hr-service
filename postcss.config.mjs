import path from "node:path";

const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    // ต้องอยู่หลัง Tailwind — ดู postcss/zoom-viewport.cjs
    // (path เต็ม: Turbopack รันไฟล์นี้จาก .next/ ทาง relative `./` จึงหาไม่เจอ)
    [path.join(process.cwd(), "postcss", "zoom-viewport.cjs")]: {},
  },
};

export default config;
