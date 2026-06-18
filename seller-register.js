import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  RecaptchaVerifier,
  getAuth,
  signInWithPhoneNumber,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBfdpqGOahFlX-vFROEFMvVEX9anZV5TG4",
  authDomain: "axzen-c70e1.firebaseapp.com",
  projectId: "axzen-c70e1",
  storageBucket: "axzen-c70e1.firebasestorage.app",
  messagingSenderId: "619605129554",
  appId: "1:619605129554:web:c74e25667a949dac07228b",
  measurementId: "G-X2QK2EGX7P",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
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
const maxFileSize = 5 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png"]);

let confirmationResult = null;
let recaptchaVerifier = null;

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
  message.style.display = "block";
}

function getRecaptcha() {
  if (!recaptchaVerifier) {
    recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-seller-register", {
      size: "invisible",
    });
  }
  return recaptchaVerifier;
}

function normalizedPhone() {
  return String(mobileInput.value || "").replace(/\D/g, "");
}

function validateFirstStep() {
  if (!/^\d{10}$/.test(normalizedPhone())) return "Mobile number must be 10 digits.";
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

  try {
    confirmationResult = await signInWithPhoneNumber(auth, `+91${normalizedPhone()}`, getRecaptcha());
    mobileInput.readOnly = true;
    otpField.hidden = false;
    verifyOtpButton.hidden = false;
    showMessage(`OTP sent to +91${normalizedPhone()}.`);
  } catch (error) {
    showMessage(error.message || "Unable to send OTP.", true);
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
    setAfterOtpEnabled(false);
    verifiedBanner.hidden = true;
    mobileInput.readOnly = false;
    sendOtpButton.hidden = false;
    sendOtpButton.disabled = false;
    sendOtpButton.textContent = "Send OTP";
    firebaseTokenInput.value = "";
    confirmationResult = null;
    showMessage("Registration submitted successfully. Your account is waiting for admin approval.");
  } catch (error) {
    showMessage(error.message, true);
  } finally {
    submitButton.disabled = !firebaseTokenInput.value;
    submitButton.textContent = "Submit seller registration";
  }
});
