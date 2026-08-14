import { readBrowserAgentConfigHeaders } from "../browser-agent-config.ts";
import { PublicWebError, validatePublicUrl, validatePublicUrlResolution } from "../public-web.ts";
import type { AgentProviderOverride } from "./provider-config.ts";
import { ProfileAgentError } from "./profile/types.ts";

export async function readRequestAgentProviderConfig(request: Request): Promise<AgentProviderOverride | undefined> {
  const config = readBrowserAgentConfigHeaders(request.headers);
  if (!config) return undefined;
  if (config.maasApiKey.length > 1_024 || config.websiteApiKey.length > 1_024) {
    throw new ProfileAgentError("API Key 长度不合法。", 400);
  }
  if (config.maasModel.length > 200 || config.websiteModel.length > 200) {
    throw new ProfileAgentError("模型名称过长。", 400);
  }
  const validateGatewayFields = (userEmail: string, appId: string, label: string) => {
    if (userEmail.length > 320 || /[\r\n]/.test(userEmail) || (userEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail))) {
      throw new ProfileAgentError(`${label} 企业邮箱格式不合法。`, 400);
    }
    if (appId.length > 128 || (appId && !/^[A-Za-z0-9._:-]+$/.test(appId))) {
      throw new ProfileAgentError(`${label} App ID 格式不合法。`, 400);
    }
  };
  validateGatewayFields(config.maasUserEmail, config.maasAppId, "主服务");
  validateGatewayFields(config.websiteUserEmail, config.websiteAppId, "Website Agent");
  const safeBaseUrl = (value: string, label: string) => {
    try {
      const url = validatePublicUrl(value);
      if (url.protocol !== "https:" || url.search || url.hash) throw new Error("unsafe provider URL");
      return url.href.replace(/\/$/, "");
    } catch {
      throw new ProfileAgentError(`${label} 必须是公开的 HTTPS 地址。`, 400);
    }
  };
  const safeConfig = {
    ...config,
    maasBaseUrl: safeBaseUrl(config.maasBaseUrl, "MAAS Base URL"),
    websiteBaseUrl: safeBaseUrl(config.websiteBaseUrl, "Website Agent Base URL"),
  };
  try {
    await Promise.all([
      ...(safeConfig.maasApiKey ? [validatePublicUrlResolution(safeConfig.maasBaseUrl, { signal: request.signal })] : []),
      ...(safeConfig.websiteApiKey ? [validatePublicUrlResolution(safeConfig.websiteBaseUrl, { signal: request.signal })] : []),
    ]);
  } catch (error) {
    if (error instanceof PublicWebError && error.status >= 500) {
      throw new ProfileAgentError("Provider Base URL 的 DNS 校验服务暂时不可用，请稍后重试。", 502);
    }
    throw new ProfileAgentError("Provider Base URL 的 DNS 地址不是可验证的公开网络。", 400);
  }
  return safeConfig;
}
