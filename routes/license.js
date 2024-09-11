const express = require('express');
const router = express.Router();
const License = require('../models/License.schema');
const User = require('../models/User.schema');
const authMiddleware = require('../middleware/auth');

// Get the licenses for the user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId).populate('licenses');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const licenseDetails = await Promise.all(user.licenses.map(async (license) => {
      const licenseObj = license.toObject();

      if (license.type === 'team') {
        if (license.owner.toString() === userId) {
          const teamMembers = await User.find(
            { _id: { $in: license.teamMembers } },
            'email name'
          );
          licenseObj.teamMembers = teamMembers;
        } else {
          // If the user is not the owner, don't include team member details
          delete licenseObj.teamMembers;
        }
      }

      return licenseObj;
    }));

    res.status(200).json({ licenses: licenseDetails });
  } catch (error) {
    console.error('Error fetching user licenses:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// Add team member to team license
router.post('/add-team-member', authMiddleware, async (req, res) => {
  try {
    const { licenseId, memberEmail } = req.body;
    const ownerId = req.user.id;

    // Check if license exists and is owned by the requester
    const license = await License.findOne({ _id: licenseId, owner: ownerId });
    if (!license) {
      return res.status(404).json({ message: 'License not found or you are not the owner' });
    }

    // Check if it's a team license
    if (license.type !== 'team') {
      return res.status(400).json({ message: 'This is not a team license' });
    }

    // Check if there's available space in the team
    if (license.teamMembers.length >= license.maxTeamSize) {
      return res.status(400).json({ message: 'Team is already at maximum capacity' });
    }

    // Find the user to be added
    const memberToAdd = await User.findOne({ email: memberEmail });
    if (!memberToAdd) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is already a team member
    if (license.teamMembers.includes(memberToAdd._id)) {
      return res.status(400).json({ message: 'User is already a team member' });
    }

    // Add member to license
    license.teamMembers.push(memberToAdd._id);
    await license.save();

    // Add license to member's licenses
    if (!memberToAdd.licenses.includes(license._id)) {
      memberToAdd.licenses.push(license._id);
      await memberToAdd.save();
    }

    res.status(200).json({ message: 'Team member added successfully' });
  } catch (error) {
    console.error('Error adding team member:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});



module.exports = router;

