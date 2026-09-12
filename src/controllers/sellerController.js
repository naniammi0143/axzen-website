const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Seller = require("../models/Seller");
const Product = require("../models/Product");
const Follow = require("../models/Follow");
const CustomerAppConfig = require("../models/CustomerAppConfig");
const env = require("../config/env");
const { verifyFirebaseToken } = require("../config/firebase");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { formatRupees, toPaise } = require("../utils/money");
const { hashPassword } = require("../utils/password");


function clean(value = "") {
  return String(value).trim();
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  return value === "true" || value === "on" || value === "1";
}

function normalizePhone(mobile) {
  const trimmed = clean(mobile).replace(/[\s-()]/g, "");
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return "";
}

function phonesMatch(submitted, verified) {
  if (!submitted || !verified) return false;
  const a = String(submitted).replace(/\D/g, "");
  const b = String(verified).replace(/\D/g, "");
  return a === b;
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
  const mobileDigits = clean(body.mobile).replace(/\D/g, "");
  if (mobileDigits.length < 6 || mobileDigits.length > 15) return "Enter a valid mobile number.";
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

const {saveDocument:saveSellerDocument} = require('../utils/kycStorage');

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
      bars: [], // A rating histogram requires individual review data.
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

  const decoded = await verifyFirebaseToken(req.body.firebaseToken);
  const phone = decoded.phone_number || "";
  const submitted = normalizePhone(req.body.mobile);

  if (!phone) {
    res.status(400).json({ ok: false, message: "Firebase phone number is missing." });
    return;
  }

  if (!submitted || !phonesMatch(submitted, phone)) {
    res.status(400).json({ ok: false, message: "Verified OTP mobile does not match registration mobile." });
    return;
  }

  const email = clean(req.body.email).toLowerCase();

  const existingSeller = await Seller.findOne({
    $or: [{ phone }, { email }],
  });

  if (existingSeller) {
    if (existingSeller.phone !== phone) {
      return res.status(409).json({ ok: false, message: "This email is already registered. Sign in with the registered phone to update your store." });
    }
    if (existingSeller.approvalStatus === "approved" || existingSeller.status === "blocked") {
      return res.status(409).json({ ok: false, message: "This store is already registered. Please sign in or contact support." });
    }
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

  if (duplicateUser && (duplicateUser.role !== "seller" || duplicateUser.phone !== phone || duplicateUser.status === "blocked")) {
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

const listSellerFestivalOffers = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id }).select("_id businessName").lean();
  if (!seller) {
    res.status(404).json({ ok: false, message: "Seller profile not found." });
    return;
  }
  const [config, products] = await Promise.all([
    CustomerAppConfig.findOne({ key: "default" }).lean(),
    Product.find({ sellerId: seller._id, status: { $in: ["approved", "active"] } })
      .select("title category images pricePaise")
      .sort({ title: 1 })
      .lean(),
  ]);
  const offers = (config?.festivalOffers || []).map((offer) => {
    const ownEntries = (offer.sellerEntries || []).filter((entry) => String(entry.sellerId) === String(seller._id));
    if (!ownEntries.length && String(offer.sellerId || "") === String(seller._id) && (offer.productIds || []).length) {
      ownEntries.push({
        sellerId: String(seller._id),
        productIds: offer.productIds,
        discountPercent: offer.discountPercent || 0,
      });
    }
    return {
      id: offer.id,
      title: offer.title,
      imageUrl: offer.imageUrl,
      imageUrls: offer.imageUrls || [],
      linkUrl: offer.linkUrl || "",
      sellerEntries: ownEntries,
    };
  });
  success(res, { offers, products, sellerId: seller._id });
});

const joinSellerFestivalOffer = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id }).select("_id status isActive").lean();
  if (!seller) {
    res.status(404).json({ ok: false, message: "Seller profile not found." });
    return;
  }
  if (seller.status !== "active" || seller.isActive !== true) {
    res.status(403).json({ ok: false, message: "Only active sellers can join offers." });
    return;
  }
  const config = await CustomerAppConfig.findOne({ key: "default" });
  if (!config) {
    res.status(404).json({ ok: false, message: "No offers yet." });
    return;
  }
  const offers = config.festivalOffers || [];
  const index = offers.findIndex((item) => String(item.id) === String(req.params.id));
  if (index < 0) {
    res.status(404).json({ ok: false, message: "Offer not found." });
    return;
  }
  const productIds = [
    ...new Set(
      (Array.isArray(req.body.productIds) ? req.body.productIds : String(req.body.productIds || "").split(","))
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    ),
  ];
  const discountPercent = Math.max(0, Math.min(90, Number(req.body.discountPercent) || 0));
  if (productIds.some((id) => !/^[a-f\d]{24}$/i.test(id))) {
    res.status(400).json({ ok: false, message: "One or more selected products are invalid." });
    return;
  }
  if (productIds.length && discountPercent < 1) {
    res.status(400).json({ ok: false, message: "Set a discount between 1% and 90%." });
    return;
  }
  if (productIds.length) {
    const ownedProducts = await Product.find({
      _id: { $in: productIds },
      sellerId: seller._id,
      status: { $in: ["approved", "active"] },
    })
      .select("_id")
      .lean();
    if (ownedProducts.length !== productIds.length) {
      res.status(400).json({ ok: false, message: "Select only your approved products." });
      return;
    }
  }
  const current = offers[index].toObject ? offers[index].toObject() : offers[index];
  const sellerEntries = (current.sellerEntries || []).filter((entry) => String(entry.sellerId) !== String(seller._id));
  if (productIds.length) sellerEntries.push({ sellerId: String(seller._id), productIds, discountPercent });
  offers[index].sellerEntries = sellerEntries;
  config.markModified("festivalOffers");
  await config.save();
  success(res, { offer: offers[index] });
});

const downloadKycDocument = asyncHandler(async(req,res)=>{
  const seller=await Seller.findById(req.params.id).select('kycDocuments').lean();
  const doc=seller?.kycDocuments.find(d=>String(d._id)===req.params.documentId);
  if(!doc || doc.storage!=='gridfs' || !doc.fileId)return res.status(404).json({ok:false,message:'This document is unavailable. Ask the seller to upload it again.'});
  res.setHeader('Cache-Control','no-store');res.type(doc.mimeType);
  res.setHeader('Content-Disposition',`attachment; filename="${String(doc.originalName).replace(/[^a-zA-Z0-9._-]/g,'_')}"`);
  const stream=require('../utils/kycStorage').bucket().openDownloadStream(new (require('mongoose').Types.ObjectId)(doc.fileId));
  stream.on('error',()=>{if(!res.headersSent)res.status(404).end();else res.destroy();});stream.pipe(res);
});

module.exports = {
  getProfile,
  getPublicSeller,
  getPublicSellerCategories,
  getPublicSellerProducts,
  getPublicSellerReviews,
  downloadKycDocument,
  registerSeller,
  updateProfile,
  listSellerFestivalOffers,
  joinSellerFestivalOffer,
};
