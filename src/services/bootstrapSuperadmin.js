const mongoose = require("mongoose");
const User = require("../models/User");
const AdminUser = require("../models/AdminUser");
const BootstrapState = require("../models/BootstrapState");
const AuditLog = require("../models/AuditLog");
const { loginPhone, verifyPassword } = require("../utils/passwords");
const { invalid } = require("../utils/checkoutRules");
const MARKER = "first-password-superadmin";
const PHONE_MARKER = "configured-phone-superadmin";
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
  return createConfiguredSuperadmin(config, false);
}

async function createConfiguredSuperadmin(config, allowExisting) {
  await BootstrapState.init();
  let result;
  await mongoose.connection.transaction(async (session) => {
    if (await BootstrapState.exists({ _id: MARKER }).session(session)) {
      if (allowExisting) return;
      throw invalid(
        "Initial setup is already complete. Use an existing superadmin account.",
        409,
      );
    }

    const existingOwners = await User.find({ role: "superadmin" })
      .select("+passwordHash")
      .session(session);
    if (existingOwners.length) {
      const owner = existingOwners.length === 1 ? existingOwners[0] : null;
      const canAttachCredentials =
        owner &&
        owner.status === "active" &&
        !owner.username &&
        !owner.passwordHash;

      if (!canAttachCredentials) {
        if (allowExisting) return;
        throw invalid(
          "Initial setup is already complete. Use an existing superadmin account.",
          409,
        );
      }

      owner.username = config.username;
      owner.passwordHash = config.passwordHash;
      owner.mustChangePassword = true;
      await owner.save({ session });
      await AdminUser.findOneAndUpdate(
        { userId: owner._id },
        {
          $set: { displayRole: "Super Admin" },
          $addToSet: {
            permissions: "*",
            activityNotes: "Company owner",
          },
        },
        { upsert: true, session },
      );
      await BootstrapState.create([{ _id: MARKER, userId: owner._id }], {
        session,
      });
      await AuditLog.create(
        [
          {
            actorId: owner._id,
            actorRole: "superadmin",
            action: "superadmin.bootstrap.credentials_attached",
            entityType: "user",
            entityId: String(owner._id),
            metadata: { method: "private-server-configuration" },
          },
        ],
        { session },
      );
      result = owner;
      return;
    }

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

async function provisionConfiguredSuperadmin() {
  const config = setupConfig();
  if (!config) return null;
  return createConfiguredSuperadmin(config, true);
}

async function provisionConfiguredSuperadminPhone() {
  const phone = loginPhone(process.env.AXZEN_SUPERADMIN_PHONE || "");
  if (!phone) return null;
  await BootstrapState.init();
  let result;
  await mongoose.connection.transaction(async (session) => {
    if (await BootstrapState.exists({ _id: PHONE_MARKER }).session(session))
      return;

    const staff = await User.find({
      phone,
      role: {
        $in: [
          "superadmin",
          "admin",
          "support",
          "finance",
          "delivery_manager",
        ],
      },
    }).session(session);
    let owner =
      staff.find((candidate) => candidate.role === "superadmin") ||
      staff.find((candidate) => candidate.role === "admin") ||
      staff[0];

    if (owner) {
      owner.role = "superadmin";
      owner.status = "active";
      owner.mustChangePassword = false;
      owner.sessionVersion = (owner.sessionVersion || 0) + 1;
      await owner.save({ session });
    } else {
      [owner] = await User.create(
        [
          {
            phone,
            name: "Axzen Owner",
            role: "superadmin",
            status: "active",
            mustChangePassword: false,
          },
        ],
        { session },
      );
    }

    await AdminUser.findOneAndUpdate(
      { userId: owner._id },
      {
        $set: { displayRole: "Super Admin" },
        $addToSet: {
          permissions: "*",
          activityNotes: "Company owner - phone OTP",
        },
      },
      { upsert: true, session },
    );
    await BootstrapState.create([{ _id: PHONE_MARKER, userId: owner._id }], {
      session,
    });
    await AuditLog.create(
      [
        {
          actorId: owner._id,
          actorRole: "superadmin",
          action: "superadmin.phone.provisioned",
          entityType: "user",
          entityId: String(owner._id),
          metadata: { method: "private-server-configuration" },
        },
      ],
      { session },
    );
    result = owner;
  });
  return result;
}

module.exports = {
  bootstrapSuperadmin,
  provisionConfiguredSuperadmin,
  provisionConfiguredSuperadminPhone,
  setupConfig,
};
