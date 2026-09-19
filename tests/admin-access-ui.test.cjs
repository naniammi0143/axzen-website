const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
async function tick() {
  for (let i = 0; i < 6; i++)
    await new Promise((resolve) => setImmediate(resolve));
}
test("temporary credentials require a private password before accepting a portal session", async () => {
  const dom = new JSDOM(fs.readFileSync("admin.html", "utf8"), {
    url: "https://admin.axzen.in",
    runScripts: "outside-only",
  });
  const w = dom.window,
    calls = [],
    accepted = [];
  w.eval(fs.readFileSync("admin-access.js", "utf8").replaceAll("export ", ""));
  w.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () =>
        url.endsWith("-login")
          ? { token: "limited-test-token", requiresPasswordChange: true }
          : {
              token: "full-test-token",
              requiresPasswordChange: false,
              user: { role: "superadmin" },
            },
    };
  };
  w.initAdminAccess((result) => accepted.push(result));
  const login = w.document.querySelector("#adminPasswordLogin"),
    change = w.document.querySelector("#adminPasswordChange");
  login.querySelector("[name=username]").value = "test.owner";
  login.querySelector("[name=password]").value = "test-only-temporary-password";
  login.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await tick();
  assert.equal(accepted.length, 0);
  assert.equal(change.hidden, false);
  assert.equal(login.hidden, true);
  assert.equal(w.localStorage.length, 0);
  change.querySelector("[name=password]").value =
    "my-new-private-test-password";
  change.querySelector("[name=confirmPassword]").value = "does-not-match";
  change.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await tick();
  assert.equal(calls.length, 1);
  change.querySelector("[name=confirmPassword]").value =
    "my-new-private-test-password";
  change.dispatchEvent(new w.Event("submit", { cancelable: true }));
  await tick();
  assert.equal(
    calls[1].options.headers.Authorization,
    "Bearer limited-test-token",
  );
  assert.equal(calls[1].options.method, "PUT");
  assert.equal(accepted[0].token, "full-test-token");
  assert.equal(change.querySelector("[name=password]").value, "");
  dom.window.close();
});
