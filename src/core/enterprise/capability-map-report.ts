import {z} from "zod";
import {enterpriseCatalogSchema} from "./enterprise-catalog.js";
import {capabilityMapSelectionSchema} from "./capability-map.js";

const location = z.strictObject({file:z.string(),line:z.number().int().positive()});
const hierarchy = z.strictObject({id:z.string(),parentId:z.string().nullable(),level:z.number().int().min(1).max(3),rootId:z.string()});
const digest = z.string().regex(/^[0-9a-f]{64}$/);
/** Separate strict report contract; no model/provider/semantic-review verdict is invented. */
const format=z.literal("archi-agent-capability-map-report");
const head = {
  diagramType:z.literal("capability-map"),
  generationPath:z.literal("deterministic-catalog-projection"),modelCalls:z.literal(0),
  deterministicValidation:z.strictObject({verdict:z.literal("passed")}),
  semanticReview:z.strictObject({status:z.literal("not-applicable"),reason:z.literal("deterministic-projection")}),
};
const tail = {
  snapshot:z.strictObject({id:z.string(),catalogDigest:digest}), projectionDigest:digest, rendererVersion:z.literal(1),
  selection:capabilityMapSelectionSchema,
  hierarchy:z.array(hierarchy).max(1000),
};
const end = {
  excluded:z.array(z.strictObject({id:z.string(),reason:z.enum(["outside-selected-scope","below-detail-level"])})).max(1000),
  duplicateNames:z.array(z.string()).max(1000),limitations:z.array(z.string()).max(16)
};
const source = {contract:z.literal("archi-agent-enterprise/1"),schemaVersion:z.literal(1),identity:enterpriseCatalogSchema.shape.source};
export const enterpriseTransportSchema=z.strictObject({kind:z.literal("mcp"),sourceId:z.string().regex(/^[a-z][a-z0-9-]{0,55}$/),
  sourceVersion:digest,responseFingerprint:digest,tool:z.literal("get_enterprise_snapshot"),contractVersion:z.literal(1)});
export const capabilityMapReportV1Schema = z.strictObject({format,formatVersion:z.literal(1),...head,
  source:z.strictObject({...source,file:z.string(),sourceBytesSha256:digest}),...tail,
  visible:z.array(z.strictObject({capability:enterpriseCatalogSchema.shape.capabilities.element,
    hierarchy,locator:z.strictObject({pointer:z.string(),fields:z.record(z.string(),location)}),renderLine:z.number().int().positive()})).max(120),
  scales:z.array(z.strictObject({definition:enterpriseCatalogSchema.shape.scales.element,
    locator:z.strictObject({pointer:z.string(),location})})).max(8),...end,
});
const pointer=z.strictObject({pointer:z.string().min(1).max(256)});
export const capabilityMapReportV2Schema=z.strictObject({format,formatVersion:z.literal(2),...head,
  source:z.strictObject({...source,transport:enterpriseTransportSchema}),...tail,
  visible:z.array(z.strictObject({capability:enterpriseCatalogSchema.shape.capabilities.element,hierarchy,
    locator:z.strictObject({pointer:z.string(),fields:z.record(z.string(),pointer)}),renderLine:z.number().int().positive()})).max(120),
  scales:z.array(z.strictObject({definition:enterpriseCatalogSchema.shape.scales.element,locator:pointer})).max(8),...end
});
export const enterpriseTransportV2Schema=enterpriseTransportSchema.extend({tool:z.literal("get_enterprise_snapshot_v2"),contractVersion:z.literal(2)});
export const capabilityMapReportV3Schema=capabilityMapReportV1Schema.extend({formatVersion:z.literal(3),
 source:z.union([capabilityMapReportV1Schema.shape.source.extend({contract:z.literal("archi-agent-enterprise/2"),schemaVersion:z.literal(2)}),
 capabilityMapReportV2Schema.shape.source.extend({contract:z.literal("archi-agent-enterprise/2"),schemaVersion:z.literal(2),transport:enterpriseTransportV2Schema})]),
 visible:z.array(z.strictObject({capability:enterpriseCatalogSchema.shape.capabilities.element,hierarchy,
 locator:z.union([capabilityMapReportV1Schema.shape.visible.element.shape.locator,capabilityMapReportV2Schema.shape.visible.element.shape.locator]),renderLine:z.number().int().positive()})).max(120),
 scales:z.array(z.strictObject({definition:enterpriseCatalogSchema.shape.scales.element,locator:z.union([capabilityMapReportV1Schema.shape.scales.element.shape.locator,pointer])})).max(8)});
export const capabilityMapReportSchema=z.discriminatedUnion("formatVersion",[capabilityMapReportV1Schema,capabilityMapReportV2Schema,capabilityMapReportV3Schema]);
export type CapabilityMapReport = z.infer<typeof capabilityMapReportSchema>;
