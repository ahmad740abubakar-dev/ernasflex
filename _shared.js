const { createClient } = require("@supabase/supabase-js");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": process.env.SITE_URL || "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    },
    body: JSON.stringify(body)
  };
}

function handleOptions(event) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": process.env.SITE_URL || "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }
  return null;
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server environment variables.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getAuthenticatedUser(event) {
  const header = event.headers.authorization || event.headers.Authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return { error: "Missing bearer token." };
  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { error: "Invalid or expired session." };
  return { user: data.user, supabase };
}

async function requireAdmin(supabase, userId) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !error && !!data;
}

function parseBody(event) {
  try { return JSON.parse(event.body || "{}"); }
  catch { return null; }
}

module.exports = { json, handleOptions, adminClient, getAuthenticatedUser, requireAdmin, parseBody };
