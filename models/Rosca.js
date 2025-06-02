const mongoose = require("mongoose");

const memberPayments = new mongoose.Schema({
  toUserId: String,
  toUserName: String,
  month: String,
  paymentStatus: String, // 'paid', 'unpaid', 'nextPay'
});

const memberSchema = new mongoose.Schema({
  _id: String,
  name: String,
  isAdmin: Boolean,
  memberPaymentStatus: String, // 'paid', 'unpaid', 'nextPay'
  totalPayments: Number,
  memberOrder: Number,
  memberStatus: String, // 'accepted', 'waiting'
  assignedDate: String,
  payments: [memberPayments],
});

const roscaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    membersCount: { type: Number, required: true },
    monthlyAmount: { type: Number, required: true },
    startingDate: { type: Date, required: true },
    endingDate: { type: Date, required: true },
    totalAmount: Number,
    membersArray: [memberSchema],
    roscaStatus: { type: String, default: "pending" }, // 'pending', 'active', 'closed'
    invitationCode: { type: String, required: true, length: 6 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Rosca", roscaSchema);
