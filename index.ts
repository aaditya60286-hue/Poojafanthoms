// Supabase Edge Function: postcode-lookup
// Keeps the Ideal Postcodes API key on the server instead of in client-side JS.
//
// SETUP (one-time):
// 1. Install the Supabase CLI: https://supabase.com/docs/guides/cli
// 2. In your project folder, run:
//      supabase functions new postcode-lookup
//    then replace the generated index.ts with this file's contents.
// 3. Set the API key as a secret (NOT in the code):
//      supabase secrets set IDEAL_POSTCODES_API_KEY=ak_mshxcvhbyvOCkBTHcruw7X23hBMcI
// 4. Deploy it:
//      supabase functions deploy postcode-lookup
// 5. In quote.html, replace the direct api.ideal-postcodes.co.uk fetch with a call to:
//      https://<your-project-ref>.supabase.co/functions/v1/postcode-lookup?postcode=M1%202AB
//
// After this is live, rotate your Ideal Postcodes API key (the old one was
// exposed in the page source, so treat it as compromised) and only ever put
// the new key into `supabase secrets set`, never into an HTML/JS file.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const postcode = url.searchParams.get("postcode");

  if (!postcode) {
    return new Response(JSON.stringify({ error: "Missing postcode parameter" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("IDEAL_POSTCODES_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const idealUrl =
    "https://api.ideal-postcodes.co.uk/v1/postcodes/" +
    encodeURIComponent(postcode) +
    "?api_key=" +
    apiKey;

  const res = await fetch(idealUrl);
  const data = await res.json();

  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
