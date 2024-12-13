const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const Room = require("../../models/Room");
const User = require("../../models/User");
const { rateLimit } = require("express-rate-limit");
// const redisClient = require("../../utils/redisClient");
let io;

const CACHE_TTL = process.env.CACHE_TTL || 120;

// 속도 제한 설정
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: {
    success: false,
    error: {
      message: "너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.",
      code: "TOO_MANY_REQUESTS",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Socket.IO 초기화 함수
const initializeSocket = (socketIO) => {
  io = socketIO;
};

// 서버 상태 확인
router.get("/health", async (req, res) => {
  try {
    const isMongoConnected = require("mongoose").connection.readyState === 1;

    const recentRoom = await Room.findOne()
      .sort({ createdAt: -1 })
      .select("createdAt")
      .lean();

    const start = process.hrtime();
    await Room.findOne().select("_id").lean();
    const [seconds, nanoseconds] = process.hrtime(start);
    const latency = Math.round(seconds * 1000 + nanoseconds / 1000000);

    const isRedisConnected = (await redisClient.ping()) === "PONG";

    const status = {
      success: true,
      timestamp: new Date().toISOString(),
      services: {
        database: { connected: isMongoConnected, latency },
        redis: { connected: isRedisConnected },
      },
      lastActivity: recentRoom?.createdAt,
    };

    res.status(isMongoConnected && isRedisConnected ? 200 : 503).json(status);
  } catch (error) {
    res.status(503).json({
      success: false,
      error: {
        message: "서비스 상태 확인에 실패했습니다.",
        code: "HEALTH_CHECK_FAILED",
      },
    });
  }
});

// 채팅방 목록 조회
router.get("/", [limiter, auth], async (req, res) => {
  try {
    const page = Math.max(0, parseInt(req.query.page) || 0);
    const pageSize = Math.min(
      Math.max(1, parseInt(req.query.pageSize) || 10),
      50
    );
    const skip = page * pageSize;

    const allowedSortFields = ["createdAt", "name", "participantsCount"];
    const sortField = allowedSortFields.includes(req.query.sortField)
      ? req.query.sortField
      : "createdAt";
    const sortOrder = ["asc", "desc"].includes(req.query.sortOrder)
      ? req.query.sortOrder
      : "desc";

    const filter = req.query.search
      ? { name: { $regex: req.query.search, $options: "i" } }
      : {};

    const cacheKey = `chatRooms:${page}:${pageSize}:${sortField}:${sortOrder}:${
      req.query.search || "all"
    }`;

    const cachedData = await redisClient.get(cacheKey);

    if (cachedData) {
      return res.json({ success: true, ...JSON.parse(cachedData) });
    }

    const totalCount = await Room.countDocuments(filter);

    const rooms = await Room.find(filter)
      .populate("creator", "name email")
      .populate("participants", "name email")
      .sort({ [sortField]: sortOrder === "desc" ? -1 : 1 })
      .skip(skip)
      .limit(pageSize)
      .lean();

    const safeRooms = rooms
      .map((room) => {
        if (!room) return null;

        const creator = room.creator || {
          _id: "unknown",
          name: "알 수 없음",
          email: "",
        };
        const participants = Array.isArray(room.participants)
          ? room.participants
          : [];

        return {
          _id: room._id.toString(),
          name: room.name || "제목 없음",
          hasPassword: !!room.hasPassword,
          creator: {
            _id: creator._id.toString(),
            name: creator.name || "알 수 없음",
            email: creator.email || "",
          },
          participants: participants.map((p) => ({
            _id: p._id.toString(),
            name: p.name || "알 수 없음",
            email: p.email || "",
          })),
          participantsCount: participants.length,
          createdAt: room.createdAt || new Date(),
          isCreator: creator._id.toString() === req.user.id,
        };
      })
      .filter(Boolean);

    const totalPages = Math.ceil(totalCount / pageSize);
    const hasMore = skip + rooms.length < totalCount;

    const responseData = {
      data: safeRooms,
      metadata: {
        total: totalCount,
        page,
        pageSize,
        totalPages,
        hasMore,
        currentCount: safeRooms.length,
        sort: { field: sortField, order: sortOrder },
      },
    };

    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(responseData));

    res.json({ success: true, ...responseData });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: "채팅방 목록을 불러오는 데 실패했습니다.",
        code: "ROOMS_FETCH_ERROR",
      },
    });
  }
});

// 방 생성
router.post("/", auth, async (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name?.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "방 이름은 필수입니다." });
    }

    const newRoom = new Room({
      name: name.trim(),
      creator: req.user.id,
      participants: [req.user.id],
      password,
    });

    const savedRoom = await newRoom.save();
    const populatedRoom = await Room.findById(savedRoom._id)
      .populate("creator", "name email")
      .populate("participants", "name email");

    await redisClient.deletePattern("chatRooms:*");

    if (io) {
      io.to("room-list").emit("roomCreated", {
        ...populatedRoom.toObject(),
        password: undefined,
      });
    }

    res
      .status(201)
      .json({
        success: true,
        data: { ...populatedRoom.toObject(), password: undefined },
      });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "서버 에러가 발생했습니다.",
        error: error.message,
      });
  }
});

module.exports = { router, initializeSocket };
