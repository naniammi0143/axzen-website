const Seller = require("../models/Seller");
const SupportTicket = require("../models/SupportTicket");
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/apiResponse");

async function getSeller(req) {
  const seller = await Seller.findOne({ userId: req.user.id });
  if (!seller) {
    const error = new Error("Seller profile not found.");
    error.statusCode = 404;
    throw error;
  }
  return seller;
}

const listSellerTickets = asyncHandler(async (req, res) => {
  const seller = await getSeller(req);
  const tickets = await SupportTicket.find({ sellerId: seller._id }).sort({ createdAt: -1 }).lean();
  success(res, { tickets });
});

const createSellerTicket = asyncHandler(async (req, res) => {
  const seller = await getSeller(req);
  if (!req.body.message) {
    res.status(400).json({ ok: false, message: "Complaint message is required." });
    return;
  }

  const ticket = await SupportTicket.create({
    ticketId: `AXZ-TKT-${Date.now()}`,
    sellerId: seller._id,
    sellerName: seller.businessName,
    userId: req.user.id,
    category: req.body.category || "other",
    message: req.body.message,
  });

  success(res, { ticket }, 201);
});

const listAdminTickets = asyncHandler(async (req, res) => {
  const tickets = await SupportTicket.find().sort({ createdAt: -1 }).limit(300).lean();
  success(res, { tickets });
});

const updateAdminTicket = asyncHandler(async (req, res) => {
  const update = {};
  if (req.body.status) update.status = req.body.status;
  if (req.body.departmentNote !== undefined) update.departmentNote = req.body.departmentNote;
  if (req.body.status === "closed") update.closedAt = new Date();

  const ticket = await SupportTicket.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
  if (!ticket) {
    res.status(404).json({ ok: false, message: "Ticket not found." });
    return;
  }
  success(res, { ticket });
});

module.exports = {
  createSellerTicket,
  listAdminTickets,
  listSellerTickets,
  updateAdminTicket,
};
