# NewSetter 프로덕션 이미지 (Next standalone). 무중단 배포용 불변 이미지.
# 단일 노드 k3s: 빌드 후 containerd 로 import, imagePullPolicy: Never 로 사용.

FROM node:24-alpine AS deps
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY prisma ./prisma
RUN npx prisma generate

FROM node:24-alpine AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=2048
# NEXT_PUBLIC_* 는 빌드 타임에 인라인 → build-arg 로 주입
ARG NEXT_PUBLIC_KAKAO_ENABLED
ARG NEXT_PUBLIC_KAKAO_JS_KEY
ARG NEXT_PUBLIC_NAVER_MAP_CLIENT_ID
ARG NEXTAUTH_URL
ENV NEXT_PUBLIC_KAKAO_ENABLED=$NEXT_PUBLIC_KAKAO_ENABLED \
    NEXT_PUBLIC_KAKAO_JS_KEY=$NEXT_PUBLIC_KAKAO_JS_KEY \
    NEXT_PUBLIC_NAVER_MAP_CLIENT_ID=$NEXT_PUBLIC_NAVER_MAP_CLIENT_ID \
    NEXTAUTH_URL=$NEXTAUTH_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN apk add --no-cache openssl libc6-compat && addgroup -g 1001 app && adduser -u 1001 -G app -S app
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Prisma 쿼리 엔진(standalone 트레이싱에서 빠질 수 있어 명시 복사)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
USER app
EXPOSE 3000
CMD ["node", "server.js"]
