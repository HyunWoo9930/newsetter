import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { json, error, unauthorized, parseBody } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { logEvent } from "@/lib/activity";

const schema = z.object({
  category: z.enum(["FEATURE", "BUG", "OTHER"]),
  content: z.string().trim().min(1, "내용을 입력해주세요").max(1000, "1000자 이내로 남겨주세요"),
});

// 개발자에게 문의하기 — 기능 제안 · 버그 제보 · 의견
export async function POST(req: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return unauthorized();

  if (!rateLimit(`fb:${userId}`, 5, 10 * 60 * 1000)) {
    return error("의견이 많아서 좋아요! 조금 있다가 다시 남겨주세요", 429);
  }

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const feedback = await prisma.feedback.create({
    data: { userId, category: parsed.data.category, content: parsed.data.content },
  });
  await logEvent("feedback", { userId, req, meta: { feedbackId: feedback.id, category: parsed.data.category } });
  return json({ ok: true }, 201);
}
