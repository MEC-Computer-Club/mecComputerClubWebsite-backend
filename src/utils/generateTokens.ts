import jwt from "jsonwebtoken";
import "../config/env";
import { ObjectId } from "mongoose";

const JWT_SECRET = process.env.JWT_SECRET || "secret";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export interface TokenPayload {
  id: any;
  email: string;
  role: "guest" | "member" | "moderator" | "admin" | "alumni" | "executive" | "advisor";
}

export const generateJWT = (payload: TokenPayload, expiresIn?: string) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: (expiresIn || JWT_EXPIRES_IN) as any });
};

export const verifyJWT = (token: string) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};
