import{z}from"zod";
/** A source-provided reference is data, never a fetch/open instruction. */
export const sourceReferenceSchema=z.strictObject({uri:z.string().min(1).max(2048).refine(value=>{
 try{const uri=new URL(value);return !uri.username&&!uri.password&&!uri.search&&!uri.hash&&!/[\x00-\x1f\x7f]/.test(value)&&["https:","http:","urn:","file:"].includes(uri.protocol);}catch{return false;}
}),version:z.string().min(1).max(256),fragment:z.string().max(256).optional()});
export type SourceReference=z.infer<typeof sourceReferenceSchema>;
