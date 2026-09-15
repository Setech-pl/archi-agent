import { containsControlCharacter, countUnicodeCharacters } from "../knowledge-pack/source-limits.js";

/**
 * Text policy for every value that reaches PlantUML source.
 *
 * The renderer never escapes its way out of dangerous input: text that could change the meaning of
 * the emitted source is rejected. Display text is limited to letters, marks, digits, single spaces
 * and a small set of punctuation, so quotes, backslashes, angle brackets, brackets, at signs,
 * exclamation marks and every other markup or preprocessor character are impossible. Line breaks and
 * control characters are rejected, so display text can never start a line of its own.
 */

export const displayTextProblems = [
  "empty",
  "too-long",
  "line-break",
  "control-character",
  "directive-like",
  "remote-url",
  "comment-delimiter",
  "creole-markup",
  "forbidden-character",
  "statement-keyword"
] as const;

export type DisplayTextProblem = (typeof displayTextProblems)[number];

export const plantUmlTextLimits = Object.freeze({
  maxDisplayTextChars: 256,
  maxLabelChars: 160,
  maxBusinessDescriptionChars: 500
});

export interface DisplayTextOptions {
  readonly maxChars?: number;
  /** Also reject text that starts with a PlantUML statement keyword (for generator-supplied text). */
  readonly rejectStatementKeywords?: boolean;
}

const allowedCharacter = /^[\p{L}\p{M}\p{N} .,:;()\-_/?&+']$/u;
const directiveLike = /[@!]\s*[A-Za-z]/u;
const remoteUrl = /[A-Za-z][A-Za-z0-9+.-]*:\/\/|\b(?:https?|ftp|file|data|javascript|mailto):|\bwww\./iu;
const commentDelimiter = /\/'|'\/|^\s*'/u;
const creoleMarkup = /\/\/|--|__|\*\*|~~|""|\[\[|\]\]|<[A-Za-z&/]/u;
const statementKeyword =
  /^\s*(?:end|else|alt|opt|loop|group|par|break|critical|skinparam|legend|endlegend|newpage|autonumber|activate|deactivate|return|note|hnote|rnote|title|hide|show)(?![\p{L}\p{N}_])/iu;

/** Returns the first problem of a display text, or undefined when the text is safe to emit. */
export function displayTextProblem(value: unknown, options: DisplayTextOptions = {}): DisplayTextProblem | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "empty";
  }

  if (countUnicodeCharacters(value) > (options.maxChars ?? plantUmlTextLimits.maxDisplayTextChars)) {
    return "too-long";
  }

  if (value.includes("\n") || value.includes("\r") || value.includes("\u2028") || value.includes("\u2029")) {
    return "line-break";
  }

  if (containsControlCharacter(value)) {
    return "control-character";
  }

  if (directiveLike.test(value)) {
    return "directive-like";
  }

  if (remoteUrl.test(value)) {
    return "remote-url";
  }

  if (commentDelimiter.test(value)) {
    return "comment-delimiter";
  }

  if (creoleMarkup.test(value)) {
    return "creole-markup";
  }

  for (const character of value) {
    if (!allowedCharacter.test(character)) {
      return "forbidden-character";
    }
  }

  if (options.rejectStatementKeywords === true && statementKeyword.test(value)) {
    return "statement-keyword";
  }

  return undefined;
}

export function isSafeDisplayText(value: unknown, options: DisplayTextOptions = {}): value is string {
  return displayTextProblem(value, options) === undefined;
}

/** Thrown only for programming errors: the renderer must never be handed text that failed validation. */
export class UnsafePlantUmlTextError extends Error {
  public readonly problem: DisplayTextProblem;

  public constructor(problem: DisplayTextProblem) {
    super(`Display text was rejected before rendering (${problem}).`);
    this.name = "UnsafePlantUmlTextError";
    this.problem = problem;
  }
}

export function assertSafeDisplayText(value: string, options: DisplayTextOptions = {}): string {
  const problem = displayTextProblem(value, options);

  if (problem !== undefined) {
    throw new UnsafePlantUmlTextError(problem);
  }

  return value;
}

/** A double-quoted PlantUML name. Quotes and backslashes can never occur inside, so nothing is escaped. */
export function quotedName(value: string): string {
  return `"${assertSafeDisplayText(value)}"`;
}

/** Message text after the colon of an arrow statement. */
export function messageText(value: string): string {
  return assertSafeDisplayText(value);
}

/** Body of a single-line PlantUML comment. */
export function commentText(value: string): string {
  return assertSafeDisplayText(value);
}
