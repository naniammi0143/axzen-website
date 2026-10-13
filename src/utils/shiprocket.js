const https = require("https");

const HOST = "apiv2.shiprocket.in";
let cachedToken = "";
let tokenExpiresAt = 0;

function requestJson({ path, method = "GET", token = "", body = null }) {
  const payload = body ? JSON.stringify(body) : "";
  return new Promise((resolve, reject) => {
    const request = https.request({
      hostname: HOST,
      path,
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
      },
    }, (response) => {
      let data = "";
      response.on("data", (chunk) => { data += chunk; });
      response.on("end", () => {
        let parsed;
        try { parsed = data ? JSON.parse(data) : {}; }
        catch { reject(new Error("Shiprocket returned an invalid response.")); return; }
        if (response.statusCode >= 400) {
          const details = parsed.errors && typeof parsed.errors === "object" ? Object.values(parsed.errors).flat().filter(Boolean).join(" ") : "";
          const error = new Error(details || parsed.message || parsed.error || "Shiprocket request failed.");
          error.statusCode = response.statusCode;
          error.providerResponse = parsed;
          reject(error);
          return;
        }
        resolve(parsed);
      });
    });
    request.setTimeout(20_000, () => request.destroy(new Error("Shiprocket request timed out. Reconcile the shipment before retrying.")));
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function configured() {
  return Boolean(process.env.SHIPROCKET_TOKEN || (process.env.SHIPROCKET_EMAIL && process.env.SHIPROCKET_PASSWORD));
}

async function getShiprocketToken() {
  if (process.env.SHIPROCKET_TOKEN) return process.env.SHIPROCKET_TOKEN;
  if (!configured()) return "";
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const result = await requestJson({
    path: "/v1/external/auth/login",
    method: "POST",
    body: { email: process.env.SHIPROCKET_EMAIL, password: process.env.SHIPROCKET_PASSWORD },
  });
  cachedToken = result.token || "";
  if (!cachedToken) throw new Error("Shiprocket authentication did not return a token.");
  tokenExpiresAt = Date.now() + 8 * 60 * 60 * 1000;
  return cachedToken;
}

function queryPath(path, values) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  return `${path}?${query}`;
}

function orderPayload({ order, seller, customerAddress }) {
  return {
    order_id: order.orderId,
    order_date: new Date(order.createdAt || Date.now()).toISOString().slice(0, 19).replace("T", " "),
    pickup_location: seller.shippingPickupLocation,
    billing_customer_name: customerAddress?.fullName || "Axzen Customer",
    billing_last_name: "",
    billing_address: customerAddress?.address || "",
    billing_address_2: customerAddress?.address2 || "",
    billing_city: customerAddress?.city || "",
    billing_pincode: customerAddress?.pincode || "",
    billing_state: customerAddress?.state || "",
    billing_country: "India",
    billing_email: customerAddress?.email || seller.email || "",
    billing_phone: customerAddress?.phone || "",
    shipping_is_billing: true,
    order_items: order.items.map((item) => ({
      name: item.title,
      sku: item.sku || String(item.productId),
      units: item.quantity,
      selling_price: (Number(item.pricePaise || item.price || 0) / 100).toFixed(2),
      discount: "0",
      tax: "0",
      hsn: item.hsn || "",
    })),
    payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
    shipping_charges: ((Number(order.deliveryCharge) || 0) / 100).toFixed(2),
    sub_total: ((Number(order.productTotal) || 0) / 100).toFixed(2),
    length: order.packageDetails.length,
    breadth: order.packageDetails.breadth,
    height: order.packageDetails.height,
    weight: order.packageDetails.weight,
  };
}

async function checkServiceability({ token, order, seller, customerAddress }) {
  const path = queryPath("/v1/external/courier/serviceability/", {
    pickup_postcode: seller.pincode,
    delivery_postcode: customerAddress.pincode,
    cod: order.paymentMethod === "cod" ? 1 : 0,
    weight: order.packageDetails.weight,
    length: order.packageDetails.length,
    breadth: order.packageDetails.breadth,
    height: order.packageDetails.height,
    declared_value: ((Number(order.customerPaid || order.productTotal) || 0) / 100).toFixed(2),
  });
  const result = await requestJson({ path, token });
  const data = result.data || {};
  const couriers = Array.isArray(data.available_courier_companies) ? data.available_courier_companies : [];
  if (!couriers.length) throw Object.assign(new Error("No Shiprocket courier is serviceable for these pincodes."), { statusCode: 422 });
  const recommendedId = Number(data.recommended_courier_company_id || 0);
  const courier = couriers.find((item) => Number(item.courier_company_id) === recommendedId)
    || couriers.find((item) => item.pickup_availability !== "0" && item.pickup_availability !== 0)
    || couriers[0];
  return { courier, couriers };
}

async function assignAwb({ token, shipmentId, courierId }) {
  const result = await requestJson({
    path: "/v1/external/courier/assign/awb",
    method: "POST",
    token,
    body: { shipment_id: Number(shipmentId), ...(courierId ? { courier_id: Number(courierId) } : {}) },
  });
  const data = result.response?.data || result.data || result;
  const awbNumber = data.awb_code || data.awb || "";
  if (!awbNumber) throw new Error(result.message || "Shiprocket did not assign an AWB.");
  return { data, awbNumber };
}

async function requestPickup({ token, shipmentId }) {
  return requestJson({ path: "/v1/external/courier/generate/pickup", method: "POST", token, body: { shipment_id: [Number(shipmentId)] } });
}

async function generateLabel({ token, shipmentId }) {
  const result = await requestJson({ path: "/v1/external/courier/generate/label", method: "POST", token, body: { shipment_id: [Number(shipmentId)] } });
  return result.label_url || result.label || "";
}

async function trackShiprocketAwb(awbNumber) {
  if (!/^[A-Za-z0-9_-]{4,100}$/.test(String(awbNumber || ""))) throw new Error("A valid AWB is required.");
  const token = await getShiprocketToken();
  if (!token) throw Object.assign(new Error("Shiprocket is not configured."), { statusCode: 503 });
  const result = await requestJson({ path: `/v1/external/courier/track/awb/${encodeURIComponent(awbNumber)}`, token });
  return result.tracking_data || {};
}

async function createShiprocketShipment({ order, seller, customerAddress }) {
  const token = await getShiprocketToken();
  if (!token) throw Object.assign(new Error("Shipping is not configured. Contact Axzen support."), { statusCode: 503 });
  if (!order.items?.length) throw new Error("Order has no items to ship.");
  if (!seller.pincode || !customerAddress?.pincode) throw Object.assign(new Error("Pickup and delivery pincodes are required."), { statusCode: 422 });
  const partial = {};
  try {
    const serviceability = await checkServiceability({ token, order, seller, customerAddress });
    const created = await requestJson({ path: "/v1/external/orders/create/adhoc", method: "POST", token, body: orderPayload({ order, seller, customerAddress }) });
    if (!created.shipment_id) throw new Error("Shiprocket did not confirm a shipment.");
    partial.providerOrderId = String(created.order_id || "");
    partial.shipmentId = String(created.shipment_id);
    partial.courierCompanyId = Number(serviceability.courier?.courier_company_id || 0) || null;
    const assigned = created.awb_code ? { data: created, awbNumber: created.awb_code } : await assignAwb({ token, shipmentId: partial.shipmentId, courierId: partial.courierCompanyId });
    partial.awbNumber = assigned.awbNumber;
    partial.courierName = assigned.data.courier_name || serviceability.courier?.courier_name || "";
    partial.trackingUrl = assigned.data.tracking_url || `https://shiprocket.co/tracking/${encodeURIComponent(partial.awbNumber)}`;
    const pickup = await requestPickup({ token, shipmentId: partial.shipmentId });
    partial.pickupScheduledAt = pickup.response?.pickup_scheduled_date || pickup.pickup_scheduled_date || null;
    try { partial.shippingLabelUrl = await generateLabel({ token, shipmentId: partial.shipmentId }); }
    catch { partial.shippingLabelUrl = ""; }
    return { ...partial, shipmentStatus: "waiting_for_pickup", pickupAgentName: "", pickupAgentPhone: "" };
  } catch (error) {
    error.shiprocketState = partial;
    throw error;
  }
}

module.exports = {
  checkServiceability,
  configured,
  createShiprocketShipment,
  getShiprocketToken,
  trackShiprocketAwb,
  _shiprocketInternals: { assignAwb, generateLabel, orderPayload, queryPath, requestJson, requestPickup },
};
