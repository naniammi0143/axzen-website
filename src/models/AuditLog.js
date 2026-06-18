const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorRole: { type: String, trim: true, default: "" },
    action: { type: String, trim: true, required: true },
    entityType: { type: String, trim: true, default: "" },
    entityId: { type: String, trim: true, default: "" },
    message: { type: String, trim: true, default: "" },
    metadata: { type: Object, default: {} },
    ip: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorRole: 1, action: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
