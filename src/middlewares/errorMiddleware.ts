import { Request, Response, NextFunction } from "express";

// Define a general error interface
interface CustomError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
}

const globalErrorHandler = (err: any, req: Request, res: Response, next: NextFunction) => {
  // Normalize error to an object if a string or primitive was thrown
  let statusCode = 500;
  let message = "Something went very wrong!";
  let isOperational = false;
  let status = "error";

  if (typeof err === "string") {
    message = err;
  } else if (err && typeof err === "object") {
    statusCode = typeof err.statusCode === "number" ? err.statusCode : 500;
    message = err.message || (typeof err.toString === "function" ? err.toString() : message);
    isOperational = Boolean(err.isOperational);
    status = err.status || (statusCode >= 400 && statusCode < 500 ? "fail" : "error");
  }

  // Log non-operational errors for server diagnostics
  if (!isOperational && statusCode === 500) {
    console.error("Unhandled Error [", req.method, req.originalUrl, "]:", err);
  }

  res.status(statusCode).json({
    success: false,
    status,
    message,
  });
};

export default globalErrorHandler;
