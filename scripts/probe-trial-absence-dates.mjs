import { connect } from './trial-database.mjs';
const c=await connect();
try {
 for(const [name,sql,args] of [
 ['requests','SELECT id,workerId,leaveKind,startDate,endDate,status FROM requests WHERE workerId IN (4,101,106,107) ORDER BY id',[]],
 ['assignments','SELECT id,workerId,workDate,startTime,endTime,status FROM shift_assignments WHERE workerId IN (4,101,106,107) AND workDate BETWEEN ? AND ? ORDER BY workerId,workDate',['2026-10-10','2026-10-24']],
 ]){const [rows]=await c.query(sql,args);console.log(name,JSON.stringify(rows));}
}finally{await c.end();}
