require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const socketIO = require("socket.io");
const path = require("path");
const { router: roomsRouter, initializeSocket } = require("./routes/api/rooms");
const routes = require("./routes");
const { collectDefaultMetrics, register, Counter, Histogram } = require('prom-client');
const apiMetrics = require('prometheus-api-metrics');
const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;
const cluster = require('cluster');
const os = require('os');

// trust proxy 설정 추가
app.set("trust proxy", 1);

// CORS 설정
const corsOptions = {
  // origin: [
  //   "https://bootcampchat-fe.run.goorm.site",
  //   "http://localhost:3000",
  //   "https://localhost:3000",
  //   "http://0.0.0.0:3000",
  //   "https://0.0.0.0:3000",
  // ],
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-auth-token",
    "x-session-id",
    "Cache-Control",
    "Pragma",
  ],
  exposedHeaders: ["x-auth-token", "x-session-id"],
};

// 기본 미들웨어
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OPTIONS 요청에 대한 처리
app.options("*", cors(corsOptions));

// 정적 파일 제공
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// 요청 로깅
if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
    );
    next();
  });
}

// 기본 상태 체크
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

function promTotalRequests(register, app) {
  const requestsCounter = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
  });

  app.use((_, __, next) => {
    requestsCounter.inc();
    next();
  });

  register.registerMetric(requestsCounter);
}

function promRequestLatency(register, app) {
  const requestsDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    buckets: [0.1, 0.2, 0.5, 1, 2, 5],
  });

  app.use((_, res, next) => {
    const start = process.hrtime();

    res.on('finish', () => {
      const duration = process.hrtime(start);
      const durationInSeconds = duration[0] + duration[1] / 1e9;
      requestsDuration.observe(durationInSeconds);
    });

    next();
  });
  register.registerMetric(requestsDuration);
}

// collectDefaultMetrics();
app.use(apiMetrics())
// app.get('/metrics', async (_req, res) => {
//   try {
//     res.set('Content-Type', register.contentType);
//     res.end(await register.metrics());
//   } catch (err) {
//     res.status(500).end(err);
//   }
// });


// API 라우트 마운트
app.use("/api", routes);

// Socket.IO 설정
const io = socketIO(server, { cors: corsOptions });
require("./sockets/chat")(io);

// Socket.IO 객체 전달
initializeSocket(io);

// 404 에러 핸들러
app.use((req, res) => {
  console.log("404 Error:", req.originalUrl);
  res.status(404).json({
    success: false,
    message: "요청하신 리소스를 찾을 수 없습니다.",
    path: req.originalUrl,
  });
});

// 글로벌 에러 핸들러
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "서버 에러가 발생했습니다.",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});


if (cluster.isMaster) {
  const numCPUs = os.cpus().length;

  console.log(`Master ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
  });
} else {
  // Workers can share any TCP connection
  // In this case it is an HTTP server
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      console.log("MongoDB Connected");
      server.listen(PORT, "0.0.0.0", () => {
        console.log(`Worker ${process.pid} running on port ${PORT}`);
        console.log("Environment:", process.env.NODE_ENV);
        console.log("API Base URL:", `http://0.0.0.0:${PORT}/api`);
      });
    })
    .catch((err) => {
      console.error("Server startup error:", err);
      process.exit(1);
    });
}


module.exports = { 
  app, 
  server,
  promTotalRequests,
  promRequestLatency 
};
