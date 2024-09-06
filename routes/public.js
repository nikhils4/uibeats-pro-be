const express = require("express");
const router = express.Router();

router.get("/up", (req, res) => {
  try {
    console.log("Instance woken up at:", new Date().toISOString());
    res.status(200).json({ message: "Up processed" });
  } catch (error) {
    console.error("Error waking up instance:", error);
    res.status(500).json({ message: "Error while processing up" });
  }
});

module.exports = router;
