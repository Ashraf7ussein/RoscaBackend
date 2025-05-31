const express = require("express");
const router = express.Router();
const {
  createRosca,
  getRoscasByUserId,
  updateRoscaStatus,
  joinRosca,
} = require("../controllers/roscaController");

router.post("/create", createRosca);
router.get("/user/:userId", getRoscasByUserId);
router.post("/rosca/status", updateRoscaStatus);
router.post("/join", joinRosca);

module.exports = router;
