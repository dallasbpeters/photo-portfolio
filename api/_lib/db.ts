import { neon } from "@neondatabase/serverless";
import { bootstrapEnv } from "./bootstrapEnv.js";

bootstrapEnv();

/**
 * Vercel + Neon/Postgres often inject POSTGRES_URL or POSTGRES_PRISMA_URL;
 * docs and local dev typically use DATABASE_URL. Accept any of them.
 */
export const getDatabaseUrl = (): string => {
  const keys = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"] as const;
  for (const key of keys) {
    const v = process.env[key]?.trim();
    if (v) {
      return v;
    }
  }
  throw new Error(
    "Missing database URL: set DATABASE_URL in Vercel → Settings → Environment Variables, or connect Neon/Postgres storage so POSTGRES_URL is injected."
  );
};

export const getSql = () => neon(getDatabaseUrl());
