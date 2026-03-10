export function sendSuccess(res, statusCode, data) {
  res.status(statusCode).json({
    success: true,
    data
  });
}
