// Upload-template registry — public barrel (RHO-4 Phase 1).
export type {
  FieldKind,
  FieldSpec,
  ParsedValue,
  ParsedRow,
  ParseResult,
  RecordTemplate,
  RowIssue,
} from "./types";
export {
  PLANT_TEMPLATE,
  AILMENT_TEMPLATE,
  SEED_PACKET_TEMPLATE,
  TEMPLATES,
  PLANT_TEMPLATE_PLANT_COLUMNS,
  PLANT_TEMPLATE_SCRATCH_HEADERS,
  AILMENT_TEMPLATE_COLUMNS,
  SEED_PACKET_TEMPLATE_COLUMNS,
} from "./registry";
export { parseCsv, MAX_DATA_ROWS, parseFlexibleDate } from "./parse";
export { buildTemplateCsv, downloadTemplate } from "./template";
export {
  parseCsvRows,
  serializeCsv,
  serializeCell,
  sniffDelimiter,
  stripBom,
  type Delimiter,
} from "./csv";
