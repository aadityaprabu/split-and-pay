const settlementsService = require("../services/settlements.service");
const response = require("../models/response.model");

// What the signed-in user owes / is owed, per person and currency
const listBalances = async (req, res) => {
  const balances = await settlementsService.listBalances(req.user.id);
  res.json(response.success(balances, "balances", 200));
};

const listSettlements = async (req, res) => {
  const settlements = await settlementsService.listSettlements(req.user.id);
  res.json(response.success(settlements, "settlements", 200));
};

// Body: { user_id, currency, net_minor } where net_minor is the balance the user was shown
const settleUp = async (req, res) => {
  const { user_id: otherUserId, currency, net_minor: expectedNetMinor } = req.body ?? {};
  const settlement = await settlementsService.settleUp(req.user.id, otherUserId, currency, expectedNetMinor);
  res.status(201).json(response.success(settlement, "settled up", 201));
};

module.exports = { listBalances, listSettlements, settleUp };
