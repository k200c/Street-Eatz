Deno.serve(async (req) => {
  return new Response(
    JSON.stringify({
      ok: true,
      version: "hardcoded-smoke-test-v1",
      count: 2,
      orders: [
        {
          order_id: "test-order-1",
          customer_name: "Kyle Test",
          customer_phone: "+353851234567",
          review_link: "https://g.page/r/streeteatz/review",
        },
        {
          order_id: "test-order-2",
          customer_name: "Ryan Test",
          customer_phone: "+353851112223",
          review_link: "https://g.page/r/streeteatz/review",
        },
      ],
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    },
  );
});
