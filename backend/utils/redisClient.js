const Redis = require("redis");
const { redisHost, redisPort } = require("../config/keys");

class RedisClient {
  constructor() {
    this.client = Redis.createClient({
      url: `redis://${redisHost}:${redisPort}`,
      socket: {
        reconnectStrategy: (retries) => {
          console.error(`Redis reconnect attempt #${retries}`);
          if (retries > 5) {
            console.error("Max Redis reconnect attempts reached.");
            return null;
          }
          const retryInterval = Math.min(retries * 100, 5000); // 최대 5초 대기
          console.log(`Retrying Redis connection in ${retryInterval}ms...`);
          return retryInterval;
        },
      },
      lazyConnect: true,
    });

    this.isConnected = false;
    this._registerEventListeners();
  }

  _registerEventListeners() {
    this.client.on("connect", () => {
      console.log("Redis Client Connected");
      this.isConnected = true;
    });

    this.client.on("error", (err) => {
      console.error("Redis Client Error:", err);
      this.isConnected = false;

      if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
        console.error("Critical Redis Error: Shutting down process.");
        process.exit(1);
      }
    });

    this.client.on("end", () => {
      console.log("Redis Client Disconnected");
      this.isConnected = false;
    });
  }

  async connect() {
    if (this.isConnected) {
      return;
    }
    try {
      console.log("Connecting to Redis...");
      await this.client.connect();
    } catch (error) {
      console.error("Redis connection failed:", error);
      throw error;
    }
  }

  async set(key, value, options = {}) {
    await this.connect();
    try {
      const stringValue =
        typeof value === "object" ? JSON.stringify(value) : String(value);

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
    await this.connect();
    try {
      const value = await this.client.get(key);
      if (!value) return null;

      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      console.error("Redis get error:", error);
      throw error;
    }
  }

  async del(key) {
    await this.connect();
    try {
      return await this.client.del(key);
    } catch (error) {
      console.error("Redis del error:", error);
      throw error;
    }
  }

  async setEx(key, seconds, value) {
    await this.connect();
    try {
      const stringValue =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      return await this.client.setEx(key, seconds, stringValue);
    } catch (error) {
      console.error("Redis setEx error:", error);
      throw error;
    }
  }

  async expire(key, seconds) {
    await this.connect();
    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      console.error("Redis expire error:", error);
      throw error;
    }
  }

  // Redis 키 패턴 삭제 로직 추가
  async deletePattern(pattern) {
    await this.connect();
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length) {
        return await this.client.del(...keys);
      }
      return 0; // 삭제된 키가 없을 경우
    } catch (error) {
      console.error("Redis deletePattern error:", error);
      throw error;
    }
  }

  async quit() {
    if (this.client && this.isConnected) {
      try {
        await this.client.quit();
        console.log("Redis connection closed successfully");
        this.isConnected = false;
      } catch (error) {
        console.error("Redis quit error:", error);
        throw error;
      }
    }
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;
