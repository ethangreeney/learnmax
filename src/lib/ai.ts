import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GOOGLE_API_KEY;

if (!apiKey) {
  throw new Error("GOOGLE_API_KEY is not set. Please add it to your .env.local file.");
}

const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Generates a JSON object from a prompt.
 * Uses the 'application/json' response MIME type for reliable JSON output.
 */
export async function generateJSON(prompt: string): Promise<any> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
    },
  });

  let rawResponseText = ''; // To store the response for debugging
  try {
    const result = await model.generateContent(prompt);
    let responseText = result.response?.text();
    rawResponseText = responseText || ''; // Store the raw response

    if (!responseText) {
      throw new Error("The AI returned an empty response.");
    }

    // Heuristic to find the JSON object in the response string.
    // This helps strip out any leading/trailing text or markdown.
    const startIndex = responseText.indexOf('{');
    const endIndex = responseText.lastIndexOf('}');

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      responseText = responseText.substring(startIndex, endIndex + 1);
    }
    
    return JSON.parse(responseText);
  } catch (e: any) {
    console.error("Failed to get valid JSON from AI response:", e.message);
    // Log the raw text that failed to parse, which is crucial for debugging.
    console.error("Raw AI response that failed parsing:", rawResponseText);
    throw new Error("The AI failed to generate a valid response. Please try again.");
  }
}

/**
 * Generates plain text from a prompt.
 * Does not force a specific MIME type, suitable for natural language responses.
 */
export async function generateText(prompt: string): Promise<string> {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  
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
