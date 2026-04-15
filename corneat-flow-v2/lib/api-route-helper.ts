/**
 * Shared helper for all write API routes.
 * Authenticates the request, then saves one field to app_data.
 * If the caller is an admin and passes targetEntity, saves to that company's row.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSideClient, saveAppDataField } from "@/lib/supabase";

type DbField =
  | "transactions"
  | "adjustments"
  | "excluded"
  | "overrides"
  | "manual_entries"
  | "rules"
  | "meta"
  | "recon_status";

export async function saveField(req: NextRequest, field: DbField) {
  try {
    const supabase = await createServerSideClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { data, targetEntity } = body;

    let userId = user.id;

    // Admin uploading on behalf of a specific company
    if (targetEntity) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (profile?.is_admin) {
        const { data: target } = await supabase
          .from("app_data")
          .select("user_id")
          .eq("entity_name", targetEntity)
          .single();

        if (target?.user_id) userId = target.user_id;
      }
    }

    await saveAppDataField(supabase, userId, field, data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`POST /api/${field} error:`, err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
