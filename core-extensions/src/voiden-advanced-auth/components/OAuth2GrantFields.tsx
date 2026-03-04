/**
 * Dynamic table rows that change based on the selected OAuth2 grant type.
 * Renders key-value rows matching the ProseMirror table cell pattern.
 */
import React from "react";
import type { OAuth2Config, OAuth2GrantType } from "../lib/oauth2/types";
import { Row, SelectRow } from "./OAuth2Row";

interface OAuth2GrantFieldsProps {
  config: OAuth2Config;
  onChange: (key: keyof OAuth2Config, value: string) => void;
  disabled?: boolean;
}

function AuthCodeFields({ config, onChange, disabled }: OAuth2GrantFieldsProps) {
  return (
    <>
      <Row k="auth_url" value={config.authUrl} onChange={(v) => onChange("authUrl", v)} placeholder="https://provider.com/authorize" disabled={disabled} />
      <Row k="token_url" value={config.tokenUrl} onChange={(v) => onChange("tokenUrl", v)} placeholder="https://provider.com/token" disabled={disabled} />
      <Row k="client_id" value={config.clientId} onChange={(v) => onChange("clientId", v)} placeholder="{{CLIENT_ID}}" disabled={disabled} />
      <Row k="client_secret" value={config.clientSecret} onChange={(v) => onChange("clientSecret", v)} placeholder="{{CLIENT_SECRET}}" disabled={disabled} />
      <Row k="scope" value={config.scope} onChange={(v) => onChange("scope", v)} placeholder="openid profile email" disabled={disabled} />
      <Row k="callback_url" value={config.callbackUrl} onChange={(v) => onChange("callbackUrl", v)} placeholder="auto if empty" disabled={disabled} />
    </>
  );
}

function ImplicitFields({ config, onChange, disabled }: OAuth2GrantFieldsProps) {
  return (
    <>
      <Row k="auth_url" value={config.authUrl} onChange={(v) => onChange("authUrl", v)} placeholder="https://provider.com/authorize" disabled={disabled} />
      <Row k="client_id" value={config.clientId} onChange={(v) => onChange("clientId", v)} placeholder="{{CLIENT_ID}}" disabled={disabled} />
      <Row k="scope" value={config.scope} onChange={(v) => onChange("scope", v)} placeholder="openid profile email" disabled={disabled} />
      <Row k="callback_url" value={config.callbackUrl} onChange={(v) => onChange("callbackUrl", v)} placeholder="auto if empty" disabled={disabled} />
    </>
  );
}

function PasswordFields({ config, onChange, disabled }: OAuth2GrantFieldsProps) {
  return (
    <>
      <Row k="token_url" value={config.tokenUrl} onChange={(v) => onChange("tokenUrl", v)} placeholder="https://provider.com/token" disabled={disabled} />
      <Row k="client_id" value={config.clientId} onChange={(v) => onChange("clientId", v)} placeholder="{{CLIENT_ID}}" disabled={disabled} />
      <Row k="client_secret" value={config.clientSecret} onChange={(v) => onChange("clientSecret", v)} placeholder="{{CLIENT_SECRET}}" disabled={disabled} />
      <Row k="username" value={config.username} onChange={(v) => onChange("username", v)} placeholder="user@example.com" disabled={disabled} />
      <Row k="password" value={config.password} onChange={(v) => onChange("password", v)} placeholder="{{PASSWORD}}" disabled={disabled} type="password" />
      <Row k="scope" value={config.scope} onChange={(v) => onChange("scope", v)} placeholder="openid profile" disabled={disabled} />
    </>
  );
}

function ClientCredentialsFields({ config, onChange, disabled }: OAuth2GrantFieldsProps) {
  return (
    <>
      <Row k="token_url" value={config.tokenUrl} onChange={(v) => onChange("tokenUrl", v)} placeholder="https://provider.com/token" disabled={disabled} />
      <Row k="client_id" value={config.clientId} onChange={(v) => onChange("clientId", v)} placeholder="{{CLIENT_ID}}" disabled={disabled} />
      <Row k="client_secret" value={config.clientSecret} onChange={(v) => onChange("clientSecret", v)} placeholder="{{CLIENT_SECRET}}" disabled={disabled} />
      <Row k="scope" value={config.scope} onChange={(v) => onChange("scope", v)} placeholder="read write" disabled={disabled} />
    </>
  );
}

const FIELD_COMPONENTS: Record<OAuth2GrantType, React.FC<OAuth2GrantFieldsProps>> = {
  authorization_code: AuthCodeFields,
  implicit: ImplicitFields,
  password: PasswordFields,
  client_credentials: ClientCredentialsFields,
};

export const OAuth2GrantFields: React.FC<OAuth2GrantFieldsProps> = (props) => {
  const Component = FIELD_COMPONENTS[props.config.grantType];
  return Component ? <Component {...props} /> : null;
};
