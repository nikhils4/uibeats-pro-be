const express = require("express");
const router = express.Router();
const License = require("../models/License.schema");
const User = require("../models/User.schema");
const authMiddleware = require("../middleware/auth");
const { sendEmail } = require("../utils/email");

router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate("licenses");

    if (!user) {
      return res
        .status(404)
        .json({
          message:
            "We couldn't find your user account. Please try logging in again.",
        });
    }

    const licenseDetails = await Promise.all(
      user.licenses.map(async (license) => {
        const licenseObj = license.toObject();

        if (license.type === "team") {
          if (license.owner.toString() === userId) {
            const teamMembers = await User.find(
              { _id: { $in: license.teamMembers } },
              "email name"
            );
            licenseObj.teamMembers = teamMembers;
          } else {
            delete licenseObj.teamMembers;
          }
        }

        return licenseObj;
      })
    );

    licenseDetails.sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.status(200).json({
      licenses: licenseDetails,
      user: {
        name: user.name,
      },
    });
  } catch (error) {
    console.error("Error fetching user licenses:", error);
    res
      .status(500)
      .json({
        message:
          "Oops! Something went wrong while fetching your licenses. Please try again later.",
      });
  }
});

router.post("/add-team-member", authMiddleware, async (req, res) => {
  try {
    const { licenseId, memberEmail } = req.body;
    const ownerId = req.user.id;

    const license = await License.findOne({ _id: licenseId, owner: ownerId });
    if (!license) {
      return res
        .status(404)
        .json({
          message:
            "We couldn't find the license you're looking for. Please double-check and try again.",
        });
    }

    if (license.type !== "team") {
      return res
        .status(400)
        .json({
          message:
            "Oops! It looks like this isn't a team license. Only team licenses can add members.",
        });
    }

    if (license.teamMembers.length >= license.maxTeamSize) {
      return res
        .status(400)
        .json({
          message:
            "Your team is full! Consider upgrading your plan to add more members.",
        });
    }

    const memberToAdd = await User.findOne({ email: memberEmail });
    if (!memberToAdd) {
      return res
        .status(404)
        .json({
          message:
            "We couldn't find a user with that email. Make sure the email is correct and the user has an account with us.",
        });
    }

    if (license.teamMembers.includes(memberToAdd._id)) {
      return res
        .status(400)
        .json({
          message: "Good news! This user is already part of your team.",
        });
    }

    if (license.owner.toString() !== ownerId) {
      return res
        .status(403)
        .json({
          message:
            "Oops! It looks like you don't have permission to add team members. Only the license owner can do that. If you think this is a mistake, please contact the license owner or our support team.",
        });
    }

    license.teamMembers.push(memberToAdd._id);
    await license.save();

    if (!memberToAdd.licenses.includes(license._id)) {
      memberToAdd.licenses.push(license._id);
      await memberToAdd.save();
    }

    const ownerUser = await User.findById(ownerId);
    await sendEmail(
      memberEmail,
      "Welcome to the Team!",
      "member-add",
      {
        inviter_email: ownerUser.email,
        user_email: memberToAdd.email
      }
    );

    res
      .status(200)
      .json({
        message: "Great! The new team member has been added successfully.",
      });
  } catch (error) {
    console.error("Error adding team member:", error);
    res
      .status(500)
      .json({
        message:
          "Oops! Something went wrong on our end. Please try again later or contact support if the problem persists.",
      });
  }
});

router.post("/remove-team-member", authMiddleware, async (req, res) => {
  try {
    const { licenseId, memberEmail } = req.body;

    const ownerId = req.user.id;

    const license = await License.findById(licenseId);
    if (!license) {
      return res
        .status(404)
        .json({
          message:
            "We couldn't find the license you're looking for. Please double-check and try again.",
        });
    }

    if (license.type !== "team") {
      return res
        .status(400)
        .json({
          message:
            "Oops! It looks like this isn't a team license. Only team licenses can remove members.",
        });
    }

    if (license.owner.toString() !== ownerId) {
      return res
        .status(403)
        .json({
          message:
            "Oops! It looks like you don't have permission to remove team members. Only the license owner can do that. If you think this is a mistake, please contact our support team.",
        });
    }

    const memberToRemove = await User.findOne({ email: memberEmail });
    if (!memberToRemove) {
      return res
        .status(404)
        .json({
          message:
            "We couldn't find a user with that email. Make sure the email is correct.",
        });
    }

    if (memberToRemove._id.toString() === license.owner.toString()) {
      return res
        .status(400)
        .json({
          message: "The license owner cannot be removed from the team.",
        });
    }

    if (!license.teamMembers.includes(memberToRemove._id)) {
      return res
        .status(400)
        .json({ message: "This user is not part of your team." });
    }

    license.teamMembers = license.teamMembers.filter(
      (memberId) => memberId.toString() !== memberToRemove._id.toString()
    );
    await license.save();

    memberToRemove.licenses = memberToRemove.licenses.filter(
      (licenseId) => licenseId.toString() !== license._id.toString()
    );
    await memberToRemove.save();

    await sendEmail(memberEmail, "Team Membership Update", "member-remove", {
      license_owner_email: (await User.findById(license.owner)).email,
    });

    res
      .status(200)
      .json({ message: "The team member has been removed successfully." });
  } catch (error) {
    console.error("Error removing team member:", error);
    res
      .status(500)
      .json({
        message:
          "Oops! Something went wrong on our end. Please try again later or contact support if the problem persists.",
      });
  }
});

// Check if user has any active license
router.get("/check-active", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate("licenses");

    if (!user) {
      return res.status(404).json({
        message: "User not found. Please try logging in again.",
      });
    }

    const hasActiveLicense = user.licenses.length > 0;

    res.status(200).json({
      hasActiveLicense,
      licenseCount: user.licenses.length,
    });
  } catch (error) {
    console.error("Error checking active license:", error);
    res.status(500).json({
      message: "An error occurred while checking for active licenses. Please try again later.",
    });
  }
});


module.exports = router;
