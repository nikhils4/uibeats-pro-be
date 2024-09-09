const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const LicenseSchema = new Schema({
  type: {
    type: String,
    enum: ["individual", "team"],
    required: true,
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  teamMembers: [
    {
      _id: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      email: {
        type: String,
        required: true,
      },
    },
  ],
  maxTeamSize: {
    type: Number,
    default: function () {
      return this.type === "team" ? 5 : 1;
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isLifetime: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Middleware to update the updatedAt field on save
LicenseSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual property to get the number of available team slots
LicenseSchema.virtual("availableTeamSlots").get(function () {
  if (this.type === "team") {
    return this.maxTeamSize - this.teamMembers.length;
  }
  return 0;
});

// Method to add a team member
LicenseSchema.methods.addTeamMember = function (userId) {
  if (this.type === "team" && this.teamMembers.length < this.maxTeamSize) {
    this.teamMembers.push(userId);
    return true;
  }
  return false;
};

module.exports = mongoose.model("License", LicenseSchema);
