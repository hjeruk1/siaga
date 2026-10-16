import CabangTab from './admin/CabangTab';
import SiswaTab from './admin/SiswaTab';
import StaffTab from './admin/StaffTab';
import WaliTab from './admin/WaliTab';
import RombelTab from './admin/RombelTab';
import BillingTab from './admin/BillingTab';
import LaporanTab from './admin/LaporanTab';
import ConfigTab from './admin/ConfigTab';
import KalenderTab from './admin/KalenderTab';
import AuditTab from './admin/AuditTab';

export default function AdminView({ user, toast, tab }) {
  const tabs = ['cabang', 'siswa', 'staff', 'wali', 'rombel', 'billing', 'laporan', 'config', 'kalender', 'audit'];
  const activeTab = tabs.includes(tab) ? tab : 'siswa';
  return (
    <div className="w-full p-3 sm:p-4 lg:p-6 2xl:p-8 space-y-4">
      {activeTab === 'cabang' && <CabangTab user={user} toast={toast} />}
      {activeTab === 'siswa' && <SiswaTab user={user} toast={toast} />}
      {activeTab === 'staff' && <StaffTab user={user} toast={toast} />}
      {activeTab === 'wali' && <WaliTab user={user} toast={toast} />}
      {activeTab === 'rombel' && <RombelTab user={user} toast={toast} />}
      {activeTab === 'billing' && <BillingTab user={user} toast={toast} />}
      {activeTab === 'laporan' && <LaporanTab user={user} toast={toast} />}
      {activeTab === 'config' && <ConfigTab user={user} toast={toast} />}
      {activeTab === 'kalender' && <KalenderTab user={user} toast={toast} />}
      {activeTab === 'audit' && <AuditTab user={user} toast={toast} />}
    </div>
  );
}
