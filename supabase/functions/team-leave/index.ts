import {
  authenticateUser,
  handleCorsPreflight,
  validateMethod,
  validateRequiredFields,
  validateUUIDs,
  createErrorResponse,
  createSuccessResponse,
  type AuthSuccess
} from 'shared/auth';
import { enforceUserMutationRateLimit } from "../_shared/rate-limit.ts"
const LEAVE_COOLDOWN_MINUTES = 5
const VALID_GAME_MODES = ["pvp", "pve"] as const
type GameMode = typeof VALID_GAME_MODES[number]
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCorsPreflight(req)
  if (corsResponse) return corsResponse
  try {
    // Validate HTTP method
    const methodError = validateMethod(req, ["POST"])
    if (methodError) return methodError
    // Authenticate user
    const authResult = await authenticateUser(req)
    if ("error" in authResult) {
      return createErrorResponse(authResult.error, authResult.status, req)
    }
    const { user, supabase } = authResult as AuthSuccess
    const rateLimitResponse = await enforceUserMutationRateLimit(req, supabase, user.id, "team-leave")
    if (rateLimitResponse) return rateLimitResponse
    // Parse and validate request body
    const body = await req.json()
    const fieldsError = validateRequiredFields(req, body, ["teamId"])
    if (fieldsError) return fieldsError
    const uuidError = validateUUIDs(req, body, ["teamId"])
    if (uuidError) return uuidError
    const { teamId } = body
    // Get the team's game_mode first
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("game_mode")
      .eq("id", teamId)
      .single()
    if (teamError || !team) {
      console.error("Team lookup failed:", teamError)
      return createErrorResponse("Team not found", 404, req)
    }
    const game_mode: GameMode = VALID_GAME_MODES.includes(team.game_mode as GameMode) 
      ? team.game_mode as GameMode 
      : "pvp"
    const teamIdColumn = game_mode === "pve" ? "pve_team_id" : "pvp_team_id"
    // Get user's membership in the team
    const { data: membership, error: membershipError } = await supabase
      .from("team_memberships")
      .select("role, team_id")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single()
    if (membershipError || !membership) {
      return createErrorResponse("You are not a member of this team", 404, req)
    }
    // Check if user is the owner
    if (membership.role === "owner") {
      // Check if there are other members
      const { data: otherMembers, error: membersError } = await supabase
        .from("team_memberships")
        .select("user_id")
        .eq("team_id", teamId)
        .neq("user_id", user.id)
      if (membersError) {
        console.error("Members check failed:", membersError)
        return createErrorResponse("Failed to check team members", 500, req)
      }
      if (otherMembers && otherMembers.length > 0) {
        return createErrorResponse(
          "Team owner cannot leave while team has other members. Transfer ownership or kick all members first.",
          400,
          req
        )
      }
      // If no other members, disband the team by:
      // 1. Clear user_system team_id first (to avoid FK constraint)
      const { error: systemError } = await supabase
        .from("user_system")
        .upsert({
          user_id: user.id,
          [teamIdColumn]: null,
          updated_at: new Date().toISOString()
        })
      if (systemError) {
        console.error("user_system upsert failed:", systemError)
        // If the table is missing in an environment, don't block disbanding the team
        if (systemError.code !== "42P01") {
          return createErrorResponse("Failed to update user system state", 500, req)
        }
        console.warn("user_system table missing, continuing without system state update")
      }
      // 2. Delete all memberships (including owner's)
      const { error: membershipDeleteError } = await supabase
        .from("team_memberships")
        .delete()
        .eq("team_id", teamId)
      if (membershipDeleteError) {
        console.error("Membership deletion failed:", membershipDeleteError)
        return createErrorResponse("Failed to delete team memberships", 500, req)
      }
      // 3. Finally delete the team
      const { error: teamDeleteError } = await supabase
        .from("teams")
        .delete()
        .eq("id", teamId)
      if (teamDeleteError) {
        console.error("Team deletion failed:", teamDeleteError)
        return createErrorResponse("Failed to delete team", 500, req)
      }
      return createSuccessResponse({
        success: true,
        message: "Team deleted successfully (owner left empty team)"
      }, 200, req)
    }
    // Check cooldown period (5 minutes between leaves)
    const cooldownTimestamp = new Date(Date.now() - LEAVE_COOLDOWN_MINUTES * 60 * 1000).toISOString()
    const { data: recentLeaves, error: cooldownError } = await supabase
      .from("team_events")
      .select("created_at")
      .eq("event_type", "member_left")
      .eq("target_user", user.id)
      .gte("created_at", cooldownTimestamp)
      .limit(1)
    if (!cooldownError && recentLeaves && recentLeaves.length > 0) {
      const timeRemaining = Math.ceil(
        (new Date(recentLeaves[0].created_at).getTime() + LEAVE_COOLDOWN_MINUTES * 60 * 1000 - Date.now()) / 1000 / 60
      )
      return createErrorResponse(
        `Must wait ${timeRemaining} minute(s) before leaving another team`,
        429,
        req
      )
    }
    // Remove user from team and verify deletion
    const { error: leaveError, count: deletedCount } = await supabase
      .from("team_memberships")
      .delete({ count: 'exact' })
      .eq("team_id", teamId)
      .eq("user_id", user.id)
    if (leaveError) {
      console.error("Team leave failed:", leaveError)
      return createErrorResponse("Failed to leave team", 500, req)
    }
    if (!deletedCount || deletedCount === 0) {
      console.error("Team leave failed: User not in team", { teamId, userId: user.id })
      return createErrorResponse("User not found in team or already left", 404, req)
    }
    // Log team leave event with error handling
    const { error: eventError } = await supabase
      .from("team_events")
      .insert({
        team_id: teamId,
        event_type: "member_left",
        target_user: user.id,
        initiated_by: user.id,
        created_at: new Date().toISOString()
      })
    if (eventError) {
      console.error("Failed to log leave event:", eventError, { teamId, userId: user.id })
      // Leave succeeded but audit log failed - continue with warning
    }
    // Clear user_system team_id for the leaver (using correct game mode column)
    const { error: systemError } = await supabase
      .from("user_system")
      .upsert({
        user_id: user.id,
        [teamIdColumn]: null,
        updated_at: new Date().toISOString()
      })
    if (systemError) {
      console.error("user_system upsert failed:", systemError)
      // If the table is missing in an environment, don't block leaving the team
      if (systemError.code !== "42P01") {
        return createErrorResponse("Failed to update user system state", 500, req)
      }
      console.warn("user_system table missing, continuing without system state update")
    }
    return createSuccessResponse({
      success: true,
      message: "Successfully left team"
    }, 200, req)
  } catch (error) {
    console.error("Team leave error:", error)
    return createErrorResponse("Internal server error", 500, req)
  }
})
