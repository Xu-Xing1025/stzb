import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

export function config() {
  const file = new URL('../../config/local.json', import.meta.url);
  const c = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  if (!c.mysql || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(c.mysql.database)) throw Error('请在 config/local.json 配置有效的 MySQL 数据库名');
  if (c.mysql.host !== '127.0.0.1' && c.mysql.host !== 'localhost') throw Error('当前版本仅支持本机 MySQL');
  return c;
}

export async function openDatabase() {
  const c = config();
  const options = { ...c.mysql, connectTimeout: 5000, charset: 'utf8mb4' };
  delete options.database;
  const connection = await mysql.createConnection(options);
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${c.mysql.database}\` CHARACTER SET utf8mb4`);
  } finally { await connection.end(); }
  const pool = mysql.createPool({ ...options, database: c.mysql.database, connectionLimit: 5 });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS roles (
      id CHAR(36) PRIMARY KEY, name VARCHAR(120) NOT NULL,
      server_name VARCHAR(120) NOT NULL, season VARCHAR(120) NOT NULL,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS resources (
      id CHAR(36) PRIMARY KEY, role_id CHAR(36) NOT NULL,
      kind VARCHAR(20) NOT NULL, name VARCHAR(120) NOT NULL,
      attributes JSON NOT NULL, verified BOOLEAN NOT NULL DEFAULT FALSE,
      revision INT NOT NULL DEFAULT 1,
      updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      FOREIGN KEY (role_id) REFERENCES roles(id), INDEX role_kind(role_id, kind)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS resource_changes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY, role_id CHAR(36) NOT NULL,
      resource_id CHAR(36) NOT NULL, action VARCHAR(20) NOT NULL,
      snapshot JSON NOT NULL, created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB`);
    await pool.query(`CREATE TABLE IF NOT EXISTS recommendations (
      id CHAR(36) PRIMARY KEY, role_id CHAR(36) NOT NULL,
      snapshot JSON NOT NULL, request_data JSON NOT NULL,
      model_info JSON NOT NULL, result JSON NOT NULL, usage_data JSON,
      created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
      FOREIGN KEY (role_id) REFERENCES roles(id), INDEX role_time(role_id,created_at)
    ) ENGINE=InnoDB`);
    return pool;
  } catch (e) { await pool.end(); throw e; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { const db = await openDatabase(); await db.end(); console.log('MySQL 项目数据库及表已准备好。'); }
  catch (e) { console.error(`数据库初始化失败：${e.code || '配置错误'}。请检查本地 MySQL 服务、配置及权限。`); process.exitCode = 1; }
}
