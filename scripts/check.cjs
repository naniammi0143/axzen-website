const fs = require("fs"),
  path = require("path"),
  cp = require("child_process");
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? ["node_modules", ".git", "mobile-www"].includes(e.name)
          ? []
          : files(path.join(dir, e.name))
        : [path.join(dir, e.name)],
    );
}
const source = files(".").filter((f) => /\.(?:js|cjs)$/.test(f));
let failed = false;
for (const file of source) {
  const result = cp.spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (result.status) {
    console.error(result.stderr);
    failed = true;
  }
}
console.log(`${source.length} JavaScript files checked.`);
process.exitCode = failed ? 1 : 0;
