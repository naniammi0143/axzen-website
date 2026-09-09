const env = require("../config/env");

function verifyWhatsappWebhook(req, res) {
  const mode = String(req.query["hub.mode"] || "");
  const token = String(req.query["hub.verify_token"] || "");
  const challenge = String(req.query["hub.challenge"] || "");
  const expected = env.whatsappVerifyToken;

  if (mode === "subscribe" && token && token === expected) {
    res.status(200).type("text/plain").send(challenge);
    return;
  }

  res.status(403).json({ ok: false, message: "WhatsApp webhook verification failed." });
}

function receiveWhatsappWebhook(req, res) {
  res.status(200).json({ ok: true });
  const entries = req.body?.entry || [];
  entries.forEach((entry) => {
    (entry.changes || []).forEach((change) => {
      const value = change.value || {};
      (value.messages || []).forEach((message) => {
        console.log("WhatsApp inbound:", {
          from: message.from,
          type: message.type,
          text: message.text?.body || "",
        });
      });
    });
  });
}

module.exports = {
  verifyWhatsappWebhook,
  receiveWhatsappWebhook,
};
