// 独立原型服务，仅绑定本机，正式构建不会读取原型。
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
if(process.env.NODE_ENV==='production')throw new Error('演示原型仅用于开发评审');
createServer(async (request,response)=>{
  if(request.method!=='GET'||new URL(request.url,'http://127.0.0.1').pathname!=='/'){response.writeHead(404).end();return;}
  response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  response.end(await readFile(new URL('./human-review.prototype.html',import.meta.url)));
}).listen(43783,'127.0.0.1',()=>console.log('UI 原型 v2：http://127.0.0.1:43783/?variant=D'));
