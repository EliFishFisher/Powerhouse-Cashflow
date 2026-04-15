/**
 * Shared helper for all write API routes.
 * Authenticates the request, then saves one field to app_data.
 * If the caller is an admin and passes targetEntity, saves to that company's row,
 * creating the row first if it doesn't exist yet.
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
      const { data: adminProfile, error: adminErr } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .single();

      if (adminProfile?.is_admin) {
        const { data: targetProfile } = await supabase
          .from("profiles")
          .select("id")
          .eq("entity_name", targetEntity)
          .single();

        if (targetProfile?.id) {
          userId = targetProfile.id;

          // Ensure the app_data row exists for this company
          await supabase
            .from("app_data")
            .upsert(
              { user_id: userId, entity_name: targetEntity },
              { onConflict: "user_id", ignoreDuplicates: true }
            );
        }
      }
    }

    const { error: saveErr } = await supabase
      .from("app_data")
      .update({ [field]: data })
      .eq("user_id", userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`POST /api/${field} error:`, err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
