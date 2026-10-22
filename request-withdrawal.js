const { json, handleOptions, getAuthenticatedUser, parseBody } = require("./_shared");

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const auth = await getAuthenticatedUser(event);
    if (auth.error) return json(401, { error: auth.error });
    const body = parseBody(event);
    const amountNaira = Number(body?.amountNaira);
    const bankName = typeof body?.bankName === "string" ? body.bankName.trim().slice(0, 100) : "";
    const accountNumber = typeof body?.accountNumber === "string" ? body.accountNumber.replace(/\D/g, "") : "";
    const accountName = typeof body?.accountName === "string" ? body.accountName.trim().slice(0, 120) : "";

    if (!Number.isFinite(amountNaira) || amountNaira < 5000 || !Number.isInteger(amountNaira)) {
      return json(400, { error: "Minimum withdrawal is ₦5,000." });
    }
    if (!bankName || accountNumber.length !== 10 || !accountName) {
      return json(400, { error: "Provide a bank name, 10-digit account number and account name." });
    }

    const { data, error } = await auth.supabase.rpc("request_withdrawal", {
      p_user_id: auth.user.id,
      p_amount_kobo: amountNaira * 100,
      p_bank_name: bankName,
      p_account_number: accountNumber,
      p_account_name: accountName
    });
    if (error) {
      console.error("request-withdrawal RPC error:", error.message);
      return json(400, { error: "Withdrawal request could not be created. Check your available balance." });
    }
    return json(201, { message: "Withdrawal request submitted for admin review.", withdrawalId: data });
  } catch (error) {
    console.error("request-withdrawal error:", error.message);
    return json(500, { error: "Unexpected server error." });
  }
};
