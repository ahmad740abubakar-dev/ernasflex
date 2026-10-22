const crypto = require("crypto");
const { adminClient, json } = require("./_shared");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = event.headers["x-paystack-signature"];
  if (!secret || !signature || !event.body) return json(400, { error: "Invalid webhook request." });

  const expected = crypto.createHmac("sha512", secret).update(event.body).digest("hex");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return json(401, { error: "Invalid webhook signature." });
  }

  try {
    const payload = JSON.parse(event.body);
    if (payload.event !== "charge.success" || !payload.data?.reference) {
      return json(200, { received: true });
    }

    // Never trust the webhook payload alone: verify the reference with Paystack.
    const verifyResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(payload.data.reference)}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    const verification = await verifyResponse.json();
    if (!verifyResponse.ok || !verification.status || verification.data?.status !== "success") {
      return json(400, { error: "Transaction verification failed." });
    }

    const tx = verification.data;
    const supabase = adminClient();
    const { data: payment, error } = await supabase
      .from("payments")
      .select("*")
      .eq("reference", tx.reference)
      .maybeSingle();

    if (error || !payment) return json(404, { error: "Payment record not found." });
    if (payment.status === "success") return json(200, { received: true, duplicate: true });

    if (Number(tx.amount) !== Number(payment.amount_kobo) || tx.currency !== payment.currency) {
      await supabase.from("payments").update({ status: "review" }).eq("id", payment.id);
      return json(400, { error: "Amount or currency mismatch; flagged for review." });
    }

    const { error: updateError } = await supabase.from("payments").update({
      status: "success",
      paid_at: new Date().toISOString(),
      provider_transaction_id: String(tx.id),
      provider_response: { channel: tx.channel, paid_at: tx.paid_at }
    }).eq("id", payment.id).eq("status", "pending");

    if (updateError) return json(500, { error: "Could not update payment record." });

    if (payment.purpose === "registration") {
      await supabase.from("profiles").update({
        registration_paid: true,
        account_status: "active"
      }).eq("id", payment.user_id);

      const referralCode = payment.metadata?.referral_code;
      if (referralCode) {
        const { data: referrer } = await supabase
          .from("profiles")
          .select("id")
          .eq("referral_code", referralCode)
          .neq("id", payment.user_id)
          .maybeSingle();

        if (referrer) {
          await supabase.from("referrals").upsert({
            referrer_id: referrer.id,
            referred_user_id: payment.user_id,
            status: "awaiting_first_approved_task",
            registration_payment_id: payment.id
          }, { onConflict: "referred_user_id", ignoreDuplicates: true });
        }
      }
    }
    return json(200, { received: true });
  } catch (error) {
    console.error("paystack-webhook error:", error.message);
    return json(500, { error: "Webhook processing failed." });
  }
};
