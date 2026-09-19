const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    _id: { type: String },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);
module.exports = mongoose.model("BootstrapState", schema);
