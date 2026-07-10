import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://setter.ohw.co.kr"),
  title: { default: "뉴세터 · NewSetter", template: "%s · 뉴세터" },
  description: "우리 크루 클라이밍, 한곳에서. 안 되는 날만 X 치면 다 되는 날 자동 완성 · 다음 세션·리뷰·암장 지도까지.",
  applicationName: "뉴세터",
  openGraph: {
    title: "뉴세터 · NewSetter",
    description: "우리 크루 클라이밍, 한곳에서. 날짜 투표(안 되는 날 X)·다음 세션·암장 리뷰까지.",
    url: "https://setter.ohw.co.kr",
    siteName: "뉴세터",
    images: [{ url: "/brand/climbcrew-icon-1024.png", width: 1024, height: 1024 }],
    locale: "ko_KR",
    type: "website",
  },
  twitter: { card: "summary", title: "뉴세터 · NewSetter", description: "우리 크루 클라이밍, 한곳에서." },
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
