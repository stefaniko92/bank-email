export const getGoogleApiKey = () => {
  if (typeof window !== 'undefined') {
    // Client-side: we can't access process.env directly
    return null;
  }
  
  // Server-side: we can access process.env
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_GENAI_API_KEY is not set in environment variables');
  }
  return apiKey;
}; 