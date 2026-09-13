function notFound(req, res) {
  res.status(404).json({
    ok: false,
    message: "API route not found.",
  });
}

function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || (["ValidationError", "CastError"].includes(error.name) ? 400 : error.code === 11000 ? 409 : 500);

  res.status(statusCode).json({
    ok: false,
    message: statusCode >= 500 ? "The service is temporarily unavailable. Please try again." : error.code === 11000 ? "This record already exists. Refresh and try again." : error.message || "Invalid request.",
  });
}

module.exports = {
  errorHandler,
  notFound,
};
