# Node.js 공식 이미지를 베이스로 사용
FROM node:18

# 작업 디렉토리 생성
WORKDIR /usr/src/app

# package.json과 package-lock.json 복사
COPY package*.json ./

# 의존성 설치
RUN npm install

# 소스 코드 복사
COPY . .

# 애플리케이션이 사용할 포트
EXPOSE 5000

# 애플리케이션 실행
CMD [ "node", "server.js" ]