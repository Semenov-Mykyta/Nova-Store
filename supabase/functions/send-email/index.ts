import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// @ts-ignore
Deno.serve(async (req) => {
    // 👇 важно: preflight request
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const body = await req.json();

        console.log("REQUEST:", body);

        return new Response(
            JSON.stringify({
                success: true,
                received: body,
            }),
            {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                },
            }
        );
    } catch (error) {
        return new Response(
            JSON.stringify({
                error: String(error),
            }),
            {
                status: 500,
                headers: corsHeaders,
            }
        );
    }
});