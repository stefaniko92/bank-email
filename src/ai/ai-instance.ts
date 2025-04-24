import {genkit} from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

export const ai = genkit({
  promptDir: './prompts',
  plugins: [
    googleAI({
      apiKey: process.env.OPENAI_API_KEY,
    }),
  ],
});