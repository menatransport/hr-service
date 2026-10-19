import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/partner/public-seo"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: ["/trucks", "/og/"],
      // ระบบภายในรถร่วมย้ายมาอยู่ใต้ /partner ทั้งหมด (เดิมไล่ทีละกลุ่ม) · API ทุกตัวไม่ต้องเก็บ
      disallow: ["/api/", "/partner/"],
    }],
    sitemap: siteUrl("/sitemap.xml"),
  }
}
