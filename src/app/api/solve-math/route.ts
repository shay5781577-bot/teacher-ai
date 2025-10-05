// src/app/api/solve-math/route.ts
import { NextRequest } from "next/server";
import {
  simplify, derivative, evaluate, lusolve, matrix,
} from "mathjs";

/* =========================
   Utils & Normalization
   ========================= */
function normSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}
function normEq(s: string) {
  return s.replace(/\s+/g, "").replace(/−/g, "-");
}
function toLeftMinusRight(expr: string) {
  if (!expr.includes("=")) return expr;
  const [L, R] = expr.split("=");
  return simplify(`(${L}) - (${R})`).toString(); // f(...)=0
}
function onlyVars(exprStr: string, allowed: string[]) {
  const re = /[a-zA-Z]/g;
  const m = exprStr.match(re) ?? [];
  return m.every(ch => allowed.includes(ch.toLowerCase()));
}
function isInt(n: number) {
  return Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-12;
}
function isPerfectSquare(n: number) {
  if (n < 0) return false;
  const r = Math.round(Math.sqrt(n));
  return r * r === n;
}

/* =========================
   Poly helpers (degree ≤ 2)
   ========================= */
function polyDegreeUpTo2(fStr: string): 0 | 1 | 2 | -1 {
  try {
    const f0 = evaluate(simplify(fStr).toString(), { x: 0 });
    const f1 = evaluate(derivative(fStr, "x").toString(), { x: 0 });
    const f2 = evaluate(derivative(derivative(fStr, "x").toString(), "x").toString(), { x: 0 });
    if (f2 !== 0) return 2;
    if (f1 !== 0) return 1;
    return 0;
  } catch {
    return -1;
  }
}
function quadraticCoeffs(fStr: string) {
  const c = evaluate(simplify(fStr).toString(), { x: 0 });
  const b = evaluate(derivative(fStr, "x").toString(), { x: 0 });
  const a2 = evaluate(derivative(derivative(fStr, "x").toString(), "x").toString(), { x: 0 });
  const a = 0.5 * a2;
  return { a: Number(a), b: Number(b), c: Number(c) };
}
function linearCoeffs1Var(fStr: string) {
  const a = evaluate(derivative(fStr, "x").toString(), { x: 0 });
  const c = evaluate(simplify(fStr).toString(), { x: 0 });
  return { a: Number(a), c: Number(c) };
}
function isLinearXYZ(fStr: string) {
  try {
    const dxx = evaluate(derivative(derivative(fStr, "x").toString(), "x").toString(), { x: 0, y: 0, z: 0 });
    const dyy = evaluate(derivative(derivative(fStr, "y").toString(), "y").toString(), { x: 0, y: 0, z: 0 });
    const dzz = evaluate(derivative(derivative(fStr, "z").toString(), "z").toString(), { x: 0, y: 0, z: 0 });
    const dxy = evaluate(derivative(derivative(fStr, "x").toString(), "y").toString(), { x: 0, y: 0, z: 0 });
    const dxz = evaluate(derivative(derivative(fStr, "x").toString(), "z").toString(), { x: 0, y: 0, z: 0 });
    const dyz = evaluate(derivative(derivative(fStr, "y").toString(), "z").toString(), { x: 0, y: 0, z: 0 });
    return dxx === 0 && dyy === 0 && dzz === 0 && dxy === 0 && dxz === 0 && dyz === 0;
  } catch {
    return false;
  }
}
function linearCoeffsXYZ(fStr: string) {
  const ax = evaluate(derivative(fStr, "x").toString(), { x: 0, y: 0, z: 0 });
  const by = evaluate(derivative(fStr, "y").toString(), { x: 0, y: 0, z: 0 });
  const cz = evaluate(derivative(fStr, "z").toString(), { x: 0, y: 0, z: 0 });
  const d  = evaluate(simplify(fStr).toString(),    { x: 0, y: 0, z: 0 });
  return { a: Number(ax), b: Number(by), c: Number(cz), d: Number(d) };
}

/* =========================
   Solvers (equations/ineq)
   ========================= */
function solveQuadratic(a: number, b: number, c: number) {
  const steps: string[] = [];
  steps.push(`נביא הכול לאגף אחד: ${a}x^2 ${b >= 0 ? "+" : ""}${b}x ${c >= 0 ? "+" : ""}${c} = 0`);
  steps.push(`נוסחת השורשים: x = (-b ± √(b² - 4ac)) / (2a)`);
  const D = b * b - 4 * a * c;
  steps.push(`Δ = b² - 4ac = ${b}² - 4·${a}·${c} = ${D}`);
  if (D < 0) {
    steps.push(`Δ < 0 ⇒ אין פתרונות ממשיים`);
    return { solutions: [] as number[], steps, pretty: "אין פתרונות ממשיים." };
  }
  const sqrtD = Math.sqrt(D);
  const x1 = (-b + sqrtD) / (2 * a);
  const x2 = (-b - sqrtD) / (2 * a);
  steps.push(`√Δ = ${sqrtD}`);
  steps.push(`x₁ = (-${b} + ${sqrtD}) / (2·${a}) = ${x1}`);
  if (D === 0) return { solutions: [x1], steps, pretty: `פתרון יחיד: x = ${x1}` };
  steps.push(`x₂ = (-${b} - ${sqrtD}) / (2·${a}) = ${x2}`);
  return { solutions: [x1, x2], steps, pretty: `פתרונות: x₁ = ${x1}, x₂ = ${x2}` };
}
function solveLinear1Var(a: number, c: number) {
  const steps: string[] = [];
  steps.push(`אחרי איחוד אגפים: ${a}x ${c >= 0 ? "+" : ""}${c} = 0`);
  steps.push(`${a}x = ${-c}`);
  const x = -c / a;
  steps.push(`x = ${-c} / ${a} = ${x}`);
  return { solution: x, steps, pretty: `x = ${x}` };
}

/* 2×2 / 3×3 */
function solveLinearSystemXYZ(eqs: Array<{a:number;b:number;c:number;d:number}>) {
  const n = eqs.length;
  const A:number[][] = [];
  const B:number[][] = [];
  for (let i=0;i<n;i++) {
    const {a,b,c,d} = eqs[i];
    if (n === 2) A.push([a, b]);
    if (n === 3) A.push([a, b, c]);
    B.push([-d]);
  }
  const M = matrix(A);
  const V = matrix(B);
  const sol = lusolve(M, V);
  const x = Number(sol.get([0,0]));
  const y = Number(sol.get([1,0]));
  const z = n===3 ? Number(sol.get([2,0])) : undefined;

  const lines = eqs.map(({a,b,c,d})=>
    `${a}x ${b>=0?"+":""}${b}y` + (n===3 ? ` ${c>=0?"+":""}${c}z` : ``) + ` ${d>=0?"+":""}${d} = 0`
  );

  const steps = [
    `נכתוב מטריצות ונפתור בשיטת LU:`,
    ...lines,
    `תוצאה: ${n===2 ? `x=${x}, y=${y}` : `x=${x}, y=${y}, z=${z}`}`
  ];
  return { x, y, z, steps, pretty: n===2 ? `x=${x}, y=${y}` : `x=${x}, y=${y}, z=${z}` };
}

/* אי-שוויון */
type IOp = ">"|">="|"<"|"<=";
function splitInequality(s: string): null | { left: string; right: string; op: IOp } {
  const ops = [">=", "<=", ">", "<"] as const;
  for (const op of ops) {
    const i = s.indexOf(op);
    if (i !== -1) return { left: s.slice(0,i), right: s.slice(i+op.length), op };
  }
  return null;
}
function formatIntervals(intervals: Array<[number|null, number|null, boolean, boolean]>) {
  return intervals.map(([a,b,ia,ib]) => {
    const L = ia ? "[" : "(";
    const R = ib ? "]" : ")";
    const aa = a==null ? "−∞" : a;
    const bb = b==null ? "+∞" : b;
    return `${L}${aa}, ${bb}${R}`;
  }).join(" ∪ ");
}
function testPoint(fStr: string, op: IOp, x: number) {
  const val = Number(evaluate(simplify(fStr).toString(), { x }));
  if (op === ">")  return val > 0;
  if (op === ">=") return val >= 0;
  if (op === "<")  return val < 0;
  return val <= 0;
}
function solveInequality1Var(fStr: string, deg: 1|2, op: IOp) {
  const steps: string[] = [];
  steps.push(`נגדיר f(x) = ${simplify(fStr).toString()} ונבדוק סימן לפי אזורים.`);
  let roots: number[] = [];
  if (deg === 1) {
    const { a, c } = linearCoeffs1Var(fStr);
    if (a !== 0) roots = [ -c / a ];
    steps.push(`שורש ליניארי: x = ${roots[0] ?? "—"}`);
  } else {
    const { a, b, c } = quadraticCoeffs(fStr);
    const D = b*b - 4*a*c;
    steps.push(`Δ = ${D}`);
    if (D < 0) roots = [];
    else if (D === 0) roots = [ (-b)/(2*a) ];
    else {
      const s = Math.sqrt(D);
      roots = [ (-b + s)/(2*a), (-b - s)/(2*a) ].sort((p,q)=>p-q);
    }
    steps.push(`שורשים: ${roots.length? roots.join(", ") : "אין"}`);
  }

  const pts = [-Infinity, ...roots, Infinity];
  const intervals: Array<[number|null, number|null, boolean, boolean]> = [];
  for (let i=0;i<pts.length-1;i++){
    const a = pts[i], b = pts[i+1];
    const mid = (a===-Infinity && b===Infinity) ? 0 :
                (a===-Infinity ? b-1 : (b===Infinity ? a+1 : (a+b)/2));
    const ok = testPoint(fStr, op, mid);
    if (!ok) continue;
    let includeFrom = false, includeTo = false;
    if (op === ">=" || op === "<=") {
      if (isFinite(a) && Math.abs(evaluate(simplify(fStr).toString(), { x: a })) < 1e-12) includeFrom = true;
      if (isFinite(b) && Math.abs(evaluate(simplify(fStr).toString(), { x: b })) < 1e-12) includeTo = true;
    }
    intervals.push([ isFinite(a)?a:null, isFinite(b)?b:null, includeFrom, includeTo ]);
  }
  return { intervals, steps, pretty: `תחום פתרונות: ${intervals.length? formatIntervals(intervals) : "Ø (ריק)"}` };
}

/* ערך מוחלט */
function splitAbsCompare(exprRaw: string) {
  const s = normEq(exprRaw);
  const parts = s.split("|");
  if (parts.length !== 3) return null; // חייב בדיוק זוג אחד של |
  const g = parts[1];
  const ops = [">=", "<=", ">", "<", "="] as const;
  function findOp(str: string) {
    for (const op of ops) {
      const i = str.indexOf(op);
      if (i !== -1) return { i, op };
    }
    return null;
  }
  const leftWhole  = parts[0];
  const rightWhole = parts[2];

  const rightOp = findOp(rightWhole);
  if (rightOp && rightOp.i === 0) {
    const op = rightOp.op;
    const kExpr = rightWhole.slice(op.length);
    return { g, op, kExpr };
  }
  const leftOp = findOp(leftWhole);
  if (leftOp) {
    const op = leftOp.op;
    const kExpr = leftWhole.slice(0, leftOp.i);
    const flip: Record<string, typeof ops[number]> = { ">": "<", "<": ">", ">=": "<=", "<=": ">=", "=": "=" };
    const op2 = flip[op];
    return { g, op: op2, kExpr };
  }
  return null;
}

/* =========================
   Sequences: Triangular / AP / GP
   ========================= */

/** --- Triangular numbers (T_n = n(n+1)/2) --- */
function triangular(n: number) {
  return (n * (n + 1)) / 2;
}
/** solve n from T_n = m (returns n or null) */
function triangularIndexFor(m: number) {
  // n(n+1)/2 = m  →  n^2 + n - 2m = 0  →  Δ = 1+8m must be a square
  const D = 1 + 8 * m;
  if (!isPerfectSquare(D)) return null;
  const n = (-1 + Math.sqrt(D)) / 2;
  return isInt(n) && n > 0 ? n : null;
}

/** Basic AP & GP helpers (simple use-cases) */
function isAPQuery(q: string) {
  return /(סדרה\s*חשבונית|הפרש\s*קבוע)/i.test(q);
}
function isGPQuery(q: string) {
  return /(סדרה\s*הנדסית|מנה\s*קבועה)/i.test(q);
}
function parseNumber(s?: string) {
  if (!s) return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Try solve triangular tasks from Hebrew OCR */
function trySolveTriangular(query: string) {
  const q = normSpaces(query);
  const looksTri = /(משולש(ים)?|משולשים|נקודות.*משולש|סדרת.*נקודות.*משולש)/i.test(q);
  if (!looksTri) return null;

  // 1) "כמה נקודות באיבר ה-50" / "באיבר מס' 50" / "T_50"
  const nMatch = q.match(/איבר(?:\s*ה|-)?\s*(\d+)|ה-?\s*(\d+)\s*איבר|T[_\s]*?(\d+)/i);
  if (nMatch) {
    const N = parseNumber(nMatch[1] ?? nMatch[2] ?? nMatch[3]);
    if (N && N > 0) {
      const tn = triangular(N);
      const steps = [
        `זיהוי הסדרה: מספרים משולשיים.`,
        `נוסחת איבר כללי: T_n = n(n+1)/2`,
        `נציב n = ${N}:`,
        `T_${N} = ${N}·(${N}+1)/2 = ${N}·${N+1}/2 = ${tn}`
      ];
      return { ok: true, kind: "triangular_value", steps, pretty: `בְּאיבר ה-${N} יש ${tn} נקודות.` };
    }
  }

  // 2) "מה נוסחת האיבר הכללי?" / "חוקיות"
  if (/נוסחת\s*האיבר\s*הכללי|איבר\s*כללי|חוקיות/i.test(q)) {
    const steps = [
      `הדגם בתרשים מראה משולשים הבנויים מנקודות.`,
      `מספר הנקודות באיבר n הוא סכום המספרים מ-1 עד n.`,
      `לכן: T_n = 1 + 2 + ... + n = n(n+1)/2.`
    ];
    return { ok: true, kind: "triangular_general", steps, pretty: `נוסחת האיבר הכללי: T_n = n(n+1)/2.` };
  }

  // 3) "האם ייתכן שאיבר בסדרה יכיל 29 נקודות?" / "האם 29 הוא איבר בסדרה"
  const mMatch = q.match(/(?:יכיל|יש|מכיל|בסדרה.*?יש)\s*(\d+)\s*נקודות|האם\s*(\d+)\s*איבר/i);
  if (mMatch) {
    const M = parseNumber(mMatch[1] ?? mMatch[2]);
    if (M && M > 0) {
      const n = triangularIndexFor(M);
      const steps = [
        `בודקים אם ${M} מספר משולשי.`,
        `נפתור: n(n+1)/2 = ${M} ⇒ n² + n - ${2*M} = 0`,
        `Δ = 1 + 8·${M} = ${1+8*M}.`,
        isPerfectSquare(1+8*M)
          ? `Δ הוא ריבוע מושלם ⇒ n = (-1 + √Δ)/2 = ${n}.`
          : `Δ אינו ריבוע מושלם ⇒ אין n טבעי שמקיים את השוויון.`
      ];
      if (n) {
        return { ok: true, kind: "triangular_membership", steps, pretty: `${M} הוא מספר משולשי (האיבר ה-${n}).` };
      }
      return { ok: true, kind: "triangular_membership", steps, pretty: `${M} אינו מספר משולשי (לא קיים n טבעי).` };
    }
  }

  // 4) "כמה נקודות יהיו באיבר n" (פורמולה)
  if (/איבר\s*n|באיבר\s*n/i.test(q)) {
    const steps = [
      `הסדרה משולשית ⇒ מספר הנקודות באיבר n:`,
      `T_n = n(n+1)/2.`
    ];
    return { ok: true, kind: "triangular_symbolic", steps, pretty: `T_n = n(n+1)/2.` };
  }

  // לא זוהתה תת־שאלה ספציפית, אבל ברור שמדובר במשולשים
  const steps = [
    `התרשים מייצג מספרים משולשיים.`,
    `נוסחת האיבר הכללי: T_n = n(n+1)/2.`,
    `ניתן להציב n נתון (כגון 50) כדי לקבל את מספר הנקודות באיבר.`
  ];
  return { ok: true, kind: "triangular_info", steps, pretty: `מספר הנקודות באיבר n: T_n = n(n+1)/2.` };
}

/** Very basic AP/GP (optional starter) */
function trySolveAPorGP(query: string) {
  const q = normSpaces(query);

  // AP
  if (isAPQuery(q)) {
    // דוגמאות נתמכות: "סדרה חשבונית a1=3 d=2, מצא a_10", "מצא סכום 50 איברים ראשונים a1=1 d=1"
    const a1 = parseNumber(q.match(/a1\s*=?\s*(-?\d+(\.\d+)?)/i)?.[1]);
    const d  = parseNumber(q.match(/d\s*=?\s*(-?\d+(\.\d+)?)/i)?.[1]);
    const n  = parseNumber(q.match(/a[_\s]*?(\d+)|איבר\s*ה-?\s*(\d+)/i)?.[1] ?? q.match(/איבר\s*ה-?\s*(\d+)/i)?.[1]);
    const sumN = parseNumber(q.match(/סכום\s*(\d+)\s*איבר/i)?.[1]);

    if (a1!=null && d!=null && n!=null) {
      const an = a1 + (n-1)*d;
      const steps = [
        `סדרה חשבונית: a_n = a1 + (n-1)d`,
        `a1=${a1}, d=${d}, n=${n} ⇒ a_${n} = ${a1} + (${n}-1)·${d} = ${an}`
      ];
      return { ok:true, kind:"AP_value", steps, pretty:`a_${n} = ${an}` };
    }
    if (a1!=null && d!=null && sumN!=null) {
      const S = (sumN/2) * (2*a1 + (sumN-1)*d);
      const steps = [
        `סדרה חשבונית: S_n = n/2 · [2a1 + (n-1)d]`,
        `a1=${a1}, d=${d}, n=${sumN} ⇒ S_${sumN} = ${S}`
      ];
      return { ok:true, kind:"AP_sum", steps, pretty:`S_${sumN} = ${S}` };
    }
    return { ok:true, kind:"AP_info", steps:[
      `סדרה חשבונית:`,
      `איבר כללי: a_n = a1 + (n-1)d`,
      `סכום n איברים: S_n = n/2 · [2a1 + (n-1)d]`
    ], pretty:`a_n = a1 + (n-1)d,  S_n = n/2 · [2a1 + (n-1)d]` };
  }

  // GP
  if (isGPQuery(q)) {
    const a1 = parseNumber(q.match(/a1\s*=?\s*(-?\d+(\.\d+)?)/i)?.[1]);
    const r  = parseNumber(q.match(/r\s*=?\s*(-?\d+(\.\d+)?)/i)?.[1]);
    const n  = parseNumber(q.match(/a[_\s]*?(\d+)|איבר\s*ה-?\s*(\d+)/i)?.[1] ?? q.match(/איבר\s*ה-?\s*(\d+)/i)?.[1]);
    const sumN = parseNumber(q.match(/סכום\s*(\d+)\s*איבר/i)?.[1]);

    if (a1!=null && r!=null && n!=null) {
      const an = a1 * Math.pow(r, n-1);
      const steps = [
        `סדרה הנדסית: a_n = a1 · r^(n-1)`,
        `a1=${a1}, r=${r}, n=${n} ⇒ a_${n} = ${an}`
      ];
      return { ok:true, kind:"GP_value", steps, pretty:`a_${n} = ${an}` };
    }
    if (a1!=null && r!=null && sumN!=null && r!==1) {
      const S = a1 * (Math.pow(r,sumN)-1)/(r-1);
      const steps = [
        `סדרה הנדסית: S_n = a1 · (r^n - 1)/(r - 1)`,
        `a1=${a1}, r=${r}, n=${sumN} ⇒ S_${sumN} = ${S}`
      ];
      return { ok:true, kind:"GP_sum", steps, pretty:`S_${sumN} = ${S}` };
    }
    return { ok:true, kind:"GP_info", steps:[
      `סדרה הנדסית:`,
      `איבר כללי: a_n = a1 · r^(n-1)`,
      `סכום n איברים (r≠1): S_n = a1 · (r^n - 1)/(r - 1)`
    ], pretty:`a_n = a1·r^(n-1),  S_n = a1·(r^n - 1)/(r - 1)` };
  }

  return null;
}

/* =========================
   POST
   ========================= */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const raw = String(body?.query ?? "").trim();
    if (!raw) {
      return Response.json({ ok: false, error: "חסר 'query' בגוף הבקשה" }, { status: 400 });
    }

    // 0) Sequences & “חוקיות” first
    const tri = trySolveTriangular(raw);
    if (tri) return Response.json(tri);

    const seq = trySolveAPorGP(raw);
    if (seq) return Response.json(seq);

    // 1) Maybe a linear system: 2 or 3 lines
    const lines = raw.split(/\r?\n|;/).map(s=>s.trim()).filter(Boolean);
    if (lines.length === 2 || lines.length === 3) {
      const allowed = ["x","y","z"];
      const f = lines.map(L => toLeftMinusRight(L));
      if (!f.every(F => onlyVars(F, allowed))) {
        return Response.json({ ok: true, kind: "not_supported", message: "מערכות נתמכות רק ב־x,y,z." });
      }
      if (!f.every(isLinearXYZ)) {
        return Response.json({ ok: true, kind: "not_supported", message: "מערכת נתמכת רק למקרה ליניארי (בלי חזקות/כפל משתנים)." });
      }
      const eqs = f.map(line => linearCoeffsXYZ(line));
      const { x, y, z, steps, pretty } = solveLinearSystemXYZ(eqs);
      return Response.json({ ok: true, kind: `linear_${lines.length}x${lines.length}`, equations: lines, solutions: { x, y, ...(z!==undefined?{z}: {}) }, steps, pretty });
    }

    // 2) |g(x)| ? k
    const absInfo = splitAbsCompare(raw);
    if (absInfo) {
      const { g, op, kExpr } = absInfo;
      const kHasVar = /[a-zA-Z]/.test(kExpr);
      if (kHasVar) return Response.json({ ok: true, kind: "not_supported", message: "ערך מוחלט נתמך רק כשאגף שני קבוע." });
      const kVal = Number(evaluate(simplify(kExpr).toString(), {}));
      if (!Number.isFinite(kVal) || kVal < 0) return Response.json({ ok: true, kind: "not_supported", message: "k חייב להיות מספר סופי ובלתי-שלילי." });
      if (!onlyVars(g, ["x"])) return Response.json({ ok: true, kind: "not_supported", message: "ערך מוחלט נתמך כאן רק ב-x." });

      const baseStep = [`נתון: |${g}| ${op} ${kVal}`];

      if (op === "=") {
        const f1 = simplify(`(${g}) - (${kVal})`).toString();
        const f2 = simplify(`(${g}) + (${kVal})`).toString();

        function solveSimple(fStr: string) {
          const d = polyDegreeUpTo2(fStr);
          if (d === 1) { const {a,c} = linearCoeffs1Var(fStr); if (a!==0) return [-c/a]; }
          if (d === 2) { const {a,b,c} = quadraticCoeffs(fStr); const {solutions} = solveQuadratic(a,b,c); return solutions; }
          if (d === 0) {
            const val = evaluate(simplify(fStr).toString(), {});
            return val===0 ? ["כל x"] as any : [];
          }
          return [];
        }
        const s1 = solveSimple(f1);
        const s2 = solveSimple(f2);

        if ((s1 as any)[0]==="כל x" || (s2 as any)[0]==="כל x") {
          return Response.json({ ok:true, kind:"abs_eq", steps:[...baseStep, "מתקיים לכל x"], pretty:"כל x" });
        }
        const uniq = [...new Set([...(s1 as number[]), ...(s2 as number[])])];
        return Response.json({ ok:true, kind:"abs_eq", solutions: uniq, steps: baseStep, pretty: uniq.length? `x ∈ { ${uniq.join(", ")} }` : "אין פתרון" });
      }

      // אי-שוויון עם ערך מוחלט
      function toSystem(opStr: IOp) {
        if (opStr === "<=") return { left: `(${g}) - (${kVal}) <= 0`, right: `-(${g}) - (${kVal}) <= 0` };
        if (opStr === "<")  return { left: `(${g}) - (${kVal}) < 0`,  right: `-(${g}) - (${kVal}) < 0`  };
        if (opStr === ">=") return { left: `(${g}) - (${kVal}) >= 0`, right: `-(${g}) - (${kVal}) >= 0` };
        return { left: `(${g}) - (${kVal}) > 0`,  right: `-(${g}) - (${kVal}) > 0`  };
      }
      const sys = toSystem(op);

      function solveOne(ineq: string) {
        const info = splitInequality(normEq(ineq))!;
        const fStr = simplify(`(${info.left}) - (${info.right})`).toString();
        const deg = polyDegreeUpTo2(fStr);
        if (deg !== 1 && deg !== 2) return null;
        return solveInequality1Var(fStr, deg as 1|2, info.op);
      }
      const A = solveOne(sys.left);
      const B = solveOne(sys.right);
      if (!A || !B) return Response.json({ ok:true, kind:"abs_ineq", steps: baseStep, pretty:"לא נתמך במדויק (דרגה>2?)" });

      function intersectIntervals(
        X: Array<[number|null, number|null, boolean, boolean]>,
        Y: Array<[number|null, number|null, boolean, boolean]>
      ) {
        const out: Array<[number|null, number|null, boolean, boolean]> = [];
        for (const [a1,b1,i1a,i1b] of X) for (const [a2,b2,i2a,i2b] of Y) {
          const L = (a1==null || a2==null) ? (a1==null? a2 : a1) : Math.max(a1,a2);
          const R = (b1==null || b2==null) ? (b1==null? b2 : b1) : Math.min(b1,b2);
          if (L==null || R==null || L<R || (L===R && (i1b && i2a))) {
            const incL = (L===a1? i1a : i2a);
            const incR = (R===b1? i1b : i2b);
            out.push([L, R, incL, incR]);
          }
        }
        return out.filter(([L,R,incL,incR]) => (L==null || R==null || L<R || (L===R && incL && incR)));
      }
      const C = intersectIntervals(A.intervals, B.intervals);
      return Response.json({ ok:true, kind:"abs_ineq", steps: [...baseStep, ...A.steps, ...B.steps], intervals: C, pretty: `תחום פתרונות: ${C.length? formatIntervals(C) : "Ø (ריק)"}` });
    }

    // 3) אי-שוויון רגיל
    const single = normEq(lines[0] ?? raw);
    const ineq = splitInequality(single);
    if (ineq && onlyVars(ineq.left+ineq.right, ["x"])) {
      const fStr = simplify(`(${ineq.left}) - (${ineq.right})`).toString();
      const deg = polyDegreeUpTo2(fStr);
      if (deg === 1 || deg === 2) {
        const { intervals, steps, pretty } = solveInequality1Var(fStr, deg as 1|2, ineq.op);
        return Response.json({ ok: true, kind: "inequality", normalized: `f(x) ${ineq.op} 0`, intervals, steps, pretty });
      }
      return Response.json({ ok: true, kind: "not_supported", message: "אי-שוויונים נתמכים לדרגה 1–2 ב-x." });
    }

    // 4) משוואה ב-x
    const diff = toLeftMinusRight(single);
    if (onlyVars(diff, ["x"])) {
      const deg = polyDegreeUpTo2(diff);
      if (deg === 2) {
        const { a,b,c } = quadraticCoeffs(diff);
        const { solutions, steps, pretty } = solveQuadratic(a,b,c);
        return Response.json({ ok: true, kind: "quadratic", normalized: `${a}x^2 ${b>=0?"+":""}${b}x ${c>=0?"+":""}${c} = 0`, solutions, steps, pretty });
      }
      if (deg === 1) {
        const { a,c } = linearCoeffs1Var(diff);
        const { solution, steps, pretty } = solveLinear1Var(a,c);
        return Response.json({ ok: true, kind: "linear_1var", normalized: `${a}x ${c>=0?"+":""}${c} = 0`, solutions: [solution], steps, pretty });
      }
      if (deg === 0) {
        const val = evaluate(simplify(diff).toString(), {});
        const msg = val === 0 ? "זהות נכונה לכל x (אינסוף פתרונות)." : "סתירה — אין פתרון.";
        return Response.json({ ok: true, kind: "constant", value: val, pretty: msg });
      }
    }

    // 5) default
    return Response.json({
      ok: true,
      kind: "not_supported",
      message: "מקומית נתמך: משוואות/אי-שוויונים לינאריים/ריבועיים (כולל ערך מוחלט עם קבוע), מערכות 2×2/3×3, וסדרות: משולשיים/חשבונית/הנדסית (בסיס)."
    });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message ?? "server error" }, { status: 500 });
  }
}

/* =========================
   GET (examples)
   ========================= */
export async function GET() {
  return Response.json({
    ok: true,
    info: "שלח POST עם JSON: { query: '…' }",
    examples: [
      // Triangular
      "סדרת נקודות שיוצרות משולשים. כמה נקודות יהיו באיבר ה-50?",
      "נוסחת האיבר הכללי בסדרה של משולשים הבנויים מנקודות",
      "האם 29 הוא איבר בסדרה של מספרים משולשיים?",
      // AP
      "סדרה חשבונית a1=3 d=2 מצא a_10",
      "סדרה חשבונית a1=1 d=1 מצא סכום 50 איברים",
      // GP
      "סדרה הנדסית a1=2 r=3 מצא a_6",
      // Equations/Inequalities
      "x^2 + 3x = 4",
      "3(x+2) = 5x - 1",
      "x^2 - 5x + 6 >= 0",
      "|x-3| <= 2",
      "2x + 3y = 7\n4x - y = 5",
      "x + y + z = 6\n2x - y + z = 3\n3x + 2y - z = 10"
    ],
  });
}
