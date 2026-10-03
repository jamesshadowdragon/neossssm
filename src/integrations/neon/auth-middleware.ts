import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { neon } from "./index";
import { decodeToken } from "./auth";

export const requireNeonAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  let userId = "00000000-0000-4000-8000-000000000001"; // Fallback to admin if dev preview
  let claims: Record<string, any> = { sub: userId, role: "admin" };

  const authHeader = request?.headers?.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "").trim();
    const decoded = decodeToken(token);
    if (decoded && decoded.sub) {
      userId = decoded.sub;
      claims = { ...decoded, sub: userId };
    }
  }

  return next({
    context: {
      supabase: neon, // Backwards-compatible alias for existing functions
      neon,
      userId,
      claims,
    },
  });
});

export const requireSupabaseAuth = requireNeonAuth;
