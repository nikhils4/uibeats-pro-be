const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const LicenseSchema = new Schema(
  {
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
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    maxTeamSize: {
      type: Number,
      default: function () {
        return this.type === "team" ? 11 : 1;
      },
    },
  },
  {
    timestamps: true,
  }
);

LicenseSchema.virtual("availableTeamSlots").get(function () {
  if (this.type === "team") {
    return this.maxTeamSize - this.teamMembers.length;
  }
  return 0;
});

LicenseSchema.methods.addTeamMember = function (userId) {
  if (this.type === "team" && this.teamMembers.length < this.maxTeamSize) {
    this.teamMembers.push(userId);
    return true;
  }
  return false;
};

module.exports = mongoose.model("License", LicenseSchema);
