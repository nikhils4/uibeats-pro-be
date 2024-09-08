const express = require("express");
const router = express.Router();
const { sendEmail } = require("../utils/email");
const { generateStrongPassword } = require("../utils");
const User = require("../models/User.schema");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      try {
        const customerEmail = session.customer_details.email;
        console.log("Customer email/ webhook:", customerEmail);
        let user = await User.findOne({ email: customerEmail });
        let message = "";
        if (user) {
          user.payments = user.payments || [];
          user.payments.push({
            amount: session.amount_total,
            currency: session.currency,
            productId: session.metadata.productId,
            date: new Date(),
            sessionId: session.id,
          });
          await user.save();
          message = "Payment received, updating existing account";
          await sendEmail(
            customerEmail,
            "Welcome to ui/beats Insider",
            "welcome-pro",
            {}
          );
        } else {
          message = "Payment received, creating new account";
          const tempPassword = generateStrongPassword(12);
          const stripeCustomer = await stripe.customers.create({
            email: customerEmail,
          });

          user = new User({
            email: customerEmail,
            password: tempPassword,
            stripeCustomerId: stripeCustomer.id,
            isVerified: false,
            payments: [
              {
                amount: session.amount_total,
                currency: session.currency,
                productId: session.metadata.productId,
                date: new Date(),
                sessionId: session.id,
              },
            ],
          });
          await user.save();
          await sendEmail(
            customerEmail,
            "Welcome to ui/beats Insider",
            "welcome-pro-password",
            { tempPassword }
          );
        }

        return res
          .status(200)
          .json({ message: `Webhook received, ${message}` });
      } catch (error) {
        console.error("Error processing webhook:", error);
        return res.status(500).json({ message: "Error processing webhook" });
      }
    }

    res.json({ received: true });
  }
);

module.exports = router;
