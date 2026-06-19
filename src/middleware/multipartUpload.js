const path = require("path");

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

function parseHeaderBlock(block) {
  return block.split("\r\n").reduce((headers, line) => {
    const index = line.indexOf(":");
    if (index === -1) return headers;
    headers[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim();
    return headers;
  }, {});
}

function parseDisposition(value = "") {
  return value.split(";").reduce((result, part) => {
    const [rawKey, rawValue] = part.trim().split("=");
    if (!rawValue) return result;
    result[rawKey] = rawValue.replace(/^"|"$/g, "");
    return result;
  }, {});
}

function sanitizeFileName(name) {
  const parsed = path.parse(name || "upload");
  const base = parsed.name.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80) || "upload";
  const ext = parsed.ext.toLowerCase();
  return `${base}${ext}`;
}

function multipartForm(options = {}) {
  const maxBytes = options.maxBytes || 12 * 1024 * 1024;
  const optional = Boolean(options.optional);

  return (req, res, next) => {
    const contentType = req.headers["content-type"] || "";
    const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] || contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];

    if (!contentType.startsWith("multipart/form-data") || !boundary) {
      if (optional) {
        next();
        return;
      }
      res.status(400).json({ ok: false, message: "Multipart form-data is required." });
      return;
    }

    const chunks = [];
    let totalBytes = 0;

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (totalBytes > maxBytes) {
        res.status(413).json({ ok: false, message: "Uploaded form is too large." });
        return;
      }

      const body = Buffer.concat(chunks).toString("binary");
      const parts = body.split(`--${boundary}`).slice(1, -1);
      req.body = {};
      req.files = {};

      try {
        parts.forEach((rawPart) => {
          const part = rawPart.replace(/^\r\n/, "").replace(/\r\n$/, "");
          const splitIndex = part.indexOf("\r\n\r\n");
          if (splitIndex === -1) return;

          const headers = parseHeaderBlock(part.slice(0, splitIndex));
          const disposition = parseDisposition(headers["content-disposition"]);
          const fieldName = disposition.name;
          if (!fieldName) return;

          const rawValue = part.slice(splitIndex + 4);
          if (!disposition.filename) {
            req.body[fieldName] = Buffer.from(rawValue, "binary").toString("utf8");
            return;
          }

          const mimetype = headers["content-type"] || "application/octet-stream";
          const buffer = Buffer.from(rawValue, "binary");
          const filename = sanitizeFileName(disposition.filename);

          if (!allowedMimeTypes.has(mimetype)) {
            throw new Error("Only PDF, JPG, and PNG files are allowed.");
          }

          if (buffer.length > MAX_FILE_SIZE) {
            throw new Error("Each uploaded file must be 5MB or smaller.");
          }

          const file = {
            buffer,
            originalName: filename,
            mimetype,
            size: buffer.length,
          };

          if (req.files[fieldName]) {
            req.files[fieldName] = Array.isArray(req.files[fieldName]) ? [...req.files[fieldName], file] : [req.files[fieldName], file];
            return;
          }

          req.files[fieldName] = file;
        });

        next();
      } catch (error) {
        res.status(400).json({ ok: false, message: error.message });
      }
    });

    req.on("error", () => {
      res.status(400).json({ ok: false, message: "Unable to read uploaded form." });
    });
  };
}

module.exports = {
  multipartForm,
};
