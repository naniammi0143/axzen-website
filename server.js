const path = require("path");
const crypto = require("crypto");
const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const { MongoClient, ServerApiVersion } = require("mongodb");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || "axzen";
const collectionName = process.env.MONGODB_COLLECTION || "seller_applications";
const authSecret = process.env.AUTH_SECRET || "axzen-local-development-secret";

let cachedDb;
let cachedDbPromise;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname, { index: false }));

function validateSellerApplication(body) {
  const businessName = String(body.businessName || "").trim();
  const category = String(body.category || "").trim();
  const phone = String(body.phone || "").trim();

  if (!businessName || !category || !phone) {
    return {
      error: "Business name, category, and phone number are required.",
    };
  }

  if (phone.length < 8) {
    return {
      error: "Please enter a valid phone number.",
    };
  }

  return {
    value: {
      businessName,
      category,
      phone,
      status: "new",
      source: "axzen-website",
      createdAt: new Date(),
    },
  };
}

async function getCollection() {
  const db = await getDb();
  return db.collection(collectionName);
}

async function getDb() {
  if (cachedDb) {
    return cachedDb;
  }

  if (cachedDbPromise) {
    return cachedDbPromise;
  }

  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing. Add your Atlas URI in .env.");
  }

  cachedDbPromise = (async () => {
    const client = new MongoClient(mongoUri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    await client.connect();
    await client.db(databaseName).command({ ping: 1 });
    cachedDb = client.db(databaseName);
    await ensureDefaultUsers(cachedDb);
    return cachedDb;
  })();

  return cachedDbPromise;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedPassword) {
  const [salt, hash] = storedPassword.split(":");
  const attemptedHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(attemptedHash, "hex"));
}

function createToken(user) {
  const payload = Buffer.from(
    JSON.stringify({
      id: String(user._id),
      email: user.email,
      role: user.role,
      name: user.name,
      exp: Date.now() + 1000 * 60 * 60 * 8,
    })
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", authSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyToken(req, expectedRole) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token.includes(".")) {
    return null;
  }

  const [payload, signature] = token.split(".");
  const expectedSignature = crypto.createHmac("sha256", authSecret).update(payload).digest("base64url");

  if (signature !== expectedSignature) {
    return null;
  }

  let user;

  try {
    user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch (error) {
    return null;
  }

  if (user.exp < Date.now() || user.role !== expectedRole) {
    return null;
  }

  return user;
}

async function ensureDefaultUsers(db) {
  const users = db.collection("users");
  const defaults = [
    {
      role: "admin",
      name: "Axzen Admin",
      email: "admin@axzen.in",
      password: "Admin@123",
    },
    {
      role: "customer",
      name: "Axzen Customer",
      email: "customer@axzen.in",
      password: "Customer@123",
    },
    {
      role: "seller",
      name: "Demo Seller",
      email: "seller@axzen.in",
      password: "Seller@123",
    },
  ];

  await users.createIndex({ email: 1, role: 1 }, { unique: true });

  for (const user of defaults) {
    await users.updateOne(
      { email: user.email, role: user.role },
      {
        $setOnInsert: {
        name: user.name,
        email: user.email,
        role: user.role,
        passwordHash: hashPassword(user.password),
        status: "active",
        createdAt: new Date(),
        },
      },
      { upsert: true }
    );
  }
}

function getDashboardData(role) {
  const dashboards = {
    admin: {
      title: "Company Admin Control",
      summary: "Full control for seller approvals, product moderation, orders, delivery operations, commissions, and payouts.",
      metrics: [
        ["Active sellers", "48"],
        ["Pending approvals", "12"],
        ["Orders today", "326"],
        ["Payout queue", "Rs. 2.8L"],
      ],
      panels: [
        {
          title: "Seller control",
          items: [
            ["Approve new sellers", "KYC, category, bank details"],
            ["Suspend or verify stores", "Trust and quality control"],
            ["Commission rules", "Category-wise platform fee"],
          ],
        },
        {
          title: "Operations",
          items: [
            ["Product approval", "Catalogue quality and pricing"],
            ["Delivery routing", "Partner assignment and status"],
            ["Payout settlement", "Split transaction reports"],
          ],
        },
      ],
    },
    seller: {
      title: "Seller Workspace",
      summary: "Tools for store profile, products, inventory, orders, delivery handoff, offers, invoices, and payout tracking.",
      metrics: [
        ["Live products", "24"],
        ["New orders", "18"],
        ["Low stock", "05"],
        ["Next payout", "Rs. 18,420"],
      ],
      panels: [
        {
          title: "Catalogue tools",
          items: [
            ["Add products", "Images, price, stock, tax"],
            ["Manage inventory", "Stock alerts and variants"],
            ["Create offers", "Discounts and featured listings"],
          ],
        },
        {
          title: "Order workflow",
          items: [
            ["Accept orders", "Confirm packing and pickup"],
            ["Delivery status", "Ready, picked, delivered"],
            ["Payout reports", "Commission and settlement history"],
          ],
        },
      ],
    },
    customer: {
      title: "Customer App",
      summary: "Customer experience for finding seller pages, saving addresses, ordering, payments, delivery tracking, and support.",
      metrics: [
        ["Saved sellers", "09"],
        ["Active orders", "03"],
        ["Wallet balance", "Rs. 1,250"],
        ["Support tickets", "01"],
      ],
      panels: [
        {
          title: "Shopping flow",
          items: [
            ["Discover sellers", "City, category, rating filters"],
            ["Cart and checkout", "Address, payment, delivery slot"],
            ["Order tracking", "Live status and delivery updates"],
          ],
        },
        {
          title: "Account tools",
          items: [
            ["Saved addresses", "Home, office, custom labels"],
            ["Returns and support", "Issue tracking and refunds"],
            ["Reviews", "Rate products and sellers"],
          ],
        },
      ],
    },
  };

  return dashboards[role];
}

app.get("/api/health", async (req, res) => {
  try {
    await getCollection();
    res.json({ ok: true, database: databaseName, collection: collectionName });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get("/api", (req, res) => {
  res.json({
    ok: true,
    service: "Axzen API",
    domains: {
      customer: "axzen.in",
      seller: "seller.axzen.in",
      admin: "admin.axzen.in",
      api: "api.axzen.in",
    },
  });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const role = String(req.body.role || "").trim().toLowerCase();

  if (!email || !password || !["admin", "customer", "seller"].includes(role)) {
    res.status(400).json({ ok: false, message: "Email, password, and role are required." });
    return;
  }

  try {
    const db = await getDb();
    const user = await db.collection("users").findOne({ email, role, status: "active" });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ ok: false, message: "Invalid login details for this role." });
      return;
    }

    res.json({
      ok: true,
      token: createToken(user),
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Login service unavailable. Check database connection." });
  }
});

app.get("/api/dashboard/:role", (req, res) => {
  const role = String(req.params.role || "").toLowerCase();
  const user = verifyToken(req, role);

  if (!user) {
    res.status(401).json({ ok: false, message: "Please login again." });
    return;
  }

  res.json({
    ok: true,
    user,
    dashboard: getDashboardData(role),
  });
});

app.post("/api/seller-applications", async (req, res) => {
  const validation = validateSellerApplication(req.body);

  if (validation.error) {
    res.status(400).json({ ok: false, message: validation.error });
    return;
  }

  try {
    const collection = await getCollection();
    const result = await collection.insertOne(validation.value);

    res.status(201).json({
      ok: true,
      id: result.insertedId,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: "Database connection failed. Check your MongoDB Atlas settings.",
    });
  }
});

function resolvePage(req) {
  const host = String(req.hostname || "").toLowerCase();
  const route = String(req.path || "/").toLowerCase();

  if (route === "/admin" || host === "admin.axzen.in") {
    return "admin.html";
  }

  if (route === "/seller" || host === "seller.axzen.in") {
    return "seller.html";
  }

  if (route === "/customer" || host === "axzen.in" || host === "www.axzen.in") {
    return "index.html";
  }

  if (host === "api.axzen.in") {
    return null;
  }

  return "index.html";
}

app.get("*", (req, res) => {
  const page = resolvePage(req);

  if (!page) {
    res.json({
      ok: true,
      service: "Axzen API",
      health: "/api/health",
      login: "/api/auth/login",
    });
    return;
  }

  res.sendFile(path.join(__dirname, page));
});

app.listen(port, () => {
  console.log(`Axzen server running at http://localhost:${port}`);
});
