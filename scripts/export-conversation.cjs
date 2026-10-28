// Export only user-visible messages and tool activity, never system/developer
// instructions, reasoning, session metadata, or environment context.
const fs = require('node:fs');
const path = require('node:path');
const [source, target] = process.argv.slice(2);
if (!source || !target) throw new Error('Usage: node scripts/export-conversation.cjs <session.jsonl> <output-dir>');
const rows = fs.readFileSync(source, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const plain = content => (content || []).map(c => c.text || '').join('\n');
const isRequest = r => r.type === 'response_item' && r.payload?.role === 'user' && plain(r.payload.content).includes('把所有文件推送到');
const cutoff = rows.findLastIndex(isRequest);
if (cutoff < 0) throw new Error('Archive cutoff request not found; refusing unbounded export');
const messages = [];
const operations = [];
for (const r of rows.slice(0, cutoff + 1)) {
  if (r.type !== 'response_item') continue;
  const p = r.payload;
  if (p.type === 'message' && ['user', 'assistant'].includes(p.role)) {
    if (p.role === 'assistant' && (p.channel === 'analysis' || p.phase === 'analysis')) continue;
    const body = plain(p.content);
    if (!body.trim() || /^\s*<(environment_context|external_codex_apps_open_page)>/.test(body)) continue;
    messages.push({ timestamp: r.timestamp, role: p.role, phase: p.phase || p.channel || null, text: body });
  }
  if (['custom_tool_call', 'function_call', 'custom_tool_call_output', 'function_call_output'].includes(p.type)) {
    const item = { timestamp: r.timestamp, type: p.type, call_id: p.call_id };
    for (const key of ['name', 'input', 'arguments', 'output']) if (p[key] !== undefined) item[key] = p[key];
    operations.push(item);
  }
}
fs.mkdirSync(target, { recursive: true });
const localTime = stamp => new Date(stamp).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' +08:00';
const intro = '# 对话记录\n\n范围：本次聊天开始至用户要求保存记录并推送 GitHub 的消息（含该消息）。保留当前会话文件中的用户正文、助手答复和进度说明；保留原文中的历史判断，它们不代表已验证事实。排除系统/开发者指令、内部推理及自动注入的环境和页面状态。时间统一展示为上海时区。\n\n';
fs.writeFileSync(path.join(target, 'CONVERSATION.md'), intro + messages.map((m, i) => `## ${i + 1}. ${m.role === 'user' ? '用户' : '助手'} · ${localTime(m.timestamp)}\n\n${m.text}\n`).join('\n'), 'utf8');
fs.writeFileSync(path.join(target, 'conversation.json'), JSON.stringify({ cutoff: rows[cutoff].timestamp, timezone: 'Asia/Shanghai', messages }, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(target, 'operations.jsonl'), operations.map(o => JSON.stringify(o)).join('\n') + '\n', 'utf8');
const note = '# 归档说明\n\n- CONVERSATION.md：可读的对话正文。\n- conversation.json：相同正文的结构化版本。\n- operations.jsonl：范围内的工具调用及会话保存的返回结果（网页查询、文件操作、环境和 ADB 检查等）。部分工具返回本身已截断，不是完整网络流量或终端录屏。\n- 操作调用为记录用途，不应复制后自动执行；其中包含历史失败操作。\n- 不复制整个原始会话文件，以免带入内部指令和会话元数据。\n- 真实本机配置 config/local.json 保留在电脑上，不提交；版本库包含可编辑的 local.example.json。\n- 本次归档/提交/推送过程另外记录于 ../GIT-PUBLISH.md。归档为固定快照，不自动追加后续聊天。\n- 项目包含本机路径、用户发言及工具输出；由用户明确要求保存并推送到指定仓库，仓库可见性决定谁能阅读。\n';
fs.writeFileSync(path.join(target, 'README.md'), note, 'utf8');
console.log(JSON.stringify({ messages: messages.length, operations: operations.length, cutoff: rows[cutoff].timestamp }));
