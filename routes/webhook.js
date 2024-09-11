const express = require("express");
const router = express.Router();
const { sendEmail } = require("../utils/email");
const { generateStrongPassword } = require("../utils");
const User = require("../models/User.schema");
const License = require("../models/License.schema");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { addEmailToMailJet } = require("../utils/email");

async function handleLicenseAndUser(user, session) {
  const productId = session.metadata.productId;
  let licenseType;

  if (productId === process.env.INDIVIDUAL_LICENSE_PID) {
    licenseType = 'individual';
  } else if (productId === process.env.TEAM_LICENSE_PID) {
    licenseType = 'team';
  } else {
    console.error(`Unknown product ID: ${productId}`);
    throw new Error('Invalid product ID');
  }

  const newLicense = new License({
    type: licenseType,
    owner: user._id,
    maxTeamSize: licenseType === 'team' ? 11 : 1,
    teamMembers: [user._id]
  });

  await newLicense.save();

  const updatedUser = await User.findOneAndUpdate(
    { "payments.sessionId": session.id },
    { 
      $set: { "payments.$.isPaid": true },
      $push: { licenses: newLicense._id }
    },
    { new: true }
  );

  if (!updatedUser) {
    console.log(`No user found with session ID: ${session.id}`);
  } else {
    console.log(
      `Updated payment status and added license for user: ${updatedUser.email}`
    );
  }

  return updatedUser;
}

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

    if (event.type === "checkout.session.completed" && event.data.object.payment_status === "paid") {
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
          await addEmailToMailJet(customerEmail);

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

        await handleLicenseAndUser(user, session);

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
