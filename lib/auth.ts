import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

/**
 * 현재 로그인 유저 id를 반환. 없으면 null.
 * 개발 환경에서는 DEV_USER_ID(.env)로 로그인 없이 API를 테스트할 수 있다.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (id) return id;

  if (process.env.NODE_ENV !== "production" && process.env.DEV_USER_ID) {
    return process.env.DEV_USER_ID;
  }
  return null;
}
