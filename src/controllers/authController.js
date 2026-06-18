const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Seller = require("../models/Seller");
const AdminUser = require("../models/AdminUser");
const { verifyFirebaseToken } = require("../config/firebase");
const env = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");

function signToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      role: user.role,
      phone: user.phone,
      name: user.name,
    },
    env.jwtSecret,
    { expiresIn: "8h" }
  );
}

async function ensureRoleProfile(user) {
  if (user.role === "seller") {
    const seller = await Seller.findOne({ userId: user._id });

    if (!seller) {
      return Seller.create({
        userId: user._id,
        businessName: `${user.name || "Seller"} Store`,
        phone: user.phone,
        commissionBps: 1200,
        approvalStatus: "pending",
        kycStatus: "pending",
        status: "inactive",
        isActive: false,
        payoutEnabled: false,
      });
    }

    return seller;
  }

  if (["admin", "superadmin", "support", "finance", "delivery_manager"].includes(user.role)) {
    await AdminUser.updateOne(
      { userId: user._id },
      {
        $setOnInsert: {
          userId: user._id,
          permissions:
            user.role === "superadmin"
              ? ["*"]
              : user.role === "finance"
                ? ["finance", "reports"]
                : user.role === "support"
                  ? ["customers", "orders"]
                  : user.role === "delivery_manager"
                    ? ["delivery", "orders"]
                    : ["sellers", "products", "orders"],
        },
      },
      { upsert: true }
    );
  }
}

const phoneLogin = asyncHandler(async (req, res) => {
  const { role, firebaseToken, name } = req.body;
  const decoded = await verifyFirebaseToken(firebaseToken);
  const phone = decoded.phone_number;

  if (!phone) {
    res.status(400).json({ ok: false, message: "Firebase phone number is missing." });
    return;
  }

  const user = await User.findOneAndUpdate(
    { phone, role },
    {
      $set: {
        phone,
        role,
        firebaseUid: decoded.uid,
      },
      $setOnInsert: {
        name: name || `${role.charAt(0).toUpperCase()}${role.slice(1)} User`,
        status: role === "seller" ? "pending" : "active",
      },
    },
    { new: true, upsert: true }
  );

  const roleProfile = await ensureRoleProfile(user);

  success(res, {
    token: signToken(user),
    user: {
      id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      seller:
        user.role === "seller" && roleProfile
          ? {
              id: roleProfile._id,
              businessName: roleProfile.businessName,
              approvalStatus: roleProfile.approvalStatus || "pending",
              kycStatus: roleProfile.kycStatus || "pending",
              isActive: Boolean(roleProfile.isActive),
              status: roleProfile.status || "inactive",
            }
          : undefined,
    },
  });
});

module.exports = {
  phoneLogin,
};
