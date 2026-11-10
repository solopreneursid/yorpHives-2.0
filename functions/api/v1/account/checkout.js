import { requireSession } from "../../../_lib/session.js";
import { readJson, json } from "../../../_lib/http.js";
import { audit } from "../../../_lib/platform.js";
function packs(env){try{const v=JSON.parse(env.YH_CREDIT_PACKS_JSON||"[]");return Array.isArray(v)?v.filter(p=>typeof p.id==="string"&&/^[a-z0-9_-]{2,40}$/.test(p.id)&&Number.isSafeInteger(p.credits)&&p.credits>0&&Number.isSafeInteger(p.amount_minor)&&p.amount_minor>=10000&&p.currency==="INR"):[];}catch{return[];}}
export async function onRequestGet({request,env}){
 const auth=await requireSession(request,env);if(!auth.ok)return auth.response;
 if((env.YH_PAYMENT_PROVIDER||"disabled")!=="razorpay"||!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)return json({error:{code:"COMMERCE_NOT_CONFIGURED",message:"Indian payment checkout is not configured yet."}},503);
 return json({data:{provider:"razorpay",currency:"INR",packs:packs(env).map(p=>({id:p.id,credits:p.credits,amount_minor:p.amount_minor,currency:p.currency}))}},200,{"Cache-Control":"no-store"});
}
export async function onRequestPost({request,env}){
 const auth=await requireSession(request,env,{csrf:true});if(!auth.ok)return auth.response;
 if((env.YH_PAYMENT_PROVIDER||"disabled")!=="razorpay"||!env.RAZORPAY_KEY_ID||!env.RAZORPAY_KEY_SECRET)return json({error:{code:"COMMERCE_NOT_CONFIGURED",message:"Indian payment checkout is not configured yet."}},503);
 const idem=request.headers.get("Idempotency-Key");if(!idem||!/^[A-Za-z0-9._:-]{16,128}$/.test(idem))return json({error:{code:"IDEMPOTENCY_KEY_REQUIRED",message:"Provide an Idempotency-Key."}},400);
 const parsed=await readJson(request),pack=packs(env).find(p=>p.id===parsed.value?.pack_id);if(!parsed.ok||!pack)return json({error:{code:"UNKNOWN_CREDIT_PACK",message:"The selected credit pack is unavailable."}},422);
 const id=crypto.randomUUID(),now=new Date().toISOString();
 await env.DB.prepare("INSERT OR IGNORE INTO orders (id,principal_id,pack_id,credits,amount_minor,currency,status,provider,idempotency_key,created_at) VALUES (?,?,?,?,?,?,'pending','razorpay',?,?)").bind(id,auth.session.id,pack.id,pack.credits,pack.amount_minor,pack.currency,idem,now).run();
 const order=await env.DB.prepare("SELECT * FROM orders WHERE principal_id=? AND idempotency_key=?").bind(auth.session.id,idem).first();
 if(!order||order.pack_id!==pack.id||order.provider!=="razorpay")return json({error:{code:"IDEMPOTENCY_CONFLICT",message:"This idempotency key belongs to another purchase."}},409);
 if(order.status==="paid")return json({data:{order_id:order.id,status:"paid",credits:order.credits}});
 if(order.status!=="pending")return json({error:{code:"ORDER_NOT_PAYABLE",message:"This order is no longer payable."}},409);
 if(order.checkout_url)return json({data:{order_id:order.id,status:"pending",checkout_url:order.checkout_url}});
 const payload={amount:pack.amount_minor,currency:pack.currency,accept_partial:false,description:pack.credits+" YorpHives credits",reference_id:order.id,callback_url:new URL(request.url).origin+"/account/?checkout=return&order_id="+encodeURIComponent(order.id),callback_method:"get",reminder_enable:false,notify:{email:false,sms:false},customer:{name:auth.session.display_name,email:auth.session.email},notes:{order_id:order.id,principal_id:auth.session.id,pack_id:pack.id}};
 let response,link;
 try{response=await fetch("https://api.razorpay.com/v1/payment_links",{method:"POST",headers:{Authorization:"Basic "+btoa(env.RAZORPAY_KEY_ID+":"+env.RAZORPAY_KEY_SECRET),"Content-Type":"application/json"},body:JSON.stringify(payload)});link=await response.json();}catch{return json({error:{code:"PAYMENT_PROVIDER_UNAVAILABLE",message:"Payment provider could not be reached. Retry with the same idempotency key.",retryable:true}},503);}
 if(!response.ok||!link.id||!link.short_url){console.error(JSON.stringify({event:"razorpay.payment_link_failed",order_id:order.id,status:response.status}));return json({error:{code:"CHECKOUT_CREATION_FAILED",message:"Payment link could not be created.",retryable:true}},502);}
 await env.DB.prepare("UPDATE orders SET provider_session_id=?,checkout_url=? WHERE id=? AND status='pending'").bind(link.id,link.short_url,order.id).run();
 await audit(env,{actorId:auth.session.id,action:"commerce.checkout_created",targetType:"order",targetId:order.id,metadata:{provider:"razorpay",pack_id:pack.id,amount_minor:pack.amount_minor,currency:pack.currency}});
 return json({data:{order_id:order.id,status:"pending",checkout_url:link.short_url,credits:pack.credits}},201);
}
