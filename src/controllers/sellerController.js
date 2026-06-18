const fs = require("fs/promises");
const path = require("path");
const User = require("../models/User");
const Seller = require("../models/Seller");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { hashPassword } = require("../utils/password");

const uploadRoot = path.join(__dirname, "..", "..", "uploads", "seller-kyc");

function clean(value = "") {
  return String(value).trim();
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
    path: path.relative(path.join(__dirname, "..", ".."), filePath).replace(/\\/g, "/"),
    mimeType: file.mimetype,
    size: file.size,
  };
}

const getProfile = asyncHandler(async (req, res) => {
  const seller = await Seller.findOne({ userId: req.user.id });
  success(res, { seller });
});

const updateProfile = asyncHandler(async (req, res) => {
  const seller = await Seller.findOneAndUpdate(
    { userId: req.user.id },
    {
      $set: {
        businessName: req.body.businessName,
        category: req.body.category,
        city: req.body.city,
        phone: req.user.phone,
      },
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

  const duplicateUser = await User.findOne({
    $or: [{ phone }, { email }],
  });

  if (duplicateUser) {
    res.status(409).json({ ok: false, message: "Seller email or mobile number already exists." });
    return;
  }

  const duplicateSeller = await Seller.findOne({
    $or: [{ phone }, { email }],
  });

  if (duplicateSeller) {
    res.status(409).json({ ok: false, message: "Seller email or mobile number already exists." });
    return;
  }

  const user = await User.create({
    name: clean(req.body.fullName),
    email,
    phone,
    passwordHash: hashPassword(req.body.password),
    role: "seller",
    status: "pending",
  });

  try {
    const seller = await Seller.create({
      userId: user._id,
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
      bankDetails: {
        accountHolderName: clean(req.body.accountHolderName),
        accountNumber: clean(req.body.accountNumber),
        ifsc: clean(req.body.ifsc).toUpperCase(),
        bankName: clean(req.body.bankName),
        upiId: clean(req.body.upiId),
      },
    });

    const kycDocuments = [
      await saveSellerDocument(req.files.panDocument, seller._id, "pan"),
      await saveSellerDocument(req.files.kycDocument, seller._id, "kyc"),
    ];

    seller.kycDocuments = kycDocuments;
    await seller.save();

    success(
      res,
      {
        message: "Registration submitted successfully. Your account is waiting for admin approval.",
        seller: {
          id: seller._id,
          approvalStatus: seller.approvalStatus,
          kycStatus: seller.kycStatus,
          isActive: seller.isActive,
        },
      },
      201
    );
  } catch (registrationError) {
    await User.deleteOne({ _id: user._id });
    throw registrationError;
  }
});

module.exports = {
  getProfile,
  registerSeller,
  updateProfile,
};
