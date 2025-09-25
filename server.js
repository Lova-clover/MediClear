// ===== server.js (MediClear · surgeries also mirrored into tests; doctor/patient schedules include surgeries) =====
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import sqlite3pkg from 'sqlite3';
import jwt from 'jsonwebtoken';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(express.static(__dirname));

// -------------------- DB --------------------
const sqlite3 = sqlite3pkg.verbose();
const DB_PATH = path.join(__dirname, 'mediclear.db');
if (!fs.existsSync(DB_PATH)) console.warn('⚠️ mediclear.db 가 없습니다. 새 파일을 생성합니다.');
const db = new sqlite3.Database(DB_PATH);

const qRun = (sql, params=[]) => new Promise((resolve,reject)=>db.run(sql, params, function(err){ if(err) reject(err); else resolve(this); }));
const qAll = (sql, params=[]) => new Promise((resolve,reject)=>db.all(sql, params, (err,rows)=> err?reject(err):resolve(rows)));
const qGet = (sql, params=[]) => new Promise((resolve,reject)=>db.get(sql, params, (err,row)=> err?reject(err):resolve(row)));

async function hasColumn(table, column){
  const cols = await qAll(`PRAGMA table_info(${table})`);
  return cols.some(c=>c.name===column);
}
async function ensureColumn(table, column, decl){
  const cols = await qAll(`PRAGMA table_info(${table})`);
  if(!cols.some(c=>c.name===column)){
    console.log(`🔧 ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
    await qRun(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
  }
}
async function initDB(){
  await qRun(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE, password TEXT, role TEXT DEFAULT 'patient')`);
  await qRun(`CREATE TABLE IF NOT EXISTS doctor_records (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_email TEXT, raw TEXT, simplified TEXT, ts TEXT DEFAULT (datetime('now','localtime')))`);
  await ensureColumn('doctor_records','ts',`TEXT DEFAULT (datetime('now','localtime'))`);

  await qRun(`CREATE TABLE IF NOT EXISTS surgeries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_email TEXT,
    title TEXT,
    date TEXT,
    notes TEXT,
    simplified TEXT,
    ts TEXT DEFAULT (datetime('now','localtime'))
  )`);
  await ensureColumn('surgeries','patient_email',`TEXT`);
  await ensureColumn('surgeries','title',`TEXT`);
  await ensureColumn('surgeries','date',`TEXT`);
  await ensureColumn('surgeries','notes',`TEXT`);
  await ensureColumn('surgeries','simplified',`TEXT`);
  await ensureColumn('surgeries','ts',`TEXT DEFAULT (datetime('now','localtime'))`);
  await ensureColumn('surgeries','doctor_email',`TEXT`); // 있을 수도, 없을 수도 → 있으면 활용

  await qRun(`CREATE TABLE IF NOT EXISTS medications (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_email TEXT, name TEXT, time TEXT)`);
  await ensureColumn('medications','ts',`TEXT DEFAULT (datetime('now','localtime'))`);

  await qRun(`CREATE TABLE IF NOT EXISTS tests (id INTEGER PRIMARY KEY AUTOINCREMENT, patient_email TEXT, name TEXT, date TEXT)`);
  await ensureColumn('tests','ts',`TEXT DEFAULT (datetime('now','localtime'))`);
}

// -------------------- Auth --------------------
function signToken(payload){ return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }); }
function auth(req,res,next){
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ')? h.slice(7): null;
  if(!token) return res.status(401).json({ error:'NO_TOKEN' });
  try{ req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch{ return res.status(401).json({ error:'INVALID_TOKEN' }); }
}
function requireDoctor(req,res,next){
  if(req.user?.role!=='doctor' && req.user?.role!=='admin') return res.status(403).json({ error:'NEED_DOCTOR' });
  next();
}

// -------------------- OpenAI (선택) --------------------
async function callOpenAI(messages){
  const apiKey = process.env.OPENAI_API_KEY;
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  if(!apiKey) return null;
  try{
    const r = await fetch(`${base}/chat/completions`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', messages, temperature: 0.2 })
    });
    if(!r.ok){ console.error('[AI error]', r.status, await r.text()); return null; }
    const j = await r.json();
    return j?.choices?.[0]?.message?.content?.trim() || null;
  }catch(e){ console.error('[AI error]', e); return null; }
}
async function simplifyInstruction(rawText){
  const sys = { role:'system', content:
`너는 한국 병원 환자의 이해를 돕는 의료 안내 전문가다.  
대상 독자는 **나이가 많거나 의료 지식이 전혀 없는 환자**이며,  
**환자가 글을 읽자마자 바로 이해하고, 바로 실천할 수 있도록 안내하는 것**이 최우선 목표다.  

[작성 원칙]
- 반드시 존댓말 사용.  
- 초등학교 3학년도 이해할 수 있는 **짧은 단어**와 **짧은 문장** 사용.  
- 문장은 **한 줄 10~15자** 이내로 끊고, 한 문장에는 하나의 지시만.  
- **전문용어는 괄호 안에 원어 병기**. (예: 폐렴(폐에 염증))  
- 설명이 아니라 **“행동 지침”**을 중심으로 쓴다.  
  (예: “물을 하루 8잔 마시세요” / “열이 38도 이상이면 바로 병원 오세요”)  
- 환자가 가장 먼저 봐야 할 정보(위급 상황, 필수 행동)를 **맨 위**에 배치한다.  
- 불릿(-)을 활용해 시각적으로 구분한다.  

[섹션 구조]  
다음 여섯 가지 제목을 반드시 포함. 해당 사항이 없으면 “해당 없음”으로 표시한다.  
1. 진단  
2. 증상 요약 (오늘 상황을 한눈에)  
3. 약 복용 (언제, 어떻게, 주의사항)  
4. 검사 / 모니터링 (받을 검사, 관찰해야 할 증상)  
5. 생활수칙 (식습관, 운동, 휴식 등)  
6. 꼭 해야 할 일 (가장 먼저: 위급 상황 시 대처 방법)  

[특별 규칙]
- **“꼭 해야 할 일”** 항목 맨 앞에는 반드시 위급 상황 대처법을 넣는다.  
  (예: “호흡곤란·가슴통증·의식저하 시 즉시 119”)  
- 나머지 항목은 **환자가 집에서 바로 따라 할 수 있는 행동**만 쓴다.  
- 전문적인 배경 설명(질환 원인, 기전 등)은 생략한다.  
- 답변은 반드시 JSON {"simplified":"..."} 형태만 반환한다.  
`};
  const usr = { role:'user', content:
`원문 (의사용):
${String(rawText||'').slice(0,8000)}

위 형식에 맞춰 아주 쉽게 풀어써 주세요.` };
  const content = await callOpenAI([sys, usr]);
  if(!content) return `## 핵심 요약
- 약과 검사 일정을 지켜 주세요.
### 꼭 해야 할 일
- 증상이 심해지면 바로 병원이나 119에 연락하세요.`;
  try{ const o = JSON.parse(content); return (typeof o?.simplified==='string' && o.simplified.trim()) ? o.simplified : content; }
  catch{ return String(content); }
}

// -------------------- Auth APIs --------------------
app.post('/api/register', async (req,res)=>{
  const { email, password, role } = req.body || {};
  if(!email || !password) return res.status(400).json({ error:'MISSING_FIELDS' });
  try{
    await qRun('INSERT INTO users (email,password,role) VALUES (?,?,?)', [email,password,role||'patient']);
    res.json({ ok:true });
  }catch(e){
    if(String(e).includes('UNIQUE')) return res.status(409).json({ error:'DUP_EMAIL' });
    res.status(500).json({ error:'DB_ERROR' });
  }
});
app.post('/api/login', async (req,res)=>{
  const { email, password } = req.body || {};
  if(!email || !password) return res.status(400).json({ error:'MISSING_FIELDS' });
  const u = await qGet('SELECT * FROM users WHERE email=? AND password=?', [email,password]);
  if(!u) return res.status(401).json({ error:'INVALID_CREDENTIALS' });
  const token = signToken({ email:u.email, role:u.role||'patient' });
  res.json({ token, email:u.email, role:u.role||'patient' });
});

// -------------------- Doctor APIs --------------------
// 진단(지시)
app.post('/api/doctor', auth, requireDoctor, async (req,res)=>{
  try{
    const { email, instruction } = req.body || {};
    if(!email || !instruction) return res.status(400).json({ error:'MISSING_FIELDS' });
    const simplified = await simplifyInstruction(instruction);
    const r = await qRun('INSERT INTO doctor_records (patient_email,raw,simplified) VALUES (?,?,?)', [email, String(instruction), String(simplified)]);
    res.json({ ok:true, id:r.lastID });
  }catch(e){ console.error('[doctor]', e); res.status(500).json({ error:'DB_ERROR' }); }
});
app.get('/api/doctor/records', auth, requireDoctor, async (req,res)=>{
  try{
    const where=[]; const params=[];
    if(req.query.patient){ where.push('patient_email=?'); params.push(req.query.patient); }
    const rows = await qAll(`SELECT * FROM doctor_records ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY ts DESC`, params);
    res.json({ records: rows });
  }catch(e){ res.status(500).json({ error:'DB_ERROR' }); }
});

// 수술 등록(초강력 호환): NOT NULL/raw/doctor_email/legacy 스키마까지 모두 대응 + 트랜잭션 + 즉시 반환
app.post('/api/doctor/surgery', auth, requireDoctor, async (req,res)=>{
  const { email, title, date, notes } = req.body || {};
  if(!email || !title || !date) return res.status(400).json({ error:'MISSING_FIELDS' });

  const safeEmail = String(email).trim();
  const safeTitle = String(title).trim();
  const safeDate  = String(date).trim();
  const safeNotes = (notes==null) ? '' : String(notes);

  // 현재 테이블 구조 확인
  const cols = await qAll(`PRAGMA table_info(surgeries)`);
  const has = n => cols.some(c=>c.name===n);
  const nn  = n => {
    const c = cols.find(c=>c.name===n);
    return !!c && Number(c.notnull)===1 && (c.dflt_value==null || c.dflt_value===undefined);
  };

  // 필수 컬럼이 없다면 즉시 보강 (기존 기능 유지, 데이터 파괴 없음)
  async function ensure(name, decl){ if(!has(name)) await qRun(`ALTER TABLE surgeries ADD COLUMN ${name} ${decl}`); }
  try{
    await ensure('patient_email','TEXT');
    await ensure('title','TEXT');
    await ensure('date','TEXT');
    // 일부 DB에서 raw가 NOT NULL로 존재 → 메모(safeNotes)를 raw에 같이 넣어 충족
    if(!has('raw')) await qRun(`ALTER TABLE surgeries ADD COLUMN raw TEXT`);
    if(!has('notes')) await qRun(`ALTER TABLE surgeries ADD COLUMN notes TEXT`);
    if(!has('simplified')) await qRun(`ALTER TABLE surgeries ADD COLUMN simplified TEXT`);
    if(!has('ts')) await qRun(`ALTER TABLE surgeries ADD COLUMN ts TEXT DEFAULT (datetime('now','localtime'))`);
    // doctor_email 컬럼이 있는 환경도 지원
    if(!has('doctor_email')) await qRun(`ALTER TABLE surgeries ADD COLUMN doctor_email TEXT`);
  }catch(e){
    console.error('[surgery] ensure-columns', e);
    return res.status(500).json({ error:'DB_ERROR' });
  }

  // INSERT 컬럼/값 구성(존재/제약을 모두 만족)
  const insertCols = ['patient_email','title','date'];
  const values     = [safeEmail, safeTitle, safeDate];

  // doctor_email 있으면 포함(일부 환경에서 NOT NULL일 수 있음)
  if(has('doctor_email')) { insertCols.splice(1,0,'doctor_email'); values.splice(1,0,String(req.user.email||'')); }

  // raw: 존재하거나 NOT NULL이면 반드시 채움(= safeNotes)
  if(has('raw') || nn('raw')) { insertCols.push('raw'); values.push(safeNotes); }

  // notes: 있으면 함께 저장
  if(has('notes')) { insertCols.push('notes'); values.push(safeNotes); }

  // simplified: 있으면 저장(없어도 동작)
  let simplified = '';
  try{
    simplified = safeNotes ? await simplifyInstruction(safeNotes) : '';
  }catch{ simplified = ''; }
  if(has('simplified')) { insertCols.push('simplified'); values.push(String(simplified||'')); }

  // 트랜잭션으로 안전하게 처리 + tests에 [수술] 일정 미러링(요청하신 대로)
  const placeholders = insertCols.map(()=>'?').join(',');
  const sql = `INSERT INTO surgeries (${insertCols.join(',')}) VALUES (${placeholders})`;

  try{
    await qRun('BEGIN');
    const r = await qRun(sql, values);
    // 수술을 일정에도 바로 보이게: tests에 미러링
    await qRun('INSERT INTO tests (patient_email,name,date) VALUES (?,?,?)',
               [safeEmail, `[수술] ${safeTitle}`, safeDate]);
    await qRun('COMMIT');

    // 방금 저장한 레코드 간단히 반환(클라이언트가 즉시 목록 갱신 가능)
    res.json({ ok:true, id:r.lastID, surgery: { id:r.lastID, patient_email:safeEmail, title:safeTitle, date:safeDate } });
  }catch(e){
    await qRun('ROLLBACK').catch(()=>{});
    console.error('[surgery insert]', e);
    return res.status(500).json({ error:'DB_ERROR' });
  }
});

app.get('/api/doctor/surgeries', auth, requireDoctor, async (req,res)=>{
  try{
    const where=[]; const params=[];
    if(req.query.patient){ where.push('patient_email=?'); params.push(req.query.patient); }
    const rows = await qAll(`SELECT * FROM surgeries ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY date DESC, ts DESC`, params);
    res.json({ surgeries: rows });
  }catch(e){ res.status(500).json({ error:'DB_ERROR' }); }
});

// 일정: 생성 + 수정/삭제
app.post('/api/doctor/medication', auth, requireDoctor, async (req,res)=>{
  try{
    const { email, name, time } = req.body || {};
    if(!email || !name || !time) return res.status(400).json({ error:'MISSING_FIELDS' });
    const r = await qRun('INSERT INTO medications (patient_email,name,time) VALUES (?,?,?)',[email,String(name),String(time)]);
    res.json({ ok:true, id:r.lastID });
  }catch(e){ console.error('[medication]',e); res.status(500).json({ error:'DB_ERROR' }); }
});
app.patch('/api/doctor/medication/:id', auth, requireDoctor, async (req,res)=>{
  try{
    const { name, time } = req.body || {};
    if(!name || !time) return res.status(400).json({ error:'MISSING_FIELDS' });
    await qRun('UPDATE medications SET name=?, time=? WHERE id=?', [String(name), String(time), req.params.id]);
    res.json({ ok:true });
  }catch(e){ console.error('[medication PATCH]',e); res.status(500).json({ error:'DB_ERROR' }); }
});
app.delete('/api/doctor/medication/:id', auth, requireDoctor, async (req,res)=>{
  try{ await qRun('DELETE FROM medications WHERE id=?', [req.params.id]); res.json({ ok:true }); }
  catch(e){ console.error('[medication DEL]',e); res.status(500).json({ error:'DB_ERROR' }); }
});

app.post('/api/doctor/test', auth, requireDoctor, async (req,res)=>{
  try{
    const { email, name, date } = req.body || {};
    if(!email || !name || !date) return res.status(400).json({ error:'MISSING_FIELDS' });
    const r = await qRun('INSERT INTO tests (patient_email,name,date) VALUES (?,?,?)',[email,String(name),String(date)]);
    res.json({ ok:true, id:r.lastID });
  }catch(e){ console.error('[test]',e); res.status(500).json({ error:'DB_ERROR' }); }
});
app.patch('/api/doctor/test/:id', auth, requireDoctor, async (req,res)=>{
  try{
    const { name, date } = req.body || {};
    if(!name || !date) return res.status(400).json({ error:'MISSING_FIELDS' });
    await qRun('UPDATE tests SET name=?, date=? WHERE id=?', [String(name), String(date), req.params.id]);
    res.json({ ok:true });
  }catch(e){ console.error('[test PATCH]',e); res.status(500).json({ error:'DB_ERROR' }); }
});
app.delete('/api/doctor/test/:id', auth, requireDoctor, async (req,res)=>{
  try{ await qRun('DELETE FROM tests WHERE id=?', [req.params.id]); res.json({ ok:true }); }
  catch(e){ console.error('[test DEL]',e); res.status(500).json({ error:'DB_ERROR' }); }
});

// 의사: 환자 일정 조회(복약+검사+수술)
app.get('/api/doctor/schedules', auth, requireDoctor, async (req,res)=>{
  try{
    const email = req.query.patient;
    if(!email) return res.status(400).json({ error:'MISSING_PATIENT' });
    const medications = await qAll('SELECT * FROM medications WHERE patient_email=? ORDER BY time ASC, ts DESC', [email]);
    const tests       = await qAll('SELECT * FROM tests WHERE patient_email=? ORDER BY date ASC, ts DESC', [email]);
    const surgeries   = await qAll('SELECT id, title, date FROM surgeries WHERE patient_email=? ORDER BY date ASC, ts DESC', [email]);
    res.json({ medications, tests, surgeries });
  }catch(e){ console.error('[doctor schedules]', e); res.status(500).json({ error:'DB_ERROR' }); }
});

// -------------------- Patient APIs --------------------
app.get('/api/patient/records', auth, async (req,res)=>{
  const rows = await qAll('SELECT * FROM doctor_records WHERE patient_email=? ORDER BY ts DESC', [req.user.email]);
  res.json({ records: rows.map(r=>({ id:r.id, date:(r.ts||'').slice(0,10), raw:r.raw||'', simplified: typeof r.simplified==='string'? r.simplified : (r.simplified? String(r.simplified):'') })) });
});
app.get('/api/patient/surgeries', auth, async (req,res)=>{
  const rows = await qAll('SELECT * FROM surgeries WHERE patient_email=? ORDER BY date DESC, ts DESC', [req.user.email]);
  res.json({ surgeries: rows.map(s=>({ id:s.id, title:s.title, date:s.date, notes:s.notes||'', simplified: typeof s.simplified==='string'? s.simplified : (s.simplified? String(s.simplified):'') })) });
});
// 환자 일정: 복약+검사+🆕수술(정규화)
app.get('/api/patient/schedules', auth, async (req,res)=>{
  try{
    const medications = await qAll('SELECT * FROM medications WHERE patient_email=? ORDER BY time ASC, ts DESC', [req.user.email]);
    const tests       = await qAll('SELECT * FROM tests WHERE patient_email=? ORDER BY date ASC, ts DESC', [req.user.email]);
    const surgeries   = await qAll('SELECT id, title, date FROM surgeries WHERE patient_email=? ORDER BY date ASC, ts DESC', [req.user.email]);
    res.json({ medications, tests, surgeries });
  }catch(e){
    console.error('[patient schedules]', e);
    res.status(500).json({ error:'DB_ERROR' });
  }
});

// -------------------- Static --------------------
app.get('/', (req,res)=> res.sendFile(path.join(__dirname, 'index.html')));

// -------------------- Start --------------------
initDB()
  .then(()=> app.listen(PORT, ()=> console.log(`MediClear server running on http://localhost:${PORT}`)))
  .catch((e)=>{ console.error('DB init failed', e); process.exit(1); });
