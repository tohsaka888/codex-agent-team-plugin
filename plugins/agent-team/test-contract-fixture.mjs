// 旧回归场景显式提供新合同；不生成验证结果或人工通过。
export const fixtureConditions = () => [
  { id: 'layout', label: '四列布局', method: '核对1440px截图', verifier: 'agent', kind: 'check' },
  { id: 'keyboard', label: '键盘导航', method: '实际键盘操作', verifier: 'agent', kind: 'check' },
  {
    id: 'tests',
    label: '单元行为回归通过',
    method: 'node --test',
    verifier: 'agent',
    kind: 'unit_test',
  },
  {
    id: 'delivery',
    label: '用户验收本卡结果',
    method: '原生对话列明卡片/版本确认',
    verifier: 'human',
    kind: 'delivery',
    manualCheck: {
      entry: 'Agent Team 看板',
      steps: ['打开执行卡详情', '查看当前 AC 和证据'],
      expected: '条件与当前版本证据对应，未确认项未勾选',
    },
  },
  {
    id: 'prototype',
    label: '用户确认本卡原型',
    method: '原生对话确认设计文件版本',
    verifier: 'human',
    kind: 'prototype',
    manualCheck: {
      entry: 'prototype.md 原型文件',
      steps: ['打开首页原型', '查看窄屏布局及页面 A/B 的状态'],
      expected: '确认页面范围内的布局和状态满足本次设计要求',
    },
  },
];
export function fixtureContract(role = 'Research') {
  return { role, taskType: 'analysis', version: 'v1', acceptanceItems: fixtureConditions() };
}
export function contractArgs(kind, args) {
  if (
    !['task', 'run'].includes(kind) ||
    args.includes('--body-file') ||
    !(args.includes('--title') || (kind === 'run' && args.includes('--provider')))
  )
    return args;
  const contract = fixtureContract();
  return [
    '--role',
    contract.role,
    '--task-type',
    contract.taskType,
    '--version',
    contract.version,
    '--acceptance-items',
    JSON.stringify(contract.acceptanceItems),
    ...args,
  ];
}
