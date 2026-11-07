// Password rules, checked in the browser so people see exactly what's missing
// instead of Supabase's generic message. Must match Supabase → Authentication →
// Sign In / Providers → Email (minimum length and "Password requirements").
import { MIN_PASSWORD } from './config.js';

// Supabase's "lowercase, uppercase, digits and symbols" option. Its symbol set
// is the ASCII punctuation below; spaces and accented letters don't count.
const SYMBOLS = `!@#$%^&*()_+-=[]{};'\\:"|<>?,./\`~`;
const RULES = [
  { test: (p) => /[a-z]/.test(p), label: 'a lowercase letter' },
  { test: (p) => /[A-Z]/.test(p), label: 'an uppercase letter' },
  { test: (p) => /[0-9]/.test(p), label: 'a number' },
  { test: (p) => [...p].some((c) => SYMBOLS.includes(c)), label: 'a symbol such as ! ? # or %' },
];

// Returns what the password still needs, e.g. ["2 more characters", "a number"].
export function passwordProblems(password) {
  const problems = [];
  const short = MIN_PASSWORD - password.length;
  if (short > 0) problems.push(`${short} more character${short === 1 ? '' : 's'}`);
  for (const rule of RULES) if (!rule.test(password)) problems.push(rule.label);
  return problems;
}

function list(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

export function passwordMessage(password) {
  const problems = passwordProblems(password);
  return problems.length ? `Your password still needs ${list(problems)}.` : '';
}

// Wires the hint under a password field: the rules at first, then only
// what's still missing as the person types.
export function attachPasswordHint(input, hintEl) {
  input.minLength = MIN_PASSWORD;
  const intro = `At least ${MIN_PASSWORD} characters, with a lowercase letter, an uppercase letter, a number and a symbol.`;
  const update = () => {
    if (!input.value) return (hintEl.textContent = intro);
    const problems = passwordProblems(input.value);
    hintEl.textContent = problems.length ? `Still needs ${list(problems)}.` : 'Password looks good.';
  };
  input.addEventListener('input', update);
  update();
}

// Turns Supabase's weak_password error into plain words. The server checks
// the same rules, plus leaked-password protection if the plan allows it.
export function weakPasswordMessage(error, password) {
  if (error?.reasons?.includes?.('pwned')) {
    return 'That password has appeared in a known data breach. Please choose a different one.';
  }
  return passwordMessage(password) || 'Please choose a different password.';
}
