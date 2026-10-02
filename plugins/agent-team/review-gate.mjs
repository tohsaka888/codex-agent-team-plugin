import { readFile, writeFile, rename } from 'node:fs/promises';

// 阶段 0 规则探针；调用者身份认证和真人交互尚未接入。
export class ReviewGate {
  constructor(path, state) { this.path = path; this.state = state; }
  static async open(path) {
    let state;
    try { state = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; state = { planVersion: 1, deliveryVersion: 1, executed: false, approvals: {}, submissions: {} }; }
    return new ReviewGate(path, state);
  }
  async save() {
    await writeFile(this.path + '.tmp', JSON.stringify(this.state, null, 2));
    await rename(this.path + '.tmp', this.path);
  }
  version(stage) {
    if (!['design', 'release'].includes(stage)) throw new Error('Unknown review stage');
    return this.state[stage === 'design' ? 'planVersion' : 'deliveryVersion'];
  }
  approved(stage) { return this.state.approvals[stage]?.version === this.version(stage) && this.state.approvals[stage]?.decision === 'approved'; }
  canImplement() { return this.approved('design'); }
  canAccept() { return this.canImplement() && this.state.executed && this.approved('release'); }
  async submit({ stage, version, decision, reviewer, requestId }) {
    if (!reviewer || !requestId || !['approved', 'rejected'].includes(decision)) throw new Error('Review identity and decision required');
    const payload = { stage, version, decision, reviewer, requestId };
    if (this.state.submissions[requestId]) {
      if (JSON.stringify(this.state.submissions[requestId]) !== JSON.stringify(payload)) throw new Error('Conflicting duplicate submission');
      return;
    }
    if (version !== this.version(stage)) throw new Error('Stale review version');
    if (stage === 'release' && (!this.state.executed || !this.canImplement())) throw new Error('Delivery is not ready for acceptance');
    this.state.approvals[stage] = payload;
    this.state.submissions[requestId] = payload;
    await this.save();
  }
  async revisePlan() {
    this.state.planVersion++;
    this.state.deliveryVersion++;
    this.state.executed = false;
    this.state.approvals = {};
    await this.save();
  }
  async reviseDelivery() {
    this.state.deliveryVersion++;
    this.state.executed = false;
    delete this.state.approvals.release;
    await this.save();
  }
  async dispatch(start) {
    if (!this.canImplement()) throw new Error('Human design review required');
    await start();
    this.state.executed = true;
    await this.save();
  }
  accept() {
    if (!this.canAccept()) throw new Error('Human release review required');
    return { accepted: true, version: this.state.deliveryVersion };
  }
}
