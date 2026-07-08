import type { NextAuthOptions } from "next-auth";
import KakaoProvider from "next-auth/providers/kakao";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  providers: [
    KakaoProvider({
      clientId: process.env.KAKAO_CLIENT_ID ?? "",
      clientSecret: process.env.KAKAO_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // 카카오 로그인 시 User 레코드를 upsert 하고 우리 내부 id를 토큰에 심는다.
    async jwt({ token, account, profile }) {
      if (account?.provider === "kakao" && profile) {
        const kakaoId = String((profile as { id: number | string }).id);
        const kakaoProfile = profile as {
          properties?: { nickname?: string; profile_image?: string };
        };
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
