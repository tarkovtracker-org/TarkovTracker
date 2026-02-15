import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  authenticateUser,
  handleCorsPreflight,
  validateMethod,
  validateRequiredFields,
  createErrorResponse,
  createSuccessResponse,
  type AuthSuccess,
} from "../_shared/auth.ts";
const TEAM_ID_REGEX = /^[a-zA-Z0-9-]{1,64}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const cors = handleCorsPreflight(req);
  if (cors) return cors;

  try {
    const methodError = validateMethod(req, ["POST"]);
    if (methodError) return methodError;

    const auth = await authenticateUser(req);
    if ("error" in auth) {
      return createErrorResponse(auth.error, auth.status, req);
    }

    const { supabase, user } = auth as AuthSuccess;
    const body = await req.json();
    const fieldsError = validateRequiredFields(req, body, ["teamId"]);
    if (fieldsError) return fieldsError;

    const teamId = body.teamId as string;
    if (!TEAM_ID_REGEX.test(teamId)) {
      return createErrorResponse("Invalid team id", 400, req);
    }

    // Ensure caller belongs to the team
    const { data: membership, error: membershipError } = await supabase
      .from("team_memberships")
      .select("team_id")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return createErrorResponse("You are not a member of this team", 403, req);
    }

    // Fetch all member IDs for the team
    const { data: members, error: membersError } = await supabase
      .from("team_memberships")
      .select("user_id")
      .eq("team_id", teamId);

    if (membersError) {
      return createErrorResponse("Failed to load team members", 500, req);
    }

    const memberIds = Array.from(
      new Set(
        (members || [])
          .map((m) => m.user_id as string)
          .filter((id) => UUID_REGEX.test(id))
      )
    );

    return createSuccessResponse({ members: memberIds });
  } catch (error) {
    console.error("team-members error:", error);
    return createErrorResponse("Internal server error", 500, req);
  }
});
