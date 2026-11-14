import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, RefreshCw, Search, X } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/_core/hooks/useAuth';
import { useLanguage } from '@/lib/i18n';
import { riyadhDateKey } from '@/lib/operational-date';
import { trpc } from '@/lib/trpc';
import { formatDateTime, normalizeDigits } from '@shared/display-format';
import { permits } from '@shared/access-control';

type Status = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'unknown';
type Kind = 'weekly' | 'update';
type DeliveryRow = {
  id: number; workerId: number; employeeId: string; workerName: string; phoneEnding: string | null;
  kind: Kind; periodId: number; weekStart: string; workDate: string | null; status: Status;
  createdAt: Date | string; statusAt: Date | string | null; sentAt: Date | string | null;
  deliveredAt: Date | string | null; readAt: Date | string | null; failedAt: Date | string | null;
  errorCode: string | number | null; errorSummary: string | null; branchId: number | null;
  branchName: string | null; locationName: string | null; departmentName: string | null;
  supervisorName: string | null; multipleDestinations: boolean | number;
};

const selectClass='h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
const pageSize=25;
const labels = {
  ar: {
    title:'متابعة رسائل واتساب', subtitle:'تابع حالة رسائل الجداول والتعديلات لكل موظف.', refresh:'تحديث', forbidden:'هذه الصفحة متاحة لمسؤول النظام والشؤون الإدارية المصرح لها بكامل نطاق العمال.',
    all:'جميع الرسائل', pending:'بانتظار الإرسال', sent:'بانتظار تأكيد التسليم', delivered:'تم التسليم', read:'تمت القراءة', failed:'فشل الإرسال', unknown:'الحالة غير مؤكدة',
    countsNote:'الرسالة المقروءة تدخل أيضًا ضمن الرسائل المسلّمة. عدم ظهور القراءة لا يعني أن الموظف لم يقرأها.', webhookOff:'استقبال إشعارات Meta غير مهيأ في هذا الخادم؛ لن تُحدَّث حالات التسليم حتى يكتمل الإعداد والربط لدى Meta.', webhookUnknown:'تحقق من ربط إشعارات Meta واختبرها للتأكد من تحديث الحالات. الرسائل السابقة التي لم تُسجّل حالتها لن يظهر لها تأكيد تلقائيًا.',
    week:'أسبوع الجدول', previous:'الأسبوع السابق', next:'الأسبوع التالي', search:'البحث عن موظف', searchPlaceholder:'اسم الموظف أو الرقم الوظيفي', type:'نوع الرسالة', allTypes:'جميع الأنواع', weekly:'الجدول الأسبوعي', update:'تعديل الدوام',
    filters:'تصفية إضافية', closeFilters:'إخفاء التصفية الإضافية', branch:'مركز التكلفة', location:'الموقع', department:'القسم', supervisor:'المشرف', status:'حالة الرسالة', allOptions:'الكل', multiple:'وجهات متعددة', noOrg:'بعض خيارات التصفية تتطلب صلاحية عرض الهيكل التنظيمي.', noUsers:'تصفية المشرف تتطلب صلاحية عرض المستخدمين.', filterError:'تعذر تحميل بعض خيارات التصفية. حاول تحديث الصفحة.',
    dates:'بدل الأسبوع: البحث بتاريخ طلب الإرسال', from:'من تاريخ', to:'إلى تاريخ', datesHint:'عند اختيار التاريخين، يُستخدم تاريخ طلب الإرسال بدل أسبوع الجدول.', dateError:'أدخل تاريخ بداية ونهاية صحيحين، على أن تكون النهاية بعد البداية أو مساوية لها.', clear:'مسح التصفية',
    results:'النتائج', employee:'الموظف', phone:'نهاية الهاتف', sentAt:'وقت الإرسال', currentStatus:'الحالة', actions:'التفاصيل', view:'عرض', loading:'جارٍ تحميل الرسائل…', empty:'لا توجد رسائل تطابق خيارات البحث.', error:'تعذر تحميل الرسائل.', retry:'إعادة المحاولة', page:'صفحة', of:'من',
    details:'تفاصيل الرسالة', detailsHint:'حالة الرسالة وفق آخر إشعار تم استلامه من Meta.', close:'إغلاق', weekStart:'بداية الأسبوع', workDate:'يوم التعديل', createdAt:'تاريخ الطلب', statusAt:'آخر تحديث', deliveredAt:'وقت التسليم', readAt:'وقت القراءة', failedAt:'وقت الفشل', reason:'سبب الفشل', code:'رمز الخطأ', missing:'غير متاح',
  },
  en: {
    title:'WhatsApp message tracking', subtitle:'Track schedule and update messages for each employee.', refresh:'Refresh', forbidden:'This page is available to system administrators and HR with organization-wide approval access.',
    all:'All messages', pending:'Waiting to send', sent:'Awaiting delivery confirmation', delivered:'Delivered', read:'Read', failed:'Failed', unknown:'Status unknown',
    countsNote:'Read messages are also counted as delivered. An absent read status does not mean the employee has not read the message.', webhookOff:'Meta status callbacks are not configured on this server; delivery updates require configuration and subscription in Meta.', webhookUnknown:'Verify and test the Meta callback subscription. Earlier messages without recorded statuses will not automatically show confirmation.',
    week:'Schedule week', previous:'Previous week', next:'Next week', search:'Find employee', searchPlaceholder:'Employee name or number', type:'Message type', allTypes:'All types', weekly:'Weekly schedule', update:'Schedule update',
    filters:'More filters', closeFilters:'Hide additional filters', branch:'Cost center', location:'Location', department:'Department', supervisor:'Supervisor', status:'Message status', allOptions:'All', multiple:'Multiple destinations', noOrg:'Some filters require permission to view organizational structure.', noUsers:'The supervisor filter requires permission to view users.', filterError:'Some filter options could not be loaded. Try refreshing the page.',
    dates:'Instead of week: search by request date', from:'From date', to:'To date', datesHint:'When both dates are set, the request date range replaces the schedule week.', dateError:'Enter valid start and end dates, with the end on or after the start.', clear:'Clear filters',
    results:'Results', employee:'Employee', phone:'Phone ending', sentAt:'Sent at', currentStatus:'Status', actions:'Details', view:'View', loading:'Loading messages…', empty:'No messages match your filters.', error:'Could not load messages.', retry:'Try again', page:'Page', of:'of',
    details:'Message details', detailsHint:'Message status according to the latest notification received from Meta.', close:'Close', weekStart:'Week starts', workDate:'Changed day', createdAt:'Requested at', statusAt:'Last update', deliveredAt:'Delivered at', readAt:'Read at', failedAt:'Failed at', reason:'Failure reason', code:'Error code', missing:'Not available',
  },
  ur: {
    title:'واٹس ایپ پیغامات کی نگرانی', subtitle:'ہر ملازم کے شیڈول اور تبدیلی کے پیغام کی حالت دیکھیں۔', refresh:'تازہ کریں', forbidden:'یہ صفحہ سسٹم ایڈمنسٹریٹر اور مکمل دائرہ اختیار رکھنے والے مجاز انتظامی عملے کے لیے ہے۔',
    all:'تمام پیغامات', pending:'ارسال کا انتظار', sent:'ترسیل کی تصدیق کا انتظار', delivered:'موصول ہو گیا', read:'پڑھ لیا گیا', failed:'ارسال ناکام', unknown:'حالت غیر مصدقہ',
    countsNote:'پڑھے گئے پیغامات موصول ہونے والے پیغامات میں بھی شامل ہیں۔ پڑھنے کی اطلاع نہ ہونے کا مطلب یہ نہیں کہ پیغام نہیں پڑھا گیا۔', webhookOff:'اس سرور پر Meta کی اطلاعات کی ترتیب مکمل نہیں ہے؛ ترسیل کی حالت کے لیے Meta سے رابطہ ترتیب دیں۔', webhookUnknown:'Meta کی اطلاع کی ترتیب جانچیں۔ پرانے پیغامات جن کی حالت محفوظ نہیں ہوئی، ان کی تصدیق خودکار طور پر ظاہر نہیں ہوگی۔',
    week:'شیڈول کا ہفتہ', previous:'پچھلا ہفتہ', next:'اگلا ہفتہ', search:'ملازم تلاش کریں', searchPlaceholder:'ملازم کا نام یا نمبر', type:'پیغام کی قسم', allTypes:'تمام اقسام', weekly:'ہفتہ وار شیڈول', update:'شیڈول کی تبدیلی',
    filters:'مزید فلٹر', closeFilters:'اضافی فلٹر چھپائیں', branch:'لاگت مرکز', location:'مقام', department:'شعبہ', supervisor:'سپروائزر', status:'پیغام کی حالت', allOptions:'تمام', multiple:'متعدد مقامات', noOrg:'کچھ فلٹر کے لیے تنظیمی ڈھانچہ دیکھنے کی اجازت درکار ہے۔', noUsers:'سپروائزر فلٹر کے لیے صارفین دیکھنے کی اجازت درکار ہے۔', filterError:'کچھ فلٹر لوڈ نہیں ہو سکے۔ صفحہ تازہ کریں۔',
    dates:'ہفتے کے بجائے: درخواست کی تاریخ سے تلاش', from:'ابتدائی تاریخ', to:'آخری تاریخ', datesHint:'دونوں تاریخیں منتخب کرنے پر شیڈول کے ہفتے کے بجائے درخواست کی تاریخ استعمال ہوگی۔', dateError:'درست ابتدائی اور آخری تاریخ درج کریں۔', clear:'فلٹر صاف کریں',
    results:'نتائج', employee:'ملازم', phone:'فون کے آخری ہندسے', sentAt:'ارسال کا وقت', currentStatus:'حالت', actions:'تفصیلات', view:'دیکھیں', loading:'پیغامات لوڈ ہو رہے ہیں…', empty:'منتخب فلٹر سے کوئی پیغام نہیں ملا۔', error:'پیغامات لوڈ نہیں ہو سکے۔', retry:'دوبارہ کوشش', page:'صفحہ', of:'از',
    details:'پیغام کی تفصیلات', detailsHint:'Meta سے موصول ہونے والی تازہ ترین اطلاع کے مطابق حالت۔', close:'بند کریں', weekStart:'ہفتے کی ابتدا', workDate:'تبدیلی کا دن', createdAt:'درخواست کا وقت', statusAt:'آخری تبدیلی', deliveredAt:'ترسیل کا وقت', readAt:'پڑھنے کا وقت', failedAt:'ناکامی کا وقت', reason:'ناکامی کی وجہ', code:'خرابی کا کوڈ', missing:'دستیاب نہیں',
  },
} as const;

function sundayFor(day: string) {
  const d=new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate()-d.getUTCDay());
  return d.toISOString().slice(0,10);
}
function addDays(day:string, days:number) {
  const d=new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10);
}
function dateValue(value: Date|string|null|undefined) {
  if (!value) return '—';
  try { return formatDateTime(value,{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:true},'en-GB'); }
  catch { return '—'; }
}
function dateOnly(value: Date|string|null|undefined) {
  if(!value)return '—';
  if(value instanceof Date)return value.toISOString().slice(0,10);
  return String(value).slice(0,10);
}

export default function WhatsAppDelivery() {
  const {language}=useLanguage(); const t=labels[language]; const dir=language==='en'?'ltr':'rtl';
  const {user,loading:authLoading}=useAuth();
  const allowed=user?.role==='admin'||(user?.role==='hr_admin'&&user.accessScope==null&&permits(user.permissions??[],'schedule:approve'));
  const canOrg=user?.role==='admin'||permits(user?.permissions??[],'org_structure:read');
  const canUsers=user?.role==='admin'||permits(user?.permissions??[],'users:read');
  const [week,setWeek]=useState(()=>sundayFor(riyadhDateKey()));
  const [search,setSearch]=useState(''); const [searchTerm,setSearchTerm]=useState('');
  const [kind,setKind]=useState<Kind|'all'>('all'); const [status,setStatus]=useState<Status|'all'>('all');
  const [branch,setBranch]=useState(''); const [location,setLocation]=useState(''); const [department,setDepartment]=useState(''); const [supervisor,setSupervisor]=useState('');
  const [dateFrom,setDateFrom]=useState(''); const [dateTo,setDateTo]=useState(''); const [extra,setExtra]=useState(false);
  const [page,setPage]=useState(0); const [selected,setSelected]=useState<DeliveryRow|null>(null);
  useEffect(()=>{const timer=setTimeout(()=>setSearchTerm(normalizeDigits(search.trim())),300);return()=>clearTimeout(timer)},[search]);
  const rangeValid=(!dateFrom&&!dateTo)||(!!dateFrom&&!!dateTo&&dateFrom<=dateTo);
  const filteredDates=Boolean(dateFrom&&dateTo&&rangeValid);
  const input={weekStart:filteredDates?undefined:week,dateFrom:filteredDates?dateFrom:undefined,dateTo:filteredDates?dateTo:undefined,search:searchTerm||undefined,kind:kind==='all'?undefined:kind,status:status==='all'?undefined:status,branchId:branch?Number(branch):undefined,locationId:location?Number(location):undefined,departmentId:department?Number(department):undefined,supervisorId:supervisor?Number(supervisor):undefined,limit:pageSize,offset:page*pageSize};
  const report=trpc.schedules.getWhatsAppDeliveryReport.useQuery(input,{enabled:allowed&&rangeValid,refetchOnWindowFocus:false});
  const whatsappStatus=trpc.schedules.getWhatsAppTrialStatus.useQuery(undefined,{enabled:allowed,refetchOnWindowFocus:false});
  const branches=trpc.orgStructure.listBranches.useQuery({},{enabled:allowed&&extra&&canOrg});
  const locations=trpc.orgStructure.listLocations.useQuery({},{enabled:allowed&&extra&&canOrg});
  const departments=trpc.orgStructure.listDepartments.useQuery({},{enabled:allowed&&extra&&canOrg});
  const branchLinks=trpc.orgStructure.listBranchLocationLinks.useQuery(undefined,{enabled:allowed&&extra&&canOrg});
  const departmentLinks=trpc.orgStructure.listLocationDepartmentLinks.useQuery(undefined,{enabled:allowed&&extra&&canOrg});
  const supervisors=trpc.users.listByRole.useQuery({role:'supervisor'},{enabled:allowed&&extra&&canUsers});
  const visibleLocations=useMemo(()=>locations.data?.filter(x=>!branch||branchLinks.data?.some(l=>l.branchId===Number(branch)&&l.locationId===x.id))??[],[locations.data,branchLinks.data,branch]);
  const visibleDepartments=useMemo(()=>departments.data?.filter(x=>!location||departmentLinks.data?.some(l=>l.locationId===Number(location)&&l.departmentId===x.id))??[],[departments.data,departmentLinks.data,location]);
  const name=(x:{nameAr:string;nameEn:string|null;nameUr?:string|null})=>language==='en'?(x.nameEn||x.nameAr):language==='ur'?(x.nameUr||x.nameEn||x.nameAr):x.nameAr;
  const clear=()=>{setWeek(sundayFor(riyadhDateKey()));setSearch('');setSearchTerm('');setKind('all');setStatus('all');setBranch('');setLocation('');setDepartment('');setSupervisor('');setDateFrom('');setDateTo('');setPage(0)};
  const chooseStatus=(value:Status|'all')=>{setStatus(value);setPage(0)};
  const countKeys:['all'|Status,string][]=[['all','◉'],['delivered','✓'],['sent','◷'],['failed','!'],['read','◉']];
  const totals=report.data?.totals;
  const rows=(report.data?.rows??[]) as DeliveryRow[];
  const total=report.data?.total??0;
  const pages=Math.max(1,Math.ceil(total/pageSize));
  const activeFilters=[
    search&&{key:'search',label:search,clear:()=>{setSearch('');setSearchTerm('')}},
    kind!=='all'&&{key:'kind',label:t[kind],clear:()=>setKind('all')},
    status!=='all'&&{key:'status',label:t[status],clear:()=>setStatus('all')},
    branch&&{key:'branch',label:branches.data?.find(x=>x.id===Number(branch))?.nameAr||t.branch,clear:()=>{setBranch('');setLocation('');setDepartment('')}},
    location&&{key:'location',label:locations.data?.find(x=>x.id===Number(location))?.nameAr||t.location,clear:()=>{setLocation('');setDepartment('')}},
    department&&{key:'department',label:departments.data?.find(x=>x.id===Number(department))?.nameAr||t.department,clear:()=>setDepartment('')},
    supervisor&&{key:'supervisor',label:supervisors.data?.find(x=>x.id===Number(supervisor))?.name||t.supervisor,clear:()=>setSupervisor('')},
    filteredDates&&{key:'dates',label:`${dateFrom} – ${dateTo}`,clear:()=>{setDateFrom('');setDateTo('')}},
  ].filter((v):v is {key:string;label:string;clear:()=>void}=>Boolean(v));
  return <DashboardLayout><div dir={dir} className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{t.title}</h1><p className="mt-2 text-sm text-muted-foreground">{t.subtitle}</p></div>{allowed&&<Button variant="outline" onClick={()=>void report.refetch()} disabled={!rangeValid||report.isFetching}><RefreshCw className="me-2 h-4 w-4"/>{t.refresh}</Button>}</div>
    {authLoading?<p className="rounded-xl border p-6 text-sm">{t.loading}</p>:!allowed?<p className="rounded-xl border p-6 text-sm">{t.forbidden}</p>:<>
      <p className={`rounded-lg border px-4 py-3 text-sm ${whatsappStatus.data&&!whatsappStatus.data.webhookReady?'border-amber-500/50 bg-amber-500/10':'bg-card text-muted-foreground'}`} role="status">{whatsappStatus.data&&!whatsappStatus.data.webhookReady?t.webhookOff:t.webhookUnknown}</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{countKeys.map(([key,icon])=><button key={key} type="button" aria-pressed={status===key} onClick={()=>chooseStatus(key)} className={`rounded-xl border p-4 text-start transition-colors hover:bg-accent/50 ${status===key?'border-primary bg-primary/10':'bg-card'}`}><span className="block text-sm text-muted-foreground">{icon} {t[key]}</span><span className="mt-2 block text-2xl font-bold">{totals?.[key]??'—'}</span></button>)}</div>
      <p className="text-xs text-muted-foreground">{t.countsNote}</p>
      <div className="space-y-4 rounded-xl border bg-card p-4">
        <div className="grid gap-4 md:grid-cols-3"><div className="space-y-2"><Label htmlFor="message-week">{t.week}</Label><div className="flex gap-2"><Button type="button" variant="outline" size="icon" aria-label={t.previous} onClick={()=>{setWeek(addDays(week,-7));setDateFrom('');setDateTo('');setPage(0)}}><ChevronRight className="h-4 w-4"/></Button><Input id="message-week" type="date" value={week} onChange={e=>{if(e.target.value)setWeek(sundayFor(e.target.value));setDateFrom('');setDateTo('');setPage(0)}}/><Button type="button" variant="outline" size="icon" aria-label={t.next} onClick={()=>{setWeek(addDays(week,7));setDateFrom('');setDateTo('');setPage(0)}}><ChevronLeft className="h-4 w-4"/></Button></div></div>
          <div className="space-y-2"><Label htmlFor="message-search">{t.search}</Label><div className="relative"><Search className="pointer-events-none absolute start-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="ps-9" id="message-search" value={search} placeholder={t.searchPlaceholder} onChange={e=>{setSearch(e.target.value);setPage(0)}}/></div></div>
          <div className="space-y-2"><Label htmlFor="message-kind">{t.type}</Label><select className={selectClass} id="message-kind" value={kind} onChange={e=>{setKind(e.target.value as Kind|'all');setPage(0)}}><option value="all">{t.allTypes}</option><option value="weekly">{t.weekly}</option><option value="update">{t.update}</option></select></div></div>
        <p className="text-xs text-muted-foreground" dir="ltr">{week} — {addDays(week,6)}</p>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={()=>setExtra(!extra)} aria-expanded={extra}><Filter className="me-2 h-4 w-4"/>{extra?t.closeFilters:t.filters}</Button><Button type="button" variant="ghost" onClick={clear}><X className="me-2 h-4 w-4"/>{t.clear}</Button></div>
        {activeFilters.length>0&&<div className="flex flex-wrap gap-2">{activeFilters.map(f=><button key={f.key} type="button" className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-xs" onClick={()=>{f.clear();setPage(0)}} aria-label={`${t.clear}: ${f.label}`}>{f.label}<X className="h-3 w-3"/></button>)}</div>}
        {extra&&<div className="space-y-4 border-t pt-4">{!canOrg&&<p className="text-xs text-muted-foreground">{t.noOrg}</p>}{!canUsers&&<p className="text-xs text-muted-foreground">{t.noUsers}</p>}{(branches.isError||locations.isError||departments.isError||branchLinks.isError||departmentLinks.isError||supervisors.isError)&&<p role="alert" className="text-xs text-destructive">{t.filterError}</p>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2"><Label htmlFor="message-branch">{t.branch}</Label><select disabled={!canOrg||branches.isError} id="message-branch" className={selectClass} value={branch} onChange={e=>{setBranch(e.target.value);setLocation('');setDepartment('');setPage(0)}}><option value="">{t.allOptions}</option>{branches.data?.map(x=><option key={x.id} value={x.id}>{name(x)}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="message-location">{t.location}</Label><select disabled={!canOrg||locations.isError||branchLinks.isError} id="message-location" className={selectClass} value={location} onChange={e=>{setLocation(e.target.value);setDepartment('');setPage(0)}}><option value="">{t.allOptions}</option>{visibleLocations.map(x=><option key={x.id} value={x.id}>{name(x)}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="message-department">{t.department}</Label><select disabled={!canOrg||departments.isError||departmentLinks.isError} id="message-department" className={selectClass} value={department} onChange={e=>{setDepartment(e.target.value);setPage(0)}}><option value="">{t.allOptions}</option>{visibleDepartments.map(x=><option key={x.id} value={x.id}>{name(x)}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="message-supervisor">{t.supervisor}</Label><select disabled={!canUsers||supervisors.isError} id="message-supervisor" className={selectClass} value={supervisor} onChange={e=>{setSupervisor(e.target.value);setPage(0)}}><option value="">{t.allOptions}</option>{supervisors.data?.map(x=><option key={x.id} value={x.id}>{x.name||x.username||String(x.id)}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="message-status">{t.status}</Label><select id="message-status" className={selectClass} value={status} onChange={e=>chooseStatus(e.target.value as Status|'all')}><option value="all">{t.allOptions}</option>{(['pending','sent','delivered','read','failed','unknown'] as Status[]).map(s=><option key={s} value={s}>{t[s]}</option>)}</select></div>
        </div><div className="space-y-2"><p className="text-sm font-medium">{t.dates}</p><div className="grid gap-3 sm:grid-cols-2"><div><Label htmlFor="message-from">{t.from}</Label><Input id="message-from" type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setPage(0)}}/></div><div><Label htmlFor="message-to">{t.to}</Label><Input id="message-to" type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setPage(0)}}/></div></div><p className={`text-xs ${rangeValid?'text-muted-foreground':'text-destructive'}`}>{rangeValid?t.datesHint:t.dateError}</p></div></div>}
      </div>
      <section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-4 py-3 text-sm font-medium">{t.results}: {total}</div>
        {!rangeValid?<p className="p-5 text-sm text-destructive">{t.dateError}</p>:report.isLoading?<p className="p-5 text-sm">{t.loading}</p>:report.isError?<div role="alert" className="space-y-3 p-5 text-sm text-destructive"><p>{t.error} {normalizeDigits(report.error.message)}</p><Button variant="outline" onClick={()=>void report.refetch()}>{t.retry}</Button></div>:!rows.length?<p className="p-8 text-center text-sm text-muted-foreground">{t.empty}</p>:<div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr>{[t.employee,t.type,t.sentAt,t.currentStatus,t.actions].map(h=><th key={h} className="px-4 py-3 text-start font-medium">{h}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id} className="border-t"><td className="px-4 py-3"><span className="block font-medium">{normalizeDigits(row.workerName)}</span><span className="block text-xs text-muted-foreground">{row.employeeId} · •••• {row.phoneEnding??'—'}</span>{(row.branchName||row.locationName||row.multipleDestinations)&&<span className="block text-xs text-muted-foreground">{[row.branchName,row.locationName,row.multipleDestinations?t.multiple:null].filter(Boolean).join(' · ')}</span>}</td><td className="px-4 py-3">{t[row.kind]}</td><td className="px-4 py-3" dir="ltr">{dateValue(row.sentAt)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${row.status==='failed'?'bg-destructive/10 text-destructive':row.status==='read'||row.status==='delivered'?'bg-emerald-500/15 text-emerald-600':'bg-muted text-muted-foreground'}`}>{t[row.status]??t.unknown}</span></td><td className="px-4 py-3"><Button size="sm" variant="outline" onClick={()=>setSelected(row)}>{t.view}</Button></td></tr>)}</tbody></table></div>}
        {total>pageSize&&<div className="flex items-center justify-between gap-2 border-t px-4 py-3 text-sm"><Button variant="outline" size="sm" disabled={page===0} onClick={()=>setPage(p=>p-1)}>{t.previous}</Button><span>{t.page} {page+1} {t.of} {pages}</span><Button variant="outline" size="sm" disabled={page+1>=pages} onClick={()=>setPage(p=>p+1)}>{t.next}</Button></div>}
      </section>
    </>}
    <Dialog open={!!selected} onOpenChange={open=>{if(!open)setSelected(null)}}><DialogContent dir={dir} className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{t.details}</DialogTitle><DialogDescription>{t.detailsHint}</DialogDescription></DialogHeader>{selected&&<dl className="grid gap-3 text-sm sm:grid-cols-2">{[[t.employee,`${selected.workerName} (${selected.employeeId})`],[t.phone,selected.phoneEnding?`•••• ${selected.phoneEnding}`:'—'],[t.type,t[selected.kind]],[t.currentStatus,t[selected.status]??t.unknown],[t.weekStart,dateOnly(selected.weekStart)],[t.workDate,dateOnly(selected.workDate)],[t.branch,selected.branchName||'—'],[t.location,selected.locationName||'—'],[t.department,selected.departmentName||'—'],[t.supervisor,selected.supervisorName||'—'],[t.createdAt,dateValue(selected.createdAt)],[t.sentAt,dateValue(selected.sentAt)],[t.deliveredAt,dateValue(selected.deliveredAt)],[t.readAt,dateValue(selected.readAt)],[t.failedAt,dateValue(selected.failedAt)],[t.statusAt,dateValue(selected.statusAt)],[t.code,selected.errorCode==null?'—':String(selected.errorCode)],[t.reason,selected.errorSummary||'—']].map(([label,value])=><div key={label} className="space-y-1"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words">{normalizeDigits(String(value))}</dd></div>)}</dl>}</DialogContent></Dialog>
  </div></DashboardLayout>;
}
