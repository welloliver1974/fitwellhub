export type DayPeriod = "manha" | "tarde" | "noite";

/**
 * Determina o período do dia com base no horário oficial de Brasília (America/Sao_Paulo).
 */
export function getPeriodOfDay(date: Date = new Date()): DayPeriod {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hourVal = parts.find((p) => p.type === "hour")?.value ?? "0";
  const hours = parseInt(hourVal, 10) % 24;

  if (hours >= 5 && hours < 12) return "manha";
  if (hours >= 12 && hours < 18) return "tarde";
  return "noite";
}

export interface BriefingUserData {
  period: DayPeriod;
  userName?: string;
  workoutName?: string | null;
  hasWorkoutToday?: boolean;
  caloriesConsumed?: number;
  caloriesGoal?: number;
  proteinConsumed?: number;
  proteinGoal?: number;
  waterMl?: number;
  waterGoal?: number;
}

export interface BriefingResult {
  period: DayPeriod;
  title: string;
  message: string;
  actionText?: string;
  actionLink?: string;
}

/**
 * Gera um briefing diário determinístico e motivador para fallback offline
 * ou quando a IA não estiver configurada.
 */
export function generateDeterministicBriefing(data: BriefingUserData): BriefingResult {
  const first = data.userName ? data.userName.split(" ")[0] : "guerreiro";
  const calGoal = data.caloriesGoal || 2000;
  const calConsumed = data.caloriesConsumed || 0;
  const protGoal = data.proteinGoal || 140;
  const protConsumed = data.proteinConsumed || 0;
  const waterGoal = data.waterGoal || 2500;
  const waterConsumed = data.waterMl || 0;

  if (data.period === "manha") {
    if (data.workoutName) {
      return {
        period: "manha",
        title: `Bom dia, ${first}! 🌅`,
        message: `Hoje é dia de ${data.workoutName}. Garanta um café da manhã reforçado com boas fontes de carboidrato e proteína para treinar com energia máxima.`,
        actionText: "Ver treino de hoje",
        actionLink: "/app/treinos",
      };
    }
    return {
      period: "manha",
      title: `Bom dia, ${first}! ☀️`,
      message: `Dia perfeito para manter o foco e a constância. Comece o dia bebendo um bom copo d'água e planeje suas refeições para bater a meta de ${calGoal} kcal.`,
      actionText: "Registrar café da manhã",
      actionLink: "/app/nutricao",
    };
  }

  if (data.period === "tarde") {
    if (data.hasWorkoutToday) {
      const remainingProtein = Math.max(0, Math.round(protGoal - protConsumed));
      return {
        period: "tarde",
        title: `Treino feito com sucesso! 💪`,
        message: remainingProtein > 0
          ? `Excelente treino concluído hoje! Faltam ${remainingProtein}g de proteína para fechar suas metas e otimizar a recuperação muscular.`
          : `Treino feito e proteínas em dia! Mantenha a hidratação até a noite.`,
        actionText: "Ver nutrição",
        actionLink: "/app/nutricao",
      };
    }
    return {
      period: "tarde",
      title: `Boa tarde, ${first}! ⚡`,
      message: data.workoutName
        ? `Lembre-se do seu treino de ${data.workoutName} mais tarde. Mantenha a garrafinha cheia!`
        : `Metade do dia já foi: você já consumiu ${calConsumed} kcal. Continue firme na hidratação!`,
      actionText: "Registrar refeição",
      actionLink: "/app/nutricao",
    };
  }

  // noite
  const remainingWater = Math.max(0, Math.round(waterGoal - waterConsumed));
  const remainingProtein = Math.max(0, Math.round(protGoal - protConsumed));

  if (remainingWater > 500) {
    return {
      period: "noite",
      title: `Boa noite, ${first}! 🌙`,
      message: `Quase fechando o dia! Ainda faltam ${remainingWater}ml para bater sua meta de hidratação. Beba um pouco d'água antes de descansar.`,
      actionText: "Registrar água",
      actionLink: "/app",
    };
  }

  if (remainingProtein > 20) {
    return {
      period: "noite",
      title: `Reta final do dia! 🎯`,
      message: `Você mandou bem hoje, mas ainda faltam ${remainingProtein}g de proteína para fechar o dia perfeitamente. Uma ceia rápida ou shake proteico resolve!`,
      actionText: "Registrar ceia",
      actionLink: "/app/nutricao",
    };
  }

  return {
    period: "noite",
    title: `Dia concluído com maestria! 🌟`,
    message: `Metas batidas e consistência mantida! Um bom sono é o melhor anabólico natural — descanse bem para amanhã.`,
    actionText: "Conversar com Coach",
    actionLink: "/app/chat",
  };
}
