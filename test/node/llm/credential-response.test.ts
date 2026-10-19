import {describe,it,expect} from 'vitest';
import {OpenAiCompatibleRemoteChatClient,listOpenAiCompatibleRemoteModels} from '../../../src/node/llm/openai-compatible-remote-chat-client.js';
import {AnthropicRemoteChatClient,listAnthropicRemoteModels} from '../../../src/node/llm/anthropic-remote-chat-client.js';
import type {StructuredChatRequest} from '../../../src/core/llm/structured-chat-client.js';
const request:StructuredChatRequest={messages:[{role:'system',content:'Return JSON.'},{role:'user',content:'Describe a step.'}],maxTokens:256,schemaName:'step',schema:{type:'object',properties:{label:{type:'string'}},required:['label'],additionalProperties:false}};
const escaped=(text:string)=>[...text].map(c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
describe.each(['openai','openrouter','anthropic'] as const)('decoded credential response guard: %s',provider=>{
 it.each(['MCP1-SYNTHETIC-KEY-47','key-with-"-and-\\-characters'])('rejects a reflected credential even through JSON escapes: %s',async key=>{
  let calls=0;const content=JSON.stringify({label:'prefix '+key+' suffix'}).replace(JSON.stringify(key).slice(1,-1),escaped(key));
  const transport={async exchange(){calls++;return JSON.stringify(provider==='anthropic'?{stop_reason:'end_turn',content:[{type:'text',text:content}]}:{choices:[{finish_reason:'stop',message:{content}}]});}};
  const client=provider==='anthropic'?new AnthropicRemoteChatClient({apiKey:key,modelId:'synthetic-model',transport}):new OpenAiCompatibleRemoteChatClient({provider,apiKey:key,modelId:'synthetic-model',transport});
  let caught;try{await client.complete(request);}catch(e){caught=e;}
  expect(caught).toMatchObject({code:'sensitive-provider-response'});expect(String(caught)).not.toContain(key);expect(calls).toBe(1);
 });
 it('rejects a reflected model ID before publishing the list',async()=>{
  const key='MCP1-SYNTHETIC-MODEL-CANARY';let calls=0;
  const transport={async exchange(){calls++;return JSON.stringify({data:[{id:key,supported_parameters:['response_format'],capabilities:{structured_outputs:{supported:true}}}],has_more:false});}};
  const pending=provider==='anthropic'?listAnthropicRemoteModels({apiKey:key,transport}):listOpenAiCompatibleRemoteModels({provider,apiKey:key,transport});
  await expect(pending).rejects.toMatchObject({code:'sensitive-provider-response'});expect(calls).toBe(1);
 });
 it('rejects a stale model selection containing the key before metadata or network access',()=>{
  const key='MCP1-KEY',transport={async exchange(){throw Error('must not send');}};
  expect(()=>provider==='anthropic'?new AnthropicRemoteChatClient({apiKey:key,modelId:'model-'+key,transport}):new OpenAiCompatibleRemoteChatClient({provider,apiKey:key,modelId:'model-'+key,transport})).toThrow('sensitive-provider-response');
 });
});
