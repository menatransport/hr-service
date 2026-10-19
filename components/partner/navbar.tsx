/* eslint-disable react-hooks/set-state-in-effect -- โค้ดเดิมจาก mena-partner-driver ย้ายมาโดยไม่แก้ตรรกะ (scripts/partner-codemod/lint-legacy-disable.mjs) */
"use client"

import { useEffect, useState } from "react"
import { usePartnerSession } from "@/lib/partner/auth/client"
import { partnerSignOut } from "@/components/partner/sign-out"
import { LogOut, Sun, Moon, Search } from "lucide-react"
import { Button } from "@/components/partner/ui/button"

export function Navbar() {
  const { data: session }     = usePartnerSession()
  const [isDark, setIsDark]   = useState(false)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"))
  }, [])

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle("dark", next)
    try { localStorage.setItem("theme", next ? "dark" : "light") } catch {}
  }

  return (
    <header className="flex items-center justify-end gap-2 h-11 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shrink-0">
      <button
        onClick={() => window.dispatchEvent(new CustomEvent("open-command-palette"))}
        className="mr-auto flex items-center gap-2 h-7 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs"
        title="ค้นหาเมนู (⌘K)"
        aria-label="ค้นหาเมนู"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">ค้นหาเมนู</span>
        <kbd className="text-[10px] border border-zinc-200 dark:border-zinc-700 rounded px-1 py-px">⌘K</kbd>
      </button>
      {session?.user && (
        <span className="text-[11px] text-zinc-400 mr-1 hidden sm:block truncate max-w-[180px]">
          {session.user.email ?? session.user.name}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleTheme}
        className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        title={isDark ? "สลับโหมดสว่าง" : "สลับโหมดมืด"}
        aria-label={isDark ? "สลับโหมดสว่าง" : "สลับโหมดมืด"}
      >
        {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => partnerSignOut()}
        className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        title="ออกจากระบบ"
        aria-label="ออกจากระบบ"
      >
        <LogOut className="w-3.5 h-3.5" />
      </Button>
    </header>
  )
}
