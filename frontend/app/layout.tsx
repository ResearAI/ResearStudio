import type React from "react"
import type { Metadata } from "next"
import { Inter, Source_Serif_4, Noto_Sans_SC, Ma_Shan_Zheng } from "next/font/google"
import "./globals.css"
// 暂时注释掉SmoothScroller以修复滚屏问题
// import SmoothScroller from "@/components/smooth-scroller"

const inter = Inter({ 
  subsets: ["latin"],
  variable: '--font-inter',
})

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["300", "400", "600"],
  variable: '--font-source-serif',
})

const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: '--font-noto-sans-sc',
})

const maShanZheng = Ma_Shan_Zheng({
  subsets: ["latin"],
  weight: ["400"],
  variable: '--font-ma-shan-zheng',
})

export const metadata: Metadata = {
  title: "ResearStudio | Collaborative AI Workshop",
  description: "Beyond automation. Welcome to the collaborative workshop where human expertise and AI potential converge.",
  generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className={`${inter.variable} ${sourceSerif.variable} ${notoSansSC.variable} ${maShanZheng.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}