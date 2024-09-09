const express = require('express');
const router = express.Router();
const License = require('../models/License.schema');
const User = require('../models/User.schema');
const authMiddleware = require('../middleware/auth');

router.post('/activate', authMiddleware, async (req, res) => {
    try {
        const { type } = req.body;
        
        if (!['individual', 'team'].includes(type)) {
            return res.status(400).json({ message: 'Invalid license type' });
        }

        const owner = req.user._id;

        const newLicense = new License({
            type,
            owner,
            maxTeamSize: type === 'team' ? 5 : 1,
            isActive: true,
            isLifetime: true
        });

        if (type === 'team') {
          newLicense.teamMembers = [{
            _id: owner,
            email: (await User.findById(owner)).email,
          }];
        }

        await newLicense.save();

        // Update user's licenses
        await User.findByIdAndUpdate(owner, { $push: { licenses: newLicense._id } });

        res.status(201).json({
            message: 'License added successfully',
            license: newLicense
        });
    } catch (error) {
        console.error('Error adding license:', error);
        res.status(500).json({ message: 'Error adding license' });
    }
});

// Endpoint to add a team member to a license
router.post('/addTeamMember', authMiddleware, async (req, res) => {
    try {
        const { licenseId, userId } = req.body;

        const license = await License.findById(licenseId);
        if (!license) {
            return res.status(404).json({ message: 'License not found' });
        }

        if (license.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Not authorized to modify this license' });
        }

        if (license.type !== 'team') {
            return res.status(400).json({ message: 'This is not a team license' });
        }

        const success = license.addTeamMember(userId);
        if (!success) {
            return res.status(400).json({ message: 'Unable to add team member. Team may be full.' });
        }

        await license.save();

        res.status(200).json({
            message: 'Team member added successfully',
            license: license
        });
    } catch (error) {
        console.error('Error adding team member:', error);
        res.status(500).json({ message: 'Error adding team member' });
    }
});

module.exports = router;

