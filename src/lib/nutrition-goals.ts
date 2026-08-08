// Metas nutricionais: detecção do "padrão" e sugestão de metas a partir do
// TDEE (TMB × fator de atividade) calculado pelo server fn `calculateTdee`.
// Funções puras — sem imports de app, testáveis em node.

export type GoalsInput = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

// O trigger de signup grava a meta com os defaults da tabela `goals`
// (2000/140/220/65). Enquanto a meta for exatamente esse valor, consideramos
// que o usuário NÃO a personalizou → podemos substituí-la pela sugestão.
export function isDefaultGoals(g: GoalsInput | null | undefined): boolean {
  return (
    !!g &&
    g.calories === 2000 &&
    g.protein_g === 140 &&
    g.carbs_g === 220 &&
    g.fat_g === 65
  );
}

// Sugestão de meta a partir do TDEE (manutenção) e do peso atual:
// - calorias = TDEE arredondado
// - proteína = 2 g/kg de peso (treino)
// - gordura  = 25% das kcal
// - carbo    = resto das kcal (nunca negativo)
export function suggestGoals(
  tdee: number,
  weightKg: number,
): GoalsInput {
  const calories = Math.round(tdee);
  const protein_g = Math.round(2 * weightKg);
  const fat_g = Math.round((0.25 * calories) / 9);
  const carbs_g = Math.max(0, Math.round((calories - protein_g * 4 - fat_g * 9) / 4));
  return { calories, protein_g, carbs_g, fat_g };
}

// Verdadeiro quando a meta atual bate exatamente com a sugestão para o TDEE
// atual — usado no card do home para rotular a meta como "calculada".
export function matchesSuggestion(
  g: GoalsInput | null | undefined,
  tdee: number,
  weightKg: number,
): boolean {
  if (!g) return false;
  const s = suggestGoals(tdee, weightKg);
  return (
    g.calories === s.calories &&
    g.protein_g === s.protein_g &&
    g.carbs_g === s.carbs_g &&
    g.fat_g === s.fat_g
  );
}
