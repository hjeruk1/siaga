import { useState } from 'react';
import { api } from '../api';

export default function LoginView({ onLogin }) {
  const [form, setForm]       = useState({ username: '', password: '' });
  const [err, setErr]         = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const d = await api.login(form.username, form.password);
      localStorage.setItem('siaga_token', d.token);
      onLogin(d.user);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-amber-50 to-orange-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo sekolah */}
        <div className="flex flex-col items-center mb-6">
          <img
            src="/tp_logo.png"
            alt="KBTK Taruna Prima"
            className="h-20 object-contain drop-shadow-sm"
          />
        </div>

        {/* Card login */}
        <div className="bg-white rounded-3xl shadow-xl p-7 relative overflow-hidden">

          {/* Maskot pojok kanan — dekoratif */}
          <img
            src="/runa-rima.png"
            alt=""
            className="absolute -right-4 -top-4 w-28 opacity-90 pointer-events-none select-none"
          />

          <div className="relative z-10">
            <div className="mb-6">
              <div className="font-black text-2xl text-green-700 leading-tight">Selamat Datang!</div>
              <div className="text-slate-400 text-sm mt-0.5">Masuk ke Sistem SIAGA</div>
            </div>

            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1.5">USERNAME</label>
                <input
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="Masukkan username"
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-green-400 text-sm transition-colors"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 block mb-1.5">PASSWORD</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Masukkan password"
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:outline-none focus:border-green-400 text-sm transition-colors"
                />
              </div>
              {err && (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                  {err}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-green-600 text-white font-black rounded-xl hover:bg-green-700 active:scale-95 transition-all shadow-lg shadow-green-200 disabled:opacity-50 text-sm"
              >
                {loading ? 'Masuk...' : 'Masuk →'}
              </button>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-5 text-xs text-slate-400">
          SIAGA · KBTK Taruna Prima · Aktif Inovatif & Islami
        </div>
      </div>
    </div>
  );
}
