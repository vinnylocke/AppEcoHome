import { useEffect } from "react";
import { useLocation } from "react-router-dom";

interface RouteWatcherProps {
  setActiveTab: (tab: string) => void;
  setSelectedLocationId: (id: string | null) => void;
}

export default function RouteWatcher({
  setActiveTab,
  setSelectedLocationId,
}: RouteWatcherProps) {
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.startsWith("/shed")) {
      setActiveTab("shed");
      setSelectedLocationId(null);
    }
  }, [location, setActiveTab, setSelectedLocationId]);

  return null;
}
