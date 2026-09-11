import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getLocalDate, todayBoundsSaoPaulo } from "@/lib/utils";
import { parseGoogleFitAggregateResponse, estimateActiveCaloriesFromSteps } from "@/lib/google-fit-utils";

const GOOGLE_FIT_SCOPES = [
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.body.read",
].join(" ");

function getGoogleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
}

function getGoogleClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET || "";
}

/**
 * Retorna o status de conexão com o Google Fit para o usuário logado.
 */
export const getGoogleFitStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    let connected = false;
    let lastSync: string | null = null;

    try {
      const { data } = await supabase
        .from("user_integrations")
        .select("updated_at, access_token")
        .eq("user_id", userId)
        .eq("provider", "google_fit")
        .maybeSingle();

      if (data && data.access_token) {
        connected = true;
        lastSync = data.updated_at;
      }
    } catch {
      // Se a tabela ainda não existir no Supabase, retorna connected: false sem erro
    }

    return {
      connected,
      hasClientConfigured: Boolean(getGoogleClientId()),
      lastSync,
    };
  });

/**
 * Gera a URL de autorização OAuth 2.0 do Google.
 */
export const getGoogleFitAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((redirectUri: unknown) => z.string().parse(redirectUri))
  .handler(async ({ data: redirectUri }) => {
    const clientId = getGoogleClientId();
    if (!clientId) {
      throw new Error(
        "GOOGLE_CLIENT_ID não configurado no servidor. Adicione as credenciais nas variáveis de ambiente ou utilize o registro manual de passos."
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_FIT_SCOPES,
      access_type: "offline",
      prompt: "consent",
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  });

/**
 * Conclui o fluxo OAuth trocando o `code` por access_token e refresh_token.
 */
export const exchangeGoogleFitCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        code: z.string(),
        redirectUri: z.string(),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const clientId = getGoogleClientId();
    const clientSecret = getGoogleClientSecret();

    if (!clientId || !clientSecret) {
      throw new Error("Credenciais do Google não configuradas no servidor.");
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: data.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: data.redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      throw new Error(`Falha ao obter token do Google: ${errBody}`);
    }

    const tokenData = await tokenRes.json();
    const expiresAt = Date.now() + (tokenData.expires_in ?? 3600) * 1000;

    // Salvar na tabela de integrações
    try {
      await supabase.from("user_integrations").upsert({
        user_id: userId,
        provider: "google_fit",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider" });
    } catch (err: any) {
      console.warn("Erro ao gravar user_integrations:", err?.message);
    }

    return { success: true };
  });

/**
 * Desconecta a integração do Google Fit.
 */
export const disconnectGoogleFit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    try {
      await supabase
        .from("user_integrations")
        .delete()
        .eq("user_id", userId)
        .eq("provider", "google_fit");
    } catch {}
    return { success: true };
  });

/**
 * Busca os passos e calorias ativas do dia via Google Fitness REST API.
 */
export const fetchGoogleFitDailyData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = getLocalDate();
    const { start, end } = todayBoundsSaoPaulo();
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();

    // 1. Tentar buscar da integração ativa
    let tokenRow: any = null;
    try {
      const { data } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", userId)
        .eq("provider", "google_fit")
        .maybeSingle();
      tokenRow = data;
    } catch {}

    if (tokenRow && tokenRow.access_token) {
      let accessToken = tokenRow.access_token;
      const clientId = getGoogleClientId();
      const clientSecret = getGoogleClientSecret();

      // Renovar token se expirou
      if (tokenRow.expires_at && Date.now() > tokenRow.expires_at - 60000 && tokenRow.refresh_token && clientId && clientSecret) {
        try {
          const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: tokenRow.refresh_token,
              grant_type: "refresh_token",
            }),
          });
          if (refreshRes.ok) {
            const refData = await refreshRes.json();
            accessToken = refData.access_token;
            await supabase.from("user_integrations").update({
              access_token: accessToken,
              expires_at: Date.now() + (refData.expires_in ?? 3600) * 1000,
              updated_at: new Date().toISOString(),
            }).eq("id", tokenRow.id);
          }
        } catch (e) {
          console.warn("Erro ao renovar token do Google:", e);
        }
      }

      // Consulta de agregação do Google Fitness
      try {
        const fitRes = await fetch("https://fitness.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            aggregateBy: [
              { dataTypeName: "com.google.step_count.delta" },
              { dataTypeName: "com.google.calories.expended" },
              { dataTypeName: "com.google.distance.delta" },
            ],
            bucketByTime: { durationMillis: 86400000 },
            startTimeMillis: startMs,
            endTimeMillis: endMs,
          }),
        });

        if (fitRes.ok) {
          const fitJson = await fitRes.json();
          const metrics = parseGoogleFitAggregateResponse(fitJson);

          // Salvar ou atualizar na tabela daily_steps_logs se disponível
          try {
            await supabase.from("daily_steps_logs").upsert({
              user_id: userId,
              log_date: today,
              steps: metrics.steps,
              active_calories: metrics.activeCalories,
              source: "google_fit",
              updated_at: new Date().toISOString(),
            }, { onConflict: "user_id,log_date" });
          } catch {}

          return {
            connected: true,
            steps: metrics.steps,
            activeCalories: metrics.activeCalories,
            distanceMeters: metrics.distanceMeters,
            source: "google_fit",
            updatedAt: new Date().toISOString(),
          };
        }
      } catch (err) {
        console.warn("Falha ao consultar API do Google Fit:", err);
      }
    }

    // 2. Fallback: buscar de daily_steps_logs (registro manual anterior)
    try {
      const { data: localLog } = await supabase
        .from("daily_steps_logs")
        .select("steps, active_calories, source, updated_at")
        .eq("user_id", userId)
        .eq("log_date", today)
        .maybeSingle();

      if (localLog) {
        return {
          connected: Boolean(tokenRow?.access_token),
          steps: localLog.steps ?? 0,
          activeCalories: Number(localLog.active_calories ?? 0),
          distanceMeters: Math.round((localLog.steps ?? 0) * 0.75),
          source: localLog.source ?? "manual",
          updatedAt: localLog.updated_at,
        };
      }
    } catch {}

    return {
      connected: Boolean(tokenRow?.access_token),
      steps: 0,
      activeCalories: 0,
      distanceMeters: 0,
      source: "none",
      updatedAt: null,
    };
  });

/**
 * Registra ou atualiza os passos manualmente para o dia de hoje.
 */
export const saveManualSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((steps: unknown) => z.number().int().min(0).max(100000).parse(steps))
  .handler(async ({ data: steps, context }) => {
    const { supabase, userId } = context;
    const today = getLocalDate();
    const activeCalories = estimateActiveCaloriesFromSteps(steps);

    try {
      await supabase.from("daily_steps_logs").upsert({
        user_id: userId,
        log_date: today,
        steps,
        active_calories: activeCalories,
        source: "manual",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,log_date" });
    } catch (err: any) {
      console.warn("Erro ao salvar daily_steps_logs:", err?.message);
    }

    return { steps, activeCalories };
  });
