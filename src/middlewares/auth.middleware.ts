import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import "../config/env";
import UserModel from "../models/User.model";

const JWT_SECRET = process.env.JWT_SECRET || "secret";

export const authMiddleware = (roles?: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const token = req.cookies?.auth_token || bearerToken;
    // console.log("token: ", token);
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET) as any;
      //crosscheck with database for role
      const user = await UserModel.findById(payload.id).select("role fullName");
      if (!user) return res.status(404).json({ message: "User does not exist" });
      if (user.role !== payload.role) {
        (req as any).user = { id: payload.id, role: user.role, fullName: user.fullName };
        // ... refresh token
        res.clearCookie("auth_token");
        res.clearCookie("role");
        const token = jwt.sign({ id: payload.id, role: user.role }, JWT_SECRET, {
          expiresIn: "7d",
        });
        const isProduction = process.env.NODE_ENV === "production";
        res.cookie("auth_token", token, {
          maxAge: 7 * 24 * 60 * 60 * 1000,
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? "none" : "lax",
        });
        res.cookie("role", user.role, {
          maxAge: 7 * 24 * 60 * 60 * 1000,
          httpOnly: true,
          secure: isProduction,
          sameSite: isProduction ? "none" : "lax",
        });
      } else {
        (req as any).user = { id: payload.id, role: payload.role, fullName: user.fullName };
      }
      if (roles && roles.length && !roles.includes(user.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      next();
    } catch (err) {
      console.log("error: ", err);
      return res.status(401).json({ message: "Invalid token" });
    }
  };
};

export const optionalAuthMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = req.cookies?.auth_token || bearerToken;
  if (!token) {
    return next();
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    const user = await UserModel.findById(payload.id).select("role fullName");
    if (user) {
      (req as any).user = { id: payload.id, role: user.role, fullName: user.fullName };
    }
  } catch {
    // Silently proceed for unauthenticated requests
  }
  next();
};

