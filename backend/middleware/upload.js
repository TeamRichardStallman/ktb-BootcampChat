// backend/middleware/upload.js
const multer = require("multer");
const multerS3 = require("multer-s3");
const path = require("path");
const crypto = require("crypto");
const s3Client = require("../utils/s3Client");

// MIME 타입과 확장자 매핑 (기존 코드 유지)
const ALLOWED_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "video/quicktime": [".mov"],
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/ogg": [".ogg"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
};

// 파일 타입별 크기 제한 설정 (기존 코드 유지)
const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024, // 10MB for images
  video: 50 * 1024 * 1024, // 50MB for videos
  audio: 20 * 1024 * 1024, // 20MB for audio
  document: 20 * 1024 * 1024, // 20MB for documents
};

const getFileType = (mimetype) => {
  const typeMap = {
    image: "이미지",
    video: "동영상",
    audio: "오디오",
    application: "문서",
  };
  const type = mimetype.split("/")[0];
  return typeMap[type] || "파일";
};

const validateFileSize = (file) => {
  const type = file.mimetype.split("/")[0];
  const limit = FILE_SIZE_LIMITS[type] || FILE_SIZE_LIMITS.document;

  if (file.size > limit) {
    const limitInMB = Math.floor(limit / 1024 / 1024);
    throw new Error(
      `${getFileType(
        file.mimetype
      )} 파일은 ${limitInMB}MB를 초과할 수 없습니다.`
    );
  }
  return true;
};

const fileFilter = (req, file, cb) => {
  try {
    // 파일명을 UTF-8로 디코딩
    const originalname = Buffer.from(file.originalname, "binary").toString(
      "utf8"
    );

    // MIME 타입 검증
    if (!ALLOWED_TYPES[file.mimetype]) {
      const fileType = getFileType(file.mimetype);
      return cb(new Error(`지원하지 않는 ${fileType} 형식입니다.`), false);
    }

    // Content-Length 헤더 검증
    const declaredSize = parseInt(req.headers["content-length"]);
    if (declaredSize > 50 * 1024 * 1024) {
      return cb(new Error("파일 크기는 50MB를 초과할 수 없습니다."), false);
    }

    // 파일명 길이 검증
    const filenameBytes = Buffer.from(originalname, "utf8").length;
    if (filenameBytes > 255) {
      return cb(new Error("파일명이 너무 깁니다."), false);
    }

    // 파일 확장자와 MIME 타입 일치 여부 확인
    const ext = path.extname(originalname).toLowerCase();
    if (!ALLOWED_TYPES[file.mimetype].includes(ext)) {
      const fileType = getFileType(file.mimetype);
      return cb(new Error(`${fileType} 확장자가 올바르지 않습니다.`), false);
    }

    file.originalname = originalname;
    cb(null, true);
  } catch (error) {
    console.error("File filter error:", error);
    cb(error);
  }
};

// S3 storage 설정
const s3Storage = multerS3({
  s3: s3Client,
  bucket: process.env.AWS_BUCKET_NAME,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  metadata: (req, file, cb) => {
    cb(null, {
      fieldName: file.fieldname,
      contentType: file.mimetype,
      originalName: file.originalname,
    });
  },
  key: (req, file, cb) => {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString("hex");
    const ext = path.extname(file.originalname).toLowerCase();
    const filename = `${timestamp}_${randomString}${ext}`;

    // 파일 타입별로 다른 폴더에 저장
    const type = file.mimetype.split("/")[0];
    const key = `${type}s/${filename}`; // images/, videos/, audios/, documents/

    cb(null, key);
  },
});

// multer 인스턴스 생성
const uploadMiddleware = multer({
  storage: s3Storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1, // 한 번에 하나의 파일만 업로드 가능
  },
  fileFilter: fileFilter,
});

// 에러 핸들러 미들웨어
const errorHandler = (error, req, res, next) => {
  console.error("File upload error:", {
    error: error.message,
    stack: error.stack,
    file: req.file,
  });

  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(413).json({
          success: false,
          message: "파일 크기는 50MB를 초과할 수 없습니다.",
        });
      case "LIMIT_FILE_COUNT":
        return res.status(400).json({
          success: false,
          message: "한 번에 하나의 파일만 업로드할 수 있습니다.",
        });
      case "LIMIT_UNEXPECTED_FILE":
        return res.status(400).json({
          success: false,
          message: "잘못된 형식의 파일입니다.",
        });
      default:
        return res.status(400).json({
          success: false,
          message: `파일 업로드 오류: ${error.message}`,
        });
    }
  }

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "파일 업로드 중 오류가 발생했습니다.",
    });
  }

  next();
};

module.exports = {
  upload: uploadMiddleware,
  errorHandler,
  validateFileSize,
  ALLOWED_TYPES,
  getFileType,
};
