import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

export function json<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export const unauthorized = () => error("로그인이 필요합니다", 401);
export const forbidden = () => error("권한이 없습니다", 403);
export const notFound = (what = "리소스") => error(`${what}를 찾을 수 없습니다`, 404);
export const tooMany = (msg = "요청이 너무 많아요. 잠시 후 다시 시도해주세요") => error(msg, 429);

/** 요청 body를 zod 스키마로 파싱. 실패 시 {ok:false, response} 반환. */
export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  try {
    const body = await req.json();
    const data = schema.parse(body);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ZodError) {
      return { ok: false, response: error(e.issues[0]?.message ?? "잘못된 요청입니다", 422) };
    }
    return { ok: false, response: error("잘못된 요청 형식입니다", 400) };
  }
}

/** 초대 코드 생성: CREW-XXXX (대문자+숫자) */
export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `CREW-${s}`;
}
