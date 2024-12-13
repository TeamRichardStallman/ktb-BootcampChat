const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

let io;

const RoomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  hasPassword: {
    type: Boolean,
    default: false,
  },
  password: {
    type: String,
    select: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
});

// 비밀번호 해싱 미들웨어
RoomSchema.pre("save", async function (next) {
  try {
    // 비밀번호 해싱 로직
    if (this.isModified("password") && this.password) {
      const salt = await bcrypt.genSalt(10);
      this.password = await bcrypt.hash(this.password, salt);
      this.hasPassword = true;
    } else {
      this.hasPassword = false;
    }

    await redisClient.deletePattern("chatRooms:*");
    next();
  } catch (error) {
    console.error("RoomSchema pre-save error:", error);
    next(error);
  }
});

// 비밀번호 확인 메서드
RoomSchema.methods.checkPassword = async function (password) {
  if (!this.hasPassword) return true;
  const room = await this.constructor.findById(this._id).select("+password");
  return await bcrypt.compare(password, room.password);
};

// ✅ 참가자 변경 시 캐시 삭제 (미들웨어)
RoomSchema.post("findOneAndUpdate", async function (doc) {
  try {
    await redisClient.deletePattern("chatRooms:*");

    if (io && doc) {
      io.to(doc._id.toString()).emit("roomUpdate", doc);
    }
    console.log("Redis 캐시 삭제: 채팅방 업데이트됨");
  } catch (error) {
    console.error("캐시 삭제 오류:", error);
  }
});

// ✅ 방 삭제 시 캐시 삭제 - 실제로 사용되지는 않음
RoomSchema.post("findOneAndRemove", async function (doc) {
  try {
    await redisClient.deletePattern("chatRooms:*");

    if (io && doc) {
      io.to(doc._id.toString()).emit("roomRemoved", doc._id.toString());
    }
    console.log("Redis 캐시 삭제: 채팅방 삭제됨");
  } catch (error) {
    console.error("캐시 삭제 오류:", error);
  }
});

// module.exports = mongoose.model("Room", RoomSchema);
// 복합 인덱스 설정
RoomSchema.index({ participants: 1 });
RoomSchema.index({ createdAt: -1 });

module.exports = (socketIO) => {
  io = socketIO;
  return mongoose.model("Room", RoomSchema);
};
