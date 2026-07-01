/**
 * Безпечний обчислювач формул для ERP-калькулятора TERZI.
 *
 * Підтримка:
 *   - оператори: + - * / ( ) , < > <= >= == != && ||
 *   - унарний мінус
 *   - функції: ROUNDUP, ROUNDDOWN, ROUND, MAX, MIN, IF, SUM, ABS, CEIL, FLOOR
 *   - посилання: inputs.<field_key>, coef.<coef_key>
 *   - числові літерали
 *
 * Мета — прямий переклад Excel-формул з xlsx-файлів TERZI у детермінований
 * TypeScript. НІКОЛИ не використовує eval/Function.
 */

export type Scope = {
  inputs: Record<string, number>;
  coef: Record<string, number>;
};

type Tok =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "lp" } | { t: "rp" } | { t: "comma" } | { t: "dot" };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c === "(") { out.push({ t: "lp" }); i++; continue; }
    if (c === ")") { out.push({ t: "rp" }); i++; continue; }
    if (c === ",") { out.push({ t: "comma" }); i++; continue; }
    if (c === ".") { out.push({ t: "dot" }); i++; continue; }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      const num = parseFloat(src.slice(i, j).replace(/_/g, ""));
      if (!Number.isFinite(num)) throw new Error(`Invalid number at ${i}`);
      out.push({ t: "num", v: num }); i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) }); i = j; continue;
    }
    // multichar operators
    const two = src.slice(i, i + 2);
    if (["<=", ">=", "==", "!=", "&&", "||"].includes(two)) {
      out.push({ t: "op", v: two }); i += 2; continue;
    }
    if ("+-*/<>".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`Unexpected char '${c}' at ${i}`);
  }
  return out;
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  ROUNDUP: (v, d = 0) => {
    const p = Math.pow(10, d);
    return Math.ceil(v * p) / p;
  },
  ROUNDDOWN: (v, d = 0) => {
    const p = Math.pow(10, d);
    return Math.floor(v * p) / p;
  },
  ROUND: (v, d = 0) => {
    const p = Math.pow(10, d);
    return Math.round(v * p) / p;
  },
  MAX: (...a) => Math.max(...a),
  MIN: (...a) => Math.min(...a),
  IF: (cond, a, b) => (cond ? a : b),
  SUM: (...a) => a.reduce((s, x) => s + x, 0),
  ABS: (v) => Math.abs(v),
  CEIL: (v) => Math.ceil(v),
  FLOOR: (v) => Math.floor(v),
};

/**
 * Recursive-descent parser + evaluator (Pratt-style precedence).
 * Grammar:
 *   expr    = or
 *   or      = and ('||' and)*
 *   and     = cmp ('&&' cmp)*
 *   cmp     = add (('<'|'>'|'<='|'>='|'=='|'!=') add)?
 *   add     = mul (('+'|'-') mul)*
 *   mul     = unary (('*'|'/') unary)*
 *   unary   = '-' unary | primary
 *   primary = num | id ('.' id)? | id '(' args ')' | '(' expr ')'
 */
class Parser {
  private p = 0;
  constructor(private toks: Tok[], private scope: Scope) {}

  peek(): Tok | undefined { return this.toks[this.p]; }
  eat(): Tok { return this.toks[this.p++]; }

  parse(): number {
    const v = this.or();
    if (this.p !== this.toks.length) throw new Error(`Trailing tokens at ${this.p}`);
    return v;
  }
  or(): number {
    let v = this.and();
    while (this.peek()?.t === "op" && this.peek()!.v === "||") { this.eat(); const r = this.and(); v = v || r ? 1 : 0; }
    return v;
  }
  and(): number {
    let v = this.cmp();
    while (this.peek()?.t === "op" && this.peek()!.v === "&&") { this.eat(); const r = this.cmp(); v = v && r ? 1 : 0; }
    return v;
  }
  cmp(): number {
    const l = this.add();
    const t = this.peek();
    if (t?.t === "op" && ["<", ">", "<=", ">=", "==", "!="].includes(t.v)) {
      this.eat(); const r = this.add();
      switch (t.v) {
        case "<": return l < r ? 1 : 0;
        case ">": return l > r ? 1 : 0;
        case "<=": return l <= r ? 1 : 0;
        case ">=": return l >= r ? 1 : 0;
        case "==": return l === r ? 1 : 0;
        case "!=": return l !== r ? 1 : 0;
      }
    }
    return l;
  }
  add(): number {
    let v = this.mul();
    while (this.peek()?.t === "op" && (this.peek()!.v === "+" || this.peek()!.v === "-")) {
      const op = this.eat().v as "+" | "-"; const r = this.mul(); v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  mul(): number {
    let v = this.unary();
    while (this.peek()?.t === "op" && (this.peek()!.v === "*" || this.peek()!.v === "/")) {
      const op = this.eat().v as "*" | "/"; const r = this.unary();
      v = op === "*" ? v * r : (r === 0 ? 0 : v / r);
    }
    return v;
  }
  unary(): number {
    const t = this.peek();
    if (t?.t === "op" && t.v === "-") { this.eat(); return -this.unary(); }
    if (t?.t === "op" && t.v === "+") { this.eat(); return this.unary(); }
    return this.primary();
  }
  primary(): number {
    const t = this.eat();
    if (!t) throw new Error("Unexpected end");
    if (t.t === "num") return t.v;
    if (t.t === "lp") { const v = this.or(); const r = this.eat(); if (r?.t !== "rp") throw new Error("Expected )"); return v; }
    if (t.t === "id") {
      // function call
      if (this.peek()?.t === "lp") {
        this.eat();
        const args: number[] = [];
        if (this.peek()?.t !== "rp") {
          args.push(this.or());
          while (this.peek()?.t === "comma") { this.eat(); args.push(this.or()); }
        }
        const rp = this.eat(); if (rp?.t !== "rp") throw new Error("Expected )");
        const fn = FUNCS[t.v.toUpperCase()];
        if (!fn) throw new Error(`Unknown function ${t.v}`);
        return fn(...args);
      }
      // reference: id.id
      if (this.peek()?.t === "dot") {
        this.eat();
        const k = this.eat();
        if (k?.t !== "id") throw new Error("Expected identifier after '.'");
        if (t.v === "inputs") return this.scope.inputs[k.v] ?? 0;
        if (t.v === "coef") return this.scope.coef[k.v] ?? 0;
        throw new Error(`Unknown namespace ${t.v}`);
      }
      // bare identifier: treat as input
      return this.scope.inputs[t.v] ?? 0;
    }
    throw new Error(`Unexpected token ${JSON.stringify(t)}`);
  }
}

export function evalFormula(expr: string | null | undefined, scope: Scope): number {
  if (!expr || !expr.trim()) return 0;
  try {
    const toks = tokenize(expr);
    const p = new Parser(toks, scope);
    const v = p.parse();
    return Number.isFinite(v) ? v : 0;
  } catch (e) {
    console.error("[formula-eval]", expr, e);
    return 0;
  }
}
