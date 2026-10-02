import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {openNativeFile} from './web/navigation.mjs';
import {executionDocument} from './execution-document.mjs';
test('原生文件标签桥接检查宿主声明、路径与错误，使用 files/open 而非浏览器链接',async()=>{
  let request;
  const app={getHostCapabilities:()=>({experimental:{'openai/files':{}}}),request:async value=>{request=value;return {};}};
  assert.equal(await openNativeFile(app,'D:/project/record.md'),true);assert.deepEqual(request,{method:'openai/files/open',params:{path:'D:/project/record.md'}});
  await assert.rejects(openNativeFile({...app,getHostCapabilities:()=>({})},'x'),/未声明/);
  await assert.rejects(openNativeFile(app,''),/不可用/);
  await assert.rejects(openNativeFile({...app,request:async()=>({isError:true})},'x'),/未能打开/);
});
test('原生执行文档限制团队范围并校验日志身份，只导出实际消息与工具，排除内部推理',async()=>{
  const base=await mkdtemp(join(tmpdir(),'native-record-')),root=join(base,'project'),codexHome=join(base,'codex'),id='01a0fb29-5d89-7c51-9d83-f530f652ce70';
  try{
    await mkdir(root);await mkdir(join(codexHome,'sessions'),{recursive:true});
    const path=join(codexHome,'sessions','rollout-test-'+id+'.jsonl');
    const meta={type:'session_meta',payload:{id,cwd:root}},message=(text,channel='final')=>({type:'response_item',payload:{type:'message',role:'assistant',channel,content:[{type:'output_text',text}]}});
    await writeFile(path,[meta,message('不应出现的内部推理','analysis'),message('实际回复'),{type:'response_item',payload:{type:'function_call',name:'exec',arguments:'实际工具调用'}}].map(JSON.stringify).join('\n'));
    const args={state:{snapshot:{agents:[{nativeAgentId:id}]}},project:{path:root},task:{title:'任务'},id,codexHome};
    const value=await executionDocument(args);assert.ok(value.content.includes('实际回复'));assert.ok(value.content.includes('实际工具调用'));assert.ok(!value.content.includes('不应出现'));assert.equal(await readFile(value.path,'utf8'),value.content);
    await assert.rejects(executionDocument({...args,id:'../other'}),/未关联/);
    await assert.rejects(executionDocument({...args,state:{snapshot:{agents:[]}}}),/未关联/);
    await writeFile(path,JSON.stringify({...meta,payload:{id,cwd:base}}));await assert.rejects(executionDocument(args),/不匹配/);
  }finally{await rm(base,{recursive:true,force:true});}
});
