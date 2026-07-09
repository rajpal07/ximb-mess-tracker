import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

if (!supabaseUrl || !supabaseAnonKey || supabaseUrl === "your-supabase-project-url") {
  console.warn("Supabase credentials are missing or placeholder. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.");
}

// Ensure the URL is a valid HTTP/HTTPS URL during build/prerendering
const activeUrl = (supabaseUrl && supabaseUrl.startsWith("http")) ? supabaseUrl : "https://placeholder-project.supabase.co";
const activeKey = supabaseAnonKey || "placeholder-anon-key";

export const supabase = createClient(activeUrl, activeKey);
