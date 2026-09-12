const crypto = require('crypto');
function razorpayConfig() { return {keyId:process.env.RAZORPAY_KEY_ID || '',keySecret:process.env.RAZORPAY_KEY_SECRET || ''}; }
function hasRazorpayCredentials() { const c=razorpayConfig();return Boolean(c.keyId && c.keySecret); }
async function request(path, body) {
  const c=razorpayConfig();
  if (!hasRazorpayCredentials()) { const e=new Error('Online payments are currently unavailable. Please choose Cash on Delivery if offered.');e.statusCode=503;throw e; }
  const response=await fetch('https://api.razorpay.com/v1'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+Buffer.from(c.keyId+':'+c.keySecret).toString('base64'),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
  const result=await response.json();
  if(!response.ok){const e=new Error(result.error?.description || 'Payment provider unavailable. Please try again.');e.statusCode=502;throw e;}
  return result;
}
function createRazorpayOrder({amountPaise,receipt,notes={}}){return request('/orders',{amount:amountPaise,currency:'INR',receipt,notes});}
function fetchRazorpayPayment(id){ if(!/^pay_[a-zA-Z0-9]+$/.test(id || ''))throw new Error('Invalid payment reference.');return request('/payments/'+id); }
function verifyRazorpaySignature({razorpayOrderId,razorpayPaymentId,razorpaySignature}) {
  const {keySecret}=razorpayConfig();if(!keySecret || !/^[a-f\d]{64}$/i.test(String(razorpaySignature || '')))return false;
  const expected=crypto.createHmac('sha256',keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest();
  return crypto.timingSafeEqual(expected,Buffer.from(razorpaySignature,'hex'));
}
module.exports={createRazorpayOrder,hasRazorpayCredentials,razorpayConfig,verifyRazorpaySignature,fetchRazorpayPayment};
