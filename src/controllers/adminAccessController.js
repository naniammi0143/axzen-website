const User = require("../models/User");
const AdminUser = require("../models/AdminUser");
const AuditLog = require("../models/AuditLog");
const { sessionResponse } = require("./authController");
const { bootstrapSuperadmin } = require("../services/bootstrapSuperadmin");
const {
  hashPassword,
  verifyPassword,
  validPassword,
  loginPhone,
} = require("../utils/passwords");
const { invalid } = require("../utils/checkoutRules");
const { success } = require("../utils/apiResponse");
const asyncHandler = require("../utils/asyncHandler");
const roles = ["superadmin", "admin"];
const failure = "Unable to sign in. Check your username and password.";
const passwordLogin = asyncHandler(async (req, res) => {
  if (
    typeof req.body.username !== "string" ||
    req.body.username.length > 50 ||
    typeof req.body.password !== "string" ||
    !req.body.password.length ||
    req.body.password.length > 128
  )
    throw invalid(failure, 401);
  const username = req.body.username.trim().toLowerCase();
  const phone = loginPhone(username);
  let user = await User.findOne({
    ...(phone ? { phone } : { username }),
    role: { $in: roles },
  }).select("+passwordHash +passwordFailedAttempts +passwordLockedUntil");
  if (!user) user = await bootstrapSuperadmin(username, req.body.password);
  const matches = await verifyPassword(req.body.password, user?.passwordHash);
  if (
    !user ||
    user.status !== "active" ||
    user.passwordLockedUntil > new Date()
  )
    throw invalid(failure, 401);
  if (!matches) {
    const updated = await User.findOneAndUpdate(
      { _id: user._id, passwordHash: user.passwordHash },
      { $inc: { passwordFailedAttempts: 1 } },
      { new: true },
    ).select("+passwordFailedAttempts");
    if (updated?.passwordFailedAttempts >= 5)
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            passwordFailedAttempts: 0,
            passwordLockedUntil: new Date(Date.now() + 15 * 60 * 1000),
          },
        },
      );
    throw invalid(failure, 401);
  }
  const profile = await AdminUser.findOne({ userId: user._id });
  if (!profile) throw invalid(failure, 401);
  await User.updateOne(
    { _id: user._id, passwordHash: user.passwordHash },
    { $set: { passwordFailedAttempts: 0, passwordLockedUntil: null } },
  );
  success(res, sessionResponse(user, profile, { authMethod: "password" }));
});
const changePassword = asyncHandler(async (req, res) => {
  if (!validPassword(req.body.password) || req.body.password.length < 14)
    throw invalid("Use a new password with 14–128 characters.");
  const user = await User.findById(req.user.id).select("+passwordHash");
  if (!user || !roles.includes(user.role))
    throw invalid("Admin account required.", 403);
  if (
    !user.mustChangePassword &&
    (typeof req.body.currentPassword !== "string" ||
      req.body.currentPassword.length > 128 ||
      !(await verifyPassword(req.body.currentPassword, user.passwordHash)))
  )
    throw invalid("Your current password is incorrect.", 403);
  if (await verifyPassword(req.body.password, user.passwordHash))
    throw invalid(
      "Choose a different password from the temporary or current password.",
    );
  const passwordHash = await hashPassword(req.body.password);
  const updated = await User.findOneAndUpdate(
    {
      _id: user._id,
      $or: [
        { sessionVersion: user.sessionVersion || 0 },
        ...(user.sessionVersion
          ? []
          : [{ sessionVersion: { $exists: false } }]),
      ],
    },
    {
      $set: {
        passwordHash,
        mustChangePassword: false,
        passwordFailedAttempts: 0,
        passwordLockedUntil: null,
      },
      $inc: { sessionVersion: 1 },
    },
    { new: true },
  );
  if (!updated) throw invalid("Your session changed. Sign in again.", 409);
  await AuditLog.create({
    actorId: user._id,
    actorRole: user.role,
    action: "admin.password.change",
    entityType: "user",
    entityId: String(user._id),
  });
  const profile = await AdminUser.findOne({ userId: user._id });
  success(res, sessionResponse(updated, profile, { authMethod: "password" }));
});
module.exports = { passwordLogin, changePassword };
