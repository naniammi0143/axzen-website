const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDeliveryLabelHtml } = require('../src/utils/deliveryLabel');
const base = { orderId: 'AX-100', paymentMethod: 'cod', paymentStatus: 'pending', customerPaid: 12345, shippingAddress: { fullName: '<script>alert(1)</script>', line1: '12 Main Road', pincode: '500001' }, items: [{ title: 'Rice & dal', quantity: 2 }], sellerId: { businessName: 'Store', pickupAddress: 'Return Road' } };
test('parcel label contains destination, return address, contents, COD and printable dimensions', () => {
 const html = buildDeliveryLabelHtml(base);
 for (const value of ['4in 6in', '500001', '12 Main Road', 'Return Road', 'Rice &amp; dal x 2', 'COD', '123.45', 'window.print()', 'courier not assigned']) assert.ok(html.includes(value), value);
 assert.ok(!html.includes('<script>'));
 assert.ok(html.includes('&lt;script&gt;'));
});
test('label distinguishes paid, pending, cancelled and refunded orders', () => {
 assert.match(buildDeliveryLabelHtml({ ...base, paymentMethod: 'online' }), /PAYMENT PENDING/);
 assert.match(buildDeliveryLabelHtml({ ...base, paymentStatus: 'paid', awbNumber: 'AWB-234' }), /PAID/);
 assert.match(buildDeliveryLabelHtml({ ...base, paymentStatus: 'paid', awbNumber: 'AWB-234' }), /AWB-234/);
 assert.match(buildDeliveryLabelHtml({ ...base, status: 'cancelled' }), /DO NOT SHIP/);
 assert.match(buildDeliveryLabelHtml({ ...base, paymentStatus: 'refunded' }), /REFUNDED/);
 assert.doesNotThrow(() => buildDeliveryLabelHtml({}));
});
