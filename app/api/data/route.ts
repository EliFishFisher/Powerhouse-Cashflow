import { NextResponse } from "next/server";
import { createServerSideClient, loadAppData, loadAllAppData, clearAppData, clearAllAppData } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = await createServerSideClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    if (profile?.is_admin) {
      // Ensure the admin's own app_data row exists so rule/settings saves don't silently fail
      await supabase.from("app_data").upsert(
        { user_id: user.id, entity_name: profile.entity_name },
        { onConflict: "user_id", ignoreDuplicates: true }
      );
      // Fund admin: return all companies' data merged
      const all = await loadAllAppData(supabase);
      return NextResponse.json({ isAdmin: true, companies: all });
    }

    // Regular company user: ensure app_data row exists (lazy-create on first login)
    if (profile?.entity_name) {
      await supabase.from("app_data").upsert(
        { user_id: user.id, entity_name: profile.entity_name },
        { onConflict: "user_id", ignoreDuplicates: true }
      );
    }

    const appData = await loadAppData(supabase, user.id);
    return NextResponse.json({ isAdmin: false, ...appData });
  } catch (err) {
    console.error("GET /api/data error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const supabase = await createServerSideClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // If admin — clear every company row; otherwise clear only own row
    const { data: profile } = await supabase
      .from("profiles").select("is_admin").eq("id", user.id).single();

    if (profile?.is_admin) {
      await clearAllAppData(supabase);
    } else {
      await clearAppData(supabase, user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/data error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
