// backend/workers/startWorker.js
const Worker = require("./worker");
const fileProcessingHandler = require("./handlers/fileProcessingHandler");
const aiRequestHandler = require("./handlers/aiRequestHandler");

async function startWorker() {
  const worker = new Worker({
    streamKey: process.env.REDIS_STREAM_KEY,
    groupName: process.env.REDIS_GROUP_NAME,
    consumerName: process.env.REDIS_CONSUMER_NAME,
  });

  // 핸들러 등록
  worker.registerHandler("file-processing", fileProcessingHandler);
  worker.registerHandler("ai-request", aiRequestHandler);

  // 종료 시그널 처리
  process.on("SIGTERM", async () => {
    console.log("Received SIGTERM signal");
    await worker.stop();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    console.log("Received SIGINT signal");
    await worker.stop();
    process.exit(0);
  });

  // Worker 시작
  await worker.start();
}

startWorker().catch((error) => {
  console.error("Fatal worker error:", error);
  process.exit(1);
});
