import { Project, SyntaxKind, CallExpression, PropertyAccessExpression } from "ts-morph";

const project = new Project();
project.addSourceFilesAtPaths(["server.ts", "src/lib/bot_logic.ts"]);

for (const sourceFile of project.getSourceFiles()) {
  let madeChanges = false;
  
  // Find all property access expressions that end in "get" or "run" or "all"
  const callExprs = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  
  // To avoid modifying things we already replaced, we might need to go backwards or just replace all at once
  // Since we are modifying the AST, doing it safely involves careful replaces.
  // Actually, string replacement on the node text works well if we do it backwards, but let's just do an array
  const toReplace: { node: CallExpression, text: string }[] = [];
  
  for (const callExpr of callExprs) {
    const expr = callExpr.getExpression();
    if (expr.getKind() === SyntaxKind.PropertyAccessExpression) {
      const propAccess = expr as PropertyAccessExpression;
      const name = propAccess.getName();
      
      if (name === "get") {
        let isMutation = false;
        let current: any = callExpr;
        while (current) {
           const currText = current.getText();
           if (currText.includes("db.insert(") || currText.includes("db.update(") || currText.includes("db.delete(")) {
              isMutation = true;
              break;
           }
           if (currText.includes("db.select(")) {
              break; // Not a mutation
           }
           const parent = current.getParent();
           if (parent) {
             current = parent;
           } else {
             break;
           }
        }
        
        if (isMutation) {
           toReplace.push({ node: callExpr, text: callExpr.getText().replace(/\.get\(\)$/, ".returning().then((res: any[]) => res[0])") });
        } else {
           toReplace.push({ node: callExpr, text: callExpr.getText().replace(/\.get\(\)$/, ".limit(1).then((res: any[]) => res[0])") });
        }
      } else if (name === "run") {
        let isRaw = false;
        let current: any = callExpr;
        while (current) {
           const currText = current.getText();
           if (currText.startsWith("db.run(")) {
              isRaw = true;
              break;
           }
           const parent = current.getParent();
           if (parent) {
             current = parent;
           } else {
             break;
           }
        }
        
        if (isRaw) {
           toReplace.push({ node: callExpr, text: callExpr.getText().replace(/^db\.run\(/, "db.execute(") });
        } else {
           toReplace.push({ node: callExpr, text: callExpr.getText().replace(/\.run\(\)$/, "") });
        }
      } else if (name === "all") {
        toReplace.push({ node: callExpr, text: callExpr.getText().replace(/\.all\(\)$/, "") });
      }
    }
  }

  // Reverse so we replace from bottom up, preventing offsets from breaking
  toReplace.reverse();
  for (const rep of toReplace) {
     rep.node.replaceWithText(rep.text);
     madeChanges = true;
  }

  if (madeChanges) {
    sourceFile.saveSync();
  }
}
