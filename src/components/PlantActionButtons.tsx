import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";

// 🚀 NEW: Import the context so we can control the chat window!
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface PlantActionProps {
  plant: {
    name: string;
    search_query: string;
  };
  homeId: string;
}

export const PlantActionButtons = ({ plant, homeId }: PlantActionProps) => {
  const [existingItemId, setExistingItemId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const navigate = useNavigate();
  // 🚀 NEW: Grab the setter to minimize the chat window
  const { setIsOpen } = usePlantDoctor();

  useEffect(() => {
    const checkInventory = async () => {
      try {
        const { data, error } = await supabase
          .from("inventory_items")
          .select("id")
          .eq("home_id", homeId)
          .ilike("plant_name", `%${plant.search_query}%`)
          .limit(1)
          .maybeSingle();

        if (data) {
          setExistingItemId(data.id);
        }
      } catch (err) {
        console.error("Error checking shed:", err);
      } finally {
        setIsLoading(false);
      }
    };

    checkInventory();
  }, [plant, homeId]);

  if (isLoading) {
    return (
      <div className="mt-2 text-sm text-gray-400 animate-pulse">
        Checking shed for {plant.name}...
      </div>
    );
  }

  // 🚀 NEW: Helper functions to close chat and navigate
  const handleViewInShed = () => {
    setIsOpen(false);
    navigate(`/shed/item/${existingItemId}`);
  };

  const handleSearchAPI = () => {
    setIsOpen(false);
    navigate(
      `/shed/add/search?query=${encodeURIComponent(plant.search_query)}`,
    );
  };

  const handleManualCreate = () => {
    setIsOpen(false);
    navigate(`/shed/add/manual?preset_name=${encodeURIComponent(plant.name)}`);
  };

  // SCENARIO A: The plant is already in their Shed!
  if (existingItemId) {
    return (
      <div className="mt-3">
        <button
          onClick={handleViewInShed}
          className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
        >
          🌿 View {plant.name} in Shed
        </button>
      </div>
    );
  }

  // SCENARIO B: They don't own it yet. Show creation options.
  return (
    <div className="mt-3 p-3 bg-white rounded-lg border border-green-100 shadow-sm">
      <p className="text-xs text-green-800 font-bold uppercase mb-2">
        Add {plant.name} to Shed
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={handleSearchAPI}
          className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-md text-sm font-medium transition-colors"
        >
          🔍 Search Perenual API
        </button>

        <button
          onClick={handleManualCreate}
          className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-2 rounded-md text-sm font-medium transition-colors"
        >
          ✏️ Create Manually
        </button>
      </div>
    </div>
  );
};
