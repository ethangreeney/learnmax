import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GOOGLE_API_KEY;

if (!apiKey) {
  throw new Error("GOOGLE_API_KEY is not set. Please add it to your .env.local file.");
}

// Client for the Flash model - for speed, cost-effectiveness, and JSON tasks
const flashAI = new GoogleGenerativeAI(apiKey);

// Client for the Pro model - for highest quality text generation
const proAI = new GoogleGenerativeAI(apiKey);

/**
 * Generates a JSON object using the 'gemini-2.0-flash' model.
 * This is the best model for high-volume, low-latency, structured output tasks.
 */
export async function generateJSON(prompt: string): Promise<any> {
  const model = flashAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response?.text();
    if (!responseText) {
      throw new Error("The AI returned an empty response.");
    }
    // A simple heuristic to find the JSON object in the response string.
    const startIndex = responseText.indexOf('{');
    const endIndex = responseText.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      return JSON.parse(responseText.substring(startIndex, endIndex + 1));
    }
    return JSON.parse(responseText);
  } catch (e: any) {
    console.error("Failed to get valid JSON from AI response:", e.message);
    throw new Error("The AI failed to generate a valid JSON response. Please try again.");
  }
}

/**
 * Generates plain text using the 'gemini-2.0-flash' model.
 * This is the most powerful model for generating high-quality, accurate,
 * and coherent educational content.
 */
export async function generateText(prompt: string): Promise<string> {
    const model = proAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
  
    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response?.text();
      if (!responseText) {
        throw new Error("The AI returned an empty response.");
      }
      return responseText;
    } catch (e: any) {
      console.error("Failed to generate text from AI response:", e.message);
      throw new Error("The AI failed to generate a valid text response. Please try again.");
    }
}
