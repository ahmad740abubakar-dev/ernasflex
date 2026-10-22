const { json, handleOptions, getAuthenticatedUser, parseBody } = require("./_shared");

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const auth = await getAuthenticatedUser(event);
    if (auth.error) return json(401, { error: auth.error });

    const body = parseBody(event);
    if (!body) return json(400, { error: "Invalid JSON." });

    const email = auth.user.email;
    const referralCode = typeof body.referralCode === "string" ? body.referralCode.trim().slice(0, 32) : null;
    const amountNaira = 2500;
    const reference = `EFREG_${auth.user.id.replace(/-/g, "").slice(0, 16)}_${Date.now()}`;

    // Amount is fixed on the server; the browser cannot choose the fee.
    const { data: existing } = await auth.supabase
      .from("payments")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("purpose", "registration")
      .eq("status", "success")
      .limit(1);

    if (existing && existing.length) {
      return json(409, { error: "Registration payment has already been verified." });
    }

    const { error: insertError } = await auth.supabase.from("payments").insert({
      user_id: auth.user.id,
      purpose: "registration",
      amount_kobo: amountNaira * 100,
      currency: "NGN",
      reference,
      status: "pending",
      metadata: { referral_code: referralCode }
    });
    if (insertError) return json(500, { error: "Could not create payment record." });

    const paystackResponse = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        amount: amountNaira * 100,
        currency: "NGN",
        reference,
        callback_url: `${process.env.SITE_URL}/payment-return.html`,
        metadata: {
          user_id: auth.user.id,
          purpose: "registration",
          referral_code: referralCode
        }
      })
    });

    const result = await paystackResponse.json();
    if (!paystackResponse.ok || !result.status || !result.data?.authorization_url) {
      await auth.supabase.from("payments").update({ status: "failed" }).eq("reference", reference);
      return json(502, { error: "Payment provider could not initialize the transaction." });
    }

    return json(200, {
      authorizationUrl: result.data.authorization_url,
      reference
    });
  } catch (error) {
    console.error("paystack-initialize error:", error.message);
    return json(500, { error: "Unexpected server error." });
  }
};
