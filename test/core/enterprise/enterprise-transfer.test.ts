import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {createEnterpriseResponse,validateEnterpriseResponse} from "../../../src/core/enterprise/enterprise-transfer.js";
import {type EnterpriseCatalog} from "../../../src/core/enterprise/enterprise-catalog.js";
import {projectCapabilityMap,renderCapabilityMap} from "../../../src/core/enterprise/capability-map.js";
const retail=()=>JSON.parse(readFileSync("examples/retail-checkout/architecture/enterprise.json","utf8")) as EnterpriseCatalog;
describe("enterprise snapshot transfer v1",()=>{
 it.each([null,"1",-1,0,1.5])("rejects malformed schemaVersion %s as an execution error",schemaVersion=>{
  const c=retail(),r=createEnterpriseResponse(c.source.id,c);Object.assign(r,{schemaVersion});
  expect(()=>validateEnterpriseResponse(r,c.source.id)).toThrow("enterprise-response-invalid");
 });
 it("matches the complete plan example and owns one immutable snapshot with true remote pointers",()=>{
  const catalog:EnterpriseCatalog={schemaVersion:1,format:"archi-agent-enterprise/1",source:{id:"retail",name:"Retail",scope:{id:"sales",description:"Retail sales",coverage:"partial"}},scales:[],
   capabilities:[{id:"sales",name:"Sales",description:"Serve retail customers",provenance:[{sourceId:"retail",recordId:"CAP-01",fields:["/description","/name"],reference:{uri:"https://catalog.example.org/capabilities/CAP-01",version:"r1"}}]}]};
  const response=createEnterpriseResponse("retail",catalog),s=validateEnterpriseResponse(response,"retail");
  expect(response.source.version).toBe("c72192cb23a387d7e9db44a6d8a2e5555bf05ec4dad2c7fa49fe8ed538c9d397");
  expect(s.catalogDigest).toBe("85c1a09eb8c8844c55aa3996d5422f02b75c9638e0094926d940746af3a102a6");
  expect(s.evidence.responseFingerprint).toBe("44016693fce2ecf08558b08f252bfb6c60dd2f56cd0e57d3802f981dbf85fe9b");
  expect(s.evidence.capabilities.sales?.fields['/name']).toEqual({pointer:"/catalog/capabilities/0/name"});
  expect(JSON.stringify(s.evidence)).not.toMatch(/"file"|"line"/);expect(Object.isFrozen(s.catalog.capabilities[0])).toBe(true);
  response.catalog.capabilities[0]!.name="Changed";expect(s.catalog.capabilities[0]!.name).toBe("Sales");
 });
 it("keeps semantic identity, hierarchy and rendering under representation permutations",()=>{
  const c=retail(),a=validateEnterpriseResponse(createEnterpriseResponse(c.source.id,c),c.source.id);
  c.capabilities.reverse();c.scales.reverse();c.capabilities.forEach(r=>{r.provenance.reverse();r.provenance.forEach(p=>p.fields.reverse());});
  const b=validateEnterpriseResponse(createEnterpriseResponse(c.source.id,c),c.source.id);
  expect(b.catalog).toEqual(a.catalog);expect(b.catalogDigest).toBe(a.catalogDigest);expect(b.evidence.sourceVersion).not.toBe(a.evidence.sourceVersion);
  const project=(s:typeof a)=>projectCapabilityMap(s,{rootIds:[],maxLevel:3,colorBy:{kind:"rating",scaleId:"maturity"},language:"pl",expectedCatalogDigest:s.catalogDigest});
  expect(renderCapabilityMap(project(b))).toEqual(renderCapabilityMap(project(a)));expect(project(b).projectionDigest).toBe(project(a).projectionDigest);
 });
 it.each(["id","version","digest","snapshot-id","extra","format","schema"])("rejects forged %s",field=>{
  const c=retail(),r=createEnterpriseResponse(c.source.id,c);
  if(field==="id")r.source.id="other";if(field==="version")r.source.version="0".repeat(64);if(field==="digest")r.snapshot.digest="0".repeat(64);
  if(field==="snapshot-id")r.snapshot.id="enterprise-"+"0".repeat(64);if(field==="extra")Object.assign(r,{extra:1});
  if(field==="format")Object.assign(r,{format:"archi-agent-enterprise-snapshot/2"});if(field==="schema")Object.assign(r,{schemaVersion:2});
  expect(()=>validateEnterpriseResponse(r,c.source.id)).toThrow(field==="format"||field==="schema"?"enterprise-version-unsupported":field==="extra"||field==="id"?"enterprise-response-invalid":"enterprise-response-digest-mismatch");
 });
 it.each(["parent","cycle","rating","scale","provenance"])("uses production EA1 validation for %s",field=>{
  const c=retail();if(field==="parent")c.capabilities[0]!.parentId="missing";if(field==="cycle")c.capabilities[0]!.parentId=c.capabilities[0]!.id;
  if(field==="rating")c.capabilities[0]!.ratings={maturity:99};if(field==="scale")c.scales[0]!.levels.reverse();if(field==="provenance")c.capabilities[0]!.provenance=[];
  expect(()=>createEnterpriseResponse(c.source.id,c)).toThrow("invalid-source");
 });
});
