import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { FONT_SIZE_INIT_SCRIPT } from "@/lib/fontSize";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Internal Chat",
  description: "Self-hosted internal chat tool",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Internal Chat",
  },
};

export const viewport: Viewport = {
  themeColor: "#070a08",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <Script id="font-size-init" strategy="beforeInteractive">
          {FONT_SIZE_INIT_SCRIPT}
        </Script>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
