// 只读查询边界：最新 Workspace、串行请求及缓存归属，不控制原生任务。
export function createSnapshotReader({query,onSnapshot,onError,onBusy=()=>{},isVisible=()=>true,isReady=()=>true}) {
  let projectId,rootSessionId,version=0,pending=null,queued=false,lastSnapshot=null;
  function request() {
    if(!isReady()||!isVisible())return Promise.resolve();
    if(pending){queued=true;return pending;}
    pending=(async()=>{
      onBusy(true);
      do {
        queued=false;
        const token=version,scope=projectId,session=rootSessionId;
        try {
          const next=await Promise.resolve().then(()=>query(scope,session));
          if(token!==version){queued=true;continue;}
          if(scope && next.selectedProjectId!==scope)throw new Error('Workspace 响应归属不匹配');
          if(session && next.selectedRootSessionId!==session)throw new Error('会话响应归属不匹配');
          lastSnapshot=next;projectId=next.selectedProjectId;rootSessionId=next.selectedRootSessionId||undefined;
          onSnapshot(next);
        } catch(error) {
          if(token!==version){queued=true;continue;}
          onError(error,{projectId:scope,rootSessionId:session,snapshot:lastSnapshot?.selectedProjectId===scope&&(lastSnapshot?.selectedRootSessionId||undefined)===session?lastSnapshot:null});
        }
      }while(queued&&isVisible()&&isReady());
    })().finally(()=>{pending=null;onBusy(false);});
    return pending;
  }
  return {request,select(value,session){projectId=value;rootSessionId=session;version++;return request();}};
}
