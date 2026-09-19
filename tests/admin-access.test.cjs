const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-only-admin-access-not-production";
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const User = require("../src/models/User");
const AdminUser = require("../src/models/AdminUser");
const BootstrapState = require("../src/models/BootstrapState");
const { hashPassword } = require("../src/utils/passwords");
const {
  bootstrapSuperadmin,
  provisionConfiguredSuperadmin,
  setupConfig,
} = require("../src/services/bootstrapSuperadmin");
let db, server, base, config;
const temporary = "test-only-temporary-password",
  replacement = "test-only-new-private-password";
async function request(route, body, token, method = "POST") {
  const response = await fetch(base + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}
before(async () => {
  db = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: "7.0.24" },
  });
  await mongoose.connect(db.getUri());
  const app = require("../src/app");
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  config = {
    username: "test.owner",
    passwordHash: await hashPassword(temporary),
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
});
after(async () => {
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  await mongoose.disconnect();
  await db?.stop();
});
test("private bootstrap, restricted initial session, password rotation and replay protection", async () => {
  delete process.env.AXZEN_SUPERADMIN_SETUP;
  assert.equal(await bootstrapSuperadmin(config.username, temporary), null);
  process.env.AXZEN_SUPERADMIN_SETUP = JSON.stringify({
    ...config,
    expiresAt: "2020-01-01",
  });
  assert.equal(setupConfig(), null);
  process.env.AXZEN_SUPERADMIN_SETUP = JSON.stringify(config);
  assert.equal(
    await bootstrapSuperadmin(config.username, "wrong password"),
    null,
  );
  assert.equal(await User.countDocuments({ role: "superadmin" }), 0);

  const protectedOwner = await User.create({
    name: "Configured Owner",
    username: "configured.owner",
    role: "superadmin",
    status: "active",
    passwordHash: config.passwordHash,
  });
  assert.equal(await provisionConfiguredSuperadmin(), undefined);
  assert.equal(await BootstrapState.countDocuments(), 0);
  assert.equal(
    (await User.findById(protectedOwner._id)).username,
    "configured.owner",
  );
  await User.deleteOne({ _id: protectedOwner._id });

  const phoneOnlyOwner = await User.create({
    name: "Existing Phone Owner",
    phone: "+919000000099",
    role: "superadmin",
    status: "active",
  });
  const provisioned = await provisionConfiguredSuperadmin();
  assert.equal(String(provisioned._id), String(phoneOnlyOwner._id));
  assert.equal(provisioned.username, config.username);
  assert.equal(await provisionConfiguredSuperadmin(), undefined);
  const login = (password) =>
    request("/api/auth/admin-password-login", {
      username: config.username,
      password,
    });
  let result = await login(temporary);
  assert.equal(result.status, 200);
  assert.equal(result.body.requiresPasswordChange, true);
  assert.equal(result.body.user.role, "superadmin");
  assert.equal(JSON.stringify(result.body).includes("passwordHash"), false);
  const limited = result.body.token;
  assert.equal(
    (await request("/api/admin/sellers", null, limited, "GET")).status,
    403,
  );
  assert.equal(
    (await request("/api/dashboard/superadmin", null, limited, "GET")).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/auth/admin-password",
        { password: "short" },
        limited,
        "PUT",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        "/api/auth/admin-password",
        { password: temporary },
        limited,
        "PUT",
      )
    ).status,
    400,
  );
  result = await request(
    "/api/auth/admin-password",
    { password: replacement },
    limited,
    "PUT",
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.requiresPasswordChange, false);
  const full = result.body.token;
  assert.equal(
    (await request("/api/admin/sellers", null, limited, "GET")).status,
    401,
  );
  assert.equal(
    (await request("/api/admin/sellers", null, full, "GET")).status,
    200,
  );
  assert.equal(
    (await request("/api/admin/audit-logs", null, full, "GET")).status,
    200,
  );
  assert.equal((await login(temporary)).status, 401);
  assert.equal((await login(replacement)).status, 200);
  assert.equal((await AdminUser.findOne({})).permissions[0], "*");
  assert.equal(await BootstrapState.countDocuments(), 1);
  await assert.rejects(
    bootstrapSuperadmin(config.username, temporary),
    /already complete/,
  );
  assert.equal(await User.countDocuments({ role: "superadmin" }), 1);
  // A rotated account can change its password only with its current password.
  assert.equal(
    (
      await request(
        "/api/auth/admin-password",
        { password: "another-test-password" },
        full,
        "PUT",
      )
    ).status,
    403,
  );
  for (let i = 0; i < 5; i++)
    assert.equal((await login("wrong-password")).status, 401);
  assert.equal((await login(replacement)).status, 401);
  const owner = await User.findOne({ username: config.username }).select(
    "+passwordLockedUntil",
  );
  assert.ok(owner.passwordLockedUntil > Date.now());
  await User.updateOne(
    { _id: owner._id },
    { $set: { passwordLockedUntil: null, status: "blocked" } },
  );
  assert.equal((await login(replacement)).status, 401);
  assert.equal(
    (await request("/api/admin/sellers", null, full, "GET")).status,
    401,
  );
  // Consumed marker survives removal of the account; setup cannot recreate an owner.
  await User.deleteOne({ _id: owner._id });
  await assert.rejects(
    bootstrapSuperadmin(config.username, temporary),
    /already complete/,
  );
});
