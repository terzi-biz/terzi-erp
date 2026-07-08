/**
 * Безпечний обчислювач формул для no-code напрямків.
 * Дозволяє: числа, ідентифікатори (a.b.c), + - * / %, дужки, порівняння, && ||,
 * тернарний ?:, та функції з whitelist.
 * Формули пишуть тільки адміни, але ми все одно уникаємо eval/Function на довільному коді:
 * використовуємо простий рекурсивний парсер.
 */

export type FormulaContext = Record<string, unknown>;

const FUNCS: Record<string, (...args: number[]) => number> = {
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  sqrt: Math.sqrt,
  pow: Math.pow,
  if: (c, a, b) => (c ? a : b),
};

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "punct"; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") { i++; continue; }
    if ((c >= "0" && c <= "9") || (c === "." && src[i + 1] >= "0" && src[i + 1] <= "9")) {
      let j = i; while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: "num", v: Number(src.slice(i, j)) }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) }); i = j; continue;
    }
    // 2-char ops
    const two = src.slice(i, i + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(two)) {
      out.push({ t: "op", v: two }); i += 2; continue;
    }
    if ("+-*/%<>!?:,".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    if ("()".includes(c)) { out.push({ t: "punct", v: c }); i++; continue; }
    throw new Error(`Unexpected char '${c}' at ${i}`);
  }
  return out;
}

function resolveId(path: string, ctx: FormulaContext): number {
  const parts = path.split(".");
  let cur: unknown = ctx;
  for (const p of parts) {
    if (cur == null) return 0;
    cur = (cur as Record<string, unknown>)[p];
  }
  if (cur === true) return 1;
  if (cur === false || cur == null) return 0;
  const n = Number(cur);
  return Number.isFinite(n) ? n : 0;
}

class Parser {
  i = 0;
  constructor(private toks: Token[], private ctx: FormulaContext) {}
  peek(): Token | undefined { return this.toks[this.i]; }
  eat(): Token { return this.toks[this.i++]; }
  match(v: string): boolean {
    const t = this.peek();
    if (t && (t.t === "op" || t.t === "punct") && t.v === v) { this.i++; return true; }
    return false;
  }
  // ternary: or ('?' expr ':' ternary)?
  parseTernary(): number {
    const cond = this.parseOr();
    if (this.match("?")) {
      const a = this.parseTernary();
      if (!this.match(":")) throw new Error("Expected ':'");
      const b = this.parseTernary();
      return cond ? a : b;
    }
    return cond;
  }
  parseOr(): number {
    let l = this.parseAnd();
    while (this.match("||")) l = (l || this.parseAnd()) ? 1 : 0;
    return l;
  }
  parseAnd(): number {
    let l = this.parseCmp();
    while (this.match("&&")) l = (l && this.parseCmp()) ? 1 : 0;
    return l;
  }
  parseCmp(): number {
    let l = this.parseAdd();
    while (true) {
      if (this.match("==")) l = l === this.parseAdd() ? 1 : 0;
      else if (this.match("!=")) l = l !== this.parseAdd() ? 1 : 0;
      else if (this.match("<=")) l = l <= this.parseAdd() ? 1 : 0;
      else if (this.match(">=")) l = l >= this.parseAdd() ? 1 : 0;
      else if (this.match("<")) l = l < this.parseAdd() ? 1 : 0;
      else if (this.match(">")) l = l > this.parseAdd() ? 1 : 0;
      else break;
    }
    return l;
  }
  parseAdd(): number {
    let l = this.parseMul();
    while (true) {
      if (this.match("+")) l = l + this.parseMul();
      else if (this.match("-")) l = l - this.parseMul();
      else break;
    }
    return l;
  }
  parseMul(): number {
    let l = this.parseUnary();
    while (true) {
      if (this.match("*")) l = l * this.parseUnary();
      else if (this.match("/")) { const r = this.parseUnary(); l = r === 0 ? 0 : l / r; }
      else if (this.match("%")) { const r = this.parseUnary(); l = r === 0 ? 0 : l % r; }
      else break;
    }
    return l;
  }
  parseUnary(): number {
    if (this.match("-")) return -this.parseUnary();
    if (this.match("+")) return this.parseUnary();
    if (this.match("!")) return this.parseUnary() ? 0 : 1;
    return this.parsePrimary();
  }
  parsePrimary(): number {
    const t = this.peek();
    if (!t) throw new Error("Unexpected end");
    if (t.t === "num") { this.i++; return t.v; }
    if (t.t === "punct" && t.v === "(") {
      this.i++; const v = this.parseTernary();
      if (!this.match(")")) throw new Error("Expected ')'");
      return v;
    }
    if (t.t === "id") {
      this.i++;
      // function call?
      if (this.match("(")) {
        const args: number[] = [];
        if (!this.match(")")) {
          args.push(this.parseTernary());
          while (this.match(",")) args.push(this.parseTernary());
          if (!this.match(")")) throw new Error("Expected ')'");
        }
        const fn = FUNCS[t.v];
        if (!fn) throw new Error(`Unknown function ${t.v}`);
        return fn(...args);
      }
      return resolveId(t.v, this.ctx);
    }
    throw new Error(`Unexpected token ${JSON.stringify(t)}`);
  }
}

export function evalFormula(expr: string, ctx: FormulaContext): number {
  if (!expr || !expr.trim()) return 0;
  try {
    const p = new Parser(tokenize(expr), ctx);
    const v = p.parseTernary();
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

export function tryEvalFormula(expr: string, ctx: FormulaContext): { ok: true; value: number } | { ok: false; error: string } {
  if (!expr || !expr.trim()) return { ok: true, value: 0 };
  try {
    const p = new Parser(tokenize(expr), ctx);
    const v = p.parseTernary();
    return { ok: true, value: Number.isFinite(v) ? v : 0 };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
