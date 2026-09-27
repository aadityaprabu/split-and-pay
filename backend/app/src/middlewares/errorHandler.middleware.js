const response = require("../models/response.model");
const HttpError = require("../models/httpError.model");

// Express 5 forwards rejected promises from async handlers here automatically.
// eslint-disable-next-line no-unused-vars
const errorHandler = (error, req, res, next) => {
  console.error(`Error handling ${req.method} ${req.originalUrl}:`, error);
  const statusCode = error.statusCode || 500;
  // Our own HttpErrors are written for users; anything else 5xx may leak internals
  const isSafeToShow = error instanceof HttpError || statusCode < 500;
  const message = isSafeToShow ? error.message : "internal server error";
  res.status(statusCode).json(response.error(message, statusCode));
};

module.exports = errorHandler;
