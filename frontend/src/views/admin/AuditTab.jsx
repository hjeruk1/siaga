import{useEffect,useMemo,useState}from'react';
import{api}from'../../api';
import{CustomSelect}from'../../components/Shared';
import{Search,X}from'lucide-react';
import{useMaster,Panel,Table,Td,fmtTime}from'./shared';

export default function AuditTab({user,toast}){
  const m=useMaster(user);const[rows,setRows]=useState([]);
  const[searchQuery,setSearchQuery]=useState('');
  useEffect(()=>{api.auditLog({cabang_id:m.cabangId,limit:150}).then(setRows).catch(e=>toast('err',e.message));},[m.cabangId]);
  const filteredRows = useMemo(() => {
    return rows.filter(a => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesActor = (a.actor_name || 'Sistem').toLowerCase().includes(q);
        const matchesAction = (a.action || '').toLowerCase().includes(q);
        const matchesType = (a.entity_type || '').toLowerCase().includes(q);
        const matchesReason = (a.reason || '').toLowerCase().includes(q);
        if (!matchesActor && !matchesAction && !matchesType && !matchesReason) return false;
      }
      return true;
    });
  }, [rows, searchQuery]);
  return <Panel title="Audit Log" right={null} className="overflow-visible md:overflow-hidden">
    <div className="space-y-4">
      {/* Unified Search & Filter Panel */}
      <div className="sticky top-[64px] z-20 -mx-1 rounded-xl border border-slate-200 bg-slate-50/95 p-3 shadow-sm backdrop-blur md:static md:z-auto md:mx-0 md:bg-slate-50 md:shadow-none md:backdrop-blur-0">
        <div className="flex flex-row items-center gap-2">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="Cari log…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input pl-8 w-full text-xs sm:text-sm font-bold"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Hapus pencarian audit"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {user.role === 'admin' && (
            <CustomSelect
              value={m.cabangId}
              onChange={e => m.setCabangId(e.target.value)}
              className="input w-32 sm:w-44 text-xs sm:text-sm shrink-0 font-bold"
            >
              <option value="">Semua Cabang</option>
              {m.cabang.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nama}
                </option>
              ))}
            </CustomSelect>
          )}
        </div>
      </div>

      {/* Desktop view table */}
      <div className="hidden md:block">
        <Table headers={['Waktu','Actor','Action','Entity','Cabang','Alasan']}>
          {filteredRows.map(a=><tr key={a.id}><Td>{fmtTime(a.created_at)}</Td><Td>{a.actor_name||'Sistem'}</Td><Td>{a.action}</Td><Td>{a.entity_type} #{a.entity_id||'-'}</Td><Td>{a.cabang_nama||'-'}</Td><Td>{a.reason||'-'}</Td></tr>)}
        </Table>
      </div>

      {/* Mobile view card stack */}
      <div className="block md:hidden space-y-3">
        {filteredRows.map(a => (
          <div key={a.id} className="bg-white border border-slate-200/80 rounded-xl p-3 space-y-2.5 transition active:scale-[0.98]">
            <div className="flex justify-between items-start gap-2">
              <div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wide">{fmtTime(a.created_at)}</span>
                <div className="font-bold text-text-main text-sm mt-0.5">{a.actor_name || 'Sistem'}</div>
              </div>
              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-black uppercase tracking-wide">{a.action}</span>
            </div>
            <div className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 text-xs">
              <div className="font-black text-slate-400 uppercase">Entitas</div>
              <div className="font-bold text-slate-700">{a.entity_type} #{a.entity_id || '-'}</div>
              <div className="font-black text-slate-400 uppercase">Cabang</div>
              <div className="font-bold text-slate-700">{a.cabang_nama || '-'}</div>
              <div className="font-black text-slate-400 uppercase">Alasan</div>
              <div className="font-bold text-slate-700 truncate" title={a.reason || ''}>{a.reason || '-'}</div>
            </div>
          </div>
        ))}
      </div>

      {filteredRows.length === 0 && (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-sm font-bold">
          Tidak ada log audit yang ditemukan.
        </div>
      )}
    </div>
  </Panel>;
}

