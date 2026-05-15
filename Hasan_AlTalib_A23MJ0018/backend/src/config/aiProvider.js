import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

const PROVIDER = (process.env.AI_PROVIDER || "claude").toLowerCase();

const OPENAI_COMPAT = {
  deepseek: {
    baseURL: "https://api.deepseek.com/v1",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    model: "deepseek-chat",
  },
  kimi: {
    baseURL: "https://api.moonshot.cn/v1",
    apiKeyEnv: "KIMI_API_KEY",
    model: "kimi-k2",
  },
  openai: {
    baseURL: "https://api.openai.com/v1",
    apiKeyEnv: "OPENAI_API_KEY",
    model: "gpt-4o",
  },
};

function isOpenAICompatible() {
  return PROVIDER !== "claude";
}

export function getAIClient() {
  if (isOpenAICompatible()) {
    const cfg = OPENAI_COMPAT[PROVIDER] || OPENAI_COMPAT.openai;
    return new OpenAI({
      baseURL: process.env.AI_BASE_URL || cfg.baseURL,
      apiKey: process.env[cfg.apiKeyEnv] || process.env.AI_API_KEY,
    });
  }

  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export function getModel() {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;

  if (isOpenAICompatible()) {
    const cfg = OPENAI_COMPAT[PROVIDER] || OPENAI_COMPAT.openai;
    return cfg.model;
  }

  return "claude-sonnet-4-6";
}

export const PROVIDER_NAME = PROVIDER;
export const IS_OPENAI_COMPAT = isOpenAICompatible();
