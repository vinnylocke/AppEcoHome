import { Plant } from '../types';
import { searchPlants as searchGemini, generateCareGuide as generateGemini, getScientificName } from './gemini';
import { searchPlantbook } from './plantbook';

export async function searchPlantsDirect(query: string): Promise<Partial<Plant>[]> {
  console.log(`Direct search for: ${query}`);
  return await searchPlantbook(query);
}

export async function searchPlantsByCommonName(query: string): Promise<Partial<Plant>[]> {
  console.log(`Common name search for: ${query}`);
  const scientificName = await getScientificName(query);
  console.log(`Scientific name for ${query}: ${scientificName}`);
  return await searchPlantbook(scientificName);
}

export async function searchPlantsCombined(query: string): Promise<Partial<Plant>[]> {
  console.log(`Searching for: ${query}`);
  // 1. Try searching with the original query
  const initialResults = await searchPlantbook(query);
  console.log(`Initial results for ${query}:`, initialResults.length);
  if (initialResults.length > 0) {
    return initialResults;
  }

  // 2. If no results, try converting to scientific name
  const scientificName = await getScientificName(query);
  console.log(`Scientific name for ${query}: ${scientificName}`);
  const scientificResults = await searchPlantbook(scientificName);
  console.log(`Scientific results for ${scientificName}:`, scientificResults.length);
  
  if (scientificResults.length > 0) {
    return scientificResults;
  }

  // 3. Fallback to Gemini if Plantbook returns nothing
  return await searchGemini(query);
}

export async function getPlantCareGuideCombined(plantName: string): Promise<Partial<Plant>> {
  // We can try searching Plantbook first for a specific name
  const plantbookResults = await searchPlantbook(plantName);
  
  if (plantbookResults.length > 0) {
    // Return the best match
    return plantbookResults[0];
  }

  // Fallback to Gemini
  return await generateGemini(plantName);
}
