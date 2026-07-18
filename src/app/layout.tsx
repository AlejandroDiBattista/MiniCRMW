import type { Metadata, Viewport } from "next"
import { DM_Sans, Geist_Mono, Newsreader } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import "./globals.css"

const dmSans = DM_Sans({ variable: "--font-dm-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Lazo — Mini CRM con WhatsApp",
  description: "Gestión de clientes, historial de contactos y conversaciones de WhatsApp en un solo lugar.",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning className={`${dmSans.variable} ${geistMono.variable} ${newsreader.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
