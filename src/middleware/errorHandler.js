function notFound(req, res) {
  res.status(404).json({
    ok: false,
    message: "API route not found.",
  });
}

function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    ok: false,
    message: error.message || "Internal server error.",
  });
}

module.exports = {
  errorHandler,
  notFound,
};
