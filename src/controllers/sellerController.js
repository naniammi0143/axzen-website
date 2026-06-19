const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const User = require("../models/User");
const Seller = require("../models/Seller");
const { verifyFirebaseToken } = require("../config/firebase");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { toPaise } = require("../utils/money");
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
  registerSeller,
  updateProfile,
};
