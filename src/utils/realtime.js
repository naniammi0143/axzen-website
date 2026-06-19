const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const env = require("../config/env");
const Seller = require("../models/Seller");

let io = null;

function sellerRoom(sellerId) {
  return `seller:${sellerId}`;
}

function initializeRealtime(server) {
  io = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (!origin || env.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Not allowed by CORS."));
      },
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || "";
      const user = jwt.verify(token, env.jwtSecret);
      if (user.role !== "seller") {
        next(new Error("Only sellers can open realtime order notifications."));
        return;
      }

      const seller = await Seller.findOne({ userId: user.id }).select("_id businessName").lean();
      if (!seller) {
        next(new Error("Seller profile not found."));
        return;
      }

      socket.data.user = user;
      socket.data.sellerId = String(seller._id);
      socket.join(sellerRoom(seller._id));
      next();
    } catch (error) {
      next(new Error("Invalid realtime token."));
    }
  });

  io.on("connection", (socket) => {
    socket.emit("sellerNotificationsReady", {
      sellerId: socket.data.sellerId,
    });
  });

  return io;
}

function emitSellerNewOrder(sellerId, order) {
  if (!io || !sellerId) return;
  io.to(sellerRoom(sellerId)).emit("newOrder", order);
}

module.exports = {
  emitSellerNewOrder,
  initializeRealtime,
};
