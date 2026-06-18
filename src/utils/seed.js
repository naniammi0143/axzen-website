const Category = require("../models/Category");
const Product = require("../models/Product");
const Seller = require("../models/Seller");
const User = require("../models/User");

async function seedDefaults() {
  await Category.bulkWrite(
    ["Grocery", "Fashion", "Electronics", "Home"].map((name) => ({
      updateOne: {
        filter: { slug: name.toLowerCase() },
        update: { $setOnInsert: { name, slug: name.toLowerCase(), status: "active" } },
        upsert: true,
      },
    }))
  );

  const sellerUser = await User.findOneAndUpdate(
    { phone: "+919000000003", role: "seller" },
    {
      $setOnInsert: {
        name: "Demo Seller",
        phone: "+919000000003",
        role: "seller",
        firebaseUid: "local-test-seller",
        status: "active",
      },
    },
    { new: true, upsert: true }
  );
  const seller = await Seller.findOneAndUpdate(
    { userId: sellerUser._id },
    {
      $setOnInsert: {
        userId: sellerUser._id,
        businessName: "Demo Seller Store",
        phone: sellerUser.phone,
        category: "General",
        city: "Hyderabad",
        commissionBps: 1200,
      },
    },
    { new: true, upsert: true }
  );

  const products = [
    ["AXZ-PICKLE-001", "Home Kitchen Pickle Box", "Grocery", 34900],
    ["AXZ-KURTA-001", "Cotton Everyday Kurta", "Fashion", 129900],
    ["AXZ-EARBUD-001", "Wireless Earbuds", "Electronics", 189900],
  ];

  await Product.bulkWrite(
    products.map(([sku, title, category, pricePaise]) => ({
      updateOne: {
        filter: { sellerId: seller._id, sku },
        update: {
          $set: { title, category, pricePaise, stock: 25, status: "active", sellerName: seller.businessName },
          $setOnInsert: { sellerId: seller._id, sku, images: [], currency: "INR" },
        },
        upsert: true,
      },
    }))
  );
}

module.exports = seedDefaults;
