// Throw this from a route to send a specific status; errorHandler turns it into a response.
class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = HttpError;
