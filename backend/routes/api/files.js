// backend/routes/api/files.js
const express = require("express");
const router = express.Router();
const auth = require("../../middleware/auth");
const fileController = require("../../controllers/fileController");
const { upload, errorHandler } = require("../../middleware/upload");
const taskQueue = require("../../services/taskQueue");

// 파일 업로드
router.post(
  "/upload",
  auth,
  upload.single("file"),
  errorHandler,
  async (req, res) => {
    try {
      // 1. 먼저 파일을 임시 저장
      const fileResult = await fileController.uploadFile(req, res);

      // 2. 파일 처리 작업을 큐에 추가
      const taskId = await taskQueue.addTask("file-processing", {
        fileId: fileResult.fileId,
        filename: fileResult.filename,
        originalname: req.file.originalname,
        userId: req.user.id,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
        timestamp: Date.now(),
      });

      // 3. 클라이언트에 응답
      res.status(200).json({
        success: true,
        message: "파일이 업로드되었으며 처리 중입니다.",
        taskId,
        file: fileResult,
      });
    } catch (error) {
      console.error("File upload error:", error);
      res.status(500).json({
        success: false,
        message: "파일 업로드 중 오류가 발생했습니다.",
      });
    }
  }
);

// 파일 처리 상태 확인 엔드포인트 추가
router.get("/status/:taskId", auth, async (req, res) => {
  try {
    // Redis에서 작업 상태 조회
    const status = await fileController.getFileProcessingStatus(
      req.params.taskId
    );
    res.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error("Status check error:", error);
    res.status(500).json({
      success: false,
      message: "상태 확인 중 오류가 발생했습니다.",
    });
  }
});

// 기존 라우트들 유지
router.get("/download/:filename", auth, fileController.downloadFile);
router.get("/view/:filename", auth, fileController.viewFile);
router.delete("/:id", auth, fileController.deleteFile);

module.exports = router;
