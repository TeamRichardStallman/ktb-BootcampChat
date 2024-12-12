const {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const pdfParse = require("pdf-parse");
const File = require("../../models/File");
const fs = require("fs/promises");
const s3Client = require("../../utils/s3Client");
const os = require("os");
const path = require("path");

async function handleFileProcessing(data) {
  const { fileId, s3Key, mimetype } = data;

  try {
    const file = await File.findById(fileId);
    if (!file) throw new Error("File not found");

    const headObject = await s3Client.send(
      new HeadObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: s3Key })
    );

    file.size = headObject.ContentLength;
    file.status = "processing";
    await file.save();

    const s3Response = await s3Client.send(
      new GetObjectCommand({ Bucket: process.env.AWS_BUCKET_NAME, Key: s3Key })
    );

    const buffer = await streamToBuffer(s3Response.Body);

    if (mimetype.startsWith("image/")) {
      await processImage(buffer, file);
    } else if (mimetype === "application/pdf") {
      await processPdf(buffer, file);
    } else if (mimetype.startsWith("video/")) {
      await processVideo(buffer, file);
    }

    file.status = "completed";
    file.processedAt = new Date();
    await file.save();
  } catch (error) {
    console.error("File processing error:", error);
    if (fileId) {
      await File.findByIdAndUpdate(fileId, {
        status: "failed",
        processedAt: new Date(),
        error: error.message,
      });
    }
    throw error;
  }
}

async function processImage(buffer, file) {
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    file.metadata = {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      space: metadata.space,
    };

    if (metadata.width > 800) {
      const thumbnailBuffer = await image.resize(800).toBuffer();
      const thumbnailKey = `thumbnails/${file._id}.${metadata.format}`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: thumbnailKey,
          Body: thumbnailBuffer,
          ContentType: `image/${metadata.format}`,
        })
      );

      file.thumbnailKey = thumbnailKey;
    }
  } catch (error) {
    console.error("Image processing error:", error);
    throw error;
  }
}

async function processPdf(buffer, file) {
  try {
    const data = await pdfParse(buffer);

    file.metadata = {
      pageCount: data.numpages,
      info: data.info,
      title: data.info.Title,
      author: data.info.Author,
      creator: data.info.Creator,
      producer: data.info.Producer,
    };

    file.text = data.text.slice(0, 1000); // 필요 시 텍스트 제한
  } catch (error) {
    console.error("PDF processing error:", error);
    throw error;
  }
}

async function processVideo(buffer, file) {
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `${file._id}.mp4`);

  try {
    await fs.writeFile(tempFile, buffer);

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(tempFile, async (err, metadata) => {
        if (err) return reject(err);

        file.metadata = {
          duration: metadata.format.duration,
          bitrate: metadata.format.bit_rate,
          size: metadata.format.size,
          format: metadata.format.format_name,
          resolution: {
            width: metadata.streams[0].width,
            height: metadata.streams[0].height,
          },
        };

        resolve();
      });
    });
  } catch (error) {
    console.error("Video processing error:", error);
    throw error;
  } finally {
    await fs
      .unlink(tempFile)
      .catch((err) => console.error("Failed to delete temp file:", err));
  }
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = handleFileProcessing;
