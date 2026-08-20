import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Self-contained copy of the vendor Category -> Subcategory taxonomy.
// Source of truth is vendorTaxonomy.js at the repo root — this is duplicated
// here (rather than imported across the supabase/functions/ boundary) since
// Supabase's edge function bundler only reliably resolves code that lives
// under supabase/functions/. Keep in sync if the taxonomy changes — a rare,
// deliberate event, not a high-frequency drift risk.
const VENDOR_TAXONOMY: Record<string, string[]> = {
  "Venues": ["Banquet Halls", "Hotels & Resorts", "Farmhouses", "Lawns & Gardens", "Convention Centres", "Destination Venues", "Clubs", "Rooftop Venues", "Villas", "Beach Venues", "Heritage Properties", "Community Halls", "Conference Rooms", "Religious Venues"],
  "Food & Beverages": ["Caterers", "Live Food Counters", "Bartending Services", "Mocktail Bars", "Coffee Stations", "Dessert Counters", "Ice Cream Vendors", "Bakery & Cakes", "Chocolatiers", "Beverage Suppliers", "Food Trucks"],
  "Decoration & Styling": ["Event Decorators", "Floral Decor", "Balloon Decor", "Stage Decor", "Mandap Designers", "Theme Decor", "Entrance Decor", "Ceiling Decor", "Table Styling", "Wedding Styling", "Lighting Decor", "Prop Rentals"],
  "Photography & Videography": ["Wedding Photography", "Event Photography", "Candid Photography", "Traditional Photography", "Cinematic Videography", "Drone Photography", "Pre-wedding Shoots", "Live Streaming", "Instant Photo Booths", "360° Video Booths", "Photo Albums", "Video Editing"],
  "Entertainment": ["DJs", "Live Bands", "Singers", "Classical Musicians", "Instrumentalists", "Celebrity Performers", "Stand-up Comedians", "Emcees (Anchors)", "Dancers", "Dance Troupes", "Magicians", "Puppeteers", "Kids Entertainment", "Fire Shows", "LED Dance Shows", "Belly Dancers", "Folk Artists", "Orchestra", "Mimicry Artists"],
  "Wedding Services": ["Wedding Planners", "Bridal Makeup Artists", "Groom Styling", "Mehendi Artists", "Haldi Setup", "Pandits/Priests", "Wedding Invitations", "Wedding Websites", "Gift Packaging", "Return Gifts", "Bridal Wear", "Groom Wear", "Jewellery Rentals"],
  "Beauty & Wellness": ["Makeup Artists", "Hair Stylists", "Nail Artists", "Spa Services", "Salon at Venue", "Grooming Experts", "Massage Services"],
  "Audio Visual & Production": ["Sound Systems", "LED Screens", "Projectors", "Lighting Systems", "Stage Setup", "Trussing", "Special Effects", "Laser Shows", "Smoke Machines", "Pyrotechnics", "AV Production", "Live Broadcasting"],
  "Event Rentals": ["Furniture Rental", "Sofa Sets", "Chairs", "Tables", "Lounges", "Tent & Shamiana", "Air Coolers", "Air Conditioners", "Heaters", "Portable Toilets", "Crockery Rental", "Linen Rental"],
  "Invitations & Printing": ["Wedding Cards", "Digital Invitations", "E-Invites", "RSVP Management", "Flex Printing", "Signages", "Banners", "Standees", "Welcome Boards", "Name Cards"],
  "Logistics & Transport": ["Luxury Cars", "Wedding Cars", "Bus Rentals", "Tempo Travellers", "Chauffeur Services", "Airport Transfers", "Valet Parking", "Guest Transport", "Logistics Companies"],
  "Accommodation": ["Hotels", "Homestays", "Service Apartments", "Guest House Management", "Hospitality Desk"],
  "Event Planning & Management": ["Wedding Planner", "Corporate Event Planner", "Birthday Planner", "Conference Planner", "Destination Wedding Planner", "Exhibition Organizer", "Event Coordinator", "RSVP Team", "Guest Management"],
  "Corporate Event Services": ["Team Building Activities", "Conference Management", "Product Launch", "Trade Shows", "Exhibition Booths", "Brand Activation", "Promotional Staffing"],
  "Kids Party Services": ["Bouncy Castles", "Cartoon Characters", "Puppet Shows", "Magicians", "Face Painting", "Tattoo Artists", "Kids Games", "Clowns"],
  "Event Technology": ["Ticketing Platforms", "QR Check-in", "Event Apps", "Registration Software", "RFID Solutions", "Voting Systems", "Audience Engagement", "Virtual Events", "Hybrid Event Solutions"],
  "Gifts & Favours": ["Return Gifts", "Customized Gifts", "Hampers", "Corporate Gifts", "Personalised Merchandise", "Trophy Makers", "Award Manufacturers"],
  "Security & Safety": ["Security Guards", "Bouncers", "Fire Safety", "Ambulance Services", "Medical Team", "Crowd Management", "CCTV Monitoring"],
  "Licensing & Compliance": ["Event Permissions", "Police Permissions", "Fire NOC", "Music Licenses", "Liquor Licenses", "Municipal Permissions", "Environmental Clearances"],
  "Artists & Performers": ["Celebrity Appearances", "Influencers", "Motivational Speakers", "Hosts", "Fashion Models", "Anchors", "Voice-over Artists"],
  "Religious & Cultural Services": ["Pandits", "Granthis", "Maulvis", "Priests", "Astrologers", "Vastu Consultants", "Bhajan Mandali", "Kirtan Groups"],
  "Decor Rentals": ["Artificial Flowers", "Chandeliers", "Vintage Furniture", "Wedding Props", "Selfie Booths", "Floral Walls", "LED Letters", "Neon Signs"],
  "Florists": ["Fresh Flowers", "Garlands", "Bridal Bouquets", "Floral Jewellery", "Exotic Flowers"],
  "Printing & Branding": ["Corporate Branding", "Backdrops", "Exhibition Panels", "Vinyl Printing", "Event Merchandise", "Promotional Material"],
  "Event Staffing": ["Hosts & Hostesses", "Registration Staff", "Ushers", "Volunteers", "Promoters", "Hospitality Staff", "Coordinators"],
  "Rentals & Utilities": ["Generator Rental", "Power Backup", "Water Supply", "Internet/Wi-Fi", "Portable Lighting", "Walkie-Talkies"],
  "Destination Wedding Services": ["Travel Planning", "Visa Assistance", "Local Vendors", "Destination Logistics", "Guest Concierge", "Tour Packages"],
  "Sustainable Event Services": ["Eco-friendly Decor", "Waste Management", "Composting", "Recyclable Cutlery", "Carbon Offset Services"],
  "Miscellaneous": ["Astrologers", "Tattoo Artists", "Caricature Artists", "Fortune Tellers", "Live Painters", "Calligraphers", "Cigar Rollers", "Perfume Bars"],
  "Post Event Services": ["Cleaning Services", "Equipment Dismantling", "Photo Album Delivery", "Video Editing", "Thank-you Gifts", "Feedback Collection"],
};

// ── JSON-RPC helpers ──────────────────────────────────────────────────────
function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
// A tool-level failure (bad input, not-found, etc.) — a valid JSON-RPC
// response, NOT a JSON-RPC error. Distinct from InvalidParamsError below.
function toolError(message: string) {
  return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
}
function toolText(data: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
class InvalidParamsError extends Error {}

// ── Tool schemas (returned by tools/list) ────────────────────────────────
const TOOLS = [
  {
    name: "search_providers",
    description: "Search Utsav marketplace vendors by category, city, rating, price and event type.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        category: { type: "string", description: "Exact subcategory, e.g. 'Caterers'. See list_categories for valid values." },
        city: { type: "string", description: "e.g. 'Delhi', 'Mumbai'." },
        min_rating: { type: "number", minimum: 0, maximum: 5 },
        max_price: { type: "number", description: "Maximum starting price (price_from) across the provider's services." },
        event_type: { type: "string", description: "e.g. 'Wedding', 'Birthday', 'Corporate'." },
        verified_only: { type: "boolean", default: false },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
    },
  },
  {
    name: "get_provider_details",
    description: "Full public profile and active services for one provider.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["provider_id"],
      properties: { provider_id: { type: "string", description: "Provider UUID." } },
    },
  },
  {
    name: "get_reviews",
    description: "Reviews for a provider, each tagged with verified-booking context (they trace back to a real completed booking).",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["provider_id"],
      properties: {
        provider_id: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 20 },
      },
    },
  },
  {
    name: "list_categories",
    description: "Vendor category/subcategory taxonomy. Omit parent_category to list all 30 top-level categories; pass one to get its subcategories.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        parent_category: { type: "string", description: "e.g. 'Venues'. Omit to list all categories." },
      },
    },
  },
];

const PROVIDER_PUBLIC_COLS = "id,user_id,name,business_name,category,city,rating,total_reviews,is_verified,bio";
const SERVICE_PUBLIC_COLS = "title,description,price_from,price_to,event_types,category";

// A provider's public-facing name is already shown to any browsing customer
// in the app (ProviderProfile/Discover/Search) — it's the business identity,
// not contact PII. For a claimed listing it lives on the linked users row
// (not on providers itself), so it needs a second lookup; unclaimed listings
// just use providers.name. Phone/email/exact address stay excluded — those
// are the genuinely sensitive fields.
async function attachDisplayNames(providers: any[]) {
  const userIds = [...new Set(providers.map((p) => p.user_id).filter(Boolean))];
  const { data: users } = userIds.length
    ? await supabaseAdmin.from("users").select("id,name").in("id", userIds)
    : { data: [] as any[] };

  return providers.map(({ user_id, name, business_name, ...p }) => ({
    ...p,
    display_name: users?.find((u: any) => u.id === user_id)?.name || name || business_name || "Unnamed provider",
  }));
}

// ── Tool implementations ─────────────────────────────────────────────────
async function searchProviders(args: any) {
  const limit = Math.min(Math.max(parseInt(args.limit ?? 20, 10) || 20, 1), 50);

  // Subcategory-level detail lives on `services`, not `providers.category`
  // (which now stores the parent category) — resolve category to a provider
  // id set via services first, same two-query pivot used elsewhere in the app.
  let categoryProviderIds: string[] | null = null;
  if (args.category) {
    const { data: matchingServices, error: svcErr } = await supabaseAdmin
      .from("services").select("provider_id").eq("category", args.category).eq("is_active", true);
    if (svcErr) return toolError(svcErr.message);
    categoryProviderIds = [...new Set((matchingServices || []).map((s: any) => s.provider_id))];
    if (!categoryProviderIds.length) return toolText({ count: 0, providers: [] });
  }

  let query = supabaseAdmin.from("providers").select(PROVIDER_PUBLIC_COLS).eq("is_active", true);
  if (categoryProviderIds) query = query.in("id", categoryProviderIds);
  if (args.city) query = query.eq("city", args.city);
  if (typeof args.min_rating === "number") query = query.gte("rating", args.min_rating);
  if (args.verified_only) query = query.eq("is_verified", true);
  query = query.order("rating", { ascending: false });

  const { data: providers, error } = await query.limit(200);
  if (error) return toolError(error.message);
  if (!providers?.length) return toolText({ count: 0, providers: [] });

  let results = providers;

  // max_price / event_type require a second query against services (no
  // join — matches the two-query pattern used throughout the app).
  if (args.max_price != null || args.event_type) {
    const providerIds = providers.map((p: any) => p.id);
    const { data: services } = await supabaseAdmin
      .from("services")
      .select("provider_id,price_from,event_types")
      .eq("is_active", true)
      .in("provider_id", providerIds);

    results = providers.filter((p: any) => {
      const providerServices = (services || []).filter((s: any) => s.provider_id === p.id);
      if (args.max_price != null) {
        const hasAffordable = providerServices.some((s: any) => (s.price_from ?? Infinity) <= args.max_price);
        if (!hasAffordable) return false;
      }
      if (args.event_type) {
        const hasEventType = providerServices.some((s: any) => (s.event_types || []).includes(args.event_type));
        if (!hasEventType) return false;
      }
      return true;
    });
  }

  results = await attachDisplayNames(results.slice(0, limit));
  return toolText({ count: results.length, providers: results });
}

async function getProviderDetails(args: any) {
  if (!args.provider_id || typeof args.provider_id !== "string") {
    throw new InvalidParamsError("provider_id is required");
  }
  const { data: provider, error } = await supabaseAdmin
    .from("providers")
    .select(PROVIDER_PUBLIC_COLS)
    .eq("id", args.provider_id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) return toolError(error.message);
  if (!provider) return toolError("Provider not found");

  const [namedProvider] = await attachDisplayNames([provider]);

  const { data: services } = await supabaseAdmin
    .from("services")
    .select(SERVICE_PUBLIC_COLS)
    .eq("provider_id", args.provider_id)
    .eq("is_active", true);

  return toolText({ provider: namedProvider, services: services || [] });
}

async function getReviews(args: any) {
  if (!args.provider_id || typeof args.provider_id !== "string") {
    throw new InvalidParamsError("provider_id is required");
  }
  const limit = Math.min(Math.max(parseInt(args.limit ?? 20, 10) || 20, 1), 50);

  const { data: provider } = await supabaseAdmin
    .from("providers")
    .select("rating,total_reviews")
    .eq("id", args.provider_id)
    .maybeSingle();
  if (!provider) return toolError("Provider not found");

  const { data: reviewsData, error } = await supabaseAdmin
    .from("reviews")
    .select("rating,comment,created_at,booking_id")
    .eq("provider_id", args.provider_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return toolError(error.message);

  const bookingIds = [...new Set((reviewsData || []).map((r: any) => r.booking_id).filter(Boolean))];
  const { data: bookings } = bookingIds.length
    ? await supabaseAdmin.from("bookings").select("id,event_type,event_date").in("id", bookingIds)
    : { data: [] as any[] };

  const reviews = (reviewsData || []).map((r: any) => {
    const booking = (bookings || []).find((b: any) => b.id === r.booking_id);
    return {
      rating: r.rating,
      comment: r.comment,
      created_at: r.created_at,
      verified_booking: booking ? { event_type: booking.event_type, event_date: booking.event_date } : null,
    };
  });

  return toolText({
    average_rating: provider.rating,
    total_reviews: provider.total_reviews,
    reviews,
  });
}

function listCategories(args: any) {
  if (args.parent_category) {
    const subcategories = VENDOR_TAXONOMY[args.parent_category];
    if (!subcategories) return toolError(`Unknown category: ${args.parent_category}`);
    return toolText({ category: args.parent_category, subcategories });
  }
  return toolText({ categories: Object.keys(VENDOR_TAXONOMY) });
}

async function callTool(name: string, args: any) {
  if (!name || typeof name !== "string") throw new InvalidParamsError("tools/call requires a 'name'");
  const safeArgs = args && typeof args === "object" ? args : {};

  switch (name) {
    case "search_providers": return await searchProviders(safeArgs);
    case "get_provider_details": return await getProviderDetails(safeArgs);
    case "get_reviews": return await getReviews(safeArgs);
    case "list_categories": return listCategories(safeArgs);
    default: throw new InvalidParamsError(`Unknown tool: ${name}`);
  }
}

// ── Transport: single POST endpoint, JSON-RPC 2.0, synchronous responses ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let msg: any;
  try {
    msg = await req.json();
  } catch (err) {
    return json(rpcError(null, -32700, "Parse error: " + err.message));
  }

  const { jsonrpc, id, method, params } = msg ?? {};
  if (jsonrpc !== "2.0" || typeof method !== "string") {
    return json(rpcError(id ?? null, -32600, "Invalid Request"));
  }

  // Notifications (no id) get no response body at all, per JSON-RPC spec.
  if (method === "notifications/initialized") {
    return new Response(null, { status: 202, headers: corsHeaders });
  }

  try {
    if (method === "initialize") {
      return json(rpcResult(id, {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "utsav-marketplace", version: "1.0.0" },
      }));
    }
    if (method === "tools/list") {
      return json(rpcResult(id, { tools: TOOLS }));
    }
    if (method === "tools/call") {
      const result = await callTool(params?.name, params?.arguments);
      return json(rpcResult(id, result));
    }
    return json(rpcError(id, -32601, `Method not found: ${method}`));
  } catch (err) {
    if (err instanceof InvalidParamsError) {
      return json(rpcError(id, -32602, err.message));
    }
    console.log("mcp-server error:", err.message);
    return json(rpcError(id, -32603, err.message));
  }
});
