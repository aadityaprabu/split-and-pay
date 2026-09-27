// Logs one line per request. Deliberately does not log headers or bodies —
// those will carry passwords and session cookies once auth exists.
const requestLogger = (req, res, next) => {
  const startedAt = performance.now();
  res.on("finish", () => {
    const durationMs = (performance.now() - startedAt).toFixed(1);
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
  });
  next();
};

module.exports = requestLogger;
