import { useState, useEffect, useRef, useMemo, Children } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, X, ChevronDown, ChevronLeft, ChevronRight, CalendarDays, Clock, Clipboard, CreditCard, FileText, Receipt, Settings, Wallet } from 'lucide-react';
import { nowWIB as getNowWIB, todayWIB as getTodayWIB } from '../utils/date';

export const SS={Hadir:'bg-emerald-100 text-emerald-700 border-emerald-200',Menunggu:'bg-amber-100 text-amber-700 border-amber-200',Pulang:'bg-slate-100 text-slate-500 border-slate-200',Terlambat:'bg-orange-100 text-orange-700 border-orange-200',Izin:'bg-sky-100 text-sky-700 border-sky-200',Sakit:'bg-purple-100 text-purple-700 border-purple-200',Absen:'bg-red-100 text-red-600 border-red-200',Libur:'bg-indigo-100 text-indigo-700 border-indigo-200',Belum:'bg-slate-100 text-slate-400 border-slate-200'};
export function LogoMark({className='w-44 h-12 rounded-xl'}){return <div className={`${className} bg-white border border-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0`}><img src="/tp_logo.png" alt="Taruna Prima" width="176" height="48" className="w-full h-full object-contain p-1.5"/></div>;}
export function Chip({status,manual}){return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${SS[status]||'bg-gray-100 text-gray-500'}`}>{!!manual&&<Pencil className="w-3 h-3 opacity-60" strokeWidth={2.4} aria-hidden="true"/>}{status||'Belum'}</span>;}
export function LiveClock({className=''}){const[t,setT]=useState(new Date());useEffect(()=>{const i=setInterval(()=>setT(new Date()),1000);return()=>clearInterval(i);},[]);return <span className={className}>{t.toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta'})}</span>;}
export function IconButton({icon:Icon,label,onClick,variant='ghost',size='md',disabled=false,className='',type='button'}) {
  const variants = {
    ghost: 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95 transition-all duration-200 focus-visible:ring-primary/25',
    primary: 'bg-primary text-white hover:bg-primary-hover active:bg-primary-active active:scale-95 transition-all duration-200 focus-visible:ring-primary/30',
    secondary: 'bg-text-main text-white hover:opacity-90 active:scale-95 transition-all duration-200 focus-visible:ring-slate-400/30',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-100 active:scale-95 transition-all duration-200 focus-visible:ring-red-200',
    plain: 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 transition-all duration-200 focus-visible:ring-slate-200'
  };
  const sizes = { sm: 'w-8 h-8 rounded-lg', md: 'w-9 h-9 rounded-xl' };
  return <button type={type} onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`inline-flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${sizes[size]||sizes.md} ${variants[variant]||variants.ghost} ${className}`}>{Icon&&<Icon className={size==='sm'?'w-4 h-4':'w-[18px] h-[18px]'} strokeWidth={2.4}/>}</button>;
}
export function ActionButton({icon:Icon,children,label,onClick,variant='primary',disabled=false,className='',type='button'}) {
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-hover active:bg-primary-active active:scale-[0.98] transition-all duration-200 focus-visible:ring-primary/30',
    secondary: 'bg-text-main text-white hover:opacity-90 active:scale-[0.98] transition-all duration-200 focus-visible:ring-slate-400/30',
    ghost: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-[0.98] transition-all duration-200 focus-visible:ring-primary/20',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-100 active:scale-[0.98] transition-all duration-200 focus-visible:ring-red-200'
  };
  const text = label||children;
  return <button type={type} onClick={onClick} disabled={disabled} aria-label={typeof text==='string'?text:undefined} title={typeof text==='string'?text:undefined} className={`inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${variants[variant]||variants.primary} ${className}`}>{Icon&&<Icon className="w-4 h-4" strokeWidth={2.4}/>}<span>{children}</span></button>;
}
export function Modal({title,onClose,children,maxWidth='max-w-md'}){
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(()=>{onCloseRef.current=onClose;},[onClose]);
  useEffect(()=>{
    const previousFocus = document.activeElement;
    panelRef.current?.focus();
    function onKeyDown(e){
      if(e.key==='Escape')onCloseRef.current?.();
      if(e.key==='Tab'&&panelRef.current){
        const focusable=[...panelRef.current.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(el=>!el.disabled);
        if(!focusable.length){e.preventDefault();return;}
        const first=focusable[0],last=focusable[focusable.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    }
    document.addEventListener('keydown',onKeyDown);
    return()=>{document.removeEventListener('keydown',onKeyDown);previousFocus?.focus?.();};
  },[]);
  return <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`bg-white border border-slate-200 rounded-2xl w-full ${maxWidth} max-h-[92dvh] overflow-hidden animate-bounce-in flex flex-col shadow-2xl shadow-slate-950/25 focus:outline-none`} onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/70 flex-shrink-0"><h3 className="font-black text-lg text-text-main truncate pr-3 tracking-[-0.01em]">{title}</h3><IconButton icon={X} label="Tutup" onClick={onClose} variant="plain"/></div>
      <div className="p-5 overflow-y-auto custom-scrollbar">{children}</div>
    </div>
  </div>;
}
export function Spinner(){return <div className="flex items-center justify-center py-16" role="status" aria-label="Memuat"><div className="w-8 h-8 border-4 border-primary-container border-t-primary rounded-full animate-spin" aria-hidden="true"/></div>;}
function nowWIB(){return getNowWIB();}
export function todayWIB(){return getTodayWIB();}
export function meniTunggu(j){if(!j)return null;const[h,m]=j.split(':').map(Number);const now=nowWIB();return Math.max(0,now.h*60+now.m-h*60-m);}
const emptyStateIcons={
  clipboard: Clipboard,
  settings: Settings,
  '📋': Clipboard,
  '📄': FileText,
  '💳': CreditCard,
  '💸': Wallet,
  '%': Receipt
};
export function EmptyState({icon='clipboard',title,description,action}){
  const Icon=typeof icon==='string'?emptyStateIcons[icon]:icon;
  return <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center space-y-3">
    {Icon?<div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white border border-slate-200 text-slate-400 shadow-sm"><Icon className="w-5 h-5" strokeWidth={2.2}/></div>:null}
    <div className="font-black text-slate-700">{title}</div>
    {description&&<div className="mx-auto max-w-sm text-sm text-slate-500 leading-relaxed">{description}</div>}
    {action&&<div>{action}</div>}
  </div>;
}

export function ConfirmActionModal({
  title,
  onClose,
  onSubmit,
  entityName,
  affectedBranch,
  consequence,
  requireReason = false,
  actionLabel = 'Konfirmasi',
  actionVariant = 'danger',
  icon: Icon
}) {
  const [reason, setReason] = useState('');
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        {Icon && (
          <div className="flex justify-center text-primary py-2">
            <Icon className="w-12 h-12" strokeWidth={1.8} />
          </div>
        )}
        <div className="space-y-3">
          {entityName && (
            <div>
              <span className="text-xs font-black text-slate-400 uppercase block">Entitas / Nama</span>
              <span className="font-bold text-text-main">{entityName}</span>
            </div>
          )}
          {affectedBranch && (
            <div>
              <span className="text-xs font-black text-slate-400 uppercase block">Cabang Terdampak</span>
              <span className="font-bold text-text-main">{affectedBranch}</span>
            </div>
          )}
          {consequence && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700">
              <span className="font-black block mb-1">Konsekuensi</span>
              {consequence}
            </div>
          )}
        </div>
        
        {requireReason && (
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase mb-1">Alasan Tindakan (Wajib)</label>
            <textarea
              className="input w-full min-h-[80px]"
              placeholder="Masukkan alasan Anda..."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
        )}

        <div className="flex gap-2">
          <ActionButton
            icon={Icon}
            variant={actionVariant}
            disabled={requireReason && !reason.trim()}
            onClick={() => onSubmit(requireReason ? reason.trim() : true)}
          >
            {actionLabel}
          </ActionButton>
          <ActionButton icon={X} onClick={onClose} variant="secondary">
            Batal
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}

export function CustomSelect({ value, onChange, className = '', children, placeholder = 'Pilih...', disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState(null);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target) &&
        (!dropdownRef.current || !dropdownRef.current.contains(event.target))
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;

    function updateDropdownPosition() {
      const rect = buttonRef.current.getBoundingClientRect();
      const gap = 4;
      const viewportGap = 12;
      const spaceBelow = window.innerHeight - rect.bottom - viewportGap;
      const spaceAbove = rect.top - viewportGap;
      const openUp = spaceBelow < 140 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(120, Math.min(240, openUp ? spaceAbove - gap : spaceBelow - gap));

      setDropdownStyle({
        left: rect.left,
        top: openUp ? undefined : rect.bottom + gap,
        bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
        width: rect.width,
        maxHeight,
      });
    }

    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [isOpen]);

  const options = useMemo(() => {
    return Children.toArray(children)
      .filter(child => child && child.type === 'option')
      .map(child => ({
        value: child.props.value !== undefined ? child.props.value : child.props.children,
        label: child.props.children,
        disabled: child.props.disabled || false
      }));
  }, [children]);

  const selectedOption = options.find(opt => String(opt.value) === String(value));
  const displayLabel = selectedOption ? selectedOption.label : placeholder;
  const listboxId = useMemo(() => `select-${Math.random().toString(36).slice(2)}`, []);

  const handleSelect = (val) => {
    if (disabled) return;
    setIsOpen(false);
    if (onChange) {
      onChange({ target: { value: val } });
    }
  };
  const handleKeyDown = event => {
    if (disabled) return;
    if (event.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isOpen && activeIndex >= 0) handleSelect(options[activeIndex].value);
      else setIsOpen(true);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActiveIndex(current => {
        const selected = options.findIndex(opt => String(opt.value) === String(value));
        const start = current >= 0 ? current : Math.max(0, selected);
        return Math.max(0, Math.min(options.length - 1, start + delta));
      });
    }
  };

  const isWFull = className.includes('w-full');
  const isW40 = className.includes('w-40');
  const otherClasses = className.replace('input', '').trim();

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${isWFull ? 'w-full' : isW40 ? 'w-40' : ''} ${otherClasses}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        className="w-full h-9 px-3 flex items-center justify-between gap-2 text-sm font-medium bg-white border border-slate-200 rounded-lg hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-left text-text-main"
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
      </button>

      {isOpen && !disabled && dropdownStyle && createPortal(
        <div id={listboxId} ref={dropdownRef} role="listbox" style={dropdownStyle} className="fixed z-[100] bg-white border border-slate-200 rounded-lg overflow-y-auto shadow-xl">
          {options.map((opt,index) => (
            <button
              key={String(opt.value)}
              type="button"
              disabled={opt.disabled}
              onClick={() => handleSelect(opt.value)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              aria-selected={String(opt.value) === String(value)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed ${
                String(opt.value) === String(value)
                  ? 'bg-primary-container font-semibold text-primary'
                  : index===activeIndex?'bg-slate-50 text-text-main':'text-text-main'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

const monthNames=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const dayNames=['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
function parseDateValue(value){
  if(!value)return null;
  const [y,m,d]=String(value).split('-').map(Number);
  if(!y||!m||!d)return null;
  return new Date(y,m-1,d);
}
function toDateValue(date){
  const y=date.getFullYear();
  const m=String(date.getMonth()+1).padStart(2,'0');
  const d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function displayDate(value){
  const date=parseDateValue(value);
  if(!date)return'Pilih tanggal';
  return new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric',timeZone:'Asia/Jakarta'}).format(date);
}
function sameDay(a,b){return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}
function parseMonthValue(value){
  const [year,month]=String(value||'').split('-').map(Number);
  if(!year||!month)return null;
  return new Date(year,month-1,1);
}
function toMonthValue(date){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
}
function displayMonth(value){
  const date=parseMonthValue(value);
  if(!date)return'Pilih bulan';
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

export function CustomDatePicker({value,onChange,className='',disabled=false,placeholder='Pilih tanggal'}){
  const[isOpen,setIsOpen]=useState(false);
  const[panelStyle,setPanelStyle]=useState(null);
  const selected=parseDateValue(value);
  const[viewDate,setViewDate]=useState(selected||new Date());
  const containerRef=useRef(null);
  const buttonRef=useRef(null);
  const panelRef=useRef(null);
  useEffect(()=>{if(selected)setViewDate(selected);},[value]);
  useEffect(()=>{
    function handleClickOutside(event){
      if(containerRef.current&&!containerRef.current.contains(event.target)&&(!panelRef.current||!panelRef.current.contains(event.target)))setIsOpen(false);
    }
    function handleKey(event){if(event.key==='Escape')setIsOpen(false);}
    document.addEventListener('mousedown',handleClickOutside);
    document.addEventListener('keydown',handleKey);
    return()=>{document.removeEventListener('mousedown',handleClickOutside);document.removeEventListener('keydown',handleKey);};
  },[]);
  useEffect(()=>{
    if(!isOpen||!buttonRef.current)return;
    function updatePosition(){
      const rect=buttonRef.current.getBoundingClientRect();
      const gap=6;
      const viewportGap=12;
      const panelWidth=Math.min(320,window.innerWidth-(viewportGap*2));
      const spaceBelow=window.innerHeight-rect.bottom-viewportGap;
      const spaceAbove=rect.top-viewportGap;
      const openUp=spaceBelow<330&&spaceAbove>spaceBelow;
      const left=Math.min(Math.max(viewportGap,rect.left),window.innerWidth-panelWidth-viewportGap);
      setPanelStyle({
        left,
        top:openUp?undefined:rect.bottom+gap,
        bottom:openUp?window.innerHeight-rect.top+gap:undefined,
        width:panelWidth
      });
    }
    updatePosition();
    window.addEventListener('resize',updatePosition);
    window.addEventListener('scroll',updatePosition,true);
    return()=>{window.removeEventListener('resize',updatePosition);window.removeEventListener('scroll',updatePosition,true);};
  },[isOpen]);
  const days=useMemo(()=>{
    const year=viewDate.getFullYear();
    const month=viewDate.getMonth();
    const start=new Date(year,month,1);
    const gridStart=new Date(year,month,1-start.getDay());
    return Array.from({length:42},(_,i)=>{
      const date=new Date(gridStart);
      date.setDate(gridStart.getDate()+i);
      return date;
    });
  },[viewDate]);
  function emit(date){
    onChange?.(toDateValue(date));
    setIsOpen(false);
  }
  function moveMonth(delta){
    setViewDate(d=>new Date(d.getFullYear(),d.getMonth()+delta,1));
  }
  const today=new Date();
  const isWFull=className.includes('w-full');
  const isW40=className.includes('w-40');
  const otherClasses=className.replace('input','').trim();
  return <div ref={containerRef} className={`relative inline-block text-left ${isWFull?'w-full':isW40?'w-40':''} ${otherClasses}`}>
    <button ref={buttonRef} type="button" disabled={disabled} onClick={()=>setIsOpen(v=>!v)} className={`w-full h-9 px-3 flex items-center justify-between gap-2 text-sm font-bold bg-white border border-slate-200 rounded-lg hover:border-primary/40 hover:bg-primary-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-left ${value?'text-text-main':'text-slate-400'}`}>
      <span className="truncate">{value?displayDate(value):placeholder}</span>
      <CalendarDays className="w-4 h-4 text-primary flex-shrink-0"/>
    </button>
    {isOpen&&!disabled&&panelStyle&&createPortal(
      <div ref={panelRef} style={panelStyle} className="fixed z-[100] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-900/15 animate-slide-up">
        <div className="flex items-center justify-between gap-2">
          <button type="button" onClick={()=>setViewDate(new Date())} className="rounded-lg px-2 py-1 text-sm font-black text-text-main hover:bg-slate-50">{monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}</button>
          <div className="flex gap-1">
            <IconButton icon={ChevronLeft} label="Bulan sebelumnya" size="sm" onClick={()=>moveMonth(-1)} variant="plain"/>
            <IconButton icon={ChevronRight} label="Bulan berikutnya" size="sm" onClick={()=>moveMonth(1)} variant="plain"/>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-black uppercase tracking-wide text-slate-400">{dayNames.map(d=><div key={d} className="py-1">{d}</div>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {days.map(date=>{
            const inMonth=date.getMonth()===viewDate.getMonth();
            const active=sameDay(date,selected);
            const isToday=sameDay(date,today);
            return <button key={toDateValue(date)} type="button" onClick={()=>emit(date)} className={`grid h-9 place-items-center rounded-lg text-sm font-black transition-all duration-150 ${active?'bg-primary text-white shadow-sm shadow-primary/20':isToday?'bg-primary-container text-primary':'hover:bg-slate-50'} ${inMonth?'':'text-slate-300'} ${!active&&inMonth?'text-text-main':''}`}>
              {date.getDate()}
            </button>;
          })}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <button type="button" onClick={()=>{onChange?.('');setIsOpen(false);}} className="rounded-lg px-2 py-1 text-sm font-black text-slate-500 hover:bg-slate-50">Kosongkan</button>
          <button type="button" onClick={()=>emit(new Date())} className="rounded-lg bg-primary-container px-2.5 py-1 text-sm font-black text-primary hover:bg-primary/15">Hari ini</button>
        </div>
      </div>,
      document.body
    )}
  </div>;
}

export function CustomMonthPicker({value,onChange,className='',disabled=false,placeholder='Pilih bulan'}){
  const[isOpen,setIsOpen]=useState(false);
  const[panelStyle,setPanelStyle]=useState(null);
  const selected=parseMonthValue(value);
  const[year,setYear]=useState((selected||new Date()).getFullYear());
  const containerRef=useRef(null);
  const buttonRef=useRef(null);
  const panelRef=useRef(null);
  useEffect(()=>{if(selected)setYear(selected.getFullYear());},[value]);
  useEffect(()=>{
    function handleClickOutside(event){
      if(containerRef.current&&!containerRef.current.contains(event.target)&&(!panelRef.current||!panelRef.current.contains(event.target)))setIsOpen(false);
    }
    function handleKey(event){if(event.key==='Escape')setIsOpen(false);}
    document.addEventListener('mousedown',handleClickOutside);
    document.addEventListener('keydown',handleKey);
    return()=>{document.removeEventListener('mousedown',handleClickOutside);document.removeEventListener('keydown',handleKey);};
  },[]);
  useEffect(()=>{
    if(!isOpen||!buttonRef.current)return;
    function updatePosition(){
      const rect=buttonRef.current.getBoundingClientRect();
      const gap=6;
      const viewportGap=12;
      const panelWidth=Math.min(280,window.innerWidth-(viewportGap*2));
      const spaceBelow=window.innerHeight-rect.bottom-viewportGap;
      const spaceAbove=rect.top-viewportGap;
      const openUp=spaceBelow<250&&spaceAbove>spaceBelow;
      const left=Math.min(Math.max(viewportGap,rect.left),window.innerWidth-panelWidth-viewportGap);
      setPanelStyle({left,top:openUp?undefined:rect.bottom+gap,bottom:openUp?window.innerHeight-rect.top+gap:undefined,width:panelWidth});
    }
    updatePosition();
    window.addEventListener('resize',updatePosition);
    window.addEventListener('scroll',updatePosition,true);
    return()=>{window.removeEventListener('resize',updatePosition);window.removeEventListener('scroll',updatePosition,true);};
  },[isOpen]);
  function emit(month){
    onChange?.(`${year}-${String(month+1).padStart(2,'0')}`);
    setIsOpen(false);
  }
  const isWFull=className.includes('w-full');
  const isW40=className.includes('w-40');
  const otherClasses=className.replace('input','').trim();
  return <div ref={containerRef} className={`relative inline-block text-left ${isWFull?'w-full':isW40?'w-40':''} ${otherClasses}`}>
    <button ref={buttonRef} type="button" disabled={disabled} onClick={()=>setIsOpen(v=>!v)} className={`w-full h-9 px-3 flex items-center justify-between gap-2 text-sm font-bold bg-white border border-slate-200 rounded-lg hover:border-primary/40 hover:bg-primary-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-left ${value?'text-text-main':'text-slate-400'}`}>
      <span className="truncate">{value?displayMonth(value):placeholder}</span>
      <CalendarDays className="w-4 h-4 text-primary flex-shrink-0"/>
    </button>
    {isOpen&&!disabled&&panelStyle&&createPortal(
      <div ref={panelRef} style={panelStyle} className="fixed z-[100] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl shadow-slate-900/15 animate-slide-up">
        <div className="flex items-center justify-between">
          <IconButton icon={ChevronLeft} label="Tahun sebelumnya" size="sm" onClick={()=>setYear(y=>y-1)} variant="plain"/>
          <div className="text-sm font-black text-text-main">{year}</div>
          <IconButton icon={ChevronRight} label="Tahun berikutnya" size="sm" onClick={()=>setYear(y=>y+1)} variant="plain"/>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {monthNames.map((name,month)=>{
            const active=selected&&selected.getFullYear()===year&&selected.getMonth()===month;
            return <button key={name} type="button" onClick={()=>emit(month)} className={`rounded-lg px-2 py-2 text-sm font-black transition-colors ${active?'bg-primary text-white':'text-text-main hover:bg-slate-50'}`}>{name.slice(0,3)}</button>;
          })}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <button type="button" onClick={()=>{onChange?.('');setIsOpen(false);}} className="rounded-lg px-2 py-1 text-sm font-black text-slate-500 hover:bg-slate-50">Kosongkan</button>
          <button type="button" onClick={()=>{const now=new Date();onChange?.(toMonthValue(now));setYear(now.getFullYear());setIsOpen(false);}} className="rounded-lg bg-primary-container px-2.5 py-1 text-sm font-black text-primary hover:bg-primary/15">Bulan ini</button>
        </div>
      </div>,
      document.body
    )}
  </div>;
}

function parseTimeValue(value){
  const [h,m]=String(value||'').split(':').map(Number);
  if(Number.isNaN(h)||Number.isNaN(m))return null;
  return {hour:Math.max(0,Math.min(23,h)),minute:Math.max(0,Math.min(59,m))};
}
function toTimeValue(hour,minute){return `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;}
function displayTime(value){
  const parsed=parseTimeValue(value);
  if(!parsed)return'Pilih waktu';
  return `${String(parsed.hour).padStart(2,'0')}:${String(parsed.minute).padStart(2,'0')}`;
}

export function CustomTimePicker({value,onChange,className='',disabled=false,placeholder='Pilih waktu',minuteStep=5}){
  const[isOpen,setIsOpen]=useState(false);
  const[panelStyle,setPanelStyle]=useState(null);
  const parsed=parseTimeValue(value)||{hour:8,minute:0};
  const containerRef=useRef(null);
  const buttonRef=useRef(null);
  const panelRef=useRef(null);
  useEffect(()=>{
    function handleClickOutside(event){
      if(containerRef.current&&!containerRef.current.contains(event.target)&&(!panelRef.current||!panelRef.current.contains(event.target)))setIsOpen(false);
    }
    function handleKey(event){if(event.key==='Escape')setIsOpen(false);}
    document.addEventListener('mousedown',handleClickOutside);
    document.addEventListener('keydown',handleKey);
    return()=>{document.removeEventListener('mousedown',handleClickOutside);document.removeEventListener('keydown',handleKey);};
  },[]);
  useEffect(()=>{
    if(!isOpen||!buttonRef.current)return;
    function updatePosition(){
      const rect=buttonRef.current.getBoundingClientRect();
      const gap=6;
      const viewportGap=12;
      const panelWidth=Math.min(248,window.innerWidth-(viewportGap*2));
      const spaceBelow=window.innerHeight-rect.bottom-viewportGap;
      const spaceAbove=rect.top-viewportGap;
      const openUp=spaceBelow<230&&spaceAbove>spaceBelow;
      const left=Math.min(Math.max(viewportGap,rect.left),window.innerWidth-panelWidth-viewportGap);
      setPanelStyle({left,top:openUp?undefined:rect.bottom+gap,bottom:openUp?window.innerHeight-rect.top+gap:undefined,width:panelWidth});
    }
    updatePosition();
    window.addEventListener('resize',updatePosition);
    window.addEventListener('scroll',updatePosition,true);
    return()=>{window.removeEventListener('resize',updatePosition);window.removeEventListener('scroll',updatePosition,true);};
  },[isOpen]);
  const hours=Array.from({length:24},(_,i)=>i);
  const minutes=Array.from({length:Math.ceil(60/minuteStep)},(_,i)=>i*minuteStep).filter(v=>v<60);
  const presets=['07:00','07:30','08:00','11:00','12:00','16:00','18:00'];
  function emit(hour,minute,close=false){
    onChange?.(toTimeValue(hour,minute));
    if(close)setIsOpen(false);
  }
  function emitValue(time,close=false){
    const parsedTime=parseTimeValue(time);
    if(!parsedTime)return;
    emit(parsedTime.hour,parsedTime.minute,close);
  }
  const isWFull=className.includes('w-full');
  const isW40=className.includes('w-40');
  const otherClasses=className.replace('input','').trim();
  return <div ref={containerRef} className={`relative inline-block text-left ${isWFull?'w-full':isW40?'w-40':''} ${otherClasses}`}>
    <button ref={buttonRef} type="button" disabled={disabled} onClick={()=>setIsOpen(v=>!v)} className={`w-full h-9 px-3 flex items-center justify-between gap-2 text-sm font-black bg-white border border-slate-200 rounded-lg hover:border-primary/40 hover:bg-primary-container focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-left ${value?'text-text-main':'text-slate-400'}`}>
      <span className="truncate">{value?displayTime(value):placeholder}</span>
      <Clock className="w-4 h-4 text-primary flex-shrink-0"/>
    </button>
    {isOpen&&!disabled&&panelStyle&&createPortal(
      <div ref={panelRef} style={panelStyle} className="fixed z-[100] rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xl shadow-slate-900/15 animate-slide-up">
        <div className="grid grid-cols-4 gap-1">
          {presets.map(time=><button key={time} type="button" onClick={()=>emitValue(time,true)} className={`rounded-lg px-2 py-1.5 text-xs font-black transition-colors ${value===time?'bg-primary text-white':'bg-slate-50 text-slate-600 hover:bg-primary-container hover:text-primary'}`}>{time}</button>)}
        </div>
        <div className="mt-2 grid grid-cols-[1.35fr_1fr] gap-2">
          <div>
            <div className="mb-1 px-1 text-[9px] font-black uppercase tracking-wider text-slate-400">Jam</div>
            <div className="grid grid-cols-4 gap-1">
              {hours.map(hour=><button key={hour} type="button" onClick={()=>emit(hour,parsed.minute)} className={`h-7 rounded-md text-xs font-black transition-colors ${hour===parsed.hour?'bg-primary text-white':'text-text-main hover:bg-slate-50'}`}>{String(hour).padStart(2,'0')}</button>)}
            </div>
          </div>
          <div>
            <div className="mb-1 px-1 text-[9px] font-black uppercase tracking-wider text-slate-400">Menit</div>
            <div className="grid grid-cols-2 gap-1">
              {minutes.map(minute=><button key={minute} type="button" onClick={()=>emit(parsed.hour,minute)} className={`h-7 rounded-md text-xs font-black transition-colors ${minute===parsed.minute?'bg-primary text-white':'text-text-main hover:bg-slate-50'}`}>{String(minute).padStart(2,'0')}</button>)}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
          <button type="button" onClick={()=>{onChange?.('');setIsOpen(false);}} className="rounded-lg px-2 py-1 text-xs font-black text-slate-500 hover:bg-slate-50">Kosongkan</button>
          <button type="button" onClick={()=>setIsOpen(false)} className="rounded-lg bg-primary-container px-2.5 py-1 text-xs font-black text-primary hover:bg-primary/15">Selesai</button>
        </div>
      </div>,
      document.body
    )}
  </div>;
}

export function SearchableSelect({ value, onChange, className = '', children, placeholder = 'Pilih...', searchPlaceholder = 'Cari...', disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const options = useMemo(() => {
    return Children.toArray(children)
      .filter(child => child && child.type === 'option')
      .map(child => ({
        value: child.props.value !== undefined ? child.props.value : child.props.children,
        label: child.props.children,
        disabled: child.props.disabled || false
      }));
  }, [children]);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(opt => String(opt.label).toLowerCase().includes(q));
  }, [options, search]);

  const selectedOption = options.find(opt => String(opt.value) === String(value));
  const displayLabel = selectedOption ? selectedOption.label : placeholder;
  const listboxId = useMemo(() => `search-select-${Math.random().toString(36).slice(2)}`, []);

  const handleSelect = (val) => {
    if (disabled) return;
    setIsOpen(false);
    setSearch('');
    if (onChange) {
      onChange({ target: { value: val } });
    }
  };

  const isWFull = className.includes('w-full');
  const isW40 = className.includes('w-40');
  const otherClasses = className.replace('input', '').trim();

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${isWFull ? 'w-full' : isW40 ? 'w-40' : ''} ${otherClasses}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setIsOpen(!isOpen); if (isOpen) setSearch(''); }}
        onKeyDown={event=>{if(event.key==='Escape')setIsOpen(false);if(event.key==='ArrowDown'){event.preventDefault();setIsOpen(true);}}}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        className="w-full h-9 px-3 flex items-center justify-between gap-2 text-sm font-medium bg-white border border-slate-200 rounded-lg hover:border-primary/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-left text-text-main"
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg overflow-hidden">
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            aria-controls={listboxId}
            className="w-full px-3 py-2 text-sm border-b border-slate-100 focus:outline-none focus:ring-0 bg-transparent placeholder-slate-400"
          />
          <div id={listboxId} role="listbox" className="overflow-y-auto max-h-60">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-400 text-center">Tidak ditemukan</div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => handleSelect(opt.value)}
                  role="option"
                  aria-selected={String(opt.value) === String(value)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed ${
                    String(opt.value) === String(value)
                      ? 'bg-primary-container font-semibold text-primary'
                      : 'text-text-main'
                  }`}
                >
                  {opt.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
