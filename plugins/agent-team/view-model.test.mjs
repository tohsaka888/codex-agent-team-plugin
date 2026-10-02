import {test} from 'node:test';
import assert from 'node:assert/strict';
import {visibleTasks,taskColumn} from './web/view-model.mjs';
test('搜索和角色筛选只返回当前快照匹配任务，不修改原始记录',()=>{
  const tasks=[{title:'核对原生 Agent',taskId:'CAPTURE',role:'Architect'},{title:'完善任务详情',taskId:'DETAIL',role:'Developer'}];
  assert.deepEqual(visibleTasks(tasks,'原生','Architect'),[tasks[0]]);
  assert.deepEqual(visibleTasks(tasks,'详情','Architect'),[]);
  assert.equal(tasks.length,2);
});
test('明确待修正不显示成功，失败优先保留原始阶段',()=>{
  assert.equal(taskColumn({executionStatus:'completed',reviewPhase:'repair_required'}),'unknown');
  assert.equal(taskColumn({executionStatus:'running',reviewPhase:'repair_required'}),'running');
  assert.equal(taskColumn({executionStatus:'failed',reviewPhase:'awaiting_review'}),'unknown');
});
