import OpenAI from "openai";
import pg from "pg";
import Redis from "ioredis";

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000, maxRetries: 1 });
export const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const redis = new Redis(process.env.REDIS_URL);

export const adsSendJobs = new Map();
export const rateLimitBuckets = new Map();
export const evolutionInstanceTokenCache = new Map();
