const express = require("express");
const { authenticate, authorize } = require("../middleware/auth");
const { getProfile, listTasks, updateTaskStatus } = require("../controllers/deliveryAgentController");

const router = express.Router();
router.use(authenticate, authorize("delivery_agent"));
router.get("/me", getProfile);
router.get("/tasks", listTasks);
router.patch("/tasks/:id/status", updateTaskStatus);

module.exports = router;
