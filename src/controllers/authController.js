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
    await Seller.updateOne(
      { userId: user._id },
      {
        $setOnInsert: {
          userId: user._id,
          businessName: `${user.name || "Seller"} Store`,
          phone: user.phone,
          commissionBps: 1200,
        },
      },
      { upsert: true }
    );
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
        status: "active",
      },
      $setOnInsert: {
        name: name || `${role.charAt(0).toUpperCase()}${role.slice(1)} User`,
      },
    },
    { new: true, upsert: true }
  );

  await ensureRoleProfile(user);

  success(res, {
    token: signToken(user),
    user: {
      id: user._id,
      name: user.name,
      phone: user.phone,
      role: user.role,
    },
  });
});

module.exports = {
  phoneLogin,
};
