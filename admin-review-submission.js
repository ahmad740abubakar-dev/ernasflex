const { json, handleOptions, getAuthenticatedUser, requireAdmin, parseBody } = require("./_shared");

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const auth = await getAuthenticatedUser(event);
    if (auth.error) return json(401, { error: auth.error });
    if (!(await requireAdmin(auth.supabase, auth.user.id))) return json(403, { error: "Admin access required." });

    const body = parseBody(event);
    if (!body || typeof body.submissionId !== "string" || !["approved", "rejected"].includes(body.decision)) {
      return json(400, { error: "submissionId and approved/rejected decision are required." });
    }

    // Approval and ledger credit should be one atomic database transaction.
    // This endpoint calls a Postgres RPC so a submission cannot be paid twice.
    const { data, error } = await auth.supabase.rpc("admin_review_submission", {
      p_submission_id: body.submissionId,
      p_decision: body.decision,
      p_admin_id: auth.user.id,
      p_review_note: typeof body.reviewNote === "string" ? body.reviewNote.slice(0, 1000) : null
    });
    if (error) {
      console.error("admin-review-submission RPC error:", error.message);
      return json(400, { error: "Could not review submission. Check its status and database setup." });
    }
    return json(200, { result: data });
  } catch (error) {
    console.error("admin-review-submission error:", error.message);
    return json(500, { error: "Unexpected server error." });
  }
};
