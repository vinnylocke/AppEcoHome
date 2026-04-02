export const rhozlyTheme = {
  colors: {
    // 2. Colors & Surface Hierarchy
    background: "#faf9f7", // The Base
    surfaceContainerLow: "#f4f3f1", // The Zone (Sidebar)
    surfaceContainer: "#efeeec", // Functional Areas
    surfaceContainerLowest: "#ffffff", // The Focus (Cards)

    // Brand Colors
    primary: "#075737", // Deep Forest
    primaryContainer: "#2a704d", // Leaf Green
    tertiaryFixed: "#ffdad8", // AI "Thought" Glow (Rose Red)
    onSurface: "#1a1c1b", // "No Pure Black" text
    outlineVariant: "rgba(26, 28, 27, 0.15)", // Ghost Border
  },

  gradients: {
    // The "Soul" of the interface
    primary: "linear-gradient(135deg, #075737 0%, #2a704d 100%)",
  },

  fonts: {
    display: "'Plus Jakarta Sans', sans-serif", // Modern Clarity
    body: "'Inter', sans-serif", // Editorial Precision
  },

  shadows: {
    // Ambient Shadow (Natural light filtered through canopy)
    ambient: "0 8px 24px -4px rgba(26, 28, 27, 0.1)",
  },

  glass: {
    background: "rgba(239, 238, 236, 0.7)",
    blur: "blur(20px)",
  },

  typography: {
    heroTitle: "text-xl md:text-4xl font-extrabold tracking-tight",
    tagline: "text-sm md:text-lg font-medium mt-1 opacity-80",
    fieldLabel:
      "block text-xs font-bold uppercase tracking-widest opacity-70 mb-2 ml-1",
    signInButton: "py-2 text-base md:text-lg",
  },
};
