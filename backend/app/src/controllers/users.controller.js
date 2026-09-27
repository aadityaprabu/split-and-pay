const usersService = require("../services/users.service");
const response = require("../models/response.model");

// The people who can be added to an expense
const listParticipants = async (req, res) => {
  const users = await usersService.listParticipants();
  res.json(response.success(users, "users", 200));
};

module.exports = { listParticipants };
