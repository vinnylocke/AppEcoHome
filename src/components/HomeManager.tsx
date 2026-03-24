import React, { useState, useEffect } from "react";
import { createHome, joinHome, getHome } from "../services/homeService";
import { UserProfile, Home } from "../types";

interface HomeManagerProps {
  userProfile: UserProfile;
  onHomeUpdated: () => void;
}

export const HomeManager: React.FC<HomeManagerProps> = ({
  userProfile,
  onHomeUpdated,
}) => {
  const [homeName, setHomeName] = useState("");
  const [joinHomeId, setJoinHomeId] = useState("");
  const [currentHome, setCurrentHome] = useState<Home | null>(null);

  useEffect(() => {
    if (userProfile.home_id) {
      getHome(userProfile.home_id).then(setCurrentHome);
    }
  }, [userProfile.home_id]);

  const handleCreateHome = async () => {
    if (!homeName) return;
    await createHome(userProfile.uid, homeName);
    onHomeUpdated();
  };

  const handleJoinHome = async () => {
    if (!joinHomeId) return;
    await joinHome(userProfile.uid, joinHomeId);
    onHomeUpdated();
  };

  return (
    <div className="p-6 bg-white rounded-3xl shadow-sm border border-stone-100">
      <h2 className="text-xl font-bold text-stone-900 mb-4">Manage Home</h2>
      {currentHome ? (
        <div className="mb-6 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
          <p className="text-sm font-bold text-emerald-900">
            Current Home: {currentHome.name}
          </p>
          <p className="text-xs text-emerald-700 font-mono mt-1">
            ID: {currentHome.id}
          </p>
        </div>
      ) : (
        <p className="text-sm text-stone-500 mb-4">
          You are not currently in a home.
        </p>
      )}
      <div className="space-y-4">
        <div>
          <input
            type="text"
            value={homeName}
            onChange={(e) => setHomeName(e.target.value)}
            placeholder="New Home Name"
            className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm"
          />
          <button
            onClick={handleCreateHome}
            className="mt-2 w-full py-2 bg-emerald-600 text-white rounded-xl font-semibold"
          >
            Create Home
          </button>
        </div>
        <div>
          <input
            type="text"
            value={joinHomeId}
            onChange={(e) => setJoinHomeId(e.target.value)}
            placeholder="Home ID to Join"
            className="w-full p-3 bg-stone-50 border border-stone-100 rounded-xl text-sm"
          />
          <button
            onClick={handleJoinHome}
            className="mt-2 w-full py-2 bg-indigo-600 text-white rounded-xl font-semibold"
          >
            Join Home
          </button>
        </div>
      </div>
    </div>
  );
};
