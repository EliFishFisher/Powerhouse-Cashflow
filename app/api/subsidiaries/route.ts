import { NextRequest } from "next/server";
import { saveField } from "@/lib/api-route-helper";

export async function POST(req: NextRequest) {
  return saveField(req, "subsidiaries");
}
