import {z} from "zod";
import {enterpriseCatalogSchema} from "./enterprise-catalog.js";
import {capabilityMapSelectionSchema} from "./capability-map.js";

const location = z.strictObject({file:z.string(),line:z.number().int().positive()});
const hierarchy = z.strictObject({id:z.string(),parentId:z.string().nullable(),level:z.number().int().min(1).max(3),rootId:z.string()});
const digest = z.string().regex(/^[0-9a-f]{64}$/);
/** Separate strict report contract; no model/provider/semantic-review verdict is invented. */
export const capabilityMapReportSchema = z.strictObject({
  format:z.literal("archi-agent-capability-map-report"), formatVersion:z.literal(1), diagramType:z.literal("capability-map"),
  generationPath:z.literal("deterministic-catalog-projection"),modelCalls:z.literal(0),
  deterministicValidation:z.strictObject({verdict:z.literal("passed")}),
  semanticReview:z.strictObject({status:z.literal("not-applicable"),reason:z.literal("deterministic-projection")}),
  source:z.strictObject({contract:z.literal("archi-agent-enterprise/1"),schemaVersion:z.literal(1),
    identity:enterpriseCatalogSchema.shape.source,file:z.string(),sourceBytesSha256:digest}),
  snapshot:z.strictObject({id:z.string(),catalogDigest:digest}), projectionDigest:digest, rendererVersion:z.literal(1),
  selection:capabilityMapSelectionSchema,
  hierarchy:z.array(hierarchy).max(1000),
  visible:z.array(z.strictObject({capability:enterpriseCatalogSchema.shape.capabilities.element,
    hierarchy,locator:z.strictObject({pointer:z.string(),fields:z.record(z.string(),location)}),renderLine:z.number().int().positive()})).max(120),
  scales:z.array(z.strictObject({definition:enterpriseCatalogSchema.shape.scales.element,
    locator:z.strictObject({pointer:z.string(),location})})).max(8),
  excluded:z.array(z.strictObject({id:z.string(),reason:z.enum(["outside-selected-scope","below-detail-level"])})).max(1000),
  duplicateNames:z.array(z.string()).max(1000),limitations:z.array(z.string()).max(16)
});
export type CapabilityMapReport = z.infer<typeof capabilityMapReportSchema>;
