import { GoogleGenAI, Type } from "@google/genai";
import { Plant, UserMode, GardenTask } from "../types";

const ai = new GoogleGenAI({
  apiKey: import.meta.env.VITE_GEMINI_API_KEY || "",
});

async function callGeminiWithRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  initialDelay = 2000,
): Promise<T> {
  let currentDelay = initialDelay;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      // Detect 429 (Rate Limit) or Quota errors
      const isRateLimit =
        error?.message?.includes("429") ||
        error?.status === 429 ||
        error?.message?.includes("quota");

      if (i < retries) {
        // If it's a rate limit, we need a significant wait (at least 10s)
        const waitTime = isRateLimit
          ? Math.max(currentDelay, 10000)
          : currentDelay;

        console.warn(
          `Gemini ${isRateLimit ? "Rate Limit (429)" : "Error"}. ` +
            `Waiting ${waitTime}ms before retry ${i + 1}/${retries}...`,
        );

        await new Promise((resolve) => setTimeout(resolve, waitTime));

        // Exponentially increase the delay for the next potential retry
        currentDelay *= 2;
        continue;
      }

      // If we've exhausted retries and it's a 429, throw a user-friendly message
      if (isRateLimit) {
        throw new Error(
          "Garden AI is currently busy (quota reached). Please wait 60 seconds and try again.",
        );
      }
      throw error;
    }
  }
  throw new Error("Gemini API failed after multiple attempts.");
}

export interface DiagnosisResult {
  diagnosis: string;
  tasks: Array<{
    title: string;
    description: string;
    type: GardenTask["type"];
    daysFromNow: number;
  }>;
}

export async function diagnosePlant(
  imageBuffer: string,
  mimeType: string,
  plantName: string,
  mode: UserMode,
  aiEnabled: boolean = true,
): Promise<DiagnosisResult> {
  if (!aiEnabled) {
    throw new Error(
      "AI features are currently disabled by your profile settings.",
    );
  }
  const model = "gemini-3-flash-preview";
  const prompt = `Analyze this image of a ${plantName || "plant"}. If it's sick, provide a ${
    mode === "Novice"
      ? "novice-friendly remedy"
      : "technical expert diagnosis and remedy"
  }. Be concise but thorough.
  
  Additionally, suggest 1-3 specific tasks to help the plant recover.
  Return as JSON object with:
  - diagnosis: the markdown formatted diagnosis and remedy text
  - tasks: array of objects with { title, description, type (Watering, Feeding, Pruning, Harvesting), daysFromNow (number) }.
  
  For each task description, include specific details:
  - If Watering: specify time of day, amount (e.g. "approx 500ml"), and method (e.g. "water at the base, avoid leaves").
  - If Feeding: specify type of fertilizer and application method.
  - If Pruning: specify which parts to remove.`;

  const imagePart = {
    inlineData: {
      data: imageBuffer.split(",")[1], // Remove data:image/png;base64,
      mimeType,
    },
  };

  return callGeminiWithRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [imagePart, { text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            diagnosis: { type: Type.STRING },
            tasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  type: {
                    type: Type.STRING,
                    enum: ["Watering", "Feeding", "Pruning", "Harvesting"],
                  },
                  daysFromNow: { type: Type.NUMBER },
                },
                required: ["title", "description", "type", "daysFromNow"],
              },
            },
          },
          required: ["diagnosis", "tasks"],
        },
      },
    });

    try {
      return JSON.parse(
        response.text ||
          '{"diagnosis": "No diagnosis available.", "tasks": []}',
      );
    } catch (e) {
      console.error("Failed to parse diagnosis response:", e);
      return {
        diagnosis: response.text || "Error parsing diagnosis.",
        tasks: [],
      };
    }
  });
}

export async function identifyPlant(
  imageBuffer: string,
  mimeType: string,
  mode: UserMode,
  aiEnabled: boolean = true,
) {
  if (!aiEnabled) {
    throw new Error(
      "AI features are currently disabled by your profile settings.",
    );
  }
  const model = "gemini-3-flash-preview";
  const prompt = `Identify the plant in this image. Provide its common name, scientific name, and a brief description. ${
    mode === "Novice"
      ? "Keep it simple and easy to understand."
      : "Include detailed botanical characteristics."
  }`;

  const imagePart = {
    inlineData: {
      data: imageBuffer.split(",")[1],
      mimeType,
    },
  };

  return callGeminiWithRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [imagePart, { text: prompt }] },
    });
    return response.text;
  });
}

export interface GeminiTaskResponse {
  title: string;
  description: string;
  type: GardenTask["type"];
  daysFromNow: number;
}

export async function generatePlantingSchedule(
  plantName: string,
  isEstablished: boolean,
  environment: string,
  careGuide?: Plant["careGuide"],
  currentDate?: string,
  aiEnabled: boolean = true,
): Promise<GeminiTaskResponse[]> {
  if (!aiEnabled) {
    throw new Error(
      "AI features are currently disabled by your profile settings.",
    );
  }
  const model = "gemini-3-flash-preview";
  const prompt = `Today's date is ${currentDate || new Date().toLocaleDateString()}.
  Generate a gardening task schedule for a ${isEstablished ? "mature/established" : "newly planted"} "${plantName}" growing ${environment}.
  
  Care Guide Context:
  - Sun: ${careGuide?.sun || "Not specified"}
  - Water: ${careGuide?.water || "Not specified"}
  - Soil: ${careGuide?.soil || "Not specified"}
  - Planting Season: ${careGuide?.plantingMonth || "Not specified"}
  - Harvest Season: ${careGuide?.harvestMonth || "Not specified"}

  Rules for task generation:
  1. ALWAYS include an initial "Watering" task for today (daysFromNow: 0) if the plant was just planted (not established).
  2. If appropriate for the plant and season, include a "Feeding" task for today (daysFromNow: 0) or within the first 3 days.
  3. Create 2-4 immediate maintenance tasks for the upcoming week (mostly watering).
  4. ONLY suggest "Pruning" if it's actually appropriate for a ${isEstablished ? "mature" : "newly planted"} plant at this time of year.
  5. ONLY suggest "Harvesting" if the current date (${currentDate || new Date().toLocaleDateString()}) falls within or is very close to the Harvest Season (${careGuide?.harvestMonth || "Not specified"}). If it's not harvest season, DO NOT suggest a harvesting task for the upcoming week.
  6. If a task (like Harvesting or Pruning) is seasonal and not appropriate now, you may suggest it for a future date (daysFromNow > 30), but prioritize immediate needs for the first week.
  
  Return as JSON array of objects with: title, description, type (Watering, Feeding, Pruning, Harvesting), and daysFromNow (integer).
  
  For each task description, include specific details:
  - If Watering: specify time of day, amount (e.g. "approx 500ml"), and method (e.g. "water at the base, avoid leaves").
  - If Feeding: specify type of fertilizer and application method.
  - If Pruning: specify which parts to remove.`;

  return callGeminiWithRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              type: {
                type: Type.STRING,
                enum: ["Watering", "Feeding", "Pruning", "Harvesting"],
              },
              daysFromNow: { type: Type.NUMBER },
            },
            required: ["title", "description", "type", "daysFromNow"],
          },
        },
      },
    });

    return JSON.parse(response.text || "[]");
  });
}

export async function generateCareGuide(
  plantName: string,
  aiEnabled: boolean = true,
): Promise<Partial<Plant>> {
  if (!aiEnabled) {
    throw new Error(
      "AI features are currently disabled by your profile settings.",
    );
  }
  const model = "gemini-3-flash-preview";
  const prompt = `Generate a comprehensive care guide for the plant "${plantName}".
  Include:
  - name: the common name of the plant
  - scientificName: the scientific name of the plant
  - careGuide: an object containing:
    - sun: light requirements (e.g., "Full sun", "Partial shade")
    - water: watering frequency (e.g., "2-3 times per week", "once a week", "when soil is dry")
    - soil: soil type (e.g., "Well-draining", "Rich in organic matter")
    - plantingMonth: best month(s) to plant (e.g., "March, April")
    - harvestMonth: best month(s) to harvest if applicable (e.g., "July, August")
  Return as JSON object.`;

  return callGeminiWithRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            scientificName: { type: Type.STRING },
            careGuide: {
              type: Type.OBJECT,
              properties: {
                sun: { type: Type.STRING },
                water: { type: Type.STRING },
                soil: { type: Type.STRING },
                plantingMonth: { type: Type.STRING },
                harvestMonth: { type: Type.STRING },
              },
              required: ["sun", "water", "soil", "plantingMonth"],
            },
          },
          required: ["name", "careGuide"],
        },
      },
    });

    return JSON.parse(response.text || "{}");
  });
}

export async function searchPlants(
  query: string,
  aiEnabled: boolean = true,
): Promise<Partial<Plant>[]> {
  if (!aiEnabled) {
    throw new Error(
      "AI features are currently disabled by your profile settings.",
    );
  }
  const model = "gemini-3-flash-preview";
  const prompt = `Search for common garden plants matching "${query}". Return a list of 3-5 most likely matches with their common name, scientific name, and a brief care guide summary (sun, water, soil, plantingMonth, harvestMonth). Return as JSON array.`;

  return callGeminiWithRetry(async () => {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              scientificName: { type: Type.STRING },
              careGuide: {
                type: Type.OBJECT,
                properties: {
                  sun: { type: Type.STRING },
                  water: { type: Type.STRING },
                  soil: { type: Type.STRING },
                  plantingMonth: { type: Type.STRING },
                  harvestMonth: { type: Type.STRING },
                },
                required: ["sun", "water", "soil", "plantingMonth"],
              },
            },
            required: ["name", "careGuide"],
          },
        },
      },
    });

    return JSON.parse(response.text || "[]");
  });
}

export async function getCommonNames(
  scientificName: string,
  aiEnabled: boolean = true,
): Promise<string[]> {
  if (!aiEnabled) {
    throw new Error(
      "AI features are currently disabled by your profile settings.",
    );
  }
  const model = "gemini-3-flash-preview";
  const prompt = `Provide a list of common names for the plant "${scientificName}". Return as a JSON array of strings.`;

  try {
    return await callGeminiWithRetry(async () => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
      });
      return JSON.parse(response.text || "[]");
    });
  } catch (error) {
    console.error("Failed to fetch common names after retries:", error);
    return []; // Return empty array as fallback
  }
}

export async function getScientificName(
  commonName: string,
  aiEnabled: boolean = true,
): Promise<string> {
  if (!aiEnabled) {
    throw new Error(
      "AI features are currently disabled by your profile settings.",
    );
  }
  const model = "gemini-3-flash-preview";
  const prompt = `What is the scientific name for the plant "${commonName}"? Return ONLY the scientific name as a string, nothing else.`;

  try {
    return await callGeminiWithRetry(async () => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      return response.text?.trim() || commonName;
    });
  } catch (error) {
    console.error("Failed to fetch scientific name after retries:", error);
    return commonName; // Return common name as fallback
  }
}
