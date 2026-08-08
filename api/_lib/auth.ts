import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { bootstrapEnv } from "./bootstrapEnv.js";

bootstrapEnv();

const BCRYPT_ROUNDS = 10;

export const hashPassword = async (plain: string): Promise<string> =>
  bcrypt.hash(plain, BCRYPT_ROUNDS);

export const verifyPassword = async (
  plain: string,
  hash: string
): Promise<boolean> => bcrypt.compare(plain, hash);

export const signToken = (payload: { sub: string; email: string }): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("JWT_SECRET must be set (minimum 16 characters)");
  }
  return jwt.sign(payload, secret, { expiresIn: "7d" });
};

export const verifyToken = (
  token: string
): { sub: string; email: string } | null => {
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return null;
    }
    return jwt.verify(token, secret) as { sub: string; email: string };
  } catch {
    return null;
  }
};

export const getBearerUser = (
  authHeader: string | undefined
): { userId: string; email: string } | null => {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7);
  const decoded = verifyToken(token);
  if (!decoded) {
    return null;
  }
  const userId = decoded.sub === null ? "" : String(decoded.sub);
  const email = decoded.email === null ? "" : String(decoded.email);
  if (!(userId && email)) {
    return null;
  }
  return { email, userId };
};
