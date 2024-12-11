// backend/workers/worker.js
const redisClient = require("../utils/redisClient");

class Worker {
  constructor(options = {}) {
    console.log("Worker instance created with options:", options);
    this.streamKey =
      process.env.REDIS_STREAM_KEY || options.streamKey || "tasks:queue";
    this.groupName =
      process.env.REDIS_GROUP_NAME || options.groupName || "workers-group";
    this.consumerName =
      process.env.REDIS_CONSUMER_NAME ||
      options.consumerName ||
      `worker-${process.pid}`;
    this.handlers = new Map();
    this.running = false;
  }

  registerHandler(taskType, handler) {
    console.log(`Registering handler for task type: ${taskType}`);
    this.handlers.set(taskType, handler);
  }

  async processTask(taskId, taskData) {
    try {
      const task = {
        type: taskData.type,
        data: JSON.parse(taskData.data),
        timestamp: parseInt(taskData.timestamp),
      };

      const handler = this.handlers.get(task.type);
      if (!handler) {
        console.error(`No handler registered for task type: ${task.type}`);
        // 핸들러가 없는 경우에도 작업을 완료 처리 (큐에서 제거)
        await redisClient.xack(this.streamKey, this.groupName, taskId);
        return;
      }

      console.log(`Processing task ${taskId} of type ${task.type}`, task.data);
      await handler(task.data);
      await redisClient.xack(this.streamKey, this.groupName, taskId);
      console.log(`Task ${taskId} completed successfully`);
    } catch (error) {
      console.error(`Error processing task ${taskId}:`, error);
      // 에러 발생 시 재시도 로직 추가 가능
      if (!error.message.includes("Connection closed")) {
        await redisClient.xack(this.streamKey, this.groupName, taskId);
      }
    }
  }

  async initialize() {
    try {
      if (!redisClient.isConnected) {
        await redisClient.connect();
      }

      // 컨슈머 그룹 생성
      try {
        await redisClient.xgroup("create", this.streamKey, this.groupName, "0");
        console.log(
          `Created consumer group ${this.groupName} for stream ${this.streamKey}`
        );
      } catch (err) {
        if (!err.message.includes("BUSYGROUP")) {
          throw err;
        }
        console.log(`Consumer group ${this.groupName} already exists`);
      }

      console.log(`Worker ${this.consumerName} initialized successfully`);
    } catch (error) {
      console.error("Worker initialization error:", error);
      throw error;
    }
  }

  async start() {
    try {
      await this.initialize();
      this.running = true;
      console.log(`Worker ${this.consumerName} started`);

      while (this.running) {
        try {
          const streams = {
            key: this.streamKey,
            id: ">", // 새로운 메시지만 읽기
          };

          const response = await redisClient.xreadgroup({
            group: this.groupName,
            consumer: this.consumerName,
            streams: [streams],
            count: 1,
            block: 5000,
          });

          if (response) {
            for (const [, messages] of response) {
              for (const [messageId, fields] of messages) {
                const taskData = {};
                for (let i = 0; i < fields.length; i += 2) {
                  taskData[fields[i]] = fields[i + 1];
                }
                await this.processTask(messageId, taskData);
              }
            }
          }
        } catch (error) {
          if (error.message.includes("Connection closed")) {
            console.error("Redis connection lost, attempting to reconnect...");
            await this.initialize();
          } else {
            console.error("Error in worker loop:", error);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }
    } catch (error) {
      console.error("Worker start error:", error);
      throw error;
    }
  }

  async stop() {
    this.running = false;
    console.log(`Worker ${this.consumerName} stopping...`);
  }
}

module.exports = Worker;

// 워커 시작
if (require.main === module) {
  console.log("Starting worker process...");
  const worker = new Worker({
    streamKey: "tasks:queue",
    groupName: "workers-group",
    consumerName: `worker-${process.pid}`,
  });

  // 기본 핸들러 등록
  worker.registerHandler("example", async (data) => {
    console.log("Processing example task:", data);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log("Example task completed");
  });

  worker.registerHandler("file-processing", async (data) => {
    console.log("Processing file task:", data);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log("File processing completed");
  });

  worker.registerHandler("ai-request", async (data) => {
    console.log("Processing AI request:", data);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    console.log("AI request completed");
  });

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
  worker.start().catch((error) => {
    console.error("Fatal worker error:", error);
    process.exit(1);
  });
}
