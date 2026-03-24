import { GoogleGenAI, Type } from "@google/genai";
import { InventoryItem, Plant, WeatherData } from "../types";

export async function predictYield(item: InventoryItem, plant: Plant, weather: WeatherData | undefined) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const plantedAt = item.plantedAt ? new Date(item.plantedAt) : new Date(item.createdAt);
  const ageInDays = Math.floor((new Date().getTime() - plantedAt.getTime()) / (1000 * 60 * 60 * 24));
  
  const prompt = `
    Predict the expected yield for this plant:
    Plant: ${plant.name} (${plant.scientificName || 'Unknown scientific name'})
    Age: ${ageInDays} days since planting
    Environment: ${item.environment || 'Unknown'}
    Location: ${item.locationName || 'Unknown'}
    Current Weather: ${weather ? `${weather.temp}°C, ${weather.condition}, Humidity: ${weather.humidity}%` : 'Weather data unavailable'}
    
    Consider the typical yield for this species at this age and the current environmental conditions.
    If the plant is very young, the yield might be 0 for now but predict the total season yield.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            predictedYield: {
              type: Type.NUMBER,
              description: "estimated total yield for the season",
            },
            predictedUnit: {
              type: Type.STRING,
              description: "e.g., 'kg', 'grams', 'items'",
            },
            reasoning: {
              type: Type.STRING,
              description: "brief explanation of the prediction based on weather and age",
            },
          },
          required: ["predictedYield", "predictedUnit", "reasoning"],
        },
      },
    });

    const result = JSON.parse(response.text || '{}');
    return {
      predictedYield: result.predictedYield || 0,
      predictedUnit: result.predictedUnit || 'units',
      reasoning: result.reasoning || 'Based on typical growth patterns.'
    };
  } catch (error) {
    console.error('Error predicting yield:', error);
    return {
      predictedYield: 0,
      predictedUnit: 'units',
      reasoning: 'Failed to generate prediction.'
    };
  }
}

export async function analyseYieldGap(item: InventoryItem, plant: Plant, predicted: number, actual: number, weather: WeatherData | undefined) {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
  const prompt = `
    Analyze why the actual yield was lower than predicted for this plant:
    Plant: ${plant.name}
    Predicted Yield: ${predicted}
    Actual Yield: ${actual}
    Weather Context: ${weather ? `${weather.temp}°C, ${weather.condition}` : 'Unavailable'}
    
    Provide a brief, helpful analysis of potential reasons (e.g., specific weather patterns, pests common for this plant, or care requirements).
    Return the analysis as a plain text string.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });

    return response.text || "Unable to analyze the yield gap at this time.";
  } catch (error) {
    console.error('Error analyzing yield gap:', error);
    return "An error occurred during analysis.";
  }
}
