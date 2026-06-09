import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { GeneratePreparationDocRequest } from '@shared/schemas';
import {
  linearApi,
  uploadApi,
  preparationApi,
  getErrorMessage,
  type LinearVacancy,
} from '@/api/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Download, Link as LinkIcon, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CreatePreparationDocModalProps {
  open: boolean;
  onClose: () => void;
}

type CvTab = 'url' | 'file';

export function CreatePreparationDocModal({ open, onClose }: CreatePreparationDocModalProps) {
  const navigate = useNavigate();

  const [linearInput, setLinearInput] = useState('');
  const [selectedIssueId, setSelectedIssueId] = useState('');
  const [clientName, setClientName] = useState('');
  const [role, setRole] = useState('');
  const [brokerRequest, setBrokerRequest] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [linearIssueId, setLinearIssueId] = useState<string | undefined>();

  // Selector for tickets with multiple vacancies — index into vacancies[].
  const [vacancies, setVacancies] = useState<LinearVacancy[]>([]);
  const [selectedVacancyIdx, setSelectedVacancyIdx] = useState<number | null>(null);

  const [cvTab, setCvTab] = useState<CvTab>('url');
  const [cvUrl, setCvUrl] = useState('');
  const [cvText, setCvText] = useState('');
  const [cvFileName, setCvFileName] = useState<string | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);

  // Список тикетов Linear для выпадающего списка — грузим при открытии модалки.
  const { data: linearIssues, isLoading: issuesLoading } = useQuery({
    queryKey: ['linear-issues'],
    queryFn: () => linearApi.getIssues({ first: 100 }).then((r) => r.data),
    enabled: open,
  });

  const previewMutation = useMutation({
    mutationFn: (idOrUrl: string) => linearApi.previewIssue(idOrUrl).then((r) => r.data),
    onSuccess: (data) => {
      setLinearIssueId(data.identifier);

      if (data.vacancies.length >= 2) {
        // Несколько вакансий — пользователь должен выбрать одну.
        // Сами поля пока не заполняем, чтобы не сбить с толку.
        setVacancies(data.vacancies);
        setSelectedVacancyIdx(null);
      } else {
        // Одна вакансия (или эвристика не сработала) — заполняем как раньше.
        setVacancies([]);
        setSelectedVacancyIdx(null);
        if (data.parsedClientName && !clientName) setClientName(data.parsedClientName);
        if (data.parsedRole && !role) setRole(data.parsedRole);
        if (data.description && !brokerRequest) setBrokerRequest(data.description);
      }

      if (data.attachmentUrl && cvTab === 'url' && !cvUrl) setCvUrl(data.attachmentUrl);
    },
  });

  const handleVacancySelect = (idx: number) => {
    const v = vacancies[idx];
    if (!v) return;
    setSelectedVacancyIdx(idx);
    if (v.parsedClientName) setClientName(v.parsedClientName);
    if (v.parsedRole) setRole(v.parsedRole);
    setBrokerRequest(v.content);
  };

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadApi.uploadFile(file).then((r) => r.data),
    onSuccess: (data) => {
      setCvText(data.text);
      setCvFileName(data.filename);
    },
  });

  const submitMutation = useMutation({
    mutationFn: (data: GeneratePreparationDocRequest) =>
      preparationApi.generate(data).then((r) => r.data),
    onSuccess: ({ id }) => {
      handleClose();
      navigate({ to: '/preparation/$id', params: { id } });
    },
    onError: (err) => {
      setSubmitError(getErrorMessage(err));
    },
  });

  const handleClose = () => {
    setLinearInput('');
    setSelectedIssueId('');
    setClientName('');
    setRole('');
    setBrokerRequest('');
    setCandidateName('');
    setLinearIssueId(undefined);
    setVacancies([]);
    setSelectedVacancyIdx(null);
    setCvTab('url');
    setCvUrl('');
    setCvText('');
    setCvFileName(null);
    setSubmitError(null);
    previewMutation.reset();
    uploadMutation.reset();
    submitMutation.reset();
    onClose();
  };

  const handlePreview = () => {
    if (!linearInput.trim()) return;
    setSelectedIssueId('');
    previewMutation.mutate(linearInput.trim());
  };

  const handleSelectIssue = (id: string | null) => {
    if (!id) return;
    setSelectedIssueId(id);
    setLinearInput('');
    // id вакансии Linear — UUID, previewIssue его принимает и заполняет поля.
    previewMutation.mutate(id);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadMutation.mutate(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const trimmedCandidate = candidateName.trim();
    const trimmedClient = clientName.trim();
    if (!trimmedCandidate) {
      setSubmitError('Candidate name is required.');
      return;
    }
    if (!trimmedClient) {
      setSubmitError('Client name is required — fill it in from the ticket or manually.');
      return;
    }
    if (vacancies.length >= 2 && selectedVacancyIdx === null) {
      setSubmitError('Pick which vacancy to prepare for.');
      return;
    }

    const data: GeneratePreparationDocRequest = {
      candidateName: trimmedCandidate,
      clientName: trimmedClient,
      role: role.trim() || undefined,
      brokerRequest: brokerRequest.trim() || undefined,
      linearIssueId: linearIssueId,
    };

    if (cvTab === 'url' && cvUrl.trim()) {
      data.cvUrl = cvUrl.trim();
    } else if (cvTab === 'file' && cvText.trim()) {
      data.cvText = cvText.trim();
    }

    submitMutation.mutate(data);
  };

  const previewError = previewMutation.error
    ? getErrorMessage(previewMutation.error)
    : null;
  const uploadError = uploadMutation.error ? getErrorMessage(uploadMutation.error) : null;
  const isSubmitting = submitMutation.isPending;
  const hasMultipleVacancies = vacancies.length >= 2;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="w-[95vw] sm:w-[80%] max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin bg-white">
        <DialogHeader>
          <DialogTitle>Create preparation doc</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 px-1 py-2">
          {/* Linear ticket */}
          <section className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">
              Linear ticket{' '}
              <span className="text-slate-400 font-normal">— pick from the list or paste a URL / ID</span>
            </Label>

            {/* Выпадающий список всех актуальных тикетов Linear */}
            <Select
              value={selectedIssueId || undefined}
              onValueChange={handleSelectIssue}
              disabled={previewMutation.isPending}
            >
              <SelectTrigger className="w-full bg-slate-50 border-slate-200 focus-visible:bg-white">
                <SelectValue
                  placeholder={issuesLoading ? 'Loading tickets…' : 'Select a ticket…'}
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {(linearIssues ?? []).map((issue) => (
                  <SelectItem key={issue.id} value={issue.id}>
                    {issue.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">or by URL / ID</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="flex gap-2">
              <Input
                value={linearInput}
                onChange={(e) => setLinearInput(e.target.value)}
                placeholder="https://linear.app/.../issue/LIN-1234 or LIN-1234"
                className="bg-slate-50 border-slate-200 focus-visible:bg-white"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handlePreview}
                disabled={!linearInput.trim() || previewMutation.isPending}
                className="gap-2 whitespace-nowrap"
              >
                {previewMutation.isPending ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                Load
              </Button>
            </div>
            {previewError && (
              <p className="text-red-500 text-xs">{previewError}</p>
            )}
            {previewMutation.isSuccess && !hasMultipleVacancies && (
              <p className="text-xs text-emerald-600">
                Ticket {previewMutation.data?.identifier} loaded — fields below are filled and editable.
              </p>
            )}
          </section>

          {/* Vacancy selector — only when the ticket has 2+ vacancies */}
          {hasMultipleVacancies && (
            <section className="space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-sm font-medium text-slate-700">
                Found {vacancies.length} vacancies in this ticket — pick the one you're preparing for:
              </p>
              <div className="space-y-1.5">
                {vacancies.map((v, idx) => (
                  <label
                    key={idx}
                    className={cn(
                      'flex items-start gap-2 px-2.5 py-2 rounded border cursor-pointer transition-colors',
                      selectedVacancyIdx === idx
                        ? 'border-[#534AB7] bg-white'
                        : 'border-transparent hover:bg-white/70',
                    )}
                  >
                    <input
                      type="radio"
                      name="vacancy"
                      checked={selectedVacancyIdx === idx}
                      onChange={() => handleVacancySelect(idx)}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {v.title}
                      </p>
                      {v.parsedRole && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Role: {v.parsedRole}
                          {v.parsedClientName ? ` · Client: ${v.parsedClientName}` : ''}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
              {selectedVacancyIdx !== null && (
                <p className="text-xs text-emerald-600">
                  Fields below are filled from the selected vacancy — feel free to edit.
                </p>
              )}
            </section>
          )}

          {/* Client */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Client</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client name"
                className="bg-slate-50 border-slate-200 focus-visible:bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">
                Role / position
              </Label>
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Frontend Developer"
                className="bg-slate-50 border-slate-200 focus-visible:bg-white"
              />
            </div>
          </section>

          {/* Broker request */}
          <section className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">
              Broker request{' '}
              <span className="text-slate-400 font-normal">— description from the ticket</span>
            </Label>
            <Textarea
              value={brokerRequest}
              onChange={(e) => setBrokerRequest(e.target.value)}
              placeholder="Loads from the Linear ticket, or fill in manually..."
              className="min-h-[100px] resize-none scrollbar-thin bg-slate-50 border-slate-200 focus-visible:bg-white"
            />
          </section>

          {/* Candidate */}
          <section className="space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">Candidate name</Label>
            <Input
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              placeholder="e.g. Ivan Petrov"
              className="bg-slate-50 border-slate-200 focus-visible:bg-white"
            />
          </section>

          {/* CV */}
          <section className="space-y-2">
            <Label className="text-sm font-medium text-slate-700">CV</Label>
            <div className="flex gap-1 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setCvTab('url')}
                className={cn(
                  'px-3 py-1.5 text-sm flex items-center gap-1.5 border-b-2 -mb-px transition-colors',
                  cvTab === 'url'
                    ? 'border-[#534AB7] text-[#534AB7]'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
              >
                <LinkIcon size={13} />
                By URL
              </button>
              <button
                type="button"
                onClick={() => setCvTab('file')}
                className={cn(
                  'px-3 py-1.5 text-sm flex items-center gap-1.5 border-b-2 -mb-px transition-colors',
                  cvTab === 'file'
                    ? 'border-[#534AB7] text-[#534AB7]'
                    : 'border-transparent text-slate-500 hover:text-slate-700',
                )}
              >
                <FileText size={13} />
                Upload file
              </button>
            </div>
            {cvTab === 'url' && (
              <div className="space-y-1">
                <Input
                  type="url"
                  value={cvUrl}
                  onChange={(e) => setCvUrl(e.target.value)}
                  placeholder="https://... (PDF, TXT, or a Linear attachment URL)"
                  className="bg-slate-50 border-slate-200 focus-visible:bg-white"
                />
                <p className="text-xs text-slate-400">
                  Linear attachments work — the auth token is added automatically.
                </p>
              </div>
            )}
            {cvTab === 'file' && (
              <div className="space-y-1">
                <Input
                  type="file"
                  accept=".pdf,.txt"
                  onChange={handleFile}
                  disabled={uploadMutation.isPending}
                  className="bg-slate-50 border-slate-200"
                />
                {uploadMutation.isPending && (
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Extracting text...
                  </p>
                )}
                {cvFileName && !uploadMutation.isPending && (
                  <p className="text-xs text-emerald-600">
                    Loaded: {cvFileName} ({cvText.length} chars)
                  </p>
                )}
                {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
              </div>
            )}
          </section>

          {submitError && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting && <Loader2 size={14} className="animate-spin" />}
              Generate
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
