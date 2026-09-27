const { Environment } = require("../constants/environment");
const allowedEmailsService = require("../services/allowedEmails.service");
const response = require("../models/response.model");

const listAllowedEmails = async (req, res) => {
  const allowedEmails = await allowedEmailsService.listAllowedEmails();
  res.json(response.success({ adminEmail: Environment.ADMIN_EMAIL, allowedEmails }, "allowed emails", 200));
};

const addAllowedEmail = async (req, res) => {
  const email = await allowedEmailsService.addAllowedEmail(req.body?.email, req.user.id);
  res.status(201).json(response.success({ email }, "email allowed", 201));
};

const removeAllowedEmail = async (req, res) => {
  await allowedEmailsService.removeAllowedEmail(req.params.email);
  res.json(response.success(null, "email removed and signed out", 200));
};

module.exports = { listAllowedEmails, addAllowedEmail, removeAllowedEmail };
