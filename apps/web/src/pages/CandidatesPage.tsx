import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PipelineTab } from '@/components/candidates/PipelineTab';
import { PreparationTab } from '@/components/candidates/PreparationTab';
import { AnalyzedTab } from '@/components/candidates/AnalyzedTab';

const TABS = [
  { key: 'analyzed', label: 'Analyzed' },
  { key: 'pipeline', label: 'In Pipeline' },
  { key: 'preparation', label: 'Preparation' },
] as const;

export function CandidatesPage() {
  const [activeTab, setActiveTab] = useState<'analyzed' | 'pipeline' | 'preparation'>('analyzed');

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Candidates</h1>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.key
                ? 'border-[#534AB7] text-[#534AB7]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'pipeline' && <PipelineTab />}
      {activeTab === 'preparation' && <PreparationTab />}
      {activeTab === 'analyzed' && <AnalyzedTab />}
    </div>
  );
}
