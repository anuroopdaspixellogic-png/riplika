const PROFANITY_STEMS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'dickhead',
  'cunt',
  'slut',
  'whore',
  'retard',
  'faggot',
  'nigg',
]

const PROFANITY_RE = new RegExp(`\\b(${PROFANITY_STEMS.join('|')})\\w*`, 'gi')

/**
 * Keeps the first letter so the sentence still reads naturally, masks the rest.
 * This is a lightweight safety net, not a substitute for human moderation.
 */
export function maskProfanity(text) {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(PROFANITY_RE, (word) => word[0] + '*'.repeat(Math.max(0, word.length - 1)))
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, 500)
}

const REPORT_REASONS = new Set(['nudity', 'harassment', 'minor', 'spam', 'violence', 'other'])

export function sanitizeReportReason(reason) {
  return REPORT_REASONS.has(reason) ? reason : 'other'
}

export function isReportReason(reason) {
  return REPORT_REASONS.has(reason)
}
