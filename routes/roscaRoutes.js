const express = require("express");
const Rosca = require("../models/Rosca");

const router = express.Router();

// Generate 6-digit invitation code
function generateInvitationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Helper to update payments and payment statuses for all members
async function updatePaymentsForAllMembers(rosca) {
  const start = new Date(rosca.startingDate);
  const end = new Date(rosca.endingDate);
  const months = [];

  // Generate list of months in ISO string (YYYY-MM) between start and end inclusive
  let current = new Date(start);
  while (current <= end) {
    months.push(current.toISOString().substring(0, 7));
    current.setMonth(current.getMonth() + 1);
  }

  // Update payments for each member
  rosca.membersArray.forEach((member) => {
    // Initialize payments array if missing
    if (!member.payments) member.payments = [];

    member.payments = months.map((month) => {
      // Check if payment exists for this month
      const existingPayment = member.payments.find((p) => p.month === month);
      return (
        existingPayment || {
          toUserId: member._id,
          toUserName: member.name,
          month,
          paymentStatus:
            member.memberStatus === "accepted" ? "unpaid" : "pending",
        }
      );
    });

    // Calculate totalPayments for paid payments
    member.totalPayments =
      member.payments.filter((p) => p.paymentStatus === "paid").length *
      rosca.monthlyAmount;

    // Update overall memberPaymentStatus
    member.memberPaymentStatus = member.payments.every(
      (p) => p.paymentStatus === "paid"
    )
      ? "paid"
      : "unpaid";
  });

  // Special logic: For new accepted members, update payments between members
  // For each accepted member, mark paymentStatus 'paid' for themselves,
  // and 'unpaid' for others
  rosca.membersArray.forEach((member) => {
    if (member.memberStatus === "accepted") {
      rosca.membersArray.forEach((otherMember) => {
        if (member._id.toString() !== otherMember._id.toString()) {
          // Find payments in otherMember payments array where toUserId == member._id
          otherMember.payments.forEach((payment) => {
            if (payment.toUserId.toString() === member._id.toString()) {
              payment.paymentStatus = "unpaid"; // others owe the new member
            }
          });

          // Find payments in member payments array where toUserId == member._id (self)
          member.payments.forEach((payment) => {
            if (payment.toUserId.toString() === member._id.toString()) {
              payment.paymentStatus = "paid"; // self payments are paid by default
            }
          });
        }
      });
    }
  });
}

// Create Rosca
router.post("/create", async (req, res) => {
  try {
    const {
      name,
      membersCount,
      monthlyAmount,
      startingDate,
      endingDate,
      userData,
    } = req.body;

    if (
      !name ||
      !membersCount ||
      !monthlyAmount ||
      !startingDate ||
      !endingDate
    ) {
      return res
        .status(400)
        .json({ success: false, error: "Missing required rosca fields." });
    }
    if (!userData) {
      return res
        .status(400)
        .json({ success: false, error: "Missing user data." });
    }

    const totalAmount = membersCount * monthlyAmount;
    const invitationCode = generateInvitationCode();

    const adminMember = {
      _id: userData.uid,
      name: userData.displayName,
      isAdmin: true,
      memberPaymentStatus: "paid",
      totalPayments: monthlyAmount,
      memberOrder: 1,
      memberStatus: "accepted",
      assignedDate: startingDate,
      payments: [
        {
          toUserId: userData.uid,
          toUserName: userData.displayName,
          month: startingDate.substring(0, 7),
          paymentStatus: "paid",
        },
      ],
    };

    const newRosca = new Rosca({
      name,
      membersCount,
      monthlyAmount,
      startingDate,
      endingDate,
      totalAmount,
      invitationCode,
      membersArray: [adminMember],
      roscaStatus: "pending",
    });

    await newRosca.save();
    res.status(201).json(newRosca);
  } catch (err) {
    console.error("Error creating Rosca item:", err);
    res.status(500).json({ message: "Error creating Rosca item" });
  }
});

// Get all Roscas for a user ID
router.get("/user/roscas/:id", async (req, res) => {
  const userId = req.params.id;
  if (!userId)
    return res
      .status(400)
      .json({ success: false, error: "User ID is required." });

  try {
    const roscas = await Rosca.find({ "membersArray._id": userId });
    res.status(200).json({ success: true, roscas });
  } catch (err) {
    console.error("Error fetching roscas:", err);
    res
      .status(500)
      .json({ success: false, error: "Server error while fetching roscas." });
  }
});

// Update Rosca status (pending, active, closed)
router.put("/status/:id", async (req, res) => {
  const roscaId = req.params.id;
  const { status } = req.body;
  const allowedStatuses = ["pending", "active", "closed"];

  if (!allowedStatuses.includes(status)) {
    return res
      .status(400)
      .json({
        success: false,
        error: "Invalid status. Allowed: pending, active, closed.",
      });
  }

  try {
    const updatedRosca = await Rosca.findByIdAndUpdate(
      roscaId,
      { roscaStatus: status },
      { new: true }
    );
    if (!updatedRosca)
      return res
        .status(404)
        .json({ success: false, message: "Rosca not found" });

    res
      .status(200)
      .json({
        success: true,
        message: `Rosca status updated to '${status}'`,
        rosca: updatedRosca,
      });
  } catch (err) {
    console.error("Error updating rosca status:", err);
    res
      .status(500)
      .json({ success: false, error: "Server error while updating status" });
  }
});

// Join Rosca
router.post("/join", async (req, res) => {
  const { invitationCode, memberId, memberName } = req.body;
  if (!invitationCode || !memberId || !memberName) {
    return res
      .status(400)
      .json({
        success: false,
        error: "Invitation code, memberId, and memberName are required.",
      });
  }

  try {
    const rosca = await Rosca.findOne({ invitationCode });
    if (!rosca)
      return res
        .status(404)
        .json({
          success: false,
          error: "Rosca not found with this invitation code.",
        });

    const alreadyMember = rosca.membersArray.some(
      (m) => m._id.toString() === memberId.toString()
    );
    if (alreadyMember)
      return res
        .status(409)
        .json({ success: false, error: "Member already joined this Rosca." });

    rosca.membersArray.push({
      _id: memberId,
      name: memberName,
      isAdmin: false,
      memberPaymentStatus: "unpaid",
      totalPayments: 0,
      memberOrder: rosca.membersArray.length + 1,
      memberStatus: "waiting",
      assignedDate: new Date().toISOString(),
      payments: [],
    });

    // Update payments for all members after new join
    await updatePaymentsForAllMembers(rosca);
    await rosca.save();

    res
      .status(200)
      .json({
        success: true,
        message: "Successfully joined the Rosca.",
        rosca,
      });
  } catch (err) {
    console.error("Error joining Rosca:", err);
    res
      .status(500)
      .json({ success: false, error: "Server error while joining Rosca." });
  }
});

// Update Rosca details
router.put("/update/:id", async (req, res) => {
  const roscaId = req.params.id;
  const { name, membersCount, monthlyAmount, startingDate, endingDate } =
    req.body;

  try {
    const rosca = await Rosca.findById(roscaId);
    if (!rosca)
      return res
        .status(404)
        .json({ success: false, error: "Rosca not found." });

    rosca.name = name;
    rosca.membersCount = membersCount;
    rosca.monthlyAmount = monthlyAmount;
    rosca.startingDate = new Date(startingDate);
    rosca.endingDate = new Date(endingDate);
    rosca.totalAmount = membersCount * monthlyAmount;

    // Update payments for all members
    await updatePaymentsForAllMembers(rosca);
    await rosca.save();

    res
      .status(200)
      .json({
        success: true,
        message: "Rosca details updated successfully.",
        rosca,
      });
  } catch (err) {
    console.error("Error updating Rosca details:", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Server error while updating Rosca details.",
      });
  }
});

// Close Rosca
router.put("/close/:id", async (req, res) => {
  const roscaId = req.params.id;
  if (!roscaId)
    return res
      .status(400)
      .json({ success: false, error: "Rosca ID is required." });

  try {
    const updatedRosca = await Rosca.findByIdAndUpdate(
      roscaId,
      { roscaStatus: "closed" },
      { new: true }
    );
    if (!updatedRosca)
      return res
        .status(404)
        .json({ success: false, message: "Rosca not found." });

    res
      .status(200)
      .json({
        success: true,
        message: "Rosca successfully closed.",
        rosca: updatedRosca,
      });
  } catch (err) {
    console.error("Error closing Rosca:", err);
    res
      .status(500)
      .json({ success: false, error: "Server error while closing Rosca." });
  }
});

// Delete Rosca
router.delete("/delete/:id", async (req, res) => {
  const roscaId = req.params.id;
  if (!roscaId)
    return res
      .status(400)
      .json({ success: false, error: "Rosca ID is required." });

  try {
    const deleted = await Rosca.findByIdAndDelete(roscaId);
    if (!deleted)
      return res
        .status(404)
        .json({ success: false, message: "Rosca not found." });

    res
      .status(200)
      .json({ success: true, message: "Rosca successfully deleted." });
  } catch (err) {
    console.error("Error deleting Rosca:", err);
    res
      .status(500)
      .json({ success: false, error: "Server error while deleting Rosca." });
  }
});

// Update member payment status (paid/unpaid/nextPay) for a specific payment month
router.put("/member/:roscaId/payments/:memberId", async (req, res) => {
  const { roscaId, memberId } = req.params;
  const { month, paymentStatus } = req.body;

  if (!month || !paymentStatus) {
    return res
      .status(400)
      .json({ success: false, error: "Month and paymentStatus are required." });
  }

  try {
    const rosca = await Rosca.findById(roscaId);
    if (!rosca)
      return res
        .status(404)
        .json({ success: false, error: "Rosca not found." });

    const member = rosca.membersArray.find(
      (m) => m._id.toString() === memberId
    );
    if (!member)
      return res
        .status(404)
        .json({ success: false, error: "Member not found." });

    const payment = member.payments.find((p) => p.month === month);
    if (!payment)
      return res
        .status(404)
        .json({ success: false, error: "Payment month not found." });

    payment.paymentStatus = paymentStatus;

    // Update totalPayments and memberPaymentStatus after change
    member.totalPayments =
      member.payments.filter((p) => p.paymentStatus === "paid").length *
      rosca.monthlyAmount;

    member.memberPaymentStatus = member.payments.every(
      (p) => p.paymentStatus === "paid"
    )
      ? "paid"
      : "unpaid";

    await rosca.save();

    res
      .status(200)
      .json({ success: true, message: "Payment status updated.", member });
  } catch (err) {
    console.error("Error updating member payment status:", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Server error while updating payment status.",
      });
  }
});

module.exports = router;
