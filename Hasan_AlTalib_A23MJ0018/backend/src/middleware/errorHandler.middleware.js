export function errorHandler(error, req, res, next) {
  const isDevelopment = process.env.NODE_ENV === "development";

  if (error.name === "ValidationError") {
    const details = Object.fromEntries(
      Object.entries(error.errors).map(([field, value]) => [field, value.message])
    );

    if (isDevelopment) {
      details.stack = error.stack;
    }

    return res.status(400).json({
      error: "Validation failed",
      details,
    });
  }

  if (error.code === 11000) {
    const details = {
      fields: error.keyValue,
    };

    if (isDevelopment) {
      details.stack = error.stack;
    }

    return res.status(409).json({
      error: "Duplicate key error",
      details,
    });
  }

  if (
    error.name === "JsonWebTokenError" ||
    error.name === "TokenExpiredError" ||
    error.name === "NotBeforeError"
  ) {
    const details = isDevelopment ? { stack: error.stack } : undefined;

    return res.status(401).json({
      error: "Authentication required",
      ...(details ? { details } : {}),
    });
  }

  const details = isDevelopment ? { stack: error.stack } : undefined;

  return res.status(500).json({
    error: error.message || "Internal server error",
    ...(details ? { details } : {}),
  });
}
