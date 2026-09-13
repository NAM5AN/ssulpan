// Heuristic only: this never rejects or regenerates a completed draft.
export const LITERARY_ENDING_WARNING_RATIO = 0.25;
export const LITERARY_ENDING_MINIMUM_MATCHES = 3;

const pairedQuotePattern = /"(?:\\.|[^"\\])*"|“[^”]*”|'(?:\\.|[^'\\])*'|‘[^’]*’|「[^」]*」|『[^』]*』/gsu;
const endingPattern = /(?:했다|였다|이었다|았다|었다|([가-힣]))다$/u;

function hasSsangSiotFinal(syllable) {
  const code = syllable.codePointAt(0) - 0xac00;
  return code >= 0 && code <= 0xd7a3 - 0xac00 && code % 28 === 20;
}

function endingKind(sentence) {
  const value = sentence.trim().replace(/[.!?…]+$/gu, '').trim();
  const match = value.match(endingPattern);
  if (!match) return '';
  if (match[1] && !hasSsangSiotFinal(match[1])) return '';
  for (const suffix of ['이었다', '했다', '였다', '았다', '었다']) {
    if (value.endsWith(suffix)) return suffix;
  }
  return 'ㅆ다 축약';
}

function maskQuotedAndDialogue(text) {
  let quotedSpanCount = 0;
  const unquoted = String(text || '').replace(pairedQuotePattern, value => {
    quotedSpanCount += 1;
    return ' '.repeat(value.length);
  });
  let dialogueLineCount = 0;
  const narrative = unquoted.split(/\r?\n/u).map(line => {
    if (/^\s*(?:[-–—]\s+|[가-힣A-Za-z0-9_]{1,12}\s*[:：])/u.test(line)) {
      dialogueLineCount += 1;
      return '';
    }
    return line;
  }).join('\n');
  return { narrative, quotedSpanCount, dialogueLineCount };
}

export function isExplicitLiteraryTone(tone) {
  return /문어|서술체|평서체|소설체/u.test(String(tone || ''));
}

const terminalSinglePeriodPattern = /(?:(?<!\.)\.(?!\.)|[。．])(?=(?:["'”’」』)\]}〉》】])*(?:\s|$|[\p{Script=Hangul}]))/gu;

// Default community copy does not use a single sentence-ending full stop.
// Keep ellipses, decimal points, domains and filename extensions intact.
// An explicitly literary tone is the only exemption.
export function normalizeColloquialPeriods(text, { tone = '' } = {}) {
  const value = String(text ?? '');
  const exempt = isExplicitLiteraryTone(tone);
  if (!value || exempt) {
    return {
      checker: 'colloquial-terminal-period-v1',
      tone: String(tone || ''),
      exempt,
      removedCount: 0,
      text: value,
    };
  }
  let removedCount = 0;
  const normalized = value.replace(terminalSinglePeriodPattern, () => {
    removedCount += 1;
    return '';
  });
  return {
    checker: 'colloquial-terminal-period-v1',
    tone: String(tone || ''),
    exempt,
    removedCount,
    text: normalized,
  };
}

export function analyzeNarrativeEndings(text, { tone = '' } = {}) {
  const masked = maskQuotedAndDialogue(text);
  const sentences = masked.narrative
    .split(/[.!?…]+\s*|\n+/u)
    .map(value => value.trim())
    .filter(Boolean);
  const countsByEnding = {};
  for (const sentence of sentences) {
    const kind = endingKind(sentence);
    if (kind) countsByEnding[kind] = (countsByEnding[kind] || 0) + 1;
  }
  const literaryEndingCount = Object.values(countsByEnding).reduce((sum, value) => sum + value, 0);
  const narrativeSentenceCount = sentences.length;
  const ratio = narrativeSentenceCount ? literaryEndingCount / narrativeSentenceCount : 0;
  const exempt = isExplicitLiteraryTone(tone);
  return {
    checker: 'korean-past-literary-endings-v1',
    tone: String(tone || ''),
    exempt,
    quotePolicy: 'paired quotes and dialogue-form lines excluded',
    narrativeSentenceCount,
    literaryEndingCount,
    ratio: Number(ratio.toFixed(3)),
    thresholdRatio: LITERARY_ENDING_WARNING_RATIO,
    minimumMatches: LITERARY_ENDING_MINIMUM_MATCHES,
    countsByEnding,
    excludedQuotedSpanCount: masked.quotedSpanCount,
    excludedDialogueLineCount: masked.dialogueLineCount,
    warning: !exempt && literaryEndingCount >= LITERARY_ENDING_MINIMUM_MATCHES && ratio >= LITERARY_ENDING_WARNING_RATIO,
  };
}
