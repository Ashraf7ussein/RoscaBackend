const express = require("express");
const Rosca = require("../models/Rosca");

const router = express.Router();

function generateInvitationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// create rosca method
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
          month: startingDate,
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

// get all for given id
router.get("/user/roscas/:id", async (req, res) => {
  const userId = req.params.id;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: "User ID is required.",
    });
  }

  try {
    const roscas = await Rosca.find({
      "membersArray._id": userId,
    });

    return res.status(200).json({
      success: true,
      roscas,
    });
  } catch (err) {
    console.error("Error fetching roscas:", err);
    return res.status(500).json({
      success: false,
      error: "Server error while fetching roscas.",
    });
  }
});

// activate / stop / close ->  rosca method
router.put("/status/:id", async (req, res) => {
  const roscaId = req.params.id;
  const { status } = req.body;

  const allowedStatuses = ["pending", "active", "closed"];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
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

    if (!updatedRosca) {
      return res.status(404).json({
        success: false,
        message: "Rosca not found",
      });
    }

    res.status(200).json({
      success: true,
      message: `Rosca status updated to '${status}'`,
      rosca: updatedRosca,
    });
  } catch (err) {
    console.error("Error updating rosca status:", err);
    res.status(500).json({
      success: false,
      error: "Server error while updating status",
    });
  }
});

//  join method
router.post("/join", async (req, res) => {
  const { invitationCode, memberId, memberName } = req.body;

  // Validate
  if (!invitationCode || !memberId || !memberName) {
    return res.status(400).json({
      success: false,
      error: "Invitation code, memberId, and memberName are required.",
    });
  }

  try {
    const rosca = await Rosca.findOne({ invitationCode });

    if (!rosca) {
      return res.status(404).json({
        success: false,
        error: "Rosca not found with this invitation code.",
      });
    }

    // Check if member already exists
    const alreadyMember = rosca.membersArray.some(
      (member) => member._id === memberId
    );

    if (alreadyMember) {
      return res.status(409).json({
        success: false,
        error: "Member already joined this Rosca.",
      });
    }

    // Add new member
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

    await rosca.save();

    res.status(200).json({
      success: true,
      message: "Successfully joined the Rosca.",
      rosca,
    });
  } catch (err) {
    console.error("Error joining Rosca:", err);
    res.status(500).json({
      success: false,
      error: "Server error while joining Rosca.",
    });
  }
});

// Update Rosca details method
router.put("/update/:id", async (req, res) => {
  const roscaId = req.params.id;
  const { name, membersCount, monthlyAmount, startingDate, endingDate } =
    req.body;

  try {
    const rosca = await Rosca.findById(roscaId);
    if (!rosca) {
      return res
        .status(404)
        .json({ success: false, error: "Rosca not found." });
    }

    rosca.name = name;
    rosca.membersCount = membersCount;
    rosca.monthlyAmount = monthlyAmount;
    rosca.startingDate = new Date(startingDate);
    rosca.endingDate = new Date(endingDate);
    rosca.totalAmount = membersCount * monthlyAmount;

    await rosca.save();

    res.status(200).json({
      success: true,
      message: "Rosca details updated successfully.",
      rosca,
    });
  } catch (err) {
    console.error("Error updating Rosca details:", err);
    res.status(500).json({
      success: false,
      error: "Server error while updating Rosca details.",
    });
  }
});

// Close Rosca Method
router.put("/close/:id", async (req, res) => {
  const roscaId = req.params.id;

  if (!roscaId) {
    return res.status(400).json({
      success: false,
      error: "Rosca ID is required.",
    });
  }

  try {
    const updatedRosca = await Rosca.findByIdAndUpdate(
      roscaId,
      { roscaStatus: "closed" },
      { new: true }
    );

    if (!updatedRosca) {
      return res.status(404).json({
        success: false,
        message: "Rosca not found.",
      });
    }

    res.status(200).json({
      success: true,
      message: "Rosca successfully closed.",
      rosca: updatedRosca,
    });
  } catch (err) {
    console.error("Error closing Rosca:", err);
    res.status(500).json({
      success: false,
      error: "Server error while closing Rosca.",
    });
  }
});

// PUT /api/rosca/members/:roscaId/:memberId/status
router.put("/members/:roscaId/:memberId/status", async (req, res) => {
  const { roscaId, memberId } = req.params;
  const { status } = req.body; // 'accepted' or 'rejected'

  try {
    const rosca = await Rosca.findById(roscaId);
    if (!rosca) return res.status(404).json({ error: "Rosca not found" });

    const member = rosca.membersArray.find((m) => m.id === memberId);
    if (!member) return res.status(404).json({ error: "Member not found" });

    member.memberStatus = status;

    await rosca.save();
    res.json({ success: true, member });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /api/rosca/members/:roscaId/:memberId
router.delete("/members/:roscaId/:memberId", async (req, res) => {
  const { roscaId, memberId } = req.params;

  if (!roscaId || !memberId) {
    return res.status(400).json({
      success: false,
      error: "Rosca ID and Member ID are required.",
    });
  }

  try {
    const rosca = await Rosca.findById(roscaId);

    if (!rosca) {
      return res.status(404).json({
        success: false,
        error: "Rosca not found.",
      });
    }

    const originalLength = rosca.membersArray.length;

    rosca.membersArray = rosca.membersArray.filter(
      (member) => member._id.toString() !== memberId
    );

    if (rosca.membersArray.length === originalLength) {
      return res.status(404).json({
        success: false,
        error: "Member not found in Rosca.",
      });
    }

    await rosca.save();

    res.status(200).json({
      success: true,
      message: "Member successfully removed from Rosca.",
      rosca,
    });
  } catch (error) {
    console.error("Error deleting member:", error);
    res.status(500).json({
      success: false,
      error: "Server error while deleting member.",
    });
  }
});

module.exports = router;
