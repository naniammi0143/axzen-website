const mongoose = require('mongoose');
const User = require('../models/User');
const Seller = require('../models/Seller');
const AuditLog = require('../models/AuditLog');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/apiResponse');
const { invalid } = require('../utils/checkoutRules');
const { text } = require('../utils/storeRules');
const { validPassword, hashPassword, verifyPassword, loginPhone } = require('../utils/passwords');
const { signToken, sessionResponse } = require('./authController');
const failure = 'Unable to sign in. Check your phone and password, or use mobile OTP.';

const createStore = asyncHandler(async (req, res) => {
  const phone = loginPhone(req.body.phone);
  if (!phone) throw invalid('Enter a valid owner mobile number, including country code.');
  const fullName = text(req.body.fullName, 100, 'owner name');
  const businessName = text(req.body.businessName, 150, 'store name');
  if (!fullName || !businessName) throw invalid('Owner name and store name are required.');
  const access = req.body.access || 'otp';
  if (!['otp', 'password'].includes(access)) throw invalid('Choose OTP or OTP and password access.');
  if (access === 'password' && !validPassword(req.body.password)) throw invalid('Use a password with 10–128 characters.');
  if (access === 'otp' && req.body.password) throw invalid('Choose password access before setting a password.');
  const email = text(req.body.email ?? "", 254, 'email').toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid('Enter a valid email.');
  const pincode = text(req.body.pincode ?? "", 6, 'pincode');
  if (pincode && !/^[1-9]\d{5}$/.test(pincode)) throw invalid('Enter a valid six-digit pincode.');
  const passwordHash = access === 'password' ? await hashPassword(req.body.password) : '';
  const details = { fullName, businessName, phone, email, pincode,
    category: text(req.body.category ?? "", 80, 'category') || 'General',
    city: text(req.body.city ?? "", 100, 'city'), state: text(req.body.state ?? "", 100, 'state'),
    pickupAddress: text(req.body.pickupAddress ?? "", 500, 'pickup address') };
  let seller;
  await mongoose.connection.transaction(async session => {
    if (await User.exists({ phone, role: 'seller' }).session(session))
      throw invalid('This phone already has a seller account. Open its existing store instead.', 409);
    const [user] = await User.create([{ name: fullName, phone, email: email || undefined, role: 'seller', status: 'pending', passwordHash }], { session });
    [seller] = await Seller.create([{ ...details, userId: user._id, approvalStatus: 'pending', kycStatus: 'pending', status: 'inactive', isActive: false, payoutEnabled: false }], { session });
    await AuditLog.create([{ actorId: req.user.id, actorRole: req.user.role, action: 'seller.create', entityType: 'seller', entityId: String(seller._id), metadata: { access, approvalStatus: 'pending' } }], { session });
  });
  success(res, { seller, access, message: 'Store created. Review the seller details and KYC before approval.' }, 201);
});

const passwordLogin = asyncHandler(async (req, res) => {
  const phone = loginPhone(req.body.phone);
  if (!phone || typeof req.body.password !== 'string' || !req.body.password.length || req.body.password.length > 128 || (req.body.role && req.body.role !== 'seller'))
    throw invalid(failure, 401);
  const user = await User.findOne({ phone, role: 'seller' }).select('+passwordHash +passwordFailedAttempts +passwordLockedUntil');
  const matches = await verifyPassword(req.body.password, user?.passwordHash);
  if (!user || user.status === 'blocked' || user.passwordLockedUntil > new Date()) throw invalid(failure, 401);
  if (!matches) {
    // Persistent account backoff applies across serverless instances.
    const changed = await User.findOneAndUpdate({ _id: user._id, passwordHash: user.passwordHash }, { $inc: { passwordFailedAttempts: 1 } }, { new: true }).select('+passwordFailedAttempts');
    if (changed?.passwordFailedAttempts >= 5) await User.updateOne({ _id: user._id }, { $set: { passwordLockedUntil: new Date(Date.now() + 15 * 60 * 1000), passwordFailedAttempts: 0 } });
    throw invalid(failure, 401);
  }
  const seller = await Seller.findOne({ userId: user._id });
  if (!seller || seller.status === 'blocked') throw invalid(failure, 401);
  await User.updateOne({ _id: user._id, passwordHash: user.passwordHash }, { $set: { passwordFailedAttempts: 0, passwordLockedUntil: null } });
  if (!user.passwordHash.startsWith('scrypt-v1$')) {
    await User.updateOne({ _id: user._id, passwordHash: user.passwordHash }, { $set: { passwordHash: await hashPassword(req.body.password) } });
  }
  success(res, sessionResponse(user, seller, { authMethod: 'password' }));
});

const setSellerPassword = asyncHandler(async (req, res) => {
  if (!validPassword(req.body.password)) throw invalid('Use a password with 10–128 characters.');
  const user = await User.findById(req.user.id).select('+passwordHash');
  const freshOtp = req.user.authMethod === 'otp' && Number.isFinite(req.user.authTime) && Date.now() / 1000 - req.user.authTime < 600 && req.user.authTime <= Date.now() / 1000 + 30;
  if (!freshOtp) {
    if (typeof req.body.currentPassword !== 'string' || req.body.currentPassword.length > 128 || !(await verifyPassword(req.body.currentPassword, user.passwordHash)))
      throw invalid('Enter your current password, or sign in again with mobile OTP to reset it.', 403);
  }
  const passwordHash = await hashPassword(req.body.password);
  const changed = await User.findOneAndUpdate({ _id: user._id, $or: [{ sessionVersion: user.sessionVersion || 0 }, ...(user.sessionVersion ? [] : [{ sessionVersion: { $exists: false } }])] }, { $set: { passwordHash, passwordFailedAttempts: 0, passwordLockedUntil: null }, $inc: { sessionVersion: 1 } }, { new: true });
  if (!changed) throw invalid('Your session changed. Sign in again.', 409);
  success(res, { token: signToken(changed, { authMethod: 'password' }), message: 'Password saved. Other sessions have been signed out.' });
});
module.exports = { createStore, passwordLogin, setSellerPassword };
