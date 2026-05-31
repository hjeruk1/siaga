import { useState, useEffect, useRef, useMemo, Children } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, X, ChevronDown } from 'lucide-react';
import { nowWIB as getNowWIB, todayWIB as getTodayWIB } from '../utils/date';

export const SS={Hadir:'bg-emerald-100 text-emerald-700 border-emerald-200',Menunggu:'bg-amber-100 text-amber-700 border-amber-200',Pulang:'bg-slate-100 text-slate-500 border-slate-200',Terlambat:'bg-orange-100 text-orange-700 border-orange-200',Izin:'bg-sky-100 text-sky-700 border-sky-200',Sakit:'bg-purple-100 text-purple-700 border-purple-200',Absen:'bg-red-100 text-red-600 border-red-200',Libur:'bg-indigo-100 text-indigo-700 border-indigo-200',Belum:'bg-slate-100 text-slate-400 border-slate-200'};
export function LogoMark({className='w-44 h-12 rounded-xl'}){return <div className={`${className} bg-white border border-primary/10 flex items-center justify-center overflow-hidden flex-shrink-0`}><img src="/tp_logo.png" alt="Taruna Prima" className="w-full h-full object-contain p-1.5"/></div>;}
export function Chip({status,manual}){return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${SS[status]||'bg-gray-100 text-gray-500'}`}>{!!manual&&<Pencil className="w-3 h-3 opacity-60" strokeWidth={2.4} aria-hidden="true"/>}{status||'Belum'}</span>;}
export function LiveClock({className=''}){const[t,setT]=useState(new Date());useEffect(()=>{const i=setInterval(()=>setT(new Date()),1000);return()=>clearInterval(i);},[]);return <span className={className}>{t.toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta'})}</span>;}
export function Toast({items}){return <div className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:bottom-5 sm:right-5 z-[100] flex flex-col gap-2 pointer-events-none">{items.map(t=<div key={t.id} className={`animate-slide-up px-4 py-3 rounded-2xl border border-black/10 text-sm font-semibold flex items-center gap-2 w-full sm:w-auto ${t.type==='ok'?'bg-emerald-600 text-white':t.type==='warn'?'bg-primary text-white':'bg-red-600 text-white'}`}>{t.msg}</div>)}</div>;}
export function IconButton({icon:Icon,label,onClick,variant='ghost',size='md',disabled=false,className='',type='button'}) {
  const variants = {
    ghost: 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:scale-95 transition-all duration-200',
    primary: 'bg-primary text-white hover:bg-primary-hover active:bg-primary-active active:scale-95 transition-all duration-200',
    secondary: 'bg-text-main text-white hover:opacity-90 active:scale-95 transition-all duration-200',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-100 active:scale-95 transition-all duration-200',
    plain: 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-95 transition-all duration-200'
  };
  const sizes = { sm: 'w-8 h-8 rounded-lg', md: 'w-9 h-9 rounded-lg' };
  return <button type={type} onClick={onClick} disabled={disabled} aria-label={label} title={label} className={`inline-flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${sizes[size]||sizes.md} ${variants[variant]||variants.ghost} ${className}`}>{Icon&&<Icon className={size==='sm'?'w-4 h-4':'w-[18px] h-[18px]'} strokeWidth={2.4}/>}</button>;
}
export function ActionButton({icon:Icon,children,label,onClick,variant='primary',disabled=false,className='',type='button'}) {
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-hover active:bg-primary-active active:scale-[0.98] transition-all duration-200',
    secondary: 'bg-text-main text-white hover:opacity-90 active:scale-[0.98] transition-all duration-200',
    ghost: 'bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-[0.98] transition-all duration-200',
    danger: 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-100 active:scale-[0.98] transition-all duration-200'
  };
  const text = label||children;
  return <button type={type} onClick={onClick} disabled={disabled} aria-label={typeof text==='string'?text:undefined} title={typeof text==='string'?text:undefined} className={`inline-flex items-center justify-center gap-2 h-9 px-4 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]||variants.primary} ${className}`}>{Icon&&<Icon className="w-4 h-4" strokeWidth={2.4}/>}<span>{children}</span></button>;
}
export function Modal({title,onClose,children,maxWidth='max-w-md'}){
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(()=>{onCloseRef.current=onClose;},[onClose]);
  useEffect(()=>{
    panelRef.current?.focus();
    function onKeyDown(e){if(e.key==='Escape')onCloseRef.current?.();}
    document.addEventListener('keydown',onKeyDown);
    return()=>document.removeEventListener('keydown',onKeyDown);
  },[]);
  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
    <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`bg-white border border-slate-200 rounded-2xl w-full ${maxWidth} max-h-[90vh] overflow-hidden animate-bounce-in flex flex-col focus:outline-none`} onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0"><h3 className="font-black text-lg text-text-main truncate pr-3">{title}</h3><IconButton icon={X} label="Tutup" onClick={onClose} variant="plain"/></div>
      <div className="p-5 overflow-y-auto">{children}</div>
    </div>
  </div>;
}
export function Spinner(){return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-primary-container border-t-primary rounded-full animate-spin"/></div>;}
export function nowWIB(){return getNowWIB();}
export function todayWIB(){return getTodayWIB();}
export function meniTunggu(j){if(!j)return null;const[h,m]=j.split(':').map(Number);const now=nowWIB();return Math.max(0,now.h*60+now.m-h*60-m);}
export function EmptyState({icon='clipboard',title,description,action}){return <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center space-y-3"><div className="text-4xl">{icon}</div><div className="font-black text-slate-700">{title}</div>{description&&<div className="text-sm text-slate-500">{description}</div>}{action&&<div>{action}</div>}</div>;}

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
          <div className="flex justify-center text-primary py-2 animate-pulse">
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

  const handleSelect = (val) => {
    if (disabled) return;
    setIsOpen(false);
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
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full h-9 px-3 flex items-center justify-between gap-2 text-sm font-medium bg-white border border-slate-200 rounded-lg hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-left text-text-main"
      >
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
      </button>

      {isOpen && !disabled && dropdownStyle && createPortal(
        <div ref={dropdownRef} style={dropdownStyle} className="fixed z-[100] bg-white border border-slate-200 rounded-lg overflow-y-auto shadow-xl">
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              disabled={opt.disabled}
              onClick={() => handleSelect(opt.value)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed ${
                String(opt.value) === String(value)
                  ? 'bg-primary-container font-semibold text-primary'
                  : 'text-text-main'
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
        className="w-full h-9 px-3 flex items-center justify-between gap-2 text-sm font-medium bg-white border border-slate-200 rounded-lg hover:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-left text-text-main"
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
            className="w-full px-3 py-2 text-sm border-b border-slate-100 focus:outline-none focus:ring-0 bg-transparent placeholder-slate-400"
          />
          <div className="overflow-y-auto max-h-60">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-sm text-slate-400 text-center">Tidak ditemukan</div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  disabled={opt.disabled}
                  onClick={() => handleSelect(opt.value)}
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
