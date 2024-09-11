const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const User = require("../models/User.schema");
const jwt = require("jsonwebtoken");

router.post("/create-payment-link", async (req, res) => {
  try {
    let userEmail;
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(" ")[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          const user = await User.findById(decoded.userId);
          if (user) {
            userEmail = user.email;
          }
        } catch (error) {
          console.error("Error decoding token:", error);
        }
      }
    }
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({ message: "Product ID is required" });
    }

    const product = await stripe.products.retrieve(productId);
    const price = await stripe.prices.retrieve(product.default_price);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      allow_promotion_codes: true,
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.PRODUCTION_FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.PRODUCTION_FRONTEND_URL}/payment/cancelled`,
      metadata: {
        productId: productId,
      },
      ...(userEmail && { customer_email: userEmail }),
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Error creating payment link:", error);
    res.status(500).json({ message: "Error creating payment link" });
  }
});

router.post("/verify-payment", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: "Session ID is required" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(400).json({ message: "Payment not completed" });
    }

    const user = await User.findOne({
      "payments.sessionId": sessionId,
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const payment = user.payments.find((p) => p.sessionId === sessionId);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const paymentTime = new Date(payment.date);
    const currentTime = new Date();
    const timeDifference = currentTime - paymentTime;
    const hoursDifference = timeDifference / (1000 * 60 * 60);

    if (hoursDifference > 24) {
      return res
        .status(400)
        .json({ message: "Payment login window has expired" });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      { expiresIn: "24h" }
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({
      message: "Payment verified and login tokens generated",
      token,
    });
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ message: "Error verifying payment" });
  }
});

module.exports = router;
