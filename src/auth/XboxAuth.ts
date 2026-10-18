/**
 * Microsoft / Xbox / Minecraft Bedrock authentication
 * Full device-code + refresh-token flow with optional disk cache.
 * Builds ES384 JWT chain via JwtChain for BDS 1.26.52.3 login.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildOfflineChain, buildOnlineChain, generateBedrockKeyPair, type ChainResult } from "./JwtChain";

export interface AuthResult {
  offline: boolean;
  username: string;
  xuid?: string;
  uuid?: string;
  chain?: string[];
  multiplayerToken?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  keyPair?: ChainResult["keyPair"];
}

export interface XboxAuthOptions {
  username: string;
  offline?: boolean;
  clientId?: string;
  /** MSA refresh token (skips device code) */
  refreshToken?: string;
  /** Directory to cache tokens (default: .aether-auth) */
  cacheDir?: string;
  /** Persist refresh token to cacheDir */
  persistTokens?: boolean;
  /** If online fails, fall back to offline chain (default true) */
  fallbackOffline?: boolean;
}

/** Microsoft Live (Xbox) device-code endpoints — same path real Bedrock clients use */
const MSA_DEVICE_CODE = "https://login.live.com/oauth20_connect.srf";
const MSA_TOKEN = "https://login.live.com/oauth20_token.srf";
const XBL_USER = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS = "https://xsts.auth.xboxlive.com/xsts/authorize";
const MC_LOGIN = "https://api.minecraftservices.com/authentication/login_with_xbox";
const MC_BEDROCK_AUTH = "https://multiplayer.minecraft.net/authentication";
const PLAYFAB_RP = "https://b980a380.minecraft.playfabapi.com/";
const PLAYFAB_LOGIN = "https://20ca2.playfabapi.com/Client/LoginWithXbox";
const MCS_SESSION_START = "https://authorization.franchise.minecraft-services.net/api/v1.0/session/start";
const MCS_MP_SESSION_START = "https://authorization.franchise.minecraft-services.net/api/v1.0/multiplayer/session/start";
const MC_PROFILE = "https://api.minecraftservices.com/minecraft/profile";
/** Minecraft Bedrock Android title client id (device-code capable) */
const DEFAULT_CLIENT_ID = "0000000048183522";
/** Xbox Live MBI scope used by Bedrock / XAL */
const SCOPE = "service::user.auth.xboxlive.com::MBI_SSL";

async function sleepMs(ms: number) { await new Promise((r) => setTimeout(r, ms)); }
let _mcsLastFail = 0;
const MCS_GLOBAL_COOLDOWN = 30000;
let _cachedMpToken = "";
let _cachedMpTokenAt = 0;


export class XboxAuth {
  private options: Required<Pick<XboxAuthOptions, "offline" | "clientId" | "fallbackOffline" | "persistTokens">> & XboxAuthOptions;
  private cached: AuthResult | null = null;

  constructor(options: XboxAuthOptions) {
    this.options = {
      ...options,
      offline: options.offline ?? true,
      clientId: options.clientId ?? DEFAULT_CLIENT_ID,
      fallbackOffline: options.fallbackOffline ?? true,
      persistTokens: options.persistTokens ?? true,
      cacheDir: options.cacheDir ?? join(process.cwd(), ".aether-auth"),
    };
  }

  async authenticate(): Promise<AuthResult> {
    if (this.options.offline) return this.offlineAuth();
    return this.onlineAuth();
  }

  private offlineAuth(): AuthResult {
    const chain = buildOfflineChain(this.options.username);
    const result: AuthResult = {
      offline: true,
      username: chain.displayName,
      xuid: chain.xuid,
      uuid: chain.uuid,
      chain: chain.chain,
      multiplayerToken: chain.multiplayerToken,
      keyPair: chain.keyPair,
    };
    this.cached = result;
    console.log(`[Auth] Offline chain for "${result.username}" (${result.chain?.length} JWT)`);
    return result;
  }

  private cachePath(): string {
    const dir = this.options.cacheDir!;
    return join(dir, `msa-${this.sanitize(this.options.username)}.json`);
  }

  private sanitize(s: string) {
    return s.replace(/[^a-zA-Z0-9._@-]/g, "_").slice(0, 64);
  }

  private loadCache(): { refreshToken?: string; accessToken?: string; expiresAt?: number; username?: string } | null {
    try {
      const p = this.cachePath();
      if (!existsSync(p)) return null;
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  }

  private saveCache(data: {
    refreshToken?: string;
    accessToken?: string;
    expiresAt?: number;
    username?: string;
  }) {
    if (!this.options.persistTokens) return;
    try {
      const p = this.cachePath();
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, JSON.stringify({ ...data, savedAt: Date.now() }, null, 2));
      console.log(`[Auth] Token cache saved → ${p}`);
    } catch (e: any) {
      console.warn("[Auth] Could not save token cache:", e?.message ?? e);
    }
  }

  private async onlineAuth(): Promise<AuthResult> {
    console.log("[Auth] Microsoft → Xbox Live → XSTS → Minecraft Services → JWT chain");
    const keyPair = generateBedrockKeyPair();

    try {
      let accessToken: string;
      let refreshToken: string | undefined = this.options.refreshToken;
      let msaExpiresIn = 3600;

      // 1) Try explicit refresh token, then disk cache, then device code
      if (!refreshToken) {
        const cached = this.loadCache();
        if (cached?.refreshToken) {
          refreshToken = cached.refreshToken;
          console.log("[Auth] Using cached refresh token");
        }
      }

      if (refreshToken) {
        try {
          const tok = await this.refreshMsa(refreshToken);
          accessToken = tok.access_token;
          refreshToken = tok.refresh_token ?? refreshToken;
          msaExpiresIn = tok.expires_in ?? 3600;
        } catch (e: any) {
          console.warn("[Auth] Refresh failed, falling back to device code:", e?.message ?? e);
          refreshToken = undefined;
          const device = await this.requestDeviceCode();
          console.log("");
          console.log("╔══════════════════════════════════════════════════╗");
          console.log("║  Microsoft device login                          ║");
          console.log(`║  Open: ${device.verification_uri}`);
          console.log(`║  Code: ${device.user_code}`);
          console.log("╚══════════════════════════════════════════════════╝");
          console.log("");
          const tok = await this.pollDeviceCode(device.device_code, device.interval ?? 5);
          accessToken = tok.access_token;
          refreshToken = tok.refresh_token;
          msaExpiresIn = tok.expires_in ?? 3600;
        }
      } else {
        const device = await this.requestDeviceCode();
        console.log("");
        console.log("╔══════════════════════════════════════════════════╗");
        console.log("║  Microsoft device login                          ║");
        console.log(`║  Open: ${device.verification_uri}`);
        console.log(`║  Code: ${device.user_code}`);
        console.log("╚══════════════════════════════════════════════════╝");
        console.log("");
        const tok = await this.pollDeviceCode(device.device_code, device.interval ?? 5);
        accessToken = tok.access_token;
        refreshToken = tok.refresh_token;
        msaExpiresIn = tok.expires_in ?? 3600;
      }

      this.saveCache({
        refreshToken,
        accessToken,
        expiresAt: Date.now() + msaExpiresIn * 1000,
        username: this.options.username,
      });

      // 2) Xbox Live user token
      const xbl = await this.xboxLiveAuth(accessToken);
      const xblToken = xbl.Token as string;

      // 3) XSTS for Bedrock multiplayer (chain issuer)
      const xstsBedrock = await this.xstsAuth(xblToken, "https://multiplayer.minecraft.net/");
      const uhs = xstsBedrock.DisplayClaims?.xui?.[0]?.uhs as string;
      if (!uhs) throw new Error("XSTS missing user hash (uhs)");
      let xuid =
        xstsBedrock.DisplayClaims?.xui?.[0]?.xid ??
        xstsBedrock.DisplayClaims?.xui?.[0]?.gtg ??
        "0";
      let gamerTag =
        xstsBedrock.DisplayClaims?.xui?.[0]?.gtg ??
        this.options.username;

      // 4) Bedrock JWT chain from multiplayer.minecraft.net
      const mojangChain = await this.bedrockChain(uhs, xstsBedrock.Token, keyPair.x509);
      console.log(`[Auth] Bedrock chain length=${mojangChain.length}`);
      // Pull display name / XUID from Mojang chain extraData when XSTS omits them
      try {
        for (const jwt of mojangChain) {
          const parts = String(jwt).split(".");
          if (parts.length < 2) continue;
          const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
          const extra = payload?.extraData ?? payload;
          if (extra?.displayName) gamerTag = String(extra.displayName);
          if (extra?.XUID || extra?.identity) {
            if (extra.XUID && extra.XUID !== "0") xuid = String(extra.XUID);
          }
        }
      } catch { /* ignore claim parse */ }

      // Real multiplayer Token for Login Certificate envelope (PlayFab → MCS)
      let multiplayerToken = "";
      try {
        if (_cachedMpToken && Date.now() - _cachedMpTokenAt < 10 * 60 * 1000) {
          multiplayerToken = _cachedMpToken;
          console.log("[Auth] Reusing cached multiplayer token");
        } else if (Date.now() - _mcsLastFail < MCS_GLOBAL_COOLDOWN) {
          const wait = MCS_GLOBAL_COOLDOWN - (Date.now() - _mcsLastFail);
          console.warn(`[Auth] MCS global cooldown ${wait}ms`);
          await sleepMs(wait);
        }
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            multiplayerToken = await this.fetchMultiplayerToken(xblToken, keyPair.x509);
            console.log(`[Auth] Multiplayer token len=${multiplayerToken.length}`);
            _cachedMpToken = multiplayerToken;
            _cachedMpTokenAt = Date.now();
            break;
          } catch (e: any) {
            const msg = String(e?.message || e);
            if (msg.includes("429") || msg.includes("limited timeframe")) {
              const wait = 5000 * (attempt + 1);
              _mcsLastFail = Date.now();
              console.warn(`[Auth] MCS 429 — backoff ${wait}ms (attempt ${attempt + 1}/5)`);
              await sleepMs(wait);
              continue;
            }
            console.warn(`[Auth] Multiplayer token failed: ${msg.slice(0, 160)}`);
            break;
          }
        }
      } catch (e: any) {
        console.warn("[Auth] Multiplayer token failed:", e?.message ?? e);
      }

      const username = String(gamerTag);
      const built = buildOnlineChain(username, mojangChain, keyPair, String(xuid));

      const result: AuthResult = {
        offline: false,
        username: built.displayName,
        xuid: built.xuid,
        uuid: built.uuid,
        chain: built.chain,
        multiplayerToken: multiplayerToken || built.multiplayerToken,
        accessToken: undefined,
        refreshToken,
        expiresAt: Date.now() + 60 * 60 * 1000,
        keyPair: built.keyPair,
      };
      this.cached = result;
      console.log(`[Auth] Online OK as ${result.username} xuid=${result.xuid} chain=${result.chain?.length}`);
      return result;
    } catch (err: any) {
      console.error("[Auth] Online failed:", err?.message ?? err);
      if (this.options.fallbackOffline) {
        console.error("[Auth] Falling back to offline ES384 chain");
        return this.offlineAuth();
      }
      throw err;
    }
  }

  private async requestDeviceCode(): Promise<any> {
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      scope: SCOPE,
      response_type: "device_code",
    });
    const res = await fetch(MSA_DEVICE_CODE, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Device code HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    return res.json();
  }

  private async pollDeviceCode(deviceCode: string, intervalSec: number): Promise<any> {
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, Math.max(3, intervalSec) * 1000));
      const body = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: this.options.clientId,
        device_code: deviceCode,
      });
      const res = await fetch(MSA_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const data = await res.json();
      if (data.access_token) return data;
      if (data.error === "authorization_pending") continue;
      if (data.error === "slow_down") {
        intervalSec += 5;
        continue;
      }
      if (data.error === "expired_token") throw new Error("Device code expired — run again");
      throw new Error(data.error_description || data.error || "poll failed");
    }
    throw new Error("Device code timed out (15 min)");
  }

  private async refreshMsa(refreshToken: string): Promise<any> {
    const body = new URLSearchParams({
      client_id: this.options.clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: SCOPE,
    });
    const res = await fetch(MSA_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json();
    if (!data.access_token) {
      throw new Error(data.error_description || data.error || `Refresh HTTP ${res.status}`);
    }
    return data;
  }

  private async xboxLiveAuth(msaAccessToken: string): Promise<any> {
    // Live.com MBI tokens use t=; some device flows return d= already prefixed.
    let rpsTicket = msaAccessToken;
    if (!rpsTicket.startsWith("d=") && !rpsTicket.startsWith("t=")) {
      // Compact Live tokens typically start with "Ew" → t=; legacy device codes → d=
      rpsTicket = (rpsTicket.startsWith("Ew") ? "t=" : "d=") + rpsTicket;
    }
    const res = await fetch(XBL_USER, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-xbl-contract-version": "1",
      },
      body: JSON.stringify({
        Properties: {
          AuthMethod: "RPS",
          SiteName: "user.auth.xboxlive.com",
          RpsTicket: rpsTicket,
        },
        RelyingParty: "http://auth.xboxlive.com",
        TokenType: "JWT",
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`XBL HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    return res.json();
  }

  private async xstsAuth(userToken: string, relyingParty: string): Promise<any> {
    const res = await fetch(XSTS, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        Properties: { SandboxId: "RETAIL", UserTokens: [userToken] },
        RelyingParty: relyingParty,
        TokenType: "JWT",
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`XSTS HTTP ${res.status}: ${t.slice(0, 300)}`);
    }
    return res.json();
  }

  /** PlayFab → Minecraft services multiplayer signed token (Login Token field). */
  private async fetchMultiplayerToken(xblUserToken: string, publicKey: string): Promise<string> {
    const xstsPf = await this.xstsAuth(xblUserToken, PLAYFAB_RP);
    const uhs = xstsPf.DisplayClaims?.xui?.[0]?.uhs as string;
    if (!uhs) throw new Error("PlayFab XSTS missing uhs");

    const pfRes = await fetch(PLAYFAB_LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        CreateAccount: true,
        TitleId: "20CA2",
        XboxToken: `XBL3.0 x=${uhs};${xstsPf.Token}`,
        InfoRequestParameters: {
          GetPlayerProfile: true,
          GetUserAccountInfo: true,
        },
      }),
    });
    if (!pfRes.ok) {
      const t = await pfRes.text().catch(() => "");
      throw new Error(`PlayFab login HTTP ${pfRes.status}: ${t.slice(0, 200)}`);
    }
    const pf = await pfRes.json();
    const sessionTicket = pf?.data?.SessionTicket;
    if (!sessionTicket) throw new Error("PlayFab missing SessionTicket");

    const sessRes = await fetch(MCS_SESSION_START, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        device: {
          applicationType: "MinecraftPE",
          gameVersion: "1.26.52",
          id: "aether-device-001",
          memory: String(8 * 1024 * 1024 * 1024),
          platform: "Windows10",
          playFabTitleId: "20CA2",
          storePlatform: "uwp.store",
          type: "Windows10",
        },
        user: { token: sessionTicket, tokenType: "PlayFab" },
      }),
    });
    if (!sessRes.ok) {
      const t = await sessRes.text().catch(() => "");
      throw new Error(`MCS session HTTP ${sessRes.status}: ${t.slice(0, 200)}`);
    }
    const sess = await sessRes.json();
    const authHeader = sess?.result?.authorizationHeader;
    if (!authHeader) throw new Error("MCS session missing authorizationHeader");

    const mpRes = await fetch(MCS_MP_SESSION_START, {
      method: "POST",
      headers: {
        accept: "*/*",
        authorization: authHeader,
        "content-type": "application/json",
        "User-Agent": "libhttpclient/1.0.0.0",
      },
      body: JSON.stringify({ publicKey }),
    });
    if (!mpRes.ok) {
      const t = await mpRes.text().catch(() => "");
      throw new Error(`MCS multiplayer HTTP ${mpRes.status}: ${t.slice(0, 200)}`);
    }
    const mp = await mpRes.json();
    const signed = mp?.result?.signedToken || mp?.signedToken || "";
    if (!signed) throw new Error("MCS multiplayer missing signedToken");
    return signed;
  }

    /** Request Mojang-signed Bedrock login chain (protocol login packet). */
  private async bedrockChain(uhs: string, xstsToken: string, identityPublicKey: string): Promise<string[]> {
    const res = await fetch(MC_BEDROCK_AUTH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `XBL3.0 x=${uhs};${xstsToken}`,
        "User-Agent": "MCPE/Android",
        "Client-Version": "1.26.52",
      },
      body: JSON.stringify({ identityPublicKey }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Bedrock chain HTTP ${res.status}: ${t.slice(0, 300)}`);
    }
    const data = await res.json();
    if (Array.isArray(data)) return data as string[];
    if (Array.isArray(data?.chain)) return data.chain as string[];
    throw new Error("Bedrock chain response missing chain array");
  }

  private async minecraftLogin(uhs: string, xstsToken: string): Promise<any> {
    const res = await fetch(MC_LOGIN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xstsToken}` }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`MC login HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    return res.json();
  }

  private async minecraftProfile(accessToken: string): Promise<any> {
    const res = await fetch(MC_PROFILE, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Profile HTTP ${res.status}`);
    return res.json();
  }

  getCached() {
    return this.cached;
  }

  /** Clear cached tokens for this username */
  clearCache() {
    try {
      const p = this.cachePath();
      if (existsSync(p)) {
        writeFileSync(p, "{}");
        console.log("[Auth] Cache cleared");
      }
    } catch { /* ignore */ }
  }
}
