"use client"

/**
 * แทน `signOut()` ของระบบล็อกอินเดิม — ออกจากระบบด้วย session ของ hr (`POST /api/auth/logout`)
 * แล้วโหลดหน้าล็อกอินของ hr (`/`) ใหม่ทั้งหน้า ทิ้งแคช Router ของผู้ใช้เดิม
 */
export async function partnerSignOut(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" })
  } finally {
    window.location.replace("/")
  }
}
