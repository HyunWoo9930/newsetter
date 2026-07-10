import type { NextAuthOptions } from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/activity";

export const authOptions: NextAuthOptions = {
  providers: [
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID ?? "",
      clientSecret: process.env.KAKAO_CLIENT_SECRET ?? "",
    }),
  ],
  // 카카오 취소/실패 시 next-auth 기본 영어 페이지 대신 앱(/)으로 돌려보냄. 앱이 ?error= 를 읽어 안내.
  pages: { signIn: "/", error: "/" },
  session: { strategy: "jwt" },
  callbacks: {
    // 카카오 로그인 시 User 레코드를 upsert 하고 우리 내부 id를 토큰에 심는다.
    async jwt({ token, account, profile }) {
      if (account?.provider === "kakao" && profile) {
        const kakaoId = String((profile as { id: number | string }).id);
        const kakaoProfile = profile as {
          properties?: { nickname?: string; profile_image?: string };
        };
        // 신규 가입인지(=이 kakaoId 가 처음인지) 판별해 signup/login 을 구분 기록.
        const existing = await prisma.user.findUnique({ where: { kakaoId }, select: { id: true } });
        const user = await prisma.user.upsert({
          where: { kakaoId },
          update: {},
          create: {
            kakaoId,
            nickname: kakaoProfile.properties?.nickname ?? "클라이머",
            profileImg: kakaoProfile.properties?.profile_image ?? null,
          },
        });
        token.userId = user.id;
        await logEvent(existing ? "login" : "signup", {
          userId: user.id,
          meta: { nickname: kakaoProfile.properties?.nickname ?? "클라이머" },
        });
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        (session.user as { id?: string }).id = token.userId as string;
      }
      return session;
    },
  },
};
