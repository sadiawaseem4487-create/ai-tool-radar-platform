import type { Metadata } from "next";
import { Newsreader, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const newsreader = Newsreader({
  variable: "--font-news",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const sourceSans = Source_Sans_3({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AI Tool Radar — Daily AI News Desk",
  description:
    "Latest AI tools, research, and trending signals — a production news desk for the AI lab.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${sourceSans.variable} h-full antialiased`}
    >
      <body className="news-desk min-h-full flex flex-col font-[family-name:var(--font-ui)] text-[var(--ink)]">
        {children}
      </body>
    </html>
  );
}
