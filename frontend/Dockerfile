# 빌드 스테이지
FROM node:20.10-alpine AS builder

# 작업 디렉토리 설정
WORKDIR /app

COPY .npmrc ./

# 패키지 파일 복사
COPY package*.json ./

ARG GITHUB_TOKEN
ENV GITHUB_TOKEN=$GITHUB_TOKEN

# 의존성 설치 (clean install)
RUN npm ci

# 소스 코드 복사
COPY . .

# 프로덕션 빌드
RUN npm run build

RUN rm -f .npmrc

# 프로덕션 스테이지
FROM node:20.10-alpine AS runner

# 작업 디렉토리 설정
WORKDIR /app

# 필요한 파일만 복사
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# 환경 변수 설정
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 보안 관련 환경 변수들
ENV NEXT_PUBLIC_API_URL=
ENV NEXT_PUBLIC_ENCRYPTION_KEY=
ENV NEXT_PUBLIC_PASSWORD_SALT=

# 포트 설정
EXPOSE 3000

# 실행 명령어
CMD ["npm", "start"]