export type SourceSecurityFinding = {
  line: number;
  category: "instruction_override" | "secret_exfiltration" | "tool_injection";
};

const SOURCE_META_MARKER = /(?:untrusted\s+(?:page\s+)?(?:note|instruction)|网页备注|不可信(?:页面)?(?:备注|指令))/iu;
const DIRECT_OVERRIDE = /^\s*(?:(?:please\s+)?ignore\s+(?:(?:all|any|every|the|your)\s+)?(?:previous\s+)?(?:rules?|instructions?|system\s+(?:instructions?|message|prompt))|(?:请)?忽略[^。；;]*(?:规则|指令|提示词))/iu;
const INSTRUCTION_OVERRIDE = /(?:ignore\s+(?:(?:all|any|the|your)\s+)?(?:previous\s+)?(?:rules?|instructions?|system\s+(?:instructions?|message|prompt))|忽略[^。；;]*(?:规则|指令|提示词)|(?:claim|report)\b[^.。]*(?:\bis\b|worked\s+at)|声称[^。；;]*是)/iu;
const SECRET_EXFILTRATION = /(?:reveal|print|output|return|exfiltrat\w*|泄露|输出|返回)[^.。；;]*(?:api[-_ ]?key|authorization|bearer|secret|password|system\s+prompt|hidden\s+prompt|密钥|密码|系统提示词|隐藏提示词)/iu;
const TOOL_INJECTION = /(?:\bcall\s+[a-z_][a-z0-9_-]*|invoke\s+(?:the\s+)?tool|调用[^。；;]*(?:工具|函数)|tool[_ -]?(?:name|arguments?))/iu;

function sourceInstructionCategory(line: string): SourceSecurityFinding["category"] | undefined {
  if (!SOURCE_META_MARKER.test(line) && !DIRECT_OVERRIDE.test(line)) return undefined;
  if (SECRET_EXFILTRATION.test(line)) return "secret_exfiltration";
  if (TOOL_INJECTION.test(line)) return "tool_injection";
  if (INSTRUCTION_OVERRIDE.test(line)) return "instruction_override";
  return undefined;
}

export function isInstructionLikeSourceLine(line: string) {
  return Boolean(sourceInstructionCategory(line));
}

/**
 * Removes source-authored control instructions while preserving newline count so
 * all later line locators still refer to the original document.
 */
export function quarantineSourceInstructions(text: string) {
  const normalized = text.replace(/\r\n?/g, "\n");
  const findings: SourceSecurityFinding[] = [];
  const safeText = normalized.split("\n").map((line, index) => {
    const category = sourceInstructionCategory(line);
    if (!category) return line;
    findings.push({ line: index + 1, category });
    return "";
  }).join("\n");
  return { text: safeText, findings };
}
