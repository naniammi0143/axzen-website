const mongoose = require("mongoose");
const User = require("../models/User");
const AdminUser = require("../models/AdminUser");
const BootstrapState = require("../models/BootstrapState");
const AuditLog = require("../models/AuditLog");
const { verifyPassword } = require("../utils/passwords");
const { invalid } = require("../utils/checkoutRules");
const MARKER = "first-password-superadmin";
function setupConfig() {
  try {
    const data = JSON.parse(process.env.AXZEN_SUPERADMIN_SETUP || "{}");
    if (
      !/^[a-z][a-z0-9._-]{2,39}$/.test(data.username || "") ||
      !/^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(
        data.passwordHash || "",
      ) ||
      !Number.isFinite(Date.parse(data.expiresAt)) ||
      Date.parse(data.expiresAt) <= Date.now()
    )
      return null;
    return data;
  } catch {
    return null;
  }
}
async function bootstrapSuperadmin(username, password) {
  const config = setupConfig();
  if (!config || username !== config.username) return null;
  if (!(await verifyPassword(password, config.passwordHash))) return null;
  await BootstrapState.init();
  let result;
  await mongoose.connection.transaction(async (session) => {
    if (
      (await BootstrapState.exists({ _id: MARKER }).session(session)) ||
      (await User.exists({ role: "superadmin" }).session(session))
    )
      throw invalid(
        "Initial setup is already complete. Use an existing superadmin account.",
        409,
      );
    const [user] = await User.create(
      [
        {
          username: config.username,
          name: "Axzen Owner",
          role: "superadmin",
          status: "active",
          passwordHash: config.passwordHash,
          mustChangePassword: true,
        },
      ],
      { session },
    );
    await AdminUser.create(
      [
        {
          userId: user._id,
          displayRole: "Super Admin",
          permissions: ["*"],
          activityNotes: ["Company owner"],
        },
      ],
      { session },
    );
    await BootstrapState.create([{ _id: MARKER, userId: user._id }], {
      session,
    });
    await AuditLog.create(
      [
        {
          actorId: user._id,
          actorRole: "superadmin",
          action: "superadmin.bootstrap",
          entityType: "user",
          entityId: String(user._id),
          metadata: { method: "private-server-configuration" },
        },
      ],
      { session },
    );
    result = user;
  });
  return result;
}
module.exports = { bootstrapSuperadmin, setupConfig };
