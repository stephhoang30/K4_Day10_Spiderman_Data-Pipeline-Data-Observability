import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Data Pipeline & Observability — VinUni K4 Day 10",
  description:
    "Dashboard đọc trực tiếp artifact của pipeline crawl → clean → index → evaluate → observe → corrupt → repair → compare.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-canvas text-ink">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-7xl px-4 py-4 text-xs text-ink-faint sm:px-6 lg:px-8">
            Frontend đọc artifact qua{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">
              src/lib/api.ts
            </code>
            . Đổi{" "}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono">
              NEXT_PUBLIC_API_BASE_URL
            </code>{" "}
            để trỏ sang backend Python khi nó có HTTP.
          </div>
        </footer>
      </body>
    </html>
  );
}
