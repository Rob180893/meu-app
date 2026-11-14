import React, { useRef } from 'react';
import {
  Home,
  LayoutGrid,
  BookOpen,
  BarChart3,
  RefreshCw,
  RotateCw,
  CalendarDays,
  Sun,
  Moon,
  Download,
  FileSpreadsheet,
  Upload,
  Menu,
  AlignLeft,
  X,
  User as UserIcon,
} from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

export type TabKey = 'h' | 'q' | 'd' | 'v' | 'y' | 'w' | 's';

interface HeaderProps {
  currentTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  isOpen: boolean;
  onToggleOpen: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onImportJSON: (file: File) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  isOpen,
  onToggleOpen,
  isDark,
  onToggleTheme,
  onExportJSON,
  onExportCSV,
  onImportJSON,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navItems: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'h', label: 'Início', icon: <Home className="w-4 h-4" /> },
    { key: 'q', label: 'Quadro Kanban', icon: <LayoutGrid className="w-4 h-4" /> },
    { key: 'd', label: 'Disciplinas', icon: <BookOpen className="w-4 h-4" /> },
    { key: 'v', label: 'Revisão', icon: <RotateCw className="w-4 h-4" /> },
    { key: 'y', label: 'Ciclo de Estudos', icon: <RefreshCw className="w-4 h-4" /> },
    { key: 'w', label: 'Planejamento Semanal', icon: <CalendarDays className="w-4 h-4" /> },
    { key: 's', label: 'Estatísticas', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportJSON(file);
      e.target.value = '';
    }
  };

  return (
    <>
      {/* Burger Button for Mobile & Toggle */}
      <div className="fixed left-3.5 top-3.5 z-40 flex items-center gap-2">
        <button
          onClick={onToggleOpen}
          aria-label="Abrir ou fechar menu de navegação"
          className="p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 shadow-md backdrop-blur-sm hover:scale-105 active:scale-95 transition cursor-pointer"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Quick Actions & User Status when sidebar is collapsed */}
        {!isOpen && (
          <div className="flex items-center gap-2">
          </div>
        )}
      </div>

      {/* Backdrop for closing when clicking outside (PC and mobile) */}
      {isOpen && (
        <div
          onClick={onToggleOpen}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-30 transition-opacity"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed top-0 left-0 bottom-0 z-40 w-64 bg-gradient-to-b from-[#2563eb] via-[#1d4ed8] to-[#1e3a8a] text-white flex flex-col justify-between p-4 shadow-2xl transition-transform duration-300 ease-in-out overflow-y-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          {/* Header Brand */}
          <div className="flex items-center justify-between pb-4 pt-1 border-b border-white/20">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">📋</span>
              <div>
                <h1 className="font-extrabold text-sm tracking-wider uppercase leading-tight">
                  Meu Quadro
                </h1>
                <p className="text-[10px] text-white/70">Plataforma de Estudos</p>
              </div>
            </div>
            <button
              onClick={onToggleOpen}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition cursor-pointer"
              title="Recolher menu lateral"
              aria-label="Recolher menu lateral"
            >
              <AlignLeft className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="mt-4 space-y-1.5">
            {navItems.map((item) => {
              const active = currentTab === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    onSelectTab(item.key);
                    onToggleOpen();
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                    active
                      ? 'bg-white/25 text-white shadow-sm ring-1 ring-white/30 font-bold'
                      : 'text-white/85 hover:bg-white/15 hover:text-white'
                  }`}
                >
                  <span className={active ? 'text-white' : 'text-white/80'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Actions */}
        <div className="space-y-3 pt-4 border-t border-white/20">
          {/* Theme switcher */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-white/80 uppercase tracking-wider">
              Tema
            </span>
            <button
              onClick={onToggleTheme}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-bold text-white transition cursor-pointer"
              title={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-300" /> Claro
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-blue-200" /> Escuro
                </>
              )}
            </button>
          </div>

          {/* Backup / Export Buttons */}
          <div className="space-y-1.5 pt-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/70 px-1">
              Backup & Dados
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={onExportJSON}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition cursor-pointer"
                title="Baixar backup completo em JSON"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar</span>
              </button>
              <button
                onClick={onExportCSV}
                className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition cursor-pointer"
                title="Baixar planilha de tópicos em CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Planilha</span>
              </button>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition cursor-pointer"
              title="Restaurar dados de um arquivo de backup"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Importar Backup</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* PWA Install Button */}
          <div className="pt-1">
            <PWAInstallButton />
          </div>
        </div>
      </aside>
    </>
  );
};
