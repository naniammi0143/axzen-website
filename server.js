const path = require("path");
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

let cachedCollection;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

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
  if (cachedCollection) {
    return cachedCollection;
  }

  if (!mongoUri) {
    throw new Error("MONGODB_URI is missing. Add your Atlas URI in .env.");
  }

  const client = new MongoClient(mongoUri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();
  await client.db(databaseName).command({ ping: 1 });
  cachedCollection = client.db(databaseName).collection(collectionName);
  return cachedCollection;
}

app.get("/api/health", async (req, res) => {
  try {
    await getCollection();
    res.json({ ok: true, database: databaseName, collection: collectionName });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
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

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Axzen server running at http://localhost:${port}`);
});
