// Export only user-visible messages and tool activity, never system/developer
// instructions, reasoning, session metadata, or environment context.
const fs = require('node:fs');
const path = require('node:path');
const [source, target, untilMessage = '把所有文件推送到'] = process.argv.slice(2);
if (!source || !target) throw new Error('Usage: node scripts/export-conversation.cjs <session.jsonl> <output-dir> [until-user-message]');
const rows = fs.readFileSync(source, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const plain = content => (content || []).map(c => c.text || '').join('\n');
const isRequest = r => r.type === 'response_item' && r.payload?.role === 'user' && plain(r.payload.content).includes(untilMessage);
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
// Refuse an export that would silently remove or change archived messages.
const existingPath = path.join(target, 'conversation.json');
if (fs.existsSync(existingPath)) {
  const existing = JSON.parse(fs.readFileSync(existingPath, 'utf8')).messages;
  if (existing.length > messages.length || existing.some((m, i) => JSON.stringify(m) !== JSON.stringify(messages[i]))) {
    throw new Error('Existing conversation is not an unchanged prefix; review before exporting');
  }
}
const localTime = stamp => new Date(stamp).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }) + ' +08:00';
const intro = `# 对话记录\n\n范围：本次聊天开始至 ${localTime(rows[cutoff].timestamp)} 用户消息（含该消息）：${untilMessage}。保留当前会话文件中的用户正文、助手答复和进度说明；保留原文中的历史判断，它们不代表已验证事实。排除系统/开发者指令、内部推理及自动注入的环境和页面状态。时间统一展示为上海时区。\n\n`;
fs.writeFileSync(path.join(target, 'CONVERSATION.md'), intro + messages.map((m, i) => `## ${i + 1}. ${m.role === 'user' ? '用户' : '助手'} · ${localTime(m.timestamp)}\n\n${m.text}\n`).join('\n'), 'utf8');
fs.writeFileSync(path.join(target, 'conversation.json'), JSON.stringify({ cutoff: rows[cutoff].timestamp, timezone: 'Asia/Shanghai', messages }, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(target, 'operations.jsonl'), operations.map(o => JSON.stringify(o)).join('\n') + '\n', 'utf8');
const note = `# 归档说明\n\n- CONVERSATION.md：可读的对话正文。\n- conversation.json：相同正文的结构化版本。\n- operations.jsonl：范围内的工具调用及会话保存的返回结果。部分工具返回本身已截断，不是完整网络流量或终端录屏。\n- 本次快照截止：${localTime(rows[cutoff].timestamp)}，包含 ${messages.length} 条对话、${operations.length} 条操作调用/返回。\n- 本次增加资源管理、用户指定 MySQL、大模型接入及验证过程等对话。旧对话原文保持不变，历史判断不代表当前状态。\n- 操作调用为记录用途，不应复制后自动执行；其中包含历史失败操作。\n- 不复制整个原始会话文件，以免带入内部指令和会话元数据。\n- config/local.json 与 config/model.local.json 不纳入归档；对话中用户主动提供的信息和操作文本仍保留，分享前注意其中的本机路径及凭据信息。\n- 初次 Git 发布过程见 ../GIT-PUBLISH.md。当前为按用户请求手动更新的固定快照，不自动保存后续聊天。\n- 本次更新只创建本地 Git 提交，不自动推送。\n`;
fs.writeFileSync(path.join(target, 'README.md'), note, 'utf8');
console.log(JSON.stringify({ messages: messages.length, operations: operations.length, cutoff: rows[cutoff].timestamp }));
