import React, { createContext, useContext, useState } from "react";

interface PlantDoctorContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  pageContext: string | object | null;
  setPageContext: (context: string | object | null) => void;
}

const PlantDoctorContext = createContext<PlantDoctorContextType | undefined>(
  undefined,
);

export function PlantDoctorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [pageContext, setPageContext] = useState<string | object | null>(null);

  return (
    <PlantDoctorContext.Provider
      value={{ isOpen, setIsOpen, pageContext, setPageContext }}
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
