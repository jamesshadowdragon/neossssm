import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdminEmail } from "@/lib/admin-config";
import { neonAdmin } from "@/integrations/neon";
import { createToken, type NeonSession, type NeonUser } from "@/integrations/neon/auth";

export const getAccountOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [profile, orders, transactions, roles] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase
        .from("orders")
        .select("*, services(name, slug, unit)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);

    if (profile.error) throw new Error(profile.error.message);

    return {
      profile: profile.data,
      orders: orders.data ?? [],
      transactions: transactions.data ?? [],
      roles: (roles.data ?? []).map((r) => r.role as string),
    };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ full_name: z.string().min(2).max(120) }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ full_name: data.full_name })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        service_id: z.string().uuid(),
        target_link: z.string().url().max(500),
        quantity: z.number().int().positive().max(1_000_000),
        notes: z.string().max(1000).optional(),
        client_request_id: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("place_order_atomic", {
      _service_id: data.service_id,
      _target_link: data.target_link,
      _quantity: data.quantity,
      _notes: data.notes ?? "",
      _client_request_id: data.client_request_id,
    });
    if (error) throw new Error(error.message);
    if (!result || Array.isArray(result) || typeof result !== "object") {
      throw new Error("The order could not be confirmed.");
    }
    const orderId = typeof result["orderId"] === "string" ? result["orderId"] : null;
    const orderNumber = typeof result["orderNumber"] === "number" ? result["orderNumber"] : null;
    const balance = typeof result["balance"] === "number" ? result["balance"] : null;
    if (!orderId || orderNumber === null || balance === null) {
      throw new Error("The order response was incomplete.");
    }
    return { orderId, orderNumber, balance, duplicate: result["duplicate"] === true };
  });

export const getWalletFunding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [methods, deposits] = await Promise.all([
      context.supabase
        .from("payment_methods")
        .select("id, code, name, kind, network, instructions, destination, min_amount, max_amount")
        .eq("is_enabled", true)
        .order("sort_order"),
      context.supabase
        .from("deposit_requests")
        .select("*, payment_methods(name, code, network)")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (methods.error) throw new Error(methods.error.message);
    if (deposits.error) throw new Error(deposits.error.message);
    return { methods: methods.data ?? [], deposits: deposits.data ?? [] };
  });

export const createDepositRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        payment_method_id: z.string().uuid(),
        amount: z.number().positive().max(1_000_000),
        payment_reference: z.string().trim().min(3).max(160),
        customer_notes: z.string().trim().max(1000).optional(),
        proof_data_url: z.string().max(7_100_000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: method, error: methodError } = await context.supabase
      .from("payment_methods")
      .select("id, min_amount, max_amount")
      .eq("id", data.payment_method_id)
      .eq("is_enabled", true)
      .maybeSingle();
    if (methodError) throw new Error(methodError.message);
    if (!method) throw new Error("That payment method is not currently available.");
    if (data.amount < Number(method.min_amount) || data.amount > Number(method.max_amount)) {
      throw new Error(
        `Amount must be between ${Number(method.min_amount)} and ${Number(method.max_amount)}.`,
      );
    }
    const normalizedReference = data.payment_reference.trim().toLowerCase();
    const { data: duplicate, error: duplicateError } = await context.supabase
      .from("deposit_requests")
      .select("id, request_number, status")
      .eq("payment_method_id", data.payment_method_id)
      .ilike("payment_reference", normalizedReference)
      .in("status", ["pending", "approved"])
      .maybeSingle();
    if (duplicateError) throw new Error(duplicateError.message);
    if (duplicate) {
      throw new Error(
        `That payment reference is already attached to request #${duplicate.request_number}.`,
      );
    }
    let proofPath: string | null = null;
    if (data.proof_data_url) {
      const match = data.proof_data_url.match(
        /^data:(image\/(?:png|jpeg|webp)|application\/pdf);base64,([A-Za-z0-9+/=]+)$/,
      );
      if (!match) throw new Error("Proof must be a PNG, JPEG, WebP, or PDF file.");
      const contentType = match[1];
      const payload = match[2];
      if (!contentType || !payload) throw new Error("Payment proof encoding is invalid.");
      const bytes = Buffer.from(payload, "base64");
      if (bytes.length > 5 * 1024 * 1024) throw new Error("Payment proof must be 5MB or smaller.");
      const imageSubtype = contentType.split("/")[1];
      const extension =
        contentType === "application/pdf" ? "pdf" : imageSubtype === "jpeg" ? "jpg" : imageSubtype;
      if (!extension) throw new Error("Payment proof file type is invalid.");
      proofPath = `${context.userId}/${crypto.randomUUID()}.${extension}`;
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: uploadError } = await supabaseAdmin.storage
        .from("payment-proofs")
        .upload(proofPath, bytes, {
          contentType,
          upsert: false,
        });
      if (uploadError) throw new Error(`Payment proof upload failed: ${uploadError.message}`);
    }
    const { data: deposit, error } = await context.supabase
      .from("deposit_requests")
      .insert({
        user_id: context.userId,
        payment_method_id: data.payment_method_id,
        amount: data.amount,
        payment_reference: normalizedReference,
        customer_notes: data.customer_notes || null,
        proof_path: proofPath,
      })
      .select("id, request_number")
      .single();
    if (error) {
      if (proofPath) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.storage.from("payment-proofs").remove([proofPath]);
      }
      throw new Error(error.message);
    }
    return deposit;
  });

export const createSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        subject: z.string().min(4).max(180),
        category: z.string().min(2).max(60),
        message: z.string().min(10).max(4000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: userId, subject: data.subject, category: data.category })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: messageError } = await supabase
      .from("ticket_messages")
      .insert({ ticket_id: ticket.id, author_id: userId, body: data.message });
    if (messageError) throw new Error(messageError.message);

    return { ticketId: ticket.id };
  });

export const listSupportTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("support_tickets")
      .select("*, ticket_messages(id, body, is_staff, created_at)")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const replyToSupportTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        ticket_id: z.string().uuid(),
        body: z.string().trim().min(2).max(4000),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("reply_to_ticket_atomic", {
      _ticket_id: data.ticket_id,
      _body: data.body,
      _close: false,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const exchangeGoogleCode = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        code: z.string().min(1),
        redirectUri: z.string().url(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const clientId = process.env["GOOGLE_CLIENT_ID"] || process.env["VITE_GOOGLE_CLIENT_ID"];
    const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];

    if (!clientId || !clientSecret) {
      throw new Error(
        "Google OAuth credentials missing in .env. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      );
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: data.code,
        client_id: clientId.trim(),
        client_secret: clientSecret.trim(),
        redirect_uri: data.redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error("[Google OAuth] Token exchange error:", errBody);
      throw new Error(`Google token exchange failed: ${tokenRes.statusText}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      throw new Error("Failed to fetch Google user profile");
    }

    const userInfo = (await userInfoRes.json()) as {
      sub: string;
      email: string;
      name?: string;
      picture?: string;
    };

    const email = userInfo.email.trim().toLowerCase();
    const fullName = userInfo.name || email.split("@")[0];
    const avatarUrl = userInfo.picture;
    const isAdmin = isAdminEmail(email);

    // Generate a deterministic valid UUID for Google accounts
    let userId = "";
    if (isAdmin) {
      if (email === "neomart981@gmail.com") {
        userId = "00000000-0000-4000-8000-000000000010";
      } else if (email === "voidlureee@gmail.com") {
        userId = "00000000-0000-4000-8000-000000000011";
      } else {
        userId = "00000000-0000-4000-8000-000000000001";
      }
    } else {
      // Deterministic UUID from Google sub so returning users keep same ID
      const hash = crypto.createHash("sha256").update(`google_user_${userInfo.sub}`).digest("hex");
      userId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    }

    const role = isAdmin ? "admin" : "user";

    try {
      const { data: existing } = await neonAdmin
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (existing?.id) {
        userId = existing.id;
        await neonAdmin
          .from("profiles")
          .update({
            full_name: fullName,
            avatar_url: avatarUrl ?? null,
          })
          .eq("id", userId);
      } else {
        await neonAdmin.from("profiles").insert({
          id: userId,
          email,
          full_name: fullName,
          avatar_url: avatarUrl ?? null,
          balance: isAdmin ? 5000.0 : 0.0,
        });
      }

      await neonAdmin.from("user_roles").insert({
        user_id: userId,
        role,
      });
    } catch (dbErr) {
      console.warn("[Google OAuth] DB upsert:", dbErr);
    }

    const user: NeonUser = {
      id: userId,
      email,
      user_metadata: {
        full_name: fullName,
        avatar_url: avatarUrl,
      },
      role,
      created_at: new Date().toISOString(),
    };

    const jwtToken = createToken(user);
    const session: NeonSession = {
      access_token: jwtToken,
      token_type: "bearer",
      expires_in: 3600 * 24 * 7,
      user,
    };

    return { user, session };
  });
