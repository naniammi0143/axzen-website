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
          let parsed;
          try { parsed = data ? JSON.parse(data) : {}; }
          catch { reject(new Error("Shipping provider returned an invalid response.")); return; }
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

    request.setTimeout(20000, () => request.destroy(new Error("Shipping request timed out. Verify the order in Shiprocket before retrying.")));
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

async function createShiprocketShipment({ order, seller, customerAddress }) {
  const token = await getShiprocketToken();
  if (!token) {
    const error = new Error("Shipping is not configured. Contact Axzen support to arrange fulfilment.");
    error.statusCode = 503;
    throw error;
  }

  if (!order.items?.length) throw new Error("Order has no items to ship.");
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
      billing_email: customerAddress?.email || "",
      billing_phone: customerAddress?.phone || "",
      shipping_is_billing: true,
      order_items: order.items.map(item => ({
        name: item.title,
        sku: item.sku || String(item.productId),
        units: item.quantity,
        selling_price: (item.pricePaise / 100).toFixed(2),
      })),
      shipping_charges: ((Number(order.deliveryCharge) || 0) / 100).toFixed(2),
      payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
      sub_total: ((Number(order.productTotal) || 0) / 100).toFixed(2),
      length: Number(process.env.SHIPROCKET_DEFAULT_LENGTH_CM || 10),
      breadth: Number(process.env.SHIPROCKET_DEFAULT_BREADTH_CM || 10),
      height: Number(process.env.SHIPROCKET_DEFAULT_HEIGHT_CM || 10),
      weight: Number(process.env.SHIPROCKET_DEFAULT_WEIGHT_KG || 0.5),
      pickup_address: pickupAddress,
    },
  });

  if (!result.shipment_id) throw new Error("Shipping provider did not confirm a shipment. Verify the order in Shiprocket before retrying.");
  return {
    shipmentId: String(result.shipment_id),
    awbNumber: result.awb_code || result.awb || "",
    courierName: result.courier_name || "",
    trackingUrl: result.tracking_url || "",
    shipmentStatus: result.awb_code || result.awb ? "waiting_for_pickup" : "ready_to_ship",
    pickupAgentName: result.pickup_agent_name || result.pickup_agent || "",
    pickupAgentPhone: result.pickup_agent_phone || result.pickup_agent_mobile || "",
    providerResponse: result,
  };
}

module.exports = {
  createShiprocketShipment,
};
