const express = require("express");
const cookieParser = require("cookie-parser");
const { Server } = require("./constants/constants");
const requestLogger = require("./middlewares/requestLogger.middleware");
const errorHandler = require("./middlewares/errorHandler.middleware");
const response = require("./models/response.model");
const routes = require("./routes/route");

/**
 * Builds the Express app: middleware, every route and error handling. It doesn't listen or touch the
 * database, so server.js decides when to start it (and a test could build one without a server).
 */
function setupApp() {
  const app = express();
  // Exactly one proxy (nginx) sits in front of us, so trust only that hop for req.ip
  app.set("trust proxy", 1);
  app.use(express.json({ limit: Server.JSON_BODY_LIMIT }));
  app.use(cookieParser());
  app.use(requestLogger);

  // Every route lives under Server.API_PREFIX (/api). The browser calls BACKEND_URL/* (/split-and-pay/*), which nginx
  // (prod) and the Vite dev proxy (local) rewrite to /api/*, so the frontend and backend share one origin.
  app.use(Server.API_PREFIX, routes);

  app.use((req, res) => {
    res.status(404).json(response.error("not found", 404));
  });
  app.use(errorHandler);

  return app;
}

module.exports = setupApp;
