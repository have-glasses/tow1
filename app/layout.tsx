import type { Metadata, Viewport } from "next";
import ServiceWorkerRegistration from "@/components/ServiceWorkerRegistration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tow1",
  description: "Tow1, 属于你的私人文件空间",
  applicationName: "Tow1",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Tow1",
    statusBarStyle: "default"
  },
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  themeColor: "#276b4e"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('tow1:theme');if(['forest','ocean','violet','sand'].includes(t))document.documentElement.dataset.theme=t}catch(e){}})()` }} />
      </head>
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
