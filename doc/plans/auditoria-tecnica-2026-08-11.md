# Auditoria Técnica — 11/08/2026

> Documento gerado após varredura do app e dos docs. Serve de runbook para **qualquer agente IA** continuar o trabalho: cada achado tem evidência (arquivo/linha), passos de execução e forma de verificar. Não requer decisão humana exceto onde indicado.

## Estado atual (verificado em 11/08/2026)

| Checagem | Resultado |
|---|---|
| Testes | ✅ **171/171 verdes** (20 arquivos) com `TZ=UTC npx vitest run` |
| `npx tsc --noEmit` | ⚠️ **68 erros** — todos "baseline conhecido", nunca zerados |
| `npm run build` | ✅ Ok — mas **não type-checka** (Vite usa esbuild) |
| `as any` | 57 ocorrências (maioria causada pelo Achado 2) |
| TODO/FIXME | 0 |

**Consequência do build sem tsc:** erros novos de tipo entram sem bloquear deploy. Por isso o Achado 3 (zerar o baseline + gate de tsc) é importante — hoje o tsc não protege nada.

---

## Achado 1 — 🔴 `supabase/schema_completo.sql` severamente defasado (RISCO ALTO)

**Risco:** o arquivo é descrito como "dump completo p/ recriar o banco", mas **não é atualizado desde ~27/05**. Se alguém recriar o banco por ele, o app quebra em treinos (concluídos), corpo, IA e biblioteca de alimentos.

**O que falta (evidência):** `grep -n "CREATE TABLE" supabase/schema_completo.sql` mostra só 18 tabelas. Faltam 6:

| Tabela | Origem (migration) | Impacto se faltar |
|---|---|---|
| `workout_sessions` | `20260603000000_workout_history.sql` | Treinos concluídos somem (média/TDEE/meta) |
| `workout_session_sets` | `20260603000000_workout_history.sql` | Séries das sessões |
| `exercise_catalog` | `20260608000000_exercise_catalog.sql` | Catálogo de 30 exercícios |
| `ai_settings` | `20260616093000_ai_settings.sql` | Tela de IA + chaves (RNL: ver nota) |
| `bioimpedance_logs` | `20260623000002_bioimpedance_logs.sql` | Tela Corpo |
| `food_library` | `20260801000000_food_library.sql` | Biblioteca de alimentos |

E colunas novas que também não estão no schema_completo (grep por `goal_auto`/`photo_provider`/`protein_factor` retorna 0):
- `goals.goal_auto BOOLEAN NOT NULL DEFAULT FALSE` (migration `20260808130000_add_goal_auto.sql`)
- `goals.protein_factor NUMERIC NOT NULL DEFAULT 2.0` (migration `20260808190000_add_goal_protein_factor.sql`)
- `ai_settings.photo_provider TEXT` + `ai_settings.photo_model TEXT` (migration `20260808160000_ai_settings_photo_provider.sql`)
- `CREATE UNIQUE INDEX meals_user_date_type_uniq` (já está no schema_completo, linha 103)

> ✅ Já back-porteado: `goals.user_id UUID UNIQUE` (linha 38) e `meals` unique index (linha 103). Não refazer.

### Passos de execução (Opção A — backport, preferida)

1. Para **cada** tabela listada acima: abrir a migration de origem e **copiar o bloco `CREATE TABLE` + RLS + policies + índices** para `schema_completo.sql`, respeitando a ordem de dependência de FK (ex.: `workout_session_sets` depois de `workout_sessions`; `ai_settings` depois de `profiles`). Usar `CREATE TABLE IF NOT EXISTS` (padrão do arquivo).
2. Adicionar as 3 colunas de `goals` no bloco `CREATE TABLE public.goals` existente (manter `UNIQUE` no `user_id`).
3. Adicionar `photo_provider`/`photo_model` no bloco `CREATE TABLE ai_settings` (ao copiá-lo).
4. Conferir que a ordem final tem ~24 tabelas: `grep -c "CREATE TABLE" supabase/schema_completo.sql` → deve subir de 18 para 24.
5. `npx tsc --noEmit` e `npm run build` não devem piorar (SQL não afeta TS).

### Passos de execução (Opção B — se o usuário preferir não duplicar)

Marcar no topo do `schema_completo.sql` (e no README) que ele é **obsoleto desde 11/08/2026** e que **migrations em `supabase/migrations/` são a fonte de verdade** (aplicar em ordem). Nenhum backport é feito. ⚠️ Recriar banco a partir dele continua impossível sem as migrations — só fica honesto.

> **Decisão necessária do usuário:** Opção A ou B. Se A, o agente executa; se B, só atualiza textos.

---

## Achado 2 — 🟠 `body_measurements` fora do `types.ts` (= 34 dos 68 erros de tsc)

**Risco:** a tabela existe no banco (migration `20260527003000_add_body_measurements.sql`) e no schema_completo, mas **não está em `src/integrations/supabase/types.ts`** (grep = 0). Causa 23 erros em `src/server-fns/medidas.functions.ts` (linhas ~144–217) + 11 em `src/routes/app.medidas.tsx`, e é a maior origem dos `as any`.

**Schema real (da migration):**

```sql
CREATE TABLE public.body_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  label TEXT NOT NULL,
  value_cm NUMERIC(6,1) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Passos de execução

1. Abrir `src/integrations/supabase/types.ts`.
2. No bloco `Tables:`, dentro da interface de cada tabela, adicionar `body_measurements` **após `food_library`** (ordem alfabética), copiando o formato exato do bloco `food_library` (linhas 236–274):

```ts
body_measurements: {
  Row: {
    created_at: string;
    id: string;
    label: string;
    log_date: string;
    user_id: string;
    value_cm: number;
  };
  Insert: {
    created_at?: string;
    id?: string;
    label: string;
    log_date?: string;
    user_id: string;
    value_cm: number;
  };
  Update: {
    created_at?: string;
    id?: string;
    label?: string;
    log_date?: string;
    user_id?: string;
    value_cm?: number;
  };
  Relationships: [];
};
```

> Nota: a interface do Supabase é `Database["public"]["Tables"]["<nome>"]["Row"]`. O bloco de cada tabela fica aninhado em `Tables: { ... }` com esse shape. `food_library` é o exemplo canônico do formato.

3. Verificar: `npx tsc --noEmit` deve cair de **68 para ~34 erros**.
4. Não alterar nenhum código de negócio — só tipos.
5. Rodar `TZ=UTC npx vitest run` (não deve quebrar nada) e `npm run build`.

---

## Achado 3 — 🟠 Zerar o baseline de tsc + criar gate (hoje o tsc não protege nada)

**Risco:** build usa esbuild (sem type-check). Os 68 erros passam batido no deploy; erros novos entram em silêncio.

**Distribuição atual (11/08):**

| Arquivo | Erros | Causa |
|---|---|---|
| `src/server-fns/medidas.functions.ts` | 23 | `body_measurements` ausente do types.ts (Achado 2) |
| `src/routes/app.medidas.tsx` | 11 | idem |
| `src/components/BarcodeScanner.tsx` | 8 | API `BarcodeDetector` não tipada no TS DOM |
| `src/server-fns/corpo.functions.ts` + `src/routes/app.corpo.tsx` | 6 + 6 | provável schema Supabase (conferir após Achado 2) |
| `src/routes/app.coach.tsx` | 5 | idem |
| `src/routes/app.treinos.$id.tsx` + `app.treinos.$id.foco.tsx` | 4 + 2 | conferir |
| `vite.config.ts` | 2 | bloco `test` não tipa no `UserConfig` |
| `src/server-fns/audio.functions.ts` | 1 | conferir |

### Passos de execução (em ordem)

1. **Fazer o Achado 2 primeiro** (resolve ~34 de 68).
2. **`BarcodeScanner.tsx` (8)**: o `BarcodeDetector` é API nativa sem types no TS. Criar `src/types/globals.d.ts` (ou declarar no próprio arquivo) com:
   ```ts
   declare class BarcodeDetector {
     constructor(options?: { formats?: string[] });
     static getSupportedFormats(): Promise<string[]>;
     detect(source: CanvasImageSource | Blob): Promise<Array<{ rawValue: string; boundingBox: DOMRectReadOnly; cornerPoints: { x: number; y: number }[] }>>;
   }
   interface Window { BarcodeDetector?: typeof BarcodeDetector; }
   ```
3. **`vite.config.ts` (2)**: adicionar no topo `/// <reference types="vitest/config" />` (ou importar `defineConfig` de `vitest/config` em vez de `vite`) — isso tipa o bloco `test`.
4. **Restante** (`corpo`, `coach`, `treinos`, `audio`): rodar `npx tsc --noEmit` e corrigir o que sobrar. Se algum erro for de schema Supabase (coluna que não existe no types), adicionar a coluna no types.ts (mesmo padrão do Achado 2) **ou** usar tipagem explícita, nunca `any` solto.
5. **Criar o gate**: no `package.json`, adicionar script `"typecheck": "tsc --noEmit"`. Opcional: rodar junto do `npm test` (o usuário decide se quer no CI).
6. Verificar: `npm run typecheck` → **0 erros**.

---

## Achado 4 — 🟡 Monolitos de rota (manutenção a longo prazo)

| Arquivo | Linhas |
|---|---|
| `src/routes/app.nutricao.tsx` | ~1700 |
| `src/routes/app.corpo.tsx` | ~1367 |
| `src/routes/app.medidas.tsx` | ~1218 |

**Padrão já estabelecido (seguir igual):** extrair lógica pura → `src/lib/*.ts` (testável em node) e componentes → `src/components/*.tsx`. Exemplos já feitos: `goals-page.tsx`, `reminders-page.tsx`, `plan-card.tsx`, `nutrition-day-detail.tsx`, `quick-add-meal-dialog.tsx`, `suggest-meal-dialog.tsx`, `exercise-substitute-dialog.tsx`, `voice-meal-recorder.tsx`.

**Próximos candidatos (quando houver demanda):** estados do diálogo do "+" em `app.nutricao.tsx` (agrupar num hook `use-add-food-dialog`), e a lógica de `onBarcode` (já parcialmente em `src/lib/food-utils.ts`). **Não priorizar** — sem sintoma de dor, não mexer.

---

## Achado 5 — 🟡 Docs com dupla fonte de verdade

- Dois roadmaps podem divergir: `doc/roadmap/melhorias.md` (status de 02/08, foco IA/UX) e `doc/roadmap/coach-ia-melhorias.md` (backlog de entregas, gerado 08/08).
- README diz "14 migrations" mas há **20 arquivos** em `supabase/migrations/` (contar com `ls supabase/migrations/ | wc -l`).

### Passos de execução

1. README: atualizar "14 migrations" → contagem real.
2. Decidir qual roadmap é a fonte de verdade. Sugestão: `coach-ia-melhorias.md` é mais recente e mais completo → **apontar** `melhorias.md` para ele no topo ("ver coach-ia-melhorias.md para o backlog atual") em vez de manter duas listas concorrentes. Não apagar histórico — só linkar.
3. Atualizar `doc/INDEX.md` se criar/renomear algo.

---

## Convenções do projeto (obrigatórias para qualquer agente)

- **Shell**: Windows. Usar `;` como separador (não `&&`). PowerShell ou Bash (Git Bash).
- **Testes**: `TZ=UTC npx vitest run` (prova independência de fuso). Testes de lib pura = `src/lib/*.test.ts` (node); testes de componente = `*.component.test.tsx` com docblock `// @vitest-environment jsdom` no topo.
- **Build**: `npm run build` é esbuild — **não** é validação de tipo. Sempre rodar `npx tsc --noEmit` nos arquivos tocados.
- **Commits**: em português, descritivos. Ex.: `fix(db): backport schema_completo com as 6 tabelas faltantes`.
- **Strings para IA**: evitar acentos em prompts hardcoded.
- **Auth**: toda server function usa `.middleware([requireSupabaseAuth])`.
- **Docs**: atualizar `doc/changelog/FIXLOG.md` + `doc/changelog/AGENTS.md` a cada mudança relevante (padrão da casa). Registrar "PENDENTE no usuário" para smoke manual quando houver.
- **Migrations**: fonte de verdade para schema. Aplicar no Supabase via SQL Editor quando o usuário não tiver CLI. Sempre back-portear mudanças de schema para `schema_completo.sql` (ver Achado 1).

## Como verificar tudo no final

```powershell
TZ=UTC npx vitest run      # deve continuar 171/171
npx tsc --noEmit           # deve cair de 68 para 0 após Achados 2+3
npm run build              # client + SSR ok
grep -c "CREATE TABLE" supabase/schema_completo.sql   # 18 → 24 após Achado 1 (Opção A)
```
