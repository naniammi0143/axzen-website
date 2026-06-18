function success(res, data = {}, statusCode = 200) {
  res.status(statusCode).json({
    ok: true,
    ...data,
  });
}

module.exports = {
  success,
};
