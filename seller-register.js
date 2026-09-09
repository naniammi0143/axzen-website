import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";
import {
  getAuth,
  signInWithPhoneNumber,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { getPhoneVerifier, prepareFirebasePhoneAuth, resetPhoneVerifier, withTimeout } from "./firebase-phone.js";
import {
  fillCountrySelects,
  isValidE164,
  otpAuthErrorMessage,
  phoneFromRoot,
} from "./phone-countries.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
prepareFirebasePhoneAuth(auth);
try {
  getAnalytics(app);
} catch (error) {
  void error;
}
const form = document.querySelector("#sellerRegisterForm");
const message = document.querySelector("#sellerRegisterMessage");
const sendOtpButton = document.querySelector("[data-send-register-otp]");
const verifyOtpButton = document.querySelector("[data-verify-register-otp]");
const otpField = form.querySelector(".otp-field");
const mobileInput = form.querySelector("[name='mobile']");
const storeInput = form.querySelector("[name='storeName']");
const businessInput = form.querySelector("[name='businessType']");
const fullNameInput = form.querySelector("[name='fullName']");
const firebaseTokenInput = form.querySelector("[name='firebaseToken']");
const submitButton = form.querySelector("button[type='submit']");
const verifiedBanner = document.querySelector("#sellerVerifiedBanner");
const verifiedName = document.querySelector("#sellerVerifiedName");
const successDrop = document.querySelector("#sellerRegisterSuccess");
const maxFileSize = 5 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

let confirmationResult = null;
let verifiedPhone = "";

fillCountrySelects(form);

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
  message.style.display = "block";
}

async function resetRecaptcha() {
  await resetPhoneVerifier("recaptcha-seller-register");
}

async function getRecaptcha() {
  return getPhoneVerifier(auth, "recaptcha-seller-register");
}

function registerPhone() {
  return phoneFromRoot(form);
}

function validateFirstStep() {
  const { iso, e164 } = registerPhone();
  if (!isValidE164(e164, iso)) return "Enter a valid mobile number for the selected country.";
  if (!storeInput.value.trim()) return "Seller company name is required.";
  if (!businessInput.value.trim()) return "Business type is required.";
  if (!fullNameInput.value.trim()) return "Contact person name is required.";
  return "";
}

function setAfterOtpEnabled(enabled) {
  document.querySelectorAll("[data-after-otp]").forEach((section) => {
    section.hidden = !enabled;
    section.querySelectorAll("input, textarea, select").forEach((field) => {
      field.disabled = !enabled;
    });
  });
  submitButton.disabled = !enabled;
}

function validateFile(file, label) {
  if (!file) return `${label} is required.`;
  if (!allowedTypes.has(file.type)) return `${label} must be PDF, JPG, or PNG.`;
  if (file.size > maxFileSize) return `${label} must be 5MB or smaller.`;
  return "";
}

function validateForm(formData) {
  const firstStepError = validateFirstStep();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const pincode = String(formData.get("pincode") || "").trim();
  const ifsc = String(formData.get("ifsc") || "").trim();

  if (firstStepError) return firstStepError;
  if (!formData.get("firebaseToken")) return "Please verify mobile OTP first.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Email must be valid.";
  if (password !== confirmPassword) return "Password and confirm password must match.";
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/^\d{6}$/.test(pincode)) return "Pincode must be 6 digits.";
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifsc)) return "IFSC format is invalid.";
  if (formData.get("marketplaceTerms") !== "on") return "Accept marketplace seller terms.";
  if (formData.get("kycConsent") !== "on") return "Accept KYC consent.";
  if (formData.get("taxCompliance") !== "on") return "Accept tax compliance declaration.";
  if (formData.get("payoutPolicy") !== "on") return "Accept payout and return policy.";

  return (
    validateFile(formData.get("panDocument"), "PAN document") ||
    validateFile(formData.get("kycDocument"), "Aadhaar/GST/KYC document")
  );
}

setAfterOtpEnabled(false);

sendOtpButton.addEventListener("click", async () => {
  const validationError = validateFirstStep();
  if (validationError) {
    showMessage(validationError, true);
    return;
  }

  sendOtpButton.disabled = true;
  sendOtpButton.textContent = "Sending OTP...";

  const { e164 } = registerPhone();
  const countrySelect = form.querySelector("[data-country-select]");

  try {
    confirmationResult = await withTimeout(signInWithPhoneNumber(auth, e164, await getRecaptcha()), 45000);
    verifiedPhone = e164;
    mobileInput.readOnly = true;
    if (countrySelect) countrySelect.disabled = true;
    otpField.hidden = false;
    verifyOtpButton.hidden = false;
    showMessage(`OTP sent to ${e164}.`);
  } catch (error) {
    verifiedPhone = "";
    mobileInput.readOnly = false;
    if (countrySelect) countrySelect.disabled = false;
    await resetRecaptcha();
    showMessage(otpAuthErrorMessage(error), true);
    sendOtpButton.disabled = false;
    sendOtpButton.textContent = "Send OTP";
  }
});

verifyOtpButton.addEventListener("click", async () => {
  const otp = form.querySelector("[name='otp']").value.trim();
  if (!confirmationResult || otp.length < 4) {
    showMessage("Enter the OTP sent to your mobile.", true);
    return;
  }

  verifyOtpButton.disabled = true;
  verifyOtpButton.textContent = "Verifying...";

  try {
    const credential = await confirmationResult.confirm(otp);
    firebaseTokenInput.value = await credential.user.getIdToken();
    setAfterOtpEnabled(true);
    verifiedName.textContent = fullNameInput.value.trim();
    verifiedBanner.hidden = false;
    sendOtpButton.hidden = true;
    verifyOtpButton.hidden = true;
    otpField.hidden = true;
    showMessage("Mobile verified. Complete the remaining seller details.");
  } catch (error) {
    showMessage("OTP is incorrect or expired. Enter the latest SMS OTP.", true);
    verifyOtpButton.disabled = false;
    verifyOtpButton.textContent = "Verify OTP";
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  if (verifiedPhone) formData.set("mobile", verifiedPhone);
  const validationError = validateForm(formData);

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
    fillCountrySelects(form);
    setAfterOtpEnabled(false);
    verifiedBanner.hidden = true;
    mobileInput.readOnly = false;
    const countrySelect = form.querySelector("[data-country-select]");
    if (countrySelect) countrySelect.disabled = false;
    sendOtpButton.hidden = false;
    sendOtpButton.disabled = false;
    sendOtpButton.textContent = "Send OTP";
    firebaseTokenInput.value = "";
    confirmationResult = null;
    verifiedPhone = "";
    successDrop.hidden = false;
    successDrop.scrollIntoView({ behavior: "smooth", block: "center" });
    showMessage("Wait for admin approval.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    submitButton.disabled = !firebaseTokenInput.value;
    submitButton.textContent = "Submit seller registration";
  }
});
