const mongoose = require("mongoose");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
function bucket() {
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "sellerKyc",
  });
}
async function saveDocument(file, sellerId, type) {
  const stream = bucket().openUploadStream(`${sellerId}-${type}`, {
    metadata: {
      sellerId: String(sellerId),
      type,
      mimeType: file.mimetype,
      originalName: file.originalName,
    },
  });
  await pipeline(Readable.from(file.buffer), stream);
  return {
    type,
    originalName: file.originalName,
    fileName: String(stream.id),
    fileId: String(stream.id),
    path: "gridfs:" + stream.id,
    storage: "gridfs",
    mimeType: file.mimetype,
    size: file.size,
  };
}
module.exports = { bucket, saveDocument };
