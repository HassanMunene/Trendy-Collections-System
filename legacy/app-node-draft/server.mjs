import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize } from 'node:path';
import { openDb, transaction, audit } from './db.mjs';
import { hashPassword, verifyPassword, sessionToken, tokenHash } from './security.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const db = openDb();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const loginFailures = new Map();

class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new ApiError(status, message); };
const str = (x, name, max = 120) => {
  if (typeof x !== 'string' || !x.trim() || x.trim().length > max) fail(400, `${name} is required (max ${max} characters)`);
  return x.trim();
};
const optional = (x, max = 120) => typeof x === 'string' ? x.trim().slice(0, max) : '';
const int = (x, name, min = 0) => {
  if (!Number.isSafeInteger(x) || x < min) fail(400, `${name} must be an integer ≥ ${min}`);
  return x;
};
const enumValue = (x, allowed, name) => allowed.includes(x) ? x : fail(400, `Invalid ${name}`);
const one = (sql, ...args) => db.prepare(sql).get(...args);
const all = (sql, ...args) => db.prepare(sql).all(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);

function json(res, status, data, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415, 'JSON request required');
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 64_000) fail(413, 'Request too large');
  }
  try { return JSON.parse(text || '{}'); } catch { fail(400, 'Invalid JSON'); }
}
function currentUser(req) {
  const cookie = req.headers.cookie?.match(/(?:^|;\s*)tc_session=([^;]+)/)?.[1];
  if (!cookie) return null;
  return one(`SELECT u.id,u.username,u.name,u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at > CURRENT_TIMESTAMP AND u.active=1`, tokenHash(cookie));
}
function requireUser(req, roles) {
  const user = currentUser(req);
  if (!user) fail(401, 'Sign in required');
  if (roles && !roles.includes(user.role)) fail(403, 'Your role cannot do this');
  return user;
}
function checkMutation(req) {
  if (req.headers['x-trendy-request'] !== '1') fail(403, 'Request header required');
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}` && origin !== `https://${req.headers.host}`) fail(403, 'Invalid origin');
}
function balance(rollId) {
  return one('SELECT r.received_cm + COALESCE(SUM(m.change_cm),0) AS cm FROM rolls r LEFT JOIN roll_movements m ON m.roll_id=r.id WHERE r.id=? GROUP BY r.id', rollId)?.cm;
}
function jobDetail(id) {
  const job = one(`SELECT j.*, a.name AS assigned_name, c.name AS created_name, f.remaining_qty AS finished_remaining
    FROM jobs j LEFT JOIN users a ON a.id=j.assigned_to JOIN users c ON c.id=j.created_by
    LEFT JOIN finished_stock f ON f.job_id=j.id WHERE j.id=?`, id);
  if (!job) fail(404, 'Job not found');
  job.cuts = all(`SELECT c.*,r.tag,f.code,f.material_type,f.texture,f.color,u.name AS cut_name,
    COALESCE((SELECT SUM(sewn_cm) FROM sewing_entries s WHERE s.cut_id=c.id),0) AS sewn_cm
    FROM cuts c JOIN rolls r ON r.id=c.roll_id JOIN fabrics f ON f.id=r.fabric_id
    JOIN users u ON u.id=c.cut_by WHERE c.job_id=? ORDER BY c.id`, id);
  job.sewing = all(`SELECT s.*,u.name AS worker_name,r.tag,f.material_type,f.texture,f.color FROM sewing_entries s
    JOIN users u ON u.id=s.worker_id JOIN cuts c ON c.id=s.cut_id JOIN rolls r ON r.id=c.roll_id
    JOIN fabrics f ON f.id=r.fabric_id WHERE s.job_id=? ORDER BY s.id`, id);
  return job;
}

async function api(req, res, path) {
  const method = req.method;
  if (method !== 'GET') checkMutation(req);
  if (path === '/api/login' && method === 'POST') {
    const data = await body(req);
    const username = str(data.username, 'Username', 80);
    const key = `${req.socket.remoteAddress}:${username.toLowerCase()}`;
    const entry = loginFailures.get(key);
    if (entry && entry.count >= 8 && Date.now() - entry.time < 15 * 60_000) fail(429, 'Too many attempts; wait 15 minutes');
    const user = one('SELECT * FROM users WHERE username=? AND active=1', username);
    if (!user || !verifyPassword(data.password, user.password_hash)) {
      loginFailures.set(key, { count: (entry?.count || 0) + 1, time: Date.now() });
      fail(401, 'Incorrect username or password');
    }
    loginFailures.delete(key);
    const token = sessionToken();
    run("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,datetime('now','+7 days'))", tokenHash(token), user.id);
    json(res, 200, { user: { id:user.id, username:user.username, name:user.name, role:user.role } }, {
      'set-cookie': `tc_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${req.socket.encrypted ? '; Secure' : ''}`
    }); return;
  }
  if (path === '/api/me' && method === 'GET') { json(res, 200, { user: currentUser(req) }); return; }
  if (path === '/api/logout' && method === 'POST') {
    const cookie = req.headers.cookie?.match(/(?:^|;\s*)tc_session=([^;]+)/)?.[1];
    if (cookie) run('DELETE FROM sessions WHERE token_hash=?', tokenHash(cookie));
    json(res, 200, { ok:true }, { 'set-cookie':'tc_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); return;
  }
  const user = requireUser(req);
  if (path === '/api/users' && method === 'GET') {
    json(res, 200, all('SELECT id,username,name,role,active,created_at FROM users ORDER BY name')); return;
  }
  if (path === '/api/users' && method === 'POST') {
    requireUser(req, ['owner']);
    const d = await body(req);
    const username = str(d.username, 'Username', 80), name = str(d.name, 'Name', 120);
    const role = enumValue(d.role, ['owner','manager','cashier','cutter','tailor'], 'role');
    const hash = hashPassword(d.password);
    const id = transaction(db, () => {
      const id = Number(run('INSERT INTO users(username,name,role,password_hash) VALUES (?,?,?,?)',username,name,role,hash).lastInsertRowid);
      audit(db,user.id,'create','user',id,{username,role}); return id;
    });
    json(res,201,{id}); return;
  }
  if (path === '/api/fabrics' && method === 'GET') {
    json(res,200,all('SELECT * FROM fabrics ORDER BY id DESC')); return;
  }
  if (path === '/api/fabrics' && method === 'POST') {
    requireUser(req,['owner','manager','cashier']);
    const d=await body(req);
    const values=[str(d.code,'Code',40),enumValue(d.category,['curtain','shia','pillow_case','other'],'category'),
      str(d.material_type,'Material type',60),str(d.texture,'Texture',60),str(d.color,'Colour',60),optional(d.design,100),
      d.width_cm == null || d.width_cm === '' ? null : int(d.width_cm,'Width cm',1),user.id];
    const id=transaction(db,()=>{const id=Number(run(`INSERT INTO fabrics(code,category,material_type,texture,color,design,width_cm,created_by)
      VALUES (?,?,?,?,?,?,?,?)`,...values).lastInsertRowid);audit(db,user.id,'create','fabric',id,{code:values[0]});return id;});
    json(res,201,{id}); return;
  }
  if (path === '/api/rolls' && method === 'GET') {
    json(res,200,all(`SELECT r.*,f.code,f.category,f.material_type,f.texture,f.color,f.design,
      r.received_cm+COALESCE(SUM(m.change_cm),0) AS balance_cm
      FROM rolls r JOIN fabrics f ON f.id=r.fabric_id LEFT JOIN roll_movements m ON m.roll_id=r.id
      GROUP BY r.id ORDER BY r.id DESC`)); return;
  }
  if (path === '/api/rolls' && method === 'POST') {
    requireUser(req,['owner','manager','cashier','cutter']);
    const d=await body(req);
    const fabricId=int(d.fabric_id,'Fabric',1); if(!one('SELECT id FROM fabrics WHERE id=?',fabricId)) fail(400,'Fabric not found');
    const values=[str(d.tag,'Roll tag',40),fabricId,optional(d.supplier,120),
      d.stated_cm == null || d.stated_cm === '' ? null : int(d.stated_cm,'Stated cm',1),
      int(d.received_cm,'Received cm',1),int(d.cost_cents ?? 0,'Cost cents'),optional(d.location,80)||'Main shop',user.id];
    const id=transaction(db,()=>{const id=Number(run(`INSERT INTO rolls(tag,fabric_id,supplier,stated_cm,received_cm,cost_cents,location,received_by)
      VALUES (?,?,?,?,?,?,?,?)`,...values).lastInsertRowid);audit(db,user.id,'receive','roll',id,{cm:values[4]});return id;});
    json(res,201,{id}); return;
  }
  if (path === '/api/jobs' && method === 'GET') {
    json(res,200,all(`SELECT j.*,u.name AS assigned_name,fs.remaining_qty AS finished_remaining FROM jobs j
      LEFT JOIN users u ON u.id=j.assigned_to LEFT JOIN finished_stock fs ON fs.job_id=j.id ORDER BY j.id DESC`)); return;
  }
  if (path === '/api/jobs' && method === 'POST') {
    requireUser(req,['owner','manager','cashier']);
    const d=await body(req);
    const assigned=d.assigned_to == null || d.assigned_to === '' ? null : int(d.assigned_to,'Assigned worker',1);
    if(assigned && !one('SELECT id FROM users WHERE id=? AND active=1',assigned)) fail(400,'Worker not found');
    const values=[str(d.ref,'Job reference',40),str(d.customer,'Customer',120),optional(d.room,100),
      enumValue(d.output_type,['set','piece','shia','pillow_case'],'output type'),int(d.output_qty,'Output quantity',1),
      d.width_cm ? int(d.width_cm,'Width cm',1):null,d.drop_cm ? int(d.drop_cm,'Drop cm',1):null,
      assigned,optional(d.note,500),user.id];
    const id=transaction(db,()=>{const id=Number(run(`INSERT INTO jobs(ref,customer,room,output_type,output_qty,width_cm,drop_cm,assigned_to,note,created_by)
      VALUES (?,?,?,?,?,?,?,?,?,?)`,...values).lastInsertRowid);audit(db,user.id,'create','job',id,{ref:values[0]});return id;});
    json(res,201,{id}); return;
  }
  const jobMatch=path.match(/^\/api\/jobs\/(\d+)(?:\/(cuts|sewing|finish))?$/);
  if (jobMatch) {
    const id=Number(jobMatch[1]),action=jobMatch[2];
    if(!action && method==='GET'){json(res,200,jobDetail(id));return;}
    requireUser(req,action==='finish'?['owner','manager','tailor']:['owner','manager','cutter','tailor']);
    const d=await body(req);
    if(action==='cuts' && method==='POST'){
      const rollId=int(d.roll_id,'Roll',1),cut=int(d.cut_cm,'Cut cm',1),used=int(d.used_cm,'Used cm'),
        offcut=int(d.offcut_cm,'Offcut cm'),waste=int(d.waste_cm,'Waste cm');
      if(cut!==used+offcut+waste) fail(400,'Cut must equal used + offcut + waste');
      const result=transaction(db,()=>{
        const job=one('SELECT status FROM jobs WHERE id=?',id); if(!job) fail(404,'Job not found');
        if(job.status==='finished') fail(409,'Job already finished');
        const available=balance(rollId); if(available==null) fail(404,'Roll not found');
        if(available<cut) fail(409,`Only ${(available/100).toFixed(2)} m remain on this roll`);
        const cutId=Number(run('INSERT INTO cuts(job_id,roll_id,cut_cm,used_cm,offcut_cm,waste_cm,cut_by) VALUES (?,?,?,?,?,?,?)',id,rollId,cut,used,offcut,waste,user.id).lastInsertRowid);
        run('INSERT INTO roll_movements(roll_id,change_cm,kind,ref_type,ref_id,actor_id) VALUES (?,?,?,?,?,?)',rollId,-cut,'cut','cut',cutId,user.id);
        run("UPDATE jobs SET status='in_progress' WHERE id=?",id);
        audit(db,user.id,'cut','job',id,{cut_id:cutId,roll_id:rollId,cut_cm:cut});return cutId;
      });json(res,201,{id:result,job:jobDetail(id)});return;
    }
    if(action==='sewing' && method==='POST'){
      const cutId=int(d.cut_id,'Cut',1),cm=int(d.sewn_cm,'Sewn cm',1);
      const result=transaction(db,()=>{
        const job=one('SELECT status FROM jobs WHERE id=?',id); if(!job) fail(404,'Job not found');
        if(job.status==='finished') fail(409,'Job already finished');
        const cutRow=one('SELECT used_cm FROM cuts WHERE id=? AND job_id=?',cutId,id); if(!cutRow) fail(400,'Cut not on this job');
        const done=one('SELECT COALESCE(SUM(sewn_cm),0) AS n FROM sewing_entries WHERE cut_id=?',cutId).n;
        if(done+cm>cutRow.used_cm) fail(409,'Sewn metres exceed material used on this cut');
        const entryId=Number(run('INSERT INTO sewing_entries(job_id,cut_id,sewn_cm,worker_id) VALUES (?,?,?,?)',id,cutId,cm,user.id).lastInsertRowid);
        audit(db,user.id,'sew','job',id,{entry_id:entryId,cut_id:cutId,sewn_cm:cm});return entryId;
      });json(res,201,{id:result,job:jobDetail(id)});return;
    }
    if(action==='finish' && method==='POST'){
      transaction(db,()=>{
        const job=one('SELECT * FROM jobs WHERE id=?',id); if(!job) fail(404,'Job not found');
        if(job.status==='finished') fail(409,'Job already finished');
        const cuts=all('SELECT id,used_cm FROM cuts WHERE job_id=?',id);
        if(!cuts.length) fail(409,'Record material cuts first');
        if(cuts.some(c=>one('SELECT COALESCE(SUM(sewn_cm),0) AS n FROM sewing_entries WHERE cut_id=?',c.id).n!==c.used_cm))
          fail(409,'All used material must be recorded as sewn before finishing');
        run("UPDATE jobs SET status='finished',finished_by=?,finished_at=CURRENT_TIMESTAMP WHERE id=?",user.id,id);
        run('INSERT INTO finished_stock(job_id,output_type,initial_qty,remaining_qty) VALUES (?,?,?,?)',id,job.output_type,job.output_qty,job.output_qty);
        audit(db,user.id,'finish','job',id,{output_type:job.output_type,qty:job.output_qty});
      });json(res,200,{job:jobDetail(id)});return;
    }
  }
  if(path==='/api/sales' && method==='GET'){
    json(res,200,all(`SELECT s.*,u.name AS sold_by_name FROM sales s JOIN users u ON u.id=s.sold_by ORDER BY s.id DESC`));return;
  }
  if(path==='/api/sales' && method==='POST'){
    requireUser(req,['owner','manager','cashier']);
    const d=await body(req),source=enumValue(d.source_type,['roll','finished'],'source type');
    const sourceId=int(d.source_id,'Source',1),qty=int(d.quantity,'Quantity',1),price=int(d.unit_price_cents,'Unit price cents');
    const methodChoice=enumValue(d.payment_method,['cash','unpaid'],'payment method');
    const total=source==='roll'?Math.round(qty*price/100):qty*price;
    const saleId=transaction(db,()=>{
      if(source==='roll'){
        const available=balance(sourceId);if(available==null) fail(404,'Roll not found');
        if(available<qty) fail(409,'Not enough metres remain on this roll');
      }else{
        const stock=one('SELECT remaining_qty FROM finished_stock WHERE id=?',sourceId);
        if(!stock) fail(404,'Finished stock not found');
        if(stock.remaining_qty<qty) fail(409,'Not enough finished stock');
      }
      const saleId=Number(run('INSERT INTO sales(ref,customer,total_cents,paid_cents,payment_method,sold_by) VALUES (?,?,?,?,?,?)',
        str(d.ref,'Sale reference',40),optional(d.customer,120)||'Walk-in',total,methodChoice==='cash'?total:0,methodChoice,user.id).lastInsertRowid);
      run('INSERT INTO sale_lines(sale_id,source_type,source_id,quantity,unit,unit_price_cents,line_total_cents) VALUES (?,?,?,?,?,?,?)',
        saleId,source,sourceId,qty,source==='roll'?'cm':'piece',price,total);
      if(source==='roll') run('INSERT INTO roll_movements(roll_id,change_cm,kind,ref_type,ref_id,actor_id) VALUES (?,?,?,?,?,?)',sourceId,-qty,'sale','sale',saleId,user.id);
      else run('UPDATE finished_stock SET remaining_qty=remaining_qty-? WHERE id=?',qty,sourceId);
      audit(db,user.id,'sell','sale',saleId,{source,source_id:sourceId,quantity:qty,total_cents:total});return saleId;
    });json(res,201,{id:saleId});return;
  }
  if(path==='/api/team' && method==='GET'){
    requireUser(req,['owner','manager']);
    json(res,200,{rows:all(`SELECT s.id,s.created_at,u.name AS worker,j.ref AS job_ref,j.customer,
      f.category,f.material_type,f.texture,f.color,r.tag,s.sewn_cm
      FROM sewing_entries s JOIN users u ON u.id=s.worker_id JOIN jobs j ON j.id=s.job_id
      JOIN cuts c ON c.id=s.cut_id JOIN rolls r ON r.id=c.roll_id JOIN fabrics f ON f.id=r.fabric_id
      ORDER BY s.id DESC LIMIT 200`),
      totals:all(`SELECT u.id,u.name,COALESCE(SUM(s.sewn_cm),0) AS sewn_cm FROM users u
      LEFT JOIN sewing_entries s ON s.worker_id=u.id AND date(s.created_at,'+3 hours')=date('now','+3 hours')
      GROUP BY u.id ORDER BY sewn_cm DESC,u.name`)});return;
  }
  if(path==='/api/dashboard' && method==='GET'){
    const rollSummary=one(`SELECT COUNT(*) AS rolls,COALESCE(SUM(r.received_cm + COALESCE(m.delta,0)),0) AS balance_cm
      FROM rolls r LEFT JOIN (SELECT roll_id,SUM(change_cm) AS delta FROM roll_movements GROUP BY roll_id) m ON m.roll_id=r.id`);
    json(res,200,{
      ...rollSummary,
      open_jobs:one("SELECT COUNT(*) AS n FROM jobs WHERE status!='finished'").n,
      finished_today:one("SELECT COALESCE(SUM(output_qty),0) AS n FROM jobs WHERE status='finished' AND date(finished_at,'+3 hours')=date('now','+3 hours')").n,
      sewn_today_cm:one("SELECT COALESCE(SUM(sewn_cm),0) AS n FROM sewing_entries WHERE date(created_at,'+3 hours')=date('now','+3 hours')").n,
      sales_today_cents:one("SELECT COALESCE(SUM(total_cents),0) AS n FROM sales WHERE date(created_at,'+3 hours')=date('now','+3 hours')").n,
      recent:all(`SELECT a.created_at,a.action,a.entity,a.entity_id,u.name AS actor FROM audit_events a
        JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 12`)
    });return;
  }
  fail(404,'API route not found');
}

async function staticFile(res,path) {
  const file=path==='/'?'index.html':normalize(path).replace(/^\/+/, '');
  if(file.includes('..') || !['index.html','app.js','style.css'].includes(file)) fail(404,'Not found');
  const content=await readFile(join(root,'public',file));
  const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';
  res.writeHead(200,{'content-type':`${mime}; charset=utf-8`,'cache-control':'no-store'});res.end(content);
}
export const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,`http://${req.headers.host || 'localhost'}`).pathname;
    if(path.startsWith('/api/')) await api(req,res,path);
    else if(req.method==='GET') await staticFile(res,path);
    else fail(405,'Method not allowed');
  }catch(error){
    const status=error.status || (error.code==='SQLITE_CONSTRAINT_UNIQUE'?409:500);
    if(status===500) console.error(error);
    json(res,status,{error:status===500?'Server error':error.message});
  }
});

if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]){
  server.listen(port,host,()=>console.log(`Trendy Collections running at http://${host}:${port}`));
}
