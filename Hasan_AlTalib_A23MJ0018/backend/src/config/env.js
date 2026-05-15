import dotenv from "dotenv";

dotenv.config();

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const MONGODB_URI = getRequiredEnv("MONGODB_URI");
export const JWT_SECRET = getRequiredEnv("JWT_SECRET");
export const RPA_API_KEY = getRequiredEnv("RPA_API_KEY");
export const AI_PROVIDER = process.env.AI_PROVIDER || "claude";
export const ANTHROPIC_API_KEY = AI_PROVIDER === "deepseek"
  ? (process.env.ANTHROPIC_API_KEY || null)
  : getRequiredEnv("ANTHROPIC_API_KEY");
export const DEEPSEEK_API_KEY = AI_PROVIDER === "deepseek"
  ? getRequiredEnv("DEEPSEEK_API_KEY")
  : (process.env.DEEPSEEK_API_KEY || null);
export const FASTAPI_URL = getRequiredEnv("FASTAPI_URL");
