// Дешёвая эвристика "это вообще похоже на нужный контент?" — без LLM.
// Ловит частый случай: ссылка отдаёт login/error-страницу вместо реального
// транскрипта/CV, или извлечение вернуло почти пустой/битый текст. Это
// намеренно грубый фильтр — неоднозначные случаи (реальное, но слабое или
// короткое интервью) оставляем LLM-based data-quality гейту в промптах.

const GATE_PAGE_MARKERS: RegExp[] = [
  /sign in to (view|continue|access)/i,
  /please log ?in to (continue|view|access)/i,
  /you (need|must) (to )?(sign|log) in/i,
  /session (has )?expired/i,
  /access (is )?denied/i,
  /\b403 forbidden\b/i,
  /\b404\b.{0,20}(not found|page not found)/i,
  /you (do not|don't) have permission to (view|access)/i,
];

const MIN_LENGTH: Record<'transcript' | 'cv' | 'feedback', number> = {
  transcript: 250,
  cv: 100,
  feedback: 20,
};

// Возвращает короткую человекочитаемую причину, если контент выглядит
// непригодным, иначе null.
export function assessContentQuality(
  text: string,
  kind: 'transcript' | 'cv' | 'feedback',
): string | null {
  const trimmed = text.trim();
  const label = kind === 'transcript' ? 'interview transcript' : kind === 'cv' ? 'CV' : 'manager feedback';

  if (trimmed.length < MIN_LENGTH[kind]) {
    return kind === 'feedback'
      ? `Manager feedback is only ${trimmed.length} characters — too short to analyze meaningfully.`
      : `Extracted content is only ${trimmed.length} characters — too short to be a real ${label}.`;
  }
  if (kind === 'feedback') return null;

  const gateMatch = GATE_PAGE_MARKERS.find(re => re.test(trimmed));
  if (gateMatch) {
    return `Extracted content looks like a login/error page rather than the actual ${label}.`;
  }

  const letters = trimmed.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '').length;
  if (letters / trimmed.length < 0.3) {
    return `Extracted content doesn't look like readable text (mostly non-letter characters) — likely a broken extraction, not the actual ${label}.`;
  }

  return null;
}
