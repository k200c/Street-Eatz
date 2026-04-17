import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_CATEGORIES = ["Burgers", "Flatbreads", "Fries", "Drinks", "Sauces", "Specials", "Kids Menu"];

const CATEGORY_ALIASES: Record<string, string> = {
  burger: "Burgers",
  burgers: "Burgers",
  flatbread: "Flatbreads",
  flatbreads: "Flatbreads",
  fries: "Fries",
  chips: "Fries",
  drink: "Drinks",
  drinks: "Drinks",
  sauce: "Sauces",
  sauces: "Sauces",
  special: "Specials",
  specials: "Specials",
  kids: "Kids Menu",
  "kids menu": "Kids Menu",
  kid: "Kids Menu",
  all: "all",
  menu: "all",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    let category: string | undefined;
    let queryText: string | undefined;

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      category = typeof body.category === "string" ? body.category.trim() : undefined;
      queryText = typeof body.query === "string" ? body.query.trim() : undefined;
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      category = url.searchParams.get("category")?.trim() || undefined;
      queryText = url.searchParams.get("query")?.trim() || undefined;
    }

    console.log("[get-menu] Request received:", { category, queryText });

    let normalizedCategory: string | undefined;

    if (category) {
      const lowered = category.toLowerCase();
      const aliasMatch = CATEGORY_ALIASES[lowered];

      if (aliasMatch === "all") {
        normalizedCategory = undefined;
      } else if (aliasMatch) {
        normalizedCategory = aliasMatch;
      } else {
        const exactMatch = VALID_CATEGORIES.find((c) => c.toLowerCase() === lowered);

        if (!exactMatch) {
          console.log("[get-menu] Invalid category:", category);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Invalid category",
              valid_categories: [...VALID_CATEGORIES, "all"],
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        normalizedCategory = exactMatch;
      }
    }

    let dbQuery = supabase
      .from("products")
      .select("name, price, description, category, is_available")
      .eq("is_available", true)
      .order("name");

    if (normalizedCategory) {
      dbQuery = dbQuery.eq("category", normalizedCategory);
    }

    if (queryText) {
      dbQuery = dbQuery.ilike("name", `%${queryText}%`);
    }

    const { data: products, error } = await dbQuery;

    if (error) {
      console.error("[get-menu] Database error:", error);
      return new Response(JSON.stringify({ success: false, error: "Failed to fetch menu" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = (products || []).map((p) => ({
      name: p.name,
      price: p.price,
      description: p.description || "",
      category: p.category || "",
      is_available: p.is_available ?? true,
    }));

    console.log(
      "[get-menu] Returning",
      items.length,
      "items for category:",
      normalizedCategory || "all",
      "query:",
      queryText || "",
    );

    return new Response(
      JSON.stringify({
        success: true,
        category: normalizedCategory || "all",
        query: queryText || "",
        count: items.length,
        items,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[get-menu] Unexpected error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
