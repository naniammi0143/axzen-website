const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    firebaseUid: { type: String, trim: true, default: "" },
    role: {
      type: String,
      enum: ["customer", "seller", "admin", "superadmin"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "blocked", "pending"],
      default: "active",
    },
  },
  { timestamps: true }
);

userSchema.index({ phone: 1, role: 1 }, { unique: true, sparse: true });
userSchema.index({ email: 1, role: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("User", userSchema);
