import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Stage, Layer, Rect, Circle, Ellipse, Line, Text, Transformer } from "react-konva";
import { X, Loader2, ChevronRight } from "lucide-react";
import GardenLayout3D from "./GardenLayout3D";
import GardenCompass from "./GardenCompass";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import { fitStageToCanvas } from "../lib/layoutViewport";
import toast from "react-hot-toast";
import GardenRuler from "./GardenRuler";
import GardenScaleBar from "./GardenScaleBar";
import GardenShapePanel, { type ShapePreset } from "./GardenShapePanel";
import GardenShapeProperties, { type ShapeData } from "./GardenShapeProperties";
import GardenEditorToolbar, { type InteractionMode } from "./GardenEditorToolbar";
import { useSunPosition } from "../hooks/useSunPosition";
import { computeAllShapesSunHours, type ShapeSunResult } from "../lib/sunAnalysis";
import { useShapeLiveState } from "../hooks/useShapeLiveState";
import { computeTokenGrid, getPlantTokenColor, getPlantInitial, MAX_VISIBLE_TOKENS } from "../lib/garden/plantTokens";
import { getShapeDecorations } from "../lib/garden/shapeDecorations";
import { getCompanionRelationForGroups } from "../constants/companionPlants";
import { parsePlantSunPreference, getPlantSunFit, getShapeFitSummary } from "../lib/garden/sunFit";
import { classifyFrostRisk, computeWindExposure, type ForecastDay } from "../lib/garden/microclimate";
import { computeAlignmentGuides, getShapeBounds, type GuideLine } from "../lib/garden/alignmentGuides";
import PlanFilterChip from "./garden/PlanFilterChip";
import MicroclimateReportModal from "./garden/MicroclimateReportModal";
import GardenNorthSheet from "./garden/GardenNorthSheet";
import ShapeQuickActions from "./garden/ShapeQuickActions";
import GardenContextMenu from "./garden/GardenContextMenu";
import GardenZoneSheet from "./garden/GardenZoneSheet";
import BedTemplatesSheet, { type TemplateRow } from "./garden/BedTemplatesSheet";
import { usePermissions } from "../context/HomePermissionsContext";

interface Layout {
  id: string;
  name: string;
  canvas_w_m: number;
  canvas_h_m: number;
  north_offset_deg: number;
}

interface Props {
  homeId: string;
}

const BASE_PX = 50; // pixels per metre at zoom = 1

export default function GardenLayoutEditor({ homeId }: Props) {
  const { can } = usePermissions();
  const canEdit = can("layout.edit");
  const { layoutId } = useParams<{ layoutId: string }>();
  const navigate = useNavigate();

  const [layout, setLayout] = useState<Layout | null>(null);
  const [shapes, setShapes] = useState<ShapeData[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Wave 5C — secondary selection via shift-click. Operates alongside selectedId.
  const [extraSelection, setExtraSelection] = useState<Set<string>>(new Set());
  const [tool, setTool] = useState<"select" | "polygon" | "draw">("select");
  // When the polygon tool is started via the Free-form Bed tile we render the
  // resulting shape with Konva tension to smooth the corners (Wave 4A).
  const [polygonSmoothed, setPolygonSmoothed] = useState(false);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("move");
  const [pendingPreset, setPendingPreset] = useState<ShapePreset | null>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [homeLatLng, setHomeLatLng] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 32, y: 32 });
  const [polyPoints, setPolyPoints] = useState<{ x: number; y: number }[]>([]);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  // Phones get a READ-ONLY viewer (docs/plans/garden-layout-fixes-and-mobile-
  // readonly.md): the editor's tools don't fit small screens, so mobile users
  // look, pan, zoom and inspect — editing needs a tablet or desktop.
  const viewOnly = isMobile;
  const [settingName, setSettingName] = useState("");
  const [settingW, setSettingW] = useState(30);
  const [settingH, setSettingH] = useState(20);
  const [northOffset, setNorthOffset] = useState(0);
  const [settingNorthOffset, setSettingNorthOffset] = useState(0);
  const [sunDate, setSunDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [sunMinutes, setSunMinutes] = useState(() =>
    Math.round((new Date().getHours() * 60 + new Date().getMinutes()) / 5) * 5
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [compassReadState, setCompassReadState] = useState<"idle" | "ready" | "done">("idle");
  const [areaLuxReadings, setAreaLuxReadings] = useState<
    Array<{ area_id: string; lux_value: number; recorded_at: string }>
  >([]);
  const [showLuxOverlay, setShowLuxOverlay] = useState(false);
  const [showSunOverlay, setShowSunOverlay] = useState(false);
  const [showCompanionsOverlay, setShowCompanionsOverlay] = useState(false);
  const [showFrostOverlay, setShowFrostOverlay] = useState(false);
  const [showWindOverlay, setShowWindOverlay] = useState(false);
  const [showPhOverlay, setShowPhOverlay] = useState(false);
  const [showMoistureOverlay, setShowMoistureOverlay] = useState(false);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [propertiesExpanded, setPropertiesExpanded] = useState(false);
  const [activePlanFilter, setActivePlanFilter] = useState<string | null>(() => {
    // Pre-apply a plan filter passed via sessionStorage (e.g. "View on Layout" from Planner)
    try {
      const stashed = typeof window !== "undefined" ? sessionStorage.getItem("rhozly:plan-filter") : null;
      if (stashed) {
        sessionStorage.removeItem("rhozly:plan-filter");
        return stashed;
      }
    } catch { /* ignore */ }
    return null;
  });
  const [showMicroclimate, setShowMicroclimate] = useState(false);
  const [showNorthSheet, setShowNorthSheet] = useState(false);
  const [showZoneSheet, setShowZoneSheet] = useState(false);
  const [showTemplatesSheet, setShowTemplatesSheet] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const SNAP_STEP_M = 0.5;
  const snap = useCallback((v: number) => snapToGrid ? Math.round(v / SNAP_STEP_M) * SNAP_STEP_M : v, [snapToGrid]);

  // Long-press detection (Wave 9C) — holding a shape opens the Quick Actions sheet.
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [quickActionsShape, setQuickActionsShape] = useState<ShapeData | null>(null);

  // Smart alignment guides while dragging — visual lines only, no snapping.
  const [dragGuides, setDragGuides] = useState<GuideLine[]>([]);

  // Plant token resize popup state. The save callbacks themselves are defined
  // AFTER the useShapeLiveState() call below so they can depend on its
  // returned refetch function without hitting a TDZ on the render-time deps array.
  const [tokenResize, setTokenResize] = useState<{ itemId: string; areaId: string; plantName: string; size: number; height: number } | null>(null);
  // The currently selected plant token in 3D — gets TransformControls.
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  // Drag-select rectangle (Wave 5C extension) — desktop multi-select.
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // Right-click context menu (Wave 5D)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; shape: ShapeData } | null>(null);
  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);
  const startLongPress = useCallback((shape: ShapeData) => {
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      setQuickActionsShape(shape);
    }, 550);
  }, [cancelLongPress]);

  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shapesRef = useRef<ShapeData[]>([]);
  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Manual pan state — kept in refs so pan moves don't trigger re-renders
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const lastTouchDistRef = useRef<number | null>(null);

  // Undo/redo history (Wave 5A) — refs so pushing doesn't trigger renders.
  // We snapshot the shapes array at the moment a user action commits.
  const historyRef = useRef<{ past: ShapeData[][]; future: ShapeData[][] }>({ past: [], future: [] });
  const HISTORY_LIMIT = 50;
  const [, setHistoryTick] = useState(0); // forces a render when we want canUndo/canRedo to refresh

  // Action registry — exposed via a stable ref so callbacks declared later in
  // the component can be reached from earlier useEffects (e.g. keyboard handler)
  // without tripping a TDZ on render-time dependency evaluation.
  const actionsRef = useRef({
    undo:           () => {},
    redo:           () => {},
    deleteShape:    (_id: string) => { void _id; },
    recordHistory:  () => {},
    triggerSave:    () => {},
    duplicateShape: (_id: string) => { void _id; },
  });

  // Refs that mirror state for use inside stable callbacks
  const stagePosRef = useRef(stagePos);
  const zoomRef = useRef(zoom);
  const containerSizeRef = useRef(containerSize);

  useEffect(() => { shapesRef.current = shapes; }, [shapes]);
  useEffect(() => { stagePosRef.current = stagePos; }, [stagePos]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { containerSizeRef.current = containerSize; }, [containerSize]);

  // Collapse the mobile properties sheet whenever the selected shape changes
  useEffect(() => { setPropertiesExpanded(false); }, [selectedId]);
  // Clear 3D token selection when leaving 3D view or changing shapes
  useEffect(() => { setSelectedTokenId(null); }, [viewMode, selectedId]);

  // Fetch forecast once, on demand, for the frost overlay (Wave 11A)
  useEffect(() => {
    if (!showFrostOverlay || forecast.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("weather_snapshots")
          .select("data")
          .eq("home_id", homeId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        const raw = (data?.data ?? {}) as any;
        const daily = raw.daily ?? raw.forecast ?? raw.next7 ?? null;
        const parsed: ForecastDay[] = [];
        if (daily?.time && daily?.temperature_2m_min) {
          for (let i = 0; i < daily.time.length; i++) {
            parsed.push({
              date: daily.time[i],
              temp_min_c: daily.temperature_2m_min[i] ?? 0,
              temp_max_c: daily.temperature_2m_max?.[i] ?? 0,
              wind_speed_kph: daily.windspeed_10m_max?.[i],
              precip_mm: daily.precipitation_sum?.[i],
            });
          }
        } else if (Array.isArray(daily)) {
          for (const d of daily) parsed.push({
            date: d.date ?? d.day ?? "",
            temp_min_c: d.temp_min_c ?? d.min ?? d.tempmin ?? 0,
            temp_max_c: d.temp_max_c ?? d.max ?? d.tempmax ?? 0,
            wind_speed_kph: d.wind_speed_kph ?? d.windspeed,
            precip_mm: d.precip_mm ?? d.precipitation,
          });
        }
        setForecast(parsed);
      } catch (err) {
        Logger.error("Failed to load forecast for frost overlay", err);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showFrostOverlay, homeId]);

  // Keyboard shortcuts (Wave 5B):
  //   Escape         — cancel draw/polygon or deselect
  //   Delete/Bksp    — delete selected shape
  //   Ctrl/Cmd+Z     — undo
  //   Ctrl/Cmd+Shift+Z (or Ctrl+Y) — redo
  //   Ctrl/Cmd+D     — duplicate selected shape
  //   1 / 2          — switch 2D / 3D view
  //   F              — fit selected (or canvas) to view
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (e.key === "Escape") {
        if (tool === "draw") {
          setPendingPreset(null);
          setDrawStart(null);
          setDrawCurrent(null);
          setTool("select");
          setInteractionMode("move");
        } else if (tool === "polygon") {
          setPolyPoints([]);
          setPointerPos(null);
          setTool("select");
          setInteractionMode("move");
        } else {
          setSelectedId(null);
        }
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) actionsRef.current.redo(); else actionsRef.current.undo();
        return;
      }
      if (isMod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        actionsRef.current.redo();
        return;
      }

      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        const all = [selectedId, ...extraSelection];
        for (const id of all) actionsRef.current.deleteShape(id);
        return;
      }

      if (isMod && (e.key === "d" || e.key === "D") && selectedId) {
        e.preventDefault();
        const all = [selectedId, ...extraSelection];
        for (const id of all) actionsRef.current.duplicateShape(id);
        return;
      }

      if (!isMod && (e.key === "1")) {
        setViewMode("2d");
        return;
      }
      if (!isMod && (e.key === "2")) {
        setViewMode("3d");
        return;
      }

      if (!isMod && (e.key === "f" || e.key === "F")) {
        // Fit canvas to view — same math as the initial fit.
        const el = containerRef.current;
        if (layout && el) {
          const fit = fitStageToCanvas(layout.canvas_w_m, layout.canvas_h_m, el.clientWidth, el.clientHeight, BASE_PX);
          setZoom(fit.zoom);
          setStagePos({ x: fit.x, y: fit.y });
        } else {
          setZoom(1);
          setStagePos({ x: 32, y: 32 });
        }
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tool, selectedId, extraSelection, layout]);

  // Container resize
  const containerMeasured = useRef(false);
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      containerMeasured.current = true;
      setContainerSize({ w: width, h: height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Initial fit-to-canvas: once the layout and a MEASURED container size are
  // known, pick a zoom that shows the WHOLE canvas centred (phones used to
  // open on a corner of empty grid at zoom 1). Gated on the ResizeObserver
  // having reported — the default 800×600 state produced an oversized fit on
  // phones. One-shot — after that the user's pan/zoom is theirs.
  const didInitialFit = useRef(false);
  useEffect(() => {
    if (didInitialFit.current || !layout || !containerMeasured.current) return;
    if (containerSize.w < 50 || containerSize.h < 50) return;
    didInitialFit.current = true;
    const fit = fitStageToCanvas(layout.canvas_w_m, layout.canvas_h_m, containerSize.w, containerSize.h, BASE_PX);
    setZoom(fit.zoom);
    setStagePos({ x: fit.x, y: fit.y });
  }, [layout, containerSize]);

  // View-only forces LOOK mode — no draw/move, no selection-based mutation.
  useEffect(() => {
    if (viewOnly) setInteractionMode("rotate");
  }, [viewOnly]);

  // Mobile breakpoint
  useEffect(() => {
    const handle = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  // Browser geolocation fallback — used when the home has no lat/lng in the DB
  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        setHomeLatLng(prev => {
          if (prev != null) return prev;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          supabase.from("homes").update({ lat, lng }).eq("id", homeId);
          return { lat, lng };
        });
      },
      () => {},
    );
  }, [homeId]);

  // Sun position — build Date from slider, call SunCalc, convert to scene azimuth
  const sunDateObj = useMemo(() => {
    const d = new Date(sunDate);
    d.setHours(0, sunMinutes, 0, 0);
    return d;
  }, [sunDate, sunMinutes]);

  const rawSunPos = useSunPosition(
    homeLatLng?.lat ?? null,
    homeLatLng?.lng ?? null,
    sunDateObj
  );

  // sceneAzimuth = -sunAzimuth - northOffsetRad
  // SunCalc: 0=South, +West. Scene +X=East, +Z=South. Negate to match axes.
  const northOffsetRad = northOffset * Math.PI / 180;
  const sunPosition = (rawSunPos && rawSunPos.altitude > 0)
    ? { altitude: rawSunPos.altitude, azimuth: -rawSunPos.azimuth - northOffsetRad }
    : undefined;

  // Linked-area key drives the live-state hook + other area-bound fetches
  const linkedAreaIds = useMemo(
    () => [...new Set(shapes.map(s => s.area_id).filter(Boolean))] as string[],
    [shapes],
  );
  const areaIdKey = [...linkedAreaIds].sort().join(",");

  // Plants / tasks / ailments / pH / moisture per linked area
  const { plants: areaPlants, tasks: areaTaskCounts, ailments: areaAilmentSeverity, ph: areaPh, moisture: areaMoisture, refetch: refetchLiveState } =
    useShapeLiveState(homeId, linkedAreaIds);

  // Plant token persistence callbacks — declared here so they can safely depend on
  // refetchLiveState (returned from the hook above) without a TDZ on render-time deps.
  const updateTokenPosition = useCallback(async (itemId: string, x: number, y: number) => {
    try {
      const { error } = await supabase.from("inventory_items")
        .update({ display_x_m: x, display_y_m: y })
        .eq("id", itemId);
      if (error) throw error;
      refetchLiveState();
    } catch (err) {
      Logger.error("Failed to save plant token position", err);
      toast.error("Could not save plant position");
    }
  }, [refetchLiveState]);

  // 3D drag handler — persists world X/Z + height in one call.
  const updateTokenPosition3D = useCallback(async (itemId: string, worldX: number, worldZ: number, heightM: number) => {
    try {
      const { error } = await supabase.from("inventory_items")
        .update({ display_x_m: worldX, display_y_m: worldZ, display_height_m: heightM })
        .eq("id", itemId);
      if (error) throw error;
      refetchLiveState();
    } catch (err) {
      Logger.error("Failed to save plant token 3D position", err);
      toast.error("Could not save plant position");
    }
  }, [refetchLiveState]);

  const updateTokenSize = useCallback(async (itemId: string, size: number, height: number) => {
    try {
      const { error } = await supabase.from("inventory_items")
        .update({ display_size_m: size, display_height_m: height })
        .eq("id", itemId);
      if (error) throw error;
      refetchLiveState();
    } catch (err) {
      Logger.error("Failed to save plant token size", err);
      toast.error("Could not resize plant");
    }
  }, [refetchLiveState]);

  // Companion overlay — find adjacent shape pairs with plants and classify the relation
  const companionLines = useMemo(() => {
    if (!showCompanionsOverlay) return [] as { from: { x: number; y: number }; to: { x: number; y: number }; relation: "Beneficial" | "Harmful"; reason?: string }[];
    const ADJACENCY_M = 5;
    const out: { from: { x: number; y: number }; to: { x: number; y: number }; relation: "Beneficial" | "Harmful"; reason?: string }[] = [];

    const shapeCentre = (s: ShapeData): { x: number; y: number } | null => {
      if (s.shape_type === "rect" || s.shape_type === "path") {
        return { x: s.x_m + (s.width_m ?? 1) / 2, y: s.y_m + (s.height_m ?? 1) / 2 };
      }
      if (s.shape_type === "circle") return { x: s.x_m, y: s.y_m };
      if (s.shape_type === "ellipse") return { x: s.x_m, y: s.y_m };
      if (s.shape_type === "polygon" && s.points && s.points.length > 0) {
        const cx = s.points.reduce((a, p) => a + p.x, 0) / s.points.length;
        const cy = s.points.reduce((a, p) => a + p.y, 0) / s.points.length;
        return { x: s.x_m + cx, y: s.y_m + cy };
      }
      return null;
    };

    const withPlants = shapes
      .filter((s) => s.area_id && (areaPlants[s.area_id]?.length ?? 0) > 0)
      .map((s) => ({ s, centre: shapeCentre(s), names: (areaPlants[s.area_id!] ?? []).map((p) => p.plant_name) }))
      .filter((x) => x.centre !== null) as { s: ShapeData; centre: { x: number; y: number }; names: string[] }[];

    for (let i = 0; i < withPlants.length; i++) {
      for (let j = i + 1; j < withPlants.length; j++) {
        const a = withPlants[i];
        const b = withPlants[j];
        const dx = a.centre.x - b.centre.x;
        const dy = a.centre.y - b.centre.y;
        if (Math.sqrt(dx * dx + dy * dy) > ADJACENCY_M) continue;
        const rel = getCompanionRelationForGroups(a.names, b.names);
        if (rel.relation === "Neutral") continue;
        out.push({ from: a.centre, to: b.centre, relation: rel.relation, reason: rel.reason });
      }
    }
    return out;
  }, [showCompanionsOverlay, shapes, areaPlants]);

  // Fetch lux readings (3D only)
  useEffect(() => {
    if (viewMode !== "3d") return;
    const ids = [...new Set(shapes.map(s => s.area_id).filter(Boolean))] as string[];
    if (!ids.length) { setAreaLuxReadings([]); return; }
    supabase.from("area_lux_readings")
      .select("area_id, lux_value, recorded_at")
      .in("area_id", ids).order("recorded_at", { ascending: false })
      .then(({ data }) => setAreaLuxReadings(data ?? []));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, areaIdKey]);

  // Sun classification — synchronous, runs only when overlay is active
  const sunAnalysisResults = useMemo<ShapeSunResult[] | null>(() => {
    if (!showSunOverlay || !homeLatLng || !shapes.length) return null;
    return computeAllShapesSunHours(shapes, homeLatLng.lat, homeLatLng.lng, new Date(sunDate), northOffset);
  }, [showSunOverlay, shapes, homeLatLng, sunDate, northOffset]);

  // Play/pause — advance slider 5 min every 200 ms (≈ 1 full day in ~2 min)
  useEffect(() => {
    if (!isPlaying) {
      if (playIntervalRef.current) { clearInterval(playIntervalRef.current); playIntervalRef.current = null; }
      return;
    }
    playIntervalRef.current = setInterval(() => {
      setSunMinutes(prev => {
        const next = prev + 5;
        if (next >= 1440) { setIsPlaying(false); return 1440; }
        return next;
      });
    }, 200);
    return () => { if (playIntervalRef.current) clearInterval(playIntervalRef.current); };
  }, [isPlaying]);

  // Load layout + shapes + home lat/lng
  useEffect(() => {
    if (!layoutId) return;
    (async () => {
      try {
        const [{ data: lay, error: layErr }, { data: shps, error: shpErr }, { data: homeRow }] = await Promise.all([
          supabase.from("garden_layouts").select("*").eq("id", layoutId).single(),
          supabase.from("garden_shapes").select("*").eq("layout_id", layoutId).order("z_index"),
          supabase.from("homes").select("lat,lng").eq("id", homeId).maybeSingle(),
        ]);
        if (layErr) throw layErr;
        if (shpErr) throw shpErr;
        if (lay) {
          setLayout(lay);
          setSettingName(lay.name);
          setSettingW(lay.canvas_w_m);
          setSettingH(lay.canvas_h_m);
          setNorthOffset(lay.north_offset_deg ?? 0);
          setSettingNorthOffset(lay.north_offset_deg ?? 0);
        }
        if (homeRow?.lat != null && homeRow?.lng != null) {
          setHomeLatLng({ lat: homeRow.lat, lng: homeRow.lng });
        }
        setShapes((shps ?? []).map((s: any) => ({
          ...s,
          points: s.points ?? null,
          extrude_m: s.extrude_m ?? null,
          preset_id: s.preset_id ?? null,
        })));
      } catch (err) {
        Logger.error("Failed to load layout", err);
        toast.error("Could not load layout.");
      } finally {
        setLoading(false);
      }
    })();
  }, [layoutId, homeId]);

  // Attach transformer to selected node (not for polygons)
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    const sel = shapes.find(s => s.id === selectedId);
    if (!sel || sel.shape_type === "polygon" || viewOnly) {
      transformerRef.current.nodes([]);
      return;
    }
    const node = stageRef.current.findOne(`#${selectedId}`);
    transformerRef.current.nodes(node ? [node] : []);
  }, [selectedId, shapes, viewOnly]);

  // Push current shape state to undo history. Called before each user mutation.
  // MUST be declared before updateShape/deleteShape/reorder/commitDraw so their
  // useCallback dep arrays don't hit a TDZ ReferenceError (Wave 5A bugfix).
  const recordHistory = useCallback(() => {
    const current = shapesRef.current;
    historyRef.current.past.push(JSON.parse(JSON.stringify(current)));
    if (historyRef.current.past.length > HISTORY_LIMIT) {
      historyRef.current.past.shift();
    }
    historyRef.current.future = [];
    setHistoryTick((n) => (n + 1) & 0xffff);
  }, []);

  // Auto-save — delete + re-insert strategy for simplicity
  const triggerSave = useCallback(() => {
    setSaveState("unsaved");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (!layoutId) return;
      setSaveState("saving");
      try {
        const current = shapesRef.current;
        const { error: delErr } = await supabase.from("garden_shapes").delete().eq("layout_id", layoutId);
        if (delErr) throw delErr;
        if (current.length > 0) {
          const { error: insErr } = await supabase.from("garden_shapes").insert(
            current.map((s, i) => ({
              id: s.id,
              layout_id: layoutId,
              area_id: s.area_id,
              shape_type: s.shape_type,
              label: s.label,
              color: s.color,
              x_m: s.x_m,
              y_m: s.y_m,
              width_m: s.width_m,
              height_m: s.height_m,
              radius_m: s.radius_m,
              points: s.points,
              rotation: s.rotation,
              z_index: i,
              dashed: s.dashed ?? false,
              extrude_m: s.extrude_m ?? null,
              preset_id: s.preset_id ?? null,
              plan_id: s.plan_id ?? null,
            }))
          );
          if (insErr) throw insErr;
        }
        setSaveState("saved");
      } catch (err) {
        Logger.error("Auto-save failed", err);
        setSaveState("unsaved");
      }
    }, 600);
  }, [layoutId]);

  const undo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (past.length === 0) return;
    const prev = past.pop()!;
    future.push(JSON.parse(JSON.stringify(shapesRef.current)));
    setShapes(prev);
    setSelectedId(null);
    setHistoryTick((n) => (n + 1) & 0xffff);
    triggerSave();
  }, [triggerSave]);

  const redo = useCallback(() => {
    const { past, future } = historyRef.current;
    if (future.length === 0) return;
    const next = future.pop()!;
    past.push(JSON.parse(JSON.stringify(shapesRef.current)));
    setShapes(next);
    setSelectedId(null);
    setHistoryTick((n) => (n + 1) & 0xffff);
    triggerSave();
  }, [triggerSave]);

  const updateShape = useCallback((id: string, updates: Partial<ShapeData>) => {
    recordHistory();
    setShapes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
    triggerSave();
  }, [triggerSave, recordHistory]);

  const deleteShape = useCallback((id: string) => {
    recordHistory();
    setShapes(prev => prev.filter(s => s.id !== id));
    setSelectedId(null);
    triggerSave();
  }, [triggerSave, recordHistory]);

  const reorder = useCallback((id: string, action: "front" | "forward" | "backward" | "back") => {
    recordHistory();
    setShapes(prev => {
      const idx = prev.findIndex(s => s.id === id);
      if (idx === -1) return prev;
      const arr = [...prev];
      if (action === "front") {
        arr.push(arr.splice(idx, 1)[0]);
      } else if (action === "forward" && idx < arr.length - 1) {
        [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
      } else if (action === "backward" && idx > 0) {
        [arr[idx], arr[idx - 1]] = [arr[idx - 1], arr[idx]];
      } else if (action === "back") {
        arr.unshift(arr.splice(idx, 1)[0]);
      }
      return arr;
    });
    triggerSave();
  }, [triggerSave, recordHistory]);

  // Apply a saved template — drops a new shape near the canvas centre using template geometry.
  // Generate (or fetch existing) public share link for this layout.
  const sharingLayoutRef = useRef(false);
  const handleShareLink = useCallback(async () => {
    if (!layout || sharingLayoutRef.current) return;
    sharingLayoutRef.current = true;
    try {
      let { data, error } = await supabase
        .from("garden_layouts")
        .select("share_token")
        .eq("id", layout.id)
        .single();
      if (error) throw error;
      let token = data?.share_token as string | null;
      if (!token) {
        // Generate a cryptographically random base36 token.
        const bytes = new Uint8Array(12);
        crypto.getRandomValues(bytes);
        token = Array.from(bytes).map(b => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
        const { error: upErr } = await supabase
          .from("garden_layouts")
          .update({ share_token: token, updated_at: new Date().toISOString() })
          .eq("id", layout.id);
        if (upErr) throw upErr;
      }
      const url = `${window.location.origin}/share/garden-layout/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Share link copied to clipboard");
      } catch {
        // Clipboard API may fail in older browsers — show the URL via prompt as fallback.
        toast(url);
      }
    } catch (err) {
      Logger.error("Failed to generate share link", err);
      toast.error("Could not create share link");
    } finally {
      sharingLayoutRef.current = false;
    }
  }, [layout]);

  // Export the current 2D canvas as a high-DPI PNG (Wave 12)
  const exportPng = useCallback(() => {
    if (!stageRef.current || !layout) return;
    try {
      const url = stageRef.current.toDataURL({ pixelRatio: 2, mimeType: "image/png" });
      const a = document.createElement("a");
      a.href = url;
      const safeName = layout.name.replace(/[^a-z0-9-_ ]/gi, "").trim() || "garden";
      a.download = `${safeName}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Layout exported");
    } catch (err) {
      Logger.error("Failed to export layout PNG", err);
      toast.error("Could not export image");
    }
  }, [layout]);

  const applyTemplate = useCallback((tpl: TemplateRow) => {
    if (!layout) return;
    const newId = crypto.randomUUID();
    const cx = layout.canvas_w_m / 2;
    const cy = layout.canvas_h_m / 2;
    const w = tpl.width_m ?? 1;
    const h = tpl.height_m ?? 1;
    const newShape: ShapeData = {
      id: newId,
      layout_id: layout.id,
      area_id: null,
      shape_type: tpl.shape_type as ShapeData["shape_type"],
      label: tpl.name,
      color: tpl.colour,
      x_m: tpl.shape_type === "circle" ? cx : cx - w / 2,
      y_m: tpl.shape_type === "circle" ? cy : cy - h / 2,
      width_m: tpl.width_m,
      height_m: tpl.height_m,
      radius_m: tpl.radius_m,
      points: tpl.points,
      rotation: 0,
      z_index: shapesRef.current.length,
      dashed: tpl.dashed,
      extrude_m: tpl.extrude_m,
      preset_id: tpl.preset_id,
      plan_id: activePlanFilter,
    };
    recordHistory();
    setShapes((prev) => [...prev, newShape]);
    setSelectedId(newId);
    triggerSave();
    toast.success(`Applied template "${tpl.name}"`);
  }, [layout, activePlanFilter, recordHistory, triggerSave]);

  const duplicateShape = useCallback((id: string) => {
    const original = shapesRef.current.find((s) => s.id === id);
    if (!original) return;
    const newId = crypto.randomUUID();
    const clone: ShapeData = {
      ...JSON.parse(JSON.stringify(original)),
      id: newId,
      x_m: original.x_m + 0.5,
      y_m: original.y_m + 0.5,
      z_index: shapesRef.current.length,
    };
    recordHistory();
    setShapes((prev) => [...prev, clone]);
    setSelectedId(newId);
    triggerSave();
  }, [triggerSave, recordHistory]);

  // Keep the action registry in sync — every callback assigned via this effect
  // is reachable from the keyboard handler via actionsRef.current without TDZ.
  useEffect(() => {
    actionsRef.current.undo           = undo;
    actionsRef.current.redo           = redo;
    actionsRef.current.deleteShape    = deleteShape;
    actionsRef.current.recordHistory  = recordHistory;
    actionsRef.current.triggerSave    = triggerSave;
    actionsRef.current.duplicateShape = duplicateShape;
  }, [undo, redo, deleteShape, recordHistory, triggerSave, duplicateShape]);

  // Centralised mode switch — resets transient draw/polygon state when leaving Draw mode.
  const handleModeChange = useCallback((mode: InteractionMode) => {
    setInteractionMode(mode);
    if (mode !== "draw") {
      setPendingPreset(null);
      setTool("select");
      setDrawStart(null);
      setDrawCurrent(null);
    }
  }, []);

  // Selecting a preset arms draw mode — user then drags on canvas to place + size the shape.
  const addPreset = useCallback((preset: ShapePreset) => {
    setPendingPreset(preset);
    setTool("draw");
    setInteractionMode("draw");
    setDrawStart(null);
    setDrawCurrent(null);
    setSelectedId(null);
  }, []);

  // Commit the dragged rect/circle as a real shape once the user releases the mouse.
  const commitDraw = useCallback((start: { x: number; y: number }, end: { x: number; y: number }) => {
    if (!layout || !pendingPreset) return;
    const minM = 0.1; // minimum 10 cm in any dimension
    const x1 = snap(Math.min(start.x, end.x));
    const y1 = snap(Math.min(start.y, end.y));
    const x2 = snap(Math.max(start.x, end.x));
    const y2 = snap(Math.max(start.y, end.y));
    const w = Math.max(minM, x2 - x1);
    const h = Math.max(minM, y2 - y1);
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const id = crypto.randomUUID();
    const base = {
      id, layout_id: layout.id, area_id: null, label: null,
      color: pendingPreset.color, rotation: 0,
      z_index: shapesRef.current.length,
      dashed: pendingPreset.dashed ?? false,
      extrude_m: pendingPreset.extrude_m,
      preset_id: pendingPreset.id,
      plan_id: activePlanFilter,
    };
    let shape: ShapeData;
    if (pendingPreset.shapeType === "circle") {
      shape = { ...base, shape_type: "circle", x_m: cx, y_m: cy, width_m: null, height_m: null, radius_m: Math.max(minM, Math.min(w, h) / 2), points: null };
    } else if (pendingPreset.shapeType === "ellipse") {
      shape = { ...base, shape_type: "ellipse", x_m: cx, y_m: cy, width_m: w, height_m: h, radius_m: null, points: null };
    } else {
      shape = { ...base, shape_type: "rect", x_m: x1, y_m: y1, width_m: w, height_m: h, radius_m: null, points: null };
    }
    recordHistory();
    setShapes(prev => [...prev, shape]);
    setSelectedId(id);
    setPendingPreset(null);
    setDrawStart(null);
    setDrawCurrent(null);
    setTool("select");
    setInteractionMode("move");
    triggerSave();
  }, [layout, pendingPreset, triggerSave, recordHistory, activePlanFilter, snap]);

  // Zoom via scroll wheel
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const by = 1.08;
    const old = zoom;
    const pointer = stage.getPointerPosition();
    const next = Math.max(0.1, Math.min(5, e.evt.deltaY < 0 ? old * by : old / by));
    const origin = { x: (pointer.x - stage.x()) / old, y: (pointer.y - stage.y()) / old };
    setZoom(next);
    setStagePos({ x: pointer.x - origin.x * next, y: pointer.y - origin.y * next });
  }, [zoom]);

  const adjustZoom = (delta: number) => setZoom(prev => Math.max(0.1, Math.min(5, prev + delta)));

  // Stage click — deselect or add polygon vertex
  const handleStageClick = useCallback((e: any) => {
    if (e.target !== e.target.getStage()) return;
    if (tool === "select") {
      setSelectedId(null);
    } else if (tool === "polygon") {
      const pos = stageRef.current.getRelativePointerPosition();
      setPolyPoints(prev => [...prev, { x: pos.x / BASE_PX, y: pos.y / BASE_PX }]);
    }
  }, [tool]);

  // Double-click closes polygon
  const handleStageDblClick = useCallback((e: any) => {
    if (tool !== "polygon") return;
    if (polyPoints.length < 3) {
      toast.error("Draw at least 3 points to close a polygon.");
      return;
    }
    if (!layout) return;
    const id = crypto.randomUUID();
    const newShape: ShapeData = {
      id,
      layout_id: layout.id,
      area_id: null,
      shape_type: "polygon",
      label: null,
      color: "#4ade80",
      x_m: 0,
      y_m: 0,
      width_m: null,
      height_m: null,
      radius_m: null,
      // Remove duplicate last point added by the second click of the dblclick
      points: polyPoints.slice(0, -1),
      rotation: 0,
      z_index: shapesRef.current.length,
      dashed: false,
      extrude_m: 0.3,
      // "curve-bed" preset id signals the renderer to apply tension (Wave 4A)
      preset_id: polygonSmoothed ? "curve-bed" : null,
    };
    recordHistory();
    setShapes(prev => [...prev, newShape]);
    setSelectedId(id);
    setPolyPoints([]);
    setPointerPos(null);
    setPolygonSmoothed(false);
    setTool("select");
    triggerSave();
  }, [tool, polyPoints, layout, triggerSave, polygonSmoothed, recordHistory]);

  // Manual pan — mousedown on bare stage background starts it
  const handleStageMouseDown = useCallback((e: any) => {
    if (e.target !== e.target.getStage()) return;
    if (tool === "polygon") return;
    if (tool === "draw") {
      const pos = stageRef.current.getRelativePointerPosition();
      const pt = { x: pos.x / BASE_PX, y: pos.y / BASE_PX };
      setDrawStart(pt);
      setDrawCurrent(pt);
      return;
    }
    // Pan canvas only in rotate (view) mode; in move mode background click starts marquee select.
    if (interactionMode === "rotate") {
      isPanningRef.current = true;
      panStartRef.current = { x: e.evt.clientX, y: e.evt.clientY };
      return;
    }
    if (interactionMode === "move" && tool === "select") {
      const pos = stageRef.current.getRelativePointerPosition();
      if (pos) {
        setMarquee({ x1: pos.x / BASE_PX, y1: pos.y / BASE_PX, x2: pos.x / BASE_PX, y2: pos.y / BASE_PX });
      }
    }
  }, [tool, interactionMode]);

  const handleStageMouseMove = useCallback((e: any) => {
    if (isPanningRef.current) {
      const dx = e.evt.clientX - panStartRef.current.x;
      const dy = e.evt.clientY - panStartRef.current.y;
      panStartRef.current = { x: e.evt.clientX, y: e.evt.clientY };
      setStagePos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }
    if (tool === "polygon") {
      const pos = stageRef.current?.getRelativePointerPosition();
      if (pos) setPointerPos({ x: pos.x / BASE_PX, y: pos.y / BASE_PX });
    }
    if (tool === "draw" && drawStart) {
      const pos = stageRef.current?.getRelativePointerPosition();
      if (pos) setDrawCurrent({ x: pos.x / BASE_PX, y: pos.y / BASE_PX });
    }
    if (marquee) {
      const pos = stageRef.current?.getRelativePointerPosition();
      if (pos) setMarquee(prev => prev ? { ...prev, x2: pos.x / BASE_PX, y2: pos.y / BASE_PX } : prev);
    }
  }, [tool, drawStart, marquee]);

  const handleStageMouseUp = useCallback(() => {
    isPanningRef.current = false;
    if (tool === "draw" && drawStart && drawCurrent) {
      commitDraw(drawStart, drawCurrent);
    }
    if (marquee) {
      const x1 = Math.min(marquee.x1, marquee.x2);
      const y1 = Math.min(marquee.y1, marquee.y2);
      const x2 = Math.max(marquee.x1, marquee.x2);
      const y2 = Math.max(marquee.y1, marquee.y2);
      const minDim = 0.2;
      if (x2 - x1 > minDim || y2 - y1 > minDim) {
        const hits: string[] = [];
        for (const s of shapesRef.current) {
          const b = getShapeBounds(s);
          if (!b) continue;
          // Intersect test: any overlap with marquee.
          if (b.maxX >= x1 && b.minX <= x2 && b.maxY >= y1 && b.minY <= y2) {
            hits.push(s.id);
          }
        }
        if (hits.length > 0) {
          setSelectedId(hits[0]);
          setExtraSelection(new Set(hits.slice(1)));
        } else {
          setSelectedId(null);
          setExtraSelection(new Set());
        }
      } else {
        // Treat as a plain click → deselect
        setSelectedId(null);
        setExtraSelection(new Set());
      }
      setMarquee(null);
    }
  }, [tool, drawStart, drawCurrent, commitDraw, marquee]);

  // Touch: single finger = pan, two fingers = pinch-zoom
  const handleTouchStart = useCallback((e: any) => {
    const touches = e.evt.touches;
    if (touches.length === 1 && tool === "draw") {
      const pos = stageRef.current.getRelativePointerPosition();
      const pt = { x: pos.x / BASE_PX, y: pos.y / BASE_PX };
      setDrawStart(pt);
      setDrawCurrent(pt);
      return;
    }
    if (touches.length === 1 && tool !== "polygon" && interactionMode === "rotate") {
      isPanningRef.current = true;
      panStartRef.current = { x: touches[0].clientX, y: touches[0].clientY };
    }
    if (touches.length === 2) {
      isPanningRef.current = false;
      lastTouchDistRef.current = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
    }
  }, [tool, interactionMode]);

  const handleTouchMove = useCallback((e: any) => {
    e.evt.preventDefault();
    const touches = e.evt.touches;
    if (touches.length === 1 && tool === "draw" && drawStart) {
      const pos = stageRef.current?.getRelativePointerPosition();
      if (pos) setDrawCurrent({ x: pos.x / BASE_PX, y: pos.y / BASE_PX });
      return;
    }
    if (touches.length === 1 && isPanningRef.current) {
      const dx = touches[0].clientX - panStartRef.current.x;
      const dy = touches[0].clientY - panStartRef.current.y;
      panStartRef.current = { x: touches[0].clientX, y: touches[0].clientY };
      setStagePos(prev => ({ x: prev.x + dx, y: prev.y + dy }));
    }
    if (touches.length === 2 && lastTouchDistRef.current !== null) {
      const dist = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
      const scale = dist / lastTouchDistRef.current;
      lastTouchDistRef.current = dist;
      setZoom(prev => Math.max(0.1, Math.min(5, prev * scale)));
    }
  }, [tool, drawStart]);

  const handleTouchEnd = useCallback(() => {
    isPanningRef.current = false;
    lastTouchDistRef.current = null;
    if (tool === "draw" && drawStart && drawCurrent) {
      commitDraw(drawStart, drawCurrent);
    }
  }, [tool, drawStart, drawCurrent, commitDraw]);

  const saveSettings = async () => {
    if (!layoutId || !layout) return;
    try {
      const { error } = await supabase.from("garden_layouts").update({
        name: settingName.trim() || layout.name,
        canvas_w_m: settingW,
        canvas_h_m: settingH,
        north_offset_deg: settingNorthOffset,
        updated_at: new Date().toISOString(),
      }).eq("id", layoutId);
      if (error) throw error;
      setLayout(l => l ? { ...l, name: settingName.trim() || l.name, canvas_w_m: settingW, canvas_h_m: settingH, north_offset_deg: settingNorthOffset } : l);
      setNorthOffset(settingNorthOffset);
      setShowSettings(false);
    } catch (err) {
      Logger.error("Failed to save canvas settings", err);
      toast.error("Could not save settings.");
    }
  };

  // Shape renderer
  const renderShape = (shape: ShapeData) => {
    const isSel = shape.id === selectedId;
    const isExtra = extraSelection.has(shape.id);
    const dimmedByFilter = activePlanFilter !== null && shape.plan_id !== activePlanFilter;
    const shapeClick = (e: any) => {
      if (viewOnly) {
        // Read-only viewer: a tap selects the shape for the info card only.
        e.cancelBubble = true;
        setSelectedId(shape.id);
        setExtraSelection(new Set());
        return;
      }
      if (interactionMode === "rotate") return; // no selection while navigating
      if (dimmedByFilter) return; // suppress selection while a different plan is filtered
      e.cancelBubble = true;
      const shiftHeld = e.evt?.shiftKey;
      if (shiftHeld) {
        // Shift+click toggles secondary selection without disturbing the primary.
        setExtraSelection((prev) => {
          const next = new Set(prev);
          if (next.has(shape.id) || shape.id === selectedId) next.delete(shape.id);
          else next.add(shape.id);
          return next;
        });
        return;
      }
      setSelectedId(shape.id);
      setExtraSelection(new Set());
    };

    const onTransformEnd = (e: any) => {
      const node = e.target;
      const sx = node.scaleX(), sy = node.scaleY();
      node.scaleX(1);
      node.scaleY(1);
      if (shape.shape_type === "circle") {
        const r = Math.max(0.05, snap((shape.radius_m ?? 0.5) * Math.max(sx, sy)));
        node.radius(r * BASE_PX);
        updateShape(shape.id, { radius_m: r, rotation: node.rotation(), x_m: snap(node.x() / BASE_PX), y_m: snap(node.y() / BASE_PX) });
      } else if (shape.shape_type === "ellipse") {
        const rx = Math.max(0.05, snap((shape.width_m ?? 2) / 2 * sx));
        const ry = Math.max(0.05, snap((shape.height_m ?? 1) / 2 * sy));
        node.radiusX(rx * BASE_PX);
        node.radiusY(ry * BASE_PX);
        updateShape(shape.id, { width_m: rx * 2, height_m: ry * 2, rotation: node.rotation(), x_m: snap(node.x() / BASE_PX), y_m: snap(node.y() / BASE_PX) });
      } else {
        const w = Math.max(0.1, snap((shape.width_m ?? 1) * sx));
        const h = Math.max(0.1, snap((shape.height_m ?? 1) * sy));
        node.width(w * BASE_PX);
        node.height(h * BASE_PX);
        updateShape(shape.id, { width_m: w, height_m: h, rotation: node.rotation(), x_m: snap(node.x() / BASE_PX), y_m: snap(node.y() / BASE_PX) });
      }
    };

    const onShapePointerDown = () => {
      if (interactionMode === "move" && shape.area_id) startLongPress(shape);
    };
    const onShapePointerUp = () => cancelLongPress();
    const onShapeDragStart = () => cancelLongPress();
    const onShapeContextMenu = (e: any) => {
      if (interactionMode === "rotate" || dimmedByFilter) return;
      e.evt.preventDefault();
      e.cancelBubble = true;
      setSelectedId(shape.id);
      setExtraSelection(new Set());
      setContextMenu({ x: e.evt.clientX, y: e.evt.clientY, shape });
    };

    const sharedDrag = {
      draggable: interactionMode === "move" && tool === "select",
      onDragStart: onShapeDragStart,
      onDragMove: (e: any) => {
        // Build a hypothetical shape at the current drag position and compute guides.
        const newX = e.target.x() / BASE_PX;
        const newY = e.target.y() / BASE_PX;
        const draggedAtNew: ShapeData = (() => {
          if (shape.shape_type === "polygon" && shape.points) {
            return { ...shape, x_m: newX, y_m: newY };
          }
          return { ...shape, x_m: newX, y_m: newY };
        })();
        const draggedBounds = getShapeBounds(draggedAtNew);
        if (!draggedBounds) { setDragGuides([]); return; }
        const others = shapesRef.current.filter((s) => s.id !== shape.id);
        setDragGuides(computeAlignmentGuides(draggedBounds, others));
      },
      onDragEnd: (e: any) => {
        setDragGuides([]);
        updateShape(shape.id, { x_m: snap(e.target.x() / BASE_PX), y_m: snap(e.target.y() / BASE_PX) });
      },
      onTransformEnd,
      onMouseDown: onShapePointerDown,
      onTouchStart: onShapePointerDown,
      onMouseUp: onShapePointerUp,
      onTouchEnd: onShapePointerUp,
      onMouseLeave: onShapePointerUp,
      onContextMenu: onShapeContextMenu,
    };

    // Dashed shapes (boundaries, canopies) get a very light fill so interior remains visible
    const fillAlpha = dimmedByFilter ? "33" : shape.dashed ? "22" : "bb";
    const strokeAlphaMul = dimmedByFilter ? 0.35 : 1;
    const fill = shape.color + fillAlpha;
    const stroke = isExtra ? "#3b82f6" : shape.color + (strokeAlphaMul < 1 ? "55" : "");
    const sw = isSel ? 2.5 : isExtra ? 2.5 : 1.5;
    const dashProp = shape.dashed ? [8, 5] : isExtra ? [6, 4] : undefined;

    // Soft drop shadow (Wave 2D) — solid shapes get a subtle lift; selected shapes get a stronger one.
    // Dashed boundaries / canopies stay flat so they read as outlines.
    const useShadow = !shape.dashed && !dimmedByFilter;
    const shadowProps = useShadow ? {
      shadowColor: "rgba(60, 40, 20, 0.35)",
      shadowBlur: isSel ? 8 : 4,
      shadowOffsetY: isSel ? 3 : 2,
      shadowOpacity: 1,
    } : {};

    let node: React.ReactNode = null;
    let labelX = 0, labelY = 0;

    if (shape.shape_type === "rect" || shape.shape_type === "path") {
      const w = (shape.width_m ?? 1) * BASE_PX, h = (shape.height_m ?? 1) * BASE_PX;
      labelX = shape.x_m * BASE_PX + w / 2;
      labelY = shape.y_m * BASE_PX + h / 2;
      node = (
        <Rect
          id={shape.id}
          x={shape.x_m * BASE_PX}
          y={shape.y_m * BASE_PX}
          width={w}
          height={h}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          rotation={shape.rotation}
          cornerRadius={3}
          dash={dashProp}
          {...shadowProps}
          onClick={shapeClick}
          onTap={shapeClick}
          {...sharedDrag}
        />
      );
    } else if (shape.shape_type === "circle") {
      const r = (shape.radius_m ?? 0.5) * BASE_PX;
      labelX = shape.x_m * BASE_PX;
      labelY = shape.y_m * BASE_PX;
      node = (
        <Circle
          id={shape.id}
          x={shape.x_m * BASE_PX}
          y={shape.y_m * BASE_PX}
          radius={r}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          rotation={shape.rotation}
          dash={dashProp}
          {...shadowProps}
          onClick={shapeClick}
          onTap={shapeClick}
          {...sharedDrag}
        />
      );
    } else if (shape.shape_type === "ellipse") {
      const rx = (shape.width_m ?? 2) / 2 * BASE_PX;
      const ry = (shape.height_m ?? 1) / 2 * BASE_PX;
      labelX = shape.x_m * BASE_PX;
      labelY = shape.y_m * BASE_PX;
      node = (
        <Ellipse
          id={shape.id}
          x={shape.x_m * BASE_PX}
          y={shape.y_m * BASE_PX}
          radiusX={rx}
          radiusY={ry}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          rotation={shape.rotation}
          dash={dashProp}
          {...shadowProps}
          onClick={shapeClick}
          onTap={shapeClick}
          {...sharedDrag}
        />
      );
    } else if (shape.shape_type === "polygon") {
      const pts = (shape.points ?? []).flatMap(p => [
        (shape.x_m + p.x) * BASE_PX,
        (shape.y_m + p.y) * BASE_PX,
      ]);
      if (pts.length < 4) return null;
      const tension = shape.preset_id === "curve-bed" ? 0.5 : 0;
      node = (
        <Line
          id={shape.id}
          x={0}
          y={0}
          points={pts}
          closed
          tension={tension}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          rotation={shape.rotation}
          dash={dashProp}
          {...shadowProps}
          draggable={interactionMode === "move" && tool === "select"}
          onClick={shapeClick}
          onTap={shapeClick}
          onDragEnd={(e: any) => {
            const dx = e.target.x() / BASE_PX;
            const dy = e.target.y() / BASE_PX;
            e.target.x(0);
            e.target.y(0);
            updateShape(shape.id, {
              points: (shape.points ?? []).map(p => ({ x: p.x + dx, y: p.y + dy })),
            });
          }}
        />
      );
      // centroid label for polygon
      if (shape.points && shape.points.length > 0) {
        const cx = shape.points.reduce((s, p) => s + p.x, 0) / shape.points.length;
        const cy = shape.points.reduce((s, p) => s + p.y, 0) / shape.points.length;
        labelX = (shape.x_m + cx) * BASE_PX;
        labelY = (shape.y_m + cy) * BASE_PX;
      }
    }

    if (!node) return null;

    // Per-preset decoration overlay (Wave 2B) — wood frames, ripples, stone pattern, planks…
    const decorations = !dimmedByFilter ? getShapeDecorations(shape, BASE_PX) : null;

    // Always-visible dimension label (Wave 6A) — small text under the shape at sufficient zoom.
    let dimensionText: string | null = null;
    let dimensionX = 0, dimensionY = 0;
    if (zoom >= 0.6 && !shape.dashed) {
      const fmt = (n: number) => (n >= 10 ? n.toFixed(0) : n.toFixed(1));
      if (shape.shape_type === "rect" || shape.shape_type === "path" || shape.shape_type === "ellipse") {
        const w = shape.width_m ?? 0;
        const h = shape.height_m ?? 0;
        if (w > 0 && h > 0) {
          dimensionText = `${fmt(w)} × ${fmt(h)} m`;
          if (shape.shape_type === "rect" || shape.shape_type === "path") {
            dimensionX = shape.x_m * BASE_PX + (w * BASE_PX) / 2;
            dimensionY = shape.y_m * BASE_PX + h * BASE_PX + 4;
          } else {
            dimensionX = shape.x_m * BASE_PX;
            dimensionY = shape.y_m * BASE_PX + (h / 2) * BASE_PX + 4;
          }
        }
      } else if (shape.shape_type === "circle") {
        const r = shape.radius_m ?? 0;
        if (r > 0) {
          dimensionText = `r ${fmt(r)} m`;
          dimensionX = shape.x_m * BASE_PX;
          dimensionY = shape.y_m * BASE_PX + r * BASE_PX + 4;
        }
      }
    }

    // ── Live-state overlays (Wave 7): plant tokens, task indicator, ailment ring ──
    const linkedPlants = shape.area_id ? (areaPlants[shape.area_id] ?? []) : [];
    const taskCounts = shape.area_id ? areaTaskCounts[shape.area_id] : undefined;
    const ailment = shape.area_id ? areaAilmentSeverity[shape.area_id] : undefined;

    // Atmospheric overlay tint colours (Wave 11A + pH/Moisture follow-up)
    let overlayTint: string | null = null;
    if (showFrostOverlay && forecast.length > 0) {
      const worstMin = Math.min(...forecast.slice(0, 7).map((d) => d.temp_min_c));
      const risk = classifyFrostRisk(worstMin);
      overlayTint = risk === "Severe" ? "#dc262640"
        : risk === "Moderate" ? "#f9731640"
        : risk === "Mild" ? "#fbbf2440"
        : "#94a3b833";
    } else if (showWindOverlay) {
      const expo = computeWindExposure(shape, shapes);
      overlayTint = expo === "Exposed" ? "#ef444440"
        : expo === "Partly Sheltered" ? "#fbbf2440"
        : "#10b98140";
    } else if (showPhOverlay && shape.area_id) {
      const phValue = areaPh[shape.area_id];
      if (phValue != null) {
        // Acidic (red) → neutral (grey) → alkaline (blue)
        if (phValue < 5.5) overlayTint = "#dc262640";
        else if (phValue < 6.5) overlayTint = "#fbbf2440";
        else if (phValue <= 7.5) overlayTint = "#94a3b833";
        else if (phValue <= 8.0) overlayTint = "#7dd3fc40";
        else overlayTint = "#3b82f640";
      }
    } else if (showMoistureOverlay && shape.area_id) {
      const m = areaMoisture[shape.area_id];
      if (m != null) {
        // 0-30 = dry (amber), 30-60 = ideal (green), 60+ = wet (blue)
        if (m < 30) overlayTint = "#fbbf2440";
        else if (m < 60) overlayTint = "#10b98140";
        else overlayTint = "#3b82f640";
      }
    }

    // Sun-fit summary (Wave 8C) — only when overlay/results are available
    let sunFitSummary: "fit" | "mixed" | "mismatch" | "unknown" = "unknown";
    if (linkedPlants.length > 0 && sunAnalysisResults) {
      const shapeSun = sunAnalysisResults.find((r) => r.shapeId === shape.id);
      if (shapeSun) {
        const fits = linkedPlants.map((p) => getPlantSunFit(parsePlantSunPreference(p.sunlight), shapeSun.classification));
        sunFitSummary = getShapeFitSummary(fits);
      }
    }

    // Bounding box for tokens — derive from shape geometry in metres
    let bboxX = shape.x_m, bboxY = shape.y_m, bboxW = 0, bboxH = 0;
    if (shape.shape_type === "rect" || shape.shape_type === "path") {
      bboxW = shape.width_m ?? 1; bboxH = shape.height_m ?? 1;
    } else if (shape.shape_type === "circle") {
      const r = shape.radius_m ?? 0.5;
      bboxX = shape.x_m - r; bboxY = shape.y_m - r; bboxW = 2 * r; bboxH = 2 * r;
    } else if (shape.shape_type === "ellipse") {
      const w = shape.width_m ?? 2; const h = shape.height_m ?? 1;
      bboxX = shape.x_m - w / 2; bboxY = shape.y_m - h / 2; bboxW = w; bboxH = h;
    } else if (shape.shape_type === "polygon" && shape.points && shape.points.length > 0) {
      const xs = shape.points.map(p => p.x); const ys = shape.points.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      bboxX = shape.x_m + minX; bboxY = shape.y_m + minY;
      bboxW = maxX - minX; bboxH = maxY - minY;
    }

    const showTokens = linkedPlants.length > 0 && bboxW > 0.3 && bboxH > 0.3 && !shape.dashed;
    const tokensToShow = Math.min(linkedPlants.length, MAX_VISIBLE_TOKENS);
    const tokenGrid = showTokens ? computeTokenGrid(tokensToShow, bboxW, bboxH) : null;

    return (
      <React.Fragment key={shape.id}>
        {/* Ailment ring — rendered under the shape so it appears as an outline halo */}
        {ailment && (shape.shape_type === "rect" || shape.shape_type === "path") && (
          <Rect
            x={shape.x_m * BASE_PX - 4}
            y={shape.y_m * BASE_PX - 4}
            width={(shape.width_m ?? 1) * BASE_PX + 8}
            height={(shape.height_m ?? 1) * BASE_PX + 8}
            stroke={ailment.severity === "severe" ? "#ef4444" : ailment.severity === "moderate" ? "#f97316" : "#eab308"}
            strokeWidth={3}
            cornerRadius={5}
            dash={[6, 4]}
            listening={false}
          />
        )}
        {ailment && shape.shape_type === "circle" && (
          <Circle
            x={shape.x_m * BASE_PX}
            y={shape.y_m * BASE_PX}
            radius={(shape.radius_m ?? 0.5) * BASE_PX + 4}
            stroke={ailment.severity === "severe" ? "#ef4444" : ailment.severity === "moderate" ? "#f97316" : "#eab308"}
            strokeWidth={3}
            dash={[6, 4]}
            listening={false}
          />
        )}
        {ailment && shape.shape_type === "ellipse" && (
          <Ellipse
            x={shape.x_m * BASE_PX}
            y={shape.y_m * BASE_PX}
            radiusX={(shape.width_m ?? 2) / 2 * BASE_PX + 4}
            radiusY={(shape.height_m ?? 1) / 2 * BASE_PX + 4}
            stroke={ailment.severity === "severe" ? "#ef4444" : ailment.severity === "moderate" ? "#f97316" : "#eab308"}
            strokeWidth={3}
            dash={[6, 4]}
            listening={false}
          />
        )}

        {node}

        {/* Material-aware decorations (Wave 2B) */}
        {decorations}

        {/* Frost / wind tint overlay (Wave 11A) — drawn above shape but below tokens */}
        {overlayTint && bboxW > 0 && bboxH > 0 && (
          <Rect
            x={bboxX * BASE_PX}
            y={bboxY * BASE_PX}
            width={bboxW * BASE_PX}
            height={bboxH * BASE_PX}
            fill={overlayTint}
            cornerRadius={4}
            listening={false}
          />
        )}

        {/* Plant tokens overlay — draggable & tap-to-resize when the parent shape is selected */}
        {showTokens && tokenGrid && linkedPlants.slice(0, MAX_VISIBLE_TOKENS).map((plant, i) => {
          const auto = tokenGrid.positions[i];
          if (!auto) return null;
          // Stored position takes precedence over auto-grid layout (both in metres in shape-local coords).
          const px = plant.display_x_m ?? (bboxX + auto.x);
          const py = plant.display_y_m ?? (bboxY + auto.y);
          const customDiameter = plant.display_size_m;
          const diameterM = customDiameter ?? tokenGrid.diameterM;
          const cx = px * BASE_PX;
          const cy = py * BASE_PX;
          const r = diameterM * BASE_PX / 2;
          const color = getPlantTokenColor(plant);
          const initial = getPlantInitial(plant);
          const interactive = isSel && tool === "select" && interactionMode === "move";

          const handleTokenDragEnd = (e: any) => {
            const newCx = e.target.x();
            const newCy = e.target.y();
            // Clamp to shape's bbox (inset slightly so tokens don't fall off the edge).
            const margin = diameterM / 2;
            const clampedX = Math.max(bboxX + margin, Math.min(bboxX + bboxW - margin, newCx / BASE_PX));
            const clampedY = Math.max(bboxY + margin, Math.min(bboxY + bboxH - margin, newCy / BASE_PX));
            e.target.x(clampedX * BASE_PX);
            e.target.y(clampedY * BASE_PX);
            updateTokenPosition(plant.id, clampedX, clampedY);
          };

          const handleTokenClick = (e: any) => {
            e.cancelBubble = true;
            if (!shape.area_id) return;
            setTokenResize({ itemId: plant.id, areaId: shape.area_id, plantName: plant.nickname ?? plant.plant_name, size: diameterM, height: plant.display_height_m ?? 0 });
          };

          return (
            <React.Fragment key={`tk-${plant.id}`}>
              <Circle
                x={cx} y={cy} radius={r}
                fill={color}
                stroke="#ffffff"
                strokeWidth={1.5}
                shadowColor="rgba(0,0,0,0.25)"
                shadowBlur={3}
                shadowOffsetY={1}
                listening={interactive}
                draggable={interactive}
                onClick={interactive ? handleTokenClick : undefined}
                onTap={interactive ? handleTokenClick : undefined}
                onDragEnd={handleTokenDragEnd}
              />
              {r >= 8 && (
                <Text
                  x={cx - r} y={cy - r * 0.55}
                  text={initial}
                  width={r * 2}
                  align="center"
                  fontSize={Math.max(8, r * 1.05)}
                  fontStyle="bold"
                  fill="#ffffff"
                  listening={false}
                />
              )}
            </React.Fragment>
          );
        })}

        {/* +N more pill when there are more plants than we can show */}
        {showTokens && linkedPlants.length > MAX_VISIBLE_TOKENS && (
          <Text
            x={(bboxX + bboxW) * BASE_PX - 28}
            y={(bboxY + bboxH) * BASE_PX - 14}
            text={`+${linkedPlants.length - MAX_VISIBLE_TOKENS}`}
            fontSize={10}
            fontStyle="bold"
            fill="rgba(0,0,0,0.65)"
            listening={false}
          />
        )}

        {/* Task indicator — single dot in upper-right corner */}
        {taskCounts && (taskCounts.overdue > 0 || taskCounts.today > 0) && (
          <Circle
            x={(bboxX + bboxW) * BASE_PX - 6}
            y={bboxY * BASE_PX + 6}
            radius={6}
            fill={taskCounts.overdue > 0 ? "#ef4444" : "#f59e0b"}
            stroke="#ffffff"
            strokeWidth={2}
            listening={false}
          />
        )}

        {/* Sun-fit badge — small glyph in upper-left corner of linked beds (Wave 8C) */}
        {sunFitSummary !== "unknown" && (
          <>
            <Circle
              x={bboxX * BASE_PX + 7}
              y={bboxY * BASE_PX + 7}
              radius={7}
              fill={sunFitSummary === "fit" ? "#16a34a" : sunFitSummary === "mixed" ? "#f59e0b" : "#dc2626"}
              stroke="#ffffff"
              strokeWidth={1.5}
              listening={false}
            />
            <Text
              x={bboxX * BASE_PX + 1.5}
              y={bboxY * BASE_PX + 2}
              text={sunFitSummary === "fit" ? "✓" : sunFitSummary === "mixed" ? "~" : "!"}
              width={11}
              align="center"
              fontSize={9}
              fontStyle="bold"
              fill="#ffffff"
              listening={false}
            />
          </>
        )}

        {shape.label && (
          <Text
            x={labelX}
            y={labelY - 6}
            text={shape.label}
            fontSize={11}
            fontStyle="bold"
            fill="rgba(0,0,0,0.7)"
            align="center"
            offsetX={shape.label.length * 3.2}
            listening={false}
          />
        )}
        {dimensionText && (
          <Text
            x={dimensionX}
            y={dimensionY}
            text={dimensionText}
            fontSize={9}
            fontStyle="bold"
            fill="rgba(0,0,0,0.45)"
            align="center"
            offsetX={dimensionText.length * 2.6}
            listening={false}
          />
        )}
      </React.Fragment>
    );
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-rhozly-primary" />
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="font-bold text-rhozly-on-surface/50">Layout not found.</p>
      </div>
    );
  }

  const selectedShape = shapes.find(s => s.id === selectedId) ?? null;

  return (
    <div className="h-full flex flex-col relative">
      <GardenEditorToolbar
        layout={layout}
        homeId={homeId}
        saveState={saveState}
        canEdit={canEdit && !viewOnly}
        viewOnly={viewOnly}
        isMobile={isMobile}
        interactionMode={interactionMode}
        onModeChange={handleModeChange}
        viewMode={viewMode}
        setViewMode={setViewMode}
        homeLatLng={homeLatLng}
        setHomeLatLng={setHomeLatLng}
        sunDate={sunDate}
        setSunDate={setSunDate}
        sunMinutes={sunMinutes}
        setSunMinutes={setSunMinutes}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        showLuxOverlay={showLuxOverlay}
        setShowLuxOverlay={setShowLuxOverlay}
        showSunOverlay={showSunOverlay}
        setShowSunOverlay={setShowSunOverlay}
        showCompanionsOverlay={showCompanionsOverlay}
        setShowCompanionsOverlay={setShowCompanionsOverlay}
        showFrostOverlay={showFrostOverlay}
        setShowFrostOverlay={setShowFrostOverlay}
        showWindOverlay={showWindOverlay}
        setShowWindOverlay={setShowWindOverlay}
        showPhOverlay={showPhOverlay}
        setShowPhOverlay={setShowPhOverlay}
        showMoistureOverlay={showMoistureOverlay}
        setShowMoistureOverlay={setShowMoistureOverlay}
        adjustZoom={adjustZoom}
        onBack={() => navigate("/garden-layout")}
        onOpenSettings={() => { setShowSettings(true); setCompassReadState("idle"); }}
        onUndo={undo}
        onRedo={redo}
        canUndo={historyRef.current.past.length > 0}
        canRedo={historyRef.current.future.length > 0}
        snapToGrid={snapToGrid}
        setSnapToGrid={setSnapToGrid}
      />


      {/* Editor body */}
      <div className={`flex-1 flex overflow-hidden ${isMobile ? "flex-col" : "flex-row"}`}>
        {/* Desktop: shape panel on left */}
        {!isMobile && canEdit && (
          <GardenShapePanel
            tool={tool}
            viewMode={viewMode}
            pendingPresetId={pendingPreset?.id ?? null}
            curveMode={polygonSmoothed}
            onAddPreset={addPreset}
            onStartPolygon={() => { setTool("polygon"); setPolyPoints([]); setSelectedId(null); setPolygonSmoothed(false); }}
            onStartCurve={() => { setTool("polygon"); setPolyPoints([]); setSelectedId(null); setPolygonSmoothed(true); }}
            isMobile={false}
          />
        )}

        {/* Canvas */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden bg-rhozly-bg">
          {/* 3D view */}
          {viewMode === "3d" && (
            <GardenLayout3D
              shapes={shapes}
              selectedId={selectedId}
              canvasW={layout.canvas_w_m}
              canvasH={layout.canvas_h_m}
              northOffset={northOffset}
              interactionMode={interactionMode}
              pendingPreset={pendingPreset}
              homeLatLng={homeLatLng}
              onSelect={id => { if (interactionMode !== "rotate") setSelectedId(id); }}
              onShapeChange={updateShape}
              onDrawShape={commitDraw}
              sunPosition={sunPosition}
              areaPlants={areaPlants}
              areaLuxReadings={areaLuxReadings}
              showLuxOverlay={showLuxOverlay}
              sunAnalysisResults={sunAnalysisResults}
              showSunOverlay={showSunOverlay}
              sunDateObj={sunDateObj}
              selectedTokenId={selectedTokenId}
              onTokenSelect={(itemId) => {
                // Single click just attaches the transform gizmo. The size /
                // height popup opens via the separate "Edit details" button
                // shown in the 3D overlay when a token is selected.
                setSelectedTokenId(itemId);
              }}
              onTokenMove={updateTokenPosition3D}
            />
          )}

          {/* 2D Konva stage — always mounted so containerRef retains its flex height.
              Hidden in 3D mode via visibility so R3F's container measures correctly. */}
          <div style={{ visibility: viewMode === "2d" ? "visible" : "hidden", pointerEvents: viewMode === "2d" ? "auto" : "none" }}>
            <Stage
              ref={stageRef}
              width={containerSize.w}
              height={containerSize.h}
              scaleX={zoom}
              scaleY={zoom}
              x={stagePos.x}
              y={stagePos.y}
              onWheel={handleWheel}
              onClick={handleStageClick}
              onTap={handleStageClick}
              onDblClick={handleStageDblClick}
              onDblTap={handleStageDblClick}
              onMouseDown={handleStageMouseDown}
              onMouseMove={handleStageMouseMove}
              onMouseUp={handleStageMouseUp}
              onMouseLeave={handleStageMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{ cursor: tool === "polygon" || tool === "draw" ? "crosshair" : interactionMode === "rotate" ? "grab" : "default" }}
            >
              <GardenRuler
                canvasWm={layout.canvas_w_m}
                canvasHm={layout.canvas_h_m}
                pxPerM={BASE_PX}
                offsetX={0}
                offsetY={0}
              />

              <Layer>
                {shapes.map(renderShape)}

                {/* Marquee drag-select rectangle */}
                {marquee && (
                  <Rect
                    x={Math.min(marquee.x1, marquee.x2) * BASE_PX}
                    y={Math.min(marquee.y1, marquee.y2) * BASE_PX}
                    width={Math.abs(marquee.x2 - marquee.x1) * BASE_PX}
                    height={Math.abs(marquee.y2 - marquee.y1) * BASE_PX}
                    fill="rgba(59, 130, 246, 0.08)"
                    stroke="#3b82f6"
                    strokeWidth={1}
                    dash={[5, 3]}
                    listening={false}
                  />
                )}

                {/* Smart alignment guides while dragging */}
                {dragGuides.map((g, i) => g.axis === "x" ? (
                  <Line
                    key={`guide-x-${i}`}
                    points={[g.position * BASE_PX, 0, g.position * BASE_PX, (layout.canvas_h_m + 4) * BASE_PX]}
                    stroke="#ec4899"
                    strokeWidth={1}
                    dash={[4, 3]}
                    listening={false}
                  />
                ) : (
                  <Line
                    key={`guide-y-${i}`}
                    points={[0, g.position * BASE_PX, (layout.canvas_w_m + 4) * BASE_PX, g.position * BASE_PX]}
                    stroke="#ec4899"
                    strokeWidth={1}
                    dash={[4, 3]}
                    listening={false}
                  />
                ))}

                {/* Companion overlay — adjacency lines between shapes with plants */}
                {showCompanionsOverlay && companionLines.map((c, i) => (
                  <Line
                    key={`cmp-${i}`}
                    points={[c.from.x * BASE_PX, c.from.y * BASE_PX, c.to.x * BASE_PX, c.to.y * BASE_PX]}
                    stroke={c.relation === "Beneficial" ? "#16a34a" : "#ef4444"}
                    strokeWidth={2.5}
                    dash={[6, 4]}
                    listening={false}
                  />
                ))}

                {/* Draw-mode ghost — shows shape size as user drags */}
                {tool === "draw" && drawStart && drawCurrent && pendingPreset && (() => {
                  const x1 = Math.min(drawStart.x, drawCurrent.x) * BASE_PX;
                  const y1 = Math.min(drawStart.y, drawCurrent.y) * BASE_PX;
                  const w  = Math.abs(drawCurrent.x - drawStart.x) * BASE_PX;
                  const h  = Math.abs(drawCurrent.y - drawStart.y) * BASE_PX;
                  const cx = (drawStart.x + drawCurrent.x) / 2 * BASE_PX;
                  const cy = (drawStart.y + drawCurrent.y) / 2 * BASE_PX;
                  const r  = Math.min(w, h) / 2;
                  if (w < 2 && h < 2) return null;
                  const fill = pendingPreset.color + "55";
                  const stroke = pendingPreset.color;
                  if (pendingPreset.shapeType === "circle") {
                    return <Circle x={cx} y={cy} radius={r} fill={fill} stroke={stroke} strokeWidth={1.5} dash={[5,3]} listening={false} />;
                  }
                  if (pendingPreset.shapeType === "ellipse") {
                    return <Ellipse x={cx} y={cy} radiusX={w/2} radiusY={h/2} fill={fill} stroke={stroke} strokeWidth={1.5} dash={[5,3]} listening={false} />;
                  }
                  return <Rect x={x1} y={y1} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={1.5} dash={[5,3]} listening={false} />;
                })()}

                {/* In-progress polygon preview */}
                {tool === "polygon" && polyPoints.length > 0 && (() => {
                  const preview = [
                    ...polyPoints.flatMap(p => [p.x * BASE_PX, p.y * BASE_PX]),
                    ...(pointerPos ? [pointerPos.x * BASE_PX, pointerPos.y * BASE_PX] : []),
                  ];
                  return (
                    <>
                      <Line points={preview} stroke="#4ade80" strokeWidth={1.5} dash={[5, 3]} listening={false} />
                      {polyPoints.map((p, i) => (
                        <Circle
                          key={`pv-${i}`}
                          x={p.x * BASE_PX}
                          y={p.y * BASE_PX}
                          radius={4}
                          fill={i === 0 ? "#22c55e" : "#fff"}
                          stroke="#4ade80"
                          strokeWidth={1.5}
                          listening={false}
                        />
                      ))}
                    </>
                  );
                })()}

                <Transformer
                  ref={transformerRef}
                  keepRatio={false}
                  rotateEnabled
                  rotateAnchorOffset={24}
                  rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                  anchorSize={10}
                  anchorCornerRadius={2}
                  anchorFill="#fff"
                  anchorStroke="#3b82f6"
                  anchorStrokeWidth={1.5}
                  borderStroke="#3b82f6"
                  borderStrokeWidth={1.5}
                  borderDash={[4, 3]}
                  boundBoxFunc={(oldBox: any, newBox: any) =>
                    newBox.width < 5 || newBox.height < 5 ? oldBox : newBox
                  }
                />
              </Layer>
            </Stage>
          </div>

          {/* 3D selected-token control bar — only visible when a plant token is selected in 3D mode */}
          {viewMode === "3d" && selectedTokenId && (() => {
            const selectedPlant = Object.values(areaPlants).flat().find((p) => p.id === selectedTokenId);
            if (!selectedPlant) return null;
            let areaId: string | null = null;
            for (const [aid, list] of Object.entries(areaPlants)) {
              if (list.some(p => p.id === selectedTokenId)) { areaId = aid; break; }
            }
            return (
              <div
                data-testid="token3d-control-bar"
                className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-rhozly-outline/15 px-3 py-1.5 animate-in fade-in slide-in-from-top-2 duration-200"
              >
                <div className="min-w-0 max-w-[180px]">
                  <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Editing token</p>
                  <p className="text-xs font-black text-rhozly-on-surface truncate">{selectedPlant.nickname ?? selectedPlant.plant_name}</p>
                </div>
                <button
                  data-testid="token3d-edit-btn"
                  onClick={() => {
                    if (!areaId) return;
                    setTokenResize({
                      itemId: selectedPlant.id,
                      areaId,
                      plantName: selectedPlant.nickname ?? selectedPlant.plant_name,
                      size: selectedPlant.display_size_m ?? 0.3,
                      height: selectedPlant.display_height_m ?? 0,
                    });
                  }}
                  className="min-h-[36px] px-3 rounded-xl bg-rhozly-primary text-white text-[11px] font-black uppercase tracking-widest"
                >
                  Size / Height
                </button>
                <button
                  data-testid="token3d-deselect-btn"
                  onClick={() => setSelectedTokenId(null)}
                  aria-label="Done"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-rhozly-on-surface/50 hover:bg-rhozly-surface"
                >
                  <X size={16} />
                </button>
              </div>
            );
          })()}

          {/* Plan filter chip — floating top-left of canvas */}
          <div className="absolute top-3 left-3 z-20" data-testid="canvas-plan-filter">
            <PlanFilterChip
              homeId={homeId}
              value={activePlanFilter}
              onChange={setActivePlanFilter}
            />
          </div>

          {/* Microclimate + Zones + Templates launchers — floating top-right of canvas */}
          {!isMobile && (
            <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
              <button
                data-testid="templates-launch-btn"
                onClick={() => setShowTemplatesSheet(true)}
                className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-white shadow-md border border-rhozly-outline/15 text-xs font-black text-rhozly-on-surface/70 hover:text-rhozly-on-surface transition-colors"
              >
                Templates
              </button>
              <button
                data-testid="zones-launch-btn"
                onClick={() => setShowZoneSheet(true)}
                className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-white shadow-md border border-rhozly-outline/15 text-xs font-black text-rhozly-on-surface/70 hover:text-rhozly-on-surface transition-colors"
              >
                Zones
              </button>
              <button
                data-testid="microclimate-report-btn"
                onClick={() => setShowMicroclimate(true)}
                className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-white shadow-md border border-rhozly-outline/15 text-xs font-black text-rhozly-on-surface/70 hover:text-rhozly-on-surface transition-colors"
              >
                Microclimate
              </button>
              {viewMode === "2d" && (
                <button
                  data-testid="export-png-btn"
                  onClick={exportPng}
                  title="Download a PNG of this layout"
                  className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-white shadow-md border border-rhozly-outline/15 text-xs font-black text-rhozly-on-surface/70 hover:text-rhozly-on-surface transition-colors"
                >
                  Export
                </button>
              )}
              <button
                data-testid="share-link-btn"
                onClick={handleShareLink}
                title="Get a public link for this layout"
                className="flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl bg-white shadow-md border border-rhozly-outline/15 text-xs font-black text-rhozly-on-surface/70 hover:text-rhozly-on-surface transition-colors"
              >
                Share
              </button>
            </div>
          )}

          {/* Scale bar + polygon instructions — 2D only */}
          {viewMode === "2d" && <GardenScaleBar pxPerM={BASE_PX * zoom} zoom={zoom} />}

          {/* Compass overlay — 2D only. Tap to open the focused Set North sheet (Wave 6B). */}
          {viewMode === "2d" && (
            <button
              data-testid="canvas-compass-overlay"
              onClick={canEdit ? () => setShowNorthSheet(true) : undefined}
              disabled={!canEdit}
              aria-label="Adjust North orientation"
              className="absolute bottom-4 left-4 z-10 bg-white/85 backdrop-blur-sm rounded-2xl p-1.5 shadow-md border border-rhozly-outline/10 hover:bg-white transition-colors disabled:cursor-default"
            >
              <GardenCompass value={northOffset} size={64} readOnly />
            </button>
          )}

          {/* Read-only viewer: shape info card (tap a shape) + view-only note */}
          {viewOnly && selectedShape && (
            <div
              data-testid="viewonly-shape-card"
              className="absolute inset-x-3 z-30 bg-white rounded-2xl shadow-xl border border-rhozly-outline/20 p-4 flex items-start gap-3"
              style={{ bottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
            >
              <span
                className="w-4 h-4 rounded-md shrink-0 mt-0.5 border border-black/10"
                style={{ backgroundColor: selectedShape.color }}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <p className="font-black text-rhozly-on-surface text-sm truncate">{selectedShape.label || "Unnamed shape"}</p>
                <p className="text-xs font-bold text-rhozly-on-surface/50">
                  {selectedShape.shape_type === "circle"
                    ? `Circle · ${(selectedShape.radius_m ?? 0) * 2}m across`
                    : selectedShape.shape_type === "polygon"
                      ? "Custom shape"
                      : `${selectedShape.width_m ?? "?"}m × ${selectedShape.height_m ?? "?"}m`}
                  {selectedShape.area_id ? " · linked to an area" : ""}
                </p>
              </div>
              <button
                data-testid="viewonly-shape-card-close"
                onClick={() => setSelectedId(null)}
                aria-label="Close shape info"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:bg-rhozly-surface-low"
              >
                <X size={16} />
              </button>
            </div>
          )}

          {/* First-shape coach mark — only when canvas is empty (Wave 4C) */}
          {viewMode === "2d" && canEdit && !viewOnly && shapes.length === 0 && tool === "select" && !pendingPreset && (
            <div
              data-testid="first-shape-coach"
              className="absolute inset-x-0 top-1/3 z-10 pointer-events-none flex justify-center animate-in fade-in slide-in-from-top-2 duration-700"
            >
              <div className="bg-white/95 backdrop-blur-sm rounded-3xl px-5 py-4 shadow-lg border border-rhozly-outline/20 max-w-sm mx-4 text-center">
                <p className="text-[10px] font-black text-rhozly-primary uppercase tracking-widest mb-1">
                  Welcome to your garden
                </p>
                <p className="text-sm font-bold text-rhozly-on-surface leading-snug">
                  {isMobile
                    ? "Pick a shape from the rail below and drag on the canvas to place it."
                    : "Pick a shape from the panel on the left, then drag on the canvas to place it."}
                </p>
              </div>
            </div>
          )}

          {viewMode === "2d" && tool === "draw" && (
            <>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-2 border border-rhozly-outline/20 shadow-sm pointer-events-none">
                <p className="text-xs font-black text-rhozly-on-surface/70">
                  {pendingPreset?.label ?? "Shape"} — click and drag to place
                </p>
              </div>
              <button
                data-testid="cancel-draw-btn"
                onClick={() => { setPendingPreset(null); setDrawStart(null); setDrawCurrent(null); setTool("select"); setInteractionMode("move"); }}
                aria-label="Cancel drawing"
                className="absolute top-4 right-4 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white border border-rhozly-outline/20 shadow-sm text-rhozly-on-surface/60 hover:text-rhozly-on-surface transition-colors"
              >
                <X size={18} />
              </button>
            </>
          )}

          {viewMode === "2d" && tool === "polygon" && (
            <>
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-2 border border-rhozly-outline/20 shadow-sm pointer-events-none">
                <p className="text-xs font-black text-rhozly-on-surface/70">
                  {polyPoints.length === 0
                    ? "Click to start drawing"
                    : `${polyPoints.length} vertices — double-click to close`}
                </p>
              </div>
              <button
                data-testid="cancel-polygon-btn"
                onClick={() => { setTool("select"); setPolyPoints([]); setPointerPos(null); }}
                aria-label="Cancel polygon"
                className="absolute top-4 right-4 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white border border-rhozly-outline/20 shadow-sm text-rhozly-on-surface/60 hover:text-rhozly-on-surface transition-colors"
              >
                <X size={18} />
              </button>
            </>
          )}
        </div>

        {/* Desktop: properties panel on right (when shape selected) */}
        {!isMobile && selectedShape && (
          <GardenShapeProperties
            shape={selectedShape}
            homeId={homeId}
            taskCounts={selectedShape.area_id ? areaTaskCounts[selectedShape.area_id] : undefined}
            ailmentSummary={selectedShape.area_id ? areaAilmentSeverity[selectedShape.area_id] : undefined}
            sunClassification={sunAnalysisResults?.find(r => r.shapeId === selectedShape.id)?.classification ?? null}
            onChange={updates => updateShape(selectedShape.id, updates)}
            onDelete={() => deleteShape(selectedShape.id)}
            onClose={() => setSelectedId(null)}
            onBringToFront={() => reorder(selectedShape.id, "front")}
            onBringForward={() => reorder(selectedShape.id, "forward")}
            onSendBackward={() => reorder(selectedShape.id, "backward")}
            onSendToBack={() => reorder(selectedShape.id, "back")}
            onSaveAsTemplate={() => setShowTemplatesSheet(true)}
          />
        )}
      </div>

      {/* Mobile: shape panel at bottom — never in the read-only viewer */}
      {isMobile && canEdit && !viewOnly && (
        <GardenShapePanel
          tool={tool}
          viewMode={viewMode}
          curveMode={polygonSmoothed}
          onAddPreset={addPreset}
          onStartPolygon={() => { setTool("polygon"); setPolyPoints([]); setSelectedId(null); setPolygonSmoothed(false); }}
          onStartCurve={() => { setTool("polygon"); setPolyPoints([]); setSelectedId(null); setPolygonSmoothed(true); }}
          isMobile
        />
      )}

      {/* Mobile: properties sheet when shape selected — the read-only viewer
          shows its own info card instead */}
      {isMobile && !viewOnly && selectedShape && (
        <div
          data-testid="properties-mobile-sheet"
          className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-rhozly-outline/20 shadow-2xl rounded-t-3xl overflow-hidden flex flex-col transition-[max-height] duration-200 animate-in slide-in-from-bottom-4 fade-in duration-300"
          style={{ maxHeight: propertiesExpanded ? "75vh" : "32vh" }}
        >
          <button
            data-testid="properties-drag-handle"
            onClick={() => setPropertiesExpanded(v => !v)}
            aria-label={propertiesExpanded ? "Collapse properties" : "Expand properties"}
            aria-expanded={propertiesExpanded}
            className="w-full pt-2 pb-1 flex items-center justify-center shrink-0"
          >
            <span className="block w-10 h-1.5 rounded-full bg-rhozly-on-surface/15" />
          </button>
          <div className="flex-1 overflow-y-auto">
            <GardenShapeProperties
              shape={selectedShape}
              homeId={homeId}
              onChange={updates => updateShape(selectedShape.id, updates)}
              onDelete={() => deleteShape(selectedShape.id)}
              onClose={() => setSelectedId(null)}
              onBringToFront={() => reorder(selectedShape.id, "front")}
              onBringForward={() => reorder(selectedShape.id, "forward")}
              onSendBackward={() => reorder(selectedShape.id, "backward")}
              onSendToBack={() => reorder(selectedShape.id, "back")}
            />
          </div>
        </div>
      )}

      {/* Plant token resize / height popup */}
      {tokenResize && (
        <div
          data-testid="token-resize-popup"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={() => { setTokenResize(null); setSelectedTokenId(null); }}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-sm shadow-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Plant token</p>
              <p className="font-black text-rhozly-on-surface text-sm truncate">{tokenResize.plantName}</p>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-rhozly-on-surface/50 uppercase tracking-widest">Size</label>
                <span className="text-xs font-black text-rhozly-on-surface/70 tabular-nums">{(tokenResize.size).toFixed(2)} m</span>
              </div>
              <input
                data-testid="token-size-slider"
                type="range"
                min="0.1"
                max="2"
                step="0.05"
                value={tokenResize.size}
                onChange={(e) => setTokenResize(t => t ? { ...t, size: parseFloat(e.target.value) } : t)}
                className="w-full accent-rhozly-primary"
              />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black text-rhozly-on-surface/50 uppercase tracking-widest">Height above soil (3D)</label>
                <span className="text-xs font-black text-rhozly-on-surface/70 tabular-nums">{(tokenResize.height).toFixed(2)} m</span>
              </div>
              <input
                data-testid="token-height-slider"
                type="range"
                min="0"
                max="3"
                step="0.05"
                value={tokenResize.height}
                onChange={(e) => setTokenResize(t => t ? { ...t, height: parseFloat(e.target.value) } : t)}
                className="w-full accent-rhozly-primary"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setTokenResize(null); setSelectedTokenId(null); }}
                className="flex-1 min-h-[44px] rounded-2xl border border-rhozly-outline/20 text-xs font-black text-rhozly-on-surface/60"
              >
                Cancel
              </button>
              <button
                data-testid="token-size-save"
                onClick={async () => {
                  await updateTokenSize(tokenResize.itemId, tokenResize.size, tokenResize.height);
                  setTokenResize(null);
                  setSelectedTokenId(null);
                }}
                className="flex-1 min-h-[44px] rounded-2xl bg-rhozly-primary text-white text-xs font-black"
              >
                Save
              </button>
            </div>
            <button
              data-testid="token-reset-position"
              onClick={async () => {
                try {
                  await supabase.from("inventory_items")
                    .update({ display_x_m: null, display_y_m: null, display_size_m: null, display_height_m: null })
                    .eq("id", tokenResize.itemId);
                  refetchLiveState();
                  setTokenResize(null);
                  toast.success("Reset to auto-layout");
                } catch (err) {
                  Logger.error("Failed to reset token", err);
                }
              }}
              className="w-full text-[10px] font-black text-rhozly-on-surface/50 hover:text-rhozly-on-surface uppercase tracking-widest"
            >
              Reset to auto-layout
            </button>
          </div>
        </div>
      )}

      {/* Bed Templates sheet (Wave 10C) */}
      {showTemplatesSheet && (
        <BedTemplatesSheet
          saveSourceShape={shapes.find((s) => s.id === selectedId) ?? null}
          onApply={applyTemplate}
          onClose={() => setShowTemplatesSheet(false)}
        />
      )}

      {/* Garden Zones sheet (Wave 9B) */}
      {showZoneSheet && layout && (
        <GardenZoneSheet
          homeId={homeId}
          layoutId={layout.id}
          selectedShapeIds={[...(selectedId ? [selectedId] : []), ...Array.from(extraSelection)]}
          onClose={() => setShowZoneSheet(false)}
        />
      )}

      {/* Right-click context menu (Wave 5D) */}
      {contextMenu && (
        <GardenContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          hasLinkedArea={!!contextMenu.shape.area_id}
          onDuplicate={() => duplicateShape(contextMenu.shape.id)}
          onDelete={() => deleteShape(contextMenu.shape.id)}
          onBringToFront={() => reorder(contextMenu.shape.id, "front")}
          onSendToBack={() => reorder(contextMenu.shape.id, "back")}
          onQuickActions={() => setQuickActionsShape(contextMenu.shape)}
          onSaveAsTemplate={() => { setSelectedId(contextMenu.shape.id); setShowTemplatesSheet(true); }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Long-press Quick Actions sheet (Wave 9C) */}
      {quickActionsShape && (
        <ShapeQuickActions
          shapeId={quickActionsShape.id}
          shapeLabel={quickActionsShape.label}
          areaId={quickActionsShape.area_id}
          homeId={homeId}
          onClose={() => setQuickActionsShape(null)}
        />
      )}

      {/* North orientation sheet (Wave 6B) */}
      {showNorthSheet && (
        <GardenNorthSheet
          initialOffset={northOffset}
          onClose={() => setShowNorthSheet(false)}
          onSave={async (newOffset) => {
            if (!layoutId) return;
            try {
              const { error } = await supabase.from("garden_layouts")
                .update({ north_offset_deg: newOffset, updated_at: new Date().toISOString() })
                .eq("id", layoutId);
              if (error) throw error;
              setNorthOffset(newOffset);
              setSettingNorthOffset(newOffset);
              setLayout((l) => l ? { ...l, north_offset_deg: newOffset } : l);
              setShowNorthSheet(false);
            } catch (err) {
              Logger.error("Failed to save north offset", err);
              toast.error("Could not save north orientation.");
            }
          }}
        />
      )}

      {/* Microclimate report modal (Wave 11B) */}
      {showMicroclimate && (
        <MicroclimateReportModal
          shapes={shapes}
          homeId={homeId}
          sunAnalysisResults={sunAnalysisResults}
          recentLuxByArea={(() => {
            const out: Record<string, number | null> = {};
            const windowMs = 30 * 60 * 1000;
            const now = Date.now();
            for (const r of areaLuxReadings) {
              if (Math.abs(new Date(r.recorded_at).getTime() - now) <= windowMs && !(r.area_id in out)) {
                out[r.area_id] = r.lux_value;
              }
            }
            return out;
          })()}
          onClose={() => setShowMicroclimate(false)}
        />
      )}

      {/* Canvas settings modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-rhozly-outline/10 flex-shrink-0">
              <p className="font-black text-rhozly-on-surface">Canvas Settings</p>
              <button
                data-testid="canvas-settings-close-btn"
                onClick={() => setShowSettings(false)}
                aria-label="Close canvas settings"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

            <div>
              <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1">Layout Name</p>
              <input
                data-testid="layout-name-input"
                type="text"
                value={settingName}
                onChange={e => setSettingName(e.target.value)}
                className="w-full bg-rhozly-bg rounded-xl px-3 py-2.5 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1">Width (m)</p>
                <input
                  data-testid="canvas-width-input"
                  type="number"
                  min="1"
                  step="1"
                  value={settingW}
                  onChange={e => setSettingW(parseFloat(e.target.value) || 30)}
                  className="w-full bg-rhozly-bg rounded-xl px-3 py-2.5 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
                />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest mb-1">Length (m)</p>
                <input
                  data-testid="canvas-height-input"
                  type="number"
                  min="1"
                  step="1"
                  value={settingH}
                  onChange={e => setSettingH(parseFloat(e.target.value) || 20)}
                  className="w-full bg-rhozly-bg rounded-xl px-3 py-2.5 text-sm font-bold text-rhozly-on-surface border border-rhozly-outline/20 outline-none focus:border-rhozly-primary"
                />
              </div>
            </div>

            {/* Garden orientation now lives in its own focused sheet — surface a quick link here. */}
            <button
              data-testid="canvas-settings-open-north"
              onClick={() => { setShowSettings(false); setShowNorthSheet(true); }}
              className="w-full flex items-center justify-between gap-3 bg-rhozly-surface rounded-2xl px-4 py-3 hover:bg-rhozly-surface-low transition-colors"
            >
              <div className="text-left">
                <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Garden Orientation</p>
                <p className="text-xs font-bold text-rhozly-on-surface/70">Set North relative to your garden</p>
              </div>
              <ChevronRight size={18} className="text-rhozly-on-surface/40 shrink-0" />
            </button>

            </div>{/* end scrollable body */}
            <div className="flex gap-3 px-6 py-4 border-t border-rhozly-outline/10 flex-shrink-0">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 py-3 rounded-2xl border border-rhozly-outline/20 text-sm font-black text-rhozly-on-surface/60"
              >
                Cancel
              </button>
              <button
                data-testid="save-settings-btn"
                onClick={saveSettings}
                className="flex-1 py-3 rounded-2xl bg-rhozly-primary text-white text-sm font-black"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
