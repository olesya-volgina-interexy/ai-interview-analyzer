import { postReply } from './linear.service';
import type { ManagerCallAnalysis, TechnicalAnalysis } from '@shared/schemas';


async function postReplyWithRetry(
  issueId: string,
  parentCommentId: string,
  body: string,
  maxRetries = 3
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await postReply(issueId, parentCommentId, body);
      return;
    } catch (err: any) {
      lastError = err;
      
      const isRetriable = 
        err.message?.includes('fetch failed') ||
        err.message?.includes('ETIMEDOUT') ||
        err.message?.includes('ECONNRESET') ||
        err.type === 'Unknown' ||
        err.status === 429 ||
        err.status >= 500;

      if (!isRetriable || attempt === maxRetries) {
        throw err;
      }

      const delay = Math.pow(2, attempt - 1) * 1000;
      console.warn(`Linear API failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

// ── Постинг анализа менеджер-колла ────────────────────────────────────────

export async function postManagerCallAnalysis(
  issueId: string,
  parentCommentId: string,
  analysis: ManagerCallAnalysis
): Promise<void> {
  const emoji = {
    passed: '✅',
    rejected: '❌',
    on_hold: '⏸️',
  }[analysis.stageResult] ?? '❓';

  const body = `
## 🤖 MANAGER CALL ANALYSIS

**Result:** ${emoji} ${analysis.stageResult.toUpperCase()}

---

### Overall Impression
${analysis.overallImpression}

### 💬 Soft Skills
- **Communication:** ${analysis.softSkills.communication}
- **Motivation:** ${analysis.softSkills.motivation}
- **Culture Fit:** ${analysis.softSkills.cultureFit}
- **Salary Expectations:** ${analysis.softSkills.salaryExpectations}
- **English / Clarity:** ${analysis.softSkills.clarityOfThought}

### ✅ Strengths
${analysis.strengths.map(s => `- ${s}`).join('\n')}

### ❌ Weaknesses
${analysis.weaknesses.map(w => `- ${w}`).join('\n')}

${analysis.risks.length > 0 ? `### ⚠️ Risks\n${analysis.risks.map(r => `- ${r}`).join('\n')}` : ''}

### 🎯 Broker Soft Fit
- **Covered:** ${analysis.brokerSoftFit.coveredRequirements.join(', ') || '—'}
- **Missing:** ${analysis.brokerSoftFit.missingRequirements.join(', ') || '—'}
- ${analysis.brokerSoftFit.fitSummary}

${analysis.decisionBreakers.length > 0
  ? `### ❌ Decision Breakers\n${analysis.decisionBreakers.map(d => `- ${d}`).join('\n')}`
  : ''}

### Reasoning
${analysis.reasoning}

### 📋 Recommendation for Recruiter
${analysis.recommendation}
`.trim();

  await postReplyWithRetry(issueId, parentCommentId, body);
}

// ── Постинг технического анализа ──────────────────────────────────────────

export async function postTechnicalAnalysis(
  issueId: string,
  parentCommentId: string,
  analysis: TechnicalAnalysis
): Promise<void> {
  const emoji = {
    hire: '✅',
    no_hire: '❌',
    uncertain: '⚠️',
  }[analysis.recommendation] ?? '❓';

  const body = `
## 🤖 TECHNICAL CALL ANALYSIS

**Recommendation:** ${emoji} ${analysis.recommendation.toUpperCase()}
**Detected Level:** ${analysis.technicalLevel ?? '—'}
**Score:** ${analysis.score}/100

---

### Overall Assessment
${analysis.overallAssessment}

### 📄 CV Match — ${analysis.cvMatch.cvMatchScore}%
- **Confirmed:** ${analysis.cvMatch.confirmedSkills.join(', ') || '—'}
- **Unconfirmed:** ${analysis.cvMatch.unconfirmedSkills.join(', ') || '—'}
${analysis.cvMatch.discrepancies.length > 0
  ? `- **Discrepancies:** ${analysis.cvMatch.discrepancies.join(', ')}`
  : ''}

### 🎯 Broker Match — ${analysis.brokerRequestMatch.brokerMatchScore}%
- **Covered:** ${analysis.brokerRequestMatch.coveredRequirements.join(', ') || '—'}
- **Missing:** ${analysis.brokerRequestMatch.missingRequirements.join(', ') || '—'}
- ${analysis.brokerRequestMatch.brokerFitSummary}

### ✅ Strengths
${analysis.strengths.map(s => `- ${s}`).join('\n')}

### ❌ Weaknesses
${analysis.weaknesses.map(w => `- ${w}`).join('\n')}

### 🔧 Technical Skills
- **Depth of Knowledge:** ${analysis.technicalSkills.depthOfKnowledge}
- **Problem Solving:** ${analysis.technicalSkills.problemSolving}
- **System Design:** ${analysis.technicalSkills.systemDesign}
- **Code Quality:** ${analysis.technicalSkills.codeQuality}

${analysis.decisionBreakers.length > 0
  ? `### ❌ Decision Breakers\n${analysis.decisionBreakers.map(d => `- ${d}`).join('\n')}`
  : ''}

### Reasoning
${analysis.reasoning}

### Role Fit Summary
${analysis.roleFitSummary}
`.trim();

  await postReplyWithRetry(issueId, parentCommentId, body);
}

// ── Постинг финального анализа ────────────────────────────────────────────

export async function postFinalResult(
  issueId: string,
  parentCommentId: string,
  analysis: any,
  decision: 'hired' | 'lost'
): Promise<void> {
  const emoji = decision === 'hired' ? '✅' : '❌';

  const body = `
## 🤖 FINAL RESULT

**Decision:** ${emoji} ${decision.toUpperCase()}

---

### Overall Summary
${analysis.overallAssessment}

### 💬 Soft Skills Summary
${analysis.softSkillsSummary}

### 🔧 Technical Skills Summary
${analysis.technicalSummary}

### Why ${decision === 'hired' ? 'Hired' : 'Rejected'}
${analysis.reasoning}

${analysis.decisionBreakers?.length > 0
  ? `### ❌ Key Failure Points\n${analysis.decisionBreakers.map((d: string) => `- ${d}`).join('\n')}`
  : ''}

### ✅ Strengths
${analysis.strengths.map((s: string) => `- ${s}`).join('\n')}

### ❌ Areas for Improvement
${analysis.weaknesses.map((w: string) => `- ${w}`).join('\n')}

### 📋 Recommendations
${analysis.recommendation}
`.trim();

  await postReplyWithRetry(issueId, parentCommentId, body);
}