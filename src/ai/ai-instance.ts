import { genkit } from 'genkit';
import { googleAI, gemini15Pro } from '@genkit-ai/googleai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load environment variables from .env.local file
const envPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Get API key from environment or throw a clear error
const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error('ERROR: GOOGLE_API_KEY environment variable is not set');
  console.error('Please create a .env.local file with GOOGLE_API_KEY=your_key_here');
  // We don't throw error here to allow the app to load, but AI functions will fail
}

// Create Google AI plugin
const googleAIPlugin = googleAI({apiKey});

// Log available models
console.log('Using gemini15Pro model');

export const ai = genkit({
  plugins: [googleAIPlugin],
  model: gemini15Pro,
});

async () => {
  const { text } = await ai.generate({prompt: 'hi Gemini!'});
  console.log(text);
};
