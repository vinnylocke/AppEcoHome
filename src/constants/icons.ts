/**
 * Central icon registry — one place to update any icon app-wide.
 *
 * Utility icons (X, Loader2, Plus, Trash2, ChevronRight, etc.) are too
 * generic to benefit from aliasing and stay as direct lucide-react imports
 * in each component.
 *
 * To swap an icon everywhere: change the left-hand side of the import below.
 */

// ── Navigation ────────────────────────────────────────────────────────────────
export { Shrub        as IconPlants        } from "lucide-react"; // the "Plants" tab (your inventory); was: Warehouse/Database
export { ClipboardList as IconPlanner      } from "lucide-react"; // was: Map
export { ShieldAlert  as IconAilment       } from "lucide-react"; // was: Bug (covers pests, diseases, invasives)
export { Stethoscope  as IconDoctor        } from "lucide-react";
export { Plug         as IconIntegrations  } from "lucide-react";
export { ShoppingCart as IconShopping      } from "lucide-react";
export { BookOpen     as IconGuides        } from "lucide-react";

// ── Tools & Features ──────────────────────────────────────────────────────────
export { LayoutTemplate as IconLayout      } from "lucide-react";
export { ScanLine     as IconScan          } from "lucide-react";
export { Sun          as IconLight         } from "lucide-react";
export { Sunrise      as IconSunTracker    } from "lucide-react";
export { Sparkles     as IconAI            } from "lucide-react";
export { Flower2      as IconDiscover      } from "lucide-react"; // was: Heart

// ── Plant & Garden Domain ─────────────────────────────────────────────────────
export { Leaf         as IconPlant         } from "lucide-react";
export { Sprout       as IconGrowth        } from "lucide-react";
export { Bug          as IconPest          } from "lucide-react"; // specifically pests/insects
export { Wheat        as IconHarvest       } from "lucide-react";
export { Scissors     as IconPrune         } from "lucide-react";
export { LibraryBig   as IconPlantDB       } from "lucide-react"; // was: Database (Perenual / plant encyclopedia)

// ── Sensors & Soil ────────────────────────────────────────────────────────────
export { Droplets     as IconWatering      } from "lucide-react";
export { Thermometer  as IconTemperature   } from "lucide-react";
export { Layers       as IconSoilMedium    } from "lucide-react";
export { FlaskConical as IconSoilPH        } from "lucide-react";
export { Beaker       as IconNutrients     } from "lucide-react";
