const form = document.querySelector("#sellerRegisterForm");
const message = document.querySelector("#sellerRegisterMessage");
const maxFileSize = 5 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
  message.style.display = "block";
}

function validateFile(file, label) {
  if (!file) return `${label} is required.`;
  if (!allowedTypes.has(file.type)) return `${label} must be PDF, JPG, or PNG.`;
  if (file.size > maxFileSize) return `${label} must be 5MB or smaller.`;
  return "";
}

function validateForm(formData) {
  const mobile = String(formData.get("mobile") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const pincode = String(formData.get("pincode") || "").trim();
  const ifsc = String(formData.get("ifsc") || "").trim();

  if (!/^\d{10}$/.test(mobile)) return "Mobile number must be 10 digits.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Email must be valid.";
  if (password !== confirmPassword) return "Password and confirm password must match.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/^\d{6}$/.test(pincode)) return "Pincode must be 6 digits.";
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifsc)) return "IFSC format is invalid.";

  return (
    validateFile(formData.get("panDocument"), "PAN document") ||
    validateFile(formData.get("kycDocument"), "Aadhaar/GST/KYC document")
  );
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const validationError = validateForm(formData);
  const submitButton = form.querySelector("button[type='submit']");

  if (validationError) {
    showMessage(validationError, true);
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";
  showMessage("Submitting your registration...");

  try {
    const response = await fetch("/api/sellers/register", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || "Registration failed.");
    }

    form.reset();
    showMessage("Registration submitted successfully. Your account is waiting for admin approval.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit seller registration";
  }
});
