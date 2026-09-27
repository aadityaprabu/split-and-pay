const { pool } = require("../config/db");
const response = require("../models/response.model");

const ping = (req, res) => {
  res.json(response.success(null, "pong", 200));
};

// Used by the docker healthcheck — only healthy when Postgres is reachable too
const healthCheck = async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).send("OK");
  } catch (error) {
    console.error("Health check failed:", error.message);
    res.status(503).send("DATABASE UNAVAILABLE");
  }
};

module.exports = { ping, healthCheck };
