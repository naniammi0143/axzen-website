const mongoose = require("mongoose");

const adminUserSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    displayRole: { type: String, trim: true, default: "Operations Manager" },
    permissions: [{ type: String, trim: true }],
    activityNotes: [{ type: String, trim: true }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AdminUser", adminUserSchema);
