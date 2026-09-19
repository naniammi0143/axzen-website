let challengeToken = "";
export function requireAdminPasswordChange(result) {
  if (!result.requiresPasswordChange) return false;
  const form = document.querySelector("#adminPasswordChange");
  if (!form)
    throw new Error("Open the admin website to finish setting your password.");
  challengeToken = result.token;
  document.querySelector("#adminLoginMethods").hidden = true;
  document.querySelector("#adminPasswordLogin").hidden = true;
  document.querySelector('.firebase-phone-form[data-role="admin"]').hidden =
    true;
  form.hidden = false;
  document.querySelector("#adminLoginHeading").textContent =
    "Set your own password";
  form.querySelector('[name="password"]').focus();
  return true;
}
export function initAdminAccess(acceptSession) {
  const login = document.querySelector("#adminPasswordLogin");
  if (!login) return;
  const change = document.querySelector("#adminPasswordChange");
  const otp = document.querySelector('.firebase-phone-form[data-role="admin"]');
  const methods = document.querySelector("#adminLoginMethods");
  const heading = document.querySelector("#adminLoginHeading");
  methods.querySelectorAll("button").forEach((button) =>
    button.addEventListener("click", () => {
      const password = button.dataset.adminLoginMethod === "password";
      login.hidden = !password;
      otp.hidden = password;
      heading.textContent = password
        ? "Sign in to company control"
        : "Verify your phone";
      methods
        .querySelectorAll("button")
        .forEach((item) =>
          item.setAttribute("aria-pressed", String(item === button)),
        );
      login.reset();
    }),
  );
  change
    .querySelector("[data-cancel-password]")
    .addEventListener("click", () => {
      challengeToken = "";
      change.reset();
      change.hidden = true;
      methods.hidden = false;
      login.hidden = false;
      heading.textContent = "Sign in to company control";
    });
  async function submit(form, route, body, token) {
    const button = form.querySelector('[type="submit"]');
    const message = form.querySelector(".login-message");
    button.disabled = true;
    message.textContent = "Please wait…";
    try {
      const response = await fetch(route, {
        method: token ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message || "Unable to sign in. Please try again.",
        );
      form.reset();
      message.textContent = "";
      if (requireAdminPasswordChange(result)) return;
      challengeToken = "";
      await acceptSession(result);
    } catch (error) {
      message.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  }
  login.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(login);
    submit(login, "/api/auth/admin-password-login", {
      username: data.get("username"),
      password: data.get("password"),
    });
  });
  change.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(change);
    if (data.get("password") !== data.get("confirmPassword")) {
      change.querySelector(".login-message").textContent =
        "The passwords do not match.";
      return;
    }
    if (!challengeToken) return;
    submit(
      change,
      "/api/auth/admin-password",
      { password: data.get("password") },
      challengeToken,
    );
  });
}
