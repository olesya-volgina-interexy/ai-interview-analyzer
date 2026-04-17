import { Ban, AlertTriangle, Briefcase, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface QualityData {
  topDecisionBreakers: Array<{ text: string; count: number }>;
  topWeaknesses: Array<{ text: string; count: number }>;
  hireRateByRole: Array<{ role: string; hireRate: number; total: number }>;
  topExternalReasons: Array<{ text: string; count: number }>;
}

function TagList({ items, bg, textColor, countBg, countText }: {
  items: Array<{ text: string; count: number }>;
  bg: string;
  textColor: string;
  countBg: string;
  countText: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <div
          key={i}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{ background: bg }}
        >
          <span className="text-xs capitalize" style={{ color: textColor }}>
            {item.text}
          </span>
          <span
            className="text-xs font-medium rounded-full px-1.5 py-0.5 leading-none"
            style={{ background: countBg, color: countText }}
          >
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
}

export function QualityStatsCard({ quality }: { quality: QualityData }) {
  const tabs = [
    {
      key: 'rejections',
      label: 'Rejection reasons',
      icon: Ban,
      enabled: quality.topDecisionBreakers.length > 0,
      content: (
        <TagList
          items={quality.topDecisionBreakers}
          bg="#FCEBEB"
          textColor="#791F1F"
          countBg="#F09595"
          countText="#A32D2D"
        />
      ),
    },
    {
      key: 'weaknesses',
      label: 'Weaknesses',
      icon: AlertTriangle,
      enabled: quality.topWeaknesses.length > 0,
      content: (
        <TagList
          items={quality.topWeaknesses}
          bg="#FAEEDA"
          textColor="#633806"
          countBg="#EF9F27"
          countText="#854F0B"
        />
      ),
    },
    {
      key: 'external',
      label: 'External reasons',
      icon: Building2,
      enabled: (quality.topExternalReasons ?? []).length > 0,
      content: (
        <TagList
          items={quality.topExternalReasons ?? []}
          bg="#FEF3C7"
          textColor="#92400E"
          countBg="#F59E0B"
          countText="#78350F"
        />
      ),
    },
    {
      key: 'hireRate',
      label: 'Hire rate by role',
      icon: Briefcase,
      enabled: quality.hireRateByRole.length > 0,
      content: (
        <div className="space-y-3 overflow-y-auto max-h-48 pr-1 scrollbar-thin">
          {quality.hireRateByRole.map(({ role, hireRate, total }) => (
            <div key={role}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-slate-700 truncate pr-2">{role}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-slate-400">{total} {total === 1 ? 'interview' : 'interviews'}</span>
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={hireRate >= 50
                      ? { background: '#EAF3DE', color: '#3B6D11' }
                      : { background: '#FCEBEB', color: '#A32D2D' }
                    }
                  >
                    {hireRate}%
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(hireRate, 2)}%`,
                    background: hireRate >= 50 ? '#639922' : '#E24B4A',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ].filter(t => t.enabled);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Quality Insights</CardTitle>
      </CardHeader>
      <CardContent>
        {tabs.length > 0 && (
          <Tabs defaultValue={0}>
            <TabsList variant="line" className="w-full justify-start">
              {tabs.map((t, i) => {
                const Icon = t.icon;
                return (
                  <TabsTrigger key={t.key} value={i}>
                    <Icon size={14} />
                    {t.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {tabs.map((t, i) => (
              <TabsContent key={t.key} value={i} className="pt-4">
                {t.content}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
