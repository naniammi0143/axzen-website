const CustomerNotification = require("../models/CustomerNotification");
const Follow = require("../models/Follow");
const Seller = require("../models/Seller");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");

async function notifyFollowersForProduct(seller, product) {
  const followers = await Follow.find({ sellerId: seller._id }).select("customerId").lean();
  if (!followers.length) return 0;

  await CustomerNotification.insertMany(
    followers.map((follow) => ({
      customerId: follow.customerId,
      sellerId: seller._id,
      productId: product._id,
      type: "new_product",
      title: "New product added",
      message: `${seller.businessName} added ${product.title}.`,
      link: `/?product=${product._id}`,
    })),
    { ordered: false }
  );
  return followers.length;
}

const followSeller = asyncHandler(async (req, res) => {
  const seller = await Seller.findById(req.params.sellerId).select("_id businessName").lean();
  if (!seller) {
    res.status(404).json({ ok: false, message: "Seller not found." });
    return;
  }

  await Follow.updateOne({ customerId: req.user.id, sellerId: seller._id }, { $setOnInsert: { customerId: req.user.id, sellerId: seller._id } }, { upsert: true });
  const followerCount = await Follow.countDocuments({ sellerId: seller._id });
  success(res, { seller, followerCount });
});

const listCustomerFollows = asyncHandler(async (req, res) => {
  const follows = await Follow.find({ customerId: req.user.id }).sort({ createdAt: -1 }).populate("sellerId", "businessName category city").lean();
  success(res, {
    follows: follows.map((follow) => ({
      id: follow.sellerId?._id,
      name: follow.sellerId?.businessName || "Seller",
      category: follow.sellerId?.category || "General",
      city: follow.sellerId?.city || "",
      followedAt: follow.createdAt,
    })),
  });
});

const listCustomerNotifications = asyncHandler(async (req, res) => {
  const notifications = await CustomerNotification.find({ customerId: req.user.id }).sort({ createdAt: -1 }).limit(50).populate("sellerId", "businessName").lean();
  success(res, {
    unreadCount: notifications.filter((item) => !item.isRead).length,
    notifications,
  });
});

const markCustomerNotificationsRead = asyncHandler(async (req, res) => {
  await CustomerNotification.updateMany({ customerId: req.user.id, isRead: false }, { isRead: true });
  success(res, { unreadCount: 0 });
});

const sellerFollowerSummary = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id }).select("_id businessName").lean();
  if (!seller) {
    res.status(404).json({ ok: false, message: "Seller profile not found." });
    return;
  }
  const followerCount = await Follow.countDocuments({ sellerId: seller._id });
  success(res, { followerCount });
});

const sendSellerFollowerNotification = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id }).select("_id businessName").lean();
  if (!seller) {
    res.status(404).json({ ok: false, message: "Seller profile not found." });
    return;
  }
  const message = String(req.body.message || "").trim();
  if (!message) {
    res.status(400).json({ ok: false, message: "Message is required." });
    return;
  }

  const followers = await Follow.find({ sellerId: seller._id }).select("customerId").lean();
  if (followers.length) {
    await CustomerNotification.insertMany(
      followers.map((follow) => ({
        customerId: follow.customerId,
        sellerId: seller._id,
        type: "seller_message",
        title: `${seller.businessName} sent an update`,
        message,
        link: `/?seller=${seller._id}`,
      })),
      { ordered: false }
    );
  }
  success(res, { sentCount: followers.length });
});

module.exports = {
  followSeller,
  listCustomerFollows,
  listCustomerNotifications,
  markCustomerNotificationsRead,
  notifyFollowersForProduct,
  sellerFollowerSummary,
  sendSellerFollowerNotification,
};
