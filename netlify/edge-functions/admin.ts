// Netlify Edge Function — Memorify Admin API
// Routes: /api/admin/*
// Auth: Clerk JWT (dashboard user) + admin check

import { handleAdmin } from "../../backend/routes/admin.ts";

export default async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { 
      status: 204, 
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      }
    });
  }

  return handleAdmin(req);
};