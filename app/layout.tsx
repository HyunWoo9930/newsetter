import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "NewSetter",
  description: "클라이밍 크루 암장 방문 트래킹 & 투표",
};

// maximumScale을 막지 않음 — 저시력 사용자의 핀치줌 허용 (WCAG)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
