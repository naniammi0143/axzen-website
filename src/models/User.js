const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: "" },
    addresses: [{
      fullName: { type: String, trim: true }, phone: { type: String, trim: true },
      address: { type: String, trim: true }, city: { type: String, trim: true },
      state: { type: String, trim: true }, pincode: { type: String, trim: true },
      label: { type: String, trim: true, default: "Home" },
    }],
    email: {
      type: String,
      trim: true,
      lowercase: true,
      set: (value) => {
        if (!value) return undefined;
        const normalized = String(value).trim().toLowerCase();
        return normalized || undefined;
      },
    },
    phone: { type: String, trim: true, default: "" },
    passwordHash: { type: String, default: "", select: false },
    firebaseUid: { type: String, trim: true, default: "" },
    role: {
      type: String,
      enum: ["customer", "seller", "admin", "superadmin", "support", "finance", "delivery_manager"],
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
userSchema.index(
  { email: 1, role: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $exists: true },
    },
  }
);

module.exports = mongoose.model("User", userSchema);
