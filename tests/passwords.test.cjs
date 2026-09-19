const {test} = require('node:test');
const assert = require('node:assert/strict');
const {hashPassword,verifyPassword,validPassword,loginPhone} = require('../src/utils/passwords');
test('password hashes are salted, support existing registrations and reject malformed values',async()=>{
 const a=await hashPassword('Fixture-password-2026'), b=await hashPassword('Fixture-password-2026');
 assert.notEqual(a,b); assert.equal(await verifyPassword('Fixture-password-2026',a),true);
 assert.equal(await verifyPassword('wrong',a),false);
 assert.equal(await verifyPassword('anything','broken'),false);
 assert.equal(await verifyPassword('Legacy-2026',require('../src/utils/password').hashPassword('Legacy-2026')),true);
 assert.equal(validPassword('123456789'),false); assert.equal(validPassword('x'.repeat(129)),false);
 assert.equal(validPassword('          '),false);
 assert.equal(loginPhone('98765 43210'),'+919876543210'); assert.equal(loginPhone({$ne:null}),'');
});
