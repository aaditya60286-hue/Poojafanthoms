// Supabase Edge Function: create-checkout-session
// Creates a Stripe Checkout Session server-side, so the Stripe secret key
// never has to touch the browser. The browser just gets back a URL to
// redirect the customer to Stripe's hosted, secure payment page.
//
// SETUP (dashboard, no CLI needed):
// 1. Supabase Dashboard -> Edge Functions -> Deploy a new function -> Via Editor
// 2. Name it exactly: create-checkout-session
// 3. Paste this file's contents in, replacing the template
// 4. Deploy
// 5. Go to Edge Functions -> Secrets -> add:
//      Name:  STRIPE_SECRET_KEY
//      Value: your sk_test_... key from Stripe
// 6. Also make sure "Verify JWT with legacy secret" is switched OFF in this
//    function's Settings tab (same as we did for postcode-lookup).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { items, vehicle, from, to, price, user_id, success_url, cancel_url } = body;

    if (!items || !vehicle || !from || !to || !price || !user_id) {
      return new Response(JSON.stringify({ error: "Missing required booking details" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured (missing Stripe key)" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stripe's API accepts application/x-www-form-urlencoded bodies.
    // We store the booking details in session metadata so we can rebuild
    // the order after payment succeeds, without needing a database write
    // before the customer has actually paid.
    const params = new URLSearchParams();
    params.append("mode", "payment");
    params.append("success_url", success_url);
    params.append("cancel_url", cancel_url);
    params.append("line_items[0][price_data][currency]", "gbp");
    params.append("line_items[0][price_data][product_data][name]", "P Fanthoms delivery — " + vehicle);
    params.append("line_items[0][price_data][unit_amount]", String(Math.round(price * 100)));
    params.append("line_items[0][quantity]", "1");
    params.append("metadata[user_id]", user_id);
    params.append("metadata[items]", items);
    params.append("metadata[vehicle]", vehicle);
    params.append("metadata[from_address]", from);
    params.append("metadata[to_address]", to);
    params.append("metadata[price]", String(price));

    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + stripeKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      return new Response(JSON.stringify({ error: session.error?.message || "Stripe error" }), {
        status: stripeRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: session.url, id: session.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
