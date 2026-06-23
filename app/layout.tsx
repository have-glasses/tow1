import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tow1",
  description: "Tow1，属于你的私人文件空间",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
