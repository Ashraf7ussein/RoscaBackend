const express = require("express");
const Rosca = require("../models/Rosca");

const router = express.Router();

function generateInvitationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
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

    const totalAmount = monthlyAmount;
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

// Get all Roscas for given user ID
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

// Update Rosca status (pending, active, closed)
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

// Join Rosca
router.post("/join", async (req, res) => {
  const { invitationCode, memberId, memberName } = req.body;

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

    const alreadyMember = rosca.membersArray.some(
      (member) => member._id.toString() === memberId.toString()
    );

    if (alreadyMember) {
      return res.status(409).json({
        success: false,
        error: "Member already joined this Rosca.",
      });
    }

    // Find latest assignedDate among accepted members
    const acceptedMembers = rosca.membersArray.filter(
      (m) => m.memberStatus === "accepted"
    );

    let assignedDate;
    if (acceptedMembers.length > 0) {
      const latestDate = acceptedMembers
        .map((m) => new Date(m.assignedDate))
        .sort((a, b) => b - a)[0];

      const nextMonthDate = new Date(latestDate);
      nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
      assignedDate = nextMonthDate.toISOString().slice(0, 10);
    } else {
      // If no accepted members, start with rosca.startingDate
      assignedDate = new Date(rosca.startingDate).toISOString().slice(0, 10);
    }

    // Add the new member
    rosca.membersArray.push({
      _id: memberId,
      name: memberName,
      isAdmin: false,
      memberPaymentStatus: "unpaid",
      totalPayments: 0,
      memberOrder: rosca.membersArray.length + 1,
      memberStatus: "waiting",
      assignedDate,
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

// Update Rosca details
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

    // After updating details, update payments for members
    await updatePaymentsForAllMembers(rosca);

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

// Close Rosca
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

// Update Member Status (accepted / rejected)
router.put("/members/:roscaId/:memberId/status", async (req, res) => {
  const { roscaId, memberId } = req.params;
  const { status } = req.body;

  if (!["accepted", "rejected"].includes(status)) {
    return res.status(400).json({
      success: false,
      error: "Invalid status. Allowed: accepted, rejected.",
    });
  }

  try {
    const rosca = await Rosca.findById(roscaId);
    if (!rosca) return res.status(404).json({ error: "Rosca not found" });

    const member = rosca.membersArray.find(
      (m) => m._id.toString() === memberId.toString()
    );
    if (!member) return res.status(404).json({ error: "Member not found" });

    member.memberStatus = status;

    if (status === "accepted") {
      // 1. Initialize payments for this member toward other accepted members
      const acceptedMembers = rosca.membersArray.filter(
        (m) =>
          m._id.toString() !== memberId.toString() &&
          m.memberStatus === "accepted"
      );

      member.payments = acceptedMembers.map((other) => ({
        toUserId: other._id,
        toUserName: other.name,
        month: member.assignedDate,
        paymentStatus: "unpaid",
      }));

      // 2. Add unpaid payments to other accepted members toward the new member
      acceptedMembers.forEach((m) => {
        if (!Array.isArray(m.payments)) m.payments = [];
        m.payments.push({
          toUserId: member._id,
          toUserName: member.name,
          month: m.assignedDate,
          paymentStatus: "unpaid",
        });
      });

      // 3. Update totalAmount = acceptedMembers x monthlyAmount
      const totalAcceptedCount = acceptedMembers.length + 1; // include the just-accepted member
      rosca.totalAmount = totalAcceptedCount * rosca.monthlyAmount;
    }

    await rosca.save();
    res.json({ success: true, member, rosca });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete member
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
      (member) => member._id.toString() !== memberId.toString()
    );

    if (rosca.membersArray.length === originalLength) {
      return res.status(404).json({
        success: false,
        error: "Member not found in Rosca.",
      });
    }

    // Update memberOrder for remaining members
    rosca.membersArray.forEach((m, idx) => {
      m.memberOrder = idx + 1;
    });

    // Update payments after member removal
    await updatePaymentsForAllMembers(rosca);

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

// Change admin of a Rosca
router.put("/change-admin/:roscaId", async (req, res) => {
  const { roscaId } = req.params;
  const { newAdminId } = req.body;

  if (!newAdminId) {
    return res.status(400).json({
      success: false,
      error: "newAdminId is required in the request body.",
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

    // Find current admin and demote
    const currentAdmin = rosca.membersArray.find((m) => m.isAdmin === true);
    if (currentAdmin) {
      currentAdmin.isAdmin = false;
    }

    // Find new admin member
    const newAdmin = rosca.membersArray.find(
      (m) => m._id.toString() === newAdminId.toString()
    );

    if (!newAdmin) {
      return res.status(404).json({
        success: false,
        error: "Member to be promoted as admin not found in Rosca.",
      });
    }

    newAdmin.isAdmin = true;

    await rosca.save();

    res.status(200).json({
      success: true,
      message: `Member ${newAdmin.name} is now the admin.`,
      rosca,
    });
  } catch (error) {
    console.error("Error changing Rosca admin:", error);
    res.status(500).json({
      success: false,
      error: "Server error while changing admin.",
    });
  }
});

// Change admin of a Rosca
router.put("/change-admin/:roscaId", async (req, res) => {
  const { roscaId } = req.params;
  const { newAdminId } = req.body;

  if (!newAdminId) {
    return res.status(400).json({
      success: false,
      error: "newAdminId is required in the request body.",
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

    // Find current admin and demote
    const currentAdmin = rosca.membersArray.find((m) => m.isAdmin === true);
    if (currentAdmin) {
      currentAdmin.isAdmin = false;
    }

    // Find new admin member
    const newAdmin = rosca.membersArray.find(
      (m) => m._id.toString() === newAdminId.toString()
    );

    if (!newAdmin) {
      return res.status(404).json({
        success: false,
        error: "Member to be promoted as admin not found in Rosca.",
      });
    }

    newAdmin.isAdmin = true;

    await rosca.save();

    res.status(200).json({
      success: true,
      message: `Member ${newAdmin.name} is now the admin.`,
      rosca,
    });
  } catch (error) {
    console.error("Error changing Rosca admin:", error);
    res.status(500).json({
      success: false,
      error: "Server error while changing admin.",
    });
  }
});


module.exports = router;
