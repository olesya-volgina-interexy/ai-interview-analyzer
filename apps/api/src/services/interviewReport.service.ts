// Markdown builder for the "Save as PDF" export in CandidateModal — turns an
// Interview's analysis JSON into the same structure/order already shown
// on-screen (ManagerCallResult.tsx / TechnicalResult.tsx / FinalResult.tsx /
// CVMatchBlock.tsx / BrokerMatchBlock.tsx), so the PDF isn't a stripped-down
// afterthought of what the UI already renders. Fed into markdownToPdf().

interface ReportInterview {
  candidateName: string | null;
  managerName: string | null;
  role: string;
  level: string;
  clientName: string | null;
  stage: string;
  analysisDate: Date | null;
  createdAt: Date;
  analysis: unknown;
}

function isMentioned(text: string | undefined | null): boolean {
  return !!text && text.trim().toLowerCase() !== 'not mentioned';
}

function bulletList(items: string[] | undefined | null): string[] {
  const filtered = (items ?? []).filter(isMentioned);
  return filtered.length > 0 ? filtered.map(i => `- ${i}`) : [];
}

function section(title: string, lines: string[]): string[] {
  if (lines.length === 0) return [];
  return [`## ${title}`, ...lines, ''];
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const STAGE_LABELS: Record<string, string> = {
  manager_call: 'Manager Call',
  technical: 'Technical Interview',
  final_result: 'Final Result',
};

export function buildInterviewReportMarkdown(interview: ReportInterview): string {
  const a = interview.analysis as any;
  const lines: string[] = [];

  lines.push(`# ${interview.candidateName ?? 'Candidate'}`);
  lines.push(`**Interview Type:** ${STAGE_LABELS[interview.stage] ?? interview.stage}`);
  lines.push(`**Role:** ${interview.role} ${interview.level}`);
  lines.push(`**Client:** ${interview.clientName ?? '—'}`);
  lines.push(`**Manager:** ${interview.managerName ?? '—'}`);
  lines.push(`**Date:** ${formatDate(interview.analysisDate ?? interview.createdAt)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (a?.stage === 'manager_call') {
    lines.push(`**Result:** ${String(a.stageResult ?? '').replace('_', ' ')}`);
    lines.push('');

    if (isMentioned(a.overallImpression)) {
      lines.push(...section('Overall Impression', [a.overallImpression]));
    }

    const softSkills = a.softSkills ?? {};
    lines.push(...section('Soft Skills', [
      `- **Communication:** ${softSkills.communication || 'Not mentioned'}`,
      `- **Motivation:** ${softSkills.motivation || 'Not mentioned'}`,
      `- **Culture Fit:** ${softSkills.cultureFit || 'Not mentioned'}`,
      `- **Clarity of Thought:** ${softSkills.clarityOfThought || 'Not mentioned'}`,
    ]));

    lines.push(...section('Strengths', bulletList(a.strengths)));
    lines.push(...section('Weaknesses', bulletList(a.weaknesses)));

    const brokerSoftFit = a.brokerSoftFit ?? {};
    const brokerLines = [
      ...(brokerSoftFit.coveredRequirements ?? []).map((r: string) => `- ✅ ${r}`),
      ...(brokerSoftFit.missingRequirements ?? []).map((r: string) => `- ❌ ${r}`),
    ];
    if (isMentioned(brokerSoftFit.fitSummary)) brokerLines.push('', brokerSoftFit.fitSummary);
    lines.push(...section('Broker Soft Fit', brokerLines));

    lines.push(...section('Risks', bulletList(a.risks)));

    if (isMentioned(a.reasoning)) {
      lines.push(...section('Reasoning', [a.reasoning]));
    }

    lines.push(...section('Decision Breakers', bulletList(a.decisionBreakers)));

    if (isMentioned(a.recommendation)) {
      lines.push(...section('Recommendation', [a.recommendation]));
    }
  } else if (a?.stage === 'technical') {
    const scoreLine = [
      a.recommendation ? `**Recommendation:** ${String(a.recommendation).replace('_', ' ')}` : null,
      a.technicalLevel ? `**Level:** ${a.technicalLevel}` : null,
      a.score !== undefined ? `**Score:** ${a.score}/100` : null,
    ].filter(Boolean).join(' · ');
    if (scoreLine) { lines.push(scoreLine); lines.push(''); }

    if (isMentioned(a.overallAssessment)) {
      lines.push(...section('Overall Assessment', [a.overallAssessment]));
    }

    const techSkills = a.technicalSkills ?? {};
    lines.push(...section('Technical Skills', [
      `- **Depth of Knowledge:** ${techSkills.depthOfKnowledge || 'Not assessed'}`,
      `- **Problem Solving:** ${techSkills.problemSolving || 'Not assessed'}`,
      `- **Code Quality:** ${techSkills.codeQuality || 'Not assessed'}`,
      `- **System Design:** ${techSkills.systemDesign || 'Not assessed'}`,
    ]));

    lines.push(...section('Strengths', bulletList(a.strengths)));
    lines.push(...section('Weaknesses', bulletList(a.weaknesses)));
    lines.push(...section('Risks & Red Flags', bulletList(a.risks)));

    if (a.languageAssessment) {
      const la = a.languageAssessment;
      lines.push(...section('Language Assessment', [
        `**Verdict:** ${String(la.verdict ?? '').replace('_', ' ')} · Required: ${la.requiredLevel} · Demonstrated: ${la.demonstratedLevel}`,
        '',
        la.evidence ?? '',
      ]));
    }

    if (a.interviewerSentiment?.length > 0) {
      lines.push(...section('Interviewer Reactions', a.interviewerSentiment.map(
        (s: any) => `- _"${s.signal}"_${s.topic ? ` — ${s.topic}` : ''} (${s.interpretation})`
      )));
    }

    if (a.cvMatch) {
      const cv = a.cvMatch;
      const cvLines = [`**Score:** ${cv.cvMatchScore}%`, ''];
      if (cv.confirmedSkills?.length) cvLines.push(`**Confirmed:** ${cv.confirmedSkills.join(', ')}`);
      if (cv.unconfirmedSkills?.length) cvLines.push(`**Unconfirmed:** ${cv.unconfirmedSkills.join(', ')}`);
      if (cv.declaredSkills?.length) cvLines.push(`**Declared:** ${cv.declaredSkills.join(', ')}`);
      if (cv.discrepancies?.length) cvLines.push('', '**Discrepancies:**', ...cv.discrepancies.map((d: string) => `- ${d}`));
      lines.push(...section('CV Match', cvLines));
    }

    if (a.brokerRequestMatch) {
      const bm = a.brokerRequestMatch;
      const bmLines = [`**Score:** ${bm.brokerMatchScore}%`, ''];
      if (bm.coveredRequirements?.length) bmLines.push(`**Covered:** ${bm.coveredRequirements.join(', ')}`);
      if (bm.missingRequirements?.length) bmLines.push(`**Missing:** ${bm.missingRequirements.join(', ')}`);
      if (bm.notAssessedRequirements?.length) bmLines.push(`**Not Assessed:** ${bm.notAssessedRequirements.join(', ')}`);
      if (isMentioned(bm.brokerFitSummary)) bmLines.push('', bm.brokerFitSummary);
      lines.push(...section('Broker Match', bmLines));
    }

    if (isMentioned(a.roleFitSummary)) {
      lines.push(...section('Role Fit', [a.roleFitSummary]));
    }

    if (isMentioned(a.reasoning)) {
      lines.push(...section('Reasoning', [a.reasoning]));
    }

    lines.push(...section('Decision Breakers', bulletList(a.decisionBreakers)));
  } else if (a?.stage === 'final_result') {
    lines.push(`**Decision:** ${String(a.decision ?? '').toUpperCase()}`);
    lines.push('');

    if (isMentioned(a.overallAssessment)) {
      lines.push(...section('Overall Assessment', [a.overallAssessment]));
    }

    lines.push(...section('Strengths', bulletList(a.strengths)));
    lines.push(...section('Weaknesses', bulletList(a.weaknesses)));

    const summaryLines: string[] = [];
    if (isMentioned(a.technicalSummary)) summaryLines.push('**Technical Interview**', a.technicalSummary, '');
    if (isMentioned(a.softSkillsSummary)) summaryLines.push('**Manager Call**', a.softSkillsSummary, '');
    lines.push(...section('Stage Summaries', summaryLines));

    lines.push(...section('Risks', bulletList(a.risks)));

    if (isMentioned(a.reasoning)) {
      lines.push(...section('Reasoning', [a.reasoning]));
    }

    lines.push(...section('Decision Breakers', bulletList(a.decisionBreakers)));
  }

  return lines.join('\n');
}
