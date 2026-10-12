const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");
const { invalid } = require("../utils/checkoutRules");
const { validPassword, hashPassword, verifyPassword, loginPhone } = require("../utils/passwords");
const { signToken, sessionResponse } = require("./authController");

const failure = "Unable to sign in. Check your phone and password, or use mobile OTP.";

const passwordLogin = asyncHandler(async (req, res) => {
  const phone = loginPhone(req.body.phone);
  if (!phone || typeof req.body.password !== "string" || !req.body.password.length || req.body.password.length > 128)
    throw invalid(failure, 401);
  const user = await User.findOne({ phone, role: "customer" })
    .select("+passwordHash +passwordFailedAttempts +passwordLockedUntil");
  const matches = await verifyPassword(req.body.password, user?.passwordHash);
  if (!user || user.status !== "active" || (user.passwordLockedUntil && user.passwordLockedUntil > new Date()))
    throw invalid(failure, 401);
  if (!matches) {
    const changed = await User.findOneAndUpdate(
      { _id: user._id, passwordHash: user.passwordHash },
      { $inc: { passwordFailedAttempts: 1 } },
      { new: true },
    ).select("+passwordFailedAttempts");
    if (changed?.passwordFailedAttempts >= 5)
      await User.updateOne(
        { _id: user._id },
        { $set: { passwordLockedUntil: new Date(Date.now() + 15 * 60 * 1000), passwordFailedAttempts: 0 } },
      );
    throw invalid(failure, 401);
  }
  await User.updateOne(
    { _id: user._id, passwordHash: user.passwordHash },
    { $set: { passwordFailedAttempts: 0, passwordLockedUntil: null } },
  );
  success(res, sessionResponse(user, null, { authMethod: "password" }));
});

const setPassword = asyncHandler(async (req, res) => {
  if (!validPassword(req.body.password)) throw invalid("Use a password with 10–128 characters.");
  const user = await User.findById(req.user.id).select("+passwordHash");
  if (!user || user.role !== "customer" || user.status !== "active")
    throw invalid("Active customer account required.", 403);
  const now = Date.now() / 1000;
  const freshOtp = req.user.authMethod === "otp" && Number.isFinite(req.user.authTime) && now - req.user.authTime < 600 && req.user.authTime <= now + 30;
  if (!freshOtp) {
    if (typeof req.body.currentPassword !== "string" || req.body.currentPassword.length > 128 || !(await verifyPassword(req.body.currentPassword, user.passwordHash)))
      throw invalid("Enter your current password, or sign in again with mobile OTP to reset it.", 403);
  }
  const passwordHash = await hashPassword(req.body.password);
  const changed = await User.findOneAndUpdate(
    {
      _id: user._id,
      $or: [
        { sessionVersion: user.sessionVersion || 0 },
        ...(user.sessionVersion ? [] : [{ sessionVersion: { $exists: false } }]),
      ],
    },
    { $set: { passwordHash, passwordFailedAttempts: 0, passwordLockedUntil: null }, $inc: { sessionVersion: 1 } },
    { new: true },
  );
  if (!changed) throw invalid("Your session changed. Sign in again.", 409);
  success(res, {
    token: signToken(changed, { authMethod: "password" }),
    message: "Password saved. You can now sign in with your phone and password.",
  });
});

module.exports = { passwordLogin, setPassword };
