export const supervisorIds=[10,11,12,13];
export const nationalities=[
 {name:"هندي",language:"hi",nameEn:"Indian"},
 {name:"بنجلاديشي",language:"bn",nameEn:"Bangladeshi"},
 {name:"عربي",language:"ar",nameEn:"Arab"},
 {name:"مصري",language:"ar",nameEn:"Egyptian"},
 {name:"باكستاني",language:"ur",nameEn:"Pakistani"},
 {name:"نيبالي",language:"ne",nameEn:"Nepalese"},
 {name:"فلبيني",language:"fil",nameEn:"Filipino"},
];
export function plusDays(day,n){const date=new Date(day+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10);}
export function weekStart(){const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Riyadh",numberingSystem:"latn",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const day=new Date(today+"T00:00:00Z").getUTCDay();return plusDays(today,-((day+1)%7));}
export function makeWorkers(){return Array.from({length:400},(_,i)=>{
 const id=i+1,nation=nationalities[i%7];
 let group=id<=220?"restaurant":id<=320?"workshop":id<=380?"park":"admin";
 let mask=group==="restaurant"?4:group==="workshop"?(id%3===0?2:1):group==="park"?8:1;
 if(id<=15)mask=id;
 else if(group==="restaurant"&&id%5===0)mask|=id%2?1:2;
 else if(group==="workshop"&&id%3===0)mask|=id%2?4:8;
 else if(group==="park"&&id%7===0)mask|=1;
 if(id<=15)group=(mask&3)?"workshop":(mask&4)?"restaurant":"park";
 const locationId=group==="restaurant"?1+(i%18):group==="workshop"?19+(i%9):group==="park"?28:29;
 const centerId=group==="restaurant"?1:group==="workshop"?(locationId<=24?3:4):group==="park"?2:5;
 return {id,employeeId:`W${String(id).padStart(4,"0")}`,fingerprintId:String(700000+id),nameAr:`عامل ${nation.name} ${id}`,nameEn:`${nation.nameEn} Test Worker ${id}`,nationality:nation.name,preferredLanguage:id%13===0?"en":nation.language,departmentId:locationId,jobTitleId:locationId,locationId,userId:id===16?25:null,hireDate:"2026-01-01",status:"active",isActive:1,mask,group,centerId,requiredMinutes:group==="admin"?480:540,restDay:(id+5)%7};
});}
export function intervals(worker){
 if(worker.group==="admin")return[{supervisorId:10,startTime:"08:30",endTime:"17:00",breakMinutes:30,plannedMinutes:480}];
 const morning=[0,1].filter(bit=>worker.mask&(1<<bit)),evening=[2,3].filter(bit=>worker.mask&(1<<bit));
 const result=[];
 if(morning.length&&evening.length){
  morning.forEach((bit,index)=>result.push({supervisorId:supervisorIds[bit],startTime:morning.length===1?"05:00":index?"07:30":"05:00",endTime:morning.length===1?"10:00":index?"10:00":"07:30",breakMinutes:0,plannedMinutes:300/morning.length}));
  evening.forEach((bit,index)=>result.push({supervisorId:supervisorIds[bit],startTime:evening.length===1?"16:00":index?"18:00":"16:00",endTime:evening.length===1?"20:30":index?"20:30":"18:00",breakMinutes:index===evening.length-1?30:0,plannedMinutes:240/evening.length}));
 }else if(morning.length){
  morning.forEach((bit,index)=>result.push({supervisorId:supervisorIds[bit],startTime:morning.length===1?"05:00":index?"09:30":"05:00",endTime:morning.length===1?"14:30":index?"14:30":"09:30",breakMinutes:index===morning.length-1?30:0,plannedMinutes:540/morning.length}));
 }else{
  evening.forEach((bit,index)=>result.push({supervisorId:supervisorIds[bit],startTime:evening.length===1?(worker.id%2?"15:30":"16:00"):index?"20:00":"15:30",endTime:evening.length===1?(worker.id%2?"01:00":"01:30"):index?"01:00":"20:00",breakMinutes:index===evening.length-1?30:0,plannedMinutes:540/evening.length}));
 }
 return result;
}
export function validateFixture(){
 const workers=makeWorkers();
 if(workers.length!==400||new Set(workers.map(w=>w.id)).size!==400)throw new Error("Worker count mismatch");
 for(const w of workers){const periods=intervals(w);if(periods.reduce((sum,p)=>sum+p.plannedMinutes,0)!==w.requiredMinutes||periods.reduce((sum,p)=>sum+p.breakMinutes,0)!==30)throw new Error("Invalid budget "+w.id);}
 const masks=Array.from(new Set(workers.map(w=>w.mask))).sort((a,b)=>a-b);
 if(masks.length!==15)throw new Error("Not all supervisor combinations covered");
 return {workers:workers.length,supervisorCombinations:masks.length,languages:Array.from(new Set(workers.map(w=>w.preferredLanguage))),centers:workers.reduce((all,w)=>(all[w.centerId]=(all[w.centerId]||0)+1,all),{})};
}
