
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const cors={
  "Access-Control-Allow-Origin":"https://yazzeedssrr.github.io",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json"
};
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  const key=Deno.env.get("STRIPE_SECRET_KEY")||"";
  const webhook=Deno.env.get("STRIPE_WEBHOOK_SECRET")||"";
  const mode=key.startsWith("sk_live_")?"live":key.startsWith("sk_test_")?"test":"none";
  return new Response(JSON.stringify({
    secret_configured:Boolean(key),
    webhook_configured:Boolean(webhook),
    ready:Boolean(key&&webhook),
    mode
  }),{headers:cors});
});