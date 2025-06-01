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

// Update Rosca details method
router.put("/update/:id", async (req, res) => {
  const roscaId = req.params.id;
  const { name, membersCount, monthlyAmount, startingDate, endingDate } =
    req.body;

  // Validate required fields
  if (
    !name ||
    !membersCount ||
    !monthlyAmount ||
    !startingDate ||
    !endingDate
  ) {
    return res.status(400).json({
      success: false,
      error:
        "Missing or invalid required fields: name, membersCount, monthlyAmount, startingDate, endingDate.",
    });
  }

  try {
    // Find the rosca by ID
    const rosca = await Rosca.findById(roscaId);
    if (!rosca) {
      return res
        .status(404)
        .json({ success: false, error: "Rosca not found." });
    }

    // Update fields
    rosca.name = name;
    rosca.membersCount = membersCount;
    rosca.monthlyAmount = monthlyAmount;
    rosca.startingDate = new Date(startingDate);
    rosca.endingDate = new Date(endingDate);

    // Recalculate totalAmount
    rosca.totalAmount = membersCount * monthlyAmount;

    // Save updated rosca
    const updatedRosca = await rosca.save();

    res.status(200).json({
      success: true,
      message: "Rosca details updated successfully.",
      rosca: updatedRosca,
    });
  } catch (err) {
    console.error("Error updating Rosca details:", err);
    res.status(500).json({
      success: false,
      error: "Server error while updating Rosca details.",
    });
  }
});

module.exports = mongoose.model("Rosca", roscaSchema);
