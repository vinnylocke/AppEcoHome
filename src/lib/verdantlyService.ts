import { supabase } from "./supabase";
import type { PlantDetails, ProviderSearchResult } from "./verdantlyUtils";

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verdantly-search`;

async function callEdgeFunction(body: Record<string, unknown>): Promise<any> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token ?? "";

  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Verdantly request failed (${res.status})`);
  }
  return res.json();
}

export const VerdantlyService = {
  searchPlants: async (query: string): Promise<ProviderSearchResult[]> => {
    const data = await callEdgeFunction({ action: "search", query });
    return (data.results ?? []) as ProviderSearchResult[];
  },

  getPlantDetails: async (verdantlyId: string): Promise<PlantDetails> => {
    const data = await callEdgeFunction({ action: "details", id: verdantlyId });
    return data as PlantDetails;
  },
};
