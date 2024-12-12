// backend/utils/redisClient.js
const Redis = require("redis");
const { redisHost, redisPort } = require("../config/keys");

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000;
  }

  async connect() {
    if (this.isConnected && this.client) {
      return this.client;
    }

    try {
      console.log("Connecting to Redis...");

      this.client = Redis.createClient({
        url: `redis://${redisHost}:${redisPort}`,
        socket: {
          host: redisHost,
          port: redisPort,
          reconnectStrategy: (retries) => {
            if (retries > this.maxRetries) {
              return null;
            }
            return Math.min(retries * 50, 2000);
          },
        },
      });

      this.client.on("connect", () => {
        console.log("Redis Client Connected");
        this.isConnected = true;
        this.connectionAttempts = 0;
      });

      this.client.on("error", (err) => {
        console.error("Redis Client Error:", err);
        this.isConnected = false;
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      console.error("Redis connection error:", error);
      this.isConnected = false;
      this.retryConnection();
      throw error;
    }
  }

  async set(key, value, options = {}) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      let stringValue;
      if (typeof value === "object") {
        stringValue = JSON.stringify(value);
      } else {
        stringValue = String(value);
      }

      if (options.ttl) {
        return await this.client.setEx(key, options.ttl, stringValue);
      }
      return await this.client.set(key, stringValue);
    } catch (error) {
      console.error("Redis set error:", error);
      throw error;
    }
  }

  async get(key) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const value = await this.client.get(key);
      if (!value) return null;

      try {
        return JSON.parse(value);
      } catch (parseError) {
        return value; // 일반 문자열인 경우 그대로 반환
      }
    } catch (error) {
      console.error("Redis get error:", error);
      throw error;
    }
  }

  async setEx(key, seconds, value) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      let stringValue;
      if (typeof value === "object") {
        stringValue = JSON.stringify(value);
      } else {
        stringValue = String(value);
      }

      return await this.client.setEx(key, seconds, stringValue);
    } catch (error) {
      console.error("Redis setEx error:", error);
      throw error;
    }
  }

  async del(key) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      return await this.client.del(key);
    } catch (error) {
      console.error("Redis del error:", error);
      throw error;
    }
  }

  async expire(key, seconds) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      return await this.client.expire(key, seconds);
    } catch (error) {
      console.error("Redis expire error:", error);
      throw error;
    }
  }

  async quit() {
    if (this.client) {
      try {
        await this.client.quit();
        this.isConnected = false;
        this.client = null;
        console.log("Redis connection closed successfully");
      } catch (error) {
        console.error("Redis quit error:", error);
        throw error;
      }
    }
  }

  async xadd(stream, id, fields) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      // fields를 [key1, value1, key2, value2, ...] 형태로 변환
      const entries = Object.entries(fields).flat();
      return await this.client.xAdd(stream, id, entries);
    } catch (error) {
      console.error("Redis xadd error:", error);
      throw error;
    }
  }

  async xread(key, id, count = 1) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      return await this.client.xRead({
        key,
        id,
        count,
      });
    } catch (error) {
      console.error("Redis xread error:", error);
      throw error;
    }
  }

  async xgroup(command, stream, groupName, id) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      if (command.toLowerCase() === "create") {
        try {
          return await this.client.xGroupCreate(stream, groupName, id, {
            MKSTREAM: true,
          });
        } catch (err) {
          // BUSYGROUP 에러는 이미 그룹이 존재한다는 의미이므로 무시
          if (err.message.includes("BUSYGROUP")) {
            return "OK";
          }
          throw err;
        }
      }
      throw new Error(`Unsupported xgroup command: ${command}`);
    } catch (error) {
      console.error("Redis xgroup error:", error);
      throw error;
    }
  }

  async xreadgroup(options) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      const { group, consumer, streams, count = 1, block = 2000 } = options;

      return await this.client.xReadGroup(group, consumer, streams, {
        COUNT: count,
        BLOCK: block,
      });
    } catch (error) {
      console.error("Redis xreadgroup error:", error);
      throw error;
    }
  }

  async xack(stream, group, id) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      return await this.client.xAck(stream, group, id);
    } catch (error) {
      console.error("Redis xack error:", error);
      throw error;
    }
  }

  async xpending(stream, group) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      return await this.client.xPending(stream, group);
    } catch (error) {
      console.error("Redis xpending error:", error);
      throw error;
    }
  }

  async xclaim(stream, group, consumer, minIdleTime, id, options = {}) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      return await this.client.xClaim(
        stream,
        group,
        consumer,
        minIdleTime,
        id,
        options
      );
    } catch (error) {
      console.error("Redis xclaim error:", error);
      throw error;
    }
  }

  async addTask(streamKey, taskType, taskData) {
    try {
      const task = {
        type: taskType,
        data: JSON.stringify(taskData),
        timestamp: Date.now().toString(),
      };

      return await this.xadd(streamKey, "*", task);
    } catch (error) {
      console.error("Add task error:", error);
      throw error;
    }
  }

  async getStreamInfo(streamKey) {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      return await this.client.xInfo("STREAM", streamKey);
    } catch (error) {
      console.error("Get stream info error:", error);
      throw error;
    }
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;
