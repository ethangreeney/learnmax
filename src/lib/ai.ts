import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the AI model from the API key stored in environment variables.
const apiKey = process.env.GOOGLE_API_KEY;

if (!apiKey) {
  throw new Error("GOOGLE_API_KEY is not set. Please add it to your .env.local file.");
}

const genAI = new GoogleGenerativeAI(apiKey);

// Helper function to call the AI model with a specific prompt and return the JSON response.
export async function generateJSON(prompt: string): Promise<any> {
  // Setting the model to 'gemini-2.5-flash-lite' as specified.
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  const result = await model.generateContent(prompt);
  const response = result.response;
  const jsonText = response.text();
  
  try {
    return JSON.parse(jsonText);
  } catch (e) {
    console.error("Failed to parse JSON from AI response:", jsonText);
    throw new Error("The AI did not return valid JSON.");
  }
}
