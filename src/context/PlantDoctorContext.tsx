import React, { createContext, useContext, useState } from "react";
import { useUserPreferences } from "../hooks/useUserPreferences";
import type { PlannerPreference } from "../hooks/useUserPreferences";

interface PlantDoctorContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  pageContext: string | object | null;
  setPageContext: (context: string | object | null) => void;
  preferences: PlannerPreference[];
}

const PlantDoctorContext = createContext<PlantDoctorContextType | undefined>(
  undefined,
);

export function PlantDoctorProvider({
  homeId,
  children,
}: {
  homeId?: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pageContext, setPageContext] = useState<string | object | null>(null);
  const preferences = useUserPreferences(homeId || "");

  return (
    <PlantDoctorContext.Provider
      value={{ isOpen, setIsOpen, pageContext, setPageContext, preferences }}
    >
      {children}
    </PlantDoctorContext.Provider>
  );
}

export const usePlantDoctor = () => {
  const context = useContext(PlantDoctorContext);
  if (!context)
    throw new Error("usePlantDoctor must be used within a PlantDoctorProvider");
  return context;
};
