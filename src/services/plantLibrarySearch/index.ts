// Plant Library Search Lab — modular search-method registry.
//
// Each search strategy is a self-contained file exporting a
// `SearchMethod`. To add a new strategy: write the file, add it to
// the SEARCH_METHODS array below. The admin search tab UI iterates
// the registry and auto-renders the tabs + per-method options.

import type React from "react";
import type { PlantLibrarySearchResult } from "../plantLibraryAdminService";
import { alphabeticalMethod } from "./alphabetical";
import { relevanceMethod } from "./relevance";
import { advancedMethod, type AdvancedOptions } from "./advanced";
import { fuzzyMethod, type FuzzyOptions } from "./fuzzy";
import { aiMethod } from "./ai";

export interface SearchMethodRunArgs<O = unknown> {
  query: string;
  page: number;
  pageSize: number;
  options: O;
}

export interface SearchMethod<O = unknown> {
  /** Stable id — used as the active-tab key and to look up cached options. */
  id: string;
  /** Pill label shown in the tab strip. */
  label: string;
  /** One-line description shown under the tabs when the method is active. */
  description: string;
  /** Initial value for this method's options state. Use `{}` for no options. */
  defaultOptions: O;
  /**
   * Optional inline options renderer. Receives the current options
   * value + an onChange callback. Rendered next to the search input
   * when this method is active.
   */
  Options?: React.FC<{ value: O; onChange: (next: O) => void }>;
  /** Run the search and return a paginated result. */
  run(args: SearchMethodRunArgs<O>): Promise<PlantLibrarySearchResult>;
}

/**
 * Registry — order is preserved in the tab strip. Add new methods
 * by importing them and appending to this array.
 */
export const SEARCH_METHODS: ReadonlyArray<SearchMethod<any>> = [
  relevanceMethod,
  alphabeticalMethod,
  advancedMethod as SearchMethod<AdvancedOptions>,
  fuzzyMethod as SearchMethod<FuzzyOptions>,
  aiMethod,
];

/** Default method id — picked on first paint. */
export const DEFAULT_METHOD_ID = relevanceMethod.id;

export { alphabeticalMethod, relevanceMethod, advancedMethod, fuzzyMethod, aiMethod };
export type { AdvancedOptions, FuzzyOptions };
