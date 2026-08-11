"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

export type Theme = "light" | "dark" | "system"

type ThemeProviderProps = {
  children: React.ReactNode
  attribute?: "class" | `data-${string}`
  defaultTheme?: Theme
  enableSystem?: boolean
  storageKey?: string
  disableTransitionOnChange?: boolean
}

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: "light" | "dark"
  systemTheme: "light" | "dark"
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolvedTheme: "light",
  systemTheme: "light",
  setTheme: () => undefined,
})

function readSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolveTheme(theme: Theme, systemTheme: "light" | "dark", enableSystem: boolean) {
  return theme === "system" && enableSystem ? systemTheme : theme === "dark" ? "dark" : "light"
}

function applyTheme(
  theme: Theme,
  systemTheme: "light" | "dark",
  attribute: "class" | `data-${string}`,
  enableSystem: boolean,
  disableTransitionOnChange: boolean,
) {
  const resolved = resolveTheme(theme, systemTheme, enableSystem)
  const root = document.documentElement
  const transitionStyle = disableTransitionOnChange ? document.createElement("style") : null

  if (transitionStyle) {
    transitionStyle.appendChild(document.createTextNode("*,*::before,*::after{transition:none!important}"))
    document.head.appendChild(transitionStyle)
  }

  if (attribute === "class") {
    root.classList.remove("light", "dark")
    root.classList.add(resolved)
  } else {
    root.setAttribute(attribute, resolved)
  }
  root.style.colorScheme = resolved

  if (transitionStyle) {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => transitionStyle.remove())
    })
  }
}

export function ThemeProvider({
  children,
  attribute = "data-theme",
  defaultTheme = "system",
  enableSystem = true,
  storageKey = "theme",
  disableTransitionOnChange = false,
}: ThemeProviderProps) {
  const [theme, setThemeValue] = useState<Theme>(defaultTheme)
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light")

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => setSystemTheme(readSystemTheme())
    let active = true
    queueMicrotask(() => {
      if (!active) return
      let stored: string | null = null
      try {
        stored = window.localStorage.getItem(storageKey)
      } catch {
        // Algunos navegadores bloquean localStorage en modo privado.
      }
      if (stored === "light" || stored === "dark" || stored === "system") setThemeValue(stored)
      setSystemTheme(readSystemTheme())
    })
    media.addEventListener("change", handleChange)
    return () => {
      active = false
      media.removeEventListener("change", handleChange)
    }
  }, [storageKey])

  useEffect(() => {
    applyTheme(theme, systemTheme, attribute, enableSystem, disableTransitionOnChange)
  }, [attribute, disableTransitionOnChange, enableSystem, systemTheme, theme])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return
      const nextTheme = event.newValue
      if (nextTheme === "light" || nextTheme === "dark" || nextTheme === "system") setThemeValue(nextTheme)
      else if (nextTheme === null) setThemeValue(defaultTheme)
    }
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [defaultTheme, storageKey])

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeValue(nextTheme)
    try {
      window.localStorage.setItem(storageKey, nextTheme)
    } catch {
      // El tema sigue funcionando aunque el navegador no permita persistirlo.
    }
  }, [storageKey])

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    resolvedTheme: resolveTheme(theme, systemTheme, enableSystem),
    systemTheme,
    setTheme,
  }), [enableSystem, setTheme, systemTheme, theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
