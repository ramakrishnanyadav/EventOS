/**
 * EVENTOS v4 — Formatters & Utility Functions
 */

/**
 * Formats database category enum into human readable display string
 * @param {string} category
 * @returns {string}
 */
export function formatCategoryName(category) {
  switch (category) {
    case 'INTERNSHIP': return 'Internships';
    case 'JOB': return 'Jobs';
    case 'COMPETITION': return 'Competitions';
    case 'MOCK_TEST': return 'Mock Tests';
    case 'MOCK_INTERVIEW': return 'Mock Interviews';
    case 'HACKATHON': return 'Hackathons';
    case 'MENTORSHIP': return 'Mentorships';
    default: return 'Opportunities';
  }
}

/**
 * Computes remaining days until closing deadline
 * @param {string} deadlineIsoDate
 * @returns {number}
 */
export function computeDaysRemaining(deadlineIsoDate) {
  if (!deadlineIsoDate) return 0;
  const deadlineTime = new Date(deadlineIsoDate).getTime();
  const nowTime = new Date().getTime();
  return Math.max(0, Math.ceil((deadlineTime - nowTime) / (1000 * 60 * 60 * 24)));
}

/**
 * Executes native sharing or copies URL to clipboard with fallback
 * @param {string} title
 * @param {string} url
 * @param {Function} [onSuccess]
 */
export function copyOrShareLink(title, url, onSuccess) {
  if (navigator.share) {
    navigator.share({ title, url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url).then(() => {
      if (onSuccess) onSuccess();
    });
  }
}
