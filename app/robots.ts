import type { MetadataRoute } from "next"
import { siteUrl } from "@/lib/partner/public-seo"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: ["/trucks", "/og/"],
      disallow: ["/api/partner/", "/partner/admin/", "/login", "/partner/payroll", "/partner/drivers", "/partner/contracts", "/partner/vehicle-cost", "/partner/vehicles", "/partner/quotations", "/partner/reports", "/partner/catalog", "/partner/price-list", "/partner/promotions"],
    }],
    sitemap: siteUrl("/sitemap.xml"),
  }
}
