import type { FocusSettings } from "./types";

/** Random coefficients, integer answers and no evaluated/generated code. */
export function createMathChallenge(seed: number, difficulty: "equation" | "calculus") {
  const a = 2 + (seed % 8);
  const x = 1 + ((seed >>> 5) % 12);
  const b = 1 + ((seed >>> 10) % 20);
  if (difficulty === "equation") return { prompt: `${a}x + ${b} = ${a * x + b}; x = ?`, answer: x };
  return seed % 2 === 0
    ? { prompt: `f(x) = ${a}x³ + ${b}x; f′(${x}) = ?`, answer: 3 * a * x * x + b }
    : { prompt: `∫₀^${x} (${2 * a}x + ${b}) dx = ?`, answer: a * x * x + b * x };
}
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}
export function verifyUnlock(
  settings: FocusSettings,
  seed: number,
  startedAt: number,
  proof?: string,
  now = Date.now()
): void {
  const policy = settings.endPage.groupUnlock;
  if (policy.method === "wait" && now < startedAt + policy.waitSeconds * 1000)
    throw new Error("Wait has not finished");
  if (
    policy.method === "math" &&
    (!proof?.trim() || Number(proof) !== createMathChallenge(seed, policy.mathDifficulty).answer)
  )
    throw new Error("Incorrect answer");
  if (
    policy.method === "password" &&
    (!policy.passwordVerifier || proof !== policy.passwordVerifier)
  )
    throw new Error("Incorrect password");
}
export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
/** Annotation buckets are excluded from quota totals and never added to target totals twice. */
export const extraUsageKey = (id: string) => `extra:${id}`;
export const freeUsageKey = (id: string) => `free:${id}`;
