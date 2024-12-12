const File = require('../models/File');
const Message = require('../models/Message');
const Room = require('../models/Room');
const { uploadToS3 } = require('../services/fileService');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const crypto = require('crypto');
const { uploadDir } = require('../middleware/upload');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = require('../config/aws');

const fsPromises = {
  writeFile: promisify(fs.writeFile),
  unlink: promisify(fs.unlink),
  access: promisify(fs.access),
  mkdir: promisify(fs.mkdir),
  rename: promisify(fs.rename)
};

const isPathSafe = (filepath, directory) => {
  const resolvedPath = path.resolve(filepath);
  const resolvedDirectory = path.resolve(directory);
  return resolvedPath.startsWith(resolvedDirectory);
};

const generateSafeFilename = (originalFilename) => {
  const ext = path.extname(originalFilename || '').toLowerCase();
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(8).toString('hex');
  return `${timestamp}_${randomBytes}${ext}`;
};

// 개선된 파일 정보 조회 함수
const getFileFromRequest = async (req) => {
  try {
    const filename = req.params.filename;
    const token = req.headers['x-auth-token'] || req.query.token;
    const sessionId = req.headers['x-session-id'] || req.query.sessionId;

    if (!filename) {
      throw new Error('Invalid filename');
    }

    if (!token || !sessionId) {
      throw new Error('Authentication required');
    }

    const file = await File.findOne({ filename: filename });
    if (!file) {
      throw new Error('File not found in database');
    }

    // 채팅방 권한 검증
    const message = await Message.findOne({ file: file._id });
    if (!message) {
      throw new Error('File message not found');
    }

    const room = await Room.findOne({
      _id: message.room,
      participants: req.user.id,
    });

    if (!room) {
      throw new Error('Unauthorized access');
    }

    return { file, s3Key: file.path }; // S3 Key 반환
  } catch (error) {
    console.error('getFileFromRequest error:', {
      filename: req.params.filename,
      error: error.message,
    });
    throw error;
  }
};

exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      console.error('No file received in the request');
      return res.status(400).json({
        success: false,
        message: '파일이 선택되지 않았습니다.',
      });
    }

    const safeFilename = generateSafeFilename(req.file.originalname);
    const currentPath = req.file.path;

    console.log('Received file:', {
      originalname: req.file.originalname,
      safeFilename,
      currentPath,
    });

    // S3 업로드
    const path = await uploadToS3(currentPath, safeFilename);
    console.log('Generated Path:', path); // S3 Key 로그 추가

    // 파일 데이터베이스 저장
    const file = new File({
      filename: safeFilename,
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      user: req.user.id,
      path, // Path 저장
    });

    console.log('File data to be saved:', file); // 디버깅 로그 추가

    await file.save();

    res.status(200).json({
      success: true,
      message: '파일 업로드 성공',
      file,
    });
  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({
      success: false,
      message: '파일 업로드 중 오류가 발생했습니다.',
      error: error.message,
    });
  }
};


exports.downloadFile = async (req, res) => {
  try {
    const { file } = await getFileFromRequest(req);
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    
    const getParams = {
      Bucket: bucketName,
      Key: file.path, // S3 Object Key 사용
    };

    const s3Stream = await s3Client.send(new GetObjectCommand(getParams));

    res.set({
      'Content-Type': file.mimetype,
      'Content-Disposition': file.getContentDisposition('attachment'),
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    // S3 데이터 스트리밍
    s3Stream.Body.pipe(res);
  } catch (error) {
    handleFileError(error, res);
  }
};

exports.viewFile = async (req, res) => {
  try {
    const { file } = await getFileFromRequest(req); // 파일 정보 가져오기
    const bucketName = process.env.AWS_S3_BUCKET_NAME;

    const getParams = {
      Bucket: bucketName,
      Key: file.path, // `path` 필드를 S3 Key로 사용
    };

    // S3에서 파일 가져오기
    const s3Object = await s3Client.send(new GetObjectCommand(getParams));
    const s3Stream = s3Object.Body; // S3 객체의 Body 스트림

    if (!s3Stream) {
      throw new Error('S3 파일 스트리밍 실패');
    }

    // 응답 헤더 설정
    res.set({
      'Content-Type': file.mimetype,
      'Content-Disposition': 'inline', // 미리보기로 표시
      'Cache-Control': 'public, max-age=31536000, immutable',
    });

    // S3 스트림을 클라이언트로 파이핑
    s3Stream.pipe(res);

  } catch (error) {
    console.error('File preview error:', error);

    // 에러 처리
    if (error.name === 'NoSuchKey') {
      res.status(404).json({
        success: false,
        message: 'S3에서 파일을 찾을 수 없습니다.',
      });
    } else {
      res.status(500).json({
        success: false,
        message: '파일 미리보기 중 오류가 발생했습니다.',
        error: error.message,
      });
    }
  }
};

const handleFileStream = (fileStream, res) => {
  fileStream.on('error', (error) => {
    console.error('File streaming error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: '파일 스트리밍 중 오류가 발생했습니다.'
      });
    }
  });

  fileStream.pipe(res);
};

const handleFileError = (error, res) => {
  console.error('File operation error:', {
    message: error.message,
    stack: error.stack
  });

  // 에러 상태 코드 및 메시지 매핑
  const errorResponses = {
    'Invalid filename': { status: 400, message: '잘못된 파일명입니다.' },
    'Authentication required': { status: 401, message: '인증이 필요합니다.' },
    'Invalid file path': { status: 400, message: '잘못된 파일 경로입니다.' },
    'File not found in database': { status: 404, message: '파일을 찾을 수 없습니다.' },
    'File message not found': { status: 404, message: '파일 메시지를 찾을 수 없습니다.' },
    'Unauthorized access': { status: 403, message: '파일에 접근할 권한이 없습니다.' },
    'ENOENT': { status: 404, message: '파일을 찾을 수 없습니다.' }
  };

  const errorResponse = errorResponses[error.message] || {
    status: 500,
    message: '파일 처리 중 오류가 발생했습니다.'
  };

  res.status(errorResponse.status).json({
    success: false,
    message: errorResponse.message
  });
};

exports.deleteFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: '파일을 찾을 수 없습니다.',
      });
    }

    if (file.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: '파일을 삭제할 권한이 없습니다.',
      });
    }

    // S3에서 파일 삭제
    const bucketName = process.env.AWS_S3_BUCKET_NAME;
    const deleteParams = {
      Bucket: bucketName,
      Key: file.path,
    };

    await s3Client.send(new DeleteObjectCommand(deleteParams));
    await file.deleteOne();

    res.json({
      success: true,
      message: '파일이 삭제되었습니다.',
    });
  } catch (error) {
    console.error('File deletion error:', error);
    res.status(500).json({
      success: false,
      message: '파일 삭제 중 오류가 발생했습니다.',
      error: error.message,
    });
  }
};