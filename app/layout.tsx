import type { Metadata } from "next";
import { DM_Sans, Playfair_Display, JetBrains_Mono, Noto_Serif_SC, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "700", "900"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

/* 中文衬线 — 标题用，与 Playfair Display 配对 */
const notoSerifSC = Noto_Serif_SC({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "700", "900"],
  variable: "--font-cn-serif",
});

/* 中文黑体 — 正文用，与 DM Sans 配对 */
const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "700"],
  variable: "--font-cn-sans",
});

export const metadata: Metadata = {
  title: "PC Signals",
  description: "PC 游戏行业数据周报",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${dmSans.variable} ${playfair.variable} ${jetbrainsMono.variable} ${notoSerifSC.variable} ${notoSansSC.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
