const { json, handleOptions, getAuthenticatedUser, parseBody } = require("./_shared");

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const auth = await getAuthenticatedUser(event);
    if (auth.error) return json(401, { error: auth.error });
    const body = parseBody(event);
    if (!body || typeof body.taskId !== "string") return json(400, { error: "taskId is required." });

    const { data: profile } = await auth.supabase
      .from("profiles").select("registration_paid, account_status").eq("id", auth.user.id).maybeSingle();
    if (!profile?.registration_paid || profile.account_status !== "active") {
      return json(403, { error: "Verified registration payment and an active account are required." });
    }

    const evidenceText = typeof body.evidenceText === "string" ? body.evidenceText.trim().slice(0, 5000) : null;
    const evidenceUrl = typeof body.evidenceUrl === "string" ? body.evidenceUrl.trim().slice(0, 1000) : null;
    if (!evidenceText && !evidenceUrl) return json(400, { error: "Provide task evidence." });
    if (evidenceUrl && !/^https:\/\/\S+$/i.test(evidenceUrl)) {
      return json(400, { error: "Evidence links must use HTTPS." });
    }

    const { data: task } = await auth.supabase.from("tasks")
      .select("id, status, reward_kobo, funded_amount_kobo, spent_amount_kobo, max_submissions")
      .eq("id", body.taskId).eq("status", "published").maybeSingle();
    if (!task) return json(404, { error: "Task not found or not available." });

    const { data: existing } = await auth.supabase.from("task_submissions")
      .select("id").eq("task_id", task.id).eq("user_id", auth.user.id)
      .in("status", ["pending", "approved"]).limit(1);
    if (existing?.length) return json(409, { error: "You have already submitted this task." });

    const { error } = await auth.supabase.from("task_submissions").insert({
      task_id: task.id,
      user_id: auth.user.id,
      evidence_text: evidenceText,
      evidence_url: evidenceUrl,
      status: "pending"
    });
    if (error) return json(500, { error: "Submission could not be saved." });
    return json(201, { message: "Submission received for review." });
  } catch (error) {
    console.error("submit-task error:", error.message);
    return json(500, { error: "Unexpected server error." });
  }
};
