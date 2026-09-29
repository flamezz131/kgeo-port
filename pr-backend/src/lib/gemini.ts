import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error('Missing GEMINI_API_KEY environment variable at startup.');
}

console.log(`Loaded GEMINI_API_KEY starting with: ${apiKey.substring(0, 10)}...`);

export const geminiClient = new GoogleGenAI({ apiKey });
export const ai = geminiClient;

// NOTE: This model name should be checked against aistudio.google.com before relying on it,
// since Google renames these periodically.
export const GEMINI_MODEL = 'gemini-3.5-flash';
