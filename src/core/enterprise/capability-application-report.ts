import {z} from "zod";
import {enterpriseCatalogV2Schema,enterpriseCatalogV3Schema} from "./enterprise-catalog.js";
import {enterpriseTransportV2Schema,enterpriseTransportV3Schema} from "./capability-map-report.js";
import {applicationMapSelectionSchema} from "./capability-application-map.js";
const digest=z.string().regex(/^[a-f0-9]{64}$/),location=z.strictObject({file:z.string().max(256),line:z.number().int().positive()}),pointer=z.strictObject({pointer:z.string().max(256)});
const recordLocator=z.union([pointer.extend({location}),pointer]);
const capabilityLocator=z.strictObject({pointer:z.string().max(256),fields:z.record(z.string(),z.union([location,pointer]))});
export const applicationMapReportV1Schema=z.strictObject({format:z.literal("archi-agent-capability-application-map-report/1"),diagramType:z.literal("capability-application-map"),modelCalls:z.literal(0),
 generationPath:z.literal("deterministic-catalog-projection"),rendererVersion:z.literal(1),
 source:z.strictObject({contract:z.literal("archi-agent-enterprise/2"),identity:enterpriseCatalogV2Schema.shape.source,evidence:z.union([z.strictObject({file:z.string().max(256),sourceBytesSha256:digest}),enterpriseTransportV2Schema])}),
 snapshot:z.strictObject({id:z.string(),catalogDigest:digest}),projectionDigest:digest,selection:applicationMapSelectionSchema,supportScope:enterpriseCatalogV2Schema.shape.supportScope,
 capabilities:z.array(z.strictObject({record:enterpriseCatalogV2Schema.shape.capabilities.element,locator:capabilityLocator,renderLine:z.number().int().positive(),documentedSupportCount:z.number().int().nonnegative()})).max(120),
 applications:z.array(z.strictObject({record:enterpriseCatalogV2Schema.shape.applications.element,locator:recordLocator,renderLine:z.number().int().positive()})).max(120),
 supports:z.array(z.strictObject({record:enterpriseCatalogV2Schema.shape.supports.element,locator:recordLocator,renderLine:z.number().int().positive()})).max(240),
 excluded:z.array(z.strictObject({kind:z.enum(["capability","application","support"]),id:z.string().max(160),reason:z.enum(["outside-selected-scope","no-direct-link-in-selected-scope"])})).max(6000),limitations:z.array(z.string().max(512)).max(16)});
export const applicationMapReportV2Schema=applicationMapReportV1Schema.extend({format:z.literal("archi-agent-capability-application-map-report/2"),
 source:applicationMapReportV1Schema.shape.source.extend({contract:z.literal("archi-agent-enterprise/3"),evidence:z.union([z.strictObject({file:z.string().max(256),sourceBytesSha256:digest}),enterpriseTransportV3Schema])}),
 applications:z.array(z.strictObject({record:enterpriseCatalogV3Schema.shape.applications.element,locator:recordLocator,renderLine:z.number().int().positive()})).max(120)});
export const applicationMapReportSchema=z.discriminatedUnion("format",[applicationMapReportV1Schema,applicationMapReportV2Schema]);
export type ApplicationMapReport=z.infer<typeof applicationMapReportSchema>;
