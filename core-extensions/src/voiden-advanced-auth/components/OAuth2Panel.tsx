/**
 * Main OAuth2 configuration panel.
 * Renders key-value table rows matching the ProseMirror table cell pattern,
 * plus Get Token button and token display.
 */

// Use (window as any).electron to access the Electron preload API
// without conflicting with other extensions' declare global blocks.

import React, { useState, useCallback } from "react";
import type {
  OAuth2Config,
  OAuth2GrantType,
  OAuth2TokenResponse,
  OAuth2AddTokenTo,
} from "../lib/oauth2/types";
import { GRANT_TYPE_LABELS } from "../lib/oauth2/types";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "../lib/oauth2/pkce";
import { Row, SelectRow, CheckboxRow } from "./OAuth2Row";
import { OAuth2GrantFields } from "./OAuth2GrantFields";
import { OAuth2TokenDisplay } from "./OAuth2TokenDisplay";
import { OAuth2GetTokenButton } from "./OAuth2GetTokenButton";

interface OAuth2PanelProps {
  config: OAuth2Config;
  onConfigChange: (config: OAuth2Config) => void;
  disabled?: boolean;
}

const grantTypeOptions = Object.entries(GRANT_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const addTokenToOptions = [
  { value: "header", label: "Header" },
  { value: "query", label: "Query Param" },
];

export const OAuth2Panel: React.FC<OAuth2PanelProps> = ({
  config,
  onConfigChange,
  disabled,
}) => {
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState<OAuth2TokenResponse | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);

  const updateField = useCallback(
    (key: keyof OAuth2Config, value: string | boolean) => {
      onConfigChange({ ...config, [key]: value });
    },
    [config, onConfigChange],
  );

  const saveTokenToVariables = useCallback(
    async (tokenResponse: OAuth2TokenResponse) => {
      try {
        const prefix = config.variablePrefix || "oauth2";
        const vars: Record<string, unknown> = {
          [`${prefix}_access_token`]: tokenResponse.accessToken,
          [`${prefix}_token_type`]: tokenResponse.tokenType,
        };
        if (tokenResponse.refreshToken) {
          vars[`${prefix}_refresh_token`] = tokenResponse.refreshToken;
        }
        if (tokenResponse.expiresIn) {
          const expAt = Date.now() + tokenResponse.expiresIn * 1000;
          vars[`${prefix}_expires_at`] = expAt;
          setExpiresAt(expAt);
        }
        // Save refresh config so the auto-refresh hook can work
        // without needing access to the editor/auth node
        if (config.autoRefresh) {
          vars[`${prefix}_refresh_config`] = JSON.stringify({
            tokenUrl: config.tokenUrl,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            scope: config.scope,
            variablePrefix: prefix,
          });
        }

        const existing = await (window as any).electron?.variables?.read();
        const merged = { ...(existing || {}), ...vars };
        await (window as any).electron?.variables?.writeVariables(
          JSON.stringify(merged, null, 2),
        );
      } catch (err) {
        console.error("Failed to save OAuth2 tokens to runtime variables:", err);
      }
    },
    [config.variablePrefix, config.autoRefresh, config.tokenUrl, config.clientId, config.clientSecret, config.scope],
  );

  const handleGetToken = useCallback(async () => {
    setLoading(true);
    setError(null);
    setToken(null);

    try {
      let result: OAuth2TokenResponse;

      switch (config.grantType) {
        case "authorization_code": {
          const codeVerifier = generateCodeVerifier();
          const codeChallenge = await generateCodeChallenge(codeVerifier);
          const state = generateState();

          result = await (window as any).electron!.oauth2!.startAuthCodeFlow({
            authUrl: config.authUrl,
            tokenUrl: config.tokenUrl,
            clientId: config.clientId,
            clientSecret: config.clientSecret || undefined,
            scope: config.scope,
            callbackUrl: config.callbackUrl || undefined,
            codeVerifier,
            codeChallenge,
            codeChallengeMethod: "S256",
            state,
          });
          break;
        }
        case "implicit": {
          const state = generateState();
          result = await (window as any).electron!.oauth2!.startImplicitFlow({
            authUrl: config.authUrl,
            clientId: config.clientId,
            scope: config.scope,
            callbackUrl: config.callbackUrl || undefined,
            state,
          });
          break;
        }
        case "password": {
          result = await (window as any).electron!.oauth2!.passwordGrant({
            tokenUrl: config.tokenUrl,
            clientId: config.clientId,
            clientSecret: config.clientSecret || undefined,
            username: config.username,
            password: config.password,
            scope: config.scope,
          });
          break;
        }
        case "client_credentials": {
          result = await (window as any).electron!.oauth2!.clientCredentialsGrant({
            tokenUrl: config.tokenUrl,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            scope: config.scope,
          });
          break;
        }
        default:
          throw new Error(`Unsupported grant type: ${config.grantType}`);
      }

      setToken(result);
      await saveTokenToVariables(result);
    } catch (err: any) {
      setError(err.message || "Failed to obtain token");
    } finally {
      setLoading(false);
    }
  }, [config, saveTokenToVariables]);

  const handleCancel = useCallback(async () => {
    try {
      await (window as any).electron?.oauth2?.cancelFlow();
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  return (
    <div className="text-sm font-mono">
      {/* Config table rows */}
      <SelectRow
        k="grant_type"
        value={config.grantType}
        onChange={(v) => updateField("grantType", v as OAuth2GrantType)}
        options={grantTypeOptions}
        disabled={disabled}
      />
      <SelectRow
        k="add_token_to"
        value={config.addTokenTo}
        onChange={(v) => updateField("addTokenTo", v as OAuth2AddTokenTo)}
        options={addTokenToOptions}
        disabled={disabled}
      />
      <Row
        k="header_prefix"
        value={config.headerPrefix}
        onChange={(v) => updateField("headerPrefix", v)}
        placeholder="Bearer"
        disabled={disabled}
      />
      <Row
        k="variable_prefix"
        value={config.variablePrefix}
        onChange={(v) => updateField("variablePrefix", v)}
        placeholder="oauth2"
        disabled={disabled}
      />
      <CheckboxRow
        k="auto_refresh"
        checked={config.autoRefresh}
        onChange={(v) => updateField("autoRefresh", v)}
        disabled={disabled}
      />

      {/* Separator */}
      <div className="border-t border-border" />

      {/* Grant-type specific rows */}
      <OAuth2GrantFields
        config={config}
        onChange={updateField}
        disabled={disabled}
      />

      {/* Get Token button + Token display */}
      <div className="px-2 py-1.5">
        <OAuth2GetTokenButton
          loading={loading}
          onGetToken={handleGetToken}
          onCancel={handleCancel}
          disabled={disabled}
        />
        <OAuth2TokenDisplay token={token} expiresAt={expiresAt} error={error} />
      </div>
    </div>
  );
};
