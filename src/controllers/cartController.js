const Cart=require('../models/Cart');
const Product=require('../models/Product');
const Seller=require('../models/Seller');
const asyncHandler=require('../utils/asyncHandler');
const {success}=require('../utils/apiResponse');
const {normalizeItems,invalid}=require('../utils/checkoutRules');
const getCart=asyncHandler(async(req,res)=>{const cart=await Cart.findOne({customerId:req.user.id}).lean();if(cart)cart.subtotalPaise=cart.items.reduce((n,i)=>n+i.pricePaise*i.quantity,0);success(res,{cart:cart||{items:[],subtotalPaise:0}});});
const saveCart=asyncHandler(async(req,res)=>{
 if(!Array.isArray(req.body.items))throw invalid('Cart items must be a list.');
 const input=req.body.items.length?normalizeItems(req.body.items):[];
 const products=await Product.find({_id:{$in:input.map(i=>i.productId)},status:{$in:['active','approved']}}).lean();
 const sellers=await Seller.find({_id:{$in:products.map(p=>p.sellerId)},isActive:true,status:'active',approvalStatus:'approved',kycStatus:'approved'}).select('_id').lean();
 const active=new Set(sellers.map(s=>String(s._id)));
 const items=input.map(i=>{const p=products.find(p=>String(p._id)===i.productId);if(!p||!active.has(String(p.sellerId)))throw invalid('A cart item is no longer available. Remove it and try again.',409);return {productId:p._id,sellerId:p.sellerId,sku:p.sku,title:p.title,quantity:i.quantity,pricePaise:p.pricePaise,lineTotalPaise:p.pricePaise*i.quantity};});
 const cart=await Cart.findOneAndUpdate({customerId:req.user.id},{$set:{items,subtotalPaise:items.reduce((n,i)=>n+i.lineTotalPaise,0),currency:'INR'}},{new:true,upsert:true,runValidators:true});
 success(res,{cart});
});
module.exports={getCart,saveCart};
