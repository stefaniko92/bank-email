import { genkit } from 'genkit';
import { google } from '@genkit-ai/google';

export const ai = genkit({
  promptDir: './prompts',
  plugins: [
    google({
      apiKey: process.env.AI_API_KEY,
    }),
  ],
});

