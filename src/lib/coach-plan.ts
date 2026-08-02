// Lógica pura do Coach (objetivo + plano semanal + confiança/próxima ação).
// Sem imports — testável em node. As server functions (nutrition.functions.ts,
// chat.functions.ts) e o front importam daqui.
// Os tipos espelham o `coachSchema` (nutrition.functions.ts) sem depender dele.

export type CoachObjective =
  | "Emagrecimento"
  | "Hipertrofia"
  | "Recomposicao corporal"
  | "Manutencao";

export type CoachGoals = {
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
};

export type CoachStats = {
  mealCount?: number;
  workoutCount?: number;
  weightCount?: number;
  waterCount?: number;
};

export type CoachPlan = {
  title: string;
  objective: string;
  focus: string;
  todaySummary: string;
  trainingGoal: string;
  nutritionGoal: string;
  trackingGoal: string;
  nextAction: string;
  checklist: string[];
};

export function inferCoachObjective(goals?: CoachGoals): CoachObjective {
  const calories = goals?.calories ?? 0;
  const protein = goals?.protein_g ?? 0;

  if (calories <= 1900 && protein >= 120) return "Emagrecimento";
  if (calories >= 2300 && protein >= 150) return "Hipertrofia";
  if (calories > 0 && calories < 2300) return "Recomposicao corporal";
  return "Manutencao";
}

export function buildCoachPlan(
  stats: CoachStats,
  goals?: CoachGoals,
  preferredObjective?: CoachObjective,
): CoachPlan {
  const workoutCount = stats.workoutCount ?? 0;
  const mealCount = stats.mealCount ?? 0;
  const weightCount = stats.weightCount ?? 0;
  const waterCount = stats.waterCount ?? 0;
  const objective = preferredObjective ?? inferCoachObjective(goals);

  const focus =
    objective === "Emagrecimento"
      ? workoutCount === 0
        ? "Criar rotina e aderencia"
        : "Aumentar gasto e manter consistencia"
      : objective === "Hipertrofia"
        ? workoutCount < 3
          ? "Fechar volume minimo da semana"
          : "Subir carga e preservar recuperacao"
        : objective === "Recomposicao corporal"
          ? "Equilibrar treino, comida e recuperacao"
          : "Manter consistencia e medir evolucao";

  const todaySummary =
    objective === "Emagrecimento"
      ? workoutCount === 0
        ? "Hoje, marque o primeiro treino da semana e registre a refeicao principal."
        : "Hoje, mantenha a comida sob controle e feche um treino se ainda nao treinou."
      : objective === "Hipertrofia"
        ? workoutCount === 0
          ? "Hoje, organize o treino e garanta uma refeicao com boa proteina."
          : "Hoje, foque em comer bem e registrar cargas do treino."
        : objective === "Recomposicao corporal"
          ? "Hoje, mantenha o treino e a alimentacao alinhados sem exageros."
          : "Hoje, registre o que comer e verifique se o treino da semana esta andando.";

  const trainingGoal =
    objective === "Emagrecimento"
      ? workoutCount === 0
        ? "Fazer 2 a 3 treinos para voltar ao ritmo e aumentar gasto semanal."
        : "Manter pelo menos 3 treinos com foco em consistencia e intensidade moderada."
      : objective === "Hipertrofia"
        ? workoutCount < 3
          ? "Fechar 3 a 4 treinos e anotar cargas e repeticoes em cada sessao."
          : "Buscar progressao em pelo menos 1 exercicio por treino."
        : objective === "Recomposicao corporal"
          ? "Fazer 3 treinos bem feitos e evitar semanas muito vazias."
          : "Manter 2 a 3 treinos consistentes e registrar performance.";

  const nutritionGoal =
    objective === "Emagrecimento"
      ? mealCount < 4
        ? "Registrar refeicoes todos os dias e vigiar a aderencia calorica."
        : "Priorizar saciedade, proteina e constancia no deficit."
      : objective === "Hipertrofia"
        ? mealCount < 4
          ? "Registrar todas as refeicoes para nao perder calorias nem proteina."
          : "Garantir superavit leve e bater a proteina alvo."
        : objective === "Recomposicao corporal"
          ? mealCount < 4
            ? "Manter registros para equilibrar calorias e proteina."
            : "Buscar proteina alta e calorias controladas."
          : "Manter o registro alimentar e comparar proteina, calorias e aderencia a meta.";

  const trackingGoal =
    objective === "Emagrecimento"
      ? weightCount === 0
        ? "Adicionar pelo menos 1 peso na semana para validar se o deficit esta funcionando."
        : "Monitorar peso e agua para entender o ritmo de perda."
      : objective === "Hipertrofia"
        ? weightCount === 0
          ? "Fazer 1 pesagem de controle para acompanhar ganho real."
          : "Acompanhar peso e agua para diferenciar ganho de massa de retenÃ§Ã£o."
        : waterCount < 4
          ? "Registrar agua com mais constancia para completar a leitura da recuperacao."
          : "Seguir monitorando peso e agua para confirmar a evolucao da semana.";

  const nextAction =
    objective === "Emagrecimento"
      ? workoutCount === 0
        ? "Abra a semana com 2 treinos marcados e uma meta simples de registro alimentar."
        : "Segure a constancia nos treinos e nao deixe as refeicoes principais sem registro."
      : objective === "Hipertrofia"
        ? workoutCount === 0
          ? "Planeje os treinos e garanta a primeira sessao com cargas definidas."
          : "Tente subir uma variavel de treino e manter a comida alinhada ao ganho."
        : objective === "Recomposicao corporal"
          ? "Mantenha o treino e a comida sob controle, com ajuste fino ao longo da semana."
          : workoutCount === 0
            ? "Abra a proxima semana com 1 treino marcado na agenda."
            : mealCount === 0
              ? "Registre a proxima refeicao inteira para o Coach ja comecar a planejar com base real."
              : weightCount === 0
                ? "Faca uma pesagem assim que puder e use esse numero como ponto de referencia."
                : "Continue a rotina atual e revise o plano no fim da semana para ajustar a progressao.";

  const checklist = [
    objective === "Emagrecimento"
      ? workoutCount === 0
        ? "Marcar 2 treinos e 1 caminhada longa na semana."
        : "Manter o deficit sob controle nas refeicoes principais."
      : objective === "Hipertrofia"
        ? workoutCount < 3
          ? "Fechar 3 treinos e anotar cargas."
          : "Garantir proteina suficiente em todas as refeicoes."
        : objective === "Recomposicao corporal"
          ? "Treinar sem falhar e nao deixar refeicoes longas sem registro."
          : workoutCount === 0
            ? "Marcar 2 treinos na agenda antes de quarta-feira."
            : "Fechar pelo menos 3 treinos na semana com carga anotada.",
    objective === "Emagrecimento"
      ? "Registrar todas as refeicoes principais da semana."
      : objective === "Hipertrofia"
        ? "Bater a meta de proteina todos os dias."
        : objective === "Recomposicao corporal"
          ? "Comparar o total de proteina e calorias com a meta."
          : mealCount < 4
            ? "Registrar todas as refeicoes principais da semana."
            : "Comparar o total de proteina e calorias com a meta.",
    objective === "Emagrecimento"
      ? weightCount === 0
        ? "Fazer 1 pesagem de referencia."
        : "Repetir a pesagem no mesmo horario para acompanhar tendencia."
      : objective === "Hipertrofia"
        ? weightCount === 0
          ? "Fazer 1 pesagem de referencia."
          : "Acompanhar peso uma vez por semana no mesmo horario."
        : weightCount === 0
          ? "Fazer 1 pesagem de referencia."
          : "Repetir a pesagem no mesmo horario para acompanhar tendencia.",
  ];

  return {
    title: "Plano da proxima semana",
    objective,
    focus,
    todaySummary,
    trainingGoal,
    nutritionGoal,
    trackingGoal,
    nextAction,
    checklist,
  };
}

/**
 * Nível de confiança — mesma heurística determinística do coachAdvice: a IA
 * responde em texto livre e a confiança é derivada da quantidade de dados recentes.
 */
export function confidenceFromStats(stats: {
  workoutCount: number;
  mealCount: number;
  weightCount: number;
  waterCount: number;
}): "baixa" | "media" | "alta" {
  const score = stats.workoutCount + stats.mealCount + stats.weightCount + stats.waterCount;
  return score >= 12 ? "alta" : score >= 6 ? "media" : "baixa";
}

export function nextActionFromStats(stats: {
  workoutCount: number;
  mealCount: number;
  weightCount: number;
}): string {
  if (stats.workoutCount === 0)
    return "Registre pelo menos um treino na proxima semana para melhorar a leitura do Coach.";
  if (stats.mealCount === 0)
    return "Registre refeicoes com mais frequencia para cruzar melhor treino e nutricao.";
  if (stats.weightCount === 0)
    return "Adicione ao menos um peso recente para o Coach comparar com sua evolucao.";
  return "Mantenha a rotina atual e revise os dados na proxima atualizacao.";
}
