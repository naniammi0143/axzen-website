const https = require("https");

function requestJson({ hostname, path, method = "GET", token = "", body = null }) {
  const payload = body ? JSON.stringify(body) : "";

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (response) => {
        let data = "";
        response.on("data", (chunk) => {
          data += chunk;
        });
        response.on("end", () => {
          const parsed = data ? JSON.parse(data) : {};
          if (response.statusCode >= 400) {
            const error = new Error(parsed.message || parsed.error || "Shiprocket request failed.");
            error.statusCode = response.statusCode;
            reject(error);
            return;
          }
          resolve(parsed);
        });
      }
    );

    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function getShiprocketToken() {
  if (process.env.SHIPROCKET_TOKEN) return process.env.SHIPROCKET_TOKEN;
  if (!process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD) return "";

  const result = await requestJson({
    hostname: "apiv2.shiprocket.in",
    path: "/v1/external/auth/login",
    method: "POST",
    body: {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    },
  });

  return result.token || "";
}

function buildMockShipment(order) {
  const orderId = order.orderId || `AXZ-${Date.now()}`;
  return {
    awbNumber: `MOCK${Date.now()}`,
    courierName: "Shiprocket Test",
    trackingUrl: `https://shiprocket.co/tracking/${encodeURIComponent(orderId)}`,
    shipmentStatus: "shipped",
    providerResponse: { mode: "mock" },
  };
}

async function createShiprocketShipment({ order, seller, customerAddress }) {
  const token = await getShiprocketToken();
  if (!token) return buildMockShipment(order);

  const firstItem = order.items?.[0] || {};
  const pickupAddress = [seller.pickupAddress, seller.city, seller.state, seller.pincode].filter(Boolean).join(", ");
  const result = await requestJson({
    hostname: "apiv2.shiprocket.in",
    path: "/v1/external/orders/create/adhoc",
    method: "POST",
    token,
    body: {
      order_id: order.orderId,
      order_date: order.createdAt || new Date(),
      pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || seller.businessName || "Axzen Seller",
      billing_customer_name: customerAddress?.fullName || "Axzen Customer",
      billing_last_name: "",
      billing_address: customerAddress?.address || "",
      billing_city: customerAddress?.city || "",
      billing_pincode: customerAddress?.pincode || "",
      billing_state: customerAddress?.state || "",
      billing_country: "India",
      billing_email: customerAddress?.email || "customer@axzen.in",
      billing_phone: customerAddress?.phone || "9999999999",
      shipping_is_billing: true,
      order_items: [
        {
          name: firstItem.title || "Axzen product",
          sku: firstItem.sku || "AXZEN-SKU",
          units: Number(firstItem.quantity) || 1,
          selling_price: ((Number(firstItem.pricePaise) || 0) / 100).toFixed(2),
        },
      ],
      payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
      sub_total: ((Number(order.productTotal) || 0) / 100).toFixed(2),
      length: Number(process.env.SHIPROCKET_DEFAULT_LENGTH_CM || 10),
      breadth: Number(process.env.SHIPROCKET_DEFAULT_BREADTH_CM || 10),
      height: Number(process.env.SHIPROCKET_DEFAULT_HEIGHT_CM || 10),
      weight: Number(process.env.SHIPROCKET_DEFAULT_WEIGHT_KG || 0.5),
      pickup_address: pickupAddress,
    },
  });

  return {
    awbNumber: result.awb_code || result.awb || result.shipment_id || `SR${Date.now()}`,
    courierName: result.courier_name || result.courier_company_id || "Shiprocket",
    trackingUrl: result.tracking_url || "",
    shipmentStatus: result.status || "shipped",
    providerResponse: result,
  };
}

module.exports = {
  createShiprocketShipment,
};
