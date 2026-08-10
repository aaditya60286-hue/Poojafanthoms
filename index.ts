// Supabase Edge Function: confirm-booking
// After Stripe redirects the customer back to your site, the browser calls
// this function with the Stripe session_id. This function asks Stripe
// directly (server-to-server) whether that session really was paid —
// it never trusts the browser's word for it — and only then writes the
// order into the database. This prevents someone from faking a "success"
// redirect without actually paying.
//
// SETUP (dashboard, no CLI needed):
// 1. Supabase Dashboard -> Edge Functions -> Deploy a new function -> Via Editor
// 2. Name it exactly: confirm-booking
// 3. Paste this file's contents in, replacing the template
// 4. Deploy
// 5. This function reuses the same STRIPE_SECRET_KEY secret you already
//    added for create-checkout-session — no new secret needed.
// 6. Also add these two secrets (same Secrets page) if not already present:
//      Name: SUPABASE_URL       Value: https://urdhtrsxbetijzaxlhxu.supabase.co
//      Name: SUPABASE_SERVICE_ROLE_KEY   Value: (from Project Settings -> API -> service_role key)
//    NOTE: Supabase actually provides SUPABASE_URL and the service role key
//    automatically to every Edge Function as SUPABASE_SERVICE_ROLE_KEY — you
//    usually do NOT need to add these manually. Only add them if the
//    function logs show they're missing.
// 7. Make sure "Verify JWT with legacy secret" is OFF in this function's
//    Settings tab.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Missing session_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeKey || !supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Server misconfigured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ask Stripe directly whether this session was really paid.
    const stripeRes = await fetch(
      "https://api.stripe.com/v1/checkout/sessions/" + encodeURIComponent(sessionId),
      { headers: { "Authorization": "Bearer " + stripeKey } }
    );
    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      return new Response(JSON.stringify({ error: session.error?.message || "Stripe error" }), {
        status: stripeRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ error: "Payment not completed", status: session.payment_status }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const meta = session.metadata || {};

    // Use the service role key so this function can write to the orders
    // table directly, bypassing RLS (safe here, since we've already
    // verified payment ourselves rather than trusting the client).
    // First check whether we've already recorded this session, so a page
    // refresh doesn't create duplicate orders.
    const checkRes = await fetch(
      supabaseUrl + "/rest/v1/orders?stripe_session_id=eq." + encodeURIComponent(sessionId) + "&select=id",
      {
        headers: {
          "apikey": serviceRoleKey,
          "Authorization": "Bearer " + serviceRoleKey,
        },
      }
    );
    const existing = await checkRes.json();

    if (Array.isArray(existing) && existing.length > 0) {
      return new Response(JSON.stringify({ ok: true, alreadyRecorded: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const insertRes = await fetch(supabaseUrl + "/rest/v1/orders", {
      method: "POST",
      headers: {
        "apikey": serviceRoleKey,
        "Authorization": "Bearer " + serviceRoleKey,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        user_id: meta.user_id,
        items: meta.items,
        vehicle: meta.vehicle,
        from_address: meta.from_address,
        to_address: meta.to_address,
        price: Number(meta.price),
        status: "Booked",
        stripe_session_id: sessionId,
      }),
    });

    if (!insertRes.ok) {
      const errText = await insertRes.text();
      return new Response(JSON.stringify({ error: "Could not save order: " + errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, alreadyRecorded: false }), {
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
