const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const User = require("../models/User.schema");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const authMiddleware = require("../middleware/auth");
const { generateStrongPassword } = require("../utils/index");
const { sendEmail, addEmailToMailJet } = require("../utils/email");

router.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    let user = await User.findOne({ email });
    if (user) {
      return res.status(200).json({
        message:
          "User already exists. Please signin or reset your password if you've forgotten your password.",
      });
    }

    const stripeCustomer = await stripe.customers.create({
      email: email,
    });
    await addEmailToMailJet(email);

    user = new User({
      email,
      password: password,
      stripeCustomerId: stripeCustomer.id,
      isVerified: false,
    });

    await user.save();
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === "production",
    });

    res.status(200).json({
      message: "Signed up successful",
      token,
      user: {
        id: user._id,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body;

    let user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({
        message: "User not found. Please signup if you don't have an account.",
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(200).json({
        message:
          "Invalid credentials. Please check your email and password and try again.",
      });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.REFRESH_TOKEN_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === "production",
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(200).json({
        message:
          "If an account with this email exists, you will receive an email with instructions to reset your password.",
      });
    }

    const tempPassword = generateStrongPassword(12); // Generate a 12-character strong password

    user.password = tempPassword;
    await user.save();

    const emailSent = await sendEmail(
      email,
      "Temporary Password for Account Reset",
      "temp-password",
      { tempPassword }
    );

    if (!emailSent) {
      return res.status(500).json({ message: "Failed to send email" });
    }

    res.status(200).json({
      message:
        "If an account with this email exists, you will receive an email with instructions to reset your password.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/refresh-token", async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token not provided" });
    }
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const newAccessToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    res.json({
      message: "Token refreshed successfully",
      token: newAccessToken,
      user: {
        id: user._id,
      },
    });
  } catch (error) {
    console.error(error);
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Refresh token expired" });
    }
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/status", authMiddleware, async (req, res) => {
  try {
    res.status(200).json({
      message: "User is authenticated",
      user: {
        id: req.user._id,
      },
    });
  } catch (error) {
    console.error("Auth status check error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
