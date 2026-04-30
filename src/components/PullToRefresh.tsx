import React, { useState, useRef, ReactNode } from "react";
import { Loader2, ArrowDown } from "lucide-react";
import toast from "react-hot-toast";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

export default function PullToRefresh({
  onRefresh,
  children,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const maxPull = 120; // Maximum pixels the UI will pull down
  const refreshThreshold = 70; // Pixels required to trigger the refresh

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only allow pull-to-refresh if the user is at the absolute top of the page
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
    } else {
      startY.current = 0; // Ignore if scrolled down
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!startY.current || isRefreshing) return;

    const currentY = e.touches[0].clientY;
    const dy = currentY - startY.current;

    // If pulling downwards
    if (dy > 0) {
      // Apply friction (0.4) so it resists the pull slightly
      const distance = Math.min(dy * 0.4, maxPull);
      setPullDistance(distance);

      // Prevent the browser's default overscroll behavior while actively pulling
      if (e.cancelable) e.preventDefault();
    }
  };

  const handleTouchEnd = async () => {
    if (!startY.current || isRefreshing) return;

    if (pullDistance >= refreshThreshold) {
      // Trigger the refresh
      setIsRefreshing(true);
      setPullDistance(refreshThreshold); // Hold it at the threshold while spinning

      try {
        await onRefresh();
        toast.success("Up to date", { duration: 1500 });
      } catch {
        toast.error("Refresh failed. Please try again.");
      } finally {
        setIsRefreshing(false);
        setPullDistance(0); // Snap back up
      }
    } else {
      // Didn't pull far enough, snap back
      setPullDistance(0);
    }

    startY.current = 0;
  };

  // Calculate opacity and rotation for the visual indicator
  // Use a square-root curve so the indicator reaches full opacity earlier in the pull
  const pullProgress = Math.min(pullDistance / refreshThreshold, 1);
  const indicatorOpacity = Math.pow(pullProgress, 0.5);
  const spinnerRotation = pullProgress * 360;

  return (
    <div className="relative w-full h-full overflow-hidden bg-rhozly-bg">
      {/* 🚀 THE VISUAL INDICATOR (Hidden behind the content, revealed when pulled) */}
      <div
        className="absolute top-0 left-0 right-0 flex flex-col items-center justify-center h-24 z-0 gap-1.5"
        style={{ opacity: isRefreshing ? 1 : indicatorOpacity }}
      >
        <div
          className="bg-white rounded-full p-2.5 shadow-md border border-rhozly-outline/10 text-rhozly-primary transition-transform duration-200 ease-out"
          style={{
            transform: `rotate(${isRefreshing ? 0 : spinnerRotation}deg)`,
          }}
        >
          {isRefreshing ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <ArrowDown size={24} className="opacity-80" />
          )}
        </div>
        <span className="text-xs font-medium text-rhozly-primary/70 select-none touch-action-none">
          {isRefreshing
            ? "Refreshing…"
            : pullProgress >= 1
            ? "Release to refresh"
            : "Pull to refresh"}
        </span>
      </div>

      {/* Static hint shown only when not actively pulling, visible on all devices */}
      {!isRefreshing && pullDistance === 0 && (
        <div className="absolute top-1 left-0 right-0 flex justify-center z-0 pointer-events-none">
          <span className="text-[10px] font-medium text-rhozly-primary/30 select-none">
            Pull to refresh
          </span>
        </div>
      )}

      {/* 🚀 THE CONTENT CONTAINER (This physically slides down) */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="relative z-10 w-full h-full overflow-y-auto custom-scrollbar"
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition:
            isRefreshing || pullDistance === 0
              ? "transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)"
              : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}
