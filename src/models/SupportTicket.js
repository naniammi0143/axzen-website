const mongoose = require("mongoose");

const supportTicketSchema = new mongoose.Schema(
  {
    ticketId: { type: String, required: true, unique: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "Seller", required: true },
    sellerName: { type: String, trim: true, default: "" },
    sellerContactPerson: { type: String, trim: true, default: "" },
    sellerContactNumber: { type: String, trim: true, default: "" },
    sellerEmail: { type: String, trim: true, default: "" },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    category: {
      type: String,
      enum: ["orders", "payments", "shipments", "products", "inventory", "technical", "other"],
      default: "other",
    },
    message: { type: String, trim: true, required: true },
    status: { type: String, enum: ["open", "in_progress", "closed"], default: "open" },
    departmentNote: { type: String, trim: true, default: "" },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

supportTicketSchema.index({ sellerId: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("SupportTicket", supportTicketSchema);
