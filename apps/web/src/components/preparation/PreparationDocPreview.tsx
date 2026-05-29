import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { preparationApi, getErrorMessage } from '@/api/client';
import { Copy, Download, Check, FileText, Loader2 } from 'lucide-react';

interface PreparationDocPreviewProps {
  markdown: string;
  candidateName: string;
  clientName: string;
  generatedAt: string;
  docId?: string;
}

function safeFilenamePart(value: string) {
  return value.trim().replace(/[^\w\d-]+/g, '-').replace(/^-+|-+$/g, '') || 'doc';
}

export function PreparationDocPreview({
  markdown,
  candidateName,
  clientName,
  generatedAt,
  docId,
}: PreparationDocPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('Copy failed', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prep-${safeFilenamePart(candidateName)}-${safeFilenamePart(clientName)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    if (!docId) return;
    setPdfError(null);
    setPdfDownloading(true);
    try {
      const { data } = await preparationApi.downloadPdf(docId);
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prep-${safeFilenamePart(candidateName)}-${safeFilenamePart(clientName)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError(getErrorMessage(err));
    } finally {
      setPdfDownloading(false);
    }
  };

  const formattedDate = new Date(generatedAt).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700 truncate">
            Preparation for{' '}
            <span className="text-[#5067F4]">{candidateName}</span>
            {' — interview with '}
            <span className="text-[#5067F4]">{clientName}</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Generated {formattedDate}</p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-2">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} className="gap-2">
            <Download size={14} />
            .md
          </Button>
          {docId && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={pdfDownloading}
              className="gap-2"
            >
              {pdfDownloading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileText size={14} />
              )}
              PDF
            </Button>
          )}
        </div>
      </div>
      {pdfError && (
        <p className="text-xs text-red-500 -mt-2">{pdfError}</p>
      )}

      <article className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-3 prose-h3:text-base prose-h3:mt-4 prose-p:text-sm prose-li:text-sm prose-strong:text-slate-900 prose-a:text-[#5067F4]">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </article>
    </div>
  );
}
