"use client"

import { useState, useEffect } from "react"

type ConfirmOpts = { title: string; description?: string; confirmText?: string; cancelText?: string; danger?: boolean }
type PromptOpts = ConfirmOpts & { placeholder?: string; defaultValue?: string }
type State =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void }
  | null

// โฮสต์เดียวที่ mount ใน layout — เรียก confirm()/prompt() ได้จากที่ไหนก็ได้ (แบบเดียวกับ toast)
let _open: ((s: NonNullable<State>) => void) | null = null

/** แทน window.confirm — รับ string (ถามลบ/danger) หรือ options: await confirm("ลบ?") | await confirm({ title, danger }) */
export function confirm(optsOrTitle: string | ConfirmOpts): Promise<boolean> {
  const opts: ConfirmOpts = typeof optsOrTitle === "string" ? { title: optsOrTitle, danger: true } : optsOrTitle
  return new Promise((resolve) => {
    if (_open) _open({ kind: "confirm", opts, resolve })
    else resolve(typeof window !== "undefined" ? window.confirm(opts.title) : false) // fallback ก่อน host mount
  })
}
/** แทน window.prompt — await prompt("หัวข้อ") | await prompt({ title }) (null = ยกเลิก) */
export function prompt(optsOrTitle: string | PromptOpts): Promise<string | null> {
  const opts: PromptOpts = typeof optsOrTitle === "string" ? { title: optsOrTitle } : optsOrTitle
  return new Promise((resolve) => {
    if (_open) _open({ kind: "prompt", opts, resolve })
    else resolve(typeof window !== "undefined" ? window.prompt(opts.title, opts.defaultValue ?? "") : null)
  })
}

export function ConfirmHost() {
  const [state, setState] = useState<State>(null)
  const [text, setText] = useState("")

  useEffect(() => {
    _open = (s) => { if (s.kind === "prompt") setText(s.opts.defaultValue ?? ""); setState(s) }
    return () => { _open = null }
  }, [])

  const cancelVal = state?.kind === "prompt" ? null : false
  const settle = (val: boolean | string | null) => {
    if (state) (state.resolve as (v: unknown) => void)(val)
    setState(null); setText("")
  }
  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (state) (state.resolve as (v: unknown) => void)(cancelVal); setState(null); setText("") } }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [state, cancelVal])

  if (!state) return null
  const o = state.opts
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[1px]" onClick={() => settle(cancelVal)}>
      <div role="dialog" aria-modal="true" aria-label={o.title} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-xl p-5">
        <h2 className="text-base font-bold text-zinc-800 dark:text-zinc-100">{o.title}</h2>
        {o.description && <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1.5 whitespace-pre-line">{o.description}</p>}
        {state.kind === "prompt" && (
          // eslint-disable-next-line jsx-a11y/no-autofocus
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={(o as PromptOpts).placeholder}
            onKeyDown={(e) => { if (e.key === "Enter") settle(text.trim() || null) }}
            className="mt-3 w-full h-10 text-sm rounded-lg px-3 border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100" />
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => settle(cancelVal)} className="px-4 py-2 text-sm rounded-lg text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800">{o.cancelText ?? "ยกเลิก"}</button>
          <button onClick={() => settle(state.kind === "confirm" ? true : (text.trim() || null))}
            className={`px-4 py-2 text-sm font-semibold rounded-lg text-white ${o.danger ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
            {o.confirmText ?? "ยืนยัน"}
          </button>
        </div>
      </div>
    </div>
  )
}
