const Rosca = require("../models/Rosca");

function generateInvitationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const createRosca = async (req, res) => {
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

    const savedRosca = await newRosca.save();

    return res.status(201).json({ success: true, roscaObject: savedRosca });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const getRoscasByUserId = async (req, res) => {
  try {
    const userId = req.params.userId; // Expect userId as URL param

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, error: "User ID is required." });
    }

    // Find all roscas where membersArray contains a member with id === userId
    const roscas = await Rosca.find({ "membersArray._id": userId }).exec();

    return res.status(200).json({ success: true, roscas });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const updateRoscaStatus = async (req, res) => {
  try {
    const { roscaId, action } = req.body;

    console.log(req.body);

    if (!roscaId || !action) {
      return res.status(400).json({
        success: false,
        error: "roscaId and action (start|stop) are required.",
      });
    }

    const statusMap = {
      start: "active",
      stop: "closed",
    };

    const newStatus = statusMap[action.toLowerCase()];
    if (!newStatus) {
      return res.status(400).json({
        success: false,
        error: "Invalid action. Must be 'start' or 'stop'.",
      });
    }

    const updatedRosca = await Rosca.findByIdAndUpdate(
      roscaId,
      { roscaStatus: newStatus },
      { new: true }
    );

    if (!updatedRosca) {
      return res
        .status(404)
        .json({ success: false, error: "Rosca not found." });
    }

    return res.status(200).json({ success: true, roscaObject: updatedRosca });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const joinRosca = async (req, res) => {
  try {
    const { invitationCode, name, userId } = req.body;

    if (!userId || !name || !invitationCode) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: userId, name, or invitationCode.",
      });
    }

    // 1. Find Rosca by invitation code
    const rosca = await Rosca.findOne({ invitationCode });
    console.log(rosca);
    if (!rosca) {
      return res
        .status(404)
        .json({ success: false, error: "Rosca not found." });
    }

    // 2. Check if user already exists in the members array
    const alreadyExists = rosca.membersArray.some(
      (member) => member._id === userId
    );
    if (alreadyExists) {
      return res.status(400).json({
        success: false,
        error: "User already a member or has already requested to join.",
      });
    }

    // 3. Create new member with waiting status
    const newMember = {
      _id: userId,
      name,
      isAdmin: false,
      memberPaymentStatus: "unpaid",
      totalPayments: 0,
      memberOrder: null,
      memberStatus: "waiting",
      payments: [],
    };

    // 4. Update existing members' payments array with new member
    rosca.membersArray.forEach((member) => {
      member.payments.push({
        toUserId: userId,
        toUserName: name,
        month: rosca.startingDate, // or assign current month
        paymentStatus: "unpaid",
      });
    });

    // 5. Add existing members to new member's payments array
    rosca.membersArray.forEach((existingMember) => {
      newMember.payments.push({
        toUserId: existingMember._id,
        toUserName: existingMember.name,
        month: rosca.startingDate, // or assign current month
        paymentStatus: "unpaid",
      });
    });

    // 6. Add the new member to the rosca
    rosca.membersArray.push(newMember);

    const updatedRosca = await rosca.save();

    return res.status(200).json({ success: true, roscaObject: updatedRosca });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = {
  createRosca,
  getRoscasByUserId,
  updateRoscaStatus,
  joinRosca,
};
