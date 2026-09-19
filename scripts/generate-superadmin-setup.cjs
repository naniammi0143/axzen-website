const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { hashPassword } = require("../src/utils/passwords");
async function main() {
  const output = process.argv[2];
  if (!output || !path.isAbsolute(output))
    throw new Error("Pass an absolute output path outside the repository.");
  const root = path.resolve(__dirname, "..");
  if (path.resolve(output).startsWith(root + path.sep))
    throw new Error("Store these private credentials outside the repository.");
  const username = "axzen.owner",
    password = randomBytes(21).toString("base64url");
  const setup = {
    username,
    passwordHash: await hashPassword(password),
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  };
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        username,
        password,
        environmentVariable: "AXZEN_SUPERADMIN_SETUP",
        environmentValue: JSON.stringify(setup),
      },
      null,
      2,
    ),
    { mode: 0o600, flag: "wx" },
  );
  console.log(
    "Private setup file created. Configure the production environment before signing in.",
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
