import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Challenge ATOM Conversation AI",
  description: "高齢者向けのやさしい会話AIプロトタイプ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
