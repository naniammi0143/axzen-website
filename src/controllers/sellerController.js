const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Seller = require("../models/Seller");
const Product = require("../models/Product");
const Follow = require("../models/Follow");
const env = require("../config/env");
const { verifyFirebaseToken } = require("../config/firebase");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { formatRupees, toPaise } = require("../utils/money");
const { hashPassword } = require("../utils/password");

const uploadRoot = process.env.UPLOAD_DIR || path.join(os.tmpdir(), "axzen-uploads", "seller-kyc");

function clean(value = "") {
  return String(value).trim();
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  return value === "true" || value === "on" || value === "1";
}

function normalizePhone(mobile) {
  const digits = clean(mobile).replace(/\D/g, "");
  return digits.length === 10 ? `+91${digits}` : "";
}

function validateRegistration(body, files) {
  const required = [
    "fullName",
    "mobile",
    "email",
    "password",
    "confirmPassword",
    "storeName",
    "businessType",
    "panNumber",
    "pickupAddress",
    "city",
    "state",
    "pincode",
    "accountHolderName",
    "accountNumber",
    "ifsc",
    "firebaseToken",
  ];

  const missing = required.filter((field) => !clean(body[field]));
  if (missing.length) return `${missing.join(", ")} required.`;
  if (!/^\d{10}$/.test(clean(body.mobile))) return "Mobile number must be 10 digits.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(body.email))) return "Email must be valid.";
  if (body.password !== body.confirmPassword) return "Password and confirm password must match.";
  if (clean(body.password).length < 8) return "Password must be at least 8 characters.";
  if (!/^\d{6}$/.test(clean(body.pincode))) return "Pincode must be 6 digits.";
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(clean(body.ifsc))) return "IFSC format is invalid.";
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(clean(body.panNumber))) return "PAN number format is invalid.";
  if (clean(body.aadhaarNumber) && !/^\d{12}$/.test(clean(body.aadhaarNumber))) return "Aadhaar number must be 12 digits.";
  if (!files.panDocument) return "PAN document upload is required.";
  if (!files.kycDocument) return "Aadhaar/GST/KYC document upload is required.";
  if (body.marketplaceTerms !== "on") return "Marketplace seller agreement must be accepted.";
  if (body.kycConsent !== "on") return "KYC consent must be accepted.";
  if (body.taxCompliance !== "on") return "Tax compliance declaration must be accepted.";
  if (body.payoutPolicy !== "on") return "Payout and return policy must be accepted.";
  return "";
}

async function saveSellerDocument(file, sellerId, type) {
  const sellerDir = path.join(uploadRoot, String(sellerId));
  await fs.mkdir(sellerDir, { recursive: true });
  const extension = path.extname(file.originalName).toLowerCase();
  const fileName = `${type}-${Date.now()}${extension}`;
  const filePath = path.join(sellerDir, fileName);
  await fs.writeFile(filePath, file.buffer);

  return {
    type,
    originalName: file.originalName,
    fileName,
    path: filePath,
    storage: process.env.UPLOAD_DIR ? "local" : "serverless-temp",
    mimeType: file.mimetype,
    size: file.size,
  };
}

function sellerResponse(seller, statusCode = 201) {
  return {
    statusCode,
    payload: {
      message: "Registration submitted successfully. Your account is waiting for admin approval.",
      seller: {
        id: seller._id,
        approvalStatus: seller.approvalStatus,
        kycStatus: seller.kycStatus,
        isActive: seller.isActive,
      },
    },
  };
}

function buildSellerUpdate(req, phone, email) {
  return {
    businessName: clean(req.body.storeName),
    fullName: clean(req.body.fullName),
    phone,
    email,
    category: clean(req.body.businessType),
    businessType: clean(req.body.businessType),
    city: clean(req.body.city),
    state: clean(req.body.state),
    pincode: clean(req.body.pincode),
    pickupAddress: clean(req.body.pickupAddress),
    gstNumber: clean(req.body.gstNumber).toUpperCase(),
    panNumber: clean(req.body.panNumber).toUpperCase(),
    aadhaarNumber: clean(req.body.aadhaarNumber),
    approvalStatus: "pending",
    kycStatus: "pending",
    status: "inactive",
    isActive: false,
    payoutEnabled: false,
    codEnabled: req.body.codEnabled !== "false",
    onlinePaymentEnabled: req.body.onlinePaymentEnabled !== "false",
    agreements: {
      marketplaceTerms: req.body.marketplaceTerms === "on",
      kycConsent: req.body.kycConsent === "on",
      taxCompliance: req.body.taxCompliance === "on",
      payoutPolicy: req.body.payoutPolicy === "on",
      acceptedAt: new Date(),
    },
    bankDetails: {
      accountHolderName: clean(req.body.accountHolderName),
      accountNumber: clean(req.body.accountNumber),
      ifsc: clean(req.body.ifsc).toUpperCase(),
      bankName: clean(req.body.bankName),
      upiId: clean(req.body.upiId),
    },
  };
}

function publicProduct(product, seller = {}) {
  return {
    id: product._id,
    sku: product.sku,
    title: product.title,
    category: product.category,
    sellerId: product.sellerId,
    sellerName: product.sellerName,
    description: product.description || "",
    mrpPaise: product.mrpPaise || product.pricePaise,
    mrp: formatRupees(product.mrpPaise || product.pricePaise),
    pricePaise: product.pricePaise,
    price: formatRupees(product.pricePaise),
    unitLabel: product.unitLabel || "1 pc",
    ratingAverage: Number(product.ratingAverage || 0),
    ratingCount: Number(product.ratingCount || 0),
    stock: product.stock,
    images: product.images || [],
    image: product.images?.[0] || "",
    sellerCategory: seller.category || "General",
    sellerCity: seller.city || "",
    sellerFullName: seller.fullName || "",
    sellerBusinessType: seller.businessType || "",
    sellerEmail: seller.email || "",
    sellerPhone: seller.phone || "",
    sellerCreatedAt: seller.createdAt || null,
    sellerStoreDetails: seller.storeDetails || {},
    codEnabled: seller.codEnabled !== false,
    onlinePaymentEnabled: seller.onlinePaymentEnabled !== false,
    freeDeliveryEnabled: seller.freeDeliveryEnabled === true,
    freeDeliveryMinOrderPaise: Number(seller.freeDeliveryMinOrderPaise) || 0,
  };
}

function publicSeller(seller, followerCount = 0, productCount = 0, followState = false) {
  const details = seller.storeDetails || {};
  return {
    id: seller._id,
    businessName: seller.businessName,
    name: seller.businessName,
    category: seller.category,
    city: seller.city,
    fullName: seller.fullName,
    businessType: seller.businessType,
    gstNumber: seller.gstNumber,
    email: details.supportEmail || seller.email,
    phone: details.supportPhone || seller.phone,
    createdAt: seller.createdAt,
    followerCount,
    productCount,
    isFollowing: followState,
    storeDetails: details,
  };
}

function optionalCustomerId(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return "";
  try {
    const user = jwt.verify(token, env.jwtSecret);
    return user.role === "customer" ? user.id : "";
  } catch {
    return "";
  }
}

const getPublicSeller = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ _id: req.params.sellerId, isActive: true, status: "active" }).lean();
  if (!seller) {
    res.status(404).json({ ok: false, message: "Seller not found." });
    return;
  }
  const customerId = optionalCustomerId(req);
  const [followerCount, productCount, follow] = await Promise.all([
    Follow.countDocuments({ sellerId: seller._id }),
    Product.countDocuments({ sellerId: seller._id, status: { $in: ["active", "approved"] } }),
    customerId ? Follow.exists({ customerId, sellerId: seller._id }) : null,
  ]);
  success(res, { seller: publicSeller(seller, followerCount, productCount, Boolean(follow)) });
});

const getPublicSellerProducts = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ _id: req.params.sellerId, isActive: true, status: "active" }).lean();
  if (!seller) {
    res.status(404).json({ ok: false, message: "Seller not found." });
    return;
  }
  const products = await Product.find({ sellerId: req.params.sellerId, status: { $in: ["active", "approved"] } }).sort({ updatedAt: -1 }).limit(200).lean();
  success(res, { products: products.map((product) => publicProduct(product, seller)) });
});

const getPublicSellerCategories = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ _id: req.params.sellerId, isActive: true, status: "active" }).select("_id").lean();
  if (!seller) {
    res.status(404).json({ ok: false, message: "Seller not found." });
    return;
  }
  const products = await Product.find({ sellerId: req.params.sellerId, status: { $in: ["active", "approved"] } }).select("category").lean();
  const counts = products.reduce((map, product) => {
    const category = product.category || "General";
    map.set(category, (map.get(category) || 0) + 1);
    return map;
  }, new Map());
  const categories = [...counts.entries()].map(([name, total]) => ({ name, products: total })).sort((a, b) => b.products - a.products);
  success(res, { categories });
});

const getPublicSellerReviews = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ _id: req.params.sellerId, isActive: true, status: "active" }).select("_id").lean();
  if (!seller) {
    res.status(404).json({ ok: false, message: "Seller not found." });
    return;
  }
  const products = await Product.find({ sellerId: req.params.sellerId, status: { $in: ["active", "approved"] } }).select("ratingAverage ratingCount title").lean();
  const totalReviews = products.reduce((sum, product) => sum + Number(product.ratingCount || 0), 0);
  const weightedRating = totalReviews
    ? products.reduce((sum, product) => sum + Number(product.ratingAverage || 0) * Number(product.ratingCount || 0), 0) / totalReviews
    : 0;
  success(res, {
    reviews: {
      ratingAverage: Number(weightedRating.toFixed(1)),
      reviewCount: totalReviews,
      bars: [5, 4, 3, 2, 1].map((rating) => ({ rating, percent: rating === Math.round(weightedRating || 0) ? 85 : 0 })),
      latestReview: null,
    },
  });
});

const getProfile = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id });
  success(res, { seller });
});

const updateProfile = asyncHandler(async (req, res) => {
  const update = {
    phone: req.user.phone,
  };

  if (req.body.businessName !== undefined) update.businessName = req.body.businessName;
  if (req.body.category !== undefined) update.category = req.body.category;
  if (req.body.city !== undefined) update.city = req.body.city;
  if (req.body.codEnabled !== undefined) update.codEnabled = toBoolean(req.body.codEnabled);
  if (req.body.onlinePaymentEnabled !== undefined) update.onlinePaymentEnabled = toBoolean(req.body.onlinePaymentEnabled);
  if (req.body.freeDeliveryEnabled !== undefined) update.freeDeliveryEnabled = toBoolean(req.body.freeDeliveryEnabled);
  if (req.body.freeDeliveryMinOrder !== undefined) update.freeDeliveryMinOrderPaise = toPaise(req.body.freeDeliveryMinOrder);
  if (req.body.freeDeliveryMinOrderPaise !== undefined) {
    update.freeDeliveryMinOrderPaise = Math.max(Number(req.body.freeDeliveryMinOrderPaise) || 0, 0);
  }

  const seller = await Seller.findOneAndUpdate(
    { userId: req.user.id },
    {
      $set: update,
    },
    { new: true, upsert: true }
  );

  success(res, { seller });
});

const registerSeller = asyncHandler(async (req, res) => {
  const error = validateRegistration(req.body, req.files || {});
  if (error) {
    res.status(400).json({ ok: false, message: error });
    return;
  }

  const phone = normalizePhone(req.body.mobile);
  const email = clean(req.body.email).toLowerCase();
  const decoded = await verifyFirebaseToken(req.body.firebaseToken);

  if (decoded.phone_number !== phone) {
    res.status(400).json({ ok: false, message: "Verified OTP mobile does not match registration mobile." });
    return;
  }

  const existingSeller = await Seller.findOne({
    $or: [{ phone }, { email }],
  });

  if (existingSeller) {
    const userUpdate = {
      name: clean(req.body.fullName),
      email,
      phone,
      firebaseUid: decoded.uid,
      passwordHash: hashPassword(req.body.password),
      role: "seller",
      status: "pending",
    };
    await User.findOneAndUpdate({ _id: existingSeller.userId }, userUpdate, { new: true });

    Object.assign(existingSeller, buildSellerUpdate(req, phone, email));
    existingSeller.kycDocuments = [
      await saveSellerDocument(req.files.panDocument, existingSeller._id, "pan"),
      await saveSellerDocument(req.files.kycDocument, existingSeller._id, "kyc"),
    ];
    await existingSeller.save();

    const { payload } = sellerResponse(existingSeller, 200);
    success(res, payload, 200);
    return;
  }

  const duplicateUser = await User.findOne({
    $or: [{ phone }, { email }],
  });

  if (duplicateUser && duplicateUser.role !== "seller") {
    res.status(409).json({ ok: false, message: "This mobile number or email is already linked to another Axzen account." });
    return;
  }

  const userPayload = {
    name: clean(req.body.fullName),
    email,
    phone,
    firebaseUid: decoded.uid,
    passwordHash: hashPassword(req.body.password),
    role: "seller",
    status: "pending",
  };
  const createdUser = !duplicateUser;
  const user = duplicateUser
    ? await User.findByIdAndUpdate(duplicateUser._id, userPayload, { new: true })
    : await User.create(userPayload);

  try {
    const seller = await Seller.create({
      userId: user._id,
      ...buildSellerUpdate(req, phone, email),
    });

    const kycDocuments = [
      await saveSellerDocument(req.files.panDocument, seller._id, "pan"),
      await saveSellerDocument(req.files.kycDocument, seller._id, "kyc"),
    ];

    seller.kycDocuments = kycDocuments;
    await seller.save();

    const { payload, statusCode } = sellerResponse(seller, 201);
    success(res, payload, statusCode);
  } catch (registrationError) {
    if (createdUser) {
      await User.deleteOne({ _id: user._id });
    }
    throw registrationError;
  }
});

module.exports = {
  getProfile,
  getPublicSeller,
  getPublicSellerCategories,
  getPublicSellerProducts,
  getPublicSellerReviews,
  registerSeller,
  updateProfile,
};
