export function assert(condition, message, status = 400) {
  if (!condition) throw Object.assign(new Error(message), { status });
}
function text(value, label, required = false) {
  assert(typeof value === 'string' && value.length <= 120 && (!required || value.trim()), `${label}需要填写，且最多120字`);
  return value.trim();
}
export function roleInput(data) {
  return { name: text(data.name, '角色名称', true), server: text(data.server ?? '', '服务器'), season: text(data.season ?? '', '赛季') };
}
export function resourceInput(data) {
  assert(['general', 'tactic', 'treasure'].includes(data.kind), '资源类型无效');
  assert(data.attributes && typeof data.attributes === 'object' && !Array.isArray(data.attributes), '属性必须为 JSON 对象');
  assert(JSON.stringify(data.attributes).length <= 20000, '属性内容过长');
  assert(typeof data.verified === 'boolean', '核对状态无效');
  return { kind: data.kind, name: text(data.name, '资源名称', true), attributes: data.attributes, verified: data.verified };
}
export function importInput(data) {
  assert(data.version === 1 && Array.isArray(data.resources) && data.resources.length <= 10000, '导入格式或版本无效，最多10000条资源');
  return { role: roleInput(data.role || {}), resources: data.resources.map(resourceInput) };
}
