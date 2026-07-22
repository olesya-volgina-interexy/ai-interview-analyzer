import { useState, useEffect, useRef } from 'react';
import { getAvatarColor, getInitials } from '@/lib/avatar';

export function CandidateCombobox({ value, onChange, candidates }: {
  value: string;
  onChange: (v: string) => void;
  candidates: string[];
}) {
  const [inputValue, setInputValue] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputValue(value); }, [value]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (inputValue.trim()) onChange(inputValue.trim());
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [inputValue, onChange]);

  const filtered = candidates.filter(name =>
    !inputValue || name.toLowerCase().includes(inputValue.toLowerCase())
  );
  const exactMatch = candidates.some(n => n.toLowerCase() === inputValue.trim().toLowerCase());
  const showNewOption = inputValue.trim().length > 0 && !exactMatch;

  const selectCandidate = (name: string) => {
    onChange(name);
    setInputValue(name);
    setIsOpen(false);
  };

  const avatar = value ? getAvatarColor(value) : null;

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">
        Candidate <span className="text-red-500">*</span>
      </label>
      <div className="relative" ref={wrapperRef}>
        <div className="flex items-center w-full h-10 rounded-lg border border-slate-200 bg-white overflow-hidden focus-within:border-[#534AB7] transition-colors">
          {value && avatar && (
            <div
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ml-3"
              style={{ background: avatar.bg, color: avatar.color }}
            >
              {getInitials(value)}
            </div>
          )}
          <input
            value={inputValue}
            onChange={e => { setInputValue(e.target.value); setIsOpen(true); if (!e.target.value) onChange(''); }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (filtered.length === 1) selectCandidate(filtered[0]);
                else if (inputValue.trim()) selectCandidate(inputValue.trim());
              }
            }}
            placeholder="Type or select candidate..."
            className="flex-1 h-full px-3 text-sm outline-none bg-transparent"
          />
        </div>

        {isOpen && (filtered.length > 0 || showNewOption) && (
          <div className="absolute z-50 top-full mt-1 w-full rounded-xl bg-white shadow-lg ring-1 ring-slate-200/70 p-1 max-h-52 overflow-y-auto">
            {filtered.map(name => {
              const av = getAvatarColor(name);
              return (
                <button
                  key={name}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => selectCandidate(name)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-slate-50 text-left transition-colors"
                >
                  <div
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium"
                    style={{ background: av.bg, color: av.color }}
                  >
                    {getInitials(name)}
                  </div>
                  {name}
                </button>
              );
            })}
            {showNewOption && (
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => selectCandidate(inputValue.trim())}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-slate-50 text-left transition-colors border-t border-slate-100 mt-1 pt-2"
              >
                <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium bg-[#EEF0FE] text-[#534AB7]">+</div>
                <span>Add <strong>{inputValue.trim()}</strong> as new candidate</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
