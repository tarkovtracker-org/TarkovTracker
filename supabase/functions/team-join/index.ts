import {
    authenticateUser,
    handleCorsPreflight,
    validateMethod,
    validateRequiredFields,
    createErrorResponse,
    createSuccessResponse,
    type AuthSuccess
} from 'shared/auth';
import { enforceUserMutationRateLimit } from "../_shared/rate-limit.ts"

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
    const rateLimitResponse = await enforceUserMutationRateLimit(req, supabase, user.id, "team-join")
    if (rateLimitResponse) return rateLimitResponse
    // Parse and validate request body
    const body = await req.json()
    const joinCode =
      typeof body.join_code === "string"
        ? body.join_code
        : typeof (body as Record<string, unknown>).password === "string"
          ? (body as { password: string }).password
          : undefined
    const fieldsError = validateRequiredFields(req, { ...body, join_code: joinCode }, ["teamId", "join_code"])
    if (fieldsError) return fieldsError
    const { teamId } = body
    const join_code = joinCode as string
    // Get team details first to know the game_mode
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("id, name, join_code, max_members, game_mode")
      .eq("id", teamId)
      .single()
    if (teamError || !team) {
      console.error("Team lookup failed:", teamError)
      return createErrorResponse("Team not found", 404, req)
    }
    // Get the team's game mode
    const game_mode: GameMode = VALID_GAME_MODES.includes(team.game_mode as GameMode) 
      ? team.game_mode as GameMode 
      : "pvp"
    // Verify join code
    if (team.join_code !== join_code) {
      return createErrorResponse("Invalid team join code", 403, req)
    }
    // Check if user is already in a team for this game mode
    const { data: existingMembership, error: membershipCheckError } = await supabase
      .from("team_memberships")
      .select("team_id, game_mode")
      .eq("user_id", user.id)
      .eq("game_mode", game_mode)
      .limit(1)
    if (membershipCheckError) {
      console.error("Membership check failed:", membershipCheckError)
      return createErrorResponse("Failed to check existing team membership", 500, req)
    }
    if (existingMembership && existingMembership.length > 0) {
      const existingTeamId = existingMembership[0].team_id
      if (existingTeamId) {
        const teamIdColumn = game_mode === "pve" ? "pve_team_id" : "pvp_team_id"
        const { error: systemHealError } = await supabase
          .from("user_system")
          .upsert({
            user_id: user.id,
            [teamIdColumn]: existingTeamId,
            updated_at: new Date().toISOString()
          })
        if (systemHealError) {
          console.error("user_system heal failed:", systemHealError)
        }
      }
      return createErrorResponse(`You are already a member of a ${game_mode.toUpperCase()} team. Leave your current team first.`, 400, req)
    }
    // Check if team is full
    const { data: currentMembers, error: membersError } = await supabase
      .from("team_memberships")
      .select("user_id", { count: "exact", head: false })
      .eq("team_id", teamId)
    if (membersError) {
      console.error("Members count failed:", membersError)
      return createErrorResponse("Failed to check team capacity", 500, req)
    }
    if (currentMembers && currentMembers.length >= team.max_members) {
      return createErrorResponse("Team is full", 400, req)
    }
    // Add user to team with game_mode
    const { error: joinError } = await supabase
      .from("team_memberships")
      .insert({
        team_id: teamId,
        user_id: user.id,
        role: "member",
        game_mode: game_mode,
        joined_at: new Date().toISOString()
      })
    if (joinError) {
      console.error("Team join failed:", joinError)
      // Check for unique constraint violation (already a member somehow)
      if (joinError.code === "23505") {
        return createErrorResponse("You are already a member of this team", 409, req)
      }
      return createErrorResponse("Failed to join team", 500, req)
    }
    // Log team join event
    await supabase
      .from("team_events")
      .insert({
        team_id: teamId,
        event_type: "member_joined",
        target_user: user.id,
        initiated_by: user.id,
        event_data: { team_name: team.name },
        created_at: new Date().toISOString()
      })
    // Update user_system with the correct team_id column based on game mode
    const teamIdColumn = game_mode === "pve" ? "pve_team_id" : "pvp_team_id"
    const { error: systemError } = await supabase
      .from("user_system")
      .upsert({
        user_id: user.id,
        [teamIdColumn]: teamId,
        updated_at: new Date().toISOString()
      })
    if (systemError) {
      console.error("user_system upsert failed:", systemError)
      return createErrorResponse("Failed to update user system state", 500, req)
    }
    return createSuccessResponse({
      success: true,
      message: "Successfully joined team",
      team: {
        id: team.id,
        name: team.name
      }
    }, 200, req)
  } catch (error) {
    console.error("Team join error:", error)
    return createErrorResponse("Internal server error", 500, req)
  }
})
