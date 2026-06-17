const loginForms = document.querySelectorAll(".portal-login-form");
const dashboardSection = document.querySelector("#dashboard");
const dashboardRole = document.querySelector("#dashboardRole");
const dashboardTitle = document.querySelector("#dashboardTitle");
const dashboardSummary = document.querySelector("#dashboardSummary");
const dashboardMetrics = document.querySelector("#dashboardMetrics");
const dashboardPanels = document.querySelector("#dashboardPanels");
const logoutButton = document.querySelector("#logoutButton");

function setLoginMessage(form, message, isError = false) {
  const messageElement = form.querySelector(".login-message");
  messageElement.textContent = message;
  messageElement.classList.toggle("error", isError);
  messageElement.style.display = "block";
}

function renderDashboard(payload) {
  const { user, dashboard } = payload;

  dashboardRole.textContent = `${user.role} dashboard`;
  dashboardTitle.textContent = dashboard.title;
  dashboardSummary.textContent = dashboard.summary;
  dashboardMetrics.innerHTML = dashboard.metrics
    .map(
      ([label, value]) => `
        <article>
          <span>${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
  dashboardPanels.innerHTML = dashboard.panels
    .map(
      (panel) => `
        <article class="dashboard-panel">
          <h3>${panel.title}</h3>
          <ul>
            ${panel.items
              .map(([title, detail]) => `<li><strong>${title}</strong><span>${detail}</span></li>`)
              .join("")}
          </ul>
        </article>
      `
    )
    .join("");

  dashboardSection.hidden = false;
  dashboardSection.scrollIntoView({ behavior: "smooth" });
}

async function loadDashboard(role, token) {
  const response = await fetch(`/api/dashboard/${role}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || "Unable to load dashboard.");
  }

  renderDashboard(result);
}

loginForms.forEach((form) => {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector("button");
    const role = form.dataset.role;
    const formData = new FormData(form);

    submitButton.disabled = true;
    submitButton.textContent = "Logging in...";

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role,
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Login failed.");
      }

      localStorage.setItem("axzenToken", result.token);
      localStorage.setItem("axzenRole", result.user.role);
      setLoginMessage(form, `Logged in as ${result.user.name}.`);
      await loadDashboard(result.user.role, result.token);
    } catch (error) {
      setLoginMessage(form, error.message, true);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = `Login as ${role}`;
    }
  });
});

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    localStorage.removeItem("axzenToken");
    localStorage.removeItem("axzenRole");
    dashboardSection.hidden = true;
    document.querySelector(".login-section").scrollIntoView({ behavior: "smooth" });
  });
}

const savedToken = localStorage.getItem("axzenToken");
const savedRole = localStorage.getItem("axzenRole");
const pageRole = document.querySelector(".portal-login-form")?.dataset.role;

if (savedToken && savedRole && savedRole === pageRole) {
  loadDashboard(savedRole, savedToken).catch(() => {
    localStorage.removeItem("axzenToken");
    localStorage.removeItem("axzenRole");
  });
}
