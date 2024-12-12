const { PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs').promises;
const s3Client = require('../config/aws');

exports.uploadToS3 = async (filePath, filename) => {
  try {
    if (!filePath || !filename) {
      throw new Error('Invalid file path or filename');
    }

    const fileData = await fs.readFile(filePath);
    const bucketName = process.env.AWS_S3_BUCKET_NAME;

    const uploadParams = {
      Bucket: bucketName,
      Key: `uploads/${filename}`,
      Body: fileData,
    };

    await s3Client.send(new PutObjectCommand(uploadParams));
    await fs.unlink(filePath); // 로컬 파일 삭제
    return `uploads/${filename}`;
  } catch (error) {
    console.error('S3 Upload Error:', error);
    throw new Error('S3 업로드 실패');
  }
};
