// backend/services/taskQueue.js
const redisClient = require("../utils/redisClient");

class TaskQueue {
  constructor(streamKey = "tasks:queue") {
    this.streamKey = streamKey;
  }

  async addTask(type, data) {
    try {
      // Redis Stream에 task 추가
      const taskId = await redisClient.xadd(
        this.streamKey,
        "*", // 자동 ID 생성
        {
          type,
          data: JSON.stringify(data),
          timestamp: Date.now().toString(),
        }
      );

      console.log(`Task added to queue - Type: ${type}, ID: ${taskId}`);
      return taskId;
    } catch (error) {
      console.error("Failed to add task to queue:", error);
      throw error;
    }
  }
}

module.exports = new TaskQueue();
