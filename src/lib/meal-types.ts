// Fonte única dos tipos de refeição do app. Ordem cronológica —
// MEAL_TYPES[0] (Café da manhã) e MEAL_TYPES[1] (Almoço) são os defaults
// usados pelas telas (diálogo de adicionar, foto, receita — não mudar posição).
//
// Tipos que existem no banco mas ficaram fora desta lista (ex.: o legado
// "Lanche", anterior ao desdobramento manhã/tarde) continuam aparecendo no
// histórico: o nutrition-day-detail os agrupa como grupos extras no final.
export const MEAL_TYPES = [
  "Café da manhã",
  "Almoço",
  "Lanche da manhã",
  "Lanche da tarde",
  "Jantar",
  "Ceia",
];