
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors={
  "Access-Control-Allow-Origin":"https://yazzeedssrr.github.io",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);

  const stripeKey=Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  const anonKey=Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!stripeKey)return json({error:"stripe_not_configured"},503);
  if(!supabaseUrl||!anonKey||!serviceKey)return json({error:"server_not_configured"},503);

  const auth=req.headers.get("Authorization");
  if(!auth?.startsWith("Bearer "))return json({error:"authentication_required"},401);

  const userRes=await fetch(`${supabaseUrl}/auth/v1/user`,{headers:{Authorization:auth,apikey:anonKey}});
  if(!userRes.ok)return json({error:"invalid_session"},401);
  const user=await userRes.json();

  let body:any;
  try{body=await req.json()}catch{return json({error:"invalid_json"},400)}
  const orderId=body?.order_id;
  if(!orderId)return json({error:"order_id_required"},400);

  const orderRes=await fetch(
    `${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&user_id=eq.${encodeURIComponent(user.id)}&select=id,status,payment_status,payment_method,payments(checkout_session_id,raw_status)`,
    {headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`}}
  );
  if(!orderRes.ok)return json({error:"order_lookup_failed"},500);
  const order=(await orderRes.json())?.[0];
  if(!order)return json({error:"order_not_found"},404);
  if(order.payment_method!=="online")return json({error:"not_online_order"},400);
  if(order.payment_status==="paid")return json({error:"already_paid"},409);

  const sessionId=order.payments?.[0]?.checkout_session_id;
  if(sessionId){
    const stripeRes=await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`,{
      method:"POST",
      headers:{Authorization:`Bearer ${stripeKey}`,"Content-Type":"application/x-www-form-urlencoded"}
    });
    const stripeBody=await stripeRes.json().catch(()=>({}));
    if(!stripeRes.ok && stripeBody?.error?.code!=="checkout_session_not_open"){
      return json({error:"stripe_expire_failed",detail:stripeBody?.error?.message||"unknown"},502);
    }
  }

  const releaseRes=await fetch(`${supabaseUrl}/rest/v1/rpc/release_online_order`,{
    method:"POST",
    headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({p_order_id:orderId})
  });
  if(!releaseRes.ok)return json({error:"release_failed"},500);

  await fetch(`${supabaseUrl}/rest/v1/payments?order_id=eq.${encodeURIComponent(orderId)}`,{
    method:"PATCH",
    headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,"Content-Type":"application/json",Prefer:"return=minimal"},
    body:JSON.stringify({status:"failed",raw_status:"cancelled"})
  }).catch(()=>{});

  return json({ok:true});
});
