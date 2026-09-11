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
  .inputValidator((input: unknown) => {
    if (typeof input === "string") {
      return { redirectUri: input, clientId: undefined };
    }
    return z
      .object({
        redirectUri: z.string(),
        clientId: z.string().optional(),
      })
      .parse(input);
  })
  .handler(async ({ data }) => {
    const clientId = data.clientId?.trim() || getGoogleClientId();
    if (!clientId) {
      throw new Error(
        "Client ID do Google não configurado. Adicione o Client ID no .env ou nas configurações do Google Fit."
      );
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: data.redirectUri,
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
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
      })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const clientId = data.clientId?.trim() || getGoogleClientId();
    const clientSecret = data.clientSecret?.trim() || getGoogleClientSecret();

    if (!clientId || !clientSecret) {
      throw new Error("Credenciais do Google (Client ID / Client Secret) não encontradas.");
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
    let dbSaved = false;
    let dbErrorMsg: string | null = null;
    try {
      const { error: upsertErr } = await supabase.from("user_integrations").upsert({
        user_id: userId,
        provider: "google_fit",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,provider" });

      if (upsertErr) {
        console.warn("[GoogleFit] Aviso ao gravar user_integrations no Supabase:", upsertErr.message);
        dbErrorMsg = upsertErr.message;
      } else {
        dbSaved = true;
      }
    } catch (err: any) {
      console.warn("[GoogleFit] Exceção ao gravar user_integrations:", err?.message);
      dbErrorMsg = err?.message;
    }

    return {
      success: true,
      dbSaved,
      dbError: dbErrorMsg,
      tokens: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
      },
    };
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
export const fetchGoogleFitDailyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") return {};
    return z
      .object({
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        accessToken: z.string().optional(),
        refreshToken: z.string().optional(),
        expiresAt: z.number().optional(),
      })
      .parse(input);
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const today = getLocalDate();
    const { start } = todayBoundsSaoPaulo();
    const startMs = new Date(start).getTime();
    // Google Fit agrega por bucket de 24h. O intervalo [startMs, fullDayEndMs] precisa ter 86400000ms
    const fullDayEndMs = startMs + 86400000;

    // 1. Tentar buscar da integração ativa (banco de dados)
    let tokenRow: any = null;
    try {
      const { data: dbData } = await supabase
        .from("user_integrations")
        .select("*")
        .eq("user_id", userId)
        .eq("provider", "google_fit")
        .maybeSingle();
      tokenRow = dbData;
    } catch (dbErr: any) {
      console.warn("[GoogleFit] Erro ao consultar user_integrations:", dbErr?.message);
    }

    // Se a tabela do Supabase ainda não existir, utiliza tokens locais passados pelo dispositivo
    if (!tokenRow?.access_token && data?.accessToken) {
      tokenRow = {
        access_token: data.accessToken,
        refresh_token: data.refreshToken,
        expires_at: data.expiresAt,
      };
    }

    let refreshedTokens: { accessToken: string; expiresAt: number } | null = null;

    if (tokenRow && tokenRow.access_token) {
      let accessToken = tokenRow.access_token;
      const activeClientId = data?.clientId?.trim() || getGoogleClientId();
      const activeClientSecret = data?.clientSecret?.trim() || getGoogleClientSecret();

      const refreshAccessToken = async (): Promise<string | null> => {
        if (!tokenRow.refresh_token || !activeClientId || !activeClientSecret) {
          console.warn("[GoogleFit] Não foi possível renovar token: refresh_token ou credenciais ausentes");
          return null;
        }
        try {
          console.log("[GoogleFit] Renovando access_token com refresh_token...");
          const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: activeClientId,
              client_secret: activeClientSecret,
              refresh_token: tokenRow.refresh_token,
              grant_type: "refresh_token",
            }),
          });
          if (refreshRes.ok) {
            const refData = await refreshRes.json();
            const newAccessToken = refData.access_token;
            const newExpiresAt = Date.now() + (refData.expires_in ?? 3600) * 1000;
            if (tokenRow.id) {
              await supabase.from("user_integrations").update({
                access_token: newAccessToken,
                expires_at: newExpiresAt,
                updated_at: new Date().toISOString(),
              }).eq("id", tokenRow.id);
            }
            console.log("[GoogleFit] Access token renovado com sucesso!");
            refreshedTokens = {
              accessToken: newAccessToken,
              expiresAt: newExpiresAt,
            };
            return newAccessToken;
          } else {
            const errText = await refreshRes.text();
            console.warn("[GoogleFit] Falha na resposta da renovação do token:", refreshRes.status, errText);
          }
        } catch (e: any) {
          console.warn("[GoogleFit] Erro ao renovar token do Google:", e?.message);
        }
        return null;
      };

      // Renovar proativamente se expirado ou prestes a expirar (< 2 min)
      if (tokenRow.expires_at && Date.now() > tokenRow.expires_at - 120000) {
        const renewed = await refreshAccessToken();
        if (renewed) accessToken = renewed;
      }

      // Função auxiliar para disparar requisição de agregação ao Google Fit
      const executeAggregateQuery = async (token: string, useEstimatedSteps = true) => {
        const aggregateBy = useEstimatedSteps
          ? [
              {
                dataTypeName: "com.google.step_count.delta",
                dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
              },
              {
                dataTypeName: "com.google.calories.expended",
              },
            ]
          : [
              {
                dataTypeName: "com.google.step_count.delta",
              },
              {
                dataTypeName: "com.google.calories.expended",
              },
            ];

        return fetch("https://fitness.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            aggregateBy,
            bucketByTime: { durationMillis: 86400000 },
            startTimeMillis: startMs,
            endTimeMillis: fullDayEndMs,
          }),
        });
      };

      try {
        let fitRes = await executeAggregateQuery(accessToken, true);

        // Se retornar 401 (token expirado), tenta renovar imediatamente e refaz a requisição
        if (fitRes.status === 401) {
          console.warn("[GoogleFit] 401 Unauthorized recebido. Tentando renovar access_token...");
          const renewed = await refreshAccessToken();
          if (renewed) {
            accessToken = renewed;
            fitRes = await executeAggregateQuery(accessToken, true);
          }
        }

        // Se retornar 400 (ex: dataSourceId estimated_steps não suportado pela conta), tenta consulta genérica
        if (fitRes.status === 400) {
          console.warn("[GoogleFit] 400 recebido com estimated_steps. Tentando sem dataSourceId fixo...");
          fitRes = await executeAggregateQuery(accessToken, false);
        }

        if (fitRes.ok) {
          const fitJson = await fitRes.json();
          let metrics = parseGoogleFitAggregateResponse(fitJson);
          console.log("[GoogleFit] Sucesso na leitura do aggregate:", {
            bucketsCount: fitJson?.bucket?.length ?? 0,
            steps: metrics.steps,
            calories: metrics.activeCalories,
          });

          // Se retornou 0 passos com stream primário, tenta leitura secundária genérica por dataTypeName puro
          if (metrics.steps === 0) {
            console.log("[GoogleFit] 0 passos com stream primário, testando fallback genérico de dataTypeName...");
            try {
              const fallbackRes = await executeAggregateQuery(accessToken, false);
              if (fallbackRes.ok) {
                const fallbackJson = await fallbackRes.json();
                const fallbackMetrics = parseGoogleFitAggregateResponse(fallbackJson);
                if (fallbackMetrics.steps > 0) {
                  metrics = fallbackMetrics;
                  console.log("[GoogleFit] Passos encontrados no stream secundário:", metrics.steps);
                }
              }
            } catch {}
          }

          // Se ainda for 0 passos, busca dataSources disponíveis para debug
          if (metrics.steps === 0) {
            try {
              const dsRes = await fetch("https://fitness.googleapis.com/fitness/v1/users/me/dataSources?dataTypeName=com.google.step_count.delta", {
                headers: { Authorization: `Bearer ${accessToken}` },
              });
              if (dsRes.ok) {
                const dsJson = await dsRes.json();
                const streams = dsJson?.dataSource?.map((d: any) => d.dataStreamId);
                console.log("[GoogleFit] Step dataSources registrados na conta Google:", streams);
              }
            } catch {}
          }

          // Salva na tabela daily_steps_logs apenas se encontrou passos > 0
          try {
            if (metrics.steps > 0) {
              await supabase.from("daily_steps_logs").upsert({
                user_id: userId,
                log_date: today,
                steps: metrics.steps,
                active_calories: metrics.activeCalories,
                source: "google_fit",
                updated_at: new Date().toISOString(),
              }, { onConflict: "user_id,log_date" });
            }
          } catch (upsertErr: any) {
            console.warn("[GoogleFit] Aviso ao salvar daily_steps_logs:", upsertErr?.message);
          }

          return {
            connected: true,
            steps: metrics.steps,
            activeCalories: metrics.activeCalories,
            distanceMeters: metrics.distanceMeters,
            source: "google_fit",
            updatedAt: new Date().toISOString(),
            refreshedTokens,
          };
        } else {
          const errText = await fitRes.text();
          console.error("[GoogleFit] Erro dataset:aggregate:", fitRes.status, errText);

          let errorMsg = `Erro ${fitRes.status} ao consultar Google Fit`;
          if (errText.includes("Fitness API has not been used") || errText.includes("accessNotConfigured")) {
            errorMsg = "A 'Fitness API' precisa ser ativada na Biblioteca do Google Cloud Console.";
          } else if (fitRes.status === 401) {
            errorMsg = "Sua autorização com o Google expirou. Por favor, desconecte e conecte novamente.";
          }

          return {
            connected: true,
            steps: 0,
            activeCalories: 0,
            distanceMeters: 0,
            source: "google_fit",
            updatedAt: null,
            error: errorMsg,
            refreshedTokens,
          };
        }
      } catch (err: any) {
        console.warn("[GoogleFit] Falha na chamada da API do Google Fit:", err?.message);
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
