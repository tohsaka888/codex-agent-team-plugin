// 列表投影：未知时间置末，不改变原始身份或选择范围。
export const activityTime=value=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&value.trim()?Date.parse(value):NaN;
export function recentFirst(items){
 return items.map((item,index)=>({item,index,time:Math.max(...[item.lastActivityAt,item.updatedAt].map(activityTime).filter(Number.isFinite),-Infinity)}))
 .sort((a,b)=>b.time-a.time||a.index-b.index).map(({item})=>item);
}
export function sessionOptions(sessions){
 return recentFirst(sessions.filter(s=>typeof s.title==='string'&&s.title.trim()&&!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(s.title.trim())))
 .map(s=>({...s,displayTitle:s.title}));
}


// 兼容已连接的旧后端：通过原有只读查询取得真实活动时间，不猜测UUID或反转未知列表。
export function createSelectorActivityReader(readScope,{now=Date.now,ttl=30000}={}){
 const cache=new Map();
 function query(projectId,rootSessionId){
  const key=JSON.stringify([projectId,rootSessionId]),old=cache.get(key);
  if(old&&old.until>now())return old.promise;
  const promise=Promise.resolve().then(()=>readScope(projectId,rootSessionId)).then(value=>{
   if(value.selectedProjectId!==projectId||(rootSessionId&&value.selectedRootSessionId!==rootSessionId))throw Error('排序查询范围不符');
   return value;
  }).catch(error=>{cache.delete(key);throw error;});
  cache.set(key,{promise,until:now()+ttl});if(cache.size>200)cache.delete(cache.keys().next().value);
  return promise;
 }
 return async state=>{
  const needsSessions=state.sessions?.some(s=>!Object.hasOwn(s,'lastActivityAt'));
  if(!needsSessions&&state.projects.every(p=>Object.hasOwn(p,'lastActivityAt')))return state;
  let sessions=state.sessions||[],unavailable=false;
  const projects=await Promise.all(state.projects.map(async p=>{
   if(Object.hasOwn(p,'lastActivityAt')&&!(p.id===state.selectedProjectId&&needsSessions))return p;
   if(p.kind==='remote')return {...p,lastActivityAt:null};
   try{
    const scope=p.id===state.selectedProjectId?state:await query(p.id);
    const enriched=await Promise.all((scope.sessions||[]).map(async s=>{
     if(Object.hasOwn(s,'lastActivityAt'))return s;
     try{
     const result=s.id===scope.selectedRootSessionId&&Number.isFinite(activityTime(scope.snapshot?.lastEventAt))?scope:await query(p.id,s.id);
     const at=result.snapshot?.lastEventAt;
     return {...s,lastActivityAt:Number.isFinite(activityTime(at))?at:null};
     }catch{unavailable=true;return {...s,lastActivityAt:null};}
    }));
    if(p.id===state.selectedProjectId)sessions=enriched;
    const times=[activityTime(p.lastActivityAt),activityTime(p.updatedAt),activityTime(scope.snapshot?.lastEventAt),...enriched.map(s=>activityTime(s.lastActivityAt))].filter(Number.isFinite);
    return {...p,lastActivityAt:times.length?new Date(Math.max(...times)).toISOString():null};
   }catch{unavailable=true;return p;}
  }));
  return {...state,projects:recentFirst(projects),sessions:recentFirst(sessions),selectorActivityUnavailable:unavailable};
 };
}
