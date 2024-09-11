const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: [true, 'Please provide an email'],
        unique: true,
        trim: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    password: {
        type: String,
        required: [true, 'Please provide a password'],
        minlength: [8, 'Password should be at least 8 characters long']
    },
    name: {
        type: String,
        trim: true
  },
    stripeCustomerId: {
        type: String,
        required: true,
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    licenses: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'License'
        }
    ],
    payments: [
      {
        amount: Number,
        currency: String,
        productId: String,
        date: Date,
        sessionId: String,
        isPaid: {
          type: Boolean,
          default: false
        }
      }
    ]
}, {
    timestamps: true
});

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

userSchema.methods.matchPassword = async function(enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
